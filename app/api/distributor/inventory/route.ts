import { sql, withTransaction } from "@/lib/db"
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

    if (isNewMedicine && (!newMedicine || !newMedicine.name || !newMedicine.mrp)) {
      return NextResponse.json(
        { error: "New medicine details are incomplete" },
        { status: 400 }
      )
    }

    // Calculate amount
    const amount = quantity * resolvedWholesalePrice

    // A blank batch number used to fall through to NULL, and NULL is never equal to
    // NULL — so the unique constraint on (distributor_id, medicine_id, batch_number)
    // never fired for two blank-batch adds of the same medicine, and the try/catch
    // below that keyed off it silently created a second, invisible row instead of
    // accumulating stock. Normalizing to a real value fixes both matching paths.
    const normalizedBatchNumber = batchNumber || "N/A"

    // Catalog lookup/create + the inventory upsert are one unit: a failure partway
    // through previously left an orphaned medicines/medicine_images row behind with
    // no stock, and there was no rollback path for any of it.
    const result = await withTransaction(async (query) => {
      let resolvedMedicineId = (medicineId as number | null) || null

      if (isNewMedicine) {
        const created = await query<{ id: number }>`
          INSERT INTO medicines (
            name, generic_name, manufacturer, category, form, strength, pack_size,
            mrp, image_url, requires_prescription, status
          )
          VALUES (
            ${newMedicine.name}, ${newMedicine.generic_name}, ${newMedicine.manufacturer},
            ${newMedicine.category}, ${newMedicine.form}, ${newMedicine.strength},
            ${newMedicine.pack_size}, ${newMedicine.mrp}, ${newMedicine.image_url || null},
            ${newMedicine.requires_prescription ?? false}, 'active'
          )
          RETURNING id
        `

        resolvedMedicineId = created[0].id

        if (Array.isArray(imageUrls)) {
          for (const url of imageUrls) {
            if (url && String(url).trim()) {
              await query`
                INSERT INTO medicine_images (medicine_id, image_url, source)
                VALUES (${resolvedMedicineId}, ${String(url).trim()}, 'distributor')
              `
            }
          }
        }
      } else if (resolvedMedicineId) {
        const medicine = await query<{ id: number }>`
          SELECT id FROM medicines WHERE id = ${resolvedMedicineId}
        `
        if (medicine.length === 0) resolvedMedicineId = null
      }

      if (!resolvedMedicineId) {
        return { ok: false as const, status: 404, error: "Medicine not found" }
      }

      const inserted = await query<Record<string, any>>`
        INSERT INTO distributor_medicines
        (distributor_id, medicine_id, batch_number, mfg_date, expiry_date, mrp, quantity, unit_price, amount, hsn_code, notes)
        VALUES
        (${distributorId}, ${resolvedMedicineId}, ${normalizedBatchNumber}, ${mfgDate || null}, ${expiryDate}, ${mrp}, ${quantity}, ${resolvedWholesalePrice}, ${amount}, ${hsnCode || null}, ${notes || null})
        ON CONFLICT (distributor_id, medicine_id, batch_number)
        DO UPDATE SET
          quantity = distributor_medicines.quantity + EXCLUDED.quantity,
          unit_price = EXCLUDED.unit_price,
          amount = (distributor_medicines.quantity + EXCLUDED.quantity) * EXCLUDED.unit_price,
          expiry_date = EXCLUDED.expiry_date,
          mrp = EXCLUDED.mrp,
          mfg_date = EXCLUDED.mfg_date,
          hsn_code = EXCLUDED.hsn_code,
          notes = EXCLUDED.notes
        RETURNING *
      `

      return { ok: true as const, item: inserted[0] }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      item: result.item,
      message: "Medicine added to inventory"
    })
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
