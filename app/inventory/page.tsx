"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/storage";
import { resizeForSheetCell } from "@/lib/image";

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

const STATUSES: Card["status"][] = ["raw", "graded", "listed", "sold"];
type Filter = "all" | Card["status"];

export default function InventoryPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/inventory", { cache: "no-store" });
    const d = await r.json();
    setCards(d.cards);
    setSummary(d.summary);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRow(id: string, patch: Partial<Card>) {
    await fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this card?")) return;
    await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    load();
  }

  async function refreshComps(c: Card) {
    setRefreshingId(c.id);
    try {
      const r = await fetch(`/api/comps?q=${encodeURIComponent(c.title)}`);
      const d = await r.json();
      if (r.ok && d.median) {
        await updateRow(c.id, {
          marketValue: d.median,
          marketValueAt: new Date().toISOString().slice(0, 10),
        });
      }
    } finally {
      setRefreshingId(null);
    }
  }

  const visible = cards
    .filter((c) => filter === "all" || c.status === filter)
    .filter((c) => !query || c.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Portfolio summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigStat label="Cards" value={summary.totalCards} sub={`${summary.inHand} in hand · ${summary.listed} listed · ${summary.sold} sold`} />
          <BigStat label="Cost basis" value={`$${summary.activeCostBasis.toFixed(0)}`} sub={`Total invested in unsold`} />
          <BigStat label="Market value" value={`$${summary.totalMarketValue.toFixed(0)}`} sub="Sum of latest comps" />
          <BigStat
            label="Unrealized P&L"
            value={`${summary.unrealizedProfit >= 0 ? "+" : ""}$${summary.unrealizedProfit.toFixed(0)}`}
            sub={`Realized: $${summary.realizedProfit.toFixed(0)}`}
            tone={summary.unrealizedProfit >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 rounded-xl border border-white/10 p-1 bg-ink">
          {(["all", ...STATUSES] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-sm capitalize transition-colors ${
                filter === f ? "bg-accent text-ink" : "text-white/60 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          className="input flex-1 min-w-[180px]"
          placeholder="Search title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Link href="/scan" className="btn">+ Scan a card</Link>
      </div>

      {/* Card grid */}
      {visible.length === 0 ? (
        <div className="card text-center py-12 text-white/40">
          {cards.length === 0
            ? <>No cards yet. <Link href="/scan" className="text-accent hover:underline">Scan your first one</Link>.</>
            : "No cards match that filter."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              refreshing={refreshingId === c.id}
              onStatus={(s) => updateRow(c.id, { status: s })}
              onSoldFor={(v) => updateRow(c.id, { soldFor: v, soldAt: v ? new Date().toISOString().slice(0, 10) : undefined })}
              onRefresh={() => refreshComps(c)}
              onDelete={() => remove(c.id)}
              onUpload={async (base64, mimeType) => {
                await fetch(`/api/inventory/${c.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64: base64, imageMimeType: mimeType }),
                });
                load();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTile({
  card,
  refreshing,
  onStatus,
  onSoldFor,
  onRefresh,
  onDelete,
  onUpload,
}: {
  card: Card;
  refreshing: boolean;
  onStatus: (s: Card["status"]) => void;
  onSoldFor: (v: number | undefined) => void;
  onRefresh: () => void;
  onDelete: () => void;
  onUpload: (base64: string, mimeType: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pnl = card.marketValue && card.cost ? card.marketValue - card.cost : null;
  const pnlPct = pnl !== null && card.cost ? (pnl / card.cost) * 100 : null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const thumb = await resizeForSheetCell(file);
      await onUpload(thumb.base64, thumb.mimeType);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="card !p-0 overflow-hidden flex flex-col">
      <div className="aspect-[3/4] bg-black flex items-center justify-center overflow-hidden relative group">
        {card.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.imageUrl} alt={card.title} className="w-full h-full object-contain" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white/80 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Replace photo"
            >
              {uploading ? "…" : "↻ Replace"}
            </button>
          </>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30 hover:text-accent hover:bg-accent/5 transition-colors"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <span className="text-xs">{uploading ? "Uploading…" : "+ Add photo"}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{card.title}</div>

        {(card.player || card.year || card.grade) && (
          <div className="text-xs text-white/50">
            {[card.year, card.player, card.grade].filter(Boolean).join(" · ")}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="text-white/40">Paid</div>
            <div className="font-mono font-semibold">${card.cost.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-white/40">Market</div>
            <div className="font-mono font-semibold">
              {card.marketValue ? `$${card.marketValue.toFixed(2)}` : "—"}
            </div>
          </div>
          {pnl !== null && (
            <div className="text-right">
              <div className="text-white/40">P&L</div>
              <div className={`font-mono font-semibold ${pnl >= 0 ? "text-good" : "text-bad"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                {pnlPct !== null && <span className="text-[10px] ml-1">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(0)}%)</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <select
            value={card.status}
            onChange={(e) => onStatus(e.target.value as Card["status"])}
            className="bg-ink border border-white/10 rounded-lg px-2 py-1 text-xs flex-1"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh comps"
            className="text-xs text-white/60 hover:text-accent disabled:opacity-40 px-2"
          >
            {refreshing ? "…" : "↻"}
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="text-xs text-white/40 hover:text-bad px-1"
          >
            ✕
          </button>
        </div>

        {card.status === "sold" && (
          <div className="pt-1">
            <div className="label mb-1">Sold for</div>
            <input
              type="number"
              step="0.01"
              defaultValue={card.soldFor ?? ""}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : undefined;
                if (v !== card.soldFor) onSoldFor(v);
              }}
              className="input text-sm"
              placeholder="$"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="card !p-4">
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}
