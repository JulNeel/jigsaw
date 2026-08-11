import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/auth/env";

/**
 * Supabase client for Client Components (browser). Uses the publishable key,
 * safe to expose — see .env.example. Never import the secret key here.
 */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
