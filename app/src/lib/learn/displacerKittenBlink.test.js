/**
 * displacerKittenBlink.test.js — DISPLACER KITTEN (2026-08-14). "Avoidance — Whenever you cast a
 * noncreature spell, exile up to one target nonland permanent you control, then return that card to
 * the battlefield under its owner's control." Test Rashmi's bar card (89 → the 90 gate).
 *
 * ⭐ THREE ONE-LINERS: the keep-whole guard's up-to-one-nonland alternative (the severed first half
 * exiles and never returns — the family's standing hazard), the blink1M arm (maxTargets 1 +
 * minTargets 0 rides the same subset path as up-to-two), and "avoidance" joining the CR 207.2c
 * ability-word label list (the trigger was INVISIBLE behind the label — detectTriggers returned []
 * while the clause parsed HIGH, the classic label-miss signature).
 *
 * ⭐ THE FAMILY'S FIRST TRIGGER CARRIER: Displace/Ghostly Flicker are spells and never consulted
 * atomTargetIntent — the "blink" → own case was added HERE so the trigger flush can place the target
 * (every corpus blink arm prints "you control"; blinking your own permanent is the card's purpose).
 *
 * Whole-card audit: the card IS this one triggered ability.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the guard alternative removed -> the split severs the return -> Kitten parks.
 *   · the "blink" intent case removed -> ambiguous -> not routable -> Kitten parks.
 *   · "avoidance" dropped from the label list -> the trigger is invisible -> Kitten parks.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KITTEN = { id: "c-dk", name: "Displacer Kitten", type: "Creature — Cat Beast", mana: "{2}{U}{U}", power: "2", toughness: "2",
  oracle: "Avoidance — Whenever you cast a noncreature spell, exile up to one target nonland permanent you control, then return that card to the battlefield under its owner's control." };
const CLAUSE = "exile up to one target nonland permanent you control, then return that card to the battlefield under its owner's control";

describe("the carrier and the shape", () => {
  it("⭐ the Kitten flips native-trigger; the atom is the up-to-one own-side blink; intent is OWN", () => {
    expect(classifyCard(KITTEN)).toBe("native-trigger");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "blink", targetType: "nonlandPermanent",
      restrictions: [{ kind: "controller", who: "you" }], returnTo: "owner", maxTargets: 1, minTargets: 0 });
    expect(atomTargetIntent(p.atoms[0])).toBe("own");
  });
});

describe("⭐⭐ LAW 6 — the pool excludes lands and enemies; zero is a choice; the blink returns", () => {
  const program = parseEffectClause(CLAUSE, "Instant");
  const mk = (id, controller, card) => createPermanent({ id, controller, summoningSick: false, card: { id: "card-" + id, oracle: "", ...card } });

  function board() {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...g, players: { ...g.players,
      user: { ...g.players.user, battlefield: [
        mk("E", "user", { name: "Rhystic Study", type: "Enchantment" }),
        mk("L", "user", { name: "Island", type: "Basic Land — Island" }),
      ] },
      ai1: { ...g.players.ai1, battlefield: [mk("X", "ai1", { name: "Mind Stone", type: "Artifact" })] } } };
  }

  it("⭐⭐ the pool: own ENCHANTMENT yes; own LAND no; enemy artifact no; the EMPTY pick is offered", () => {
    const choices = expandCastChoices(board(), "user", program, [], {});
    const sizes = choices.map((c) => (c.targets || []).length).sort();
    const ids = new Set(choices.flatMap((c) => (c.targets || []).map((t) => t.id)));
    const row = { sizes, offersEnchantment: ids.has("E"), offersLand: ids.has("L"), offersEnemy: ids.has("X") };
    console.log("  WITNESS kittenPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sizes: [0, 1], offersEnchantment: true, offersLand: false, offersEnemy: false });
  });

  it("⭐⭐ resolution: the blinked NON-CREATURE leaves and COMES BACK (the resolver is type-agnostic)", () => {
    const s = board();
    const after = ATOM_RESOLVERS.blink(s, program.atoms[0], { controller: "user", targets: [{ type: "creature", id: "E" }] });
    const names = after.players.user.battlefield.map((p) => p.card?.name).sort();
    console.log("  WITNESS kittenBlink", JSON.stringify({ battlefield: names })); // vitest 4 needs --disable-console-intercept
    expect(names).toEqual(["Island", "Rhystic Study"]); // the enchantment returned — never the exile-no-return half
  });
});
