import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, getSessionFromToken, type EdgeSession } from "@/lib/auth-edge"

/**
 * Route protection.
 *
 * This replaces the old `proxy.ts`, which exported a function named `proxy()` from the
 * repo root. Next.js only ever loads `middleware.ts` exporting `middleware()`, so that
 * file never ran and none of the app's route guards were actually enforced.
 */

type Role = EdgeSession["userType"]

/**
 * Prefixes that require a signed-in user of one of the listed roles.
 *
 * The /api/* entries matter as much as the page ones: a page guard does nothing for
 * someone calling the JSON endpoint directly. Route handlers still call requireRole()
 * themselves — this is defence in depth, not a replacement.
 */
const ROLE_RULES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/api/admin", roles: ["admin"] },
  { prefix: "/pharmacy", roles: ["pharmacy", "admin"] },
  { prefix: "/api/pharmacy", roles: ["pharmacy", "admin"] },
  { prefix: "/distributor", roles: ["distributor", "admin"] },
  { prefix: "/api/distributor", roles: ["distributor", "admin"] },
  { prefix: "/cart", roles: ["customer"] },
  { prefix: "/api/cart", roles: ["customer"] },
  { prefix: "/api/cart-with-sellers", roles: ["customer"] },
  { prefix: "/checkout", roles: ["customer"] },
  { prefix: "/order-success", roles: ["customer"] },
  { prefix: "/upload-prescription", roles: ["customer"] },
  { prefix: "/api/orders/create", roles: ["customer"] },
]

/** Prefixes that require a signed-in user of any role. */
const AUTHENTICATED_PREFIXES = [
  "/dashboard",
  "/orders",
  "/api/orders",
  "/prescriptions",
  "/api/prescriptions",
  "/profile",
  "/addresses",
  "/wishlist",
  "/api/wishlist",
  "/api/procurement",
]

/**
 * Public escape hatches that sit underneath a protected prefix. Registration pages live
 * at /pharmacy/register and /distributor/register but must be reachable by signed-out
 * visitors — otherwise nobody can ever become a pharmacy or distributor.
 */
const PUBLIC_EXCEPTIONS = [
  "/pharmacy/register",
  "/distributor/register",
  // Creates the user account and the distributor profile in one call, so it has to be
  // reachable before a session exists.
  "/api/distributor/register",
]

/** Where each role lands when it hits a route it isn't allowed to see. */
const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  pharmacy: "/pharmacy/dashboard",
  distributor: "/distributor/dashboard",
  customer: "/dashboard",
}

function isApi(pathname: string) {
  return pathname.startsWith("/api/")
}

function matchPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The one-time admin bootstrap page must never be reachable on a live site.
  if (matchPrefix(pathname, "/create-admin") && process.env.NODE_ENV === "production") {
    return NextResponse.rewrite(new URL("/404", request.url))
  }

  if (PUBLIC_EXCEPTIONS.some((p) => matchPrefix(pathname, p))) {
    return NextResponse.next()
  }

  const roleRule = ROLE_RULES.find((rule) => matchPrefix(pathname, rule.prefix))
  const needsAuthOnly = AUTHENTICATED_PREFIXES.some((p) => matchPrefix(pathname, p))

  if (!roleRule && !needsAuthOnly) {
    return NextResponse.next()
  }

  const session = await getSessionFromToken(request.cookies.get(SESSION_COOKIE)?.value)

  if (!session) {
    // API callers get a JSON 401; they should not be handed an HTML login page.
    if (isApi(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const signInUrl = new URL("/signin", request.url)
    signInUrl.searchParams.set("redirect", pathname + request.nextUrl.search)
    return NextResponse.redirect(signInUrl)
  }

  if (roleRule && !roleRule.roles.includes(session.userType)) {
    if (isApi(pathname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    // Send them somewhere useful for their role rather than bouncing to "/".
    return NextResponse.redirect(new URL(ROLE_HOME[session.userType] ?? "/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Run on everything except Next internals, static assets, and the SEO files that
     * must stay publicly crawlable.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|woff2?)$).*)",
  ],
}
