/**
 * cunningEvasion.test.js — "Whenever a creature you control becomes blocked, you may return it to its owner's hand." (Cunning
 * Evasion, Grazilaxx, Illithid Scholar — census rank 50 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * Three pieces, each missing: the watcher subject ("a creature you control becomes blocked" → becomesBlocked /
 * creatureYouControl); the FAN-OUT — checkBlockTriggers fired becomes-blocked only on the blocked creature's own triggers, so a
 * watcher never heard it (now the attacker's controller's other permanents do, checkAttackTriggers' "other watchers" pattern);
 * and the payoff's "it", which is the BLOCKED creature, never the watcher (rewritten, event- and scope-gated, to the triggering-
 * creature bounce). The "you may" stays a real choice.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each through checkBlockTriggers → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkBlockTriggers, detectTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const EVASION = { name: "Cunning Evasion", type: "Enchantment", mana: "{1}{U}",
  oracle: "Whenever a creature you control becomes blocked, you may return it to its owner's hand." };
const GRAZILAXX = { name: "Grazilaxx, Illithid Scholar", type: "Legendary Creature — Horror", mana: "{2}{U}", power: "1", toughness: "4",
  oracle: "Whenever a creature you control becomes blocked, you may return it to its owner's hand.\nWhenever one or more creatures you control deal combat damage to a player, draw a card." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const WALL = { name: "Wall of Stone", type: "Creature — Wall", mana: "{1}{R}{R}", power: "0", toughness: "8", keywords: ["Defender"], oracle: "Defender" };

const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
// `attacker` attacks with `attackers` ([id, card]); `blocked` lists the attacker ids the defender's walls block.
function combat({ attacker = "user", own = [], attackers = [], blocked = [], defenderPerms = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const defender = attacker === "user" ? "ai" : "user";
  const atk = attackers.map(([id, card]) => perm(card, id, attacker));
  const walls = blocked.map((id, i) => perm(WALL, `wall${i}`, defender));
  return { ...s, turn: 4, phase: "combat", step: "declare-blockers", activePlayer: attacker, priorityHolder: attacker, stack: [], pendingTriggers: [],
    combat: { attackers: atk.map((p) => ({ permanentId: p.id, attackingPlayer: attacker, defender })), blockers: blocked.map((id, i) => ({ blockerId: `wall${i}`, attackerId: id })) },
    players: { ...s.players,
      [attacker]: { ...s.players[attacker], battlefield: [...own, ...atk], hand: [] },
      [defender]: { ...s.players[defender], battlefield: [...walls, ...defenderPerms], hand: [] } } };
}
function settle(s0, accept = true) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12; i++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, accept); continue; }
    if (!(s.stack || []).length) break;
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  return s;
}
const where = (s, pid, name) => (s.players[pid].battlefield.some((p) => p.card.name === name) ? "battlefield" : s.players[pid].hand.some((c) => c.name === name) ? "hand" : "elsewhere");

describe("parse + classification", () => {
  it("the watcher subject is detected, its \"it\" is the triggering creature, the \"you may\" is kept; both cards flip native", () => {
    expect(detectTriggers(EVASION).map((d) => ({ event: d.event, scope: d.scope, eff: d.effectClause, optional: d.optional })))
      .toEqual([{ event: "becomesBlocked", scope: "creatureYouControl", eff: "you may return the triggering creature to its owner's hand", optional: true }]);
    expect([classifyCard(EVASION), classifyCard(GRAZILAXX)]).toEqual(["native-trigger", "native-trigger"]);
  });
});

describe("RUNTIME — the blocked creature goes home; the watcher stays", () => {
  it("VACUITY CONTROL — a blocked Bear with no Cunning Evasion stays on the battlefield", () => {
    const s = settle(checkBlockTriggers(combat({ attackers: [["b", BEARS]], blocked: ["b"] })));
    expect(where(s, "user", "Grizzly Bears")).toBe("battlefield");
  });

  it("⭐ Cunning Evasion: the blocked Bear returns to its owner's hand, and Cunning Evasion stays", () => {
    const s = settle(checkBlockTriggers(combat({ own: [perm(EVASION, "ce", "user")], attackers: [["b", BEARS]], blocked: ["b"] })));
    const out = { bears: where(s, "user", "Grizzly Bears"), evasion: where(s, "user", "Cunning Evasion") };
    expect(out).toEqual({ bears: "hand", evasion: "battlefield" });
    console.log(`WITNESS evasionBounce ${JSON.stringify(out)}`);
  });

  it("⭐ the \"you may\" is real: declining leaves the Bear in combat", () => {
    const s = settle(checkBlockTriggers(combat({ own: [perm(EVASION, "ce", "user")], attackers: [["b", BEARS]], blocked: ["b"] })), false);
    expect(where(s, "user", "Grizzly Bears")).toBe("battlefield");
  });

  it("only BLOCKED attackers: of two attacking Bears, the unblocked one stays", () => {
    const s = settle(checkBlockTriggers(combat({ own: [perm(EVASION, "ce", "user")], attackers: [["b1", BEARS], ["b2", { ...BEARS, name: "Other Bears" }]], blocked: ["b1"] })));
    expect([where(s, "user", "Grizzly Bears"), where(s, "user", "Other Bears")]).toEqual(["hand", "battlefield"]);
  });

  it("⭐ Grazilaxx blocked returns ITSELF (\"a creature you control\" includes it) — its own per-attacker fire, no double trigger", () => {
    const s0 = combat({ attackers: [["gz", GRAZILAXX]], blocked: ["gz"] });
    const pending = checkBlockTriggers(s0).pendingTriggers || [];
    expect(pending.filter((p) => p.descriptor?.event === "becomesBlocked")).toHaveLength(1);
    expect(where(settle(checkBlockTriggers(s0)), "user", "Grazilaxx, Illithid Scholar")).toBe("hand");
  });

  it("the AI's blocked attacker never reaches the user's Cunning Evasion (the watchers are the ATTACKER's controller's)", () => {
    const s = settle(checkBlockTriggers(combat({ attacker: "ai", attackers: [["x", BEARS]], blocked: ["x"], defenderPerms: [perm(EVASION, "ce", "user")] })));
    expect(where(s, "ai", "Grizzly Bears")).toBe("battlefield");
  });
});

// The three carriers the flip-diff moved beyond the plan — the same subject and fan-out, payoffs that already parsed. Each run for real.
const SOMBERWALD = { name: "Somberwald Alpha", type: "Creature — Wolf", mana: "{3}{G}", power: "3", toughness: "2", keywords: [],
  oracle: "Whenever a creature you control becomes blocked, it gets +1/+1 until end of turn.\n{1}{G}: Target creature you control gains trample until end of turn. (It can deal excess combat damage to the player or planeswalker it's attacking.)" };
const ASH = { name: "Unstoppable Ash", type: "Creature — Treefolk Warrior", mana: "{3}{G}", power: "5", toughness: "5", keywords: ["Trample", "Champion"],
  oracle: "Trample\nChampion a Treefolk or Warrior (When this enters, sacrifice it unless you exile another Treefolk or Warrior you control. When this leaves the battlefield, that card returns to the battlefield.)\nWhenever a creature you control becomes blocked, it gets +0/+5 until end of turn." };
const QUARTERS = { name: "Close Quarters", type: "Enchantment", mana: "{2}{R}{R}", keywords: [],
  oracle: "Whenever a creature you control becomes blocked, this enchantment deals 1 damage to any target." };

describe("RUNTIME — the unplanned carriers, each run for real", () => {
  it("⭐ Somberwald Alpha: the BLOCKED Bear gets +1/+1, not the Alpha", () => {
    const s = settle(checkBlockTriggers(combat({ own: [perm(SOMBERWALD, "alpha", "user")], attackers: [["b", BEARS]], blocked: ["b"] })));
    expect({ bear: [permanentPower(s, "b"), permanentToughness(s, "b")], alpha: [permanentPower(s, "alpha"), permanentToughness(s, "alpha")] })
      .toEqual({ bear: [3, 3], alpha: [3, 2] });
  });

  it("⭐ Unstoppable Ash: the blocked Bear gets +0/+5", () => {
    const s = settle(checkBlockTriggers(combat({ own: [perm(ASH, "ash", "user")], attackers: [["b", BEARS]], blocked: ["b"] })));
    expect([permanentPower(s, "b"), permanentToughness(s, "b")]).toEqual([2, 7]);
  });

  it("⭐ Close Quarters: a blocked Bear means 1 damage on the AI's side (its life or one of its creatures)", () => {
    const s0 = combat({ own: [perm(QUARTERS, "cq", "user")], attackers: [["b", BEARS]], blocked: ["b"] });
    const s = settle(checkBlockTriggers(s0));
    const aiDamage = (s0.players.ai.life - s.players.ai.life) + s.players.ai.battlefield.reduce((n, p) => n + (p.damageMarked || 0), 0);
    expect(aiDamage).toBe(1);
  });
});
