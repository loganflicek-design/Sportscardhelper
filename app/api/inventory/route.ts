import { NextRequest, NextResponse } from "next/server";
import { addCard, listCards, pnlSummary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cards: listCards(), summary: pnlSummary() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const row = addCard(body);
  return NextResponse.json(row, { status: 201 });
}
