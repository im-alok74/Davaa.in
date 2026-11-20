import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { closePendingRequest } from "@/lib/purchase-requests"

// Admin: reject a purchase request and release reserved stock
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(["admin"])
    const requestId = Number((await params).id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 })
    }

    const result = await closePendingRequest(requestId, "REJECTED")
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ success: true, status: "REJECTED" })
  } catch (error) {
    return handleApiError(error, "admin/purchase-requests/reject")
  }
}
