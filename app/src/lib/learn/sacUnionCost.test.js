/**
 * sacUnionCost.test.js — SAC-UNION: "sacrifice a creature or enchantment/planeswalker/land" as a cost,
 * on BOTH grammars. Cast lane: Heartfire, Final Flare, Final Vengeance, Merciless Resolve. Activated lane:
 * Ragamuffyn, Ertai the Corrupted, Blood Aspirant, Spark Reaper, Dreadmalkin, Diversion Specialist.
 *
 * ⭐ ONE EVALUATOR, TWO GRAMMARS — the artifactOrCreature pattern, extended. Both the cast additional-cost
 * grammar (castModifiers SAC_COST_RE) and the activated-ability cost grammar (abilities.js sacOtherM) emit
 * the SAME canonical camelCase keys, and legalChoices' sacTypeMatches evaluates them in one place. The two
 * grammars had duplicate inline canonicalization ternaries; both now go through one map (SAC_TYPE_CANON /
 * SAC_UNION_CANON) so a future union cannot be added to one lane and silently missed in the other.
 *
 * ⭐ THE CEILING PROBE SAID 11 AND THE FLIP-DIFF SAID 10, WITH DIFFERENT MEMBERS — Dreadmalkin and Diversion
 * Specialist ("Sacrifice ANOTHER creature or X") were not in the probe's predicted set because its regex
 * did not admit "another"; Betrayer's Bargain and Final Payment WERE predicted and did not flip, because
 * they are THREE-option costs ("…or enchantment or pay {2}") and the AC-OR splitter requires exactly two
 * sides. Left parked deliberately: a split-point search that groups "A or B" + "C" is a separate slice with
 * its own ambiguity rules, not a rider on this one.
 *
 * ⛔ THE FAILURE DIRECTION IS A MIS-PAID COST: a union key one evaluator recognises and the other does not
 * would either refuse a printed payment (safe) or accept an off-union victim (forbidden). The pool row
 * below names the off-union permanent — an ARTIFACT offered to a "creature or enchantment" cost would be
 * the FP, and `sacTypeMatches`' fail-closed `false` default is what a typo'd key falls into.
 *
 * ⚠️ RAGAMUFFYN'S HELLBENT RIDER WAS VERIFIED AT RUNTIME BEFORE THE CARD WAS ACCEPTED, not assumed from the
 * classifier: with an empty hand the ability is offered (twice — once per legal victim, itself a
 * confirmation the union victim set works), with a card in hand it is withheld. The condition-rider
 * machinery is fail-closed by design, but "the design is fail-closed" is a comment, and comments have been
 * wrong four times this run.
 *
 * Mutation-checked (2026-08-07, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the three union keys removed from sacTypeMatches -> the union falls into the fail-closed `false`:
 *     every victim is refused, the activated abilities offer ZERO casts, and the cast lane offers nothing.
 *     Cards still classify native — the tier cannot see an unpayable cost. Only the offer rows can.
 *   · the union alternatives removed from SAC_COST_RE -> the four cast-lane cards park.
 *   · the union alternatives removed from sacOtherM -> the six activated-lane cards park, cast lane unaffected.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-07).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HEARTFIRE = { id: "c-hf", name: "Heartfire", type: "Instant", mana: "{1}{R}",
  oracle: "As an additional cost to cast this spell, sacrifice a creature or planeswalker.\nHeartfire deals 4 damage to any target." };
const MERCILESS_RESOLVE = { id: "c-mr", name: "Merciless Resolve", type: "Instant", mana: "{2}{B}",
  oracle: "As an additional cost to cast this spell, sacrifice a creature or land.\nDraw two cards." };
const ERTAI = { id: "c-er", name: "Ertai, the Corrupted", type: "Legendary Creature — Phyrexian Human Wizard", mana: "{2}{W}{U}{B}", power: "3", toughness: "4",
  oracle: "{U}, {T}, Sacrifice a creature or enchantment: Counter target spell." };
const SPARK_REAPER = { id: "c-sr", name: "Spark Reaper", type: "Creature — Zombie", mana: "{2}{B}", power: "2", toughness: "3",
  oracle: "{3}, Sacrifice a creature or planeswalker: You gain 1 life and draw a card." };

describe("the carriers", () => {
  it("⭐ both lanes flip — cast costs and activated costs", () => {
    for (const c of [HEARTFIRE, MERCILESS_RESOLVE, ERTAI, SPARK_REAPER]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ both grammars emit the SAME canonical key — the one-evaluator contract", () => {
    const castKey = extractAdditionalCosts(
      "As an additional cost to cast this spell, sacrifice a creature or enchantment. Draw a card.").costs[0].sacType;
    const abs = parseActivatedAbilities({ name: "X", type: "Creature — Zombie",
      oracle: "{1}, Sacrifice a creature or enchantment: Draw a card." });
    const activatedKey = abs?.[0]?.sacOther?.type;
    const row = { castKey, activatedKey };
    console.log("  WITNESS sacUnionKeys", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ castKey: "creatureOrEnchantment", activatedKey: "creatureOrEnchantment" });
  });

  it("⛔ the THREE-option compound stays parked — two vetted sides is the AC-OR contract", () => {
    // Betrayer's Bargain / Final Payment. A split-point search is a separate slice; until then, parked.
    expect(extractAdditionalCosts(
      "As an additional cost to cast this spell, sacrifice a creature or enchantment or pay {2}. Draw a card.").costs).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — the VICTIM pool, with the off-union permanent named", () => {
  function ertaiBoard() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, type, extra = {}) => createPermanent({ id, controller: "user", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, oracle: "", ...extra } });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user,
        manaPool: { ...s.players.user.manaPool, U: 1 },
        battlefield: [
          mk("ERTAI", "Legendary Creature — Phyrexian Human Wizard", { power: 3, toughness: 4, oracle: "{U}, {T}, Sacrifice a creature or enchantment: Counter target spell." }),
          mk("MY_CREATURE", "Creature — Bear", { power: 2, toughness: 2 }),
          mk("MY_ENCHANTMENT", "Enchantment"),
          // ⛔ the off-union permanent — an artifact must never be offered to "creature or enchantment".
          mk("MY_ARTIFACT", "Artifact"),
        ] } },
      // a spell on the stack so Counter target spell has a target and the ability is offerable
      stack: [{ kind: "spell", id: "sp1", controller: "ai1", card: { id: "c-sp", name: "Foo", type: "Instant", oracle: "Draw a card." } }] };
  }
  it("⭐⭐ Ertai offers creature AND enchantment victims — never the artifact", () => {
    const s = ertaiBoard();
    const offers = filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
      .filter((a) => /Ertai/.test(a.name || "") || a.permanentId === "ERTAI");
    const victims = offers.map((a) => a.sacOtherId || a.sacCreatureId || a.sacName).sort();
    console.log("  WITNESS ertaiVictims", JSON.stringify(victims)); // vitest 4 needs --disable-console-intercept
    // Ertai itself is also a creature and a legal victim ("a creature", not "another").
    expect(victims.length).toBeGreaterThanOrEqual(2);
    const joined = JSON.stringify(offers.map((a) => Object.values(a).join("|")));
    expect(joined).toContain("MY_CREATURE");
    expect(joined).toContain("MY_ENCHANTMENT");
    expect(joined, "an ARTIFACT must never satisfy creature-or-enchantment").not.toContain("MY_ARTIFACT");
  });
});
