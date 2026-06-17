"use client";

import { useState } from "react";
import type { GradingAnalysis, GradingService } from "@/lib/grading";

export default function GradePage() {
  const [query, setQuery] = useState("");
  const [rawCost, setRawCost] = useState("");
  const [service, setService] = useState<GradingService>("psa");
  const [psa10Prob, setPsa10Prob] = useState("35");
  const [psa9Prob, setPsa9Prob] = useState("50");
  const [analysis, setAnalysis] = useState<GradingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const p10 = Math.max(0, Math.min(100, Number(psa10Prob) || 0)) / 100;
      const p9 = Math.max(0, Math.min(100, Number(psa9Prob) || 0)) / 100;
      const p8 = Math.max(0, 1 - p10 - p9);
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          rawCost: Number(rawCost || 0),
          service,
          probabilities: { psa10: p10, psa9: p9, psa8: p8 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">⭐ Grade ROI</h1>
        <p className="text-white/50 text-sm mt-1">
          Should you send this card to PSA? Pulls comps for raw + PSA 8/9/10, factors in fees, returns the math.
        </p>
      </div>

      <form onSubmit={analyze} className="card space-y-4">
        <div>
          <div className="label mb-1">Card title (RAW — no grade)</div>
          <input
            className="input"
            placeholder='e.g. "2020 Prizm Justin Herbert Silver Rookie"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1">What you paid (raw)</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
              <input
                className="input pl-7"
                inputMode="decimal"
                placeholder="0.00"
                value={rawCost}
                onChange={(e) => setRawCost(e.target.value)}
              />
            </div>
          </div>
          <div>
            <div className="label mb-1">Grading service</div>
            <select
              className="input"
              value={service}
              onChange={(e) => setService(e.target.value as GradingService)}
            >
              <option value="psa">PSA Value ($25)</option>
              <option value="sgc">SGC Bulk ($25)</option>
              <option value="bgs">BGS Value ($20)</option>
            </select>
          </div>
        </div>

        <div>
          <div className="label mb-2">Your odds (eyeball the card)</div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <ProbField label="PSA 10" value={psa10Prob} onChange={setPsa10Prob} />
            <ProbField label="PSA 9" value={psa9Prob} onChange={setPsa9Prob} />
            <ProbField label="PSA 8 or lower" value={String(Math.max(0, 100 - Number(psa10Prob) - Number(psa9Prob)))} onChange={() => {}} readOnly />
          </div>
          <p className="text-xs text-white/40 mt-2">
            Pristine corners + centering = ~50% PSA 10. Visible flaws = ~10% PSA 10. Be honest.
          </p>
        </div>

        <button className="btn w-full" disabled={loading || !query.trim()}>
          {loading ? "Pulling comps for all grades…" : "Analyze"}
        </button>
      </form>

      {error && <div className="card bg-red-500/10 border-red-500/30 text-red-400 text-sm">{error}</div>}

      {analysis && (
        <div className="space-y-4">
          {/* Recommendation banner */}
          <div className="card text-base font-medium">{analysis.recommendation}</div>

          {/* Value by grade */}
          <div className="card">
            <h2 className="font-semibold mb-3">Value by grade outcome</h2>
            <div className="space-y-2">
              {analysis.rawComps && (
                <ValueRow
                  label="Sell raw (no grading)"
                  value={analysis.rawComps.median}
                  netProfit={analysis.rawComps.median - Number(rawCost || 0)}
                  highlight={false}
                />
              )}
              {analysis.outcomes.map((o, i) => {
                const e = analysis.expectedValueByGrade[i];
                return (
                  <ValueRow
                    key={o.grade}
                    label={o.grade}
                    value={o.comps.median}
                    netProfit={e.netProfit}
                    netPct={e.pct}
                    highlight={o.grade === "PSA 10"}
                  />
                );
              })}
            </div>
            <div className="text-xs text-white/40 mt-3 pt-3 border-t border-white/5">
              Profit math = comp median − (your cost $${rawCost || 0} + ${analysis.serviceFee} grading + ${analysis.shippingBothWays} shipping)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProbField({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <div>
      <div className="text-xs text-white/50 mb-1">{label}</div>
      <div className="relative">
        <input
          type="number"
          min="0"
          max="100"
          readOnly={readOnly}
          className={`input pr-7 text-center ${readOnly ? "opacity-60" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">%</span>
      </div>
    </div>
  );
}

function ValueRow({
  label,
  value,
  netProfit,
  netPct,
  highlight,
}: {
  label: string;
  value: number;
  netProfit: number;
  netPct?: number;
  highlight: boolean;
}) {
  const tone = netProfit > 0 ? "text-good" : "text-bad";
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${highlight ? "bg-accent/10 border border-accent/30" : "bg-white/[0.02]"}`}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-white/40">Sells for ${value.toFixed(2)}</div>
      </div>
      <div className="text-right">
        <div className={`font-mono font-bold ${tone}`}>{netProfit >= 0 ? "+" : ""}${netProfit.toFixed(2)}</div>
        {netPct !== undefined && <div className={`text-xs ${tone}`}>{netPct >= 0 ? "+" : ""}{netPct.toFixed(0)}% ROI</div>}
      </div>
    </div>
  );
}
