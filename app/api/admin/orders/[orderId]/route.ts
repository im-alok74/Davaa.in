import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { withTransaction } from "@/lib/db"
import { restoreStockForCancelledOrder } from "@/lib/orders"

export async function PATCH(
  request: Request,
  { params }: { params: any }
) {
  try {
    await requireRole(["admin"])

    const { status } = await request.json()

    // `params` may be a Promise in some Next.js environments — unwrap if needed
    const resolvedParams = typeof params?.then === "function" ? await params : params
    const rawId = resolvedParams?.orderId
    const numericId = Number(rawId)

    // Determine whether the caller provided a numeric DB id or an order_number string
    const isNumericId = !isNaN(numericId)

    const allowedStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const updatedId = await withTransaction(async (query) => {
      const [existing] = isNumericId
        ? await query<{ id: number; order_status: string }>`
            SELECT id, order_status FROM orders WHERE id = ${numericId}
          `
        : await query<{ id: number; order_status: string }>`
            SELECT id, order_status FROM orders WHERE order_number = ${rawId}
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

    if (updatedId === null) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    try {
      revalidatePath("/admin/orders")
    } catch (e) {
      // revalidatePath can be optional; log but don't fail the request
      console.error("[ADMIN ORDERS] revalidatePath failed:", e)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[ADMIN ORDERS] Update error:", error)
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
