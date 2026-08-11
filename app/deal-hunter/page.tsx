"use client";

import { useEffect, useState } from "react";
import type { HuntSettings, FoundDeal } from "@/lib/deal-hunter";
import { PLATFORM_PRESETS } from "@/lib/settings";

const ALL_SPORTS = ["baseball", "basketball", "football", "hockey", "soccer"];

const DEFAULT_SETTINGS: HuntSettings = {
  minBudget: 10,
  maxBudget: 100,
  minProfit: 10,
  sports: ["baseball", "basketball", "football"],
  keywords: [],
  sellPlatform: "tiktok_ig_cash",
  salesTaxPct: 5,
  updatedAt: "",
};

const LS_DEALS = "dh-deals";
const LS_SETTINGS = "dh-settings";

function lsLoadDeals(): FoundDeal[] {
  try { return JSON.parse(localStorage.getItem(LS_DEALS) ?? "[]"); } catch { return []; }
}
function lsSaveDeals(deals: FoundDeal[]) {
  try { localStorage.setItem(LS_DEALS, JSON.stringify(deals)); } catch { /* quota */ }
}
function lsLoadSettings(): HuntSettings | null {
  try { return JSON.parse(localStorage.getItem(LS_SETTINGS) ?? "null"); } catch { return null; }
}
function lsSaveSettings(s: HuntSettings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch { /* quota */ }
}

export default function DealHunterPage() {
  const [settings, setSettings] = useState<HuntSettings>(DEFAULT_SETTINGS);
  const [deals, setDeals] = useState<FoundDeal[]>([]);
  const [ebayReady, setEbayReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; found: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);

  useEffect(() => {
    // Load from localStorage first (persists across Vercel cold starts)
    const cachedSettings = lsLoadSettings();
    if (cachedSettings) setSettings(cachedSettings);
    setDeals(lsLoadDeals().filter((d) => !d.dismissed));
    // Check if eBay API is ready
    fetch("/api/deal-hunter", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEbayReady(d.ebayReady))
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSaving(true);
    lsSaveSettings(settings);
    setSaving(false);
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    setScanResult(null);
    try {
      lsSaveSettings(settings);
      const r = await fetch("/api/deal-hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", settings }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setScanResult({ scanned: d.scanned, found: d.found });
      const freshDeals: FoundDeal[] = d.deals ?? [];
      setDeals(freshDeals.filter((x) => !x.dismissed));
      lsSaveDeals(freshDeals);
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function dismiss(id: string) {
    setDeals((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      lsSaveDeals(updated);
      return updated;
    });
  }

  function toggleSport(sport: string) {
    setSettings((s) => ({
      ...s,
      sports: s.sports.includes(sport) ? s.sports.filter((x) => x !== sport) : [...s.sports, sport],
    }));
  }

  function addKeyword() {
    const kw = keywordInput.trim();
    if (!kw || settings.keywords.includes(kw)) return;
    setSettings((s) => ({ ...s, keywords: [...s.keywords, kw] }));
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    setSettings((s) => ({ ...s, keywords: s.keywords.filter((k) => k !== kw) }));
  }

  const buyDeals = deals.filter((d) => d.verdict === "BUY");
  const maybeDeals = deals.filter((d) => d.verdict === "MAYBE");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deal Hunter</h1>
          <p className="text-white/50 text-sm mt-1">
            Set your goals. Hit Scan. Buy the winners.
          </p>
        </div>
      </div>

      {/* Settings panel */}
      <section className="card space-y-4">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <h2 className="font-semibold">Hunt Settings</h2>
          <span className="text-white/40 text-sm">{settingsOpen ? "▲ collapse" : "▼ expand"}</span>
        </button>

        {settingsOpen && (
          <>
            {/* Budget */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Min buy price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    className="input pl-7"
                    inputMode="decimal"
                    value={settings.minBudget}
                    onChange={(e) => setSettings((s) => ({ ...s, minBudget: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div>
                <div className="label mb-1">Max buy price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    className="input pl-7"
                    inputMode="decimal"
                    value={settings.maxBudget}
                    onChange={(e) => setSettings((s) => ({ ...s, maxBudget: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {/* Sales tax */}
            <div>
              <div className="label mb-1">Your state's sales tax (charged by eBay at checkout)</div>
              <div className="relative max-w-xs">
                <input
                  className="input pr-8"
                  inputMode="decimal"
                  value={settings.salesTaxPct ?? 5}
                  onChange={(e) => setSettings((s) => ({ ...s, salesTaxPct: Number(e.target.value) || 0 }))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50">%</span>
              </div>
              <p className="text-xs text-white/40 mt-1">Wisconsin = 5%. Added to your buy cost automatically on every deal.</p>
            </div>

            {/* Min profit */}
            <div>
              <div className="label mb-1">Minimum profit after all fees & shipping</div>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                <input
                  className="input pl-7"
                  inputMode="decimal"
                  value={settings.minProfit}
                  onChange={(e) => setSettings((s) => ({ ...s, minProfit: Number(e.target.value) || 0 }))}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">
                {(() => {
                  const { feeRate, fixedFee } = PLATFORM_PRESETS[(settings.sellPlatform as keyof typeof PLATFORM_PRESETS) ?? "tiktok_ig_cash"] ?? PLATFORM_PRESETS.tiktok_ig_cash;
                  return feeRate === 0
                    ? "0% selling fees on your platform. Shipping factored in automatically."
                    : `${(feeRate * 100).toFixed(2)}% + $${fixedFee.toFixed(2)} selling fee factored in automatically.`;
                })()}
              </p>
            </div>

            {/* Sports */}
            <div>
              <div className="label mb-2">Sports to hunt</div>
              <div className="flex flex-wrap gap-2">
                {ALL_SPORTS.map((sport) => (
                  <button
                    key={sport}
                    onClick={() => toggleSport(sport)}
                    className={`px-3 py-1 rounded-full text-sm border capitalize transition-colors ${
                      settings.sports.includes(sport)
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-white/10 text-white/50 hover:border-white/30"
                    }`}
                  >
                    {sport}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific keywords */}
            <div>
              <div className="label mb-1">Specific players or cards (optional)</div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder='e.g. "Patrick Mahomes Prizm PSA 10"'
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                />
                <button className="btn-ghost px-4" onClick={addKeyword}>Add</button>
              </div>
              {settings.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.keywords.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-xs">
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="text-white/40 hover:text-bad ml-1">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-white/40 mt-1">
                The app already searches broadly by sport. Add specific searches on top of that.
              </p>
            </div>

            {/* Sell platform */}
            <div>
              <div className="label mb-1">Where you sell (affects profit calc)</div>
              <select
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-sm w-full"
                value={settings.sellPlatform ?? "tiktok_ig_cash"}
                onChange={(e) => setSettings((s) => ({ ...s, sellPlatform: e.target.value }))}
              >
                <option value="tiktok_ig_cash">TikTok Live / Cash App / Venmo (0% fee)</option>
                <option value="instagram_paypal">PayPal Goods &amp; Services (3.49% + $0.49)</option>
                <option value="tiktok_shop">TikTok Shop (8% + $0.30)</option>
                <option value="ebay">eBay (13.25% + $0.30)</option>
              </select>
              <p className="text-xs text-white/40 mt-1">
                Cash App personal &amp; PayPal F&amp;F = 0% but no buyer protection. PayPal G&amp;S = small fee but safer.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                className="btn flex-1 py-3 text-base"
                onClick={runScan}
                disabled={scanning}
              >
                {scanning ? "Scanning eBay…" : "🔍 Scan eBay Now"}
              </button>
              <button
                className="btn-ghost px-4"
                onClick={saveSettings}
                disabled={saving}
              >
                {saving ? "Saved" : "Save"}
              </button>
            </div>

          </>
        )}
      </section>

      {error && (
        <div className="card border-red-500/30 bg-red-500/5 text-red-400 text-sm">{error}</div>
      )}

      {scanResult && (
        <div className={`card text-sm ${scanResult.found > 0 ? "border-accent/30 bg-accent/5" : "border-white/10"}`}>
          Scanned <span className="font-semibold">{scanResult.scanned}</span> eBay listings →{" "}
          {scanResult.found > 0
            ? <><span className="font-semibold text-accent">{scanResult.found}</span> deals found that hit your profit goal.</>
            : <span className="text-white/60">No deals found this time. Try adding specific player keywords or lowering your min profit.</span>
          }
        </div>
      )}

      {/* BUY deals */}
      {buyDeals.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <span className="text-good">● BUY</span>
            <span className="text-white/50 text-sm font-normal">— these clear all your rules</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {buyDeals.map((d) => <DealCard key={d.id} deal={d} onDismiss={dismiss} />)}
          </div>
        </section>
      )}

      {/* MAYBE deals */}
      {maybeDeals.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <span className="text-yellow-400">● MAYBE</span>
            <span className="text-white/50 text-sm font-normal">— under your BUY threshold, still profitable</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {maybeDeals.map((d) => <DealCard key={d.id} deal={d} onDismiss={dismiss} />)}
          </div>
        </section>
      )}

      {deals.length === 0 && !scanning && (
        <div className="card text-center py-12 text-white/40">
          {ebayReady
            ? "Hit Scan to find deals. Results stay here between scans."
            : "Hit Scan eBay Now to find your first deals."}
        </div>
      )}

      {/* How it works */}
      <section className="card bg-white/[0.02] space-y-2 text-xs text-white/50">
        <h3 className="font-semibold text-sm text-white/70">How the math works</h3>
        <p>Buy price + shipping in → sell on your platform → subtract your platform&apos;s fee + shipping out = your profit. Only deals above your minimum show up. TikTok Live + Cash App = near-zero fees, so your profits are much higher than selling on eBay.</p>
        <p className="text-white/30">Estimated sell price comes from recent eBay sold comps for that card. The better the card title on eBay, the more accurate the estimate.</p>
      </section>
    </div>
  );
}

function DealCard({ deal, onDismiss }: { deal: FoundDeal; onDismiss: (id: string) => void }) {
  const hoursLeft = deal.endsAt
    ? Math.max(0, Math.round((new Date(deal.endsAt).getTime() - Date.now()) / 3600000))
    : null;

  return (
    <div className="card !p-0 overflow-hidden flex flex-col">
      {/* Image */}
      <div className="aspect-[4/3] bg-black overflow-hidden relative">
        {deal.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.image} alt={deal.title} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">No photo</div>
        )}
        <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${
          deal.verdict === "BUY" ? "bg-good text-black" : "bg-yellow-500 text-black"
        }`}>
          {deal.verdict}
        </div>
        {hoursLeft !== null && hoursLeft < 24 && (
          <div className="absolute top-2 right-2 text-[10px] bg-red-500/80 text-white px-1.5 py-0.5 rounded">
            {hoursLeft}h left
          </div>
        )}
      </div>

      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="text-sm font-medium leading-snug line-clamp-2">{deal.title}</div>

        {deal.condition && (
          <div className="text-xs text-white/40">{deal.condition}</div>
        )}

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div>
            <div className="text-white/40">You pay</div>
            <div className="font-mono font-semibold">${deal.totalCost.toFixed(2)}</div>
            {deal.tax > 0 && <div className="text-[10px] text-white/30">incl. ${deal.tax.toFixed(2)} tax</div>}
          </div>
          <div>
            <div className="text-white/40">Sell est.</div>
            <div className="font-mono font-semibold">${deal.estimatedSellPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-white/40">Profit</div>
            <div className="font-mono font-semibold text-good">+${deal.profit.toFixed(2)}</div>
          </div>
        </div>

        <div className="text-xs text-white/30 font-mono">{deal.roiPct}% ROI after tax &amp; fees</div>

        <div className="flex gap-2 pt-1 mt-auto">
          <a
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn flex-1 text-center text-sm py-2"
          >
            Buy on eBay →
          </a>
          <button
            onClick={() => onDismiss(deal.id)}
            className="text-white/30 hover:text-bad text-xs px-2"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
