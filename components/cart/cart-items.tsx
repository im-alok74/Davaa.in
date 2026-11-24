"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Minus, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { medicineImageSrc } from "@/lib/images"

interface CartItem {
  id: number
  quantity: number
  medicine_id: number
  name: string
  mrp: string
  image_url: string | null
  requires_prescription: boolean
  selling_price: string | number | null
  discount_percentage: string | number | null
}

export function CartItems() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    fetchCart()
  }, [])

  const fetchCart = async () => {
    try {
      const response = await fetch("/api/cart")
      const data = await response.json()

      if (response.ok) {
        setCartItems(data.cartItems)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load cart",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const removeItem = async (itemId: number) => {
    try {
      const response = await fetch(`/api/cart?id=${itemId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setCartItems((prev) => prev.filter((item) => item.id !== itemId))
        toast({
          title: "Success",
          description: "Item removed from cart",
        })
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove item",
        variant: "destructive",
      })
    }
  }

  const updateQuantity = async (itemId: number, newQty: number) => {
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItemId: itemId, quantity: newQty }),
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        setCartItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, quantity: newQty } : it)))
        return
      }

      toast({ title: "Unable to update quantity", description: data.error || "Please try again.", variant: "destructive" })
    } catch {
      toast({ title: "Error", description: "Failed to update quantity", variant: "destructive" })
    }
  }

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => {
      const sellingPrice = Number(item.selling_price ?? item.mrp ?? 0)
      const discount = Number(item.discount_percentage ?? 0)
      return total + (sellingPrice - sellingPrice * discount / 100) * item.quantity
    }, 0)
  }

  const subtotal = calculateTotal()
  const deliveryFee = subtotal >= 500 ? 0 : 40
  const total = subtotal + deliveryFee

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <Card key={item} className="border-border/60">
              <CardContent className="flex gap-4 p-4">
                <div className="h-20 w-20 animate-pulse rounded-2xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-border/60">
          <CardContent className="space-y-3 p-6">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-border/60 bg-card/95">
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Your cart feels light today</h2>
              <p className="mt-2 text-sm text-muted-foreground">Add a few essentials and continue your trusted medicine journey.</p>
            </div>
            <Button onClick={() => router.push("/medicines")} className="gap-2">
              Browse medicines
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-border/60 bg-background/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Your selected medicines</p>
              <p className="text-sm text-muted-foreground">Secure checkout for every order.</p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {cartItems.length} item{cartItems.length > 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {cartItems.map((item) => (
            <motion.div key={item.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <Card className="border-border/60 bg-card/95 shadow-sm">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted">
                    <Image
                      src={medicineImageSrc(item.image_url)}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            ₹{(
                              Number(item.selling_price ?? item.mrp ?? 0) *
                              (1 - Number(item.discount_percentage ?? 0) / 100)
                            ).toFixed(2)} each
                          </span>
                          {item.requires_prescription && <Badge variant="outline">Prescription aware</Badge>}
                        </div>
                      </div>
                      <p className="text-lg font-semibold text-primary">
                        ₹{(
                          Number(item.selling_price ?? item.mrp ?? 0) *
                          (1 - Number(item.discount_percentage ?? 0) / 100) *
                          item.quantity
                        ).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center rounded-xl border border-border/60 bg-background/80">
                        <Button variant="ghost" size="icon" onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => {
                            const nextValue = Math.max(1, Number(event.target.value) || 1)
                            updateQuantity(item.id, nextValue)
                          }}
                          className="h-8 w-14 border-0 bg-transparent text-center text-sm shadow-none focus-visible:ring-0"
                        />
                        <Button variant="ghost" size="icon" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => removeItem(item.id)}>
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="lg:col-span-1">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div>
              <p className="text-sm font-semibold text-foreground">Order summary</p>
              <p className="mt-1 text-sm text-muted-foreground">Fast, secure, and transparent from cart to delivery.</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Safe checkout protected
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Prescription-aware ordering and trusted pharmacy partners.</p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium text-foreground">{deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <span className="font-semibold text-foreground">Total</span>
                <span className="text-lg font-bold text-primary">₹{total.toFixed(2)}</span>
              </div>
            </div>

            <Button className="w-full gap-2" size="lg" onClick={() => router.push("/checkout")}>
              Proceed to checkout
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
