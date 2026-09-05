/**
 * OTHARRI, SUNS' GLORY — the self-return · SHELF-85 · Otharri O10 (2026-09-05). "{2}{R}{W}, Tap an untapped Rebel you
 * control: Return this card from your graveyard to the battlefield tapped." The graveyard self-recursion arm (GY-1) knew
 * mana, discard and exile-from-graveyard costs; this adds the TAP-AN-UNTAPPED-<X>-YOU-CONTROL component (CR 602.1b —
 * tapping ANOTHER permanent, so its summoning sickness is irrelevant, CR 302.6). One legal action per eligible untapped
 * permanent; the dispatcher re-verifies and taps it. Purple Pentapus ("… an untapped creature you control …") is the other
 * printed carrier — "creature" reads layer-aware.
 *
 * Mutation-checked: see the run ledger (docs-sk60).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseGraveyardSelfRecursion } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OTHARRI = { name: "Otharri, Suns' Glory", type: "Legendary Creature — Phoenix", mana: "{3}{R}{W}", keywords: ["Flying", "Lifelink", "Haste"], oracle: "Flying, lifelink, haste\nWhenever Otharri attacks, you get an experience counter. Then create a 2/2 red Rebel creature token that's tapped and attacking for each experience counter you have.\n{2}{R}{W}, Tap an untapped Rebel you control: Return this card from your graveyard to the battlefield tapped." };
const PENTAPUS = { name: "Purple Pentapus", type: "Creature — Octopus", mana: "{2}{U}", keywords: [], oracle: "{2}{B}, Tap an untapped creature you control: Return this card from your graveyard to the battlefield tapped." };
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
const rebel = (id, extra) => perm(id, { name: "Rebel Token", type: "Creature — Rebel", power: 2, toughness: 2, oracle: "", token: true }, extra);
const bear = (id, extra) => perm(id, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, extra);
function setup(board, gyCard = OTHARRI) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, graveyard: [{ ...gyCard, id: "gy1" }], battlefield: board, manaPool: { ...b.players.user.manaPool, R: 1, W: 1, B: 1, C: 2 } } } };
}
const recursions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion" && a.cardId === "gy1");
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const bf = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

describe("parse + classify", () => {
  it("the recursion parse carries the tap-untapped component (Rebel for Otharri, any creature for Pentapus); both cards classify native", () => {
    const row = { oth: parseGraveyardSelfRecursion(OTHARRI), pen: parseGraveyardSelfRecursion(PENTAPUS), othTier: classifyCard(OTHARRI), penTier: classifyCard(PENTAPUS) };
    console.log("  WITNESS otharriParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.oth).toMatchObject({ manaPips: "{2}{R}{W}", tapUntapped: { subtype: "Rebel" }, dest: "battlefield", entersTapped: true });
    expect(row.pen).toMatchObject({ manaPips: "{2}{B}", tapUntapped: { subtype: null }, dest: "battlefield", entersTapped: true });
    expect(row.othTier).toBe("native-mixed"); // a native trigger AND a native activated line = the mixed native tier
    expect(row.penTier).toBe("native-activated");
  });
});

describe("the cost at activation", () => {
  it("offered once per UNTAPPED Rebel (a tapped Rebel and a non-Rebel are not candidates); activating taps the chosen Rebel and Otharri returns tapped", () => {
    const s0 = setup([rebel("r1"), rebel("r2", { tapped: true }), bear("b1")]);
    const acts = recursions(s0);
    const row = { offered: acts.map((a) => a.tapIds.join(",")).sort() };
    const s1 = drain(dispatchAction(s0, acts.find((a) => a.tapIds[0] === "r1")));
    row.rebelTapped = bf(s1, "r1").tapped;
    row.otharriBack = !!bf(s1, "gy1") || s1.players.user.battlefield.some((p) => p.card?.name === "Otharri, Suns' Glory");
    row.otharriTapped = s1.players.user.battlefield.find((p) => p.card?.name === "Otharri, Suns' Glory")?.tapped ?? null;
    row.gy = s1.players.user.graveyard.length;
    console.log("  WITNESS otharriActivate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["r1"]);
    expect(row.rebelTapped).toBe(true);
    expect(row.otharriBack).toBe(true);
    expect(row.otharriTapped).toBe(true);
    expect(row.gy).toBe(0);
  });

  it("no untapped Rebel on board → the ability is not offered (a non-Rebel creature does not pay it)", () => {
    const acts = recursions(setup([bear("b1"), rebel("r2", { tapped: true })]));
    console.log("  WITNESS otharriNoRebel", JSON.stringify({ n: acts.length })); // vitest 4 needs --disable-console-intercept
    expect(acts.length).toBe(0);
  });

  it("Purple Pentapus: ANY untapped creature pays, a summoning-sick one included (CR 302.6 restricts only its own {T})", () => {
    const sick = { ...bear("b1"), summoningSick: true };
    const acts = recursions(setup([sick, bear("b2", { tapped: true })], PENTAPUS));
    console.log("  WITNESS pentapus", JSON.stringify({ offered: acts.map((a) => a.tapIds.join(",")) })); // vitest 4 needs --disable-console-intercept
    expect(acts.map((a) => a.tapIds.join(","))).toEqual(["b1"]);
  });
});
