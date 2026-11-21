import { sql, withTransaction } from "@/lib/db"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      email,
      password,
      confirmPassword,
      fullName,
      phone,
      companyName,
      licenseNumber,
      gstNumber: rawGstNumber,
      streetAddress,
      landmark,
      city,
      state,
      pincode,
      serviceAreas,
    } = body

    const gstNumber = String(rawGstNumber ?? "").replace(/\s/g, "").toUpperCase()

    // Validation
    if (!email || !password || !fullName || !phone) {
      return NextResponse.json(
        { error: "Missing required account information" },
        { status: 400 }
      )
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    if (!companyName || !licenseNumber || !gstNumber) {
      return NextResponse.json(
        { error: "Missing required company information" },
        { status: 400 }
      )
    }

    if (!streetAddress || !city || !state || !pincode) {
      return NextResponse.json(
        { error: "Missing required address information" },
        { status: 400 }
      )
    }

    // GST Format Validation: 15-digit GSTIN
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(gstNumber)) {
      return NextResponse.json(
        { error: "Invalid GST format" },
        { status: 400 }
      )
    }

    // Pincode Format Validation
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json(
        { error: "Invalid pincode format" },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingEmail = await sql`
      SELECT id FROM users WHERE LOWER(email) = LOWER(${email})
    `

    if (existingEmail.length > 0) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      )
    }

    // Check if business license number already exists
    const existingLicense = await sql`
      SELECT id FROM distributor_profiles WHERE business_license_number = ${licenseNumber}
    `

    if (existingLicense.length > 0) {
      return NextResponse.json(
        { error: "License number already registered" },
        { status: 409 }
      )
    }

    // Check if tax ID already exists
    const existingTaxId = await sql`
      SELECT id FROM distributor_profiles WHERE tax_id = ${gstNumber}
    `

    if (existingTaxId.length > 0) {
      return NextResponse.json(
        { error: "Tax ID already registered" },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    const deliveryRadius = parseInt(serviceAreas) || 50 // Default 50km

    // User + profile are one unit: a failure on the profile (e.g. a racing duplicate
    // licence) used to leave a distributor user with no profile that could never retry.
    const { user, distributorResult } = await withTransaction(async (query) => {
      const [createdUser] = await query<Record<string, any>>`
        INSERT INTO users (email, password_hash, full_name, phone, user_type)
        VALUES (${String(email).trim().toLowerCase()}, ${passwordHash}, ${fullName}, ${phone}, 'distributor')
        RETURNING id, email, full_name, phone, user_type, status
      `
      const profileRows = await query<Record<string, any>>`
        INSERT INTO distributor_profiles
        (user_id, company_name, business_license_number, tax_id, phone_number, address_line1, city, state_province, postal_code, country, delivery_radius_km, verification_status)
        VALUES
        (${createdUser.id}, ${companyName}, ${licenseNumber}, ${gstNumber}, ${phone}, ${streetAddress}, ${city}, ${state}, ${pincode}, 'India', ${deliveryRadius}, 'pending')
        RETURNING id
      `
      return { user: createdUser, distributorResult: profileRows }
    })
    const userId = user.id

    // Create session
    const sessionToken = generateSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await sql`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES (${userId}, ${sessionToken}, ${expiresAt})
    `

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
      },
      distributor: {
        id: distributorResult[0].id,
        companyName,
        verificationStatus: "pending",
      },
    })
  } catch (error: any) {
    console.error("[v0] Distributor registration error:", error)

    if (error.message?.includes("duplicate key")) {
      return NextResponse.json(
        { error: "Email or license already registered" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
