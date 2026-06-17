import { NextRequest, NextResponse } from "next/server";
import { analyzeGrading, type GradingService } from "@/lib/grading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });
  const rawCost = Number(body.rawCost ?? 0);
  try {
    const analysis = await analyzeGrading({
      baseQuery: body.query.trim(),
      rawCost,
      service: (body.service as GradingService) ?? "psa",
      shippingBothWays: body.shippingBothWays ? Number(body.shippingBothWays) : undefined,
      probabilities: body.probabilities,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
