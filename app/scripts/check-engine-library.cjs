const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const TOOL_ROOT = path.resolve(APP_ROOT, "..");
const ENGINE_ROOT = path.join(TOOL_ROOT, "MTG ENGINE");
const JUDGE_ROOT = path.join(TOOL_ROOT, "mtg-judge");

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function sizeOf(files) {
  return files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
}

function readCrRules(crFile) {
  const raw = JSON.parse(fs.readFileSync(crFile, "utf8"));
  const rules = new Map();

  for (const [key, value] of Object.entries(raw || {})) {
    const number = String(value?.ruleNumber || value?.number || key || "").trim();
    const text = String(value?.ruleText || value?.text || "").trim();
    if (number && text) rules.set(number, text);
  }

  return rules;
}

function main() {
  const engineDocs = walk(ENGINE_ROOT, file => /\.(md|txt|docx|py|json)$/i.test(file));
  const judgeDocs = walk(JUDGE_ROOT, file => /\.(md|py|json|js)$/i.test(file));
  const coreCases = path.join(JUDGE_ROOT, "META_test_cases.md");
  const expandedCases = path.join(JUDGE_ROOT, "META_test_cases_expanded.md");
  const rulesGuruCases = path.join(JUDGE_ROOT, "META_test_cases_rulesguru.md");
  const crFile = path.join(JUDGE_ROOT, "data", "cr", "cr_current.json");
  const queryRouter = path.join(ENGINE_ROOT, "META_query_router.md");
  const layerIndex = path.join(ENGINE_ROOT, "META_layer_index.md");

  const required = [coreCases, expandedCases, rulesGuruCases, crFile, queryRouter, layerIndex];
  const missing = required.filter(file => !fs.existsSync(file));
  const requiredRules = ["101.4", "117.3b", "601.2f", "603.3b", "613.1", "614.1", "616.1", "704.5", "903.8", "903.10a"];
  const missingRules = [];

  console.log(`MTG ENGINE files: ${engineDocs.length} (${Math.round(sizeOf(engineDocs) / 1024 / 1024)} MB)`);
  console.log(`mtg-judge files: ${judgeDocs.length} (${Math.round(sizeOf(judgeDocs) / 1024 / 1024)} MB)`);
  for (const file of required) {
    console.log(`${fs.existsSync(file) ? "OK" : "MISSING"} ${path.relative(TOOL_ROOT, file)}`);
  }

  if (fs.existsSync(crFile)) {
    const rules = readCrRules(crFile);
    console.log(`CR JSON rules: ${rules.size}`);
    for (const rule of requiredRules) {
      const ok = rules.has(rule);
      if (!ok) missingRules.push(rule);
      console.log(`${ok ? "OK" : "MISSING"} CR ${rule}`);
    }
  }

  if (missing.length || missingRules.length) {
    process.exitCode = 1;
  } else {
    console.log("Local MTG engine, query router, layer index, and CR JSON look present.");
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
