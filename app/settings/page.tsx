"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THRESHOLDS, PLATFORM_PRESETS, type PlatformKey, type Thresholds } from "@/lib/settings";
import { loadThresholds, resetThresholds, saveThresholds } from "@/lib/client-settings";

export default function SettingsPage() {
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setT(loadThresholds());
  }, []);

  function update<K extends keyof Thresholds>(key: K, value: string) {
    const n = Number(value);
    if (isNaN(n)) return;
    setT((prev) => ({ ...prev, [key]: n }));
  }

  function save() {
    saveThresholds(t);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  function reset() {
    resetThresholds();
    setT(DEFAULT_THRESHOLDS);
  }

  function applyPreset(key: PlatformKey) {
    const p = PLATFORM_PRESETS[key];
    setT((prev) => ({ ...prev, feeRate: p.feeRate, fixedFee: p.fixedFee, shippingCost: p.shippingCost }));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Rules</h1>
        <p className="text-white/50 text-sm mt-1">
          Set the thresholds that decide BUY / MAYBE / PASS. These apply everywhere — scan, comps, watchlist.
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">When to Buy</h2>
        <p className="text-white/50 text-xs">A deal is marked <span className="text-good font-semibold">BUY</span> only if it clears these.</p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Min ROI %" suffix="%" value={t.buyMinRoiPct} onChange={(v) => update("buyMinRoiPct", v)} />
          <NumberField label="Min profit $" prefix="$" value={t.buyMinProfitDollars} onChange={(v) => update("buyMinProfitDollars", v)} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Marginal Deals (MAYBE)</h2>
        <p className="text-white/50 text-xs">Below these = PASS. Between these and BUY = MAYBE.</p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Min ROI %" suffix="%" value={t.maybeMinRoiPct} onChange={(v) => update("maybeMinRoiPct", v)} />
          <NumberField label="Min profit $" prefix="$" value={t.maybeMinProfitDollars} onChange={(v) => update("maybeMinProfitDollars", v)} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">When to Sell</h2>
        <p className="text-white/50 text-xs">Default listing price = comp median × (1 + this %). Higher = more profit but slower sell.</p>
        <NumberField label="Sell markup over comp median" suffix="%" value={t.sellMarkupPct} onChange={(v) => update("sellMarkupPct", v)} />
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">Selling Platform Fees</h2>
        <div>
          <div className="label mb-2">Quick presets</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLATFORM_PRESETS) as PlatformKey[]).map((k) => {
              const p = PLATFORM_PRESETS[k];
              const active = t.feeRate === p.feeRate && t.fixedFee === p.fixedFee && t.shippingCost === p.shippingCost;
              return (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                    active ? "border-accent bg-accent/10 text-accent" : "border-white/10 text-white/60 hover:border-white/30"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <NumberField label="Fee rate" suffix="%" step="0.05" value={+(t.feeRate * 100).toFixed(2)} onChange={(v) => update("feeRate", String(Number(v) / 100))} />
          <NumberField label="Fixed fee" prefix="$" step="0.01" value={t.fixedFee} onChange={(v) => update("fixedFee", v)} />
          <NumberField label="Shipping" prefix="$" step="0.01" value={t.shippingCost} onChange={(v) => update("shippingCost", v)} />
        </div>
      </section>

      <div className="flex gap-3 items-center">
        <button onClick={save} className="btn">Save</button>
        <button onClick={reset} className="btn-ghost">Reset to defaults</button>
        {savedFlash && <span className="text-good text-sm">✓ Saved</span>}
      </div>

      <p className="text-xs text-white/40 leading-relaxed">
        Settings save to this device. Open the site on a different phone/computer and they reset.
        We'll move this to the cloud once your eBay Marketplace Insights approval comes through.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">{prefix}</span>}
        <input
          type="number"
          step={step || "1"}
          className={`input ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50">{suffix}</span>}
      </div>
    </div>
  );
}
