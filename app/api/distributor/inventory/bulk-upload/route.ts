import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { clientKey, rateLimit } from "@/lib/rate-limit"
import { tooManyRequests } from "@/lib/api-response"
import * as XLSX from "xlsx"

type UploadRow = {
  medicine_id?: number | string
  medicine_name?: string
  generic_name?: string
  strength?: string
  form?: string
  batch_number?: string
  mfg_date?: string
  expiry_date?: string
  mrp?: number | string
  quantity?: number | string
  unit_price?: number | string
  hsn_code?: string
  notes?: string
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "_")
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toIsoDate(value: unknown) {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null

  // Excel/CSV readers hand dates over as day-serials (e.g. 47027.23), and the row
  // mapper stringifies them. Without this every sheet date fell through to null.
  if (/^\d+(\.\d+)?$/.test(str) && Number(str) > 20000 && Number(str) < 80000) {
    return new Date(Math.floor(Number(str) - 25569) * 86400000).toISOString().slice(0, 10)
  }

  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }

  return null
}

function parseFileRows(buffer: Buffer, fileName: string): UploadRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) return []

  const sheet = wb.Sheets[firstSheetName]
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })

  return jsonRows.map((r) => {
    const normalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      normalized[normalizeKey(k)] = v
    }

    return {
      medicine_id: normalized.medicine_id as number | string | undefined,
      medicine_name: String(normalized.medicine_name || normalized.name || "").trim(),
      generic_name: String(normalized.generic_name || "").trim(),
      strength: String(normalized.strength || "").trim(),
      form: String(normalized.form || "").trim(),
      batch_number: String(normalized.batch_number || "").trim(),
      mfg_date: String(normalized.mfg_date || "").trim(),
      expiry_date: String(normalized.expiry_date || "").trim(),
      mrp: normalized.mrp as number | string | undefined,
      quantity: normalized.quantity as number | string | undefined,
      unit_price: (normalized.unit_price || normalized.wholesale_price) as number | string | undefined,
      hsn_code: String(normalized.hsn_code || "").trim(),
      notes: String(normalized.notes || "").trim(),
    }
  })
}

async function resolveMedicineId(row: UploadRow) {
  const numericId = toNumber(row.medicine_id)
  if (numericId) {
    const byId = await sql`
      SELECT id, name, mrp
      FROM medicines
      WHERE id = ${numericId} AND status = 'active'
      LIMIT 1
    `
    if (byId.length > 0) {
      return byId[0] as any
    }
  }

  const medicineName = (row.medicine_name || "").trim()
  if (!medicineName) return null

  const strength = (row.strength || "").trim()

  const exact = await sql`
    SELECT id, name, mrp
    FROM medicines
    WHERE status = 'active'
      AND name ILIKE ${medicineName}
      AND (${strength === ""} OR COALESCE(strength, '') ILIKE ${strength})
    ORDER BY name ASC
    LIMIT 1
  `

  if (exact.length > 0) {
    return exact[0] as any
  }

  const fuzzy = await sql`
    SELECT id, name, mrp,
      GREATEST(
        similarity(COALESCE(name, ''), ${medicineName}),
        similarity(COALESCE(generic_name, ''), ${medicineName})
      ) AS score
    FROM medicines
    WHERE status = 'active'
      AND (
        name ILIKE ${`%${medicineName}%`}
        OR generic_name ILIKE ${`%${medicineName}%`}
      )
      AND (${strength === ""} OR COALESCE(strength, '') ILIKE ${strength})
    ORDER BY score DESC, name ASC
    LIMIT 1
  `

  if (fuzzy.length > 0) {
    return fuzzy[0] as any
  }

  return null
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "distributor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Each upload can be 2000 rows of fuzzy matching: cap it at 10 per hour per user.
    const limit = rateLimit(clientKey(request as any, `bulk-upload:${user.id}`), 10, 60 * 60 * 1000)
    if (!limit.allowed) return tooManyRequests(limit.retryAfter)

    const profile = await sql`
      SELECT id, verification_status
      FROM distributor_profiles
      WHERE user_id = ${user.id}
      LIMIT 1
    `

    if (profile.length === 0) {
      return NextResponse.json({ error: "Distributor profile not found" }, { status: 404 })
    }

    if ((profile[0] as any).verification_status !== "verified") {
      return NextResponse.json({ error: "Distributor not verified yet" }, { status: 403 })
    }

    const distributorId = (profile[0] as any).id

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "Please upload a CSV/XLSX file" }, { status: 400 })
    }

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return NextResponse.json({ error: "Only .csv, .xls, .xlsx files are allowed" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const rows = parseFileRows(Buffer.from(bytes), file.name)

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in uploaded file" }, { status: 400 })
    }

    if (rows.length > 2000) {
      return NextResponse.json({ error: "Max 2000 rows per upload" }, { status: 400 })
    }

    const results: Array<{ row: number; medicineId?: number; name?: string; status: string; message: string }> = []
    let successCount = 0
    let failureCount = 0
    const uploadedMedicineIds: number[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      try {
        const resolved = await resolveMedicineId(row)
        if (!resolved) {
          failureCount++
          results.push({ row: i + 2, status: "error", message: "Medicine not found (use medicine_id or exact name)" })
          continue
        }

        const medicineId = Number((resolved as any).id)
        const medicineName = String((resolved as any).name)

        const quantity = toNumber(row.quantity)
        const unitPrice = toNumber(row.unit_price)
        const mrp = toNumber(row.mrp) ?? toNumber((resolved as any).mrp)
        const expiryDate = toIsoDate(row.expiry_date)
        const mfgDate = toIsoDate(row.mfg_date)

        if (!quantity || quantity <= 0 || !unitPrice || unitPrice <= 0 || !mrp || !expiryDate) {
          failureCount++
          results.push({
            row: i + 2,
            medicineId,
            name: medicineName,
            status: "error",
            message: "Missing required values: quantity, unit_price, mrp, expiry_date",
          })
          continue
        }

        const batchNumber = (row.batch_number || "").trim() || "N/A"
        const amount = quantity * unitPrice

        // Real upsert on (distributor_id, medicine_id, batch_number). Blank batches are
        // normalized to 'N/A' above because NULL never equals NULL and would otherwise
        // bypass the unique constraint, creating duplicate invisible rows.
        await sql`
          INSERT INTO distributor_medicines
            (distributor_id, medicine_id, batch_number, mfg_date, expiry_date, mrp,
             quantity, unit_price, amount, hsn_code, notes)
          VALUES
            (${distributorId}, ${medicineId}, ${batchNumber}, ${mfgDate}, ${expiryDate},
             ${mrp}, ${quantity}, ${unitPrice}, ${amount},
             ${(row.hsn_code || "").trim() || null}, ${(row.notes || "").trim() || null})
          ON CONFLICT (distributor_id, medicine_id, batch_number)
          DO UPDATE SET
            quantity = distributor_medicines.quantity + EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            amount = (distributor_medicines.quantity + EXCLUDED.quantity) * EXCLUDED.unit_price,
            expiry_date = EXCLUDED.expiry_date,
            mrp = EXCLUDED.mrp,
            mfg_date = EXCLUDED.mfg_date,
            hsn_code = EXCLUDED.hsn_code,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `

        successCount++
        uploadedMedicineIds.push(medicineId)
        results.push({
          row: i + 2,
          medicineId,
          name: medicineName,
          status: "success",
          message: "Uploaded",
        })
      } catch (rowError: any) {
        failureCount++
        results.push({
          row: i + 2,
          status: "error",
          message: rowError?.message || "Failed",
        })
      }
    }

    const source = lowerName.endsWith(".csv") ? "csv" : "xlsx"
    const overallStatus = successCount === 0 ? "failed" : failureCount === 0 ? "completed" : "partial"
    const medicineIdsLiteral = uploadedMedicineIds.length > 0
      ? `{${uploadedMedicineIds.join(",")}}`
      : "{}"

    try {
      await sql`
        INSERT INTO medicine_bulk_uploads
          (distributor_id, source, file_name, medicine_ids, upload_count, status, failure_count)
        VALUES
          (
            ${distributorId},
            ${source},
            ${file.name},
            ${medicineIdsLiteral},
            ${successCount},
            ${overallStatus},
            ${failureCount}
          )
      `
    } catch (auditError) {
      console.error("[bulk-upload] Failed to store audit row:", auditError)
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      successCount,
      failureCount,
      results,
    })
  } catch (error: any) {
    console.error("[bulk-upload] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
