/**
 * controllerSacrificeUpkeep.test.js — BLITZ EC-1c: the bare CONTROLLER edict ("sacrifice a creature").
 *
 * "Sacrifice a creature." as an ABILITY'S EFFECT (not a cost): the bare imperative subject is the ability's
 * controller (CR 109.5 — "you" = the object's controller), resolved through the SAME advanceSacrificeChain
 * as the target/each-player edicts (CR 701.21a): 0 creatures → clean no-op; exactly 1 → forced; ≥2 → the
 * pending sacrifice-choice (the human picks, the AI auto-sacs its least valuable). For an aura-GRANTED
 * trigger (Inevitable End — "Enchanted creature has 'At the beginning of your upkeep, sacrifice a
 * creature.'") the granted ability belongs to the HOST, so the HOST's controller sacrifices at THEIR
 * upkeep, as printed. An α2-peeled "you may sacrifice a creature" arrives optional:true and rides the
 * optional-effect pause; the reflexive "When you do, …" payoff atoms carry reflexiveGate and are SKIPPED
 * on decline (CR 603.7 — the reflexive trigger only exists if the action was taken).
 *
 * ALL-OR-NOTHING bare "a creature" (count 1, unfiltered): a count / typed / filtered / conjoined victim
 * fails the exact anchor → low → Arbiter (a wrong-victim sacrifice is a forbidden FP, CREED).
 *
 * Real oracle fixtures (bundled Scryfall, 2026-07-16); every carrier below was audited by name in the
 * EC-1c flip-diff (14 GAINED, LOST=0).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkStepTriggers, checkEnterTriggers, checkCastTriggers, detectTriggers } from "./triggers.js";
import { runEffectProgram, resolveSacrificeChoice, autoPickSacrificeCandidate, resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// REAL current Oracle wording (verified against the bundled corpus).
const INEVITABLE_END = { name: "Inevitable End", type: "Enchantment — Aura", mana: "{2}{B}",
  oracle: 'Enchant creature\nEnchanted creature has "At the beginning of your upkeep, sacrifice a creature."' };
const ACCURSED_CENTAUR = { name: "Accursed Centaur", type: "Creature — Zombie Centaur", mana: "{B}", power: 2, toughness: 2,
  oracle: "When this creature enters, sacrifice a creature." };
const DAEMOGOTH_TITAN = { name: "Daemogoth Titan", type: "Creature — Demon", mana: "{B/G}{B/G}{B/G}{B/G}", power: 11, toughness: 10,
  oracle: "Whenever this creature attacks or blocks, sacrifice a creature." };
const DESECRATION_ELEMENTAL = { name: "Desecration Elemental", type: "Creature — Elemental", mana: "{3}{B}", power: 8, toughness: 8,
  oracle: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nWhenever a player casts a spell, sacrifice a creature." };
const SMOTHERING_ABOMINATION = { name: "Smothering Abomination", type: "Creature — Eldrazi", mana: "{2}{B}{B}", power: 4, toughness: 3,
  oracle: "Devoid (This card has no color.)\nFlying\nAt the beginning of your upkeep, sacrifice a creature.\nWhenever you sacrifice a creature, draw a card." };
const STITCHERS_APPRENTICE = { name: "Stitcher's Apprentice", type: "Creature — Homunculus", mana: "{1}{U}", power: 1, toughness: 2,
  oracle: "{1}{U}, {T}: Create a 2/2 blue Homunculus creature token, then sacrifice a creature." };
const SHRAPNEL_SLINGER = { name: "Shrapnel Slinger", type: "Artifact Creature — Phyrexian Beast", mana: "{1}{R}", power: 2, toughness: 1,
  oracle: "When this creature enters, you may sacrifice a creature. When you do, destroy target artifact an opponent controls." };
const SERVANT_OF_VOLRATH = { name: "Servant of Volrath", type: "Creature — Minion", mana: "{2}{B}", power: 3, toughness: 3,
  oracle: "When this creature leaves the battlefield, sacrifice a creature." };

const crea = (id, name, controller, cmc = 2, oracle = "") =>
  createPermanent({ id, card: { id, name, type: "Creature — Bear", mana: `{${cmc}}`, cmc, power: 2, toughness: 2, oracle }, controller });
const art = (id, name, controller) =>
  createPermanent({ id, card: { id, name, type: "Artifact", mana: "{1}", cmc: 1, oracle: "" }, controller });

function state({ userBf = [], aiBf = [], userLib = [], activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer, priorityHolder: activePlayer, consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: userLib },
      ai: { ...s.players.ai, battlefield: aiBf } } };
}
const runProg = (s, oracle, controller = "user") => runEffectProgram(s, { id: "stk", kind: "spell", source: { name: "T", oracle }, controller, targets: [], cost: null,
  payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectProgram({ type: "Sorcery", oracle }), controller, targets: [] } } });
const settle = (s) => {
  let guard = 0;
  while ((s.pendingChoice || s.stack?.length || s.pendingTriggers?.length) && guard++ < 30) {
    if (s.pendingChoice?.kind === "sacrifice-choice") s = resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, s.pendingChoice));
    else if (s.pendingChoice) break;
    else if (s.stack?.length) s = resolveTopOfStack(s);
    else s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  }
  return s;
};

describe("EC-1c parser — the bare controller edict is HIGH; everything wider stays LOW", () => {
  it('"Sacrifice a creature." parses to one who:"controller" sacrifice atom', () => {
    const p = parseEffectProgram({ type: "Sorcery", oracle: "Sacrifice a creature." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "sacrifice", who: "controller", what: "creature" }]);
  });
  it("ANTI-FP: count / typed / filtered / conjoined victims fail the exact anchor → LOW → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Sorcery", oracle }))).toBe("low");
    low("Sacrifice two creatures.");                       // a count
    low("Sacrifice a creature with flying.");              // filtered victim
    low("Sacrifice a creature or land.");                  // a type union
    low("Sacrifice a nontoken creature.");                 // nontoken qualifier (token-status not honored)
    low("Sacrifice a creature an opponent controls.");     // controller filter (not even a legal sac — CR 701.21a)
    low("Sacrifice a Goblin.");                            // subtype pool — NOT a modeled pool
  });
});

describe("EC-1c coverage — the audited carriers flip native (real oracles)", () => {
  it("the granted upkeep edict (Inevitable End) and the printed trigger forms are native-trigger", () => {
    for (const c of [INEVITABLE_END, ACCURSED_CENTAUR, DAEMOGOTH_TITAN, DESECRATION_ELEMENTAL, SMOTHERING_ABOMINATION, SHRAPNEL_SLINGER, SERVANT_OF_VOLRATH]) {
      expect(classifyCard(c)).toBe("native-trigger");
    }
  });
  it("the activated form (Stitcher's Apprentice — token, then sacrifice) is native-activated", () => {
    expect(classifyCard(STITCHERS_APPRENTICE)).toBe("native-activated");
  });
  it("Desecration Elemental's cast watcher is ANY-player scoped (an opponent's cast fires it too)", () => {
    const d = detectTriggers(DESECRATION_ELEMENTAL).find((t) => t.event === "cast");
    expect(d).toMatchObject({ event: "cast", whose: "any" });
  });
});

describe("EC-1c resolution — the CONTROLLER sacrifices; the 0 / 1 / ≥2 chain split", () => {
  it("0 creatures: a clean no-op (CR 701.21a — can't sacrifice what you don't control)", () => {
    const after = settle(runProg(state(), "Sacrifice a creature."));
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.graveyard).toHaveLength(0);
  });
  it("exactly 1: forced, no pause; the opponent's board is never touched", () => {
    const after = settle(runProg(state({ userBf: [crea("u1", "Only", "user")], aiBf: [crea("a1", "Theirs", "ai")] }), "Sacrifice a creature."));
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["u1"]);
    expect(after.players.ai.battlefield.map((p) => p.id)).toEqual(["a1"]);
  });
  it("≥2: pauses with the CONTROLLER as chooser, offering only THEIR creatures", () => {
    const paused = runProg(state({ userBf: [crea("u1", "Cheap", "user", 0), crea("u2", "Big", "user", 6)], aiBf: [crea("a1", "Theirs", "ai")] }), "Sacrifice a creature.");
    expect(paused.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["u1", "u2"]);
  });
});

describe("EC-1c runtime — Inevitable End: the HOST's controller sacrifices at THEIR upkeep", () => {
  function enchantedBoard() {
    const host = crea("host", "Doomed Bear", "ai", 3);
    const aura = createPermanent({ id: "aura", card: INEVITABLE_END, controller: "user" });
    aura.attachedTo = "host";
    host.attachments = ["aura"];
    return state({ userBf: [aura, crea("u1", "Safe", "user")], aiBf: [host, crea("a1", "Fodder", "ai", 0)], activePlayer: "ai" });
  }
  it("at the ENCHANTED player's upkeep the granted trigger fires and THEY sacrifice (auto: least valuable)", () => {
    let s = checkStepTriggers(enchantedBoard(), "upkeep");
    expect((s.pendingTriggers || []).map((t) => t.descriptor?.effectClause)).toContain("sacrifice a creature");
    s = settle(s);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["a1"]);   // the AI's own pick, from the AI's board
    expect(s.players.user.graveyard).toHaveLength(0);                  // the aura's controller never sacrifices
    expect(s.players.user.battlefield.some((p) => p.id === "u1")).toBe(true);
  });
  it("at the AURA controller's upkeep nothing fires (the granted ability is the host's)", () => {
    const s = checkStepTriggers({ ...enchantedBoard(), activePlayer: "user", priorityHolder: "user" }, "upkeep");
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.effectClause === "sacrifice a creature")).toHaveLength(0);
  });
});

describe("EC-1c runtime — the α2 reflexive compound (Shrapnel Slinger): decline skips the gated payoff", () => {
  function slingerETB() {
    const slinger = createPermanent({ id: "sl", card: { id: "sl", ...SHRAPNEL_SLINGER }, controller: "user" });
    let s = state({ userBf: [slinger, crea("u1", "Fodder", "user", 0)], aiBf: [art("x1", "Trinket", "ai")] });
    s = checkEnterTriggers(s, slinger);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingChoice).toMatchObject({ kind: "optional-effect", controller: "user", effectOp: "sacrifice" });
    return s;
  }
  it("TAKE — the creature is sacrificed AND the reflexive destroy fires on the opponent's artifact", () => {
    const after = settle(resolveOptionalChoice(slingerETB(), true));
    expect(after.players.user.graveyard.map((c) => c.id)).toEqual(["u1"]);
    expect(after.players.ai.battlefield).toHaveLength(0);
    expect(after.players.ai.graveyard.map((c) => c.id)).toEqual(["x1"]);
  });
  it("DECLINE — no sacrifice, and the reflexiveGate destroy NEVER fires (CR 603.7)", () => {
    const after = settle(resolveOptionalChoice(slingerETB(), false));
    expect(after.players.user.graveyard).toHaveLength(0);
    expect(after.players.ai.battlefield.map((p) => p.id)).toEqual(["x1"]);   // the artifact survives
  });
});

describe("EC-1c runtime — Smothering Abomination: the upkeep edict feeds its own sacrifice-event draw", () => {
  it("upkeep → sacrifice the fodder → the 'whenever you sacrifice' draw resolves off the same chain", () => {
    const abom = createPermanent({ id: "ab", card: { id: "ab", ...SMOTHERING_ABOMINATION }, controller: "user" });
    let s = state({ userBf: [abom, crea("u2", "Fodder", "user", 0)], userLib: [{ id: "top", name: "TopCard", type: "Sorcery", oracle: "" }] });
    s = settle(checkStepTriggers(s, "upkeep"));
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["u2"]);   // the upkeep edict resolved
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["top"]);       // and the sacrifice trigger drew
  });
});

describe("EC-1c runtime — Desecration Elemental: an OPPONENT's cast fires the controller's edict", () => {
  it("checkCastTriggers on an AI cast enqueues the user's 'sacrifice a creature'", () => {
    const elemental = createPermanent({ id: "de", card: { id: "de", ...DESECRATION_ELEMENTAL }, controller: "user" });
    let s = state({ userBf: [elemental, crea("u1", "Fodder", "user", 0)] });
    s = checkCastTriggers(s, { spellCard: { name: "Shock", type: "Instant", oracle: "" }, casterId: "ai" });
    expect((s.pendingTriggers || []).map((t) => t.descriptor?.effectClause)).toContain("sacrifice a creature");
    s = settle(s);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["u1"]);   // the ELEMENTAL's controller sacrifices
  });
});
