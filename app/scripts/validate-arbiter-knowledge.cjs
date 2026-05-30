#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const JUDGE_ROOT = path.resolve(APP_ROOT, "..", "knowledge", "mtg-judge");
const CORE_TEST_FILE = path.resolve(JUDGE_ROOT, "META_test_cases.md");
const EXPANDED_TEST_FILE = path.resolve(JUDGE_ROOT, "META_test_cases_expanded.md");
const RULESGURU_TEST_FILE = path.resolve(JUDGE_ROOT, "META_test_cases_rulesguru.md");
const AGENTS_FILE = path.resolve(APP_ROOT, "src", "lib", "agents.js");
const DEFAULT_ENDPOINT = "http://localhost:3000/api/arbiter";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_LOCAL_ARBITER_MODEL = "qwen2.5:14b";

function parseArgs(argv) {
  const args = {
    endpoint: DEFAULT_ENDPOINT,
    fast: false,
    noCards: false,
    dryRun: false,
    liveModel: false,
    mutate: false,
    verbose: false,
    limit: 5,
    offset: 0,
    report: "",
    suite: "core",
    test: "",
    category: "",
    testFile: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--endpoint") args.endpoint = next();
    else if (arg === "--fast") args.fast = true;
    else if (arg === "--no-cards") args.noCards = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--live-model") args.liveModel = true;
    else if (arg === "--mutate") args.mutate = true;
    else if (arg === "--verbose" || arg === "-v") args.verbose = true;
    else if (arg === "--limit") args.limit = Number(next());
    else if (arg === "--all") args.limit = Infinity;
    else if (arg === "--offset") args.offset = Number(next());
    else if (arg === "--report") args.report = next();
    else if (arg === "--suite") args.suite = next().toLowerCase();
    else if (arg === "--test") args.test = next().toUpperCase();
    else if (arg === "--category") args.category = next().toUpperCase();
    else if (arg === "--test-file") args.testFile = path.resolve(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
MTG Tool Arbiter knowledge validator

Runs local knowledge-base scenarios through the app's /api/arbiter endpoint.

Usage:
  npm run validate:arbiter -- --dry-run
  npm run validate:arbiter -- --test A1 --verbose
  npm run validate:arbiter -- --category A --limit 3 --report reports/arbiter-A.md
  npm run validate:arbiter -- --all --report reports/arbiter-full.md

Options:
  --test ID          Run one test, e.g. A1 or B2.1
  --category A      Run one category
  --suite core       Run core, expanded, rulesguru, or all; default core
  --limit N         Cap the number of tests; default 5
  --all             Run every parsed test
  --offset N        Skip N tests after filtering
  --fast            Use ARBITER_PROMPT_FAST
  --no-cards        Do not inject Scryfall Oracle/rulings context
  --dry-run         Parse and list tests without API calls
  --live-model      Let /api/arbiter call the local model instead of deterministic validation mode
  --mutate          Send a paraphrase-lite version of each scenario to test retrieval generalization
  --report PATH     Write markdown report
`);
}

function readPromptConstant(name) {
  const text = fs.readFileSync(AGENTS_FILE, "utf8");
  const match = text.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`));
  if (!match) throw new Error(`Could not find ${name} in ${AGENTS_FILE}`);
  return match[1];
}

function parseTestCases(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const headerPattern = /^## ([A-Z]{1,2}\d+(?:\.\d+)?)\. (.+?)$/gm;
  const headers = [...text.matchAll(headerPattern)];
  const tests = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const id = header[1].trim();
    const title = header[2].trim();
    const category = id.match(/^[A-Z]+/)?.[0] || id[0];
    const start = header.index + header[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    let block = text.slice(start, end);
    const topBreak = block.search(/^# [A-Z]/m);
    if (topBreak >= 0) block = block.slice(0, topBreak);

    const scenario = extractBlockField(block, /\*\*Scenario:\*\*/);
    const expectedVerdict = extractBlockField(block, /\*\*Expected verdict:\*\*/);
    const citationsRaw =
      extractBlockField(block, /\*\*Required citations:\*\*/) ||
      extractBlockField(block, /\*\*Citations?:\*\*/);
    const requiredCitations = parseCitations(citationsRaw);

    if (scenario && expectedVerdict) {
      tests.push({
        id,
        category,
        title,
        scenario,
        expectedVerdict,
        requiredCitations,
        source: path.basename(filePath),
      });
    }
  }

  return tests;
}

function testFilesForArgs(args) {
  if (args.testFile) return [args.testFile];
  if (args.suite === "core") return [CORE_TEST_FILE];
  if (args.suite === "expanded") return [EXPANDED_TEST_FILE];
  if (args.suite === "rulesguru") return [RULESGURU_TEST_FILE];
  if (args.suite === "all") return [CORE_TEST_FILE, EXPANDED_TEST_FILE];
  throw new Error(`Unknown suite "${args.suite}". Use core, expanded, rulesguru, or all.`);
}

function extractBlockField(block, labelPattern) {
  const pattern = new RegExp(`${labelPattern.source}\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n---|\\n# |$)`, "i");
  const match = block.match(pattern);
  if (!match) return "";
  return match[1]
    .replace(/^\s*>\s?/gm, "")
    .trim();
}

function parseCitations(raw) {
  if (!raw) return [];
  const citations = new Set();
  for (const match of raw.matchAll(/\[(\d+(?:\.\d+[a-z]?)?)\]/g)) citations.add(match[1]);
  for (const match of raw.matchAll(/Axiom\s*(\d+)/gi)) citations.add(`Axiom-${match[1]}`);
  return [...citations];
}

function filterTests(tests, args) {
  let filtered = tests;
  if (args.category) filtered = filtered.filter(test => test.category === args.category);
  if (args.test) filtered = filtered.filter(test => test.id === args.test);
  if (args.offset > 0) filtered = filtered.slice(args.offset);
  if (Number.isFinite(args.limit)) filtered = filtered.slice(0, Math.max(0, args.limit));
  return filtered;
}

function cardNamesFromScenario(scenario) {
  return [...new Set([...scenario.matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1].trim()))];
}

function mutateScenario(scenario) {
  const cards = cardNamesFromScenario(scenario);
  const cardLine = cards.length ? `Relevant cards: ${cards.map(name => `[[${name}]]`).join(", ")}.` : "";
  const body = String(scenario || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      line &&
      !/^Cards involved:/i.test(line) &&
      !/^RulesGuru source:/i.test(line)
    )
    .join(" ")
    .replace(/\bcontrols\b/gi, "has on the battlefield")
    .replace(/\bcasts\b/gi, "plays")
    .replace(/\bcast\b/gi, "play")
    .replace(/\btargeting\b/gi, "choosing")
    .replace(/\bafter it resolves\b/gi, "once that spell finishes resolving")
    .replace(/\bafter that resolves\b/gi, "once that finishes resolving")
    .replace(/\bwhat happens to\b/gi, "what is the result for")
    .replace(/\bwhat happens\b/gi, "what is the result")
    .replace(/\bcan they\b/gi, "is it legal for that player to")
    .replace(/\bdoes ([^?]+) happen\b/gi, "will $1 happen")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.",
    cardLine,
    `Situation: ${body}`,
  ].filter(Boolean).join("\n");
}

async function fetchScryfallCard(name) {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { "User-Agent": "mtg-tool-validator/0.1" } });
  if (!response.ok) return null;
  return response.json();
}

async function fetchRulings(card) {
  if (!card?.rulings_uri) return [];
  const response = await fetch(card.rulings_uri, { headers: { "User-Agent": "mtg-tool-validator/0.1" } });
  if (!response.ok) return [];
  const data = await response.json();
  const rulings = data.data || [];
  const wotc = rulings.filter(ruling => ruling.source === "wotc");
  return (wotc.length ? wotc : rulings).slice(0, 4);
}

function oracleText(card) {
  if (card.oracle_text) return card.oracle_text;
  if (Array.isArray(card.card_faces)) {
    return card.card_faces
      .map(face => `${face.name} - ${face.type_line || ""} ${face.mana_cost || ""}\n${face.oracle_text || ""}`.trim())
      .join("\n//\n");
  }
  return "";
}

async function buildCardContext(scenario) {
  const names = cardNamesFromScenario(scenario);
  if (!names.length) return "";

  const blocks = [];
  for (const name of names) {
    const card = await fetchScryfallCard(name);
    if (!card) continue;

    const rulings = await fetchRulings(card);
    const mana = card.mana_cost || card.card_faces?.[0]?.mana_cost || "";
    const type = card.type_line || card.card_faces?.[0]?.type_line || "";
    const stats = card.power != null ? ` | ${card.power}/${card.toughness}` : "";
    let block = `[[${card.name}]] | ${mana || "-"} | ${type}${stats}\nOracle text:\n${oracleText(card)}`;

    if (rulings.length) {
      block += "\n\nWOTC rulings:\n" + rulings
        .map(ruling => `- (${ruling.published_at}) ${ruling.comment}`)
        .join("\n");
    }

    blocks.push(block);
  }

  if (!blocks.length) return "";
  return "## CARDS REFERENCED\nThese card texts and rulings are authoritative for this validation run.\n\n" +
    blocks.join("\n\n---\n\n") +
    "\n\n";
}

async function ensureEndpoint(endpoint) {
  const root = endpoint.replace(/\/api\/(anthropic|arbiter)\/?$/, "");
  try {
    const response = await fetch(root);
    if (response.status >= 200 && response.status < 500) return;
  } catch {
    // Fall through to a useful error.
  }
  throw new Error(`Local app is not responding at ${root}. Start it with "Launch MTG Tool.cmd" or ".\\start-local.ps1".`);
}

async function callAppEndpoint({ endpoint, systemPrompt, scenario, cardContext, liveModel }) {
  const userContent = `${cardContext || ""}## USER QUESTION\n\n${scenario}`;
  if (/\/api\/arbiter\/?$/.test(endpoint)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: scenario,
        cardContext,
        provider: "ollama",
        ollamaModel: process.env.OLLAMA_ARBITER_MODEL || DEFAULT_LOCAL_ARBITER_MODEL,
        fast: true,
        fastLocal: true,
        validationMode: !liveModel,
        limit: liveModel ? 5 : 20,
        max_tokens: 1600,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : data.error?.message || JSON.stringify(data.error || data);
      throw new Error(`App endpoint returned ${response.status}: ${message}`);
    }
    return {
      text: data.trace || data.content?.[0]?.text || data.error?.message || data.error || "",
      raw: data,
      retrievalMetadata: data.retrievalMetadata || null,
      status: data.status || "",
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      provider: "ollama",
      fastLocal: true,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : data.error?.message || JSON.stringify(data.error || data);
    throw new Error(`App endpoint returned ${response.status}: ${message}`);
  }
  return {
    text: data.content?.[0]?.text || data.error?.message || data.error || "",
    raw: data,
    retrievalMetadata: null,
    status: "",
  };
}

function normalizeAppResult(value) {
  if (typeof value === "string") {
    return { text: value, raw: null, retrievalMetadata: null, status: "" };
  }
  return {
    text: String(value?.text || ""),
    raw: value?.raw || null,
    retrievalMetadata: value?.retrievalMetadata || null,
    status: value?.status || "",
  };
}

function responseReferences(response) {
  const refs = new Set();
  for (const match of response.matchAll(/\[(\d+(?:\.\d+[a-z]?)?)\]/g)) refs.add(match[1]);
  for (const match of response.matchAll(/Axiom\s*(\d+)/gi)) refs.add(`Axiom-${match[1]}`);
  return refs;
}

function citationSatisfied(required, refs) {
  if (refs.has(required)) return { ok: true, match: required };
  if (required.startsWith("Axiom-")) return { ok: false, match: "" };
  for (const ref of refs) {
    if (ref.startsWith("Axiom-")) continue;
    if (required.startsWith(ref) || ref.startsWith(required)) return { ok: true, match: `${ref} (partial)` };
  }
  return { ok: false, match: "" };
}

function requiredRetrievalCitations(test) {
  const required = new Set();
  for (const citation of test.requiredCitations) {
    if (citation.startsWith("Axiom-")) continue;
    if (test.id === "A2" && citation === "616.1a") {
      // Local CR 616.1 is the general affected player/controller choice rule.
      // 616.1a is specifically self-replacement effects, so A2 should ground on 616.1.
      required.add("616.1");
    } else {
      required.add(citation);
    }
  }

  if (test.id === "A1") {
    required.add("614.6");
    required.add("700.4");
  }
  if (test.id === "A2") {
    required.add("608.2");
    required.add("614.6");
    required.add("616.1");
  }

  return [...required];
}

function requiredTraceCitations(test) {
  return test.requiredCitations
    .filter(citation => !citation.startsWith("Axiom-"))
    .map(citation => test.id === "A2" && citation === "616.1a" ? "616.1" : citation);
}

function retrievalCitationSatisfied(required, retrievedNumbers) {
  if (retrievedNumbers.has(required)) return { ok: true, match: required };
  for (const ref of retrievedNumbers) {
    if (required.startsWith(ref) || ref.startsWith(required)) return { ok: true, match: `${ref} (partial)` };
  }
  return { ok: false, match: "" };
}

function validateRetrieval(test, metadata) {
  const failures = [];
  const found = [];
  const missing = [];
  const retrievalRequired = requiredRetrievalCitations(test);

  if (!metadata) {
    return {
      failures: retrievalRequired.length ? ["Missing retrievalMetadata from Arbiter response"] : [],
      found,
      missing: retrievalRequired,
    };
  }

  const retrievedNumbers = new Set((metadata.rulesRetrieved || []).map(rule => String(rule.ruleNumber || "")));
  for (const required of retrievalRequired) {
    const result = retrievalCitationSatisfied(required, retrievedNumbers);
    if (result.ok) found.push(`${required}${result.match !== required ? ` via ${result.match}` : ""}`);
    else missing.push(required);
  }

  if (missing.length) failures.push(`Missing retrieved rules: ${missing.join(", ")}`);
  if ((metadata.hallucinations || []).length) {
    failures.push(`Hallucinated citations in Arbiter output: ${metadata.hallucinations.join(", ")}`);
  }
  if (metadata.confidence === "low" && retrievalRequired.length) {
    failures.push("Retrieval confidence is low for a scenario with required rule grounding");
  }

  return { failures, found, missing };
}

function extractVerdictText(response) {
  const match = response.match(/^VERDICT\s*\n([\s\S]*?)(?=\n[A-Z][A-Z ]+\n|$)/mi);
  return (match ? match[1] : response).trim();
}

function expectedPolarity(expected) {
  const clean = expected.trim();
  if (/^No[\s.,:]/i.test(clean)) return "no";
  if (/^Yes[\s.,:]/i.test(clean)) return "yes";
  return "";
}

function verdictMatchesPolarity(polarity, verdictText) {
  if (!polarity) return true;
  if (polarity === "yes") return /^Yes[\s.,:]/i.test(verdictText);
  return /^No[\s.,:]/i.test(verdictText) ||
    /\b(does not|do not|did not|cannot|can't|is not|are not|was not|were not)\b/i.test(verdictText);
}

function reviewWarnings(test, response) {
  const warnings = [];
  if (/\breconsider\b|\bwait\s*[—-]|actually corrected|let me (re)?do|bad example|better example/i.test(test.expectedVerdict)) {
    warnings.push("Expected verdict contains self-correction language; manually verify the knowledge-base entry.");
  }

  // Check verdict section only — RESOLUTION sections describe what Living Death's steps do,
  // not the final outcome. Checking the full response causes false positives when the model
  // correctly describes a spell's steps while still concluding nothing enters the battlefield.
  const verdictOnly = extractVerdictText(response);
  const expectedNoReturn = /\b(no creatures? to return|all graveyards are empty|does nothing)\b/i.test(test.expectedVerdict);
  const verdictReturnsCreatures =
    /\b(puts?|returns?)\b[\s\S]{0,80}\bcreatures?\b[\s\S]{0,80}\bbattlefield\b/i.test(verdictOnly) ||
    /\bcreatures?\b[\s\S]{0,80}\b(enter|enters|entered|onto the battlefield)\b/i.test(verdictOnly);
  // Also require the verdict not to contain a clear negation ("do not enter", "doesn't enter", etc.)
  const verdictNegatesEntry = /\b(do not|does not|didn't|don't|never|cannot|no creatures?)\b[\s\S]{0,50}\b(enter|return|battlefield)\b/i.test(verdictOnly);
  if (expectedNoReturn && verdictReturnsCreatures && !verdictNegatesEntry) {
    warnings.push("Expected verdict says no creatures return, but VERDICT section says creature cards enter the battlefield.");
  }

  return warnings;
}

function validateResponse(test, appResult) {
  const normalized = normalizeAppResult(appResult);
  const response = normalized.text;
  const failures = [];
  const sections = {
    state: /^STATE\b/mi.test(response),
    resolution: /^RESOLUTION\b/mi.test(response),
    ruleTrace: /^RULE TRACE\b/mi.test(response),
    verdict: /^(VERDICT|UNRESOLVED|LEGAL ACTIONS)\b/mi.test(response),
  };

  if (!sections.state) failures.push("Missing STATE section");
  if (!sections.resolution) failures.push("Missing RESOLUTION section");
  if (!sections.ruleTrace) failures.push("Missing RULE TRACE section");
  if (!sections.verdict) failures.push("Missing VERDICT/UNRESOLVED/LEGAL ACTIONS section");

  const refs = responseReferences(response);
  const found = [];
  const missing = [];
  for (const required of requiredTraceCitations(test)) {
    const result = citationSatisfied(required, refs);
    if (result.ok) found.push(`${required}${result.match !== required ? ` via ${result.match}` : ""}`);
    else missing.push(required);
  }

  if (missing.length) failures.push(`Missing required citations: ${missing.join(", ")}`);

  const retrieval = validateRetrieval(test, normalized.retrievalMetadata);
  failures.push(...retrieval.failures);

  const polarity = expectedPolarity(test.expectedVerdict);
  const verdictText = extractVerdictText(response);
  const deterministicValidation = normalized.raw?.provider === "deterministic" && /validation_mode/.test(response);
  const polarityOk = deterministicValidation || verdictMatchesPolarity(polarity, verdictText);
  if (!polarityOk) failures.push(`Verdict polarity mismatch; expected ${polarity.toUpperCase()}-style answer`);

  return {
    id: test.id,
    title: test.title,
    passed: failures.length === 0,
    failures,
    warnings: reviewWarnings(test, response),
    found,
    missing,
    retrievalFound: retrieval.found,
    retrievalMissing: retrieval.missing,
    retrievalMetadata: normalized.retrievalMetadata,
    status: normalized.status,
    sections,
    polarity,
    verdictText,
    response,
  };
}

function short(text, length = 800) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length)}\n...`;
}

function writeReport(reportPath, results, tests, options) {
  const lines = [];
  const passed = results.filter(r => r.passed).length;
  lines.push("# Arbiter Knowledge Validation Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Endpoint: \`${options.endpoint}\``);
  lines.push(`Prompt: \`${options.fast ? "ARBITER_PROMPT_FAST" : "ARBITER_PROMPT"}\``);
  lines.push(`Suite: \`${options.testFile ? options.testFile : options.suite}\``);
  lines.push(`Card context: \`${options.noCards ? "off" : "Scryfall Oracle + WOTC rulings"}\``);
  lines.push(`Mutation mode: \`${options.mutate ? "on" : "off"}\``);
  lines.push(`Result: **${passed}/${results.length} passed**`);
  lines.push("");
  lines.push("| Test | Source | Title | Result | Missing citations | Failures |");
  lines.push("|---|---|---|---|---|---|");
  for (const result of results) {
    const label = result.passed ? (result.warnings?.length ? "PASS + REVIEW" : "PASS") : "FAIL";
    const findings = [
      ...result.failures,
      ...(result.warnings || []).map(warning => `Review: ${warning}`),
    ];
    const test = tests.find(t => t.id === result.id);
    lines.push(`| ${result.id} | ${test?.source || "-"} | ${result.title.replace(/\|/g, "\\|")} | ${label} | ${result.missing.join(", ") || "-"} | ${findings.join("; ").replace(/\|/g, "\\|") || "-"} |`);
  }
  lines.push("");

  for (const result of results) {
    const test = tests.find(t => t.id === result.id);
    lines.push(`## ${result.id}. ${result.title}`);
    lines.push("");
    lines.push(`Status: **${result.passed ? "PASS" : "FAIL"}**`);
    if (result.failures.length) {
      lines.push("");
      lines.push("Failures:");
      for (const failure of result.failures) lines.push(`- ${failure}`);
    }
    if (result.warnings?.length) {
      lines.push("");
      lines.push("Review warnings:");
      for (const warning of result.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
    lines.push(options.mutate ? "Scenario sent (mutated):" : "Scenario:");
    lines.push("```text");
    lines.push(result.scenario || test.scenario);
    lines.push("```");
    lines.push("");
    lines.push("Expected verdict:");
    lines.push("```text");
    lines.push(short(test.expectedVerdict, 1200));
    lines.push("```");
    lines.push("");
    lines.push("App response:");
    lines.push("```text");
    lines.push(short(result.response, 2500));
    lines.push("```");
    lines.push("");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const testFiles = testFilesForArgs(args);
  const allTests = testFiles.flatMap(file => parseTestCases(file));
  const selectedTests = filterTests(allTests, args);

  console.log(`Parsed ${allTests.length} test cases from ${testFiles.join(", ")}`);
  console.log(`Selected ${selectedTests.length} test case(s)`);

  if (!selectedTests.length) return;

  if (args.dryRun) {
    for (const test of selectedTests) {
      console.log(`${test.id}: ${test.title} | ${test.source} | citations: ${test.requiredCitations.join(", ") || "none"}`);
    }
    return;
  }

  await ensureEndpoint(args.endpoint);
  const systemPrompt = readPromptConstant(args.fast ? "ARBITER_PROMPT_FAST" : "ARBITER_PROMPT");
  const results = [];

  for (let i = 0; i < selectedTests.length; i++) {
    const test = selectedTests[i];
    const started = Date.now();
    process.stdout.write(`[${i + 1}/${selectedTests.length}] ${test.id} ${test.title} ... `);

    try {
      const scenario = args.mutate ? mutateScenario(test.scenario) : test.scenario;
      const cardContext = args.noCards || /\/api\/arbiter\/?$/.test(args.endpoint)
        ? ""
        : await buildCardContext(scenario);
      const response = await callAppEndpoint({
        endpoint: args.endpoint,
        systemPrompt,
        scenario,
        cardContext,
        liveModel: args.liveModel,
      });
      const result = validateResponse(test, response);
      result.scenario = scenario;
      result.durationMs = Date.now() - started;
      results.push(result);
      console.log(`${result.passed ? "PASS" : "FAIL"} (${Math.round(result.durationMs / 1000)}s)`);
      if (args.verbose || !result.passed) {
        for (const failure of result.failures) console.log(`  - ${failure}`);
        if (args.verbose) console.log(short(normalizeAppResult(response).text, 1400).split("\n").map(line => `    ${line}`).join("\n"));
      }
      for (const warning of result.warnings || []) console.log(`  ! ${warning}`);
    } catch (error) {
      const result = {
        id: test.id,
        title: test.title,
        passed: false,
        failures: [`Runtime/API failure: ${error.message}`],
        found: [],
        missing: test.requiredCitations,
        sections: {},
        polarity: "",
        verdictText: "",
        response: String(error.stack || error),
        scenario: args.mutate ? mutateScenario(test.scenario) : test.scenario,
        warnings: [],
        durationMs: Date.now() - started,
      };
      results.push(result);
      console.log(`FAIL (${Math.round(result.durationMs / 1000)}s)`);
      console.log(`  - ${result.failures[0]}`);
    }
  }

  const passed = results.filter(result => result.passed).length;
  console.log("");
  console.log(`Summary: ${passed}/${results.length} passed`);

  if (args.report) {
    const reportPath = path.resolve(args.report);
    writeReport(reportPath, results, selectedTests, args);
    console.log(`Report written: ${reportPath}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
