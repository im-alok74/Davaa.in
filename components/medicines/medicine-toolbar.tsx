"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import { SearchBar } from "@/components/search-bar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MedicineToolbarProps {
  initialQuery?: string
  viewMode?: "grid" | "list"
}

export function MedicineToolbar({ initialQuery, viewMode = "grid" }: MedicineToolbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== "") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })

    const queryString = params.toString()
    router.push(`/medicines${queryString ? `?${queryString}` : ""}`)
  }

  const currentSort = searchParams.get("sort") || "relevance"
  const currentView = searchParams.get("view") || viewMode

  return (
    <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="transition hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/medicines" className="transition hover:text-foreground">
          Medicines
        </Link>
        {searchParams.get("search") ? (
          <>
            <span>/</span>
            <span className="text-foreground">{searchParams.get("search")}</span>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full max-w-2xl flex-1">
          <SearchBar initialQuery={initialQuery ?? searchParams.get("search") ?? ""} showButton={false} className="w-full" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 p-1">
            <Button
              type="button"
              size="sm"
              variant={currentView === "grid" ? "default" : "ghost"}
              className={cn("rounded-full", currentView === "grid" ? "shadow-sm" : "text-muted-foreground")}
              onClick={() => updateParams({ view: currentView === "grid" ? null : "grid" })}
            >
              <LayoutGrid className="mr-2 h-4 w-4" /> Grid
            </Button>
            <Button
              type="button"
              size="sm"
              variant={currentView === "list" ? "default" : "ghost"}
              className={cn("rounded-full", currentView === "list" ? "shadow-sm" : "text-muted-foreground")}
              onClick={() => updateParams({ view: currentView === "list" ? null : "list" })}
            >
              <List className="mr-2 h-4 w-4" /> List
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={currentSort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              className="bg-transparent text-sm outline-none"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="rating">Rating</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
