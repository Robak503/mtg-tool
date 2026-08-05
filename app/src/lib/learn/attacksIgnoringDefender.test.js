/**
 * attacksIgnoringDefender.test.js — "can attack as though it didn't have defender" (CR 609.4b + 702.3b):
 * Ogre Jailbreaker, Skyclave Sentinel, Spire Serpent, Slithering Shade, Geist of the Lonely Vigil, and ~45
 * more carriers. Before this, ZERO of them were native — nothing in the engine honored the phrase at all.
 *
 * ⛔ THE MODELLING DECISION IS THE WHOLE SLICE, so read this before "simplifying" it. The obvious
 * implementation is a layer-6 removeKeyword:defender — the creature attacks, the tests go green, and it is
 * WRONG. An as-though effect does not change what the permanent IS (CR 609.4b); it only lifts one
 * restriction. Defender is read by more than the attack gate:
 *   · "Each creature you control WITH DEFENDER assigns combat damage equal to its toughness …"
 *     (Arcades, the Strategist / High Alert / Huatli) — the buff would silently switch OFF.
 *   · "Creatures with defender you control get …" and Wall-tribal selectors — same silent loss.
 * So the escape rides its OWN pseudo-keyword, honored at exactly two places and nowhere else: the two
 * attack-declaration enumeration sites (legalChoices.actionsDeclareAttacker and opponentAI's mirror scan).
 * The creature keeps defender for every other reader. Both halves are pinned below — the attack becomes
 * legal AND permanentHasKeyword(…,"Defender") stays TRUE. Do not collapse this into a removeKeyword.
 *
 * ⭐ THE SECOND BUG WAS A PURE PATH ACCIDENT, and it was the expensive half. EVERY gated lane in
 * staticAbilityParser demanded the effect open with "gets" or "has" — the three control-gate arms and the
 * general SELF AS-LONG-AS lane alike. So a gate carrying a BARE permission or restriction ("As long as you
 * control a Gate, this creature CAN ATTACK as though it didn't have defender") matched NO lane and parked,
 * even though emitGatedEffect knows the rider. Nothing routed it there.
 *
 * ⚠️ THE FIRST FIX FOR THAT WAS WRONG AND THE SUITE CAUGHT IT — worth recording, because the wrong version
 * looked fine and measured the same +10. It added a NEW generic arm in the middle of the control-gate
 * block, which then intercepted clauses the SPECIFIC equipped / counter / graveyard lanes below it owned,
 * handing them gates carrying `gateOn:"source"` instead of the bare shapes those lanes emit. Six pins
 * across four files went red. **A generic fallback belongs LAST, not in the middle** — and the correct
 * home already existed: the SELF AS-LONG-AS lane runs after every specific lane and already strips gateOn.
 * The shipped change is one widened capture group there, not a new arm.
 *
 * ⛔ THE RETURN IS CONDITIONAL, and the asymmetry is deliberate. For a "gets"/"has" effect it stays
 * UNCONDITIONAL — that is the lane's documented contract (an unconsumed rider parks the whole clause, a
 * safe FN). For the newly admitted shapes it returns ONLY on a real emission, because the widened regex
 * matches clauses this lane never owned and swallowing them on a no-match would starve the branches below.
 *
 * ⓘ MEASURED +10 / 0 / 0, all audited whole-card. Three of the ten came from the bare arm rather than the
 * new keyword and are worth naming, because they show the path accident was costing more than this family:
 * Ethrimik, Imagined Fiend ("As long as you control another creature, ~ can't attack or block") and
 * Metathran Elite / Pillar of War (an `isEnchanted` gate — a DISTINCT gate kind from isEquipped; an Aura is
 * not an Equipment, and mapping one to the other would have been a false positive).
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 * the legalChoices escape removed -> Ogre Jailbreaker vanishes from the legal attackers with a Gate out;
 * the SELF AS-LONG-AS effect group narrowed back to `(?:gets|has) .+` -> the carriers park again.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OGRE_JAILBREAKER = { id: "c-oj", name: "Ogre Jailbreaker", type: "Creature — Ogre Rogue", mana: "{3}{B}",
  power: "4", toughness: "4",
  oracle: "Defender\nThis creature can attack as though it didn't have defender as long as you control a Gate." };
const SPIRE_SERPENT = { id: "c-ss", name: "Spire Serpent", type: "Creature — Serpent", mana: "{4}{U}",
  power: "2", toughness: "5",
  oracle: "Defender\nMetalcraft — As long as you control three or more artifacts, this creature gets +2/+2 and can attack as though it didn't have defender." };
const GATE = { id: "c-gt", name: "Sunken Gate", type: "Land — Gate", oracle: "" };
const PLAIN_WALL = { id: "c-pw", name: "Wall of Stone", type: "Creature — Wall", mana: "{1}{R}{R}",
  power: "0", toughness: "8", oracle: "Defender" };

describe("the phrase is parsed, and it is NOT modelled as removing defender", () => {
  it("⭐ emits the escape pseudo-keyword, gated", () => {
    const eff = parseStaticAbilities(OGRE_JAILBREAKER) || [];
    expect(eff.map((e) => e.op?.layerOp)).toEqual(["addKeyword"]);
    expect(eff[0].op.keyword).toBe("attacksIgnoringDefender");
    expect(eff[0].op.gate).toBeTruthy();
    expect(classifyCard(OGRE_JAILBREAKER)).toBe("native-static");
  });

  it("⛔ NOTHING emits a removeKeyword for defender — that would break every OTHER defender reader", () => {
    for (const card of [OGRE_JAILBREAKER, SPIRE_SERPENT]) {
      expect((parseStaticAbilities(card) || []).some((e) => e.op?.layerOp === "removeKeyword")).toBe(false);
    }
  });

  it("the combined 'gets +2/+2 and can attack as though …' form emits BOTH halves", () => {
    expect((parseStaticAbilities(SPIRE_SERPENT) || []).map((e) => e.op?.layerOp))
      .toEqual(["ptModifyGated", "addKeyword"]);
  });
});

describe("⭐ LAW 6 — the escape is honored at the real attack-declaration gate", () => {
  function board({ withGate }) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const jail = createPermanent({ id: "jail", card: OGRE_JAILBREAKER, controller: "user", summoningSick: false });
    const wall = createPermanent({ id: "wall", card: PLAIN_WALL, controller: "user", summoningSick: false });
    const bf = withGate
      ? [jail, wall, createPermanent({ id: "gate", card: GATE, controller: "user" })]
      : [jail, wall];
    return {
      ...s,
      phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      combat: { attackers: [], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: bf } },
    };
  }

  it("⭐ no Gate → can't attack; play a Gate → it CAN, while a plain Wall still can't", () => {
    const rows = [false, true].map((withGate) => {
      const s = board({ withGate });
      const ids = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
      return {
        gate: withGate,
        jailbreakerMayAttack: ids.includes("jail"),
        plainWallMayAttack: ids.includes("wall"),     // the control: defender still bars a normal Wall
        stillHasDefender: permanentHasKeyword(s, "jail", "Defender"),
      };
    });
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { gate: false, jailbreakerMayAttack: false, plainWallMayAttack: false, stillHasDefender: true },
      // ⛔ stillHasDefender stays TRUE with the Gate out — that is the CR 609.4b claim, and the reason this
      // is a separate pseudo-keyword instead of a removeKeyword.
      { gate: true, jailbreakerMayAttack: true, plainWallMayAttack: false, stillHasDefender: true },
    ]);
  });
});
