"use client";

import { useRef, useState } from "react";
import { resizeImage } from "@/lib/image";
import { PLATFORM_PRESETS } from "@/lib/settings";
import { loadHuntSettings } from "@/lib/deal-hunter";

// Good searches to try on eBay — organized by angle
const SUGGESTED_SEARCHES = [
  {
    label: "Misspellings (fewer bidders see these)",
    searches: [
      "Mahomse rookie card",
      "Lebron Jmaes rookie",
      "Griffey Jr basball card",
      "Trout rookei card",
      "Luca Doncic rookie",
    ],
  },
  {
    label: "Undervalued lots & collections",
    searches: [
      "baseball card lot rookies",
      "basketball card collection PSA",
      "football card lot refractors",
      "sports card lot chrome prizm",
    ],
  },
  {
    label: "Ending soon, no bids",
    searches: [
      "PSA 10 rookie 1 bid ending",
      "prizm rookie card auction ending",
      "chrome refractor rookie no reserve",
      "graded card lot 1 hour",
    ],
  },
  {
    label: "Underrated players",
    searches: [
      "Jaylen Brown prizm rookie",
      "Tua Tagovailoa prizm rookie PSA",
      "Wander Franco topps chrome rookie",
      "Paolo Banchero rookie PSA 10",
      "CJ Stroud rookie prizm",
    ],
  },
];

type Stage = "idle" | "preview" | "checking" | "result";

type CheckResult = {
  title: string;
  player?: string;
  year?: number;
  setName?: string;
  parallel?: string | null;
  grade?: string | null;
  rookie?: boolean;
  sport?: string;
  notes?: string;
  comps?: { median: number; low: number; high: number; count: number };
  compsError?: string;
  askingPrice: number;
  tax: number;
  totalCost: number;
  estimatedSellPrice: number;
  platformFee: number;
  outboundShipping: number;
  profit: number;
  roiPct: number;
  verdict: "BUY" | "MAYBE" | "PASS";
  reasoning: string;
};

export default function DealCheckPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [shippingPaid, setShippingPaid] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function reset() {
    setStage("idle");
    setPreviewUrl(null);
    setFullImage(null);
    setAskingPrice("");
    setShippingPaid("");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    const full = await resizeImage(file, 1280);
    setFullImage({ base64: full.base64, mimeType: full.mimeType });
    setStage("preview");
  }

  async function checkDeal() {
    if (!fullImage) return;
    setStage("checking");
    setError(null);

    try {
      // Step 1: identify + comps
      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: fullImage.base64,
          mimeType: fullImage.mimeType,
          skipComps: false,
        }),
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "Identification failed");

      // Step 2: calculate profit with tax + sell platform
      const settings = (() => {
        try {
          return JSON.parse(localStorage.getItem("cardhelper:hunt-settings") || "{}");
        } catch { return {}; }
      })();
      const taxPct = settings.salesTaxPct ?? 5;
      const platformKey = (settings.sellPlatform ?? "tiktok_ig_cash") as keyof typeof PLATFORM_PRESETS;
      const platform = PLATFORM_PRESETS[platformKey] ?? PLATFORM_PRESETS.tiktok_ig_cash;

      const price = Number(askingPrice) || 0;
      const shipping = Number(shippingPaid) || 0;
      const tax = +((price * taxPct) / 100).toFixed(2);
      const totalCost = +(price + shipping + tax).toFixed(2);

      const median = scanData.comps?.median ?? 0;
      const platformFee = median > 0 ? +(median * platform.feeRate + platform.fixedFee).toFixed(2) : 0;
      const outboundShipping = platform.shippingCost;
      const profit = +(median - platformFee - outboundShipping - totalCost).toFixed(2);
      const roiPct = totalCost > 0 ? +((profit / totalCost) * 100).toFixed(1) : 0;

      let verdict: "BUY" | "MAYBE" | "PASS";
      let reasoning: string;
      if (profit >= 15 && roiPct >= 30) {
        verdict = "BUY";
        reasoning = `$${profit.toFixed(2)} profit at ${roiPct}% ROI. Strong flip — grab it.`;
      } else if (profit >= 8 && roiPct >= 15) {
        verdict = "MAYBE";
        reasoning = `$${profit.toFixed(2)} profit at ${roiPct}% ROI. Decent margin but not a slam dunk. Only if you can move it fast.`;
      } else if (profit > 0) {
        verdict = "PASS";
        reasoning = `Only $${profit.toFixed(2)} profit (${roiPct}% ROI). Too thin after tax and shipping. Wait for a better price.`;
      } else {
        verdict = "PASS";
        reasoning = `You'd lose $${Math.abs(profit).toFixed(2)} on this deal after all costs. Hard pass.`;
      }

      setResult({
        ...scanData.identified,
        comps: scanData.comps,
        compsError: scanData.compsError,
        askingPrice: price,
        tax,
        totalCost,
        estimatedSellPrice: median,
        platformFee,
        outboundShipping,
        profit,
        roiPct,
        verdict,
        reasoning,
      });
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("preview");
    }
  }

  function copySearch(q: string) {
    navigator.clipboard.writeText(q);
    setCopied(q);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Check a Deal</h1>
        <p className="text-white/50 text-sm mt-1">
          Find something on eBay → screenshot it → upload here → get the verdict.
        </p>
      </div>

      {/* Deal checker */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Upload the listing or card photo</h2>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {stage === "idle" && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-white/15 rounded-xl py-10 flex flex-col items-center gap-3 text-white/40 hover:border-accent/40 hover:text-accent/60 transition-colors"
          >
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm">Tap to upload screenshot or photo</span>
          </button>
        )}

        {(stage === "preview" || stage === "checking") && previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="listing" className="w-full rounded-xl max-h-60 object-contain bg-black" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Asking price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input className="input pl-7" inputMode="decimal" placeholder="e.g. 35" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="label mb-1">Shipping you&apos;ll pay</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input className="input pl-7" inputMode="decimal" placeholder="e.g. 4.99" value={shippingPaid} onChange={(e) => setShippingPaid(e.target.value)} />
                </div>
              </div>
            </div>
            <button className="btn w-full py-3" onClick={checkDeal} disabled={stage === "checking" || !askingPrice}>
              {stage === "checking" ? "Identifying & checking comps…" : "Should I buy this?"}
            </button>
            <button onClick={reset} className="btn-ghost w-full text-sm">Use different photo</button>
          </>
        )}

        {stage === "result" && result && (
          <>
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="listing" className="w-full rounded-xl max-h-48 object-contain bg-black" />
            )}

            {/* Verdict */}
            <div className={`rounded-xl border p-4 space-y-3 ${
              result.verdict === "BUY" ? "border-green-500/40 bg-green-500/10 text-green-400" :
              result.verdict === "MAYBE" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" :
              "border-red-500/40 bg-red-500/10 text-red-400"
            }`}>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-black">{result.verdict}</div>
                {result.profit > 0 && (
                  <div className="text-right">
                    <div className="text-xs opacity-60">Est. profit</div>
                    <div className="text-2xl font-bold">+${result.profit.toFixed(2)}</div>
                  </div>
                )}
              </div>
              <p className="text-sm opacity-90">{result.reasoning}</p>
            </div>

            {/* Cost breakdown */}
            <div className="card !bg-white/5 space-y-2 text-sm">
              <div className="font-semibold text-xs uppercase tracking-wider text-white/40 mb-1">Cost breakdown</div>
              <Row label="Card price" value={`$${result.askingPrice.toFixed(2)}`} />
              <Row label="Shipping paid" value={`$${Number(shippingPaid || 0).toFixed(2)}`} />
              <Row label="WI sales tax (5%)" value={`$${result.tax.toFixed(2)}`} />
              <div className="border-t border-white/10 pt-2">
                <Row label="Total cost" value={`$${result.totalCost.toFixed(2)}`} bold />
              </div>
              <div className="border-t border-white/10 pt-2 space-y-1">
                <Row label="Est. sell price (comps median)" value={result.estimatedSellPrice > 0 ? `$${result.estimatedSellPrice.toFixed(2)}` : "—"} />
                {result.platformFee > 0 && <Row label="Platform fee" value={`-$${result.platformFee.toFixed(2)}`} />}
                <Row label="Outbound shipping" value={`-$${result.outboundShipping.toFixed(2)}`} />
              </div>
              <div className="border-t border-white/10 pt-2">
                <Row
                  label={`Profit (${result.roiPct}% ROI)`}
                  value={`${result.profit >= 0 ? "+" : ""}$${result.profit.toFixed(2)}`}
                  bold
                  tone={result.profit > 0 ? "good" : "bad"}
                />
              </div>
            </div>

            {/* Comps */}
            {result.comps && result.comps.count > 0 && (
              <div className="card space-y-2">
                <div className="text-xs uppercase tracking-wider text-white/40 font-semibold">Recent sold comps</div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Median", value: `$${result.comps.median}` },
                    { label: "Low", value: `$${result.comps.low}` },
                    { label: "High", value: `$${result.comps.high}` },
                    { label: "Sales", value: String(result.comps.count) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/5 bg-ink p-2">
                      <div className="text-[10px] text-white/40">{s.label}</div>
                      <div className="text-sm font-semibold mt-0.5">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.compsError && (
              <div className="text-xs text-yellow-400/70">Couldn&apos;t pull comps: {result.compsError}</div>
            )}

            {/* Card ID */}
            <div className="card space-y-1 text-sm">
              <div className="font-semibold">{result.title}</div>
              <div className="text-white/40 text-xs">
                {[result.year, result.player, result.setName, result.parallel, result.grade].filter(Boolean).join(" · ")}
              </div>
              {result.rookie && <span className="inline-block rounded-full bg-accent/20 text-accent text-xs px-2 py-0.5 font-semibold">Rookie Card</span>}
              {result.notes && <div className="text-white/40 text-xs">{result.notes}</div>}
            </div>

            <button onClick={reset} className="btn-ghost w-full text-sm">Check another deal</button>
          </>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </section>

      {/* Suggested searches */}
      <section className="space-y-4">
        <h2 className="font-semibold">What to search on eBay right now</h2>
        <p className="text-white/40 text-xs -mt-2">Tap any search to copy it, then paste it into eBay.</p>
        {SUGGESTED_SEARCHES.map((group) => (
          <div key={group.label} className="card space-y-2">
            <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">{group.label}</div>
            <div className="space-y-1.5">
              {group.searches.map((q) => (
                <button
                  key={q}
                  onClick={() => copySearch(q)}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
                >
                  <span>{q}</span>
                  <span className="text-[10px] text-white/30 ml-2 flex-shrink-0">
                    {copied === q ? "✓ copied" : "copy"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-white";
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50">{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${color}`}>{value}</span>
    </div>
  );
}
