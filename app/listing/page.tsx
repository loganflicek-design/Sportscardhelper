"use client";

import { useState } from "react";

export default function ListingPage() {
  const [form, setForm] = useState({
    year: "",
    setName: "",
    player: "",
    team: "",
    cardNumber: "",
    parallel: "",
    grade: "",
    serial: "",
    rookie: false,
  });
  const [out, setOut] = useState<{ title: string; titleLength: number; description: string } | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setOut(await res.json());
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Card details</h2>
        <form onSubmit={generate} className="grid grid-cols-2 gap-3">
          <Field label="Year" v={form.year} on={(v) => setForm({ ...form, year: v })} />
          <Field label="Set" v={form.setName} on={(v) => setForm({ ...form, setName: v })} />
          <Field label="Player" v={form.player} on={(v) => setForm({ ...form, player: v })} />
          <Field label="Team" v={form.team} on={(v) => setForm({ ...form, team: v })} />
          <Field label="Card #" v={form.cardNumber} on={(v) => setForm({ ...form, cardNumber: v })} />
          <Field label="Parallel" v={form.parallel} on={(v) => setForm({ ...form, parallel: v })} />
          <Field label="Grade" v={form.grade} on={(v) => setForm({ ...form, grade: v })} />
          <Field label="Serial /XX" v={form.serial} on={(v) => setForm({ ...form, serial: v })} />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.rookie} onChange={(e) => setForm({ ...form, rookie: e.target.checked })} />
            Rookie card
          </label>
          <button className="btn col-span-2">Generate</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Output</h2>
        {!out && <p className="text-white/50 text-sm">Fill in details and click generate.</p>}
        {out && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="label">eBay title ({out.titleLength}/80)</div>
                <button className="btn-ghost text-xs" onClick={() => copy(out.title)}>Copy</button>
              </div>
              <div className="mt-1 p-3 rounded-xl bg-ink border border-white/10 font-mono text-sm break-words">
                {out.title}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <div className="label">Description</div>
                <button className="btn-ghost text-xs" onClick={() => copy(out.description)}>Copy</button>
              </div>
              <pre className="mt-1 p-3 rounded-xl bg-ink border border-white/10 whitespace-pre-wrap text-sm">
                {out.description}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <input className="input mt-1" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
