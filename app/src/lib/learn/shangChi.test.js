/**
 * shangChi.test.js — SG-18 (2026-09-03): SHANG-CHI, MASTER OF KUNG FU — "You may activate abilities of creatures you
 * control as though those creatures had haste. / {T}: Add two mana of any one color. Spend this mana only to activate
 * abilities of creature sources."
 * Two arms: (1) a static marker `abilitiesAsThoughHaste` read at every summoning-sick activation gate (the {T}
 * activated-ability offer, the {T} mana-ability offer, the mana model's own source gate) — a fresh creature's tap
 * abilities are live while Shang-Chi is out; (2) a spend restriction whose ONLY permission is ACTIVATION
 * (`abilityOf: ["creature"]`): the mana pays a creature's ability (the activation site threads
 * `activatingIsCreature`), never a spell, never a non-creature's ability. The planner taps the source for ONE colour
 * (both mana the same colour — "any one color"). Real oracle fixture (bundled Scryfall snapshot, 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { manaSources, parseSpendRestriction, spendRestrictionAllows, planPayment } from "./manaModel.js";
import { parseStaticAbilities, abilitiesAsThoughHasteFor } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SHANG = { id: "c-shang", name: "Shang-Chi, Master of Kung Fu", type: "Legendary Creature — Human Warrior Hero", mana: "{2}{G}", mana_cost: "{2}{G}", cmc: 3, power: 3, toughness: 3, keywords: [], oracle: "You may activate abilities of creatures you control as though those creatures had haste.\n{T}: Add two mana of any one color. Spend this mana only to activate abilities of creature sources." };
const PINGER = { id: "c-png", name: "Synthetic Pinger", type: "Creature — Human Wizard", mana: "{2}{R}", cmc: 3, power: 1, toughness: 1, keywords: [], oracle: "{1}{R}, {T}: This creature deals 1 damage to any target." };
const ROCK = { id: "c-rock", name: "Synthetic Rock", type: "Artifact", mana: "{2}", cmc: 2, keywords: [], oracle: "{1}{R}, {T}: Draw a card." };
const BEAR = { id: "h-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };

function board({ shang = true, pingerSick = false, shangSick = false } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [
    createPermanent({ id: "pinger", card: PINGER, controller: "user", summoningSick: pingerSick }),
    createPermanent({ id: "rock", card: ROCK, controller: "user" }),
  ];
  if (shang) bf.push(createPermanent({ id: "shang", card: SHANG, controller: "user", summoningSick: shangSick }));
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [BEAR], graveyard: [], library: [{ id: "l1", name: "Card l1", type: "Instant", mana: "{U}", oracle: "" }], battlefield: bf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], library: [], battlefield: [] },
    },
  };
}
const acts = (s, kind, permanentId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === kind && a.permanentId === permanentId);

describe("the parses + the tier", () => {
  it("the static marks haste-for-abilities; the restriction reads the activation-only form; the card is native", () => {
    expect(parseStaticAbilities(SHANG).some((d) => d.abilitiesAsThoughHaste)).toBe(true);
    expect(abilitiesAsThoughHasteFor(board(), "user")).toBe(true);
    expect(abilitiesAsThoughHasteFor(board({ shang: false }), "user")).toBe(false);
    expect(abilitiesAsThoughHasteFor(board(), "ai")).toBe(false);
    expect(parseSpendRestriction(SHANG.oracle)).toEqual({ castTypes: [], abilityOf: ["creature"] });
    expect(parseSpendRestriction("Spend this mana only to activate abilities of artifact sources or creature sources.")).toBeNull();
    expect(parseSpendRestriction("Spend this mana only to activate abilities of artifact sources.")).toBeNull(); // only the creature word is honoured (the allow-check has no artifact context) — a credited-but-unplayable card is the forbidden direction
    expect(classifyCard(SHANG)).toMatch(/^native/);
  });
  it("the allow-check: a creature's ability yes; a spell no; a non-creature's ability no; no context no", () => {
    const r = parseSpendRestriction(SHANG.oracle);
    expect(spendRestrictionAllows(r, null, { activatingIsCreature: true })).toBe(true);
    expect(spendRestrictionAllows(r, null, { activatingIsCreature: false })).toBe(false);
    expect(spendRestrictionAllows(r, BEAR, {})).toBe(false);
    expect(spendRestrictionAllows(r, null, {})).toBe(false);
  });
});

describe("runtime — haste for abilities", () => {
  it("⭐ a summoning-sick pinger's {T} ability is offered while Shang-Chi is out, and not without him", () => {
    expect(acts(board({ pingerSick: true }), "activate-ability", "pinger").length).toBeGreaterThan(0);
    expect(acts(board({ pingerSick: true, shang: false }), "activate-ability", "pinger").length).toBe(0);
  });
  it("Shang-Chi's own tap is live the turn he lands (his static covers himself — 'creatures you control')", () => {
    const s = board({ shangSick: true });
    const srcs = manaSources(s, "user").filter((x) => x.permanentId === "shang");
    expect(srcs.length).toBe(1);
    expect(srcs[0]).toMatchObject({ amount: 2, restriction: { abilityOf: ["creature"] } });
    const sNoShang = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "shang" ? { ...p, card: { ...SHANG, oracle: "{T}: Add two mana of any one color. Spend this mana only to activate abilities of creature sources." } } : p)) } } };
    expect(manaSources(sNoShang, "user").filter((x) => x.permanentId === "shang").length).toBe(0);
  });
});

describe("runtime — the restricted mana", () => {
  it("⭐ pays the pinger's {1}{R} ability (two of one colour off Shang-Chi), never the Bear spell, never the Rock's ability", () => {
    const s = board();
    const ping = acts(s, "activate-ability", "pinger").find((a) => (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    expect(ping).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, ping));
    expect(out.players.ai.life).toBe(19);
    expect(out.players.user.battlefield.find((p) => p.id === "shang").tapped).toBe(true);
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
    expect(acts(s, "activate-ability", "rock").length).toBe(0);
  });
  it("the plan never splits the two mana across colours ('any one color'): a {W}{U} cost is unpayable off Shang-Chi alone", () => {
    const s = board();
    const srcs = manaSources(s, "user").filter((x) => x.permanentId === "shang");
    const cost = { generic: 0, W: 1, U: 1, B: 0, R: 0, G: 0, C: 0, hasX: false, xCount: 0, hybrid: [], phyrexian: [], anyColor: 0, snow: 0 };
    expect(planPayment(s.players.user.manaPool, srcs, cost, { activatingIsCreature: true })).toBeNull();
    const costWW = { ...cost, W: 2, U: 0 };
    expect(planPayment(s.players.user.manaPool, srcs, costWW, { activatingIsCreature: true })).not.toBeNull();
  });
});
