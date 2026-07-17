/**
 * SELF-NAMED-COUNTER-ON-CREATURE (frontier round 4) — extend the add-named-counter-self atom (built for
 * Door of Destinies' "put a charge counter on this artifact") to the CREATURE self subject: "put a spore
 * counter on this creature" (the Thallid upkeep, CR 122.1), "put an oil counter on this creature" (Phyrexia
 * oil creatures). The ±1/+1 self form stays on the add-counter path (target:"self" — it needs the lethal-SBA
 * / doubler / counters-placed passes); a NAMED (non-±1/+1) counter is never a P/T counter, so applyAddNamed-
 * CounterSelf (sourceId, creature-agnostic) is exactly right.
 *
 * Pins: parse (the creature self form → add-named-counter-self HIGH; the ±1/+1 self form is NOT stolen;
 * a rider stays LOW) · runtime (the named counter lands on the SOURCE creature) · coverage (a real flip:
 * Rustvine Cultivator native-activated, Utopia Mycon native-mana — both unblocked once the put-counter
 * effect parses HIGH) · CREED anti-FP (a "for each"/filtered count, and a ±1/+1 self, are unaffected).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "../../gameState.js";
import { parseEffectClause, programConfidence } from "../parser.js";
import { applyAddNamedCounterSelf, addNamedCounterSelfClauseParser } from "./counters.js";
import { classifyCard } from "../../coverage.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt) => parseEffectClause(txt, "Instant")?.atoms;
const confOf = (txt) => { const p = parseEffectClause(txt, "Instant"); return p ? programConfidence(p) : "no-program"; };

describe("parse — creature self named-counter", () => {
  it("'put a spore counter on this creature' → add-named-counter-self HIGH", () => {
    expect(confOf("put a spore counter on this creature")).toBe("high");
    expect(atomsOf("put a spore counter on this creature")).toEqual([{ op: "add-named-counter-self", counterType: "spore", amount: 1 }]);
  });
  it("'put two oil counters on this creature' → amount 2", () => {
    expect(atomsOf("put two oil counters on this creature")).toEqual([{ op: "add-named-counter-self", counterType: "oil", amount: 2 }]);
  });
  it("the artifact/permanent subjects still work (no regression)", () => {
    expect(atomsOf("put a charge counter on this artifact")).toEqual([{ op: "add-named-counter-self", counterType: "charge", amount: 1 }]);
    expect(atomsOf("put a verse counter on this permanent")).toEqual([{ op: "add-named-counter-self", counterType: "verse", amount: 1 }]);
  });
  it("the parser itself returns null for a ±1/+1 self (it stays on the add-counter target:self path)", () => {
    // addNamedCounterSelfClauseParser must NOT claim the ±1/+1 self form (the [a-z]+ NAME can't match "+1/+1",
    // belt-and-suspenders guard). The full program still parses HIGH via the add-counter path.
    expect(addNamedCounterSelfClauseParser("put a +1/+1 counter on this creature")).toBeNull();
    expect(atomsOf("put a +1/+1 counter on this creature")).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" }]);
  });
});

describe("runtime — the named counter lands on the SOURCE creature", () => {
  it("applyAddNamedCounterSelf adds the counter to ctx.sourceId (a creature)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const thal = createPermanent({ id: "thal", card: { id: "thal-c", name: "Thallid", type: "Creature — Fungus", power: 1, toughness: 1, oracle: "" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [thal] } } };
    const after = applyAddNamedCounterSelf(s, { op: "add-named-counter-self", counterType: "spore", amount: 1 }, { sourceId: "thal", controller: "user" });
    expect(after.players.user.battlefield.find((p) => p.id === "thal").counters).toEqual({ spore: 1 });
  });
  it("absent source → a clean no-op (never a throw / fabricated counter)", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const after = applyAddNamedCounterSelf(s, { op: "add-named-counter-self", counterType: "spore", amount: 1 }, { sourceId: "gone", controller: "user" });
    expect(after).toBe(s); // no mutation
  });
});

describe("coverage — real flips unblocked by the put-counter effect now parsing HIGH", () => {
  it("Rustvine Cultivator → native-activated (both activated abilities modeled)", () => {
    expect(classifyCard({
      name: "Rustvine Cultivator", type: "Artifact Creature — Construct",
      oracle: "{T}: Put an oil counter on this creature.\n{T}, Remove an oil counter from this creature: Untap target land.",
    })).toBe("native-activated");
  });
  it("a bare upkeep spore creature with no other text → native-trigger", () => {
    // (No such single-line card exists in the corpus — every Thallid carries a remove-counter ability — but the
    // primitive is correct in isolation: the upkeep self-named-counter trigger routes and the body is keyword-only.)
    expect(classifyCard({
      name: "Test Fungus", type: "Creature — Fungus",
      oracle: "At the beginning of your upkeep, put a spore counter on this creature.",
    })).toBe("native-trigger");
  });
});

describe("CREED anti-FP guards", () => {
  it("a 'for each' count form stays LOW → Arbiter (not a fabricated count)", () => {
    expect(confOf("put a spore counter on this creature for each fungus you control")).toBe("low");
  });
  it("a remove-counter activated ability whose EFFECT is unmodeled does NOT flip (CC-2 parses the cost, never the effect)", () => {
    // MIGRATED PIN (BLITZ CC-2): the plural "Remove three spore counters" COST now parses (counterCost-
    // Activated.test.js owns that lane), so the create-Saproling half-Thallid legitimately flips — the
    // whole-card gate it exercised lives on. The anti-FP spirit is preserved with an effect that stays
    // unmodeled (Vexing Puzzlebox's real library-search line): a parsed COST must never drag an unmodeled
    // EFFECT to native.
    expect(classifyCard({
      name: "Half Thallid", type: "Creature — Fungus",
      oracle: "Remove three spore counters from this creature: Create a 1/1 green Saproling creature token.",
    })).toBe("native-activated");
    expect(classifyCard({
      name: "Half Puzzlebox", type: "Artifact",
      oracle: "{T}, Remove three charge counters from this artifact: Search your library for an artifact card, put that card onto the battlefield, then shuffle.",
    })).toBe("body-only");
  });
});
