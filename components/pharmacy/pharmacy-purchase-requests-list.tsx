"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PurchaseRequest {
  id: number
  status: string
  total_amount: string
  item_count: number
  items_total?: string
  created_at: string
  expires_at: string | null
  published_to_store_at?: string | null
  distributor_name?: string | null
  invoice_number?: string | null
  invoice_payment_status?: string | null
  items?: Array<{
    id: number
    medicine_id: number
    medicine_name: string
    batch_number: string | null
    expiry_date: string | null
    quantity: number
    price: string
    line_total: string
  }>
}

export function PharmacyPurchaseRequestsList() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishingRequestId, setPublishingRequestId] = useState<number | null>(null)
  const [pricingMode, setPricingMode] = useState<"mrp" | "mrp_discount" | "custom">("mrp")
  const [discountPercentage, setDiscountPercentage] = useState("5")
  const [customSellingPrice, setCustomSellingPrice] = useState("")
  const [isPublishing, setIsPublishing] = useState(false)
  const { toast } = useToast()

  const fetchRequests = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/procurement/purchase-requests", {
        credentials: "include",
        cache: "no-store",
      })
      const data = await res.json()
      if (res.ok) {
        setRequests(data.requests || [])
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to load purchase requests",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading purchase requests:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "PAID":
        return "default"
      case "APPROVED":
        return "outline"
      case "PENDING":
        return "secondary"
      case "REJECTED":
      case "EXPIRED":
        return "destructive"
      default:
        return "outline"
    }
  }

  const filtered = requests.filter((r) => (filter === "all" ? true : r.status === filter))

  if (isLoading) {
    return <div className="text-center text-muted-foreground">Loading purchase requests...</div>
  }

  return (
    <Tabs value={filter} onValueChange={setFilter}>
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="PENDING">Pending</TabsTrigger>
        <TabsTrigger value="APPROVED">Approved</TabsTrigger>
        <TabsTrigger value="PAID">Paid</TabsTrigger>
      </TabsList>

      <TabsContent value={filter} className="mt-6">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No purchase requests yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((req) => (
              <Card key={req.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Request #{req.id}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Created on {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    {req.expires_at && req.status === "PENDING" && (
                      <p className="text-xs text-amber-600 mt-1">
                        Lock expires at {new Date(req.expires_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant={getStatusBadgeVariant(req.status)}>{req.status}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-muted-foreground">Distributor</p>
                      <p className="font-semibold text-foreground">{req.distributor_name || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Items</p>
                      <p className="font-semibold text-foreground">{req.item_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Amount</p>
                      <p className="font-semibold text-foreground">
                        ₹{Number.parseFloat(req.total_amount || "0").toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Purchase Details</p>
                      {req.invoice_number ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Invoice: {req.invoice_number}</Badge>
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={`/api/purchase-requests/${req.id}/invoice`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open Invoice
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={`/api/purchase-requests/${req.id}/invoice`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.preventDefault()
                                const w = window.open(`/api/purchase-requests/${req.id}/invoice`, "_blank")
                                if (w) {
                                  w.addEventListener("load", () => w.print(), { once: true })
                                }
                              }}
                            >
                              Print Invoice
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Invoice will be available after approval.</p>
                      )}
                    </div>

                    {!req.items || req.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No item details available.</p>
                    ) : (
                      <div className="space-y-2">
                        {req.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded border p-2 text-xs">
                            <div>
                              <p className="font-medium text-foreground">{item.medicine_name}</p>
                              <p className="text-muted-foreground">
                                Batch: {item.batch_number || "N/A"} | Exp: {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-muted-foreground">Qty: {item.quantity}</p>
                              <p className="text-muted-foreground">Unit: ₹{Number(item.price || 0).toFixed(2)}</p>
                              <p className="font-semibold text-foreground">₹{Number(item.line_total || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {req.status === "PAID" && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {req.published_to_store_at
                          ? `Published to store on ${new Date(req.published_to_store_at).toLocaleString()}`
                          : "Payment received. Publish this stock to your store for customers."}
                      </p>
                      {!req.published_to_store_at && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setPublishingRequestId(req.id)
                            setPricingMode("mrp")
                            setDiscountPercentage("5")
                            setCustomSellingPrice("")
                            setPublishOpen(true)
                          }}
                        >
                          Publish to Store
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish pricing</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Retail pricing mode</Label>
              <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mrp">Publish at MRP</SelectItem>
                  <SelectItem value="mrp_discount">Publish at MRP with discount</SelectItem>
                  <SelectItem value="custom">Custom selling price</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {pricingMode === "mrp_discount" && (
              <div className="space-y-2">
                <Label>Discount % (applies to all items)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(e.target.value)}
                  placeholder="e.g., 5"
                />
              </div>
            )}

            {pricingMode === "custom" && (
              <div className="space-y-2">
                <Label>Custom selling price (₹, applies to all items)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customSellingPrice}
                  onChange={(e) => setCustomSellingPrice(e.target.value)}
                  placeholder="e.g., 99"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Pharmacies buy at wholesale. Customers will see your MRP/discount pricing after publishing.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isPublishing || (pricingMode === "custom" && !customSellingPrice)}
              onClick={async () => {
                if (!publishingRequestId) return
                setIsPublishing(true)
                try {
                  const res = await fetch(
                    `/api/pharmacy/purchase-requests/${publishingRequestId}/publish`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        pricingMode,
                        discountPercentage: Number(discountPercentage || 0),
                        ...(pricingMode === "custom"
                          ? { customSellingPrice: Number(customSellingPrice) }
                          : {}),
                      }),
                    }
                  )
                  const data = await res.json()
                  if (res.ok) {
                    toast({
                      title: "Published",
                      description: "Stock has been added to your store inventory.",
                    })
                    setPublishOpen(false)
                    setPublishingRequestId(null)
                    fetchRequests()
                  } else {
                    toast({
                      title: "Error",
                      description: data.error || "Failed to publish",
                      variant: "destructive",
                    })
                  }
                } catch {
                  toast({
                    title: "Error",
                    description: "Something went wrong",
                    variant: "destructive",
                  })
                } finally {
                  setIsPublishing(false)
                }
              }}
            >
              {isPublishing ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
