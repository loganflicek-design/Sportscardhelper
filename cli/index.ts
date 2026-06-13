#!/usr/bin/env node
/**
 * Sports Card Helper CLI.
 *
 * Usage:
 *   npm run ch -- <command> [args]
 *
 * Commands:
 *   add "<title>" --cost 12 [--player Luka --year 2018 --grade "PSA 10" ...]
 *   list                          Show inventory
 *   delete <cardId>
 *   set <cardId> --status sold --soldFor 250
 *   comp "<query>"                Sold-listing stats
 *   score --asking 30 --sale 80   Buy/pass verdict
 *   appraise <cardId>             Comp current value of a card you own + suggested sell price
 *   watch "<query>" [--max 50 --minDealPct 25]
 *   watchlist                     Show watchlist
 *   unwatch <id>
 *   find-deals [--query "..."]    Scan watchlist or one-off query for deals
 *   research "<player>" [--year 2018]
 *   list-on-ebay <cardId>         Publish to eBay
 *   update-prices                 Refresh marketValue + suggestedSellPrice on inventory
 *   pnl                           Profit/loss summary
 *
 * All output is human-readable. Add --json for machine-readable.
 */
import fs from "fs";
import path from "path";
import { addCard, addWatch, deleteCard, listInventory, listWatchlist, removeWatch, updateCard, isUsingSheets } from "../lib/storage";
import { getComps } from "../lib/comps";
import { scoreDeal } from "../lib/fees";
import { findDealsForWatchlist } from "../lib/deals";
import { researchPlayer } from "../lib/research";
import { createEbayListing, generateDescription, generateTitle, suggestSellPrice } from "../lib/listing";

// ---- Minimal .env loader (so we don't need dotenv as a dep) ----
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    const val = raw.replace(/^["'](.*)["']$/, "$1");
    process.env[key] = val;
  }
}
loadEnv();

// ---- Arg parsing ----
type Args = { _: string[]; flags: Record<string, string | boolean> };
function parse(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.flags[key] = true;
      else { out.flags[key] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = parse(argv.slice(1));
const json = !!args.flags.json;

function out(obj: unknown, pretty?: () => string) {
  if (json) console.log(JSON.stringify(obj, null, 2));
  else if (pretty) console.log(pretty());
  else console.log(obj);
}

function money(n: number): string { return `$${n.toFixed(2)}`; }

function strFlag(name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}
function numFlag(name: string): number | undefined {
  const v = strFlag(name);
  return v === undefined ? undefined : Number(v);
}
function boolFlag(name: string): boolean | undefined {
  const v = args.flags[name];
  return v === undefined ? undefined : v === true || v === "true";
}

// ---- Commands ----

async function cmdAdd() {
  const title = args._[0];
  if (!title) throw new Error('Usage: add "<title>" --cost <n> [--player X --year Y ...]');
  const cost = numFlag("cost") ?? 0;
  const card = await addCard({
    title,
    cost,
    player: strFlag("player"),
    year: numFlag("year"),
    setName: strFlag("set"),
    parallel: strFlag("parallel"),
    cardNumber: strFlag("number"),
    serial: strFlag("serial"),
    grade: strFlag("grade"),
    team: strFlag("team"),
    sport: strFlag("sport"),
    rookie: boolFlag("rookie"),
    notes: strFlag("notes"),
  });
  out(card, () => `Added ${card.id}: ${card.title} @ ${money(card.cost)}`);
}

async function cmdList() {
  const cards = await listInventory();
  out(cards, () => {
    if (!cards.length) return "(empty) — try `npm run ch -- add \"…\" --cost 10`";
    const lines = cards.map(
      (c) => `${c.id}  ${c.status.padEnd(7)}  ${money(c.cost).padStart(7)}  ${c.title}${c.marketValue ? ` [mv ${money(c.marketValue)}]` : ""}`
    );
    return lines.join("\n");
  });
}

async function cmdDelete() {
  const id = args._[0];
  if (!id) throw new Error("Usage: delete <cardId>");
  const ok = await deleteCard(id);
  out({ ok }, () => (ok ? `Deleted ${id}` : `Not found: ${id}`));
}

async function cmdSet() {
  const id = args._[0];
  if (!id) throw new Error("Usage: set <cardId> --status sold --soldFor 250 …");
  const patch: Record<string, unknown> = {};
  for (const k of ["status", "notes", "listingUrl", "ebayItemId"]) {
    const v = strFlag(k);
    if (v !== undefined) patch[k] = v;
  }
  for (const k of ["cost", "soldFor", "marketValue", "suggestedSellPrice"]) {
    const v = numFlag(k);
    if (v !== undefined) patch[k] = v;
  }
  if (patch.status === "sold" && !patch.soldAt) patch.soldAt = new Date().toISOString().slice(0, 10);
  const updated = await updateCard(id, patch);
  out(updated, () => (updated ? `Updated ${id}` : `Not found: ${id}`));
}

async function cmdComp() {
  const q = args._[0] ?? strFlag("q");
  if (!q) throw new Error('Usage: comp "<query>"');
  const c = await getComps(q);
  out(c, () => {
    if (!c.count) return `No sold listings found for "${q}".`;
    const head = `${c.query}  [${c.source}, ${c.count} sales]`;
    const stats = `  median ${money(c.median)}  mean ${money(c.mean)}  range ${money(c.low)}-${money(c.high)}  σ ${money(c.stdev)}`;
    const recent = c.items.slice(0, 5).map((it) => `  · ${money(it.totalPrice)}  ${it.title.slice(0, 70)}`).join("\n");
    return [head, stats, "", "Recent sales:", recent].join("\n");
  });
}

async function cmdScore() {
  const asking = numFlag("asking");
  const sale = numFlag("sale");
  if (asking == null || sale == null) throw new Error("Usage: score --asking <n> --sale <n>");
  const s = scoreDeal({ askingPrice: asking, estimatedSalePrice: sale });
  out(s, () => `${s.verdict}  profit ${money(s.profit)}  ROI ${s.roiPct}%  — ${s.reasoning}`);
}

async function cmdAppraise() {
  const id = args._[0];
  if (!id) throw new Error("Usage: appraise <cardId>");
  const cards = await listInventory();
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error(`Card not found: ${id}`);
  const c = await getComps(card.title);
  if (!c.count) { out({ card, comps: c }); return; }
  const sell = suggestSellPrice({ compMedian: c.median, compHigh: c.high, cost: card.cost });
  const score = scoreDeal({ askingPrice: card.cost, estimatedSalePrice: c.median });
  await updateCard(id, {
    marketValue: c.median,
    marketValueAt: new Date().toISOString(),
    suggestedSellPrice: sell.price,
  });
  out({ card, comps: c, suggestSellPrice: sell, deal: score }, () =>
    [
      `${card.title}`,
      `  bought: ${money(card.cost)} · market median: ${money(c.median)} (${c.count} sales)`,
      `  suggested sell: ${money(sell.price)}  — ${sell.reasoning}`,
      `  at suggested sell: profit ${money(score.profit)}  ROI ${score.roiPct}%  (${score.verdict})`,
    ].join("\n")
  );
}

async function cmdWatch() {
  const q = args._[0];
  if (!q) throw new Error('Usage: watch "<query>" [--max 50 --minDealPct 25]');
  const w = await addWatch({
    query: q,
    maxPrice: numFlag("max"),
    minDealPct: numFlag("minDealPct") ?? 25,
    notes: strFlag("notes"),
  });
  out(w, () => `Watching "${w.query}" (max ${w.maxPrice ?? "∞"}, deal ≥ ${w.minDealPct}%)`);
}

async function cmdWatchlist() {
  const list = await listWatchlist();
  out(list, () => list.map((w) => `${w.id}  "${w.query}"  max ${w.maxPrice ?? "∞"}  ≥${w.minDealPct ?? 25}%`).join("\n") || "(empty)");
}

async function cmdUnwatch() {
  const id = args._[0];
  if (!id) throw new Error("Usage: unwatch <id>");
  const ok = await removeWatch(id);
  out({ ok });
}

async function cmdFindDeals() {
  const oneOff = strFlag("query");
  const list = oneOff
    ? [{ id: "adhoc", query: oneOff, maxPrice: numFlag("max"), minDealPct: numFlag("minDealPct") ?? 25, createdAt: "" }]
    : await listWatchlist();
  if (!list.length) {
    out([], () => "Watchlist is empty. Add one with: npm run ch -- watch \"…\"");
    return;
  }
  const deals = await findDealsForWatchlist(list);
  out(deals, () => {
    if (!deals.length) return "No deals beating threshold right now.";
    return deals.slice(0, 25).map((d) =>
      [
        `${d.score.verdict}  ${d.dealPct}% under median (mkt ${money(d.comps.median)})`,
        `  asking ${money(d.listing.totalPrice)}  → est. profit ${money(d.score.profit)}  ROI ${d.score.roiPct}%`,
        `  ${d.listing.title.slice(0, 90)}`,
        `  ${d.listing.url}`,
      ].join("\n")
    ).join("\n\n");
  });
}

async function cmdResearch() {
  const player = args._[0];
  if (!player) throw new Error('Usage: research "<player>" [--year 2018]');
  const r = await researchPlayer(player, { year: strFlag("year") });
  out(r, () => {
    const head = `Research: ${r.player}  (${r.summary.totalSamples} samples across ${r.rcVariants.length} products)`;
    const lines = r.rcVariants.map(
      (v) => `  ${money(v.median).padStart(8)}  median  · ${v.count.toString().padStart(3)} sales  · ${v.query}`
    );
    return [head, ...lines, "", `Median of medians: ${money(r.summary.medianOfMedians)}  · spread ${money(r.summary.spread)}`].join("\n");
  });
}

async function cmdListOnEbay() {
  const id = args._[0];
  if (!id) throw new Error("Usage: list-on-ebay <cardId>");
  const cards = await listInventory();
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error(`Card not found: ${id}`);

  const title = generateTitle(card);
  const description = generateDescription(card);
  const c = await getComps(card.title);
  if (!c.count) throw new Error("Can't list — no comp data found. Set price manually with --price.");
  const overridePrice = numFlag("price");
  const price = overridePrice ?? suggestSellPrice({ compMedian: c.median, compHigh: c.high, cost: card.cost }).price;
  const images = card.imageUrl ? [card.imageUrl] : (strFlag("image") ? [strFlag("image")!] : []);
  if (!images.length) throw new Error("Need at least one image. Pass --image <url> or set card.imageUrl.");

  const result = await createEbayListing({
    sku: card.id,
    title,
    description,
    imageUrls: images,
    priceUsd: price,
  });
  await updateCard(card.id, {
    status: "listed",
    listedAt: new Date().toISOString().slice(0, 10),
    listingUrl: result.url,
    ebayItemId: result.listingId,
    suggestedSellPrice: price,
  });
  out(result, () => `Listed: ${result.url}  @ ${money(price)}`);
}

async function cmdUpdatePrices() {
  const cards = await listInventory();
  const eligible = cards.filter((c) => c.status === "raw" || c.status === "graded" || c.status === "listed");
  const updates: Array<{ id: string; title: string; prevMv?: number; newMv: number; suggestSell: number }> = [];
  for (const card of eligible) {
    try {
      const c = await getComps(card.title);
      if (!c.count) continue;
      const sell = suggestSellPrice({ compMedian: c.median, compHigh: c.high, cost: card.cost });
      await updateCard(card.id, {
        marketValue: c.median,
        marketValueAt: new Date().toISOString(),
        suggestedSellPrice: sell.price,
      });
      updates.push({ id: card.id, title: card.title, prevMv: card.marketValue, newMv: c.median, suggestSell: sell.price });
    } catch (err) {
      console.error(`  skip ${card.title}: ${err instanceof Error ? err.message : err}`);
    }
  }
  out(updates, () => {
    if (!updates.length) return "No prices updated (empty inventory or comp lookups failed).";
    return updates.map((u) => {
      const delta = u.prevMv != null ? ` (was ${money(u.prevMv)}, Δ ${money(u.newMv - u.prevMv)})` : "";
      return `  ${u.title.slice(0, 60)}  →  ${money(u.newMv)}${delta}  · sell @ ${money(u.suggestSell)}`;
    }).join("\n");
  });
}

async function cmdPnl() {
  const cards = await listInventory();
  const sold = cards.filter((c) => c.status === "sold" && c.soldFor);
  const feeRate = Number(process.env.EBAY_FEE_RATE || 0.1325);
  const fixedFee = Number(process.env.EBAY_FIXED_FEE || 0.3);
  const shipping = Number(process.env.DEFAULT_SHIPPING_COST || 1.5);
  const realized = sold.reduce((acc, r) => {
    const net = (r.soldFor || 0) * (1 - feeRate) - fixedFee - shipping;
    return acc + (net - r.cost);
  }, 0);
  const unrealized = cards.filter((c) => c.status !== "sold" && c.marketValue)
    .reduce((acc, c) => acc + ((c.marketValue! * (1 - feeRate) - fixedFee - shipping) - c.cost), 0);
  const summary = {
    storage: isUsingSheets() ? "Google Sheets" : "local JSON",
    total: cards.length,
    inHand: cards.filter((c) => c.status === "raw" || c.status === "graded").length,
    listed: cards.filter((c) => c.status === "listed").length,
    sold: sold.length,
    realizedProfit: +realized.toFixed(2),
    unrealizedProfit: +unrealized.toFixed(2),
    costBasis: +cards.reduce((a, c) => a + c.cost, 0).toFixed(2),
  };
  out(summary, () =>
    [
      `Storage: ${summary.storage}`,
      `Cards: ${summary.total}  ·  in-hand ${summary.inHand}  ·  listed ${summary.listed}  ·  sold ${summary.sold}`,
      `Cost basis: ${money(summary.costBasis)}`,
      `Realized P&L: ${money(summary.realizedProfit)}`,
      `Unrealized P&L (at market): ${money(summary.unrealizedProfit)}`,
    ].join("\n")
  );
}

// ---- Dispatch ----

const commands: Record<string, () => Promise<void>> = {
  add: cmdAdd,
  list: cmdList,
  delete: cmdDelete,
  set: cmdSet,
  comp: cmdComp,
  score: cmdScore,
  appraise: cmdAppraise,
  watch: cmdWatch,
  watchlist: cmdWatchlist,
  unwatch: cmdUnwatch,
  "find-deals": cmdFindDeals,
  research: cmdResearch,
  "list-on-ebay": cmdListOnEbay,
  "update-prices": cmdUpdatePrices,
  pnl: cmdPnl,
};

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Sports Card Helper CLI
Commands: ${Object.keys(commands).join(", ")}
Run a command with no args to see its usage.`);
    return;
  }
  const fn = commands[cmd];
  if (!fn) { console.error(`Unknown command: ${cmd}`); process.exit(1); }
  try { await fn(); }
  catch (err) {
    if (json) console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    else console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
