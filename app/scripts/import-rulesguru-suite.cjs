#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const JUDGE_ROOT = path.resolve(APP_ROOT, "..", "knowledge", "mtg-judge");
const DEFAULT_OUTPUT = path.resolve(JUDGE_ROOT, "META_test_cases_rulesguru.md");
const DEFAULT_REPORT = path.resolve(APP_ROOT, "reports", "rulesguru-import.md");
const DEFAULT_COUNT = 500;
const DEFAULT_PREVIOUS_ID = 1;
const RULESGURU_ENDPOINT = "https://rulesguru.org/api/questions/";

function parseArgs(argv) {
  const args = {
    count: DEFAULT_COUNT,
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
    previousId: DEFAULT_PREVIOUS_ID,
    random: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--count") args.count = Number(next());
    else if (arg === "--output") args.output = path.resolve(next());
    else if (arg === "--report") args.report = path.resolve(next());
    else if (arg === "--previous-id") args.previousId = Number(next());
    else if (arg === "--random") args.random = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.count) || args.count < 1) throw new Error("--count must be a positive number.");
  if (!args.random && (!Number.isFinite(args.previousId) || args.previousId < 1)) {
    throw new Error("--previous-id must be a positive RulesGuru question id.");
  }

  return args;
}

function printHelp() {
  console.log(`
Import RulesGuru questions into the local Arbiter validation format.

Usage:
  npm run import:rulesguru
  npm run import:rulesguru -- --count 250 --previous-id 1
  npm run import:rulesguru -- --count 100 --random

Options:
  --count N          Number of RulesGuru questions to request; default 500
  --previous-id N    Deterministic sequential import after RulesGuru question id N; default 1
  --random           Let RulesGuru return random matching questions
  --output PATH      Markdown suite output path
  --report PATH      Import summary report path
`);
}

function rulesGuruSettings(args) {
  const settings = {
    count: args.count,
    level: ["0", "1", "2", "3", "Corner Case"],
    complexity: ["Simple", "Intermediate", "Complicated"],
    legality: "all",
    playableOnly: false,
    tags: [],
    tagsConjunc: "OR",
    rules: [],
    rulesConjunc: "OR",
    cards: [],
    cardsConjunc: "OR",
    from: "mtg-tool-local-rulesguru-import",
  };

  if (!args.random) settings.previousId = args.previousId;
  return settings;
}

async function fetchRulesGuruQuestions(args) {
  const settings = rulesGuruSettings(args);
  const url = `${RULESGURU_ENDPOINT}?json=${encodeURIComponent(JSON.stringify(settings))}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "mtg-tool-local-rulesguru-import/0.1" },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`RulesGuru returned ${response.status}: ${text.slice(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`RulesGuru returned non-JSON response: ${error.message}`);
  }

  if (!Array.isArray(data)) throw new Error("RulesGuru response was not an array.");
  return { questions: dedupeById(data), settings, url };
}

function dedupeById(questions) {
  const seen = new Set();
  const unique = [];
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    unique.push(question);
  }
  return unique;
}

function clean(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function titleFromQuestion(question) {
  const raw = clean(question.questionSimple)
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\.$/, "");
  return raw.length <= 86 ? raw : `${raw.slice(0, 83).trim()}...`;
}

function cardLine(question) {
  const names = [...new Set((question.includedCards || []).map(card => card.name).filter(Boolean))];
  if (!names.length) return "";
  return `Cards involved: ${names.map(name => `[[${name}]]`).join(", ")}.`;
}

function citedRuleNumbers(question) {
  const citations = new Set();
  const isRuleNumber = rule => /^\d{3}(?:\.\d+[a-z]?)?$/.test(rule);
  for (const key of Object.keys(question.citedRules || {})) {
    if (isRuleNumber(key)) citations.add(key);
  }
  return [...citations].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function markdownQuote(text) {
  return clean(text)
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n");
}

function renderSuite(questions, settings) {
  const lines = [];
  lines.push("# Arbiter Engine - RulesGuru Imported Suite");
  lines.push("## External verified question benchmark for local Arbiter validation");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: RulesGuru API (${RULESGURU_ENDPOINT})`);
  lines.push(`Import settings: \`${JSON.stringify(settings)}\``);
  lines.push("");
  lines.push("These cases are imported from RulesGuru for personal, non-commercial validation. RulesGuru is a question database, not a solver endpoint for arbitrary prompts; this file converts its approved questions and cited answers into the local Arbiter validation format.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# CATEGORY RG - RulesGuru Imported Questions");
  lines.push("");

  for (const question of questions) {
    const id = `RG${question.id}`;
    const cards = cardLine(question);
    const citations = citedRuleNumbers(question);
    const answer = clean(question.answerSimpleCited || question.answerSimple);
    const tags = (question.tags || []).join(", ") || "none";

    lines.push(`## ${id}. ${titleFromQuestion(question)}`);
    lines.push("");
    lines.push("**Scenario:**");
    lines.push(markdownQuote(clean([
      question.questionSimple,
      cards,
      `RulesGuru source: ${question.url || `https://rulesguru.org/?${question.id}`}`,
    ].filter(Boolean).join("\n"))));
    lines.push("");
    lines.push(`**Expected verdict:** ${answer || "RulesGuru did not provide an answer."}`);
    lines.push("");
    lines.push("**Required reasoning:**");
    lines.push(`- Match the RulesGuru cited answer for question ${question.id}.`);
    lines.push("- Identify the governing rule path before giving the final verdict.");
    lines.push("- Use the included card context only as support for the rules answer.");
    lines.push("");
    lines.push(`**Required citations:** ${citations.length ? citations.map(rule => `[${rule}]`).join(", ") : "None provided by RulesGuru."}`);
    lines.push("");
    lines.push(`**Why this test matters:** Imported RulesGuru benchmark. Level: ${question.level || "unknown"}. Complexity: ${question.complexity || "unknown"}. Tags: ${tags}.`);
    lines.push("");
  }

  return lines.join("\n");
}

function writeReport(reportPath, questions, settings, sourceUrl) {
  const byComplexity = countBy(questions, question => question.complexity || "unknown");
  const byLevel = countBy(questions, question => question.level || "unknown");
  const cited = questions.filter(question => citedRuleNumbers(question).length).length;
  const withCards = questions.filter(question => question.includedCards?.length).length;

  const lines = [];
  lines.push("# RulesGuru Import Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source request: ${sourceUrl}`);
  lines.push(`Requested count: ${settings.count}`);
  lines.push(`Imported unique questions: ${questions.length}`);
  lines.push(`Questions with cited rules: ${cited}`);
  lines.push(`Questions with included card data: ${withCards}`);
  lines.push("");
  lines.push("## By Complexity");
  for (const [key, count] of Object.entries(byComplexity)) lines.push(`- ${key}: ${count}`);
  lines.push("");
  lines.push("## By Level");
  for (const [key, count] of Object.entries(byLevel)) lines.push(`- ${key}: ${count}`);
  lines.push("");
  lines.push("## Imported IDs");
  lines.push(questions.map(question => `RG${question.id}`).join(", "));

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { questions, settings, url } = await fetchRulesGuruQuestions(args);
  const markdown = renderSuite(questions, settings);

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, markdown, "utf8");
  writeReport(args.report, questions, settings, url);

  console.log(`Imported ${questions.length}/${args.count} unique RulesGuru question(s).`);
  console.log(`Suite written: ${args.output}`);
  console.log(`Report written: ${args.report}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
