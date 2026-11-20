import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { AdminLayout } from "@/components/admin/admin-layout"
import { PharmacyVerificationActions } from "@/components/admin/pharmacy-verification-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

interface PharmacyRow {
  id: number
  pharmacy_name: string
  license_number: string
  gst_number: string | null
  city: string
  state: string
  verification_status: "pending" | "verified" | "rejected"
  created_at: string
  full_name: string
  email: string
  phone: string | null
}

function StatusBadge({ status }: { status: PharmacyRow["verification_status"] }) {
  return (
    <Badge variant={status === "verified" ? "default" : status === "rejected" ? "destructive" : "secondary"}>
      {status}
    </Badge>
  )
}

export default async function AdminPharmaciesPage() {
  await requireRole(["admin"])

  const pharmacies = (await sql`
    SELECT p.id, p.pharmacy_name, p.license_number, p.gst_number, p.city, p.state,
           p.verification_status, p.created_at, u.full_name, u.email, u.phone
    FROM pharmacy_profiles p
    JOIN users u ON u.id = p.user_id
    ORDER BY (p.verification_status = 'pending') DESC, p.created_at DESC
  `) as PharmacyRow[]

  const pending = pharmacies.filter((p) => p.verification_status === "pending").length

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pharmacies</h1>
          <p className="text-muted-foreground">
            {pharmacies.length} registered, {pending} awaiting verification. Only verified pharmacies appear to customers.
          </p>
        </div>

        <Card className="border border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4 py-3">Pharmacy</TableHead>
                    <TableHead className="px-4 py-3">Owner</TableHead>
                    <TableHead className="px-4 py-3">License / GST</TableHead>
                    <TableHead className="px-4 py-3">Location</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pharmacies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No pharmacies have registered yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    pharmacies.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="px-4 py-3 text-sm font-medium">{p.pharmacy_name}</TableCell>
                        <TableCell className="px-4 py-3">
                          <p className="text-sm font-medium">{p.full_name}</p>
                          <p className="break-all text-xs text-muted-foreground">{p.email}</p>
                          {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <code className="rounded bg-muted px-2 py-1 text-xs">{p.license_number}</code>
                          {p.gst_number && <p className="mt-1 text-xs text-muted-foreground">{p.gst_number}</p>}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {p.city}, {p.state}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <StatusBadge status={p.verification_status} />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <PharmacyVerificationActions pharmacyId={p.id} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
