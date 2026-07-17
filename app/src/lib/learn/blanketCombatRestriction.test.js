/**
 * blanketCombatRestriction.test.js — BLITZ ST-1: the NON-ANTHEM blanket combat-restriction static.
 *
 * A BOARD-WIDE static that bars a class of creatures from attacking and/or blocking OUTRIGHT
 * (CR 508.1a attack restriction / 509.1b block restriction) — no cost, no player scope, no attacker
 * subset — routes to layer-6 addKeyword grant(s) of the cantAttack / cantBlock pseudo-keywords over a
 * DYNAMIC selector (all creatures, or a color-filtered subset). Enforcement is the SAME layer-aware read
 * the PACIFISM attach class uses: legalChoices.actionsDeclareAttacker's cantAttack filter and
 * combatEvasion.canBlockAttacker's cantBlock read (permanentHasKeyword), so the metric and the runtime
 * can't drift and the restriction lifts LIVE when the source leaves the battlefield.
 *
 * CREED — strictly BLANKET only. A player-scoped ("…can't attack you"), attacker-subset ("…can't block
 * creatures you control"), state-conditional ("untapped creatures…"), or P/T-predicate restriction has
 * no faithful selector/keyword expression, so it stays body-only (a safe FN, never a fabricated
 * half-restriction). Real oracle fixtures (bundled Scryfall, verified against the corpus 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle fixtures ────────────────────────────────────────────────────────────────────────
const BEDLAM = { id: "bed", name: "Bedlam", type: "Enchantment", mana: "{2}{R}",
  oracle: "Creatures can't block." };
const RAZORJAW = { id: "raz", name: "Razorjaw Oni", type: "Creature — Demon Spirit", mana: "{4}{B}",
  power: "4", toughness: "1", oracle: "Black creatures can't block." };
const MAGISTRATE = { id: "mag", name: "Magistrate's Veto", type: "Enchantment", mana: "{1}{W}{U}",
  oracle: "White creatures and blue creatures can't block." };
const LIGHT_OF_DAY = { id: "lod", name: "Light of Day", type: "Enchantment", mana: "{2}{W}",
  oracle: "Black creatures can't attack or block." };
const PEACEKEEPER = { id: "pk", name: "Peacekeeper", type: "Creature — Human", mana: "{2}{W}",
  power: "1", toughness: "1", oracle: "At the beginning of your upkeep, sacrifice this creature unless you pay {1}{W}.\nCreatures can't attack." };

// FN-guard fixtures (must STAY body-only — no faithful blanket expression).
const BLAZING_ARCHON = { id: "ba", name: "Blazing Archon", type: "Creature — Archon", mana: "{6}{W}{W}{W}",
  power: "5", toughness: "6", oracle: "Flying\nCreatures can't attack you." };
const REVERENCE = { id: "rev", name: "Reverence", type: "Enchantment", mana: "{2}{W}",
  oracle: "Creatures with power 2 or less can't attack you." };
const SIEGE_ELEMENTAL = { id: "se", name: "Siege Elemental", type: "Creature — Elemental", mana: "{5}{R}",
  power: "6", toughness: "4", oracle: "Trample\nUntapped creatures can't block.\nTapped creatures can block." };

// Extract the (keyword, selector) pairs of a card's layer-6 addKeyword statics.
function keywordGrants(card) {
  return parseStaticAbilities(card)
    .filter((d) => d.layer === 6 && d.op?.layerOp === "addKeyword")
    .map((d) => ({ keyword: d.op.keyword, selector: d.affects?.selector }));
}

describe("recognition + classification", () => {
  it("Bedlam — bare 'Creatures can't block' → cantBlock over ALL creatures; native-static", () => {
    const grants = keywordGrants(BEDLAM);
    expect(grants).toHaveLength(1);
    expect(grants[0].keyword).toBe("cantBlock");
    expect(grants[0].selector).toEqual({ cardTypes: ["Creature"] }); // no colors → every creature
    expect(classifyCard(BEDLAM)).toBe("native-static");
  });

  it("Razorjaw Oni — 'Black creatures can't block' → cantBlock filtered to black; native-static", () => {
    const grants = keywordGrants(RAZORJAW);
    expect(grants).toEqual([{ keyword: "cantBlock", selector: { cardTypes: ["Creature"], colors: ["B"] } }]);
    expect(classifyCard(RAZORJAW)).toBe("native-static");
  });

  it("Magistrate's Veto — color UNION 'White creatures and blue creatures' → colors [W,U]; native-static", () => {
    const grants = keywordGrants(MAGISTRATE);
    expect(grants).toEqual([{ keyword: "cantBlock", selector: { cardTypes: ["Creature"], colors: ["W", "U"] } }]);
    expect(classifyCard(MAGISTRATE)).toBe("native-static");
  });

  it("Light of Day — 'can't attack or block' → BOTH keywords, filtered to black; native-static", () => {
    const grants = keywordGrants(LIGHT_OF_DAY);
    expect(grants.map((g) => g.keyword).sort()).toEqual(["cantAttack", "cantBlock"]);
    for (const g of grants) expect(g.selector).toEqual({ cardTypes: ["Creature"], colors: ["B"] });
    expect(classifyCard(LIGHT_OF_DAY)).toBe("native-static");
  });

  it("Peacekeeper — bare 'Creatures can't attack' + a modeled upkeep-sac trigger → native-mixed", () => {
    const grants = keywordGrants(PEACEKEEPER);
    expect(grants).toEqual([{ keyword: "cantAttack", selector: { cardTypes: ["Creature"] } }]);
    expect(classifyCard(PEACEKEEPER)).toBe("native-mixed");
  });
});

describe("CREED — scoped/conditional restrictions stay body-only (no fabricated blanket)", () => {
  it("Blazing Archon — player-scoped 'can't attack you' emits NO cantAttack grant; body-only", () => {
    expect(keywordGrants(BLAZING_ARCHON).some((g) => g.keyword === "cantAttack")).toBe(false);
    expect(classifyCard(BLAZING_ARCHON)).toBe("body-only");
  });
  it("Reverence — P/T + player-scoped 'power 2 or less can't attack you' → body-only", () => {
    expect(keywordGrants(REVERENCE)).toHaveLength(0);
    expect(classifyCard(REVERENCE)).toBe("body-only");
  });
  it("Siege Elemental — state-conditional 'untapped creatures can't block' → body-only", () => {
    expect(keywordGrants(SIEGE_ELEMENTAL).some((g) => g.keyword === "cantBlock")).toBe(false);
    expect(classifyCard(SIEGE_ELEMENTAL)).toBe("body-only");
  });
});

describe("runtime — the static actually changes the game state at its enforcement site", () => {
  // A combat board: `restrictor` (any controller) plus a user bear and an ai1 attacker, at declare-blockers.
  function board(restrictorCard, { userBearColors } = {}) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "", ...(userBearColors ? { colors: userBearColors } : {}) }, controller: "user", summoningSick: false });
    const attacker = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    const restrictor = createPermanent({ id: "rst", card: restrictorCard, controller: "ai1", summoningSick: false });
    s = {
      ...s,
      phase: "combat", step: "declare-blockers", activePlayer: "ai1", priorityHolder: "user", turn: 5,
      combat: { attackers: [{ permanentId: "atk", defender: "user" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [bear] },
        ai1: { ...s.players.ai1, battlefield: [attacker, restrictor] },
      },
    };
    return s;
  }

  it("Bedlam on the board → a creature CAN'T block; remove it and the block is legal again", () => {
    const withBedlam = board(BEDLAM);
    expect(permanentHasKeyword(withBedlam, "bear", "cantBlock")).toBe(true);
    expect(canBlockAttacker(withBedlam, "bear", "atk", "user")).toBe(false);
    // Baseline with no restrictor present: the same bear blocks freely (proves the static is what bars it).
    const noBedlam = board({ id: "x", name: "Wall of Stone", type: "Creature — Wall", power: "0", toughness: "8", oracle: "" });
    expect(canBlockAttacker(noBedlam, "bear", "atk", "user")).toBe(true);
  });

  it("Razorjaw Oni — a BLACK creature can't block; a WHITE creature blocks freely (color selector live)", () => {
    const blackBear = board(RAZORJAW, { userBearColors: ["B"] });
    expect(canBlockAttacker(blackBear, "bear", "atk", "user")).toBe(false);
    const whiteBear = board(RAZORJAW, { userBearColors: ["W"] });
    expect(permanentHasKeyword(whiteBear, "bear", "cantBlock")).toBe(false);
    expect(canBlockAttacker(whiteBear, "bear", "atk", "user")).toBe(true);
  });

  // Attack board: `restrictor` and the user's creatures, user is the active player at declare-attackers.
  function attackBoard(restrictorCard, userCreatures) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const restrictor = createPermanent({ id: "rst", card: restrictorCard, controller: "user", summoningSick: false });
    const creatures = userCreatures.map((c) => createPermanent({ id: c.id, card: { id: c.id + "c", name: c.id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "", ...(c.colors ? { colors: c.colors } : {}) }, controller: "user", summoningSick: false }));
    s = {
      ...s,
      phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [restrictor, ...creatures] } },
    };
    return s;
  }

  it("Peacekeeper — 'Creatures can't attack' bars the controller's own creatures from attacking", () => {
    const s = attackBoard(PEACEKEEPER, [{ id: "swinger" }]);
    const attacks = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
    expect(attacks).toHaveLength(0);
  });

  it("Light of Day — the BLACK creature is barred from attacking; the white one still swings", () => {
    const s = attackBoard(LIGHT_OF_DAY, [{ id: "blk", colors: ["B"] }, { id: "wht", colors: ["W"] }]);
    const ids = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(ids).toContain("wht");
    expect(ids).not.toContain("blk");
  });
});
