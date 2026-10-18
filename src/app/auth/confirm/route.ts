import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * Where the links in sign-up and password-reset emails land.
 *
 * Supabase's own emails bring people back with `code`: Supabase has already
 * confirmed the email by then, and the code signs the person in, but only in
 * the browser that asked for the email. Custom email templates can link here
 * with `token_hash` instead, which works on any device. A link that failed
 * (expired, already used) arrives with neither.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const recovery = params.get("purpose") === "recovery" || params.get("type") === "recovery";

  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  let cacheHeaders: Record<string, string> = {};
  let signedIn = false;

  const config = supabaseConfig();
  if (config && (code || tokenHash)) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies, headers) {
          cookiesToSet.push(...cookies);
          cacheHeaders = headers;
        },
      },
    });
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash ?? "",
          type: (params.get("type") ?? "email") as EmailOtpType,
        });
    signedIn = !error;
  }

  let destination: string;
  if (signedIn) destination = recovery ? "/reset-password" : "/home";
  else if (recovery) destination = "/forgot-password?notice=reset-link-failed";
  // The link worked (the email is confirmed) but was opened in another browser.
  else if (code) destination = "/login?notice=email-confirmed";
  else destination = "/login?notice=link-failed";

  // A relative Location: in route handlers request.url can carry the server's
  // own host name rather than the one the visitor used, which would lose the
  // session cookies on the way.
  const response = new NextResponse(null, { status: 303, headers: { location: destination } });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}
