import { NextRequest, NextResponse } from "next/server"
import { requirePharmacyProfile } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { withTransaction } from "@/lib/db"
import { changeOrderStatus } from "@/lib/orders"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { user, pharmacyId } = await requirePharmacyProfile()

    const orderId = Number((await params).orderId)
    if (!Number.isInteger(orderId)) {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 })
    }

    const result = await withTransaction((query) =>
      changeOrderStatus(query, { orderId, pharmacyId }, "confirmed", user.id),
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ success: true, message: `Order ${orderId} confirmed successfully` })
  } catch (error) {
    return handleApiError(error, "pharmacy/orders accept")
  }
}
