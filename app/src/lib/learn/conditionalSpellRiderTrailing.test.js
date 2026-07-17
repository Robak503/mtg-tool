/**
 * conditionalSpellRiderTrailing.test.js — CONDITIONAL SPELL RIDER, the TRAILING form (BLITZ CD-2, CR 608.2)
 * — the mirror of the landed CD-1 leading slice. Where CD-1 modeled a LEADING rider ("If <board-condition>,
 * <effect>"), CD-2 models the TRAILING rider "<effect> if <board-condition>" (Inga Rune-Eyes "…draw three
 * cards if three or more creatures died this turn."; Scalestorm Summoner "…create a 3/1 red Dinosaur creature
 * token if you control a creature with power 4 or greater."). The gated <effect> applies ONLY when the board
 * condition holds AS the instruction resolves (CR 608.2, in written order — a resolution-time check, NOT an
 * intervening-if: an intervening-if reads "When ~ dies, IF <cond>, draw"; a TRAILING "if" is part of the
 * effect, so the ability always goes on the stack and the conditional instruction does nothing when false).
 *
 * SAME machinery as CD-1, reused verbatim: the condition is read by evaluateInterveningIf (the shared board
 * evaluator), gated at parse time by spellConditionParseable (the spell-side shape check — a board/player/turn
 * query a resolving spell/ability can read with only its own context; a per-object back-reference or unreadable
 * condition stays LOW → Arbiter), and the runProgram condition-skip drops the atom when the board condition
 * isn't met (unchanged from CD-1). This is the metric⇄runtime shared gate: a rider is credited native ONLY
 * when the resolver can actually evaluate its condition.
 *
 * The trailing form is peeled in parseClauseToAtom (after the leading peel) and kept whole in splitClauses,
 * so — like CD-1 — it lifts a SPELL, a TRIGGER, or an ACTIVATED ability through the ONE shared clause seam.
 * In the corpus the clean trailing rider actually lives on triggers / activated abilities (Idle Thoughts's
 * "{2}: Draw a card if you have no cards in hand.", Inga's dies draw, Scalestorm's attack token, Sylvan
 * Scavenging's modal token), so those are the natives this slice earns.
 *
 * SCOPE (this slice): a SINGLE, NON-optional, NON-targeting gated atom whose LEFT side carries NO top-level
 * " and "/", then " (a compound left — "<A> and <B> if <cond>" — is scope-AMBIGUOUS: does the if gate B only
 * or A+B? → PARK, never guess). A back-reference gated effect ("that player/it/that creature …"), an "instead"
 * replacement, an ability-word-prefixed effect ("Ferocious — …"), an "Otherwise" else-branch, or an
 * unreadable condition all stay LOW → Arbiter (a SAFE false-negative — never a fabricated / mis-scoped native,
 * CREED).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { spellConditionParseable } from "./interveningIf.js";
import { detectTriggers, checkDiesTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle, probed via cardIndex 2026-07-17) whose TRAILING rider is a
//    single, non-optional, non-targeting modeled atom ────────────────────────────────────────────────────
const INGA = { name: "Inga Rune-Eyes", type: "Legendary Creature — Human Wizard", power: "3", toughness: "3", mana: "{3}{U}",
  oracle: "When Inga Rune-Eyes enters, scry 3.\nWhen Inga Rune-Eyes dies, draw three cards if three or more creatures died this turn." };
const SCALESTORM = { name: "Scalestorm Summoner", type: "Creature — Human Warlock", power: "3", toughness: "3", mana: "{2}{R}",
  oracle: "Whenever this creature attacks, create a 3/1 red Dinosaur creature token if you control a creature with power 4 or greater." };
const IDLE_THOUGHTS = { name: "Idle Thoughts", type: "Enchantment", mana: "{3}{U}",
  oracle: "{2}: Draw a card if you have no cards in hand." };
const SYLVAN_SCAVENGING = { name: "Sylvan Scavenging", type: "Enchantment", mana: "{1}{G}{G}",
  oracle: "At the beginning of your end step, choose one —\n• Put a +1/+1 counter on target creature you control.\n• Create a 3/3 green Raccoon creature token if you control a creature with power 4 or greater." };
// COLLATERAL parser-lock: a multi-rider ETB whose FOUR trailing riders each carry their own board condition
// (the trailing-form Sunset Revelry). The card stays body-only (other text), but its ETB effect must parse
// each gated atom independently — a lock against a mis-scope that would let the split sever one condition.
const BEZA = { name: "Beza, the Bounding Spring", type: "Legendary Creature — Elemental Elk", power: "4", toughness: "5", mana: "{2}{W}{W}",
  oracle: "When Beza enters, create a Treasure token if an opponent controls more lands than you. You gain 4 life if an opponent has more life than you. Create two 1/1 blue Fish creature tokens if an opponent controls more creatures than you. Draw a card if an opponent has more cards in hand than you." };

// ── FN-guard cards (real oracle) — deferred shapes stay Arbiter / body-only ───────────────────────────────
const COMPELLING_DETERRENCE = { name: "Compelling Deterrence", type: "Instant", mana: "{1}{U}",
  oracle: "Return target nonland permanent to its owner's hand. Then that player discards a card if you control a Zombie." };
const MIGHT_OF_THE_MEEK = { name: "Might of the Meek", type: "Instant", mana: "{R}",
  oracle: "Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse.\nDraw a card." };
const HYDRA_TROOPERS = { name: "HYDRA Troopers", type: "Creature — Human Soldier Villain", power: "3", toughness: "2", mana: "{2}{B}",
  oracle: "When this creature enters, create a tapped 2/1 black Villain creature token with menace if there are two or more creature cards in your graveyard. Otherwise, mill two cards." };
const INVASIVE_MANEUVERS = { name: "Invasive Maneuvers", type: "Instant", mana: "{1}{R}",
  oracle: "Invasive Maneuvers deals 3 damage to target creature. It deals 5 damage instead if you control a Spacecraft." };
const TEMUR_BATTLE_RAGE = { name: "Temur Battle Rage", type: "Instant", mana: "{1}{R}",
  oracle: "Target creature gains double strike until end of turn.\nFerocious — That creature also gains trample until end of turn if you control a creature with power 4 or greater." };
const TEACHINGS = { name: "Teachings of the Archaics", type: "Sorcery — Lesson", mana: "{2}{U}",
  oracle: "If an opponent has more cards in hand than you, draw two cards. Draw three cards instead if an opponent has at least four more cards in hand than you." };

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────
const diesTrigOf = (card) => detectTriggers(card).find((t) => t.event === "dies");
const etbTrigOf = (card) => detectTriggers(card).find((t) => t.event === "etb");
const attackTrigOf = (card) => detectTriggers(card).find((t) => t.event === "attacks");
const parseTrig = (d) => parseEffectClause(d.effectClause, "Instant", { hasX: false });

// ══ 1. RECOGNITION — the trailing-rider natives classify native (spell / trigger / activated seam) ═════════
describe("CONDITIONAL SPELL RIDER (trailing) coverage — trailing board-condition riders classify native", () => {
  it("Idle Thoughts (activated '{2}: Draw a card if you have no cards in hand.') → native-activated", () => {
    expect(classifyCard(IDLE_THOUGHTS)).toBe("native-activated");
    expect(isNativeTier(classifyCard(IDLE_THOUGHTS))).toBe(true);
  });
  it("Inga Rune-Eyes (dies → gated draw three) → native-trigger", () => {
    expect(classifyCard(INGA)).toBe("native-trigger");
  });
  it("Scalestorm Summoner (attacks → gated token) → native-trigger", () => {
    expect(classifyCard(SCALESTORM)).toBe("native-trigger");
  });
  it("Sylvan Scavenging (modal end-step, mode 2 a gated token) → native-trigger", () => {
    expect(classifyCard(SYLVAN_SCAVENGING)).toBe("native-trigger");
  });
});

// ══ 2. PARSER — the trailing rider stamps `condition` on the gated atom; base atoms stay unconditional ═════
describe("CONDITIONAL SPELL RIDER (trailing) parser — the gated atom carries a `condition`", () => {
  it("Inga: the ETB scry is unconditional, the dies draw is gated on the death-count board query", () => {
    const etb = parseTrig(etbTrigOf(INGA));
    expect(etb.atoms.map((a) => a.op)).toEqual(["scry"]);
    expect(etb.atoms.map((a) => a.condition ?? null)).toEqual([null]);
    const dies = parseTrig(diesTrigOf(INGA));
    expect(programConfidence(dies)).toBe("high");
    expect(dies.atoms.map((a) => a.op)).toEqual(["draw"]);
    expect(dies.atoms.map((a) => a.condition ?? null)).toEqual(["three or more creatures died this turn"]);
    expect(triggerRoutesNatively(diesTrigOf(INGA))).toBe(true);
  });
  it("Scalestorm: the attack token is gated on the power board query (non-targeting create-token)", () => {
    const atk = parseTrig(attackTrigOf(SCALESTORM));
    expect(programConfidence(atk)).toBe("high");
    expect(atk.atoms.map((a) => a.op)).toEqual(["create-token"]);
    expect(atk.atoms.map((a) => a.condition ?? null)).toEqual(["you control a creature with power 4 or greater"]);
  });
  it("Beza (collateral lock): FOUR independent trailing riders, each its own board condition, none severed", () => {
    const etb = parseTrig(etbTrigOf(BEZA));
    expect(programConfidence(etb)).toBe("high");
    expect(etb.atoms.map((a) => a.op)).toEqual(["create-named-token", "gain-life", "create-token", "draw"]);
    expect(etb.atoms.map((a) => a.condition)).toEqual([
      "an opponent controls more lands than you",
      "an opponent has more life than you",
      "an opponent controls more creatures than you",
      "an opponent has more cards in hand than you",
    ]);
  });
  it("spellConditionParseable gates the trailing peel: board queries readable, per-object/unreadable rejected", () => {
    expect(spellConditionParseable("you have no cards in hand")).toBe(true);
    expect(spellConditionParseable("three or more creatures died this turn")).toBe(true);
    expect(spellConditionParseable("you control a creature with power 4 or greater")).toBe(true);
    expect(spellConditionParseable("an opponent has more cards in hand than you")).toBe(true);
    expect(spellConditionParseable("its power is 3 or less")).toBe(false);       // per-object back-reference
    expect(spellConditionParseable("that creature has flying")).toBe(false);     // per-object back-reference
  });
  it("a COMPOUND left side ('<A> and <B> if <cond>') is scope-ambiguous → PARK (never a guessed scope)", () => {
    // Synthetic scope-ambiguity probe: the trailing 'if' could gate B only or A+B — the peel refuses to guess.
    const p = parseEffectClause("You gain 2 life and draw a card if you have no cards in hand.", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("low"); // whole clause parks → the card would go LOW → Arbiter
  });
  it("an UNREADABLE trailing condition doesn't peel → the clause parks (no dropped-condition native)", () => {
    const p = parseEffectClause("Draw a card if its power is 3 or less.", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("low");
  });
});

// ══ 3. RUNTIME — both branches through the REAL resolution path (the runProgram condition-skip) ═════════════
function baseState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

describe("CONDITIONAL SPELL RIDER (trailing) runtime — Inga draws three ONLY when three+ creatures died", () => {
  function ingaDies(deathsPre) {
    let s = baseState();
    const inga = { ...createPermanent({ id: "inga1", card: INGA, controller: "user" }), damageMarked: 99 };
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: [inga], hand: [], library: [{ id: "L1" }, { id: "L2" }, { id: "L3" }, { id: "L4" }],
      creaturesDiedThisTurn: deathsPre } } };
    const lethal = destroyLethalCreatures(s);
    return resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
  }
  it("three creatures already died → the dies draw fires (draw three)", () => {
    const s = ingaDies(3); // + Inga's own death → total ≥ 3
    expect(s.players.user.hand.length).toBe(3);
    expect(s.players.user.library.length).toBe(1);
  });
  it("no other creature died → the draw is SKIPPED (CREED — the trigger resolves, the gated draw does nothing)", () => {
    const s = ingaDies(0); // only Inga dies → total 1 < 3
    expect(s.players.user.hand.length).toBe(0);
    expect(s.players.user.library.length).toBe(4);
    expect((s.stack || []).length).toBe(0); // the dies trigger fully resolved (it was not dropped)
  });
});

describe("CONDITIONAL SPELL RIDER (trailing) runtime — Scalestorm makes a token ONLY with a power-4 creature", () => {
  const attacking = (id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" });
  function scalestormAttacks(withBig) {
    const scale = createPermanent({ id: "scale1", card: SCALESTORM, controller: "user" });
    const big = createPermanent({ id: "big1", card: { name: "Big Ogre", type: "Creature — Ogre", power: "4", toughness: "4", oracle: "" }, controller: "user" });
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...b, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      players: { ...b.players, user: { ...b.players.user, battlefield: withBig ? [scale, big] : [scale] } },
      combat: { attackers: [attacking("scale1")] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1); // the trigger ALWAYS fires; the condition gates the atom, not the trigger
    return resolveAll(fired);
  }
  const dinos = (s) => s.players.user.battlefield.filter((p) => p.card?.token && /Dinosaur/.test(p.card?.type || ""));
  it("a power-4 creature on board → the attack token is created", () => {
    expect(dinos(scalestormAttacks(true)).length).toBe(1);
  });
  it("no power-4 creature → the token is SKIPPED (the trigger still resolves, the gated create does nothing)", () => {
    expect(dinos(scalestormAttacks(false)).length).toBe(0);
  });
});

// ══ 4. CREED anti-FP — deferred trailing shapes stay Arbiter / body-only (never a mis-scoped native) ═══════
describe("CONDITIONAL SPELL RIDER (trailing) CREED anti-FP — deferred shapes stay parked", () => {
  it("a BACK-REFERENCE gated effect ('that player discards …') stays arbiter-spell (Compelling Deterrence)", () => {
    expect(classifyCard(COMPELLING_DETERRENCE)).toBe("arbiter-spell");
  });
  it("a BACK-REFERENCE 'it' gated pump stays arbiter-spell (Might of the Meek 'It also gets +1/+0 … if …')", () => {
    expect(classifyCard(MIGHT_OF_THE_MEEK)).toBe("arbiter-spell");
  });
  it("an 'Otherwise' else-branch stays body-only (HYDRA Troopers — the else branch is not a modeled skip)", () => {
    expect(isNativeTier(classifyCard(HYDRA_TROOPERS))).toBe(false);
  });
  it("an 'instead' REPLACEMENT rider stays arbiter-spell (Invasive Maneuvers 'It deals 5 damage instead if …')", () => {
    expect(classifyCard(INVASIVE_MANEUVERS)).toBe("arbiter-spell");
  });
  it("an ability-word-prefixed back-reference rider stays arbiter-spell (Temur Battle Rage 'Ferocious — That creature …')", () => {
    expect(classifyCard(TEMUR_BATTLE_RAGE)).toBe("arbiter-spell");
  });
  it("a trailing 'instead' + unreadable offset condition stays arbiter-spell (Teachings of the Archaics)", () => {
    expect(classifyCard(TEACHINGS)).toBe("arbiter-spell");
  });
});
