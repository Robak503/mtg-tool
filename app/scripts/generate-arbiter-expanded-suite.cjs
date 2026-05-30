#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const TOOL_ROOT = path.resolve(APP_ROOT, "..");
const CR_FILE = path.resolve(TOOL_ROOT, "knowledge", "mtg-judge", "data", "cr", "cr_current.json");
const OUT_FILE = path.resolve(TOOL_ROOT, "knowledge", "mtg-judge", "META_test_cases_expanded.md");
const TARGET_PER_CATEGORY = 53;
const CORE_PER_CATEGORY = 34;

const CATEGORIES = {
  S: {
    title: "Core Rules, Mana, Costs, Life, Damage, Counters",
    docs: [
      "L09_Constraint_100to104_v/t.md",
      "L06_PlayerAction_106_v/t.md",
      "L06_PlayerAction_118to121_v/t.md",
      "L07_ObjectModel_122to123_v/t.md",
    ],
    ranges: [[100, 123]],
  },
  T: {
    title: "Turn Structure, Priority, and Timing Windows",
    docs: [
      "L02_Time_500to514_v/t.md",
      "L02_Time_703_v/t.md",
      "L06_PlayerAction_117_v/t.md",
      "L00_Orchestration_game_engine.md",
    ],
    ranges: [[500, 514], [703, 703], [117, 117]],
  },
  U: {
    title: "Casting, Activation, Targets, Mana Abilities, Resolution",
    docs: [
      "L06_PlayerAction_114to115_v/t.md",
      "L06_PlayerAction_116_v/t.md",
      "L06_PlayerAction_600to606_v/t.md",
      "L06_PlayerAction_601_seg1/2_v/t.md",
      "L06_PlayerAction_608_v/t.md",
    ],
    ranges: [[114, 116], [600, 602], [605, 606], [608, 608]],
  },
  V: {
    title: "Triggered Abilities and State-Based Actions",
    docs: [
      "L04_Trigger_603_seg1/2/3_v/t.md",
      "L04_Trigger_engine.md",
      "L05_StateEnforcement_704_v/t.md",
    ],
    ranges: [[603, 603], [704, 704]],
  },
  W: {
    title: "Events, Effects, Replacement, Prevention, Layers",
    docs: [
      "L03_Event_609to610_v/t.md",
      "L03_Event_614to616_v/t.md",
      "L08_ContinuousEffects_604_v/t.md",
      "L08_ContinuousEffects_611to613_v/t.md",
    ],
    ranges: [[609, 616], [604, 604], [611, 613]],
  },
  X: {
    title: "Object Model, Zones, Copies, Linked Abilities, Merged Permanents",
    docs: [
      "L07_ObjectModel_200to213_v/t.md",
      "L07_ObjectModel_300to315_v/t.md",
      "L07_ObjectModel_400to408_v/t.md",
      "L07_ObjectModel_607_v/t.md",
      "L07_ObjectModel_707to729_v/t.md",
    ],
    ranges: [[200, 213], [300, 315], [400, 408], [607, 607], [707, 721], [729, 729]],
  },
  Y: {
    title: "Keyword Actions and Keyword Abilities",
    docs: [
      "L06_PlayerAction_701_v.md",
      "L07_ObjectModel_700_v/t.md",
      "L07_ObjectModel_702_v/t.md",
      "L06_PlayerAction_705to706_v/t.md",
    ],
    ranges: [[700, 702], [705, 706]],
  },
  Z: {
    title: "Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules",
    docs: [
      "L09_Constraint_731to732_v.md",
      "L10_Variant_724to730_v/t.md",
      "L10_Variant_800to811_v/t.md",
      "L10_Variant_900to905_v/t.md",
      "L10_Variant_903_v/t.md",
    ],
    ranges: [[724, 730], [731, 732], [800, 811], [900, 905]],
  },
};

const EDGE_TERMS = [
  "can't", "instead", "replacement", "prevent", "priority", "stack",
  "trigger", "state-based", "commander", "copy", "token", "target", "illegal",
  "zone", "exile", "graveyard", "hand", "library", "face down", "merged",
  "mutate", "attached", "aura", "equipment", "counter", "damage", "life",
  "mana", "cost", "additional", "alternative", "simultaneously", "APNAP",
  "choose", "may", "if", "unless", "until", "end of turn", "cleanup",
  "untap", "combat", "blocked", "attacking", "defending", "turn-based",
  "loses the game", "leaves the game", "shortcut", "loop",
];

function main() {
  const cr = JSON.parse(fs.readFileSync(CR_FILE, "utf8"));
  const rules = Object.values(cr)
    .filter(rule => rule && rule.ruleNumber && rule.ruleText)
    .filter(rule => usefulRule(rule))
    .map(rule => ({
      number: rule.ruleNumber,
      text: clean(rule.ruleText),
      examples: Array.isArray(rule.examples) ? rule.examples.map(clean).filter(Boolean) : [],
    }));

  const lines = [
    "# Arbiter Engine - Expanded Knowledge Suite",
    "## Generated rule-anchor scenarios for broad engine coverage",
    "## Target: 424 expansion cases + 76 core cases = 500 total cases",
    "",
    "Generated from local CR JSON and connected to the MTG ENGINE layer docs.",
    "These are broad coverage tests, not replacements for the handcrafted core boss-fight scenarios in META_test_cases.md.",
    "",
  ];

  let total = 0;
  for (const [category, config] of Object.entries(CATEGORIES)) {
    const selected = selectRulesForCategory(rules, config).slice(0, TARGET_PER_CATEGORY);
    if (selected.length < TARGET_PER_CATEGORY) {
      throw new Error(`Category ${category} only has ${selected.length} usable rules`);
    }

    lines.push(`---`);
    lines.push("");
    lines.push(`# CATEGORY ${category} - ${config.title}`);
    lines.push("");
    lines.push("**Connected docs:**");
    for (const doc of config.docs) lines.push(`- \`${doc}\``);
    lines.push("");

    selected.forEach((rule, index) => {
      total += 1;
      const id = `${category}${index + 1}`;
      lines.push(`## ${id}. Rule ${rule.number} anchor - ${titleFor(rule)}`);
      lines.push("");
      lines.push(`**Track:** ${rule.track || "Coverage"}.`);
      lines.push("");
      lines.push("**Scenario:**");
      lines.push(`> ${scenarioFor(rule, config.title)}`);
      lines.push("");
      lines.push(`**Expected verdict:** ${expectedFor(rule)}`);
      lines.push("");
      lines.push("**Required reasoning:**");
      lines.push(`- Identify the governing rule as [${rule.number}].`);
      lines.push("- Route the question through the relevant engine layer before giving priority or a final ruling.");
      lines.push("- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.");
      lines.push("");
      lines.push(`**Required citations:** \`[${rule.number}]\`.`);
      lines.push("");
      lines.push(`**Why this test matters:** Broad coverage anchor for ${config.title}. Source docs: ${config.docs.join(", ")}.`);
      lines.push("");
    });
  }

  lines.push("---");
  lines.push("");
  lines.push("# SUITE SUMMARY");
  lines.push("");
  lines.push(`Generated expansion cases: ${total}.`);
  lines.push("Combined with the 76 core cases, the Arbiter suite has 500 total cases.");
  lines.push("");

  fs.writeFileSync(OUT_FILE, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${total} expanded Arbiter cases to ${OUT_FILE}`);
}

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/`/g, "'")
    .trim();
}

function usefulRule(rule) {
  const text = clean(rule.ruleText);
  if (text.length < 45 && (!rule.examples || rule.examples.length === 0)) return false;
  if (/^[A-Z][A-Za-z -]+$/.test(text) && text.length < 80) return false;
  return true;
}

function mainRuleNumber(ruleNumber) {
  return Number(String(ruleNumber).match(/^\d+/)?.[0] || 0);
}

function inRanges(ruleNumber, ranges) {
  const main = mainRuleNumber(ruleNumber);
  return ranges.some(([start, end]) => main >= start && main <= end);
}

function selectRulesForCategory(rules, config) {
  const candidates = rules
    .filter(rule => inRanges(rule.number, config.ranges))
    .map(rule => ({ ...rule, score: scoreRule(rule), coreScore: coreScoreRule(rule) }));

  const core = candidates
    .filter(rule => rule.coreScore > 0)
    .sort((a, b) => b.coreScore - a.coreScore || compareRuleNumbers(a.number, b.number))
    .slice(0, CORE_PER_CATEGORY);

  const coreNumbers = new Set(core.map(rule => rule.number));
  const edge = candidates
    .filter(rule => !coreNumbers.has(rule.number))
    .sort((a, b) => b.score - a.score || compareRuleNumbers(a.number, b.number))
    .slice(0, TARGET_PER_CATEGORY - core.length);

  const pickedNumbers = new Set([...core, ...edge].map(rule => rule.number));
  const fill = candidates
    .filter(rule => !pickedNumbers.has(rule.number))
    .sort((a, b) => compareRuleNumbers(a.number, b.number))
    .slice(0, TARGET_PER_CATEGORY - core.length - edge.length);

  return [
    ...core.map(rule => ({ ...rule, track: "Core" })),
    ...edge.map(rule => ({ ...rule, track: "Edge" })),
    ...fill.map(rule => ({ ...rule, track: "Coverage" })),
  ];
}

function scoreRule(rule) {
  const text = `${rule.number} ${rule.text} ${rule.examples.join(" ")}`.toLowerCase();
  let score = 0;
  if (/[a-z]$/.test(rule.number)) score += 12;
  if (rule.examples.length) score += 10 + Math.min(rule.examples.length, 4);
  if (/must|can't|can.t|instead|unless|only|not|illegal|replacement|prevent|state-based|commander|copy|token|target|priority|stack/.test(text)) score += 8;
  for (const term of EDGE_TERMS) {
    if (text.includes(term.toLowerCase())) score += 2;
  }
  score += Math.min(Math.floor(rule.text.length / 120), 8);
  return score;
}

function coreScoreRule(rule) {
  const number = String(rule.number);
  const text = rule.text.toLowerCase();
  let score = 0;

  if (/^\d+\.\d+$/.test(number)) score += 20;
  if (/^\d+\.\d+a$/.test(number)) score += 12;
  if (rule.examples.length) score += 4;

  if (/\b(definition|means|is a|are checked|receives priority|to cast|to activate|resolves|triggered ability|state-based|replacement effect|commander|mana pool|combat damage|layer|copy|target|zone|turn)\b/.test(text)) {
    score += 8;
  }

  if (/\b(can't|can.t|instead|unless|illegal|exception|additional|alternative|simultaneously)\b/.test(text)) {
    score += 4;
  }

  return score;
}

function compareRuleNumbers(a, b) {
  return keyFor(a).localeCompare(keyFor(b), undefined, { numeric: true });
}

function keyFor(ruleNumber) {
  return String(ruleNumber).replace(/([a-z])$/, ".$1");
}

function titleFor(rule) {
  const words = rule.text
    .replace(/[{}[\]().,;:"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return words || "engine routing";
}

function scenarioFor(rule, categoryTitle) {
  const text = quote(rule.text, 520);
  const example = rule.examples[0] ? ` Example to consider: ${quote(rule.examples[0], 360)}` : "";
  return `A Commander table asks Arbiter to adjudicate a ${categoryTitle.toLowerCase()} dispute governed by rule ${rule.number}. Apply this rule text to the dispute: "${text}"${example} What is the ruling and where does the engine route it?`;
}

function expectedFor(rule) {
  return `Apply rule [${rule.number}]: ${quote(rule.text, 700)} The ruling must follow that rule exactly before moving to any later checkpoint.`;
}

function quote(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trim()}...`;
}

main();
