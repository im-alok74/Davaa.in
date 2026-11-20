import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { sql } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.user_type !== 'pharmacy') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Await params if it's a Promise
    const resolvedParams = await Promise.resolve(params)
    const medicineId = Number(resolvedParams.id)

    if (isNaN(medicineId)) {
      return NextResponse.json({ error: 'Invalid medicine ID' }, { status: 400 })
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
      hsnCode,
      batchNumber,
      mfgDate,
      expiryDate,
      mrp,
      quantity,
      unitPrice,
      notes
    } = body

    // Verify ownership
    const ownership = await sql`
      SELECT id FROM pharmacy_medicines 
      WHERE id = ${medicineId} AND pharmacy_id = ${pharmacyId}
    ` as any[]

    if (!ownership || ownership.length === 0) {
      return NextResponse.json({ error: 'Medicine not found or unauthorized' }, { status: 404 })
    }

    // Calculate amount
    const amount = parseFloat(quantity) * parseFloat(unitPrice)

    // Update medicine
    await sql`
      UPDATE pharmacy_medicines
      SET 
        hsn_code = ${hsnCode || 'N/A'},
        batch_number = ${batchNumber || 'N/A'},
        mfg_date = ${mfgDate || null},
        expiry_date = ${expiryDate},
        mrp = ${mrp},
        quantity = ${quantity},
        unit_price = ${unitPrice},
        amount = ${amount},
        notes = ${notes || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${medicineId}
    `

    return NextResponse.json({
      success: true,
      message: 'Medicine updated successfully'
    })
  } catch (error: any) {
    console.error('[PHARMACY MEDICINES] Error updating medicine:', error)
    return NextResponse.json(
      { error: 'Failed to update medicine' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.user_type !== 'pharmacy') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Await params if it's a Promise
    const resolvedParams = await Promise.resolve(params)
    const medicineId = Number(resolvedParams.id)

    if (isNaN(medicineId)) {
      return NextResponse.json({ error: 'Invalid medicine ID' }, { status: 400 })
    }

    // Get pharmacy profile
    const pharmacyResult = await sql`
      SELECT id FROM pharmacy_profiles WHERE user_id = ${user.id}
    ` as any[]

    if (!pharmacyResult || pharmacyResult.length === 0) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    const pharmacyId = pharmacyResult[0].id

    // Verify ownership
    const ownership = await sql`
      SELECT id FROM pharmacy_medicines 
      WHERE id = ${medicineId} AND pharmacy_id = ${pharmacyId}
    ` as any[]

    if (!ownership || ownership.length === 0) {
      return NextResponse.json({ error: 'Medicine not found or unauthorized' }, { status: 404 })
    }

    // Delete medicine
    await sql`
      DELETE FROM pharmacy_medicines
      WHERE id = ${medicineId}
    `

    return NextResponse.json({
      success: true,
      message: 'Medicine removed successfully'
    })
  } catch (error: any) {
    console.error('[PHARMACY MEDICINES] Error deleting medicine:', error)
    return NextResponse.json(
      { error: 'Failed to delete medicine' },
      { status: 500 }
    )
  }
}
