/**
 * wardCopies.test.js — a COPY put onto the stack with a target on an opponent's ward permanent raises that ward (CR 702.21a, 707.10,
 * 707.10c; 2026-10-20).
 *
 * "To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack … A copy of a spell or ability
 * copies both the characteristics of the spell or ability and all decisions made for it, including … targets" (CR 707.10); "Once the
 * player has decided what the copy's targets will be, the copy is put onto the stack with those targets" (CR 707.10c). The copy is a
 * spell or ability its copier controls, so each permanent it targets becomes the target of a spell or ability that player controls
 * — the bundled Blue Ribbon ruling: "If you copy the spell, the second creature becomes the target of the copy" — and an opponent's
 * ward triggers (CR 702.21a). Before, no copy site recorded a ward: a Twincast copy re-aimed at the opponent's Leonin Lightbringer
 * destroyed it free, a storm copy and an Illusionist's Bracers copy pinged it free. Now each copy site records the ward on the copy
 * (`wardOwed`, as the redirect path moveStackTarget does) and the session driver asks it before anyone receives priority
 * (gameEngine.raiseWardOwed). A copy of a spell that can't be countered asks nothing (CR 701.6a); a copy aimed at its copier's own
 * ward permanent asks nothing.
 *
 * Engine paths: the session driver (advanceUntilDecision / applyChoice / applyPendingChoice) for the person's spells, abilities and
 * answers; dispatchAction for an AI seat's spell. Real oracle fixtures (bundled Scryfall oracle-index.json, read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall) ──
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"Destroy target creature."};
const VOID_REND = {"name":"Void Rend","type":"Instant","mana":"{W}{U}{B}","cmc":3,"keywords":[],"colors":["B","U","W"],"colorIdentity":["B","U","W"],"oracle":"This spell can't be countered.\nDestroy target nonland permanent."};
const TWINCAST = {"name":"Twincast","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."};
const SCATTERSHOT = {"name":"Scattershot","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":["Storm"],"colors":["R"],"colorIdentity":["R"],"oracle":"Scattershot deals 1 damage to target creature.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"};
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
const ILLUSIONISTS_BRACERS = {"name":"Illusionist's Bracers","type":"Artifact — Equipment","mana":"{2}","cmc":2,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {3}"};
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature gets +3/+3 until end of turn."};
const WEAVER_OF_LIGHTNING = {"name":"Weaver of Lightning","type":"Creature — Human Shaman","mana":"{2}{R}","cmc":3,"power":"1","toughness":"4","keywords":["Reach"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach (This creature can block creatures with flying.)\nWhenever you cast an instant or sorcery spell, this creature deals 1 damage to target creature an opponent controls."};
const STRIONIC_RESONATOR = {"name":"Strionic Resonator","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy. (A triggered ability uses the words \"when,\" \"whenever,\" or \"at.\")"};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};

const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ id, ...card });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

/** A two-seat game in a precombat main phase, the stack empty; the user seat is a person (state.humanSeats). */
function board({ user = [], ai = [], hand = [], aiHand = [], userPool = EMPTY, aiPool = EMPTY, active = "user", userSpells = 0 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, humanSeats: ["user"], turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...userPool }, library: LIB("user"), spellsCastThisTurn: userSpells },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, manaPool: { ...g.players.ai.manaPool, ...aiPool }, library: LIB("ai") } } };
}
const session = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });
const targetsOf = (a) => (a.targets || []).map((t) => t.id).sort().join(",");
const option = (r, pred) => {
  const action = (r.decision.options || []).find(pred);
  if (!action) throw new Error(`no such option: ${JSON.stringify((r.decision.options || []).map((a) => [a.kind, a.cardId ?? a.permanentId, targetsOf(a)]))}`);
  return action;
};
/** Pass priority while the stack holds anything and the person is asked to act. */
function passUntilEmpty(r) {
  let cur = r;
  for (let i = 0; i < 12 && cur.decision.kind === "ask" && cur.session.state.stack.length; i++) cur = applyChoice(cur.session, option(cur, (a) => a.kind === "pass-priority"));
  return cur;
}
const answer = (r, pay) => applyPendingChoice(r.session, { kind: "soft-counter", pay });
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.spellName, e.sourceName]);
const MANA = (generic) => ({ kind: "mana", mana: { generic, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
const decisionRow = (d) => ({ kind: d.kind, controller: d.controller ?? null, spellName: d.spellName ?? null, sourceName: d.sourceName ?? null, cost: d.cost ?? null });

/**
 * The AI casts `card` at the person's Grizzly Bears; the person, holding priority, Twincasts it. The copy is the person's, and its
 * target (the person's own Bears, the wrong side for a destroy) is re-aimed at the AI's only creature (newTargetsForCopy). Returns
 * the driver's first stop after the Twincast resolves.
 */
function twincastTheirs(card, aiCreature = LEONIN_LIGHTBRINGER, aiPool = { ...EMPTY, B: 3 }) {
  const start = board({ active: "ai", user: [P("ubear", GRIZZLY_BEARS, "user")], ai: [P("theirs", aiCreature, "ai")], hand: [H("twin", TWINCAST), H("opt", OPT)], userPool: { ...EMPTY, U: 3, C: 2 }, aiHand: [H("aispell", card)], aiPool });
  const cast = dispatchAction(start, legalActionsForPlayer(start, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "aispell" && targetsOf(a) === "ubear"));
  const asked = advanceUntilDecision(session(cast));
  const spellId = asked.session.state.stack[0].id;
  return passUntilEmpty(applyChoice(asked.session, option(asked, (a) => a.kind === "cast-spell" && a.cardId === "twin" && targetsOf(a) === spellId)));
}

describe("a copy of a spell with a new target (Twincast — CR 707.10c)", () => {
  it("⭐ the AI's Murder at your Grizzly Bears, your Twincast copies it and the copy goes at the AI's Leonin Lightbringer: you are asked its {2} — declining counters the copy and the Lightbringer lives (before: the copy destroyed it free)", () => {
    const asked = twincastTheirs(MURDER);
    const declined = passUntilEmpty(answer(asked, false)).session.state;
    const paid = passUntilEmpty(answer(twincastTheirs(MURDER), true)).session.state;
    const row = { ask: decisionRow(asked.decision), declinedAi: names(declined, "ai"), declinedUser: names(declined, "user"), paidAi: names(paid, "ai") };
    console.log(`  WITNESS twincast-new-target ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      declinedAi: ["Leonin Lightbringer"], declinedUser: [], paidAi: [] });
  });

  it("⭐ a copy that keeps its target is put onto the stack with it too: your Murder at the AI's Lightbringer (the {2} paid), then your Twincast on your own Murder — the copy keeps the Lightbringer and asks its {2} again (before: once)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER), H("twin", TWINCAST), H("opt", OPT)], userPool: { ...EMPTY, B: 3, U: 3, C: 4 } });
    const first = advanceUntilDecision(session(start));
    const murdered = answer(applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "murder" && targetsOf(a) === "light")), true);
    const murderId = murdered.session.state.stack[0].id;
    const twinned = passUntilEmpty(applyChoice(murdered.session, option(murdered, (a) => a.kind === "cast-spell" && a.cardId === "twin" && targetsOf(a) === murderId)));
    const row = { second: decisionRow(twinned.decision), asks: wardAsks(twinned.session.state) };
    console.log(`  WITNESS twincast-kept-target ${JSON.stringify(row)}`);
    expect(row).toEqual({ second: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      asks: [["user", "Murder", "Leonin Lightbringer"], ["user", "Murder", "Leonin Lightbringer"]] });
  });

  it("control: the copy re-aimed at a creature without ward asks nothing and destroys it (both trees)", () => {
    const end = passUntilEmpty(twincastTheirs(MURDER, HILL_GIANT)).session.state;
    expect({ asks: wardAsks(end), ai: names(end, "ai"), user: names(end, "user") }).toEqual({ asks: [], ai: [], user: [] });
  });

  it("control: a copy of a spell that can't be countered (Void Rend) re-aimed at the Lightbringer asks nothing (CR 701.6a; both trees)", () => {
    const end = passUntilEmpty(twincastTheirs(VOID_REND, LEONIN_LIGHTBRINGER, { ...EMPTY, W: 1, U: 1, B: 1 })).session.state;
    expect({ asks: wardAsks(end), ai: names(end, "ai") }).toEqual({ asks: [], ai: [] });
  });

  it("control: a copy aimed at its copier's own ward creature asks nothing — your Giant Growth on your Lightbringer, and Twincast's copy keeps it (both trees)", () => {
    const start = board({ user: [P("ulight", LEONIN_LIGHTBRINGER, "user")], hand: [H("growth", GIANT_GROWTH), H("twin", TWINCAST), H("opt", OPT)], userPool: { ...EMPTY, G: 1, U: 3 } });
    const first = advanceUntilDecision(session(start));
    const grown = applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "growth" && targetsOf(a) === "ulight"));
    const growthId = grown.session.state.stack[0].id;
    const end = passUntilEmpty(applyChoice(grown.session, option(grown, (a) => a.kind === "cast-spell" && a.cardId === "twin" && targetsOf(a) === growthId))).session.state;
    expect({ asks: wardAsks(end), stack: end.stack.length, log: (end.log || []).filter((e) => e.effect === "copy-instant-or-sorcery").map((e) => e.count) }).toEqual({ asks: [], stack: 0, log: [1] });
  });
});

describe("a storm copy (CR 702.40a), a copied activated ability (Illusionist's Bracers) and a copied triggered ability (Strionic Resonator)", () => {
  it("⭐ your Scattershot, the second spell this turn, at the AI's Lightbringer: the spell asks the {2} and so does its storm copy at the Lightbringer — declining the copy's leaves the Lightbringer alive with 1 damage (before: the copy's 1 damage was free and killed it)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("scatter", SCATTERSHOT), H("opt", OPT)], userPool: { ...EMPTY, R: 1, U: 1, C: 6 }, userSpells: 1 });
    const first = advanceUntilDecision(session(start));
    const paid = answer(applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "scatter" && targetsOf(a) === "light")), true);
    const copyAsked = passUntilEmpty(paid);
    const end = passUntilEmpty(answer(copyAsked, false)).session.state;
    const light = end.players.ai.battlefield.find((p) => p.id === "light");
    const row = { copyAsk: decisionRow(copyAsked.decision), asks: wardAsks(end), lightDamage: light?.damageMarked ?? null };
    console.log(`  WITNESS storm-copy ${JSON.stringify(row)}`);
    expect(row).toEqual({ copyAsk: { kind: "soft-counter", controller: "user", spellName: "Scattershot", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      asks: [["user", "Scattershot", "Leonin Lightbringer"], ["user", "Scattershot", "Leonin Lightbringer"]], lightDamage: 1 });
  });

  it("⭐ your Prodigal Pyromancer wearing Illusionist's Bracers pings the AI's Lightbringer: the ability asks the {2}, and so does the Bracers' copy of it (before: the copy was free)", () => {
    const pyro = P("pyro", PRODIGAL_PYROMANCER, "user", { attachments: ["bracers"] });
    const bracers = P("bracers", ILLUSIONISTS_BRACERS, "user", { attachedTo: "pyro" });
    const start = board({ user: [pyro, bracers], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("opt", OPT)], userPool: { ...EMPTY, U: 1, C: 4 } });
    const first = advanceUntilDecision(session(start));
    const paid = answer(applyChoice(first.session, option(first, (a) => a.kind === "activate-ability" && a.permanentId === "pyro" && targetsOf(a) === "light")), true);
    const copyAsked = passUntilEmpty(paid);
    const row = { copyAsk: decisionRow(copyAsked.decision), asks: wardAsks(copyAsked.session.state) };
    console.log(`  WITNESS bracers-copy ${JSON.stringify(row)}`);
    expect(row).toEqual({ copyAsk: { kind: "soft-counter", controller: "user", spellName: "Prodigal Pyromancer", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      asks: [["user", "Prodigal Pyromancer", "Leonin Lightbringer"], ["user", "Prodigal Pyromancer", "Leonin Lightbringer"]] });
  });

  it("⭐ your Strionic Resonator copies your Weaver of Lightning's ping at the AI's Lightbringer (its {2} paid): the copy asks the {2} again (before: the copy was free)", () => {
    const start = board({ user: [P("weaver", WEAVER_OF_LIGHTNING, "user"), P("res", STRIONIC_RESONATOR, "user")], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("opt", OPT), H("opt2", OPT)], userPool: { ...EMPTY, U: 2, C: 6 } });
    const first = advanceUntilDecision(session(start));
    const paid = answer(applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "opt")), true);
    const pingId = paid.session.state.stack.find((o) => o.kind === "triggered-ability")?.id;
    const copyAsked = passUntilEmpty(applyChoice(paid.session, option(paid, (a) => a.kind === "activate-ability" && a.permanentId === "res" && targetsOf(a) === pingId)));
    const row = { copyAsk: decisionRow(copyAsked.decision), asks: wardAsks(copyAsked.session.state) };
    console.log(`  WITNESS resonator-copy ${JSON.stringify(row)}`);
    expect(row).toEqual({ copyAsk: { kind: "soft-counter", controller: "user", spellName: "Weaver of Lightning", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      asks: [["user", "Weaver of Lightning", "Leonin Lightbringer"], ["user", "Weaver of Lightning", "Leonin Lightbringer"]] });
  });

  it("control: the storm copy at a creature without ward asks nothing (both trees)", () => {
    const start = board({ ai: [P("giant", HILL_GIANT, "ai")], hand: [H("scatter", SCATTERSHOT), H("opt", OPT)], userPool: { ...EMPTY, R: 1, U: 1, C: 2 }, userSpells: 1 });
    const first = advanceUntilDecision(session(start));
    const end = passUntilEmpty(applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "scatter" && targetsOf(a) === "giant"))).session.state;
    expect({ asks: wardAsks(end), damage: end.players.ai.battlefield.find((p) => p.id === "giant")?.damageMarked ?? null }).toEqual({ asks: [], damage: 2 });
  });
});
