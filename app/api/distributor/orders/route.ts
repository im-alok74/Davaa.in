import { sql } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth-server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "distributor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get distributor profile
    const distributorProfile = await sql`
      SELECT id FROM distributor_profiles WHERE user_id = ${user.id}
    `

    if (distributorProfile.length === 0) {
      return NextResponse.json({ error: "Distributor profile not found" }, { status: 404 })
    }

    const distributorId = distributorProfile[0].id

    // Get all orders for this distributor
    // We need to find orders that contain medicines from this distributor's inventory
    const orders = await sql`
      SELECT DISTINCT
        o.id,
        o.order_number,
        o.customer_id,
        o.pharmacy_id,
        o.total_amount,
        o.order_status as status,
        o.payment_status,
        o.created_at,
        o.updated_at,
        u.full_name as customer_name,
        u.email as customer_email,
        pp.pharmacy_name,
        COUNT(oi.id) as item_count,
        SUM(oi.quantity) as total_items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN medicines m ON oi.medicine_id = m.id
      JOIN distributor_medicines dm ON dm.medicine_id = m.id
      LEFT JOIN users u ON o.customer_id = u.id
      LEFT JOIN pharmacy_profiles pp ON o.pharmacy_id = pp.id
      WHERE dm.distributor_id = ${distributorId}
      GROUP BY o.id, u.id, pp.id
      ORDER BY o.created_at DESC
    `

    // Get detailed items for each order — scoped to this distributor's own medicines.
    // Previously joined order_items straight off order_id with no distributor filter,
    // so any distributor who supplied a single line item in a multi-distributor order
    // could see every other distributor's medicines, quantities and prices for that
    // order (plus the customer's full name/email selected above).
    const ordersWithItems = await Promise.all(orders.map(async (order: any) => {
      const items = await sql`
        SELECT
          oi.id,
          oi.order_id,
          oi.medicine_id,
          oi.quantity,
          oi.unit_price,
          oi.total_price,
          m.name,
          m.generic_name,
          m.manufacturer
        FROM order_items oi
        JOIN medicines m ON oi.medicine_id = m.id
        JOIN distributor_medicines dm ON dm.medicine_id = m.id AND dm.distributor_id = ${distributorId}
        WHERE oi.order_id = ${order.id}
      `
      return { ...order, items }
    }))

    return NextResponse.json({ orders: ordersWithItems })
  } catch (error: any) {
    console.error("[v0] Distributor orders error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
