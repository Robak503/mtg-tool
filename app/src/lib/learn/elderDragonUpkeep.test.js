/**
 * elderDragonUpkeep.test.js — "At the beginning of your upkeep, sacrifice <NAME> unless you pay {cost}."
 * Palladia-Mors, Chromium, Vaevictis Asmadi, Arcades Sabboth and Kuro, Pitlord.
 *
 * ⭐ THE SUBSYSTEM WAS FINISHED AND UNREACHABLE. `sac-unless-pay` has existed for ages, and the byte-
 * identical clause with the pronoun — "sacrifice THIS CREATURE unless you pay {R}{G}{W}" — parses HIGH.
 * The only thing standing between five cards and a working mechanism was the printed PROPER NOUN: the
 * trigger's SUBJECT matchers have always understood a card naming itself, but the EFFECT CLAUSE kept the
 * raw name and reached the effect parser with "Palladia-Mors" in it.
 *
 * ⛔⛔ THIS IS ONE ANCHORED ARM, NOT A GLOBAL RENAME — and that distinction is the whole story of this fix.
 * Rewriting the self-name across the trigger oracle was attempted TWICE on 2026-08-05 and measured
 * **+35/−25** and then **+13/−29**:
 *   · the first reused staticAbilityParser.selfNormalizeOracle, which STRIPS REMINDER TEXT — and the
 *     trigger path reads storm and cascade out of exactly that reminder, so Tendrils of Agony, Brain Freeze
 *     and Flusterstorm fell out, while the INSTANT Bituminous Blast became "this creature deals 4 damage";
 *   · the second was type-aware and reminder-preserving, and still produced "this permanent" for the
 *     CREATURE Tajic on a path where the type wasn't in hand, dropping 29 epithet legendaries.
 * rewriteSelfNameToThisCreature is an ALLOWLIST OF EXACT GRAMMARS for precisely this reason. The arm added
 * here keeps that contract: whole-clause anchored, mana-cost-only tail, and the parser re-gates the
 * rewritten form anyway. Measured +5 / 0 / 0. **A global text rewrite at a shared seam is never the small
 * fix it looks like.**
 *
 * ⓘ "this creature" is safe for every carrier: all 8 corpus cards with this clause are Legendary Creatures
 * (censused 2026-08-05), so the noun cannot be wrong the way it was in the global attempt. Three of the
 * eight (Nicol Bolas, Piru, Eldest Dragon Highlander) stay parked on OTHER lines — the arm is not what
 * holds them back.
 *
 * ⓘ Kuro, Pitlord flips through the SHORT name: the card is "Kuro, Pitlord" and its own text says
 * "sacrifice Kuro" (CR 201.2b), which the existing short-name candidate already handled.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the arm
 * removed -> all five park and the descriptor goes back to carrying the proper noun.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram, resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PALLADIA_MORS = { id: "c-pm", name: "Palladia-Mors", type: "Legendary Creature — Elder Dragon",
  mana: "{4}{R}{G}{W}", power: "7", toughness: "7",
  oracle: "Flying, trample\nAt the beginning of your upkeep, sacrifice Palladia-Mors unless you pay {R}{G}{W}." };
const KURO = { id: "c-kp", name: "Kuro, Pitlord", type: "Legendary Creature — Demon Spirit",
  mana: "{5}{B}{B}", power: "9", toughness: "9",
  oracle: "At the beginning of your upkeep, sacrifice Kuro unless you pay {B}{B}{B}{B}.\nPay 1 life: Target creature gets -1/-1 until end of turn." };

describe("the proper noun stops blocking a finished subsystem", () => {
  it("⭐ the descriptor now carries the pronoun, and it ROUTES", () => {
    const ds = detectTriggers(PALLADIA_MORS);
    expect(ds).toHaveLength(1);
    expect(String(ds[0].effectClause)).toBe("sacrifice this creature unless you pay {R}{G}{W}");
    expect(triggerRoutesNatively(ds[0], PALLADIA_MORS)).toBe(true);
    expect(classifyCard(PALLADIA_MORS)).toBe("native-trigger");
  });

  it("the SHORT name works too — the card is 'Kuro, Pitlord' and says 'sacrifice Kuro'", () => {
    expect(String(detectTriggers(KURO)[0].effectClause)).toBe("sacrifice this creature unless you pay {B}{B}{B}{B}");
    expect(classifyCard(KURO)).toBe("native-mixed");
  });

  it("⛔ the arm is ANCHORED — a differently-shaped sacrifice clause is untouched", () => {
    // Not the sac-unless-pay grammar: no mana cost tail. Must stay unrewritten rather than be coerced.
    const other = { ...PALLADIA_MORS, id: "c-x", name: "Palladia-Mors",
      oracle: "At the beginning of your upkeep, sacrifice Palladia-Mors unless you discard a card." };
    expect(String(detectTriggers(other)[0]?.effectClause || "")).toContain("Palladia-Mors");
  });
});

describe("⭐ LAW 6 — the upkeep choice is real: decline sacrifices, pay keeps it", () => {
  // ⛔ THE POOL MUST BE STOCKED, and the first version of this harness wasn't. The contract is
  // pay-AND-AFFORD: with an empty pool the "pay" branch cannot be taken and the Dragon is sacrificed
  // anyway — correct engine behaviour that reads exactly like a broken choice. Both rows looked identical
  // and the drive proved nothing until {R}{G}{W} was actually available.
  function board({ mana }) {
    const drag = createPermanent({ id: "drag", card: PALLADIA_MORS, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, turn: 5, phase: "beginning", step: "upkeep", activePlayer: "user",
      players: { ...g.players, user: { ...g.players.user, battlefield: [drag],
        manaPool: { ...g.players.user.manaPool, ...mana } } } };
  }
  // ⛔ Program comes from the PARSED descriptor, not a literal — parser and runtime are otherwise tested
  // separately, and a disagreement between them would leave both halves green.
  const program = () => ({ version: 1, structure: "sequence",
    atoms: parseEffectClause(String(detectTriggers(PALLADIA_MORS)[0].effectClause), "Instant", { sourceScoped: true }).atoms });
  const fire = (s) => runEffectProgram(s, { source: PALLADIA_MORS,
    payload: { params: { program: program(), controller: "user", targets: [], sourceId: "drag" } } });

  it("⭐ DECLINE → the Dragon dies; PAY → it lives", () => {
    const rows = [];
    for (const pay of [false, true]) {
      let s = fire(board({ mana: { R: 1, G: 1, W: 1 } }));
      const paused = s.pendingChoice?.kind || null;
      s = resolveSacUnlessPayChoice(s, pay);
      rows.push({ pay, paused,
        onBattlefield: s.players.user.battlefield.some((p) => p.id === "drag"),
        inGraveyard: s.players.user.graveyard.some((c) => c.name === "Palladia-Mors"),
        poolAfter: `${s.players.user.manaPool.R}${s.players.user.manaPool.G}${s.players.user.manaPool.W}` });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      // Declining leaves the pool untouched — nothing was charged.
      { pay: false, paused: "sac-unless-pay", onBattlefield: false, inGraveyard: true, poolAfter: "111" },
      // ⛔ THE PAY ROW IS THE ONE THAT MATTERS. Without it a resolver that sacrificed unconditionally would
      // look correct — the decline row alone cannot tell "the choice works" from "it always dies".
      // ⭐ And paying really CHARGES: {R}{G}{W} drains to 000. Without this the row could pass on a
      // resolver that kept the creature for free.
      { pay: true, paused: "sac-unless-pay", onBattlefield: true, inGraveyard: false, poolAfter: "000" },
    ]);
  });
});
