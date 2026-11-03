/**
 * necromancy.test.js — NECROMANCY (the play-weighted program, EDHREC #1023):
 *
 *   "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the
 *    permanent it becomes sacrifices it at the beginning of the next cleanup step.
 *    When this enchantment enters, if it's on the battlefield, it becomes an Aura with "enchant creature put onto the battlefield with
 *    Necromancy." Put target creature card from a graveyard onto the battlefield under your control and attach this enchantment to it.
 *    When this enchantment leaves the battlefield, that creature's controller sacrifices it."
 *
 * Gated whole beside Animate Dead (animateDeadGate.isNecromancy — the exact text), its two triggered abilities synthesized: the enters
 * trigger TARGETS a creature card in any graveyard as it goes on the stack (CR 603.3d — the person chooses, the AI takes the best);
 * resolving, if Necromancy is still on the battlefield (CR 603.4), it becomes an Aura (`becameAura` — the attachment sweep treats it
 * as one, with "enchant creature put onto the battlefield with Necromancy": the creature it put there, CR 704.5m, 702.16c), the card
 * enters under its controller and Necromancy is attached to it (the creature stamped `animatedBy`). Its leave trigger has that
 * creature's controller sacrifice it (Animate Dead's resolver). The flash line is the permission the engine never takes (its cast is
 * offered at sorcery speed only — textNormalize's FLASH_PERMISSION_LINE strip), so its drawback can't arise. Every bundled ruling
 * witnessed: it all happens as the ability resolves; it follows the Aura rules from then on; protection from black — it can't stay
 * attached, goes to the graveyard and the creature is sacrificed.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { attachedIsAura, isModifiedPermanent, hasAuraAttached, permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, raiseTriggerTargetChoice, resolveTopOfStack, settleTriggerTargetChoice } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { checkAllStateBasedActions } from "./sba.js";

beforeEach(() => _resetIdsForTests());

const NECRO = {"name":"Necromancy","type":"Enchantment","mana":"{2}{B}","oracle":"You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nWhen this enchantment enters, if it's on the battlefield, it becomes an Aura with \"enchant creature put onto the battlefield with Necromancy.\" Put target creature card from a graveyard onto the battlefield under your control and attach this enchantment to it. When this enchantment leaves the battlefield, that creature's controller sacrifices it.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1023
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #18317
const DISENCHANT = {"name":"Disenchant","type":"Instant","mana":"{1}{W}","oracle":"Destroy target artifact or enchantment.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1110
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const SPIRITDANCER = {"name":"Kor Spiritdancer","type":"Creature — Kor Wizard","mana":"{1}{W}","oracle":"This creature gets +2/+2 for each Aura attached to it.\nWhenever you cast an Aura spell, you may draw a card.","layout":"normal","cmc":2,"power":"0","toughness":"2","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}
const GOLEM = {"name":"Thran Golem","type":"Artifact Creature — Golem","mana":"{5}","oracle":"As long as this creature is enchanted, it gets +2/+2 and has flying, first strike, and trample.","layout":"normal","cmc":5,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}
const FACE = {"name":"Face of Divinity","type":"Enchantment — Aura","mana":"{2}{W}","oracle":"Enchant creature\nEnchanted creature gets +2/+2.\nAs long as another Aura is attached to enchanted creature, it has first strike and lifelink.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]}
const WEST_KODAMA = {"name":"Kodama of the West Tree","type":"Legendary Creature — Spirit","mana":"{2}{G}","oracle":"Reach\nModified creatures you control have trample. (Equipment, Auras you control, and counters are modifications.)\nWhenever a modified creature you control deals combat damage to a player, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","layout":"normal","cmc":3,"power":"3","toughness":"3","loyalty":null,"keywords":["Reach"],"colors":["G"],"colorIdentity":["G"]}
const AURAMANCY = {"name":"Greater Auramancy","type":"Enchantment","mana":"{1}{W}","oracle":"Other enchantments you control have shroud. (A permanent with shroud can't be the target of spells or abilities.)\nEnchanted creatures you control have shroud.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}
const WINDS = {"name":"Winds of Rath","type":"Sorcery","mana":"{3}{W}{W}","oracle":"Destroy all creatures that aren't enchanted. They can't be regenerated.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}
const SATYR = {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2.","layout":"normal","cmc":3,"power":"4","toughness":"2","loyalty":null,"keywords":["Bestow","Flash"],"colors":["G"],"colorIdentity":["G"]}
const gy = (pid, list) => list.map(([id, c]) => ({ ...c, id }));
/** `caster`'s precombat main with Necromancy in hand and {2}{B} floating; graveyards per seat; the person is a human seat. */
function table({ caster = "user", yards = {}, hands = {}, boards = {}, pool = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], library: [], graveyard: gy(pid, yards[pid] || []),
      hand: [...(pid === caster ? [{ ...NECRO, id: "h-necro" }] : []), ...gy(pid, hands[pid] || [])],
      manaPool: pid === caster ? (pool || { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 }) : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players };
}
/** Cast Necromancy for `caster`; the person aims its enters trigger at `aim` (a card id) when asked; then the stack is run out. */
function cast(s, { caster = "user", aim = null } = {}) {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-necro");
  expect(a, "Necromancy is not offered").toBeTruthy();
  let n = resolveTopOfStack(dispatchAction(s, a));
  n = flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const asked = raiseTriggerTargetChoice(n);
  let offered = null;
  if (asked.pendingChoice?.kind === "trigger-target") {
    offered = asked.pendingChoice.candidates.map((c) => c.targets.map((t) => t.id).join(",")).sort();
    const pick = asked.pendingChoice.candidates.find((c) => c.targets.some((t) => t.id === aim));
    expect(pick, `the person can aim at ${aim}`).toBeTruthy();
    n = settleTriggerTargetChoice(asked, pick.id);
  }
  return { s: settle(n), offered };
}
function settle(s) {
  let n = s, g = 0;
  while (g++ < 40) {
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    if (n.stack?.length && !n.pendingChoice) { n = resolveTopOfStack(n); continue; }
    const fin = finalizeStackResolution(n);
    if (fin.pendingTriggers?.length || (fin.stack?.length && !fin.pendingChoice)) { n = fin; continue; }
    n = fin;
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return n;
}
const necroOf = (s) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.card.name === "Necromancy") || null;
const where = (s, name) => Object.entries(s.players).flatMap(([pid, p]) => [
  ...p.battlefield.filter((x) => x.card.name === name).map(() => `${pid}:battlefield`),
  ...p.graveyard.filter((x) => x.name === name).map(() => `${pid}:graveyard`)]);
/** `seat` casts `cardId` at the permanent `targetId` with priority, and it resolves. */
function castAt(s, seat, cardId, targetId) {
  const p = { ...s, activePlayer: s.activePlayer, priorityHolder: seat };
  const a = legalActionsForPlayer(p, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && (x.targets || []).some((t) => t.id === targetId));
  expect(a, `${cardId} at ${targetId} is not offered`).toBeTruthy();
  return settle(resolveTopOfStack(dispatchAction(p, a)));
}

describe("the card", () => {
  it("⭐ native: both triggered abilities read; the flash permission is the one the engine never takes", () => {
    expect(classifyCard(NECRO)).toBe("native-trigger");
  });
});

describe("the person's Necromancy", () => {
  it("⭐ asked among the creature cards in every graveyard, the person takes the AI's Craw Wurm: it enters under the person's control, Necromancy an Aura attached to it", () => {
    const { s, offered } = cast(table({ yards: { user: [["gb", BEARS]], ai: [["cw", WURM], ["bolt", BOLT]] } }), { aim: "cw" });
    const necro = necroOf(s);
    const wurm = s.players.user.battlefield.find((p) => p.card.name === "Craw Wurm");
    expect({ offered, wurm: !!wurm, owner: wurm?.owner ?? null, attachedTo: necro?.attachedTo === wurm?.id, aura: necro?.becameAura ?? null, animatedBy: wurm?.animatedBy === necro?.id, aiYard: s.players.ai.graveyard.map((c) => c.id) })
      .toEqual({ offered: ["cw", "gb"], wurm: true, owner: "ai", attachedTo: true, aura: true, animatedBy: true, aiYard: ["bolt"] });
  });
  it("⭐ Necromancy destroyed: the Wurm's controller sacrifices it, and it goes to its owner's graveyard", () => {
    let { s } = cast(table({ yards: { ai: [["cw", WURM]] }, hands: { ai: [["dis", DISENCHANT]] } }), { aim: "cw" });
    const before = { wurm: where(s, "Craw Wurm"), attached: !!necroOf(s)?.attachedTo };
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } } } };
    s = castAt(s, "ai", "dis", necroOf(s)?.id);
    expect({ before, wurm: where(s, "Craw Wurm"), necro: where(s, "Necromancy") })
      .toEqual({ before: { wurm: ["user:battlefield"], attached: true }, wurm: ["ai:graveyard"], necro: ["user:graveyard"] });
  });
  it("⭐ the creature dies first: Necromancy is attached to nothing, goes to the graveyard (CR 704.5m), and its leave trigger finds nothing to sacrifice", () => {
    let { s } = cast(table({ yards: { ai: [["hg", GIANT]] }, hands: { ai: [["bolt", BOLT]] } }), { aim: "hg" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    const giant = s.players.user.battlefield.find((p) => p.card.name === "Hill Giant");
    expect({ giant: !!giant, attached: necroOf(s)?.attachedTo === giant?.id }).toEqual({ giant: true, attached: true });
    s = castAt(s, "ai", "bolt", giant?.id);
    expect({ giant: where(s, "Hill Giant"), necro: where(s, "Necromancy"), leaveFoundNothing: (s.log || []).some((e) => e.effect === "animate-dead-sacrifice" && e.sacrificed === null) })
      .toEqual({ giant: ["ai:graveyard"], necro: ["user:graveyard"], leaveFoundNothing: true });
  });
  it("⭐ its ruling — protection from black: White Knight enters, Necromancy can't stay attached, goes to the graveyard, and the Knight is sacrificed", () => {
    const { s } = cast(table({ yards: { user: [["wk", KNIGHT]] } }), { aim: "wk" });
    expect({ knight: where(s, "White Knight"), necro: where(s, "Necromancy"), entered: (s.log || []).some((e) => e.kind === "permanent-enters" && e.cardName === "White Knight"), fell: (s.log || []).some((e) => e.kind === "aura-falls-off" && e.cardName === "Necromancy" && e.reason === "protection") })
      .toEqual({ knight: ["user:graveyard"], necro: ["user:graveyard"], entered: true, fell: true });
  });
  it("⭐ no creature card in any graveyard: the trigger has no target and is removed; Necromancy stays, an enchantment attached to nothing", () => {
    const { s } = cast(table({ yards: { ai: [["bolt", BOLT]] } }));
    const necro = necroOf(s);
    expect({ on: !!necro, aura: necro?.becameAura ?? null, attached: necro?.attachedTo ?? null }).toEqual({ on: true, aura: null, attached: null });
  });
  it("⭐ the target leaves its graveyard before the trigger resolves: the trigger does nothing (CR 608.2b) and Necromancy stays an enchantment", () => {
    const s0 = table({ yards: { ai: [["cw", WURM]] } });
    const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-necro");
    let n = flushTriggers(resolveTopOfStack(dispatchAction(s0, a)), { chooseTargets: chooseTriggerTargets });
    n = { ...n, players: { ...n.players, ai: { ...n.players.ai, graveyard: [], exile: [...(n.players.ai.exile || []), { ...WURM, id: "cw" }] } } };
    n = settle(n);
    const necro = necroOf(n);
    expect({ wurm: where(n, "Craw Wurm"), on: !!necro, aura: necro?.becameAura ?? null }).toEqual({ wurm: [], on: true, aura: null });
  });
  it("⭐ \"if it's on the battlefield\" (CR 603.4): Necromancy gone before its trigger resolves — nothing is returned", () => {
    const s0 = table({ yards: { ai: [["cw", WURM]] } });
    const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-necro");
    let n = flushTriggers(resolveTopOfStack(dispatchAction(s0, a)), { chooseTargets: chooseTriggerTargets });
    const necro = necroOf(n);
    n = { ...n, players: { ...n.players, user: { ...n.players.user, battlefield: n.players.user.battlefield.filter((p) => p.id !== necro.id), graveyard: [...n.players.user.graveyard, { ...NECRO, id: "h-necro" }] } } };
    n = settle(n);
    expect({ wurm: where(n, "Craw Wurm") }).toEqual({ wurm: ["ai:graveyard"] });
  });
  it("the flash permission is never taken: in the opponent's turn, and in the person's own combat, Necromancy isn't offered", () => {
    const s = table({ yards: { ai: [["cw", WURM]] } });
    const theirs = { ...s, activePlayer: "ai", priorityHolder: "user" };
    const combat = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    const offered = (x) => legalActionsForPlayer(x, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-necro");
    expect({ main: offered(s), theirs: offered(theirs), combat: offered(combat) }).toEqual({ main: true, theirs: false, combat: false });
  });
});

describe("the default AI", () => {
  it("⭐ its Necromancy takes the best creature card in any graveyard — the person's Craw Wurm over its own Grizzly Bears", () => {
    const s0 = table({ caster: "ai", yards: { user: [["cw", WURM]], ai: [["gb", BEARS]] } });
    const pick = pickAction(s0, "ai", legalActionsForPlayer(s0, "ai"));
    expect(pick?.cardId).toBe("h-necro");
    const { s } = cast(s0, { caster: "ai" });
    const wurm = s.players.ai.battlefield.find((p) => p.card.name === "Craw Wurm");
    expect({ wurm: !!wurm, owner: wurm?.owner ?? null, attached: necroOf(s)?.attachedTo === wurm?.id, userYard: s.players.user.graveyard.length })
      .toEqual({ wurm: true, owner: "user", attached: true, userYard: 0 });
  });
});

describe("the attached-Aura readers see it (the review of pw24, F4 — layers.attachedIsAura: a Necromancy that became an Aura, and a bestowed Aura)", () => {
  const onB = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
  /** Necromancy, cast by the person, returns `card` from their graveyard; `board` is already on their battlefield. */
  const reanimate = (card, board = []) => {
    const { s: st } = cast(table({ yards: { user: [["x", card]] }, boards: { user: board } }), { aim: "x" });
    return { st, id: st.players.user.battlefield.find((p) => p.card.name === card.name)?.id };
  };
  /** A bestowed Boon Satyr ("Enchanted creature gets +4/+2") attached to `hostCard` on the person's battlefield. */
  const bestowed = (hostCard, extra = []) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let st = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...g.players, user: { ...g.players.user, battlefield: [onB("user", "host", hostCard), onB("user", "satyr", SATYR, { bestowed: true }), ...extra], hand: [], library: [], graveyard: [] } } };
    st = attachPermanent(st, { equipId: "satyr", targetId: "host" });
    return st;
  };
  const pt = (st, id) => [permanentPower(st, id), permanentToughness(st, id)];
  it("⭐ the Aura count (Kor Spiritdancer, +2/+2 for each Aura attached): reanimated, 2/4; under a bestowed Boon Satyr, 6/6 (+4/+2 and +2/+2)", () => {
    const r = reanimate(SPIRITDANCER);
    const b = bestowed(SPIRITDANCER);
    expect({ necromancy: pt(r.st, r.id), bestowed: pt(b, "host") }).toEqual({ necromancy: [2, 4], bestowed: [6, 6] });
  });
  it("⭐ the enchanted gate (Thran Golem): reanimated, 5/5 with flying and trample; under a bestowed Boon Satyr, 9/7 with flying and trample", () => {
    const r = reanimate(GOLEM);
    const b = bestowed(GOLEM);
    const kws = (st, id) => ["Flying", "Trample"].filter((k) => permanentHasKeyword(st, id, k));
    expect({ necromancy: [...pt(r.st, r.id), ...kws(r.st, r.id)], bestowed: [...pt(b, "host"), ...kws(b, "host")] })
      .toEqual({ necromancy: [5, 5, "Flying", "Trample"], bestowed: [9, 7, "Flying", "Trample"] });
  });
  it("⭐ the other-Aura gate (Face of Divinity on the reanimated Bears): first strike and lifelink — Necromancy is another Aura", () => {
    const r = reanimate(BEARS);
    let st = { ...r.st, players: { ...r.st.players, user: { ...r.st.players.user, battlefield: [...r.st.players.user.battlefield, onB("user", "face", FACE)] } } };
    st = attachPermanent(st, { equipId: "face", targetId: r.id });
    expect({ pt: pt(st, r.id), fs: permanentHasKeyword(st, r.id, "First strike"), ll: permanentHasKeyword(st, r.id, "Lifelink") }).toEqual({ pt: [4, 4], fs: true, ll: true });
  });
  it("⭐ modified (CR 700.9 — an Aura its controller controls): Kodama of the West Tree gives the reanimated Bears trample; and the bestowed host", () => {
    const r = reanimate(BEARS, [onB("user", "west", WEST_KODAMA)]);
    const b = bestowed(BEARS, [onB("user", "west", WEST_KODAMA)]);
    expect({ modified: isModifiedPermanent(r.st, r.st.players.user.battlefield.find((p) => p.id === r.id)), trample: permanentHasKeyword(r.st, r.id, "Trample"), bestowedTrample: permanentHasKeyword(b, "host", "Trample") })
      .toEqual({ modified: true, trample: true, bestowedTrample: true });
  });
  it("⭐ enchanted creatures you control (Greater Auramancy): the reanimated Bears and the bestowed host have shroud", () => {
    const r = reanimate(BEARS, [onB("user", "gra", AURAMANCY)]);
    const b = bestowed(BEARS, [onB("user", "gra", AURAMANCY)]);
    expect({ enchanted: hasAuraAttached(r.st, r.st.players.user.battlefield.find((p) => p.id === r.id)), shroud: permanentHasKeyword(r.st, r.id, "Shroud"), bestowedShroud: permanentHasKeyword(b, "host", "Shroud") })
      .toEqual({ enchanted: true, shroud: true, bestowedShroud: true });
  });
  it("⭐ (R3) CR 702.103f — a bestowed Aura whose host has left isn't an Aura: the Boon Satyr is one while attached to the Bears; the Bears gone, it is a 4/2 creature attached to nothing, and attachedIsAura says no", () => {
    expect(typeof attachedIsAura, "layers.attachedIsAura").toBe("function");
    let st = bestowed(BEARS);
    const satyr = (x) => x.players.user.battlefield.find((p) => p.id === "satyr");
    const before = attachedIsAura(satyr(st));
    st = checkAllStateBasedActions(moveCardToZone(st, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "host" }));
    expect({ before, after: attachedIsAura(satyr(st)), attachedTo: satyr(st)?.attachedTo ?? null, pt: pt(st, "satyr"), bears: where(st, "Grizzly Bears") })
      .toEqual({ before: true, after: false, attachedTo: null, pt: [4, 2], bears: ["user:graveyard"] });
  });
  it("⭐ \"creatures that aren't enchanted\" (Winds of Rath): the reanimated Bears and their Necromancy survive; the plain Hill Giant dies", () => {
    const r = reanimate(BEARS, [onB("user", "hg", GIANT)]);
    let st = { ...r.st, players: { ...r.st.players, user: { ...r.st.players.user, hand: [{ ...WINDS, id: "h-winds" }], manaPool: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 3 } } } };
    const a = legalActionsForPlayer(st, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-winds");
    st = settle(resolveTopOfStack(dispatchAction(st, a)));
    expect({ bears: where(st, "Grizzly Bears"), giant: where(st, "Hill Giant"), necro: where(st, "Necromancy") }).toEqual({ bears: ["user:battlefield"], giant: ["user:graveyard"], necro: ["user:battlefield"] });
  });
});
