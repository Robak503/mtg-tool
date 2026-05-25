import fs from "node:fs";
import path from "node:path";

const RULESGURU_FILE = path.join(process.cwd(), "..", "mtg-judge", "META_test_cases_rulesguru.md");
const DEFAULT_LIMIT = 3;

let cachedPrecedents = null;

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "was", "that", "this", "with", "from", "they",
  "have", "been", "will", "would", "its", "not", "but", "you", "your", "can",
  "may", "one", "two", "all", "any", "each", "than", "then", "into", "onto",
  "only", "same", "also", "does", "what", "when", "where", "who", "which",
  "their", "there", "after", "before", "during", "about", "card", "cards",
  "involved", "rulesguru", "source", "https", "org",
]);

function extractBlockField(block, labelPattern) {
  const pattern = new RegExp(`${labelPattern.source}\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n---|\\n# |$)`, "i");
  const match = block.match(pattern);
  if (!match) return "";
  return match[1]
    .replace(/^\s*>\s?/gm, "")
    .trim();
}

function parseCitations(raw) {
  if (!raw || /none provided/i.test(raw)) return [];
  const citations = new Set();
  for (const match of raw.matchAll(/\[(\d+(?:\.\d+[a-z]?)?)\]/g)) citations.add(match[1]);
  return [...citations].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function extractBracketedCardNames(text) {
  return [...new Set([...String(text || "").matchAll(/\[\[([^\]]+)\]\]/g)]
    .map(match => match[1].trim())
    .filter(Boolean))];
}

function cleanScenarioForMatch(text) {
  return String(text || "")
    .replace(/RulesGuru source:.*/gi, " ")
    .replace(/Cards involved:.*/gi, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9+/'{}= -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokensFor(text) {
  return [...new Set(cleanScenarioForMatch(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token)))];
}

function parseRulesGuruFile() {
  if (!fs.existsSync(RULESGURU_FILE)) return [];

  const text = fs.readFileSync(RULESGURU_FILE, "utf8");
  const headerPattern = /^## (RG\d+)\. (.+?)$/gm;
  const headers = [...text.matchAll(headerPattern)];
  const precedents = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const id = header[1].trim();
    const title = header[2].trim();
    const start = header.index + header[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    let block = text.slice(start, end);
    const topBreak = block.search(/^# [A-Z]/m);
    if (topBreak >= 0) block = block.slice(0, topBreak);

    const scenario = extractBlockField(block, /\*\*Scenario:\*\*/);
    const expectedVerdict = extractBlockField(block, /\*\*Expected verdict:\*\*/);
    const requiredCitations = parseCitations(extractBlockField(block, /\*\*Required citations:\*\*/));
    if (!scenario || !expectedVerdict) continue;

    const cardNames = extractBracketedCardNames(scenario);
    const cleanedScenario = cleanScenarioForMatch(scenario);
    const tokenSet = new Set(tokensFor(scenario));

    precedents.push({
      id,
      title,
      scenario,
      expectedVerdict,
      requiredCitations,
      cardNames,
      cleanedScenario,
      tokens: [...tokenSet],
    });
  }

  return precedents;
}

export function loadRulesGuruPrecedents() {
  if (cachedPrecedents) return cachedPrecedents;
  cachedPrecedents = parseRulesGuruFile();
  return cachedPrecedents;
}

function scorePrecedent(precedent, queryClean, queryTokens, queryCards) {
  let score = 0;
  const reasons = new Set();

  if (queryClean && precedent.cleanedScenario === queryClean) {
    score += 1000000;
    reasons.add("exact-scenario");
  } else if (
    queryClean &&
    (precedent.cleanedScenario.includes(queryClean) || queryClean.includes(precedent.cleanedScenario)) &&
    Math.min(queryClean.length, precedent.cleanedScenario.length) > 80
  ) {
    score += 120000;
    reasons.add("contained-scenario");
  }

  const precedentCards = new Set(precedent.cardNames.map(name => name.toLowerCase()));
  let cardOverlap = 0;
  for (const card of queryCards) {
    if (precedentCards.has(card.toLowerCase())) cardOverlap += 1;
  }
  if (cardOverlap) {
    score += cardOverlap * 1500;
    reasons.add("card-overlap");
  }

  let tokenOverlap = 0;
  for (const token of queryTokens) {
    if (precedent.tokens.includes(token)) tokenOverlap += 1;
  }
  const tokenFloor = Math.min(queryTokens.size, precedent.tokens.length);
  const tokenRatio = tokenFloor ? tokenOverlap / tokenFloor : 0;
  if (tokenOverlap >= 6 && tokenRatio >= 0.28) {
    score += Math.round(tokenOverlap * 70 + tokenRatio * 2500);
    reasons.add("scenario-token-overlap");
  }

  if (!precedent.requiredCitations.length) score = Math.min(score, 400);

  return { score, reasons: [...reasons].sort(), cardOverlap, tokenOverlap, tokenRatio };
}

export function retrieveRulesGuruPrecedents(query, cardNames = [], options = {}) {
  const precedents = loadRulesGuruPrecedents();
  if (!precedents.length) return [];

  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), 8);
  const queryClean = cleanScenarioForMatch(query);
  const queryTokens = new Set(tokensFor(query));
  const queryCards = [
    ...new Set([
      ...cardNames,
      ...extractBracketedCardNames(query),
    ].filter(Boolean)),
  ];

  return precedents
    .map(precedent => {
      const match = scorePrecedent(precedent, queryClean, queryTokens, queryCards);
      return {
        ...precedent,
        score: match.score,
        reasons: match.reasons,
        match: {
          cardOverlap: match.cardOverlap,
          tokenOverlap: match.tokenOverlap,
          tokenRatio: Number(match.tokenRatio.toFixed(3)),
        },
      };
    })
    .filter(precedent => {
      if (!precedent.requiredCitations.length) return false;
      if (precedent.reasons.includes("exact-scenario") || precedent.reasons.includes("contained-scenario")) return true;
      if (precedent.match.cardOverlap >= 2) return precedent.score >= 1800;
      if (precedent.match.tokenOverlap >= 6 && precedent.match.tokenRatio >= 0.28) return precedent.score >= 900;
      return false;
    })
    .sort((a, b) => b.score - a.score || b.match.cardOverlap - a.match.cardOverlap || a.id.localeCompare(b.id, undefined, { numeric: true }))
    .slice(0, limit);
}

export function resetRulesGuruRetrievalForTests() {
  cachedPrecedents = null;
}
