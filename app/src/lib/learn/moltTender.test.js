/**
 * moltTender.test.js — the EXILE-FROM-GRAVEYARD mana cost (Molt Tender, Teval shelf, 2026-08-15):
 * "{T}, Exile a card from your graveyard: Add one mana of any color."
 *
 * ⚠️ THIS CARVES A COST OUT OF THE PHANTOM-MANA GATE (manaCostConsumable — the load-bearing CREED
 * guard that keeps unpayable consumables from minting free mana every turn). The carve is honest
 * because BOTH halves pay: manaSources offers the source ONLY while the graveyard is non-empty, and
 * commitManaTap ACTUALLY exiles a graveyard card (deterministic oldest-first house pick) as the tap
 * commits. Every other consumable (typed exile, discard, pay-life-only, tap-other) stays refused.
 *
 * Mutation-checked (2026-08-15): the commitManaTap exile payment disabled → the pays-for-real witness
 * dies (mana minted, graveyard untouched — the exact phantom the gate exists to prevent). Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, commitManaTap } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MOLT = { name: "Molt Tender", type: "Creature — Elf Druid", power: "1", toughness: "1", mana: "{G}",
  oracle: "{T}: Mill a card.\n{T}, Exile a card from your graveyard: Add one mana of any color." };

function board(gy) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const mt = createPermanent({ id: "mt", card: { id: "mt-c", ...MOLT }, controller: "user", summoningSick: false });
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [mt], graveyard: gy } } };
}

describe("production + classify + the availability gate", () => {
  it("⭐ the cost carves out of the phantom gate WITH its flag; Molt Tender classifies native", () => {
    const row = { prod: manaProduction(MOLT), tier: classifyCard(MOLT) };
    console.log("  WITNESS moltTender", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.prod).toMatchObject({ amount: 1, requiresTap: true, exilesGyCard: true });
    expect(row.tier).toBe("native-mana");
  });

  it("seen-to-fail: the OTHER consumables stay refused (the gate is carved, not removed)", () => {
    expect(manaProduction({ name: "X", type: "Creature", oracle: "{T}, Exile a creature card from your graveyard: Add {B}." })).toBeNull(); // typed exile
    expect(manaProduction({ name: "Y", type: "Creature", oracle: "Discard a card: Add {R}." })).toBeNull();                                   // discard
    expect(manaProduction({ name: "Z", type: "Creature", oracle: "{T}, Exile two cards from your graveyard: Add {C}{C}." })).toBeNull();      // counted exile
  });

  it("the source is OFFERED only while the graveyard has a card to pay with (the availability half)", () => {
    const withCard = manaSources(board([{ id: "g1", name: "Bear", type: "Creature — Bear", oracle: "" }]), "user");
    const empty = manaSources(board([]), "user");
    const row = { offered: withCard.some((s) => s.permanentId === "mt"), emptyOffered: empty.some((s) => s.permanentId === "mt") };
    console.log("  WITNESS moltGate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: true, emptyOffered: false });
  });
});

describe("⭐⭐ payment — the tap really exiles a graveyard card (nothing phantom)", () => {
  it("⭐⭐ committing the tap exiles the OLDEST graveyard card and taps the source", () => {
    const s = board([
      { id: "g-old", name: "Old Bear", type: "Creature — Bear", oracle: "" },
      { id: "g-new", name: "New Bear", type: "Creature — Bear", oracle: "" },
    ]);
    const src = manaSources(s, "user").find((x) => x.permanentId === "mt");
    expect(src.exilesGyCard).toBe(true);
    const out = commitManaTap(s, "user", { permanentId: "mt", color: "G", amount: 1, exilesGyCard: true });
    const row = {
      exiled: out.players.user.exile.map((c) => c.id),
      gyLeft: out.players.user.graveyard.map((c) => c.id),
      tapped: out.players.user.battlefield.find((p) => p.id === "mt").tapped,
    };
    console.log("  WITNESS moltPay", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ exiled: ["g-old"], gyLeft: ["g-new"], tapped: true });
  });
});
