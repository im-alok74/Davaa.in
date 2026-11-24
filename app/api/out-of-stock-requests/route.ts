import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

const RequestSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
  fullName: z.string().trim().min(2).max(255),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/),
  addressLine1: z.string().trim().min(5).max(255),
  addressLine2: z.string().trim().max(255).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/),
  acceptSubstitute: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.user_type !== "customer") {
    return NextResponse.json({ error: "Please sign in as a customer" }, { status: 401 })
  }

  let payload: z.infer<typeof RequestSchema>
  try {
    payload = RequestSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const [medicine] = await sql`
      SELECT id, mrp, name
      FROM medicines
      WHERE id = ${payload.medicineId} AND status = 'active'
    `
    if (!medicine) {
      return NextResponse.json({ error: "Medicine not found" }, { status: 404 })
    }

    const stock = await sql`
      SELECT 1
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
      WHERE pi.medicine_id = ${payload.medicineId}
        AND pi.stock_quantity > 0
        AND pp.verification_status = 'verified'
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      LIMIT 1
    `
    if (stock.length > 0) {
      return NextResponse.json({ error: "This medicine is currently in stock" }, { status: 409 })
    }

    const existing = await sql`
      SELECT id FROM medicine_out_of_stock_requests
      WHERE customer_id = ${user.id}
        AND medicine_id = ${payload.medicineId}
        AND status IN ('pending', 'assigned')
      LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "You already have an active request for this medicine" }, { status: 409 })
    }

    const [created] = await sql`
      INSERT INTO medicine_out_of_stock_requests (
        customer_id, medicine_id, requested_quantity, mrp, status,
        full_name, phone, address_line1, address_line2, city, state, pincode,
        accept_substitute, notes, created_at, updated_at
      ) VALUES (
        ${user.id}, ${payload.medicineId}, ${payload.quantity}, ${medicine.mrp}, 'pending',
        ${payload.fullName}, ${payload.phone}, ${payload.addressLine1}, ${payload.addressLine2 || null},
        ${payload.city}, ${payload.state}, ${payload.pincode},
        ${payload.acceptSubstitute}, ${payload.notes || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING id, status, created_at
    `

    await sql`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, created_at)
      VALUES (${user.id}, 'create_customer_out_of_stock_request', 'medicine_out_of_stock_requests',
        ${created.id}, ${JSON.stringify({ medicine_id: payload.medicineId, quantity: payload.quantity })},
        CURRENT_TIMESTAMP)
    `

    return NextResponse.json({
      success: true,
      requestId: created.id,
      status: created.status,
      message: "Your medicine request has been submitted. We will search wholesale supply and contact you.",
    }, { status: 201 })
  } catch (error) {
    console.error("Error creating customer out-of-stock request:", error)
    return NextResponse.json({ error: "Failed to submit your request" }, { status: 500 })
  }
}
