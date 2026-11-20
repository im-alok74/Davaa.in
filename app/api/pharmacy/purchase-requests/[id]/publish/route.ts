import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requirePharmacyProfile } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { withTransaction } from "@/lib/db"

const BodySchema = z.object({
  pricingMode: z.enum(["mrp", "mrp_discount", "custom"]).default("mrp"),
  discountPercentage: z.coerce.number().min(0).max(100).default(0),
  customSellingPrice: z.coerce.number().positive().optional(),
})

// Pharmacy: publish PAID procurement stock to website inventory (pharmacy_inventory)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { pharmacyId } = await requirePharmacyProfile()

    const requestId = Number((await params).id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 })
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})))
    if (body.pricingMode === "custom" && body.customSellingPrice === undefined) {
      return NextResponse.json({ error: "Enter a custom selling price" }, { status: 400 })
    }

    const result = await withTransaction(async (query) => {
      const [pr] = await query<{
        pharmacy_id: number
        status: string
        published_to_store_at: string | null
      }>`SELECT pharmacy_id, status, published_to_store_at FROM purchase_requests WHERE id = ${requestId} FOR UPDATE`

      if (!pr) return { ok: false as const, status: 404, error: "Purchase request not found" }
      if (Number(pr.pharmacy_id) !== pharmacyId) {
        return { ok: false as const, status: 403, error: "Forbidden" }
      }
      if (pr.status !== "PAID") {
        return { ok: false as const, status: 400, error: "Only PAID requests can be published to store" }
      }
      if (pr.published_to_store_at) {
        return { ok: false as const, status: 400, error: "This request has already been published" }
      }

      const items = await query<{
        medicine_id: number
        quantity: number
        price: string
        batch_number: string | null
        expiry_date: string | null
        mrp: string | null
      }>`
        SELECT pi.medicine_id, pi.quantity, pi.price, pi.batch_number, pi.expiry_date, m.mrp
        FROM purchase_items pi
        JOIN medicines m ON m.id = pi.medicine_id
        WHERE pi.request_id = ${requestId}
      `

      for (const item of items) {
        const mrp = Number(item.mrp ?? 0)

        let sellingPrice = Number(item.price)
        let discountToStore = 0
        if (body.pricingMode === "mrp") {
          sellingPrice = mrp
        } else if (body.pricingMode === "mrp_discount") {
          sellingPrice = mrp
          discountToStore = body.discountPercentage
        } else if (body.customSellingPrice !== undefined) {
          sellingPrice = body.customSellingPrice
        }

        // Selling above the printed MRP is illegal in India (and the price is shown to
        // customers), so refuse rather than clamp silently.
        if (mrp > 0 && sellingPrice > mrp) {
          throw new PublishError(`Selling price cannot exceed the MRP (${mrp.toFixed(2)})`)
        }

        // Same NULL-batch trap as distributor inventory: NULL never equals NULL, so a
        // blank batch would dodge the unique key and create a duplicate row per publish.
        const batch = (item.batch_number || "").trim() || "N/A"

        await query`
          INSERT INTO pharmacy_inventory (
            pharmacy_id, medicine_id, stock_quantity, selling_price, discount_percentage,
            batch_number, expiry_date, mrp
          )
          VALUES (
            ${pharmacyId}, ${item.medicine_id}, ${item.quantity}, ${sellingPrice},
            ${discountToStore}, ${batch}, ${item.expiry_date || null}, ${mrp || null}
          )
          ON CONFLICT (pharmacy_id, medicine_id, batch_number)
          DO UPDATE SET
            stock_quantity = pharmacy_inventory.stock_quantity + EXCLUDED.stock_quantity,
            selling_price = EXCLUDED.selling_price,
            discount_percentage = EXCLUDED.discount_percentage,
            expiry_date = COALESCE(EXCLUDED.expiry_date, pharmacy_inventory.expiry_date),
            mrp = COALESCE(EXCLUDED.mrp, pharmacy_inventory.mrp),
            last_updated = CURRENT_TIMESTAMP
        `
      }

      await query`
        UPDATE purchase_requests
        SET published_to_store_at = NOW(), updated_at = NOW()
        WHERE id = ${requestId}
      `

      return { ok: true as const }
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return handleApiError(error, "pharmacy/purchase-requests/publish")
  }
}

class PublishError extends Error {}
