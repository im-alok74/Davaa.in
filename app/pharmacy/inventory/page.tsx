import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { getCurrentUser } from "@/lib/auth-server"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { sql } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE_SIZE = 50

export default async function PharmacyInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await getCurrentUser()

  if (!user || user.user_type !== "pharmacy") {
    redirect("/signin")
  }

  const pharmacyProfile = await sql`
    SELECT * FROM pharmacy_profiles
    WHERE user_id = ${user.id}
    LIMIT 1
  `

  if (pharmacyProfile.length === 0) {
    redirect("/pharmacy/register")
  }

  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const pharmacyId = (pharmacyProfile[0] as any).id

  const pharmacyInventory = await sql`
    SELECT
      pi.id,
      m.name as medicine_name,
      m.generic_name,
      pi.stock_quantity,
      pi.selling_price,
      pi.discount_percentage,
      pi.batch_number,
      pi.expiry_date,
      pi.last_updated
    FROM pharmacy_inventory pi
    JOIN medicines m ON pi.medicine_id = m.id
    WHERE pi.pharmacy_id = ${pharmacyId}
    ORDER BY pi.last_updated DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `

  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total FROM pharmacy_inventory WHERE pharmacy_id = ${pharmacyId}
  ` as any[]

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
            <Button asChild>
              <Link href="/pharmacy/inventory/add">
                <Plus className="mr-2 h-4 w-4" />
                Add Medicine
              </Link>
            </Button>
          </div>

          {pharmacyInventory.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-muted-foreground">No medicines in your inventory yet. Add some to get started!</p>
              <Button asChild className="mt-4">
                <Link href="/pharmacy/inventory/add">Add Medicine</Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine Name</TableHead>
                    <TableHead>Generic Name</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Batch Number</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pharmacyInventory.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.medicine_name}</TableCell>
                      <TableCell>{item.generic_name || "-"}</TableCell>
                      <TableCell>{Number(item.stock_quantity || 0)}</TableCell>
                      <TableCell>₹{Number(item.selling_price || 0).toFixed(2)}</TableCell>
                      <TableCell>{Number(item.discount_percentage || 0)}%</TableCell>
                      <TableCell>{item.batch_number}</TableCell>
                      <TableCell>{new Date(item.expiry_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Link href={`/pharmacy/inventory/${item.id}/edit`} className="text-primary hover:underline">Edit</Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {pharmacyInventory.length} of {total} items
                  </p>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                      <Link href={`/pharmacy/inventory?page=${page - 1}`} aria-disabled={page <= 1}>
                        Previous
                      </Link>
                    </Button>
                    <span className="text-sm font-medium">Page {page} of {totalPages}</span>
                    <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
                      <Link href={`/pharmacy/inventory?page=${page + 1}`} aria-disabled={page >= totalPages}>
                        Next
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
