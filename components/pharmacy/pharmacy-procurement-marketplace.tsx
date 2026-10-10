"use client"
import { ProcurementProductCard } from "./procurement-product-card"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Search, ShoppingCart, AlertCircle, Loader2 } from "lucide-react"

type NumericLike = number | string

interface DistributorItem {
  id: number
  distributor_id: number
  distributor_name: string
  medicine_id: number
  name: string
  generic_name: string
  manufacturer: string
  category: string
  form: string
  strength: string
  pack_size: string
  batch_number: string
  expiry_date: string
  mrp: NumericLike
  unit_price: NumericLike
  quantity: NumericLike
  reserved_quantity: NumericLike
  available_quantity: NumericLike
  stock_status: "in_stock" | "out_of_stock"
  images?: string[]
  image_url?: string
}

interface CartItem {
  distributorMedicineId: number
  quantity: number
  item: DistributorItem
}

export function PharmacyProcurementMarketplace() {
  const [items, setItems] = useState<DistributorItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [showOutOfStock, setShowOutOfStock] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [requestingItem, setRequestingItem] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const { toast } = useToast()

    const fetchInventory = async (includeOutOfStock = false, pageNum = 1) => {
    const isFirstPage = pageNum === 1
    if (isFirstPage) setIsLoading(true)
    else setIsLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set("q", query)
      if (category) params.set("category", category)
      if (includeOutOfStock) params.set("includeOutOfStock", "true")
      params.set("page", String(pageNum))

      const res = await fetch(`/api/procurement/inventory?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      })
      const data = await res.json()
      if (res.ok) {
        const normalized: DistributorItem[] = (data.items || []).map((it: any) => ({
          ...it,
          mrp: Number(it.mrp || 0),
          unit_price: Number(it.unit_price || 0),
          quantity: Number(it.quantity || 0),
          reserved_quantity: Number(it.reserved_quantity || 0),
          available_quantity: Number(it.available_quantity || 0),
        }))
        setItems((prev) => (isFirstPage ? normalized : [...prev, ...normalized]))
        setPage(pageNum)
        setHasMore(Boolean(data.hasMore))
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to load distributor inventory",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching procurement inventory:", error)
      toast({
        title: "Error",
        description: "Something went wrong while loading inventory",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchInventory(showOutOfStock)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOutOfStock])

  const handleRequestOutOfStock = async (item: DistributorItem) => {
    setRequestingItem(item.id)
    try {
      const res = await fetch("/api/procurement/out-of-stock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributorMedicineId: item.id,
          distributorId: item.distributor_id,
          medicineId: item.medicine_id,
          requestedQuantity: 1,
          notes: "",
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast({
          title: "Success",
          description: "Request sent to distributor. They will notify you when stock arrives.",
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create request",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating request:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setRequestingItem(null)
    }
  }

  const addToCart = (item: DistributorItem) => {
    setCart((prev) => {
      // Enforce single-distributor cart per request
      if (prev.length > 0) {
        const currentDistributorId = prev[0].item.distributor_id
        if (currentDistributorId !== item.distributor_id) {
          toast({
            title: "One distributor per request",
            description:
              "Please submit the current cart first, or clear it to add items from another distributor.",
            variant: "destructive",
          })
          return prev
        }
      }

      const existing = prev.find((c) => c.distributorMedicineId === item.id)
      if (existing) {
        const nextQty = existing.quantity + 1
        if (item.stock_status === "in_stock" && nextQty > Number(item.available_quantity)) {
          toast({
            title: "Insufficient stock",
            description: "Quantity exceeds available stock from this distributor.",
            variant: "destructive",
          })
          return prev
        }
        return prev.map((c) =>
          c.distributorMedicineId === item.id ? { ...c, quantity: nextQty } : c
        )
      }
      return [...prev, { distributorMedicineId: item.id, quantity: 1, item }]
    })
  }

  const updateCartQuantity = (id: number, quantity: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.distributorMedicineId === id ? { ...c, quantity: Math.max(1, quantity) } : c
        )
        .filter((c) => c.quantity > 0)
    )
  }

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((c) => c.distributorMedicineId !== id))
  }

  const submitPurchaseRequest = async () => {
    if (cart.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Add at least one in-stock item before creating a purchase request.",
        variant: "destructive",
      })
      return
    }

    try {
      const res = await fetch("/api/procurement/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            distributorMedicineId: c.distributorMedicineId,
            quantity: c.quantity,
          })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({
          title: "Purchase request submitted",
          description: "Your in-stock items were sent for procurement.",
        })
        setCart([])
        fetchInventory(showOutOfStock)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create purchase request",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating purchase request:", error)
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      })
    }
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.quantity * Number(c.item.unit_price || 0),
    0
  )

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Distributor Marketplace</CardTitle>
            <Button
              size="sm"
              variant={showOutOfStock ? "default" : "outline"}
              onClick={() => setShowOutOfStock(!showOutOfStock)}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              {showOutOfStock ? "Hide Out of Stock" : "Show Out of Stock"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search medicines or manufacturers..."
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    fetchInventory(showOutOfStock)
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Loading inventory...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No distributor stock available right now.
            </div>
          ) : (
           <>
  <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
    {items.map((item) => (
      <ProcurementProductCard
        key={item.id}
        item={item}
        requesting={requestingItem === item.id}
        onAdd={() => addToCart(item)}
        onRequest={() => handleRequestOutOfStock(item)}
      />
    ))}
  </div>
  {hasMore && (
    <div className="flex justify-center pb-6">
      <Button
        variant="outline"
        onClick={() => fetchInventory(showOutOfStock, page + 1)}
        disabled={isLoadingMore}
      >
        {isLoadingMore ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          "Load more"
        )}
      </Button>
    </div>
  )}
</>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Procurement Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add items from the marketplace to build a purchase request.
            </p>
          ) : (
            <>
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {cart.map((entry) => (
                  <div
                    key={entry.distributorMedicineId}
                    className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0"
                  >
                    <div className="flex-1 mr-2">
                      <div className="font-medium">{entry.item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.item.distributor_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-16 h-8 text-xs"
                        min={1}
                        max={Number(entry.item.available_quantity)}
                        value={entry.quantity}
                        onChange={(e) =>
                          updateCartQuantity(
                            entry.distributorMedicineId,
                            Number(e.target.value || 1),
                          )
                        }
                      />
                      <div className="text-xs">
                        ₹{(entry.quantity * Number(entry.item.unit_price)).toFixed(2)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeFromCart(entry.distributorMedicineId)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Items: <span className="font-semibold text-foreground">{cart.length}</span>
                </div>
                <div className="text-sm font-semibold text-foreground">
                  Total: ₹{cartTotal.toFixed(2)}
                </div>
              </div>
              <Button className="w-full" onClick={submitPurchaseRequest}>
                Submit Purchase Request
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

