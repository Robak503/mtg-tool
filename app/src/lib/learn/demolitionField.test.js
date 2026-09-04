/**
 * demolitionField.test.js — SHELF-85 runbook Phase 2 · T6 (2026-09-04): Demolition Field (Teval).
 *
 *   "{T}: Add {C}.
 *    {2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. That land's controller may search
 *    their library for a basic land card, put it onto the battlefield, then shuffle. You may search your library for a
 *    basic land card, put it onto the battlefield, then shuffle."
 *
 * The removal-rider fold (Path to Exile / Assassin's Trophy) accepted only "its controller" / "that player" as the rider's
 * subject; the possessive "that <noun>'s controller" is the same captured controller. The rider grammar already read the
 * untapped form; the trailing "You may search …" comes back as `rest` and parses as the optional basic tutor. The
 * destroy-nonbasic-land target and the sacrifice-this-land cost existed.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FIELD = { id: "c-df", name: "Demolition Field", type: "Land", keywords: [],
  oracle: "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. That land's controller may search their library for a basic land card, put it onto the battlefield, then shuffle. You may search your library for a basic land card, put it onto the battlefield, then shuffle." };
const EFFECT = "Destroy target nonbasic land an opponent controls. That land's controller may search their library for a basic land card, put it onto the battlefield, then shuffle. You may search your library for a basic land card, put it onto the battlefield, then shuffle.";

const basic = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl });
const nonbasic = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Bojuka Bog", type: "Land", oracle: "{T}: Add {B}." }, controller: ctrl });
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "DF", card: FIELD, controller: "user" }), basic("U1", "user"), basic("U2", "user")], library: [{ id: "ulib-f", name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }] },
      ai: { ...s.players.ai, battlefield: [nonbasic("BOG", "ai"), basic("A1", "ai")], library: [{ id: "alib-f", name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }] } } };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "DF" && a.targets?.length);

describe("parse", () => {
  it("folds to ONE destroy carrying the opponent's basic-land rider (untapped), then the caster's optional tutor", () => {
    const atoms = parseEffectClause(EFFECT, "Land").atoms;
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toMatchObject({ op: "destroy", targetType: "nonbasicLand", restrictions: [{ kind: "controller", who: "opponent" }], controllerRider: { kind: "rampBasic", entersTapped: false } });
    expect(atoms[1]).toMatchObject({ op: "tutor", filterLabel: "basic land card", destination: "battlefield", optional: true });
  });
  it("the possessive subject is the same fold as 'its controller'", () => {
    const a = parseEffectClause("Destroy target creature. That creature's controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.", "Instant").atoms;
    const b = parseEffectClause("Destroy target creature. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.", "Instant").atoms;
    expect(a).toEqual(b);
  });
});

describe("runtime — the opponent's nonbasic dies, they fetch a basic, and you get your own search", () => {
  it("only the opponent's NONBASIC land is offered; the ability sacrifices the Field", () => {
    const s = board();
    const acts = offers(s);
    expect(acts.map((a) => a.targets[0].id)).toEqual(["BOG"]);
    expect(acts[0].sacSelf).toBe(true);
  });
  it("resolution: the Bog is destroyed, the opponent's Swamp arrives from their library, and the caster's optional search is raised", () => {
    let s = board();
    s = dispatchAction(s, offers(s)[0]);
    expect(s.players.user.battlefield.some((p) => p.id === "DF")).toBe(false); // sacrificed as the cost
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.some((p) => p.id === "BOG")).toBe(false);
    expect(s.players.ai.graveyard.some((c) => c.id === "card-BOG")).toBe(true);
    // The rider is the OPPONENT's search: a real tutor pause owned by the AI seat (the game driver settles AI pauses in
    // play; here the test settles it the same way).
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai" });
    s = resolveTutorChoice(s, "alib-f");
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Swamp")).toBe(true);
    expect(s.players.ai.library).toHaveLength(0);
    // Then the caster's own "you may search" — a real decision for the human seat, raised as its own pause.
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.pendingChoice?.controller).toBe("user");
  });
});

describe("classifier", () => {
  it("Demolition Field is a land", () => {
    expect(classifyCard(FIELD)).toBe("land");
  });
});
