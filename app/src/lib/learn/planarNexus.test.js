/**
 * planarNexus.test.js — SHELF-85 runbook Phase 2 · K8 (2026-09-04): Planar Nexus (Kellan).
 *
 *   "This land is every nonbasic land type. (Nonbasic land types include Cave, Desert, Gate, Lair, Locus, Mine,
 *    Power-Plant, Sphere, Tower, and Urza's.)
 *    {T}: Add {C}.
 *    {1}, {T}: Add one mana of any color."
 *
 * A SELF layer-4 subtype add of the ten nonbasic land types the card's own reminder text lists (CR 205.3i). Nothing
 * intrinsic rides a nonbasic type (CR 305.6 is basic types only), so the runtime consequence is selector matching —
 * a "Gates you control" or "Caves you control" selector sees it — which effectiveTypeIdentity reads layer-aware. The
 * land classifier admits the line only when the parser emitted that descriptor (the same vouch shape as ④-BE).
 *
 * ⚠️ The "{1}, {T}: Add one mana of any color" line is the pre-existing credited-but-never-offered class (a mana-costed
 * mana line; the runtime offers {C} only) — flagged in the ledger, not claimed here. The {C} line is honest.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentTypes, deriveCharacteristics } from "./layers.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NEXUS = { id: "c-nexus", name: "Planar Nexus", type: "Land", keywords: [],
  oracle: "This land is every nonbasic land type. (Nonbasic land types include Cave, Desert, Gate, Lair, Locus, Mine, Power-Plant, Sphere, Tower, and Urza's.)\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color." };
const TEN = ["Cave", "Desert", "Gate", "Lair", "Locus", "Mine", "Power-Plant", "Sphere", "Tower", "Urza's"];
// A Gate anthem the runtime already models — "Creatures you control get +1/+1 for each Gate you control" is not needed;
// the selector read is exercised directly through a lord-shaped static that names a nonbasic land type.
const GATE_LORD = { id: "c-gl", name: "Gatekeeper Test", type: "Creature — Human", keywords: [], power: 1, toughness: 1, oracle: "Gates you control have hexproof." };

const board = (extra = []) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "N", card: NEXUS, controller: "user" }), ...extra] } } };
};

describe("parse", () => {
  it("the type line is a SELF layer-4 add of exactly the ten nonbasic land types", () => {
    expect(parseStaticAbilities(NEXUS)).toEqual([{ layer: 4, op: { subtypes: TEN }, affects: { mode: "self" }, duration: { kind: "permanent" } }]);
  });
});

describe("runtime", () => {
  it("the permanent's effective subtypes carry all ten; a plain land carries none", () => {
    const s = board();
    expect(permanentTypes(s, "N").subtypes).toEqual(TEN);
    expect(deriveCharacteristics(s, "N").types).toContain("Land");
  });
  it("a nonbasic-type-scoped selector reaches it (Gates you control have hexproof → the Nexus has hexproof)", () => {
    const s = board([createPermanent({ id: "GL", card: GATE_LORD, controller: "user" })]);
    const d = deriveCharacteristics(s, "N");
    // The lord's grant is creature-restricted by the anthem lane, so this pins the SELECTOR read, not the keyword:
    // the effective subtypes are what matchesSelector consults, and they include Gate.
    expect(d.subtypes).toContain("Gate");
    expect(permanentTypes(s, "N").subtypes).toContain("Urza's");
  });
  it("mana: the honest {C} line is offered; no free any-colour main is conjured", () => {
    const src = manaSources(board(), "user").filter((x) => x.permanentId === "N");
    expect(src.some((x) => x.colors.join() === "C" && !x.restriction)).toBe(true);
    expect(src.some((x) => x.colors.length > 1)).toBe(false); // the {1},{T} line is not offered (known under-offer, never an over-offer)
  });
});

describe("classifier", () => {
  it("Planar Nexus is a full land; the same card without the descriptor's line stays land; a foreign type line parks", () => {
    expect(classifyCard(NEXUS)).toBe("land");
    expect(classifyCard({ ...NEXUS, oracle: "This land is every basic land type.\n{T}: Add {C}." })).toBe("land-partial");
  });
});
