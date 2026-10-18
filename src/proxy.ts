import { NextResponse, type NextRequest } from "next/server";
import { MISSING_CONFIG, supabaseConfig } from "@/lib/supabase/config";
import { updateSession } from "@/lib/supabase/proxy";

// Screens that need an account: signed-out visitors are sent to Log in.
// (Reset password works only right after entering the emailed code.)
const ACCOUNT_ONLY = [
  "/home",
  "/chat",
  "/track",
  "/bookings",
  "/profile",
  "/services",
  "/search",
  "/notifications",
  "/reset-password",
];

// Screens for signed-out visitors: signed-in people go straight to Home.
const SIGNED_OUT_ONLY = ["/", "/onboarding", "/welcome", "/login", "/signup"];

function within(pathname: string, section: string) {
  return pathname === section || (section !== "/" && pathname.startsWith(`${section}/`));
}

export async function proxy(request: NextRequest) {
  const config = supabaseConfig();
  if (!config) {
    // Keep the site up (without accounts) rather than failing every page.
    console.error(MISSING_CONFIG);
    return NextResponse.next();
  }

  const { response, signedIn } = await updateSession(request, config);
  const { pathname } = request.nextUrl;

  if (!signedIn && ACCOUNT_ONLY.some((section) => within(pathname, section))) {
    return redirect(request, response, pathname === "/reset-password" ? "/forgot-password" : "/login");
  }
  if (signedIn && SIGNED_OUT_ONLY.some((section) => within(pathname, section))) {
    return redirect(request, response, "/home");
  }
  return response;
}

// Redirects without losing the session cookies or no-cache headers the
// session refresh may have just set.
function redirect(request: NextRequest, from: NextResponse, path: string) {
  const to = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}

export const config = {
  matcher: [
    // Every page, but not Next.js internals or static files (images, icons, manifest).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
