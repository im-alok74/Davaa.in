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
      SELECT id, verification_status FROM distributor_profiles WHERE user_id = ${user.id}
    `

    if (distributorProfile.length === 0) {
      return NextResponse.json({ error: "Distributor profile not found" }, { status: 404 })
    }

    if ((distributorProfile[0] as any).verification_status !== "verified") {
      return NextResponse.json(
        { error: "Distributor not verified yet" },
        { status: 403 }
      )
    }

    const distributorId = distributorProfile[0].id

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get("page")) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20))
    const offset = (page - 1) * limit

    // Get inventory with medicine details
    const inventory = await sql`
      SELECT
        dm.id,
        dm.medicine_id,
        dm.batch_number,
        dm.mfg_date,
        dm.expiry_date,
        dm.mrp,
        dm.quantity,
        dm.unit_price,
        dm.amount,
        dm.hsn_code,
        dm.notes,
        dm.created_at,
        m.name,
        m.generic_name,
        m.manufacturer,
        m.form,
        m.strength,
        m.pack_size,
        m.requires_prescription,
        m.image_url
      FROM distributor_medicines dm
      JOIN medicines m ON dm.medicine_id = m.id
      WHERE dm.distributor_id = ${distributorId}
      ORDER BY dm.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ total }] = await sql`
      SELECT COUNT(*)::int AS total FROM distributor_medicines WHERE distributor_id = ${distributorId}
    ` as any[]

    // Fetch all images in a single batched query (no N+1) — scoped to this page only
    const medicineIds = (inventory as any[]).map(item => item.medicine_id)

    let allImages: any[] = []
    if (medicineIds.length > 0) {
      allImages = await sql`
        SELECT medicine_id, image_url FROM medicine_images
        WHERE medicine_id = ANY(${medicineIds})
        ORDER BY medicine_id, created_at ASC
      `
    }

    // Group images by medicine_id
    const imagesByMedicineId = new Map<number, string[]>()
    allImages.forEach(img => {
      if (!imagesByMedicineId.has(img.medicine_id)) {
        imagesByMedicineId.set(img.medicine_id, [])
      }
      imagesByMedicineId.get(img.medicine_id)!.push(img.image_url)
    })

    // Attach images to inventory items
    const inventoryWithImages = (inventory as any[]).map(item => ({
      ...item,
      images: imagesByMedicineId.get(item.medicine_id) || [],
    }))

    return NextResponse.json({
      inventory: inventoryWithImages,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (error: any) {
    console.error("[v0] Distributor inventory error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "distributor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      isNewMedicine,
      medicineId,
      newMedicine,
      batchNumber,
      mfgDate,
      expiryDate,
      mrp,
      quantity,
      unitPrice,
      wholesalePrice,
      hsnCode,
      notes,
      imageUrls = [],
    } = body as any

    // Backward compatible: older clients send `unitPrice`, newer send `wholesalePrice`
    const resolvedWholesalePrice =
      wholesalePrice !== undefined && wholesalePrice !== null ? wholesalePrice : unitPrice

    // Validate required fields
    if (!expiryDate || !mrp || !quantity || !resolvedWholesalePrice) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get distributor profile
    const distributorProfile = await sql`
      SELECT id, verification_status FROM distributor_profiles WHERE user_id = ${user.id}
    `

    if (distributorProfile.length === 0) {
      return NextResponse.json({ error: "Distributor profile not found" }, { status: 404 })
    }

    if ((distributorProfile[0] as any).verification_status !== "verified") {
      return NextResponse.json(
        { error: "Distributor not verified yet" },
        { status: 403 }
      )
    }

    const distributorId = distributorProfile[0].id

    // Resolve medicine id: either existing or create a new catalog entry
    let resolvedMedicineId = (medicineId as number | null) || null

    if (isNewMedicine) {
      if (!newMedicine || !newMedicine.name || !newMedicine.mrp) {
        return NextResponse.json(
          { error: "New medicine details are incomplete" },
          { status: 400 }
        )
      }

      const created = await sql`
        INSERT INTO medicines (
          name,
          generic_name,
          manufacturer,
          category,
          form,
          strength,
          pack_size,
          mrp,
          image_url,
          requires_prescription,
          status
        )
        VALUES (
          ${newMedicine.name},
          ${newMedicine.generic_name},
          ${newMedicine.manufacturer},
          ${newMedicine.category},
          ${newMedicine.form},
          ${newMedicine.strength},
          ${newMedicine.pack_size},
          ${newMedicine.mrp},
          ${newMedicine.image_url || null},
          ${newMedicine.requires_prescription ?? false},
          'active'
        )
        RETURNING id
      `

      resolvedMedicineId = (created[0] as any).id

      // Store additional images for this medicine if provided
      if (Array.isArray(imageUrls)) {
        for (const url of imageUrls) {
          if (url && String(url).trim()) {
            await sql`
              INSERT INTO medicine_images (medicine_id, image_url, source)
              VALUES (${resolvedMedicineId}, ${String(url).trim()}, 'distributor')
            `
          }
        }
      }
    }

    if (!resolvedMedicineId) {
      return NextResponse.json(
        { error: "Medicine not found" },
        { status: 404 }
      )
    }

    // Ensure referenced medicine exists when using existing ID
    if (!isNewMedicine) {
      const medicine = await sql`
        SELECT id, name FROM medicines WHERE id = ${resolvedMedicineId}
      `

      if (medicine.length === 0) {
        return NextResponse.json({ error: "Medicine not found" }, { status: 404 })
      }
    }

    // Calculate amount
    const amount = quantity * resolvedWholesalePrice

    try {
      // Try to insert a new batch row
      const result = await sql`
        INSERT INTO distributor_medicines 
        (distributor_id, medicine_id, batch_number, mfg_date, expiry_date, mrp, quantity, unit_price, amount, hsn_code, notes)
        VALUES 
        (${distributorId}, ${resolvedMedicineId}, ${batchNumber || null}, ${mfgDate || null}, ${expiryDate}, ${mrp}, ${quantity}, ${resolvedWholesalePrice}, ${amount}, ${hsnCode || null}, ${notes || null})
        RETURNING *
      `

      return NextResponse.json({ 
        success: true, 
        item: result[0],
        message: "Medicine added to inventory"
      })
    } catch (error: any) {
      // If this medicine+batch already exists, treat it as adding fresh stock
      if (error.message?.includes("duplicate") || error.message?.includes("unique constraint")) {
        const updated = await sql`
          UPDATE distributor_medicines
          SET quantity = quantity + ${quantity},
              amount = (quantity + ${quantity}) * unit_price,
              expiry_date = ${expiryDate},
              mrp = ${mrp},
              mfg_date = ${mfgDate || null},
              hsn_code = ${hsnCode || null},
              notes = ${notes || null}
          WHERE distributor_id = ${distributorId}
            AND medicine_id = ${resolvedMedicineId}
            AND batch_number IS NOT DISTINCT FROM ${batchNumber || null}
          RETURNING *
        `

        if (updated.length === 0) {
          return NextResponse.json(
            { error: "Failed to update existing stock" },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          item: updated[0],
          message: "Existing batch updated with fresh stock",
        })
      }

      throw error
    }
  } catch (error: any) {
    console.error("[v0] Add inventory error:", error)

    if (error.message?.includes("duplicate")) {
      return NextResponse.json(
        { error: "This medicine with same batch already exists" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
