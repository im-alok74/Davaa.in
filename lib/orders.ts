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
