import Link from "next/link"
import { Suspense } from "react"

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { FaqSection } from "@/components/faq-section"
import { JsonLd } from "@/components/seo/json-ld"
import { SupportSection } from "@/components/support-section"
import { ArticlesTeaser } from "@/components/home/articles-teaser"
import { AvailableNearYou } from "@/components/home/available-near-you"
import { BestValue, ThemedRails } from "@/components/home/best-value"
import { Bestsellers } from "@/components/home/bestsellers"
import { FeaturedMedicines } from "@/components/home/featured-medicines"
import { CategoryTiles } from "@/components/home/category-tiles"
import { DoctorsRail } from "@/components/home/doctors-rail"
import { HealthConditionsRail, type HealthCondition } from "@/components/home/health-conditions-rail"
import { HealthPackages } from "@/components/home/health-packages"
import { Hero } from "@/components/home/hero"
import { NearbyPharmacies } from "@/components/home/nearby-pharmacies"
import { PopularBrands } from "@/components/home/popular-brands"
import { QuickActions } from "@/components/home/quick-actions"
import { ReorderStrip } from "@/components/home/reorder-strip"
import { SeoLinks } from "@/components/home/seo-links"
import { TopManufacturers } from "@/components/home/top-manufacturers"
import { TrustStrip } from "@/components/home/trust-strip"
import { cachedPublic, TAGS, TTL } from "@/lib/cache"
import { query } from "@/lib/db"
import { HOME_TOP_FAQS } from "@/lib/faqs"
import { buildMetadata, faqJsonld } from "@/lib/seo"
import { SITE } from "@/lib/site"

export const metadata = buildMetadata({
  description: SITE.description,
  path: "/",
  keywords: [
    "online medicine delivery India",
    "buy prescription medicines online",
    "generic medicine substitutes",
    "order medicines online",
  ],
})

/**
 * Homepage.
 *
 * Rebuilt around one finding: the page was a brochure. Roughly 1,700 words, four
 * photographs, no `font-bold` anywhere, ten separate prescription calls-to-action, and
 * nine section headings styled identically so nothing looked more important than anything
 * else. For someone in Patna on a cheap Android that is a wall of small grey text with
 * nothing to look at.
 *
 * The rebuild inverts that. Every shopping section leads with real photography from live
 * pharmacy inventory, headings are bold and sized in three tiers, body copy has a 16px
 * floor, and there is exactly one prescription CTA in the page body.
 *
 * Sections are ordered by what a first-time visitor needs, and every data-driven one
 * returns `null` rather than rendering a heading over an empty grid — so an early-stage
 * marketplace reads as a short, deliberate page instead of a broken one.
 */

// Kept for the data cache. Note the page itself is dynamic regardless: Header reads
// cookies for the session and the delivery location, so this does not make it static.
export const revalidate = 300

async function loadHealthConditions(): Promise<HealthCondition[]> {
  try {
    return await query<HealthCondition>`
      SELECT id, name, slug, description, icon
      FROM health_conditions
      WHERE is_active
      ORDER BY display_order ASC
      LIMIT 15
    `
  } catch (error) {
    console.error("[homepage] health conditions failed:", error)
    return []
  }
}

/**
 * Cached: the health-condition taxonomy is seeded data that changes only when an admin
 * edits it, yet it was queried on every homepage render.
 */
const getHealthConditions = cachedPublic(loadHealthConditions, ["health-conditions-rail"], {
  revalidate: TTL.TAXONOMY,
  tags: [TAGS.taxonomy],
})

/** Fixed-height placeholder so streaming a section in cannot shift the page. */
function RailSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="page-container py-8">
      <div className={`skeleton ${height} w-full`} />
    </div>
  )
}

async function HealthConditions() {
  const conditions = await getHealthConditions()
  return <HealthConditionsRail conditions={conditions} />
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="main-content" className="flex-1">
        {/* Search, one bold line, and real product photography — above the fold. */}
        <Suspense fallback={<RailSkeleton height="h-72" />}>
          <Hero />
        </Suspense>

        <QuickActions />

        <TrustStrip />

        {/* Signed-in customers with delivered orders only; silent otherwise. */}
        <Suspense fallback={null}>
          <ReorderStrip />
        </Suspense>

        {/* The catalogue's real pack photography. Independent of pharmacy stock, so the page
            has something to look at before the first pharmacy lists anything. */}
        <Suspense fallback={<RailSkeleton />}>
          <FeaturedMedicines />
        </Suspense>

        {/* Leads the browse blocks: most people arrive with a problem ("acidity",
            "blood pressure") rather than a product or a shelf name, so the first thing
            offered is the one they can answer without knowing any brand. */}
        <Suspense fallback={<RailSkeleton height="h-56" />}>
          <HealthConditions />
        </Suspense>

        {/* Then by shelf, with the page's first block of real photography. */}
        <Suspense fallback={<RailSkeleton height="h-56" />}>
          <CategoryTiles />
        </Suspense>

        <Suspense fallback={<RailSkeleton />}>
          <BestValue />
        </Suspense>

        {/* Location-driven: which nearby pharmacy has it, and for how much. */}
        <Suspense fallback={<RailSkeleton />}>
          <AvailableNearYou />
        </Suspense>

        {/* Whichever shelves are actually stocked deeply enough to fill a rail. */}
        <Suspense fallback={<RailSkeleton />}>
          <ThemedRails />
        </Suspense>

        <Suspense fallback={<RailSkeleton height="h-48" />}>
          <NearbyPharmacies />
        </Suspense>

        {/* Both silent until real data exists — see the note in each component. */}
        <Suspense fallback={null}>
          <HealthPackages />
        </Suspense>

        <Suspense fallback={null}>
          <PopularBrands />
        </Suspense>

        {/* Browse by maker. Unlike PopularBrands above — which is scoped to what is on a
            shelf today and so is silent at launch — this counts the whole active
            catalogue, where 75 real manufacturers each have hundreds of products. */}
        <Suspense fallback={<RailSkeleton height="h-40" />}>
          <TopManufacturers />
        </Suspense>

        {/* Renders only once there is enough real order history to rank honestly. */}
        <Suspense fallback={null}>
          <Bestsellers />
        </Suspense>

        {/* Silent until the first verified doctor is onboarded. */}
        <Suspense fallback={null}>
          <DoctorsRail />
        </Suspense>

        {/* The safety net, placed where someone who did not find their medicine is
            most likely to give up. */}
        <SupportSection />

        <Suspense fallback={null}>
          <ArticlesTeaser />
        </Suspense>

        {/* ---- Partner CTAs -------------------------------------------------- */}
        <section aria-labelledby="partner-heading" className="border-t border-border py-8">
          <div className="page-container">
            <h2 id="partner-heading" className="home-h3">
              Run a pharmacy or supply medicines?
            </h2>
            <p className="home-meta mt-1">
              <Link href="/pharmacy/register" className="home-link">
                List your pharmacy
              </Link>
              <span className="mx-2">·</span>
              <Link href="/distributor/register" className="home-link">
                Register as a distributor
              </Link>
            </p>
          </div>
        </section>

        {/* Four questions, not eight. Every answer ships in the initial HTML even while
            collapsed, so the other four now live on /faq instead of costing every
            first-time visitor ~220 words of hidden text. */}
        <FaqSection
          faqs={HOME_TOP_FAQS}
          description={`Common questions about ordering medicines on ${SITE.name}.`}
          moreHref="/faq"
        />

        <Suspense fallback={null}>
          <SeoLinks />
        </Suspense>

        {/* Mirrors exactly the questions rendered above — Google requires FAQPage markup
            to match what the visitor can actually see on the page. */}
        <JsonLd data={faqJsonld(HOME_TOP_FAQS)} id="ld-home-faq" />
      </main>

      <Footer />
    </div>
  )
}
