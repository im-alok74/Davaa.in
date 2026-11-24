import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[v0] Fetching cart for user:', user.id)

    // First, get all cart items with medicine details including MRP
    const cartItemsResult = await sql`
      SELECT ci.id, ci.quantity, ci.medicine_id, m.name, m.image_url, m.mrp, m.requires_prescription
      FROM cart_items ci
      JOIN medicines m ON ci.medicine_id = m.id
      WHERE ci.user_id = ${user.id}
      ORDER BY ci.created_at DESC
    `

    console.log('[v0] Cart items from DB:', cartItemsResult.length)

    if (cartItemsResult.length === 0) {
      return NextResponse.json({ cartItems: [] })
    }

    // For each medicine, find the cheapest verified pharmacy with stock.
    const cartItems = []
    const unavailableItems = []
    for (const item of cartItemsResult as any[]) {
      console.log('[v0] Looking for pharmacy inventory for medicine:', item.medicine_id)
      
      const inventoryResult = await sql`
        SELECT 
          pi.id as inventory_id,
          pi.pharmacy_id,
          NULLIF(pi.selling_price, 0) AS selling_price,
          pi.mrp AS mrp,
          pi.discount_percentage,
          pp.pharmacy_name,
          pp.verification_status,
          pi.stock_quantity
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp ON pi.pharmacy_id = pp.id
        WHERE pi.medicine_id = ${item.medicine_id}
        AND pp.verification_status = 'verified'
        AND pi.stock_quantity > 0
        ORDER BY pi.selling_price ASC
        LIMIT 1
      `

      console.log('[v0] Inventory results for medicine', item.medicine_id, ':', inventoryResult.length)

      if (inventoryResult.length > 0) {
        const inventory = inventoryResult[0] as any
        cartItems.push({
          id: item.id,
          quantity: item.quantity,
          medicine_id: item.medicine_id,
          name: item.name,
          requires_prescription: Boolean(item.requires_prescription),
          price: Number(inventory.selling_price ?? inventory.mrp ?? item.mrp ?? 0),
          discount_percentage: Number(inventory.discount_percentage),
          image_url: item.image_url,
          pharmacy_id: inventory.pharmacy_id,
          pharmacy_name: inventory.pharmacy_name,
          stock_quantity: Number(inventory.stock_quantity || 0),
        })
      } else {
        console.log('[v0] No verified pharmacy stock found for medicine:', item.medicine_id)
        unavailableItems.push({
          id: item.id,
          quantity: item.quantity,
          medicine_id: item.medicine_id,
          name: item.name,
          image_url: item.image_url,
          reason: 'No verified pharmacy currently has stock',
        })
      }
    }

    console.log('[v0] Final cart items count:', cartItems.length)
    return NextResponse.json({ cartItems, unavailableItems })
  } catch (error) {
    console.error('[v0] Error fetching cart with sellers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cart' },
      { status: 500 }
    )
  }
}
