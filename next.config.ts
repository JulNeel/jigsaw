import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Next 16 holds an exclusive lock at `<distDir>/dev/lock`, so only one
  // `next dev` can run per build directory — a second one exits even on a
  // different port. The e2e harness needs its own dev server (it sets
  // NEXT_PUBLIC_E2E_HOOKS and captures stdout), so it runs with
  // NEXT_DIST_DIR=.next-e2e and gets its own lock. A side benefit: e2e runs
  // no longer invalidate the build cache of a dev server you have open.
  // Unset everywhere else, so normal `next dev`/`next build` are unaffected.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withNextIntl(nextConfig);
