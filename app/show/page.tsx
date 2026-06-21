"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { resizeImage } from "@/lib/image";
import { loadThresholds } from "@/lib/client-settings";
import type { ScanResponse } from "@/app/api/scan/route";

type Stage = "idle" | "scanning" | "result";

export default function CardShowPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const askingRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [asking, setAsking] = useState("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function reset() {
    setStage("idle");
    setAsking("");
    setScan(null);
    setError(null);
    setPreviewUrl(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    setTimeout(() => askingRef.current?.focus(), 50);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!asking || Number(asking) <= 0) {
      setError("Type the asking price first ↑");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      return;
    }
    setError(null);
    setStage("scanning");
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const img = await resizeImage(file, 1280);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: img.base64,
          mimeType: img.mimeType,
          cost: Number(asking),
          thresholds: loadThresholds(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setScan(data);
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setStage("idle");
    }
  }

  const deal = scan?.deal;
  const comps = scan?.comps;
  const identified = scan?.identified;

  const verdictBg =
    deal?.verdict === "BUY" ? "bg-green-500" :
    deal?.verdict === "MAYBE" ? "bg-yellow-500" :
    deal?.verdict === "PASS" ? "bg-red-500" :
    "bg-white/10";

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">🏃 Card Show Mode</h1>
        <Link href="/scan" className="text-xs text-white/40 hover:text-white">Normal scan →</Link>
      </div>
      <p className="text-white/50 text-sm -mt-2">Fastest path: price → photo → verdict in seconds. No saving.</p>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {stage === "idle" && (
        <>
          <div className="card space-y-3">
            <div>
              <div className="label mb-1">Seller's asking price</div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 text-2xl">$</span>
                <input
                  ref={askingRef}
                  autoFocus
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="input pl-10 text-3xl font-bold py-4 h-auto"
                  placeholder="0"
                  value={asking}
                  onChange={(e) => setAsking(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => cameraRef.current?.click()}
            disabled={!asking || Number(asking) <= 0}
            className="w-full bg-accent text-ink rounded-2xl py-6 font-bold text-xl disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-2"
          >
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            Snap & Score
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            disabled={!asking || Number(asking) <= 0}
            className="w-full rounded-2xl py-3 font-medium text-base border border-white/10 text-white/80 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
            Choose from gallery
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
        </>
      )}

      {stage === "scanning" && (
        <div className="card text-center py-16 space-y-4">
          {previewUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="" className="w-32 h-44 object-cover mx-auto rounded-lg opacity-50" />
          )}
          <div className="text-white/60 text-sm">Identifying & pulling comps…</div>
          <Spinner />
        </div>
      )}

      {stage === "result" && deal && (
        <>
          {/* Huge verdict block */}
          <div className={`${verdictBg} text-ink rounded-3xl p-6 text-center shadow-xl`}>
            <div className="text-6xl font-black tracking-tight">{deal.verdict}</div>
            {deal.verdict === "BUY" && (
              <>
                <div className="text-2xl font-bold mt-2">+${deal.profit.toFixed(0)} profit · {deal.roiPct}% ROI</div>
                <div className="text-sm opacity-80 mt-1">Pay up to ${asking}</div>
              </>
            )}
            {deal.verdict === "MAYBE" && (
              <>
                <div className="text-xl font-bold mt-2">+${deal.profit.toFixed(0)} · {deal.roiPct}% ROI</div>
                <div className="text-sm opacity-80 mt-1">Counter-offer for more margin</div>
              </>
            )}
            {deal.verdict === "PASS" && (
              <>
                <div className="text-xl font-bold mt-2">{deal.profit < 0 ? `-$${Math.abs(deal.profit).toFixed(0)} loss` : `Only $${deal.profit.toFixed(0)}`}</div>
                <div className="text-sm opacity-80 mt-1">Walk away or lowball</div>
              </>
            )}
          </div>

          {/* Counter-offer suggestion */}
          {comps?.median && deal.verdict !== "BUY" && (
            <CounterOffer median={comps.median} currentAsk={Number(asking)} />
          )}

          {/* Quick stats */}
          {comps && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Comp" value={`$${comps.median}`} />
              <Stat label="Asking" value={`$${asking}`} />
              <Stat label="Net after fees" value={`$${deal.netProceeds.toFixed(0)}`} />
            </div>
          )}

          {/* What it is */}
          {identified && (
            <div className="card text-sm space-y-1">
              <div className="text-white/40 text-xs uppercase tracking-wide">Identified</div>
              <div className="font-medium">{identified.title}</div>
            </div>
          )}

          {/* Big next button */}
          <button
            onClick={reset}
            className="w-full bg-accent text-ink rounded-2xl py-5 font-bold text-lg"
          >
            Next Card →
          </button>
        </>
      )}
    </div>
  );
}

function CounterOffer({ median, currentAsk }: { median: number; currentAsk: number }) {
  // Walk back from comp median: max price to still be BUY (40% ROI default).
  const t = loadThresholds();
  const targetROI = t.buyMinRoiPct / 100;
  const net = median - median * t.feeRate - t.fixedFee - t.shippingCost;
  const maxBuy = net / (1 + targetROI);
  if (maxBuy >= currentAsk || maxBuy <= 0) return null;
  return (
    <div className="card border border-accent/30 bg-accent/5 text-center">
      <div className="text-xs text-white/60 mb-1">Counter-offer</div>
      <div className="text-3xl font-bold text-accent">${maxBuy.toFixed(0)}</div>
      <div className="text-xs text-white/40 mt-1">Max to hit your {t.buyMinRoiPct}% ROI rule</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-3">
      <div className="label text-[10px]">{label}</div>
      <div className="text-base font-bold mt-1">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-6 h-6 animate-spin mx-auto text-accent" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
