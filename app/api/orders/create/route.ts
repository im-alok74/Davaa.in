import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"

import { getCurrentUser } from "@/lib/auth-server"
import { withTransaction, type TransactionQuery } from "@/lib/db"
import { calculateOrderTotals, type PricedLineInput } from "@/lib/pricing"

/**
 * Places one order per pharmacy from the signed-in customer's server-side cart.
 *
 * Security note: this endpoint deliberately ignores any prices, discounts or line items
 * the client sends. The previous version summed `item.price * item.quantity` straight
 * from the request body, so anyone could post their own prices and buy at any amount.
 * Cart contents are now read from `cart_items` and every rupee is derived from
 * `pharmacy_inventory` inside the transaction that also reserves the stock.
 */

const AddressSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  addressLine1: z.string().trim().min(5, "Address is too short").max(255),
  addressLine2: z.string().trim().max(255).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  paymentMethod: z.enum(["cod", "online"]).default("cod"),
  prescriptionId: z.coerce.number().int().positive().optional(),
})

function generateOrderNumber() {
  return `DV${Date.now()}${crypto.randomBytes(3).toString("hex")}`.toUpperCase()
}

interface CartRow {
  medicine_id: number
  quantity: number
  medicine_name: string
  requires_prescription: boolean
  gst_rate: string | number | null
  inventory_id: number | null
  pharmacy_id: number | null
  pharmacy_name: string | null
  selling_price: string | number | null
  discount_percentage: string | number | null
  stock_quantity: number | null
  batch_number: string | null
  mfg_date: string | null
  expiry_date: string | null
  mrp: string | number | null
}

/**
 * Resolves each cart line to the cheapest verified pharmacy that actually has stock,
 * locking the chosen inventory rows FOR UPDATE so two concurrent checkouts cannot both
 * claim the last unit.
 */
async function loadPricedCart(query: TransactionQuery, userId: number): Promise<CartRow[]> {
  return query<CartRow>`
    WITH best_offer AS (
      SELECT DISTINCT ON (pi.medicine_id)
        pi.medicine_id,
        pi.id           AS inventory_id,
        pi.pharmacy_id,
        pi.selling_price,
        pi.discount_percentage,
        pi.stock_quantity,
        pi.batch_number,
        pi.mfg_date,
        pi.expiry_date,
        pi.mrp,
        pp.pharmacy_name
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp
        ON pp.id = pi.pharmacy_id
       AND pp.verification_status = 'verified'
      WHERE pi.stock_quantity > 0
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ORDER BY
        pi.medicine_id,
        pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0) ASC,
        pi.expiry_date DESC NULLS LAST
    )
    SELECT
      ci.medicine_id,
      ci.quantity,
      m.name                       AS medicine_name,
      m.requires_prescription,
      COALESCE(m.gst_rate, 5)      AS gst_rate,
      bo.inventory_id,
      bo.pharmacy_id,
      bo.pharmacy_name,
      bo.selling_price,
      bo.discount_percentage,
      bo.stock_quantity,
      bo.batch_number,
      bo.mfg_date,
      bo.expiry_date,
      bo.mrp
    FROM cart_items ci
    JOIN medicines m ON m.id = ci.medicine_id AND m.status = 'active'
    LEFT JOIN best_offer bo ON bo.medicine_id = ci.medicine_id
    WHERE ci.user_id = ${userId}
    ORDER BY ci.created_at ASC
  `
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user || user.user_type !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: z.infer<typeof AddressSchema>
  try {
    payload = AddressSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid delivery details", issues: error.issues },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    const result = await withTransaction(async (query) => {
      const cart = await loadPricedCart(query, user.id)

      if (cart.length === 0) {
        return { ok: false as const, status: 400, error: "Your cart is empty" }
      }

      // Anything with no verified pharmacy offering it blocks the whole order, so the
      // customer is never charged for a line we cannot fulfil.
      const unavailable = cart.filter((row) => row.inventory_id === null)
      if (unavailable.length > 0) {
        return {
          ok: false as const,
          status: 409,
          error: "Some items are no longer available",
          unavailableItems: unavailable.map((r) => r.medicine_name),
        }
      }

      const understocked = cart.filter((row) => row.quantity > Number(row.stock_quantity ?? 0))
      if (understocked.length > 0) {
        return {
          ok: false as const,
          status: 409,
          error: "Some items no longer have enough stock",
          understockedItems: understocked.map((r) => ({
            name: r.medicine_name,
            available: Number(r.stock_quantity ?? 0),
            requested: r.quantity,
          })),
        }
      }

      // Prescription-only medicines legally require an uploaded prescription on file.
      const rxItems = cart.filter((row) => row.requires_prescription)
      if (rxItems.length > 0) {
        if (!payload.prescriptionId) {
          return {
            ok: false as const,
            status: 422,
            error: "A prescription is required for some items in your cart",
            prescriptionRequiredFor: rxItems.map((r) => r.medicine_name),
          }
        }

        const [prescription] = await query<{ id: number; status: string }>`
          SELECT id, status FROM prescriptions
          WHERE id = ${payload.prescriptionId} AND customer_id = ${user.id}
          LIMIT 1
        `

        if (!prescription) {
          return { ok: false as const, status: 422, error: "Prescription not found" }
        }
        if (prescription.status === "rejected") {
          return { ok: false as const, status: 422, error: "That prescription was rejected" }
        }
      }

      // ---- Delivery address ----
      const addressLine1 = payload.addressLine1
      const [existingAddress] = await query<{ id: number }>`
        SELECT id FROM addresses
        WHERE user_id = ${user.id}
          AND street_address = ${addressLine1}
          AND city = ${payload.city}
          AND state = ${payload.state}
          AND pincode = ${payload.pincode}
        LIMIT 1
      `

      let deliveryAddressId: number
      if (existingAddress) {
        deliveryAddressId = existingAddress.id
      } else {
        const [created] = await query<{ id: number }>`
          INSERT INTO addresses
            (user_id, address_type, street_address, landmark, city, state, pincode, is_default)
          VALUES
            (${user.id}, 'home', ${addressLine1}, ${payload.addressLine2 || null},
             ${payload.city}, ${payload.state}, ${payload.pincode}, false)
          RETURNING id
        `
        deliveryAddressId = created.id
      }

      // ---- One order per pharmacy ----
      const byPharmacy = new Map<number, CartRow[]>()
      for (const row of cart) {
        const key = Number(row.pharmacy_id)
        if (!byPharmacy.has(key)) byPharmacy.set(key, [])
        byPharmacy.get(key)!.push(row)
      }

      const orders: Array<{ orderNumber: string; orderId: number; totalAmount: number }> = []

      for (const [pharmacyId, rows] of byPharmacy) {
        const lineInputs: PricedLineInput[] = rows.map((row) => ({
          medicineId: Number(row.medicine_id),
          quantity: row.quantity,
          sellingPrice: Number(row.selling_price ?? 0),
          discountPercentage: Number(row.discount_percentage ?? 0),
          gstRate: Number(row.gst_rate ?? 5),
        }))

        const totals = calculateOrderTotals(lineInputs)
        const orderNumber = generateOrderNumber()

        const [order] = await query<{ id: number }>`
          INSERT INTO orders (
            order_number, customer_id, pharmacy_id, prescription_id, delivery_address_id,
            order_status, payment_status, payment_method,
            subtotal, tax_amount, delivery_charge, discount_amount, total_amount,
            contact_name, contact_phone
          ) VALUES (
            ${orderNumber}, ${user.id}, ${pharmacyId}, ${payload.prescriptionId ?? null},
            ${deliveryAddressId},
            'pending', 'pending', ${payload.paymentMethod},
            ${totals.subtotal}, ${totals.taxAmount}, ${totals.deliveryCharge},
            ${totals.discountAmount}, ${totals.totalAmount},
            ${payload.fullName}, ${payload.phone}
          )
          RETURNING id
        `

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const line = totals.lines[i]

          await query`
            INSERT INTO order_items (
              order_id, medicine_id, quantity, unit_price, discount_percentage,
              total_price, batch_number, mfg_date, expiry_date, mrp
            ) VALUES (
              ${order.id}, ${row.medicine_id}, ${line.quantity}, ${line.unitPrice},
              ${line.discountPercentage}, ${line.lineTotal},
              ${row.batch_number}, ${row.mfg_date}, ${row.expiry_date},
              ${row.mrp ?? line.unitPrice}
            )
          `

          // Guarded decrement. If a concurrent order consumed the stock between our
          // read and this write, zero rows come back and we abort the whole order.
          const reserved = await query<{ id: number }>`
            UPDATE pharmacy_inventory
            SET stock_quantity = stock_quantity - ${line.quantity},
                last_updated = NOW()
            WHERE id = ${row.inventory_id}
              AND stock_quantity >= ${line.quantity}
            RETURNING id
          `

          if (reserved.length === 0) {
            throw new OutOfStockError(row.medicine_name)
          }
        }

        await query`
          INSERT INTO order_status_history (order_id, status, changed_by, note)
          VALUES (${order.id}, 'pending', ${user.id}, 'Order placed by customer')
        `

        orders.push({
          orderNumber,
          orderId: order.id,
          totalAmount: totals.totalAmount,
        })
      }

      await query`DELETE FROM cart_items WHERE user_id = ${user.id}`

      return { ok: true as const, orders }
    })

    if (!result.ok) {
      const { ok, status, ...body } = result
      return NextResponse.json(body, { status })
    }

    revalidatePath("/orders")
    revalidatePath("/cart")

    return NextResponse.json({
      success: true,
      orders: result.orders,
      orderNumbers: result.orders.map((o) => o.orderNumber),
    })
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return NextResponse.json(
        { error: `${error.medicineName} just went out of stock. Please review your cart.` },
        { status: 409 },
      )
    }

    console.error("[orders/create] failed:", error)
    return NextResponse.json({ error: "Failed to place order. Please try again." }, { status: 500 })
  }
}

class OutOfStockError extends Error {
  constructor(public medicineName: string) {
    super(`Out of stock: ${medicineName}`)
    this.name = "OutOfStockError"
  }
}
