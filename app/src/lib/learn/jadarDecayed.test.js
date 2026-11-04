/**
 * jadarDecayed.test.js — JADAR, GHOULCALLER OF NEPHALIA (the play-weighted program, EDHREC #1334) and DECAYED (CR 702.147a), with the
 * eight cards whose only unread part was a token "with decayed": Crowded Crypt, Flip the Switch, Rotten Reunion, Startle, Hobbling
 * Zombie, Falcon Abomination, Ghoulcaller's Harvest, No Way Out.
 *
 *   "At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with
 *    decayed. (It can't block. When it attacks, sacrifice it at end of combat.)"
 *
 * Decayed is a static ability and a triggered ability (CR 702.147a — the bundled ruling: "'Decayed' means 'This creature can't block'
 * and 'When this creature attacks, sacrifice it at end of combat.'"). Both read the keyword as it is now: printed, granted or a
 * counter, and gone after a newer "loses all abilities" (CR 613.1f) — a Turn to Frog'd Zombie may block, and one that loses decayed
 * before it attacks isn't sacrificed; one that attacked with it is sacrificed at end of combat whatever it has by then (the ruling:
 * "Once a creature with decayed attacks, it will be sacrificed at end of combat, even if it no longer has decayed at that time"). It
 * doesn't grant haste and makes no attack requirement (the rulings). Jadar's "if" is an intervening "if" (CR 603.4). Witnessed through
 * real game states, for the person and the default AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, playerProtectedFromEverything } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, nextStep, passPriority, raiseTriggerTargetChoice, settleTriggerTargetChoice } from "./gameEngine.js";
import { autoPickDiscardCandidate, autoPickSoftCounterPay, resolveDiscardChoice, resolveOptionalChoice, resolveSoftCounterChoice } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const JADAR = {"name":"Jadar, Ghoulcaller of Nephalia","type":"Legendary Creature — Human Wizard","mana":"{1}{B}","oracle":"At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1334
const FROG = {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8993
const CRYPT = {"name":"Crowded Crypt","type":"Artifact","mana":"{2}{B}","oracle":"{T}: Add {B}.\nWhenever a creature you control dies, put a corpse counter on this artifact.\n{4}{B}{B}, {T}, Sacrifice this artifact: Create a 2/2 black Zombie creature token with decayed for each corpse counter on this artifact. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2428
const FLIP = {"name":"Flip the Switch","type":"Instant","mana":"{2}{U}","oracle":"Counter target spell unless its controller pays {4}. Create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #12958
const REUNION = {"name":"Rotten Reunion","type":"Instant","mana":"{B}","oracle":"Exile up to one target card from a graveyard. Create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)\nFlashback {1}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Flashback"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #14141
const STARTLE = {"name":"Startle","type":"Instant","mana":"{1}{U}","oracle":"Target creature gets -2/-0 until end of turn. Create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)\nDraw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #15400
const HOBBLING = {"name":"Hobbling Zombie","type":"Creature — Zombie","mana":"{2}{B}","oracle":"Deathtouch\nWhen this creature dies, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Deathtouch"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #16544
const FALCON = {"name":"Falcon Abomination","type":"Creature — Zombie Bird","mana":"{2}{U}","oracle":"Flying\nWhen this creature enters, create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #18809
const HARVEST = {"name":"Ghoulcaller's Harvest","type":"Sorcery","mana":"{B}{G}","oracle":"Create X 2/2 black Zombie creature tokens with decayed, where X is half the number of creature cards in your graveyard, rounded up. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)\nFlashback {3}{B}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Flashback"],"colors":["B","G"],"colorIdentity":["B","G"]}; // EDHREC #19502
const NOWAYOUT = {"name":"No Way Out","type":"Sorcery","mana":"{2}{B}","oracle":"Target opponent discards two cards. You create a 2/2 black Zombie creature token with decayed. (It can't block. When it attacks, sacrifice it at end of combat.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #19775
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","oracle":"Draw two cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6263
// The token Jadar makes, as the engine mints it (createPermanent of the minted card) — a test board's already-made Zombie.
const ZOMBIE = { name: "Zombie", type: "Token Creature — Zombie", mana: "", oracle: "Decayed", power: 2, toughness: 2, keywords: ["Decayed"], colors: ["B"], token: true };
const BOMBARDMENT = {"name":"Goblin Bombardment","type":"Enchantment","mana":"{1}{R}","oracle":"Sacrifice a creature: This enchantment deals 1 damage to any target.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #463
const TURN_AGAINST = {"name":"Turn Against","type":"Instant","mana":"{4}{R}","oracle":"Devoid (This card has no color.)\nGain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Devoid"],"colors":[],"colorIdentity":["R"]}; // EDHREC #25094
const RING = {"name":"The One Ring","type":"Legendary Artifact","mana":"{4}","oracle":"Indestructible\nWhen The One Ring enters, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #95
const THORN = {"name":"Thorn Elemental","type":"Creature — Elemental","mana":"{5}{G}{G}","oracle":"You may have this creature assign its combat damage as though it weren't blocked.","layout":"normal","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #18883
const THICKET = {"name":"Thicket Basilisk","type":"Creature — Basilisk","mana":"{3}{G}{G}","oracle":"Whenever this creature blocks or becomes blocked by a non-Wall creature, destroy that creature at end of combat.","layout":"normal","cmc":5,"power":"2","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #28615

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));
/** Heads-up, `active`'s turn 5 precombat main: `boards`, `hands` (ids `<seat>-h<i>`), `graveyards` per seat; libraries of Islands. */
function table({ active = "user", boards = {}, hands = {}, graveyards = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, battlefield: boards[pid] || [], hand: (hands[pid] || []).map((c, i) => ({ ...c, id: `${pid}-h${i}` })),
      graveyard: (graveyards[pid] || []).map((c, i) => ({ ...c, id: `${pid}-g${i}` })), exile: [],
      library: Array.from({ length: 10 }, (_, i) => ({ ...ISLAND, id: `${pid}-l${i}` })) };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.token);
const describe1 = (s, p) => `${p.card.name} ${p.card.power}/${p.card.toughness} ${(p.card.colors || []).join("")}${permanentHasKeyword(s, p.id, "Decayed") ? " decayed" : ""}`;
/**
 * Walk the rest of the active player's turn. `attacks` — attacker ids declared in the (first) declare attackers step; `blocks` —
 * { blockerId: attackerId } declared by the defender; `beforeBlocks(s)` and `afterAttack(s)` act once (the defender, holding priority
 * in the declare attackers step once the attack is declared; the active player, with the attack triggers on the stack). Records the blockers offered to the defender. Each pause is
 * settled as the session settles it.
 */
function walk(s0, { attacks = [], blocks = {}, beforeBlocks = null, afterAttack = null, afterTriggers = null, afterDamage = null, watch = null, targetPick = (rows) => rows[0] } = {}) {
  let s = s0;
  const me = s0.activePlayer;
  const foe = Object.keys(s0.players).find((p) => p !== me);
  const declared = new Set();
  const blocked = new Set();
  let offeredBlockers = null;
  let pre = false;
  let post = false;
  let stole = false;
  let damaged = false;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 600 && s.turn === s0.turn; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc?.kind === "discard") { s = fin(resolveDiscardChoice(s, autoPickDiscardCandidate(s, pc))); continue; }
    if (pc?.kind === "soft-counter") { s = fin(resolveSoftCounterChoice(s, autoPickSoftCounterPay(s, pc))); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, targetPick(q.pendingChoice.candidates, q).id); continue; }
    if (s.step === "declare-attackers" && s.priorityHolder === me) {
      const id = attacks.find((x) => !declared.has(x) && offered(s, me, "declare-attacker").some((a) => a.permanentId === x));
      if (id) { declared.add(id); s = dispatchAction(s, offered(s, me, "declare-attacker").find((a) => a.permanentId === id)); continue; }
      if (afterAttack && !post && s.stack.length) { post = true; s = afterAttack(s); continue; }
    }
    if (beforeBlocks && !pre && s.step === "declare-attackers" && s.priorityHolder === foe && (s.combat?.attackers || []).length) { pre = true; s = beforeBlocks(s); continue; }
    // `afterTriggers(s)` — the defender, holding priority in the declare attackers step once the attack triggers have resolved.
    if (afterTriggers && !stole && s.step === "declare-attackers" && s.priorityHolder === foe && (s.combat?.attackers || []).length && !s.stack.length) { stole = true; s = afterTriggers(s); continue; }
    // `afterDamage(s)` — the active player, holding priority in the combat damage step after the damage (CR 510.3).
    if (afterDamage && !damaged && s.step === "combat-damage" && s.priorityHolder === me && !s.stack.length) { damaged = true; s = afterDamage(s); continue; }
    if (watch) watch(s);
    if (s.step === "declare-blockers" && s.priorityHolder === foe && s.combat?.blockDeclarationOpen !== false) {
      if (offeredBlockers == null) offeredBlockers = [...new Set(offered(s, foe, "declare-blocker").map((a) => a.permanentId))].sort();
      const next = Object.entries(blocks).find(([id]) => !blocked.has(id) && offered(s, foe, "declare-blocker").some((a) => a.permanentId === id));
      if (next) { blocked.add(next[0]); s = dispatchAction(s, offered(s, foe, "declare-blocker").find((a) => a.permanentId === next[0] && a.attackerId === next[1])); continue; }
    }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s, offeredBlockers };
}
const cast = (s, seat, name, targetId) => {
  const act = legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
  expect(act, `${name} is offered${targetId == null ? "" : ` at ${targetId}`}`).toBeTruthy();
  return dispatchAction(s, act);
};
/** Resolve the stack (and every pause) without leaving the step. */
function settle(s0) {
  let s = s0;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 100; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc?.kind === "discard") { s = fin(resolveDiscardChoice(s, autoPickDiscardCandidate(s, pc))); continue; }
    if (pc?.kind === "soft-counter") { s = fin(resolveSoftCounterChoice(s, autoPickSoftCounterPay(s, pc))); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, q.pendingChoice.candidates[0].id); continue; }
    if (!s.stack.length && !(s.pendingTriggers || []).length) break;
    s = passPriority(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return s;
}

describe("the cards", () => {
  it("⭐ Jadar: every line plays", () => {
    expect(classifyCard(JADAR)).toBe("native-trigger");
  });
  it("⭐ the eight whose only unread part was a decayed token", () => {
    const tiers = Object.fromEntries([CRYPT, FLIP, REUNION, STARTLE, HOBBLING, FALCON, HARVEST, NOWAYOUT].map((c) => [c.name, classifyCard(c)]));
    expect(tiers).toEqual({
      "Crowded Crypt": "native-mana", "Flip the Switch": "native-spell", "Rotten Reunion": "native-spell", "Startle": "native-spell",
      "Hobbling Zombie": "native-trigger", "Falcon Abomination": "native-trigger", "Ghoulcaller's Harvest": "native-spell", "No Way Out": "native-spell",
    });
  });
});

describe("Jadar's end step", () => {
  it("⭐ no decayed creature: a 2/2 black Zombie token with decayed", () => {
    const { s } = walk(table({ boards: { user: [on("user", "jadar", JADAR)] } }));
    expect(tokensOf(s, "user").map((p) => describe1(s, p))).toEqual(["Zombie 2/2 B decayed"]);
  });
  it("⭐ the AI's Jadar: the same token, on the AI's side", () => {
    const { s } = walk(table({ active: "ai", boards: { ai: [on("ai", "jadar", JADAR)] } }));
    expect({ ai: tokensOf(s, "ai").map((p) => describe1(s, p)), user: tokensOf(s, "user").length }).toEqual({ ai: ["Zombie 2/2 B decayed"], user: 0 });
  });
  it("control: a decayed Zombie already there — no second token", () => {
    const { s } = walk(table({ boards: { user: [on("user", "jadar", JADAR), on("user", "z0", ZOMBIE)] } }));
    expect(tokensOf(s, "user").length).toBe(1);
  });
});

describe("decayed — can't block", () => {
  it("⭐ the AI's Bears attack: the person's Jadar may block, the decayed Zombie may not", () => {
    const { offeredBlockers } = walk(table({ active: "ai", boards: { ai: [on("ai", "bears", BEARS)], user: [on("user", "jadar", JADAR), on("user", "z0", ZOMBIE)] } }), { attacks: ["bears"] });
    expect(offeredBlockers).toEqual(["jadar"]);
  });
  it("control (CR 613.1f): Turn to Frog on the Zombie first (it loses all abilities) — now it may block", () => {
    const frog = (st) => settle(cast(st, "user", "Turn to Frog", "z0"));
    const { offeredBlockers } = walk(table({ active: "ai", boards: { ai: [on("ai", "bears", BEARS)], user: [on("user", "z0", ZOMBIE), ...many("user", "is", ISLAND, 2)] }, hands: { user: [FROG] } }), { attacks: ["bears"], beforeBlocks: frog });
    expect(offeredBlockers).toEqual(["z0"]);
  });
});

describe("decayed — sacrificed at end of combat once it attacks", () => {
  it("⭐ the person's Zombie attacks: 2 damage, then it is sacrificed at end of combat", () => {
    const { s } = walk(table({ boards: { user: [on("user", "z0", ZOMBIE)] } }), { attacks: ["z0"] });
    expect({ ai: s.players.ai.life, zombie: s.players.user.battlefield.some((p) => p.id === "z0") }).toEqual({ ai: 38, zombie: false });
  });
  it("⭐ it loses decayed after attacking (Turn to Frog with its trigger on the stack): sacrificed all the same — the ruling", () => {
    const frog = (st) => cast(st, "user", "Turn to Frog", "z0");
    const { s } = walk(table({ boards: { user: [on("user", "z0", ZOMBIE), ...many("user", "is", ISLAND, 2)] }, hands: { user: [FROG] } }), { attacks: ["z0"], afterAttack: frog });
    expect({ ai: s.players.ai.life, zombie: s.players.user.battlefield.some((p) => p.id === "z0") }).toEqual({ ai: 39, zombie: false });
  });
  it("control (CR 613.1f): it loses decayed before it attacks (Turn to Frog in the main phase) — it attacks as a 1/1 Frog and survives", () => {
    const s0 = settle(cast(table({ boards: { user: [on("user", "z0", ZOMBIE), ...many("user", "is", ISLAND, 2)] }, hands: { user: [FROG] } }), "user", "Turn to Frog", "z0"));
    const { s } = walk(s0, { attacks: ["z0"] });
    expect({ ai: s.players.ai.life, zombie: s.players.user.battlefield.some((p) => p.id === "z0") }).toEqual({ ai: 39, zombie: true });
  });
  it("control: a Zombie that doesn't attack stays", () => {
    const { s } = walk(table({ boards: { user: [on("user", "z0", ZOMBIE)] } }));
    expect(s.players.user.battlefield.some((p) => p.id === "z0")).toBe(true);
  });
  // The sacrifice is a delayed triggered ability of the attack trigger (CR 702.147a, 603.7): it triggers as the end of combat step
  // begins (CR 511.2) and goes on the stack. In the combat damage step after the damage, the active player gets priority with the
  // Zombie still on the battlefield (CR 510.3) — the window a sacrifice outlet uses.
  const bombardTable = () => table({ boards: { user: [on("user", "z0", ZOMBIE), on("user", "bomb", BOMBARDMENT)] } });
  it("⭐ after combat damage the person may sacrifice the attacking Zombie to Goblin Bombardment (CR 510.3): the AI on 37", () => {
    let offered = null;
    const sacrifice = (st) => {
      const a = legalActionsForPlayer(st, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "bomb" && x.sacCreatureId === "z0" && (x.targets || []).some((t) => t.id === "ai"));
      offered = !!a;
      return a ? settle(dispatchAction(st, a)) : st;
    };
    const { s } = walk(bombardTable(), { attacks: ["z0"], afterDamage: sacrifice });
    expect({ offered, ai: s.players.ai.life, zombie: s.players.user.battlefield.some((p) => p.id === "z0") }).toEqual({ offered: true, ai: 37, zombie: false });
  });
  it("⭐ declined: the Zombie is still there in the end of combat step, its sacrifice on the stack — then it is gone (CR 511.2)", () => {
    let atEnd = null;
    const watch = (st) => {
      if (atEnd || st.step !== "end-of-combat" || !st.priorityHolder) return;
      atEnd = { zombie: st.players.user.battlefield.some((p) => p.id === "z0"), stack: st.stack.map((o) => o.source?.name ?? null) };
    };
    const { s } = walk(bombardTable(), { attacks: ["z0"], watch });
    expect({ atEnd, ai: s.players.ai.life, zombie: s.players.user.battlefield.some((p) => p.id === "z0"), yard: s.players.user.graveyard.length })
      .toEqual({ atEnd: { zombie: true, stack: ["Zombie"] }, ai: 38, zombie: false, yard: 0 });
  });
  // A creature an opponent gains control of after it attacked is removed from combat (CR 506.4); the sacrifice is still the attacking
  // player's delayed ability (CR 603.7e), and a player can't sacrifice a permanent they don't control (CR 701.21a).
  const steal = (st) => settle(cast(st, "ai", "Turn Against", "z0"));
  const stealTable = (extra = []) => table({ boards: { user: [on("user", "z0", ZOMBIE), ...extra], ai: many("ai", "mt", MOUNTAIN, 5) }, hands: { ai: [TURN_AGAINST] } });
  it("⭐ stolen after its attack trigger resolved (Turn Against): it survives the end of combat under the AI, and comes back after cleanup", () => {
    let afterCombat = null;
    const watch = (st) => {
      if (afterCombat || st.phase !== "postcombat-main" || !st.priorityHolder) return;
      afterCombat = { aiHas: st.players.ai.battlefield.some((p) => p.id === "z0"), queued: (st.endOfCombatEffects || []).length };
    };
    const { s } = walk(stealTable([on("user", "bears", BEARS)]), { attacks: ["z0", "bears"], afterTriggers: steal, watch });
    expect({ afterCombat, userHas: s.players.user.battlefield.some((p) => p.id === "z0"), ai: s.players.ai.life })
      .toEqual({ afterCombat: { aiHas: true, queued: 0 }, userHas: true, ai: 38 });
  });
  it("⭐ the lone attacker stolen: no sacrifice is left queued after its combat", () => {
    let afterCombat = null;
    const watch = (st) => {
      if (afterCombat || st.phase !== "postcombat-main" || !st.priorityHolder) return;
      afterCombat = { aiHas: st.players.ai.battlefield.some((p) => p.id === "z0"), queued: (st.endOfCombatEffects || []).length };
    };
    const { s } = walk(stealTable(), { attacks: ["z0"], afterTriggers: steal, watch });
    expect({ afterCombat, userHas: s.players.user.battlefield.some((p) => p.id === "z0"), queued: (s.endOfCombatEffects || []).length })
      .toEqual({ afterCombat: { aiHas: true, queued: 0 }, userHas: true, queued: 0 });
  });
});

// After the prevented-combat-damage fix (9cc40f13): a player protected from everything is dealt no combat damage (CR 702.16j, 615.6),
// and the end-of-combat delayed abilities still go on the stack and resolve (CR 511.2, 603.7) — they are not combat damage.
describe("the end of combat beside a player protected from everything (The One Ring)", () => {
  // `seat` casts The One Ring in its turn-5 main phase (protection from everything until its next turn); then it is the other seat's
  // turn 6 precombat main, with `board` for that seat.
  function ringThen(seat, board) {
    const other = seat === "user" ? "ai" : "user";
    let s = table({ active: seat, boards: { [seat]: many(seat, "is", ISLAND, 4) }, hands: { [seat]: [RING] } });
    s = settle(cast(s, seat, "The One Ring"));
    expect(playerProtectedFromEverything(s, seat)).toBe(true);
    return { ...s, turn: 6, activePlayer: other, priorityHolder: other, phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...s.players, [other]: { ...s.players[other], battlefield: [...s.players[other].battlefield, ...board] } } };
  }
  const damageTo = (s, pid) => (s.log || []).filter((e) => e.kind === "combat-damage-player" && e.defender === pid && e.turn === 6);
  it("⭐ the AI's decayed Zombie attacks the person under The One Ring: no damage, no combat-damage-player event — and it is still sacrificed at end of combat", () => {
    let afterDamage = null;
    const watch = (st) => { if (!afterDamage && st.step === "combat-damage" && st.priorityHolder) afterDamage = { zombie: st.players.ai.battlefield.some((p) => p.id === "z0"), user: st.players.user.life }; };
    const { s } = walk(ringThen("user", [on("ai", "z0", ZOMBIE)]), { attacks: ["z0"], watch });
    expect({ afterDamage, events: damageTo(s, "user").length, user: s.players.user.life, zombie: s.players.ai.battlefield.some((p) => p.id === "z0"),
      sacrificed: (s.log || []).some((e) => e.kind === "end-of-combat-sacrifice" && e.target === "z0") })
      .toEqual({ afterDamage: { zombie: true, user: 40 }, events: 0, user: 40, zombie: false, sacrificed: true });
  });
  it("⭐ the person's Thorn Elemental, blocked by the AI's Thicket Basilisk, attacks the AI under The One Ring: it assigns to the Basilisk (master's rule) — and is still destroyed at end of combat", () => {
    let afterDamage = null;
    const watch = (st) => {
      if (afterDamage || st.step !== "combat-damage" || !st.priorityHolder) return;
      afterDamage = { thorn: st.players.user.battlefield.some((p) => p.id === "te"), basilisk: st.players.ai.battlefield.some((p) => p.id === "tb"), ai: st.players.ai.life };
    };
    const s0 = ringThen("ai", [on("user", "te", THORN)]);
    const s1 = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [...s0.players.ai.battlefield, on("ai", "tb", THICKET)] } } };
    const { s } = walk(s1, { attacks: ["te"], blocks: { tb: "te" }, watch });
    expect({ afterDamage, events: damageTo(s, "ai").length, ai: s.players.ai.life, thorn: s.players.user.battlefield.some((p) => p.id === "te"),
      yard: s.players.user.graveyard.map((c) => c.name), destroyed: (s.log || []).some((e) => e.kind === "end-of-combat-destroy" && e.target === "te") })
      .toEqual({ afterDamage: { thorn: true, basilisk: false, ai: 40 }, events: 0, ai: 40, thorn: false, yard: ["Thorn Elemental"], destroyed: true });
  });
});

describe("the eight — each makes its decayed Zombie and does the rest of its text", () => {
  const zombies = (s, pid = "user") => tokensOf(s, pid).filter((p) => p.card.name === "Zombie").map((p) => describe1(s, p));
  it("⭐ Falcon Abomination enters: a decayed Zombie", () => {
    const s = settle(cast(table({ boards: { user: many("user", "is", ISLAND, 3) }, hands: { user: [FALCON] } }), "user", "Falcon Abomination"));
    expect({ zombies: zombies(s), falcon: s.players.user.battlefield.some((p) => p.card?.name === "Falcon Abomination") }).toEqual({ zombies: ["Zombie 2/2 B decayed"], falcon: true });
  });
  it("⭐ Hobbling Zombie dies (Bolted): a decayed Zombie", () => {
    const s = settle(cast(table({ boards: { user: [on("user", "hob", HOBBLING), on("user", "mt", MOUNTAIN)] }, hands: { user: [BOLT] } }), "user", "Lightning Bolt", "hob"));
    expect({ zombies: zombies(s), yard: s.players.user.graveyard.map((c) => c.name).sort() }).toEqual({ zombies: ["Zombie 2/2 B decayed"], yard: ["Hobbling Zombie", "Lightning Bolt"] });
  });
  it("⭐ Startle on the AI's Hill Giant: 1/3 until end of turn, a decayed Zombie, a card drawn", () => {
    const s = settle(cast(table({ boards: { user: many("user", "is", ISLAND, 2), ai: [on("ai", "giant", GIANT)] }, hands: { user: [STARTLE] } }), "user", "Startle", "giant"));
    const giant = s.players.ai.battlefield.find((p) => p.id === "giant");
    expect({ zombies: zombies(s), hand: s.players.user.hand.length, giantPower: creaturePower(giant, s) }).toEqual({ zombies: ["Zombie 2/2 B decayed"], hand: 1, giantPower: 1 });
  });
  it("⭐ Rotten Reunion: the AI's graveyard Hill Giant exiled, a decayed Zombie", () => {
    const s = settle(cast(table({ boards: { user: [on("user", "sw", SWAMP)] }, hands: { user: [REUNION] }, graveyards: { ai: [GIANT] } }), "user", "Rotten Reunion", "ai-g0"));
    expect({ zombies: zombies(s), aiExile: s.players.ai.exile.map((c) => c.name), aiYard: s.players.ai.graveyard.length }).toEqual({ zombies: ["Zombie 2/2 B decayed"], aiExile: ["Hill Giant"], aiYard: 0 });
  });
  // CR 601.2a, 601.2c — a spell cast from a graveyard is on the stack before its targets are announced, so its own card is no
  // longer "a card from a graveyard": the flashback is offered with no target ("up to one") or at another graveyard card.
  it("⭐ Rotten Reunion's flashback never targets itself: alone in the graveyard — only the no-target cast; beside the AI's Hill Giant — the Giant or none", () => {
    const flashbacks = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "cast-spell" && a.name === "Rotten Reunion" && a.flashbackCast);
    const ids = (st) => flashbacks(st).map((a) => (a.targets || []).map((t) => t.id).join(",")).sort();
    const alone = table({ boards: { user: many("user", "sw", SWAMP, 2) }, graveyards: { user: [REUNION] } });
    const beside = table({ boards: { user: many("user", "sw", SWAMP, 2) }, graveyards: { user: [REUNION], ai: [GIANT] } });
    expect({ alone: ids(alone), beside: ids(beside) }).toEqual({ alone: [""], beside: ["", "ai-g0"] });
    const s = settle(dispatchAction(alone, flashbacks(alone)[0]));
    expect({ zombies: zombies(s), exile: s.players.user.exile.map((c) => c.name), yard: s.players.user.graveyard.length }).toEqual({ zombies: ["Zombie 2/2 B decayed"], exile: ["Rotten Reunion"], yard: 0 });
  });
  it("⭐ No Way Out: the AI discards two, the person gets a decayed Zombie", () => {
    const s = settle(cast(table({ boards: { user: many("user", "sw", SWAMP, 3) }, hands: { user: [NOWAYOUT], ai: [BEARS, GIANT, BOLT] } }), "user", "No Way Out", "ai"));
    expect({ zombies: zombies(s), aiHand: s.players.ai.hand.length, aiYard: s.players.ai.graveyard.length }).toEqual({ zombies: ["Zombie 2/2 B decayed"], aiHand: 1, aiYard: 2 });
  });
  it("⭐ Flip the Switch on the AI's Divination (it can't pay {4}): countered, and a decayed Zombie", () => {
    let s = table({ active: "ai", boards: { user: many("user", "is", ISLAND, 3), ai: many("ai", "ai-is", ISLAND, 3) }, hands: { user: [FLIP], ai: [DIVINATION] } });
    s = passPriority(cast(s, "ai", "Divination"));
    s = settle(cast(s, "user", "Flip the Switch", s.stack.find((o) => o.source?.name === "Divination").id));
    expect({ zombies: zombies(s), aiYard: s.players.ai.graveyard.map((c) => c.name), aiHand: s.players.ai.hand.length }).toEqual({ zombies: ["Zombie 2/2 B decayed"], aiYard: ["Divination"], aiHand: 0 });
  });
  it("⭐ Ghoulcaller's Harvest with three creature cards in the graveyard: X = 2 (half, rounded up) decayed Zombies", () => {
    const s = settle(cast(table({ boards: { user: [on("user", "sw", SWAMP), on("user", "fo", FOREST)] }, hands: { user: [HARVEST] }, graveyards: { user: [BEARS, GIANT, HOBBLING, ISLAND] } }), "user", "Ghoulcaller's Harvest"));
    expect(zombies(s)).toEqual(["Zombie 2/2 B decayed", "Zombie 2/2 B decayed"]);
  });
  it("⭐ Crowded Crypt: two of the person's creatures die (two corpse counters), then its activation makes two decayed Zombies", () => {
    let s = table({ boards: { user: [on("user", "crypt", CRYPT), on("user", "b0", BEARS), on("user", "b1", BEARS), ...many("user", "mt", MOUNTAIN, 2), ...many("user", "sw", SWAMP, 6)] }, hands: { user: [BOLT, BOLT] } });
    s = settle(cast(s, "user", "Lightning Bolt", "b0"));
    s = settle(cast(s, "user", "Lightning Bolt", "b1"));
    const corpse = s.players.user.battlefield.find((p) => p.id === "crypt")?.counters?.corpse ?? 0;
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "crypt" && !a.isManaAbility);
    expect(act, "Crowded Crypt's activation is not offered").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ corpse, zombies: zombies(s), crypt: s.players.user.battlefield.some((p) => p.id === "crypt") }).toEqual({ corpse: 2, zombies: ["Zombie 2/2 B decayed", "Zombie 2/2 B decayed"], crypt: false });
  });
});
