/**
 * sacrificeLandsAltCost.test.js — "[If it's your turn, ]you may sacrifice a Mountain / two Mountains rather than pay this spell's
 * mana cost." and "[If you control a Swamp, ]you may sacrifice a creature rather than pay this spell's mana cost." (the 09-06
 * plan's stage ③, census row ⑥, 2026-09-30): Thunderclap, Crash, Mine Collapse, Fireblast, Mogg Alarm, Pulverize, Dark Triumph.
 *
 * The alternative-cost lane was machinery (the Flare cycle's "sacrifice a nontoken <colour> creature", Gush's "return two
 * Islands", ② · 1's tap-a-creature). Three small pieces:
 *   · sacrificeLands — a new kind. The offer is ONE canonical land set on Gush's reasoning: same-subtype lands are
 *     near-fungible and a TAPPED land is strictly cheaper to give up, so tapped first, then untapped, id-ascending — never
 *     C(n,k) near-identical payments. The dispatcher sacrifices each through the cost path the creature sacrifice uses.
 *   · the colourless "sacrifice a creature" — the Flare arm's unfiltered sibling (color:null → any creature).
 *   · "If it's your turn" — the mirror of "it's not your turn" in the condition vocabulary (Mine Collapse).
 * Delraich (three black creatures) and Hand of Emrakul (four Eldrazi Spawn) stay parked: creatures are not fungible, so
 * "sacrifice N" there is the banked agency-vs-explosion design question, not this slice.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { extractAltCost } from "./effects/castModifiers.js";

beforeEach(() => _resetIdsForTests());

const FIREBLAST = { id: "fb", name: "Fireblast", type: "Instant", mana: "{4}{R}{R}",
  oracle: "You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireblast deals 4 damage to any target." };
const THUNDERCLAP = { id: "tc", name: "Thunderclap", type: "Instant", mana: "{2}{R}",
  oracle: "You may sacrifice a Mountain rather than pay this spell's mana cost.\nThunderclap deals 3 damage to target creature." };
const MINE_COLLAPSE = { id: "mc", name: "Mine Collapse", type: "Instant", mana: "{3}{R}",
  oracle: "If it's your turn, you may sacrifice a Mountain rather than pay this spell's mana cost.\nMine Collapse deals 5 damage to target creature or planeswalker." };
const DARK_TRIUMPH = { id: "dt", name: "Dark Triumph", type: "Instant", mana: "{4}{B}",
  oracle: "If you control a Swamp, you may sacrifice a creature rather than pay this spell's mana cost.\nCreatures you control get +2/+0 until end of turn." };
const MOGG_ALARM = { name: "Mogg Alarm", type: "Sorcery", mana: "{1}{R}{R}",
  oracle: "You may sacrifice two Mountains rather than pay this spell's mana cost.\nCreate two 1/1 red Goblin creature tokens." };
const CRASH = { name: "Crash", type: "Instant", mana: "{2}{R}", oracle: "You may sacrifice a Mountain rather than pay this spell's mana cost.\nDestroy target artifact." };
const PULVERIZE = { name: "Pulverize", type: "Sorcery", mana: "{4}{R}{R}", oracle: "You may sacrifice two Mountains rather than pay this spell's mana cost.\nDestroy all artifacts." };
const DELRAICH = { name: "Delraich", type: "Creature — Horror", mana: "{6}{B}", power: 6, toughness: 6,
  oracle: "You may sacrifice three black creatures rather than pay this spell's mana cost.\nTrample" };
const MOUNTAIN = (id) => ({ id: `${id}-c`, name: "Mountain", type: "Basic Land — Mountain", oracle: "({T}: Add {R}.)" });
const SWAMP = (id) => ({ id: `${id}-c`, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" });
const BEAR = (id) => ({ id: `${id}-c`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });
const perm = (card, id, controller = "user", extra = {}) => createPermanent({ id, card, controller, summoningSick: false, ...extra });

function state({ user = {}, ai = {}, active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, ...user }, ai: { ...s.players.ai, ...ai } },
  };
}
const altCasts = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId && a.altCost);

describe("the seven classify native; the N-creature forms stay parked", () => {
  it("Thunderclap, Crash, Mine Collapse, Fireblast, Mogg Alarm, Pulverize, Dark Triumph → native-spell", () => {
    for (const c of [THUNDERCLAP, CRASH, MINE_COLLAPSE, FIREBLAST, MOGG_ALARM, PULVERIZE, DARK_TRIUMPH]) expect(classifyCard(c)).toBe("native-spell");
  });

  it("⛔ Delraich (three black creatures) stays parked — creatures aren't fungible; that is the banked design question", () => {
    expect(classifyCard(DELRAICH)).not.toMatch(/^native/);
  });

  it("the parse: count, subtype and condition ride the descriptor", () => {
    expect(extractAltCost(FIREBLAST.oracle).altCost).toEqual({ kind: "sacrificeLands", count: 2, subtype: "Mountain", condition: "always" });
    expect(extractAltCost(MINE_COLLAPSE.oracle).altCost).toEqual({ kind: "sacrificeLands", count: 1, subtype: "Mountain", condition: "yourTurn" });
    expect(extractAltCost(DARK_TRIUMPH.oracle).altCost).toEqual({ kind: "sacrificeCreature", nontoken: false, color: null, condition: "controlLand:Swamp" });
  });
});

describe("RUNTIME — the lands are the payment", () => {
  it("⭐ Fireblast with three Mountains and no mana: ONE payment per target, the TAPPED Mountain first; 4 to the face", () => {
    const s = state({ user: { hand: [FIREBLAST], battlefield: [perm(MOUNTAIN("m1"), "p-m1"), perm(MOUNTAIN("m2"), "p-m2", "user", { tapped: true }), perm(MOUNTAIN("m3"), "p-m3")] } });
    const atFace = altCasts(s, "fb").filter((a) => (a.targets || []).some((t) => t.id === "ai"));
    expect(atFace).toHaveLength(1); // never C(3,2) near-identical payments
    expect(atFace[0].altCost.sacLandIds).toEqual(["p-m2", "p-m1"]); // tapped first, then id-ascending
    const lifeBefore = s.players.ai.life;
    let out = dispatchAction(s, atFace[0]);
    expect(out.players.user.battlefield.map((p) => p.id)).toEqual(["p-m3"]);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Mountain", "Mountain"]);
    out = resolveTopOfStack(out);
    expect(out.players.ai.life).toBe(lifeBefore - 4);
    console.log(`WITNESS fireblastAlt ${JSON.stringify({ sacrificed: atFace[0].altCost.sacLandIds, left: out.players.user.battlefield.map((p) => p.id), aiLifeLost: lifeBefore - out.players.ai.life })}`);
  });

  it("⛔ one Mountain is not enough for Fireblast — no alternative cast is offered", () => {
    const s = state({ user: { hand: [FIREBLAST], battlefield: [perm(MOUNTAIN("m1"), "p-m1")] } });
    expect(altCasts(s, "fb")).toEqual([]);
  });

  it("Thunderclap: a single Mountain pays for 3 damage", () => {
    const s = state({ user: { hand: [THUNDERCLAP], battlefield: [perm(MOUNTAIN("m1"), "p-m1")] }, ai: { battlefield: [perm(BEAR("b"), "p-b", "ai")] } });
    const alt = altCasts(s, "tc").find((a) => (a.targets || []).some((t) => t.id === "p-b"));
    expect(alt?.altCost.sacLandIds).toEqual(["p-m1"]);
    const out = resolveTopOfStack(dispatchAction(s, alt));
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    expect(out.players.user.battlefield).toHaveLength(0);
  });

  it("⭐ Mine Collapse is offered on YOUR turn only", () => {
    const board = { user: { hand: [MINE_COLLAPSE], battlefield: [perm(MOUNTAIN("m1"), "p-m1")] }, ai: { battlefield: [perm(BEAR("b"), "p-b", "ai")] } };
    expect(altCasts(state({ ...board, active: "user" }), "mc").length).toBeGreaterThan(0);
    expect(altCasts(state({ ...board, active: "ai" }), "mc")).toEqual([]);
  });

  it("⭐ Dark Triumph: a Swamp opens it, any creature pays — and without a Swamp it is closed", () => {
    const withSwamp = state({ user: { hand: [DARK_TRIUMPH], battlefield: [perm(SWAMP("s1"), "p-s1"), perm(BEAR("b1"), "p-b1"), perm(BEAR("b2"), "p-b2")] } });
    const alts = altCasts(withSwamp, "dt");
    expect(alts.map((a) => a.altCost.sacId).sort()).toEqual(["p-b1", "p-b2"]); // one payment per creature — creatures aren't fungible
    const out = resolveTopOfStack(dispatchAction(withSwamp, alts.find((a) => a.altCost.sacId === "p-b1")));
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    const noSwamp = state({ user: { hand: [DARK_TRIUMPH], battlefield: [perm(BEAR("b1"), "p-b1")] } });
    expect(altCasts(noSwamp, "dt")).toEqual([]);
  });

  it("⛔ the dispatcher fails fast on a malformed payment — the wrong count, or a land of the wrong type", () => {
    const s = state({ user: { hand: [FIREBLAST], battlefield: [perm(MOUNTAIN("m1"), "p-m1"), perm(MOUNTAIN("m2"), "p-m2"), perm(SWAMP("s1"), "p-s1")] } });
    const good = altCasts(s, "fb").find((a) => (a.targets || []).some((t) => t.id === "ai"));
    expect(() => dispatchAction(s, { ...good, altCost: { ...good.altCost, sacLandIds: ["p-m1"] } })).toThrow(DispatcherError);
    expect(() => dispatchAction(s, { ...good, altCost: { ...good.altCost, sacLandIds: ["p-m1", "p-s1"] } })).toThrow(/is not a Mountain/);
  });
});
