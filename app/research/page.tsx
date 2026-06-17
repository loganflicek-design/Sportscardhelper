"use client";

import { useState } from "react";
import type { PlayerResearch } from "@/lib/research";

export default function ResearchPage() {
  const [player, setPlayer] = useState("");
  const [year, setYear] = useState("");
  const [data, setData] = useState<PlayerResearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function research(e: React.FormEvent) {
    e.preventDefault();
    if (!player.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `/api/research?player=${encodeURIComponent(player)}${year ? `&year=${encodeURIComponent(year)}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const sorted = data?.rcVariants ? [...data.rcVariants].sort((a, b) => b.median - a.median) : [];
  const cheapest = data?.rcVariants ? [...data.rcVariants].sort((a, b) => a.median - b.median)[0] : null;
  const expensive = sorted[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📊 Player Research</h1>
        <p className="text-white/50 text-sm mt-1">
          Compare a player's rookie cards across Prizm, Optic, Chrome, Bowman Chrome, Select, Mosaic. Spot the cheapest entry and the high-end ceiling.
        </p>
      </div>

      <form onSubmit={research} className="card flex flex-wrap gap-3">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Player name (e.g. Patrick Mahomes)"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        />
        <input
          className="input w-32"
          placeholder="Year (opt.)"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <button className="btn" disabled={loading || !player.trim()}>
          {loading ? "Researching…" : "Research"}
        </button>
      </form>

      {error && <div className="card bg-red-500/10 border-red-500/30 text-red-400 text-sm">{error}</div>}

      {data && (
        <>
          {/* Summary */}
          <section className="card">
            <h2 className="font-semibold mb-3">Market summary for {data.player}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Variants found" value={String(data.rcVariants.length)} />
              <Metric label="Total sales" value={String(data.summary.totalSamples)} />
              <Metric label="Median of medians" value={`$${data.summary.medianOfMedians}`} />
              <Metric label="Spread" value={`$${data.summary.spread.toFixed(0)}`} />
            </div>
          </section>

          {/* Best plays */}
          {cheapest && expensive && (
            <section className="grid md:grid-cols-2 gap-4">
              <div className="card border-accent/30 bg-accent/5">
                <div className="label text-accent">🎯 Cheapest entry point</div>
                <div className="text-lg font-semibold mt-1">{cleanQuery(cheapest.query)}</div>
                <div className="text-2xl font-bold mt-2">${cheapest.median}</div>
                <div className="text-xs text-white/50 mt-1">{cheapest.count} recent sales · Low ${cheapest.low}</div>
              </div>
              <div className="card border-good/30 bg-good/5">
                <div className="label text-good">💎 Highest-end variant</div>
                <div className="text-lg font-semibold mt-1">{cleanQuery(expensive.query)}</div>
                <div className="text-2xl font-bold mt-2">${expensive.median}</div>
                <div className="text-xs text-white/50 mt-1">{expensive.count} recent sales · High ${expensive.high}</div>
              </div>
            </section>
          )}

          {/* All variants */}
          <section className="card">
            <h2 className="font-semibold mb-3">All variants ({sorted.length})</h2>
            <div className="space-y-2">
              {sorted.map((v) => (
                <div key={v.query} className="p-3 rounded-lg bg-white/[0.02] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{cleanQuery(v.query)}</div>
                    <div className="text-xs text-white/40">{v.count} sales · ${v.low} – ${v.high}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold">${v.median}</div>
                    <div className="text-[10px] text-white/40">median</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function cleanQuery(q: string): string {
  return q.replace(/\b(rookie|RC)\b/gi, "RC").replace(/\s+/g, " ").trim();
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
