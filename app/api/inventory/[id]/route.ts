import { NextRequest, NextResponse } from "next/server";
import { deleteCard, updateCard } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const patch = await req.json();
  const updated = updateCard(id, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteCard(Number(params.id));
  return NextResponse.json({ ok });
}
