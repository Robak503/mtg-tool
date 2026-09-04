/**
 * mysticForge.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Mystic Forge (Kellan); Precognition Field audited.
 *
 *   "You may look at the top card of your library any time.
 *    You may cast artifact spells and colorless spells from the top of your library.
 *    {T}, Pay 1 life: Exile the top card of your library."
 *
 * The play-from-top lane already existed (Future Sight / Bolas's Citadel). Mystic Forge's line is the FILTERED form: no
 * land permission, a spell filter of type words plus the special word "colorless", which castFromTopFilterAllows tests as
 * the card's COLOURS (printed colours, else the cost's pips) — never as a type-line word. The activation is the
 * controller's own exile-top (same op as ingest, who "controller"; no play permission rides it).
 *
 * Twin: Precognition Field — its filtered line already parsed; the flip is the exile-top activation.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities, castFromTopFilterAllows, playFromTopPermission } from "./staticAbilityParser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FORGE = { id: "c-forge", name: "Mystic Forge", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library." };
const FIELD = { id: "c-field", name: "Precognition Field", type: "Enchantment", mana: "{3}{U}", keywords: [],
  oracle: "You may look at the top card of your library any time.\nYou may cast instant and sorcery spells from the top of your library.\n{3}: Exile the top card of your library." };
const SOL = { id: "t-sol", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "" };
const ELDRAZI = { id: "t-eld", name: "Eldrazi Scion", type: "Creature — Eldrazi", mana: "{2}", colors: [], oracle: "", power: 2, toughness: 2 };
const BEAR = { id: "t-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], oracle: "", power: 2, toughness: 2 };
const ISLAND = { id: "t-isl", name: "Island", type: "Basic Land — Island", oracle: "" };
const filler = { id: "f", name: "Filler", type: "Creature — Bear", oracle: "", power: 1, toughness: 1 };
const land = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "user" });

const board = (top, withForge = true) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [land("L1"), land("L2"), land("L3")];
  if (withForge) bf.unshift(createPermanent({ id: "MF", card: FORGE, controller: "user" }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand: [], library: [top, filler], battlefield: bf, landsPlayedThisTurn: 0, life: 20 } } };
};
const fromTop = (s) => legalActionsForPlayer(s, "user").filter((a) => (a.kind === "cast-spell" || a.kind === "play-land") && a.fromZone === "library").map((a) => a.kind + ":" + a.cardId);

describe("parse", () => {
  it("the filtered play-from-top: no lands, artifact + colorless; the exile-top activation is modeled", () => {
    expect(parseStaticAbilities(FORGE)).toEqual([{ inertInfo: true }, { playFromTop: { lands: false, spellFilter: ["artifact", "colorless"] } }]);
    expect(parseActivatedAbilities(FORGE).map((a) => ({ cost: a.costStr, modeled: a.modeled }))).toEqual([{ cost: "{T}, Pay 1 life", modeled: true }]);
    expect(parseEffectClause("Exile the top card of your library.", "Artifact").atoms).toEqual([{ op: "exile-top-of-library", amount: 1, who: "controller", targetType: null }]);
    // an unlisted word never becomes a hollow grant
    expect(parseStaticAbilities({ ...FORGE, oracle: "You may cast green spells and blue spells from the top of your library." })).toEqual([]);
  });
  it("the filter's colourless test reads colours, then the cost's pips; the type words read the type line", () => {
    const f = ["artifact", "colorless"];
    expect(castFromTopFilterAllows(f, SOL)).toBe(true);
    expect(castFromTopFilterAllows(f, ELDRAZI)).toBe(true);
    expect(castFromTopFilterAllows(f, BEAR)).toBe(false);
    expect(castFromTopFilterAllows(f, { name: "Cost-only", type: "Creature — X", mana: "{3}" })).toBe(true);
    expect(castFromTopFilterAllows(f, { name: "Cost-only", type: "Creature — X", mana: "{2}{R}" })).toBe(false);
    expect(castFromTopFilterAllows(f, { name: "Artifact creature", type: "Artifact Creature — Golem", mana: "{1}{W}", colors: ["W"] })).toBe(true);
  });
});

describe("runtime — the offer", () => {
  it("with Forge out: an artifact and a colourless creature are castable off the top; a green creature and a land are not", () => {
    expect(fromTop(board(SOL))).toEqual(["cast-spell:t-sol"]);
    expect(fromTop(board(ELDRAZI))).toEqual(["cast-spell:t-eld"]);
    expect(fromTop(board(BEAR))).toEqual([]);
    expect(fromTop(board(ISLAND))).toEqual([]);
    expect(fromTop(board(SOL, false))).toEqual([]);
    expect(playFromTopPermission(board(SOL), "user")).toEqual({ lands: false, spellFilter: ["artifact", "colorless"] });
  });
  it("the activation exiles the top card and charges 1 life", () => {
    let s = board(SOL);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "MF");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.user.exile.some((c) => c.id === "t-sol")).toBe(true);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["f"]);
    expect(s.players.user.life).toBe(19);
  });
});

describe("classifier", () => {
  it("Mystic Forge and Precognition Field are native-mixed", () => {
    expect(classifyCard(FORGE)).toBe("native-mixed");
    expect(classifyCard(FIELD)).toBe("native-mixed");
  });
});
