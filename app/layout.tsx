import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Sports Card Helper",
  description: "Snap a card, get comps, score deals, manage inventory.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-white/5 sticky top-0 bg-ink/80 backdrop-blur z-10">
          <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 overflow-x-auto">
            <Link href="/" className="font-bold text-lg flex-shrink-0">
              <span className="text-accent">card</span>helper
            </Link>
            <div className="flex gap-3 text-sm text-white/80 flex-shrink-0">
              <NavLink href="/scan" highlight>📷 Scan</NavLink>
              <NavLink href="/batch">📚 Batch</NavLink>
              <NavLink href="/show">🏃 Show Mode</NavLink>
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/inventory">Inventory</NavLink>
              <NavLink href="/comps">Comps</NavLink>
              <NavLink href="/deal-check">🔎 Check a Deal</NavLink>
              <NavLink href="/deal-hunter" highlight>🎯 Deal Hunter</NavLink>
              <NavLink href="/watchlist">Watchlist</NavLink>
              <NavLink href="/grade">Grade ROI</NavLink>
              <NavLink href="/research">Research</NavLink>
              <NavLink href="/pnl">P&L</NavLink>
              <NavLink href="/settings">Rules</NavLink>
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

function NavLink({ href, children, highlight }: { href: string; children: ReactNode; highlight?: boolean }) {
  return (
    <Link href={href} className={`hover:text-white whitespace-nowrap ${highlight ? "text-accent font-medium" : ""}`}>
      {children}
    </Link>
  );
}
