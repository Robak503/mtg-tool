/**
 * ELDRAZI MONUMENT (EDHREC #1461) — "Creatures you control get +1/+1 and have flying and indestructible. / At the beginning of your
 * upkeep, sacrifice a creature. If you can't, sacrifice this artifact." The controller's edict with its fallback: the controller
 * sacrifices a creature of their choice (CR 701.21a — indestructible does not stop a sacrifice), and only when they control none is
 * the Monument sacrificed. Its bundled ruling: "If you control any creatures as the triggered ability resolves, you must sacrifice one.
 * You can't choose to sacrifice Eldrazi Monument instead. You sacrifice the Monument only if you had no creatures to sacrifice."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveSacrificeChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const ELDRAZI_MONUMENT = {"name":"Eldrazi Monument","type":"Artifact","mana":"{5}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Creatures you control get +1/+1 and have flying and indestructible.\nAt the beginning of your upkeep, sacrifice a creature. If you can't, sacrifice this artifact."}; // body-only on 55eb7d63
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
function upkeep(user, ai1 = []) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: user }, ai1: { ...s0.players.ai1, battlefield: ai1 } } };
  return settle(checkStepTriggers(s, "upkeep"));
}
const zones = (s) => ({ battlefield: s.players.user.battlefield.map((p) => p.id).sort(), graveyard: s.players.user.graveyard.map((c) => c.id).sort() });

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(ELDRAZI_MONUMENT)).toBe("native-mixed");
  });
  it("⭐ one atom: the controller's creature edict with the source as its fallback; the bare edict is unchanged", () => {
    const atoms = (oracle) => (parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || []).map((a) => ({ op: a.op, who: a.who, what: a.what, fallback: a.orSacrificeSource ?? null }));
    expect({ monument: atoms("Sacrifice a creature. If you can't, sacrifice this artifact."), bare: atoms("Sacrifice a creature.") })
      .toEqual({ monument: [{ op: "sacrifice", who: "controller", what: "creature", fallback: true }], bare: [{ op: "sacrifice", who: "controller", what: "creature", fallback: null }] });
  });
});

describe("the upkeep", () => {
  it("⭐ one creature: it is sacrificed though indestructible (no question asked); the Monument stays", () => {
    const s = upkeep([P("mon", ELDRAZI_MONUMENT), P("bears", GRIZZLY_BEARS)]);
    expect({ pause: s.pendingChoice?.kind ?? null, ...zones(s) }).toEqual({ pause: null, battlefield: ["mon"], graveyard: ["c-bears"] });
  });

  it("⭐ two creatures: the controller chooses which — never the Monument; the Wurm goes, the Bears and the Monument stay", () => {
    const choosing = upkeep([P("mon", ELDRAZI_MONUMENT), P("bears", GRIZZLY_BEARS), P("wurm", CRAW_WURM)]);
    const candidates = (choosing.pendingChoice?.candidates || []).map((c) => c.id ?? c.permanentId ?? c).sort();
    const s = settle(resolveSacrificeChoice(choosing, "wurm"));
    expect({ kind: choosing.pendingChoice?.kind ?? null, candidates, ...zones(s) }).toEqual({ kind: "sacrifice-choice", candidates: ["bears", "wurm"], battlefield: ["bears", "mon"], graveyard: ["c-wurm"] });
  });

  it("⭐ no creature (a Sol Ring is no creature, an opponent's creature is not yours): the Monument is sacrificed", () => {
    const s = upkeep([P("mon", ELDRAZI_MONUMENT), P("ring", SOL_RING)], [P("abears", GRIZZLY_BEARS, "ai1")]);
    expect({ ...zones(s), ai1: s.players.ai1.battlefield.map((p) => p.id) }).toEqual({ battlefield: ["ring"], graveyard: ["c-mon"], ai1: ["abears"] });
  });
});
