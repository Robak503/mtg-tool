export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const TOOL_ROOT = path.resolve(process.cwd(), "..");
const ENGINE_ROOT = path.join(TOOL_ROOT, "MTG ENGINE");
const JUDGE_ROOT = path.join(TOOL_ROOT, "mtg-judge");
const CR_FILE = path.join(JUDGE_ROOT, "data", "cr", "cr_current.json");
const ROUTER_FILE = path.join(ENGINE_ROOT, "META_query_router.md");
const LAYER_INDEX_FILE = path.join(ENGINE_ROOT, "META_layer_index.md");

const STOP_TERMS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "what",
  "when",
  "where",
  "from",
  "have",
  "does",
  "into",
  "can",
  "they",
  "their",
  "your",
  "you",
  "for",
  "are",
]);

const ROUTE_DEFINITIONS = [
  {
    id: "commander",
    label: "Commander format rules",
    patterns: [/\bcommander\b/, /\bcommand zone\b/, /\btax\b/, /\bpartner\b/, /\bcolor identity\b/],
    ruleAnchors: ["903.8", "903.9", "903.9a", "903.9b", "903.10a"],
    docHints: ["L10_Variant_903", "L05_StateEnforcement_704", "L06_PlayerAction_118to121"],
  },
  {
    id: "priority",
    label: "Priority and APNAP",
    patterns: [/\bpriority\b/, /\bapnap\b/, /\bactive player\b/, /\brespond\b/, /\bpass priority\b/],
    ruleAnchors: ["101.4", "117.3b", "117.4", "117.5"],
    docHints: ["L06_PlayerAction_117", "L09_Constraint_100to104", "L10_Variant_800to811"],
  },
  {
    id: "casting",
    label: "Casting, costs, and legality",
    patterns: [/\bcast\b/, /\bcasting\b/, /\bspell\b/, /\badditional cost\b/, /\balternative cost\b/, /\bcost reducer\b/, /\bcost increase\b/, /\bflash\b/],
    ruleAnchors: ["601.2", "601.2b", "601.2f", "601.2g", "601.2i", "601.3", "118.9"],
    docHints: ["L06_PlayerAction_601_seg1", "L06_PlayerAction_601_seg2", "L06_PlayerAction_118to121"],
  },
  {
    id: "activation",
    label: "Activated and mana abilities",
    patterns: [/\bactivate\b/, /\bactivated ability\b/, /\bmana ability\b/, /\bloyalty ability\b/, /\btap ability\b/],
    ruleAnchors: ["602.1", "602.2", "602.5", "605.1", "605.3", "606.3"],
    docHints: ["L06_PlayerAction_601_seg2", "L06_PlayerAction_600to606", "L06_PlayerAction_106"],
  },
  {
    id: "targets",
    label: "Targets, legality, and protection",
    patterns: [/\btarget\b/, /\blegal target\b/, /\billegal target\b/, /\bhexproof\b/, /\bshroud\b/, /\bprotection\b/],
    ruleAnchors: ["115.1", "115.6", "608.2b", "702"],
    docHints: ["L06_PlayerAction_114to115", "L06_PlayerAction_608", "L07_ObjectModel_702"],
  },
  {
    id: "triggers",
    label: "Triggered abilities",
    patterns: [/\btrigger\b/, /\btriggered\b/, /\betb\b/, /\benter(s|ed)? the battlefield\b/, /\bdies\b/, /\bdied\b/, /\bleaves? the battlefield\b/, /\bupkeep\b/],
    ruleAnchors: ["603.1", "603.2", "603.3", "603.3b", "603.6", "603.6c", "700.4"],
    docHints: ["L04_Trigger_engine", "L04_Trigger_603", "L07_ObjectModel_700"],
  },
  {
    id: "sba",
    label: "State-based actions",
    patterns: [/\bstate[- ]based\b/, /\bsba\b/, /\blethal damage\b/, /\b0 toughness\b/, /\blegend rule\b/, /\bpoison counter\b/],
    ruleAnchors: ["704.3", "704.4", "704.5", "704.5a", "704.5f", "704.5j", "704.6"],
    docHints: ["L05_StateEnforcement_704", "L00_Orchestration_game_engine"],
  },
  {
    id: "replacement",
    label: "Replacement and prevention effects",
    patterns: [/\breplacement\b/, /\breplaces\b/, /\breplaced\b/, /\bprevention\b/, /\binstead\b/, /\bwould\b/, /\breplace\b/, /\bprevent\b/],
    ruleAnchors: ["614.1", "614.6", "615.1", "616.1"],
    docHints: ["L03_Event_614to616", "L00_Orchestration_game_engine"],
  },
  {
    id: "layers",
    label: "Continuous effects and layers",
    patterns: [/\blayer\b/, /\blayers\b/, /\bcontinuous effect\b/, /\btimestamp\b/, /\bdependency\b/, /\bpower\/toughness\b/, /\bloses all abilities\b/],
    ruleAnchors: ["611.1", "613.1", "613.2", "613.3", "613.6", "613.7"],
    docHints: ["L08_ContinuousEffects_611to613", "L08_ContinuousEffects_604", "L00_Orchestration_state_assessor"],
  },
  {
    id: "copy",
    label: "Copy effects and object identity",
    patterns: [/\bcopy\b/, /\bcopies\b/, /\bcopied\b/, /\bcopiable\b/, /\bclone\b/, /\bnew object\b/, /\blast known\b/, /\blki\b/],
    ruleAnchors: ["400.7", "607.1", "707.2", "707.10", "707.12"],
    docHints: ["L07_ObjectModel_707", "L07_ObjectModel_400to408", "L07_ObjectModel_607", "L07_ObjectModel_108to113"],
  },
  {
    id: "zones",
    label: "Zones and zone changes",
    patterns: [/\bgraveyard\b/, /\bexile\b/, /\blibrary\b/, /\bhand\b/, /\bbattlefield\b/, /\bzone\b/, /\bzone change\b/],
    ruleAnchors: ["400.1", "400.7", "406.3", "700.4"],
    docHints: ["L07_ObjectModel_400to408", "L07_ObjectModel_700", "L04_Trigger_603"],
  },
  {
    id: "combat_damage",
    label: "Combat damage and damage rules",
    patterns: [/\bcombat\b/, /\bcombat damage\b/, /\bdamage\b/, /\bfirst strike\b/, /\bdouble strike\b/, /\bdeathtouch\b/, /\blifelink\b/, /\btrample\b/],
    ruleAnchors: ["120.1", "120.3", "510.1", "510.4", "702"],
    docHints: ["L02_Time_500to514", "L06_PlayerAction_118to121", "L07_ObjectModel_702"],
  },
  {
    id: "turn",
    label: "Turn structure",
    patterns: [/\buntap\b/, /\bupkeep\b/, /\bdraw step\b/, /\bmain phase\b/, /\bcombat phase\b/, /\bend step\b/, /\bcleanup\b/, /\bend the turn\b/],
    ruleAnchors: ["500.1", "502.1", "503.1", "504.1", "505.1", "506.1", "513.1", "514.1", "723.1"],
    docHints: ["L02_Time_500to514", "L02_Time_703", "L06_PlayerAction_723"],
  },
  {
    id: "keywords",
    label: "Keyword abilities and actions",
    patterns: [/\bkeyword\b/, /\bflying\b/, /\bmenace\b/, /\bvigilance\b/, /\bhaste\b/, /\bequip\b/, /\bcascade\b/, /\bflashback\b/, /\bkicker\b/, /\bforetell\b/, /\bplot\b/, /\bdiscover\b/],
    ruleAnchors: ["701", "702"],
    docHints: ["L06_PlayerAction_701", "L07_ObjectModel_702"],
  },
  {
    id: "loops",
    label: "Loops, shortcuts, and illegal actions",
    patterns: [/\bloop\b/, /\binfinite\b/, /\bshortcut\b/, /\bdraw the game\b/, /\billegal action\b/, /\brewind\b/],
    ruleAnchors: ["727", "731.1", "732.1"],
    docHints: ["L10_Variant_724to730", "L09_Constraint_731to732", "L09_Constraint_t"],
  },
];

let docsCache = null;
let crCache = null;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query) {
  const terms = normalize(query)
    .split(" ")
    .filter(term => term.length > 2 && !STOP_TERMS.has(term));
  return [...new Set(terms)];
}

function splitChunks(text, max = 1600) {
  const paragraphs = String(text || "").split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const clean = paragraph.trim();
    if (!clean) continue;
    if ((current + "\n\n" + clean).length > max && current) {
      chunks.push(current);
      current = clean;
    } else {
      current = current ? `${current}\n\n${clean}` : clean;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function walk(dir, includeFile) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      files.push(...await walk(full, includeFile));
    } else if (includeFile(full)) {
      files.push(full);
    }
  }

  return files;
}

function isJudgeContextFile(file) {
  const name = path.basename(file);
  return [
    "META_test_cases.md",
    "META_test_cases_expanded.md",
    "META_test_cases_rulesguru.md",
    "META_test_suite_coverage.md",
    "cite_audit.md",
    "cite_audit_v2.md",
  ].includes(name);
}

async function loadDocs() {
  if (docsCache) return docsCache;

  const engineFiles = await walk(ENGINE_ROOT, file =>
    file.endsWith(".md") || file.endsWith(".txt")
  );
  const judgeFiles = await walk(JUDGE_ROOT, isJudgeContextFile);

  const docs = [];
  for (const file of [...engineFiles, ...judgeFiles]) {
    const text = await fs.readFile(file, "utf8");
    const root = file.startsWith(ENGINE_ROOT) ? "MTG ENGINE" : "mtg-judge";
    const relative = path.relative(root === "MTG ENGINE" ? ENGINE_ROOT : JUDGE_ROOT, file);
    const title = `${root}/${relative.replace(/\\/g, "/")}`;
    const fileName = path.basename(file);
    splitChunks(text).forEach((chunk, index) => {
      docs.push({
        id: `${title}#${index + 1}`,
        title,
        fileName,
        root,
        chunk,
        isRouter: file === ROUTER_FILE,
        isLayerIndex: file === LAYER_INDEX_FILE,
        isJudgeTest: root === "mtg-judge",
        normalizedTitle: normalize(title),
        normalized: normalize(`${title}\n${chunk}`),
      });
    });
  }

  docsCache = {
    generatedAt: new Date().toISOString(),
    engineFileCount: engineFiles.length,
    judgeFileCount: judgeFiles.length,
    chunkCount: docs.length,
    docs,
  };

  return docsCache;
}

function ruleRecord(raw, fallbackNumber) {
  const number = String(raw?.ruleNumber || raw?.number || fallbackNumber || "").trim();
  const text = String(raw?.ruleText || raw?.text || "").trim();
  if (!number || !text) return null;
  return {
    number,
    text,
    examples: raw?.examples || null,
  };
}

function compareRuleNumbers(a, b) {
  const tokenize = value => String(value)
    .match(/\d+|[a-z]+/gi)
    ?.map(part => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase())) || [];
  const left = tokenize(a);
  const right = tokenize(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    if (typeof left[index] === "number" && typeof right[index] === "number") {
      return left[index] - right[index];
    }
    return String(left[index]).localeCompare(String(right[index]));
  }
  return 0;
}

async function loadCr() {
  if (crCache) return crCache;

  const [raw, stat] = await Promise.all([
    fs.readFile(CR_FILE, "utf8"),
    fs.stat(CR_FILE),
  ]);
  const parsed = JSON.parse(raw);
  const byNumber = new Map();

  for (const [key, value] of Object.entries(parsed || {})) {
    const rule = ruleRecord(value, key);
    if (rule) byNumber.set(rule.number, rule);
  }

  const rules = [...byNumber.values()].sort((left, right) => compareRuleNumbers(left.number, right.number));
  crCache = {
    loadedAt: new Date().toISOString(),
    updatedAt: stat.mtime.toISOString(),
    ruleCount: rules.length,
    byNumber,
    rules,
  };

  return crCache;
}

function extractExplicitRuleNumbers(query) {
  return [...new Set(
    [...String(query || "").matchAll(/\b\d{3}(?:\.\d+[a-z]?)?\b/g)]
      .map(match => match[0])
  )];
}

function inferRoutes(query) {
  const text = normalize(query);
  const matches = [];

  for (const route of ROUTE_DEFINITIONS) {
    const score = route.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    if (score > 0) matches.push({ ...route, score });
  }

  return matches.sort((left, right) => right.score - left.score).slice(0, 5);
}

function routeHints(query) {
  const routes = inferRoutes(query);
  const explicitRules = extractExplicitRuleNumbers(query);
  const docHints = [...new Set(routes.flatMap(route => route.docHints))];
  const ruleAnchors = [...new Set([...explicitRules, ...routes.flatMap(route => route.ruleAnchors)])];

  return {
    routes,
    explicitRules,
    docHints,
    ruleAnchors,
  };
}

function relatedRules(cr, anchor, max = 6) {
  const found = [];
  const add = rule => {
    if (rule && !found.some(existing => existing.number === rule.number)) found.push(rule);
  };

  const exact = cr.byNumber.get(anchor);
  add(exact);

  const childPrefix = `${anchor}.`;
  for (const rule of cr.rules) {
    if (found.length >= max) break;
    if (rule.number !== anchor && rule.number.startsWith(childPrefix)) add(rule);
  }

  if (!exact && anchor.includes(".")) {
    const parent = anchor.replace(/\.[^.]+$/, "");
    add(cr.byNumber.get(parent));
  }

  return found.slice(0, max);
}

function collectRules(cr, route, max = 18) {
  const collected = [];
  const addRules = (rules, score, source) => {
    for (const rule of rules) {
      if (collected.some(existing => existing.number === rule.number)) continue;
      collected.push({ ...rule, score, source, order: collected.length });
      if (collected.length >= max) return;
    }
  };

  for (const anchor of route.explicitRules) {
    addRules(relatedRules(cr, anchor, 10), 40, "explicit");
    if (collected.length >= max) break;
  }

  if (collected.length < max) {
    for (const anchor of route.ruleAnchors) {
      const perAnchorLimit = anchor.includes(".") ? 4 : 6;
      addRules(relatedRules(cr, anchor, perAnchorLimit), 25, "route");
      if (collected.length >= max) break;
    }
  }

  return collected.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.order - right.order;
  });
}

function wantsValidationDocs(query) {
  return /\b(test|tests|scenario|scenarios|rulesguru|suite|coverage|benchmark|validation|validate|case|cases)\b/i.test(query);
}

function scoreDoc(doc, terms, route, rules, includeValidationDocs) {
  let score = 0;

  if (doc.root === "MTG ENGINE") score += 3;
  if (doc.isRouter && route.routes.length) score += 8;
  if (doc.isLayerIndex && route.routes.length) score += 5;
  if (/_t\.md$/i.test(doc.fileName)) score += 4;
  if (/_v\.md$/i.test(doc.fileName) && rules.length) score -= 3;

  for (const term of terms) {
    if (doc.normalized.includes(term)) score += term.includes(".") ? 5 : 1;
    if (doc.normalizedTitle.includes(term)) score += 4;
  }

  route.routes.forEach((matchedRoute, routeIndex) => {
    const primaryRouteBoost = routeIndex === 0 ? 36 : Math.max(0, 14 - routeIndex * 4);
    const routeBoost = 20 + matchedRoute.score * 8 + primaryRouteBoost;
    matchedRoute.docHints.forEach((hint, hintIndex) => {
      const primaryHintBoost = hintIndex === 0 ? 30 : Math.max(0, 12 - hintIndex * 4);
      const hintBoost = routeBoost + primaryHintBoost;
      const normalizedHint = normalize(hint);
      if (doc.normalizedTitle.includes(normalizedHint)) score += hintBoost;
      else if (doc.normalized.includes(normalizedHint)) score += Math.max(6, Math.floor(hintBoost / 3));
    });
  });

  for (const rule of rules) {
    const number = normalize(rule.number);
    const broad = number.split(".")[0];
    if (doc.normalizedTitle.includes(number)) score += 18;
    if (doc.normalized.includes(number)) score += 6;
    if (broad && doc.normalizedTitle.includes(broad)) score += 2;
  }

  for (const matchedRoute of route.routes) {
    if (doc.normalized.includes(normalize(matchedRoute.label))) score += 4;
  }

  return score;
}

function selectResults(scoredDocs, limit, includeValidationDocs, route) {
  const sorted = scoredDocs
    .filter(doc => doc.score > 0 && (includeValidationDocs || !doc.isJudgeTest))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const perTitle = new Map();
  const addDoc = doc => {
    if (!doc || selected.includes(doc)) return false;
    const count = perTitle.get(doc.title) || 0;
    if (count >= 2) return false;
    selected.push(doc);
    perTitle.set(doc.title, count + 1);
    return true;
  };

  // Reserve a little room for the router's primary layer files, even when
  // nearby cross-references have more matching words.
  for (const matchedRoute of route.routes.slice(0, 3)) {
    const primaryHint = matchedRoute.docHints[0];
    if (!primaryHint) continue;
    const normalizedHint = normalize(primaryHint);
    const primaryDoc = sorted.find(doc =>
      doc.normalizedTitle.includes(normalizedHint) && /_t\.md$/i.test(doc.fileName)
    ) || sorted.find(doc => doc.normalizedTitle.includes(normalizedHint));
    addDoc(primaryDoc);
    if (selected.length >= Math.ceil(limit / 2)) break;
  }

  for (const doc of sorted) {
    addDoc(doc);
    if (selected.length >= limit) break;
  }

  if (selected.length < limit && includeValidationDocs) {
    for (const doc of sorted) {
      addDoc(doc);
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit);
}

function summarizeRoute(route) {
  return {
    matchedRoutes: route.routes.map(match => ({
      id: match.id,
      label: match.label,
      score: match.score,
    })),
    explicitRules: route.explicitRules,
    ruleAnchors: route.ruleAnchors,
    docHints: route.docHints,
  };
}

function formatRulesContext(rules) {
  if (!rules.length) return [];

  const lines = [
    "## DIRECT COMPREHENSIVE RULES LOOKUP",
    `Source: ${path.relative(TOOL_ROOT, CR_FILE).replace(/\\/g, "/")}`,
    "These are exact local CR entries selected by rule-number lookup and query routing.",
  ];

  for (const rule of rules) {
    lines.push("");
    lines.push(`### CR ${rule.number}`);
    lines.push(rule.text);
    if (Array.isArray(rule.examples) && rule.examples.length) {
      lines.push(`Example: ${String(rule.examples[0]).trim()}`);
    } else if (typeof rule.examples === "string" && rule.examples.trim()) {
      lines.push(`Example: ${rule.examples.trim()}`);
    }
  }

  return lines;
}

function formatContext(results, rules, route) {
  if (!results.length && !rules.length) return "";

  const routeLabels = route.routes.map(match => match.label).join(", ");
  const lines = [
    "## LOCAL MTG ENGINE / JUDGE CONTEXT",
    "Retrieved from the local MTG ENGINE layer docs, query router, and mtg-judge CR JSON. Treat direct CR entries as the rule-text source of truth, then use layer snippets for execution order and edge cases.",
  ];

  if (routeLabels) {
    lines.push(`Routes: ${routeLabels}`);
  }

  lines.push(...formatRulesContext(rules));

  if (results.length) {
    lines.push("");
    lines.push("## ROUTED ENGINE LAYER SNIPPETS");
    results.forEach((result, index) => {
      lines.push("");
      lines.push(`### ${index + 1}. ${result.title}`);
      lines.push(result.chunk);
    });
  }

  lines.push("");
  return lines.join("\n");
}

export async function GET() {
  try {
    const [docs, cr] = await Promise.all([loadDocs(), loadCr()]);
    return Response.json({
      generatedAt: docs.generatedAt,
      engineFileCount: docs.engineFileCount,
      judgeFileCount: docs.judgeFileCount,
      chunkCount: docs.chunkCount,
      crRuleCount: cr.ruleCount,
      crUpdatedAt: cr.updatedAt,
      engineRoot: ENGINE_ROOT,
      judgeRoot: JUDGE_ROOT,
      crFile: CR_FILE,
      queryRouter: ROUTER_FILE,
      layerIndex: LAYER_INDEX_FILE,
      routeCount: ROUTE_DEFINITIONS.length,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not load local MTG engine docs." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const query = String(body.query || "").trim();
    if (!query) return Response.json({ results: [], rules: [], context: "" });

    const [docs, cr] = await Promise.all([loadDocs(), loadCr()]);
    const terms = queryTerms(query);
    const limit = Math.max(1, Math.min(Number(body.limit) || 4, 8));
    const route = routeHints(query);
    const rules = collectRules(cr, route);
    const includeValidationDocs = wantsValidationDocs(query);

    const scoredDocs = docs.docs
      .map(doc => ({ ...doc, score: scoreDoc(doc, terms, route, rules, includeValidationDocs) }))
      .filter(doc => doc.score > 0);
    const results = selectResults(scoredDocs, limit, includeValidationDocs, route)
      .map(({ title, chunk, score }) => ({ title, chunk, score }));

    return Response.json({
      route: summarizeRoute(route),
      rules: rules.map(rule => ({
        number: rule.number,
        text: rule.text,
        source: rule.source,
        score: rule.score,
      })),
      results,
      context: formatContext(results, rules, route),
      stats: {
        engineFileCount: docs.engineFileCount,
        judgeFileCount: docs.judgeFileCount,
        chunkCount: docs.chunkCount,
        crRuleCount: cr.ruleCount,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not search local MTG engine docs." }, { status: 500 });
  }
}
