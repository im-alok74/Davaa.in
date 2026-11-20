import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { MedicineList } from "@/components/medicines/medicine-list"
import { MedicineFilters } from "@/components/medicines/medicine-filters"
import { MedicineToolbar } from "@/components/medicines/medicine-toolbar"
import { Skeleton } from "@/components/ui/skeleton"
import { Suspense } from "react"

export const revalidate = 0
export const dynamic = "force-dynamic"

function MedicineListFallback() {
  return (
    <div className="space-y-4">
      <div className="h-20 rounded-3xl border border-border/70 bg-background/80" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-[1.75rem] border border-border/70 bg-background/80 p-4">
            <Skeleton className="aspect-[4/3] w-full" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

type MedicinesSearchParams = {
  search?: string
  category?: string
  group?: string
  brand?: string
}

export default async function MedicinesPage({
  searchParams,
}: {
  // Next 16 passes this as a Promise. It was typed as a plain object, and the toolbar then
  // did `typeof searchParams === "object" ? searchParams.search : ""` — which is `true` for
  // a Promise, so it read `.search` off the Promise itself and always got undefined. The
  // search box never pre-filled with the active query, and the sync property access is what
  // Next was reporting in the console.
  searchParams: Promise<MedicinesSearchParams>
}) {
  const resolvedSearchParams = await searchParams

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_50%),linear-gradient(135deg,_rgba(248,250,252,0.95),_rgba(255,255,255,1))]">
        {/* Wide container and a one-line heading: the products, not the chrome, get the screen. */}
        <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Browse trusted medicines with confidence
            </h1>
            <p className="text-sm text-muted-foreground">Fast, secure delivery from licensed pharmacies</p>
          </div>

          <div className="mb-4">
            <MedicineToolbar initialQuery={resolvedSearchParams.search ?? ""} />
          </div>

          {/* Filters live in a slide-in panel opened from this button; results use the full width. */}
          <div className="mb-4">
            <MedicineFilters />
          </div>

          <div className="w-full min-w-0">
            <Suspense fallback={<MedicineListFallback />}>
              <MedicineList searchParams={resolvedSearchParams} />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
