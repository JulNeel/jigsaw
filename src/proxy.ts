import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/auth/env";

/**
 * Refreshes the Supabase Auth session cookie on every request. Required
 * because Server Components cannot write cookies themselves — without this,
 * sessions silently expire instead of refreshing.
 *
 * Named `proxy` (not `middleware`) — Next.js 16 renamed the file convention;
 * `middleware.ts`/`export function middleware` is deprecated. See
 * node_modules/next/dist/docs/.../file-conventions/proxy.md.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what actually triggers the refresh. A Supabase
  // outage/network error here must not take down every matched route.
  try {
    await supabase.auth.getUser();
  } catch {
    // Session refresh failed; request proceeds with its existing cookies.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
