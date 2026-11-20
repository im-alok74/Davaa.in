import type { TransactionQuery } from "@/lib/db"

/**
 * Credits each line item's quantity back to the pharmacy_inventory row it was
 * decremented from at checkout (see app/api/orders/create/route.ts).
 *
 * Call this inside the same transaction as the order_status update, and only when
 * transitioning INTO 'cancelled' from a non-cancelled status — every cancellation path
 * (admin or pharmacy) previously updated order_status and nothing else, so every
 * cancelled order permanently removed real stock from the marketplace.
 *
 * If the original batch has since been removed from inventory, the match returns no
 * rows and that line's stock is not restored — there is nothing to credit it back to.
 */
export async function restoreStockForCancelledOrder(
  query: TransactionQuery,
  orderId: number,
): Promise<void> {
  const [order] = await query<{ pharmacy_id: number }>`
    SELECT pharmacy_id FROM orders WHERE id = ${orderId}
  `
  if (!order) return

  const items = await query<{ medicine_id: number; batch_number: string | null; quantity: number }>`
    SELECT medicine_id, batch_number, quantity FROM order_items WHERE order_id = ${orderId}
  `

  for (const item of items) {
    await query`
      UPDATE pharmacy_inventory
      SET stock_quantity = stock_quantity + ${item.quantity},
          last_updated = NOW()
      WHERE pharmacy_id = ${order.pharmacy_id}
        AND medicine_id = ${item.medicine_id}
        AND batch_number IS NOT DISTINCT FROM ${item.batch_number}
    `
  }
}

/** Every status the orders CHECK constraint allows that the fulfilment UI can set. */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "packed",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Once an order is here it cannot move again (a cancelled order has had its stock restored). */
const TERMINAL: string[] = ["cancelled", "delivered", "returned", "refunded"]

export type ChangeStatusResult = { ok: true } | { ok: false; status: number; error: string }

/**
 * The single path for pharmacy/admin order status changes. Call inside withTransaction.
 *
 * - `status` is validated against ORDER_STATUSES (the pharmacy route used to write whatever
 *   string the client sent and rely on the CHECK constraint to throw a 500).
 * - The row is locked FOR UPDATE and the write is guarded by the status we read, so two
 *   concurrent updates cannot both win (a cancel racing a confirm used to restore stock
 *   and then be overwritten back to "confirmed").
 * - Cancelling restores stock exactly once; terminal orders are immutable.
 * - Pass `pharmacyId` to scope the order to its owning pharmacy (ownership check).
 */
export async function changeOrderStatus(
  query: TransactionQuery,
  target: { orderId?: number; orderNumber?: string; pharmacyId?: number },
  to: string,
  changedBy: number,
): Promise<ChangeStatusResult & { orderId?: number }> {
  if (!(ORDER_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, status: 400, error: "Invalid status" }
  }

  // Without an identifier the predicates below would match every order.
  if (target.orderId === undefined && !target.orderNumber) {
    return { ok: false, status: 400, error: "Invalid order ID" }
  }

  const [existing] = await query<{ id: number; order_status: string }>`
    SELECT id, order_status FROM orders
    WHERE (${target.orderId ?? null}::int IS NULL OR id = ${target.orderId ?? null})
      AND (${target.orderNumber ?? null}::text IS NULL OR order_number = ${target.orderNumber ?? null})
      AND (${target.pharmacyId ?? null}::int IS NULL OR pharmacy_id = ${target.pharmacyId ?? null})
    FOR UPDATE
  `
  if (!existing) return { ok: false, status: 404, error: "Order not found" }
  if (existing.order_status === to) return { ok: true, orderId: existing.id }
  if (TERMINAL.includes(existing.order_status)) {
    return { ok: false, status: 409, error: `Order is already ${existing.order_status}` }
  }

  if (to === "cancelled") await restoreStockForCancelledOrder(query, existing.id)

  const moved = await query<{ id: number }>`
    UPDATE orders
    SET order_status = ${to},
        -- Cash on delivery is collected when the order is handed over.
        payment_status = CASE WHEN ${to} = 'delivered' AND payment_method = 'cod'
                              THEN 'paid' ELSE payment_status END,
        updated_at = NOW()
    WHERE id = ${existing.id} AND order_status = ${existing.order_status}
    RETURNING id
  `
  if (moved.length === 0) return { ok: false, status: 409, error: "Order was updated by someone else, refresh and retry" }

  await query`
    INSERT INTO order_status_history (order_id, status, changed_by, note)
    VALUES (${existing.id}, ${to}, ${changedBy}, ${`Status changed from ${existing.order_status} to ${to}`})
  `
  return { ok: true, orderId: existing.id }
}
