/**
 * Storage layer. Talks to Google Sheets when GSHEET_INVENTORY_ID +
 * service account creds are set; otherwise reads/writes a local JSON
 * file so the engine still works during setup.
 */
import fs from "fs";
import path from "path";

export type Card = {
  id: string;
  title: string;
  player?: string;
  year?: number;
  setName?: string;
  parallel?: string;
  cardNumber?: string;
  serial?: string;
  grade?: string;
  team?: string;
  sport?: string;
  rookie?: boolean;
  cost: number;
  purchasedAt: string;
  status: "raw" | "graded" | "listed" | "sold";
  marketValue?: number;
  marketValueAt?: string;
  suggestedSellPrice?: number;
  listedAt?: string;
  listingUrl?: string;
  ebayItemId?: string;
  soldFor?: number;
  soldAt?: string;
  notes?: string;
  imageUrl?: string;
};

export type WatchlistEntry = {
  id: string;
  query: string;
  maxPrice?: number;
  minDealPct?: number;
  notes?: string;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const INVENTORY_PATH = path.join(DATA_DIR, "inventory.json");
const WATCHLIST_PATH = path.join(DATA_DIR, "watchlist.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GSHEET_INVENTORY_ID
  );
}

function readJson<T>(filePath: string, fallback: T): T {
  ensureDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, value: T): void {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- Inventory ----------

export async function listInventory(): Promise<Card[]> {
  if (sheetsConfigured()) {
    const { readInventoryFromSheet } = await import("./sheets");
    return readInventoryFromSheet();
  }
  return readJson<Card[]>(INVENTORY_PATH, []);
}

export async function addCard(input: Partial<Card> & { title: string; cost: number }): Promise<Card> {
  const card: Card = {
    ...input,
    id: newId("card"),
    title: input.title,
    cost: input.cost,
    status: input.status ?? "raw",
    purchasedAt: input.purchasedAt ?? new Date().toISOString().slice(0, 10),
  };
  if (sheetsConfigured()) {
    const { appendCardToSheet } = await import("./sheets");
    await appendCardToSheet(card);
  } else {
    const cards = readJson<Card[]>(INVENTORY_PATH, []);
    cards.unshift(card);
    writeJson(INVENTORY_PATH, cards);
  }
  return card;
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<Card | null> {
  if (sheetsConfigured()) {
    const { updateCardInSheet } = await import("./sheets");
    return updateCardInSheet(id, patch);
  }
  const cards = readJson<Card[]>(INVENTORY_PATH, []);
  const idx = cards.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  cards[idx] = { ...cards[idx], ...patch };
  writeJson(INVENTORY_PATH, cards);
  return cards[idx];
}

export async function deleteCard(id: string): Promise<boolean> {
  if (sheetsConfigured()) {
    const { deleteCardFromSheet } = await import("./sheets");
    return deleteCardFromSheet(id);
  }
  const cards = readJson<Card[]>(INVENTORY_PATH, []);
  const next = cards.filter((c) => c.id !== id);
  if (next.length === cards.length) return false;
  writeJson(INVENTORY_PATH, next);
  return true;
}

// ---------- Watchlist ----------

export async function listWatchlist(): Promise<WatchlistEntry[]> {
  if (sheetsConfigured() && process.env.GSHEET_WATCHLIST_ID) {
    const { readWatchlistFromSheet } = await import("./sheets");
    return readWatchlistFromSheet();
  }
  return readJson<WatchlistEntry[]>(WATCHLIST_PATH, []);
}

export async function addWatch(entry: Omit<WatchlistEntry, "id" | "createdAt">): Promise<WatchlistEntry> {
  const item: WatchlistEntry = {
    id: newId("watch"),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  if (sheetsConfigured() && process.env.GSHEET_WATCHLIST_ID) {
    const { appendWatchToSheet } = await import("./sheets");
    await appendWatchToSheet(item);
  } else {
    const list = readJson<WatchlistEntry[]>(WATCHLIST_PATH, []);
    list.unshift(item);
    writeJson(WATCHLIST_PATH, list);
  }
  return item;
}

export async function removeWatch(id: string): Promise<boolean> {
  const list = readJson<WatchlistEntry[]>(WATCHLIST_PATH, []);
  const next = list.filter((w) => w.id !== id);
  if (next.length === list.length) return false;
  writeJson(WATCHLIST_PATH, next);
  return true;
}

export function isUsingSheets(): boolean {
  return sheetsConfigured();
}
