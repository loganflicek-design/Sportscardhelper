"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ScanResponse } from "@/app/api/scan/route";
import { loadThresholds } from "@/lib/client-settings";
import { resizeImage, resizeForSheetCell } from "@/lib/image";

type CardState = {
  id: string;
  previewUrl: string;
  full: { base64: string; mimeType: string } | null;
  thumb: { base64: string; mimeType: string; dataUrl: string } | null;
  status: "queued" | "identifying" | "identified" | "id-failed" | "saving" | "saved" | "save-failed" | "skipped";
  scan: ScanResponse | null;
  cost: string;
  error: string | null;
};

const CONCURRENCY = 3;

export default function BatchScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<CardState[]>([]);
  const [running, setRunning] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  function reset() {
    setCards([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newCards: CardState[] = files.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      previewUrl: URL.createObjectURL(f),
      full: null,
      thumb: null,
      status: "queued",
      scan: null,
      cost: "",
      error: null,
    }));
    setCards(newCards);
    setRunning(true);

    // Prepare images (resize) in parallel, then identify with concurrency cap.
    const prepared = await Promise.all(
      files.map(async (f) => {
        try {
          const [full, thumb] = await Promise.all([resizeImage(f, 1280), resizeForSheetCell(f)]);
          return { ok: true as const, full: { base64: full.base64, mimeType: full.mimeType }, thumb };
        } catch {
          return { ok: false as const };
        }
      })
    );

    const thresholds = loadThresholds();

    let idx = 0;
    const queue = newCards.map((c, i) => ({ card: c, prep: prepared[i] }));

    async function worker() {
      while (true) {
        const myIdx = idx++;
        if (myIdx >= queue.length) return;
        const item = queue[myIdx];
        if (!item.prep.ok) {
          setCards((prev) => prev.map((p) => (p.id === item.card.id ? { ...p, status: "id-failed", error: "Bad image" } : p)));
          continue;
        }
        const full = item.prep.full;
        const thumb = item.prep.thumb;
        setCards((prev) =>
          prev.map((p) => (p.id === item.card.id ? { ...p, full, thumb, status: "identifying" } : p))
        );
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: full.base64,
              mimeType: full.mimeType,
              thresholds,
              skipComps: false,
            }),
          });
          const data: ScanResponse & { error?: string } = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
          setCards((prev) => prev.map((p) => (p.id === item.card.id ? { ...p, scan: data, status: "identified" } : p)));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed";
          setCards((prev) => prev.map((p) => (p.id === item.card.id ? { ...p, status: "id-failed", error: msg } : p)));
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setRunning(false);
  }

  function updateCost(id: string, cost: string) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, cost } : c)));
  }

  function skip(id: string) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: "skipped" } : c)));
  }

  async function saveOne(card: CardState): Promise<boolean> {
    if (!card.scan?.identified) return false;
    const i = card.scan.identified;
    const payload: Record<string, unknown> = {
      title: i.title,
      cost: Number(card.cost || 0),
      player: i.player || undefined,
      year: i.year || undefined,
      setName: i.setName || undefined,
      parallel: i.parallel || undefined,
      cardNumber: i.cardNumber || undefined,
      grade: i.grade || undefined,
      sport: i.sport || undefined,
      rookie: i.rookie || false,
      notes: i.notes || undefined,
      status: "raw",
      marketValue: card.scan.comps?.median ?? undefined,
      marketValueAt: card.scan.comps?.median ? new Date().toISOString().slice(0, 10) : undefined,
    };
    if (card.thumb) {
      payload.imageBase64 = card.thumb.base64;
      payload.imageMimeType = card.thumb.mimeType;
    }
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async function saveOneById(id: string) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: "saving", error: null } : c)));
    const ok = await saveOne(card);
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: ok ? "saved" : "save-failed", error: ok ? null : "Save failed" } : c))
    );
  }

  async function saveAll() {
    setSavingAll(true);
    const toSave = cards.filter((c) => c.status === "identified");
    for (const card of toSave) {
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: "saving", error: null } : c)));
      const ok = await saveOne(card);
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, status: ok ? "saved" : "save-failed", error: ok ? null : "Save failed" } : c))
      );
    }
    setSavingAll(false);
  }

  const counts = {
    total: cards.length,
    identified: cards.filter((c) => c.status === "identified").length,
    saved: cards.filter((c) => c.status === "saved").length,
    failed: cards.filter((c) => c.status === "id-failed" || c.status === "save-failed").length,
    pending: cards.filter((c) => c.status === "queued" || c.status === "identifying" || c.status === "saving").length,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">📚 Batch Scan</h1>
          <p className="text-white/50 text-sm">Upload many cards at once — each gets identified + priced.</p>
        </div>
        <Link href="/scan" className="text-xs text-white/50 hover:text-accent">Single scan</Link>
      </div>

      {cards.length === 0 && (
        <div className="card text-center py-12">
          <button onClick={() => fileRef.current?.click()} className="mx-auto flex flex-col items-center gap-3 group">
            <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/40 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <PhotoStackIcon />
            </div>
            <span className="text-accent font-semibold text-lg">Pick multiple photos</span>
            <span className="text-white/40 text-sm">Tap to choose 2+ cards from your gallery</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          <div className="mt-6 text-xs text-white/40 max-w-sm mx-auto">
            Tip: shoot all your cards first, then come here and bulk-select them. Each photo runs through Claude Vision + comp lookup independently.
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <>
          <div className="card grid grid-cols-4 gap-2 text-center">
            <StatBox label="Total" value={counts.total} />
            <StatBox label="Identified" value={counts.identified} tone={counts.identified > 0 ? "good" : undefined} />
            <StatBox label="Saved" value={counts.saved} tone={counts.saved > 0 ? "good" : undefined} />
            <StatBox label="Failed" value={counts.failed} tone={counts.failed > 0 ? "bad" : undefined} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn flex-1"
              onClick={saveAll}
              disabled={savingAll || running || counts.identified === 0}
            >
              {savingAll ? "Saving…" : `Save all (${counts.identified})`}
            </button>
            <button className="btn-ghost" onClick={reset} disabled={savingAll}>
              Clear
            </button>
            <button
              className="btn-ghost"
              onClick={() => fileRef.current?.click()}
              disabled={running || savingAll}
            >
              + Add more
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          </div>

          <div className="space-y-3">
            {cards.map((c) => (
              <CardRow key={c.id} card={c} onCostChange={(v) => updateCost(c.id, v)} onSave={() => saveOneById(c.id)} onSkip={() => skip(c.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardRow({
  card,
  onCostChange,
  onSave,
  onSkip,
}: {
  card: CardState;
  onCostChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const i = card.scan?.identified;
  const comps = card.scan?.comps;
  const median = comps?.median;
  const cost = Number(card.cost || 0);
  const profit = median && cost ? median - cost : null;
  const roi = median && cost > 0 ? ((median - cost) / cost) * 100 : null;

  return (
    <div className="card flex gap-3 items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.previewUrl} alt="" className="w-20 h-28 object-cover rounded bg-black flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <StatusPill status={card.status} error={card.error} />

        {i && (
          <div>
            <div className="text-sm font-medium line-clamp-2">{i.title}</div>
            {(i.player || i.year || i.setName) && (
              <div className="text-xs text-white/40 mt-0.5">
                {[i.player, i.year, i.setName, i.parallel].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        )}

        {median !== undefined && (
          <div className="text-xs text-white/60">
            Market: <span className="font-mono text-white">${median}</span>
            {comps && (
              <span className="opacity-50"> · {comps.count} comps · ${comps.low}-${comps.high}</span>
            )}
          </div>
        )}
        {card.scan?.compsError && (
          <div className="text-xs text-yellow-400/70">Comps: {card.scan.compsError}</div>
        )}

        {(card.status === "identified" || card.status === "save-failed") && (
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/50 text-xs">$</span>
              <input
                className="input pl-5 py-1.5 text-sm"
                inputMode="decimal"
                placeholder="cost"
                value={card.cost}
                onChange={(e) => onCostChange(e.target.value)}
              />
            </div>
            {profit !== null && (
              <div className="text-xs text-right flex-shrink-0">
                <div className={profit >= 0 ? "text-good font-semibold" : "text-bad font-semibold"}>
                  {profit >= 0 ? "+" : ""}${profit.toFixed(0)}
                </div>
                {roi !== null && (
                  <div className="text-[10px] opacity-60">{roi >= 0 ? "+" : ""}{roi.toFixed(0)}%</div>
                )}
              </div>
            )}
            <button className="btn !py-1 !px-3 text-xs" onClick={onSave}>Save</button>
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={onSkip}>Skip</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, error }: { status: CardState["status"]; error: string | null }) {
  const map: Record<CardState["status"], { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-white/5 text-white/50" },
    identifying: { label: "Identifying…", cls: "bg-accent/15 text-accent" },
    identified: { label: "Ready", cls: "bg-good/15 text-good" },
    "id-failed": { label: `Failed${error ? `: ${error}` : ""}`, cls: "bg-red-500/15 text-red-400" },
    saving: { label: "Saving…", cls: "bg-accent/15 text-accent" },
    saved: { label: "✓ Saved", cls: "bg-good/15 text-good" },
    "save-failed": { label: `Save failed${error ? `: ${error}` : ""}`, cls: "bg-red-500/15 text-red-400" },
    skipped: { label: "Skipped", cls: "bg-white/5 text-white/40" },
  };
  const { label, cls } = map[status];
  return <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function StatBox({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div>
      <div className="label text-[10px]">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function PhotoStackIcon() {
  return (
    <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}
