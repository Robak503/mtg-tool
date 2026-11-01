/**
 * abilityLossShapes.js — THE ABILITY-LOSS SHAPE REGISTRY (docs/orchestration/ABILITY-LOSS-PROGRAM.md §2).
 *
 * "Loses all abilities" (CR 613.1f, 113.10) reaches the engine one printed SHAPE at a time — an Aura's "Enchanted creature loses all
 * abilities and is a … with base power and toughness …", a spell's "Until end of turn, target creature loses all abilities and …", a
 * global static's "All creatures lose all abilities …". Each shape is an entry here: an id, the program STAGE that turns it on
 * (S1 … S5 — the program's slice table), an anchored pattern over one clause / sentence, and what it emits at each consult point.
 * The layer machinery the shapes emit into (the `loseAllAbilities` op, abilityLossOf, the stripped view, the grant cutoff, the
 * setCardTypes / replaceCreatureTypes ops) lives in layers.js and is built before any shape is on.
 *
 * ONE PREDICATE, FOUR CONSULT POINTS. abilityLossShape(text, context, ctx) is asked by
 *   · "attached" — staticAbilityParser's attached-clause parser (parseAttachedClauseCore: "Enchanted creature …"), answering an
 *                  array of attached-bonus partial descriptors (the parser's own output);
 *   · "static"   — staticAbilityParser's clause reader (parseClause: global and self statics), answering partial descriptors;
 *   · "spell"    — the spell clause parser (effects/parser.js parseClauseToAtomCore), answering one atom;
 *   · "side"     — auraPrintedSide's sentence reader (sentenceSide — the AI's cast / entry side for an Aura), answering a side
 *                  ("own" | "enemy" | "neutral" | "unknown").
 * A shape whose stage is off answers null at every point — so its text stays unparsed residue and the card stays parked, exactly as
 * before the shape existed. With EVERY stage off (S0) the predicate answers null for every text: no parse, no classification and no
 * game changes.
 *
 * Turning a stage on = its shapes + its witnesses, and the tier flip-diff must EQUAL a pre-committed expected-flips list (with the
 * program and runtime fingerprints beside it). Coupling to remember (the program doc §2): layers.staticEffectsOf applies
 * parseAttachedBonus to every attached Aura whatever its tier, so an "attached" shape changes runtime at once for every Aura of that
 * shape — body-only transformation Auras are already being cast today and doing nothing.
 *
 * LEAF MODULE: imports nothing (every consult point may import it without a cycle).
 */

/** The program's stages (ABILITY-LOSS-PROGRAM.md §3). All off: S0 builds the machinery and credits no card. */
export const ABILITY_LOSS_STAGES = Object.freeze({ S1: false, S2: false, S3: false, S4: false, S5: false });

/** The consult points (see the header). */
export const ABILITY_LOSS_CONTEXTS = Object.freeze(["attached", "static", "spell", "side"]);

/**
 * The shapes: `{ id, stage, pattern, emit }` — `pattern` an anchored (^…$) RegExp over the consult point's text (lowercase where the
 * consult point lowercases), `emit[context]` the value to answer there, or a function (match, ctx) → value | null. Closed: a shape is
 * added here, with its stage, in the slice that turns the stage on. Empty in S0.
 */
const SHAPES = Object.freeze([]);

let _testShapes = null;
let _testStages = null;

/**
 * The value an ENABLED shape emits for `text` at consult point `context`, or null — null for every text while no shape's stage is on.
 * `ctx` carries what the consult point knows (the attached parser's subject and noun, the clause reader's self name and type, the
 * spell parser's card type); a shape's emitter may read it.
 */
export function abilityLossShape(text, context, ctx = {}) {
  const shapes = _testShapes ?? SHAPES;
  if (shapes.length === 0) return null;
  const stages = _testStages ?? ABILITY_LOSS_STAGES;
  const t = String(text ?? "").trim();
  for (const shape of shapes) {
    if (!stages[shape.stage]) continue;
    const emit = shape.emit?.[context];
    if (emit == null) continue;
    const m = shape.pattern.exec(t);
    if (!m) continue;
    const out = typeof emit === "function" ? emit(m, ctx) : emit;
    if (out != null) return out;
  }
  return null;
}

/** The registry's shapes (frozen) — for the census tests. */
export function abilityLossShapes() {
  return SHAPES;
}

/** Is `shape` well formed — a known stage, an anchored pattern, and emitters only for known consult points? */
export function shapeIsWellFormed(shape) {
  if (!shape || typeof shape.id !== "string" || !shape.id) return false;
  if (!Object.prototype.hasOwnProperty.call(ABILITY_LOSS_STAGES, shape.stage)) return false;
  if (!(shape.pattern instanceof RegExp) || !shape.pattern.source.startsWith("^") || !shape.pattern.source.endsWith("$")) return false;
  return Object.keys(shape.emit || {}).every((k) => ABILITY_LOSS_CONTEXTS.includes(k));
}

/**
 * TESTS ONLY: run `fn` with `shapes` in place of the registry and `stages` in place of the stage switches, then restore them (also
 * when `fn` throws). Every shape must be well formed. The consult points' caches are keyed by card object or text, so a test that
 * uses this reads fresh text.
 */
export function _withAbilityLossShapesForTests(shapes, stages, fn) {
  for (const s of shapes) if (!shapeIsWellFormed(s)) throw new Error(`abilityLossShapes: malformed test shape ${s?.id ?? "(no id)"}`);
  const prevShapes = _testShapes;
  const prevStages = _testStages;
  _testShapes = Object.freeze([...shapes]);
  _testStages = Object.freeze({ ...ABILITY_LOSS_STAGES, ...stages });
  try {
    return fn();
  } finally {
    _testShapes = prevShapes;
    _testStages = prevStages;
  }
}
