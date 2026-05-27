import { oracleText } from "./cardIndex.js";

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function ruleLine(rule) {
  return `[${rule.ruleNumber}] - "${clean(rule.text)}"`;
}

function cardLine(card) {
  const mana = card.mana_cost || card.card_faces?.[0]?.mana_cost || "";
  const type = card.type_line || "Card";
  const text = clean(oracleText(card) || "(no Oracle text)");
  return `[[${card.name}]]${mana ? ` ${mana}` : ""} - ${type} - "${text}"`;
}

export function buildInjectedContext(question, rules = [], cards = [], options = {}) {
  const title = options.title || "## LOCAL ARBITER RETRIEVAL CONTEXT";
  const ruleLines = rules.length
    ? rules.map(ruleLine).join("\n")
    : "(none retrieved)";
  const cardLines = cards.length
    ? cards.map(cardLine).join("\n")
    : "(none retrieved)";

  return [
    title,
    "",
    "Use this local retrieval context as the authoritative source for this answer.",
    "Only cite rule numbers that appear in RETRIEVED RULES below.",
    "If the retrieved rules do not cover the question, say UNRESOLVED instead of guessing.",
    "Format each RULE TRACE entry as: [NNN.Xa] - one-line explanation of how this rule applies.",
    "",
    "## RETRIEVED RULES",
    ruleLines,
    "",
    "## RETRIEVED CARD TEXT",
    cardLines,
    "",
    "## QUESTION",
    String(question || "").trim(),
    "",
  ].join("\n");
}

export function extractCitedRuleNumbers(text) {
  return [...new Set([...String(text || "").matchAll(/\[(\d{3}\.\d+[a-z]?)\]/g)].map(match => match[1]))];
}

export function stripHallucinatedCitations(text, allowedRuleNumbers = []) {
  const allowed = new Set(allowedRuleNumbers);
  const canonicalByParent = new Map();
  for (const ruleNumber of allowed) {
    const parent = String(ruleNumber).match(/^(\d{3}\.\d+)/)?.[1];
    if (parent && !canonicalByParent.has(parent)) canonicalByParent.set(parent, ruleNumber);
  }

  const hallucinations = [];
  const cleaned = String(text || "").replace(/\[(\d{3}\.\d+[a-z]?)\]/g, (full, ruleNumber) => {
    if (allowed.has(ruleNumber)) return full;
    const parent = ruleNumber.match(/^(\d{3}\.\d+)/)?.[1];
    const canonical = parent ? canonicalByParent.get(parent) : null;
    if (canonical) return `[${canonical}]`;
    hallucinations.push(ruleNumber);
    return `[citation removed: ${ruleNumber}]`;
  });

  return {
    text: cleaned,
    hallucinations: [...new Set(hallucinations)],
  };
}
