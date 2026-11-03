/**
 * promiseOfLoyalty.test.js — PROMISE OF LOYALTY (the play-weighted program, EDHREC #943):
 *
 *   "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or
 *    planeswalkers you control for as long as it has a vow counter on it."
 *
 * Two atoms (effects/atoms/removal.applySacrificeAllButOne → applyVowThoseCreatures). Each player keeps one creature and sacrifices the
 * rest — chosen in APNAP order (CR 101.4) through the N-count edict chain, a person picking every creature they give up (the edict panel,
 * one pick at a time), the AI giving up its least valuable — and every chosen creature goes together. Each kept creature gets a vow
 * counter and remembers the promise to this spell's controller: legalChoices never offers its attack at that player or at a planeswalker
 * they control while it has a vow counter (combatEvasion.vowForbidsAttack; the dispatcher refuses one). Every bundled ruling witnessed:
 * the counter removed, it attacks as normal; the counter moved to another creature doesn't stop that creature; each player, the caster
 * included, must keep one if able (one creature: kept, unasked); the promise survives a change of control. The default AI holds it like
 * every creature wipe, unless clearly behind on the board.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, closeAttackDeclaration, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveSacrificeChoice, autoPickSacrificeCandidate, resolveOptionalChoice } from "./effects/runProgram.js";
import { permanentIsCreature } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const PROMISE = {"name":"Promise of Loyalty","type":"Sorcery","mana":"{4}{W}","oracle":"Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #943
const BLADES = {"name":"Lizard Blades","type":"Artifact Creature — Equipment Lizard","mana":"{1}{R}","oracle":"Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Double strike","Reconfigure"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1470
const TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #4820
const LILIANA = {"name":"Liliana of the Veil","type":"Legendary Planeswalker — Liliana","mana":"{1}{B}{B}","oracle":"+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"3","keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2988
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const NESTING = {"name":"Nesting Grounds","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{1}, {T}: Move a counter from target permanent you control onto a second target permanent. Activate only as a sorcery.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #561

const BLADE = {"name":"Blade of Selves","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has myriad. (Whenever it attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)\nEquip {4}","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #898
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), enteredOnTurn: 1, ...extra });
/** `caster`'s precombat main with Promise of Loyalty in hand and {4}{W} floating; `boards` per seat. */
function table({ caster = "user", boards = {}, pod = false, hand = [] } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], library: [], hand: pid === caster ? [{ ...PROMISE, id: "h-promise" }, ...hand] : [],
      manaPool: pid === caster ? { W: 1, U: 0, B: 0, R: 1, G: 0, C: 6 } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players };
}
/** Resolve the stack; each sacrifice-choice the person faces takes the next of `userPicks`, every AI seat's takes its autopilot. */
function drive(s, userPicks = []) {
  let n = s, g = 0;
  const picks = [...userPicks];
  while (g++ < 80) {
    if (n.pendingChoice?.kind === "sacrifice-choice") {
      const pc = n.pendingChoice;
      const id = pc.controller === "user" ? picks.shift() : autoPickSacrificeCandidate(n, pc);
      expect(id, `no pick for ${pc.controller} among ${(pc.candidates || []).map((c) => c.id)}`).toBeTruthy();
      n = resolveSacrificeChoice(n, id);
      continue;
    }
    if (n.pendingChoice) break;
    if (n.stack?.length) { n = resolveTopOfStack(n); continue; }
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    break;
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
function castPromise(s, userPicks, caster = "user") {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-promise");
  expect(a, "Promise of Loyalty is not offered").toBeTruthy();
  return drive(dispatchAction(s, a), userPicks);
}
const bf = (s, pid) => (s.players[pid]?.battlefield || []).map((p) => p.id).sort();
const vowOf = (s, id) => { const p = Object.values(s.players).flatMap((x) => x.battlefield).find((x) => x.id === id); return p ? { vow: p.counters?.vow ?? 0, against: p.vowAgainst ?? [] } : null; };
/** The declare-attackers offer for `seat`'s creature `id` on `seat`'s turn: the defenders it may attack ("pw:<id>" for a planeswalker). */
function attacksOf(s, seat, id) {
  const t = { ...s, activePlayer: seat, priorityHolder: seat, phase: "combat", step: "declare-attackers", combat: null, pendingChoice: null, stack: [] };
  return legalActionsForPlayer(t, seat).filter((a) => a.kind === "declare-attacker" && a.permanentId === id)
    .map((a) => (a.defenderPlaneswalkerId ? `pw:${a.defenderPlaneswalkerId}` : a.defenderId ?? "default")).sort();
}

describe("the card", () => {
  it("⭐ native: the keep-one sacrifice, then the vow", () => {
    expect({ tier: classifyCard(PROMISE), atoms: parseEffectProgram(PROMISE)?.atoms })
      .toEqual({ tier: "native-spell", atoms: [{ op: "sacrifice-all-but-one", targetType: null }, { op: "vow-those-creatures", targetType: null }] });
  });
});

describe("the resolution", () => {
  const boards = () => ({ user: [on("user", "ub", BEARS), on("user", "ug", GIANT), on("user", "up", PLAINS)], ai: [on("ai", "ab", BEARS), on("ai", "ag", GIANT), on("ai", "aw", WURM)] });
  it("⭐ the person, first (the active player), gives up one of two — Grizzly Bears — and keeps the Hill Giant; the AI gives up its two least valuable and keeps the Craw Wurm", () => {
    let s = table({ boards: boards() });
    s = resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((x) => x.cardId === "h-promise")));
    expect({ first: s.pendingChoice?.controller, cands: (s.pendingChoice?.candidates || []).map((c) => c.id).sort() }).toEqual({ first: "user", cands: ["ub", "ug"] });
    s = drive(s, ["ub"]);
    expect({ user: bf(s, "user"), ai: bf(s, "ai"), userGy: s.players.user.graveyard.map((c) => c.name).sort(), aiGy: s.players.ai.graveyard.map((c) => c.name).sort() })
      .toEqual({ user: ["ug", "up"], ai: ["aw"], userGy: ["Grizzly Bears", "Promise of Loyalty"], aiGy: ["Grizzly Bears", "Hill Giant"] });
  });
  it("⭐ every kept creature gets a vow counter and remembers the promise to the caster — the caster's own included", () => {
    const s = castPromise(table({ boards: boards() }), ["ub"]);
    expect({ ug: vowOf(s, "ug"), aw: vowOf(s, "aw"), land: vowOf(s, "up") }).toEqual({ ug: { vow: 1, against: ["user"] }, aw: { vow: 1, against: ["user"] }, land: { vow: 0, against: [] } });
  });
  it("⭐ the sacrifices are one event: every chosen creature, both players', goes together", () => {
    const s = castPromise(table({ boards: boards() }), ["ub"]);
    const together = (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "sacrifice-together");
    expect({ events: together.length, victims: [...(together[0]?.sacrificed || [])].sort() }).toEqual({ events: 1, victims: ["ab", "ag", "ub"] });
  });
  it("⭐ its ruling — each player must keep one if able: a single creature is kept, unasked; no creature, nothing", () => {
    const s = castPromise(table({ boards: { user: [], ai: [on("ai", "aw", WURM)] } }), []);
    expect({ ai: bf(s, "ai"), vow: vowOf(s, "aw") }).toEqual({ ai: ["aw"], vow: { vow: 1, against: ["user"] } });
  });
  it("⭐ only those creatures promise: a Lizard Blades attached to a sacrificed creature falls off and is a creature again — no vow counter, not sacrificed", () => {
    const s = castPromise(table({ boards: { user: [], ai: [on("ai", "ab", BEARS, { attachments: ["lb"] }), on("ai", "aw", WURM), on("ai", "lb", BLADES, { attachedTo: "ab" })] } }), []);
    expect({ ai: bf(s, "ai"), blades: permanentIsCreature(s, "lb"), vow: vowOf(s, "lb"), wurm: vowOf(s, "aw") }).toEqual({ ai: ["aw", "lb"], blades: true, vow: { vow: 0, against: [] }, wurm: { vow: 1, against: ["user"] } });
  });
});

describe("the vow", () => {
  /** A pod: the person casts Promise; ai1 keeps its Craw Wurm; the person controls Liliana of the Veil. */
  const pod = () => castPromise(table({ pod: true, boards: { user: [on("user", "lili", LILIANA, { counters: { loyalty: 3 } })], ai1: [on("ai1", "w1", WURM), on("ai1", "b1", BEARS)], ai2: [], ai3: [] } }), []);
  it("⭐ ai1's kept Craw Wurm can't attack the person or the person's planeswalker — and attacks the other opponents as normal", () => {
    const s = pod();
    expect({ kept: bf(s, "ai1"), attacks: attacksOf(s, "ai1", "w1") }).toEqual({ kept: ["w1"], attacks: ["ai2", "ai3"] });
  });
  it("⭐ the dispatcher refuses an attack at the promised player that arrives anyway", () => {
    const s = pod();
    const t = { ...s, activePlayer: "ai1", priorityHolder: "ai1", phase: "combat", step: "declare-attackers", combat: null };
    expect(() => dispatchAction(t, { kind: "declare-attacker", playerId: "ai1", permanentId: "w1", defenderId: "user" })).toThrow(/vow counter/);
  });
  it("⭐ its ruling — the vow counter removed: it can attack as normal", () => {
    const s = pod();
    const freed = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: s.players.ai1.battlefield.map((p) => (p.id === "w1" ? { ...p, counters: { ...p.counters, vow: 0 } } : p)) } } };
    expect(attacksOf(freed, "ai1", "w1")).toEqual(["ai2", "ai3", "pw:lili", "user"]);
  });
  it("⭐ its ruling — the vow counter moved to another creature: that creature attacks as normal (it made no promise)", () => {
    const s = pod();
    const moved = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [...s.players.ai1.battlefield.map((p) => (p.id === "w1" ? { ...p, counters: { ...p.counters, vow: 0 } } : p)), on("ai1", "g2", GIANT, { counters: { vow: 1 } })] } } };
    expect({ giant: attacksOf(moved, "ai1", "g2"), wurm: attacksOf(moved, "ai1", "w1") }).toEqual({ giant: ["ai2", "ai3", "pw:lili", "user"], wurm: ["ai2", "ai3", "pw:lili", "user"] });
  });
  it("⭐ its ruling — the promise survives a change of control: ai2 takes the Wurm with Act of Treason, and it still can't attack the person", () => {
    let s = pod();
    s = { ...s, activePlayer: "ai2", priorityHolder: "ai2", players: { ...s.players, ai2: { ...s.players.ai2, hand: [{ ...TREASON, id: "h-tr" }], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 } } } };
    const tr = legalActionsForPlayer(s, "ai2").find((x) => x.kind === "cast-spell" && x.cardId === "h-tr" && (x.targets || []).some((t) => t.id === "w1"));
    expect(tr, "Act of Treason at the Wurm").toBeTruthy();
    s = drive(dispatchAction(s, tr));
    expect({ controller: bf(s, "ai2"), attacks: attacksOf(s, "ai2", "w1") }).toEqual({ controller: ["w1"], attacks: ["ai1", "ai3"] });
  });
  it("⭐ its ruling — a promise that ended stays ended (CR 611.2a): the Wurm's vow counter gone, ai2's Promise makes it promise ai2 only — it attacks the person and ai3", () => {
    let s = pod();
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: s.players.ai1.battlefield.map((p) => (p.id === "w1" ? { ...p, counters: { ...p.counters, vow: 0 } } : p)) } } };
    s = { ...s, activePlayer: "ai2", priorityHolder: "ai2", players: { ...s.players, ai2: { ...s.players.ai2, hand: [{ ...PROMISE, id: "h-p2" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 4 } } } };
    s = drive(dispatchAction(s, legalActionsForPlayer(s, "ai2").find((x) => x.kind === "cast-spell" && x.cardId === "h-p2")));
    expect({ vow: vowOf(s, "w1"), attacks: attacksOf(s, "ai1", "w1").filter((t) => !t.startsWith("pw:")) }).toEqual({ vow: { vow: 1, against: ["ai2"] }, attacks: ["ai3", "user"] });
  });
  it("⭐ its ruling — the counter moved off and back with Nesting Grounds: the promise ended as the last vow counter left, so nothing revives", () => {
    let s = pod();
    s = { ...s, activePlayer: "ai1", priorityHolder: "ai1", phase: "precombat-main", step: "main", stack: [],
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [...s.players.ai1.battlefield, on("ai1", "nest", NESTING), on("ai1", "b2", BEARS)], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } } };
    const move = (st, from, to) => {
      const a = legalActionsForPlayer(st, "ai1").find((x) => x.kind === "activate-ability" && x.permanentId === "nest"
        && (x.targets || []).some((t) => t.role === "from" && t.id === from) && (x.targets || []).some((t) => t.role === "onto" && t.id === to));
      expect(a, `Nesting Grounds ${from} → ${to}`).toBeTruthy();
      return drive(dispatchAction(st, a));
    };
    s = move(s, "w1", "b2");
    expect({ wurm: vowOf(s, "w1"), bears: vowOf(s, "b2") }).toEqual({ wurm: { vow: 0, against: [] }, bears: { vow: 1, against: [] } });
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: s.players.ai1.battlefield.map((p) => (p.id === "nest" ? { ...p, tapped: false } : p)), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } } };
    s = move(s, "b2", "w1");
    expect({ wurm: vowOf(s, "w1"), attacks: attacksOf(s, "ai1", "w1") }).toEqual({ wurm: { vow: 1, against: [] }, attacks: ["ai2", "ai3", "pw:lili", "user"] });
  });
  it("⭐ myriad (pw22) — a vowed creature's copies made no promise: ai1's kept Wurm with Blade of Selves attacks ai2, and its copies attack ai3 and the person (put onto the battlefield attacking, never declared — CR 508.4; a copy has no vow counter)", () => {
    let s = pod();
    s = { ...s, activePlayer: "ai1", priorityHolder: "ai1", phase: "combat", step: "declare-attackers", combat: null, stack: [],
      players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [...s.players.ai1.battlefield, on("ai1", "blade", BLADE)] } } };
    s = attachPermanent(s, { equipId: "blade", targetId: "w1" });
    expect(attacksOf(s, "ai1", "w1")).toEqual(["ai2", "ai3"]); // the declaration still keeps the promise
    s = dispatchAction(s, legalActionsForPlayer(s, "ai1").find((a) => a.kind === "declare-attacker" && a.permanentId === "w1" && a.defenderId === "ai2"));
    s = resolveTopOfStack(closeAttackDeclaration(s).state);
    expect(s.pendingChoice?.effectOp, "the myriad trigger did not ask").toBe("myriad");
    s = resolveOptionalChoice(s, true);
    const made = s.players.ai1.battlefield.filter((p) => p.myriadToken);
    expect({ attacking: (s.combat?.attackers || []).map((a) => `${a.permanentId === "w1" ? "w1" : "copy"}->${a.defender}`).sort(), vows: made.map((p) => [p.counters?.vow ?? 0, p.vowAgainst ?? []]) })
      .toEqual({ attacking: ["copy->ai3", "copy->user", "w1->ai2"], vows: [[0, []], [0, []]] });
  });
  it("⭐ heads-up: the AI's kept creature has nobody it may attack", () => {
    const s = castPromise(table({ boards: { user: [on("user", "ub", BEARS)], ai: [on("ai", "aw", WURM)] } }), []);
    expect(attacksOf(s, "ai", "aw")).toEqual([]);
  });
});

describe("the default AI holding Promise of Loyalty", () => {
  const aiPick = (boards) => {
    const s = table({ caster: "ai", boards });
    return pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.cardId ?? null;
  };
  it("⛔ ahead or even on the board: it holds it (a creature wipe)", () => {
    expect(aiPick({ ai: [on("ai", "aw", WURM), on("ai", "ag", GIANT)], user: [on("user", "ub", BEARS)] })).not.toBe("h-promise");
  });
  it("⭐ clearly behind (three creatures down): it casts it", () => {
    expect(aiPick({ ai: [on("ai", "ab", BEARS)], user: [on("user", "u1", WURM), on("user", "u2", GIANT), on("user", "u3", BEARS), on("user", "u4", BEARS)] })).toBe("h-promise");
  });
});
