/**
 * GATED-GY — a self P/T buff and/or keyword grant gated on a GRAVEYARD count: THRESHOLD ("as long as there
 * are seven or more cards in your graveyard", CR 702.15a) and DELIRIUM ("…four or more card types among cards
 * in your graveyard"). Reuses the GATED-SELFBUFF/GATED-KEYWORD machinery: a layer-7c `ptModifyGated` and/or a
 * layer-6 gated `addKeyword`, both carrying a graveyard countSpec that the SHARED layers.gateMet evaluates
 * live as the graveyard fills. The flavor ability-word label ("Threshold —"/"Delirium —", CR 207.2c) is
 * stripped; both clause orders (gate-leads / gate-trails) parse. CREED: only UNTYPED card / card-type counts
 * with a CLEAN P/T-and-grantable-keyword effect flip — a typed count ("creature cards", "mana values"), a
 * rider ("and can't block", menace, a quoted trigger), or a non-grantable keyword stays LOW (Arbiter).
 *
 * Delirium counts CARD TYPES only (CR 205.2a) — supertypes (Legendary/Snow/Basic) do NOT count, and
 * kindred ≡ tribal (one type, renamed) never double-counts.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const cr = (oracle, type = "Creature — Beast", p = 2, t = 2) => ({ name: "GY Gated", type, power: p, toughness: t, oracle });

// A board with the gated creature on the battlefield and `graveCards` in the controller's graveyard.
function withGrave(selfCard, graveCards = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "self", card: selfCard, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self], graveyard: graveCards } } };
}
const nCards = (n, type = "Sorcery") => Array.from({ length: n }, (_, i) => ({ name: `g${i}`, type }));
const THREE_TYPES = [{ name: "a", type: "Artifact" }, { name: "c", type: "Creature — Bear" }, { name: "i", type: "Instant" }];
const FOUR_TYPES = [...THREE_TYPES, { name: "l", type: "Land" }];

describe("GATED-GY — coverage flips (threshold + delirium, real cards)", () => {
  it("threshold P/T flips native", () => {
    expect(classifyCard({ type: "Creature — Squirrel Beast", name: "Krosan Beast", mana: "{4}{G}", oracle: "Threshold — This creature gets +7/+7 as long as there are seven or more cards in your graveyard." })).toMatch(/^native/);
  });
  it("delirium P/T (with a printed grantable keyword) flips native", () => {
    expect(classifyCard({ type: "Creature — Snake", name: "Gnarlwood Dryad", mana: "{G}", oracle: "Deathtouch\nDelirium — This creature gets +2/+2 as long as there are four or more card types among cards in your graveyard." })).toMatch(/^native/);
  });
  it("delirium P/T + grantable keyword (combined) flips native", () => {
    expect(classifyCard({ type: "Creature — Ox", name: "Inquisitor's Ox", mana: "{3}{W}", oracle: "Delirium — This creature gets +1/+0 and has vigilance as long as there are four or more card types among cards in your graveyard." })).toMatch(/^native/);
  });
  it("delirium pure-keyword grant flips native", () => {
    expect(classifyCard({ type: "Creature — Spirit", name: "Moorland Drifter", mana: "{1}{U}", oracle: "Delirium — This creature has flying as long as there are four or more card types among cards in your graveyard." })).toMatch(/^native/);
  });
});

describe("GATED-GY — CREED: typed counts, riders, and non-grantable keywords stay LOW", () => {
  const descns = (oracle) => parseStaticAbilities({ name: "X", type: "Creature — Beast", power: 2, toughness: 2, oracle });
  it("a TYPED graveyard count is NOT modeled (separate, larger mechanic)", () => {
    expect(descns("As long as there are two or more creature cards in your graveyard, this creature gets +2/+1.")).toEqual([]);
    expect(descns("This creature gets +3/+3 as long as there is a land card in your graveyard.")).toEqual([]);
    expect(descns("As long as there are five or more mana values among cards in your graveyard, this creature gets +2/+2.")).toEqual([]);
    expect(descns("This creature gets +3/+0 as long as there are four or more permanent cards in your graveyard.")).toEqual([]);
  });
  it("a rider riding alongside the gated P/T drops the WHOLE clause (no silent partial)", () => {
    expect(descns("Threshold — This creature gets +1/+1 and has menace as long as there are seven or more cards in your graveyard.")).toEqual([]); // menace not grantable
    expect(descns("As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and can't block.")).toEqual([]);
    expect(descns("Threshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1, is black, and has \"{2}{B}, {T}: Destroy target green creature.\"")).toEqual([]);
  });
  it("the same cards stay body-only end-to-end", () => {
    expect(classifyCard({ type: "Creature — Zombie Dog", name: "Thraben Foulbloods", mana: "{2}{B}", oracle: "Delirium — This creature gets +1/+1 and has menace as long as there are four or more card types among cards in your graveyard." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Vampire", name: "Killmonger", mana: "{2}{B}", oracle: "As long as there are two or more creature cards in your graveyard, this creature gets +2/+1." })).toBe("body-only");
  });
});

describe("GATED-GY — parser emits the exact gated descriptor shapes", () => {
  const descns = (oracle) => parseStaticAbilities({ name: "X", type: "Creature — Beast", power: 2, toughness: 2, oracle });
  it("threshold → ptModifyGated with a cardsInGraveyard gate (count parsed from the literal)", () => {
    expect(descns("Threshold — This creature gets +7/+7 as long as there are seven or more cards in your graveyard.")).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: 7, toughness: 7, gate: { countSpec: { kind: "cardsInGraveyard" }, atLeast: 7, excludeSelf: false } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
  });
  it("delirium combined → ptModifyGated + gated addKeyword sharing one cardTypesInGraveyard gate", () => {
    expect(descns("Delirium — This creature gets +1/+0 and has vigilance as long as there are four or more card types among cards in your graveyard.")).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModifyGated", power: 1, toughness: 0, gate: { countSpec: { kind: "cardTypesInGraveyard" }, atLeast: 4, excludeSelf: false } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Vigilance", gate: { countSpec: { kind: "cardTypesInGraveyard" }, atLeast: 4, excludeSelf: false } }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
  });
});

describe("GATED-GY — engine: the buff turns on/off as the graveyard fills (threshold)", () => {
  const oracle = "Threshold — This creature gets +2/+2 as long as there are seven or more cards in your graveyard.";
  it("six cards → gate CLOSED (base P/T); seven → gate OPEN (+2/+2)", () => {
    expect(permanentPower(withGrave(cr(oracle), nCards(6)), "self")).toBe(2);
    expect(permanentToughness(withGrave(cr(oracle), nCards(6)), "self")).toBe(2);
    expect(permanentPower(withGrave(cr(oracle), nCards(7)), "self")).toBe(4);
    expect(permanentToughness(withGrave(cr(oracle), nCards(7)), "self")).toBe(4);
  });
});

describe("GATED-GY — engine: delirium counts CARD TYPES (CR 205.2a)", () => {
  const ptOracle = "Delirium — This creature gets +2/+2 as long as there are four or more card types among cards in your graveyard.";
  const kwOracle = "Delirium — This creature has flying as long as there are four or more card types among cards in your graveyard.";
  it("three types → CLOSED; four types → OPEN (P/T)", () => {
    expect(permanentPower(withGrave(cr(ptOracle), THREE_TYPES), "self")).toBe(2);
    expect(permanentPower(withGrave(cr(ptOracle), FOUR_TYPES), "self")).toBe(4);
  });
  it("the gated keyword tracks the same type threshold", () => {
    expect(permanentHasKeyword(withGrave(cr(kwOracle), THREE_TYPES), "self", "flying")).toBe(false);
    expect(permanentHasKeyword(withGrave(cr(kwOracle), FOUR_TYPES), "self", "flying")).toBe(true);
  });
  it("SUPERTYPES do not count: four 'Legendary Snow Creature' cards are ONE type → still CLOSED", () => {
    const allLegendary = Array.from({ length: 4 }, (_, i) => ({ name: `god${i}`, type: "Legendary Snow Creature — God" }));
    expect(permanentPower(withGrave(cr(ptOracle), allLegendary), "self")).toBe(2);
  });
  it("kindred ≡ tribal (one type): Tribal Instant + Kindred Sorcery = 3 types {tribal,instant,sorcery}, not 4 → CLOSED", () => {
    const tribalKindred = [{ name: "ti", type: "Tribal Instant — Goblin" }, { name: "ks", type: "Kindred Sorcery — Elf" }];
    expect(permanentPower(withGrave(cr(ptOracle), tribalKindred), "self")).toBe(2);
  });
});

describe("GATED-GY — engine: combined P/T + keyword gate together (delirium)", () => {
  const oracle = "Delirium — This creature gets +1/+0 and has vigilance as long as there are four or more card types among cards in your graveyard.";
  it("both effects are OFF below threshold and ON at/above it", () => {
    const closed = withGrave(cr(oracle), THREE_TYPES);
    expect(permanentPower(closed, "self")).toBe(2);
    expect(permanentHasKeyword(closed, "self", "vigilance")).toBe(false);
    const open = withGrave(cr(oracle), FOUR_TYPES);
    expect(permanentPower(open, "self")).toBe(3);
    expect(permanentHasKeyword(open, "self", "vigilance")).toBe(true);
  });
});
