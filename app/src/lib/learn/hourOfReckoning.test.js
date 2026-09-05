/**
 * HOUR OF RECKONING — SHELF-85 · Otharri O10 (2026-09-05). "Convoke / Destroy all nontoken creatures." Convoke is a
 * stripped cost-only keyword (the engine hard-casts at full cost); the wipe is the each-creature destroy NARROWED by
 * token-ness through the shared restrictions grammar — a new satisfier kind (`token`, negate:true) reading the
 * `card.token` flag every token-creating path stamps. The subtype arm used to read "nontoken" as non-"token" and null
 * (a safe park, never an over-wipe); the new arm sits before it.
 *
 * Mutation-checked: see the run ledger (docs-sk57).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js"; // the classifier and the cast path both strip the convoke line before parsing
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HOUR = { name: "Hour of Reckoning", type: "Sorcery", mana: "{4}{W}{W}{W}", keywords: ["Convoke"], oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nDestroy all nontoken creatures." };
const perm = (id, controller, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const bear = (id, controller) => perm(id, controller, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
const tokenBear = (id, controller) => perm(id, controller, { name: "Bear Token", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", token: true });
const idol = (id, controller) => perm(id, controller, { name: "Sol Ring", type: "Artifact", oracle: "" });
function setup() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players,
      user: { ...b.players.user, hand: [{ ...HOUR, id: "h1" }], battlefield: [bear("ub", "user"), tokenBear("ut", "user"), idol("ui", "user")], manaPool: { ...b.players.user.manaPool, W: 3, C: 4 } },
      ai: { ...b.players.ai, battlefield: [bear("ab", "ai"), tokenBear("at", "ai")] } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const ids = (s, pid) => s.players[pid].battlefield.map((p) => p.id).sort();

describe("classify + parse", () => {
  it("the wipe parses HIGH as an each-creature destroy with a token:negate restriction; native-spell", () => {
    const prog = parseEffectProgram({ ...HOUR, oracle: stripCostOnlyKeywordLines(HOUR.oracle) });
    const row = { confidence: prog.confidence, atoms: prog.atoms.map((a) => [a.op, a.targetType, a.restrictions ?? null]), tier: classifyCard(HOUR) };
    console.log("  WITNESS hourParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([["destroy", "eachCreature", [{ kind: "token", negate: true }]]]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("resolution", () => {
  it("every NONTOKEN creature on both sides dies; every token creature and the non-creature artifact survive", () => {
    let s = setup();
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h1");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction(s, cast));
    const row = { user: ids(s, "user"), ai: ids(s, "ai"), userGy: s.players.user.graveyard.map((c) => c.name).sort(), stack: s.stack.length };
    console.log("  WITNESS hourResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.user).toEqual(["ui", "ut"]);
    expect(row.ai).toEqual(["at"]);
    expect(row.userGy).toEqual(["Grizzly Bears", "Hour of Reckoning"]);
    expect(row.stack).toBe(0);
  });
});
