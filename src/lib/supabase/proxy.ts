import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the visitor's session (pages can't write cookies, so the proxy
 * does it for them) and returns the signed-in person's claims, if any.
 * Follows Supabase's Next.js guide: the refreshed cookies go both to the
 * request, for the page being rendered, and to the response, for the browser.
 */
export async function updateSession(request: NextRequest, { url, key }: { url: string; key: string }) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Keeps CDNs from caching a response that carries someone's session.
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Nothing may run between creating the client and getClaims(): Supabase
  // warns this can sign people out at random.
  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}
