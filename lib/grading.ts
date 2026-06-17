import { getComps, type UnifiedComps } from "./comps";

export type GradingService = "psa" | "sgc" | "bgs";

export const GRADING_COSTS: Record<GradingService, { fee: number; turnaroundDays: number; label: string }> = {
  psa: { fee: 25, turnaroundDays: 45, label: "PSA Value (regular)" },
  sgc: { fee: 25, turnaroundDays: 14, label: "SGC Bulk" },
  bgs: { fee: 20, turnaroundDays: 30, label: "BGS Value" },
};

export type GradeOutcome = {
  grade: string;
  comps: UnifiedComps;
};

export type GradingAnalysis = {
  baseQuery: string;
  rawValue: number | null;
  rawComps: UnifiedComps | null;
  outcomes: GradeOutcome[];
  service: GradingService;
  serviceFee: number;
  shippingBothWays: number;
  expectedValueByGrade: Array<{ grade: string; netProfit: number; pct: number }>;
  recommendation: string;
};

/**
 * For a card title (assumed RAW), pull comps for raw + each grade tier
 * (PSA 8/9/10), then estimate the EV of grading after fees + shipping.
 */
export async function analyzeGrading(input: {
  baseQuery: string;
  rawCost: number;
  service?: GradingService;
  shippingBothWays?: number;
  probabilities?: { psa10: number; psa9: number; psa8: number };
}): Promise<GradingAnalysis> {
  const service = input.service ?? "psa";
  const serviceFee = GRADING_COSTS[service].fee;
  const shippingBothWays = input.shippingBothWays ?? 15;
  // Default probabilities for a "good looking" card. User can override.
  const p = input.probabilities ?? { psa10: 0.35, psa9: 0.5, psa8: 0.15 };

  const baseQuery = input.baseQuery.replace(/\s+(PSA|SGC|BGS)\s*\d+/gi, "").trim();

  const [rawComps, psa10Comps, psa9Comps, psa8Comps] = await Promise.all([
    getComps(baseQuery, 20).catch(() => null),
    getComps(`${baseQuery} PSA 10`, 20).catch(() => null),
    getComps(`${baseQuery} PSA 9`, 20).catch(() => null),
    getComps(`${baseQuery} PSA 8`, 20).catch(() => null),
  ]);

  const outcomes: GradeOutcome[] = [];
  if (psa10Comps && psa10Comps.median > 0) outcomes.push({ grade: "PSA 10", comps: psa10Comps });
  if (psa9Comps && psa9Comps.median > 0) outcomes.push({ grade: "PSA 9", comps: psa9Comps });
  if (psa8Comps && psa8Comps.median > 0) outcomes.push({ grade: "PSA 8", comps: psa8Comps });

  const rawValue = rawComps?.median ?? null;
  const totalCost = input.rawCost + serviceFee + shippingBothWays;

  const expectedValueByGrade: GradingAnalysis["expectedValueByGrade"] = outcomes.map((o) => {
    const netProfit = o.comps.median - totalCost;
    const pct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    return { grade: o.grade, netProfit: +netProfit.toFixed(2), pct: +pct.toFixed(1) };
  });

  // Weighted EV using probabilities
  const psa10Val = psa10Comps?.median ?? 0;
  const psa9Val = psa9Comps?.median ?? 0;
  const psa8Val = psa8Comps?.median ?? 0;
  const expectedSellPrice = psa10Val * p.psa10 + psa9Val * p.psa9 + psa8Val * p.psa8;
  const expectedNetProfit = expectedSellPrice - totalCost;
  const rawProfit = rawValue ? rawValue - input.rawCost : null;

  let recommendation: string;
  if (!psa10Comps || !psa9Comps) {
    recommendation = "Not enough comp data to make a confident call. Verify the card title and try again.";
  } else if (rawProfit !== null && expectedNetProfit < rawProfit + 10) {
    recommendation = `❌ DON'T GRADE. Raw resell makes you $${rawProfit.toFixed(0)} now. Grading expected value is only $${expectedNetProfit.toFixed(0)} after fees + wait time. Not worth the risk or capital lockup.`;
  } else if (expectedNetProfit < 5) {
    recommendation = `❌ DON'T GRADE. Expected profit after fees is only $${expectedNetProfit.toFixed(0)}. Margins too thin.`;
  } else if (expectedNetProfit >= 30) {
    recommendation = `✅ GRADE IT. Expected profit ≈ $${expectedNetProfit.toFixed(0)} (probabilities: ${(p.psa10*100).toFixed(0)}% PSA 10 / ${(p.psa9*100).toFixed(0)}% PSA 9 / ${(p.psa8*100).toFixed(0)}% PSA 8). Strong upside.`;
  } else {
    recommendation = `🟡 BORDERLINE. Expected profit ≈ $${expectedNetProfit.toFixed(0)}. Only grade if the card looks genuinely PSA 10 (centering + corners + surface clean).`;
  }

  return {
    baseQuery,
    rawValue,
    rawComps,
    outcomes,
    service,
    serviceFee,
    shippingBothWays,
    expectedValueByGrade,
    recommendation,
  };
}
