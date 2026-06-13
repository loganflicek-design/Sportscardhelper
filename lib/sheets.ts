/**
 * Google Sheets binding. Two sheets, both keyed by `id` in column A.
 * Wire up by creating a service account, sharing each sheet with its
 * email, and putting the spreadsheet IDs in .env. See SETUP.md.
 */
import { google, sheets_v4 } from "googleapis";
import type { Card, WatchlistEntry } from "./storage";

const INVENTORY_TAB = "inventory";
const WATCHLIST_TAB = "watchlist";

const INVENTORY_HEADERS = [
  "id", "title", "player", "year", "setName", "parallel", "cardNumber", "serial",
  "grade", "team", "sport", "rookie", "cost", "purchasedAt", "status",
  "marketValue", "marketValueAt", "suggestedSellPrice",
  "listedAt", "listingUrl", "ebayItemId", "soldFor", "soldAt", "notes", "imageUrl",
];

const WATCHLIST_HEADERS = ["id", "query", "maxPrice", "minDealPct", "notes", "createdAt"];

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function client(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: auth() });
}

async function ensureHeaders(spreadsheetId: string, tab: string, headers: string[]) {
  const s = client();
  try {
    const got = await s.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
    if (!got.data.values?.[0]?.length) {
      await s.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }
  } catch {
    await s.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
    await s.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }
}

function rowToObject<T>(headers: string[], row: unknown[]): T {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    const v = row[i];
    if (v === undefined || v === "") return;
    if (["year", "cost", "marketValue", "suggestedSellPrice", "soldFor", "maxPrice", "minDealPct"].includes(h)) {
      obj[h] = Number(v);
    } else if (h === "rookie") {
      obj[h] = v === true || v === "TRUE" || v === "true" || v === 1;
    } else {
      obj[h] = v;
    }
  });
  return obj as T;
}

function objectToRow(headers: string[], obj: Record<string, unknown>): unknown[] {
  return headers.map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return v;
  });
}

// ---------- Inventory ----------

export async function readInventoryFromSheet(): Promise<Card[]> {
  const id = process.env.GSHEET_INVENTORY_ID!;
  await ensureHeaders(id, INVENTORY_TAB, INVENTORY_HEADERS);
  const s = client();
  const res = await s.spreadsheets.values.get({ spreadsheetId: id, range: `${INVENTORY_TAB}!A2:Z` });
  const rows = res.data.values ?? [];
  return rows.filter((r) => r[0]).map((r) => rowToObject<Card>(INVENTORY_HEADERS, r));
}

export async function appendCardToSheet(card: Card): Promise<void> {
  const id = process.env.GSHEET_INVENTORY_ID!;
  await ensureHeaders(id, INVENTORY_TAB, INVENTORY_HEADERS);
  const s = client();
  await s.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${INVENTORY_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: [objectToRow(INVENTORY_HEADERS, card as Record<string, unknown>)] },
  });
}

export async function updateCardInSheet(cardId: string, patch: Partial<Card>): Promise<Card | null> {
  const id = process.env.GSHEET_INVENTORY_ID!;
  const s = client();
  const res = await s.spreadsheets.values.get({ spreadsheetId: id, range: `${INVENTORY_TAB}!A2:Z` });
  const rows = res.data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === cardId);
  if (rowIdx < 0) return null;
  const existing = rowToObject<Card>(INVENTORY_HEADERS, rows[rowIdx]);
  const merged = { ...existing, ...patch };
  await s.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${INVENTORY_TAB}!A${rowIdx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [objectToRow(INVENTORY_HEADERS, merged as Record<string, unknown>)] },
  });
  return merged;
}

export async function deleteCardFromSheet(cardId: string): Promise<boolean> {
  const id = process.env.GSHEET_INVENTORY_ID!;
  const s = client();
  const res = await s.spreadsheets.values.get({ spreadsheetId: id, range: `${INVENTORY_TAB}!A2:Z` });
  const rows = res.data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === cardId);
  if (rowIdx < 0) return false;
  const meta = await s.spreadsheets.get({ spreadsheetId: id });
  const sheet = meta.data.sheets?.find((sh) => sh.properties?.title === INVENTORY_TAB);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return false;
  await s.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIdx + 1,
              endIndex: rowIdx + 2,
            },
          },
        },
      ],
    },
  });
  return true;
}

// ---------- Watchlist ----------

export async function readWatchlistFromSheet(): Promise<WatchlistEntry[]> {
  const id = process.env.GSHEET_WATCHLIST_ID!;
  await ensureHeaders(id, WATCHLIST_TAB, WATCHLIST_HEADERS);
  const s = client();
  const res = await s.spreadsheets.values.get({ spreadsheetId: id, range: `${WATCHLIST_TAB}!A2:Z` });
  const rows = res.data.values ?? [];
  return rows.filter((r) => r[0]).map((r) => rowToObject<WatchlistEntry>(WATCHLIST_HEADERS, r));
}

export async function appendWatchToSheet(entry: WatchlistEntry): Promise<void> {
  const id = process.env.GSHEET_WATCHLIST_ID!;
  await ensureHeaders(id, WATCHLIST_TAB, WATCHLIST_HEADERS);
  const s = client();
  await s.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${WATCHLIST_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: [objectToRow(WATCHLIST_HEADERS, entry as Record<string, unknown>)] },
  });
}
