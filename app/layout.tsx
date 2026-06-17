import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Sports Card Helper",
  description: "Comps, deal scoring, inventory, and listing drafts for sports card resellers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-white/5">
          <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <Link href="/" className="font-bold text-lg">
              <span className="text-accent">card</span>helper
            </Link>
            <div className="flex gap-3 text-sm text-white/80">
              <Link href="/scan" className="hover:text-white font-medium text-accent">📷 Scan</Link>
              <Link href="/" className="hover:text-white">Comps & Deal</Link>
              <Link href="/inventory" className="hover:text-white">Inventory</Link>
              <Link href="/listing" className="hover:text-white">Listing Draft</Link>
            </div>
          </nav>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 py-8 text-xs text-white/40">
          Sold comps are scraped from eBay&apos;s public sold-listings pages. Use figures as a guide, not gospel.
        </footer>
      </body>
    </html>
  );
}
