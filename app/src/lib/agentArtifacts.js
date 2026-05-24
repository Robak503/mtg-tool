function normalizeHeading(line) {
  return String(line || "")
    .replace(/^#+\s*/, "")
    .replace(/[:*`_]/g, "")
    .trim()
    .toLowerCase();
}

function sectionType(line) {
  const heading = normalizeHeading(line);
  if (!heading || heading.length > 80) return "";
  if (/\b(cuts?|potential cuts?|10 cuts?|strongest cuts?)\b/.test(heading)) return "cuts";
  if (/\b(adds?|additions?|10 adds?|strongest adds?|upgrade adds?)\b/.test(heading)) return "adds";
  if (/\b(maybe board|maybeboard|maybe-board|watch list|consider)\b/.test(heading)) return "maybeBoard";
  if (/\b(testing plan|test plan|playtest|testing)\b/.test(heading)) return "testingPlan";
  return "";
}

function cleanItem(line) {
  return String(line || "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/^cut\s+/i, "")
    .replace(/^add\s+/i, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+—\s+.*$/, "")
    .replace(/\s+:\s+.*$/, "")
    .replace(/[.;,]\s*$/, "")
    .trim();
}

function extractItems(lines) {
  const items = [];
  for (const line of lines) {
    const bracketed = [...line.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1].trim());
    if (bracketed.length) {
      items.push(...bracketed);
      continue;
    }

    if (!/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) continue;
    const item = cleanItem(line);
    if (item && item.length <= 70) items.push(item);
  }

  return [...new Set(items)].slice(0, 20);
}

export function parseKarnPlan(text) {
  const sections = { cuts: [], adds: [], maybeBoard: [], testingPlan: [] };
  let current = "";

  for (const line of String(text || "").split("\n")) {
    const type = sectionType(line);
    if (type) {
      current = type;
      continue;
    }
    if (current) sections[current].push(line);
  }

  return {
    cuts: extractItems(sections.cuts),
    adds: extractItems(sections.adds),
    maybeBoard: extractItems(sections.maybeBoard),
    testingPlan: sections.testingPlan
      .map(cleanItem)
      .filter(item => item && item.length <= 180)
      .slice(0, 8),
  };
}

export function deckSnapshot(deck) {
  const cards = deck?.cards || [];
  const commanders = cards.filter(card => card.section === "Commander").map(card => card.name);
  const mainCount = cards
    .filter(card => card.section !== "Sideboard" && card.section !== "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);
  const tokenCount = cards
    .filter(card => card.section === "Tokens")
    .reduce((sum, card) => sum + card.qty, 0);

  return {
    commander: commanders.join(" / ") || deck?.name || "No commander saved",
    mainCount,
    tokenCount,
    cardNames: cards
      .filter(card => card.section !== "Tokens")
      .map(card => `${card.qty} ${card.name}`),
  };
}
