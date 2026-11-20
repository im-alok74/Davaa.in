import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export async function POST(
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
    const { distributor_id, auto_assign } = body

    // Get the request details
    const requestResult = await sql`
      SELECT * FROM medicine_out_of_stock_requests WHERE id = ${id}
    `

    if (requestResult.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const req = requestResult[0]

    let assignedDistributorId = distributor_id

    // If auto_assign is true, find best distributor
    if (auto_assign && !distributor_id) {
      // Find distributors with this medicine in stock
      const distributorsResult = await sql`
        SELECT d.id, d.company_name AS distributor_name, COUNT(dm.id) as medicine_count
        FROM distributor_profiles d
        LEFT JOIN distributor_medicines dm ON d.id = dm.distributor_id
        WHERE dm.medicine_id = ${req.medicine_id} AND d.verification_status = 'verified' AND (dm.quantity - dm.reserved_quantity) >= ${req.requested_quantity}
        GROUP BY d.id, d.company_name
        ORDER BY medicine_count DESC
        LIMIT 1
      `

      if (distributorsResult.length === 0) {
        return NextResponse.json(
          { error: "No distributor with sufficient stock found" },
          { status: 400 }
        )
      }

      assignedDistributorId = distributorsResult[0].id
    }

    if (!assignedDistributorId) {
      return NextResponse.json(
        { error: "Distributor ID required or auto-assign failed" },
        { status: 400 }
      )
    }

    // Update request with assigned distributor
    const updateResult = await sql`
      UPDATE medicine_out_of_stock_requests
      SET distributor_id = ${assignedDistributorId}, status = 'assigned', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    // Log audit trail
    await sql`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, created_at)
      VALUES (${user.id}, 'assign_out_of_stock_request', 'medicine_out_of_stock_requests', ${id}, ${JSON.stringify({
        assigned_distributor_id: assignedDistributorId,
        auto_assigned: auto_assign,
      })}, CURRENT_TIMESTAMP)
    `

    return NextResponse.json(updateResult[0])
  } catch (error) {
    console.error("Error assigning request:", error)
    return NextResponse.json(
      { error: "Failed to assign request" },
      { status: 500 }
    )
  }
}
