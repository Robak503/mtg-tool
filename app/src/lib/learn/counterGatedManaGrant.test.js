/**
 * counterGatedManaGrant.test.js — "Each creature you control WITH A COUNTER ON IT has \"{T}: Add <mana>\""
 * (SHELF-TAIL SH7 — Rishkar, Peema Renegade; CR 113.7 + 122). The mana twin of the counter-gated ward /
 * keyword grants: the unfiltered "each creature you control has \"{T}: Add {G}\"" was already native-mana;
 * the gap was the "with a counter on it" filter. Reuses the SAME requiresAnyCounter DYNAMIC selector the
 * ward grant uses (re-read per query, so a creature moves in/out live as counters arrive/leave), with
 * parseGrantedManaSpec for the body. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): disabling the arm → Rishkar body-only (parse/classify die); the runtime pin
 * (grantedManaSpecsFor) proves the grant lands ONLY on a creature carrying a counter — an uncounted
 * creature gets no mana source, which is the whole point of the filter and invisible to classification.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { staticEffectsOf, grantedManaSpecsFor } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RISHKAR_ORACLE = "When this creature enters, put a +1/+1 counter on each of up to two target creatures.\nEach creature you control with a counter on it has \"{T}: Add {G}.\"";

describe("SH7 — parse + classify", () => {
  it("Rishkar classifies native-mixed; the unfiltered grant stays native-mana", () => {
    expect(classifyCard({ name: "Rishkar, Peema Renegade", type: "Legendary Creature — Elf Druid", power: 2, toughness: 2, oracle: RISHKAR_ORACLE })).toBe("native-mixed");
    expect(classifyCard({ name: "Manaweft", type: "Creature — Sliver", power: 1, toughness: 1, oracle: "Each creature you control has \"{T}: Add {G}.\"" })).toBe("native-mana");
  });
  it("the static emits an addAbility(mana) op over the requiresAnyCounter dynamic selector", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const rishkar = createPermanent({ id: "rish", controller: "user", card: { id: "cr", name: "Rishkar, Peema Renegade", type: "Legendary Creature — Elf Druid", power: 2, toughness: 2, oracle_text: RISHKAR_ORACLE } });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [rishkar] } } };
    const op = staticEffectsOf(s, rishkar).find((f) => f.op?.layerOp === "addAbility" && f.op.grant?.kind === "mana");
    expect(op).toBeTruthy();
    expect(op.affects).toMatchObject({ mode: "dynamic", selector: { requiresAnyCounter: true } });
  });
});

describe("SH7 — the grant lands ONLY on creatures that carry a counter (runtime)", () => {
  it("a COUNTERED creature gets the granted mana source; an UNCOUNTED one does NOT (mutation-check line)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const rishkar = createPermanent({ id: "rish", controller: "user", card: { id: "cr", name: "Rishkar, Peema Renegade", type: "Legendary Creature — Elf Druid", power: 2, toughness: 2, oracle_text: RISHKAR_ORACLE } });
    const withCtr = createPermanent({ id: "wc", controller: "user", card: { id: "cw", name: "Countered Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle_text: "" } });
    const noCtr = createPermanent({ id: "nc", controller: "user", card: { id: "cn", name: "Plain Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle_text: "" } });
    withCtr.counters = { "+1/+1": 1 };
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [rishkar, withCtr, noCtr] } } };
    expect(grantedManaSpecsFor(s, "wc").length).toBeGreaterThan(0); // countered → has the granted tap
    expect(grantedManaSpecsFor(s, "nc").length).toBe(0);            // uncounted → nothing
  });
});
