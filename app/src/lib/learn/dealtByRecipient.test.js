/**
 * THE DEALT-BY RECIPIENT — "Whenever <source> deals damage to a player / to an opponent / to a creature, …" is ANY damage that source
 * deals to that kind of recipient, not only combat damage. The bundled rulings say it card by card: Curiosity — "Any damage dealt by
 * the enchanted creature to an opponent will cause Curiosity to trigger, not just combat damage." and "If you control Curiosity and
 * it's enchanting an opponent's creature, you won't draw a card when that creature deals damage to you."; Keen Sense, Snake Umbra,
 * Vedalken Heretic, Warren Instigator, Odylic Wraith, Wei Night Raiders, Witherscale Wurm the same; Syr Carah — "If Syr Carah or an
 * instant or sorcery spell you control deals damage to two or more players at the same time, Syr Carah's first ability triggers for
 * each of those players."; Sword of Kaldra — "You exile the creature that gets damaged."; Mephidross Vampire's grant "triggers on any
 * damage dealt to any creature, not just combat damage."
 *
 * The engine read these as their combat forms only (the "deals damage to a player" self and Aura arms fired from the combat damage
 * step alone; the "to a creature" payoffs existed only for "deals combat damage to a creature"), and "to an opponent" was never
 * checked against the trigger's controller. Now the non-combat funnel (spellEffects.settleDamageEvent) fires them too — once per
 * player, or per creature, the source dealt damage to in the event (CR 603.2c) — and "an opponent" is an opponent of the ability's
 * controller (for a granted ability, the creature's controller — the Snake Umbra and Helm of the Ghastlord rulings).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NIV_MIZZET = {"name":"Niv-Mizzet, Dracogenius","type":"Legendary Creature — Dragon Wizard","mana":"{2}{U}{U}{R}{R}","cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R","U"],"oracle":"Flying\nWhenever Niv-Mizzet deals damage to a player, you may draw a card.\n{U}{R}: Niv-Mizzet deals 1 damage to any target."};
const CURIOSITY = {"name":"Curiosity","type":"Enchantment — Aura","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card."};
const HYPNOTIC_SPECTER = {"name":"Hypnotic Specter","type":"Creature — Specter","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nWhenever this creature deals damage to an opponent, that player discards a card at random."};
const SYR_CARAH = {"name":"Syr Carah, the Bold","type":"Legendary Creature — Human Knight","mana":"{3}{R}{R}","cmc":5,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"Whenever Syr Carah or an instant or sorcery spell you control deals damage to a player, exile the top card of your library. You may play that card this turn.\n{T}: Syr Carah deals 1 damage to any target."};
const SWORD_OF_KALDRA = {"name":"Sword of Kaldra","type":"Legendary Artifact — Equipment","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +5/+5.\nWhenever equipped creature deals damage to a creature, exile that creature. (Exile it only if it's still on the battlefield.)\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)"};
const MATSU_TRIBE_SNIPER = {"name":"Matsu-Tribe Sniper","type":"Creature — Snake Warrior Archer","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: This creature deals 1 damage to target creature with flying.\nWhenever this creature deals damage to a creature, tap that creature and it doesn't untap during its controller's next untap step."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const WALL_OF_STONE = {"name":"Wall of Stone","type":"Creature — Wall","mana":"{1}{R}{R}","cmc":3,"power":"0","toughness":"8","keywords":["Defender"],"colors":["R"],"oracle":"Defender (This creature can't attack.)"};
const VORACIOUS_COBRA = {"name":"Voracious Cobra","type":"Creature — Snake","mana":"{2}{R}{G}","cmc":4,"power":"2","toughness":"2","keywords":["First strike"],"colors":["G","R"],"oracle":"First strike\nWhenever this creature deals combat damage to a creature, destroy that creature."};
const STORM_CROW ={"name":"Storm Crow","type":"Creature — Bird","mana":"{1}{U}","cmc":2,"power":"1","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying (This creature can't be blocked except by creatures with flying or reach.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

function board({ user = [], ai = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, hand: [], manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: aiHand, library: LIB("ai") } } };
}
/** `attackers` ([permanentId, attackingPlayer]) attack the other seat; `blocks` pairs [blocker, attacker]. */
function combat(s, attackers, blocks = []) {
  return resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage",
    combat: { attackers: attackers.map(([id, by]) => ({ permanentId: id, attackingPlayer: by, defender: by === "user" ? "ai" : "user" })),
      blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, blockingPlayer: findPermanent(s, blockerId).permanent.controller, attackerId })) } });
}
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
/** Settle, taking every "you may". */
function settleTaking(s0) {
  let s = settle(s0);
  for (let i = 0; i < 6 && s.pendingChoice?.kind === "optional-effect"; i++) s = settle(resolveOptionalChoice(s, true));
  return s;
}
function activate(s, permId, pick = () => true) {
  const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId).find(pick);
  expect(act, `an activation of ${permId} is offered`).toBeTruthy();
  return dispatchAction(s, act);
}
const aimsAt = (a, id) => (a.targets || []).some((t) => t.id === id);
const hand = (s, pid) => s.players[pid].hand.length;
const recipientTriggers = (s) => (s.pendingTriggers || []).map((t) => `${t.event}:${t.source?.name}:${t.controller}`);

describe("to a player / to an opponent — any damage, and an opponent of the ability's controller", () => {
  it("⭐ Niv-Mizzet pings the AI with its own ability: its trigger fires and its controller draws", () => {
    const s = board({ user: [P("niv", NIV_MIZZET, "user")] });
    const out = settleTaking(activate(s, "niv", (a) => aimsAt(a, "ai")));
    expect({ ai: out.players.ai.life, hand: hand(out, "user") }).toEqual({ ai: 19, hand: 1 });
  });
  it("⭐ Curiosity: the enchanted creature's non-combat damage to an opponent draws a card", () => {
    const s = board({ user: [P("bears", GRIZZLY_BEARS, "user", { attachments: ["cur"] }), P("cur", CURIOSITY, "user", { attachedTo: "bears" })] });
    const hit = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "player", targets: [{ type: "player", id: "ai" }], source: { id: "bears" } });
    expect(recipientTriggers(hit)).toEqual(["combatDamageToPlayer:Curiosity:user"]);
    expect(hand(settleTaking(hit), "user")).toBe(1);
  });
  it("⭐ Curiosity on the AI's creature: that creature hitting the Aura's controller is not damage to an opponent — no trigger", () => {
    const s = board({ user: [P("cur", CURIOSITY, "user", { attachedTo: "bears" })], ai: [P("bears", GRIZZLY_BEARS, "ai", { attachments: ["cur"] })] });
    const hit = combat(s, [["bears", "ai"]]);
    expect({ life: hit.players.user.life, fired: recipientTriggers(hit) }).toEqual({ life: 18, fired: [] });
  });
  it("⭐ Syr Carah parks: its 'or an instant or sorcery spell you control' half is not read, so the card does not play whole", () => {
    expect(classifyCard(SYR_CARAH)).toBe("body-only");
  });
  it("CONTROL — Hypnotic Specter's combat damage to an opponent makes that player discard at random", () => {
    const s = board({ user: [P("spec", HYPNOTIC_SPECTER, "user")], aiHand: [{ id: "ah1", ...GRIZZLY_BEARS }, { id: "ah2", ...GRIZZLY_BEARS }] });
    const out = settle(combat(s, [["spec", "user"]]));
    expect({ life: out.players.ai.life, hand: hand(out, "ai") }).toEqual({ life: 18, hand: 1 });
  });
  it("CONTROL — Hypnotic Specter's damage to its own controller is not damage to an opponent", () => {
    const s = board({ user: [P("spec", HYPNOTIC_SPECTER, "user")], aiHand: [{ id: "ah1", ...GRIZZLY_BEARS }] });
    const hit = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "player", targets: [{ type: "player", id: "user" }], source: { id: "spec" } });
    expect({ life: hit.players.user.life, fired: recipientTriggers(hit) }).toEqual({ life: 18, fired: [] });
  });
  it("CONTROL — Niv-Mizzet pinging a creature is not damage to a player", () => {
    const s = board({ user: [P("niv", NIV_MIZZET, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] });
    const out = settleTaking(activate(s, "niv", (a) => aimsAt(a, "bears")));
    expect({ marked: findPermanent(out, "bears")?.permanent.damageMarked, hand: hand(out, "user") }).toEqual({ marked: 1, hand: 0 });
  });
});

describe("to a creature — any damage, once per creature dealt damage", () => {
  it("⭐ Matsu-Tribe Sniper pings a flyer: its trigger taps that creature and it doesn't untap during its controller's next untap step", () => {
    const s = board({ user: [P("sniper", MATSU_TRIBE_SNIPER, "user")], ai: [P("crow", STORM_CROW, "ai")] });
    const out = settle(activate(s, "sniper", (a) => aimsAt(a, "crow")));
    const crow = findPermanent(out, "crow")?.permanent;
    expect({ tapped: crow?.tapped, locked: crow?.doesNotUntapNext }).toEqual({ tapped: true, locked: true });
  });
  it("⭐ Sword of Kaldra: the equipped creature (7/7) is blocked by Wall of Stone, deals it 7 — the Wall is exiled", () => {
    let s = board({ user: [P("bears", GRIZZLY_BEARS, "user"), P("sword", SWORD_OF_KALDRA, "user")], ai: [P("wall", WALL_OF_STONE, "ai")] });
    s = attachPermanent(s, { equipId: "sword", targetId: "bears" });
    const out = settle(combat(s, [["bears", "user"]], [["wall", "bears"]]));
    expect({ wall: !!findPermanent(out, "wall"), exiled: out.players.ai.exile.map((c) => c.name) }).toEqual({ wall: false, exiled: ["Wall of Stone"] });
  });
  it("CONTROL — the same Bears without the Sword deals 2 to the Wall: nothing is exiled", () => {
    const s = board({ user: [P("bears", GRIZZLY_BEARS, "user")], ai: [P("wall", WALL_OF_STONE, "ai")] });
    const out = settle(combat(s, [["bears", "user"]], [["wall", "bears"]]));
    expect({ wall: findPermanent(out, "wall")?.permanent.damageMarked, exiled: out.players.ai.exile.length }).toEqual({ wall: 2, exiled: 0 });
  });
  it("CONTROL — only the equipped creature's damage: the Sword's Bears connects unblocked, another creature's 2 to the Wall exiles nothing", () => {
    let s = board({ user: [P("bears", GRIZZLY_BEARS, "user"), P("other", GRIZZLY_BEARS, "user"), P("sword", SWORD_OF_KALDRA, "user")], ai: [P("wall", WALL_OF_STONE, "ai")] });
    s = attachPermanent(s, { equipId: "sword", targetId: "bears" });
    const out = settle(combat(s, [["bears", "user"], ["other", "user"]], [["wall", "other"]]));
    expect({ life: out.players.ai.life, wall: findPermanent(out, "wall")?.permanent.damageMarked, exiled: out.players.ai.exile.length }).toEqual({ life: 13, wall: 2, exiled: 0 });
  });
  it("CONTROL — 'deals COMBAT damage to a creature' stays combat only: Voracious Cobra's fight destroys nothing by its trigger", () => {
    const s = board({ user: [P("cobra", VORACIOUS_COBRA, "user")], ai: [P("wall", WALL_OF_STONE, "ai")] });
    const hit = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "wall" }], source: { id: "cobra" } });
    const out = settle(hit);
    expect({ fired: recipientTriggers(hit), wall: findPermanent(out, "wall")?.permanent.damageMarked }).toEqual({ fired: [], wall: 2 });
  });
});
