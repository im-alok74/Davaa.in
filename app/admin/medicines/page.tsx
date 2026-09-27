import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-server"
import { AdminLayout } from "@/components/admin/admin-layout"
import { query, sql } from "@/lib/db"
import { AdminMedicinesTable } from "@/components/admin/admin-medicines-table"

type AdminMedicineRow = React.ComponentProps<typeof AdminMedicinesTable>["initialMedicines"][number]

const PAGE_SIZE = 20

export default async function AdminMedicinesPage() {
  const user = await getCurrentUser()

  if (!user || user.user_type !== "admin") {
    redirect("/signin")
  }

  // Only the first page loads server-side; AdminMedicinesTable fetches subsequent
  // pages and searches from /api/admin/medicines, which is already paginated.
  const initialMedicines = await query<AdminMedicineRow>`
    SELECT id, name, generic_name, manufacturer, category, form, strength, mrp, requires_prescription, hsn_code
    FROM medicines
    ORDER BY name ASC
    LIMIT ${PAGE_SIZE}
  `

  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM medicines` as any[]

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Medicines</h1>
          <p className="text-muted-foreground">Manage medicine catalog - Add, Edit, and Delete medicines</p>
        </div>

        <AdminMedicinesTable initialMedicines={initialMedicines} totalInitialMedicines={total} />
      </div>
    </AdminLayout>
  )
}
