import type React from "react"

import Link from "next/link"
import { Pill, Users, Building2, Package, ShoppingCart, FileText, Settings, Home, Repeat, AlertCircle, PanelLeftClose } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,1))]">
      <aside className="hidden w-72 shrink-0 border-r border-border/70 bg-card/80 backdrop-blur lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border/70 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none text-foreground">Davaa.in</span>
            <span className="text-xs text-muted-foreground">Admin panel</span>
          </div>
        </div>

        <div className="px-4 py-5">
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Operations workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">Monitor growth, approvals, and platform settings.</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-6">
          <Link href="/admin">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>

          <Link href="/admin/users">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Users className="h-4 w-4" />
              Users
            </Button>
          </Link>

          <Link href="/admin/pharmacies">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Building2 className="h-4 w-4" />
              Pharmacies
            </Button>
          </Link>

          <Link href="/admin/distributors">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Package className="h-4 w-4" />
              Distributors
            </Button>
          </Link>

          <Link href="/admin/orders">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <ShoppingCart className="h-4 w-4" />
              Orders
            </Button>
          </Link>

          <Link href="/admin/purchase-requests">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Repeat className="h-4 w-4" />
              Procurement Requests
            </Button>
          </Link>

          <Link href="/admin/out-of-stock-requests">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <AlertCircle className="h-4 w-4" />
              Out-of-Stock Requests
            </Button>
          </Link>

          <Link href="/admin/medicines">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <Pill className="h-4 w-4" />
              Medicines
            </Button>
          </Link>

          <Link href="/admin/prescriptions">
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
              <FileText className="h-4 w-4" />
              Prescriptions
            </Button>
          </Link>

          <div className="pt-4">
            <Link href="/admin#settings">
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl" size="sm">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border/70 bg-card/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PanelLeftClose className="h-4 w-4 text-primary" />
            Admin workspace
          </div>
          <form action="/api/auth/signout" method="POST">
            <Button type="submit" variant="ghost" size="sm">
              Sign Out
            </Button>
          </form>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
