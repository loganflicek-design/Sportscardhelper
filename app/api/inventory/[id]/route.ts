import { NextRequest, NextResponse } from "next/server";
import { deleteCard, updateCard } from "@/lib/storage";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const patch = await req.json();
  const updated = await updateCard(params.id, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await deleteCard(params.id);
  return NextResponse.json({ ok });
}
