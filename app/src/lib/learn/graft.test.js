/**
 * graft.test.js — GRAFT N (CR 702.57a): Vigean Hydropon, Simic Initiate.
 *
 * "Graft 2 (This creature enters with two +1/+1 counters on it. Whenever another creature enters, you may
 * move a +1/+1 counter from this creature onto it.)"
 *
 * ⭐ FOUND BY SWEEPING FOR A SIGNATURE, NOT BY TRIPPING OVER A CARD. Four earlier bugs (fading, vanishing,
 * squad, impending) all left the same fingerprint: a descriptor whose effectClause carries an unbalanced
 * ')' it inherited from the reminder paren it was cut out of. A corpus sweep for exactly that turned up
 * graft — twelve carriers, all parked, all with the phantom
 * "you may move a +1/+1 counter from this creature onto it. )" and 0 of 12 routing natively.
 *
 * GRAFT HAS A MANDATORY HALF AND AN OPTIONAL ONE, and the credit is honest only because both are handled:
 *   · MANDATORY — "enters with N +1/+1 counters". ⛔ NOT OPTIONAL AND NOT SKIPPABLE: every graft carrier is
 *     printed 0/0, so these counters ARE the body. Reading zero puts a 0/0 on the battlefield that dies to
 *     the SBA on arrival — a wrong board state, not a missed option. The count lives ONLY in the KEYWORD
 *     (the reminder sentence is stripped before the generic matcher ever sees it), so
 *     entersWithPlusCounters reads it off "Graft N". Driven on the real enterPermanent path below.
 *   · OPTIONAL — "you MAY move a +1/+1 counter". Declining leaves the counters where they are, a real
 *     complete play, so not offering it loses nothing.
 *
 * ⛔ THE THIRD PIECE WAS A LANDMINE MY OWN FIX ARMED. Once entersWithPlusCounters started returning a
 * non-zero count for graft, coverage's enters-with branch began firing — and that strip is not paren-aware,
 * so it cut at "…on it." INSIDE the reminder and left "Graft 2 ( Whenever another creature enters, …)" as
 * orphan residue with an unbalanced paren. The card stayed parked, and the symptom was indistinguishable
 * from "the keyword still isn't credited". Graft now takes the RAVENOUS exemption that sits three lines
 * above it in that file, for the identical reason: stripReminder removes the whole reminder downstream, so
 * no printed-form strip is needed or wanted.
 *
 * ⓘ ONLY 2 OF THE 12 FLIP, and that is the honest number: the other ten carry real second abilities
 * (Sporeback Troll's regenerate, Cytoplast Manipulator's gain-control …) which are separate blockers. The
 * phantom fix and the counter read are still infrastructure — when those abilities are modeled, their
 * carriers will not enter as dying 0/0s.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * graft arm removed from entersWithPlusCounters -> the counters read 0 and the runtime pin shows a 0/0;
 * the graft reminder strip removed -> the phantom descriptor returns and the flip pins go red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { entersWithPlusCounters } from "./staticAbilityParser.js";
import { enterPermanent } from "./resolvers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const GRAFT_REMINDER = (n, word) => `Graft ${n} (This creature enters with ${word} +1/+1 counters on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)`;
const VIGEAN_HYDROPON = { id: "c-vh", name: "Vigean Hydropon", type: "Creature — Plant Mutant", mana: "{1}{G}{U}",
  power: 0, toughness: 0, oracle: `${GRAFT_REMINDER(5, "five")}\nThis creature can't attack or block.` };
const SIMIC_INITIATE = { id: "c-si", name: "Simic Initiate", type: "Creature — Human Mutant", mana: "{G}",
  power: 0, toughness: 0, oracle: "Graft 1 (This creature enters with a +1/+1 counter on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)" };

describe("the phantom descriptor is gone and the keyword is credited", () => {
  it("⭐ ⛔ NO trigger leaks out of the reminder — it used to be the only descriptor, and it never routed", () => {
    expect(detectTriggers(SIMIC_INITIATE)).toEqual([]);
    expect(detectTriggers(VIGEAN_HYDROPON)).toEqual([]);
  });

  it("the carriers flip", () => {
    expect(classifyCard(SIMIC_INITIATE)).toBe("native-body");
    expect(classifyCard(VIGEAN_HYDROPON)).toBe("native-body");
  });

  it("the keyword line is credited", () => {
    expect(isKeywordOnly("Graft 4")).toBe(true);
  });
});

describe("⭐ LAW 6 — the MANDATORY half really lands, or these 0/0s die on arrival", () => {
  it("the count is read off the KEYWORD, since the sentence lives only in the reminder", () => {
    expect(entersWithPlusCounters(SIMIC_INITIATE)).toBe(1);
    expect(entersWithPlusCounters(VIGEAN_HYDROPON)).toBe(5);
  });

  it("⭐ driven through enterPermanent: a printed 0/0 lands at N/N with the counters on it", () => {
    for (const [card, n] of [[SIMIC_INITIATE, 1], [VIGEAN_HYDROPON, 5]]) {
      const r = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), card, "user");
      const st = r?.state || r;
      const bf = st.players.user.battlefield;
      const p = bf[bf.length - 1];
      expect(p.counters).toEqual({ "+1/+1": n });
      expect(`${permanentPower(st, p.id)}/${permanentToughness(st, p.id)}`).toBe(`${n}/${n}`);
    }
  });

  it("⛔ graft-REFERENCING prose supplies no count — only the keyword line does", () => {
    expect(entersWithPlusCounters({ id: "c-x", name: "Odd", type: "Creature — Mutant", power: 2, toughness: 2,
      oracle: "Creatures with graft 3 you control have trample." })).toBe(0);
  });
});
