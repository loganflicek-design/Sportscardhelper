import { NextRequest, NextResponse } from "next/server";
import { scoreDeal } from "@/lib/fees";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const askingPrice = Number(body.askingPrice);
  const estimatedSalePrice = Number(body.estimatedSalePrice);
  if (!askingPrice || !estimatedSalePrice) {
    return NextResponse.json({ error: "askingPrice and estimatedSalePrice required" }, { status: 400 });
  }
  const result = scoreDeal({
    askingPrice,
    estimatedSalePrice,
    shippingCost: body.shippingCost,
    shippingChargedToBuyer: body.shippingChargedToBuyer,
    feeRate: body.feeRate,
    fixedFee: body.fixedFee,
  });
  return NextResponse.json(result);
}
