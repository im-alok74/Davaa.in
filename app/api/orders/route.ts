import { NextResponse } from "next/server"

/**
 * Removed: this endpoint trusted `item.price` and `item.discount_percentage` from the
 * request body to compute order totals, with no server-side re-derivation from
 * `pharmacy_inventory` and no stock check/decrement. Any authenticated customer could
 * POST a fabricated cart (real medicine/pharmacy ids, arbitrary price) and create a real
 * order at any amount — the exact pattern `AGENT_HANDOFF.md`'s ground rules warn against
 * reintroducing. Nothing in the UI called this route; `/api/orders/create` is the
 * server-priced, transaction-wrapped replacement and is what checkout actually uses.
 *
 * Kept as a 410 rather than deleting the file so a stale client hitting the old path
 * gets a clear signal instead of a generic 404.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use /api/orders/create.", code: "GONE" },
    { status: 410 },
  )
}
