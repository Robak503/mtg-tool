/**
 * edicts.test.js — EDICTS, sacrifice as an EFFECT (Diabolic Edict / Cruel Edict / Grave Exchange).
 *
 * "Target player/opponent sacrifices a creature of their choice" collapses to one `sacrifice` atom that
 * TARGETS A PLAYER at cast. At RESOLUTION the TARGET (the sacrificer) chooses which creature to give up
 * (CR 701.16 — the modern Oracle "of their choice" makes this explicit; NOT the caster). With ≥2 creatures
 * the engine sets a `pendingChoice` controlled by the sacrificer (the human gets a picker; the AI sacs its
 * least valuable); 0 creatures is a clean no-op; exactly 1 is sac'd with no choice. Dies triggers fire.
 *
 * Fixtures use the REAL current Oracle wording (verified against the corpus: edicts now say "of their
 * choice"). Geth's Verdict ("...and loses 1 life" — the TARGET loses the life, an actor we don't model)
 * correctly DEFERS to the Arbiter. Pins: the exact-template ALLOWLIST, player-vs-opponent enumeration,
 * the 0/1/≥2 split, the AI least-valuable heuristic, the human picker, multi-atom composition (Grave
 * Exchange), the dies-trigger fire, the trigger-flush intent gate, and the AI never self-edicting.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applySacrificeChoice } from "./learnSession.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice } from "./effects/runProgram.js";
import { sacrificeCreatureEffect } from "./effects/effectAtoms.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence, atomTargetIntent, programTriggerTargetsResolvable } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const INSTANT = "Instant";
// REAL current Oracle wording (verified against the bundled corpus).
const DIABOLIC = { id: "de", name: "Diabolic Edict", type: INSTANT, mana: "{1}{B}", oracle: "Target player sacrifices a creature of their choice." };
const CRUEL = { id: "ce", name: "Cruel Edict", type: SORCERY, mana: "{1}{B}", oracle: "Target opponent sacrifices a creature of their choice." };
const GRAVE = { id: "gx", name: "Grave Exchange", type: SORCERY, mana: "{4}{B}", oracle: "Return target creature card from your graveyard to your hand. Target player sacrifices a creature of their choice." };
const GETHS = "Target player sacrifices a creature of their choice and loses 1 life."; // Geth's Verdict — DEFERRED (target loses life)

// A creature CARD with a tunable mana value (drives tutorManaValue) + power (the least-valuable tiebreak).
const creaCard = (id, name, cmc = 2, power = 2, oracle = "") => ({ id, name, type: "Creature — Bear", mana: `{${cmc}}`, cmc, power, toughness: 2, oracle });
const creaPerm = (id, name, controller, cmc = 2, power = 2, oracle = "") => createPermanent({ id, card: creaCard(id, name, cmc, power, oracle), controller });

function state({ userHand = [], userBf = [], userGy = [], aiBf = [], aiLib = [], extraSeats = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...s.players,
    user: { ...s.players.user, hand: userHand, battlefield: userBf, graveyard: userGy, manaPool: { ...s.players.user.manaPool, C: 8, B: 4 } },
    ai: { ...s.players.ai, battlefield: aiBf, library: aiLib },
  };
  if (extraSeats) for (const [id, bf] of Object.entries(extraSeats)) players[id] = { ...s.players.ai, battlefield: bf };
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}

// Cast `cardId` at player `victim` and AUTO-settle the resolution-time sacrifice pick (the AI/Expert path).
function castAndAutoResolve(s, cardId, victim) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId && a.targets?.some((t) => t.id === victim));
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.pendingChoice?.kind === "sacrifice-choice") next = resolveSacrificeChoice(next, autoPickSacrificeCandidate(next, next.pendingChoice));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser — the edict family is HIGH; the atom targets a PLAYER (victim chosen at resolution)", () => {
  it("the core templates parse to one sacrifice atom with the right player/opponent target", () => {
    expect(parseEffectProgram(DIABOLIC).atoms).toEqual([{ op: "sacrifice", targetType: "player", what: "creature" }]);
    expect(parseEffectProgram(CRUEL).atoms).toEqual([{ op: "sacrifice", targetType: "opponent", what: "creature" }]);
  });
  it("the bare form (no 'of their choice') also parses (older templating / loyalty abilities)", () => {
    expect(parseEffectProgram({ type: INSTANT, oracle: "Target player sacrifices a creature." }).atoms)
      .toEqual([{ op: "sacrifice", targetType: "player", what: "creature" }]);
  });
  it("a modeled clause composes via the multi-atom gate (Grave Exchange = graveyard-return + edict)", () => {
    expect(programConfidence(parseEffectProgram(GRAVE))).toBe("high");
    expect(parseEffectProgram(GRAVE).atoms.map((a) => a.op)).toEqual(["return-from-graveyard", "sacrifice"]);
  });
  it("a variant outside the exact template stays low → Arbiter (count / filter / non-creature / each-player / target-loses-life)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Target player sacrifices two creatures of their choice.");              // a count (Dead Drop / Barter in Blood)
    low("Target player sacrifices a creature of their choice with the greatest power."); // filtered victim
    low("Target player sacrifices a creature you don't control.");               // controller filter on the victim
    low("Target player sacrifices a nonblack creature.");                        // color filter
    low("Target opponent sacrifices a nonland permanent.");                      // non-creature victim
    low(GETHS);                                                                  // Geth's Verdict — the TARGET loses life (deferred)
    low("Each player sacrifices a creature of their choice.");                   // each-player (a later slice)
    low("Each opponent sacrifices a creature of their choice.");                 // each-opponent (a later slice)
    low("You sacrifice a creature.");                                            // controller-sac as an effect (a later slice)
  });
});

describe("coverage — the edict family is native-spell; unmodeled variants are arbiter-spell", () => {
  it("Diabolic Edict / Cruel Edict / Grave Exchange classify native-spell", () => {
    for (const c of [DIABOLIC, CRUEL, GRAVE]) expect(classifyCard(c)).toBe("native-spell");
  });
  it("a filtered / multi / target-loses-life edict is arbiter-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Dead Drop", oracle: "Target player sacrifices two creatures of their choice." })).toBe("arbiter-spell");
    expect(classifyCard({ type: INSTANT, name: "Geth's Verdict", oracle: GETHS })).toBe("arbiter-spell");
  });
});

describe("enumeration — 'target player' offers every player; 'target opponent' offers opponents only", () => {
  it("Diabolic Edict (player) offers all players; Cruel Edict (opponent) offers only opponents", () => {
    const s = state({ userHand: [DIABOLIC, CRUEL] });
    expect(enumerateTargets(s, "user", parseEffectProgram(DIABOLIC).atoms[0]).map((t) => t.id).sort()).toEqual(["ai", "user"]);
    expect(enumerateTargets(s, "user", parseEffectProgram(CRUEL).atoms[0])).toEqual([{ type: "player", id: "ai", name: "ai" }]);
  });
});

describe("resolution — the TARGET sacrifices; 0 / 1 / ≥2 creature split", () => {
  it("≥2 creatures: pauses with the sacrificer as controller, offering THEIR creatures", () => {
    const s = state({ userHand: [DIABOLIC], aiBf: [creaPerm("a1", "Token", "ai", 0, 1), creaPerm("a2", "Bomb", "ai", 6, 6)] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "de" && a.targets?.[0]?.id === "ai");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai" }); // the SACRIFICER chooses
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["a1", "a2"]);
  });
  it("the AI auto-pick sacs its LEAST valuable creature (lowest mana value)", () => {
    const s = state({ userHand: [DIABOLIC], aiBf: [creaPerm("a1", "Token", "ai", 0, 1), creaPerm("a2", "Bomb", "ai", 6, 6)] });
    const after = castAndAutoResolve(s, "de", "ai");
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);            // the 0-mv token, not the bomb
    expect(after.players.ai.battlefield.map((p) => p.id)).toEqual(["a2"]);
  });
  it("exactly 1 creature: sacrificed with NO pause", () => {
    const s = state({ userHand: [DIABOLIC], aiBf: [creaPerm("a1", "Only", "ai")] });
    const after = castAndAutoResolve(s, "de", "ai");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);
  });
  it("0 creatures: a clean no-op (no pause, nothing sacrificed)", () => {
    const s = state({ userHand: [DIABOLIC], aiBf: [] });
    const after = castAndAutoResolve(s, "de", "ai");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard).toHaveLength(0);
  });
  it("Grave Exchange multi-atom: the caster's graveyard creature returns to hand AND the target sacrifices", () => {
    const s = state({ userHand: [GRAVE], userGy: [creaCard("g1", "Reanimated", 3, 3)], aiBf: [creaPerm("a1", "Victim", "ai")] });
    const after = castAndAutoResolve(s, "gx", "ai");
    expect(after.players.user.hand.map((c) => c.id)).toContain("g1");              // returned to the caster's hand
    expect(after.players.user.graveyard.map((c) => c.id)).not.toContain("g1");
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);           // the target sacrificed
  });
});

describe("dies triggers — a sacrificed creature's 'when this dies' fires (shared helper)", () => {
  it("sacrificeCreatureEffect moves the creature to the graveyard AND enqueues its dies trigger", () => {
    const s = state({ aiBf: [creaPerm("a1", "Doomed", "ai", 2, 2, "When Doomed dies, draw a card.")] });
    const out = sacrificeCreatureEffect(s, "ai", "a1");
    expect(out.players.ai.battlefield).toHaveLength(0);
    expect(out.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].payload.params.effect).toMatchObject({ kind: "draw" });
  });
  it("a stale id (creature already gone) is a clean no-op, not a throw", () => {
    const s = state({ aiBf: [] });
    expect(() => sacrificeCreatureEffect(s, "ai", "ghost")).not.toThrow();
    expect(sacrificeCreatureEffect(s, "ai", "ghost").players.ai.graveyard).toHaveLength(0);
  });
});

describe("trigger-flush intent gate — opponent edict is enemy-routable; player edict is ambiguous → Arbiter", () => {
  it("atomTargetIntent: opponent = enemy (routes on a trigger); player = ambiguous (Arbiter on a trigger)", () => {
    expect(atomTargetIntent({ op: "sacrifice", targetType: "opponent" })).toBe("enemy");
    expect(atomTargetIntent({ op: "sacrifice", targetType: "player" })).toBe("ambiguous");
    expect(programTriggerTargetsResolvable(parseEffectProgram(CRUEL))).toBe(true);    // opponent edict
    expect(programTriggerTargetsResolvable(parseEffectProgram(DIABOLIC))).toBe(false); // player edict
  });
  it("a 'target opponent sacrifices' ETB trigger is native-trigger; the 'target player' form is not", () => {
    const opp = { type: "Creature — Horror", name: "Fleshbag-ish", oracle: "When this creature enters, target opponent sacrifices a creature of their choice." };
    const ply = { type: "Creature — Horror", name: "Edict-ETB", oracle: "When this creature enters, target player sacrifices a creature of their choice." };
    expect(classifyCard(opp)).toBe("native-trigger");
    expect(classifyCard(ply)).not.toBe("native-trigger");
  });
});

describe("driver — the human (the edict's target) gets a picker; the AI auto-sacs", () => {
  const sess = (state, difficulty = "beginner") => ({ id: "s", status: "active", difficulty, state, decisionLog: [] });
  it("a user edicted by an AI surfaces a sacrifice-choice (the human picks their own creature)", () => {
    // An AI's edict targets the user; the user must sacrifice → a pending choice controlled by "user".
    const s = state({ userBf: [creaPerm("u1", "Mine1", "user", 1, 1), creaPerm("u2", "Mine2", "user", 5, 5)] });
    const paused = { ...s, pendingChoice: { kind: "sacrifice-choice", controller: "user", candidates: [{ id: "u1", name: "Mine1" }, { id: "u2", name: "Mine2" }], sourceName: "Diabolic Edict" } };
    const { decision } = advanceUntilDecision(sess(paused));
    expect(decision.kind).toBe("sacrifice-choice");
    expect(decision.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2"]);
  });
  it("applySacrificeChoice: a valid pick sacs it; an illegal pick re-surfaces the picker", () => {
    const s = state({ userBf: [creaPerm("u1", "Mine1", "user", 1, 1), creaPerm("u2", "Mine2", "user", 5, 5)] });
    const paused = { ...s, pendingChoice: { kind: "sacrifice-choice", controller: "user", candidates: [{ id: "u1", name: "Mine1" }, { id: "u2", name: "Mine2" }], sourceName: "Diabolic Edict" } };
    const picked = applySacrificeChoice(sess(paused), { cardId: "u2" });            // the human keeps the small one, sacs the big one
    expect(picked.session.state.players.user.graveyard.map((c) => c.id)).toEqual(["u2"]);
    const illegal = applySacrificeChoice(sess(paused), { cardId: "not-a-candidate" });
    expect(illegal.decision.kind).toBe("sacrifice-choice");                         // re-surfaced, not a crash
  });
  it("Expert autopilot auto-sacs with no panel", () => {
    const s = state({ userBf: [creaPerm("u1", "Cheap", "user", 1, 1), creaPerm("u2", "Big", "user", 5, 5)] });
    const paused = { ...s, pendingChoice: { kind: "sacrifice-choice", controller: "user", candidates: [{ id: "u1", name: "Cheap" }, { id: "u2", name: "Big" }], sourceName: "Diabolic Edict" } };
    const { session, decision } = advanceUntilDecision(sess(paused, "expert"));
    expect(decision.kind).not.toBe("sacrifice-choice");
    expect(session.state.players.user.graveyard.map((c) => c.id)).toEqual(["u1"]); // least valuable auto-sac'd
  });
});

describe("608.2b-style guards — eliminated players mid-pause", () => {
  it("an eliminated SACRIFICER skips the sac but still resumes the caster's modeled rider", () => {
    // A constructed [sacrifice, gain-life] program (the caster gains life after the edict): verify the
    // rider — the CASTER's, not the sacrificer's — still resumes when the sacrificer is gone mid-pause.
    const program = parseEffectProgram({ type: INSTANT, oracle: "Target player sacrifices a creature of their choice. You gain 2 life." });
    expect(program.atoms.map((a) => a.op)).toEqual(["sacrifice", "gain-life"]);
    const s = state({ userHand: [] });
    const before = s.players.user.life;
    const gone = { ...s, players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "ai")),
      pendingChoice: { kind: "sacrifice-choice", controller: "ai", candidates: [{ id: "a1", name: "Gone" }],
        resume: { program, controller: "user", targets: [], nextAtomIndex: 1, cardName: "Edict" } } };
    let out;
    expect(() => { out = resolveSacrificeChoice(gone, "a1"); }).not.toThrow();
    expect(out.players.user.life).toBe(before + 2);                                 // the caster's "gain 2 life" rider still resumed
  });
});

describe("AI — casts an edict at an opponent that has creatures, never itself, never a creatureless seat", () => {
  it("the AI targets the opponent with the MOST creatures and never its own board", () => {
    const s0 = state({ userBf: [creaPerm("u1", "U1", "user"), creaPerm("u2", "U2", "user")], aiBf: [creaPerm("ai-own", "Own", "ai")], extraSeats: { ai2: [creaPerm("x1", "X1", "ai2")] } });
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai",
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [DIABOLIC], manaPool: { ...s0.players.ai.manaPool, C: 8, B: 4 } } } };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).toBe("cast-spell");
    expect(picked?.cardId).toBe("de");
    expect(picked?.targets?.[0]?.id).toBe("user");                                  // user has 2 creatures vs ai2's 1
    expect(picked?.targets?.[0]?.id).not.toBe("ai");                                // never its own board
  });
  it("the AI HOLDS the edict when no opponent controls a creature (it would just fizzle)", () => {
    const s0 = state({ userBf: [], aiBf: [], extraSeats: { ai2: [] } });
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai",
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [DIABOLIC], manaPool: { ...s0.players.ai.manaPool, C: 8, B: 4 } } } };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).not.toBe("cast-spell");                                    // held (pass / land), not a fizzling edict
  });
});
