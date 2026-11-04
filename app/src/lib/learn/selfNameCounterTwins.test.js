/**
 * selfNameCounterTwins.test.js — the twins of Palantír of Orthanc's self-name counter read (the play-weighted program, pw28).
 *
 * Palantír's slice reads the source's FULL name as the object of a named counter ("put an influence counter on Palantír of
 * Orthanc"; "the number of influence counters on Palantír of Orthanc") as the source itself (CR 201.5) — triggers.
 * rewriteSelfNameCounterObjects. Two more cards play whole by that read alone, and one is held back:
 *
 *   · LOST JITTE (EDHREC #4501) — "Whenever equipped creature deals combat damage, put a charge counter on Lost Jitte." The
 *     watcher is the Equipment and the counter goes on it; the trigger fires once per combat damage event however many objects
 *     the creature damaged (CR 603.2c, 510.2). Its "Remove a charge counter from Lost Jitte: Choose one —" was already read: untap
 *     target land, target creature can't block this turn, a +1/+1 counter on equipped creature.
 *   · SIMIC SLAW (no EDHREC rank) — "Whenever one or more creatures die, put a charge counter on Simic Slaw." One trigger per batch
 *     of deaths, anyone's creatures (CR 603.10a). "{2}, Sacrifice Simic Slaw: Draw X cards and gain X life, where X is the number of
 *     charge counters on Simic Slaw." counts the counters it had as it last existed — it was sacrificed to pay the cost (CR 608.2h).
 *   · FAMOUS MUSEUM — HELD BACK. "{T}: Add {C}, plus an additional {C} for each art counter on Famous Museum." is one mana plus one
 *     per counter; no mana record reads that count, and the generic Add clause read it as a flat {C}{C}. Its trigger reads now, so
 *     the misread mana line is refused (manaModel.manaLineRefused): the artifact makes no mana and stays uncredited.
 *
 * A quoted ability keeps the name (Gutter Grime's Ooze token counts the slime counters on Gutter Grime — inside the quote "this
 * creature" would be the token, CR 113.10).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, nextStep, passPriority, raiseTriggerTargetChoice, settleTriggerTargetChoice } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { detectTriggers } from "./triggers.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LOST = {"name":"Lost Jitte","type":"Legendary Artifact — Equipment","mana":"{1}","oracle":"Whenever equipped creature deals combat damage, put a charge counter on Lost Jitte.\nRemove a charge counter from Lost Jitte: Choose one —\n• Untap target land.\n• Target creature can't block this turn.\n• Put a +1/+1 counter on equipped creature.\nEquip {1}","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #4501
const SLAW = {"name":"Simic Slaw","type":"Artifact — Food Clue","mana":"{2}","oracle":"Whenever one or more creatures die, put a charge counter on Simic Slaw.\n{2}, Sacrifice Simic Slaw: Draw X cards and gain X life, where X is the number of charge counters on Simic Slaw.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #—
const MUSEUM = {"name":"Famous Museum","type":"Artifact","mana":"{3}","oracle":"Whenever a creature you control dies, put an art counter on Famous Museum.\n{T}: Add {C}, plus an additional {C} for each art counter on Famous Museum.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #—
const GUTTER = {"name":"Gutter Grime","type":"Enchantment","mana":"{4}{G}","oracle":"Whenever a nontoken creature you control dies, put a slime counter on this enchantment, then create a green Ooze creature token with \"This token's power and toughness are each equal to the number of slime counters on Gutter Grime.\"","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #12785
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","oracle":"Shock deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2215
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","oracle":"Pyroclasm deals 2 damage to each creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #7698

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));
/** Heads-up, the user's turn 5 precombat main: `boards`, `hands` (ids `<seat>-h<i>`) per seat; libraries of Forests. */
function table({ boards = {}, hands = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, battlefield: boards[pid] || [], hand: (hands[pid] || []).map((c, i) => ({ ...c, id: `${pid}-h${i}` })), graveyard: [], exile: [],
      library: Array.from({ length: 10 }, (_, i) => ({ ...FOREST, id: `${pid}-l${i}` })) };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const perm = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id) || null;
const charge = (s, id) => perm(s, id)?.counters?.charge || 0;
/** Pass priority until the stack and the pending triggers are empty, settling each pause as the session does. */
function settle(s0) {
  let s = s0;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 100; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, q.pendingChoice.candidates[0].id); continue; }
    if (!s.stack.length && !(s.pendingTriggers || []).length) break;
    s = passPriority(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return s;
}
const act = (s, seat, pred, what) => {
  const a = legalActionsForPlayer(s, seat).find(pred);
  expect(a, `${what} is offered`).toBeTruthy();
  return dispatchAction(s, a);
};
const cast = (s, name, targetId) => act(s, "user", (a) => a.kind === "cast-spell" && a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)), `${name}${targetId ? ` at ${targetId}` : ""}`);
/**
 * Walk the rest of the user's turn: `attacks` declared, the AI's `blocks` ({ blockerId: attackerId }) declared. Records the
 * blockers offered to the AI and the AI's life after combat damage.
 */
function walk(s0, { attacks = [], blocks = {} } = {}) {
  let s = s0;
  const declared = new Set();
  const blocked = new Set();
  let offeredBlockers = null;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 600 && s.turn === s0.turn; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, q.pendingChoice.candidates[0].id); continue; }
    if (s.step === "declare-attackers" && s.priorityHolder === "user") {
      const id = attacks.find((x) => !declared.has(x) && offered(s, "user", "declare-attacker").some((a) => a.permanentId === x));
      if (id) { declared.add(id); s = dispatchAction(s, offered(s, "user", "declare-attacker").find((a) => a.permanentId === id)); continue; }
    }
    if (s.step === "declare-blockers" && s.priorityHolder === "ai" && s.combat?.blockDeclarationOpen !== false) {
      if (offeredBlockers == null) offeredBlockers = [...new Set(offered(s, "ai", "declare-blocker").map((a) => a.permanentId))].sort();
      const next = Object.entries(blocks).find(([id]) => !blocked.has(id) && offered(s, "ai", "declare-blocker").some((a) => a.permanentId === id));
      if (next) { blocked.add(next[0]); s = dispatchAction(s, offered(s, "ai", "declare-blocker").find((a) => a.permanentId === next[0] && a.attackerId === next[1])); continue; }
    }
    s = s.priorityHolder ? passPriority(s) : nextStep(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s, offeredBlockers };
}
/** The user's board with Lost Jitte (`charges` counters) attached to `host` (unattached when `attach` is false). */
function jitteTable({ host = "bear", userBoard = [], aiBoard = [], charges = 0, attach = true } = {}) {
  const s = table({ boards: { user: [on("user", "jit", LOST, charges ? { counters: { charge: charges } } : {}), ...userBoard], ai: aiBoard } });
  return attach ? attachPermanent(s, { equipId: "jit", targetId: host }) : s;
}

describe("Lost Jitte (EDHREC #4501)", () => {
  it("⭐ the equipped Bears deal combat damage to the AI: one charge counter, on the Jitte", () => {
    const { s } = walk(jitteTable({ userBoard: [on("user", "bear", BEARS)] }), { attacks: ["bear"] });
    expect({ jitte: charge(s, "jit"), bears: perm(s, "bear").counters || {}, aiLife: s.players.ai.life }).toEqual({ jitte: 1, bears: {}, aiLife: 38 });
  });
  it("⭐ the equipped Hill Giant is blocked by two Bears and damages both: one damage event — one counter (CR 603.2c)", () => {
    const { s } = walk(jitteTable({ host: "giant", userBoard: [on("user", "giant", GIANT)], aiBoard: [on("ai", "ab0", BEARS), on("ai", "ab1", BEARS)] }),
      { attacks: ["giant"], blocks: { ab0: "giant", ab1: "giant" } });
    expect({ jitte: charge(s, "jit"), aiYard: s.players.ai.graveyard.length }).toEqual({ jitte: 1, aiYard: 1 });
  });
  it("the rest of its text (read before this slice) — remove a counter, untap target land: the tapped Forest untaps, the counter is gone", () => {
    const s0 = jitteTable({ userBoard: [on("user", "bear", BEARS), on("user", "f0", FOREST, { tapped: true })], charges: 1 });
    const s = settle(act(s0, "user", (a) => a.kind === "activate-ability" && a.permanentId === "jit" && a.chosenMode === 0 && (a.targets || []).some((t) => t.id === "f0"), "the untap mode at the Forest"));
    expect({ forestTapped: perm(s, "f0").tapped, jitte: charge(s, "jit") }).toEqual({ forestTapped: false, jitte: 0 });
  });
  it("the rest of its text (read before this slice) — remove a counter, target creature can't block this turn: the AI's Bears is not offered as a blocker", () => {
    const s0 = jitteTable({ userBoard: [on("user", "bear", BEARS)], aiBoard: [on("ai", "ab", BEARS), on("ai", "ag", GIANT)], charges: 1 });
    const s1 = settle(act(s0, "user", (a) => a.kind === "activate-ability" && a.permanentId === "jit" && a.chosenMode === 1 && (a.targets || []).some((t) => t.id === "ab"), "the can't-block mode at the AI's Bears"));
    const { offeredBlockers } = walk(s1, { attacks: ["bear"] });
    expect({ offeredBlockers, jitte: charge(s1, "jit") }).toEqual({ offeredBlockers: ["ag"], jitte: 0 });
  });
  it("the rest of its text (read before this slice) — remove a counter, a +1/+1 counter on equipped creature", () => {
    const s0 = jitteTable({ userBoard: [on("user", "bear", BEARS)], charges: 2 });
    const s = settle(act(s0, "user", (a) => a.kind === "activate-ability" && a.permanentId === "jit" && a.chosenMode === 2, "the +1/+1 mode"));
    expect({ bears: perm(s, "bear").counters?.["+1/+1"] || 0, jitte: charge(s, "jit") }).toEqual({ bears: 1, jitte: 1 });
  });
  it("control: no charge counter — the ability is not offered", () => {
    const s = jitteTable({ userBoard: [on("user", "bear", BEARS), on("user", "f0", FOREST, { tapped: true })] });
    expect(offered(s, "user", "activate-ability").filter((a) => a.permanentId === "jit" && !a.isEquipAbility && a.removeCounter)).toEqual([]);
  });
  it("control: the Bears attack unequipped — no counter", () => {
    const { s } = walk(jitteTable({ userBoard: [on("user", "bear", BEARS)], attach: false }), { attacks: ["bear"] });
    expect({ jitte: charge(s, "jit"), aiLife: s.players.ai.life }).toEqual({ jitte: 0, aiLife: 38 });
  });
  it("is credited native-equipment", () => {
    expect(classifyCard(LOST)).toBe("native-equipment");
  });
});

describe("Simic Slaw", () => {
  it("⭐ Pyroclasm kills three creatures at once: one charge counter (one or more creatures die — one trigger)", () => {
    const s0 = table({ boards: { user: [on("user", "slaw", SLAW), on("user", "bear", BEARS), ...many("user", "m", MOUNTAIN, 2)], ai: [on("ai", "ab0", BEARS), on("ai", "ab1", BEARS)] }, hands: { user: [PYROCLASM] } });
    const s = settle(cast(s0, "Pyroclasm"));
    expect({ slaw: charge(s, "slaw"), dead: s.players.user.graveyard.length + s.players.ai.graveyard.length }).toEqual({ slaw: 1, dead: 4 });
  });
  it("⭐ two Shocks, two deaths one after the other — the AI's creatures count too: two counters", () => {
    const s0 = table({ boards: { user: [on("user", "slaw", SLAW), ...many("user", "m", MOUNTAIN, 2)], ai: [on("ai", "ab0", BEARS), on("ai", "ab1", BEARS)] }, hands: { user: [SHOCK, SHOCK] } });
    const s1 = settle(cast(s0, "Shock", "ab0"));
    const s = settle(cast(s1, "Shock", "ab1"));
    expect({ after1: charge(s1, "slaw"), after2: charge(s, "slaw") }).toEqual({ after1: 1, after2: 2 });
  });
  it("the rest of its text (read before this slice) — {2}, sacrifice it with three counters: draw three and gain 3 life — the counters it had as it last existed (CR 608.2h)", () => {
    const s0 = table({ boards: { user: [on("user", "slaw", SLAW, { counters: { charge: 3 } }), ...many("user", "f", FOREST, 2)] } });
    const life = s0.players.user.life;
    const s = settle(act(s0, "user", (a) => a.kind === "activate-ability" && a.permanentId === "slaw", "the sacrifice ability"));
    expect({ hand: s.players.user.hand.length, life: s.players.user.life - life, slaw: perm(s, "slaw"), yard: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ hand: 3, life: 3, slaw: null, yard: ["Simic Slaw"] });
  });
  it("control: sacrificed with no counters — nothing drawn, no life", () => {
    const s0 = table({ boards: { user: [on("user", "slaw", SLAW), ...many("user", "f", FOREST, 2)] } });
    const life = s0.players.user.life;
    const s = settle(act(s0, "user", (a) => a.kind === "activate-ability" && a.permanentId === "slaw", "the sacrifice ability"));
    expect({ hand: s.players.user.hand.length, life: s.players.user.life - life }).toEqual({ hand: 0, life: 0 });
  });
  it("is credited native-mixed", () => {
    expect(classifyCard(SLAW)).toBe("native-mixed");
  });
});

describe("held back and controls", () => {
  it("⛔ Famous Museum: its mana line (one plus one per art counter) is refused — no mana source, and it stays uncredited", () => {
    const s = table({ boards: { user: [on("user", "fm", MUSEUM, { counters: { art: 2 } })] } });
    expect({ prod: manaProduction(MUSEUM), sources: manaSources(s, "user").filter((r) => r.permanentId === "fm").length, tier: classifyCard(MUSEUM) })
      .toEqual({ prod: null, sources: 0, tier: "body-only" });
  });
  it("control (CR 113.10): a quoted ability keeps the name — Gutter Grime's token counts the slime counters on Gutter Grime", () => {
    const [d] = detectTriggers(GUTTER);
    expect(d.effectClause).toBe("put a slime counter on this enchantment, then create a green Ooze creature token with \"This token's power and toughness are each equal to the number of slime counters on Gutter Grime.\"");
  });
});
