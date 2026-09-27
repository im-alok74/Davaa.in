import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { v2 as cloudinary } from "cloudinary"
import { clientKey, rateLimit } from "@/lib/rate-limit"

/** 20 uploads per IP per 5 minutes — enough for real use, cheap to hit if this
 *  were left unlimited given every upload costs Cloudinary storage/bandwidth. */
const LIMIT = 20
const WINDOW_MS = 5 * 60 * 1000

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn("[PRESCRIPTION UPLOAD] Cloudinary env vars are not fully configured")
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user || user.user_type !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = rateLimit(clientKey(request, "prescription-upload"), LIMIT, WINDOW_MS)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please slow down." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const doctorName = formData.get("doctorName") as string
    const hospitalName = formData.get("hospitalName") as string
    const prescriptionDate = formData.get("prescriptionDate") as string
    const notes = formData.get("notes") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 })
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 })
    }

    // Convert file to buffer and upload to Cloudinary
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.CLOUDINARY_PRESCRIPTIONS_FOLDER || "davaa/prescriptions",
          resource_type: "image",
        },
        (error, result) => {
          if (error) return reject(error)
          resolve(result)
        }
      )
      stream.end(buffer)
    })

    // Save prescription to database
    const prescriptionImageUrl = uploadResult.secure_url as string

    const result = await sql`
      INSERT INTO prescriptions 
        (customer_id, doctor_name, hospital_name, prescription_date, prescription_image, notes)
      VALUES 
        (${user.id}, ${doctorName || null}, ${hospitalName || null}, ${prescriptionDate || null}, ${prescriptionImageUrl}, ${notes || null})
      RETURNING *
    `

    return NextResponse.json({ 
      success: true, 
      prescription: result[0],
      imageUrl: prescriptionImageUrl 
    })
  } catch (error) {
    console.error("[v0] Upload prescription error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
