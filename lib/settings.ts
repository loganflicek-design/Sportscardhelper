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
  buyMinRoiPct: 45,
  buyMinProfitDollars: 7,
  maybeMinRoiPct: 25,
  maybeMinProfitDollars: 4,
  sellMarkupPct: 8,
  feeRate: 0,
  fixedFee: 0,
  shippingCost: 5,
};

export const PLATFORM_PRESETS = {
  tiktok_ig_cash: {
    label: "TikTok / Instagram (Venmo/Zelle/cash)",
    feeRate: 0,
    fixedFee: 0,
    shippingCost: 5,
  },
  tiktok_shop: {
    label: "TikTok Shop",
    feeRate: 0.08,
    fixedFee: 0.3,
    shippingCost: 5,
  },
  instagram_paypal: {
    label: "Instagram (PayPal G&S)",
    feeRate: 0.0349,
    fixedFee: 0.49,
    shippingCost: 5,
  },
  ebay: {
    label: "eBay",
    feeRate: 0.1325,
    fixedFee: 0.3,
    shippingCost: 1.5,
  },
} as const;

export type PlatformKey = keyof typeof PLATFORM_PRESETS;

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
