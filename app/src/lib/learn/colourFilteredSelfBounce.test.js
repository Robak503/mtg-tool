/**
 * colourFilteredSelfBounce.test.js — "return a <colour>[ or <colour>] creature you control to its owner's hand" (the 09-06
 * plan's stage ③, census row ④, 2026-09-30): Horned Kavu, Shivan Wurm, Silver Drake, Steel Leaf Paladin, Fleetfoot
 * Panther, Sparkcaster, Marsh Crocodile, Lava Zombie, Cavern Harpy, Razing Snidd on the ETB; Skull Collector, Stampeding
 * Serow, Stampeding Wildebeests, Trusted Advisor, Eiganjo Free-Riders, Oni of Wild Places on the upkeep.
 *
 * The bounce itself was machinery: "return a creature you control to its owner's hand" (Kor Skyfisher, Roaring Primadox)
 * parses to the forced own-choice scope `oneYouControlWorst`, picked at resolution by worstOwnBounceTarget. Only the
 * colour was missing. It rides as the SHARED restriction satisfier's `colorAny` kind (CR 105.2: a creature is red when red
 * is AMONG its colours; layer-aware and fail-closed in creatureRestrictions.js — the same evaluator Deathmark's "green or
 * white creature" uses), applied to the pick's pool.
 *
 * ⛔ The pool is the whole point: an off-colour creature is NEVER returned, even when it is the "least-bad" pick the
 * uncoloured form would make — and when the source is the only creature of the colour, it returns ITSELF (these cards do
 * not print "another"). Doomsday Specter, Sawtooth Loon, Veil of Secrecy and Escape Detection carry a second, unmodeled
 * line and stay parked.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { worstOwnBounceTarget } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

const HORNED_KAVU = { id: "kavu-c", name: "Horned Kavu", type: "Creature — Kavu", mana: "{R}{G}", colors: ["G", "R"], power: 3, toughness: 4,
  oracle: "When this creature enters, return a red or green creature you control to its owner's hand." };
const SKULL_COLLECTOR = { id: "skull-c", name: "Skull Collector", type: "Creature — Ogre Warrior", mana: "{1}{B}{B}", colors: ["B"], power: 3, toughness: 3,
  oracle: "At the beginning of your upkeep, return a black creature you control to its owner's hand.\n{1}{B}: Regenerate this creature." };
const CORAL_MERFOLK = { id: "merfolk-c", name: "Coral Merfolk", type: "Creature — Merfolk", mana: "{1}{U}", colors: ["U"], power: 2, toughness: 1, oracle: "" };
const BOROS_RECRUIT = { id: "recruit-c", name: "Boros Recruit", type: "Creature — Goblin Soldier", mana: "{R/W}", colors: ["R", "W"], power: 1, toughness: 1,
  oracle: "({R/W} can be paid with either {R} or {W}.)\nFirst strike" };

const C = (name, oracle, type, mana) => ({ name, oracle, type, mana });
const perm = (card, id, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });

function mainState(user = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } } },
  };
}
// Cast Horned Kavu onto `board`, let it enter, resolve its ETB.
function kavuEnters(board) {
  let s = mainState({ hand: [HORNED_KAVU], battlefield: board, manaPool: { R: 1, G: 1 } });
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "kavu-c");
  expect(cast).toBeTruthy();
  s = resolveTopOfStack(dispatchAction(s, cast)); // Kavu enters → its ETB goes on the stack
  expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
  return resolveTopOfStack(s);
}
const names = (zone) => zone.map((x) => x.card?.name ?? x.name);

describe("the sixteen classify native; the four with a second unmodeled line stay parked", () => {
  it("ETB and upkeep carriers → native", () => {
    const etb = (name, oracle, type, mana) => classifyCard(C(name, oracle, type, mana));
    expect(etb("Horned Kavu", HORNED_KAVU.oracle, "Creature — Kavu", "{R}{G}")).toBe("native-trigger");
    expect(etb("Shivan Wurm", "Trample\nWhen this creature enters, return a red or green creature you control to its owner's hand.", "Creature — Wurm", "{3}{R}{G}")).toBe("native-trigger");
    expect(etb("Silver Drake", "Flying\nWhen this creature enters, return a white or blue creature you control to its owner's hand.", "Creature — Drake", "{1}{W}{U}")).toBe("native-trigger");
    expect(etb("Stampeding Wildebeests", "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nAt the beginning of your upkeep, return a green creature you control to its owner's hand.", "Creature — Antelope Beast", "{2}{G}{G}")).toBe("native-trigger");
    expect(etb("Skull Collector", SKULL_COLLECTOR.oracle, SKULL_COLLECTOR.type, SKULL_COLLECTOR.mana)).toBe("native-mixed");
  });

  it("⛔ Doomsday Specter still parks on its hand-look discard (a second line)", () => {
    expect(classifyCard(C("Doomsday Specter", "Flying\nWhen this creature enters, return a blue or black creature you control to its owner's hand.\nWhenever this creature deals combat damage to a player, look at that player's hand and choose a card from it. The player discards that card.", "Creature — Specter", "{2}{U}{B}"))).toBe("body-only");
  });
});

describe("the parse — the existing forced own-choice bounce, plus the shared colour restriction", () => {
  it("two colours → a colorAny pair; one colour → a colorAny of one", () => {
    expect(parseEffectClause("return a red or green creature you control to its owner's hand").atoms).toEqual([
      { op: "bounce", scope: "oneYouControlWorst", creatureOnly: true, restrictions: [{ kind: "colorAny", colors: ["R", "G"] }] }]);
    expect(parseEffectClause("return a white creature you control to its owner's hand").atoms).toEqual([
      { op: "bounce", scope: "oneYouControlWorst", creatureOnly: true, restrictions: [{ kind: "colorAny", colors: ["W"] }] }]);
  });

  it("⛔ three colours, or a colour on a non-creature noun, do not ride this anchor", () => {
    const three = parseEffectClause("return a red or green or blue creature you control to its owner's hand");
    expect(three.atoms.some((a) => a.restrictions?.some((r) => r.kind === "colorAny"))).toBe(false);
    const artifact = parseEffectClause("return a red artifact you control to its owner's hand");
    expect(artifact.atoms.some((a) => a.restrictions?.some((r) => r.kind === "colorAny"))).toBe(false);
  });
});

describe("RUNTIME — the pool is the colour", () => {
  it("VACUITY CONTROL — without the colour, the least-bad pick is the first creature in order: the blue Merfolk", () => {
    const s = mainState({ battlefield: [perm(CORAL_MERFOLK, "p-m"), perm(HORNED_KAVU, "p-k")] });
    expect(worstOwnBounceTarget(s, "user", { creatureOnly: true }).map((t) => t.id)).toEqual(["p-m"]);
  });

  it("⭐ Horned Kavu beside a blue creature returns ITSELF — the Merfolk is never touched", () => {
    const out = kavuEnters([perm(CORAL_MERFOLK, "p-m")]);
    expect(names(out.players.user.battlefield)).toEqual(["Coral Merfolk"]);
    expect(names(out.players.user.hand)).toContain("Horned Kavu");
    console.log(`WITNESS colourBounceSelf ${JSON.stringify({ board: names(out.players.user.battlefield), hand: names(out.players.user.hand) })}`);
  });

  it("⭐ CR 105.2 — a red-white creature IS red: Boros Recruit is returned ahead of the Kavu (first in order), the Merfolk stays", () => {
    const out = kavuEnters([perm(CORAL_MERFOLK, "p-m"), perm(BOROS_RECRUIT, "p-r")]);
    expect(names(out.players.user.hand)).toEqual(["Boros Recruit"]);
    expect(names(out.players.user.battlefield).sort()).toEqual(["Coral Merfolk", "Horned Kavu"]);
  });

  it("⭐ the UPKEEP form: Skull Collector beside a blue creature returns itself at your upkeep", () => {
    const base = mainState({ battlefield: [perm(CORAL_MERFOLK, "p-m"), perm(SKULL_COLLECTOR, "p-sc")] });
    let s = { ...base, phase: "beginning", step: "upkeep" };
    s = flushTriggers(checkStepTriggers(s, "upkeep"));
    expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    let guard = 0;
    while ((s.stack || []).length && !s.pendingChoice && guard++ < 10) s = resolveTopOfStack(s);
    expect(names(s.players.user.battlefield)).toEqual(["Coral Merfolk"]);
    expect(names(s.players.user.hand)).toContain("Skull Collector");
    console.log(`WITNESS colourBounceUpkeep ${JSON.stringify({ board: names(s.players.user.battlefield), hand: names(s.players.user.hand) })}`);
  });

  it("⛔ FAIL-CLOSED: with no creature of the colour, nothing is returned (a clean no-op, never an off-colour pick)", () => {
    const s = mainState({ battlefield: [perm(CORAL_MERFOLK, "p-m")] });
    expect(worstOwnBounceTarget(s, "user", { creatureOnly: true, restrictions: [{ kind: "colorAny", colors: ["R", "G"] }] })).toEqual([]);
  });
});
