import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { cachedPublic, TAGS, TTL } from "@/lib/cache"

// Same shape and same caller as /api/medicines/categories — see that file for why
// this is cached.
const getCachedForms = cachedPublic(
  async () => {
    const rows = await sql`
      SELECT DISTINCT m.form
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
      JOIN medicines m ON m.id = pi.medicine_id
      WHERE m.status = 'active'
        AND m.form IS NOT NULL
        AND m.form <> ''
        AND pi.stock_quantity > 0
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ORDER BY m.form
    `
    return (rows as any[]).map((r) => r.form)
  },
  ["medicine-forms"],
  { revalidate: TTL.TAXONOMY, tags: [TAGS.taxonomy] },
)

export async function GET(_request: NextRequest) {
  try {
    const forms = await getCachedForms()
    return NextResponse.json({ forms })
  } catch (error: any) {
    console.error("[MEDICINE FORMS] Error:", error)
    return NextResponse.json(
      { error: "Failed to load forms", details: String(error) },
      { status: 500 }
    )
  }
}

