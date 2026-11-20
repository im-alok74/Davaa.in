
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { sql } from '@/lib/db'
import { AdminLayout } from '@/components/admin/admin-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DistributorVerificationActions } from '@/components/admin/distributor-verification-actions'
import AdminUserActions from '@/components/admin/admin-user-actions'
import { AddDistributorDialog } from '@/components/admin/add-distributor-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Phone, MapPin, FileCheck, Users, TrendingUp } from 'lucide-react'

interface Distributor {
  id: number
  user_id: number
  company_name: string
  business_license_number: string
  city: string
  state_province: string

  verification_status: 'pending' | 'verified' | 'rejected'
  status: 'active' | 'inactive' | 'paused'
  full_name: string
  email: string
  phone?: string
  created_at: string
}

export default async function AdminDistributorsPage() {
  const user = await getCurrentUser()

  if (!user || user.user_type !== 'admin') {
    redirect('/signin')
  }

  const distributors = await sql`
    SELECT d.*, u.id AS user_id, u.email, u.full_name, u.phone, u.status
    FROM distributor_profiles d
    JOIN users u ON d.user_id = u.id
    ORDER BY d.created_at DESC
  ` as Distributor[]

  const stats = {
    total: distributors.length,
    active: distributors.filter(d => d.status === 'active').length,
    pending: distributors.filter(d => d.verification_status === 'pending').length,
    verified: distributors.filter(d => d.verification_status === 'verified').length,
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Distributors</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage and verify distributor registrations
            </p>
          </div>
          <AddDistributorDialog />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card className="border border-border/50">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl md:text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <Users className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/50">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl md:text-3xl font-bold mt-1 text-green-600">{stats.active}</p>
                </div>
                <TrendingUp className="h-8 w-8 md:h-10 md:w-10 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/50">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Verified</p>
                  <p className="text-2xl md:text-3xl font-bold mt-1 text-blue-600">{stats.verified}</p>
                </div>
                <FileCheck className="h-8 w-8 md:h-10 md:w-10 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/50">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl md:text-3xl font-bold mt-1 text-amber-600">{stats.pending}</p>
                </div>
                <Building2 className="h-8 w-8 md:h-10 md:w-10 text-amber-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block">
          <Card className="border border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b">
                      <TableHead className="px-4 py-3">Company</TableHead>
                      <TableHead className="px-4 py-3">Contact</TableHead>
                      <TableHead className="px-4 py-3">License</TableHead>
                      <TableHead className="px-4 py-3">Location</TableHead>
                      <TableHead className="px-4 py-3">Verification</TableHead>
                      <TableHead className="px-4 py-3">Status</TableHead>
                      <TableHead className="px-4 py-3">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distributors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No distributors found
                        </TableCell>
                      </TableRow>
                    ) : (
                      distributors.map((d: Distributor) => (
                        <TableRow key={d.id} className="border-b hover:bg-muted/50 transition-colors">
                          <TableCell className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <p className="text-sm font-medium">{d.company_name}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{d.full_name}</p>
                              <p className="text-xs text-muted-foreground">{d.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <code className="text-xs bg-muted px-2 py-1 rounded">{d.business_license_number}</code>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {d.city}, {d.state_province}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant={
                                d.verification_status === 'verified'
                                  ? 'default'
                                  : d.verification_status === 'rejected'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              className="text-xs"
                            >
                              {d.verification_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant={
                                d.status === 'active'
                                  ? 'default'
                                  : d.status === 'paused'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                              className="text-xs"
                            >
                              {d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {d.verification_status === 'pending' && (
                                <DistributorVerificationActions
                                  distributorId={d.id}
                                  userStatus={d.status}
                                />
                              )}
                              {d.verification_status !== 'pending' && (
                                <AdminUserActions userId={d.user_id} />
                              )}
                            </div>
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

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {distributors.length === 0 ? (
            <Card className="border border-border/50">
              <CardContent className="py-8 text-center text-muted-foreground">
                No distributors found
              </CardContent>
            </Card>
          ) : (
            distributors.map((d: Distributor) => (
              <Card key={d.id} className="border border-border/50">
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {/* Company Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">{d.company_name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{d.business_license_number}</p>
                      </div>
                      <Badge
                        variant={
                          d.verification_status === 'verified'
                            ? 'default'
                            : d.verification_status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {d.verification_status}
                      </Badge>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-1 text-xs">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Contact:</span> {d.full_name}
                      </p>
                      <p className="text-muted-foreground break-all">{d.email}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {d.city}, {d.state_province}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge
                          variant={
                            d.status === 'active'
                              ? 'default'
                              : d.status === 'paused'
                                ? 'secondary'
                                : 'destructive'
                          }
                          className="text-xs"
                        >
                          {d.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t space-y-2">
                      {d.verification_status === 'pending' && (
                        <DistributorVerificationActions
                          distributorId={d.id}
                          userStatus={d.status}
                        />
                      )}
                      {d.verification_status !== 'pending' && (
                        <AdminUserActions userId={d.user_id} />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
