import { getRequestConfig } from "next-intl/server";

/**
 * V1 is French-only (PRD/UX target French-speaking households) — no
 * `[locale]` URL segment, no locale switcher. Fixed locale, not
 * request-derived. Revisit if the app ever needs more than one language.
 */
export default getRequestConfig(async () => {
  const locale = "fr";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
