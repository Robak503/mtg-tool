/**
 * gutturalPyroblast.test.js — POD-SIM THREE · Killer Turts KT-2 (2026-09-05): Guttural Response and Pyroblast (with
 * Hydroblast and Red/Blue Elemental Blast as the printed twins).
 *
 *  · Guttural Response "Counter target blue instant spell": a colour AND a spell-type filter on one counter atom. Each
 *    filter already existed alone; the two-filter form is admitted and BOTH are enforced (a red instant and a blue creature
 *    spell are never targets).
 *  · Pyroblast "Counter target spell if it's blue / Destroy target permanent if it's blue": CR 608.2b lets it target
 *    anything and do nothing unless blue. Read as its RESTRICTED twin (Red Elemental Blast's printed wording, already
 *    native) — an honest UNDER-offer: the sim never aims it at a non-blue object, which is never the winning play. The
 *    legal-but-idle cast is not modelled rather than mis-modelled.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-05).
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

const GUTTURAL = { id: "gut", name: "Guttural Response", type: "Instant", mana: "{R/G}", oracle: "Counter target blue instant spell." };
const PYRO = { id: "pyr", name: "Pyroblast", type: "Instant", mana: "{R}", oracle: "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue." };
const HYDRO = { id: "hyd", name: "Hydroblast", type: "Instant", mana: "{U}", oracle: "Choose one —\n• Counter target spell if it's red.\n• Destroy target permanent if it's red." };

function spellOnStack(id, { name, type, cmc = 0, colors = [], controller = "ai" }) {
  return { id, kind: "spell", controller, targets: [], cost: null, source: { id: `card-${id}`, name, type, cmc, colors, oracle: "" }, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} } };
}
function responseState({ stack = [], userHand = [], userPool = {}, aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, stack,
    players: { ...s.players, user: { ...s.players.user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userPool } }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}
const castsOf = (state, cardId) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell").filter((c) => c.cardId === cardId);
const targetsOf = (acts) => acts.flatMap((a) => (a.targets || []).map((t) => t.id));

describe("parser + classifier", () => {
  it("Guttural carries BOTH filters; Pyroblast's modes read as the restricted twins; all three classify native", () => {
    const g = parseEffectProgram(GUTTURAL);
    expect(g.atoms).toEqual([{ op: "counter", spellFilter: "instant", targetType: "spell", colorFilter: { color: "U", negate: false } }]);
    const p = parseEffectProgram(PYRO);
    expect(p.confidence).toBe("high");
    expect(p.modal.modes.map((m) => m.atoms)).toEqual([
      [{ op: "counter", spellFilter: "any", targetType: "spell", colorFilter: { color: "U", negate: false } }],
      [{ op: "destroy", targetType: "permanent", restrictions: [{ kind: "color", color: "U" }] }],
    ]);
    for (const c of [GUTTURAL, PYRO, HYDRO]) expect(classifyCard({ ...c, keywords: [] })).toBe("native-spell");
  });
});

describe("runtime — Guttural Response", () => {
  it("counters a blue INSTANT; is never offered against a red instant or a blue creature spell (both filters hold)", () => {
    const blueInstant = spellOnStack("bi", { name: "Counterspell", type: "Instant", cmc: 2, colors: ["U"] });
    let s = responseState({ userHand: [GUTTURAL], userPool: { R: 1 }, stack: [blueInstant] });
    const acts = castsOf(s, "gut");
    expect(targetsOf(acts)).toEqual(["bi"]);
    const r = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(r.stack).toHaveLength(0);
    expect(r.players.ai.graveyard.map((c) => c.name)).toEqual(["Counterspell"]);
    const redInstant = spellOnStack("ri", { name: "Lightning Bolt", type: "Instant", cmc: 1, colors: ["R"] });
    expect(targetsOf(castsOf(responseState({ userHand: [GUTTURAL], userPool: { R: 1 }, stack: [redInstant] }), "gut"))).toEqual([]);
    const blueCreature = spellOnStack("bc", { name: "Snapcaster Mage", type: "Creature — Human Wizard", cmc: 2, colors: ["U"] });
    expect(targetsOf(castsOf(responseState({ userHand: [GUTTURAL], userPool: { R: 1 }, stack: [blueCreature] }), "gut"))).toEqual([]);
  });
});

describe("runtime — Pyroblast", () => {
  it("mode 1 counters a blue spell; a red spell is never a target (the restricted reading — an honest under-offer)", () => {
    const blue = spellOnStack("bs", { name: "Rhystic Study", type: "Enchantment", cmc: 3, colors: ["U"] });
    let s = responseState({ userHand: [PYRO], userPool: { R: 1 }, stack: [blue] });
    const acts = castsOf(s, "pyr").filter((a) => (a.targets || []).some((t) => t.id === "bs"));
    expect(acts.length).toBeGreaterThan(0);
    const r = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(r.stack).toHaveLength(0);
    expect(r.players.ai.graveyard.map((c) => c.name)).toEqual(["Rhystic Study"]);
    const red = spellOnStack("rs", { name: "Lightning Bolt", type: "Instant", cmc: 1, colors: ["R"] });
    expect(targetsOf(castsOf(responseState({ userHand: [PYRO], userPool: { R: 1 }, stack: [red] }), "pyr"))).toEqual([]);
  });

  it("mode 2 destroys a blue permanent; a red permanent is never a target", () => {
    const bluePerm = createPermanent({ id: "BP", card: { id: "c-bp", name: "Rhystic Study", type: "Enchantment", mana: "{2}{U}", colors: ["U"], oracle: "" }, controller: "ai" });
    const redPerm = createPermanent({ id: "RP", card: { id: "c-rp", name: "Blood Moon", type: "Enchantment", mana: "{2}{R}", colors: ["R"], oracle: "" }, controller: "ai" });
    let s = responseState({ userHand: [PYRO], userPool: { R: 1 }, aiBf: [bluePerm, redPerm] });
    s = { ...s, activePlayer: "user" };
    const acts = castsOf(s, "pyr");
    expect(targetsOf(acts)).toEqual(["BP"]);
    const r = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(r.players.ai.battlefield.map((p) => p.id)).toEqual(["RP"]);
    expect(r.players.ai.graveyard.map((c) => c.name)).toEqual(["Rhystic Study"]);
  });
});
