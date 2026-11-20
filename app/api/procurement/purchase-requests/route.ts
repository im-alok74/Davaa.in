import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requirePharmacyProfile } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { sql } from "@/lib/db"
import { createPurchaseRequest } from "@/lib/purchase-requests"

// List purchase requests for current pharmacy
export async function GET() {
  try {
    const { pharmacyId } = await requirePharmacyProfile()

    const requests = await sql`
      SELECT
        pr.*,
        dp.company_name AS distributor_name,
        inv.invoice_number,
        inv.payment_status AS invoice_payment_status,
        COUNT(pi.id) AS item_count,
        COALESCE(SUM(pi.line_total), 0)::decimal(12,2) AS items_total,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pi.id,
              'medicine_id', pi.medicine_id,
              'medicine_name', m.name,
              'batch_number', pi.batch_number,
              'expiry_date', pi.expiry_date,
              'quantity', pi.quantity,
              'price', pi.price,
              'line_total', pi.line_total
            )
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM purchase_requests pr
      LEFT JOIN distributor_profiles dp ON pr.distributor_id = dp.id
      LEFT JOIN purchase_items pi ON pr.id = pi.request_id
      LEFT JOIN medicines m ON pi.medicine_id = m.id
      LEFT JOIN purchase_invoices inv ON inv.request_id = pr.id
      WHERE pr.pharmacy_id = ${pharmacyId}
      GROUP BY pr.id, dp.company_name, inv.invoice_number, inv.payment_status
      ORDER BY pr.created_at DESC
    `

    return NextResponse.json({ requests })
  } catch (error) {
    return handleApiError(error, "procurement/purchase-requests GET")
  }
}

const CreateSchema = z.object({
  items: z
    .array(
      z.object({
        distributorMedicineId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(100_000),
      }),
    )
    .min(1, "No items provided")
    .max(200),
  notes: z.string().trim().max(1000).optional(),
})

// Create a new purchase request and atomically reserve stock for every line
export async function POST(request: NextRequest) {
  try {
    const { pharmacyId } = await requirePharmacyProfile()

    // Only an approved pharmacy may buy wholesale.
    const [profile] = (await sql`
      SELECT verification_status FROM pharmacy_profiles WHERE id = ${pharmacyId}
    `) as Array<{ verification_status: string }>
    if (profile?.verification_status !== "verified") {
      return NextResponse.json(
        { error: "Your pharmacy must be verified before it can place purchase requests" },
        { status: 403 },
      )
    }

    const { items, notes } = CreateSchema.parse(await request.json())

    const result = await createPurchaseRequest(pharmacyId, items, notes || null)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ success: true, request: result.request })
  } catch (error) {
    return handleApiError(error, "procurement/purchase-requests POST")
  }
}
