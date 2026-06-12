import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "cards.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    player TEXT,
    year INTEGER,
    setName TEXT,
    grade TEXT,
    cost REAL NOT NULL DEFAULT 0,
    purchasedAt TEXT,
    status TEXT NOT NULL DEFAULT 'raw',
    listedAt REAL,
    soldFor REAL,
    soldAt TEXT,
    feeRate REAL,
    shippingCost REAL,
    notes TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );
`);

export type CardRow = {
  id: number;
  title: string;
  player: string | null;
  year: number | null;
  setName: string | null;
  grade: string | null;
  cost: number;
  purchasedAt: string | null;
  status: "raw" | "graded" | "listed" | "sold";
  listedAt: number | null;
  soldFor: number | null;
  soldAt: string | null;
  feeRate: number | null;
  shippingCost: number | null;
  notes: string | null;
  createdAt: string;
};

export type CardInput = Omit<Partial<CardRow>, "id" | "createdAt"> & { title: string };

export function listCards(): CardRow[] {
  return db.prepare("SELECT * FROM cards ORDER BY id DESC").all() as CardRow[];
}

export function addCard(c: CardInput): CardRow {
  const stmt = db.prepare(`
    INSERT INTO cards (title, player, year, setName, grade, cost, purchasedAt, status, listedAt, soldFor, soldAt, feeRate, shippingCost, notes)
    VALUES (@title, @player, @year, @setName, @grade, @cost, @purchasedAt, @status, @listedAt, @soldFor, @soldAt, @feeRate, @shippingCost, @notes)
  `);
  const result = stmt.run({
    title: c.title,
    player: c.player ?? null,
    year: c.year ?? null,
    setName: c.setName ?? null,
    grade: c.grade ?? null,
    cost: c.cost ?? 0,
    purchasedAt: c.purchasedAt ?? new Date().toISOString().slice(0, 10),
    status: c.status ?? "raw",
    listedAt: c.listedAt ?? null,
    soldFor: c.soldFor ?? null,
    soldAt: c.soldAt ?? null,
    feeRate: c.feeRate ?? null,
    shippingCost: c.shippingCost ?? null,
    notes: c.notes ?? null,
  });
  return db.prepare("SELECT * FROM cards WHERE id = ?").get(result.lastInsertRowid) as CardRow;
}

export function updateCard(id: number, patch: Partial<CardRow>): CardRow | null {
  const existing = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as CardRow | undefined;
  if (!existing) return null;
  const merged = { ...existing, ...patch, id };
  db.prepare(`
    UPDATE cards SET title=@title, player=@player, year=@year, setName=@setName, grade=@grade,
      cost=@cost, purchasedAt=@purchasedAt, status=@status, listedAt=@listedAt, soldFor=@soldFor,
      soldAt=@soldAt, feeRate=@feeRate, shippingCost=@shippingCost, notes=@notes
    WHERE id=@id
  `).run(merged);
  return db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as CardRow;
}

export function deleteCard(id: number): boolean {
  const r = db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  return r.changes > 0;
}

export function pnlSummary() {
  const rows = listCards();
  const sold = rows.filter((r) => r.status === "sold" && r.soldFor);
  const totalCost = rows.reduce((a, r) => a + (r.cost || 0), 0);
  const realized = sold.reduce((acc, r) => {
    const feeRate = r.feeRate ?? 0.1325;
    const shippingCost = r.shippingCost ?? 1.5;
    const net = (r.soldFor || 0) * (1 - feeRate) - 0.3 - shippingCost;
    return acc + (net - r.cost);
  }, 0);
  return {
    totalCards: rows.length,
    inHand: rows.filter((r) => r.status === "raw" || r.status === "graded").length,
    listed: rows.filter((r) => r.status === "listed").length,
    sold: sold.length,
    totalCostBasis: +totalCost.toFixed(2),
    realizedProfit: +realized.toFixed(2),
  };
}

export default db;
