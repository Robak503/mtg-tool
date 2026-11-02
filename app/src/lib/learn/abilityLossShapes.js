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
 * Two more readers ask the same predicate for the "spell" point, so a shape owns its whole sentence wherever it is read: the spell
 * clause splitter (effects/splitClauses.js) keeps a sentence an enabled spell shape claims whole (its " and " joins the parts of one
 * effect, not two effects), and the attached-bonus parser hands it a pronoun sentence that follows an "Enchanted creature …" sentence
 * with "it" read as the enchanted creature (Retro-Mutation's "It can't attack and loses all abilities."), only ever through this
 * registry.
 *
 * LEAF MODULE: imports only effects/creatureTypes.js, itself an import-free leaf (every consult point may import it without a cycle).
 */
import { CR_CREATURE_TYPES } from "./effects/creatureTypes.js"; // the closed CR 205.3m creature-type vocabulary (an import-free leaf)

/** The program's stages (ABILITY-LOSS-PROGRAM.md §3). S1 is on: loss with the ops the engine already had. */
export const ABILITY_LOSS_STAGES = Object.freeze({ S1: true, S2: false, S3: false, S4: false, S5: false });

/** The consult points (see the header). */
export const ABILITY_LOSS_CONTEXTS = Object.freeze(["attached", "static", "spell", "side"]);

// ─── S1: loss with existing ops (ABILITY-LOSS-PROGRAM.md §3) ─────────────────────────────────────────────────────────────────────
// Each printed form is its own anchored shape (no grammar that composes parts the corpus never prints). The parts are the ops the
// engine already applies: the layer-6 loss (CR 613.1f), a creature-type REPLACE in layer 4 ("is a Treefolk" — CR 205.1a: the new
// subtype replaces the creature types, every other subtype and every card type stays), a colour SET in layer 5 (CR 105.3 — "colorless"
// sets none), a base P/T SET in 7b (CR 613.4b) and a P/T change in 7c (CR 613.4c), and a "can't attack" restriction (a quality, not an
// ability — CR 113.12 — so the loss beside it never removes it). Out of S1, by their wording: "is a … CREATURE" (sets the card types —
// S2), a group or dynamic set (S3), a grant from the same effect ("has defender", "has indestructible" — S4), a noncreature result (S5).

const PERMANENT = () => ({ kind: "permanent" });
/** The Aura descriptors (the attached-bonus parser's own shape: staticEffectsOf fixes each to the host at the Aura's attach timestamp). */
const LOSS = () => ({ layer: 6, op: { layerOp: "loseAllAbilities" }, duration: PERMANENT() });
const BASE_PT = (p, t) => ({ layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: Number(p), toughness: Number(t) }, duration: PERMANENT() });
const PT_CHANGE = (p, t) => ({ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: parseInt(p, 10) || 0, toughness: parseInt(t, 10) || 0 }, duration: PERMANENT() }); // "-0" → 0
const CREATURE_TYPE = (subtype) => ({ layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes: [subtype] }, duration: PERMANENT() });
const COLOR = (colors) => ({ layer: 5, op: { layerOp: "setColor", colors: [...colors] }, duration: PERMANENT() });
const CANT_ATTACK = () => ({ layer: 6, op: { layerOp: "addKeyword", keyword: "cantAttack" }, duration: PERMANENT() });

/** A colour word → its colours (CR 105.1, 105.3 — "colorless" is none). */
const COLOR_WORD = Object.freeze({ white: ["W"], blue: ["U"], black: ["B"], red: ["R"], green: ["G"], colorless: [] });
/** A printed creature-type word → its type-line spelling, or null when it is not a CR 205.3m creature type ("creature" is a card type). */
function creatureTypeOf(word) {
  const w = String(word || "").toLowerCase();
  return CR_CREATURE_TYPES.has(w) ? w.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-") : null;
}
/** The type and colour parts of "is a [colour] <Subtype>" / "becomes a [colour] <Subtype>", or null for a word that is no creature type. */
function typeAndColor(colorWord, typeWord) {
  const subtype = creatureTypeOf(typeWord);
  if (!subtype) return null;
  return { subtype, colors: colorWord ? COLOR_WORD[String(colorWord).toLowerCase()] : null };
}

// The Aura forms ("attached" — the clause lowercased, the subject "enchanted", the noun "creature"; "side" — the same sentence,
// lowercase). Each is an "Enchanted creature …" clause only: an Equipment's or a soulbond's "equipped creature" never matches.
const AURA_ONLY = (ctx) => ctx?.subject === "enchanted" && ctx?.noun === "creature";
const ENEMY = "enemy"; // the side every S1 Aura form puts the Aura on: its host loses its abilities, or shrinks and becomes a vanilla creature
const COLOR_WORDS_RE = "white|blue|black|red|green|colorless";

const S1_SHAPES = [
  // Kasmina's Transmutation, Utter Insignificance — "Enchanted creature loses all abilities and has base power and toughness 1/1."
  { id: "s1-aura-loss-base-pt", stage: "S1",
    pattern: /^enchanted creature loses all abilities and has base power and toughness (\d+)\/(\d+)$/i,
    emit: { attached: (m, ctx) => (AURA_ONLY(ctx) ? [LOSS(), BASE_PT(m[1], m[2])] : null), side: ENEMY } },
  // Ichthyomorphosis ("… and is a blue Fish with base power and toughness 0/1."), Noggle the Mind ("… is a colorless Noggle …").
  { id: "s1-aura-loss-is-type-base-pt", stage: "S1",
    pattern: new RegExp(`^enchanted creature loses all abilities and is an? (?:(${COLOR_WORDS_RE}) )?([a-z-]+) with base power and toughness (\\d+)\\/(\\d+)$`, "i"),
    emit: {
      attached: (m, ctx) => {
        const tc = AURA_ONLY(ctx) ? typeAndColor(m[1], m[2]) : null;
        return tc ? [LOSS(), CREATURE_TYPE(tc.subtype), ...(tc.colors ? [COLOR(tc.colors)] : []), BASE_PT(m[3], m[4])] : null;
      },
      side: (m) => (typeAndColor(m[1], m[2]) ? ENEMY : null),
    } },
  // Lignify — "Enchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities."
  { id: "s1-aura-is-type-base-pt-loss", stage: "S1",
    pattern: /^enchanted creature is an? ([a-z-]+) with base power and toughness (\d+)\/(\d+) and loses all abilities$/i,
    emit: {
      attached: (m, ctx) => { const sub = AURA_ONLY(ctx) ? creatureTypeOf(m[1]) : null; return sub ? [CREATURE_TYPE(sub), BASE_PT(m[2], m[3]), LOSS()] : null; },
      side: (m) => (creatureTypeOf(m[1]) ? ENEMY : null),
    } },
  // Fresh Start (-5/-0), Mystic Subdual (-2/-0), Duskmourn's Domination (-3/-0), Quantum Reduction (-5/-0) — "Enchanted creature gets
  // -5/-0 and loses all abilities."
  { id: "s1-aura-pt-change-loss", stage: "S1",
    pattern: /^enchanted creature gets ([+-]\d+)\/([+-]\d+) and loses all abilities$/i,
    emit: { attached: (m, ctx) => (AURA_ONLY(ctx) ? [PT_CHANGE(m[1], m[2]), LOSS()] : null), side: ENEMY } },
  // Retro-Mutation's first sentence — "Enchanted creature is a Turtle with base power and toughness 0/1." — the type and base P/T half of
  // its loss (its second sentence below). No loss by itself; an Aura is credited only when its every clause is read (all or nothing).
  { id: "s1-aura-is-type-base-pt", stage: "S1",
    pattern: /^enchanted creature is an? ([a-z-]+) with base power and toughness (\d+)\/(\d+)$/i,
    emit: {
      attached: (m, ctx) => { const sub = AURA_ONLY(ctx) ? creatureTypeOf(m[1]) : null; return sub ? [CREATURE_TYPE(sub), BASE_PT(m[2], m[3])] : null; },
      side: (m) => (creatureTypeOf(m[1]) ? ENEMY : null),
    } },
  // Retro-Mutation's second sentence — "It can't attack and loses all abilities." ("it": the enchanted creature, the subject of the
  // sentence before it — the attached parser hands it over as "enchanted creature …"; auraPrintedSide reads it as printed).
  { id: "s1-aura-cant-attack-loss", stage: "S1",
    pattern: /^(?:enchanted creature|it) can't attack and loses all abilities$/i,
    emit: { attached: (m, ctx) => (AURA_ONLY(ctx) && /^enchanted /i.test(m[0]) ? [CANT_ATTACK(), LOSS()] : null), side: ENEMY } },

  // The spell and ability forms ("spell" — one clause as the clause parser receives it, original case, no final period): one atom,
  // `lose-all-abilities` (effects/atoms/combat.js applyLoseAllAbilities), its parts resolved as ONE effect until end of turn. The
  // duration is printed once, before or after the instruction; a form without one (a loss for good) or with two is not S1's.
  // Humble, Ovinize (0/1), Obscura Confluence's first mode (1/1) — "Until end of turn, target creature loses all abilities and has base
  // power and toughness 0/1."; Warkite Marauder's attack trigger — "target creature defending player controls loses all abilities and
  // has base power and toughness 0/1 until end of turn" (the defending player is the trigger's — CR 506.2; the referent restriction the
  // clause parser's own peel would stamp).
  { id: "s1-spell-loss-base-pt", stage: "S1",
    pattern: /^(until end of turn, )?target creature( defending player controls)? loses all abilities and has base power and toughness (\d+)\/(\d+)( until end of turn)?$/i,
    emit: { spell: (m) => (!m[1] === !m[5] ? null : lossAtom({ defending: !!m[2], basePt: [m[3], m[4]] })) } },
  // Turn to Frog ("… becomes a blue Frog with base power and toughness 1/1."), Snakeform (a green Snake), Gift of Tusks (a green
  // Elephant 3/3), Turn // Burn's Turn (a red Weird 0/1).
  { id: "s1-spell-loss-becomes-type-base-pt", stage: "S1",
    pattern: new RegExp(`^(until end of turn, )?target creature( defending player controls)? loses all abilities and becomes an? (?:(${COLOR_WORDS_RE}) )?([a-z-]+) with base power and toughness (\\d+)\\/(\\d+)( until end of turn)?$`, "i"),
    emit: {
      spell: (m) => {
        if (!m[1] === !m[7]) return null;
        const tc = typeAndColor(m[3], m[4]);
        return tc ? lossAtom({ defending: !!m[2], subtype: tc.subtype, colors: tc.colors, basePt: [m[5], m[6]] }) : null;
      },
    } },
  // Merfolk Trickster — "… tap target creature an opponent controls. It loses all abilities until end of turn." The pronoun names the
  // creature the sentence before it targeted (CR 608.2c): the atom reads `target: "self"` with `itReferent`, so the program builder binds
  // it to that target (parser.js bareItAfterTarget) or refuses the program — never the source's own loss.
  { id: "s1-spell-it-loses-eot", stage: "S1",
    pattern: /^it loses all abilities until end of turn$/i,
    emit: { spell: () => ({ op: "lose-all-abilities", target: "self", itReferent: true, until: "endOfTurn" }) } },
];

/** The S1 spell atom (effects/atoms/combat.js applyLoseAllAbilities): one chosen creature; its creature type, colours and base P/T. */
function lossAtom({ defending, subtype = null, colors = null, basePt = null }) {
  return {
    op: "lose-all-abilities", targetType: "creature", until: "endOfTurn",
    ...(subtype ? { subtypes: [subtype] } : {}),
    ...(colors ? { colors: [...colors] } : {}),
    ...(basePt ? { basePt: { power: Number(basePt[0]), toughness: Number(basePt[1]) } } : {}),
    ...(defending ? { restrictions: [{ kind: "controller", who: "defendingPlayer" }] } : {}),
  };
}

/**
 * The shapes: `{ id, stage, pattern, emit }` — `pattern` an anchored (^…$) RegExp over the consult point's text (lowercase where the
 * consult point lowercases), `emit[context]` the value to answer there, or a function (match, ctx) → value | null. Closed: a shape is
 * added here, with its stage, in the slice that turns the stage on.
 */
const SHAPES = Object.freeze(S1_SHAPES.map((s) => Object.freeze({ ...s, emit: Object.freeze({ ...s.emit }) })));

let _testShapes = null;
let _testStages = null;
// Has any shape been able to emit in this process? True from the start when a stage is on; set (and kept) once a test installs shapes,
// since a consult point's parse is cached by card object or text and may still carry what a test shape emitted after it is restored.
let _mayHaveEmitted = SHAPES.some((s) => ABILITY_LOSS_STAGES[s.stage]);

/**
 * CAN A STATIC ABILITY CARRY A LOSS? The board fast path's static half (layers.boardLossEffects): a `loseAllAbilities` effect comes
 * from a resolved spell or ability (stored on the state) or from a static ability, and a static emits one only through a shape of
 * this registry. With every stage off and no test shape ever installed this is false, so a board's losses are exactly its stored
 * ones and no reader needs the board's statics collected to know there is none. With S1 on it is true from the start: every board a
 * reader asks about is collected (what that costs is measured in S1's RUN-LEDGER entry).
 */
export function abilityLossShapesMayEmit() {
  return _mayHaveEmitted;
}

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
  if (shapes.length) _mayHaveEmitted = true;
  _testShapes = Object.freeze([...shapes]);
  _testStages = Object.freeze({ ...ABILITY_LOSS_STAGES, ...stages });
  try {
    return fn();
  } finally {
    _testShapes = prevShapes;
    _testStages = prevStages;
  }
}
