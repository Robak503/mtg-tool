/**
 * SHORELINE LOOTER + NIGHT OF THE SWEETS' REVENGE — SHELF-85 · Bumble Flower F6 (2026-09-05).
 * Looter: "Threshold — Whenever this creature deals combat damage to a player, draw a card. Then discard a card unless
 * there are seven or more cards in your graveyard." — the trailing rider grew its NEGATED connective: "<effect> unless
 * <board-condition>" rides as `condition` + `conditionNegate`, and the runner runs the atom only when the condition is
 * definitely false (CR 608.2). Sweets: "{5}{G}{G}, Sacrifice this enchantment: Creatures you control get +X/+X until end
 * of turn, where X is the number of Foods you control. Activate only as a sorcery." — the keyword-less Overrun-X twin,
 * X read at resolution from the count source (here the Food subtype count).
 *
 * Mutation-checked: see the run ledger (docs-sk66).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower } from "./gameState.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LOOTER = { name: "Shoreline Looter", type: "Creature — Rat Rogue", mana: "{1}{U}", keywords: [], power: 1, toughness: 1, oracle: "This creature can't be blocked.\nThreshold — Whenever this creature deals combat damage to a player, draw a card. Then discard a card unless there are seven or more cards in your graveyard." };
const SWEETS = { name: "Night of the Sweets' Revenge", type: "Enchantment", mana: "{3}{G}", keywords: [], oracle: "When this enchantment enters, create a Food token.\nFoods you control have \"{T}: Add {G}.\"\n{5}{G}{G}, Sacrifice this enchantment: Creatures you control get +X/+X until end of turn, where X is the number of Foods you control. Activate only as a sorcery." };
const perm = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const gy = (n) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: "Bone", type: "Sorcery", cmc: 1 }));
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };

describe("parse + classify", () => {
  it("the unless-tail parses to a discard with a negated board condition; Looter native-trigger. The bare Overrun-X parses to a Food-count team pump; Sweets native-mixed", () => {
    const l = parseEffectProgram({ name: "Probe", type: "Instant", mana: "{1}", keywords: [], oracle: "Draw a card. Then discard a card unless there are seven or more cards in your graveyard." });
    const w = parseEffectProgram({ name: "Probe", type: "Instant", mana: "{1}", keywords: [], oracle: "Creatures you control get +X/+X until end of turn, where X is the number of Foods you control." });
    const row = { l: [l.confidence, l.atoms.map((a) => [a.op, a.condition ?? null, a.conditionNegate ?? false])], w: [w.confidence, w.atoms], looterTier: classifyCard(LOOTER), sweetsTier: classifyCard(SWEETS) };
    console.log("  WITNESS lsParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.l).toEqual(["high", [["draw", null, false], ["discard", "there are seven or more cards in your graveyard", true]]]);
    expect(row.w).toEqual(["high", [{ op: "pump", scope: "youControl", ptDeltaCount: { kind: "permanentsYouControl", subtype: "Food" } }]]);
    expect(row.looterTier).toBe("native-trigger");
    expect(row.sweetsTier).toBe("native-mixed");
  });
});

describe("Shoreline Looter at resolution — the negated rider", () => {
  const run = (gyCount) => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...b, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", players: { ...b.players, user: { ...b.players.user, battlefield: [perm("lt", { ...LOOTER })], hand: [{ id: "H1", name: "Held", type: "Sorcery", cmc: 1 }], library: [{ id: "L1", name: "Drawn", type: "Sorcery", cmc: 1 }], graveyard: gy(gyCount) } } };
    s = settle(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "lt", defender: "ai", amount: 1 }]));
    return { hand: s.players.user.hand.length, gy: s.players.user.graveyard.length, pending: s.pendingChoice?.kind ?? null };
  };
  it("below threshold (6 in the graveyard): draw, then the discard runs (a discard pause / one fewer card); at threshold (7): draw and NO discard", () => {
    const row = { below: run(6), at: run(7) };
    console.log("  WITNESS looterResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.at).toEqual({ hand: 2, gy: 7, pending: null });          // drew the card, kept both — the rider was skipped
    expect(row.below).toEqual({ hand: 2, gy: 6, pending: "discard" });  // drew the card, then the discard PAUSES on the pick (the rider ran)
  });
});

describe("the negated rider on an UNREADABLE board condition (the parser never attaches one — this pins the runner's own guard)", () => {
  it("a hand-built discard atom with conditionNegate and a condition the evaluator cannot read (a null read) does NOT run — dropped, never fabricated, in the negated polarity too", () => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const s0 = { ...b, players: { ...b.players, user: { ...b.players.user, hand: [{ id: "H1", name: "Held", type: "Sorcery", cmc: 1 }] } } };
    const program = { version: 1, source: "parser", confidence: "high", structure: "sequence", atoms: [{ op: "discard", amount: 1, who: "controller", targetType: null, condition: "the moon is full tonight", conditionNegate: true }], modal: null, xSpell: false, unparsedTail: null };
    const st = runEffectProgram(s0, { source: { name: "Probe" }, payload: { params: { program, controller: "user", targets: [] } } });
    const row = { hand: st.players.user.hand.length, pending: st.pendingChoice?.kind ?? null };
    console.log("  WITNESS unlessNullRead", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ hand: 1, pending: null }); // the unreadable condition reads null → the negated rider is SKIPPED
  });
});

describe("Night of the Sweets' Revenge at resolution — X = Foods you control", () => {
  it("with two Foods, the sacrifice-activation pumps each creature you control by +2/+2 (read at resolution)", () => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const food = (id) => perm(id, { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", token: true });
    const bear = (id) => perm(id, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
    let s = { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], players: { ...b.players, user: { ...b.players.user, battlefield: [perm("sw", SWEETS), food("f1"), food("f2"), bear("b1"), bear("b2")], manaPool: { ...b.players.user.manaPool, G: 2, C: 5 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sw");
    expect(act).toBeTruthy();
    s = settle(dispatchAction(s, act));
    const row = { b1: creaturePower(s.players.user.battlefield.find((p) => p.id === "b1"), s), b2: creaturePower(s.players.user.battlefield.find((p) => p.id === "b2"), s), swGone: !s.players.user.battlefield.some((p) => p.id === "sw") };
    console.log("  WITNESS sweetsResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ b1: 4, b2: 4, swGone: true });
  });
});
