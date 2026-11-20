'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  HeartPulse,
  MapPin,
  Minus,
  Package2,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { medicineImageOrArt, medicineImageSrc, safeImageSrc } from '@/lib/images'

type Medicine = {
  id: number
  name: string
  generic_name: string | null
  manufacturer: string | null
  category: string | null
  form: string | null
  strength: string | null
  pack_size: string | null
  description: string | null
  requires_prescription: boolean
  mrp: string
  image_url: string | null
  photo_url?: string | null
  status: string
  hsn_code?: string | null
  mfg_date?: string | null
  selling_price: string | null
  discount_percentage: string | null
  stock_quantity: number | null
  pharmacy_id: number | null
  pharmacy_name: string | null
  /** SEO slug — the canonical URL segment for this medicine. */
  slug?: string | null
  /**
   * Drug information, added by migration 024. Every one of these is optional and is
   * rendered only when populated: an empty accordion is worse than no accordion, and
   * inventing the content on a pharmacy is not an option.
   */
  salt_composition?: string | null
  uses?: string | null
  how_to_use?: string | null
  storage_info?: string | null
  side_effects?: string | null
  precautions?: string | null
}

/** A cheaper (or equivalent) medicine with the same salt composition. */
export type Substitute = {
  id: number
  name: string
  slug: string | null
  manufacturer: string | null
  strength: string | null
  pack_size: string | null
  image_url: string | null
  photo_url: string | null
  mrp: string
  selling_price: string | null
  discount_percentage: string | null
  requires_prescription: boolean
}

type Review = {
  id: number
  rating: number
  title: string | null
  review_text: string
  is_verified_purchase: boolean
  created_at: string
  full_name: string
  user_type: string
}

type ReviewStats = {
  total_reviews: number
  average_rating: string | number
  five_star: number
  four_star: number
  three_star: number
  two_star: number
  one_star: number
}

export type MedicinePdpProps = {
  medicine: Medicine
  /** Extra photos from `medicine_images`, shown after the primary image. */
  galleryImages?: string[]
  reviews: Review[]
  reviewStats: ReviewStats
  similarProducts: Medicine[]
  customersAlsoBought: Medicine[]
  recommendations: Medicine[]
}

function getMedicineImage(medicine: Medicine) {
  return medicineImageOrArt(medicine.form, medicine.photo_url, medicine.image_url)
}

function getFinalPrice(medicine: Medicine) {
  const mrp = Number.parseFloat(String(medicine.mrp || 0))
  const sellingPrice =
    medicine.selling_price !== undefined && medicine.selling_price !== null
      ? Number.parseFloat(String(medicine.selling_price || 0))
      : mrp
  const discountPercentage =
    medicine.discount_percentage !== undefined && medicine.discount_percentage !== null
      ? Number.parseFloat(String(medicine.discount_percentage || 0))
      : 0

  const hasDiscount = discountPercentage > 0 && sellingPrice > 0
  const finalPrice = hasDiscount ? sellingPrice - sellingPrice * (discountPercentage / 100) : sellingPrice

  return {
    mrp,
    sellingPrice,
    discountPercentage,
    finalPrice,
    hasDiscount,
  }
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn('h-4 w-4', index < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')}
        />
      ))}
    </div>
  )
}

function ProductCard({ medicine }: { medicine: Medicine }) {
  const pricing = getFinalPrice(medicine)

  return (
    <Link href={`/medicines/${medicine.id}`} className="group block rounded-2xl border border-border/60 bg-card p-3 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-linear-to-br from-muted to-muted/60">
        <Image
          src={getMedicineImage(medicine)}
          alt={medicine.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {medicine.requires_prescription && (
          <Badge className="absolute right-2 top-2 bg-accent/90 text-accent-foreground">Rx</Badge>
        )}
      </div>
      <div className="space-y-1">
        <p className="line-clamp-2 text-sm font-semibold leading-5">{medicine.name}</p>
        {medicine.generic_name && <p className="line-clamp-1 text-xs text-muted-foreground">{medicine.generic_name}</p>}
        <p className="line-clamp-1 text-xs text-muted-foreground">{medicine.manufacturer}</p>
        <div className="pt-1">
          {pricing.finalPrice > 0 ? (
            <p className="text-base font-bold text-primary">₹{pricing.finalPrice.toFixed(2)}</p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">Price not listed yet</p>
          )}
          {pricing.hasDiscount && (
            <p className="text-xs text-muted-foreground">
              MRP <span className="line-through">₹{pricing.mrp.toFixed(2)}</span> · {pricing.discountPercentage.toFixed(0)}% off
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

export function MedicinePdp({
  medicine,
  galleryImages = [],
  reviews,
  reviewStats,
  similarProducts,
  customersAlsoBought,
  recommendations,
}: MedicinePdpProps) {
  const router = useRouter()
  const { toast } = useToast()
  const pricing = getFinalPrice(medicine)
  const stockAvailable = Number(medicine.stock_quantity || 0) > 0
  const primaryImage = getMedicineImage(medicine)
  const gallery = Array.from(
    new Set(
      [medicine.photo_url, medicine.image_url, ...galleryImages, primaryImage]
        .map((candidate) => safeImageSrc(candidate))
        .filter((candidate): candidate is string => candidate !== null),
    ),
  )
  const [activeImage, setActiveImage] = useState(primaryImage)
  const [quantity, setQuantity] = useState(1)
  const [pincode, setPincode] = useState('')
  const [deliveryMessage, setDeliveryMessage] = useState<string>('Enter your pincode to check delivery.')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [rating, setRating] = useState('5')
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  const ratingBreakdown = useMemo(() => {
    const total = Math.max(reviewStats.total_reviews || 0, 1)
    return [
      { stars: 5, count: reviewStats.five_star || 0 },
      { stars: 4, count: reviewStats.four_star || 0 },
      { stars: 3, count: reviewStats.three_star || 0 },
      { stars: 2, count: reviewStats.two_star || 0 },
      { stars: 1, count: reviewStats.one_star || 0 },
    ].map((item) => ({ ...item, width: `${(item.count / total) * 100}%` }))
  }, [reviewStats])

  const estimatedDefaultDate = format(addDays(new Date(), stockAvailable ? 3 : 6), 'EEE, dd MMM')

  const handlePincodeCheck = () => {
    const cleanPincode = pincode.trim()
    if (!/^\d{6}$/.test(cleanPincode)) {
      setDeliveryMessage('Please enter a valid 6-digit pincode.')
      setDeliveryDate('')
      return
    }

    const offset = cleanPincode
      .split('')
      .reduce((sum, digit) => sum + Number(digit), 0) % 3
    const etaDays = stockAvailable ? 2 + offset : 5 + offset

    setDeliveryMessage(stockAvailable ? 'Delivery available for this pincode.' : 'Currently out of stock, but delivery will be scheduled when available.')
    setDeliveryDate(format(addDays(new Date(), etaDays), 'EEE, dd MMM'))
  }

  const handleAddToCart = async () => {
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicineId: medicine.id, quantity }),
      })

      if (response.ok) {
        toast({ title: 'Added to cart', description: `${medicine.name} added successfully.` })
        router.refresh()
        return
      }

      if (response.status === 401) {
        toast({
          title: 'Sign in required',
          description: 'Please sign in to add items to your cart.',
          variant: 'destructive',
        })
        router.push('/signin')
        return
      }

      const data = await response.json().catch(() => ({}))
      toast({
        title: 'Unable to add to cart',
        description: data.error || 'Please try again.',
        variant: 'destructive',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Something went wrong while adding to cart.',
        variant: 'destructive',
      })
    }
  }

  const handleBuyNow = async () => {
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicineId: medicine.id, quantity }),
      })

      if (response.ok) {
        router.push('/checkout')
        return
      }

      if (response.status === 401) {
        toast({
          title: 'Sign in required',
          description: 'Please sign in to continue checkout.',
          variant: 'destructive',
        })
        router.push('/signin')
        return
      }

      const data = await response.json().catch(() => ({}))
      toast({
        title: 'Unable to start checkout',
        description: data.error || 'Please try again.',
        variant: 'destructive',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Something went wrong while starting checkout.',
        variant: 'destructive',
      })
    }
  }

  const handleReviewSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmittingReview(true)

    try {
      const response = await fetch(`/api/medicines/${medicine.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(rating),
          title: reviewTitle,
          reviewText,
        }),
      })

      if (response.ok) {
        toast({ title: 'Review submitted', description: 'Your feedback has been saved.' })
        setReviewTitle('')
        setReviewText('')
        setRating('5')
        router.refresh()
        return
      }

      const data = await response.json().catch(() => ({}))
      if (response.status === 401) {
        router.push('/signin')
        return
      }

      toast({
        title: 'Unable to submit review',
        description: data.error || 'Please try again.',
        variant: 'destructive',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Something went wrong while submitting your review.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/20">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link href="/medicines">
                <ArrowLeft className="h-4 w-4" />
                Back to medicines
              </Link>
            </Button>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <p className="text-sm text-muted-foreground">{medicine.category || 'Medicine detail page'}</p>
          </div>
        </div>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-4">
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
                <Card className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid gap-4 lg:grid-cols-[96px_1fr] lg:gap-6">
                      <div className="order-2 flex gap-3 overflow-x-auto pb-1 lg:order-1 lg:flex-col lg:overflow-visible lg:pb-0">
                        {gallery.map((image, index) => (
                          <button
                            key={`${image}-${index}`}
                            type="button"
                            onClick={() => setActiveImage(image)}
                            className={cn(
                              'relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border transition-all duration-200',
                              activeImage === image ? 'border-primary ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40',
                            )}
                          >
                            <Image src={image} alt={`${medicine.name} thumbnail ${index + 1}`} fill className="object-cover" />
                          </button>
                        ))}
                      </div>

                      <div className="order-1 space-y-4 lg:order-2">
                        <div className="relative aspect-square overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br from-muted to-muted/50 shadow-inner">
                          <Image
                            src={activeImage}
                            alt={medicine.name}
                            fill
                            priority
                            className="object-contain p-6 transition-transform duration-500 hover:scale-110"
                          />
                          {medicine.requires_prescription && (
                            <Badge className="absolute left-4 top-4 bg-accent/95 text-accent-foreground shadow-sm backdrop-blur-sm">Rx required</Badge>
                          )}
                          {pricing.hasDiscount && (
                            <Badge className="absolute right-4 top-4 bg-emerald-600 text-white shadow-sm">
                              {pricing.discountPercentage.toFixed(0)}% OFF
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-border/60 bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Truck className="h-4 w-4" />
                              Delivery
                            </div>
                            <p className="mt-2 text-sm font-medium">{deliveryDate || estimatedDefaultDate}</p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ShieldCheck className="h-4 w-4" />
                              Availability
                            </div>
                            <p className={cn('mt-2 text-sm font-medium', stockAvailable ? 'text-emerald-600' : 'text-destructive')}>
                              {stockAvailable ? 'In stock' : 'Out of stock'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Package2 className="h-4 w-4" />
                              Seller
                            </div>
                            <p className="mt-2 text-sm font-medium">{medicine.pharmacy_name || 'Verified pharmacy network'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
                <Card className="border-border/60 bg-card/95 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl sm:text-2xl">{medicine.name}</CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {medicine.generic_name && <span>{medicine.generic_name}</span>}
                        {medicine.manufacturer && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span>{medicine.manufacturer}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="secondary">{medicine.category || 'General'}</Badge>
                        <Badge variant="outline">{medicine.form || 'Medicine'}</Badge>
                        {medicine.requires_prescription && <Badge variant="outline">Prescription required</Badge>}
                      </div>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <div>
                      <div className="flex items-end gap-3">
                        {pricing.finalPrice > 0 ? (
                          <p className="text-3xl font-bold text-primary">₹{pricing.finalPrice.toFixed(2)}</p>
                        ) : (
                          // MRP is stored as 0 when it has not been entered. Showing ₹0.00
                          // would read as a free medicine, so say what is actually true.
                          <p className="text-xl font-semibold text-muted-foreground">Price not listed yet</p>
                        )}
                        {pricing.hasDiscount && (
                          <div className="pb-1 text-sm text-muted-foreground">
                            <span className="line-through">₹{pricing.mrp.toFixed(2)}</span>
                            <span className="ml-2 text-emerald-600">Save {pricing.discountPercentage.toFixed(0)}%</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <StarDisplay rating={Math.max(1, Math.round(Number(reviewStats.average_rating || 0)) || 0)} />
                        <span>
                          {reviewStats.average_rating || '0.0'} ({reviewStats.total_reviews || 0} reviews)
                        </span>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
                        {medicine.strength && (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            Strength: {medicine.strength}
                          </Badge>
                        )}
                        {medicine.pack_size && (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            Pack: {medicine.pack_size}
                          </Badge>
                        )}
                        {medicine.hsn_code && (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            HSN: {medicine.hsn_code}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick details</h3>
                        <ul className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Genuine product</li>
                          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Verified pharmacy stock</li>
                          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Secure checkout</li>
                          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Fast delivery support</li>
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Quantity</p>
                          <p className="text-sm font-medium">Adjust before purchase</p>
                        </div>
                        <div className="flex items-center rounded-xl border border-border/60">
                          <Button variant="ghost" size="icon-sm" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={quantity}
                            onChange={(event) => setQuantity(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
                            className="h-8 w-14 border-0 text-center text-sm shadow-none focus-visible:ring-0"
                          />
                          <Button variant="ghost" size="icon-sm" onClick={() => setQuantity((current) => Math.min(10, current + 1))}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <Button className="flex-1 gap-2" onClick={handleAddToCart} disabled={!stockAvailable}>
                          <ShoppingCart className="h-4 w-4" />
                          Add to Cart
                        </Button>
                        <Button className="flex-1 gap-2" variant="secondary" onClick={handleBuyNow} disabled={!stockAvailable}>
                          <ShoppingBag className="h-4 w-4" />
                          Buy Now
                        </Button>
                      </div>

                      <div className="mt-5 rounded-2xl border border-dashed border-border/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <MapPin className="h-4 w-4 text-primary" />
                          Check delivery
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Input
                            placeholder="Enter 6-digit pincode"
                            value={pincode}
                            onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                          />
                          <Button type="button" onClick={handlePincodeCheck} variant="outline">
                            Check
                          </Button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{deliveryMessage}</p>
                        {deliveryDate && (
                          <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
                            <Clock3 className="h-4 w-4 text-primary" /> Estimated delivery: {deliveryDate}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </section>

            <aside className="space-y-4">
              <Card className="border-border/60 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Ratings summary</CardTitle>
                  <CardDescription>Snapshot from customer reviews</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold text-primary">{reviewStats.average_rating || '0.0'}</div>
                    <div>
                      <StarDisplay rating={Math.round(Number(reviewStats.average_rating || 0))} />
                      <p className="mt-1 text-sm text-muted-foreground">{reviewStats.total_reviews || 0} ratings</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ratingBreakdown.map((item) => (
                      <div key={item.stars} className="flex items-center gap-2 text-sm">
                        <span className="w-8 text-muted-foreground">{item.stars}★</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: item.width }} />
                        </div>
                        <span className="w-8 text-right text-muted-foreground">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Support highlights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <HeartPulse className="mt-0.5 h-4 w-4 text-primary" />
                    Genuine medicine from verified pharmacies and distributors.
                  </div>
                  <div className="flex items-start gap-3">
                    <Truck className="mt-0.5 h-4 w-4 text-primary" />
                    Quick delivery visibility with pincode-based ETA.
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                    Safe checkout and prescription-aware purchase flow.
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-border/60 bg-card/95 shadow-sm xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Product information</CardTitle>
                <CardDescription>Everything you need before buying</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="specs">Specifications</TabsTrigger>
                    <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-4">
                    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                      <p>{medicine.description || 'Detailed product description is not available for this item.'}</p>
                      <p>
                        This product is {medicine.requires_prescription ? 'prescription required' : 'available without prescription'} and is listed from a verified seller network.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="specs" className="mt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SpecRow label="Brand" value={medicine.manufacturer || 'N/A'} />
                      <SpecRow label="Category" value={medicine.category || 'N/A'} />
                      <SpecRow label="Form" value={medicine.form || 'N/A'} />
                      <SpecRow label="Strength" value={medicine.strength || 'N/A'} />
                      <SpecRow label="Pack size" value={medicine.pack_size || 'N/A'} />
                      <SpecRow label="HSN code" value={medicine.hsn_code || 'N/A'} />
                      <SpecRow label="Availability" value={stockAvailable ? 'In stock' : 'Out of stock'} />
                      <SpecRow label="Seller" value={medicine.pharmacy_name || 'Verified pharmacy'} />
                    </div>
                  </TabsContent>

                  <TabsContent value="reviews" className="mt-4 space-y-6">
                    <form onSubmit={handleReviewSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                        <label className="space-y-2 text-sm">
                          <span className="font-medium">Rating</span>
                          <select
                            value={rating}
                            onChange={(event) => setRating(event.target.value)}
                            className="h-10 w-full rounded-md border border-border bg-background px-3"
                          >
                            {[5, 4, 3, 2, 1].map((value) => (
                              <option key={value} value={value}>{value} Star{value > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm">
                          <span className="font-medium">Title</span>
                          <Input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} placeholder="Optional review title" />
                        </label>
                      </div>
                      <label className="space-y-2 text-sm block">
                        <span className="font-medium">Your review</span>
                        <Textarea
                          value={reviewText}
                          onChange={(event) => setReviewText(event.target.value)}
                          placeholder="Share your experience with this medicine"
                          className="min-h-28"
                        />
                      </label>
                      <Button type="submit" disabled={isSubmittingReview}>
                        {isSubmittingReview ? 'Submitting...' : 'Submit review'}
                      </Button>
                    </form>

                    <div className="space-y-4">
                      {reviews.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                          No reviews yet. Be the first to share feedback.
                        </div>
                      ) : (
                        reviews.map((review) => (
                          <div key={review.id} className="rounded-2xl border border-border/60 bg-background p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{review.full_name}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(review.created_at), 'dd MMM yyyy')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StarDisplay rating={review.rating} />
                                {review.is_verified_purchase && <Badge variant="outline">Verified purchase</Badge>}
                              </div>
                            </div>
                            {review.title && <p className="mt-3 font-medium">{review.title}</p>}
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.review_text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="space-y-4 xl:col-span-1">
              <SectionBlock title="Similar Products" description="Same category, close alternatives." items={similarProducts} />
              <SectionBlock title="Customers Also Bought" description="Popular companion purchases." items={customersAlsoBought} />
              <SectionBlock title="You May Also Like" description="More products from this network." items={recommendations} />
            </div>
          </div>
        </main>
      </motion.div>
    </div>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function SectionBlock({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: Medicine[]
}) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products available right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
            {items.map((medicine) => (
              <ProductCard key={medicine.id} medicine={medicine} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
