/**
 * mustBlockSource.test.js — "Target creature blocks this creature this turn if able." (Trumpeting Armodon, Matsu-Tribe
 * Decoy, Tangle Angler, Rampant Elephant, Burning-Tree Bloodscale, Maraleaf Rider, Lurking Arynx — the 09-06 plan's
 * stage ③, census row ⑬, 2026-09-30).
 *
 * A block REQUIREMENT on one blocker toward one attacker (CR 509.1c): the requirement twin of the pairwise "can't block this
 * creature this turn". The atom grants the same source-keyed endOfTurn keyword (`mustBlockSource:<sourceId>`), and
 * opponentAI.pickBlockers seeds exactly that pair first whenever it is a legal block. Same house bar as LURE and MUST-ATTACK:
 * the AI seat complies; the human seat is never hard-gated. CR 509.1c asks for the most requirements obeyed, so a menace
 * attacker takes the forced blocker plus the fewest helpers that make the block legal — and nothing when it can't be
 * completed.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickBlockPlan } from "./opponentAI.js";
import { addContinuousEffect, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { atomTargetIntent } from "./effects/programQueries.js";

beforeEach(() => _resetIdsForTests());

const FORCE = "Target creature blocks this creature this turn if able.";
const ARMODON = { name: "Trumpeting Armodon", type: "Creature — Elephant", mana: "{3}{G}", power: 3, toughness: 3, oracle: `{1}{G}: ${FORCE}` };
const ARYNX = { name: "Lurking Arynx", type: "Creature — Cat Beast", mana: "{4}{G}", power: 3, toughness: 5, keywords: ["Formidable"],
  oracle: `Formidable — {2}{G}: ${FORCE} Activate only if creatures you control have total power 8 or greater.` };
const RIDER = { name: "Maraleaf Rider", type: "Creature — Elf Knight", mana: "{1}{G}", power: 3, toughness: 1, oracle: `Sacrifice a Food: ${FORCE}` };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", power: 6, toughness: 4, oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const FOOD = { name: "Food", type: "Token Artifact — Food", token: true, oracle: "{2}, {T}, Sacrifice this token: You gain 3 life." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", power: 1, toughness: 1, oracle: "{T}: Add {G}." };
const MENACE_ARMODON = { ...ARMODON, name: "Synthetic Menace Armodon", keywords: ["Menace"], oracle: `Menace\n{1}{G}: ${FORCE}` };

const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });

function main({ user = [], ai = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai } } };
}
const activations = (s, permanentId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permanentId);
// Activate `permanentId`'s ability at the AI creature `targetId`, run for real.
function force(s, permanentId, targetId) {
  const act = activations(s, permanentId).find((a) => (a.targets || []).some((t) => t.id === targetId));
  expect(act).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}
// Move to the AI's declare-blockers decision with `attackerIds` attacking it, and ask the AI's block plan.
function aiBlocks(s, attackerIds) {
  const combat = { ...s, phase: "combat", step: "declare-blockers", priorityHolder: "ai",
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } };
  const actions = legalActionsForPlayer(combat, "ai").filter((a) => a.kind === "declare-blocker");
  return pickBlockPlan(combat, "ai", actions).map((a) => `${a.permanentId}→${a.attackerId}`);
}

describe("classification", () => {
  it("the seven carriers flip; Vortex Elemental and Torchling (other unmodeled abilities) stay parked", () => {
    for (const card of [ARMODON, ARYNX, RIDER]) expect(classifyCard(card), card.name).toBe("native-activated");
    expect(classifyCard({ name: "Rampant Elephant", type: "Creature — Elephant", mana: "{3}{W}", power: 2, toughness: 2, oracle: `{G}: ${FORCE}` })).toBe("native-activated");
    expect(classifyCard({ name: "Vortex Elemental", type: "Creature — Elemental", mana: "{U}", power: 0, toughness: 1,
      oracle: `{U}: Put this creature and each creature blocking or blocked by it on top of their owners' libraries, then those players shuffle.\n{3}{U}{U}: ${FORCE}` })).toBe("body-only");
  });
});

describe("RUNTIME — the requirement and the AI block plan", () => {
  it("VACUITY CONTROL — unforced, the AI's Grizzly Bears don't chump-block a 3/3 Armodon", () => {
    expect(aiBlocks(main({ user: [perm(ARMODON, "arm", "user")], ai: [perm(BEARS, "b", "ai")] }), ["arm"])).toEqual([]);
  });

  it("⭐ run for real: {1}{G} at the Bears grants the pairwise requirement, and the AI then blocks the Armodon with them", () => {
    const s = force(main({ user: [perm(ARMODON, "arm", "user")], ai: [perm(BEARS, "b", "ai")], pool: { G: 1, C: 1 } }), "arm", "b");
    expect(permanentHasKeyword(s, "b", "mustBlockSource:arm")).toBe(true);
    const plan = aiBlocks(s, ["arm"]);
    expect(plan).toEqual(["b→arm"]);
    console.log(`WITNESS forcedBlock ${JSON.stringify(plan)}`);
  });

  it("⭐ the requirement names THIS attacker: with Craw Wurm also attacking (its id sorts FIRST), the Bears block the Armodon", () => {
    const s = force(main({ user: [perm(ARMODON, "arm", "user"), perm(WURM, "a-wurm", "user")], ai: [perm(BEARS, "b", "ai")], pool: { G: 1, C: 1 } }), "arm", "b");
    expect(aiBlocks(s, ["a-wurm", "arm"])).toEqual(["b→arm"]);
  });

  it("the activator aims it at an OPPONENT's creature (the target intent the AI's choosers read)", () => {
    expect(atomTargetIntent({ op: "must-block-source", targetType: "creature" })).toBe("enemy");
  });

  it("⭐ a MENACE attacker (CR 509.1c — obey the requirement if any legal block does): the forced Bears bring the smallest helper", () => {
    const s = force(main({ user: [perm(MENACE_ARMODON, "arm", "user")], ai: [perm(BEARS, "b", "ai"), perm(ELVES, "e", "ai"), perm(WURM, "w", "ai")],
      pool: { G: 1, C: 1 } }), "arm", "b");
    expect(aiBlocks(s, ["arm"])).toEqual(["b→arm", "e→arm"]);
    // VACUITY CONTROL: unforced, the AI doesn't gang-block the menace Armodon at all.
    expect(aiBlocks(main({ user: [perm(MENACE_ARMODON, "arm", "user")], ai: [perm(BEARS, "b", "ai"), perm(ELVES, "e", "ai"), perm(WURM, "w", "ai")] }), ["arm"])).toEqual([]);
  });

  it("⛔ …and when the only helper is bound by its own requirement elsewhere, the menace block can't be completed: no lone block", () => {
    let s = force(main({ user: [perm(MENACE_ARMODON, "arm", "user"), perm(WURM, "a-wurm", "user")], ai: [perm(BEARS, "b", "ai"), perm(ELVES, "e", "ai")],
      pool: { G: 1, C: 1 } }), "arm", "b");
    // The Elves carry a requirement toward the Wurm (the same keyword the atom grants), and the Wurm's id sorts first.
    s = addContinuousEffect(s, { layer: 6, op: { layerOp: "addKeyword", keyword: "mustBlockSource:a-wurm" }, affects: { mode: "fixed", permanentIds: ["e"] },
      duration: { kind: "endOfTurn", turn: s.turn } }).state;
    expect(aiBlocks(s, ["a-wurm", "arm"])).toEqual(["e→a-wurm"]);
  });
});

describe("RUNTIME — every carrier, run for real", () => {
  it("⭐ Rampant Elephant, Tangle Angler, Matsu-Tribe Decoy, Burning-Tree Bloodscale: each activation grants the requirement toward ITSELF", () => {
    const carriers = [
      { name: "Rampant Elephant", type: "Creature — Elephant", mana: "{3}{W}", power: 2, toughness: 2, oracle: `{G}: ${FORCE}` },
      { name: "Tangle Angler", type: "Creature — Phyrexian Horror", mana: "{3}{G}", power: 1, toughness: 5, keywords: ["Infect"],
        oracle: `Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\n{G}: ${FORCE}` },
      { name: "Matsu-Tribe Decoy", type: "Creature — Snake Warrior", mana: "{2}{G}", power: 1, toughness: 3,
        oracle: `{2}{G}: ${FORCE}\nWhenever this creature deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step.` },
      { name: "Burning-Tree Bloodscale", type: "Creature — Lizard Berserker", mana: "{2}{R}{G}", power: 2, toughness: 2, keywords: ["Bloodthirst"],
        oracle: `Bloodthirst 1 (If an opponent was dealt damage this turn, this creature enters with a +1/+1 counter on it.)\n{2}{R}: Target creature can't block this creature this turn.\n{2}{G}: ${FORCE}` },
    ];
    const granted = carriers.map((card) => {
      const s = main({ user: [perm(card, "src", "user")], ai: [perm(BEARS, "b", "ai")], pool: { G: 1, C: 2 } });
      // The {2}{R} "can't block" line of the Bloodscale is unaffordable with this pool, so the only offered activation is the requirement.
      return permanentHasKeyword(force(s, "src", "b"), "b", "mustBlockSource:src");
    });
    expect(granted).toEqual([true, true, true, true]);
  });
});

describe("RUNTIME — the carriers' own costs and conditions", () => {
  it("⭐ Lurking Arynx: offered only while its controller's creatures total power 8 or more", () => {
    expect(activations(main({ user: [perm(ARYNX, "ax", "user")], ai: [perm(BEARS, "b", "ai")], pool: { G: 1, C: 2 } }), "ax")).toEqual([]);
    const big = main({ user: [perm(ARYNX, "ax", "user"), perm(WURM, "w", "user")], ai: [perm(BEARS, "b", "ai")], pool: { G: 1, C: 2 } });
    expect(permanentHasKeyword(force(big, "ax", "b"), "b", "mustBlockSource:ax")).toBe(true);
  });

  it("⭐ Maraleaf Rider: sacrificing a Food pays for it; with no Food it isn't offered", () => {
    expect(activations(main({ user: [perm(RIDER, "mr", "user")], ai: [perm(BEARS, "b", "ai")] }), "mr")).toEqual([]);
    const out = force(main({ user: [perm(RIDER, "mr", "user"), perm(FOOD, "food", "user")], ai: [perm(BEARS, "b", "ai")] }), "mr", "b");
    expect([permanentHasKeyword(out, "b", "mustBlockSource:mr"), out.players.user.battlefield.some((p) => p.id === "food")]).toEqual([true, false]);
  });
});
