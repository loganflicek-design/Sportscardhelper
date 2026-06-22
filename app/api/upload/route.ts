import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 501 });
  }
  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "imageBase64 and mimeType required" }, { status: 400 });
  }
  const buffer = Buffer.from(imageBase64, "base64");
  const ext = mimeType.split("/")[1] || "jpg";
  const filename = `cards/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { url } = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: false,
  });
  return NextResponse.json({ url });
}
