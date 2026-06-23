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

    const settings = loadHuntSettings();
    const platformKey = (settings.sellPlatform ?? "tiktok_ig_cash") as keyof typeof PLATFORM_PRESETS;
    const fees = PLATFORM_PRESETS[platformKey] ?? PLATFORM_PRESETS.tiktok_ig_cash;

    // Targeted queries — specific enough to find flip-worthy cards
    const SPORT_QUERIES: Record<string, string[]> = {
      baseball: ["baseball rookie refractor PSA", "baseball rookie prizm chrome", "baseball rookie auto patch"],
      basketball: ["basketball rookie prizm PSA 10", "basketball rookie optic refractor", "basketball rookie auto"],
      football: ["football rookie prizm PSA 10", "football rookie optic refractor", "football rookie auto patch"],
      hockey: ["hockey rookie Young Guns PSA", "hockey rookie prizm refractor"],
      soccer: ["soccer rookie Prizm PSA", "soccer rookie auto"],
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
    await Promise.allSettled(
      queries.map(async (q) => {
        let results = await searchActiveByFindingApi(q, { maxPrice: settings.maxBudget, limit: 8 }).catch(() => null);
        if (!results) results = await searchActiveListings(q, { maxPrice: settings.maxBudget, limit: 8 }).catch(() => []);
        for (const r of (results ?? [])) {
          if (seen.has(r.itemId)) continue;
          if (r.totalPrice < settings.minBudget || r.totalPrice > settings.maxBudget) continue;
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
      })
    );

    // Get comps in batches of 5 to stay under the 10-second Vercel limit
    const deals: FoundDeal[] = [];
    const BATCH = 5;
    for (let i = 0; i < Math.min(candidates.length, 30); i += BATCH) {
      await Promise.allSettled(
        candidates.slice(i, i + BATCH).map(async (c) => {
          try {
            const comps = await getComps(c.title, 20);
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
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
