/**
 * THAT-PLAYER SPELL REBIND (NEXT-QUEUE A0b, CR 608.2) — "that player" on a SPELL means the most
 * recently mentioned player, which is a property of the PRECEDING clause, never the combat-damage
 * referent. The parser's assembly loop rebinds the cdmgDiscard clause atom (who:"damagedPlayer")
 * when — and only when — a same-program antecedent from a three-shape ALLOWLIST precedes it:
 *
 *   · deal-damage → target player  — "…deals N damage to TARGET PLAYER. That player…" (Ozai's Cruelty)
 *   · bounce (chosen target)       — "…to ITS OWNER'S hand. Then that player…"        (Recoil)
 *   · counter → target spell       — "…unless ITS CONTROLLER pays… That player…"      (Frightful Delusion)
 *
 * The rebound atom is the proven its-controller shape (who:"target" + bindPreviousTargets, plus a
 * playerFrom projection where the antecedent's player is a field of the target object rather than
 * the target itself). Trigger payloads parse the discard as their FIRST atom — no antecedent — so
 * the specter family (cdmgDiscard.test.js) is structurally untouched; this is why the rebind lives
 * at ASSEMBLY and not in the clause parser (the clause-level attempt once cost 17 specters — see
 * the ⚠️ note in atoms/combat.js).
 *
 * CREED pins:
 *   - an antecedent OUTSIDE the allowlist (destroy — its clause mentions no player) keeps
 *     who:"damagedPlayer" → the coverage guard refuses the spell (SAFE false-negative);
 *   - the countContext form ("that many cards") never rebinds — a spell has no damage-amount referent;
 *   - the bounce arm projects the OWNER (CR 110.2 — "its owner's hand"), not the controller: a stolen
 *     permanent goes home to its owner and THAT player discards;
 *   - Compelling Deterrence's trailing condition ("if you control a Zombie") rides the atom and is
 *     evaluated at resolution by the conditional-rider gate — no Zombie, no discard;
 *   - a fizzled spell (sole target gone, CR 608.2b) never runs the discard.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { resolveDiscardChoice, autoPickDiscardCandidate, resolveSoftCounterChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text, pulled from the bundled index 2026-08-02) ──
const RECOIL = { name: "Recoil", type: "Instant", mana: "{U}{B}",
  oracle: "Return target permanent to its owner's hand. Then that player discards a card." };
const OZAIS_CRUELTY = { name: "Ozai's Cruelty", type: "Sorcery — Lesson", mana: "{2}{B}",
  oracle: "Ozai's Cruelty deals 2 damage to target player. That player discards two cards." };
const COMPELLING_DETERRENCE = { name: "Compelling Deterrence", type: "Instant", mana: "{1}{U}",
  oracle: "Return target nonland permanent to its owner's hand. Then that player discards a card if you control a Zombie." };
const FRIGHTFUL_DELUSION = { name: "Frightful Delusion", type: "Instant", mana: "{1}{U}",
  oracle: "Counter target spell unless its controller pays {1}. That player discards a card." };

const hc = (id, name, cmc = 2) => ({ id, name, type: "Sorcery", mana: `{${cmc}}`, cmc, oracle: "" });
// `over` spreads ON TOP of the permanent (createPermanent has a fixed field list and silently drops
// extras) — the `owner` stamp lives beside `controller`, exactly as zones.enterCardFromZone stamps it.
const bear = (id, controller, over = {}) => ({ ...createPermanent({ id, card: { name: "Grizzly Bears", id: "gb" + id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller }), ...over });
const zombie = (id) => createPermanent({ id, card: { name: "Walking Corpse", id: "wc" + id, type: "Creature — Zombie", power: 2, toughness: 2, oracle: "" }, controller: "user" });

function setup({ hand = [], mana = {}, board = [], oppBoard = [], oppHand = [], stack = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack,
    players: { ...s.players,
      user: { ...s.players.user, hand, battlefield: board, life: 40, manaPool: { ...s.players.user.manaPool, ...mana } },
      ai: { ...s.players.ai, battlefield: oppBoard, hand: oppHand, life: 40 } } };
}
const casts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell");
function drain(s) {
  let g = 0;
  while (g++ < 40) {
    if (s.pendingChoice?.kind === "discard") { s = resolveDiscardChoice(s, autoPickDiscardCandidate(s, s.pendingChoice)); continue; }
    if (s.stack?.length) { s = resolveTopOfStack(s); continue; }
    break;
  }
  return s;
}
const handSize = (s, pid) => s.players[pid].hand.length;

// ── 1. Parser — the rebind produces the bound shape; the guards stay ──────────────────────────
describe("THAT-PLAYER rebind — parser", () => {
  it("Recoil → bounce + discard bound to the previous target's OWNER", () => {
    const p = parseEffectProgram(RECOIL);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[1]).toMatchObject({ op: "discard", amount: 1, who: "target", bindPreviousTargets: true, playerFrom: "owner" });
  });
  it("Ozai's Cruelty → deal-damage(player) + discard bound to the damaged TARGET (no projection)", () => {
    const p = parseEffectProgram(OZAIS_CRUELTY);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[1]).toMatchObject({ op: "discard", amount: 2, who: "target", bindPreviousTargets: true });
    expect(p.atoms[1].playerFrom).toBeUndefined();
  });
  it("Frightful Delusion → soft-counter + discard bound to the spell's CONTROLLER", () => {
    const p = parseEffectProgram(FRIGHTFUL_DELUSION);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "counter", unlessPay: 1 });
    expect(p.atoms[1]).toMatchObject({ op: "discard", amount: 1, who: "target", bindPreviousTargets: true, playerFrom: "controller" });
  });
  it("Compelling Deterrence → the trailing condition RIDES the rebound atom", () => {
    const p = parseEffectProgram(COMPELLING_DETERRENCE);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[1]).toMatchObject({ op: "discard", who: "target", bindPreviousTargets: true, playerFrom: "owner", condition: "you control a zombie" });
  });
  it("CREED — a bare payload ('That player discards a card.' first) has no antecedent and stays damagedPlayer", () => {
    const p = parseEffectProgram({ name: "SYNTH", type: "Instant", oracle: "That player discards a card." });
    expect(p.atoms[0]).toMatchObject({ op: "discard", who: "damagedPlayer" });
  });
  it("CREED — an antecedent OUTSIDE the allowlist (destroy mentions no player) does NOT rebind", () => {
    const p = parseEffectProgram({ name: "SYNTH", type: "Instant", oracle: "Destroy target creature. That player discards a card." });
    const d = (p?.atoms || []).find((a) => a.op === "discard");
    if (d) expect(d.who).toBe("damagedPlayer"); // never bound — "that player" has no player antecedent here
    expect(classifyCard({ name: "SYNTH", type: "Instant", mana: "{1}{B}", oracle: "Destroy target creature. That player discards a card." })).not.toBe("native-spell");
  });
  it("CREED — the countContext form ('that many cards') never rebinds on a spell", () => {
    const p = parseEffectProgram({ name: "SYNTH", type: "Sorcery", oracle: "SYNTH deals 2 damage to target player. That player discards that many cards." });
    const d = (p?.atoms || []).find((a) => a.op === "discard");
    expect(d).toMatchObject({ who: "damagedPlayer", countContext: "combatDamageAmount" });
    expect(classifyCard({ name: "SYNTH", type: "Sorcery", mana: "{1}{B}", oracle: "SYNTH deals 2 damage to target player. That player discards that many cards." })).not.toBe("native-spell");
  });
});

// ── 2. Coverage — the four flip; the combat-trigger family is untouched ───────────────────────
describe("THAT-PLAYER rebind — classification", () => {
  it("all four cards classify native-spell", () => {
    expect(classifyCard(RECOIL)).toBe("native-spell");
    expect(classifyCard(OZAIS_CRUELTY)).toBe("native-spell");
    expect(classifyCard(COMPELLING_DETERRENCE)).toBe("native-spell");
    expect(classifyCard(FRIGHTFUL_DELUSION)).toBe("native-spell");
  });
  it("the combat-damage specters still classify native-trigger (the rebind never touches payloads)", () => {
    expect(classifyCard({ name: "Blazing Specter", type: "Creature — Specter",
      oracle: "Flying, haste\nWhenever this creature deals combat damage to a player, that player discards a card." })).toBe("native-trigger");
  });
});

// ── 3. Runtime — Recoil: the bounced permanent's OWNER discards ───────────────────────────────
describe("THAT-PLAYER rebind — Recoil runtime (owner projection)", () => {
  it("bounces the AI's bear to the AI's hand and the AI discards; caster untouched", () => {
    let s = setup({ hand: [{ ...RECOIL, id: "r1" }], mana: { U: 1, B: 1 },
      oppBoard: [bear("b1", "ai")], oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    const cast = casts(s).find((a) => a.cardId === "r1");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(s.players.ai.battlefield.length).toBe(0);
    // hand = 2 originals + the bounced bear − 1 discarded = 2
    expect(handSize(s, "ai")).toBe(2);
    expect(handSize(s, "user")).toBe(0);
  });
  it("⭐ a STOLEN permanent (controller ai, owner user) goes home to USER's hand and USER discards — the owner, never the controller", () => {
    // The stamped `owner` is the same field moveCardToZone's owner-routing reads (CR 110.2 / 404.1).
    let s = setup({ hand: [{ ...RECOIL, id: "r1" }], mana: { U: 1, B: 1 },
      oppBoard: [bear("b1", "ai", { owner: "user" })], oppHand: [hc("a1", "AiKeep", 5)] });
    const cast = casts(s).find((a) => a.cardId === "r1");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(s.players.ai.battlefield.length).toBe(0);
    expect(handSize(s, "ai")).toBe(1);              // AI hand untouched — not the owner
    // The bear went home to the OWNER's hand (moveCardToZone owner-routing), then the owner —
    // the user, whose hand held only the bear — was forced to discard it. Net hand 0 would be
    // ambiguous alone (same count if nothing happened), so the graveyard is the witness: the
    // discarded bear sits in the USER's graveyard, proving both the arrival and the discard.
    expect(handSize(s, "user")).toBe(0);
    expect((s.players.user.graveyard || []).some((c) => c.name === "Grizzly Bears")).toBe(true);
    expect((s.players.ai.graveyard || []).some((c) => c.name === "Grizzly Bears")).toBe(false);
  });
  it("CR 608.2b — the sole target gone at resolution → the spell fizzles, NOBODY discards", () => {
    let s = setup({ hand: [{ ...RECOIL, id: "r1" }], mana: { U: 1, B: 1 },
      oppBoard: [bear("b1", "ai")], oppHand: [hc("a1", "Keep", 5)] });
    const cast = casts(s).find((a) => a.cardId === "r1");
    s = dispatchAction(s, cast);
    // The bear leaves in response (simulated removal before resolution).
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [] } } };
    s = drain(s);
    expect(handSize(s, "ai")).toBe(1);   // no bounce arrival, no discard
    expect(handSize(s, "user")).toBe(0);
  });
});

// ── 4. Runtime — Ozai's Cruelty: the damaged target discards two ──────────────────────────────
describe("THAT-PLAYER rebind — Ozai's Cruelty runtime (direct player target)", () => {
  it("deals 2 to the AI and the AI discards two", () => {
    let s = setup({ hand: [{ ...OZAIS_CRUELTY, id: "o1" }], mana: { B: 1, C: 2 },
      oppHand: [hc("a1", "A", 6), hc("a2", "B", 1), hc("a3", "C", 3)] });
    const cast = casts(s).find((a) => a.cardId === "o1" && a.targets?.[0]?.id === "ai");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(s.players.ai.life).toBe(38);
    expect(handSize(s, "ai")).toBe(1);   // 3 − 2 discarded
    expect(handSize(s, "user")).toBe(0);
  });
});

// ── 5. Runtime — Frightful Delusion: the countered spell's CONTROLLER discards, pay or not ────
describe("THAT-PLAYER rebind — Frightful Delusion runtime (controller projection)", () => {
  const aiSpell = (id) => ({ id, kind: "spell", controller: "ai", targets: [], cost: null,
    source: { id: `card-${id}`, name: "Divination", type: "Sorcery", oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} } });
  function responseState({ oppHand }) {
    const s = setup({ hand: [{ ...FRIGHTFUL_DELUSION, id: "f1" }], mana: { U: 1, C: 1 }, oppHand, stack: [aiSpell("s1")] });
    return { ...s, activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0 };
  }
  it("AI declines to pay → its spell is countered AND it (the spell's controller) discards", () => {
    let s = responseState({ oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    const cast = casts(s).find((a) => a.cardId === "f1");
    expect(cast).toBeTruthy();
    expect(cast.targets[0]).toMatchObject({ type: "spell", id: "s1" });
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", amount: 1 });
    s = drain(resolveSoftCounterChoice(s, false));          // decline → countered
    expect((s.stack || []).some((o) => o.id === "s1")).toBe(false);
    expect(handSize(s, "ai")).toBe(1);                       // discarded one — the controller referent held
    expect(handSize(s, "user")).toBe(0);
  });
  it("AI pays {1} → its spell survives AND it STILL discards (the discard is unconditional)", () => {
    let s = responseState({ oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, manaPool: { ...s.players.ai.manaPool, C: 1 } } } };
    const cast = casts(s).find((a) => a.cardId === "f1");
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(s.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai" });
    s = drain(resolveSoftCounterChoice(s, true));            // pay → survives; drain resolves it afterwards
    expect(handSize(s, "ai")).toBe(1);                       // still discarded one
    expect(handSize(s, "user")).toBe(0);
  });
});

// ── 6. Runtime — Dinrova Horror: the rebind reaches TRIGGER PAYLOADS through the same assembly ─
// The flip-diff's fifth gained card — an ETB trigger whose payload is the bounce+discard pair. The
// payload program resolves through the stack (runEffectProgram), so the owner projection must hold
// on the trigger path too; this proves it rather than assuming it (audit law: every gained card
// confirmed at runtime when the path differs).
describe("THAT-PLAYER rebind — Dinrova Horror ETB trigger payload", () => {
  const DINROVA = { id: "c-dh", name: "Dinrova Horror", type: "Creature — Horror", mana: "{4}{U}{B}", power: 4, toughness: 4, keywords: [],
    oracle: "When this creature enters, return target permanent to its owner's hand, then that player discards a card." };
  it("classifies native-trigger (the flip-diff's fifth gain)", () => {
    expect(classifyCard(DINROVA)).toBe("native-trigger");
  });
  it("ETB → bounce the AI's bear, and the bear's OWNER (the AI) discards", () => {
    const base = setup({ oppBoard: [bear("b1", "ai")], oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    const dinrova = createPermanent({ id: "dh1", card: DINROVA, controller: "user" });
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [dinrova] } } };
    s = checkEnterTriggers(s, dinrova);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = drain(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.battlefield.length).toBe(0);   // the bear went home
    expect(handSize(s, "ai")).toBe(2);                  // +1 bear, −1 discarded
    expect(handSize(s, "user")).toBe(0);
  });
});

// ── 7. Runtime — Compelling Deterrence: the condition gates the discard, never the bounce ─────
describe("THAT-PLAYER rebind — Compelling Deterrence runtime (condition rides the bound atom)", () => {
  // Pin the cast to the BEAR — with a Zombie on the user's board there are two legal nonland
  // permanent targets, and the first-found action may aim at the wrong one.
  const cast1 = (s) => casts(s).find((a) => a.cardId === "cd1" && a.targets?.[0]?.id === "b1");
  it("WITH a Zombie → bounce AND the owner discards", () => {
    let s = setup({ hand: [{ ...COMPELLING_DETERRENCE, id: "cd1" }], mana: { U: 1, C: 1 },
      board: [zombie("z1")], oppBoard: [bear("b1", "ai")], oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    const cast = cast1(s);
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    expect(s.players.ai.battlefield.length).toBe(0);
    expect(handSize(s, "ai")).toBe(2);   // +1 bounced bear, −1 discarded
  });
  it("WITHOUT a Zombie → bounce only, NO discard (CREED — the condition is enforced, not dropped)", () => {
    let s = setup({ hand: [{ ...COMPELLING_DETERRENCE, id: "cd1" }], mana: { U: 1, C: 1 },
      board: [], oppBoard: [bear("b1", "ai")], oppHand: [hc("a1", "Keep", 5), hc("a2", "Pitch", 1)] });
    s = drain(dispatchAction(s, cast1(s)));
    expect(s.players.ai.battlefield.length).toBe(0);
    expect(handSize(s, "ai")).toBe(3);   // +1 bounced bear, nothing discarded
  });
});
