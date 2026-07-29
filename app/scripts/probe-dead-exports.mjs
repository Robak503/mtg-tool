#!/usr/bin/env node
/**
 * probe-dead-exports.mjs — exported engine functions with NO production caller.
 *
 * ⭐ WHY THIS EXISTS. islandhome.test.js was GREEN while never touching the shipped path: the engine
 * enforces the sea-monster attack restriction through `attackDefenderRequirementOf`, but the test called an
 * older `attackDefenderLandRequirement` pair that NOTHING in production invoked. The suite would have stayed
 * green if the live path broke, and the file header even documented the dead function as the enforcement
 * route. "Exported + tested" is not "wired" — this probe is that rule, mechanized.
 *
 * ⚠️ TWO CLASSES OVER-REPORT — triage every row before deleting anything:
 *   1. TEST HELPERS by convention (`_resetFooForTests`) — deliberately production-callerless.
 *   2. CONTRACT PINS. serialization.js's serializeState/deserializeState are trivial JSON wrappers whose
 *      own docstring says the round-trip test IS the contract ("there are deliberately NO custom revivers —
 *      their absence IS the contract"). The test is the point; the absence of a caller is not a defect.
 *   …and a THIN WRAPPER over a used function (opponentsEnterTappedOf → opponentsEnterTappedTypesOf) is
 *   merely unused, not a hollow gate: the guarantee is live through the other name.
 *
 * The row that MATTERS is the one that looks like an enforcement/behaviour helper AND is covered by tests
 * that read as evidence for a rules behaviour. That is the islandhome shape.
 *
 * ⚠️ RUN THE CONTROL. A sweep that can't see a dead export reports a comforting zero. The first version of
 * this probe did exactly that (a mangled \b escape) and printed "0 dead exports" while blind. `--control`
 * plants a synthetic unwired export in memory and asserts the sweep finds it; the probe REFUSES to print a
 * clean result unless the control passes.
 *
 * Definitions are read from src/lib/learn; CALLERS are searched across ALL of src/ and scripts/ — an
 * engine function is frequently consumed by an API route, a component or a hook, and a learn-only scan
 * reported 37 false rows for exactly that reason.
 *
 * Local-only dev tool; not in CI.
 *
 * Usage:
 *   node app/scripts/probe-dead-exports.mjs            # run (control is automatic)
 *   node app/scripts/probe-dead-exports.mjs --all      # include test-helper/underscore names
 */
import fs from "node:fs";
import path from "node:path";

const SHOW_ALL = process.argv.includes("--all");

const walk = (d) => (fs.existsSync(d)
  ? fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  : []);

const defFiles = walk("src/lib/learn").filter((f) => f.endsWith(".js") && !f.includes(".test."));
// ⚠️ THE PROBE EXCLUDES ITSELF. scripts/ is in the caller set, and this file mentions the control name as a
// literal — so without this filter the control counts as "referenced", reports itself alive, and the guard
// below fails. Caught by the control on its first run, which is precisely what the control is for.
const SELF = "probe-dead-exports.mjs";
const callerFiles = [...walk("src"), ...walk("scripts")]
  .filter((f) => /\.(js|jsx|mjs|cjs)$/.test(f) && !f.includes(".test.") && !f.endsWith(SELF));
const callerSrc = callerFiles.map((f) => fs.readFileSync(f, "utf8"));

/** Find every `export function` in `defFiles` with no reference outside its own file. */
function sweep(extraDef = null) {
  const out = [];
  const sources = defFiles.map((f) => [f, fs.readFileSync(f, "utf8")]);
  if (extraDef) sources.push(extraDef); // the control: a synthetic file nothing imports
  for (const [def, txt] of sources) {
    for (const m of txt.matchAll(/^export function ([A-Za-z0-9_$]+)/gm)) {
      const fn = m[1];
      if (!SHOW_ALL && /^_/.test(fn) && extraDef === null) continue; // test helpers, by convention
      let refs = 0;
      for (let j = 0; j < callerFiles.length; j++) {
        if (callerFiles[j] === def) continue;
        if (new RegExp(`\\b${fn}\\b`).test(callerSrc[j])) refs++;
      }
      const selfUses = (txt.match(new RegExp(`\\b${fn}\\b`, "g")) || []).length - 1;
      if (refs === 0 && selfUses <= 0) out.push(`${def.replace(/^src[\\/]lib[\\/]learn[\\/]/, "")} :: ${fn}`);
    }
  }
  return out;
}

// ── CONTROL FIRST: a sweep that cannot see a planted dead export must not be trusted to report zero.
const CONTROL_NAME = "__probeControlDeadExport";
const control = sweep(["<control>", `export function ${CONTROL_NAME}() { return 42; }\n`]);
if (!control.some((r) => r.includes(CONTROL_NAME))) {
  console.error("CONTROL FAILED — the sweep did not find a planted dead export. Result suppressed as unreliable.");
  process.exit(1);
}

const dead = sweep();
console.log(`control: OK · exported fns with NO caller in src/ or scripts/: ${dead.length}`);
for (const d of dead) console.log("  ", d);
if (!SHOW_ALL) console.log("\n(test helpers matching /^_/ hidden — pass --all to include them)");
