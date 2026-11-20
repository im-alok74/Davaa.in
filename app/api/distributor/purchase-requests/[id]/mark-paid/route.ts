import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

// Distributor: mark COD payment collected (moves request to PAID)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.user_type !== "distributor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const distributorRows = await sql`
      SELECT id FROM distributor_profiles WHERE user_id = ${user.id}
    `
    if (!distributorRows.length) {
      return NextResponse.json({ error: "Distributor profile not found" }, { status: 404 })
    }
    const distributorId = (distributorRows[0] as any).id

    const { id } = await params
    const requestId = Number(id)
    if (Number.isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 })
    }

    const prRows = await sql`
      SELECT * FROM purchase_requests WHERE id = ${requestId}
    `
    if (!prRows.length) {
      return NextResponse.json({ error: "Purchase request not found" }, { status: 404 })
    }
    const pr = prRows[0] as any

    if (Number(pr.distributor_id) !== Number(distributorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (pr.status !== "APPROVED") {
      return NextResponse.json({ error: "Only APPROVED requests can be marked as PAID" }, { status: 400 })
    }

    await sql`
      UPDATE purchase_requests
      SET status = 'PAID',
          payment_collected_at = NOW(),
          updated_at = NOW()
      WHERE id = ${requestId}
    `

    await sql`
      UPDATE purchase_invoices
      SET payment_status = 'PAID',
          updated_at = NOW()
      WHERE request_id = ${requestId}
    `

    return NextResponse.json({ success: true, status: "PAID" })
  } catch (error: any) {
    console.error("[DISTRIBUTOR PURCHASE REQUESTS] Mark paid error:", error)
    return NextResponse.json(
      { error: "Failed to mark as paid" },
      { status: 500 }
    )
  }
}

