import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { withTransaction } from "@/lib/db"
import { changeOrderStatus } from "@/lib/orders"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const admin = await requireRole(["admin"])

    const { status } = await request.json()
    const rawId = (await params).orderId
    const numericId = Number(rawId)

    // Accepts either the numeric DB id or the order_number string.
    const target = Number.isInteger(numericId) ? { orderId: numericId } : { orderNumber: rawId }

    const result = await withTransaction((query) =>
      changeOrderStatus(query, target, String(status), admin.id),
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    revalidatePath("/admin/orders")
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, "admin/orders PATCH")
  }
}
