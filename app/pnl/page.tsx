"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/storage";
import { loadThresholds } from "@/lib/client-settings";

export default function PnLPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards);
        setLoaded(true);
      });
  }, []);

  const stats = useMemo(() => computeStats(cards), [cards]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">💵 Profit Dashboard</h1>
        <p className="text-white/50 text-sm mt-1">
          What's actually working. Realized P&L on sold cards + unrealized on active inventory.
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigMetric label="Realized profit" value={`$${stats.realizedProfit.toFixed(0)}`} sub={`${stats.soldCount} cards sold`} tone={stats.realizedProfit >= 0 ? "good" : "bad"} />
        <BigMetric label="Unrealized" value={`${stats.unrealized >= 0 ? "+" : ""}$${stats.unrealized.toFixed(0)}`} sub={`${stats.activeCount} cards held`} tone={stats.unrealized >= 0 ? "good" : "bad"} />
        <BigMetric label="Avg ROI per flip" value={stats.avgRoi !== null ? `${stats.avgRoi.toFixed(0)}%` : "—"} sub="On sold cards" />
        <BigMetric label="Capital tied up" value={`$${stats.capitalLocked.toFixed(0)}`} sub={`In ${stats.activeCount} active cards`} />
      </div>

      {/* Best & worst flips */}
      {stats.bestFlip && (
        <section className="grid md:grid-cols-2 gap-4">
          <FlipCard title="🏆 Best flip" card={stats.bestFlip.card} profit={stats.bestFlip.profit} pct={stats.bestFlip.pct} tone="good" />
          {stats.worstFlip && stats.worstFlip !== stats.bestFlip && (
            <FlipCard title="💀 Worst flip" card={stats.worstFlip.card} profit={stats.worstFlip.profit} pct={stats.worstFlip.pct} tone="bad" />
          )}
        </section>
      )}

      {/* Active winners (paper gains) */}
      {stats.activeWinners.length > 0 && (
        <section className="card">
          <h2 className="font-semibold mb-3">📈 Active winners (unrealized gains)</h2>
          <ul className="divide-y divide-white/5">
            {stats.activeWinners.map((w) => (
              <li key={w.card.id} className="py-2 flex items-center gap-3">
                {w.card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={w.card.imageUrl} alt="" className="w-10 h-14 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{w.card.title}</div>
                  <div className="text-xs text-white/40">Paid ${w.card.cost} · Now ${w.card.marketValue}</div>
                </div>
                <div className="text-right">
                  <div className="text-good font-mono font-semibold">+${w.profit.toFixed(0)}</div>
                  <div className="text-[10px] text-white/40">+{w.pct.toFixed(0)}%</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Time to sell candidates */}
      {stats.timeToSell.length > 0 && (
        <section className="card border-accent/30 bg-accent/5">
          <h2 className="font-semibold mb-2 text-accent">🚨 Time to sell?</h2>
          <p className="text-xs text-white/60 mb-3">Cards where current market clears your sell rules.</p>
          <ul className="divide-y divide-white/5">
            {stats.timeToSell.map((c) => (
              <li key={c.id} className="py-2 flex items-center gap-3">
                {c.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.imageUrl} alt="" className="w-10 h-14 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{c.title}</div>
                  <div className="text-xs text-white/40">Paid ${c.cost} → Market ${c.marketValue}</div>
                </div>
                <div className="text-good font-mono text-sm">+${(c.marketValue! - c.cost).toFixed(0)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active losers */}
      {stats.activeLosers.length > 0 && (
        <section className="card">
          <h2 className="font-semibold mb-3">📉 Underwater (paper losses)</h2>
          <ul className="divide-y divide-white/5">
            {stats.activeLosers.map((w) => (
              <li key={w.card.id} className="py-2 flex items-center gap-3">
                {w.card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={w.card.imageUrl} alt="" className="w-10 h-14 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{w.card.title}</div>
                  <div className="text-xs text-white/40">Paid ${w.card.cost} · Now ${w.card.marketValue}</div>
                </div>
                <div className="text-right">
                  <div className="text-bad font-mono font-semibold">${w.profit.toFixed(0)}</div>
                  <div className="text-[10px] text-white/40">{w.pct.toFixed(0)}%</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loaded && cards.length === 0 && (
        <div className="card text-center py-12 text-white/40">
          No cards yet. Scan a few to see your P&L here.
        </div>
      )}
    </div>
  );
}

type FlipStat = { card: Card; profit: number; pct: number };

function computeStats(cards: Card[]) {
  const t = loadThresholds();
  const sold = cards.filter((c) => c.status === "sold" && c.soldFor);
  const active = cards.filter((c) => c.status !== "sold");

  const soldFlips: FlipStat[] = sold.map((c) => {
    const net = (c.soldFor || 0) * (1 - t.feeRate) - t.fixedFee - t.shippingCost;
    const profit = net - c.cost;
    const pct = c.cost > 0 ? (profit / c.cost) * 100 : 0;
    return { card: c, profit: +profit.toFixed(2), pct: +pct.toFixed(1) };
  });
  const sortedFlips = [...soldFlips].sort((a, b) => b.profit - a.profit);
  const bestFlip = sortedFlips[0];
  const worstFlip = sortedFlips[sortedFlips.length - 1];

  const realizedProfit = soldFlips.reduce((a, f) => a + f.profit, 0);
  const avgRoi = soldFlips.length ? soldFlips.reduce((a, f) => a + f.pct, 0) / soldFlips.length : null;

  const activeWithValue: FlipStat[] = active
    .filter((c) => c.marketValue && c.cost)
    .map((c) => {
      const profit = c.marketValue! - c.cost;
      const pct = (profit / c.cost) * 100;
      return { card: c, profit: +profit.toFixed(2), pct: +pct.toFixed(1) };
    });
  const activeWinners = activeWithValue.filter((x) => x.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 10);
  const activeLosers = activeWithValue.filter((x) => x.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 5);

  const unrealized = activeWithValue.reduce((a, x) => a + x.profit, 0);
  const capitalLocked = active.reduce((a, c) => a + (c.cost || 0), 0);

  // Time to sell: active cards where (marketValue - cost) >= a meaningful ROI
  const timeToSell = active
    .filter((c) => c.marketValue && c.cost && c.status !== "listed")
    .filter((c) => {
      const profit = c.marketValue! - c.cost;
      const roi = (profit / c.cost) * 100;
      return roi >= t.buyMinRoiPct && profit >= t.buyMinProfitDollars;
    })
    .sort((a, b) => (b.marketValue! - b.cost) - (a.marketValue! - a.cost))
    .slice(0, 8);

  return {
    realizedProfit: +realizedProfit.toFixed(2),
    soldCount: sold.length,
    activeCount: active.length,
    avgRoi: avgRoi !== null ? +avgRoi.toFixed(1) : null,
    capitalLocked: +capitalLocked.toFixed(2),
    unrealized: +unrealized.toFixed(2),
    bestFlip,
    worstFlip,
    activeWinners,
    activeLosers,
    timeToSell,
  };
}

function FlipCard({ title, card, profit, pct, tone }: { title: string; card: Card; profit: number; pct: number; tone: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : "text-bad";
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div className="flex gap-3 mt-3 items-start">
        {card.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={card.imageUrl} alt="" className="w-12 h-16 object-cover rounded" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium line-clamp-2">{card.title}</div>
          <div className={`text-2xl font-bold mt-1 ${color}`}>
            {profit >= 0 ? "+" : ""}${profit.toFixed(0)}
            <span className="text-sm font-normal ml-2 opacity-70">({pct.toFixed(0)}%)</span>
          </div>
          <div className="text-xs text-white/40 mt-1">
            Paid ${card.cost.toFixed(2)} → Sold ${card.soldFor?.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigMetric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="card !p-4">
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}
