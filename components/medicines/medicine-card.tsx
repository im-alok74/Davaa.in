import Image from "next/image"
import Link from "next/link"
import { Star } from "lucide-react"

import { AddToCartButton } from "./add-to-cart-button"
import { WishlistButton } from "./wishlist-button"
import { formatINR } from "@/lib/pricing"
import { medicineImageOrArt } from "@/lib/images"

export interface MedicineCardData {
  id: number
  name: string
  slug?: string | null
  generic_name: string | null
  manufacturer: string | null
  category: string | null
  form?: string | null
  strength?: string | null
  pack_size: string | null
  requires_prescription: boolean
  mrp: string | number
  image_url?: string | null
  photo_url?: string | null
  images?: string[]
  status?: string
  selling_price?: string | number | null
  discount_percentage?: string | number | null
  pharmacy_name?: string | null
  stock_quantity?: number | null
  /** Real aggregate from medicine_reviews. Absent means "no reviews yet". */
  average_rating?: string | number | null
  review_count?: number | null
}

function resolveImage(medicine: MedicineCardData): string {
  // Validated rather than merely defaulted: an absolute URL on a host next/image is not
  // configured for throws during render and takes the whole page down with it.
  return medicineImageOrArt(medicine.form, medicine.images?.[0], medicine.photo_url, medicine.image_url)
}

/**
 * Product tile used on the homepage, catalog and related-product rails.
 *
 * Server component — it holds no state, so it ships no JavaScript. Only the two
 * genuinely interactive bits (add-to-cart, wishlist) are client components.
 *
 * Note on ratings: this card previously displayed a star rating derived from
 * `medicine.id` (`4.2 + (id % 5) * 0.2`). That is invented data on a pharmacy product,
 * so it is gone. Stars now render only when real review rows exist.
 */
export function MedicineCard({ medicine }: { medicine: MedicineCardData }) {
  const href = `/medicines/${medicine.slug || medicine.id}`

  const mrp = Number(medicine.mrp ?? 0)
  const listPrice = medicine.selling_price != null ? Number(medicine.selling_price) : mrp
  const discountPct = Number(medicine.discount_percentage ?? 0)
  const finalPrice = discountPct > 0 ? listPrice - listPrice * (discountPct / 100) : listPrice
  const savings = mrp > finalPrice ? mrp - finalPrice : 0

  const reviewCount = Number(medicine.review_count ?? 0)
  const rating = medicine.average_rating != null ? Number(medicine.average_rating) : null
  const hasRating = reviewCount > 0 && rating != null && rating > 0

  const inStock = medicine.stock_quantity == null || Number(medicine.stock_quantity) > 0
  const lowStock = medicine.stock_quantity != null && Number(medicine.stock_quantity) > 0 && Number(medicine.stock_quantity) <= 5

  /**
   * A pack size of "12" with no unit renders as a bare "12" under the product name, which
   * reads as a rendering fault rather than as information (KENPORE showed exactly this).
   * The column is free text, so some rows carry "Strip of 15 Tablets" and others just a
   * number. Guessing the missing unit would be inventing pack data on a pharmacy listing,
   * so an unqualified number is dropped instead — the real pack size is on the product
   * page, and showing nothing beats showing something meaningless.
   */
  const packSize = medicine.pack_size && /\d/.test(medicine.pack_size) && !/[a-z]/i.test(medicine.pack_size)
    ? null
    : medicine.pack_size

  const subtitle = [medicine.strength, packSize].filter(Boolean).join(" · ")

  // `relative` on the <article> is load-bearing, not decoration: the title below is a
  // stretched link (`after:absolute after:inset-0`). Without a positioned ancestor that
  // overlay resolves against the initial containing block and covers the whole viewport —
  // every card then swallows clicks meant for the hero search and pincode fields.
  return (
    <article className="surface surface-hover group relative flex h-full flex-col overflow-hidden">
      <div className="relative">
        <Link href={href} className="block" tabIndex={-1} aria-hidden>
          <div className="relative aspect-square overflow-hidden bg-muted/50">
            <Image
              src={resolveImage(medicine)}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </div>
        </Link>

        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {discountPct > 0 ? (
            <span className="rounded bg-[color:var(--success)] px-2 py-0.5 text-xs font-bold text-[color:var(--success-foreground)]">
              {Math.round(discountPct)}% off
            </span>
          ) : null}
          {medicine.requires_prescription ? (
            <span className="rounded border border-border bg-background/90 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              Rx required
            </span>
          ) : null}
        </div>

        <div className="absolute right-2 top-2">
          <WishlistButton medicineId={medicine.id} medicineName={medicine.name} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-base font-bold leading-snug text-foreground">
          {/* The whole card is reachable through this link; stretched-link keeps a
              single tab stop per tile instead of one per element. */}
          <Link href={href} className="after:absolute after:inset-0 hover:text-primary">
            <span className="line-clamp-2">{medicine.name}</span>
          </Link>
        </h3>

        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}

        {medicine.manufacturer ? (
          <p className="line-clamp-1 text-sm text-muted-foreground">{medicine.manufacturer}</p>
        ) : null}

        {hasRating ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-[color:var(--warning)] text-[color:var(--warning)]" aria-hidden />
            <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
            <span>({reviewCount})</span>
          </p>
        ) : null}

        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {finalPrice > 0 ? (
              <span className="price text-lg">{formatINR(finalPrice)}</span>
            ) : (
              // MRP is 0 until someone enters it; "₹0.00" would read as a free medicine.
              <span className="text-sm font-medium text-muted-foreground">Price not listed yet</span>
            )}
            {savings > 0 ? <span className="price-strike">{formatINR(mrp)}</span> : null}
          </div>
          {savings > 0 ? <p className="price-save">You save {formatINR(savings)}</p> : null}

          {!inStock ? (
            <p className="mt-1 text-sm font-bold text-destructive">Out of stock</p>
          ) : lowStock ? (
            <p className="mt-1 text-sm font-bold text-[color:var(--warning-foreground)]">
              Only {medicine.stock_quantity} left
            </p>
          ) : null}
        </div>
      </div>

      {/* Sits above the stretched link so the button stays clickable. */}
      <div className="relative z-10 border-t border-border p-3 pt-2.5">
        <AddToCartButton medicineId={medicine.id} disabled={!inStock} />
      </div>
    </article>
  )
}
