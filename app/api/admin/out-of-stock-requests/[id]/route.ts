import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole(["admin"])
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const result = await sql`
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
        osr.customer_id,
        osr.full_name,
        osr.phone,
        osr.address_line1,
        osr.address_line2,
        osr.city,
        osr.state,
        osr.pincode,
        osr.accept_substitute,
        pp.pharmacy_name,
        COALESCE(osr.full_name, pu.full_name) AS contact_person,
        COALESCE(osr.phone, pu.phone) AS phone,
        pu.email,
        cu.full_name AS customer_name,
        dp.company_name AS distributor_name,
        du.full_name AS distributor_contact,
        dp.phone_number AS distributor_phone,
        du.email AS distributor_email,
        m.name AS medicine_name,
        m.generic_name,
        m.manufacturer,
        dm.batch_number,
        dm.expiry_date,
        dm.quantity as available_quantity
      FROM medicine_out_of_stock_requests osr
      LEFT JOIN pharmacy_profiles pp ON osr.pharmacy_id = pp.id
      LEFT JOIN distributor_profiles dp ON osr.distributor_id = dp.id
      LEFT JOIN users pu ON pu.id = pp.user_id
      LEFT JOIN users du ON du.id = dp.user_id
      LEFT JOIN users cu ON cu.id = osr.customer_id
      LEFT JOIN medicines m ON osr.medicine_id = m.id
      LEFT JOIN distributor_medicines dm ON osr.distributor_medicine_id = dm.id
      WHERE osr.id = ${id}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error fetching request details:", error)
    return NextResponse.json(
      { error: "Failed to fetch request details" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole(["admin"])
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { status, notes, distributor_id } = body

    // Validate status
    const validStatuses = ["pending", "fulfilled", "rejected", "cancelled", "assigned"]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Get current request
    const currentResult = await sql`
      SELECT * FROM medicine_out_of_stock_requests WHERE id = ${id}
    `

    if (currentResult.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const current = currentResult[0]

    // Update request
    const result = await sql`
      UPDATE medicine_out_of_stock_requests
      SET 
        status = ${status || current.status},
        notes = ${notes !== undefined ? notes : current.notes},
        distributor_id = ${distributor_id || current.distributor_id},
        updated_at = CURRENT_TIMESTAMP,
        fulfilled_at = CASE WHEN ${status} = 'fulfilled' THEN CURRENT_TIMESTAMP ELSE fulfilled_at END
      WHERE id = ${id}
      RETURNING *
    `

    // Log audit trail
    await sql`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, created_at)
      VALUES (${user.id}, 'update_out_of_stock_request', 'medicine_out_of_stock_requests', ${id}, ${JSON.stringify({ status, distributor_id, notes })}, CURRENT_TIMESTAMP)
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating request:", error)
    return NextResponse.json(
      { error: "Failed to update request" },
      { status: 500 }
    )
  }
}
