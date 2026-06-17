"use client";

import { useEffect, useState } from "react";
import type { WatchlistEntry } from "@/lib/storage";

const DEFAULT_MIN_DEAL = 25;

export default function WatchlistPage() {
  const [list, setList] = useState<WatchlistEntry[]>([]);
  const [form, setForm] = useState({ query: "", maxPrice: "", minDealPct: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/watchlist", { cache: "no-store" });
    setList(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.query.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: form.query.trim(),
          maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
          minDealPct: form.minDealPct ? Number(form.minDealPct) : undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setForm({ query: "", maxPrice: "", minDealPct: "", notes: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="text-white/50 text-sm mt-1">
          Tell it what cards to hunt. Once your eBay Growth Check is approved, this scans every 4 hours and pings you on Discord when it finds a deal.
        </p>
      </div>

      {/* Add form */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Add a card to hunt</h2>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <form onSubmit={add} className="space-y-3">
          <div>
            <div className="label mb-1">Search query *</div>
            <input
              className="input"
              placeholder='e.g. "Patrick Mahomes Prizm PSA 10" or "Luka Doncic Optic Rookie"'
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
            />
            <p className="text-xs text-white/40 mt-1">Use the same search terms you'd type on eBay. More specific = better results.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Max buy price</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                <input
                  className="input pl-7"
                  inputMode="decimal"
                  placeholder="e.g. 150"
                  value={form.maxPrice}
                  onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">Only show deals under this price</p>
            </div>
            <div>
              <div className="label mb-1">Min deal % below comp</div>
              <div className="relative">
                <input
                  className="input pr-8"
                  inputMode="decimal"
                  placeholder={String(DEFAULT_MIN_DEAL)}
                  value={form.minDealPct}
                  onChange={(e) => setForm({ ...form, minDealPct: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50">%</span>
              </div>
              <p className="text-xs text-white/40 mt-1">Default {DEFAULT_MIN_DEAL}% below market value</p>
            </div>
          </div>

          <div>
            <div className="label mb-1">Notes (optional)</div>
            <input
              className="input"
              placeholder="e.g. Only want PSA 9 or 10, no raw"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <button className="btn w-full" disabled={adding || !form.query.trim()}>
            {adding ? "Adding…" : "Add to watchlist"}
          </button>
        </form>
      </section>

      {/* Current watchlist */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Currently watching ({list.length})</h2>
          {list.length > 0 && (
            <span className="text-xs text-white/40">
              Scans every 4h once eBay Growth Check approved
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <div className="text-center py-8 text-white/40 text-sm">
            Nothing on your watchlist yet. Add cards above and they'll be hunted automatically.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((w) => (
              <li key={w.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-medium text-sm">{w.query}</div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <Pill label="Max price" value={w.maxPrice ? `$${w.maxPrice}` : "Any"} />
                    <Pill label="Min deal" value={`${w.minDealPct ?? DEFAULT_MIN_DEAL}% below market`} highlight />
                    {w.notes && <span className="text-white/40 italic">{w.notes}</span>}
                  </div>
                  <div className="text-[10px] text-white/30">Added {w.createdAt.slice(0, 10)}</div>
                </div>
                <button
                  onClick={() => remove(w.id)}
                  className="text-white/30 hover:text-bad text-sm flex-shrink-0 px-1"
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section className="card bg-white/[0.02] space-y-2">
        <h2 className="font-semibold text-sm">How deal scanning works</h2>
        <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
          <li>Every 4 hours, a background job runs and searches eBay for each card on your list</li>
          <li>It pulls the current comp median as the "true value"</li>
          <li>Any listing that's below your Min deal % threshold AND passes your buy rules gets flagged</li>
          <li>The top deals get sent to your Discord as a message with price, link, and ROI</li>
          <li>You click the link, buy the card, flip it for profit</li>
        </ol>
        <p className="text-xs text-white/30 pt-1">
          Requires: eBay Growth Check approval + Discord webhook URL in GitHub secrets.
        </p>
      </section>
    </div>
  );
}

function Pill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 border ${highlight ? "border-accent/30 text-accent/80 bg-accent/5" : "border-white/10 text-white/50"}`}>
      {label}: <span className="font-medium">{value}</span>
    </span>
  );
}
