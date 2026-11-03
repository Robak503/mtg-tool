/**
 * graspOfFate.test.js — GRASP OF FATE (the play-weighted program, EDHREC #1151):
 *
 *   "When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this
 *    enchantment leaves the battlefield."
 *
 * One target per opponent (effects/atoms/removal.js — the detain frame's per-opponent form; effects/targeting.castSlots — a slot per
 * opponent, each "up to one" of that player's nonland permanents, CR 601.2c): the trigger's targets are chosen as it is put on the stack
 * (CR 603.3d — a person is asked one opponent at a time, the same trigger-target question for each; the default AI takes its chooser's pick, the most valuable), each bound to its player and re-checked so as the trigger
 * resolves (CR 608.2b — a target that is no longer that player's is illegal) and when its target is changed (CR 115.7). The exile is
 * the detain link (CR 610.3): when Grasp of Fate leaves, the cards return under their owners' control; gone before its trigger resolves,
 * nothing is exiled (its ruling, CR 610.3b). Witnessed through real game states, the person and the AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, raiseTriggerTargetChoice, resolveTopOfStack, settleTriggerTargetChoice } from "./gameEngine.js";
import { gainControlIndefinitely } from "./controlMove.js";
import { changeTargetAlternatives } from "./effects/targeting.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GRASP = {"name":"Grasp of Fate","type":"Enchantment","mana":"{1}{W}{W}","oracle":"When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield. (Those permanents return under their owners' control.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1151
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const NATURALIZE = {"name":"Naturalize","type":"Instant","mana":"{1}{G}","oracle":"Destroy target artifact or enchantment.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #2412
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature can't attack or block.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #5236
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","oracle":"Return target creature to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2928
const BANISHING = {"name":"Banishing Light","type":"Enchantment","mana":"{2}{W}","oracle":"When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2372

const SIGNET = {"name":"Arcane Signet","type":"Artifact","mana":"{2}","oracle":"{T}: Add one mana of any color in your commander's color identity.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #3
const CRATERHOOF = {"name":"Craterhoof Behemoth","type":"Creature — Beast","mana":"{5}{G}{G}{G}","oracle":"Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.","layout":"normal","cmc":8,"power":"5","toughness":"5","loyalty":null,"keywords":["Haste"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #299
const SHIVAN = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn.","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #11144
const FORAGERS = {"name":"Bronzebeak Foragers","type":"Creature — Dinosaur","mana":"{3}{W}","oracle":"When this creature enters, for each opponent, exile up to one target nonland permanent that player controls until this creature leaves the battlefield.\n{X}{W}: Put target card with mana value X exiled with this creature into its owner's graveyard. You gain X life.","layout":"normal","cmc":4,"power":"3","toughness":"4","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #4061

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const SOLDIER = { name: "Soldier", type: "Token Creature — Soldier", mana: "", oracle: "", power: "1", toughness: "1", colors: ["W"], keywords: [], token: true };
/**
 * `caster`'s precombat main with Grasp of Fate in hand and {1}{W}{W} (plus `extraPool`) floating; `boards` per seat. A pod unless
 * `headsUp`. The person plays the user seat (state.humanSeats).
 */
function table({ caster = "user", headsUp = false, boards = {}, hand = [], extraPool = {} } = {}) {
  const g = headsUp ? createGameState({ userDeck: [], aiDeck: [] }) : createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const mine = pid === caster;
    players[pid] = { ...players[pid], graveyard: [], library: [], battlefield: boards[pid] || [],
      hand: mine ? [{ ...GRASP, id: "h-grasp" }, ...hand.map((c, i) => ({ ...c, id: `h${i}` }))] : [],
      manaPool: mine ? { W: 2, U: 0, B: 0, R: 0, G: 0, C: 1, ...extraPool } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players };
}
function settle(s) {
  let n = s, g = 0;
  while (g++ < 60) {
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    if (n.stack?.length && !n.pendingChoice) {
      if (n.stack.some((o) => o.awaitingTargets)) break;
      n = resolveTopOfStack(n); continue;
    }
    const fin = finalizeStackResolution(n);
    if (fin.pendingTriggers?.length || (fin.stack?.length && !fin.pendingChoice && !fin.stack.some((o) => o.awaitingTargets))) { n = fin; continue; }
    n = fin;
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return n;
}
/** Cast Grasp of Fate for `caster`; the spell resolves and its enters trigger is put on the stack (asked of the person). */
function castGrasp(s, caster = "user") {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-grasp");
  expect(a, "Grasp of Fate is not offered").toBeTruthy();
  const n = resolveTopOfStack(dispatchAction(s, a));
  return flushTriggers(n, { chooseTargets: chooseTriggerTargets });
}
/** The person's trigger-target question, as one question (Banishing Light's one slot): each row as its sorted target ids joined by "+". */
function question(n) {
  const asked = raiseTriggerTargetChoice(n);
  expect(asked.pendingChoice?.kind, "the person is not asked for the trigger's targets").toBe("trigger-target");
  return { asked, rows: asked.pendingChoice.candidates.map((c) => c.targets.map((t) => t.id).sort().join("+")).sort() };
}
/**
 * ONE OPPONENT AT A TIME (the review of pw26, F2): answer each per-opponent question with the next of `picks` — a target id, or "" for
 * "No target". Records each question: whose permanents it offers and its rows in order ("" = No target). Returns the state after the
 * last answer (the trigger on the stack with its targets), or after the last question raised.
 */
function answerEach(n, picks) {
  const stages = [];
  for (let k = 0; k < 10; k++) {
    const asked = raiseTriggerTargetChoice(n);
    if (asked.pendingChoice?.kind !== "trigger-target") break;
    const cands = asked.pendingChoice.candidates;
    stages.push({ whose: [...new Set(cands.flatMap((c) => c.targets.map((t) => t.controller)))], rows: cands.map((c) => c.targets.map((t) => t.id).join("+")) });
    const want = picks[k] ?? "";
    const pick = cands.find((c) => c.targets.map((t) => t.id).join("+") === want);
    expect(pick, `question ${k + 1}: no row ${want || "No target"}`).toBeTruthy();
    n = settleTriggerTargetChoice(asked, pick.id);
  }
  expect(stages.length, "the person is not asked for the trigger's targets").toBeGreaterThan(0);
  return { s: n, stages };
}
const where = (s, id) => {
  for (const [pid, p] of Object.entries(s.players)) if (p.battlefield.some((x) => x.id === id || x.card?.id === `c-${id}`)) return `${pid}:battlefield`;
  for (const [pid, p] of Object.entries(s.players)) {
    for (const z of ["exile", "graveyard", "hand"]) if ((p[z] || []).some((c) => c.id === `c-${id}`)) return `${pid}:${z}`;
  }
  return "gone";
};
/** A pod: ai1 Hill Giant, Sol Ring and a Forest; ai2 Grizzly Bears; ai3 only a Forest; the person their own Bears. */
const POD = () => ({
  user: [on("user", "ubears", BEARS)],
  ai1: [on("ai1", "giant", GIANT), on("ai1", "sol", SOL), on("ai1", "f1", FOREST)],
  ai2: [on("ai2", "bears", BEARS)],
  ai3: [on("ai3", "f3", FOREST)],
});
const five = (seat) => Array.from({ length: 5 }, (_, i) => on(seat, `${seat}-p${i}`, i % 2 ? SOL : BEARS));
const naturalizeAt = (s) => {
  const grasp = s.players.user.battlefield.find((p) => p.card?.name === "Grasp of Fate");
  return legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && (a.targets || []).some((t) => t.id === grasp?.id));
};

describe("the card", () => {
  it("⭐ native: its one trigger plays", () => {
    expect(classifyCard(GRASP)).toBe("native-trigger");
  });
});

describe("the person's Grasp of Fate — asked one opponent at a time (CR 601.2c, 603.3d)", () => {
  it("⭐ the questions: ai1's nonland permanents or none, then ai2's — never a land, never the person's own; ai3, with only a land, isn't asked", () => {
    const { stages } = answerEach(castGrasp(table({ boards: POD() })), ["", ""]);
    expect(stages).toEqual([{ whose: ["ai1"], rows: ["giant", "sol", ""] }, { whose: ["ai2"], rows: ["bears", ""] }]);
  });
  it("⭐ one of each opponent's: the Giant and ai2's Bears exiled; Grasp of Fate destroyed — both return under their owners' control", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: POD(), hand: [NATURALIZE], extraPool: { G: 1, C: 2 } })), ["giant", "bears"]);
    const s = settle(chosen);
    expect({ giant: where(s, "giant"), bears: where(s, "bears"), sol: where(s, "sol"), mine: where(s, "ubears") })
      .toEqual({ giant: "ai1:exile", bears: "ai2:exile", sol: "ai1:battlefield", mine: "user:battlefield" });
    const nat = naturalizeAt(s);
    expect(nat, "Naturalize at Grasp of Fate is not offered").toBeTruthy();
    const back = settle(dispatchAction(s, nat));
    const names = (pid) => back.players[pid].battlefield.map((p) => p.card?.name).sort();
    expect({ ai1: names("ai1"), ai2: names("ai2"), exiled: [...back.players.ai1.exile, ...back.players.ai2.exile].length })
      .toEqual({ ai1: ["Forest", "Hill Giant", "Sol Ring"], ai2: ["Grizzly Bears"], exiled: 0 });
  });
  it("⭐ up to one: the person takes ai1's Sol Ring alone and leaves ai2 alone", () => {
    const s = settle(answerEach(castGrasp(table({ boards: POD() })), ["sol", ""]).s);
    expect({ sol: where(s, "sol"), giant: where(s, "giant"), bears: where(s, "bears") }).toEqual({ sol: "ai1:exile", giant: "ai1:battlefield", bears: "ai2:battlefield" });
  });
  it("⭐ the review's board: three opponents with five nonland permanents each — the person exiles ai1p3, ai2p4 and ai3p2 together", () => {
    const { s: chosen, stages } = answerEach(castGrasp(table({ boards: { user: [], ai1: five("ai1"), ai2: five("ai2"), ai3: five("ai3") } })), ["ai1-p3", "ai2-p4", "ai3-p2"]);
    const s = settle(chosen);
    expect({ stages: stages.map((q) => [q.whose[0], q.rows.length]), exiled: ["ai1", "ai2", "ai3"].map((p) => s.players[p].exile.map((c) => c.id)) })
      .toEqual({ stages: [["ai1", 6], ["ai2", 6], ["ai3", 6]], exiled: [["c-ai1-p3"], ["c-ai2-p4"], ["c-ai3-p2"]] });
  });
  it("⭐ the review's board: ai2p4 and ai3p4 with none of ai1's", () => {
    const s = settle(answerEach(castGrasp(table({ boards: { user: [], ai1: five("ai1"), ai2: five("ai2"), ai3: five("ai3") } })), ["", "ai2-p4", "ai3-p4"]).s);
    expect(["ai1", "ai2", "ai3"].map((p) => s.players[p].exile.map((c) => c.id))).toEqual([[], ["c-ai2-p4"], ["c-ai3-p4"]]);
  });
  it("⭐ heads-up: one question — the opponent's nonland permanents, or none", () => {
    const { stages } = answerEach(castGrasp(table({ headsUp: true, boards: { ai: [on("ai", "giant", GIANT), on("ai", "sol", SOL), on("ai", "f1", FOREST)] } })), [""]);
    expect(stages).toEqual([{ whose: ["ai"], rows: ["giant", "sol", ""] }]);
  });
  it("⭐ its ruling — a token exiled ceases to exist and doesn't return", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: { ai1: [on("ai1", "tok", SOLDIER)], ai2: [], ai3: [] }, hand: [NATURALIZE], extraPool: { G: 1, C: 2 } })), ["tok"]);
    const s = settle(chosen);
    const nat = naturalizeAt(s);
    expect(nat).toBeTruthy();
    const back = settle(dispatchAction(s, nat));
    expect({ tok: where(back, "tok"), ai1: back.players.ai1.battlefield.length }).toEqual({ tok: "gone", ai1: 0 });
  });
  it("⭐ its ruling — Grasp of Fate gone before its trigger resolves (Naturalize in response): nothing is exiled", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: POD(), hand: [NATURALIZE], extraPool: { G: 1, C: 2 } })), ["giant", "bears"]);
    const nat = naturalizeAt(chosen);
    expect(nat, "Naturalize in response is not offered").toBeTruthy();
    const s = settle(dispatchAction(chosen, nat));
    expect({ giant: where(s, "giant"), bears: where(s, "bears"), grasp: s.players.user.graveyard.some((c) => c.name === "Grasp of Fate") })
      .toEqual({ giant: "ai1:battlefield", bears: "ai2:battlefield", grasp: true });
  });
  it("⭐ one target returned to its owner's hand in response (Unsummon): the other is still exiled", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: POD(), hand: [UNSUMMON], extraPool: { U: 1 } })), ["giant", "bears"]);
    const un = legalActionsForPlayer(chosen, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && (a.targets || []).some((t) => t.id === "bears"));
    expect(un, "Unsummon in response is not offered").toBeTruthy();
    const s = settle(dispatchAction(chosen, un));
    expect({ giant: where(s, "giant"), bears: where(s, "bears") }).toEqual({ giant: "ai1:exile", bears: "ai2:hand" });
  });
  it("⭐ \"that player controls\": ai1's Giant passing to ai2 before the trigger resolves is no longer a legal target — it stays (CR 608.2b)", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: POD() })), ["giant", "bears"]);
    const moved = gainControlIndefinitely(chosen, "giant", "ai2");
    expect(moved.players.ai2.battlefield.some((p) => p.id === "giant")).toBe(true);
    const s = settle(moved);
    expect({ giant: where(s, "giant"), bears: where(s, "bears") }).toEqual({ giant: "ai2:battlefield", bears: "ai2:exile" });
  });
  it("⭐ changing the target (Bolt Bend's offer) keeps it to that player's permanents: ai1's Giant can become ai1's Sol Ring, never ai2's Bears", () => {
    const { s: chosen } = answerEach(castGrasp(table({ boards: POD() })), ["giant", ""]);
    const obj = chosen.stack.find((o) => /Grasp of Fate/.test(String(o.source?.name || o.source || "")));
    expect(obj, "the trigger is not on the stack").toBeTruthy();
    expect((changeTargetAlternatives(chosen, obj) || []).map((t) => t.id).sort()).toEqual(["sol"]);
  });
  it("its ruling — an Aura on an exiled creature is put into its owner's graveyard", () => {
    const pod = POD();
    pod.user = [...pod.user, on("user", "pac", PACIFISM)];
    const { s: chosen } = answerEach(castGrasp(attachPermanent(table({ boards: pod }), { equipId: "pac", targetId: "giant" })), ["giant", ""]);
    const s = settle(chosen);
    expect({ giant: where(s, "giant"), pacifism: s.players.user.graveyard.some((c) => c.name === "Pacifism") }).toEqual({ giant: "ai1:exile", pacifism: true });
  });
  it("the same reader asks a person's Bronzebeak Foragers one opponent at a time (it stays uncredited — its {X}{W} ability doesn't read)", () => {
    let s0 = table({ boards: POD() });
    s0 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...FORAGERS, id: "h-for" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 3 } } } };
    const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-for");
    expect(a, "Bronzebeak Foragers is not offered").toBeTruthy();
    const { stages } = answerEach(flushTriggers(resolveTopOfStack(dispatchAction(s0, a)), { chooseTargets: chooseTriggerTargets }), ["", ""]);
    expect({ tier: classifyCard(FORAGERS), stages: stages.map((q) => q.whose[0]) }).toEqual({ tier: "body-only", stages: ["ai1", "ai2"] });
  });
});

describe("the control", () => {
  it("control — Banishing Light's one target is unchanged: any opponent's nonland permanent, one question", () => {
    let s0 = table({ boards: POD() });
    s0 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...BANISHING, id: "h-ban" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 } } } };
    const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-ban");
    expect(a, "Banishing Light is not offered").toBeTruthy();
    const { rows } = question(flushTriggers(resolveTopOfStack(dispatchAction(s0, a)), { chooseTargets: chooseTriggerTargets }));
    expect(rows).toEqual(["bears", "giant", "sol"]);
  });
});

describe("the default AI", () => {
  it("⭐ casts it and exiles one nonland permanent of each opponent, never its own — no question asked", () => {
    const boards = { user: [on("user", "ubears", BEARS)], ai1: [on("ai1", "own", GIANT)], ai2: [on("ai2", "sol", SOL)], ai3: [on("ai3", "f3", FOREST)] };
    const s0 = table({ caster: "ai1", boards });
    expect(pickAction(s0, "ai1", legalActionsForPlayer(s0, "ai1"))?.cardId).toBe("h-grasp");
    const n = castGrasp(s0, "ai1");
    expect(raiseTriggerTargetChoice(n).pendingChoice ?? null).toBeNull();
    const s = settle(n);
    expect({ ubears: where(s, "ubears"), sol: where(s, "sol"), own: where(s, "own"), f3: where(s, "f3") })
      .toEqual({ ubears: "user:exile", sol: "ai2:exile", own: "ai1:battlefield", f3: "ai3:battlefield" });
  });
  it("⭐ the review's boards (F3): it exiles the person's Craterhoof Behemoth, not their Arcane Signet, and ai2's Shivan Dragon, not its Sol Ring", () => {
    const boards = { user: [on("user", "signet", SIGNET), on("user", "hoof", CRATERHOOF)], ai1: [], ai2: [on("ai2", "sol", SOL), on("ai2", "shivan", SHIVAN)], ai3: [] };
    const s = settle(castGrasp(table({ caster: "ai1", boards }), "ai1"));
    expect({ hoof: where(s, "hoof"), signet: where(s, "signet"), shivan: where(s, "shivan"), sol: where(s, "sol") })
      .toEqual({ hoof: "user:exile", signet: "user:battlefield", shivan: "ai2:exile", sol: "ai2:battlefield" });
  });
});
