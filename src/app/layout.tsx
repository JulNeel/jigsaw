import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { ClaimContributionsOnAuth } from "@/app/claim-contributions-on-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jigsaw",
  description: "A persistent, collaborative jigsaw puzzle for the whole household.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
          {/* Story 4.3: finishes a Guest's claim if they asked for one on
              the way out of a Room. Here rather than on Home because a
              Guest who signs up to keep their contributions is now sent
              *back to the Room* — so the claim has to happen wherever they
              land, not wherever auth happens to redirect. Renders nothing
              and queries nothing without an explicit recorded intent. */}
          <ClaimContributionsOnAuth />
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
