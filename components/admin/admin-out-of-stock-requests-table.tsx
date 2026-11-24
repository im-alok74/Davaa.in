'use client'

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Search, ChevronLeft, ChevronRight, Zap, Clock, CheckCircle2, XCircle } from "lucide-react"

interface OutOfStockRequest {
  id: number
  pharmacy_id: number
  distributor_id: number
  medicine_id: number
  pharmacy_name: string
  customer_name?: string | null
  full_name?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  accept_substitute?: boolean
  contact_person: string
  phone: string
  distributor_name: string | null
  distributor_contact: string | null
  medicine_name: string
  generic_name: string
  requested_quantity: number
  mrp: string
  unit_price: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
  fulfilled_at: string | null
}

interface DetailedRequest extends OutOfStockRequest {
  pharmacy_email: string
  distributor_email: string | null
  batch_number: string | null
  expiry_date: string | null
  available_quantity: number | null
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  assigned: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  assigned: <Zap className="w-4 h-4" />,
  fulfilled: <CheckCircle2 className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  cancelled: <XCircle className="w-4 h-4" />,
}

export function AdminOutOfStockRequestsTable() {
  const [requests, setRequests] = useState<OutOfStockRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedRequest, setSelectedRequest] = useState<DetailedRequest | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [distributors, setDistributors] = useState<Array<{ id: number; name: string }>>([])
  const [selectedDistributor, setSelectedDistributor] = useState("")
  const [isAutoAssigning, setIsAutoAssigning] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const fetchRequests = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (searchQuery) params.set("search", searchQuery)
      params.set("page", currentPage.toString())
      params.set("pageSize", "15")

      const response = await fetch(`/api/admin/out-of-stock-requests?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })

      const data = await response.json()

      if (response.ok) {
        setRequests(data.data || [])
        setTotalPages(data.pagination?.totalPages || 1)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch requests",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching requests:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRequestDetails = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/out-of-stock-requests/${id}`, {
        credentials: "include",
      })

      const data = await response.json()

      if (response.ok) {
        setSelectedRequest(data)
        setShowDetailsDialog(true)
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch request details",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching details:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    }
  }

  const handleAutoAssign = async () => {
    if (!selectedRequest) return

    setIsAutoAssigning(true)
    try {
      const response = await fetch(
        `/api/admin/out-of-stock-requests/${selectedRequest.id}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ auto_assign: true }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Request assigned",
          description: "Distributor automatically assigned based on stock availability",
        })
        setSelectedRequest(data)
        fetchRequests()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to assign request",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error auto-assigning:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setIsAutoAssigning(false)
    }
  }

  const handleAssignDistributor = async () => {
    if (!selectedRequest || !selectedDistributor) return

    setIsUpdating(true)
    try {
      const response = await fetch(
        `/api/admin/out-of-stock-requests/${selectedRequest.id}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            distributor_id: parseInt(selectedDistributor),
            auto_assign: false,
          }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Request assigned",
          description: "Distributor assigned successfully",
        })
        setSelectedRequest(data)
        setShowAssignDialog(false)
        fetchRequests()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to assign",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error assigning:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedRequest) return

    setIsUpdating(true)
    try {
      const response = await fetch(
        `/api/admin/out-of-stock-requests/${selectedRequest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Status updated",
          description: `Request marked as ${newStatus}`,
        })
        setSelectedRequest(data)
        fetchRequests()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update status",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error updating status:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [statusFilter, searchQuery, currentPage])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <Label htmlFor="search">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  placeholder="Search pharmacy, medicine, or distributor..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="flex-1"
                />
                <Button variant="outline" size="icon">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="min-w-[200px]">
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={(val) => {
                setStatusFilter(val)
                setCurrentPage(1)
              }}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Out-of-Stock Requests ({requests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No requests found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pharmacy</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Distributor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.pharmacy_name || req.customer_name || req.contact_person || "Customer"}</TableCell>
                      <TableCell>{req.medicine_name}</TableCell>
                      <TableCell>{req.requested_quantity}</TableCell>
                      <TableCell>{req.distributor_name || "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[req.status]}>
                          <span className="flex items-center gap-1">
                            {statusIcons[req.status]}
                            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(req.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchRequestDetails(req.id)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Pharmacy Info */}
              {!selectedRequest.pharmacy_name && (
                <div className="pb-4 border-b">
                  <p className="text-sm font-medium text-muted-foreground">Delivery Address</p>
                  <p className="mt-2">{[
                    selectedRequest.address_line1,
                    selectedRequest.address_line2,
                    selectedRequest.city,
                    selectedRequest.state,
                    selectedRequest.pincode,
                  ].filter(Boolean).join(", ")}</p>
                  {selectedRequest.accept_substitute && (
                    <p className="mt-2 text-sm text-emerald-700">Customer accepts a suitable substitute.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{selectedRequest.pharmacy_name ? "Pharmacy" : "Customer"}</p>
                  <p className="font-medium">{selectedRequest.pharmacy_name || selectedRequest.customer_name || selectedRequest.full_name || selectedRequest.contact_person}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.contact_person}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.phone}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={statusColors[selectedRequest.status]}>
                    {selectedRequest.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Medicine Info */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Medicine</p>
                  <p className="font-medium">{selectedRequest.medicine_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.generic_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Requested Quantity</p>
                  <p className="font-medium text-lg">{selectedRequest.requested_quantity}</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">MRP</p>
                  <p className="font-medium">₹{selectedRequest.mrp}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unit Price</p>
                  <p className="font-medium">₹{selectedRequest.unit_price}</p>
                </div>
              </div>

              {/* Distributor Info */}
              <div className="pb-4 border-b">
                <p className="text-sm font-medium text-muted-foreground">Assigned Distributor</p>
                {selectedRequest.distributor_name ? (
                  <div className="mt-2">
                    <p className="font-medium">{selectedRequest.distributor_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.distributor_contact}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">No distributor assigned</p>
                )}
              </div>

              {/* Notes */}
              {selectedRequest.notes && (
                <div className="pb-4 border-b">
                  <p className="text-sm font-medium text-muted-foreground">Notes</p>
                  <p className="mt-2">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Timeline */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Created</p>
                  <p>{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
                {selectedRequest.fulfilled_at && (
                  <div>
                    <p className="font-medium text-muted-foreground">Fulfilled</p>
                    <p>{new Date(selectedRequest.fulfilled_at).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <DialogFooter className="flex gap-2 pt-4">
                {selectedRequest.status === "pending" && (
                  <>
                    <Button
                      variant="default"
                      onClick={handleAutoAssign}
                      disabled={isAutoAssigning}
                    >
                      {isAutoAssigning ? "Assigning..." : "Auto Assign Distributor"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowAssignDialog(true)}
                    >
                      Manual Assign
                    </Button>
                  </>
                )}

                {selectedRequest.status === "assigned" && (
                  <Button
                    variant="default"
                    onClick={() => handleStatusUpdate("fulfilled")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Marking..." : "Mark as Fulfilled"}
                  </Button>
                )}

                {["pending", "assigned"].includes(selectedRequest.status) && (
                  <Button
                    variant="destructive"
                    onClick={() => handleStatusUpdate("rejected")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Rejecting..." : "Reject"}
                  </Button>
                )}

                <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Distributor Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Distributor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="distributor">Select Distributor</Label>
              <Select value={selectedDistributor} onValueChange={setSelectedDistributor}>
                <SelectTrigger id="distributor">
                  <SelectValue placeholder="Choose a distributor..." />
                </SelectTrigger>
                <SelectContent>
                  {distributors.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignDistributor}
              disabled={isUpdating || !selectedDistributor}
            >
              {isUpdating ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
