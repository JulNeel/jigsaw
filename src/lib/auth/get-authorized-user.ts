import { createClient } from "@/lib/auth/supabase-server";

/**
 * Auth check for mutating Server Actions — unlike `requireUser()` (page
 * loads, redirects), this returns an error result so callers can surface
 * it via `useActionState` instead of throwing/redirecting mid-mutation.
 */
export async function getAuthorizedUser() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("getAuthorizedUser: getUser() returned an error:", error);
    }
    if (error || !data.user) {
      return { error: { message: "Not signed in." } } as const;
    }
    return { user: data.user } as const;
  } catch (err) {
    console.warn("getAuthorizedUser: getUser() threw:", err);
    return { error: { message: "Not signed in." } } as const;
  }
}
