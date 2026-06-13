"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/lib/storage";
type CardRow = Card;

type Summary = {
  totalCards: number;
  inHand: number;
  listed: number;
  sold: number;
  totalCostBasis: number;
  realizedProfit: number;
};

const STATUSES: CardRow["status"][] = ["raw", "graded", "listed", "sold"];

export default function InventoryPage() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ title: "", cost: "", player: "", year: "", grade: "" });

  async function load() {
    const r = await fetch("/api/inventory", { cache: "no-store" });
    const d = await r.json();
    setCards(d.cards);
    setSummary(d.summary);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        cost: Number(form.cost || 0),
        player: form.player || null,
        year: form.year ? Number(form.year) : null,
        grade: form.grade || null,
      }),
    });
    setForm({ title: "", cost: "", player: "", year: "", grade: "" });
    load();
  }

  async function updateRow(id: string, patch: Partial<CardRow>) {
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

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Total" value={summary.totalCards} />
          <Stat label="In hand" value={summary.inHand} />
          <Stat label="Listed" value={summary.listed} />
          <Stat label="Sold" value={summary.sold} />
          <Stat label="Cost basis" value={`$${summary.totalCostBasis.toFixed(2)}`} />
          <Stat
            label="Realized P&L"
            value={`$${summary.realizedProfit.toFixed(2)}`}
            tone={summary.realizedProfit >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Add card</h2>
        <form onSubmit={add} className="grid md:grid-cols-6 gap-2">
          <input className="input md:col-span-2" placeholder="Title (e.g. 2018 Optic Luka RC)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Player" value={form.player} onChange={(e) => setForm({ ...form, player: e.target.value })} />
          <input className="input" placeholder="Year" inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          <input className="input" placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          <input className="input" placeholder="Cost $" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          <button className="btn md:col-span-6">Add</button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-semibold mb-3">Cards</h2>
        <table className="w-full text-sm">
          <thead className="text-white/50 text-xs uppercase">
            <tr>
              <th className="text-left py-2">Title</th>
              <th className="text-right">Cost</th>
              <th className="text-left">Status</th>
              <th className="text-right">Sold for</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {cards.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-2">{c.title}</td>
                <td className="text-right font-mono">${c.cost.toFixed(2)}</td>
                <td>
                  <select
                    value={c.status}
                    onChange={(e) => updateRow(c.id, { status: e.target.value as CardRow["status"] })}
                    className="bg-ink border border-white/10 rounded px-2 py-1 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={c.soldFor ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value ? Number(e.target.value) : undefined;
                      if (v !== c.soldFor) updateRow(c.id, { soldFor: v, soldAt: v ? new Date().toISOString().slice(0, 10) : undefined });
                    }}
                    className="w-24 text-right bg-ink border border-white/10 rounded px-2 py-1"
                  />
                </td>
                <td className="text-right">
                  <button onClick={() => remove(c.id)} className="text-bad text-xs hover:underline">delete</button>
                </td>
              </tr>
            ))}
            {!cards.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-white/40">No cards yet. Add your first one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="card !p-3">
      <div className="label">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
