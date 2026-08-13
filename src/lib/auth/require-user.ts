import { redirect } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-server";

/**
 * Auth gate for page loads (not Server Actions). Redirects to /sign-in when
 * there is no signed-in user; otherwise returns the user.
 */
export async function requireUser() {
  const supabase = await createClient();

  let user;
  try {
    const result = await supabase.auth.getUser();
    if (result.error) {
      console.warn("requireUser: getUser() returned an error:", result.error);
    }
    user = result.data.user;
  } catch (err) {
    console.warn("requireUser: getUser() threw:", err);
    user = null;
  }

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}
