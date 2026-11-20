import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export async function GET(request: NextRequest) {
  const user = await requireRole(["admin"])
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const search = searchParams.get("search")
  const page = parseInt(searchParams.get("page") || "1")
  const pageSize = parseInt(searchParams.get("pageSize") || "20")

  try {
    const offset = (page - 1) * pageSize
    const searchParam = search ? `%${search.toLowerCase()}%` : null
    const hasStatusFilter = Boolean(status && status !== "all")
    const hasSearchFilter = Boolean(searchParam)

    const results = hasStatusFilter || hasSearchFilter
      ? await sql`
          SELECT 
            osr.id,
            osr.pharmacy_id,
            osr.distributor_id,
            osr.medicine_id,
            osr.distributor_medicine_id,
            osr.requested_quantity,
            osr.mrp,
            osr.unit_price,
            osr.status,
            osr.notes,
            osr.created_at,
            osr.updated_at,
            osr.fulfilled_at,
            pp.pharmacy_name,
            pu.full_name AS contact_person,
            pu.phone,
            dp.company_name AS distributor_name,
            du.full_name AS distributor_contact,
            m.name AS medicine_name,
            m.generic_name,
            m.manufacturer
          FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN distributor_profiles dp ON osr.distributor_id = dp.id
          LEFT JOIN users pu ON pu.id = pp.user_id
          LEFT JOIN users du ON du.id = dp.user_id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          WHERE (${status === undefined || status === null || status === "all"} OR osr.status = ${status})
            AND (${searchParam === null} OR (
              LOWER(pp.pharmacy_name) LIKE ${searchParam}
              OR LOWER(m.name) LIKE ${searchParam}
              OR LOWER(dp.company_name) LIKE ${searchParam}
            ))
          ORDER BY osr.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `
      : await sql`
          SELECT 
            osr.id,
            osr.pharmacy_id,
            osr.distributor_id,
            osr.medicine_id,
            osr.distributor_medicine_id,
            osr.requested_quantity,
            osr.mrp,
            osr.unit_price,
            osr.status,
            osr.notes,
            osr.created_at,
            osr.updated_at,
            osr.fulfilled_at,
            pp.pharmacy_name,
            pu.full_name AS contact_person,
            pu.phone,
            dp.company_name AS distributor_name,
            du.full_name AS distributor_contact,
            m.name AS medicine_name,
            m.generic_name,
            m.manufacturer
          FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN distributor_profiles dp ON osr.distributor_id = dp.id
          LEFT JOIN users pu ON pu.id = pp.user_id
          LEFT JOIN users du ON du.id = dp.user_id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          ORDER BY osr.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `

    // Get total count
    const countResult = hasStatusFilter || hasSearchFilter
      ? await sql`
          SELECT COUNT(*) as total FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          LEFT JOIN distributor_profiles dp ON osr.distributor_id = dp.id
          LEFT JOIN users pu ON pu.id = pp.user_id
          LEFT JOIN users du ON du.id = dp.user_id
          WHERE (${status === undefined || status === null || status === "all"} OR osr.status = ${status})
            AND (${searchParam === null} OR (
              LOWER(pp.pharmacy_name) LIKE ${searchParam}
              OR LOWER(m.name) LIKE ${searchParam}
              OR LOWER(dp.company_name) LIKE ${searchParam}
            ))
        `
      : await sql`
          SELECT COUNT(*) as total FROM medicine_out_of_stock_requests osr
          LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
          LEFT JOIN medicines m ON osr.medicine_id = m.id
          LEFT JOIN distributor_profiles dp ON osr.distributor_id = dp.id
          LEFT JOIN users pu ON pu.id = pp.user_id
          LEFT JOIN users du ON du.id = dp.user_id
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
