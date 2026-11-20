import { withTransaction, type TransactionQuery } from "./db"

/**
 * Stock-moving steps of the pharmacy -> distributor procurement flow.
 *
 * Every function here runs inside ONE database transaction. The routes used to loop
 * over items with independent HTTP statements, so a failure on item 3 of 5 left items
 * 1-2 permanently decremented/reserved with no purchase request pointing at them.
 */

export type StepResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string }

interface PurchaseRequestRow {
  id: number
  distributor_id: number
  pharmacy_id: number
  status: string
  expires_at: string | null
  is_expired: boolean
}

/** Puts a request's reserved quantities back. Caller must already own the status flip. */
async function releaseReservations(query: TransactionQuery, requestId: number) {
  await query`
    UPDATE distributor_medicines dm
    SET reserved_quantity = GREATEST(dm.reserved_quantity - pi.quantity, 0)
    FROM purchase_items pi
    WHERE pi.request_id = ${requestId}
      AND pi.distributor_medicine_id = dm.id
  `
}

/**
 * PENDING -> REJECTED | EXPIRED, releasing the reservation. The status flip is the
 * guard: if two callers race, only the one whose UPDATE matches a PENDING row releases.
 */
export async function closePendingRequest(
  requestId: number,
  newStatus: "REJECTED" | "EXPIRED",
  opts: { distributorId?: number } = {},
): Promise<StepResult> {
  return withTransaction<StepResult<any>>(async (query) => {
    const [pr] = await query<PurchaseRequestRow>`
      SELECT id, distributor_id, status FROM purchase_requests WHERE id = ${requestId} FOR UPDATE
    `
    if (!pr) return { ok: false, status: 404, error: "Purchase request not found" }
    if (opts.distributorId !== undefined && Number(pr.distributor_id) !== opts.distributorId) {
      return { ok: false, status: 403, error: "Forbidden" }
    }
    if (pr.status !== "PENDING") {
      return { ok: false, status: 400, error: "Only PENDING requests can be rejected" }
    }
    await query`
      UPDATE purchase_requests SET status = ${newStatus}, updated_at = NOW() WHERE id = ${requestId}
    `
    await releaseReservations(query, requestId)
    return { ok: true }
  })
}

/**
 * PENDING -> APPROVED: turns the reservation into a real decrement and creates the
 * invoice. Expired locks are released instead (and reported as 410).
 */
export async function approvePurchaseRequest(
  requestId: number,
  approvedBy: "admin" | "distributor",
  opts: { distributorId?: number } = {},
): Promise<StepResult<{ invoice: Record<string, unknown> }>> {
  return withTransaction<StepResult<any>>(async (query) => {
    const [pr] = await query<PurchaseRequestRow>`
      SELECT *, (expires_at IS NOT NULL AND expires_at < NOW()) AS is_expired
      FROM purchase_requests WHERE id = ${requestId} FOR UPDATE
    `
    if (!pr) return { ok: false, status: 404, error: "Purchase request not found" }
    if (opts.distributorId !== undefined && Number(pr.distributor_id) !== opts.distributorId) {
      return { ok: false, status: 403, error: "Forbidden" }
    }

    // Compared in SQL on purpose: expires_at is a naive UTC timestamp, and parsing it in
    // JS applies the server's local zone, which made fresh requests look hours expired.
    if (pr.status === "PENDING" && pr.is_expired) {
      await query`
        UPDATE purchase_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = ${requestId}
      `
      await releaseReservations(query, requestId)
      // Committed on return: the caller reports 410, the lock is genuinely released.
      return { ok: false, status: 410, error: "Request expired and lock released" }
    }

    if (pr.status !== "PENDING") {
      return { ok: false, status: 400, error: "Only PENDING requests can be approved" }
    }

    const items = await query<{ distributor_medicine_id: number; quantity: number }>`
      SELECT distributor_medicine_id, quantity FROM purchase_items WHERE request_id = ${requestId}
    `
    if (!items.length) return { ok: false, status: 400, error: "Request has no items" }

    for (const item of items) {
      // Guarded decrement: refuses unless the stock and our reservation both still cover it.
      const moved = await query<{ id: number }>`
        UPDATE distributor_medicines
        SET quantity = quantity - ${item.quantity},
            reserved_quantity = reserved_quantity - ${item.quantity},
            amount = (quantity - ${item.quantity}) * unit_price,
            updated_at = NOW()
        WHERE id = ${item.distributor_medicine_id}
          AND quantity >= ${item.quantity}
          AND reserved_quantity >= ${item.quantity}
        RETURNING id
      `
      if (moved.length === 0) {
        // Throwing rolls back the decrements already applied to earlier items.
        throw new StepFailure(409, "Insufficient reserved stock for an item")
      }
    }

    await query`
      UPDATE purchase_requests
      SET status = 'APPROVED', approved_by = ${approvedBy}, updated_at = NOW()
      WHERE id = ${requestId}
    `

    const [invoice] = await query<Record<string, unknown>>`
      INSERT INTO purchase_invoices (request_id, invoice_number, payment_status)
      VALUES (${requestId},
              CONCAT('PR-', ${String(requestId)}::text, '-', TO_CHAR(NOW(), 'YYYYMMDDHH24MISS')),
              'APPROVED_UNPAID')
      ON CONFLICT (request_id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        updated_at = NOW()
      RETURNING *
    `

    return { ok: true, invoice }
  }).catch(asStepResult)
}

function asStepResult(error: unknown): { ok: false; status: number; error: string } {
  if (error instanceof StepFailure) return { ok: false, status: error.status, error: error.message }
  throw error
}

class StepFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface ReserveItemInput {
  distributorMedicineId: number
  quantity: number
}

/**
 * Reserves every requested line and creates the purchase request, atomically. Prices
 * are read from distributor_medicines inside the transaction, never from the client.
 */
export async function createPurchaseRequest(
  pharmacyId: number,
  items: ReserveItemInput[],
  notes: string | null,
): Promise<StepResult<{ request: Record<string, unknown> }>> {
  return withTransaction<StepResult<any>>(async (query) => {
    // Merge duplicate lines so the same batch can't be reserved twice under two rows.
    const merged = new Map<number, number>()
    for (const item of items) {
      merged.set(item.distributorMedicineId, (merged.get(item.distributorMedicineId) ?? 0) + item.quantity)
    }

    let distributorId: number | null = null
    let totalAmount = 0
    const lines: Array<{ dm: Record<string, any>; quantity: number; lineTotal: number }> = []

    for (const [dmId, qty] of merged) {
      const rows = await query<Record<string, any>>`
        UPDATE distributor_medicines dm
        SET reserved_quantity = dm.reserved_quantity + ${qty}
        FROM distributor_profiles dp
        WHERE dm.id = ${dmId}
          AND dp.id = dm.distributor_id
          AND dp.verification_status = 'verified'
          AND (dm.quantity - dm.reserved_quantity) >= ${qty}
          AND dm.expiry_date >= CURRENT_DATE
        RETURNING dm.*
      `
      if (!rows.length) {
        // Throw (not return): returning would COMMIT the reservations made for earlier lines.
        throw new StepFailure(409, "Insufficient stock for one or more items")
      }
      const dm = rows[0]
      if (distributorId === null) distributorId = Number(dm.distributor_id)
      else if (Number(dm.distributor_id) !== distributorId) {
        throw new StepFailure(400, "A single purchase request must contain items from only one distributor")
      }
      const lineTotal = Number(dm.unit_price) * qty
      totalAmount += lineTotal
      lines.push({ dm, quantity: qty, lineTotal })
    }

    const [pr] = await query<Record<string, any>>`
      INSERT INTO purchase_requests (pharmacy_id, distributor_id, status, total_amount, notes, expires_at)
      VALUES (${pharmacyId}, ${distributorId}, 'PENDING', ${totalAmount}, ${notes},
              NOW() + INTERVAL '30 minutes')
      RETURNING *
    `

    for (const { dm, quantity, lineTotal } of lines) {
      await query`
        INSERT INTO purchase_items (
          request_id, distributor_medicine_id, quantity, price, line_total,
          medicine_id, pharmacy_id, distributor_id, batch_number, expiry_date
        ) VALUES (
          ${pr.id}, ${dm.id}, ${quantity}, ${Number(dm.unit_price)}, ${lineTotal},
          ${dm.medicine_id}, ${pharmacyId}, ${dm.distributor_id}, ${dm.batch_number}, ${dm.expiry_date}
        )
      `
    }

    return { ok: true, request: pr }
  }).catch(asStepResult)
}
