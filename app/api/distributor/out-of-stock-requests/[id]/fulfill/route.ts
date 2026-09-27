import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { withTransaction } from "@/lib/db"

/**
 * Fulfilling an out-of-stock request auto-creates an already-approved purchase request.
 *
 * This used to run as several independent auto-committed statements: mark the
 * out-of-stock request 'fulfilled', then separately try to INSERT a purchase_requests
 * row with status 'approved' (lowercase). purchase_requests.status has a CHECK
 * constraint allowing only uppercase values ('PENDING','APPROVED','REJECTED','PAID',
 * 'EXPIRED'), so that insert always threw — after the out-of-stock request had already
 * committed as 'fulfilled'. Net effect: every fulfillment with quantity_offered > 0
 * left the pharmacy's request stuck "fulfilled" with no stock ever delivered, no
 * purchase_items row, and a 500 returned to the distributor who thought it failed
 * outright.
 *
 * Now wrapped in one transaction, using the real uppercase status, and mirroring the
 * reserve-then-decrement pattern used by the manual procurement flow's approve step
 * (fulfilling is a distributor committing stock immediately, not a pending offer, so
 * this decrements quantity directly rather than only reserving it).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user || user.user_type !== "distributor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { quantity_offered, notes } = body

    const result = await withTransaction(async (query) => {
      const distributorResult = await query<{ id: number }>`
        SELECT id FROM distributor_profiles WHERE user_id = ${user.id}
      `
      if (distributorResult.length === 0) {
        return { ok: false as const, status: 404, error: "Distributor not found" }
      }
      const distributorId = distributorResult[0].id

      const reqResult = await query<any>`
        SELECT * FROM medicine_out_of_stock_requests
        WHERE id = ${id} AND distributor_id = ${distributorId}
      `
      if (reqResult.length === 0) {
        return { ok: false as const, status: 404, error: "Request not found" }
      }
      const req = reqResult[0]

      if (!["pending", "assigned"].includes(req.status)) {
        return { ok: false as const, status: 400, error: `Cannot fulfill ${req.status} request` }
      }

      let createdProcurementRequest = false

      if (quantity_offered && quantity_offered > 0) {
        // Guarded decrement: fails atomically if stock changed since the offer was made,
        // instead of a separate check-then-update race.
        const dmRows = await query<any>`
          UPDATE distributor_medicines
          SET quantity = quantity - ${quantity_offered},
              amount = (quantity - ${quantity_offered}) * unit_price
          WHERE id = ${req.distributor_medicine_id}
            AND quantity >= ${quantity_offered}
          RETURNING *
        `
        if (dmRows.length === 0) {
          return { ok: false as const, status: 409, error: "Insufficient stock to fulfill this quantity" }
        }
        const dm = dmRows[0]

        const pharmacyResult = await query<{ id: number }>`
          SELECT id FROM pharmacy_profiles WHERE id = ${req.pharmacy_id}
        `

        if (pharmacyResult.length > 0) {
          const prRows = await query<{ id: number }>`
            INSERT INTO purchase_requests (
              pharmacy_id, distributor_id, total_amount, status,
              is_out_of_stock_fulfillment, approved_by, created_at, updated_at
            ) VALUES (
              ${req.pharmacy_id}, ${distributorId}, ${(req.unit_price || 0) * quantity_offered},
              'APPROVED', true, 'distributor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING id
          `
          const purchaseRequestId = prRows[0].id

          await query`
            INSERT INTO purchase_items (
              request_id, distributor_medicine_id, quantity, price, line_total,
              medicine_id, pharmacy_id, distributor_id, batch_number, expiry_date
            ) VALUES (
              ${purchaseRequestId}, ${req.distributor_medicine_id}, ${quantity_offered},
              ${dm.unit_price}, ${Number(dm.unit_price) * quantity_offered},
              ${dm.medicine_id}, ${req.pharmacy_id}, ${distributorId},
              ${dm.batch_number}, ${dm.expiry_date}
            )
          `
          createdProcurementRequest = true
        }
      }

      const updateResult = await query<any>`
        UPDATE medicine_out_of_stock_requests
        SET status = 'fulfilled',
            fulfilled_at = CURRENT_TIMESTAMP,
            notes = ${notes || null},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `

      await query`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, created_at)
        VALUES (${user.id}, 'fulfill_out_of_stock_request', 'medicine_out_of_stock_requests', ${id},
          ${JSON.stringify({ quantity_offered, created_procurement_request: createdProcurementRequest })},
          CURRENT_TIMESTAMP)
      `

      return { ok: true as const, item: updateResult[0] }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.item)
  } catch (error) {
    console.error("Error fulfilling request:", error)
    return NextResponse.json(
      { error: "Failed to fulfill request" },
      { status: 500 }
    )
  }
}
