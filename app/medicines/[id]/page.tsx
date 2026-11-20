import { Suspense } from 'react'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { MedicinePdp } from '@/components/medicines/medicine-pdp'
import { MedicineAvailability } from '@/components/pharmacies/medicine-availability'
import { Substitutes } from '@/components/medicines/substitutes'
import { DrugInfo } from '@/components/medicines/drug-info'
import { StickyBuyBar } from '@/components/medicines/sticky-buy-bar'
import { JsonLd } from '@/components/seo/json-ld'
import { query } from '@/lib/db'
import { buildMetadata, breadcrumbJsonld, productJsonld } from '@/lib/seo'
import { SITE, absoluteUrl } from '@/lib/site'
import type { MedicinePdpProps, Substitute } from '@/components/medicines/medicine-pdp'

// Row shapes come straight from the component that consumes them, so the query and
// the UI can never drift apart without a type error.
type PdpMedicine = MedicinePdpProps['medicine']
type PdpReview = MedicinePdpProps['reviews'][number]
type PdpReviewStats = MedicinePdpProps['reviewStats']

type PageParams = {
  params: Promise<{ id: string }>
}

/**
 * Resolves the `[id]` segment, which may be either a numeric id or a slug.
 *
 * Slugs look like "dolo-650-tablet-1434" — the trailing number is the row id, so a slug
 * can be resolved without a second lookup even if the name later changes.
 *
 * This mattered: `app/sitemap.ts` and the homepage both emit slug URLs, but the page only
 * understood numeric ids. Every slug URL rendered an empty "not found" body — and served
 * it with HTTP 200, so search engines would have indexed thousands of blank product
 * pages as real content.
 */
function parseMedicineRef(raw: string): { id: number | null; slug: string | null } {
  const decoded = decodeURIComponent(raw).trim()

  if (/^\d+$/.test(decoded)) return { id: Number(decoded), slug: null }

  const trailingId = decoded.match(/-(\d+)$/)
  return { id: trailingId ? Number(trailingId[1]) : null, slug: decoded }
}

async function fetchMedicine(medicineId: number): Promise<PdpMedicine | null> {
  const rows = await query<PdpMedicine>`
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
      m.description,
      m.requires_prescription,
      m.mrp,
      m.image_url,
      m.photo_url,
      m.status,
      m.hsn_code,
      m.mfg_date,
      m.salt_composition,
      m.uses,
      m.how_to_use,
      m.storage_info,
      m.side_effects,
      m.precautions,
      COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
      COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
      COALESCE(pi.stock_quantity, 0) AS stock_quantity,
      pi.pharmacy_id,
      pp.pharmacy_name
    FROM medicines m
    LEFT JOIN pharmacy_inventory pi
      ON pi.medicine_id = m.id
     AND pi.stock_quantity > 0
    LEFT JOIN pharmacy_profiles pp
      ON pp.id = pi.pharmacy_id
     AND pp.verification_status = 'verified'
    WHERE m.id = ${medicineId}
      AND m.status = 'active'
    ORDER BY
      m.id,
      CASE WHEN pp.id IS NULL THEN 1 ELSE 0 END ASC,
      COALESCE(pi.discount_percentage, 0) DESC,
      COALESCE(pi.selling_price, m.mrp) ASC
    LIMIT 1
  `

  return rows[0] || null
}

/**
 * Every photo attached to the medicine, in upload order.
 *
 * `medicines.image_url` holds only the primary shot; extra pack angles and label photos
 * live in `medicine_images`. The gallery used to read the primary alone, so every
 * additional photo was stored but never shown.
 */
async function fetchGalleryImages(medicineId: number): Promise<string[]> {
  try {
    const rows = await query<{ image_url: string }>`
      SELECT image_url FROM medicine_images
      WHERE medicine_id = ${medicineId} AND COALESCE(image_url, '') <> ''
      ORDER BY id
    `
    return rows.map((row) => row.image_url)
  } catch (error) {
    console.error("[medicine page] gallery images failed:", error)
    return []
  }
}

async function fetchRelatedProducts(medicine: any) {
  const category = medicine.category
  const manufacturer = medicine.manufacturer
  const form = medicine.form

  const similarProducts = category
    ? await query<PdpMedicine>`
        SELECT DISTINCT ON (m.id)
          m.id,
          m.name,
          m.generic_name,
          m.manufacturer,
          m.category,
          m.form,
          m.strength,
          m.pack_size,
          m.description,
          m.requires_prescription,
          m.mrp,
          m.image_url,
          m.photo_url,
          m.status,
          m.hsn_code,
          m.mfg_date,
          COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
          COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
          COALESCE(pi.stock_quantity, 0) AS stock_quantity,
          pi.pharmacy_id,
          pp.pharmacy_name
        FROM medicines m
        LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id AND pi.stock_quantity > 0
        LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
        WHERE m.status = 'active'
          AND m.id <> ${medicine.id}
          AND m.category = ${category}
        ORDER BY m.id, COALESCE(pi.discount_percentage, 0) DESC, COALESCE(pi.selling_price, m.mrp) ASC
        LIMIT 6
      `
    : []

  const customersAlsoBought =
    manufacturer && form
      ? await query<PdpMedicine>`
          SELECT DISTINCT ON (m.id)
            m.id,
            m.name,
            m.generic_name,
            m.manufacturer,
            m.category,
            m.form,
            m.strength,
            m.pack_size,
            m.description,
            m.requires_prescription,
            m.mrp,
            m.image_url,
            m.photo_url,
            m.status,
            m.hsn_code,
            m.mfg_date,
            COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
            COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
            COALESCE(pi.stock_quantity, 0) AS stock_quantity,
            pi.pharmacy_id,
            pp.pharmacy_name
          FROM medicines m
          LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id AND pi.stock_quantity > 0
          LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
          WHERE m.status = 'active'
            AND m.id <> ${medicine.id}
            AND (m.manufacturer = ${manufacturer} OR m.form = ${form})
          ORDER BY m.id, COALESCE(pi.discount_percentage, 0) DESC, COALESCE(pi.selling_price, m.mrp) ASC
          LIMIT 6
        `
      : manufacturer
        ? await query<PdpMedicine>`
            SELECT DISTINCT ON (m.id)
              m.id,
              m.name,
              m.generic_name,
              m.manufacturer,
              m.category,
              m.form,
              m.strength,
              m.pack_size,
              m.description,
              m.requires_prescription,
              m.mrp,
              m.image_url,
              m.photo_url,
              m.status,
              m.hsn_code,
              m.mfg_date,
              COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
              COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
              COALESCE(pi.stock_quantity, 0) AS stock_quantity,
              pi.pharmacy_id,
              pp.pharmacy_name
            FROM medicines m
            LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id AND pi.stock_quantity > 0
            LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
            WHERE m.status = 'active'
              AND m.id <> ${medicine.id}
              AND m.manufacturer = ${manufacturer}
            ORDER BY m.id, COALESCE(pi.discount_percentage, 0) DESC, COALESCE(pi.selling_price, m.mrp) ASC
            LIMIT 6
          `
        : form
          ? await query<PdpMedicine>`
              SELECT DISTINCT ON (m.id)
                m.id,
                m.name,
                m.generic_name,
                m.manufacturer,
                m.category,
                m.form,
                m.strength,
                m.pack_size,
                m.description,
                m.requires_prescription,
                m.mrp,
                m.image_url,
                m.photo_url,
                m.status,
                m.hsn_code,
                m.mfg_date,
                COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
                COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
                COALESCE(pi.stock_quantity, 0) AS stock_quantity,
                pi.pharmacy_id,
                pp.pharmacy_name
              FROM medicines m
              LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id AND pi.stock_quantity > 0
              LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
              WHERE m.status = 'active'
                AND m.id <> ${medicine.id}
                AND m.form = ${form}
              ORDER BY m.id, COALESCE(pi.discount_percentage, 0) DESC, COALESCE(pi.selling_price, m.mrp) ASC
              LIMIT 6
            `
          : []

  const recommendations = await query<PdpMedicine>`
    SELECT DISTINCT ON (m.id)
      m.id,
      m.name,
      m.generic_name,
      m.manufacturer,
      m.category,
      m.form,
      m.strength,
      m.pack_size,
      m.description,
      m.requires_prescription,
      m.mrp,
      m.image_url,
      m.photo_url,
      m.status,
      m.hsn_code,
      m.mfg_date,
      COALESCE(pi.selling_price::text, m.mrp::text) AS selling_price,
      COALESCE(pi.discount_percentage::text, '0') AS discount_percentage,
      COALESCE(pi.stock_quantity, 0) AS stock_quantity,
      pi.pharmacy_id,
      pp.pharmacy_name
    FROM medicines m
    LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id AND pi.stock_quantity > 0
    LEFT JOIN pharmacy_profiles pp ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
    WHERE m.status = 'active'
      AND m.id <> ${medicine.id}
    ORDER BY
      m.id,
      COALESCE(pi.discount_percentage, 0) DESC,
      COALESCE(pi.stock_quantity, 0) DESC,
      COALESCE(pi.selling_price, m.mrp) ASC
    LIMIT 6
  `

  return {
    similarProducts,
    customersAlsoBought,
    recommendations,
  }
}

/**
 * Medicines sharing this one's salt composition — the "cheaper alternative" list.
 *
 * Matching is on normalised salt_composition plus strength, so a 650mg paracetamol is
 * never offered as a substitute for a 500mg one. Falls back to generic_name when
 * salt_composition has not been populated for a row yet.
 */
async function fetchSubstitutes(medicine: PdpMedicine): Promise<Substitute[]> {
  const salt = (medicine.salt_composition || medicine.generic_name || '').trim()
  if (!salt) return []

  try {
    return await query<Substitute>`
      SELECT DISTINCT ON (m.id)
        m.id, m.name, m.slug, m.manufacturer, m.strength, m.pack_size,
        m.image_url, m.photo_url, m.mrp, m.requires_prescription,
        pi.selling_price, pi.discount_percentage
      FROM medicines m
      JOIN pharmacy_inventory pi
        ON pi.medicine_id = m.id AND pi.stock_quantity > 0
      JOIN pharmacy_profiles pp
        ON pp.id = pi.pharmacy_id AND pp.verification_status = 'verified'
      WHERE m.id <> ${medicine.id}
        AND m.status = 'active'
        AND LOWER(TRIM(COALESCE(m.salt_composition, m.generic_name, ''))) = LOWER(${salt})
        -- Same strength, or strength unknown on either side.
        AND (
          m.strength IS NULL
          OR ${medicine.strength}::text IS NULL
          OR LOWER(TRIM(m.strength)) = LOWER(TRIM(${medicine.strength}))
        )
      ORDER BY m.id, pi.selling_price ASC
      LIMIT 12
    `
  } catch (error) {
    console.error('[pdp] substitutes lookup failed:', error)
    return []
  }
}

async function fetchReviews(medicineId: number) {
  const reviews = await query<PdpReview>`
    SELECT
      mr.id,
      mr.rating,
      mr.title,
      mr.review_text,
      mr.is_verified_purchase,
      mr.created_at,
      u.full_name,
      u.user_type
    FROM medicine_reviews mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.medicine_id = ${medicineId}
    ORDER BY mr.created_at DESC
    LIMIT 50
  `

  const stats = await query<PdpReviewStats>`
    SELECT
      COUNT(*)::int AS total_reviews,
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
      COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
      COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
      COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
      COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
    FROM medicine_reviews
    WHERE medicine_id = ${medicineId}
  `

  return {
    reviews,
    reviewStats: stats[0] || {
      total_reviews: 0,
      average_rating: 0,
      five_star: 0,
      four_star: 0,
      three_star: 0,
      two_star: 0,
      one_star: 0,
    },
  }
}

/** Shared by generateMetadata and the page so the row is fetched once per request. */
async function resolveMedicine(raw: string): Promise<PdpMedicine | null> {
  const { id } = parseMedicineRef(raw)
  if (id === null) return null
  return fetchMedicine(id)
}

/** Canonical path for a medicine: always the slug when one exists. */
function medicinePath(medicine: PdpMedicine): string {
  return `/medicines/${(medicine as { slug?: string | null }).slug || medicine.id}`
}

export async function generateMetadata({ params }: PageParams) {
  const { id: rawId } = await params
  const medicine = await resolveMedicine(rawId)

  // Bailing out here rather than in the page body is what makes the response an actual
  // HTTP 404. generateMetadata runs before the HTML shell is flushed; by the time the
  // page component runs, streaming has begun and Next can no longer change the status
  // line, so a notFound() there renders the 404 page with a misleading 200.
  if (!medicine) {
    notFound()
  }

  const parts = [medicine.name, medicine.strength, medicine.pack_size].filter(Boolean)
  const title = parts.join(' ')

  const descriptionBits = [
    `Buy ${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''} online`,
    medicine.manufacturer ? `by ${medicine.manufacturer}` : null,
    `from a verified pharmacy on ${SITE.name}.`,
    medicine.requires_prescription
      ? 'Prescription required.'
      : 'Available without a prescription.',
    `Delivered in ${SITE.promise.deliveryWindow}.`,
  ].filter(Boolean)

  return buildMetadata({
    title,
    description: descriptionBits.join(' ').slice(0, 300),
    path: medicinePath(medicine),
    image: medicine.photo_url || medicine.image_url || undefined,
    keywords: [
      `buy ${medicine.name} online`,
      medicine.generic_name ? `${medicine.generic_name} tablets` : '',
      medicine.manufacturer ? `${medicine.manufacturer} medicines` : '',
      `${medicine.name} price`,
    ].filter(Boolean),
  })
}

export default async function MedicineDetailPage({ params }: PageParams) {
  const { id: rawId } = await params
  const { id: parsedId } = parseMedicineRef(rawId)

  if (parsedId === null) {
    notFound()
  }

  const medicine = await fetchMedicine(parsedId)

  if (!medicine) {
    notFound()
  }

  /**
   * One product, one canonical URL — enforced with <link rel="canonical">, not a redirect.
   *
   * A `permanentRedirect()` here does not work reliably: by the time the medicine row has
   * been fetched the response has already begun streaming, so Next cannot change the
   * status line and the throw surfaces as a rendered 404 instead of a 308. Both /1434 and
   * /cadbe-drops-15-ml-1434 therefore serve the page, and the canonical tag (set in
   * generateMetadata) tells search engines which one to index. This is the standard
   * e-commerce approach and avoids a database round trip in middleware on every request.
   */
  const canonicalPath = medicinePath(medicine)

  const [relatedProducts, { reviews, reviewStats }, substitutes, galleryImages] = await Promise.all([
    fetchRelatedProducts(medicine),
    fetchReviews(medicine.id),
    fetchSubstitutes(medicine),
    fetchGalleryImages(medicine.id),
  ])

  const listPrice = Number(medicine.selling_price ?? medicine.mrp ?? 0)
  const discountPct = Number(medicine.discount_percentage ?? 0)
  const finalPrice = discountPct > 0 ? listPrice - listPrice * (discountPct / 100) : listPrice
  const reviewCount = Number(reviewStats?.total_reviews ?? 0)
  const averageRating = Number(reviewStats?.average_rating ?? 0)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">
        <MedicinePdp
          medicine={medicine}
          galleryImages={galleryImages}
          reviews={reviews}
          reviewStats={reviewStats}
          similarProducts={relatedProducts.similarProducts}
          customersAlsoBought={relatedProducts.customersAlsoBought}
          recommendations={relatedProducts.recommendations}
        />

        {/* Streamed separately: the comparison runs a location-scoped inventory query,
            and the rest of the product page should not wait on it. */}
        <div className="page-container pb-6">
          <Suspense fallback={<div className="skeleton h-48 w-full" />}>
            <MedicineAvailability medicineId={medicine.id} medicineName={medicine.name} />
          </Suspense>
        </div>

        <div className="page-container grid gap-4 pb-10 lg:grid-cols-2">
          <Substitutes substitutes={substitutes} current={medicine} />
          <DrugInfo medicine={medicine} />
        </div>
      </div>

      <StickyBuyBar
        medicineId={medicine.id}
        name={medicine.name}
        price={finalPrice}
        inStock={Number(medicine.stock_quantity ?? 0) > 0}
        requiresPrescription={medicine.requires_prescription}
      />

      <JsonLd
        id="ld-product"
        data={productJsonld({
          name: medicine.name,
          description: medicine.description,
          image: medicine.photo_url || medicine.image_url,
          brand: medicine.manufacturer,
          sku: medicine.id,
          price: finalPrice,
          inStock: Number(medicine.stock_quantity ?? 0) > 0,
          url: absoluteUrl(canonicalPath),
          // Only passed when reviews genuinely exist; productJsonld drops
          // aggregateRating otherwise. Fabricating it is a policy violation.
          ratingValue: reviewCount > 0 ? averageRating : null,
          reviewCount: reviewCount > 0 ? reviewCount : null,
        })}
      />

      <JsonLd
        id="ld-product-breadcrumb"
        data={breadcrumbJsonld([
          { name: 'Home', path: '/' },
          { name: 'Medicines', path: '/medicines' },
          ...(medicine.category
            ? [{
                name: medicine.category,
                path: `/medicines?category=${encodeURIComponent(medicine.category)}`,
              }]
            : []),
          { name: medicine.name, path: canonicalPath },
        ])}
      />

      <Footer />
    </div>
  )
}
