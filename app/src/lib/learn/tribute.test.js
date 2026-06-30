/**
 * TRIBUTE (CR 702.96) — the ETB opponent-choice keyword.
 *
 * "Tribute N (As this creature enters, an opponent of your choice may put N +1/+1 counters on it.)" — the
 * controller's chosen opponent decides AS the creature enters: PAY tribute (put N +1/+1 counters on it → a
 * strictly bigger body for the controller) OR DECLINE, in which case a separate "When this creature enters,
 * if tribute wasn't paid, <effect>" triggered ability (CR 702.96e) runs its payoff.
 *
 * End-to-end the engine GENUINELY resolves both branches:
 *   parser       → parseTribute reads the count; parseTributeCreature gates the whole card (re-classifies the
 *                  Tribute-line-stripped body — native iff the if-not ETB trigger routes HIGH AND
 *                  "tribute wasn't paid" is in the strict intervening-if vocabulary).
 *   coverage     → native-trigger / native-mixed (the body's tier).
 *   resolvers    → enterPermanent resolves the opponent's decision (decideTribute): PAID → add N +1/+1
 *                  counters + stamp perm.tributePaid=true; DECLINED → tributePaid=false, and the
 *                  "if tribute wasn't paid" ETB trigger fires its payoff via checkEnterTriggers →
 *                  buildTriggerStack, gated on the "tribute wasn't paid" intervening-if reading the flag.
 *
 * CREED-critical: a PAID entry adds the counters AND the conditional trigger is DROPPED (CR 603.4 — the
 * intervening-if is false); a DECLINED entry adds NO counters AND the effect fires EXACTLY once; every
 * deferred shape (an unmodeled if-not effect — gain control / a granted dies-trigger / an optional fight)
 * stays body-only — never a fabricated native credit.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseTribute, stripTributeLine, parseTributeCreature, decideTribute, tributeIfNotClause } from "./tribute.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { enterPermanent } from "./resolvers.js";
import { createPermanent, _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) ─────────────────────────────────────────────────
// The eight whole-card-CREED-clean Tribute creatures (a modeled if-not effect).
const SNAKE = { name: "Snake of the Golden Grove", type: "Creature — Snake", mana: "{4}{G}", power: 4, toughness: 4,
  oracle: "Tribute 3 (As this creature enters, an opponent of your choice may put three +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, you gain 4 life." };
const PHARAGAX = { name: "Pharagax Giant", type: "Creature — Giant", mana: "{4}{R}", power: 3, toughness: 3,
  oracle: "Tribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, this creature deals 5 damage to each opponent." };
const ORNITHARCH = { name: "Ornitharch", type: "Creature — Archon", mana: "{3}{W}{W}", power: 3, toughness: 3,
  oracle: "Flying\nTribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, create two 1/1 white Bird creature tokens with flying." };
const NESSIAN_DEMOLOK = { name: "Nessian Demolok", type: "Creature — Beast", mana: "{3}{G}{G}", power: 3, toughness: 3,
  oracle: "Tribute 3 (As this creature enters, an opponent of your choice may put three +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, destroy target noncreature permanent." };
const SHRIKE_HARPY = { name: "Shrike Harpy", type: "Creature — Harpy", mana: "{3}{B}{B}", power: 2, toughness: 2,
  oracle: "Flying\nTribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, target opponent sacrifices a creature of their choice." };
const THUNDER_BRUTE = { name: "Thunder Brute", type: "Creature — Cyclops", mana: "{4}{R}{R}", power: 5, toughness: 5,
  oracle: "Trample\nTribute 3 (As this creature enters, an opponent of your choice may put three +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, it gains haste until end of turn." };
const FANATIC_OF_XENAGOS = { name: "Fanatic of Xenagos", type: "Creature — Centaur Warrior", mana: "{1}{R}{G}", power: 3, toughness: 3,
  oracle: "Trample\nTribute 1 (As this creature enters, an opponent of your choice may put a +1/+1 counter on it.)\nWhen this creature enters, if tribute wasn't paid, it gets +1/+1 and gains haste until end of turn." };
const ORACLE_OF_BONES = { name: "Oracle of Bones", type: "Creature — Minotaur Shaman", mana: "{2}{R}{R}", power: 3, toughness: 1,
  oracle: "Haste\nTribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, you may cast an instant or sorcery spell from your hand without paying its mana cost." };

const NATIVE_EIGHT = [SNAKE, PHARAGAX, ORNITHARCH, NESSIAN_DEMOLOK, SHRIKE_HARPY, THUNDER_BRUTE, FANATIC_OF_XENAGOS, ORACLE_OF_BONES];

// PARKED — the if-not effect is unmodeled (CREED whole-card; these stay body-only, never a fabricated credit).
const SIREN = { name: "Siren of the Fanged Coast", type: "Creature — Siren", mana: "{3}{U}{U}", power: 1, toughness: 1,
  oracle: "Flying\nTribute 3 (As this creature enters, an opponent of your choice may put three +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, gain control of target creature." };
const FLAME_WREATHED_PHOENIX = { name: "Flame-Wreathed Phoenix", type: "Creature — Phoenix", mana: "{2}{R}{R}", power: 3, toughness: 3,
  oracle: "Flying\nTribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, it gains haste and \"When this creature dies, return it to its owner's hand.\"" };
// NOW NATIVE — the if-not "you may have this creature fight another target creature" is modeled as a
// source-bound ETB-FIGHT (CR 701.12); the bare body re-classifies native, so the whole card is credited.
const NESSIAN_WILDS_RAVAGER = { name: "Nessian Wilds Ravager", type: "Creature — Hydra", mana: "{4}{G}{G}", power: 6, toughness: 6,
  oracle: "Tribute 6 (As this creature enters, an opponent of your choice may put six +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn't paid, you may have this creature fight another target creature. (Each deals damage equal to its power to the other.)" };

// ── Parser units ────────────────────────────────────────────────────────────────────────────────────
describe("TRIBUTE parser — parseTribute", () => {
  it("reads the tribute count for each clean card", () => {
    expect(parseTribute(SNAKE)).toEqual({ n: 3 });
    expect(parseTribute(PHARAGAX)).toEqual({ n: 2 });
    expect(parseTribute(FANATIC_OF_XENAGOS)).toEqual({ n: 1 });
    expect(parseTribute(NESSIAN_WILDS_RAVAGER)).toEqual({ n: 6 });
  });
  it("returns null for a card with no Tribute keyword", () => {
    expect(parseTribute({ oracle: "Flying\nWhen this creature enters, draw a card." })).toBeNull();
    expect(parseTribute({ oracle: "" })).toBeNull();
    expect(parseTribute({})).toBeNull();
  });
  it("does not false-fire on a mid-text 'tribute' mention (line-anchored)", () => {
    expect(parseTribute({ oracle: "Whenever you pay tribute 2 mana, draw." })).toBeNull();
  });
});

describe("TRIBUTE parser — stripTributeLine", () => {
  it("removes the Tribute line, leaving the keyword + the if-not trigger", () => {
    const body = stripTributeLine(SNAKE.oracle);
    expect(body).not.toMatch(/tribute \d/i);
    expect(body).toMatch(/if tribute wasn't paid, you gain 4 life/);
  });
  it("leaves the leading keyword line intact (Flying / Trample / Haste)", () => {
    expect(stripTributeLine(ORNITHARCH.oracle)).toMatch(/^Flying/);
    expect(stripTributeLine(THUNDER_BRUTE.oracle)).toMatch(/^Trample/);
  });
});

describe("TRIBUTE parser — tributeIfNotClause", () => {
  it("isolates the 'if tribute wasn't paid' effect text", () => {
    expect(tributeIfNotClause(SNAKE)).toBe("you gain 4 life.");
    expect(tributeIfNotClause(PHARAGAX)).toBe("this creature deals 5 damage to each opponent.");
    expect(tributeIfNotClause(NESSIAN_DEMOLOK)).toBe("destroy target noncreature permanent.");
  });
});

describe("TRIBUTE parser — decideTribute (the opponent's value choice)", () => {
  it("PAYS (true) to deny a HARMFUL if-not effect (damage to each opponent / edict / destroy)", () => {
    expect(decideTribute(tributeIfNotClause(PHARAGAX))).toBe(true);       // 5 damage to each opponent
    expect(decideTribute(tributeIfNotClause(SHRIKE_HARPY))).toBe(true);   // target opponent sacrifices a creature
    expect(decideTribute(tributeIfNotClause(NESSIAN_DEMOLOK))).toBe(true); // destroy target noncreature permanent
  });
  it("DECLINES (false) when the if-not effect is pure upside for the controller (gain life / tokens / self-pump)", () => {
    expect(decideTribute(tributeIfNotClause(SNAKE))).toBe(false);             // you gain 4 life
    expect(decideTribute(tributeIfNotClause(ORNITHARCH))).toBe(false);        // create two 1/1 Birds
    expect(decideTribute(tributeIfNotClause(THUNDER_BRUTE))).toBe(false);     // it gains haste EOT
    expect(decideTribute(tributeIfNotClause(FANATIC_OF_XENAGOS))).toBe(false); // it gets +1/+1 + haste EOT
    expect(decideTribute(tributeIfNotClause(ORACLE_OF_BONES))).toBe(false);   // free-cast (upside)
  });
  it("DECLINES (false) for an unrecognized clause — the safe default (never a fabricated 'pay')", () => {
    expect(decideTribute("some unmodeled effect happens")).toBe(false);
    expect(decideTribute("")).toBe(false);
  });
});

describe("TRIBUTE parser — parseTributeCreature (whole-card gate)", () => {
  it("returns { n, bodyTier } for each of the eight clean cards", () => {
    for (const c of NATIVE_EIGHT) {
      const spec = parseTributeCreature(c, classifyCard, isNativeTier);
      expect(spec, c.name).not.toBeNull();
      expect(spec.n, c.name).toBe(parseTribute(c).n);
      expect(isNativeTier(spec.bodyTier), c.name).toBe(true);
    }
  });
  it("returns null for the PARKED cards (unmodeled if-not effect)", () => {
    expect(parseTributeCreature(SIREN, classifyCard, isNativeTier)).toBeNull();           // gain control of a creature — unmodeled
    expect(parseTributeCreature(FLAME_WREATHED_PHOENIX, classifyCard, isNativeTier)).toBeNull(); // grants a quoted dies-trigger — unmodeled
  });
  it("Nessian Wilds Ravager now classifies native — its 'you may have this creature fight another target creature' if-not is modeled (source-bound ETB-FIGHT, CR 701.12)", () => {
    const spec = parseTributeCreature(NESSIAN_WILDS_RAVAGER, classifyCard, isNativeTier);
    expect(spec).not.toBeNull();
    expect(spec.n).toBe(6);
    expect(isNativeTier(spec.bodyTier)).toBe(true);
  });
  it("returns null for a non-creature (no Tribute creature is a non-creature, but the gate is type-guarded)", () => {
    expect(parseTributeCreature({ type: "Artifact", oracle: "Tribute 2\nWhen this enters, if tribute wasn't paid, you gain 4 life." }, classifyCard, isNativeTier)).toBeNull();
  });
  it("returns null when an extra unmodeled body clause remains (all-or-nothing CREED)", () => {
    const rider = { name: "Rider", type: "Creature — Beast", mana: "{4}{G}",
      oracle: "Tribute 3 (reminder)\nWhen this creature enters, if tribute wasn't paid, you gain 4 life.\nOther creatures you control get +1/+0 as long as it's your turn." };
    expect(parseTributeCreature(rider, classifyCard, isNativeTier)).toBeNull();
  });
});

// ── interveningIf — the strict per-permanent tribute flag ────────────────────────────────────────────
describe("TRIBUTE interveningIf — 'tribute wasn't paid' / 'tribute was paid'", () => {
  it("both shapes are in the parseable vocabulary (so coverage + the flush gate credit them)", () => {
    expect(interveningIfParseable("tribute wasn't paid")).toBe(true);
    expect(interveningIfParseable("tribute was paid")).toBe(true);
  });
  it("reads the entering permanent's tributePaid flag — 'wasn't paid' is true iff declined", () => {
    const declined = createPermanent({ id: "p1", card: { name: "X", type: "Creature" }, controller: "user" });
    declined.tributePaid = false;
    const paid = createPermanent({ id: "p2", card: { name: "X", type: "Creature" }, controller: "user" });
    paid.tributePaid = true;
    const state = (perm) => ({ players: { user: { battlefield: [perm] } } });
    expect(evaluateInterveningIf(state(declined), "tribute wasn't paid", "user", { triggeringPermanentId: "p1" })).toBe(true);
    expect(evaluateInterveningIf(state(paid), "tribute wasn't paid", "user", { triggeringPermanentId: "p2" })).toBe(false);
    expect(evaluateInterveningIf(state(paid), "tribute was paid", "user", { triggeringPermanentId: "p2" })).toBe(true);
    expect(evaluateInterveningIf(state(declined), "tribute was paid", "user", { triggeringPermanentId: "p1" })).toBe(false);
  });
  it("returns null (FN-safe) when the flag is unstamped or no entering permanent — never fail-open", () => {
    const unflagged = createPermanent({ id: "p3", card: { name: "X", type: "Creature" }, controller: "user" });
    expect(evaluateInterveningIf({ players: { user: { battlefield: [unflagged] } } }, "tribute wasn't paid", "user", { triggeringPermanentId: "p3" })).toBeNull();
    expect(evaluateInterveningIf({ players: { user: { battlefield: [] } } }, "tribute wasn't paid", "user", {})).toBeNull();
  });
});

// ── Coverage ──────────────────────────────────────────────────────────────────────────────────────
describe("TRIBUTE coverage — the eight clean creatures classify native", () => {
  for (const c of NATIVE_EIGHT) {
    it(`${c.name} → native`, () => {
      expect(isNativeTier(classifyCard(c))).toBe(true);
      expect(classifyCard(c)).toBe("native-trigger");
    });
  }
});

describe("TRIBUTE coverage — CREED anti-FP: deferred shapes stay body-only", () => {
  it("Siren of the Fanged Coast (gain control of target creature — unmodeled) stays body-only", () => {
    expect(classifyCard(SIREN)).toBe("body-only");
  });
  it("Flame-Wreathed Phoenix (grants a quoted dies-trigger — unmodeled) stays body-only", () => {
    expect(classifyCard(FLAME_WREATHED_PHOENIX)).toBe("body-only");
  });
});

describe("TRIBUTE coverage — newly-modeled if-not (source-bound ETB-FIGHT, CR 701.12)", () => {
  it("Nessian Wilds Ravager (optional 'fight another target creature') now classifies native", () => {
    expect(isNativeTier(classifyCard(NESSIAN_WILDS_RAVAGER))).toBe(true);
  });
});

// ── Runtime helpers ────────────────────────────────────────────────────────────────────────────────
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function setup({ hand = [], mana = {}, oppBoard = [] } = {}) {
  const s = mainState();
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, manaPool: { ...s.players.user.manaPool, ...mana } }, ai: { ...s.players.ai, battlefield: oppBoard } } };
}
// A SOLO state (the controller has NO opponent) — CR 702.96a: no opponent to pay tribute → declined → the
// if-not effect fires. The cleanest way to exercise the DECLINE branch deterministically.
function soloState(hand = []) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, players: { user: { ...base.players.user, hand } }, turnOrder: ["user"], activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
}
const casts = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell");
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];
function drainStack(s) {
  let guard = 0;
  while (s.stack && s.stack.length && guard++ < 40) s = resolveTopOfStack(s);
  return s;
}
function castAndDrain(state, action) {
  return drainStack(dispatchAction(state, action));
}
// Enter a creature in a solo state (forced decline) and flush its ETB trigger.
function enterSoloAndFlush(card) {
  let s = soloState();
  s = enterPermanent(s, { ...card }, "user");
  return drainStack(finalizeStackResolution(s));
}

// ── Runtime: the PAID branch (an opponent pays → counters added, the conditional trigger dropped) ────
describe("TRIBUTE runtime — PAID: counters added, the 'if tribute wasn't paid' trigger is dropped (CR 603.4)", () => {
  it("Pharagax Giant — the AI PAYS (avoids 5 damage) → 5/5 with two +1/+1 counters, no damage to the opponent", () => {
    const s = setup({ hand: [{ ...PHARAGAX, id: "c1" }], mana: { R: 5 } });
    const a = casts(s).find((x) => x.cardId === "c1");
    expect(a).toBeTruthy();
    const aiLifeBefore = s.players.ai.life;
    const after = castAndDrain(s, a);
    const perm = enteredPerm(after);
    expect(perm.tributePaid).toBe(true);
    expect(perm.counters?.["+1/+1"]).toBe(2);
    expect(permanentPower(after, perm.id)).toBe(5);
    expect(permanentToughness(after, perm.id)).toBe(5);
    expect(after.players.ai.life).toBe(aiLifeBefore); // no damage — the trigger was dropped at flush
  });
  it("Nessian Demolok — the AI PAYS (saves its artifact) → 6/6 with three counters, the artifact survives", () => {
    const art = createPermanent({ id: "art1", card: { name: "Mind Stone", id: "sc", type: "Artifact", oracle: "" }, controller: "ai" });
    const s = setup({ hand: [{ ...NESSIAN_DEMOLOK, id: "c1" }], mana: { G: 5 }, oppBoard: [art] });
    const after = castAndDrain(s, casts(s).find((x) => x.cardId === "c1"));
    const perm = enteredPerm(after);
    expect(perm.tributePaid).toBe(true);
    expect(perm.counters?.["+1/+1"]).toBe(3);
    expect(after.players.ai.battlefield.filter((p) => /Artifact/.test(p.card.type))).toHaveLength(1);
  });
});

// ── Runtime: the DECLINE branch (no opponent pays → no counters, the if-not effect fires) ────────────
describe("TRIBUTE runtime — DECLINE (upside if-not effects the AI denies): the effect fires, no counters", () => {
  it("Snake of the Golden Grove — the AI DECLINES (denies free counters) → you gain 4 life, 4/4 (no counters)", () => {
    const s = setup({ hand: [{ ...SNAKE, id: "c1" }], mana: { G: 5 } });
    const userLifeBefore = s.players.user.life;
    const after = castAndDrain(s, casts(s).find((x) => x.cardId === "c1"));
    const perm = enteredPerm(after);
    expect(perm.tributePaid).toBe(false);
    expect(perm.counters?.["+1/+1"] || 0).toBe(0);
    expect(after.players.user.life).toBe(userLifeBefore + 4);
  });
  it("Ornitharch — the AI DECLINES → two 1/1 flying Bird tokens enter (no counters on the Archon)", () => {
    const s = setup({ hand: [{ ...ORNITHARCH, id: "c1" }], mana: { W: 5 } });
    const after = castAndDrain(s, casts(s).find((x) => x.cardId === "c1"));
    const perm = after.players.user.battlefield.find((p) => p.card.name === "Ornitharch");
    expect(perm.tributePaid).toBe(false);
    expect(perm.counters?.["+1/+1"] || 0).toBe(0);
    const birds = after.players.user.battlefield.filter((p) => /Bird/.test(p.card.type || "") || /Bird/.test(p.card.name || ""));
    expect(birds.length).toBe(2);
  });
  it("Thunder Brute — the AI DECLINES → it gains haste until end of turn (no counters)", () => {
    const after = enterSoloAndFlush(THUNDER_BRUTE);
    const perm = after.players.user.battlefield.find((p) => p.card.name === "Thunder Brute");
    expect(perm.tributePaid).toBe(false);
    expect(perm.counters?.["+1/+1"] || 0).toBe(0);
    expect(permanentHasKeyword(after, perm.id, "Haste")).toBe(true);
  });
  it("Fanatic of Xenagos — the AI DECLINES → it gets +1/+1 and gains haste EOT (3/3 → 4/4, no counters)", () => {
    const after = enterSoloAndFlush(FANATIC_OF_XENAGOS);
    const perm = after.players.user.battlefield.find((p) => p.card.name === "Fanatic of Xenagos");
    expect(perm.tributePaid).toBe(false);
    expect(perm.counters?.["+1/+1"] || 0).toBe(0); // the +1/+1 is a temp pump, NOT a counter
    expect(permanentPower(after, perm.id)).toBe(4);
    expect(permanentToughness(after, perm.id)).toBe(4);
    expect(permanentHasKeyword(after, perm.id, "Haste")).toBe(true);
  });
  it("Oracle of Bones — the AI DECLINES → a free-cast decision is offered (pendingFreeCast set, the instant is eligible)", () => {
    // The free-cast atom parks an eligible instant/sorcery from hand (the proven discover/free-cast seam); the
    // driver then resolves the cast-free / decline at the action layer. A bolt in hand makes the decision real.
    let s = soloState([{ id: "spell1", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." }]);
    s = enterPermanent(s, { ...ORACLE_OF_BONES }, "user");
    const after = drainStack(finalizeStackResolution(s));
    const perm = after.players.user.battlefield.find((p) => p.card.name === "Oracle of Bones");
    expect(perm.tributePaid).toBe(false);
    expect(after.pendingFreeCast).toMatchObject({ controller: "user", typeFilter: "instantSorcery" });
    expect(after.pendingFreeCast.candidateIds).toContain("spell1");
  });
});

// ── Runtime: the HARMFUL if-not effects GENUINELY fire when tribute is declined ──────────────────────
// The AI auto-PAYS to avoid these, so to prove the effect resolves we force the DECLINE branch: enter on a
// real opponent board, stamp tributePaid=false (the opponent choosing to decline despite the harm — a legal
// CR 702.96a choice), and re-fire the ETB trigger. This pins that the modeled if-not atom actually resolves.
describe("TRIBUTE runtime — DECLINED harmful effects resolve (anti-latent-FP)", () => {
  function forceDeclineAndFire(card, oppBoard) {
    let s = setup({ oppBoard });
    s = enterPermanent(s, { ...card }, "user");
    let perm = s.players.user.battlefield.find((p) => p.card.name === card.name);
    // Force the decline branch on the just-entered permanent and re-fire its ETB trigger.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === perm.id ? { ...p, tributePaid: false, counters: {} } : p)) } }, pendingTriggers: [] };
    perm = s.players.user.battlefield.find((p) => p.id === perm.id);
    s = checkEnterTriggers(s, perm);
    return drainStack(finalizeStackResolution(s));
  }
  it("Pharagax Giant — declined → deals 5 damage to each opponent", () => {
    const after = forceDeclineAndFire(PHARAGAX, []);
    expect(after.players.ai.life).toBe(40 - 5);
  });
  it("Shrike Harpy — declined → target opponent sacrifices a creature", () => {
    const bear = createPermanent({ id: "b1", card: { name: "Grizzly Bears", id: "bc", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    const after = forceDeclineAndFire(SHRIKE_HARPY, [bear]);
    expect(after.players.ai.battlefield.filter((p) => /Creature/.test(p.card.type))).toHaveLength(0);
    expect((after.players.ai.graveyard || []).map((c) => c.name)).toContain("Grizzly Bears");
  });
  it("Nessian Demolok — declined → destroys a target noncreature permanent", () => {
    const art = createPermanent({ id: "a1", card: { name: "Mind Stone", id: "sc", type: "Artifact", oracle: "" }, controller: "ai" });
    const after = forceDeclineAndFire(NESSIAN_DEMOLOK, [art]);
    expect(after.players.ai.battlefield.filter((p) => /Artifact/.test(p.card.type))).toHaveLength(0);
  });
});

// ── Runtime: no opponent → tribute can't be paid → declined (CR 702.96a) ─────────────────────────────
describe("TRIBUTE runtime — with NO opponent, tribute is declined (CR 702.96a — 'an opponent of your choice')", () => {
  it("Snake of the Golden Grove in a solo game → declined → you gain 4 life", () => {
    const after = enterSoloAndFlush(SNAKE);
    const perm = after.players.user.battlefield.find((p) => p.card.name === "Snake of the Golden Grove");
    expect(perm.tributePaid).toBe(false);
    expect(after.players.user.life).toBe(40 + 4);
  });
});
