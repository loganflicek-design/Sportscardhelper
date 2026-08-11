/**
 * Build eBay search queries optimized for sold comp lookups.
 * Card titles from Claude often contain too-specific elements (serial numbers,
 * card numbers, long parallel names) that cause 0 results on eBay Finding API.
 * This produces a primary query and a shorter fallback.
 */

export type CardFields = {
  title: string;
  player?: string;
  year?: number;
  setName?: string;
  parallel?: string | null;
  grade?: string | null;
  rookie?: boolean;
};

export function buildCompsQuery(card: CardFields): { primary: string; fallback: string } {
  const parts: string[] = [];

  if (card.player) parts.push(card.player);
  if (card.year) parts.push(String(card.year));

  if (card.setName) {
    // Strip manufacturer prefix ("Panini Prizm" → "Prizm", "Topps Chrome" → "Chrome")
    const cleaned = card.setName
      .replace(/^(panini|topps|upper deck|donruss|bowman|score|leaf)\s+/i, "")
      .trim();
    if (cleaned) parts.push(cleaned);
  }

  if (card.parallel) {
    // Drop serial numbers ("/10", "5/10") and "Base" parallel
    const par = card.parallel
      .replace(/\/\d+/g, "")
      .replace(/\b\d+\/\d+\b/g, "")
      .trim();
    if (par && !/^base$/i.test(par)) parts.push(par);
  }

  if (card.rookie) parts.push("RC");
  if (card.grade) parts.push(card.grade);

  // Primary: structured from identified fields (most accurate)
  const primary = parts.filter(Boolean).join(" ") ||
    cleanTitle(card.title).split(" ").slice(0, 7).join(" ");

  // Fallback: first 5–6 words from cleaned title (broad — finds more results)
  const fallback = cleanTitle(card.title).split(" ").slice(0, 5).join(" ");

  return { primary, fallback };
}

/** Remove noise that limits eBay results: card numbers, serial numbers, parentheticals */
function cleanTitle(title: string): string {
  return title
    .replace(/#\s*\d+/g, "")          // Card numbers like #101
    .replace(/\/\d{1,4}/g, "")        // Serial numbers like /10 /99 /150
    .replace(/\b\d{1,4}\/\d{1,4}\b/g, "") // "5/10" style
    .replace(/\([^)]+\)/g, "")        // Parenthetical text
    .replace(/\s+/g, " ")
    .trim();
}
