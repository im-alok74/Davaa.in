import { getCurrentUser } from "@/lib/auth-server"
import { sql, withTransaction } from "@/lib/db"
import { restoreStockForCancelledOrder } from "@/lib/orders"
import { NextResponse } from "next/server"

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.user_type !== "pharmacy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacyRows = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id} LIMIT 1
    `
    if (!pharmacyRows.length) {
      return NextResponse.json({ error: "Pharmacy profile not found" }, { status: 404 })
    }
    const pharmacyId = (pharmacyRows[0] as any).id

    const { status } = await request.json()
    const orderId = (await params).orderId

    const updated = await withTransaction(async (query) => {
      const [existing] = await query<{ id: number; order_status: string }>`
        SELECT id, order_status FROM orders
        WHERE id = ${orderId} AND pharmacy_id = ${pharmacyId}
      `
      if (!existing) return null

      if (status === "cancelled" && existing.order_status !== "cancelled") {
        await restoreStockForCancelledOrder(query, existing.id)
      }

      await query`
        UPDATE orders SET order_status = ${status}, updated_at = NOW() WHERE id = ${existing.id}
      `
      return existing.id
    })

    if (updated === null) {
      return NextResponse.json({ error: "Order not found or unauthorized" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Update order status error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
