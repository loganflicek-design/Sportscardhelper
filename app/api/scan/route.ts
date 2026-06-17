import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARD_PROMPT = `You are a sports card expert. Analyze this trading card photo and extract details.
Return ONLY a JSON object with these exact fields (no markdown, no explanation):

{
  "title": "full eBay-style listing title, max 80 chars (e.g. '2020 Panini Chronicles Jordan Love Prizm Black-Silver RC PSA 10')",
  "player": "player full name",
  "year": 2020,
  "setName": "set/brand name (e.g. 'Prizm', 'Optic', 'Chronicles', 'Topps Chrome')",
  "parallel": "parallel or variant if visible (e.g. 'Gold', 'Blue', 'Holo') or null",
  "cardNumber": "card number as string including # (e.g. '#101') or null",
  "grade": "grading label if visible (e.g. 'PSA 10', 'BGS 9.5') or null",
  "sport": "Football, Basketball, Baseball, Hockey, or Other",
  "rookie": true or false,
  "notes": "any other notable details (e.g. auto, patch, serial number) or empty string"
}`;

export type ScanResult = {
  title: string;
  player?: string;
  year?: number;
  setName?: string;
  parallel?: string | null;
  cardNumber?: string | null;
  grade?: string | null;
  sport?: string;
  rookie?: boolean;
  notes?: string;
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Add it to your environment variables." },
      { status: 503 }
    );
  }

  let body: { imageBase64: string; mimeType: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "imageBase64 and mimeType are required" }, { status: 400 });
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported image type: ${mimeType}` }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: imageBase64,
              },
            },
            { type: "text", text: CARD_PROMPT },
          ],
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const jsonStr = raw.startsWith("{") ? raw : raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const identified: ScanResult = JSON.parse(jsonStr);
    return NextResponse.json({ identified });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Card identification failed: ${msg}` }, { status: 500 });
  }
}
