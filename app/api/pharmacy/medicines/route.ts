import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { sql } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.user_type !== 'pharmacy') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pharmacy profile
    const pharmacyResult = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id}
    ` as any[]

    if (!pharmacyResult || pharmacyResult.length === 0) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    const pharmacyId = pharmacyResult[0].id

    // Get all medicines for this pharmacy with detailed info
    const medicines = await sql`
      SELECT 
        pm.id,
        pm.pharmacy_id,
        pm.medicine_id,
        pm.hsn_code,
        pm.batch_number,
        pm.mfg_date,
        pm.expiry_date,
        pm.mrp,
        pm.quantity,
        pm.unit_price,
        pm.amount,
        pm.notes,
        pm.created_at,
        pm.updated_at,
        m.name as medicine_name,
        m.generic_name,
        m.manufacturer,
        m.image_url,
        COALESCE(
          json_agg(mi.image_url) FILTER (WHERE mi.image_url IS NOT NULL),
          '[]'
        ) AS images
      FROM pharmacy_medicines pm
      JOIN medicines m ON pm.medicine_id = m.id
      LEFT JOIN medicine_images mi ON mi.medicine_id = m.id
      WHERE pm.pharmacy_id = ${pharmacyId}
      GROUP BY pm.id, m.id
      ORDER BY pm.created_at DESC
      LIMIT 500
    ` as any[]

    return NextResponse.json({
      medicines: medicines || [],
      total: (medicines || []).length
    })
  } catch (error: any) {
    console.error('[PHARMACY MEDICINES] Error fetching medicines:', error)
    return NextResponse.json(
      { error: 'Failed to fetch medicines', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.user_type !== 'pharmacy') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pharmacy profile
    const pharmacyResult = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id}
    ` as any[]

    if (!pharmacyResult || pharmacyResult.length === 0) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    const pharmacyId = pharmacyResult[0].id
    const body = await request.json()
    const {
      medicineName,
      genericName,
      manufacturer,
      hsnCode,
      batchNumber,
      mfgDate,
      expiryDate,
      mrp,
      quantity,
      unitPrice,
      imageUrl,
      notes
    } = body

    // Validate required fields
    if (!medicineName || !expiryDate || !mrp || quantity === undefined || unitPrice === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: medicineName, expiryDate, mrp, quantity, unitPrice' },
        { status: 400 }
      )
    }

    // Create or get medicine
    let medicineId: number
    const existingMedicine = await sql`
      SELECT id FROM medicines 
      WHERE name = ${medicineName} 
      AND (manufacturer = ${manufacturer || null} OR manufacturer IS NULL)
    ` as any[]

    if (existingMedicine && existingMedicine.length > 0) {
      medicineId = existingMedicine[0].id
    } else {
      const newMedicine = await sql`
        INSERT INTO medicines (name, generic_name, manufacturer, hsn_code, mfg_date, mrp, image_url)
        VALUES (${medicineName}, ${genericName || null}, ${manufacturer || null}, ${hsnCode || null}, ${mfgDate || null}, ${mrp}, ${imageUrl || null})
        RETURNING id
      ` as any[]
      medicineId = newMedicine[0].id
    }

    // Calculate amount
    const amount = parseFloat(quantity) * parseFloat(unitPrice)

    // Add to pharmacy medicines
    const result = await sql`
      INSERT INTO pharmacy_medicines (
        pharmacy_id, medicine_id, hsn_code, batch_number, mfg_date, 
        expiry_date, mrp, quantity, unit_price, amount, notes
      )
      VALUES (
        ${pharmacyId}, ${medicineId}, ${hsnCode || 'N/A'}, ${batchNumber || 'N/A'}, 
        ${mfgDate || null}, ${expiryDate}, ${mrp}, ${quantity}, ${unitPrice}, 
        ${amount}, ${notes || null}
      )
      RETURNING id
    ` as any[]

    // Manual pharmacy stock should also be available to customers.
    await sql`
      INSERT INTO pharmacy_inventory (
        pharmacy_id,
        medicine_id,
        stock_quantity,
        selling_price,
        discount_percentage,
        batch_number,
        expiry_date
      )
      VALUES (
        ${pharmacyId},
        ${medicineId},
        ${quantity},
        ${unitPrice},
        0,
        ${batchNumber || null},
        ${expiryDate}
      )
      ON CONFLICT (pharmacy_id, medicine_id, batch_number)
      DO UPDATE SET
        stock_quantity = pharmacy_inventory.stock_quantity + EXCLUDED.stock_quantity,
        selling_price = EXCLUDED.selling_price,
        discount_percentage = EXCLUDED.discount_percentage,
        expiry_date = COALESCE(EXCLUDED.expiry_date, pharmacy_inventory.expiry_date),
        last_updated = CURRENT_TIMESTAMP
    `

    return NextResponse.json({
      success: true,
      medicineId: result[0].id,
      message: 'Medicine added successfully'
    })
  } catch (error: any) {
    console.error('[PHARMACY MEDICINES] Error adding medicine:', error)
    return NextResponse.json(
      { error: 'Failed to add medicine', details: String(error) },
      { status: 500 }
    )
  }
}

