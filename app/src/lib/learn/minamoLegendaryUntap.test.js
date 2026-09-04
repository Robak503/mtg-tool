/**
 * minamoLegendaryUntap.test.js — SHELF-85 runbook V3 (2026-09-04): Minamo, School at Water's Edge
 * (Kinnan · Shorikai · cdh) and the unplanned twin the flip-diff surfaced, Patriar's Seal.
 *
 *   Minamo:         "{T}: Add {U}.\n{U}, {T}: Untap target legendary permanent."
 *   Patriar's Seal: "{T}: Add one mana of any color.\n{1}, {T}: Untap target legendary creature you control."
 *
 * The untap-target arm (atoms/combat.js) had two restriction lanes — `another` → notSource and ` you control` →
 * controller — and no lane for the LEGENDARY supertype, so both lines fell off the anchor while their unqualified
 * twins parsed. The `supertype` restriction already existed with one emitter (the Mithril Coat self-attach) and is
 * evaluated by creatureSatisfiesRestrictions on the front-face type line, fail-closed; the permanent AND creature
 * target pools already run every restriction over every candidate. Admitting the word is the whole slice: no new
 * targeting behaviour, and the three lanes compose as printed.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MINAMO = { id: "c-minamo", name: "Minamo, School at Water's Edge", type: "Legendary Land", keywords: [], oracle: "{T}: Add {U}.\n{U}, {T}: Untap target legendary permanent." };
const PATRIARS_SEAL = { id: "c-pseal", name: "Patriar's Seal", type: "Artifact", mana: "{3}", keywords: [], oracle: "{T}: Add one mana of any color.\n{1}, {T}: Untap target legendary creature you control." };

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function mainState() {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0 };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms, manaPool: { ...EMPTY_POOL } } } };
}
function board() {
  const minamo = createPermanent({ id: "MIN", card: MINAMO, controller: "user" });
  const island = createPermanent({ id: "ISL", card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" });
  const legend = createPermanent({ id: "LEG", card: { name: "Kinnan, Bonder Prodigy", type: "Legendary Creature — Human Druid", power: 2, toughness: 2 }, controller: "user", tapped: true, summoningSick: false });
  const elf = createPermanent({ id: "ELF", card: { name: "Llanowar Elves", type: "Creature — Elf Druid", power: 1, toughness: 1 }, controller: "user", tapped: true, summoningSick: false });
  const aiLegend = createPermanent({ id: "AILEG", card: { name: "Sol Talisman", type: "Legendary Artifact" }, controller: "ai", tapped: true });
  const aiLand = createPermanent({ id: "AILAND", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "ai", tapped: true });
  return withBattlefield(withBattlefield(mainState(), "user", [minamo, island, legend, elf]), "ai", [aiLegend, aiLand]);
}

describe("parser — the legendary lane on the untap-target arm", () => {
  it("'untap target legendary permanent' → HIGH with the supertype restriction", () => {
    expect(parseEffectClause("untap target legendary permanent.", "Land")).toMatchObject({
      confidence: "high",
      atoms: [{ op: "untap", targetType: "permanent", restrictions: [{ kind: "supertype", value: "legendary" }] }],
    });
  });
  it("composes with the other two lanes in printed order (another · legendary · you control)", () => {
    expect(parseEffectClause("untap another target legendary permanent you control.", "Creature").atoms)
      .toEqual([{ op: "untap", targetType: "permanent", restrictions: [{ kind: "notSource" }, { kind: "supertype", value: "legendary" }, { kind: "controller", who: "you" }] }]);
    expect(parseEffectClause("untap target legendary creature you control.", "Artifact").atoms)
      .toEqual([{ op: "untap", targetType: "creature", restrictions: [{ kind: "supertype", value: "legendary" }, { kind: "controller", who: "you" }] }]);
  });
  it("the unqualified twins are untouched", () => {
    expect(parseEffectClause("untap target permanent.", "Instant").atoms).toEqual([{ op: "untap", targetType: "permanent", restrictions: [] }]);
  });
  it("CREED near-miss: another supertype stays LOW (only `legendary` is admitted)", () => {
    expect(parseEffectClause("untap target snow permanent.", "Land").confidence).toBe("low");
    expect(parseEffectClause("untap target world enchantment.", "Land").confidence).toBe("low");
  });
});

describe("targeting — only legendary permanents are legal, on any battlefield", () => {
  const PROGRAM = { atoms: [{ op: "untap", targetType: "permanent", restrictions: [{ kind: "supertype", value: "legendary" }] }] };
  it("offers the legendary creature, the opponent's legendary artifact and Minamo itself — never the Elf or the Forest", () => {
    const ids = expandCastChoices(board(), "user", PROGRAM, [], { sourceId: "MIN" }).map((c) => c.targets[0].id).sort();
    expect(ids).toEqual(["AILEG", "LEG", "MIN"]);
  });
});

describe("runtime — Minamo's {U}, {T} ability end-to-end", () => {
  it("surfaces the activation with only legendary targets", () => {
    const acts = legalActionsForPlayer(board(), "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "MIN");
    expect(acts.length).toBeGreaterThan(0);
    const targeted = acts.map((a) => a.targets?.[0]?.id).filter(Boolean);
    expect(targeted).toContain("LEG");
    expect(targeted).not.toContain("ELF");
    expect(targeted).not.toContain("AILAND");
  });
  it("pays {U} with the Island and {T} with Minamo, resolves, and untaps the legend (the Elf stays tapped)", () => {
    let s = board();
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "MIN").find((a) => a.targets?.[0]?.id === "LEG");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    const bf = () => s.players.user.battlefield;
    expect(bf().find((p) => p.id === "MIN").tapped).toBe(true);
    expect(bf().find((p) => p.id === "ISL").tapped).toBe(true);
    expect(bf().find((p) => p.id === "LEG").tapped).toBe(true);
    s = resolveTopOfStack(s);
    expect(bf().find((p) => p.id === "LEG").tapped).toBe(false);
    expect(bf().find((p) => p.id === "ELF").tapped).toBe(true);
    expect(bf().find((p) => p.id === "MIN").tapped).toBe(true);
  });
});

describe("classifier — both cards flip whole", () => {
  it("Minamo → land; Patriar's Seal → native-mana", () => {
    expect(classifyCard(MINAMO)).toBe("land");
    expect(classifyCard(PATRIARS_SEAL)).toBe("native-mana");
  });
});
