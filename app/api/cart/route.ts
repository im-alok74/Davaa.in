import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { medicineId, quantity } = await request.json()

    if (!medicineId || !quantity) {
      return NextResponse.json({ error: "Medicine ID and quantity are required" }, { status: 400 })
    }

    // Check if item already exists in cart to validate cumulative quantity
    const existing = await sql`
      SELECT * FROM cart_items
      WHERE user_id = ${user.id} AND medicine_id = ${medicineId}
    `

    const existingQty = existing.length > 0 ? Number(existing[0].quantity) : 0
    const desiredQty = existingQty + Number(quantity)

    // Ensure at least one verified pharmacy has enough stock to satisfy desired quantity
    const sufficientStock = await sql`
      SELECT pi.stock_quantity
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
      WHERE pi.medicine_id = ${medicineId}
        AND pp.verification_status = 'verified'
        AND pi.stock_quantity >= ${desiredQty}
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      LIMIT 1
    `

    if (!sufficientStock.length) {
      // Try to return the maximum available stock (if any) to provide a helpful error
      const anyStock = await sql`
        SELECT COALESCE(MAX(pi.stock_quantity), 0) AS max_stock
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
        WHERE pi.medicine_id = ${medicineId}
          AND pp.verification_status = 'verified'
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      `

      const maxAvailable = anyStock.length ? Number(anyStock[0].max_stock) : 0
      if (maxAvailable <= 0) {
        return NextResponse.json(
          { error: "This medicine is currently unavailable from verified pharmacies" },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: `Only ${maxAvailable} unit(s) available from verified pharmacies` },
        { status: 400 }
      )
    }

    if (existing.length > 0) {
      // Update quantity
      await sql`
        UPDATE cart_items
        SET quantity = quantity + ${quantity}
        WHERE user_id = ${user.id} AND medicine_id = ${medicineId}
      `
    } else {
      // Insert new item
      await sql`
        INSERT INTO cart_items (user_id, medicine_id, quantity)
        VALUES (${user.id}, ${medicineId}, ${quantity})
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Add to cart error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cartItems = await sql`
      SELECT c.id, c.quantity, c.created_at,
             m.id as medicine_id, m.name, COALESCE(pi.mrp, m.mrp) as mrp,
             m.image_url, m.requires_prescription,
             NULLIF(pi.selling_price, 0) AS selling_price, pi.discount_percentage,
             pi.pharmacy_id, pp.pharmacy_name
      FROM cart_items c
      JOIN medicines m ON c.medicine_id = m.id
      LEFT JOIN LATERAL (
        SELECT pi.*
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
        WHERE pi.medicine_id = c.medicine_id
          AND pp.verification_status = 'verified'
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
        ORDER BY pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0) ASC,
                 pi.expiry_date DESC NULLS LAST
        LIMIT 1
      ) pi ON true
      LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
      WHERE c.user_id = ${user.id}
      ORDER BY c.created_at DESC
    `

    return NextResponse.json({ cartItems })
  } catch (error) {
    console.error("[v0] Get cart error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cartItemId = searchParams.get("id")

    if (!cartItemId) {
      return NextResponse.json({ error: "Cart item ID is required" }, { status: 400 })
    }

    await sql`
      DELETE FROM cart_items
      WHERE id = ${cartItemId} AND user_id = ${user.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Delete cart item error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { cartItemId, quantity } = await request.json()

    if (!cartItemId || quantity === undefined || quantity === null) {
      return NextResponse.json({ error: "Cart item ID and quantity are required" }, { status: 400 })
    }

    const qty = Number(quantity)
    if (Number.isNaN(qty) || qty < 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 })
    }

    // Fetch cart item and ensure ownership
    const cartRow = await sql`
      SELECT * FROM cart_items WHERE id = ${cartItemId} AND user_id = ${user.id}
    `

    if (!cartRow.length) {
      return NextResponse.json({ error: "Cart item not found" }, { status: 404 })
    }

    const medicineId = cartRow[0].medicine_id

    if (qty === 0) {
      await sql`DELETE FROM cart_items WHERE id = ${cartItemId} AND user_id = ${user.id}`
      return NextResponse.json({ success: true })
    }

    // Ensure at least one verified pharmacy has enough stock
    const sufficientStock = await sql`
      SELECT pi.stock_quantity
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
      WHERE pi.medicine_id = ${medicineId}
        AND pp.verification_status = 'verified'
        AND pi.stock_quantity >= ${qty}
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      LIMIT 1
    `

    if (!sufficientStock.length) {
      const anyStock = await sql`
        SELECT COALESCE(MAX(pi.stock_quantity), 0) AS max_stock
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
        WHERE pi.medicine_id = ${medicineId}
          AND pp.verification_status = 'verified'
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      `

      const maxAvailable = anyStock.length ? Number(anyStock[0].max_stock) : 0
      if (maxAvailable <= 0) {
        return NextResponse.json(
          { error: "This medicine is currently unavailable from verified pharmacies" },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: `Only ${maxAvailable} unit(s) available from verified pharmacies` },
        { status: 400 }
      )
    }

    // Update quantity
    await sql`
      UPDATE cart_items SET quantity = ${qty} WHERE id = ${cartItemId} AND user_id = ${user.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Update cart quantity error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
