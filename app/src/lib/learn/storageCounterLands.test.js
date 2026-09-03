/**
 * storageCounterLands.test.js — LANDS-TIER slice 10 (2026-09-03): "Put a <kind> counter on this LAND" as an
 * activated ability's effect — the storage lands (Saltcrusted Steppe, Dreadship Reef, Calciform Pools,
 * Molten Slagheap, Fungal Reaches, Mage-Ring Network, Crucible of the Spirit Dragon, Fountain of Cho,
 * Subterranean Hangar, Mercadian Bazaar, Rushwood Grove, Saprazzan Cove …), Throne of Makindi (charge),
 * Hellion Crucible (pressure). ONE noun: the add-named-counter-self parser knew "this artifact / permanent /
 * creature / enchantment"; the mana abilities that remove those counters were already modeled (ablation:
 * only the put line parked every one of them).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { addNamedCounterSelfClauseParser } from "./effects/atoms/counters.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", oracle });
const SALTCRUSTED = L("Saltcrusted Steppe", "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{1}, Remove X storage counters from this land: Add X mana in any combination of {G} and/or {W}.");
const FOUNTAIN = L("Fountain of Cho", "This land enters tapped.\n{T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {W} for each storage counter removed this way.");

describe("the parser — one more noun, whole-clause anchored", () => {
  // (clause parsers receive the sentence with its trailing period already stripped)
  it("reads 'put a storage counter on this land'", () => {
    expect(addNamedCounterSelfClauseParser("Put a storage counter on this land")).toEqual({ op: "add-named-counter-self", counterType: "storage", amount: 1 });
  });

  it("⛔ a rider or a different subject still parks", () => {
    expect(addNamedCounterSelfClauseParser("Put a storage counter on this land for each Island you control")).toBeNull();
    expect(addNamedCounterSelfClauseParser("Put a storage counter on target land")).toBeNull();
  });
});

describe("runtime — the activated ability puts the counter on the land itself", () => {
  it("⭐ Saltcrusted Steppe: {1},{T} → one storage counter on the Steppe, twice → two", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card: SALTCRUSTED, controller: "user", summoningSick: false })];
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [], manaPool: { W: 3, U: 3, B: 3, R: 3, G: 3, C: 3 } } },
    };
    const put = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "src" && /storage counter on this land/i.test(a.abilityText || ""));
    expect(put).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, put));
    let steppe = s.players.user.battlefield.find((p) => p.id === "src");
    expect(steppe.counters?.storage).toBe(1);
    expect(steppe.tapped).toBe(true);
    // untap it and go again
    s = { ...s, priorityHolder: "user", consecutivePasses: 0, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "src" ? { ...p, tapped: false } : p)) } } };
    const again = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "src" && /storage counter on this land/i.test(a.abilityText || ""));
    s = resolveTopOfStack(dispatchAction(s, again));
    steppe = s.players.user.battlefield.find((p) => p.id === "src");
    expect(steppe.counters?.storage).toBe(2);
  });
});

describe("classification", () => {
  it("the storage lands flip to `land`", () => {
    expect(classifyCard(SALTCRUSTED)).toBe("land");
    expect(classifyCard(FOUNTAIN)).toBe("land");
  });

  it("CREED — the same land with an unreadable put line stays land-partial", () => {
    expect(classifyCard({ ...SALTCRUSTED, oracle: SALTCRUSTED.oracle.replace("Put a storage counter on this land.", "Put a storage counter on this land for each Island you control.") })).toBe("land-partial");
  });
});
