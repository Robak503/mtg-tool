/**
 * swatMovedTarget.test.js — the copy-targets review's round-3 note R3-N1 (LOW, a false positive): a person's Deflecting Swat decided which
 * of a spell's targets had changed BY POSITION, so a target merely moved from one instance of "target" to another was treated as new — its
 * ward was charged again and its becomes-the-target triggers triggered again. It was already a target of that spell, so it doesn't BECOME
 * one (CR 702.21a — ward: "Whenever this permanent becomes the target of a spell or ability an opponent controls"; CR 601.2c, 115.7d).
 * Decided by identity now — the targets the spell did not already have — as the house deflection (applyRetarget) decides its events.
 *
 * The board (the review's): ai1 casts Seeds of Strength with its three instances at ai1's Hill Giant, ai2's creature and ai1's Hill Giant.
 * The person Swats it: instance 1 → ai2's creature (moved from instance 2), instance 2 → ai3's Grizzly Bears, instance 3 kept.
 *   · ai2's creature is Leonin Lightbringer (ward {2}): ward is asked of ai1 once — at the cast — not again after the Swat.
 *   · ai2's creature is Phantasmal Bear: one sacrifice trigger, from the cast; none from the Swat.
 *   · controls (the same on both trees): a Swat that sends the instance to a creature the spell did NOT target charges its ward (and runs
 *     its trigger) — the identity test still sees a new target.
 *   · the house deflection had the same defect in its ward (its events were already by identity): the person's Seeds at ai1's Hill Giant /
 *     ai2's Lightbringer / ai1's Hill Giant, ai1 Swats it, and the house moves every instance onto the Lightbringer — the person was asked
 *     its {2} a second time. Asked once now. And on an AI's spell (the blind review's F6 — the one place this slice changes AI play): ai2's
 *     Seeds at ai1's Hill Giant / ai3's Lightbringer / ai1's Hill Giant, with exactly {G}{W}{2} — the ward paid at the cast — and ai1's house
 *     Swat moves every instance onto the Lightbringer: ai2 is asked once and the Seeds resolves (before: asked again, it couldn't pay, and
 *     the Seeds was countered).
 *
 * Card text: the bundled Scryfall oracle (scryfall-bulk/oracle_cards.json, read 2026-11-04), never typed. Driven through the session driver
 * (advanceUntilDecision / applyChoice / applyPendingChoice), a four-seat Commander pod.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle ──
const SEEDS_OF_STRENGTH = {"name":"Seeds of Strength","type":"Instant","mana":"{G}{W}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G","W"],"colorIdentity":["G","W"],"layout":"normal","oracle":"Target creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn."}; // EDHREC #26703
const DEFLECTING_SWAT = {"name":"Deflecting Swat","type":"Instant","mana":"{2}{R}","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability."}; // EDHREC #74
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."}; // EDHREC #22619
const PHANTASMAL_BEAR = {"name":"Phantasmal Bear","type":"Creature — Bear Illusion","mana":"{U}","cmc":1,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"layout":"normal","oracle":"When this creature becomes the target of a spell or ability, sacrifice it."}; // EDHREC #22542
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":""}; // EDHREC #29123
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"],"layout":"normal","oracle":""}; // EDHREC #8126
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"Lightning Bolt deals 3 damage to any target."}; // EDHREC #157

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const SEATS = ["user", "ai1", "ai2", "ai3"];

/** A four-seat pod in the person's precombat main phase, the stack empty; the person also holds a Lightning Bolt they never cast, so the
 *  driver stops at each of their priorities. */
function pod({ boards = {}, hand = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const pid of SEATS) {
    const mine = pid === "user";
    players[pid] = { ...players[pid], life: 40, graveyard: [], library: LIB(pid), battlefield: boards[pid] || [], hand: mine ? [...hand, { id: "bolt", ...LIGHTNING_BOLT }] : [],
      manaPool: mine ? { ...players[pid].manaPool, ...FULL } : players[pid].manaPool };
  }
  return { ...g, humanSeats: ["user"], turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const session = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });
const ids = (ts) => (ts || []).map((t) => t.id).join("+");
const stackId = (s, name) => s.stack.find((o) => o.source?.name === name)?.id;
/** `seat` casts `card` at `targetIds` (joined by "+") with its pool full; the person holds priority after. */
function opponentCasts(state, seat, card, cardId, targetIds) {
  const withCard = { ...state, priorityHolder: seat, players: { ...state.players, [seat]: { ...state.players[seat], hand: [...state.players[seat].hand, { id: cardId, ...card }], manaPool: { ...state.players[seat].manaPool, ...FULL } } } };
  const a = legalActionsForPlayer(withCard, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && ids(x.targets) === targetIds);
  expect(a, `${seat} can't cast ${cardId} at ${targetIds}`).toBeTruthy();
  return { ...dispatchAction(withCard, a), priorityHolder: "user", consecutivePasses: 0 };
}
/** From the driver stop `r`, the person casts `cardId` at `targetIds`. */
function castFrom(r, cardId, targetIds) {
  const action = (r.decision?.options || []).find((a) => a.kind === "cast-spell" && a.cardId === cardId && ids(a.targets) === targetIds);
  expect(action, `no cast of ${cardId} at ${targetIds}`).toBeTruthy();
  return applyChoice(r.session, action);
}
/** Pass the person's priority until the driver asks something else (or the stack empties). */
function passUntilAsked(r) {
  for (let k = 0; k < 40; k++) {
    if (!Array.isArray(r.decision?.options)) return r;
    if (!(r.session.state.stack || []).length) return r;
    const pass = (r.decision.options || []).find((a) => a.kind === "pass-priority");
    if (!pass) return r;
    r = applyChoice(r.session, pass);
  }
  return r;
}
/** Answer the Swat's questions in order ("keep", or a row's target id); returns the stop after the last and the rows asked. */
function answer(r, picks) {
  const asked = [];
  for (const want of picks) {
    r = passUntilAsked(r);
    if (r.decision?.kind === "optional-effect") r = passUntilAsked(applyPendingChoice(r.session, { kind: "optional-effect", take: true }));
    const d = r.decision;
    if (d?.kind !== "copy-targets") { asked.push({ kind: d?.kind ?? null }); break; }
    asked.push({ slot: d.slotNumber, of: d.slotCount });
    const c = (d.candidates || []).find((x) => (want === "keep" ? x.keep : !x.keep && ids(x.targets) === want));
    expect(c, `slot ${d.slotNumber}: no row ${want}`).toBeTruthy();
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: c.id });
  }
  return { r, asked };
}
/** Pass until the stack is empty. */
function drain(r) {
  for (let k = 0; k < 60 && (r.session.state.stack || []).length; k++) {
    const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
    if (!pass) break;
    r = applyChoice(r.session, pass);
  }
  return r;
}
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.spellName, e.sourceName]);
/** ai1's Seeds of Strength at `at` (by default ai1's Hill Giant / ai2's `creature`, id `x` / ai1's Hill Giant), the person holding Deflecting
 *  Swat; ai3 has Grizzly Bears. Returns the driver's first stop (ai1's ward, if any, is settled by the driver before the person's priority). */
function seedsBoard(creature, at = "a1giant+x+a1giant") {
  const s = opponentCasts(pod({ hand: [{ id: "swat", ...DEFLECTING_SWAT }], boards: { ai1: [P("a1giant", HILL_GIANT, "ai1")], ai2: [P("x", creature, "ai2")], ai3: [P("a3bear", GRIZZLY_BEARS, "ai3")] } }),
    "ai1", SEEDS_OF_STRENGTH, "seeds", at);
  return { s, first: advanceUntilDecision(session(s)) };
}
/** The person Swats the Seeds and answers its three instances `picks`; returns the state once the last is answered (`answered` — the
 *  triggers it put on the stack are there), the final state and the slots asked. */
function swatSeeds({ s, first }, picks) {
  const { r, asked } = answer(castFrom(first, "swat", stackId(s, "Seeds of Strength")), picks);
  return { answered: r.session.state, end: drain(r).session.state, asked };
}
const seedsTargets = (st) => (st.log || []).filter((e) => e.effect === "retarget").map((e) => e.to);

describe("R3-N1 — a person's Deflecting Swat charges ward and runs becomes-the-target triggers only for targets the spell did not already have (CR 702.21a, 601.2c, 115.7d)", () => {
  it("⭐ ward: ai1's Seeds at its Giant / ai2's Leonin Lightbringer / its Giant; the person moves instance 1 onto the Lightbringer, instance 2 onto ai3's Bears and keeps instance 3 — ward is asked of ai1 once (at the cast), not again", () => {
    const { end, asked } = swatSeeds(seedsBoard(LEONIN_LIGHTBRINGER), ["x", "a3bear", "keep"]);
    const row = { asked: asked.map((a) => a.slot), to: seedsTargets(end), asks: wardAsks(end) };
    console.log(`  WITNESS r3n1-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [1, 2, 3], to: [["Leonin Lightbringer", "Grizzly Bears", "Hill Giant"]], asks: [["ai1", "Seeds of Strength", "Leonin Lightbringer"]] });
  });

  it("⭐ becomes-the-target: the same Swat with ai2's Phantasmal Bear in the Lightbringer's place — one sacrifice trigger (the cast's), none from the Swat", () => {
    const { answered, end } = swatSeeds(seedsBoard(PHANTASMAL_BEAR), ["x", "a3bear", "keep"]);
    // Its triggers once the Swat is answered: on the stack, and any still waiting to go on it.
    const bearTriggers = answered.stack.filter((o) => o.kind === "triggered-ability" && o.source?.name === "Phantasmal Bear").length
      + (answered.pendingTriggers || []).filter((t) => (t.source?.name ?? t.sourceName) === "Phantasmal Bear").length;
    const row = { to: seedsTargets(end), bearTriggers, ai2: end.players.ai2.battlefield.map((p) => p.id), ai2gy: end.players.ai2.graveyard.map((c) => c.id) };
    console.log(`  WITNESS r3n1-bear ${JSON.stringify(row)}`);
    expect(row).toEqual({ to: [["Phantasmal Bear", "Grizzly Bears", "Hill Giant"]], bearTriggers: 1, ai2: [], ai2gy: ["c-x"] });
  });

  it("control (the same on both trees): a target the spell did NOT have is still new — ai1's Seeds at its Giant / ai3's Bears / its Giant, the person moves instance 2 onto ai2's Lightbringer: ward is asked once, after the Swat", () => {
    const { end } = swatSeeds(seedsBoard(LEONIN_LIGHTBRINGER, "a1giant+a3bear+a1giant"), ["keep", "x", "keep"]);
    expect({ to: seedsTargets(end), asks: wardAsks(end) }).toEqual({ to: [["Hill Giant", "Leonin Lightbringer", "Hill Giant"]], asks: [["ai1", "Seeds of Strength", "Leonin Lightbringer"]] });
  });

  it("control (the same on both trees): a Phantasmal Bear the Swat newly targets triggers — ai1's Seeds at its Giant / ai3's Bears / its Giant, instance 2 moved onto ai2's Phantasmal Bear: it is sacrificed", () => {
    const { end } = swatSeeds(seedsBoard(PHANTASMAL_BEAR, "a1giant+a3bear+a1giant"), ["keep", "x", "keep"]);
    expect({ to: seedsTargets(end), ai2: end.players.ai2.battlefield.map((p) => p.id), ai2gy: end.players.ai2.graveyard.map((c) => c.id) }).toEqual({ to: [["Hill Giant", "Phantasmal Bear", "Hill Giant"]], ai2: [], ai2gy: ["c-x"] });
  });
});

describe("R3-N1's class in the house deflection (applyRetarget): its ward is charged only for targets the spell did not already have (CR 702.21a)", () => {
  /** The person's Seeds at `at` (ai2's Leonin Lightbringer is `x`; its ward paid at the cast), then ai1's Deflecting Swat at it; every later ward
   *  question paid. Returns the final state. */
  function houseSwat(at) {
    let r = advanceUntilDecision(session(pod({ hand: [{ id: "seeds", ...SEEDS_OF_STRENGTH }], boards: { ai1: [P("a1giant", HILL_GIANT, "ai1")], ai2: [P("x", LEONIN_LIGHTBRINGER, "ai2")], ai3: [P("a3bear", GRIZZLY_BEARS, "ai3")] } })));
    r = castFrom(r, "seeds", at);
    for (let k = 0; k < 5 && r.decision?.kind === "soft-counter"; k++) r = applyPendingChoice(r.session, { kind: "soft-counter", pay: true });
    const s1 = r.session.state;
    let r2 = advanceUntilDecision(session(opponentCasts(s1, "ai1", DEFLECTING_SWAT, "aiswat", stackId(s1, "Seeds of Strength"))));
    for (let k = 0; k < 20; k++) {
      if (r2.decision?.kind === "soft-counter") { r2 = applyPendingChoice(r2.session, { kind: "soft-counter", pay: true }); continue; }
      const pass = (r2.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass || !(r2.session.state.stack || []).length) break;
      r2 = applyChoice(r2.session, pass);
    }
    return r2.session.state;
  }

  it("⭐ the person's Seeds at ai1's Giant / ai2's Lightbringer / ai1's Giant, ai1 Swats it: the house moves every instance onto the Lightbringer — already a target, so its ward is asked once (at the cast), not again", () => {
    const end = houseSwat("a1giant+x+a1giant");
    const row = { to: seedsTargets(end), asks: wardAsks(end) };
    console.log(`  WITNESS r3n1-house ${JSON.stringify(row)}`);
    expect(row).toEqual({ to: [["Leonin Lightbringer", "Leonin Lightbringer", "Leonin Lightbringer"]], asks: [["user", "Seeds of Strength", "Leonin Lightbringer"]] });
  });

  it("control (the same on both trees): the person's Seeds at ai1's Giant ×3, ai1 Swats it onto the Lightbringer — a new target, so its ward is asked (once)", () => {
    const end = houseSwat("a1giant+a1giant+a1giant");
    expect({ to: seedsTargets(end), asks: wardAsks(end) }).toEqual({ to: [["Leonin Lightbringer", "Leonin Lightbringer", "Leonin Lightbringer"]], asks: [["user", "Seeds of Strength", "Leonin Lightbringer"]] });
  });
});

describe("the blind review's F6 — the house deflection on an AI's spell: a target the spell already had charges no second ward (CR 702.21a)", () => {
  it("⭐ ai2's Seeds of Strength at ai1's Hill Giant / ai3's Leonin Lightbringer / ai1's Hill Giant, ai2 holding exactly {G}{W}{2} (the {2} pays the ward at the cast); ai1's Swat moves all three instances onto the Lightbringer — ward asked once, and the Seeds resolves: the Lightbringer is a 6/5", () => {
    const s0 = pod({ boards: { ai1: [P("a1giant", HILL_GIANT, "ai1")], ai3: [P("leo", LEONIN_LIGHTBRINGER, "ai3")] } });
    const exact = { ...s0.players.ai2.manaPool, W: 1, U: 0, B: 0, R: 0, G: 1, C: 2 };
    const withSeeds = { ...s0, priorityHolder: "ai2", players: { ...s0.players, ai2: { ...s0.players.ai2, hand: [{ id: "seeds", ...SEEDS_OF_STRENGTH }], manaPool: exact } } };
    const cast = legalActionsForPlayer(withSeeds, "ai2").find((x) => x.kind === "cast-spell" && x.cardId === "seeds" && ids(x.targets) === "a1giant+leo+a1giant");
    expect(cast, "ai2 can't cast Seeds of Strength at a1giant+leo+a1giant").toBeTruthy();
    // The driver settles ai2's ward at the cast (it pays its last {2}) and stops at the person's priority.
    const paid = advanceUntilDecision(session({ ...dispatchAction(withSeeds, cast), priorityHolder: "user", consecutivePasses: 0 })).session.state;
    const poolAfterWard = Object.values(paid.players.ai2.manaPool).reduce((a, b) => a + (b || 0), 0);
    const swatted = opponentCasts(paid, "ai1", DEFLECTING_SWAT, "aiswat", stackId(paid, "Seeds of Strength"));
    const end = drain(advanceUntilDecision(session(swatted))).session.state;
    const leo = end.players.ai3.battlefield.find((x) => x.id === "leo");
    const row = { poolAfterWard, to: seedsTargets(end), asks: wardAsks(end), leoPower: leo ? creaturePower(leo, end) : null,
      countered: (end.log || []).some((e) => e.kind === "spell-effect" && e.effect === "counter" && e.cardName === "Seeds of Strength") };
    console.log(`  WITNESS f6-house-ai-spell ${JSON.stringify(row)}`);
    expect(row).toEqual({ poolAfterWard: 0, to: [["Leonin Lightbringer", "Leonin Lightbringer", "Leonin Lightbringer"]], asks: [["ai2", "Seeds of Strength", "Leonin Lightbringer"]], leoPower: 6, countered: false });
  });
});
