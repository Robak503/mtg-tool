#!/usr/bin/env node
/**
 * verify-role-token-data.mjs — the corpus-backed GATE that pins the Role registry to the bundled data.
 *
 *   MTG_APP_ROOT=<install app-data root> node scripts/verify-role-token-data.mjs
 *   exit 0 = registry matches the data; exit 1 = drift (printed)
 *
 * ⭐ WHY A SCRIPT AND NOT A UNIT TEST. The vitest suite is HERMETIC — `allCards()` throws in it (verified),
 * because the test environment carries no corpus. A "registry matches the bundled token objects" assertion
 * therefore cannot live in a unit test, and one that silently SKIPPED when the corpus is missing would be a
 * hollow gate: green because it checked nothing. So it lives here, where the corpus is a hard requirement and
 * its absence is a loud failure.
 *
 * ⭐ IT HAS ALREADY EARNED ITS KEEP: on its first run it caught that Royal's bundled text carries its ward
 * reminder inline and the registry had dropped it.
 *
 * The registry's rule (CLAUDE.md §1.2): a Role's oracle text is COPIED FROM DATA, never written from memory.
 * This is the mechanism that keeps that true as the data changes under us.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard, isNativeTier } from "../src/lib/learn/coverage.js";
import { NAMED_TOKENS } from "../src/lib/learn/effects/atoms/tokens.js";

const REGISTERED = ["cursed", "monster", "royal", "sorcerer", "virtuous"];
const KNOWN_UNMODELED = ["Wicked", "Young Hero"];          // in the data, body not executable yet
const NO_DEFINITION = ["Chef", "Questing", "Huntsman"];     // asked for by cards, absent from the data

/** Every Role face in the bundled data, keyed by printed name. */
function roleDefinitions() {
  const defs = new Map();
  for (const raw of allCards()) {
    const c = publicCard(raw);
    if (!/\brole\b/i.test(String(c.type || ""))) continue;
    for (const face of String(c.oracle || "").split(/\n\/\/\n/)) {
      const lines = face.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const header = lines[0]?.match(/^(.+?)\s+-\s+Token Enchantment/i);
      if (!header) continue;
      const body = lines.slice(1).filter((l) => !/^\(/.test(l)).join("\n");
      const name = header[1].trim();
      if (!defs.has(name) || defs.get(name).length < body.length) defs.set(name, body);
    }
  }
  return defs;
}

let failures = 0;
const fail = (msg) => { console.error(`⛔ ${msg}`); failures += 1; };

const defs = roleDefinitions();
if (!defs.size) fail("no Role token objects found in the corpus — is MTG_APP_ROOT pointing at an install?");
console.log(`Role definitions in bundled data: ${defs.size} (${[...defs.keys()].sort().join(", ")})`);

// 1. every registered Role matches the data byte-for-byte
for (const key of REGISTERED) {
  const spec = NAMED_TOKENS[key];
  if (!spec) { fail(`registry is missing "${key}"`); continue; }
  const fromData = defs.get(spec.name);
  if (!fromData) { fail(`${spec.name}: no bundled definition`); continue; }
  if (fromData !== spec.oracle) {
    fail(`${spec.name}: registry DRIFTED from the data`);
    console.error(`     registry: ${JSON.stringify(spec.oracle)}`);
    console.error(`     data    : ${JSON.stringify(fromData)}`);
    continue;
  }
  if (!isNativeTier(classifyCard({ name: spec.name, type: spec.type, mana: "", oracle: spec.oracle }))) {
    fail(`${spec.name}: registered but its body is NOT executable — it would mint a do-nothing token`);
    continue;
  }
  console.log(`   OK  ${spec.name} — matches data, body executable`);
}

// 2. the deliberately-unregistered ones: still unmodeled? (if one became native, REGISTER it)
for (const name of KNOWN_UNMODELED) {
  const body = defs.get(name);
  if (!body) { fail(`${name}: expected in the data but absent — update this gate`); continue; }
  if (isNativeTier(classifyCard({ name, type: "Token Enchantment — Aura Role", mana: "", oracle: body }))) {
    fail(`${name}: its body is NOW EXECUTABLE — register it in NAMED_TOKENS and add its parse arm`);
  } else {
    console.log(`   --  ${name} — still unmodeled, correctly unregistered`);
  }
}

// 3. the ones with no definition at all must stay absent from the registry
const registeredNames = Object.values(NAMED_TOKENS).map((s) => s.name);
for (const name of NO_DEFINITION) {
  if (defs.has(name)) fail(`${name}: a definition APPEARED in the data — it can now be registered`);
  if (registeredNames.includes(name)) fail(`${name}: registered despite having no bundled definition`);
}
console.log(`   --  ${NO_DEFINITION.join(" / ")} — no bundled definition, correctly unregistered`);

console.log(failures ? `\n${failures} problem(s).` : "\nRole registry is pinned to the bundled data.");
process.exit(failures ? 1 : 0);
