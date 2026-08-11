import { NextRequest, NextResponse } from "next/server";
import {
  loadHuntSettings,
  saveHuntSettings,
  loadDeals,
  saveDeals,
  dismissDeal,
  type HuntSettings,
  type FoundDeal,
} from "@/lib/deal-hunter";
import { searchActiveListings, searchActiveByFindingApi } from "@/lib/ebay-api";
import { getComps } from "@/lib/comps";
import { scoreDeal } from "@/lib/fees";
import { PLATFORM_PRESETS } from "@/lib/settings";

/** Simplify a long eBay listing title into a clean comps search query */
function simplifyTitle(title: string): string {
  return title
    .replace(/#\s*\d+/g, "")          // Card numbers #101
    .replace(/\/\d{1,4}/g, "")        // Serial numbers /10 /99
    .replace(/\b\d{1,4}\/\d{1,4}\b/g, "") // "5/10" style
    .replace(/\([^)]+\)/g, "")        // Parentheticals
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 7)                       // Cap at 7 words — longer = fewer eBay results
    .join(" ");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    settings: loadHuntSettings(),
    deals: loadDeals().filter((d) => !d.dismissed),
    ebayReady: Boolean(process.env.EBAY_APP_ID),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "dismiss") {
    dismissDeal(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save-settings") {
    const s: HuntSettings = { ...body.settings, updatedAt: new Date().toISOString() };
    saveHuntSettings(s);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "scan") {
    if (!process.env.EBAY_APP_ID) {
      return NextResponse.json({ error: "EBAY_APP_ID not configured. Add it to your Vercel environment variables." }, { status: 503 });
    }

    // Use settings sent from the client (localStorage) — server /tmp is ephemeral
    const settings: HuntSettings = body.settings ?? loadHuntSettings();
    const platformKey = (settings.sellPlatform ?? "tiktok_ig_cash") as keyof typeof PLATFORM_PRESETS;
    const fees = PLATFORM_PRESETS[platformKey] ?? PLATFORM_PRESETS.tiktok_ig_cash;

    // Exclusions appended to every query — keeps mystery packs, lots, and bulk out
    const EXCLUDE = "-mystery -lot -pack -bundle -blind -break -random -repack -box";

    // Targeted queries — specific enough to find flip-worthy single cards
    const SPORT_QUERIES: Record<string, string[]> = {
      baseball: [
        `baseball rookie refractor PSA ${EXCLUDE}`,
        `baseball rookie prizm chrome ${EXCLUDE}`,
        `baseball rookie auto patch ${EXCLUDE}`,
      ],
      basketball: [
        `basketball rookie prizm PSA 10 ${EXCLUDE}`,
        `basketball rookie optic refractor ${EXCLUDE}`,
        `basketball rookie auto ${EXCLUDE}`,
      ],
      football: [
        `football rookie prizm PSA 10 ${EXCLUDE}`,
        `football rookie optic refractor ${EXCLUDE}`,
        `football rookie auto patch ${EXCLUDE}`,
      ],
      hockey: [
        `hockey rookie Young Guns PSA ${EXCLUDE}`,
        `hockey rookie prizm refractor ${EXCLUDE}`,
      ],
      soccer: [
        `soccer rookie Prizm PSA ${EXCLUDE}`,
        `soccer rookie auto ${EXCLUDE}`,
      ],
    };

    const queries: string[] = [];
    for (const sport of settings.sports) {
      const q = SPORT_QUERIES[sport] ?? [`${sport} rookie refractor PSA`];
      queries.push(...q);
    }
    for (const kw of settings.keywords) {
      if (kw.trim()) queries.push(kw.trim());
    }

    const seen = new Set<string>();
    const candidates: Array<{
      itemId: string; title: string; buyPrice: number; shipping: number;
      url: string; image?: string; condition?: string; endsAt?: string;
    }> = [];

    // Fetch candidates — 8 per query max, all queries in parallel
    const searchErrors: string[] = [];
    await Promise.allSettled(
      queries.map(async (q) => {
        try {
          let results = await searchActiveByFindingApi(q, { maxPrice: settings.maxBudget, limit: 15 }).catch((e) => {
            searchErrors.push(`FindingAPI[${q}]: ${e.message}`);
            return null;
          });
          if (!results) results = await searchActiveListings(q, { maxPrice: settings.maxBudget, limit: 15 }).catch((e) => {
            searchErrors.push(`BrowseAPI[${q}]: ${e.message}`);
            return [];
          });
          for (const r of (results ?? [])) {
            if (seen.has(r.itemId)) continue;
            if (r.totalPrice < settings.minBudget || r.totalPrice > settings.maxBudget) continue;
            // Skip mystery packs, lots, bundles, breaks — single cards only
            if (/mystery|blind|repack|\blot\b|bundle|break|random|box set/i.test(r.title)) continue;
            seen.add(r.itemId);
            candidates.push({
              itemId: r.itemId,
              title: r.title,
              buyPrice: r.price,
              shipping: r.shipping,
              url: r.url,
              image: r.image,
              condition: r.condition,
              endsAt: r.endsAt,
            });
          }
        } catch (e) {
          searchErrors.push(`Query[${q}]: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );

    // Get comps in batches of 5 to stay under the 10-second Vercel limit
    const deals: FoundDeal[] = [];
    const BATCH = 5;
    for (let i = 0; i < Math.min(candidates.length, 50); i += BATCH) {
      await Promise.allSettled(
        candidates.slice(i, i + BATCH).map(async (c) => {
          try {
            const comps = await getComps(simplifyTitle(c.title), 20);
            const estimatedSellPrice = comps.median ?? 0;
            if (!estimatedSellPrice) return;

            const taxAmount = +(c.buyPrice * (settings.salesTaxPct / 100)).toFixed(2);
            const result = scoreDeal({
              askingPrice: c.buyPrice + c.shipping + taxAmount,
              estimatedSalePrice: estimatedSellPrice,
              shippingChargedToBuyer: fees.shippingCost,
              thresholds: {
                feeRate: fees.feeRate,
                fixedFee: fees.fixedFee,
                shippingCost: fees.shippingCost,
                buyMinRoiPct: 20,
                buyMinProfitDollars: settings.minProfit,
                maybeMinRoiPct: 10,
                maybeMinProfitDollars: settings.minProfit * 0.6,
              },
            });

            if (result.profit < settings.minProfit * 0.6) return;
            if (result.verdict === "PASS") return;

            deals.push({
              id: `${c.itemId}_${Date.now()}`,
              itemId: c.itemId,
              title: c.title,
              buyPrice: c.buyPrice,
              shipping: c.shipping,
              tax: taxAmount,
              totalCost: +(c.buyPrice + c.shipping + taxAmount).toFixed(2),
              estimatedSellPrice,
              profit: result.profit,
              roiPct: result.roiPct,
              verdict: result.verdict as "BUY" | "MAYBE",
              url: c.url,
              image: c.image,
              condition: c.condition,
              endsAt: c.endsAt,
              foundAt: new Date().toISOString(),
            });
          } catch {
            // Skip cards we can't get comps for
          }
        })
      );
    }

    const existing = loadDeals().filter((d) => !deals.some((n) => n.itemId === d.itemId));
    const merged = [...deals, ...existing].sort((a, b) => b.profit - a.profit);
    saveDeals(merged);

    return NextResponse.json({
      scanned: candidates.length,
      found: deals.length,
      deals: merged.filter((d) => !d.dismissed),
      debug: {
        queriesRan: queries.length,
        candidatesFound: candidates.length,
        dealsAfterScoring: deals.length,
        searchErrors: searchErrors.slice(0, 5),
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
