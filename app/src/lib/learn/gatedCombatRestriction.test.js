/**
 * gatedCombatRestriction.test.js — CONDITION-GATED combat restrictions on the SELF:
 * "Threshold — As long as there are seven or more cards in your graveyard, this creature gets +2/+2 AND
 * CAN'T BLOCK." (Childhood Horror, Putrid Imp, Dirty Wererat, Frightcrawler) and its evasion twin
 * "…gets +1/+0 and CAN'T BE BLOCKED." (Vortex Runner, Nightwhorl Hermit, Jace's Sentinel).
 *
 * ⭐ BUILT ENGINE, NO IGNITION — the sixth time this shape has paid on this project. Nothing here is new
 * machinery: `cantBlock` and `unblockable` are both modelled pseudo-keywords read layer-aware by
 * combatEvasion.canBlockAttacker, and emitGatedEffect already knew how to hang a gate on an addKeyword
 * (Excavating Anurid's "+1/+1 and has vigilance" emits both halves today). The RIDER simply had no entry
 * point: emitGatedEffect consumed "gets +X/+Y" and "has <keyword>" and nothing else, so a restriction rider
 * fell through to the unconsumed-rider return and took the WHOLE clause down with it, parking the card.
 *
 * ⓘ HOW IT WAS FOUND, because the method matters more than the seven cards. The wake report claimed
 * threshold + spell mastery + lieutenant "share ONE cause" — 38 cards behind one gate. Censusing them
 * showed **91 parked across 82 distinct effect shapes**: they share an ABILITY WORD, not a cause. That is
 * gate 20's exact failure (grouping by symptom), and the correction is banked in the run ledger. Re-cutting
 * the census by RIDER instead of by ability word is what surfaced this cluster — the largest tractable one.
 *
 * ⛔ THE `$` ANCHOR IS THE WHOLE SAFETY ARGUMENT, and it is not decoration:
 *   "can't be blocked"                              → unblockable  ✓
 *   "can't be blocked EXCEPT by artifact creatures" → nothing      (fear — filtered, far weaker)
 *   "can't be blocked BY creatures with flying"     → nothing      (filtered)
 * Mapping either filtered form onto bare `unblockable` would make the creature unblockable by EVERYTHING —
 * a forbidden false positive. Frightcrawler would have tripped it on its own first line (it prints fear).
 * Both negatives are pinned below; do not relax the anchor into a prefix match.
 *
 * ⓘ DELIBERATELY NOT IN THIS SLICE: "can attack as though it didn't have defender" (8 carriers, the larger
 * cluster). It is an AS-THOUGH effect (CR 609.4b), not a keyword removal, so emitting
 * removeKeyword:defender would be observably wrong to everything else that reads defender ("creatures with
 * defender you control get …", Wall tribal). It needs its own pseudo-keyword honored at the two attack-
 * declaration enumeration sites — a real build, not ignition, and a separate slice.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the RIDERS
 * lookup removed from emitGatedEffect -> all seven park again and the runtime drive shows the creature
 * blocking freely with 7 cards in the graveyard.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CHILDHOOD_HORROR = { id: "c-ch", name: "Childhood Horror", type: "Creature — Nightmare Horror",
  mana: "{3}{B}", power: "2", toughness: "2",
  oracle: "Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and can't block." };
const VORTEX_RUNNER = { id: "c-vr", name: "Vortex Runner", type: "Creature — Merfolk Rogue", mana: "{2}{U}",
  power: "2", toughness: "1",
  oracle: "As long as you control eight or more lands, this creature gets +1/+0 and can't be blocked." };
const FRIGHTCRAWLER = { id: "c-fc", name: "Frightcrawler", type: "Creature — Zombie Horror", mana: "{1}{B}",
  power: "1", toughness: "1",
  oracle: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and can't block." };
const NIGHTWHORL_HERMIT = { id: "c-nh", name: "Nightwhorl Hermit", type: "Creature — Human Rogue",
  mana: "{2}{U}", power: "1", toughness: "3",
  oracle: "Vigilance\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+0 and can't be blocked." };

const kwOf = (card) => (parseStaticAbilities(card) || []).map((e) => e.op?.keyword).filter(Boolean);
const gy = (n) => Array.from({ length: n }, (_, i) => ({ id: `gy${i}`, name: `Card ${i}`, type: "Instant", oracle: "" }));

describe("the rider is consumed and the carriers flip", () => {
  it("⭐ can't block → the modelled cantBlock pseudo-keyword, carrying the gate", () => {
    expect(kwOf(CHILDHOOD_HORROR)).toEqual(["cantBlock"]);
    expect(parseStaticAbilities(CHILDHOOD_HORROR).every((e) => e.op?.gate)).toBe(true);
    expect(classifyCard(CHILDHOOD_HORROR)).toBe("native-static");
  });

  it("⭐ can't be blocked → unblockable, carrying the gate", () => {
    expect(kwOf(VORTEX_RUNNER)).toEqual(["unblockable"]);
    expect(classifyCard(VORTEX_RUNNER)).toBe("native-static");
    expect(classifyCard(NIGHTWHORL_HERMIT)).toBe("native-static");
  });

  it("⛔ FILTERED evasion maps to NOTHING — the whole clause parks rather than over-grant", () => {
    const probe = (rider) => kwOf({ id: "p", name: "Probe", type: "Creature — Human", mana: "{1}{B}",
      power: "1", toughness: "1",
      oracle: `As long as you control eight or more lands, this creature gets +1/+0 and ${rider}` });
    expect(probe("can't be blocked except by artifact creatures.")).toEqual([]);
    expect(probe("can't be blocked by creatures with flying.")).toEqual([]);
    expect(probe("can't be blocked.")).toEqual(["unblockable"]);
    // Frightcrawler prints fear on its FIRST line and the restriction on its second — the fear reminder
    // must not bleed into the gated rider.
    expect(kwOf(FRIGHTCRAWLER)).toEqual(["cantBlock"]);
  });
});

describe("⭐ LAW 6 — the gate toggles at the real block gate, not just in the spec", () => {
  // Attacker `atk` (ai1) swinging at the user; `sub` is the user's creature under test.
  function board(subjectCard, graveyardCount) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const sub = createPermanent({ id: "sub", card: subjectCard, controller: "user", summoningSick: false });
    const atk = createPermanent({ id: "atk", card: { id: "rd", name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    return {
      ...s,
      phase: "combat", step: "declare-blockers", activePlayer: "ai1", priorityHolder: "user", turn: 5,
      combat: { attackers: [{ permanentId: "atk", defender: "user" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [sub], graveyard: gy(graveyardCount) },
        ai1: { ...s.players.ai1, battlefield: [atk] },
      },
    };
  }

  it("⭐ Childhood Horror: below threshold it blocks at 2/2 — at threshold it is 4/4 and CANNOT", () => {
    const rows = [];
    for (const n of [6, 7]) {
      const s = board(CHILDHOOD_HORROR, n);
      rows.push({
        graveyard: n,
        pt: `${permanentPower(s, "sub")}/${permanentToughness(s, "sub")}`,
        cantBlock: permanentHasKeyword(s, "sub", "cantBlock"),
        mayBlock: canBlockAttacker(s, "sub", "atk", "user"),
      });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // a broken harness reads as a uniform negative — print it
    expect(rows).toEqual([
      { graveyard: 6, pt: "2/2", cantBlock: false, mayBlock: true },
      { graveyard: 7, pt: "4/4", cantBlock: true, mayBlock: false },
    ]);
  });

  it("⭐ Nightwhorl Hermit: at threshold it becomes unblockable — the ATTACKER side of the same gate", () => {
    // Roles reversed: the subject attacks, the ai1 creature tries to block it.
    const attackerBoard = (n) => {
      let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
      const sub = createPermanent({ id: "sub", card: NIGHTWHORL_HERMIT, controller: "user", summoningSick: false });
      const blk = createPermanent({ id: "blk", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
      return {
        ...s,
        phase: "combat", step: "declare-blockers", activePlayer: "user", priorityHolder: "ai1", turn: 5,
        combat: { attackers: [{ permanentId: "sub", defender: "ai1" }], blockers: [] },
        players: {
          ...s.players,
          user: { ...s.players.user, battlefield: [sub], graveyard: gy(n) },
          ai1: { ...s.players.ai1, battlefield: [blk] },
        },
      };
    };
    const rows = [6, 7].map((n) => {
      const s = attackerBoard(n);
      return { graveyard: n, power: permanentPower(s, "sub"), mayBeBlocked: canBlockAttacker(s, "blk", "sub", "ai1") };
    });
    console.log("  WITNESS", JSON.stringify(rows));
    expect(rows).toEqual([
      { graveyard: 6, power: 1, mayBeBlocked: true },
      { graveyard: 7, power: 2, mayBeBlocked: false },
    ]);
  });
});
