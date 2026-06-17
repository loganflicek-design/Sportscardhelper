"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Card } from "@/lib/storage";

type Summary = {
  totalCards: number;
  inHand: number;
  listed: number;
  sold: number;
  totalCostBasis: number;
  activeCostBasis: number;
  totalMarketValue: number;
  unrealizedProfit: number;
  realizedProfit: number;
};

export default function HomePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/inventory", { cache: "no-store" });
      const d = await r.json();
      setCards(d.cards);
      setSummary(d.summary);
      setLoaded(true);
    })();
  }, []);

  const winners = [...cards]
    .filter((c) => c.marketValue && c.cost && c.marketValue > c.cost && c.status !== "sold")
    .sort((a, b) => (b.marketValue! - b.cost) - (a.marketValue! - a.cost))
    .slice(0, 3);

  const needsComps = cards.filter((c) => !c.marketValue && c.status !== "sold").slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActionCard href="/scan" icon="📷" label="Scan a card" sub="ID + comps + save" primary />
        <ActionCard href="/show" icon="🏃" label="Card Show Mode" sub="Fast BUY/PASS at shows" />
        <ActionCard href="/comps" icon="🔍" label="Manual comps" sub="Type a title" />
        <ActionCard href="/inventory" icon="📦" label="Inventory" sub="Manage cards" />
        <ActionCard href="/watchlist" icon="🎯" label="Watchlist" sub="Hunt for deals" />
        <ActionCard href="/grade" icon="⭐" label="Grade ROI" sub="Worth sending to PSA?" />
        <ActionCard href="/research" icon="📊" label="Player Research" sub="Find best plays" />
        <ActionCard href="/pnl" icon="💵" label="Profit Dashboard" sub="See what's working" />
      </div>

      {/* Portfolio overview */}
      {summary && summary.totalCards > 0 && (
        <section className="card">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Portfolio</h2>
            <Link href="/inventory" className="text-xs text-accent hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Cards" value={String(summary.totalCards)} />
            <Metric label="Invested" value={`$${summary.activeCostBasis.toFixed(0)}`} />
            <Metric label="Market value" value={`$${summary.totalMarketValue.toFixed(0)}`} />
            <Metric
              label="Unrealized P&L"
              value={`${summary.unrealizedProfit >= 0 ? "+" : ""}$${summary.unrealizedProfit.toFixed(0)}`}
              tone={summary.unrealizedProfit >= 0 ? "good" : "bad"}
            />
          </div>
        </section>
      )}

      {/* Top winners */}
      {winners.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-3">📈 Top movers</h2>
          <ul className="divide-y divide-white/5">
            {winners.map((c) => {
              const pnl = c.marketValue! - c.cost;
              const pct = (pnl / c.cost) * 100;
              return (
                <li key={c.id} className="py-2 flex items-center gap-3">
                  {c.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.imageUrl} alt="" className="w-10 h-14 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.title}</div>
                    <div className="text-xs text-white/40">Paid ${c.cost.toFixed(2)} · Now ${c.marketValue!.toFixed(2)}</div>
                  </div>
                  <div className="text-good font-mono text-sm font-semibold">
                    +${pnl.toFixed(2)}
                    <div className="text-[10px] opacity-70">+{pct.toFixed(0)}%</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Needs comps */}
      {needsComps.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-2">⏳ Need market value</h2>
          <p className="text-xs text-white/50 mb-3">These cards don't have comps yet. Pull them from the Inventory page.</p>
          <ul className="space-y-1">
            {needsComps.map((c) => (
              <li key={c.id} className="text-sm flex items-center gap-2">
                <span className="text-white/40">·</span>
                <span className="truncate flex-1">{c.title}</span>
              </li>
            ))}
          </ul>
          <Link href="/inventory" className="btn-ghost text-xs mt-3 inline-block">Go to inventory</Link>
        </section>
      )}

      {/* Empty state */}
      {loaded && summary?.totalCards === 0 && (
        <section className="card text-center py-10 space-y-3">
          <div className="text-4xl">👋</div>
          <h2 className="text-xl font-bold">Welcome to your card stack</h2>
          <p className="text-white/60 text-sm max-w-md mx-auto">
            Start by scanning a card. The AI will identify it, pull recent eBay comps, and tell you if it's a winner.
          </p>
          <Link href="/scan" className="btn inline-block mt-2">📷 Scan your first card</Link>
        </section>
      )}
    </div>
  );
}

function ActionCard({ href, icon, label, sub, primary }: { href: string; icon: string; label: string; sub: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`card !p-4 hover:border-accent/40 transition-colors ${primary ? "ring-1 ring-accent/30 bg-accent/5" : ""}`}
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-sm">{label}</div>
      <div className="text-xs text-white/50 mt-0.5">{sub}</div>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
