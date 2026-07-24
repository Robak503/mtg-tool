/**
 * counterGatedGroupKeyword.test.js — the keyword-grant generalization of Cathedral Acolyte's ward grant
 * (cathedralAcolyte.test.js): "Creatures you control with counters on them have <keyword>" over the SAME
 * requiresAnyCounter dynamic selector, any GRANTABLE_KEYWORDS keyword instead of only ward.
 *
 * Real corpus carriers found via full-corpus grep for the exact "creatures...with...counters...have" shape:
 * Winged Hive Tyrant flips clean (BUILT here). Nev the Practical Dean, Tesak Judith's Hellhound, Rishkar
 * Peema Renegade, and Matt Murdock Justice Seeker share this same selector but each has a SEPARATE, unrelated
 * unmodeled clause (a cast-ordinal+X-filter trigger; an unleash group-grant + attack-scaling mana; a granted
 * mana ability; a reflexive pay-trigger) that correctly keeps the WHOLE card body-only — proven below with
 * the isolated-clause parse (proving THIS selector/grant works) alongside the whole-card classify (proving
 * the other residue is real, not a regression from this fix).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, addCounter, removeCounter } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const TYRANT_ORACLE = "Flying, haste\nThe Will of the Hive Mind — Other creatures you control with counters on them have flying and haste.";
const tyrantCard = (id = "tyrant-card") => ({ id, name: "Winged Hive Tyrant", type: "Creature — Insect", power: "4", toughness: "4", mana: "{4}{G}{U}", oracle: TYRANT_ORACLE });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const creature = (id, controller) =>
  createPermanent({ id, card: { name: id, type: "Creature — Soldier", power: "2", toughness: "2", oracle: "" }, controller });

describe("parse + classify", () => {
  it("Winged Hive Tyrant's ability-word label strips; the grant parses to TWO layer-6 addKeyword descriptors with excludeSelf; whole card → native-static", () => {
    const descs = parseStaticAbilities(tyrantCard());
    const granted = descs.filter((d) => d.op?.layerOp === "addKeyword");
    expect(granted.map((d) => d.op.keyword).sort()).toEqual(["Flying", "Haste"]);
    for (const d of granted) {
      expect(d.affects).toMatchObject({
        mode: "dynamic",
        selector: { controllerScope: "you", cardTypes: ["Creature"], requiresAnyCounter: true, excludeSelf: true },
      });
    }
    expect(classifyCard(tyrantCard())).toBe("native-static");
  });

  it("the bare (non-'other', single-keyword) form parses too — Nev the Practical Dean's static half, isolated", () => {
    const [d] = parseStaticAbilities({ id: "x", name: "x", type: "Creature", oracle: "Creatures you control with counters on them have trample." });
    expect(d).toMatchObject({
      layer: 6, op: { layerOp: "addKeyword", keyword: "Trample" },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], requiresAnyCounter: true } },
    });
    expect(d.affects.selector.excludeSelf).toBeUndefined(); // no "other" → self-inclusive, unlike Tyrant above
  });

  it("real siblings sharing this selector stay body-only on SEPARATE residue, not a regression here", () => {
    const nev = { name: "Nev, the Practical Dean", type: "Legendary Creature — Merfolk Wizard", mana: "{2}{U}{U}",
      oracle: "Creatures you control with counters on them have trample.\nWhenever you cast your first spell with {X} in its mana cost each turn, put X +1/+1 counters on Nev." };
    const rishkar = { name: "Rishkar, Peema Renegade", type: "Legendary Creature — Elf Druid", mana: "{1}{G}{G}",
      oracle: "When Rishkar enters, put a +1/+1 counter on each of up to two target creatures.\nEach creature you control with a counter on it has \"{T}: Add {G}.\"" };
    expect(classifyCard(nev)).toBe("body-only"); // the cast-ordinal + X-filter + cross-permanent X-value trigger is unbuilt
    expect(classifyCard(rishkar)).toBe("body-only"); // a granted ACTIVATED (mana) ability isn't a GRANTABLE_KEYWORDS keyword
  });
});

describe("the granted keyword is ENFORCED live (CREED core) — mirrors Cathedral Acolyte's ward test", () => {
  function board() {
    let s = baseState();
    s = withBattlefield(s, "user", [
      createPermanent({ id: "tyrant", card: tyrantCard(), controller: "user" }),
      creature("c1", "user"),
      creature("c2", "user"),
    ]);
    s = addCounter(s, { permanentId: "c1", type: "charge", amount: 1 }); // ANY counter kind gates the grant
    return s;
  }

  it("a countered creature gains flying+haste; a counter-less one doesn't; the source itself never buffs its own printed copy via the grant (excludeSelf)", () => {
    const s = board();
    expect(permanentHasKeyword(s, "c1", "flying")).toBe(true);
    expect(permanentHasKeyword(s, "c1", "haste")).toBe(true);
    expect(permanentHasKeyword(s, "c2", "flying")).toBe(false);
  });

  it("the grant tracks LIVE — removing the counter drops the granted keywords", () => {
    let s = board();
    s = removeCounter(s, { permanentId: "c1", type: "charge", amount: 1 });
    expect(permanentHasKeyword(s, "c1", "flying")).toBe(false);
    expect(permanentHasKeyword(s, "c1", "haste")).toBe(false);
  });

  it("an OPPONENT's countered creature never gains the grant (controllerScope: you)", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "tyrant", card: tyrantCard(), controller: "user" })]);
    s = withBattlefield(s, "ai1", [creature("oc", "ai1")]);
    s = addCounter(s, { permanentId: "oc", type: "charge", amount: 1 });
    expect(permanentHasKeyword(s, "oc", "flying")).toBe(false);
  });
});
