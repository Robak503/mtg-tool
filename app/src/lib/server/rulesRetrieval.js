import fs from "node:fs";
import path from "node:path";

import {
  detectCardNamesInText,
  extractBracketedCardNames,
  lookupCard,
  lookupRulingsForCard,
  oracleText,
} from "./cardIndex.js";

const RULES_INDEX_FILE = path.join(process.cwd(), "data", "rules-index.json");
const DEFAULT_LIMIT = 5;

let rulesIndex = null;
let rulesByNumber = null;

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "that", "this", "with", "from", "they",
  "have", "been", "will", "would", "its", "not", "but", "you", "your", "can",
  "may", "one", "two", "all", "any", "each", "than", "then", "into", "onto",
  "only", "same", "also", "see", "rule", "rules", "does", "what", "when",
]);

const MTG_ALLOWLIST = new Set([
  "tap", "pay", "add", "put", "die", "cast", "copy", "dies", "draw", "hand",
  "zone", "card", "mana", "spell", "stack", "turn", "step", "phase", "life",
]);

const RULE_NUMBER_RE = /\b(\d{3}\.\d+[a-z]?)\b/g;

function ruleSort(a, b) {
  return a.ruleNumber.localeCompare(b.ruleNumber, undefined, { numeric: true, sensitivity: "base" });
}

function loadRulesIndex() {
  if (rulesIndex && rulesByNumber) return { rules: rulesIndex, byNumber: rulesByNumber };
  if (!fs.existsSync(RULES_INDEX_FILE)) {
    throw new Error("Missing app/data/rules-index.json. Run npm.cmd run build:rules-index first.");
  }

  const parsed = JSON.parse(fs.readFileSync(RULES_INDEX_FILE, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Rules index must be an array.");

  rulesIndex = parsed;
  rulesByNumber = new Map(parsed.map(rule => [rule.ruleNumber, rule]));
  return { rules: rulesIndex, byNumber: rulesByNumber };
}

export function extractRuleNumbers(text) {
  return [...new Set([...String(text || "").matchAll(RULE_NUMBER_RE)].map(match => match[1]))];
}

export function extractRuleKeywords(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  return [...new Set(tokens.filter(token => {
    if (STOP_WORDS.has(token)) return false;
    return token.length >= 3 || MTG_ALLOWLIST.has(token);
  }))];
}

function ruleHintsFromText(text) {
  const lower = String(text || "").toLowerCase();
  const hints = new Set();

  if (/\bwould\b[\s\S]{0,80}\binstead\b/.test(lower) || /\binstead\b[\s\S]{0,80}\bwould\b/.test(lower)) {
    hints.add("614.1");
    hints.add("614.6");
  }
  if (/\breplacement\b|\bprevention\b/.test(lower)) {
    hints.add("614.1");
    hints.add("614.6");
    hints.add("616.1");
  }
  if (/\btwo or more\b[\s\S]{0,80}\b(replacement|prevention)\b|\bmultiple\b[\s\S]{0,80}\b(replacement|prevention)\b/.test(lower)) {
    hints.add("616.1");
    hints.add("616.1e");
  }
  if (/\bdies\b|\bdie\b[\s\S]{0,40}\btrigger/.test(lower)) {
    hints.add("700.4");
  }
  if (/\btrigger|triggered|triggers\b/.test(lower)) {
    hints.add("603.1");
    hints.add("603.2");
    hints.add("603.3");
  }
  if (/\bresolve|resolves|resolution\b/.test(lower)) {
    hints.add("608.2");
  }
  if (/\bstack\b|\bpriority\b/.test(lower)) {
    hints.add("117.3b");
    hints.add("405.1");
    hints.add("608.2");
  }
  if (/\bstate based\b|\bstate-based\b|\bsba\b/.test(lower)) {
    hints.add("704.5");
  }
  if (/\bshield counter|shield counters\b/.test(lower)) {
    hints.add("122.1c");
    hints.add("614.1");
    hints.add("614.6");
  }
  if (/\bdestroy|destroyed|destruction\b|\blethal damage\b/.test(lower)) {
    hints.add("701.8a");
    hints.add("701.8b");
  }
  if (/\bcommander\b[\s\S]{0,120}\b(command zone|graveyard|exile|dies?|destroyed)\b|\b(command zone|graveyard|exile|dies?|destroyed)\b[\s\S]{0,120}\bcommander\b/.test(lower)) {
    hints.add("903.9");
    hints.add("903.9a");
  }
  if (/\bcommander tax\b|\badditional two\b|\btwo more\b/.test(lower)) {
    hints.add("903.8");
  }

  return [...hints];
}

function pinnedRuleHintsFromText(text) {
  const lower = String(text || "").toLowerCase();
  const hints = new Set();

  if (/\bblood artist\b|\bzulaport cutthroat\b|\bcruel celebrant\b|\bbastion of remembrance\b|\bdies\b|\bdie\b[\s\S]{0,40}\btrigger/.test(lower)) {
    hints.add("700.4");
  }
  if (/\bshield counter|shield counters\b/.test(lower)) {
    hints.add("122.1c");
  }
  if (/\bdestroy|destroyed|destruction\b|\blethal damage\b/.test(lower)) {
    hints.add("701.8a");
  }
  if (/\bcommander\b/.test(lower) && /\b(command zone|graveyard|exile|dies?|destroy|destroyed)\b/.test(lower)) {
    hints.add("903.9a");
  }
  if (/\btwo or more\b[\s\S]{0,80}\b(replacement|prevention)\b|\bmultiple\b[\s\S]{0,80}\b(replacement|prevention)\b/.test(lower)) {
    hints.add("616.1");
  }
  if ((lower.match(/\binstead\b/g) || []).length >= 2) {
    hints.add("616.1");
  }
  if (/\bliving death\b/.test(lower) && /\b(rest in peace|anafenza)\b/.test(lower)) {
    hints.add("616.1");
  }
  if (/\bwould\b[\s\S]{0,120}\bgraveyard[\s\S]{0,120}\bexile\b|\bexile\b[\s\S]{0,120}\binstead\b/.test(lower)) {
    hints.add("614.6");
  }
  if (/\bliving death\b|\bresolve|resolves|resolution\b/.test(lower)) {
    hints.add("608.2");
  }

  return [...hints];
}

export function extractCardNamesForRules(query, explicitCardNames = []) {
  const names = [
    ...explicitCardNames,
    ...extractBracketedCardNames(query),
    ...detectCardNamesInText(String(query || "").replace(/\[\[([^\]]+)\]\]/g, " ")),
  ];
  return [...new Set(names.filter(Boolean))];
}

function cardSeedText(cardNames) {
  const chunks = [];

  for (const name of cardNames) {
    const card = lookupCard(name);
    if (!card) continue;
    chunks.push(card.name);
    chunks.push(card.type_line || "");
    chunks.push(oracleText(card));
    for (const ruling of lookupRulingsForCard(card).slice(0, 8)) {
      chunks.push(ruling.comment || "");
    }
  }

  return chunks.filter(Boolean).join("\n");
}

function addRuleScore(scores, ruleNumber, amount, reason, byNumber) {
  const rule = byNumber.get(ruleNumber);
  if (!rule) return;
  const current = scores.get(ruleNumber) || { rule, score: 0, reasons: new Set() };
  current.score += amount;
  current.reasons.add(reason);
  scores.set(ruleNumber, current);
}

export function retrieveRules(query, cardNames = [], options = {}) {
  const { rules, byNumber } = loadRulesIndex();
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), 12);
  const extractedCardNames = extractCardNamesForRules(query, cardNames);
  const seedText = cardSeedText(extractedCardNames);
  const queryKeywords = new Set(extractRuleKeywords(query));
  const seedKeywords = new Set(extractRuleKeywords(seedText));
  const scores = new Map();

  for (const ruleNumber of extractRuleNumbers(query)) {
    addRuleScore(scores, ruleNumber, 5000, "exact-rule-number", byNumber);
  }

  for (const ruleNumber of [...pinnedRuleHintsFromText(query), ...pinnedRuleHintsFromText(seedText)]) {
    addRuleScore(scores, ruleNumber, 10000, "pinned-rule-hint", byNumber);
  }

  for (const ruleNumber of [...ruleHintsFromText(query), ...ruleHintsFromText(seedText)]) {
    addRuleScore(scores, ruleNumber, 2000, "rule-hint", byNumber);
  }

  for (const rule of rules) {
    const keywords = rule.keywords || [];
    let score = 0;
    let queryOverlap = 0;
    let seedOverlap = 0;

    for (const keyword of keywords) {
      if (queryKeywords.has(keyword)) queryOverlap += 1;
      if (seedKeywords.has(keyword)) seedOverlap += 1;
    }

    if (queryOverlap) score += queryOverlap * 100;
    if (seedOverlap) score += seedOverlap * 24;
    if (!score) continue;

    const current = scores.get(rule.ruleNumber) || { rule, score: 0, reasons: new Set() };
    current.score += score;
    if (queryOverlap) current.reasons.add("query-keywords");
    if (seedOverlap) current.reasons.add("card-seed-keywords");
    scores.set(rule.ruleNumber, current);
  }

  const ranked = [...scores.values()]
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || ruleSort(a.rule, b.rule))
    .slice(0, limit)
    .map(entry => ({
      ...entry.rule,
      score: entry.score,
      reasons: [...entry.reasons].sort(),
    }));

  return {
    rules: ranked,
    cardNames: extractedCardNames,
    confidence: ranked.length ? "high" : "low",
  };
}

export function resetRulesRetrievalForTests() {
  rulesIndex = null;
  rulesByNumber = null;
}
