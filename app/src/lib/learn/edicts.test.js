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
import { autoPickSacrificeCandidate, resolveSacrificeChoice, runEffectProgram } from "./effects/runProgram.js";
import { sacrificeCreatureEffect } from "./effects/effectAtoms.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence, atomTargetIntent, programTriggerTargetsResolvable, programNeedsChosenTarget } from "./effects/parser.js";
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
  it("a variant outside the exact template stays low → Arbiter (count / filter / non-creature / target-loses-life)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Target player sacrifices two creatures of their choice.");              // a count (Dead Drop / Barter in Blood)
    low("Target player sacrifices a creature of their choice with the greatest power."); // filtered victim
    low("Target player sacrifices a creature you don't control.");               // controller filter on the victim
    low("Target player sacrifices a nonblack creature.");                        // color filter
    low("Target opponent sacrifices a nonland permanent.");                      // non-creature victim
    low(GETHS);                                                                  // Geth's Verdict — the TARGET loses life (deferred)
    // ED-2 boundary: each-player/each-opponent are modeled for the BARE "a creature" form only.
    low("Each player sacrifices two creatures of their choice.");                // a count
    low("Each player sacrifices a land of their choice.");                       // non-creature victim (Tremble)
    low("Each opponent sacrifices a creature or planeswalker of their choice."); // type union (Dark Intimations)
    low("You sacrifice a creature.");                                            // controller "you sacrifice" — bare controller-sac deferred (α2 risk)
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

// ═══ ED-2 — each-player / each-opponent sacrifice (NON-targeted; every sacrificer chooses their own at
// resolution, CR 701.16, via the SAME chain as the target edict). ═══
const EACH_PLAYER = { id: "ib", name: "Innocent Blood", type: SORCERY, mana: "{B}", oracle: "Each player sacrifices a creature of their choice." };
const EACH_OPP = { id: "lt", name: "Liliana's Triumph", type: SORCERY, mana: "{1}{B}", oracle: "Each opponent sacrifices a creature of their choice." };

describe("ED-2 parser/coverage — each-player & each-opponent sacrifice are NON-targeted native-spells", () => {
  it("parse to one non-targeted sacrifice atom with the right `who` (no targetType)", () => {
    expect(parseEffectProgram(EACH_PLAYER).atoms).toEqual([{ op: "sacrifice", who: "eachPlayer", what: "creature" }]);
    expect(parseEffectProgram(EACH_OPP).atoms).toEqual([{ op: "sacrifice", who: "eachOpponent", what: "creature" }]);
    expect(programNeedsChosenTarget(parseEffectProgram(EACH_PLAYER))).toBe(false); // non-targeted → routes on triggers too
  });
  it("the bare form without 'of their choice' also parses", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player sacrifices a creature." }).atoms)
      .toEqual([{ op: "sacrifice", who: "eachPlayer", what: "creature" }]);
  });
  it("classify native-spell", () => {
    expect(classifyCard(EACH_PLAYER)).toBe("native-spell");
    expect(classifyCard(EACH_OPP)).toBe("native-spell");
  });
});

describe("ED-2 resolution — the sacrifice CHAIN walks every sacrificer (each picks their own creature)", () => {
  // Resolve a non-targeted edict through the chain, auto-settling each ≥2 pick (the AI/Expert path).
  function runChain(s, card, controller = "user") {
    const program = parseEffectProgram(card);
    const stk = { id: "stk-ed", kind: "spell", source: { name: card.name, oracle: card.oracle }, controller, targets: [], cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets: [] } } };
    let next = runEffectProgram(s, stk);
    while (next.pendingChoice?.kind === "sacrifice-choice") next = resolveSacrificeChoice(next, autoPickSacrificeCandidate(next, next.pendingChoice));
    return next;
  }

  it("each player (controller + opponent) sacrifices one — each their LEAST valuable (auto)", () => {
    const s = state({
      userBf: [creaPerm("u1", "MyToken", "user", 0, 1), creaPerm("u2", "MyBomb", "user", 6, 6)],
      aiBf: [creaPerm("a1", "AiToken", "ai", 0, 1), creaPerm("a2", "AiBomb", "ai", 6, 6)],
    });
    const after = runChain(s, EACH_PLAYER);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["u1"]);  // controller sac'd their cheapest
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);    // opponent sac'd their cheapest
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["u2"]);
    expect(after.players.ai.battlefield.map((p) => p.id)).toEqual(["a2"]);
  });

  it("each OPPONENT spares the controller — only opponents sacrifice", () => {
    const s = state({
      userBf: [creaPerm("u1", "Mine1", "user"), creaPerm("u2", "Mine2", "user")],
      aiBf: [creaPerm("a1", "AiOnly", "ai")],
    });
    const after = runChain(s, EACH_OPP);
    expect(after.players.user.graveyard).toHaveLength(0);                    // controller NOT a sacrificer
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["u1", "u2"]);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);     // opponent sac'd (forced, 1 creature)
  });

  it("per-player 0/1/≥2 split: a creatureless player is skipped; a sole creature is forced", () => {
    const s = state({
      userBf: [],                                            // controller has none → skipped (no pause, no sac)
      aiBf: [creaPerm("a1", "Sole", "ai")],                  // opponent has exactly one → forced
    });
    const after = runChain(s, EACH_PLAYER);
    expect(after.pendingChoice).toBeUndefined();             // no real choice anywhere → no pause
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);
  });

  it("pauses for the HEAD sacrificer first (APNAP — controller before opponent) when they owe a real choice", () => {
    const program = parseEffectProgram(EACH_PLAYER);
    const s = state({
      userBf: [creaPerm("u1", "U1", "user"), creaPerm("u2", "U2", "user")],   // controller ≥2 → real choice first
      aiBf: [creaPerm("a1", "A1", "ai"), creaPerm("a2", "A2", "ai")],
    });
    const stk = { id: "stk-ed", kind: "spell", source: { name: "Innocent Blood" }, controller: "user", targets: [], cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [] } } };
    const paused = runEffectProgram(s, stk);
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" }); // controller (APNAP head) pauses first
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2"]);
    // After the controller settles, the chain advances to the opponent.
    const next = resolveSacrificeChoice(paused, "u2");
    expect(next.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai" });
  });

  it("a sacrificed creature's dies trigger fires within the chain", () => {
    const s = state({ aiBf: [creaPerm("a1", "Doomed", "ai", 2, 2, "When Doomed dies, draw a card.")] });
    const after = runChain(s, EACH_OPP);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);
    expect(after.pendingTriggers?.length || 0).toBeGreaterThan(0);            // the dies trigger enqueued
  });
});

describe("ED-2 trigger path — a non-targeted each-player/each-opponent sac routes natively on a trigger", () => {
  it("an ETB 'each opponent sacrifices a creature' is native-trigger (non-targeted → no chosen-target gate)", () => {
    const etb = { type: "Creature — Horror", name: "Fleshbag-ish", oracle: "When this creature enters, each opponent sacrifices a creature of their choice." };
    expect(classifyCard(etb)).toBe("native-trigger");
  });
  it("the iconic Fleshbag family (ETB-self / dies-self) + a clean 'a creature you control dies' are native-trigger", () => {
    expect(classifyCard({ type: "Creature — Zombie Warrior", name: "Fleshbag Marauder", oracle: "When this creature enters, each player sacrifices a creature of their choice." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Horror", name: "Abyssal Gatekeeper", oracle: "When this creature dies, each player sacrifices a creature of their choice." })).toBe("native-trigger");
    expect(classifyCard({ type: "Enchantment", name: "Dictate of Erebos", oracle: "Flash\nWhenever a creature you control dies, each opponent sacrifices a creature of their choice." })).toBe("native-trigger");
  });
  // DEATH-DRAIN — the compound-subject condition "this creature or another creature you control dies" is the
  // creature union { self } ∪ { others you control } = exactly "a creature you control dies", now mapped to
  // that scope (it was routed to the Arbiter by the old "or another" guard). The death-edict (Butcher) and the
  // bare drain (Zulaport-class) both resolve through the SAME path as Dictate of Erebos. "each other player
  // sacrifices" ≡ "each opponent sacrifices" (Grave Pact). See deathDrainTriggers.test.js.
  it("a compound-subject 'this OR ANOTHER creature you control dies' edict/drain IS native (DEATH-DRAIN)", () => {
    const butcher = { type: "Creature — Vampire Warrior", name: "Butcher of Malakir", oracle: "Flying\nWhenever this creature or another creature you control dies, each opponent sacrifices a creature of their choice." };
    expect(classifyCard(butcher)).toBe("native-trigger");
    const zulaportish = { type: "Creature — Human Cleric", name: "Drainer-ish", oracle: "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life." };
    expect(classifyCard(zulaportish)).toBe("native-trigger");
    // a Grave-Pact-style 'each other player' death-edict is the same eachOpponent sacrifice
    const gravePact = { type: "Enchantment", name: "Grave Pact", oracle: "Whenever a creature you control dies, each other player sacrifices a creature of their choice." };
    expect(classifyCard(gravePact)).toBe("native-trigger");
  });
});

// ═══ PERMANENT-EDICT — "sacrifices a permanent of their choice" (Silverclad Ferocidons, Martyr's Bond,
// Possessed Portal, the Rishadan pirates). Same chain as the creature edict, but the victim pool is ALL the
// sacrificer's permanents (what:"permanent"), so a land/artifact/enchantment is a legal sacrifice. ═══
const PERM_NONCREATURE = (id, name, controller, type = "Artifact", cmc = 1) =>
  createPermanent({ id, card: { id, name, type, mana: `{${cmc}}`, cmc, oracle: "" }, controller });

describe("PERMANENT-EDICT parser/coverage — 'sacrifices a permanent' is native with what:'permanent'", () => {
  it("each-opponent / each-player / target forms parse to a what:'permanent' sacrifice atom", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each opponent sacrifices a permanent of their choice." }).atoms)
      .toEqual([{ op: "sacrifice", who: "eachOpponent", what: "permanent" }]);
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each player sacrifices a permanent of their choice." }).atoms)
      .toEqual([{ op: "sacrifice", who: "eachPlayer", what: "permanent" }]);
    expect(parseEffectProgram({ type: INSTANT, oracle: "Target opponent sacrifices a permanent of their choice." }).atoms)
      .toEqual([{ op: "sacrifice", targetType: "opponent", what: "permanent" }]);
  });
  it("the bare form without 'of their choice' also parses", () => {
    expect(parseEffectProgram({ type: SORCERY, oracle: "Each opponent sacrifices a permanent." }).atoms)
      .toEqual([{ op: "sacrifice", who: "eachOpponent", what: "permanent" }]);
  });
  it("ANTI-FP: count / typed / filtered / conjoined permanent edicts stay LOW → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Each opponent sacrifices two permanents.");                              // a count
    low("Each opponent sacrifices a nonland permanent.");                         // filtered (the existing pin, line 84)
    low("Each opponent sacrifices an artifact or creature.");                     // a type union
    low("Each opponent sacrifices a permanent and loses 1 life.");                // conjoined life-loss
    low("Target player sacrifices a permanent with the highest mana value.");     // filtered victim
    low("Each player sacrifices a land of their choice.");                        // a typed (non-"permanent") victim — still LOW
  });
});

describe("PERMANENT-EDICT resolution — the sacrificer may give up ANY permanent (land/artifact), not just a creature", () => {
  function runChain(s, card, controller = "user") {
    const program = parseEffectProgram(card);
    const stk = { id: "stk-pe", kind: "spell", source: { name: card.name, oracle: card.oracle }, controller, targets: [], cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller, targets: [] } } };
    let next = runEffectProgram(s, stk);
    while (next.pendingChoice?.kind === "sacrifice-choice") next = resolveSacrificeChoice(next, autoPickSacrificeCandidate(next, next.pendingChoice));
    return next;
  }
  const PERM_EACH_OPP = { id: "pe", name: "Test Perm Edict", type: SORCERY, mana: "{1}{B}", oracle: "Each opponent sacrifices a permanent of their choice." };

  it("an opponent whose ONLY permanent is an artifact (no creatures) is forced to sacrifice the artifact", () => {
    // The creature edict would skip this opponent (no creatures); the permanent edict forces the artifact.
    const s = state({ aiBf: [PERM_NONCREATURE("art1", "Sol Ring-ish", "ai")] });
    const after = runChain(s, PERM_EACH_OPP);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.battlefield).toHaveLength(0);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["art1"]);
  });
  it("the candidate pool offers BOTH a creature and a non-creature permanent (≥2 = a real choice)", () => {
    const s = state({ aiBf: [creaPerm("a1", "Bear", "ai", 2, 2), PERM_NONCREATURE("art1", "Trinket", "ai")] });
    const program = parseEffectProgram(PERM_EACH_OPP);
    const stk = { id: "stk-pe", kind: "spell", source: { name: PERM_EACH_OPP.name }, controller: "user", targets: [], cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [] } } };
    const paused = runEffectProgram(s, stk);
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "ai" });
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["a1", "art1"]); // BOTH offered
  });
  it("a creatureless, permanent-less opponent is a clean no-op", () => {
    const after = runChain(state({ aiBf: [] }), PERM_EACH_OPP);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.ai.graveyard).toHaveLength(0);
  });
  it("CREATURE edict (what:'creature') still ignores a non-creature permanent (no regression)", () => {
    // The same board under a CREATURE edict must NOT touch the artifact (the legacy pool is unchanged).
    const s = state({ aiBf: [PERM_NONCREATURE("art1", "Trinket", "ai")] });
    const after = runChain(s, EACH_OPP); // EACH_OPP = "Each opponent sacrifices a creature of their choice."
    expect(after.players.ai.graveyard).toHaveLength(0);
    expect(after.players.ai.battlefield.map((p) => p.id)).toEqual(["art1"]);
  });
});

describe("PERMANENT-EDICT real card — Silverclad Ferocidons (Enrage → each opponent sacrifices a permanent)", () => {
  it("classifies native-trigger (enrage damage-received trigger + the permanent-edict effect)", () => {
    const silverclad = { type: "Creature — Dinosaur", name: "Silverclad Ferocidons", mana: "{5}{R}{R}",
      oracle: "Enrage — Whenever this creature is dealt damage, each opponent sacrifices a permanent of their choice." };
    expect(classifyCard(silverclad)).toBe("native-trigger");
  });
  it("a plain ETB 'each opponent sacrifices a permanent' is native-trigger too (reusable, non-targeted)", () => {
    const etb = { type: "Creature — Horror", name: "Perm-Edict-ETB", oracle: "When this creature enters, each opponent sacrifices a permanent of their choice." };
    expect(classifyCard(etb)).toBe("native-trigger");
  });
});
