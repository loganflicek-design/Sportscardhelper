import { NextRequest, NextResponse } from "next/server";
import { addCard, listInventory } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await listInventory();
  const sold = cards.filter((c) => c.status === "sold" && c.soldFor);
  const totalCost = cards.reduce((a, r) => a + (r.cost || 0), 0);
  const feeRate = Number(process.env.EBAY_FEE_RATE || 0.1325);
  const fixedFee = Number(process.env.EBAY_FIXED_FEE || 0.3);
  const shipping = Number(process.env.DEFAULT_SHIPPING_COST || 1.5);
  const realized = sold.reduce((acc, r) => {
    const net = (r.soldFor || 0) * (1 - feeRate) - fixedFee - shipping;
    return acc + (net - r.cost);
  }, 0);
  const active = cards.filter((c) => c.status !== "sold");
  const totalMarketValue = active.reduce((a, c) => a + (c.marketValue ?? 0), 0);
  const activeCostBasis = active.reduce((a, c) => a + (c.cost || 0), 0);
  const unrealized = +(totalMarketValue - activeCostBasis).toFixed(2);
  return NextResponse.json({
    cards,
    summary: {
      totalCards: cards.length,
      inHand: cards.filter((c) => c.status === "raw" || c.status === "graded").length,
      listed: cards.filter((c) => c.status === "listed").length,
      sold: sold.length,
      totalCostBasis: +totalCost.toFixed(2),
      activeCostBasis: +activeCostBasis.toFixed(2),
      totalMarketValue: +totalMarketValue.toFixed(2),
      unrealizedProfit: unrealized,
      realizedProfit: +realized.toFixed(2),
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  let imageUrl: string | undefined = body.imageUrl;
  if (body.imageBase64 && body.imageMimeType) {
    // Store as data URL so it survives in the Sheet cell (≤ ~50KB after resize).
    imageUrl = `data:${body.imageMimeType};base64,${body.imageBase64}`;
  }

  const card = await addCard({
    ...body,
    title: body.title,
    cost: Number(body.cost || 0),
    imageUrl,
  });
  return NextResponse.json(card, { status: 201 });
}
