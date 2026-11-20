import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

// POST: Create an out-of-stock request
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "pharmacy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      distributorMedicineId,

      requestedQuantity = 1,
      notes = "",
    } = body

    if (!distributorMedicineId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get pharmacy profile
    const pharmacyProfile = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id}
    `

    if (pharmacyProfile.length === 0) {
      return NextResponse.json(
        { error: "Pharmacy profile not found" },
        { status: 404 }
      )
    }

    const pharmacyId = (pharmacyProfile[0] as any).id

    // Get distributor medicine details for pricing
    const dmedicine = await sql`
      SELECT mrp, unit_price, distributor_id, medicine_id FROM distributor_medicines WHERE id = ${distributorMedicineId}
    `

    if (dmedicine.length === 0) {
      return NextResponse.json(
        { error: "Medicine not found" },
        { status: 404 }
      )
    }

    // Distributor and medicine come from the stock row, never from the request body.
    const { mrp, unit_price, distributor_id: distributorId, medicine_id: medicineId } = dmedicine[0] as any

    // Check if request already exists
    const existing = await sql`
      SELECT id FROM medicine_out_of_stock_requests
      WHERE pharmacy_id = ${pharmacyId}
        AND distributor_medicine_id = ${distributorMedicineId}
        AND status = 'pending'
      LIMIT 1
    `

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "You already have a pending request for this medicine" },
        { status: 409 }
      )
    }

    // Create out-of-stock request
    const result = await sql`
      INSERT INTO medicine_out_of_stock_requests (
        pharmacy_id,
        distributor_id,
        medicine_id,
        distributor_medicine_id,
        requested_quantity,
        mrp,
        unit_price,
        notes
      ) VALUES (
        ${pharmacyId},
        ${distributorId},
        ${medicineId},
        ${distributorMedicineId},
        ${requestedQuantity},
        ${mrp},
        ${unit_price},
        ${notes}
      )
      RETURNING id, created_at
    `

    return NextResponse.json({
      success: true,
      message: "out-of-stock request created successfully",
      requestId: (result[0] as any).id,
    })
  } catch (error: any) {
    console.error("[Out-of-Stock] Error creating request:", error)
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 }
    )
  }
}

// GET: Fetch out-of-stock requests (for pharmacy to view their requests)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "pharmacy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") || "pending"

    const pharmacyProfile = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id}
    `

    if (pharmacyProfile.length === 0) {
      return NextResponse.json(
        { error: "Pharmacy profile not found" },
        { status: 404 }
      )
    }

    const pharmacyId = (pharmacyProfile[0] as any).id

    const requests = await sql`
      SELECT
        r.id,
        r.distributor_id,
        dp.company_name as distributor_name,
        m.name as medicine_name,
        m.generic_name,
        m.form,
        m.strength,
        r.requested_quantity,
        r.mrp,
        r.unit_price,
        r.status,
        r.notes,
        r.created_at,
        r.fulfilled_at
      FROM medicine_out_of_stock_requests r
      JOIN distributor_profiles dp ON r.distributor_id = dp.id
      JOIN medicines m ON r.medicine_id = m.id
      WHERE r.pharmacy_id = ${pharmacyId}
        AND (${status === ""} OR r.status = ${status})
      ORDER BY r.created_at DESC
    `

    return NextResponse.json({ requests })
  } catch (error: any) {
    console.error("[Out-of-Stock] Error fetching requests:", error)
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    )
  }
}
