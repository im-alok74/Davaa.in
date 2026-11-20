import { getCurrentUser } from '@/lib/auth-server'
import { sql } from '@/lib/db'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs' // Changed from 'bcrypt' to 'bcryptjs'
export async function POST() {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[v0 Setting up demo pharmacy...')

    // 1. Create demo pharmacy user
    const hashedPassword = await bcrypt.hash('demo123456', 10)
    
    const userCheck = await sql`
      SELECT id FROM users WHERE email = 'demo.pharmacy@davaa.in'
    `

    let userId: number

    if (userCheck.length === 0) {
      const userResult = await sql`
        INSERT INTO users (full_name, email, phone, password_hash, user_type, created_at)
        VALUES ('Davaa.in Pharmacy Demo', 'demo.pharmacy@davaa.in', '+91 9508178521', ${hashedPassword}, 'pharmacy', CURRENT_TIMESTAMP)
        RETURNING id
      `
      userId = (userResult[0] as any).id
      console.log('[demo] Created demo pharmacy user:', userId)
    } else {
      userId = (userCheck[0] as any).id
      console.log('[demo] Demo pharmacy user already exists:', userId)
    }

    // 2. Create or update pharmacy profile
    const pharmacyCheck = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${userId}
    `

    let pharmacyId: number

    if (pharmacyCheck.length === 0) {
      const pharmacyResult = await sql`
        INSERT INTO pharmacy_profiles (
          user_id,
          pharmacy_name,
          license_number,
          gst_number,
          address,
          city,
          state,
          pincode,
          phone,
          verification_status,
          created_at
        )
        VALUES (
          ${userId},
          'Davaa.in Pharmacy',
          'L-2024-00001',
          '27AABCT1234K1Z0',
          'Silao',
          'Nalanda',
          'Bihar',
          '803110',
          '+91 9508178521',
          'verified',
          CURRENT_TIMESTAMP
        )
        RETURNING id
      `
      pharmacyId = (pharmacyResult[0] as any).id
      console.log('[demo] Created demo pharmacy profile:', pharmacyId)
    } else {
      pharmacyId = (pharmacyCheck[0] as any).id
      // Update to verified
      await sql`
        UPDATE pharmacy_profiles 
        SET verification_status = 'verified',
            license_number = 'L-2024-00001',
            gst_number = '27AABCT1234K1Z0'
        WHERE id = ${pharmacyId}
      `
      console.log('[demo] Updated demo pharmacy profile to verified:', pharmacyId)
    }

    // 3. Get all medicines
    const medicines = await sql`
      SELECT id, mrp FROM medicines
    `

    console.log('[demo] Found', medicines.length, 'medicines to map')

    // 4. Map all medicines to demo pharmacy
    let mappedCount = 0
    for (const medicine of medicines as any[]) {
      try {
        const sellingPrice = (Number(medicine.mrp) * 0.90).toString()
        
        await sql`
          INSERT INTO pharmacy_inventory (
            pharmacy_id,
            medicine_id,
            stock_quantity,
            selling_price,
            discount_percentage,
            batch_number,
            expiry_date,
            created_at
          )
          VALUES (
            ${pharmacyId},
            ${medicine.id},
            1000,
            ${sellingPrice},
            10,
            'BATCH-2024',
            CURRENT_DATE + INTERVAL '2 years',
            CURRENT_TIMESTAMP
          )
          ON CONFLICT DO NOTHING
        `
        mappedCount++
      } catch (error) {
        console.error('[demo] Error mapping medicine', medicine.id, ':', error)
      }
    }

    console.log('[demo] Mapped', mappedCount, 'medicines to demo pharmacy')

    // 5. Verify the setup
    const inventoryCount = await sql`
      SELECT COUNT(*) as count FROM pharmacy_inventory WHERE pharmacy_id = ${pharmacyId}
    `

    const count = (inventoryCount[0] as any).count

    return NextResponse.json({
      success: true,
      message: 'Demo pharmacy setup complete',
      data: {
        pharmacy_id: pharmacyId,
        user_id: userId,
        medicines_mapped: count,
      },
    })
  } catch (error) {
    console.error('[demo] Demo pharmacy setup error:', error)
    return NextResponse.json(
      { error: 'Failed to setup demo pharmacy' },
      { status: 500 }
    )
  }
}
