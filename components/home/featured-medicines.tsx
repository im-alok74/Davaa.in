import { ProductRail } from "@/components/home/product-rail"
import type { MedicineCardData } from "@/components/medicines/medicine-card"
import { cachedPublic, TAGS, TTL } from "@/lib/cache"
import { query } from "@/lib/db"

/**
 * Catalogue medicines that have a real pack photograph.
 *
 * Every other rail on this page is built from what a verified pharmacy has on a shelf, so
 * until pharmacies list stock the page has nothing to show. This one reads the catalogue
 * itself: products with a photo, ranked in-stock first, then priced, then by popularity.
 *
 * Stock is reported truthfully. A product no pharmacy holds today carries
 * `stock_quantity: 0`, so its card says "Out of stock" and the cart button is disabled —
 * this rail advertises the catalogue, it does not claim availability.
 */
const FEATURED_LIMIT = 12

async function loadFeaturedMedicines(): Promise<MedicineCardData[]> {
  try {
    return await query<MedicineCardData>`
      SELECT
        m.id, m.name, m.slug, m.generic_name, m.manufacturer, m.category, m.form,
        m.strength, m.pack_size, m.requires_prescription, m.mrp, m.image_url, m.photo_url,
        offer.selling_price, offer.discount_percentage, offer.pharmacy_name,
        COALESCE(offer.stock_quantity, 0)::int AS stock_quantity
      FROM medicines m
      LEFT JOIN LATERAL (
        SELECT pi.selling_price, pi.discount_percentage, pi.stock_quantity, pp.pharmacy_name
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp
          ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
        WHERE pi.medicine_id = m.id
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
        ORDER BY COALESCE(pi.discount_percentage, 0) DESC, pi.selling_price ASC
        LIMIT 1
      ) offer ON TRUE
      WHERE m.status = 'active'
        AND COALESCE(m.image_url, '') <> ''
      ORDER BY
        (offer.selling_price IS NOT NULL) DESC,
        (m.mrp > 0) DESC,
        m.popularity_score DESC,
        m.id ASC
      LIMIT ${FEATURED_LIMIT}
    `
  } catch (error) {
    console.error("[homepage] featured medicines failed:", error)
    return []
  }
}

// Carries stock and price, so it takes the short inventory window and is invalidated by
// the same tag as the stocked catalogue.
const getFeaturedMedicines = cachedPublic(loadFeaturedMedicines, ["home-featured-medicines"], {
  revalidate: TTL.INVENTORY,
  tags: [TAGS.inventory, TAGS.catalog],
})

export async function FeaturedMedicines() {
  const products = await getFeaturedMedicines()

  return (
    <ProductRail
      id="featured-medicines"
      title="Featured medicines"
      description="Browse the catalogue — real pack photos, with prices where they are listed."
      href="/medicines"
      linkLabel="View all medicines"
      products={products}
    />
  )
}
