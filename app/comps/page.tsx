"use client";

import { useState } from "react";
import type { UnifiedComps } from "@/lib/comps";
import type { DealResult } from "@/lib/fees";
import { loadThresholds } from "@/lib/client-settings";

export default function CompsPage() {
  const [query, setQuery] = useState("");
  const [comps, setComps] = useState<UnifiedComps | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [asking, setAsking] = useState("");
  const [estimate, setEstimate] = useState("");
  const [deal, setDeal] = useState<DealResult | null>(null);

  async function runComps(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setComps(null);
    try {
      const res = await fetch(`/api/comps?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setComps(data);
      if (data.median) setEstimate(String(data.median));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function runDeal(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        askingPrice: Number(asking),
        estimatedSalePrice: Number(estimate),
        thresholds: loadThresholds(),
      }),
    });
    const data = await res.json();
    if (res.ok) setDeal(data);
  }

  const verdictColor =
    deal?.verdict === "BUY" ? "bg-green-500/20 text-green-400 border border-green-500/40" :
    deal?.verdict === "MAYBE" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" :
    "bg-red-500/20 text-red-400 border border-red-500/40";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section className="card">
        <h2 className="text-xl font-semibold mb-3">1. Look up sold comps</h2>
        <form onSubmit={runComps} className="flex gap-2">
          <input
            className="input"
            placeholder='e.g. "2018 Optic Luka Doncic Rated Rookie PSA 10"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" disabled={loading || !query.trim()}>
            {loading ? "Searching…" : "Comp it"}
          </button>
        </form>

        {error && <p className="text-bad text-sm mt-3">{error}</p>}

        {comps && comps.count > 0 && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Median" value={`$${comps.median}`} highlight />
              <Stat label="Mean" value={`$${comps.mean}`} />
              <Stat label="Low" value={`$${comps.low}`} />
              <Stat label="High" value={`$${comps.high}`} />
            </div>
            <p className="text-xs text-white/50">{comps.count} sales · ±${comps.stdev} stdev · Source: {comps.source}</p>
            {comps.note && <p className="text-xs text-yellow-400/80">{comps.note}</p>}
            <ul className="max-h-72 overflow-auto divide-y divide-white/5 text-sm">
              {comps.items.slice(0, 15).map((it, i) => (
                <li key={i} className="py-2 flex gap-3 items-center">
                  {it.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.image} alt="" className="w-12 h-12 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <a href={it.url} target="_blank" rel="noreferrer" className="block truncate hover:text-accent">{it.title}</a>
                    <div className="text-xs text-white/50">{it.condition || "—"} · {it.soldDate || "recent"}</div>
                  </div>
                  <div className="font-mono">${it.totalPrice.toFixed(2)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {comps && comps.count === 0 && <p className="mt-4 text-white/60 text-sm">No sold listings found. Try a broader search.</p>}
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold mb-3">2. Score the deal</h2>
        <form onSubmit={runDeal} className="grid grid-cols-2 gap-3">
          <div>
            <div className="label">Asking price</div>
            <input className="input" inputMode="decimal" value={asking} onChange={(e) => setAsking(e.target.value)} />
          </div>
          <div>
            <div className="label">Est. sale price</div>
            <input className="input" inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          </div>
          <button className="btn col-span-2" disabled={!asking || !estimate}>Score it</button>
        </form>

        {deal && (
          <div className="mt-5 space-y-3">
            <div className={`inline-block rounded-xl px-3 py-1 font-bold ${verdictColor}`}>{deal.verdict}</div>
            <p className="text-sm text-white/80">{deal.reasoning}</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Net after fees" value={`$${deal.netProceeds.toFixed(2)}`} />
              <Stat label="Profit" value={`$${deal.profit.toFixed(2)}`} highlight={deal.profit > 0} />
              <Stat label="ROI" value={`${deal.roiPct}%`} />
            </div>
            <p className="text-xs text-white/40">Thresholds from your <a href="/settings" className="underline">Rules</a>.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/5 p-3 ${highlight ? "bg-accent/10" : "bg-ink"}`}>
      <div className="label">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
