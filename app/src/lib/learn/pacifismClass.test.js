/**
 * pacifismClass.test.js — BLITZ PA-1: the Pacifism aura class. "Enchanted creature can't attack
 * [or block]" parses to layer-6 grants of the cantAttack/cantBlock pseudo-keywords on the host —
 * the SAME cantBlock marker the until-EOT cant-block atom grants (canBlockAttacker enforces it);
 * the cantAttack side is enforced at attack declaration (actionsDeclareAttacker), layer-aware, so
 * the restriction lifts the moment the aura leaves.
 * CREED FP guarded: an UNMODELED rider (an aura-own targeting trigger — Ice Cage) drops the whole
 * bonus → body-only. (Arrest's "and its activated abilities can't be activated" tail is now MODELED —
 * see auraRestrictionLock.test.js, BLITZ AU-2.) Real oracle fixtures (bundled Scryfall, verified 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PACIFISM = { id: "pac", name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block." };
// An UNMODELED aura-own trigger still parks the whole card (CREED). Ice Cage carries the same
// can't-attack/block + can't-activate lock AU-2 models, PLUS a "becomes the target … destroy this
// Aura" trigger the engine can't fire — so the whole bonus must still drop to body-only.
const ICE_CAGE = { id: "ice", name: "Ice Cage", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated.\nWhen enchanted creature becomes the target of a spell or ability, destroy this Aura." };

describe("parse + classify", () => {
  it("Pacifism's clause → cantAttack + cantBlock layer-6 grants; the card flips native", () => {
    const ops = parseAttachedBonus(PACIFISM);
    expect(ops.map((o) => o.op.keyword).sort()).toEqual(["cantAttack", "cantBlock"]);
    expect(["native-aura", "native-static", "native-mixed"]).toContain(classifyCard(PACIFISM));
  });
  it("CREED — Ice Cage's unmodeled aura-own trigger drops the whole bonus; the card stays body-only", () => {
    expect(parseAttachedBonus(ICE_CAGE)).toEqual([]);
    expect(classifyCard(ICE_CAGE)).toBe("body-only");
  });
});

describe("runtime — both restrictions enforced through the layers, lift with the aura", () => {
  function boardWithPacifiedBear(attached) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: PACIFISM, controller: "ai1", summoningSick: false });
    if (attached) { aura.attachedTo = "bear"; bear.attachments = ["aura"]; }
    s = {
      ...s,
      phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [bear] },
        ai1: { ...s.players.ai1, battlefield: [aura] },
      },
    };
    return s;
  }

  it("a Pacified creature is offered NO attack action; unattached, it attacks freely", () => {
    const pacified = boardWithPacifiedBear(true);
    expect(legalActionsForPlayer(pacified, "user").filter((a) => a.kind === "declare-attacker")).toHaveLength(0);
    const free = boardWithPacifiedBear(false);
    expect(legalActionsForPlayer(free, "user").filter((a) => a.kind === "declare-attacker").length).toBeGreaterThan(0);
  });

  it("a Pacified creature can't block (the shared cantBlock read)", () => {
    let s = boardWithPacifiedBear(true);
    const attacker = createPermanent({ id: "atk", card: { name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [...s.players.ai1.battlefield, attacker] } } };
    expect(canBlockAttacker(s, "bear", "atk", "user")).toBe(false);
  });
});
