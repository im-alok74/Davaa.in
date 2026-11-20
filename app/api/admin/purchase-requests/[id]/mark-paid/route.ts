import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"

// Admin: mark a purchase invoice as paid
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin"])
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

    if (pr.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Only APPROVED requests can be marked as PAID" },
        { status: 400 }
      )
    }

    await sql`
      UPDATE purchase_requests
      SET status = 'PAID',
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
    console.error("[ADMIN PURCHASE REQUESTS] Mark paid error:", error)
    return NextResponse.json(
      { error: "Failed to mark request as paid" },
      { status: 500 }
    )
  }
}

