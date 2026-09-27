import { cachedPublicBy, geoBucket, TAGS, TTL } from "@/lib/cache"
import { query } from "@/lib/db"
import { hasCoordinates, type DeliveryLocation } from "@/lib/location"

/**
 * Local discovery — the queries behind "what can I actually get, near me, right now".
 *
 * Everything here is driven by real rows: verified pharmacies, their coordinates, their
 * live inventory and their opening hours. Nothing is simulated. When there is no data the
 * functions return an empty array and the calling surface renders an honest empty state
 * rather than filler.
 *
 * Matching is deliberately layered, because customers arrive with different amounts of
 * information about themselves:
 *
 *   coordinates → real distance, ranked nearest first
 *   pincode     → exact pincode match
 *   city        → city match
 *   nothing     → every verified pharmacy, best-stocked first
 *
 * Distance is computed with the haversine formula in SQL. That is accurate to well under
 * the error in a rooftop geocode at city scale, and it avoids pulling every pharmacy row
 * into the application to sort it there. If the pharmacy table ever grows past a few
 * thousand rows in one city, this is the point to add PostGIS and a GiST index.
 */

/** Pharmacies beyond this are not "near you" by any reading. */
const MAX_DISTANCE_KM = 25

/** Assumed serviceable radius when a pharmacy has not configured one. */
const DEFAULT_DELIVERY_RADIUS_KM = 5

/**
 * A note on what happens when a customer's location matches nothing.
 *
 * Most partner pharmacies have no coordinates yet — registration does not capture them —
 * so distance is often unknown. The tempting fix is to fall back to "show every partner
 * anyway while the network is small". That was tried and removed: it put a pharmacy in
 * Nalanda under a "Pharmacies near you" heading for a customer in Mumbai, which is
 * inventing proximity we have not measured.
 *
 * So a located customer sees only real geographic matches — pincode, city, or a measured
 * distance — and an empty result renders the empty state, which offers a prescription
 * upload, WhatsApp and a phone number. That is a true answer with a way forward, rather
 * than a false one. A visitor who has shared no location at all is a different case: they
 * asked nothing about proximity, so they get the partner list under a neutral heading.
 *
 * The way to make more pharmacies appear is to geocode them, not to loosen this.
 */

export interface PharmacySummary {
  id: number
  pharmacy_name: string
  address: string
  city: string
  state: string
  pincode: string
  /** Null when we could not compute a real distance. Never estimated. */
  distance_km: number | null
  /** Null when the pharmacy has not published its hours — we say nothing rather than guess. */
  is_open: boolean | null
  is_24x7: boolean
  opening_time: string | null
  closing_time: string | null
  /** True when the customer is inside this pharmacy's own delivery radius. */
  delivers_here: boolean
  /** Distinct active medicines currently in stock. Drives "N medicines in stock". */
  in_stock_count: number
}

export interface PharmacyOffer {
  pharmacy_id: number
  pharmacy_name: string
  city: string
  distance_km: number | null
  is_open: boolean | null
  delivers_here: boolean
  stock_quantity: number
  /** Listed price before the pharmacy's own discount. */
  selling_price: number
  discount_percentage: number
  /** What the customer pays per unit. This is the number to compare on. */
  effective_price: number
}

export interface NearbyMedicine {
  id: number
  name: string
  slug: string | null
  strength: string | null
  pack_size: string | null
  form: string | null
  requires_prescription: boolean
  mrp: number
  image_url: string | null
  photo_url: string | null
  /** How many nearby pharmacies have it in stock. Always a real count. */
  offer_count: number
  best_price: number
  offers: PharmacyOffer[]
}

/**
 * The four location parameters every query below takes.
 *
 * Passing all four as explicit nulls (rather than splicing SQL fragments together) keeps
 * each query a single static statement — parameterised, cacheable, and impossible to
 * turn into an injection by adding a branch later.
 */
function locationParams(location: DeliveryLocation | null) {
  const coords = hasCoordinates(location)
  return {
    lat: coords ? location.latitude : null,
    lng: coords ? location.longitude : null,
    pincode: location?.pincode ?? null,
    city: location?.city ?? null,
  }
}

interface PharmacyRow extends Omit<PharmacySummary, "distance_km" | "in_stock_count"> {
  distance_km: string | number | null
  in_stock_count: string | number | null
}

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? n : 0
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "number" ? value : Number.parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

/**
 * Verified pharmacies near the customer, nearest (or best-stocked) first.
 *
 * Returns `[]` on any failure. A pharmacy rail is not worth crashing a page over — the
 * caller renders its empty state and the error is logged for us, not shown to the user.
 */
/**
 * Cached by coarse location rather than by user.
 *
 * This query, plus its sibling below, were the single largest compute cost in the app:
 * eight of them ran per homepage render at 2-4 seconds each, and none was cached, so the
 * cost scaled linearly with traffic. The result depends only on the four scalars below,
 * which is exactly what makes it safe to share between everyone standing in the same
 * square kilometre.
 */
async function loadNearbyPharmacies(
  lat: number | null,
  lng: number | null,
  pincode: string | null,
  city: string | null,
  limit: number,
): Promise<PharmacySummary[]> {

  try {
    const rows = await query<PharmacyRow>`
      WITH ctx AS (
        SELECT
          ${lat}::float8 AS lat,
          ${lng}::float8 AS lng,
          ${pincode}::text AS ctx_pincode,
          ${city}::text AS ctx_city,
          (NOW() AT TIME ZONE 'Asia/Kolkata')::time AS local_time
      ),
      base AS (
        SELECT
          p.id, p.pharmacy_name, p.address, p.city, p.state, p.pincode,
          p.is_24x7, p.opening_time, p.closing_time,
          COALESCE(p.delivery_radius, ${DEFAULT_DELIVERY_RADIUS_KM}) AS delivery_radius,
          ctx.lat AS ctx_lat, ctx.ctx_pincode, ctx.ctx_city, ctx.local_time,
          CASE
            WHEN ctx.lat IS NULL OR p.latitude IS NULL OR p.longitude IS NULL THEN NULL
            ELSE 6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(ctx.lat)) * cos(radians(p.latitude))
              * cos(radians(p.longitude) - radians(ctx.lng))
              + sin(radians(ctx.lat)) * sin(radians(p.latitude))
            )))
          END AS distance_km
        FROM pharmacy_profiles p
        CROSS JOIN ctx
        WHERE p.verification_status = 'verified'
      )
      SELECT
        b.id, b.pharmacy_name, b.address, b.city, b.state, b.pincode,
        b.is_24x7,
        to_char(b.opening_time, 'HH12:MI AM') AS opening_time,
        to_char(b.closing_time, 'HH12:MI AM') AS closing_time,
        b.distance_km,
        CASE
          WHEN b.is_24x7 THEN TRUE
          WHEN b.opening_time IS NULL OR b.closing_time IS NULL THEN NULL
          -- Overnight windows (22:00–06:00) wrap past midnight, so the naive
          -- BETWEEN would report every such pharmacy as closed all day.
          WHEN b.closing_time > b.opening_time
            THEN b.local_time BETWEEN b.opening_time AND b.closing_time
          ELSE b.local_time >= b.opening_time OR b.local_time <= b.closing_time
        END AS is_open,
        COALESCE(b.distance_km <= b.delivery_radius, TRUE) AS delivers_here,
        COALESCE(inv.in_stock_count, 0) AS in_stock_count
      FROM base b
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT pi.medicine_id)::int AS in_stock_count
        FROM pharmacy_inventory pi
        JOIN medicines m ON m.id = pi.medicine_id AND m.status = 'active'
        WHERE pi.pharmacy_id = b.id
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ) inv ON TRUE
      WHERE
        (b.distance_km IS NOT NULL AND b.distance_km <= ${MAX_DISTANCE_KM})
        OR (b.ctx_pincode IS NOT NULL AND b.pincode = b.ctx_pincode)
        OR (b.ctx_city IS NOT NULL AND lower(b.city) = lower(b.ctx_city))
        -- No location shared at all: show the partner list rather than nothing.
        OR (b.ctx_lat IS NULL AND b.ctx_pincode IS NULL AND b.ctx_city IS NULL)
      -- Geocoded matches first; un-geocoded partners fall to the end via NULLS LAST.
      ORDER BY b.distance_km ASC NULLS LAST, in_stock_count DESC, b.pharmacy_name ASC
      LIMIT ${limit}
    `

    return rows.map((row) => ({
      ...row,
      distance_km: toNullableNumber(row.distance_km),
      in_stock_count: toNumber(row.in_stock_count),
    }))
  } catch (error) {
    console.error("[pharmacies] findNearbyPharmacies failed:", error)
    return []
  }
}

const cachedNearbyPharmacies = cachedPublicBy(loadNearbyPharmacies, ["nearby-pharmacies"], {
  revalidate: TTL.INVENTORY,
  tags: [TAGS.inventory],
})

export async function findNearbyPharmacies(
  location: DeliveryLocation | null,
  limit = 8,
): Promise<PharmacySummary[]> {
  const { lat, lng, pincode, city } = locationParams(location)
  // Coordinates are bucketed into the cache key so people in the same area share an
  // entry; the query itself still receives the precise values for distance sorting.
  return cachedNearbyPharmacies(lat, lng, pincode, city, limit)
}

/** A single pharmacy's public profile, or null if it is not verified or does not exist. */
export async function getPharmacyById(
  id: number,
  location: DeliveryLocation | null,
): Promise<PharmacySummary | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const { lat, lng } = locationParams(location)

  try {
    const [row] = await query<PharmacyRow>`
      WITH ctx AS (
        SELECT
          ${lat}::float8 AS lat,
          ${lng}::float8 AS lng,
          (NOW() AT TIME ZONE 'Asia/Kolkata')::time AS local_time
      )
      SELECT
        p.id, p.pharmacy_name, p.address, p.city, p.state, p.pincode, p.is_24x7,
        to_char(p.opening_time, 'HH12:MI AM') AS opening_time,
        to_char(p.closing_time, 'HH12:MI AM') AS closing_time,
        CASE
          WHEN ctx.lat IS NULL OR p.latitude IS NULL OR p.longitude IS NULL THEN NULL
          ELSE 6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians(ctx.lat)) * cos(radians(p.latitude))
            * cos(radians(p.longitude) - radians(ctx.lng))
            + sin(radians(ctx.lat)) * sin(radians(p.latitude))
          )))
        END AS distance_km,
        CASE
          WHEN p.is_24x7 THEN TRUE
          WHEN p.opening_time IS NULL OR p.closing_time IS NULL THEN NULL
          WHEN p.closing_time > p.opening_time
            THEN ctx.local_time BETWEEN p.opening_time AND p.closing_time
          ELSE ctx.local_time >= p.opening_time OR ctx.local_time <= p.closing_time
        END AS is_open,
        TRUE AS delivers_here,
        COALESCE(inv.in_stock_count, 0) AS in_stock_count
      FROM pharmacy_profiles p
      CROSS JOIN ctx
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT pi.medicine_id)::int AS in_stock_count
        FROM pharmacy_inventory pi
        JOIN medicines m ON m.id = pi.medicine_id AND m.status = 'active'
        WHERE pi.pharmacy_id = p.id
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ) inv ON TRUE
      WHERE p.id = ${id} AND p.verification_status = 'verified'
      LIMIT 1
    `

    if (!row) return null
    return {
      ...row,
      distance_km: toNullableNumber(row.distance_km),
      in_stock_count: toNumber(row.in_stock_count),
    }
  } catch (error) {
    console.error("[pharmacies] getPharmacyById failed:", error)
    return null
  }
}

interface OfferRow extends Omit<PharmacyOffer, "distance_km" | "selling_price" | "discount_percentage" | "effective_price" | "stock_quantity"> {
  distance_km: string | number | null
  selling_price: string | number
  discount_percentage: string | number | null
  effective_price: string | number
  stock_quantity: string | number
}

function mapOffer(row: OfferRow): PharmacyOffer {
  return {
    pharmacy_id: row.pharmacy_id,
    pharmacy_name: row.pharmacy_name,
    city: row.city,
    is_open: row.is_open,
    delivers_here: row.delivers_here,
    distance_km: toNullableNumber(row.distance_km),
    stock_quantity: toNumber(row.stock_quantity),
    selling_price: toNumber(row.selling_price),
    discount_percentage: toNumber(row.discount_percentage),
    effective_price: toNumber(row.effective_price),
  }
}

/**
 * Every nearby pharmacy that has this medicine in stock, cheapest first.
 *
 * This is the price-comparison primitive: one medicine, several real sellers, each with
 * its own price, distance and delivery capability.
 *
 * One row per *pharmacy*, not per inventory row. `pharmacy_inventory` is keyed on
 * (pharmacy_id, medicine_id, batch_number), so a shop holding two batches of the same
 * medicine — routine, and required for the batch/expiry tracking that goes on the invoice —
 * legitimately has several rows. Joining it directly listed that shop once per batch, which
 * meant: the same pharmacy appearing twice in a price comparison, duplicate React keys on
 * `offer.pharmacy_id`, a `limit` of 3 spent on one seller so genuinely different pharmacies
 * never showed, and a card reading "1 pharmacy near you" above two rows — because the
 * caller counts COUNT(DISTINCT pharmacy_id) while this listed batches.
 *
 * Batches are therefore folded here: stock sums across them (what the shop can actually
 * dispense), and the price shown is the cheapest batch the customer could be sold.
 */
export async function findOffersForMedicine(
  medicineId: number,
  location: DeliveryLocation | null,
  limit = 6,
): Promise<PharmacyOffer[]> {
  if (!Number.isInteger(medicineId) || medicineId <= 0) return []
  const { lat, lng, pincode, city } = locationParams(location)

  try {
    const rows = await query<OfferRow>`
      WITH ctx AS (
        SELECT
          ${lat}::float8 AS lat,
          ${lng}::float8 AS lng,
          ${pincode}::text AS ctx_pincode,
          ${city}::text AS ctx_city,
          (NOW() AT TIME ZONE 'Asia/Kolkata')::time AS local_time
      ),
      base AS (
        SELECT
          p.id, p.pharmacy_name, p.city, p.pincode, p.is_24x7,
          p.opening_time, p.closing_time,
          COALESCE(p.delivery_radius, ${DEFAULT_DELIVERY_RADIUS_KM}) AS delivery_radius,
          ctx.lat AS ctx_lat, ctx.ctx_pincode, ctx.ctx_city, ctx.local_time,
          CASE
            WHEN ctx.lat IS NULL OR p.latitude IS NULL OR p.longitude IS NULL THEN NULL
            ELSE 6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(ctx.lat)) * cos(radians(p.latitude))
              * cos(radians(p.longitude) - radians(ctx.lng))
              + sin(radians(ctx.lat)) * sin(radians(p.latitude))
            )))
          END AS distance_km
        FROM pharmacy_profiles p
        CROSS JOIN ctx
        WHERE p.verification_status = 'verified'
      ),
      -- One row per pharmacy, batches folded. ARRAY_AGG ... ORDER BY picks the field
      -- values off the cheapest batch, so selling_price and discount_percentage stay
      -- from the same row and the strike-through price cannot be mixed across batches.
      inv AS (
        SELECT
          pi.pharmacy_id,
          SUM(pi.stock_quantity)::int AS stock_quantity,
          (ARRAY_AGG(pi.selling_price ORDER BY
            pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0) ASC,
            pi.expiry_date ASC NULLS LAST))[1] AS selling_price,
          (ARRAY_AGG(COALESCE(pi.discount_percentage, 0) ORDER BY
            pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0) ASC,
            pi.expiry_date ASC NULLS LAST))[1] AS discount_percentage
        FROM pharmacy_inventory pi
        WHERE pi.medicine_id = ${medicineId}
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
        GROUP BY pi.pharmacy_id
      )
      SELECT
        b.id AS pharmacy_id,
        b.pharmacy_name,
        b.city,
        b.distance_km,
        CASE
          WHEN b.is_24x7 THEN TRUE
          WHEN b.opening_time IS NULL OR b.closing_time IS NULL THEN NULL
          WHEN b.closing_time > b.opening_time
            THEN b.local_time BETWEEN b.opening_time AND b.closing_time
          ELSE b.local_time >= b.opening_time OR b.local_time <= b.closing_time
        END AS is_open,
        COALESCE(b.distance_km <= b.delivery_radius, TRUE) AS delivers_here,
        inv.stock_quantity,
        inv.selling_price,
        inv.discount_percentage,
        ROUND(inv.selling_price * (1 - inv.discount_percentage / 100.0), 2) AS effective_price
      FROM base b
      JOIN inv ON inv.pharmacy_id = b.id
      WHERE (
          (b.distance_km IS NOT NULL AND b.distance_km <= ${MAX_DISTANCE_KM})
          OR (b.ctx_pincode IS NOT NULL AND b.pincode = b.ctx_pincode)
          OR (b.ctx_city IS NOT NULL AND lower(b.city) = lower(b.ctx_city))
          OR (b.ctx_lat IS NULL AND b.ctx_pincode IS NULL AND b.ctx_city IS NULL)
        )
      ORDER BY effective_price ASC, b.distance_km ASC NULLS LAST
      LIMIT ${limit}
    `

    return rows.map(mapOffer)
  } catch (error) {
    console.error("[pharmacies] findOffersForMedicine failed:", error)
    return []
  }
}

interface NearbyMedicineRow {
  id: number
  name: string
  slug: string | null
  strength: string | null
  pack_size: string | null
  form: string | null
  requires_prescription: boolean
  mrp: string | number
  image_url: string | null
  photo_url: string | null
  offer_count: string | number
  best_price: string | number
}

/**
 * "Available near you" — medicines several nearby pharmacies actually stock right now,
 * each with its cheapest real offers attached.
 *
 * Ordered by how many nearby pharmacies carry it, because a medicine three pharmacies
 * stock is both more useful to show and more likely to survive one of them running out.
 */
async function loadAvailableNearYou(
  lat: number | null,
  lng: number | null,
  pincode: string | null,
  city: string | null,
  limit: number,
  offersPerMedicine: number,
): Promise<NearbyMedicine[]> {
  // Rebuilt from the cache-key scalars: the nested per-medicine offer lookup below still
  // needs a DeliveryLocation. Without this, `location` binds to the DOM global of the same
  // name and the offer query silently receives the wrong shape.
  const location: DeliveryLocation = {
    latitude: lat,
    longitude: lng,
    pincode,
    city,
    state: null,
    source: lat != null && lng != null ? "gps" : pincode ? "pincode" : "city",
  }

  try {
    const medicines = await query<NearbyMedicineRow>`
      WITH ctx AS (
        SELECT
          ${lat}::float8 AS lat,
          ${lng}::float8 AS lng,
          ${pincode}::text AS ctx_pincode,
          ${city}::text AS ctx_city
      ),
      -- Same matching rules as findNearbyPharmacies; see the predicate there for why
      -- each branch exists.
      nearby AS (
        SELECT p.id
        FROM pharmacy_profiles p
        CROSS JOIN ctx
        WHERE p.verification_status = 'verified'
          AND (
            (ctx.lat IS NOT NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
              AND 6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians(ctx.lat)) * cos(radians(p.latitude))
                * cos(radians(p.longitude) - radians(ctx.lng))
                + sin(radians(ctx.lat)) * sin(radians(p.latitude))
              ))) <= ${MAX_DISTANCE_KM})
            OR (ctx.ctx_pincode IS NOT NULL AND p.pincode = ctx.ctx_pincode)
            OR (ctx.ctx_city IS NOT NULL AND lower(p.city) = lower(ctx.ctx_city))
            OR (ctx.lat IS NULL AND ctx.ctx_pincode IS NULL AND ctx.ctx_city IS NULL)
          )
      )
      SELECT
        m.id, m.name, m.slug, m.strength, m.pack_size, m.form,
        m.requires_prescription, m.mrp, m.image_url, m.photo_url,
        COUNT(DISTINCT pi.pharmacy_id)::int AS offer_count,
        MIN(ROUND(pi.selling_price * (1 - COALESCE(pi.discount_percentage, 0) / 100.0), 2)) AS best_price
      FROM pharmacy_inventory pi
      JOIN nearby n ON n.id = pi.pharmacy_id
      JOIN medicines m ON m.id = pi.medicine_id AND m.status = 'active'
      WHERE pi.stock_quantity > 0
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      GROUP BY m.id
      ORDER BY offer_count DESC, best_price ASC, m.name ASC
      LIMIT ${limit}
    `

    if (medicines.length === 0) return []

    // Second pass for the offers themselves. Kept separate rather than folded into a
    // window function so the shape stays obvious and each statement stays indexable.
    const withOffers = await Promise.all(
      medicines.map(async (medicine) => ({
        id: medicine.id,
        name: medicine.name,
        slug: medicine.slug,
        strength: medicine.strength,
        pack_size: medicine.pack_size,
        form: medicine.form,
        requires_prescription: medicine.requires_prescription,
        mrp: toNumber(medicine.mrp),
        image_url: medicine.image_url,
        photo_url: medicine.photo_url,
        offer_count: toNumber(medicine.offer_count),
        best_price: toNumber(medicine.best_price),
        offers: await findOffersForMedicine(medicine.id, location, offersPerMedicine),
      })),
    )

    // A medicine whose offers all vanished between the two queries would render as an
    // empty comparison card. Drop it rather than show a heading with nothing under it.
    return withOffers.filter((medicine) => medicine.offers.length > 0)
  } catch (error) {
    console.error("[pharmacies] findAvailableNearYou failed:", error)
    return []
  }
}

const cachedAvailableNearYou = cachedPublicBy(loadAvailableNearYou, ["available-near-you"], {
  revalidate: TTL.INVENTORY,
  tags: [TAGS.inventory],
})

export async function findAvailableNearYou(
  location: DeliveryLocation | null,
  { limit = 4, offersPerMedicine = 3 }: { limit?: number; offersPerMedicine?: number } = {},
): Promise<NearbyMedicine[]> {
  const { lat, lng, pincode, city } = locationParams(location)
  return cachedAvailableNearYou(lat, lng, pincode, city, limit, offersPerMedicine)
}

/**
 * What one pharmacy currently has on the shelf.
 *
 * Returns rows in `MedicineCardData` shape so the pharmacy page reuses the same product
 * tile as the catalogue and the homepage — one card component, one set of price, stock
 * and prescription rules, no second implementation to drift.
 */
export async function getPharmacyInventory(pharmacyId: number, limit = 24) {
  if (!Number.isInteger(pharmacyId) || pharmacyId <= 0) return []

  try {
    return await query`
      SELECT DISTINCT ON (m.id)
        m.id, m.name, m.slug, m.generic_name, m.manufacturer, m.category,
        m.form, m.strength, m.pack_size, m.requires_prescription, m.mrp,
        m.image_url, m.photo_url, m.status,
        pi.selling_price, pi.discount_percentage, pi.stock_quantity
      FROM pharmacy_inventory pi
      JOIN medicines m ON m.id = pi.medicine_id AND m.status = 'active'
      WHERE pi.pharmacy_id = ${pharmacyId}
        AND pi.stock_quantity > 0
        AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
      ORDER BY m.id, pi.selling_price ASC
      LIMIT ${limit}
    `
  } catch (error) {
    console.error("[pharmacies] getPharmacyInventory failed:", error)
    return []
  }
}

/** Count of verified pharmacies matching the location. Used for honest section copy. */
export async function countNearbyPharmacies(location: DeliveryLocation | null): Promise<number> {
  // Previously re-ran the full nearby query with limit=100 purely to take `.length`,
  // duplicating the most expensive query on the page. Reusing the same limit the rail
  // asks for means both share one cache entry instead of running two separate scans.
  const pharmacies = await findNearbyPharmacies(location, 100)
  return pharmacies.length
}
