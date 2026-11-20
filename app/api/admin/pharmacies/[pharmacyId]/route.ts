import { revalidatePath } from "next/cache"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { sql } from "@/lib/db"

const BodySchema = z.object({
  verificationStatus: z.enum(["pending", "verified", "rejected"]),
  notes: z.string().trim().max(500).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pharmacyId: string }> },
) {
  try {
    const admin = await requireRole(["admin"])

    const pharmacyId = Number((await params).pharmacyId)
    if (!Number.isInteger(pharmacyId)) {
      return NextResponse.json({ error: "Invalid pharmacy ID" }, { status: 400 })
    }

    const { verificationStatus, notes } = BodySchema.parse(await request.json())

    const result = (await sql`
      UPDATE pharmacy_profiles
      SET verification_status = ${verificationStatus},
          verification_notes = COALESCE(${notes ?? null}, verification_notes),
          verified_at = CASE WHEN ${verificationStatus} = 'verified' THEN NOW() ELSE NULL END,
          verified_by = CASE WHEN ${verificationStatus} = 'verified' THEN ${admin.id} ELSE NULL END,
          updated_at = NOW()
      WHERE id = ${pharmacyId}
      RETURNING id, verification_status
    `) as Array<{ id: number; verification_status: string }>

    if (result.length === 0) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    revalidatePath("/admin/pharmacies")

    return NextResponse.json({
      success: true,
      pharmacy: result[0],
      message: `Pharmacy successfully ${verificationStatus}`,
    })
  } catch (error) {
    return handleApiError(error, "admin/pharmacies PATCH")
  }
}
