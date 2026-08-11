import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/auth/env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads/writes the session via Next.js's cookie store. Uses the publishable
 * key (safe server-side too) — never the secret key here; this client acts
 * as the authenticated user, not as an admin.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch (err) {
            // Expected when called from a Server Component (cookies are
            // read-only there) — proxy.ts refreshes the session on every
            // request regardless. Logged (not silently swallowed) so a
            // genuine cookie-write failure is still visible.
            console.warn("Supabase cookie write skipped:", err);
          }
        },
      },
    },
  );
}
