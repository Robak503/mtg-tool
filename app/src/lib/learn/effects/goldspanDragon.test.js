/**
 * goldspanDragon.test.js — Goldspan Dragon (two DEEP subsystems, one card).
 *
 * (A) ATTACKS-OR-BECOMES-TARGET compound trigger (CR 603.2 / CR 115.1) — "Whenever this creature attacks
 *     or becomes the target of a spell, create a Treasure token." Fires on BOTH sites (never a partial —
 *     the CREED all-sites requirement): the attack declaration (checkAttackTriggers) AND when the permanent
 *     becomes the target of ANY spell any player casts (checkCastTriggers, regardless of the caster).
 *
 * (B) TREASURE-MANA-BUFF static — "Treasures you control have \"{T}, Sacrifice this artifact: Add two mana
 *     of any one color.\"" A GROUP-GRANT that UPGRADES each Treasure's own printed "Add one" production to
 *     "Add two" in place (a single dominating tap, never a double-tap), via the grantedManaSpecsFor →
 *     manaSources runtime + applyAuraManaGrantSupplement's `upgrade` marker.
 *
 * The card is native-mixed only when BOTH subsystems are modeled AND no clause is dropped. CREED near-misses
 * (Tectonic Giant's opponent-restricted form; a rider-cost / spend-restricted grant) must stay non-native.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "../gameState.js";
import { checkAttackTriggers, checkCastTriggers, detectTriggers } from "../triggers.js";
import { manaSources } from "../manaModel.js";
import { grantedManaSpecsFor } from "../layers.js";
import { parseStaticAbilities } from "../staticAbilityParser.js";
import { parseActivatedAbilities } from "./abilities.js";
import { classifyCard } from "../coverage.js";
import { NAMED_TOKENS } from "./atoms/tokens.js";

beforeEach(() => _resetIdsForTests());

const GOLDSPAN = {
  name: "Goldspan Dragon",
  type: "Creature — Dragon",
  power: 4, toughness: 4,
  mana_cost: "{3}{R}{R}",
  oracle:
    'Flying, haste\n' +
    'Whenever this creature attacks or becomes the target of a spell, create a Treasure token.\n' +
    'Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."',
};

function treasurePerm(id, controller = "user") {
  return createPermanent({
    id,
    card: { name: "Treasure", type: NAMED_TOKENS.treasure.type, oracle: NAMED_TOKENS.treasure.oracle, token: true },
    controller,
  });
}

function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

// ─── coverage flip ──────────────────────────────────────────────────────────────

describe("Goldspan Dragon — classification", () => {
  it("classifies native-mixed (compound trigger + Treasure-mana-buff static both modeled)", () => {
    expect(classifyCard(GOLDSPAN)).toBe("native-mixed");
  });

  it("detects exactly ONE compound trigger with the create-Treasure effect", () => {
    const dets = detectTriggers(GOLDSPAN);
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ event: "attacksOrBecomesTarget", scope: "self", effectClause: "create a Treasure token" });
  });

  it("parses the Treasure-mana-buff static as a dominating (upgrade) group-grant of amount 2", () => {
    const statics = parseStaticAbilities(GOLDSPAN);
    expect(statics).toHaveLength(1);
    expect(statics[0].op.grant).toEqual({ kind: "mana", spec: { colors: ["W", "U", "B", "R", "G"], amount: 2, sacrifices: true, upgrade: true } });
    expect(statics[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Artifact"], subtypes: ["Treasure"] });
  });

  it("does NOT mis-read the quoted group-grant static as this card's own activated ability", () => {
    // The grant's colon sits inside the quotes — parseActivatedAbilities must skip it (a static, not our own).
    expect(parseActivatedAbilities(GOLDSPAN)).toEqual([]);
  });
});

// ─── (A) compound trigger fires on BOTH sites ─────────────────────────────────────

describe("Goldspan Dragon — attacks-or-becomes-target compound trigger", () => {
  it("fires on the ATTACK site (Goldspan declared as an attacker)", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const s = { ...stateWith([g]), combat: { attackers: [{ permanentId: "gold", attackingPlayer: "user", defender: "ai" }] } };
    const fired = (checkAttackTriggers(s).pendingTriggers || []).filter((t) => t.descriptor?.event === "attacksOrBecomesTarget");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toBe("create a Treasure token");
  });

  it("fires on the BECOMES-TARGET site for an OPPONENT's spell (the case heroic can't cover)", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const after = checkCastTriggers(stateWith([g]), {
      spellCard: { name: "Shock", type: "Instant", oracle: "Shock deals 2 damage to any target." },
      casterId: "ai", targets: [{ id: "gold" }],
    });
    const fired = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "attacksOrBecomesTarget");
    expect(fired).toHaveLength(1);
  });

  it("fires on the BECOMES-TARGET site for the controller's OWN spell", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const after = checkCastTriggers(stateWith([g]), {
      spellCard: { name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn." },
      casterId: "user", targets: [{ id: "gold" }],
    });
    const fired = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "attacksOrBecomesTarget");
    expect(fired).toHaveLength(1);
  });

  it("does NOT fire for a spell that does not target Goldspan (CREED no over-fire)", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const after = checkCastTriggers(stateWith([g]), {
      spellCard: { name: "Divination", type: "Sorcery", oracle: "Draw two cards." },
      casterId: "user", targets: [],
    });
    const fired = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "attacksOrBecomesTarget");
    expect(fired).toHaveLength(0);
  });
});

// ─── (B) Treasure mana upgrade at runtime ─────────────────────────────────────────

describe("Goldspan Dragon — Treasures tap for TWO mana", () => {
  it("a Treasure taps for 2 (any color) while Goldspan is on the battlefield", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const s = stateWith([g, treasurePerm("t1")]);
    expect(grantedManaSpecsFor(s, "t1")).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 2, sacrifices: true, upgrade: true }]);
    const t = manaSources(s, "user").find((x) => x.permanentId === "t1");
    expect(t).toMatchObject({ amount: 2, sacrifices: true, colors: ["W", "U", "B", "R", "G"] });
  });

  it("the SAME Treasure taps for only 1 without Goldspan (no phantom upgrade)", () => {
    const s = stateWith([treasurePerm("t1")]);
    const t = manaSources(s, "user").find((x) => x.permanentId === "t1");
    expect(t).toMatchObject({ amount: 1, sacrifices: true });
  });

  it("produces exactly ONE source record for the upgraded Treasure (single tap, no double-tap)", () => {
    const g = createPermanent({ id: "gold", card: GOLDSPAN, controller: "user", summoningSick: false });
    const s = stateWith([g, treasurePerm("t1")]);
    const treasureSources = manaSources(s, "user").filter((x) => x.permanentId === "t1");
    expect(treasureSources).toHaveLength(1);
  });
});

// ─── CREED near-misses (must stay non-native) ─────────────────────────────────────

describe("Goldspan Dragon — CREED near-misses stay non-native", () => {
  it("Tectonic Giant's opponent-restricted form is UNDETECTED (no per-caster gate at the cast site)", () => {
    const cond = {
      name: "Tectonic Giant", type: "Creature — Giant",
      oracle: "Whenever this creature attacks or becomes the target of a spell an opponent controls, choose one —\n• This creature deals 3 damage to each opponent.\n• Exile the top two cards of your library.",
    };
    expect(detectTriggers(cond)).toEqual([]);
  });

  it("a grant with a RIDER cost (Pay 1 life) is rejected — never grants cheaper mana", () => {
    const card = { name: "X", type: "Creature — Dragon", oracle: 'Treasures you control have "{T}, Pay 1 life, Sacrifice this artifact: Add two mana of any one color."' };
    expect(parseStaticAbilities(card)).toEqual([]);
  });

  it("a SPEND-RESTRICTED grant is rejected — never fabricates unrestricted mana", () => {
    const card = { name: "X", type: "Creature — Dragon", oracle: 'Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color. Spend this mana only to cast artifact spells."' };
    expect(parseStaticAbilities(card)).toEqual([]);
  });

  it("a Creature-restricted keyword grant to a token subtype stays UNMODELED (crew unmodeled)", () => {
    // "Treasures you control have flying" — a keyword grant to a non-creature token selects nobody → drop.
    expect(parseStaticAbilities({ name: "X", type: "Enchantment", oracle: "Treasures you control have flying." })).toEqual([]);
  });
});
