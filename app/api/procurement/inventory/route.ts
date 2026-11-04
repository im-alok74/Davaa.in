import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 60

// Pharmacy marketplace view of distributor stock, paginated.
// In-stock items come first; out-of-stock items follow when includeOutOfStock=true.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "pharmacy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("q") || "").trim()
    const category = searchParams.get("category") || ""
    const distributorId = searchParams.get("distributorId")
    const includeOutOfStock = searchParams.get("includeOutOfStock") === "true"

    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1)
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "", 10)
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit || DEFAULT_PAGE_SIZE))
    const offset = (page - 1) * limit

    const qLike = `%${query}%`

    // Fetch one extra row so we know whether another page exists
    // without running a separate (expensive) COUNT query.
    const rows = (await sql`
      SELECT
        dm.id,
        dm.distributor_id,
        dp.company_name AS distributor_name,
        dm.medicine_id,
        m.name,
        m.generic_name,
        m.manufacturer,
        m.category,
        m.form,
        m.strength,
        m.pack_size,
        m.image_url,
        dm.batch_number,
        dm.expiry_date,
        dm.mrp,
        dm.unit_price,
        dm.quantity,
        dm.reserved_quantity,
        (dm.quantity - dm.reserved_quantity) AS available_quantity,
        CASE
          WHEN (dm.quantity - dm.reserved_quantity) > 0 THEN 'in_stock'
          ELSE 'out_of_stock'
        END AS stock_status
      FROM distributor_medicines dm
      JOIN distributor_profiles dp ON dm.distributor_id = dp.id
      JOIN medicines m ON dm.medicine_id = m.id
      WHERE (
          ((dm.quantity - dm.reserved_quantity) > 0 AND dm.expiry_date > NOW())
          OR (${includeOutOfStock} AND (dm.quantity - dm.reserved_quantity) <= 0)
        )
        AND (${query === ""} OR (
          m.name ILIKE ${qLike}
          OR m.generic_name ILIKE ${qLike}
          OR m.manufacturer ILIKE ${qLike}
        ))
        AND (${category === ""} OR m.category = ${category})
        AND (${distributorId === null} OR dm.distributor_id = ${distributorId})
      ORDER BY ((dm.quantity - dm.reserved_quantity) <= 0) ASC, m.name ASC, dm.unit_price ASC, dm.id ASC
      LIMIT ${limit + 1} OFFSET ${offset}
    `) as any[]

    const hasMore = rows.length > limit
    const pageRows = rows.slice(0, limit)

    // Images only for the items on this page (at most `limit` medicines).
    const medicineIds = [...new Set(pageRows.map((item) => item.medicine_id))]

    const imagesByMedicineId = new Map<number, string[]>()
    if (medicineIds.length > 0) {
      const allImages = (await sql`
        SELECT medicine_id, image_url FROM medicine_images
        WHERE medicine_id = ANY(${medicineIds}::int[])
        ORDER BY medicine_id ASC, created_at ASC
      `) as any[]

      for (const img of allImages) {
        if (!imagesByMedicineId.has(img.medicine_id)) {
          imagesByMedicineId.set(img.medicine_id, [])
        }
        imagesByMedicineId.get(img.medicine_id)!.push(img.image_url)
      }
    }

    const items = pageRows.map((item) => ({
      ...item,
      images: imagesByMedicineId.get(item.medicine_id) || [],
    }))

    return NextResponse.json({ items, page, limit, hasMore })
  } catch (error: any) {
    console.error("[PROCUREMENT INVENTORY] Error:", error)
    return NextResponse.json(
      { error: "Failed to load procurement inventory", details: String(error) },
      { status: 500 }
    )
  }
}