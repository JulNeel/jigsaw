/**
 * Supabase Auth returns free-form error messages, not stable error codes for
 * every case — mapping to a field is best-effort text matching, not exact.
 */
export function classifySignUpError(
  message: string,
): "email" | "password" | "general" {
  const lower = message.toLowerCase();
  if (lower.includes("email") || lower.includes("registered")) {
    return "email";
  }
  if (lower.includes("password")) {
    return "password";
  }
  return "general";
}
