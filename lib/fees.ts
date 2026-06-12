export type DealInputs = {
  askingPrice: number;
  estimatedSalePrice: number;
  shippingCost?: number;
  shippingChargedToBuyer?: number;
  feeRate?: number;
  fixedFee?: number;
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

const DEFAULT_FEE = 0.1325;
const DEFAULT_FIXED = 0.3;

export function scoreDeal(inputs: DealInputs): DealResult {
  const shippingCost = inputs.shippingCost ?? 1.5;
  const shippingChargedToBuyer = inputs.shippingChargedToBuyer ?? 0;
  const feeRate = inputs.feeRate ?? DEFAULT_FEE;
  const fixedFee = inputs.fixedFee ?? DEFAULT_FIXED;

  const grossRevenue = inputs.estimatedSalePrice + shippingChargedToBuyer;
  const totalFees = +(grossRevenue * feeRate + fixedFee).toFixed(2);
  const netProceeds = +(grossRevenue - totalFees - shippingCost).toFixed(2);
  const costBasis = inputs.askingPrice;
  const profit = +(netProceeds - costBasis).toFixed(2);
  const marginPct = netProceeds > 0 ? +((profit / netProceeds) * 100).toFixed(1) : 0;
  const roiPct = costBasis > 0 ? +((profit / costBasis) * 100).toFixed(1) : 0;

  let verdict: DealResult["verdict"] = "PASS";
  let reasoning = "";
  if (roiPct >= 40 && profit >= 5) {
    verdict = "BUY";
    reasoning = `${roiPct}% ROI and $${profit.toFixed(2)} profit — strong buy.`;
  } else if (roiPct >= 20 && profit >= 3) {
    verdict = "MAYBE";
    reasoning = `${roiPct}% ROI — thin but workable if you can move it fast.`;
  } else if (profit <= 0) {
    verdict = "PASS";
    reasoning = `Loss of $${Math.abs(profit).toFixed(2)} after fees. Walk.`;
  } else {
    verdict = "PASS";
    reasoning = `Only ${roiPct}% ROI / $${profit.toFixed(2)} profit — not worth the capital lockup.`;
  }

  return { grossRevenue, totalFees, netProceeds, costBasis, profit, marginPct, roiPct, verdict, reasoning };
}
