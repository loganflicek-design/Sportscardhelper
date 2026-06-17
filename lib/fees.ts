import type { Thresholds } from "./settings";
import { resolveThresholds } from "./settings";

export type DealInputs = {
  askingPrice: number;
  estimatedSalePrice: number;
  shippingChargedToBuyer?: number;
  thresholds?: Partial<Thresholds>;
};

export type DealResult = {
  grossRevenue: number;
  totalFees: number;
  netProceeds: number;
  costBasis: number;
  profit: number;
  marginPct: number;
  roiPct: number;
  verdict: "BUY" | "PASS" | "MAYBE";
  reasoning: string;
};

export function scoreDeal(inputs: DealInputs): DealResult {
  const t = resolveThresholds(inputs.thresholds);
  const shippingChargedToBuyer = inputs.shippingChargedToBuyer ?? 0;

  const grossRevenue = inputs.estimatedSalePrice + shippingChargedToBuyer;
  const totalFees = +(grossRevenue * t.feeRate + t.fixedFee).toFixed(2);
  const netProceeds = +(grossRevenue - totalFees - t.shippingCost).toFixed(2);
  const costBasis = inputs.askingPrice;
  const profit = +(netProceeds - costBasis).toFixed(2);
  const marginPct = netProceeds > 0 ? +((profit / netProceeds) * 100).toFixed(1) : 0;
  const roiPct = costBasis > 0 ? +((profit / costBasis) * 100).toFixed(1) : 0;

  let verdict: DealResult["verdict"];
  let reasoning: string;
  if (roiPct >= t.buyMinRoiPct && profit >= t.buyMinProfitDollars) {
    verdict = "BUY";
    reasoning = `${roiPct}% ROI and $${profit.toFixed(2)} profit — strong buy by your rules.`;
  } else if (roiPct >= t.maybeMinRoiPct && profit >= t.maybeMinProfitDollars) {
    verdict = "MAYBE";
    reasoning = `${roiPct}% ROI / $${profit.toFixed(2)} profit — under your BUY threshold (${t.buyMinRoiPct}% / $${t.buyMinProfitDollars}). Workable if it'll move fast.`;
  } else if (profit <= 0) {
    verdict = "PASS";
    reasoning = `Loss of $${Math.abs(profit).toFixed(2)} after fees. Walk.`;
  } else {
    verdict = "PASS";
    reasoning = `Only ${roiPct}% ROI / $${profit.toFixed(2)} profit — below your MAYBE threshold (${t.maybeMinRoiPct}% / $${t.maybeMinProfitDollars}).`;
  }

  return { grossRevenue, totalFees, netProceeds, costBasis, profit, marginPct, roiPct, verdict, reasoning };
}

