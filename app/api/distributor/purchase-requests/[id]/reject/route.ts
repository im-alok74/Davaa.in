import { NextRequest, NextResponse } from "next/server"
import { requireDistributorProfile } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { closePendingRequest } from "@/lib/purchase-requests"

// Distributor: reject a purchase request and release reserved stock
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { distributorId } = await requireDistributorProfile()
    const requestId = Number((await params).id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 })
    }

    const result = await closePendingRequest(requestId, "REJECTED", { distributorId })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ success: true, status: "REJECTED" })
  } catch (error) {
    return handleApiError(error, "distributor/purchase-requests/reject")
  }
}
