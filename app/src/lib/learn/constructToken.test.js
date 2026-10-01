/**
 * constructToken.test.js — the Construct token (the play-weighted program, P·3, 2026-10-01).
 *
 *   "create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\""
 *
 * Printed by Urza's Saga (#120), Urza, Lord High Artificer (#802), Simulacrum Synthesizer, Digsite Engineer, Urza, Chief
 * Artificer and Karn, Scion of Urza. The token carries the static as its oracle (the creature form the static parser
 * reads: a layer 7c self bonus counting the artifacts its controller controls, CR 613.4c), and it is an artifact itself,
 * so it is never smaller than 1/1 once it exists — the one exception to the zero-toughness token refusal.
 *
 * Digsite Engineer is the card this slice completes. Its "you may pay {2}. If you do, …" tail also needed the
 * classifier's residue strip to read a quoted span whole (its quoted ability's own period used to end the match early).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { permanentPower, permanentToughness, permanentTypes } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DIGSITE = { name: "Digsite Engineer", type: "Creature — Dwarf Artificer", mana: "{2}{W}", cmc: 3, colors: ["W"], power: "3", toughness: "3", keywords: [],
  oracle: "Whenever you cast an artifact spell, you may pay {2}. If you do, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"" };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, colors: [], power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const CONSTRUCT = "Create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"";

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [createPermanent({ id: "DIG", card: { ...DIGSITE, id: "c-dig" }, controller: "user", summoningSick: false })],
      hand: [{ ...ORNITHOPTER, id: "thopter" }], manaPool: { ...g.players.user.manaPool, C: 2 } } } };
}
/** Cast Ornithopter: Digsite's trigger resolves first and asks for {2}; `pay` answers it; then everything settles. */
function castThopter(pay) {
  const s0 = table();
  const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "thopter");
  if (!cast) throw new Error("Ornithopter is not offered");
  let n = flushTriggers(dispatchAction(s0, cast), { chooseTargets: chooseTriggerTargets }), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && g++ < 30) {
    if (n.pendingChoice?.kind === "optional-mana-payment") { n = resolveOptionalManaPaymentChoice(n, pay); continue; }
    if (n.pendingChoice) throw new Error(`unexpected choice ${n.pendingChoice.kind}`);
    n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const constructs = (s) => s.players.user.battlefield.filter((p) => /Construct/.test(String(p.card?.type || "")));

describe("the token", () => {
  it("parses as a 0/0 artifact token carrying its static; Digsite Engineer reads native", () => {
    expect({ atoms: parseEffectClause(CONSTRUCT, "Sorcery").atoms, digsite: classifyCard(DIGSITE) }).toEqual({
      atoms: [{ op: "create-token", count: 1, power: 0, toughness: 0, descriptor: "colorless construct artifact", targetType: null, tokenOracle: "This creature gets +1/+1 for each artifact you control." }],
      digsite: "native-trigger" });
  });

  it("fences (synthetic): a 0/0 that is not an artifact still parks; a real sentence after the quoted tail still parks the card", () => {
    const base = { name: "Probe Engineer", type: "Creature — Human", mana: "{2}{W}", power: "2", toughness: "3", keywords: [] };
    expect({
      plant: parseEffectClause("Create a 0/0 green Plant creature token with \"This token gets +1/+1 for each artifact you control.\"", "Sorcery")?.confidence ?? "low",
      residue: classifyCard({ ...base, oracle: "Whenever you cast an artifact spell, you may pay {2}. If you do, create a 1/1 colorless Thopter artifact creature token with flying. Gain control of target creature." }),
    }).toEqual({ plant: "low", residue: "body-only" });
  });
});

describe("in play", () => {
  it("pay {2}: the Construct enters as an artifact creature and counts both artifacts once Ornithopter lands (WITNESS)", () => {
    const s = castThopter(true);
    const [c] = constructs(s);
    const witness = { constructs: constructs(s).length, types: permanentTypes(s, c.id).types.slice().sort(), size: [permanentPower(s, c.id), permanentToughness(s, c.id)] };
    console.log(`WITNESS constructToken ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ constructs: 1, types: ["Artifact", "Creature", "Token"], size: [2, 2] }); // the type line's "Token" is listed too
  });

  it("decline: no Construct", () => {
    expect(constructs(castThopter(false))).toEqual([]);
  });
});
