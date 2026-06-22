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
import { searchActiveListings, hasEbayApiCredentials } from "@/lib/ebay-api";
import { getComps } from "@/lib/comps";
import { scoreDeal } from "@/lib/fees";
import { PLATFORM_PRESETS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    settings: loadHuntSettings(),
    deals: loadDeals().filter((d) => !d.dismissed),
    ebayReady: hasEbayApiCredentials(),
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
    if (!hasEbayApiCredentials()) {
      return NextResponse.json({ error: "eBay API credentials not configured yet" }, { status: 503 });
    }

    const settings = loadHuntSettings();
    const platformKey = (settings.sellPlatform ?? "tiktok_ig_cash") as keyof typeof PLATFORM_PRESETS;
    const fees = PLATFORM_PRESETS[platformKey] ?? PLATFORM_PRESETS.tiktok_ig_cash;

    const queries: string[] = [];
    for (const sport of settings.sports) {
      queries.push(`${sport} card rookie`);
      queries.push(`${sport} card PSA 10`);
      queries.push(`${sport} card refractor rookie`);
    }
    for (const kw of settings.keywords) {
      if (kw.trim()) queries.push(kw.trim());
    }

    const seen = new Set<string>();
    const candidates: Array<{
      itemId: string; title: string; buyPrice: number; shipping: number;
      url: string; image?: string; condition?: string; endsAt?: string;
    }> = [];

    await Promise.allSettled(
      queries.map(async (q) => {
        const results = await searchActiveListings(q, { maxPrice: settings.maxBudget, limit: 30 });
        for (const r of results) {
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

    const deals: FoundDeal[] = [];
    await Promise.allSettled(
      candidates.map(async (c) => {
        try {
          const comps = await getComps(c.title);
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
            },
          });

          if (result.profit < settings.minProfit) return;
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
