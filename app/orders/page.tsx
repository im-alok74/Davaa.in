import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { getCurrentUser } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PackageCheck, ReceiptText, Clock3, Truck } from "lucide-react"

export default async function OrdersPage() {
  const user = await getCurrentUser()

  if (!user || user.user_type !== "customer") {
    redirect("/signin")
  }

  let orders: any[] = []
  try {
    orders = await sql`
      SELECT o.*, p.pharmacy_name, a.street_address, a.city
      FROM orders o
      LEFT JOIN pharmacy_profiles p ON o.pharmacy_id = p.id
      LEFT JOIN addresses a ON o.delivery_address_id = a.id
      WHERE o.customer_id = ${user.id}
      ORDER BY o.created_at DESC
    `
  } catch (error) {
    console.error("[orders] Error fetching orders:", error)
  }

  const summary = orders.reduce(
    (acc, order) => {
      const status = String(order.order_status || "pending")
      acc.total += 1
      if (status === "delivered") acc.delivered += 1
      if (["confirmed", "preparing", "packed", "ready_for_pickup", "out_for_delivery"].includes(status)) acc.inProgress += 1
      if (status === "cancelled") acc.cancelled += 1
      return acc
    },
    { total: 0, delivered: 0, inProgress: 0, cancelled: 0 }
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(248,250,252,1))]">
        <div className="container mx-auto px-4 py-8 lg:py-10">
          <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-primary">Order history</p>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">My Orders</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Review everything from confirmation to delivery without leaving the dashboard.
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total orders</p>
                  <p className="text-xl font-semibold text-foreground">{summary.total}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivered</p>
                  <p className="text-xl font-semibold text-foreground">{summary.delivered}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">In progress</p>
                  <p className="text-xl font-semibold text-foreground">{summary.inProgress}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {orders.length === 0 ? (
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ReceiptText className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-foreground">No orders yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your first purchase will appear here with live delivery updates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order: any) => (
                <Card key={order.id} className="overflow-hidden border-border/70 shadow-sm">
                  <CardHeader className="border-b border-border/60 bg-muted/20">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle className="text-lg">Order #{order.order_number}</CardTitle>
                        {order.pharmacy_name && (
                          <p className="mt-1 text-sm text-muted-foreground">From: {order.pharmacy_name}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          order.order_status === "delivered"
                            ? "default"
                            : order.order_status === "cancelled"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        <span className="capitalize">{String(order.order_status).replace(/_/g, " ")}</span>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Order Date</p>
                          <p className="mt-1 font-medium text-foreground">
                            {new Date(order.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Amount</p>
                          <p className="mt-1 text-lg font-semibold text-primary">
                            ₹{Number.parseFloat(order.total_amount).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Payment Status</p>
                          <div className="mt-1">
                            <Badge variant={order.payment_status === "paid" ? "default" : "secondary"}>
                              {order.payment_status}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Delivery Address</p>
                          <p className="mt-1 font-medium text-foreground">
                            {order.street_address ? `${order.street_address}, ${order.city}` : "Address available soon"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                        {order.estimated_delivery_time && (
                          <div className="mb-4">
                            <p className="text-sm text-muted-foreground">Estimated delivery</p>
                            <p className="mt-1 font-medium text-foreground">
                              {new Date(order.estimated_delivery_time).toLocaleString()}
                            </p>
                          </div>
                        )}

                        {order.delivered_at && (
                          <div className="mb-4">
                            <p className="text-sm text-muted-foreground">Delivered on</p>
                            <p className="mt-1 font-medium text-foreground">
                              {new Date(order.delivered_at).toLocaleString()}
                            </p>
                          </div>
                        )}

                        {order.order_status !== "cancelled" && (
                          <a href={`/api/orders/${order.order_number}/invoice`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" className="w-full bg-transparent">
                              Download Invoice
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
