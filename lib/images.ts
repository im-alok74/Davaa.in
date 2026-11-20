/**
 * Image source validation for `next/image`.
 *
 * ## Why this exists
 *
 * `next/image` throws when `src` is an absolute URL whose host is not listed in
 * `next.config.mjs` `images.remotePatterns`. That throw happens during render, so it takes
 * out the whole page — and because the failure occurs after streaming has begun, the
 * response still returns HTTP 200 with an error boundary painted over it.
 *
 * `medicines.image_url` is free text filled in by data entry and bulk uploads. Six rows
 * currently hold values that are not images at all — Google search and `/imgres` redirect
 * links pasted from a browser address bar, plus a few strings that are not URLs. Each of
 * those rows was enough to break its entire product page.
 *
 * The rule this enforces: **a bad row degrades to a placeholder, it never breaks a page.**
 * Validating at the boundary is the durable fix; cleaning the six rows is housekeeping that
 * does not stop the seventh from being pasted tomorrow.
 */

/**
 * Hosts `next/image` is configured to optimise.
 *
 * Must stay in sync with `images.remotePatterns` in `next.config.mjs`. A host here that is
 * missing there produces exactly the crash this module exists to prevent.
 */
const ALLOWED_HOSTS = new Set([
  "res.cloudinary.com",
  "onemg.gumlet.io",
  "images.apollo247.in",
])

/** Shown when a medicine has no usable image. Lives in `public/`. */
export const PLACEHOLDER_IMAGE = "/placeholder-medicine.svg"

/**
 * Returns a value that is safe to hand to `next/image`, or null when there isn't one.
 *
 * Accepts:
 *  - local paths (`/foo.png`) and data URIs, which `next/image` serves directly
 *  - absolute http(s) URLs on an allow-listed host
 *
 * Rejects everything else, including well-formed URLs on hosts we have not configured —
 * those would throw at render time rather than merely 404.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null

  const value = raw.trim()
  if (value === "") return null

  // Local asset or inline data — no host to check.
  if (value.startsWith("/") || value.startsWith("data:image/")) return value

  let url: URL
  try {
    url = new URL(value)
  } catch {
    // Not a URL at all. Four rows in `medicines` are in this state.
    return null
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  // A Google result or image-preview link is a *page about* an image, never an image.
  // These render as an HTML document if fetched, and throw if passed to next/image.
  if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return null

  return ALLOWED_HOSTS.has(url.hostname) ? value : null
}

/**
 * Picks the first usable image from the candidates, falling back to the placeholder.
 *
 * Use this anywhere a medicine image is rendered, so the fallback rule lives in one place
 * rather than being re-derived — slightly differently — at each call site.
 */
export function medicineImageSrc(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const safe = safeImageSrc(candidate)
    if (safe) return safe
  }
  return PLACEHOLDER_IMAGE
}

/**
 * Which neutral illustration stands in for a medicine that has no photo, by dosage form.
 * Files live in `public/placeholders/`. These are deliberately generic line art: they say
 * "this is a tablet", never "this is that brand's pack".
 */
const FORM_ART: Record<string, string> = {
  tablet: "tablet",
  capsule: "capsule",
  syrup: "bottle",
  suspension: "bottle",
  solution: "bottle",
  liquid: "bottle",
  mouthwash: "bottle",
  shampoo: "bottle",
  oil: "bottle",
  injection: "vial",
  infusion: "vial",
  cream: "tube",
  ointment: "tube",
  gel: "tube",
  lotion: "tube",
  drops: "dropper",
  powder: "sachet",
  granules: "sachet",
  sachet: "sachet",
  device: "box",
  kit: "box",
  bandage: "box",
}

/** The illustration for a dosage form, or the plain placeholder when the form is unknown. */
export function placeholderForForm(form: string | null | undefined): string {
  const kind = form ? FORM_ART[form.trim().toLowerCase()] : undefined
  return kind ? `/placeholders/${kind}.svg` : PLACEHOLDER_IMAGE
}

/**
 * A real photo when there is one, otherwise the illustration for the medicine's form.
 * Prefer this over `medicineImageSrc` anywhere the medicine's `form` is to hand.
 */
export function medicineImageOrArt(
  form: string | null | undefined,
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const safe = safeImageSrc(candidate)
    if (safe) return safe
  }
  return placeholderForForm(form)
}

/** True when at least one candidate is a usable image. Use to decide whether to render
 *  an image-led layout at all, rather than showing a grid of identical placeholders. */
export function hasRealImage(...candidates: Array<string | null | undefined>): boolean {
  return candidates.some((candidate) => safeImageSrc(candidate) !== null)
}
