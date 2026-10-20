/**
 * ACTIVATED ABILITIES AT INSTANT SPEED — a rules-faithfulness fix, every case driven through the engine's own entry points
 * (legalActionsForPlayer → dispatchAction → passPriority / resolveTopOfStack).
 *
 *    CR 117.1b — "A player may activate an activated ability any time they have priority."
 *    CR 602.1b — text after the colon may restrict when a player can activate the ability (an activation instruction).
 *    CR 602.5d — "Activate only as a sorcery" means the timing rules for casting a sorcery (CR 307.5: own main phase,
 *                priority, empty stack).
 *    CR 606.3  — a loyalty ability: own main phase, priority, empty stack, once per permanent per turn.
 *    CR 702.6a — Equip: "… Activate only as a sorcery."     CR 702.29a — Cycling: an activated ability of a card in hand.
 *    CR 702.122a — Crew: an activated ability with no timing instruction.
 *
 * The bug: every non-mana activated ability of a permanent (and cycling, crew and the discard-this-card abilities from hand)
 * was offered only in its controller's own main phase. No sacrifice outlet in response, no Mother of Runes in response, no
 * pump after blocks, no cycling at an opponent's end step — for the person in the Academy and for the AI alike. The fix opens
 * every activated ability whenever its controller holds priority and keeps each printed timing restriction: "Activate only as
 * a sorcery", Equip, Reconfigure, level up, transmute, loyalty abilities, "Activate only during your turn" (read into a flag
 * for the first time — it used to be stripped with no flag), "before attackers are declared" and "during the end of combat
 * step". Grand Abolisher's activation half, which the old window enforced by accident, is now enforced. The default AI keeps
 * the windows it decided in before (its own main phase, a combat-role ability in a combat step, a stack-copy ability while
 * its own ability waits) — offered more, it takes nothing new.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-20; the trailing comment is the tier
 * at generation). Per-test instance ids only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { makeDecision } from "./decisionGate.js";
import { pickAction } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const KESSIG_WOLF_RUN = {"name":"Kessig Wolf Run","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn."}; // land
const VISCERA_SEER = {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Scry"],"colors":["B"],"oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)"}; // native-activated
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."}; // native-activated
const LONELY_SANDBAR = {"name":"Lonely Sandbar","type":"Land","mana":"","cmc":0,"keywords":["Cycling"],"colors":[],"oracle":"This land enters tapped.\n{T}: Add {U}.\nCycling {U} ({U}, Discard this card: Draw a card.)"}; // land
const VONA = {"name":"Vona, Butcher of Magan","type":"Legendary Creature — Vampire Knight","mana":"{3}{W}{B}","cmc":5,"power":"4","toughness":"4","keywords":["Lifelink","Vigilance"],"colors":["B","W"],"oracle":"Vigilance, lifelink\n{T}, Pay 7 life: Destroy target nonland permanent. Activate only during your turn."}; // native-activated
const STEADFAST_UNICORN = {"name":"Steadfast Unicorn","type":"Creature — Unicorn","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"{3}{W}: Creatures you control get +1/+1 and gain vigilance until end of turn. Activate only during your turn. (Attacking doesn't cause them to tap.)"}; // native-activated
const CAPRICIOUS_SORCERER = {"name":"Capricious Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: This creature deals 1 damage to any target. Activate only during your turn, before attackers are declared."}; // native-activated
const CRANIAL_PLATING = {"name":"Cranial Plating","type":"Artifact — Equipment","mana":"{2}","cmc":2,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+0 for each artifact you control.\n{B}{B}: Attach this Equipment to target creature you control.\nEquip {1}"}; // native-equipment
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const DETAINMENT_SPELL = {"name":"Detainment Spell","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature's activated abilities can't be activated.\n{1}{W}: Attach this Aura to target creature."}; // native-aura
const GRAND_ABOLISHER = {"name":"Grand Abolisher","type":"Creature — Human Cleric","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments."}; // native-static
const SLEEK_SCHOONER = {"name":"Sleek Schooner","type":"Artifact — Vehicle","mana":"{3}","cmc":3,"power":"4","toughness":"3","keywords":["Crew"],"colors":[],"oracle":"Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // native-body
const FROZEN_SHADE = {"name":"Frozen Shade","type":"Creature — Shade","mana":"{2}{B}","cmc":3,"power":"0","toughness":"1","keywords":[],"colors":["B"],"oracle":"{B}: This creature gets +1/+1 until end of turn."}; // native-activated
const PILLARDROP_WARDEN = {"name":"Pillardrop Warden","type":"Creature — Spirit Dwarf","mana":"{3}{R}","cmc":4,"power":"1","toughness":"5","keywords":["Reach"],"colors":["R"],"oracle":"Reach\n{2}, {T}, Sacrifice this creature: Return target instant or sorcery card from your graveyard to your hand. Activate only as a sorcery."}; // native-activated
const LILIANA_OF_THE_VEIL = {"name":"Liliana of the Veil","type":"Legendary Planeswalker — Liliana","mana":"{1}{B}{B}","cmc":3,"loyalty":"3","keywords":[],"colors":["B"],"oracle":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice."}; // playable-pw
const DESERT = {"name":"Desert","type":"Land — Desert","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step."}; // land
const OTAWARA = {"name":"Otawara, Soaring City","type":"Legendary Land","mana":"","cmc":0,"keywords":["Channel"],"colors":[],"oracle":"{T}: Add {U}.\nChannel — {3}{U}, Discard this card: Return target artifact, creature, enchantment, or planeswalker to its owner's hand. This ability costs {1} less to activate for each legendary creature you control."}; // land
const TOLARIA_WEST = {"name":"Tolaria West","type":"Land","mana":"","cmc":0,"keywords":["Transmute"],"colors":[],"oracle":"This land enters tapped.\n{T}: Add {U}.\nTransmute {1}{U}{U} ({1}{U}{U}, Discard this card: Search your library for a card with mana value 0, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)"}; // land
const ARCHIVIST = {"name":"Archivist","type":"Creature — Human Wizard","mana":"{2}{U}{U}","cmc":4,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: Draw a card."}; // native-activated
const DAVENANT_ARCHER = {"name":"D'Avenant Archer","type":"Creature — Human Soldier Archer","mana":"{2}{W}","cmc":3,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"{T}: This creature deals 1 damage to target attacking or blocking creature."}; // native-activated
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...over });
const C = (id, card) => ({ id, ...card });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));

/**
 * A two-seat game. `at` names the moment: whose turn (`active`), the phase and step, and who holds priority (`holder`, the
 * active player by default; the other seat holds it after the active player passed, so the pass count is then 1).
 */
function duel({ user = [], ai = [], userHand = [], aiHand = [], userLib = [], aiLib = [], userGy = [] } = {}, at = {}) {
  const { active = "user", phase = "precombat-main", step = "main", holder = active } = at;
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase, step, activePlayer: active, priorityHolder: holder, consecutivePasses: holder === active ? 0 : 1, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: userHand, graveyard: userGy, library: userLib },
      ai: { ...s0.players.ai, battlefield: ai, hand: aiHand, graveyard: [], library: aiLib },
    },
  };
}
const OPP_END = { active: "ai", phase: "ending", step: "end", holder: "user" };
const OPP_MAIN = { active: "ai", phase: "precombat-main", step: "main", holder: "user" };
const OWN_UPKEEP = { phase: "beginning", step: "upkeep" };
const OWN_BOC = { phase: "combat", step: "beginning-of-combat" };
const OWN_POSTCOMBAT = { phase: "postcombat-main", step: "main" };

const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const abilitiesOf = (s, pid, permId) => offered(s, pid, "activate-ability").filter((a) => a.permanentId === permId);
/** Dispatch the first OFFERED action of `kind` for `pid` that satisfies `pred`; throws when none is offered (setup only). */
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid} at ${s.step}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
/** Pass until the stack is no deeper than `depth` (setup; at most `limit` passes). */
function passUntil(s, depth, limit = 12) {
  let cur = s;
  for (let g = 0; g < limit && cur.stack.length > depth; g++) cur = pass(cur);
  return cur;
}
/** The declaring seat attacks with each id, then passes once — the pass that closes the attack declaration. */
const attackWith = (s, seat, ids) => pass(ids.reduce((cur, id) => act(cur, seat, "declare-attacker", (a) => a.permanentId === id), s));
/** Pass until the declare blockers step begins (throws if it never does — setup). */
function toBlockers(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.step !== "declare-blockers"; g++) cur = pass(cur);
  if (cur.step !== "declare-blockers") throw new Error(`never reached declare-blockers (at ${cur.step})`);
  return cur;
}
/** In the declare blockers step: each seat in `blocks` declares its blocks when it first holds priority; every other priority is
 *  passed, until the block declaration has closed and `seat` holds priority. */
function blocksDeclaredThen(s, blocks, seat) {
  let cur = s;
  const done = new Set();
  for (let g = 0; g < 20; g++) {
    if (cur.step !== "declare-blockers") throw new Error(`left declare-blockers (at ${cur.step})`);
    const h = cur.priorityHolder;
    if (!cur.combat?.blockDeclarationOpen && h === seat) return cur;
    if (blocks[h] && !done.has(h)) {
      done.add(h);
      for (const [blockerId, attackerId] of blocks[h]) cur = act(cur, h, "declare-blocker", (a) => a.permanentId === blockerId && a.attackerId === attackerId);
    }
    cur = pass(cur);
  }
  throw new Error("the block declaration never closed");
}
/** The AI casts `name` at `targetId` in its own main phase and passes: the user holds priority with the spell on the stack. */
function aiCastsAt(s, name, targetId) {
  const cast = act(s, "ai", "cast-spell", (a) => a.name === name && (a.targets || []).some((t) => t.id === targetId));
  return pass(cast);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("CR 117.1b — an activated ability is offered whenever its controller holds priority", () => {
  it("⭐ Kessig Wolf Run after blocks: the attacking player holds priority on the declared block and is offered +X/+0 and trample on its attacker; it resolves before combat damage", () => {
    const s0 = duel({
      user: [P("hg", HILL_GIANT, "user"), P("kwr", KESSIG_WOLF_RUN, "user"), P("m1", MOUNTAIN, "user"), P("f1", FOREST, "user"), P("sw1", SWAMP, "user")],
      ai: [P("gb", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai")],
    }, { phase: "combat", step: "declare-attackers" });
    const s = blocksDeclaredThen(toBlockers(attackWith(s0, "user", ["hg"])), { ai: [["gb", "hg"], ["gb2", "hg"]] }, "user");
    const pump = abilitiesOf(s, "user", "kwr").find((a) => a.xValue === 1 && (a.targets || []).some((t) => t.id === "hg"));
    expect(pump).toBeTruthy();
    const after = passUntil(dispatchAction(s, pump), 0);
    expect(after.step).toBe("declare-blockers");
    expect(permanentPower(after, "hg")).toBe(4);
    expect(permanentHasKeyword(after, "hg", "Trample")).toBe(true);
  });

  it("⭐ a self-pump after blocks, for each side: the attacker's Frozen Shade and the defender's Frozen Shade are each offered +1/+1 when their controller holds priority on the block", () => {
    const s0 = duel({
      user: [P("fs", FROZEN_SHADE, "user", { power: "0" }), ...lands("usw", SWAMP, 2, "user")],
      ai: [P("afs", FROZEN_SHADE, "ai"), ...lands("asw", SWAMP, 2, "ai")],
    }, { phase: "combat", step: "declare-attackers" });
    const s = blocksDeclaredThen(toBlockers(attackWith(s0, "user", ["fs"])), { ai: [["afs", "fs"]] }, "user");
    expect(abilitiesOf(s, "user", "fs").length).toBeGreaterThan(0);
    const defenderTurn = pass(s); // the attacking player passes; the defending player holds priority on its own block
    expect(defenderTurn.priorityHolder).toBe("ai");
    expect(abilitiesOf(defenderTurn, "ai", "afs").length).toBeGreaterThan(0);
  });

  it("⭐ a sacrifice outlet in response on an opponent's turn: Viscera Seer is offered with Murder on the stack, and sacrificing the target leaves Murder nothing to destroy", () => {
    const s0 = duel({
      user: [P("vs", VISCERA_SEER, "user"), P("gb", GRIZZLY_BEARS, "user")],
      ai: lands("asw", SWAMP, 3, "ai"), aiHand: [C("h-murder", MURDER)],
      userLib: [C("l1", GRIZZLY_BEARS), C("l2", HILL_GIANT)],
    }, { active: "ai" });
    const s = aiCastsAt(s0, "Murder", "gb");
    expect([s.priorityHolder, s.stack.length]).toEqual(["user", 1]);
    const sac = abilitiesOf(s, "user", "vs").find((a) => a.sacCreatureId === "gb");
    expect(sac).toBeTruthy();
    const after = passUntil(dispatchAction(s, sac), 0);
    expect(after.players.user.graveyard.some((c) => c.id === "c-gb")).toBe(true);
    expect(after.players.user.battlefield.some((p) => p.id === "vs")).toBe(true);
    expect(after.players.ai.graveyard.some((c) => c.id === "h-murder")).toBe(true); // Murder left the stack with its target gone (CR 608.2b)
  });

  it("⭐ Mother of Runes in response: offered on the user's creature with Lightning Bolt on the stack; the protection makes the Bolt's target illegal and the Bears live", () => {
    // The colour is chosen as the ability resolves by choicePolicy.autoPickProtectionColor — the most common colour among the
    // opponents' nonland permanents, not the spell on the stack — so the AI's red Hill Giant is on the board to make it red.
    const s0 = duel({
      user: [P("mor", MOTHER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user")],
      ai: [P("am1", MOUNTAIN, "ai"), P("ahg", HILL_GIANT, "ai")], aiHand: [C("h-bolt", LIGHTNING_BOLT)],
    }, { active: "ai" });
    const s = aiCastsAt(s0, "Lightning Bolt", "gb");
    const shield = abilitiesOf(s, "user", "mor").find((a) => (a.targets || []).some((t) => t.id === "gb"));
    expect(shield).toBeTruthy();
    const after = passUntil(dispatchAction(s, shield), 0);
    expect(after.players.user.battlefield.some((p) => p.id === "gb")).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "gb").damageMarked || 0).toBe(0);
  });

  it("⭐ cycling at an opponent's end step: Lonely Sandbar is offered and draws a card", () => {
    const s = duel({ user: [P("i1", ISLAND, "user")], userHand: [C("h-ls", LONELY_SANDBAR)], userLib: [C("l1", GRIZZLY_BEARS)] }, OPP_END);
    const cycle = offered(s, "user", "cycle").find((a) => a.cardId === "h-ls");
    expect(cycle).toBeTruthy();
    const after = passUntil(dispatchAction(s, cycle), 0);
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["l1"]);
  });

  it("⭐ crew on an opponent's turn: Sleek Schooner is offered (CR 702.122a has no timing instruction)", () => {
    const s = duel({ user: [P("ss", SLEEK_SCHOONER, "user"), P("gb", GRIZZLY_BEARS, "user")] }, { active: "ai", phase: "combat", step: "beginning-of-combat", holder: "user" });
    expect(offered(s, "user", "crew-vehicle").map((a) => a.permanentId)).toEqual(["ss"]);
  });

  it("⭐ a discard-this-card ability from hand on an opponent's turn: Otawara's channel is offered on the AI's creature", () => {
    const s = duel({ user: lands("ui", ISLAND, 4, "user"), userHand: [C("h-ota", OTAWARA)], ai: [P("ahg", HILL_GIANT, "ai")] }, OPP_END);
    expect(offered(s, "user", "discard-ability").some((a) => a.cardId === "h-ota" && (a.targets || []).some((t) => t.id === "ahg"))).toBe(true);
  });

  it("⭐ a printed attach with no timing instruction is offered on an opponent's turn (Cranial Plating's {B}{B}, Detainment Spell's {1}{W}); the keyword Equip on the same Plating is not", () => {
    const s = duel({
      user: [P("cp", CRANIAL_PLATING, "user"), P("ds", DETAINMENT_SPELL, "user", { attachedTo: "ahg" }), P("gb", GRIZZLY_BEARS, "user"), ...lands("usw", SWAMP, 2, "user"), ...lands("upl", PLAINS, 2, "user")],
      ai: [P("ahg", HILL_GIANT, "ai", { attachments: ["ds"] }), P("agb", GRIZZLY_BEARS, "ai")],
    }, OPP_END);
    const plating = abilitiesOf(s, "user", "cp");
    expect(plating.length).toBeGreaterThan(0);
    expect(plating.every((a) => a.cost.B === 2)).toBe(true); // the {B}{B} attach — never Equip {1}
    expect(abilitiesOf(s, "user", "ds").some((a) => (a.targets || []).some((t) => t.id === "agb"))).toBe(true);
  });

  it("⭐ \"Activate only during your turn\" opens on every step of the controller's turn: Vona in its own beginning of combat, Steadfast Unicorn in its own upkeep", () => {
    const vona = duel({ user: [P("vona", VONA, "user")], ai: [P("ahg", HILL_GIANT, "ai")] }, OWN_BOC);
    expect(abilitiesOf(vona, "user", "vona").some((a) => (a.targets || []).some((t) => t.id === "ahg"))).toBe(true);
    const unicorn = duel({ user: [P("su", STEADFAST_UNICORN, "user"), ...lands("upl", PLAINS, 4, "user")] }, OWN_UPKEEP);
    expect(abilitiesOf(unicorn, "user", "su").length).toBe(1);
  });

  it("⭐ \"Activate only during your turn, before attackers are declared\" opens in the controller's upkeep (Capricious Sorcerer)", () => {
    const s = duel({ user: [P("cs", CAPRICIOUS_SORCERER, "user")], ai: [P("ahg", HILL_GIANT, "ai")] }, OWN_UPKEEP);
    expect(abilitiesOf(s, "user", "cs").length).toBeGreaterThan(0);
  });

  it("⭐ the Academy asks the person: at an opponent's end step with Viscera Seer and a creature, the beginner's decision is an ask that lists the sacrifice", () => {
    const s = duel({ user: [P("vs", VISCERA_SEER, "user"), P("gb", GRIZZLY_BEARS, "user")] }, OPP_END);
    const decision = makeDecision(s, "user", legalActionsForPlayer(s, "user"), { difficulty: "beginner" });
    expect(decision.kind).toBe("ask");
    expect(decision.options.some((o) => o.kind === "activate-ability" && o.permanentId === "vs")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the timing restrictions stay closed (controls — CR 602.5d, 606.3, 702.6a, 117.1d)", () => {
  const notOwnMain = [["an opponent's turn", OPP_MAIN], ["its own beginning of combat", OWN_BOC], ["its own upkeep", OWN_UPKEEP]];

  it("\"Activate only as a sorcery\" (Pillardrop Warden): own main with an empty stack only", () => {
    const board = { user: [P("pw", PILLARDROP_WARDEN, "user"), ...lands("um", MOUNTAIN, 2, "user")], userGy: [C("g-bolt", LIGHTNING_BOLT)] };
    expect(abilitiesOf(duel(board), "user", "pw").length).toBe(1);
    for (const [, at] of notOwnMain) expect(abilitiesOf(duel(board, at), "user", "pw")).toEqual([]);
    const withStack = { ...duel(board), stack: [{ id: "so-1", kind: "triggered-ability", controller: "ai", source: { name: "Grizzly Bears" }, payload: {} }] };
    expect(abilitiesOf(withStack, "user", "pw")).toEqual([]);
  });

  it("Equip (Bonesplitter, CR 702.6a): own main with an empty stack only", () => {
    const board = { user: [P("bs", BONESPLITTER, "user"), P("gb", GRIZZLY_BEARS, "user"), P("um1", MOUNTAIN, "user")] };
    expect(abilitiesOf(duel(board), "user", "bs").length).toBe(1);
    for (const [, at] of [...notOwnMain, ["an opponent's end step", OPP_END]]) expect(abilitiesOf(duel(board, at), "user", "bs")).toEqual([]);
  });

  it("loyalty abilities (Liliana of the Veil, CR 606.3): own main with an empty stack only", () => {
    const board = { user: [P("lotv", LILIANA_OF_THE_VEIL, "user", { counters: { loyalty: 3 } })], ai: [P("agb", GRIZZLY_BEARS, "ai")] };
    expect(offered(duel(board), "user", "activate-loyalty").length).toBeGreaterThan(0);
    for (const [, at] of [...notOwnMain, ["an opponent's end step", OPP_END]]) expect(offered(duel(board, at), "user", "activate-loyalty")).toEqual([]);
  });

  it("\"Activate only during your turn\" is not offered on an opponent's turn (Vona, Steadfast Unicorn)", () => {
    const board = { user: [P("vona", VONA, "user"), P("su", STEADFAST_UNICORN, "user"), ...lands("upl", PLAINS, 4, "user")], ai: [P("ahg", HILL_GIANT, "ai")] };
    for (const at of [OPP_MAIN, OPP_END]) {
      expect(abilitiesOf(duel(board, at), "user", "vona")).toEqual([]);
      expect(abilitiesOf(duel(board, at), "user", "su")).toEqual([]);
    }
  });

  it("\"…before attackers are declared\" is not offered in the controller's beginning of combat, postcombat main, or an opponent's turn (Capricious Sorcerer)", () => {
    const board = { user: [P("cs", CAPRICIOUS_SORCERER, "user")], ai: [P("ahg", HILL_GIANT, "ai")] };
    expect(abilitiesOf(duel(board), "user", "cs").length).toBeGreaterThan(0);
    for (const at of [OWN_BOC, OWN_POSTCOMBAT, OPP_MAIN]) expect(abilitiesOf(duel(board, at), "user", "cs")).toEqual([]);
  });

  it("\"Activate only during the end of combat step\" (Desert): offered in that step on either side's turn, never in declare blockers", () => {
    const attacking = (active, step) => {
      const s = duel({ user: [P("des", DESERT, "user")], ai: [P("ahg", HILL_GIANT, "ai", { tapped: true })] }, { active, phase: "combat", step, holder: "user" });
      return { ...s, combat: { attackers: [{ permanentId: "ahg", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    };
    expect(abilitiesOf(attacking("ai", "end-of-combat"), "user", "des").length).toBe(1);
    expect(abilitiesOf(attacking("ai", "declare-blockers"), "user", "des")).toEqual([]);
  });

  it("transmute from hand is sorcery-speed (Tolaria West, CR 702.53a): not offered at an opponent's end step", () => {
    const board = { user: lands("ui", ISLAND, 3, "user"), userHand: [C("h-tw", TOLARIA_WEST)] };
    expect(offered(duel(board), "user", "discard-ability").length).toBe(1);
    expect(offered(duel(board, OPP_END), "user", "discard-ability")).toEqual([]);
  });

  it("mana abilities are unchanged: Llanowar Elves taps for mana in its own main phase and is not offered on an opponent's turn", () => {
    const board = { user: [P("le", LLANOWAR_ELVES, "user")] };
    expect(offered(duel(board), "user", "tap-for-mana").length).toBe(1);
    expect(offered(duel(board, OPP_END), "user", "tap-for-mana")).toEqual([]);
  });

  it("nothing is offered during the block declaration (CR 509.1): the defending player with Viscera Seer, Frozen Shade and Kessig Wolf Run is offered blocks and the pass only", () => {
    const s0 = duel({
      user: [P("hg", HILL_GIANT, "user")],
      ai: [P("vs", VISCERA_SEER, "ai"), P("afs", FROZEN_SHADE, "ai"), P("kwr", KESSIG_WOLF_RUN, "ai"), P("am1", MOUNTAIN, "ai"), P("af1", FOREST, "ai"), ...lands("asw", SWAMP, 2, "ai")],
    }, { phase: "combat", step: "declare-attackers" });
    let s = toBlockers(attackWith(s0, "user", ["hg"]));
    for (let g = 0; g < 4 && s.priorityHolder !== "ai"; g++) s = pass(s);
    expect(s.combat.blockDeclarationOpen).toBe(true);
    expect(s.priorityHolder).toBe("ai");
    expect([...new Set(legalActionsForPlayer(s, "ai").map((a) => a.kind))].sort()).toEqual(["declare-blocker", "pass-priority"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Grand Abolisher's activation half (CR 604.2) — the old window enforced it by accident; the offer enforces it now", () => {
  it("⭐ during the Abolisher controller's turn its opponent is offered no activation — not even the combat-role archer the old combat window offered", () => {
    const s = duel({
      user: [P("ga", GRAND_ABOLISHER, "user"), P("hg", HILL_GIANT, "user", { tapped: true })],
      ai: [P("da", DAVENANT_ARCHER, "ai"), P("vs", VISCERA_SEER, "ai"), P("agb", GRIZZLY_BEARS, "ai")],
    }, { active: "user", phase: "combat", step: "declare-blockers", holder: "ai" });
    const inCombat = { ...s, combat: { attackers: [{ permanentId: "hg", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(offered(inCombat, "ai", "activate-ability")).toEqual([]);
  });

  it("on the opponent's own turn the Abolisher restricts nothing: its sacrifice outlet is offered", () => {
    const s = duel({ user: [P("ga", GRAND_ABOLISHER, "user")], ai: [P("vs", VISCERA_SEER, "ai"), P("agb", GRIZZLY_BEARS, "ai")] }, { active: "ai" });
    expect(abilitiesOf(s, "ai", "vs").length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the default AI keeps the windows it decided in before (offered more, it takes nothing new)", () => {
  it("Archivist: the AI draws with it in its own main phase, and passes with it untapped at its opponent's end step although the draw is offered there", () => {
    const own = duel({ ai: [P("arch", ARCHIVIST, "ai")], aiLib: [C("l1", GRIZZLY_BEARS)] }, { active: "ai" });
    expect(pickAction(own, "ai", legalActionsForPlayer(own, "ai"))).toMatchObject({ kind: "activate-ability", permanentId: "arch" });
    const oppEnd = duel({ ai: [P("arch", ARCHIVIST, "ai")], aiLib: [C("l1", GRIZZLY_BEARS)] }, { active: "user", phase: "ending", step: "end", holder: "ai" });
    expect(pickAction(oppEnd, "ai", legalActionsForPlayer(oppEnd, "ai"))).toMatchObject({ kind: "pass-priority" });
  });

  it("a zero-cost crew: the AI crews in its own main phase and not on its opponent's turn", () => {
    const board = { ai: [P("ss", SLEEK_SCHOONER, "ai"), P("agb", GRIZZLY_BEARS, "ai", { summoningSick: true })] };
    const own = duel(board, { active: "ai" });
    expect(pickAction(own, "ai", legalActionsForPlayer(own, "ai"))).toMatchObject({ kind: "crew-vehicle" });
    const opp = duel(board, { active: "user", phase: "combat", step: "beginning-of-combat", holder: "ai" });
    expect(pickAction(opp, "ai", legalActionsForPlayer(opp, "ai"))).toMatchObject({ kind: "pass-priority" });
  });

  it("the combat-role archer still fires in a combat step on its opponent's turn (the window it had)", () => {
    const s = duel({ user: [P("hg", HILL_GIANT, "user", { tapped: true })], ai: [P("da", DAVENANT_ARCHER, "ai")] }, { active: "user", phase: "combat", step: "declare-blockers", holder: "ai" });
    const inCombat = { ...s, combat: { attackers: [{ permanentId: "hg", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(pickAction(inCombat, "ai", legalActionsForPlayer(inCombat, "ai"))).toMatchObject({ kind: "activate-ability", permanentId: "da" });
  });
});
