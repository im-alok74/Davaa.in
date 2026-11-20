import Link from "next/link"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { WishlistRemoveButton } from "@/components/wishlist-remove-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"

export const metadata = { title: "Saved medicines", robots: { index: false } }
export const dynamic = "force-dynamic"

interface WishlistRow {
  id: number
  name: string
  generic_name: string | null
  manufacturer: string | null
  strength: string | null
  pack_size: string | null
  mrp: string | null
  image_url: string | null
  best_price: string | null
}

export default async function WishlistPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/signin?redirect=/wishlist")

  const items = (await sql`
    SELECT
      m.id, m.name, m.generic_name, m.manufacturer, m.strength, m.pack_size, m.mrp, m.image_url,
      -- Cheapest live offer from a verified pharmacy; null when nobody stocks it.
      (SELECT MIN(pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0))
         FROM pharmacy_inventory pi
         JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id
        WHERE pi.medicine_id = m.id
          AND pp.verification_status = 'verified'
          AND pi.stock_quantity > 0) AS best_price
    FROM wishlist_items w
    JOIN medicines m ON m.id = w.medicine_id
    WHERE w.user_id = ${user.id}
    ORDER BY w.created_at DESC
  `) as WishlistRow[]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-3xl font-bold text-foreground">Saved medicines</h1>
          <p className="mt-1 text-muted-foreground">Medicines you have saved for later.</p>

          {items.length === 0 ? (
            <Card className="mt-6">
              <CardContent className="flex flex-col items-start gap-3 p-6">
                <p className="text-muted-foreground">You have not saved any medicines yet.</p>
                <Button asChild>
                  <Link href="/medicines">Browse medicines</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="mt-6 space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <Link href={`/medicines/${item.id}`} className="font-semibold text-foreground hover:underline">
                          {item.name}
                        </Link>
                        <p className="truncate text-sm text-muted-foreground">
                          {[item.generic_name, item.strength, item.pack_size].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-sm">
                          {item.best_price !== null ? (
                            <span className="font-semibold">From ₹{Number(item.best_price).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">Currently unavailable</span>
                          )}
                        </p>
                      </div>
                      <WishlistRemoveButton medicineId={item.id} name={item.name} />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
