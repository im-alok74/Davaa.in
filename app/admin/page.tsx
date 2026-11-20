import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-server"
import { sql } from "@/lib/db"
import { AdminLayout } from "@/components/admin/admin-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Building2, Package, ShoppingCart, Pill, FileText, Activity, ShieldCheck, ArrowRight } from "lucide-react"
import { SettingsManager } from "@/components/admin/settings-manager"

export default async function AdminDashboardPage() {
  const user = await requireRole(["admin"])

  if (!user) {
    redirect("/signin")
  }

  let data: any = {
    total_customers: 0,
    total_pharmacies: 0,
    total_distributors: 0,
    total_orders: 0,
    total_medicines: 0,
    total_prescriptions: 0,
    pending_pharmacies: 0,
    pending_distributors: 0,
  }

  let settings: Record<string, string> = {}

  try {
    const stats = await sql`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE user_type = 'customer') as total_customers,
        (SELECT COUNT(*) FROM pharmacy_profiles) as total_pharmacies,
        (SELECT COUNT(*) FROM distributor_profiles) as total_distributors,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM medicines) as total_medicines,
        (SELECT COUNT(*) FROM prescriptions) as total_prescriptions,
        (SELECT COUNT(*) FROM pharmacy_profiles WHERE verification_status = 'pending') as pending_pharmacies,
        (SELECT COUNT(*) FROM distributor_profiles WHERE verification_status = 'pending') as pending_distributors
    `
    if (stats && stats.length > 0) {
      data = stats[0]
    }

    const settingsResult = await sql`
      SELECT setting_key, setting_value FROM platform_settings
    `
    if (settingsResult && settingsResult.length > 0) {
      settingsResult.forEach((setting: any) => {
        settings[setting.setting_key] = setting.setting_value
      })
    }
  } catch (error) {
    console.error("[admin-dashboard] Error fetching stats:", error)
  }

  const pendingReviews = Number(data.pending_pharmacies) + Number(data.pending_distributors)

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Activity className="h-4 w-4" />
                Operations overview
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-foreground">Platform dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Keep a pulse on customer growth, partner onboarding, and core marketplace activity from one place.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Live status</p>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                All systems online
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total customers</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{data.total_customers}</div>
              <p className="mt-2 text-xs text-muted-foreground">Active shoppers on the platform</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Partner network</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{Number(data.total_pharmacies) + Number(data.total_distributors)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Pharmacies and distributors onboarded</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orders processed</CardTitle>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{data.total_orders}</div>
              <p className="mt-2 text-xs text-muted-foreground">Successful transactions tracked</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medicines in catalog</CardTitle>
              <Pill className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{data.total_medicines}</div>
              <p className="mt-2 text-xs text-muted-foreground">Listings available to shoppers</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prescriptions received</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{data.total_prescriptions}</div>
              <p className="mt-2 text-xs text-muted-foreground">Documents requiring attention</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending review</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{pendingReviews}</div>
              <p className="mt-2 text-xs text-muted-foreground">Pharmacy and distributor approvals pending</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Pending reviews</CardTitle>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
                <ArrowRight className="h-4 w-4" />
                Needs attention
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">Pharmacies awaiting verification</p>
                  <span className="text-lg font-semibold text-foreground">{data.pending_pharmacies}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">Distributors awaiting verification</p>
                  <span className="text-lg font-semibold text-foreground">{data.pending_distributors}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div id="settings" className="scroll-mt-20">
            <SettingsManager initialSettings={settings} />
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
