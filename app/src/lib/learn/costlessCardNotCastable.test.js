/**
 * costlessCardNotCastable.test.js — CR 202.1a, a card with NO mana cost can't be cast (census slice 18).
 *
 * A LIVE false positive, and a bad one: manaCostOf correctly returns "" for a genuinely costless card, but
 * parseManaCost("") produces an all-ZERO cost, which the cast loop then offered as a legal play. The engine
 * would hand-cast Ancestral Vision — draw three cards — for nothing, with no lands, on any turn, repeatedly.
 * Crashing Footfalls, Wheel of Fate and Profane Tutor were the same. Their only legal entry in real Magic is
 * paying a suspend cost, which the engine does not model.
 *
 * The earlier empty-mana_cost audit fixed the DFC/enrichment half of this landmine (a front-face cost living
 * on card_faces[0]), but its data tripwire required cmc > 0, so the TRULY costless cards — cmc 0, no cost
 * anywhere — slipped straight through it.
 *
 * The guard is precise on both sides. A real zero cost prints as "{0}" and is not empty, so Ornithopter and
 * Memnite are untouched; `freeCast` — an effect explicitly waiving the cost — is exempt, because that IS the
 * "unless an effect allows it" half of the rule.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const AV = { id: "c-av", name: "Ancestral Vision", type: "Sorcery", mana: "",
  oracle: "Suspend 4—{U}\nTarget player draws three cards." };
const FOOTFALLS = { id: "c-cf", name: "Crashing Footfalls", type: "Sorcery", mana: "",
  oracle: "Suspend 4—{G}\nCreate two 4/4 green Rhino creature tokens with trample." };
const ORNITHOPTER = { id: "c-orn", name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}",
  power: 0, toughness: 2, oracle: "Flying" };
const BOLT = { id: "c-lb", name: "Lightning Bolt", type: "Instant", mana: "{R}",
  oracle: "Lightning Bolt deals 3 damage to any target." };

function handOf(cards, lands = 4) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = Array.from({ length: lands }, (_, i) => createPermanent({
    id: `l${i}`, card: { name: "City of Brass", type: "Land", oracle: "{T}: Add one mana of any color." },
    controller: "user", summoningSick: false,
  }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, hand: cards } } };
}
const castsOf = (s, name) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === name);

describe("a costless card is NOT castable from hand", () => {
  it("Ancestral Vision is not offered — not even with plenty of mana", () => {
    expect(castsOf(handOf([AV]), "Ancestral Vision")).toHaveLength(0);
  });

  it("…and not with ZERO lands either, which is how the bug actually presented", () => {
    expect(castsOf(handOf([AV], 0), "Ancestral Vision")).toHaveLength(0);
  });

  it("Crashing Footfalls is not offered (two free 4/4 tramplers)", () => {
    expect(castsOf(handOf([FOOTFALLS]), "Crashing Footfalls")).toHaveLength(0);
  });
});

describe("the guard is narrow — real cards are untouched", () => {
  it("a genuine {0} cost is still castable (Ornithopter)", () => {
    expect(castsOf(handOf([ORNITHOPTER]), "Ornithopter")).toHaveLength(1);
  });

  it("an ordinary spell is unaffected", () => {
    // One cast action PER LEGAL TARGET for a targeted spell — assert offered-at-all, not a count.
    expect(castsOf(handOf([BOLT]), "Lightning Bolt").length).toBeGreaterThan(0);
  });

  it("a costless card in hand doesn't suppress its neighbours", () => {
    const s = handOf([AV, BOLT, ORNITHOPTER]);
    expect(castsOf(s, "Ancestral Vision")).toHaveLength(0);
    expect(castsOf(s, "Lightning Bolt").length).toBeGreaterThan(0);
    expect(castsOf(s, "Ornithopter")).toHaveLength(1);
  });
});
