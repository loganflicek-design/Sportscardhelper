"use client";

import { useRef, useState } from "react";
import { resizeImage } from "@/lib/image";
import { PLATFORM_PRESETS } from "@/lib/settings";

// ─── Search Builder Data ───────────────────────────────────────────────────

const SPORTS = ["Baseball", "Basketball", "Football", "Hockey"] as const;
type Sport = typeof SPORTS[number];

const CARD_TYPES = [
  { label: "Rookie / RC", keyword: "rookie RC" },
  { label: "Prizm", keyword: "prizm" },
  { label: "Chrome", keyword: "chrome" },
  { label: "Optic", keyword: "optic" },
  { label: "Auto", keyword: "auto autograph" },
  { label: "Patch / Relic", keyword: "patch relic" },
  { label: "Any type", keyword: "" },
] as const;

const GRADES = [
  { label: "PSA 10", keyword: "PSA 10" },
  { label: "PSA 9", keyword: "PSA 9" },
  { label: "BGS 9.5", keyword: "BGS 9.5" },
  { label: "SGC 10", keyword: "SGC 10" },
  { label: "Raw (no grade)", keyword: "" },
] as const;

const ANGLES = [
  {
    id: "auction",
    label: "Auction ending soon",
    desc: "Snipe underpriced auctions before they end",
    icon: "⏱",
  },
  {
    id: "bin",
    label: "Cheap Buy It Now",
    desc: "Find BIN listings priced below market",
    icon: "🏷",
  },
  {
    id: "misspelling",
    label: "Misspelled listing",
    desc: "Sellers who can't spell = fewer bidders = lower price",
    icon: "🔤",
  },
  {
    id: "lot",
    label: "Card lot / collection",
    desc: "Buy a bulk lot where one card covers the whole cost",
    icon: "📦",
  },
] as const;
type Angle = typeof ANGLES[number]["id"];

// Misspellings per sport — real ones that appear on eBay
const MISSPELLINGS: Record<Sport, { search: string; note: string }[]> = {
  Baseball: [
    { search: "basball card rookie", note: "'baseball' misspelled" },
    { search: "Ohtani rookei card", note: "'rookie' misspelled" },
    { search: "Fernando Tatis Jr basball", note: "sport misspelled" },
    { search: "Ken Griffey Jr holofoil", note: "wrong word for refractor" },
    { search: "Acuna Jr topps chromes", note: "'chrome' pluralized" },
    { search: "Wander Franco topps bowmna", note: "'Bowman' misspelled" },
  ],
  Basketball: [
    { search: "Luca Doncic prizm rookie", note: "'Luka' misspelled as 'Luca'" },
    { search: "LeBron Jmaes rookie", note: "'James' misspelled" },
    { search: "Gianiss Antetokounmpo", note: "'Giannis' misspelled" },
    { search: "basktball card prizm PSA", note: "sport misspelled" },
    { search: "Paolo Banchero rookei PSA", note: "'rookie' misspelled" },
    { search: "Jayson Tatrum prizm", note: "'Tatum' misspelled" },
  ],
  Football: [
    { search: "Patrick Mahomse rookie", note: "'Mahomes' misspelled" },
    { search: "Mahomez prizm PSA 10", note: "another Mahomes spelling" },
    { search: "Lamar Jakson rookie card", note: "'Jackson' misspelled" },
    { search: "CJ Stroud rookei prizm", note: "'rookie' misspelled" },
    { search: "footbal card rookie prizm", note: "sport misspelled" },
    { search: "Josh Allen bufflo bills rookie", note: "'Buffalo' misspelled" },
  ],
  Hockey: [
    { search: "Connor Mcdavied rookie", note: "'McDavid' misspelled" },
    { search: "hocky card rookie prizm", note: "sport misspelled" },
    { search: "Ovehckin rookie card", note: "'Ovechkin' misspelled" },
    { search: "Auston Mathews rookie", note: "'Matthews' missing a t" },
    { search: "Sidney Crospy rookie", note: "'Crosby' misspelled" },
    { search: "Nathan Mackinnon upperdeck", note: "'MacKinnon' one word" },
  ],
};

type EbayFilters = {
  listingType: string;
  sortBy: string;
  condition?: string;
  extraSteps: string[];
};

// eBay sort values: 12=ending soonest, 15=price low→high, 10=newly listed
// _udlo/_udhi = price low/high filter (keeps out $1 junk and $10k grails)
function buildEbayUrl(
  query: string,
  angle: Angle,
  grade: Grade,
  misspelling?: string
): string {
  const p = new URLSearchParams();
  p.set("_nkw", misspelling ?? query);
  p.set("_sacat", "212"); // Sports Trading Cards

  // Price floor based on grade — filters out junk cards
  const isGraded = Boolean(grade.keyword);
  if (angle !== "lot") {
    p.set("_udlo", isGraded ? "20" : "5");   // min price
    p.set("_udhi", "500");                     // max price (skip grails)
  }

  if (angle === "auction") {
    p.set("LH_Auction", "1");
    p.set("_sop", "12"); // Ending soonest
  } else if (angle === "bin") {
    p.set("LH_BIN", "1");
    p.set("LH_BO", "1");  // include Best Offer listings too
    p.set("_sop", "15");  // Price lowest first
  } else if (angle === "misspelling") {
    p.set("_sop", "10");  // Newly listed — catch fresh misspelled listings fast
  } else if (angle === "lot") {
    p.set("LH_TitleDesc", "1"); // Search title + description
    p.set("_sop", "15");
  }
  return `https://www.ebay.com/sch/i.html?${p.toString()}`;
}

function buildSearch(
  sport: Sport,
  cardType: CardType,
  grade: Grade,
  angle: Angle
): { query: string; ebayUrl: string; filters: EbayFilters } | null {
  const sportLower = sport.toLowerCase();

  if (angle === "misspelling") {
    return null;
  }

  const parts = [sportLower, "card", cardType.keyword, grade.keyword]
    .map((p) => p.trim())
    .filter(Boolean);

  let query: string;
  let filters: EbayFilters;

  if (angle === "auction") {
    query = parts.join(" ");
    filters = {
      listingType: "Auction only",
      sortBy: "Time: Ending Soonest",
      condition: grade.keyword ? "Graded" : "Near Mint or Better",
      extraSteps: [
        "Look for listings with 0–2 bids ending in the next few hours",
        "Check sold comps before bidding so you know the ceiling",
        "Set a max price in eBay filters to stay in your budget",
      ],
    };
  } else if (angle === "bin") {
    query = parts.join(" ");
    filters = {
      listingType: "Buy It Now + Best Offer",
      sortBy: "Price + Shipping: Lowest First",
      condition: grade.keyword ? "Graded" : "Near Mint or Better",
      extraSteps: [
        "Sellers often accept 10–20% below asking on Best Offer",
        "Skip anything with 0 photos or a blurry photo",
        "Sort by lowest price and work your way up",
      ],
    };
  } else {
    query = `${sportLower} card lot ${cardType.keyword}`.trim().replace(/\s+/g, " ");
    filters = {
      listingType: "All listings",
      sortBy: "Price + Shipping: Lowest First",
      extraSteps: [
        "Title + description search is on — lots often say 'collection' not 'lot'",
        "Check every card in the photos — one PSA 10 RC can cover the whole price",
        "Message the seller to ask if they'd take a lower offer",
      ],
    };
  }

  return { query, ebayUrl: buildEbayUrl(query, angle, grade), filters };
}

// ─── Types ────────────────────────────────────────────────────────────────

type Stage = "idle" | "preview" | "checking" | "result";
type CardType = { label: string; keyword: string };
type Grade = { label: string; keyword: string };

type CheckResult = {
  title: string;
  player?: string;
  year?: number;
  setName?: string;
  parallel?: string | null;
  grade?: string | null;
  rookie?: boolean;
  sport?: string;
  notes?: string;
  comps?: { median: number; low: number; high: number; count: number };
  compsError?: string;
  askingPrice: number;
  tax: number;
  totalCost: number;
  estimatedSellPrice: number;
  platformFee: number;
  outboundShipping: number;
  profit: number;
  roiPct: number;
  verdict: "BUY" | "MAYBE" | "PASS" | "UNKNOWN";
  reasoning: string;
};

// ─── Main Page ────────────────────────────────────────────────────────────

export default function DealCheckPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullImage, setFullImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [shippingPaid, setShippingPaid] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Search builder state
  const [sport, setSport] = useState<Sport>("Basketball");
  const [cardType, setCardType] = useState<CardType>(CARD_TYPES[0]);
  const [grade, setGrade] = useState<Grade>(GRADES[0]);
  const [angle, setAngle] = useState<Angle>("auction");

  function reset() {
    setStage("idle");
    setPreviewUrl(null);
    setFullImage(null);
    setAskingPrice("");
    setShippingPaid("");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    const full = await resizeImage(file, 1280);
    setFullImage({ base64: full.base64, mimeType: full.mimeType });
    setStage("preview");
  }

  async function checkDeal() {
    if (!fullImage) return;
    setStage("checking");
    setError(null);
    try {
      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: fullImage.base64, mimeType: fullImage.mimeType }),
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "Identification failed");

      const settings = (() => {
        try { return JSON.parse(localStorage.getItem("cardhelper:hunt-settings") || "{}"); }
        catch { return {}; }
      })();
      const taxPct = settings.salesTaxPct ?? 5;
      const platformKey = (settings.sellPlatform ?? "tiktok_ig_cash") as keyof typeof PLATFORM_PRESETS;
      const platform = PLATFORM_PRESETS[platformKey] ?? PLATFORM_PRESETS.tiktok_ig_cash;

      const price = Number(askingPrice) || 0;
      const shipping = Number(shippingPaid) || 0;
      const tax = +((price * taxPct) / 100).toFixed(2);
      const totalCost = +(price + shipping + tax).toFixed(2);
      const median = scanData.comps?.median ?? 0;
      const hasComps = median > 0;
      const platformFee = hasComps ? +(median * platform.feeRate + platform.fixedFee).toFixed(2) : 0;
      const outboundShipping = platform.shippingCost;
      const profit = hasComps ? +(median - platformFee - outboundShipping - totalCost).toFixed(2) : 0;
      const roiPct = hasComps && totalCost > 0 ? +((profit / totalCost) * 100).toFixed(1) : 0;

      let verdict: "BUY" | "MAYBE" | "PASS" | "UNKNOWN";
      let reasoning: string;
      if (!hasComps) {
        verdict = "UNKNOWN";
        reasoning = "Couldn't pull sold comps — eBay is blocking our server. This will be fixed once the eBay API is approved. Card was identified correctly above.";
      } else if (profit >= 15 && roiPct >= 30) {
        verdict = "BUY"; reasoning = `$${profit.toFixed(2)} profit at ${roiPct}% ROI — grab it.`;
      } else if (profit >= 8 && roiPct >= 15) {
        verdict = "MAYBE"; reasoning = `$${profit.toFixed(2)} profit at ${roiPct}% ROI — decent, only if you can move it fast.`;
      } else if (profit > 0) {
        verdict = "PASS"; reasoning = `Only $${profit.toFixed(2)} profit (${roiPct}% ROI) — too thin after tax and shipping.`;
      } else {
        verdict = "PASS"; reasoning = `You'd lose $${Math.abs(profit).toFixed(2)} on this deal. Hard pass.`;
      }

      setResult({
        ...scanData.identified, comps: scanData.comps, compsError: scanData.compsError,
        askingPrice: price, tax, totalCost, estimatedSellPrice: median,
        platformFee, outboundShipping, profit, roiPct, verdict, reasoning,
      });
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("preview");
    }
  }

  function copy(q: string) {
    navigator.clipboard.writeText(q);
    setCopied(q);
    setTimeout(() => setCopied(null), 2000);
  }

  const generated = buildSearch(sport, cardType, grade, angle);
  const misspellings = angle === "misspelling" ? MISSPELLINGS[sport] : [];

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Check a Deal</h1>
        <p className="text-white/50 text-sm mt-1">Build a search → find a listing on eBay → screenshot it → get the verdict.</p>
      </div>

      {/* ── Search Builder ─────────────────────────────────────────── */}
      <section className="card space-y-5">
        <h2 className="font-semibold">Build your eBay search</h2>

        {/* Sport */}
        <div>
          <div className="label mb-2">Sport</div>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <Chip key={s} active={sport === s} onClick={() => setSport(s)}>{s}</Chip>
            ))}
          </div>
        </div>

        {/* Card Type */}
        <div>
          <div className="label mb-2">Card type</div>
          <div className="flex flex-wrap gap-2">
            {CARD_TYPES.map((t) => (
              <Chip key={t.label} active={cardType.label === t.label} onClick={() => setCardType(t)}>{t.label}</Chip>
            ))}
          </div>
        </div>

        {/* Grade */}
        <div>
          <div className="label mb-2">Grade</div>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <Chip key={g.label} active={grade.label === g.label} onClick={() => setGrade(g)}>{g.label}</Chip>
            ))}
          </div>
        </div>

        {/* Deal Angle */}
        <div>
          <div className="label mb-2">Deal angle</div>
          <div className="grid grid-cols-2 gap-2">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                onClick={() => setAngle(a.id as Angle)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  angle === a.id
                    ? "border-accent bg-accent/10 text-white"
                    : "border-white/10 text-white/60 hover:border-white/20"
                }`}
              >
                <div className="text-base mb-0.5">{a.icon} <span className="text-sm font-medium">{a.label}</span></div>
                <div className="text-[11px] text-white/40">{a.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Generated output */}
        {angle === "misspelling" ? (
          <div className="space-y-3 border-t border-white/5 pt-4">
            <div className="label">Tap to open on eBay — newly listed, no filters</div>
            {misspellings.map((m) => (
              <div key={m.search} className="flex gap-2">
                <a
                  href={buildEbayUrl(m.search, "misspelling", grade)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 hover:bg-accent/10 hover:border-accent/30 border border-white/5 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium">{m.search}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">{m.note}</div>
                  </div>
                  <span className="text-[11px] text-accent/60 ml-3 flex-shrink-0">Open →</span>
                </a>
                <button
                  onClick={() => copy(m.search)}
                  className="px-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/40 hover:text-white"
                >
                  {copied === m.search ? "✓" : "copy"}
                </button>
              </div>
            ))}
            <p className="text-xs text-white/30">Leave autocorrect OFF before tapping — iOS/Android may auto-fix the misspelling.</p>
          </div>
        ) : generated ? (
          <div className="space-y-3 border-t border-white/5 pt-4">
            {/* Open on eBay — primary action */}
            <a
              href={generated.ebayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn w-full py-3 text-base text-center block"
            >
              Open on eBay →
            </a>
            <p className="text-xs text-white/30 text-center -mt-1">Search is pre-filled, filters already set</p>

            {/* Collapsible details */}
            <div className="space-y-1.5">
              <FilterRow icon="🔍" label="Search" value={generated.query} />
              <FilterRow icon="📋" label="Listing type" value={generated.filters.listingType} />
              <FilterRow icon="↕" label="Sort by" value={generated.filters.sortBy} />
              {generated.filters.condition && (
                <FilterRow icon="⭐" label="Condition" value={generated.filters.condition} />
              )}
            </div>

            {generated.filters.extraSteps.length > 0 && (
              <div className="bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Tips</div>
                {generated.filters.extraSteps.map((step) => (
                  <div key={step} className="flex gap-2 text-xs text-white/60">
                    <span className="text-accent/60 flex-shrink-0">·</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ── Deal Checker ───────────────────────────────────────────── */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Found something? Check if it&apos;s worth it</h2>
        <p className="text-xs text-white/40">Screenshot the eBay listing, upload it here, enter the price — get a BUY/MAYBE/PASS verdict with full profit breakdown.</p>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {stage === "idle" && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-white/15 rounded-xl py-8 flex flex-col items-center gap-3 text-white/40 hover:border-accent/40 hover:text-accent/60 transition-colors"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm">Upload eBay screenshot or card photo</span>
          </button>
        )}

        {(stage === "preview" || stage === "checking") && previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="listing" className="w-full rounded-xl max-h-56 object-contain bg-black" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Asking price</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input className="input pl-7" inputMode="decimal" placeholder="e.g. 35" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="label mb-1">Shipping you&apos;ll pay</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input className="input pl-7" inputMode="decimal" placeholder="e.g. 4.99" value={shippingPaid} onChange={(e) => setShippingPaid(e.target.value)} />
                </div>
              </div>
            </div>
            <button className="btn w-full py-3" onClick={checkDeal} disabled={stage === "checking" || !askingPrice}>
              {stage === "checking" ? "Identifying & checking comps…" : "Should I buy this?"}
            </button>
            <button onClick={reset} className="btn-ghost w-full text-sm">Use different photo</button>
          </>
        )}

        {stage === "result" && result && (
          <>
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="listing" className="w-full rounded-xl max-h-48 object-contain bg-black" />
            )}
            <div className={`rounded-xl border p-4 space-y-3 ${
              result.verdict === "BUY" ? "border-green-500/40 bg-green-500/10 text-green-400" :
              result.verdict === "MAYBE" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" :
              result.verdict === "UNKNOWN" ? "border-white/20 bg-white/5 text-white/70" :
              "border-red-500/40 bg-red-500/10 text-red-400"
            }`}>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-black">
                  {result.verdict === "UNKNOWN" ? "?" : result.verdict}
                </div>
                {result.verdict !== "UNKNOWN" && result.profit > 0 && (
                  <div className="text-right">
                    <div className="text-xs opacity-60">Est. profit</div>
                    <div className="text-2xl font-bold">+${result.profit.toFixed(2)}</div>
                  </div>
                )}
              </div>
              <p className="text-sm opacity-90">{result.reasoning}</p>
              {result.verdict === "UNKNOWN" && (
                <p className="text-xs opacity-60">Card was identified correctly — check the details below. To get a profit verdict, the eBay API needs to be approved first.</p>
              )}
            </div>

            {result.verdict !== "UNKNOWN" && (
              <div className="space-y-1 text-sm">
                <Row label="Card price" value={`$${result.askingPrice.toFixed(2)}`} />
                <Row label="Shipping paid" value={`$${Number(shippingPaid || 0).toFixed(2)}`} />
                <Row label="WI sales tax (5%)" value={`$${result.tax.toFixed(2)}`} />
                <div className="border-t border-white/10 pt-1.5 mt-1.5">
                  <Row label="Total you pay" value={`$${result.totalCost.toFixed(2)}`} bold />
                </div>
                <div className="border-t border-white/10 pt-1.5 mt-1.5 space-y-1">
                  <Row label="Est. sell price (comps)" value={`$${result.estimatedSellPrice.toFixed(2)}`} />
                  {result.platformFee > 0 && <Row label="Platform fee" value={`-$${result.platformFee.toFixed(2)}`} />}
                  <Row label="Your shipping out" value={`-$${result.outboundShipping.toFixed(2)}`} />
                </div>
                <div className="border-t border-white/10 pt-1.5 mt-1.5">
                  <Row label={`Profit (${result.roiPct}% ROI)`} value={`${result.profit >= 0 ? "+" : ""}$${result.profit.toFixed(2)}`} bold tone={result.profit > 0 ? "good" : "bad"} />
                </div>
              </div>
            )}

            {result.comps && result.comps.count > 0 && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Median", value: `$${result.comps.median}` },
                  { label: "Low", value: `$${result.comps.low}` },
                  { label: "High", value: `$${result.comps.high}` },
                  { label: "Sales", value: String(result.comps.count) },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/5 bg-ink p-2">
                    <div className="text-[10px] text-white/40">{s.label}</div>
                    <div className="text-sm font-semibold mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            {result.compsError && <div className="text-xs text-yellow-400/70">Couldn&apos;t pull comps: {result.compsError}</div>}

            <div className="card !bg-white/5 space-y-0.5 text-sm">
              <div className="font-semibold">{result.title}</div>
              <div className="text-white/40 text-xs">
                {[result.year, result.player, result.setName, result.parallel, result.grade].filter(Boolean).join(" · ")}
              </div>
              {result.rookie && <span className="inline-block rounded-full bg-accent/20 text-accent text-xs px-2 py-0.5 font-semibold mt-1">Rookie Card</span>}
            </div>

            <button onClick={reset} className="btn-ghost w-full text-sm">Check another deal</button>
          </>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </section>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active ? "border-accent bg-accent/15 text-accent font-medium" : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function FilterRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 text-sm">
      <span>{icon}</span>
      <span className="text-white/50 w-24 flex-shrink-0">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-white";
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50">{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""} ${color}`}>{value}</span>
    </div>
  );
}
