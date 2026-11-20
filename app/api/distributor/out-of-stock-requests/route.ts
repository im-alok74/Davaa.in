import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.user_type !== "distributor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get distributor profile
    const distributorResult = await sql`
      SELECT id FROM distributor_profiles WHERE user_id = ${user.id}
    `

    if (distributorResult.length === 0) {
      return NextResponse.json({ error: "Distributor not found" }, { status: 404 })
    }

    const distributorId = distributorResult[0].id
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "15")

    const offset = (page - 1) * pageSize

    const hasStatusFilter = Boolean(status && status !== "all")
    const results = hasStatusFilter
      ? await sql`
          SELECT 
            osr.id,
            osr.pharmacy_id,
            osr.medicine_id,
            osr.requested_quantity,
            osr.mrp,
            osr.unit_price,
            osr.status,
            osr.notes,
            osr.created_at,
            osr.fulfilled_at,
            pp.pharmacy_name,
            u.full_name AS pharmacy_contact,
            u.phone AS pharmacy_phone,
            u.email AS pharmacy_email,
            m.name AS medicine_name,
            m.generic_name,
            m.manufacturer,
            dm.batch_number,
            dm.expiry_date,
            dm.quantity as available_quantity
          FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN users u ON u.id = pp.user_id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          LEFT JOIN distributor_medicines dm ON osr.distributor_medicine_id = dm.id
          WHERE osr.distributor_id = ${distributorId}
            AND osr.status = ${status}
          ORDER BY osr.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `
      : await sql`
          SELECT 
            osr.id,
            osr.pharmacy_id,
            osr.medicine_id,
            osr.requested_quantity,
            osr.mrp,
            osr.unit_price,
            osr.status,
            osr.notes,
            osr.created_at,
            osr.fulfilled_at,
            pp.pharmacy_name,
            u.full_name AS pharmacy_contact,
            u.phone AS pharmacy_phone,
            u.email AS pharmacy_email,
            m.name AS medicine_name,
            m.generic_name,
            m.manufacturer,
            dm.batch_number,
            dm.expiry_date,
            dm.quantity as available_quantity
          FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN users u ON u.id = pp.user_id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          LEFT JOIN distributor_medicines dm ON osr.distributor_medicine_id = dm.id
          WHERE osr.distributor_id = ${distributorId}
          ORDER BY osr.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `

    // Get total count
    const countResult = hasStatusFilter
      ? await sql`
          SELECT COUNT(*) as total FROM medicine_out_of_stock_requests osr
          WHERE osr.distributor_id = ${distributorId}
            AND osr.status = ${status}
        `
      : await sql`
          SELECT COUNT(*) as total FROM medicine_out_of_stock_requests osr
          WHERE osr.distributor_id = ${distributorId}
        `

    const total = countResult[0]?.total || 0

    return NextResponse.json({
      data: results,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error("Error fetching out-of-stock requests:", error)
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    )
  }
}
