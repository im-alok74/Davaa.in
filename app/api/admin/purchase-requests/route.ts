import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"

// Admin: list all pharmacy procurement requests
export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"])

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number(searchParams.get("page") || 1)
    const limit = Number(searchParams.get("limit") || 20)
    const offset = (page - 1) * limit

    const rows = await sql`
      SELECT
        pr.*,
        pp.pharmacy_name,
        COUNT(pi.id) AS item_count,
        SUM(pi.line_total)::decimal(12,2) AS items_total
      FROM purchase_requests pr
      JOIN pharmacy_profiles pp ON pr.pharmacy_id = pp.id
      LEFT JOIN purchase_items pi ON pr.id = pi.request_id
      WHERE (${status === null || status === "all"} OR pr.status = ${status})
      GROUP BY pr.id, pp.pharmacy_name
      ORDER BY pr.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    return NextResponse.json({ requests: rows, page, limit })
  } catch (error: any) {
    console.error("[ADMIN PURCHASE REQUESTS] List error:", error)
    return NextResponse.json(
      { error: "Failed to load purchase requests" },
      { status: 500 }
    )
  }
}

