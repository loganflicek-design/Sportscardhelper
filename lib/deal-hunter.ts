import fs from "fs";
import path from "path";

export type HuntSettings = {
  minBudget: number;
  maxBudget: number;
  minProfit: number;
  sports: string[];
  keywords: string[];
  sellPlatform: string;
  salesTaxPct: number;
  updatedAt: string;
};

export type FoundDeal = {
  id: string;
  itemId: string;
  title: string;
  buyPrice: number;
  shipping: number;
  tax: number;
  totalCost: number;
  estimatedSellPrice: number;
  profit: number;
  roiPct: number;
  verdict: "BUY" | "MAYBE";
  url: string;
  image?: string;
  condition?: string;
  endsAt?: string;
  foundAt: string;
  dismissed?: boolean;
};

export const DEFAULT_SETTINGS: HuntSettings = {
  minBudget: 10,
  maxBudget: 100,
  minProfit: 10,
  sports: ["baseball", "basketball", "football"],
  keywords: [],
  sellPlatform: "tiktok_ig_cash",
  salesTaxPct: 5,
  updatedAt: new Date().toISOString(),
};

// Use /tmp on Vercel (read-only filesystem) or local data/ dir otherwise
const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "deal-hunter-settings.json");
const DEALS_PATH = path.join(DATA_DIR, "deal-hunter-results.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadHuntSettings(): HuntSettings {
  ensureDir();
  if (!fs.existsSync(SETTINGS_PATH)) return DEFAULT_SETTINGS;
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveHuntSettings(s: HuntSettings): void {
  ensureDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
}

export function loadDeals(): FoundDeal[] {
  ensureDir();
  if (!fs.existsSync(DEALS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DEALS_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function saveDeals(deals: FoundDeal[]): void {
  ensureDir();
  // Keep max 200 most recent non-dismissed deals
  const trimmed = deals.slice(0, 200);
  fs.writeFileSync(DEALS_PATH, JSON.stringify(trimmed, null, 2));
}

export function dismissDeal(id: string): void {
  const deals = loadDeals();
  const idx = deals.findIndex((d) => d.id === id);
  if (idx >= 0) {
    deals[idx].dismissed = true;
    saveDeals(deals);
  }
}
