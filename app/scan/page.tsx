"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ScanResult, ScanResponse } from "@/app/api/scan/route";
import { loadThresholds } from "@/lib/client-settings";
import { resizeImage } from "@/lib/image";

type Stage = "idle" | "preview" | "identifying" | "review" | "saving" | "saved";
type Mode = "save" | "price-only";

export default function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [mode, setMode] = useState<Mode>("save");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [thumbImage, setThumbImage] = useState<{ base64: string; mimeType: string; dataUrl: string } | null>(null);
  const [cost, setCost] = useState("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage("idle");
    setPreviewUrl(null);
    setFullImage(null);
    setThumbImage(null);
    setCost("");
    setScan(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("preview");
    try {
      const [full, thumb] = await Promise.all([
        resizeImage(file, 1280),
        resizeImage(file, 160, 0.65),
      ]);
      setFullImage({ base64: full.base64, mimeType: full.mimeType });
      setThumbImage(thumb);
    } catch {
      setError("Could not process that image. Try a different photo.");
    }
  }

  async function identify() {
    if (!fullImage) return;
    setStage("identifying");
    setError(null);
    try {
      const thresholds = loadThresholds();
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: fullImage.base64,
          mimeType: fullImage.mimeType,
          cost: cost ? Number(cost) : undefined,
          thresholds,
        }),
      });
      const data: ScanResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Identification failed");
      setScan(data);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("preview");
    }
  }

  async function save() {
    if (!scan?.identified) return;
    setStage("saving");
    setError(null);
    try {
      const i = scan.identified;
      const payload: Record<string, unknown> = {
        title: i.title,
        cost: Number(cost || 0),
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
        marketValue: scan.comps?.median ?? undefined,
        marketValueAt: scan.comps?.median ? new Date().toISOString().slice(0, 10) : undefined,
      };
      if (thumbImage) {
        payload.imageBase64 = thumbImage.base64;
        payload.imageMimeType = thumbImage.mimeType;
      }
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStage("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStage("review");
    }
  }

  const identified = scan?.identified;
  const comps = scan?.comps;
  const deal = scan?.deal;

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scan a Card</h1>
          <p className="text-white/50 text-sm">Snap → ID → comps → save</p>
        </div>
        <Link href="/settings" className="text-xs text-white/50 hover:text-accent">Rules</Link>
      </div>

      {/* Mode toggle */}
      {stage === "idle" && (
        <div className="flex gap-2 rounded-xl border border-white/10 p-1 bg-ink">
          <ModeButton active={mode === "save"} onClick={() => setMode("save")}>Save to collection</ModeButton>
          <ModeButton active={mode === "price-only"} onClick={() => setMode("price-only")}>Just price it</ModeButton>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {stage === "idle" && (
        <div className="card text-center py-12">
          <button onClick={() => fileRef.current?.click()} className="mx-auto flex flex-col items-center gap-3 group">
            <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/40 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <CameraIcon />
            </div>
            <span className="text-accent font-semibold text-lg">Take a photo</span>
            <span className="text-white/40 text-sm">or tap to choose from gallery</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {(stage === "preview" || stage === "identifying") && previewUrl && (
        <>
          <div className="card p-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Card preview" className="w-full max-h-72 object-contain bg-black" />
          </div>

          <div className="card space-y-4">
            {mode === "save" && (
              <div>
                <div className="label mb-1">What did you pay?</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    className="input pl-7"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>
            )}
            {mode === "price-only" && (
              <div>
                <div className="label mb-1">Asking price (optional, for verdict)</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    className="input pl-7"
                    inputMode="decimal"
                    placeholder="e.g. 75 — leave blank to just see comps"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button className="btn w-full py-3 text-base" onClick={identify} disabled={stage === "identifying" || !fullImage}>
              {stage === "identifying" ? (
                <span className="flex items-center gap-2"><SpinnerIcon /> Identifying & pulling comps…</span>
              ) : (
                mode === "price-only" ? "Identify & Price" : "Identify Card"
              )}
            </button>
            <button onClick={reset} className="btn-ghost w-full text-sm">Use a different photo</button>
          </div>
        </>
      )}

      {(stage === "review" || stage === "saving") && identified && (
        <>
          {previewUrl && (
            <div className="card p-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Card preview" className="w-full max-h-48 object-contain bg-black" />
            </div>
          )}

          {/* Verdict banner */}
          {deal && <VerdictBanner deal={deal} />}

          {/* Comps */}
          {comps && comps.count > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Recent Comps</h2>
                <SourceBadge source={comps.source} />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Median" value={`$${comps.median}`} highlight />
                <Stat label="Low" value={`$${comps.low}`} />
                <Stat label="High" value={`$${comps.high}`} />
                <Stat label="Count" value={String(comps.count)} />
              </div>
              {comps.note && <p className="text-xs text-white/40">{comps.note}</p>}
            </div>
          )}
          {comps && comps.count === 0 && (
            <div className="card text-sm text-white/60">No comps found yet. Try a slightly different angle or it might be a thin market.</div>
          )}
          {scan?.compsError && (
            <div className="card text-sm text-yellow-400/80">Couldn't fetch comps: {scan.compsError}</div>
          )}

          {/* Identified fields */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckIcon />
              <h2 className="font-semibold text-white">Card Identified</h2>
            </div>
            <Field label="Title" value={identified.title} />
            {identified.player && <Field label="Player" value={identified.player} />}
            <div className="grid grid-cols-2 gap-3">
              {identified.year && <Field label="Year" value={String(identified.year)} />}
              {identified.setName && <Field label="Set" value={identified.setName} />}
              {identified.parallel && <Field label="Parallel" value={identified.parallel} />}
              {identified.grade && <Field label="Grade" value={identified.grade} />}
              {identified.cardNumber && <Field label="Card #" value={identified.cardNumber} />}
              {identified.sport && <Field label="Sport" value={identified.sport} />}
            </div>
            {identified.rookie && (
              <div className="inline-block rounded-full bg-accent/20 text-accent text-xs px-2 py-0.5 font-semibold">Rookie Card</div>
            )}
            {identified.notes && <Field label="Notes" value={identified.notes} />}
          </div>

          {/* Save section (only in save mode) */}
          {mode === "save" && (
            <div className="card space-y-4">
              <div>
                <div className="label mb-1">Cost paid</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    className="input pl-7"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn w-full py-3 text-base" onClick={save} disabled={stage === "saving"}>
                {stage === "saving" ? (
                  <span className="flex items-center gap-2"><SpinnerIcon /> Saving…</span>
                ) : (
                  "Save to Collection"
                )}
              </button>
            </div>
          )}

          <button onClick={reset} className="btn-ghost w-full text-sm">Start over</button>
        </>
      )}

      {stage === "saved" && identified && (
        <div className="card text-center py-10 space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <BigCheckIcon />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Saved!</h2>
            <p className="text-white/60 text-sm mt-1">{identified.title}</p>
            {comps?.median ? (
              <p className="text-white/40 text-xs mt-2">Market value tracked: ${comps.median}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={reset} className="btn w-full py-3 text-base">Scan Another</button>
            <Link href="/inventory" className="btn-ghost block py-3 text-sm text-center">View My Collection</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ deal }: { deal: { verdict: string; reasoning: string; profit: number; roiPct: number; netProceeds: number } }) {
  const styles =
    deal.verdict === "BUY"
      ? "bg-green-500/15 border-green-500/40 text-green-400"
      : deal.verdict === "MAYBE"
      ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
      : "bg-red-500/15 border-red-500/40 text-red-400";
  return (
    <div className={`card border ${styles} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">{deal.verdict}</div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider opacity-70">Est. profit</div>
          <div className="text-xl font-bold">${deal.profit.toFixed(2)}</div>
        </div>
      </div>
      <p className="text-sm opacity-90">{deal.reasoning}</p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div><div className="opacity-60">ROI</div><div className="font-mono font-semibold">{deal.roiPct}%</div></div>
        <div><div className="opacity-60">Net after fees</div><div className="font-mono font-semibold">${deal.netProceeds.toFixed(2)}</div></div>
        <div><div className="opacity-60">Profit</div><div className="font-mono font-semibold">${deal.profit.toFixed(2)}</div></div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const label =
    source === "marketplace-insights" ? "Sold comps (eBay API)" :
    source === "browse-active" ? "Active listings × 0.9" :
    "Scraped sold listings";
  return <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-accent text-ink" : "text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-white mt-0.5">{value}</div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/5 p-2 ${highlight ? "bg-accent/10" : "bg-ink"}`}>
      <div className="label text-[10px]">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BigCheckIcon() {
  return (
    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
