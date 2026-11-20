import Link from "next/link"
import { sql } from "@/lib/db"
import { CATEGORY_GROUPS } from "@/lib/categories"
import { MedicineCard } from "./medicine-card"

interface Medicine {
  id: number
  name: string
  /** Canonical URL segment. Without it MedicineCard falls back to the numeric id, so
   *  every internal link pointed at a non-canonical URL. */
  slug: string | null
  generic_name: string | null
  manufacturer: string | null
  category: string | null
  form: string | null
  strength: string | null
  pack_size: string | null
  requires_prescription: boolean
  mrp: string
  image_url: string | null
  photo_url: string | null
  status: string
  /**
   * 1 when the row has a genuinely renderable picture, 0 otherwise. Computed in SQL so
   * the ordering and the rendering agree — see HAS_IMAGE below.
   */
  has_image: number
  selling_price: string | null
  discount_percentage: string | null
  pharmacy_id: number | null
  pharmacy_name: string | null
  stock_quantity?: number | null
  /** Real aggregates from medicine_reviews; null when the medicine has no reviews. */
  average_rating?: string | number | null
  review_count?: number | null
}

/* ---------------------------------------------------------------------------
 * Image-first ordering
 *
 * Whether a row has a picture worth leading with.
 *
 * Deliberately stricter than "the column is not empty", which is what the ordering used to
 * test. Three medicines store the literal string "/placeholder.svg?height=100&width=100" in
 * `image_url`, so under the old rule they sorted to the very top of the catalogue and then
 * rendered a grey placeholder — the exact opposite of what the sort was for.
 *
 * `photo_url` is checked first because that is the order `medicineImageSrc` resolves in, so
 * a row can never sort as "has image" and then render the fallback.
 *
 * Written out inline in each query rather than shared: Neon's tagged template executes on
 * evaluation and cannot compose fragments, and interpolating a string would bind it as a
 * parameter instead of SQL text.
 * ------------------------------------------------------------------------- */

async function getShowAllMedicinesSetting() {
  try {
    const result = await sql`
      SELECT setting_value FROM platform_settings
      WHERE setting_key = 'show_all_medicines_on_homepage'
      LIMIT 1
    `
    return result.length > 0 ? result[0].setting_value === "true" : false
  } catch (error) {
    console.error("[medicine-list] Error fetching settings:", error)
    return false
  }
}

export async function MedicineList({
  searchParams,
}: {
  searchParams: { search?: string; category?: string; group?: string; brand?: string; price?: string; manufacturer?: string; rating?: string; availability?: string; prescription?: string; dosage?: string; discount?: string; sort?: string; view?: string; page?: string } | Promise<{ search?: string; category?: string; group?: string; brand?: string; price?: string; manufacturer?: string; rating?: string; availability?: string; prescription?: string; dosage?: string; discount?: string; sort?: string; view?: string; page?: string }>
}) {
  const params = await searchParams
  const searchQuery = params.search || ""
  const category = params.category || ""

  /**
   * `?group=` is the curated category key used by the homepage tiles and the footer link
   * block — "vitamins", "pain-relief", "antibiotics".
   *
   * It has to be applied in SQL rather than in the post-filter below, because the queries
   * here are capped at 250–500 rows: filtering after the cap would silently return "no
   * matches" for any group whose products sort past it. `ILIKE ANY(array)` keeps the
   * statement a single parameterised query, with the patterns passed as a parameter
   * rather than spliced into the SQL text.
   */
  const groupKey = params.group || ""
  const groupPatterns = groupKey
    ? (CATEGORY_GROUPS.find((entry) => entry.key === groupKey)?.patterns ?? []).map((p) => `%${p}%`)
    : []
  const hasGroupFilter = groupPatterns.length > 0

  // Brand pages link with the normalised key ("cachet"); a substring match against the
  // raw manufacturer string is close enough and needs no schema change.
  const brandFilter = params.brand || ""
  const brandLike = `%${brandFilter}%`
  const priceFilter = params.price || ""
  const manufacturerFilter = params.manufacturer || ""
  const ratingFilter = params.rating || ""
  const availabilityFilter = params.availability || ""
  const prescriptionFilter = params.prescription || ""
  const dosageFilter = params.dosage || ""
  const discountFilter = params.discount || ""
  const sort = params.sort || "relevance"
  const view = params.view || "grid"
  const page = Number.parseInt(params.page || "1", 10) || 1

  let medicines: Medicine[] = []

  try {
    const q = searchQuery.trim()
    const qLike = `%${q}%`

    const showAllMedicines = await getShowAllMedicinesSetting()

    if (showAllMedicines) {
      medicines = (await sql`
        SELECT
          m.id,
          m.name,
          m.slug,
          m.generic_name,
          m.manufacturer,
          m.category,
          m.form,
          m.strength,
          m.pack_size,
          -- description is deliberately NOT selected. It averages ~1.8 KB per row and was
          -- 89% of this query's payload, but the card grid never renders it: MedicineCardData
          -- has no description field. Selecting it moved ~1.5 MB per request for nothing.
          -- The product page fetches it per-medicine, which is where it is actually shown.
          m.requires_prescription,
          m.mrp,
          m.image_url,
          m.photo_url,
          CASE
            WHEN COALESCE(NULLIF(btrim(m.photo_url), ''), NULLIF(btrim(m.image_url), '')) IS NOT NULL
             AND COALESCE(NULLIF(btrim(m.photo_url), ''), btrim(m.image_url)) NOT ILIKE '%placeholder%'
            THEN 1 ELSE 0
          END AS has_image,
          m.status,
          NULL as selling_price,
          NULL as discount_percentage,
          NULL as pharmacy_id,
          NULL as pharmacy_name,
          rv.average_rating,
          rv.review_count
        FROM medicines m
        LEFT JOIN LATERAL (
          SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::int AS review_count
          FROM medicine_reviews mr
          WHERE mr.medicine_id = m.id AND mr.status = 'published'
        ) rv ON true
        WHERE m.status = 'active'
          AND (${q === ""} OR (m.name ILIKE ${qLike} OR m.generic_name ILIKE ${qLike}))
          AND (${category === ""} OR m.category = ${category})
          AND (${!hasGroupFilter} OR m.category ILIKE ANY(${groupPatterns}))
          AND (${brandFilter === ""} OR m.manufacturer ILIKE ${brandLike})
        -- Photographed products first. A grid that opens on grey placeholders reads as an
        -- empty shop, so anything with a real pack shot leads.
        ORDER BY has_image DESC, LOWER(m.name) ASC
        LIMIT 1000
      `) as Medicine[]
    } else {
      medicines = (await sql`
        WITH best_offers AS (
          SELECT DISTINCT ON (m.id)
            m.id,
            m.name,
            m.slug,
            m.generic_name,
            m.manufacturer,
            m.category,
            m.form,
            m.strength,
            m.pack_size,
            -- See the note in the branch above: not selected, never rendered.
            -- (No backticks in these comments: this is a tagged template literal.)
            m.requires_prescription,
            m.mrp,
            m.image_url,
            m.photo_url,
            CASE
              WHEN COALESCE(NULLIF(btrim(m.photo_url), ''), NULLIF(btrim(m.image_url), '')) IS NOT NULL
               AND COALESCE(NULLIF(btrim(m.photo_url), ''), btrim(m.image_url)) NOT ILIKE '%placeholder%'
              THEN 1 ELSE 0
            END AS has_image,
            m.status,
            pi.selling_price,
            pi.discount_percentage,
            pi.pharmacy_id,
            pi.stock_quantity,
            pp.pharmacy_name,
            rv.average_rating,
            rv.review_count
          FROM pharmacy_inventory pi
          JOIN pharmacy_profiles pp
            ON pp.id = pi.pharmacy_id
           AND pp.verification_status = 'verified'
          JOIN medicines m
            ON m.id = pi.medicine_id
          LEFT JOIN LATERAL (
            SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::int AS review_count
            FROM medicine_reviews mr
            WHERE mr.medicine_id = m.id AND mr.status = 'published'
          ) rv ON true
          WHERE m.status = 'active'
            AND pi.stock_quantity > 0
            AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
            AND (${q === ""} OR (m.name ILIKE ${qLike} OR m.generic_name ILIKE ${qLike}))
            AND (${category === ""} OR m.category = ${category})
          AND (${!hasGroupFilter} OR m.category ILIKE ANY(${groupPatterns}))
          AND (${brandFilter === ""} OR m.manufacturer ILIKE ${brandLike})
          ORDER BY
            m.id,
            COALESCE(pi.discount_percentage, 0) DESC,
            pi.selling_price ASC
        )
        SELECT *
        FROM best_offers
        -- has_image is already computed in best_offers above.
        ORDER BY has_image DESC, LOWER(name) ASC
        LIMIT 250
      `) as Medicine[]
    }
  } catch (error) {
    console.error("[medicine-list] Error fetching medicines:", error)
    return (
      <div className="rounded-[1.75rem] border border-border/70 bg-background/80 p-12 text-center">
        <p className="text-muted-foreground">Unable to load medicines. Please try again later.</p>
      </div>
    )
  }

  const normalizedMedicines = medicines
    .filter((medicine) => {
      const mrp = Number.parseFloat(String(medicine.mrp || 0))
      const sellingPrice = medicine.selling_price !== undefined && medicine.selling_price !== null
        ? Number.parseFloat(String(medicine.selling_price || 0))
        : mrp
      const finalPrice = sellingPrice > 0 ? sellingPrice : mrp
      const discountPercentage = medicine.discount_percentage !== undefined && medicine.discount_percentage !== null
        ? Number.parseFloat(String(medicine.discount_percentage || 0))
        : 0
      // Real aggregate from medicine_reviews. null means "not rated yet" — which must
      // not silently pass a "4 stars and up" filter the way the old invented rating did.
      const rating =
        medicine.review_count && Number(medicine.review_count) > 0
          ? Number(medicine.average_rating ?? 0)
          : null
      const inStock = medicine.status === "active"

      if (priceFilter === "under-100" && finalPrice >= 100) return false
      if (priceFilter === "100-500" && (finalPrice < 100 || finalPrice > 500)) return false
      if (priceFilter === "500-1000" && (finalPrice < 500 || finalPrice > 1000)) return false
      if (priceFilter === "1000-plus" && finalPrice < 1000) return false

      if (manufacturerFilter && medicine.manufacturer?.toLowerCase() !== manufacturerFilter.toLowerCase()) return false
      if (ratingFilter === "4-plus" && (rating === null || rating < 4)) return false
      if (ratingFilter === "4.5-plus" && (rating === null || rating < 4.5)) return false
      if (availabilityFilter === "in-stock" && !inStock) return false
      if (availabilityFilter === "out-of-stock" && inStock) return false
      if (prescriptionFilter === "required" && !medicine.requires_prescription) return false
      if (prescriptionFilter === "not-required" && medicine.requires_prescription) return false
      if (dosageFilter && medicine.form?.toLowerCase() !== dosageFilter.toLowerCase()) return false
      if (discountFilter === "yes" && discountPercentage <= 0) return false

      return true
    })
    .sort((first, second) => {
      const firstFinalPrice = Number.parseFloat(String(first.selling_price || first.mrp || 0))
      const secondFinalPrice = Number.parseFloat(String(second.selling_price || second.mrp || 0))
      // Unrated products sort last rather than being assigned a flattering default.
      const firstRating = Number(first.average_rating ?? -1)
      const secondRating = Number(second.average_rating ?? -1)

      // Photographed products first, always.
      //
      // This was the actual reason images did not lead the grid: the SQL already ordered
      // `has_image DESC`, and then this comparator re-sorted the whole page alphabetically
      // in the default case, throwing that ordering away.
      //
      // It applies as the primary key in the default view and as a tiebreaker under an
      // explicit sort — so "price: low to high" still sorts by price, but two items at the
      // same price put the one with a pack shot first.
      const byImage = Number(second.has_image ?? 0) - Number(first.has_image ?? 0)

      switch (sort) {
        case "price_low":
          return firstFinalPrice - secondFinalPrice || byImage
        case "price_high":
          return secondFinalPrice - firstFinalPrice || byImage
        case "rating":
          return secondRating - firstRating || byImage
        case "name":
          return first.name.localeCompare(second.name) || byImage
        default:
          return byImage || first.name.localeCompare(second.name)
      }
    })

  if (normalizedMedicines.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-border/70 bg-background/80 p-12 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">No matches found</h2>
        <p className="mt-3 text-muted-foreground">Try a broader search or clear a few filters to see more options.</p>
      </div>
    )
  }

  // 52 fills the 2- and 4-column grids exactly (13 full rows of 4).
  const medicinesPerPage = 52
  const totalPages = Math.max(1, Math.ceil(normalizedMedicines.length / medicinesPerPage))
  const safePage = Math.min(page, totalPages)
  const visibleMedicines = normalizedMedicines.slice((safePage - 1) * medicinesPerPage, safePage * medicinesPerPage)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-border/70 bg-background/80 px-4 py-3 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{visibleMedicines.length}</span> of <span className="font-semibold text-foreground">{normalizedMedicines.length}</span> medicines
        </p>
        <div className="text-sm text-muted-foreground">Layout: {view === "list" ? "List" : "Grid"}</div>
      </div>

      <div className={view === "list" ? "space-y-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"}>
        {visibleMedicines.map((medicine) => (
          <MedicineCard key={medicine.id} medicine={medicine} />
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-[1.75rem] border border-border/70 bg-background/80 p-3 shadow-sm">
          <Link
            href={{ pathname: "/medicines", query: { ...params, page: Math.max(1, safePage - 1) } }}
            className="rounded-full border border-border/70 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Previous
          </Link>
          {Array.from({ length: totalPages }, (_, index) => index + 1)
            // First, last and two either side of the current page; the rest collapse to "…".
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
            .map((pageNumber, i, shown) => {
            const isActive = pageNumber === safePage
            const gap = i > 0 && pageNumber - shown[i - 1] > 1
            return (
              <span key={pageNumber} className="contents">
              {gap ? <span className="px-1 text-muted-foreground">…</span> : null}
              <Link
                key={pageNumber}
                href={{ pathname: "/medicines", query: { ...params, page: pageNumber } }}
                className={`rounded-full px-3 py-2 text-sm transition ${isActive ? "bg-primary text-primary-foreground" : "border border-border/70 text-muted-foreground hover:text-foreground"}`}
              >
                {pageNumber}
              </Link>
              </span>
            )
          })}
          <Link
            href={{ pathname: "/medicines", query: { ...params, page: Math.min(totalPages, safePage + 1) } }}
            className="rounded-full border border-border/70 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  )
}
