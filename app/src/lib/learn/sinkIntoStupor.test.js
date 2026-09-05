/**
 * SINK INTO STUPOR — POD-SIM THREE · KN-6 (2026-09-05). "Return target spell or nonland permanent an opponent controls to
 * its owner's hand." The Venser stack-or-battlefield union narrowed twice: the spell half to an OPPONENT's spell (by
 * controller), the battlefield half to an opponent's NONLAND permanent (the shared restriction satisfier). The land back
 * (Soporific Springs) was already whole; the front was the modal card's only park.
 *
 * Mutation-checked: see the run ledger (docs-sk47).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const SINK = { id: "sink", name: "Sink into Stupor", type: "Instant", mana: "{1}{U}{U}", cmc: 3, colors: ["U"], oracle: "Return target spell or nonland permanent an opponent controls to its owner's hand." };
const perm = (id, controller, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function spellOnStack(id, name, controller) {
  return { id, kind: "spell", controller, targets: [], cost: null, source: { id: `card-${id}`, name, type: "Sorcery", cmc: 2, colors: ["R"], oracle: "" }, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectProgram({ type: "Sorcery", oracle: "Draw a card." }), controller, targets: [] } } };
}
function state({ stack = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, stack,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [SINK], battlefield: [perm("mybear", "user", { name: "My Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })], manaPool: { ...s.players.user.manaPool, U: 3 } },
      ai: { ...s.players.ai, battlefield: [perm("ogre", "ai", { name: "Ogre", type: "Creature — Ogre", power: 4, toughness: 4, oracle: "" }), perm("sol", "ai", { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }), perm("isl", "ai", { name: "Island", type: "Basic Land — Island", oracle: "" })] },
    },
  };
}
const casts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "sink");
const targetsOf = (acts) => acts.flatMap((a) => (a.targets || []).map((t) => t.id)).sort();

describe("parse + classify", () => {
  it("the union bounce carries the opponent-spell filter and the nonland/opponent restrictions; native-spell", () => {
    const p = parseEffectProgram(SINK);
    const row = { confidence: p.confidence, atoms: p.atoms, tier: classifyCard({ ...SINK, keywords: [] }) };
    console.log("  WITNESS sinkParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "bounce-spell-or-permanent", targetType: "spellOrPermanent", notCounter: true, spellController: "opponent", restrictions: [{ kind: "typeNeg", type: "land" }, { kind: "controller", who: "opponent" }] }]);
    expect(row.tier).toBe("native-spell");
  });
});

describe("targets and resolution", () => {
  it("offers the opponent's spell, Ogre and Sol Ring — never their Island, my bear, or MY spell on the stack", () => {
    const s = state({ stack: [spellOnStack("theirs", "Their Sorcery", "ai"), spellOnStack("mine", "My Sorcery", "user")] });
    const offered = targetsOf(casts(s));
    console.log("  WITNESS sinkTargets", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["ogre", "sol", "theirs"]);
  });

  it("bouncing their Ogre puts it in THEIR hand; bouncing their spell removes it from the stack into their hand", () => {
    const s = state({ stack: [spellOnStack("theirs", "Their Sorcery", "ai")] });
    const atOgre = casts(s).find((a) => a.targets?.[0]?.id === "ogre");
    const afterOgre = resolveTopOfStack(dispatchAction(s, atOgre));
    const atSpell = casts(s).find((a) => a.targets?.[0]?.id === "theirs");
    const afterSpell = resolveTopOfStack(dispatchAction(s, atSpell));
    const row = { ogreOnField: afterOgre.players.ai.battlefield.some((p) => p.id === "ogre"), ogreInHand: afterOgre.players.ai.hand.some((c) => c.name === "Ogre"), stackAfterSpell: afterSpell.stack.map((o) => o.id), spellInHand: afterSpell.players.ai.hand.some((c) => c.name === "Their Sorcery") };
    console.log("  WITNESS sinkResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ogreOnField).toBe(false);
    expect(row.ogreInHand).toBe(true);
    expect(row.stackAfterSpell).toEqual([]);
    expect(row.spellInHand).toBe(true);
  });
});
