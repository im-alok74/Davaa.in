import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()

    if (!user || user.user_type !== "pharmacy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const inventoryId = Number(id)

    if (Number.isNaN(inventoryId)) {
      return NextResponse.json({ error: "Invalid inventory ID" }, { status: 400 })
    }

    const pharmacyResult = await sql`
      SELECT id, verification_status
      FROM pharmacy_profiles
      WHERE user_id = ${user.id}
      LIMIT 1
    ` as any[]

    if (pharmacyResult.length === 0) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    if (pharmacyResult[0].verification_status !== "verified") {
      return NextResponse.json({ error: "Pharmacy not verified yet" }, { status: 403 })
    }

    const ownership = await sql`
      SELECT id
      FROM pharmacy_inventory
      WHERE id = ${inventoryId}
        AND pharmacy_id = ${pharmacyResult[0].id}
    ` as any[]

    if (ownership.length === 0) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    }

    await sql`
      DELETE FROM pharmacy_inventory
      WHERE id = ${inventoryId}
    `

    return NextResponse.json({
      success: true,
      message: "Medicine removed from storefront"
    })
  } catch (error: any) {
    console.error("[PHARMACY INVENTORY] Error deleting inventory item:", error)
    return NextResponse.json(
      { error: "Failed to remove medicine" },
      { status: 500 }
    )
  }
}