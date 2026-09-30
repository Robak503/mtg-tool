/**
 * singleGraveyardExile.test.js — "exile up to N target cards from a single graveyard" at ANY N (the 09-06 plan's stage ③ · 50,
 * 2026-09-30 — Griffnaut Tracker, Arashin Sunshield, Qutrub Forayer, Digsite Conservator, Famished Ghoul, Shred Memory).
 *
 * The arm read only "up to three" (Decompose, Rapid Decay, Scarab Feast) while the subset machinery never cared about N; it
 * now takes the printed count. The ETB-trigger form also needed a side: like "up to ONE target card from a graveyard"
 * (graveyardExileUpToOne.test.js), "up to N … from a SINGLE graveyard" is optional graveyard hate — the flush chooser aims
 * it at an opponent's graveyard and takes the empty pick when none has a card, so it is never forced onto its own; the
 * single-graveyard subset constraint (targeting.expandAtoms) keeps every pick inside ONE graveyard (CR 601.2c).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GRIFFNAUT = { id: "gt", name: "Griffnaut Tracker", type: "Creature — Human Detective", mana: "{3}{W}", mana_cost: "{3}{W}", cmc: 4, colors: ["W"], power: "3", toughness: "2", keywords: ["Flying"],
  oracle: "Flying\nWhen this creature enters, exile up to two target cards from a single graveyard." };
const SHRED_MEMORY = { id: "sm", name: "Shred Memory", type: "Instant", mana: "{1}{B}", mana_cost: "{1}{B}", cmc: 2, colors: ["B"], keywords: ["Transmute"],
  oracle: "Exile up to four target cards from a single graveyard.\nTransmute {1}{B}{B} ({1}{B}{B}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" };
const FAMISHED_GHOUL = { name: "Famished Ghoul", type: "Creature — Zombie", mana: "{3}{B}", cmc: 4, colors: ["B"], power: "3", toughness: "2", keywords: [],
  oracle: "{1}{B}, Sacrifice this creature: Exile up to two target cards from a single graveyard." };
const GRAVEGOUGER = { name: "Gravegouger", type: "Creature — Nightmare Horror", mana: "{2}{B}", cmc: 3, colors: ["B"], power: "2", toughness: "2", keywords: [],
  oracle: "When this creature enters, exile up to two target cards from a single graveyard.\nWhen this creature leaves the battlefield, return the exiled cards to their owner's graveyard." };

const gyCard = (id) => ({ id, name: `Card ${id}`, type: "Sorcery", mana: "{1}", oracle: "" });
// `seats`: the graveyard contents per seat; the user (active) holds `hand` with mana. `multi` → a four-seat Commander table.
function board({ hand = [], graveyards = {}, multi = false, battlefield = [], pool = { W: 4, B: 4, C: 4 } } = {}) {
  const g = multi ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = Object.fromEntries(Object.entries(g.players).map(([pid, p]) => [pid, { ...p, graveyard: (graveyards[pid] || []).map(gyCard) }]));
  players.user = { ...players.user, hand, battlefield, manaPool: { ...players.user.manaPool, ...pool } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
// Cast Griffnaut Tracker through the real offer; it enters and its ETB goes on the stack with the flush chooser's pick; resolve it.
function griffnautEnters(s0) {
  let s = resolveTopOfStack(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "gt")));
  for (let i = 0; i < 4 && s.stack.length && !s.pendingChoice; i++) s = resolveTopOfStack(s);
  return s;
}
const gySizes = (s) => Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, (p.graveyard || []).length]));

describe("the arm reads the printed count", () => {
  it("⭐ up to one / two / four parse to the single-graveyard atom with that maxTargets; the ETB form is enemy-side", () => {
    const max = (n) => parseEffectClause(`Exile up to ${n} target cards from a single graveyard.`, "Instant", { hasX: false })?.atoms?.[0]?.maxTargets ?? null;
    expect({ two: max("two"), four: max("four"), one: parseEffectClause("Exile up to one target card from a single graveyard.", "Instant", { hasX: false })?.atoms?.[0]?.maxTargets }).toEqual({ two: 2, four: 4, one: 1 });
    expect(atomTargetIntent(parseEffectClause("Exile up to two target cards from a single graveyard.", "Instant", { hasX: false }).atoms[0])).toBe("enemy");
  });
  it("⭐ the carriers read native; Gravegouger still parks on its leaves-the-battlefield return", () => {
    expect([GRIFFNAUT, SHRED_MEMORY, FAMISHED_GHOUL].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true, true]);
    expect(isNativeTier(classifyCard(GRAVEGOUGER))).toBe(false);
  });
});

describe("⭐ the ETB through the real cast and the flush chooser", () => {
  it("⭐ two cards leave the OPPONENT's graveyard; the caster's own graveyard is untouched", () => {
    const out = griffnautEnters(board({ hand: [GRIFFNAUT], graveyards: { user: ["u1", "u2"], ai: ["a1", "a2", "a3"] } }));
    const row = gySizes(out);
    console.log(`WITNESS singleGraveyardExile ${JSON.stringify(row)}`);
    expect(row).toEqual({ user: 2 + 0, ai: 1 });
  });
  it("⭐ only the caster's graveyard holds cards: the empty pick — nothing of theirs is exiled", () => {
    expect(gySizes(griffnautEnters(board({ hand: [GRIFFNAUT], graveyards: { user: ["u1", "u2"] } })))).toEqual({ user: 2, ai: 0 });
  });
  it("⭐ ONE graveyard per pick (CR 601.2c) — two opponents with a card each: exactly one card is exiled", () => {
    const out = griffnautEnters(board({ hand: [GRIFFNAUT], multi: true, graveyards: { ai1: ["x1"], ai2: ["y1"] } }));
    const sizes = gySizes(out);
    expect({ exiled: 2 - (sizes.ai1 + sizes.ai2), userUntouched: sizes.user === 0 }).toEqual({ exiled: 1, userUntouched: true });
  });
});

describe("the spell and the activated forms", () => {
  it("⭐ Shred Memory's real cast offer: every pick comes from one graveyard, four at most", () => {
    const s = board({ hand: [SHRED_MEMORY], graveyards: { ai: ["a1", "a2", "a3", "a4", "a5"], user: ["u1"] } });
    const picks = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "sm").map((a) => a.targets || []);
    const owners = (ts) => new Set(ts.map((t) => t.controller ?? t.owner));
    expect({ offered: picks.length > 0, maxSize: Math.max(...picks.map((ts) => ts.length)), mixed: picks.some((ts) => owners(ts).size > 1) }).toEqual({ offered: true, maxSize: 4, mixed: false });
  });
  it("⭐ Famished Ghoul's real activation exiles two from one graveyard", () => {
    const ghoul = createPermanent({ id: "fg", card: { ...FAMISHED_GHOUL, id: "c-fg" }, controller: "user", summoningSick: false });
    const s = board({ battlefield: [ghoul], graveyards: { ai: ["a1", "a2", "a3"] }, pool: { B: 1, C: 1 } });
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "fg").sort((x, y) => (y.targets?.length || 0) - (x.targets?.length || 0))[0];
    let out = dispatchAction(s, act);
    for (let i = 0; i < 4 && out.stack.length && !out.pendingChoice; i++) out = resolveTopOfStack(out);
    expect({ ghoulGone: !out.players.user.battlefield.some((p) => p.id === "fg"), aiGraveyard: out.players.ai.graveyard.length }).toEqual({ ghoulGone: true, aiGraveyard: 1 });
  });
});
