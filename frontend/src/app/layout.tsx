import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tabi — Trips, split fairly",
  description:
    "Plan trips with friends: shared group chat, expense splitting, and live location.",
  other: {
    // Tabi ships its own light/dark themes, so Dark Reader has nothing to add and a lot
    // to break: it rewrites colours and injects `data-darkreader-*` attributes into the
    // DOM before React hydrates, which both defeats the in-app theme toggle and shows up
    // as a hydration mismatch. This meta tag asks the extension to leave the page alone;
    // it only checks that the tag exists, so the value is arbitrary — but Next drops
    // `other` entries whose content is an empty string, so it can't be "".
    "darkreader-lock": "true",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes writes the theme class onto <html> before
    // React hydrates, so the server and client markup differ here by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
