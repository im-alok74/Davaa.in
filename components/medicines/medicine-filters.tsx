"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react"

import { CATEGORY_GROUPS } from "@/lib/categories"
import { cn } from "@/lib/utils"

type Option = { label: string; value: string }
type Group = { param: string; title: string; options: Option[]; open?: boolean }

// Manufacturer values must equal the stored string (compared case-insensitively).
const GROUPS: Group[] = [
  { param: "group", title: "Categories", options: CATEGORY_GROUPS.map((g) => ({ label: g.label, value: g.key })), open: true },
  {
    param: "price",
    title: "Price",
    open: true,
    options: [
      { label: "Under ₹100", value: "under-100" },
      { label: "₹100 – ₹500", value: "100-500" },
      { label: "₹500 – ₹1000", value: "500-1000" },
      { label: "₹1000 & above", value: "1000-plus" },
    ],
  },
  {
    param: "manufacturer",
    title: "Brand",
    options: [
      { label: "Cachet", value: "Cachet Pharmaceuticals Pvt. Ltd." },
      { label: "HMD", value: "Hindustan Syringes & Medical Devices Ltd." },
      { label: "Cipla", value: "Cipla" },
      { label: "Abbott", value: "Abbott" },
      { label: "Lupin", value: "Lupin" },
      { label: "Mankind", value: "Mankind" },
      { label: "GSK", value: "GSK" },
      { label: "Sanofi", value: "Sanofi" },
    ],
  },
  {
    param: "dosage",
    title: "Dosage form",
    options: ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops"].map((d) => ({ label: d, value: d })),
  },
  {
    param: "prescription",
    title: "Prescription",
    options: [
      { label: "Prescription required", value: "required" },
      { label: "No prescription needed", value: "not-required" },
    ],
  },
  {
    param: "availability",
    title: "Availability",
    options: [
      { label: "In stock", value: "in-stock" },
      { label: "Out of stock", value: "out-of-stock" },
    ],
  },
  {
    param: "rating",
    title: "Customer rating",
    options: [
      { label: "4★ & above", value: "4-plus" },
      { label: "4.5★ & above", value: "4.5-plus" },
    ],
  },
  { param: "discount", title: "Offers", options: [{ label: "Discounted items", value: "yes" }] },
]

const KEYS = GROUPS.map((g) => g.param)

type Draft = Record<string, string>

function Accordion({ group, draft, onToggle }: { group: Group; draft: Draft; onToggle: (param: string, value: string) => void }) {
  const [open, setOpen] = useState(Boolean(group.open) || Boolean(draft[group.param]))
  return (
    <section className="border-b border-border/70 px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{group.title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-1 gap-0.5">
          {group.options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-foreground/90 hover:text-foreground">
              <input
                type="checkbox"
                checked={draft[group.param] === option.value}
                onChange={() => onToggle(group.param, option.value)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded-sm accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * A "Filters" button that opens a slide-in panel. Choices are held locally until
 * "Apply filters" — then the URL updates once, the panel closes and the results refresh.
 */
export function MedicineFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<Draft>({})

  useEffect(() => setMounted(true), [])

  const applied: Draft = {}
  for (const key of KEYS) {
    const v = searchParams.get(key)
    if (v) applied[key] = v
  }
  const appliedCount = Object.keys(applied).length

  const openPanel = () => {
    setDraft(applied)
    setOpen(true)
  }

  // Esc closes; the page behind does not scroll while the panel is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const push = (next: Draft) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const key of KEYS) {
      if (next[key]) params.set(key, next[key])
      else params.delete(key)
    }
    // The old exact-match category param can never match the curated groups.
    params.delete("category")
    params.delete("page")
    router.push(`/medicines${params.toString() ? `?${params.toString()}` : ""}`)
  }

  const apply = () => {
    push(draft)
    setOpen(false)
  }

  const toggle = (param: string, value: string) =>
    setDraft((d) => {
      const next = { ...d }
      if (next[param] === value) delete next[param]
      else next[param] = value
      return next
    })

  const labelFor = (param: string, value: string) =>
    GROUPS.find((g) => g.param === param)?.options.find((o) => o.value === value)?.label ?? value

  const draftCount = Object.keys(draft).length

  const panel = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-[70] flex w-[88%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Filters</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Remounted on every open so each block re-reads the starting selection. */}
          {open ? GROUPS.map((group) => <Accordion key={group.param} group={group} draft={draft} onToggle={toggle} />) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-border/70 bg-background px-5 py-4">
          <button
            type="button"
            onClick={() => setDraft({})}
            disabled={draftCount === 0}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Apply filters{draftCount > 0 ? ` (${draftCount})` : ""}
          </button>
        </div>
      </aside>
    </>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:border-primary/60"
      >
        <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
        Filters
        {appliedCount > 0 ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
            {appliedCount}
          </span>
        ) : null}
      </button>

      {/* Applied filters as removable tags, so the active state is visible with the panel closed. */}
      {Object.entries(applied).map(([param, value]) => (
        <button
          key={param}
          type="button"
          onClick={() => {
            const next = { ...applied }
            delete next[param]
            push(next)
          }}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
          aria-label={`Remove filter ${labelFor(param, value)}`}
        >
          {labelFor(param, value)}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
      {appliedCount > 1 ? (
        <button type="button" onClick={() => push({})} className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline">
          Clear all
        </button>
      ) : null}

      {mounted ? createPortal(panel, document.body) : null}
    </div>
  )
}
