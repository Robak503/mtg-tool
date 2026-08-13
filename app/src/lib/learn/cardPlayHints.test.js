/**
 * cardPlayHints.test.js — the PLAY-HINTS layer (2026-08-12, Colton's order: "the AI must not be blind
 * to cards it can't route"). Design: docs/orchestration/PLAY-HINTS-LEDGER.md.
 *
 * THE SYSTEM: deriveCardRole gives EVERY card (parked included) a deterministic role+timing from
 * PRINTED text · a warmed ledger file (scripts/warm-play-hints.mjs → card-play-hints.json) can override
 * per card, curated entries winning · the learn API routes thread the map as policy.playHints ·
 * opponentAI's scorer consumes it through per-archetype ROLE tables.
 *
 * ⛔⛔ THE DEFAULT-OFF CONTRACT IS THE LOAD-BEARING ROW: no hints threaded ⇒ scoreCastAction is
 * byte-identical to the legacy flag scorer — the frozen self-play trajectory hashes depend on it
 * (the resolveArbiter precedent). The Academy routes opt in; selfPlayRunner does not.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the hint branch removed from scoreCastAction -> the hint-aware rows collapse to legacy scores
 *     (the control wipe reads 4 again — blind).
 *
 * Real oracle fixtures (bundled Scryfall shapes, probed 2026-08-12).
 */
import { describe, expect, it } from "vitest";

import { deriveCardRole, lookupPlayHint } from "./cardPlayHints.js";
import { __scoreCastActionForTests } from "./opponentAI.js";

const WRATH = { name: "Wrath of God", type: "Sorcery", mana: "{2}{W}{W}", oracle: "Destroy all creatures. They can't be regenerated." };
const COUNTER = { name: "Counterspell", type: "Instant", mana: "{U}{U}", oracle: "Counter target spell." };
const CULTIVATE = { name: "Cultivate", type: "Sorcery", mana: "{2}{G}", oracle: "Search your library for up to two basic land cards, reveal those cards, and put one onto the battlefield tapped and the other into your hand, then shuffle." };
const HOOF = { name: "Craterhoof Behemoth", type: "Creature — Beast", mana: "{5}{G}{G}{G}", power: "5", toughness: "5", oracle: "Haste\nWhen this creature enters, creatures you control get +X/+X and gain trample until end of turn, where X is the number of creatures you control." };
const PARKED = { name: "Ember Island Production", type: "Sorcery", mana: "{2}{R}", oracle: "Some wholly unmodeled text the engine cannot route." };

describe("⭐ deriveCardRole — every card gets an identity, parked or not", () => {
  it("the signal families land, reminder text carries nothing", () => {
    const row = {
      wrath: deriveCardRole(WRATH),
      counter: deriveCardRole(COUNTER),
      cultivate: deriveCardRole(CULTIVATE),
      hoof: deriveCardRole(HOOF),
      parked: deriveCardRole(PARKED),
      reminderOnly: deriveCardRole({ name: "T", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2",
        oracle: "Daunt (This creature can't be blocked by creatures with power 2 or less. Destroy all creatures.)" }),
    };
    console.log("  WITNESS deriveRoles", JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.role])))); // vitest 4 needs --disable-console-intercept
    expect(row.wrath).toMatchObject({ role: "wipe", timing: "hold-wipe" });
    expect(row.counter).toMatchObject({ role: "counterspell", timing: "hold-interaction" });
    expect(row.cultivate).toMatchObject({ role: "ramp", timing: "early" });
    expect(row.hoof).toMatchObject({ role: "finisher", timing: "late" }); // mv 8 — anthem text is secondary to the body
    expect(row.parked).toMatchObject({ role: "utility" }); // total: even gibberish gets the honest default
    expect(row.reminderOnly.role).not.toBe("wipe"); // the parenthetical "Destroy all creatures" is stripped
  });

  it("⭐ lookupPlayHint — the ledger wins, derivation fills, malformed entries fall through", () => {
    const hints = { "Wrath of God": { role: "wipe", timing: "hold-wipe", note: "hold until 2+ enemy creatures", source: "curated" }, "Counterspell": { bogus: true } };
    expect(lookupPlayHint(hints, WRATH).note).toBe("hold until 2+ enemy creatures");
    expect(lookupPlayHint(hints, COUNTER)).toMatchObject({ role: "counterspell" }); // malformed → derived
    expect(lookupPlayHint(null, CULTIVATE)).toMatchObject({ role: "ramp" });        // no ledger → derived
  });
});

describe("⛔⛔ the scorer contract — hints change ORDER only when threaded", () => {
  const act = (card) => ({ cmc: (String(card.mana).match(/\{/g) || []).length, fromZone: "hand" });

  it("⛔⛔ DEFAULT-OFF: no hint ⇒ byte-identical legacy scores (the frozen-hash contract)", () => {
    // The legacy scorer cannot SEE a wipe ("destroy all" fails its interaction regex): control scored
    // Wrath of God as the else-bucket 4. That exact blindness must persist when hints are off.
    const row = {
      legacyControlWrath: __scoreCastActionForTests(act(WRATH), WRATH, "control"),
      legacyControlCounter: __scoreCastActionForTests(act(COUNTER), COUNTER, "control"),
    };
    console.log("  WITNESS legacyScores", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ legacyControlWrath: 4, legacyControlCounter: 0 });
  });

  it("⭐⭐ HINTS ON: the control wipe jumps to priority 0 — the blindness this build removes", () => {
    const row = {
      controlWrath: __scoreCastActionForTests(act(WRATH), WRATH, "control", deriveCardRole(WRATH)),
      controlCounter: __scoreCastActionForTests(act(COUNTER), COUNTER, "control", deriveCardRole(COUNTER)),
      rampFinisher: __scoreCastActionForTests(act(HOOF), HOOF, "ramp", deriveCardRole(HOOF)),
      aggroCheapBody: __scoreCastActionForTests({ cmc: 2, fromZone: "hand" }, { name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" }, "aggro", deriveCardRole({ name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" })),
      parkedUtility: __scoreCastActionForTests(act(PARKED), PARKED, "midrange", deriveCardRole(PARKED)),
    };
    console.log("  WITNESS hintScores", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.controlWrath).toBe(0);       // control WANTS the wipe first
    expect(row.controlCounter).toBe(0);     // interaction stays top
    expect(row.rampFinisher).toBe(2);       // the ramp deck's payoff slot (the legacy cmc>=7 rule, by role)
    expect(row.aggroCheapBody).toBe(0);     // the aggro creature-curve override survives
    expect(row.parkedUtility).toBe(3);      // a parked card scores as a citizen, not an unknown
  });
});
