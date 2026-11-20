import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-server"
import { handleApiError } from "@/lib/api-response"
import { sql } from "@/lib/db"
import { gstSchema } from "@/lib/validation"

const ProfileSchema = z.object({
  pharmacyName: z.string().trim().min(2, "Enter the pharmacy name").max(200),
  licenseNumber: z.string().trim().min(3, "Enter the drug licence number").max(100),
  gstNumber: gstSchema.optional().or(z.literal("")),
  address: z.string().trim().min(5, "Enter the street address").max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  is24x7: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  try {
    const user = await requireRole(["pharmacy"])
    const body = ProfileSchema.parse(await request.json())

    // New profiles always start 'pending'; only an admin can verify.
    const result = await sql`
      INSERT INTO pharmacy_profiles
        (user_id, pharmacy_name, license_number, gst_number, address, city, state, pincode, is_24x7)
      VALUES
        (${user.id}, ${body.pharmacyName}, ${body.licenseNumber}, ${body.gstNumber || null},
         ${body.address}, ${body.city}, ${body.state}, ${body.pincode}, ${body.is24x7})
      RETURNING *
    `

    return NextResponse.json({ success: true, profile: result[0] })
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      return NextResponse.json(
        { error: "A pharmacy with this licence number (or this account) is already registered" },
        { status: 409 },
      )
    }
    return handleApiError(error, "pharmacy/profile POST")
  }
}

export async function GET() {
  try {
    const user = await requireRole(["pharmacy"])

    const result = await sql`
      SELECT * FROM pharmacy_profiles WHERE user_id = ${user.id} LIMIT 1
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile: result[0] })
  } catch (error) {
    return handleApiError(error, "pharmacy/profile GET")
  }
}
