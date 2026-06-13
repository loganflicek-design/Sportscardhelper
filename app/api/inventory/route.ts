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
  return NextResponse.json({
    cards,
    summary: {
      totalCards: cards.length,
      inHand: cards.filter((c) => c.status === "raw" || c.status === "graded").length,
      listed: cards.filter((c) => c.status === "listed").length,
      sold: sold.length,
      totalCostBasis: +totalCost.toFixed(2),
      realizedProfit: +realized.toFixed(2),
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const card = await addCard({ title: body.title, cost: Number(body.cost || 0), ...body });
  return NextResponse.json(card, { status: 201 });
}
