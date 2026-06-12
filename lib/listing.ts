export type ListingInputs = {
  year?: string;
  setName?: string;
  player?: string;
  cardNumber?: string;
  parallel?: string;
  grade?: string;
  serial?: string;
  rookie?: boolean;
  team?: string;
  sport?: string;
  suggestedPrice?: number;
};

export function generateTitle(i: ListingInputs): string {
  const parts = [
    i.year,
    i.setName,
    i.parallel,
    i.player,
    i.team,
    i.cardNumber ? `#${i.cardNumber.replace(/^#/, "")}` : null,
    i.rookie ? "RC ROOKIE" : null,
    i.serial ? `/${i.serial.replace(/^\//, "")}` : null,
    i.grade ? i.grade.toUpperCase() : null,
  ].filter(Boolean) as string[];

  let title = parts.join(" ").replace(/\s+/g, " ").trim();
  if (title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, "");
  return title;
}

export function generateDescription(i: ListingInputs): string {
  const lines: string[] = [];
  lines.push(`${i.year ?? ""} ${i.setName ?? ""} ${i.player ?? ""}`.trim());
  if (i.cardNumber) lines.push(`Card #: ${i.cardNumber}`);
  if (i.parallel) lines.push(`Parallel: ${i.parallel}`);
  if (i.serial) lines.push(`Serial Numbered: /${i.serial.replace(/^\//, "")}`);
  if (i.grade) lines.push(`Grade: ${i.grade}`);
  if (i.team) lines.push(`Team: ${i.team}`);
  if (i.rookie) lines.push("Rookie Card");
  lines.push("");
  lines.push("Card pictured is the exact card you will receive.");
  lines.push("Shipped in a penny sleeve + top loader inside a bubble mailer.");
  lines.push("Combined shipping available — message before paying.");
  lines.push("Smoke-free home. Thanks for looking!");
  return lines.filter(Boolean).join("\n");
}
