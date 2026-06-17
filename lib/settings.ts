/**
 * User-configurable scoring thresholds. Sent from the client (stored in
 * localStorage) on each API call. Falls back to env defaults, then hard
 * defaults if nothing is set.
 */

export type Thresholds = {
  buyMinRoiPct: number;
  buyMinProfitDollars: number;
  maybeMinRoiPct: number;
  maybeMinProfitDollars: number;
  sellMarkupPct: number;
  feeRate: number;
  fixedFee: number;
  shippingCost: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  buyMinRoiPct: 40,
  buyMinProfitDollars: 5,
  maybeMinRoiPct: 20,
  maybeMinProfitDollars: 3,
  sellMarkupPct: 5,
  feeRate: 0.1325,
  fixedFee: 0.3,
  shippingCost: 1.5,
};

export function resolveThresholds(input?: Partial<Thresholds>): Thresholds {
  const fromEnv: Partial<Thresholds> = {
    feeRate: numEnv("EBAY_FEE_RATE"),
    fixedFee: numEnv("EBAY_FIXED_FEE"),
    shippingCost: numEnv("DEFAULT_SHIPPING_COST"),
  };
  return {
    ...DEFAULT_THRESHOLDS,
    ...Object.fromEntries(Object.entries(fromEnv).filter(([, v]) => v !== undefined)),
    ...Object.fromEntries(Object.entries(input ?? {}).filter(([, v]) => typeof v === "number" && !isNaN(v))),
  } as Thresholds;
}

function numEnv(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}
