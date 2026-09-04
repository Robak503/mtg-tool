/**
 * copyTargetAbility.test.js — SHELF-85 runbook V6 slice 1 (2026-09-04): "Copy target [activated or] triggered ability
 * you control. You may choose new targets for the copy." — Peter Parker's Camera and Strionic Resonator (Brago ×2,
 * Killer Turts) and the unplanned twin Adric, Mathematical Genius (whose second line is the Stifle-class counter).
 *
 * The CAP-BRACERS lane copied the ability a TRIGGER fired on (a context referent). This is the CHOSEN-target twin:
 *   · the parser arm → { op: "copy-ability", targetType: "abilityYouControl", abilityKinds } (the printed kinds ride the
 *     target spec explicitly — the generic tail drops unknown fields);
 *   · the pool: the stack's ability objects of those kinds controlled by the activator (the Stifle-class target shape);
 *   · the resolver: a fresh-id copy of the chosen stack object, isCopy, same controller and targets ("may choose new
 *     targets" honoured as a decline);
 *   · THE STACK WINDOW: an activation whose only legal target lives on the stack is offered to the priority holder at
 *     any step while the stack holds an ability they control — the narrowest honest lane, gated per ability so every
 *     other activation keeps its main / combat window.
 * The AI's picker skips targeted activations, so its play is unchanged (a safe FN, on record).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RESONATOR = { id: "c-res", name: "Strionic Resonator", type: "Artifact", mana: "{2}", keywords: [],
  oracle: "{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy. (A triggered ability uses the words \"when,\" \"whenever,\" or \"at.\")" };
const CAMERA = { id: "c-cam", name: "Peter Parker's Camera", type: "Artifact", mana: "{1}", keywords: [],
  oracle: "This artifact enters with three film counters on it.\n{2}, {T}, Remove a film counter from this artifact: Copy target activated or triggered ability you control. You may choose new targets for the copy." };
const ADRIC = { id: "c-adric", name: "Adric, Mathematical Genius", type: "Legendary Creature — Human Artificer", mana: "{1}{U}", power: 1, toughness: 2, keywords: [],
  oracle: "{2}{U}, {T}: Copy target activated or triggered ability you control. You may choose new targets for the copy.\nUltimate Sacrifice — {1}{U}, Sacrifice Adric: Counter target activated or triggered ability.\nDoctor's companion" };
const DRAWER = { id: "c-drawer", name: "Probe Drawer", type: "Creature — Human", power: 1, toughness: 1, keywords: [], oracle: "{1}, {T}: Draw a card." };

const island = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" });
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `u-${i}`, name: "Card", type: "Instant", oracle: "" }));
const upkeepTrigger = (controller) => ({ event: "upkeep", source: { name: "Probe", permanentId: "src" }, controller, descriptor: { event: "upkeep", scope: "you", whose: "any", effectClause: "draw a card", interveningIf: null }, context: {}, targets: [], payload: {} });

/** The opponent's upkeep, the user holding priority, with `perms` on the user's side and the given trigger pending. */
function offTurn(perms, trigger = upkeepTrigger("user")) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  s = { ...s, phase: "beginning", step: "upkeep", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, turn: 2,
    players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: [...perms, island("L1"), island("L2"), island("L3")] }, ai: { ...s.players.ai, library: lib(6) } },
    pendingTriggers: [trigger] };
  return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
}
const offers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("parser — the chosen-target copy arm", () => {
  it("Resonator copies triggered abilities only; the Camera copies either kind", () => {
    expect(parseEffectClause("Copy target triggered ability you control. You may choose new targets for the copy.", "Artifact").atoms)
      .toEqual([{ op: "copy-ability", targetType: "abilityYouControl", abilityKinds: ["triggered"] }]);
    expect(parseEffectClause("Copy target activated or triggered ability you control. You may choose new targets for the copy.", "Artifact").atoms)
      .toEqual([{ op: "copy-ability", targetType: "abilityYouControl", abilityKinds: ["activated", "triggered"] }]);
  });
  it("CREED near-miss: no controller scope, or a spell, stays out of this arm", () => {
    expect(parseEffectClause("Copy target triggered ability. You may choose new targets for the copy.", "Artifact").confidence).toBe("low");
    expect(parseEffectClause("Copy target activated ability an opponent controls.", "Artifact").confidence).toBe("low");
  });
  it("the activated abilities parse HIGH with a chosen target", () => {
    for (const c of [RESONATOR, CAMERA]) {
      const ab = parseActivatedAbilities(c).find((x) => !x.isManaEffect);
      expect(ab.modeled).toBe(true);
      expect(ab.needsTarget).toBe(true);
    }
  });
});

describe("the stack window and the legal pool", () => {
  it("on the opponent's upkeep, with the user's trigger on the stack, the Resonator is offered targeting exactly that ability", () => {
    const s = offTurn([createPermanent({ id: "RES", card: RESONATOR, controller: "user" })]);
    expect(s.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const acts = offers(s, "RES");
    expect(acts).toHaveLength(1);
    expect(acts[0].targets).toEqual([expect.objectContaining({ type: "stackAbility", id: s.stack[0].id, controller: "user" })]);
  });
  it("an OPPONENT's trigger on the stack is never a target — nothing is offered", () => {
    const s = offTurn([createPermanent({ id: "RES", card: RESONATOR, controller: "user" })], upkeepTrigger("ai"));
    expect(s.stack).toHaveLength(1);
    expect(offers(s, "RES")).toHaveLength(0);
  });
  it("a MIXED stack (the user's trigger beside the opponent's) offers exactly the user's — the pool's own controller filter, not only the window's", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "beginning", step: "upkeep", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, turn: 2,
      players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: [createPermanent({ id: "RES", card: RESONATOR, controller: "user" }), island("L1"), island("L2")] }, ai: { ...s.players.ai, library: lib(6) } },
      pendingTriggers: [upkeepTrigger("ai"), upkeepTrigger("user")] };
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack).toHaveLength(2);
    const mine = s.stack.find((o) => o.controller === "user").id;
    const acts = offers(s, "RES");
    expect(acts).toHaveLength(1);
    expect(acts[0].targets[0].id).toBe(mine);
  });
  it("an empty stack in the user's own main phase offers nothing (no legal target)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 2,
      players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: [createPermanent({ id: "RES", card: RESONATOR, controller: "user" }), island("L1"), island("L2")] } } };
    expect(offers(s, "RES")).toHaveLength(0);
  });
  it("kinds: with the user's own ACTIVATED ability on the stack the Camera is offered and the Resonator is not", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 2,
      players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: [
        createPermanent({ id: "DR", card: DRAWER, controller: "user", summoningSick: false }),
        createPermanent({ id: "RES", card: RESONATOR, controller: "user" }),
        { ...createPermanent({ id: "CAM", card: CAMERA, controller: "user" }), counters: { film: 3 } },
        island("L1"), island("L2"), island("L3"), island("L4"),
      ] } } };
    const draw = offers(s, "DR")[0];
    expect(draw).toBeTruthy();
    s = dispatchAction(s, draw);
    expect(s.stack.map((o) => o.kind)).toEqual(["activated-ability"]);
    expect(offers(s, "RES")).toHaveLength(0);
    const cam = offers(s, "CAM");
    expect(cam).toHaveLength(1);
    expect(cam[0].targets[0]).toEqual(expect.objectContaining({ type: "stackAbility", id: s.stack[0].id }));
  });
});

describe("resolution — the copy is a real stack object that resolves on its own", () => {
  it("the Resonator taps, pays {2}, and the copied upkeep trigger draws a second card", () => {
    let s = offTurn([createPermanent({ id: "RES", card: RESONATOR, controller: "user" })]);
    const original = s.stack[0].id;
    s = dispatchAction(s, offers(s, "RES")[0]);
    expect(s.stack.map((o) => o.kind)).toEqual(["triggered-ability", "activated-ability"]);
    expect(s.players.user.battlefield.find((p) => p.id === "RES").tapped).toBe(true);
    s = resolveTopOfStack(s);
    expect(s.stack).toHaveLength(2);
    const copy = s.stack[1];
    expect(copy.kind).toBe("triggered-ability");
    expect(copy.isCopy).toBe(true);
    expect(copy.id).not.toBe(original);
    expect(copy.controller).toBe("user");
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(2);
  });
  it("the Camera spends a film counter", () => {
    let s = offTurn([{ ...createPermanent({ id: "CAM", card: CAMERA, controller: "user" }), counters: { film: 3 } }]);
    s = dispatchAction(s, offers(s, "CAM")[0]);
    expect(s.players.user.battlefield.find((p) => p.id === "CAM").counters.film).toBe(2);
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(2);
  });
  it("a target that already left the stack: the copy does nothing (CR 608.2b) — one card, not two", () => {
    let s = offTurn([createPermanent({ id: "RES", card: RESONATOR, controller: "user" })]);
    s = dispatchAction(s, offers(s, "RES")[0]);
    // Resolve the ORIGINAL first (the Resonator's ability was put on top; pull it aside by resolving from the bottom).
    const [trigger, ability] = s.stack;
    s = resolveTopOfStack({ ...s, stack: [ability, trigger] }); // the trigger resolves: one card
    expect(s.players.user.hand).toHaveLength(1);
    s = resolveAll(s);                                           // the copy ability finds no target: nothing
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
  });
});

describe("classifier — whole cards", () => {
  it("Resonator, Camera and Adric are native-activated", () => {
    expect(classifyCard(RESONATOR)).toBe("native-activated");
    expect(classifyCard(CAMERA)).toBe("native-activated");
    expect(classifyCard(ADRIC)).toBe("native-activated");
  });
});
