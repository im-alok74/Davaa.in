import { cache } from "react"

import { cachedPublic, cachedPublicBy, TAGS, TTL } from "@/lib/cache"
import { query } from "@/lib/db"
import { CATEGORY_GROUPS, categoryGroupKey } from "@/lib/categories"
import type { MedicineCardData } from "@/components/medicines/medicine-card"

/**
 * The stocked catalogue — everything a verified pharmacy actually has on a shelf today.
 *
 * One query, fetched once per request and reused by every homepage rail. At launch that
 * is 92 distinct products; grouping, ranking and slicing them in memory is far cheaper
 * than running eight separate GROUP BY queries against the same 92 rows, and it keeps all
 * the "what counts as a deal / a category / a brand" logic in one readable place.
 *
 * The trade is that this loads the whole stocked set into memory. That is correct up to a
 * few thousand SKUs. Past that, push the grouping back into SQL — the shapes returned
 * here are the contract, so the rails would not need to change.
 *
 * Nothing here fabricates anything. Every rail returns fewer items when there is less
 * stock, and returns nothing at all when a section could not be filled honestly.
 */

export interface StockedProduct extends MedicineCardData {
  /** Collapsed category group key, or null when the free-text category matched nothing. */
  group_key: string | null
  /** Normalised manufacturer key — "Cachet Pharmaceuticals Pvt. Ltd." → "cachet". */
  brand_key: string | null
  /** Manufacturer as typed, for display. */
  brand_label: string | null
  /** Per-unit price the customer actually pays. */
  effective_price: number
  /** Rupees saved against MRP. Zero when the pack is not actually cheaper than MRP. */
  savings: number
  /** Real saving as a percentage of MRP. Zero when there is no saving. */
  savings_pct: number
  has_image: boolean
}

interface CatalogRow {
  id: number
  name: string
  slug: string | null
  generic_name: string | null
  manufacturer: string | null
  category: string | null
  form: string | null
  strength: string | null
  pack_size: string | null
  requires_prescription: boolean
  mrp: string | number
  image_url: string | null
  photo_url: string | null
  gallery_image: string | null
  selling_price: string | number | null
  discount_percentage: string | number | null
  stock_quantity: number | null
  pharmacy_name: string | null
  average_rating: string | number | null
  review_count: number | null
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * Legal-form noise that is never part of how anyone says a brand name out loud.
 * "Cachet Pharmaceuticals Pvt. Ltd." and "CACHET PHARMACEUTICALS PRIVATE LIMITED" have to
 * collapse to the same key or the brand rail shows the same company three times.
 */
const BRAND_NOISE =
  /\b(pvt|private|ltd|limited|inc|llp|co|company|corp|corporation|pharmaceuticals?|pharma|laboratories|laboratory|labs?|healthcare|health\s?care|remedies|formulations?|industries|group|marketing|surgimed|medical|devices?|india|ind)\b\.?/g

/**
 * Rejects manufacturer values that are obviously not companies.
 *
 * The manufacturer column has been used as a free-text dumping ground — it currently
 * contains entries like "CADBE SYRUP (FOOD) 200 ML", "Ursodeoxycholic Acid Suspension"
 * and "Multivitamin, Amino Acids, Multiminera and Antioxidants Syrup". Those are product
 * names and dosage forms, and putting them in a "Popular brands" rail would advertise the
 * data-entry problem on the homepage.
 */
function looksLikeProductNotBrand(raw: string): boolean {
  const value = raw.toLowerCase()
  return (
    // "200 ML", "15 ml", "500 mg" — a pack size, not a company.
    /\d+\s*(ml|mg|gm|g|mcg|iu|%)\b/.test(value) ||
    // Dosage forms.
    /\b(syrup|tablet|capsule|injection|drops?|suspension|cream|ointment|gel|powder|sachet|inhaler|solution)\b/.test(value) ||
    // Ingredient lists.
    /\b(acid|multivitamin|multimineral|antioxidants?|amino acids?)\b/.test(value)
  )
}

function brandKeyOf(manufacturer: string | null): string | null {
  if (!manufacturer) return null
  const raw = manufacturer.trim()
  if (raw.length < 3 || looksLikeProductNotBrand(raw)) return null

  const key = raw.toLowerCase().replace(BRAND_NOISE, " ").replace(/[^a-z0-9]/g, "")
  return key.length >= 3 ? key : null
}

/**
 * Every distinct product a verified pharmacy currently stocks.
 *
 * `DISTINCT ON` collapses the duplicate catalogue rows — the same pack exists more than
 * once with different ids (CADBE DROPS 15 ML is both 1434 and 1441), which is why the
 * old footer link block listed the same medicine twice.
 */
/**
 * Hard ceiling on the working set.
 *
 * This query was unbounded. That was survivable only because `pharmacy_inventory` is
 * currently tiny (~128 rows); the moment a few pharmacies upload real stock it becomes an
 * unbounded scan feeding a JS filter. Every consumer below slices 6–18 items out of the
 * result, so a bounded window loses nothing a visitor can see, and it puts a hard ceiling
 * on both Neon transfer and the serialised payload.
 */
const STOCKED_CATALOG_LIMIT = 600

async function loadStockedCatalog(): Promise<StockedProduct[]> {
  try {
    const rows = await query<CatalogRow>`
      SELECT DISTINCT ON (lower(btrim(m.name)), COALESCE(m.strength, ''), COALESCE(m.pack_size, ''))
        m.id, m.name, m.slug, m.generic_name, m.manufacturer, m.category,
        m.form, m.strength, m.pack_size, m.requires_prescription, m.mrp,
        m.image_url, m.photo_url,
        mi.image_url AS gallery_image,
        pi.selling_price, pi.discount_percentage, pi.stock_quantity,
        pp.pharmacy_name,
        r.average_rating, r.review_count
      FROM pharmacy_inventory pi
      JOIN pharmacy_profiles pp
        ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
      JOIN medicines m
        ON m.id = pi.medicine_id AND m.status = 'active'
      LEFT JOIN LATERAL (
        SELECT image_url FROM medicine_images
        WHERE medicine_id = m.id AND COALESCE(image_url, '') <> ''
        ORDER BY id LIMIT 1
      ) mi ON TRUE
      LEFT JOIN LATERAL (
        SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::int AS review_count
        FROM medicine_reviews mr
        WHERE mr.medicine_id = m.id AND mr.status = 'published'
      ) r ON TRUE
      WHERE pi.stock_quantity > 0
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ORDER BY
        lower(btrim(m.name)), COALESCE(m.strength, ''), COALESCE(m.pack_size, ''),
        COALESCE(pi.discount_percentage, 0) DESC, pi.selling_price ASC
      LIMIT ${STOCKED_CATALOG_LIMIT}
    `

    return rows.map((row) => {
      const mrp = toNumber(row.mrp)
      const listPrice = row.selling_price != null ? toNumber(row.selling_price) : mrp
      const discountPct = toNumber(row.discount_percentage)
      const effective = discountPct > 0 ? listPrice - listPrice * (discountPct / 100) : listPrice

      // Savings are measured against MRP, not against the pharmacy's own list price.
      // A "40% off" badge on a price above MRP is not a saving, and this is where that
      // gets caught rather than on the customer's bill.
      const savings = mrp > effective ? mrp - effective : 0
      const image = row.photo_url || row.image_url || row.gallery_image || null

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        generic_name: row.generic_name,
        manufacturer: row.manufacturer,
        category: row.category,
        form: row.form,
        strength: row.strength,
        pack_size: row.pack_size,
        requires_prescription: row.requires_prescription,
        mrp: row.mrp,
        image_url: row.image_url,
        photo_url: row.photo_url,
        images: image ? [image] : undefined,
        selling_price: row.selling_price,
        discount_percentage: row.discount_percentage,
        stock_quantity: row.stock_quantity,
        pharmacy_name: row.pharmacy_name,
        average_rating: row.average_rating,
        review_count: row.review_count,

        group_key: categoryGroupKey(row.category),
        brand_key: brandKeyOf(row.manufacturer),
        brand_label: row.manufacturer?.trim() || null,
        effective_price: Math.round(effective * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        savings_pct: mrp > 0 && savings > 0 ? Math.round((savings / mrp) * 100) : 0,
        has_image: Boolean(image),
      }
    })
  } catch (error) {
    console.error("[catalog] getStockedCatalog failed:", error)
    return []
  }
}

/**
 * The stocked catalogue, cached across requests.
 *
 * Two layers, and they do different jobs:
 *
 *  - `cachedPublic` (Vercel Data Cache) makes this one database round trip per
 *    revalidation window *for the whole site*, instead of one per visitor. This is the
 *    change that stops traffic growth translating into Neon transfer growth.
 *  - `cache` (React, per-request) means the six homepage sections that call this during a
 *    single render share one cache lookup rather than six.
 *
 * Tagged `inventory` so a stock or price write can invalidate it immediately via
 * `revalidateTag(TAGS.inventory)` rather than serving a stale price for up to a minute.
 */
export const getStockedCatalog = cache(
  cachedPublic(loadStockedCatalog, ["stocked-catalog", `v${STOCKED_CATALOG_LIMIT}`], {
    revalidate: TTL.INVENTORY,
    tags: [TAGS.inventory, TAGS.catalog],
  }),
)

export interface CategoryTile {
  key: string
  label: string
  count: number
  /** A real pack shot from this category. The tile is not rendered without one. */
  image: string
}

/**
 * Category tiles, each illustrated with a real product photograph from that category.
 *
 * A tile without a picture is just a text link, which is what the page already had too
 * much of — so a group with no photographed stock is dropped rather than shown with a
 * placeholder.
 */
export async function getCategoryTiles(limit = 8): Promise<CategoryTile[]> {
  const catalog = await getStockedCatalog()
  if (catalog.length === 0) return []

  const tiles: CategoryTile[] = []

  for (const group of CATEGORY_GROUPS) {
    const items = catalog.filter((product) => product.group_key === group.key)
    if (items.length === 0) continue

    const illustrated = items.find((product) => product.has_image)
    if (!illustrated) continue

    tiles.push({
      key: group.key,
      label: group.label,
      count: items.length,
      image: illustrated.images?.[0] as string,
    })
  }

  // Biggest shelves first — a category with 28 products is more likely to answer whatever
  // the visitor came for than one with two.
  return tiles.sort((a, b) => b.count - a.count).slice(0, limit)
}

/**
 * Today's genuinely best-value packs.
 *
 * Ranked by real saving against MRP, and anything with no saving is excluded outright.
 * This is the difference between a deals rail and a decorated product grid.
 */
export async function getBestValue(limit = 8): Promise<StockedProduct[]> {
  const catalog = await getStockedCatalog()
  return catalog
    .filter((product) => product.savings_pct > 0 && product.has_image)
    .sort((a, b) => b.savings_pct - a.savings_pct || b.savings - a.savings)
    .slice(0, limit)
}

/** Products in one category group, best-discounted first. Photographed items lead. */
export async function getGroupRail(groupKey: string, limit = 8): Promise<StockedProduct[]> {
  const catalog = await getStockedCatalog()
  return catalog
    .filter((product) => product.group_key === groupKey)
    .sort(
      (a, b) =>
        Number(b.has_image) - Number(a.has_image) ||
        b.savings_pct - a.savings_pct ||
        a.effective_price - b.effective_price,
    )
    .slice(0, limit)
}

export interface ThemedRail {
  key: string
  label: string
  products: StockedProduct[]
}

/**
 * The themed rails the homepage should show, chosen by what is actually in stock.
 *
 * The section list is not hardcoded. Ayurveda, Skin & Hair and Diabetes Care are all
 * defined in CATEGORY_GROUPS and will appear here on their own the day a pharmacy stocks
 * enough of them — and stay absent until then, rather than rendering a heading over two
 * products. `minProducts` is what keeps a rail from looking like a mistake.
 */
export async function getThemedRails({
  limit = 3,
  minProducts = 4,
  productsPerRail = 8,
  exclude = [],
}: {
  limit?: number
  minProducts?: number
  productsPerRail?: number
  exclude?: string[]
} = {}): Promise<ThemedRail[]> {
  const catalog = await getStockedCatalog()
  if (catalog.length === 0) return []

  const excluded = new Set(exclude)
  const rails: ThemedRail[] = []

  for (const group of CATEGORY_GROUPS) {
    if (excluded.has(group.key)) continue

    const products = catalog
      .filter((product) => product.group_key === group.key && product.has_image)
      .sort((a, b) => b.savings_pct - a.savings_pct || a.effective_price - b.effective_price)

    if (products.length < minProducts) continue
    rails.push({ key: group.key, label: group.label, products: products.slice(0, productsPerRail) })
  }

  return rails.sort((a, b) => b.products.length - a.products.length).slice(0, limit)
}

export interface ManufacturerTile {
  /** Raw manufacturer string, used as the `?manufacturer=` filter value. */
  name: string
  /** Short display form — "Sun Pharmaceutical Industries Ltd." → "Sun Pharmaceutical". */
  label: string
  /** Active catalogue products carrying this manufacturer. */
  count: number
}

/**
 * Top manufacturers across the whole active catalogue.
 *
 * Deliberately *not* built on `getStockedCatalog`. That set is what one verified pharmacy
 * has on a shelf today — 92 products, 82 of them from a single company — which is why
 * `getBrandTiles` correctly renders nothing. The catalogue itself is a different and much
 * larger thing: 75 distinct manufacturers, led by Alkem, Jan Aushadhi, Sun Pharma, Intas
 * and Abbott with several hundred products each. Those are real rows and real counts, and
 * browsing them is genuinely useful even before every pack is stocked locally.
 *
 * The two sections answer different questions and both are honest: "who makes what we
 * list" here, "which brands can you buy right now" in `getBrandTiles`.
 */
async function loadTopManufacturers(limit: number): Promise<ManufacturerTile[]> {
  try {
    const rows = await query<{ manufacturer: string; count: number }>`
      SELECT m.manufacturer, COUNT(*)::int AS count
      FROM medicines m
      WHERE m.status = 'active'
        AND m.manufacturer IS NOT NULL
        AND btrim(m.manufacturer) <> ''
        AND length(btrim(m.manufacturer)) >= 3
      GROUP BY m.manufacturer
      HAVING COUNT(*) >= 20
      ORDER BY COUNT(*) DESC
      LIMIT ${limit * 3}
    `

    const tiles: ManufacturerTile[] = []
    for (const row of rows) {
      const name = row.manufacturer.trim()
      // The same guard the brand rail uses: `manufacturer` is free text and holds product
      // names ("CADBE SYRUP (FOOD) 200 ML") as well as companies. Those must not be
      // advertised as manufacturers.
      if (looksLikeProductNotBrand(name)) continue
      tiles.push({ name, label: shortManufacturer(name), count: row.count })
      if (tiles.length >= limit) break
    }

    return tiles
  } catch (error) {
    console.error("[catalog] getTopManufacturers failed:", error)
    return []
  }
}

/**
 * Cached for half an hour: this is a `GROUP BY manufacturer` aggregate across all 22k+
 * active medicines, so it is one of the most expensive queries on the homepage in compute
 * terms, and its answer changes only when the catalogue itself is edited.
 */
export const getTopManufacturers = cache(
  cachedPublicBy(loadTopManufacturers, ["top-manufacturers"], {
    revalidate: TTL.TAXONOMY,
    tags: [TAGS.taxonomy, TAGS.catalog],
  }),
)

/**
 * Trims the legal suffix so tiles read like the name people say out loud.
 * "Sun Pharmaceutical Industries Ltd." → "Sun Pharmaceutical Industries".
 * Never returns an empty string — falls back to the original.
 */
function shortManufacturer(raw: string): string {
  const trimmed = raw
    .replace(/\s*[,(].*$/, "")
    .replace(
      /\b(pvt\.?|private|ltd\.?|limited|inc\.?|llp|co\.?|corp\.?|corporation)\b\.?/gi,
      " ",
    )
    .replace(/\s{2,}/g, " ")
    .trim()
  return trimmed.length >= 3 ? trimmed : raw
}

export interface BrandTile {
  key: string
  label: string
  count: number
  /** Up to two real pack shots. There are no brand logo assets, so packs stand in. */
  images: string[]
}

/**
 * Brands with enough stocked, photographed products to be worth browsing.
 *
 * At launch this returns nothing, and that is the honest answer: 82 of 92 stocked
 * products come from a single manufacturer, and most other manufacturer values are
 * product names typed into the wrong column. A "Popular brands" rail containing one real
 * brand advertises a data-entry problem rather than a catalogue.
 *
 * The rail appears by itself once `minBrands` distinct manufacturers each have
 * `minProducts` photographed items in stock.
 */
export async function getBrandTiles({
  limit = 10,
  minProducts = 2,
  minBrands = 4,
}: { limit?: number; minProducts?: number; minBrands?: number } = {}): Promise<BrandTile[]> {
  const catalog = await getStockedCatalog()
  if (catalog.length === 0) return []

  const grouped = new Map<string, { labels: string[]; images: string[]; count: number }>()

  for (const product of catalog) {
    if (!product.brand_key || !product.has_image) continue
    const entry = grouped.get(product.brand_key) ?? { labels: [], images: [], count: 0 }
    entry.count += 1
    if (product.brand_label) entry.labels.push(product.brand_label)
    if (entry.images.length < 2) entry.images.push(product.images?.[0] as string)
    grouped.set(product.brand_key, entry)
  }

  const tiles: BrandTile[] = []
  for (const [key, entry] of grouped) {
    if (entry.count < minProducts) continue
    // Shortest spelling reads best: "Cachet" over "Cachet Pharmaceuticals Private Limited".
    const label = entry.labels.sort((a, b) => a.length - b.length)[0]
    tiles.push({ key, label, count: entry.count, images: entry.images })
  }

  if (tiles.length < minBrands) return []
  return tiles.sort((a, b) => b.count - a.count).slice(0, limit)
}
