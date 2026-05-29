import fs from "node:fs";
import path from "node:path";

import {
  detectCardNamesInText,
  extractBracketedCardNames,
  lookupCard,
  lookupRulingsForCard,
  oracleText,
} from "./cardIndex.js";
import { retrieveRulesGuruPrecedents, resetRulesGuruRetrievalForTests } from "./rulesGuruRetrieval.js";

import { dataPath } from "./paths.js";
import { readJsonOrNull } from "./jsonFile.js";
const RULES_INDEX_FILE = dataPath("rules-index.json");
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

  // Missing index still throws above (actionable hint). A corrupt index
  // degrades to empty (no rule hints) instead of 500-ing every rules query.
  const parsed = readJsonOrNull(RULES_INDEX_FILE, { fallback: [], label: "rules-index" });
  rulesIndex = Array.isArray(parsed) ? parsed : [];
  rulesByNumber = new Map(rulesIndex.map(rule => [rule.ruleNumber, rule]));
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
  if (/\beminence\b|\bfunctions?\b[\s\S]{0,80}\bcommand zone\b/.test(lower)) {
    hints.add("113.6b");
  }
  if (/\bduring resolution\b|\bmid-resolution\b|\bis resolving\b|\bwhile\b[\s\S]{0,40}\bresolving\b|\brespond\b[\s\S]{0,80}\b(resolution|resolving)\b|\bafter\b[\s\S]{0,40}\bresolves\b/.test(lower)) {
    hints.add("608.2");
    hints.add("117.3b");
  }
  if ((/\b(in response|respond)\b/.test(lower) && /\b(additional cost|sacrifice|cost)\b/.test(lower)) || /\bplayers? don['’]?t get priority\b/.test(lower)) {
    hints.add("601.2g");
    hints.add("601.2i");
    hints.add("117.3c");
  }
  if (/\bstate trigger|state-trigger|already on the stack\b|\bstate-based actions\b[\s\S]{0,120}\btrigger\b/.test(lower)) {
    hints.add("603.8");
  }
  if (/\bapnap\b|\bturn order\b|\bsimultaneous\b/.test(lower)) {
    hints.add("101.4");
    hints.add("603.3b");
  }
  if (/\bcan't\b|\bcannot\b|\bcan['’]?t beats can\b|\bcan not\b/.test(lower)) {
    hints.add("101.2");
  }
  if (/\bcounterspell\b|\bcounter target spell\b|\bcan't be countered\b|\bcannot be countered\b/.test(lower)) {
    hints.add("101.2");
    hints.add("608.2b");
  }
  if (/\b(stack object|object ownership|owner of.*spell|who owns.*spell|controller of .*stack|who is the controller|cast .* from exile)\b/.test(lower)) {
    hints.add("112.3");
  }
  if (/\bcommander damage\b/.test(lower)) {
    hints.add("903.4");
    hints.add("903.10");
  }
  if (/\bcopy\b[\s\S]{0,80}\bcommander\b|\bcommander\b[\s\S]{0,80}\bcopy\b/.test(lower)) {
    hints.add("707.2");
    hints.add("903.4");
  }
  if (/\bcommander tax\b|\bcast\b[\s\S]{0,80}\bcommander\b|\bcommander\b[\s\S]{0,80}\b(alternative cost|additional cost|costs?)\b/.test(lower)) {
    hints.add("601.2f");
    hints.add("903.8");
  }
  if (/\bpartner\b|\bcolor identit/.test(lower)) {
    hints.add("702.124");
    hints.add("903.4d");
  }
  if (/\b(cost|costs|casting|cast|alternative cost|additional cost|cost reducer|reducer|tax|phyrexian mana)\b/.test(lower)) {
    hints.add("601.2b");
    hints.add("601.2f");
  }
  if (/\bpay|payment|mana ability|activate mana\b/.test(lower) && /\bcost\b/.test(lower)) {
    hints.add("601.2g");
    hints.add("601.2i");
  }
  if (/\bduring cost payment\b|\bin the process of casting\b|\btap\b[\s\S]{0,80}\b(add mana|for \{[cwubrg0-9]+\})\b/.test(lower)) {
    hints.add("601.2g");
    hints.add("605.3a");
  }
  if (/\balternative cost\b/.test(lower)) {
    hints.add("118.9");
  }
  if (/\bx spell|x cost|x=|value of x\b/.test(lower)) {
    hints.add("107.3");
    hints.add("601.2b");
    hints.add("601.2f");
  }
  if (/\bphyrexian mana|life payment|pay life\b/.test(lower)) {
    hints.add("107.4");
    hints.add("601.2g");
  }
  if (/\b(layer|layers|timestamp|continuous effect|humility|characteristic-defining|cda|power|toughness|dependency|dependencies)\b/.test(lower)) {
    hints.add("613.1a");
    hints.add("613.1b");
    hints.add("613.1d");
    hints.add("613.1f");
    hints.add("613.3");
    hints.add("613.4a");
    hints.add("613.4b");
    hints.add("613.4c");
    hints.add("613.4d");
    hints.add("613.7");
    hints.add("613.8");
    hints.add("604.3");
  }
  if (/\bcontrol\b[\s\S]{0,120}\b(creatures you control|enchantment|permanent)\b|\bcreatures you control\b/.test(lower)) {
    hints.add("613.1b");
    hints.add("613.4c");
  }
  if (/\bin addition to their other types\b|\ball permanents are artifacts\b|\btype-changing\b|\ball artifacts\b/.test(lower)) {
    hints.add("613.1d");
    hints.add("608.2");
  }
  if (/\+1\/\+1 counter|\+1\/\+1 counters|\banthem\b|\bglorious anthem\b/.test(lower)) {
    hints.add("613.4c");
  }
  if (/\bdoubling season\b|\bhardened scales\b|\bpir, imaginative rascal\b|\bwalking ballista\b/.test(lower)) {
    hints.add("614.6");
    hints.add("616.1");
  }
  if (/\bsolemnity\b|\benters? without counters\b|\bwithout counters\b/.test(lower)) {
    hints.add("614.6");
    hints.add("704.5f");
  }
  if (/\blast-known|last known|\bleaves? the battlefield\b[\s\S]{0,120}\btrigger|\bdies\b[\s\S]{0,120}\bnumber of .*counters\b/.test(lower)) {
    hints.add("603.10");
  }
  if (/\bdaybound|nightbound|day\/night|becomes night|becomes day|\bit is currently day|\bit is currently night\b/.test(lower)) {
    hints.add("702.145");
    hints.add("731.2");
    hints.add("731.2a");
  }
  if (/\bleaves? the game|player leaving|player has left|\bloses the game\b/.test(lower)) {
    hints.add("800.4");
    hints.add("800.4a");
    hints.add("800.4b");
  }
  if (/\bprevention|prevent\b/.test(lower)) {
    hints.add("615.1");
    hints.add("614.6");
  }
  if (/\bself-replacing|self replacing|own effect\b/.test(lower)) {
    hints.add("614.15");
    hints.add("616.1a");
  }
  if (/\bredirect|redirection|instead\b[\s\S]{0,80}\bdamage\b/.test(lower)) {
    hints.add("614.5");
    hints.add("614.6");
    hints.add("614.9");
  }
  if (/\bworship\b|\breduces? it to 1 instead\b/.test(lower)) {
    hints.add("614.5");
    hints.add("614.6");
  }
  if (/\btoughness 0|0 toughness|base 0\/0|zero toughness\b/.test(lower)) {
    hints.add("704.5f");
  }
  if (/\bmana ability|mana abilities\b/.test(lower)) {
    hints.add("605.1");
    hints.add("605.3a");
  }
  if (/\btap a forest|\btap .* for \{[cwubrg0-9]+\}|\btap .* for mana|\btap .* lands?\b|\bmana available\b|\bstill have \{/.test(lower)) {
    hints.add("605.1");
    hints.add("605.3a");
  }
  if (/\btriggered mana ability\b/.test(lower)) {
    hints.add("605.1a");
  }
  if (/\bmana pool|empties|empty between phases|move to .* step|upkeep step|draw step|main phase\b/.test(lower)) {
    hints.add("106.4");
  }
  if (/\brestricted mana|snow mana|spend only\b/.test(lower)) {
    hints.add("107.4h");
  }
  if (/\bblocker|blockers|blocked|damage assignment|assign damage|combat damage\b/.test(lower)) {
    hints.add("509.1");
    hints.add("509.1c");
    hints.add("510.1c");
    hints.add("510.1d");
  }
  if (/\bfirst strike|double strike\b/.test(lower)) {
    hints.add("702.7b");
  }
  if (/\btrample\b/.test(lower)) {
    hints.add("702.19");
    hints.add("510.1c");
  }
  if (/\blifelink\b/.test(lower)) {
    hints.add("702.15b");
  }
  if (/\bdeathtouch\b/.test(lower)) {
    hints.add("702.2c");
  }
  if (/\bindestructible\b/.test(lower)) {
    hints.add("702.12");
    hints.add("704.5g");
  }
  if (/\bremoved from combat|remove.*from combat\b/.test(lower)) {
    hints.add("509.1");
    hints.add("510.1d");
  }
  if (/\btoken|tokens\b/.test(lower)) {
    hints.add("704.5d");
  }
  if (/\btokens? would be created|create(s|d)? .*tokens?|anointed procession|servo exhibition\b/.test(lower)) {
    hints.add("614.13");
  }
  if (/\btoken\b[\s\S]{0,80}\bcopy\b|\bcopy\b[\s\S]{0,80}\btoken\b/.test(lower)) {
    hints.add("707.2");
  }
  if (/\bkicker|kicked|evoke|evoked\b/.test(lower)) {
    hints.add("702.74");
  }
  if (/\bplaneswalker|loyalty\b/.test(lower)) {
    hints.add("606.1");
    hints.add("606.3");
    hints.add("307.1");
  }
  if (/\bonly once per turn|once per turn\b/.test(lower)) {
    hints.add("602.5");
  }
  if (/\bmodal|mode|modes|choose one|choose one or more\b/.test(lower)) {
    hints.add("601.2b");
    hints.add("700.2");
    hints.add("700.2a");
  }
  if (/\bnew target|new targets|illegal target|illegal targets\b/.test(lower)) {
    hints.add("115.6");
  }
  if (/\bas enters|as .* enters|enters choices?\b/.test(lower)) {
    hints.add("601.2b");
  }
  if (/\bcascade\b/.test(lower)) {
    hints.add("702.85a");
    hints.add("107.3");
    hints.add("704.5f");
  }
  if (/\bsuspend\b/.test(lower)) {
    hints.add("702.61");
  }
  if (/\bforetell\b/.test(lower)) {
    hints.add("702.143");
  }
  if (/\bmutate|mutating|merged permanent|merged permanents\b/.test(lower)) {
    hints.add("702.140");
    hints.add("730.3");
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
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), 20);
  const extractedCardNames = extractCardNamesForRules(query, cardNames);
  const seedText = cardSeedText(extractedCardNames);
  const queryKeywords = new Set(extractRuleKeywords(query));
  const seedKeywords = new Set(extractRuleKeywords(seedText));
  const rulesGuruPrecedents = retrieveRulesGuruPrecedents(query, extractedCardNames, {
    limit: Number(options.rulesGuruLimit) || 3,
  });
  const scores = new Map();

  for (const ruleNumber of extractRuleNumbers(query)) {
    addRuleScore(scores, ruleNumber, 100000, "exact-rule-number", byNumber);
  }

  for (const ruleNumber of [...pinnedRuleHintsFromText(query), ...pinnedRuleHintsFromText(seedText)]) {
    addRuleScore(scores, ruleNumber, 25000, "pinned-rule-hint", byNumber);
  }

  for (const precedent of rulesGuruPrecedents) {
    const amount = precedent.reasons.includes("exact-scenario") ? 120000 : 80000;
    for (const ruleNumber of precedent.requiredCitations) {
      addRuleScore(scores, ruleNumber, amount, `rulesguru-precedent:${precedent.id}`, byNumber);
    }
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
    rulesGuruPrecedents: rulesGuruPrecedents.map(precedent => ({
      id: precedent.id,
      title: precedent.title,
      score: precedent.score,
      reasons: precedent.reasons,
      requiredCitations: precedent.requiredCitations,
      cardNames: precedent.cardNames,
      expectedVerdict: precedent.expectedVerdict,
      match: precedent.match,
    })),
    confidence: ranked.length ? "high" : "low",
  };
}

export function resetRulesRetrievalForTests() {
  rulesIndex = null;
  rulesByNumber = null;
  resetRulesGuruRetrievalForTests();
}
