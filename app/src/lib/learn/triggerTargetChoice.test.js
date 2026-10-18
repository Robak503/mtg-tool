/**
 * triggerTargetChoice.test.js — a PERSON chooses the targets (and the mode) of their own triggered ability as it is put on the stack,
 * through the trigger-target pause; every seat the AI plays keeps the automatic chooser (gameEngine.chooseTriggerTargets), unchanged.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 603.3d — "The remainder of the process for putting a triggered ability on the stack is identical to the process for casting a
 *     spell listed in rules 601.2c–d." CR 601.2c — "The player announces their choice of an appropriate object or player for each
 *     target the spell requires." The triggered ability's controller is that player (CR 603.3a).
 *   · CR 603.3c / 700.2b — the controller of a modal triggered ability chooses the mode as it is put on the stack.
 *   · CR 603.3b — simultaneous triggered abilities go on the stack in APNAP order, each player's own in the order they choose.
 *   · CR 115.1 — targets are declared as part of putting the ability on the stack.
 *
 * THE GAP (gameEngine.buildTriggerStack, 31d97587): the automatic chooser picked the targets of every seat's triggered ability, a
 * person's included — Ravenous Chupacabra destroyed the first legal creature, Twinshot Sniper shot the first opposing creature, an
 * "up to one" target could not be declined, and Knight of Autumn always took its first mode.
 *
 * Engine paths: the session driver (advanceUntilDecision / applyChoice / applyPendingChoice) for a cast through to its enters
 * trigger; flushTriggers + checkEnterTriggers for simultaneous triggers. Real oracle fixtures (bundled Scryfall via
 * cardIndex.publicCard, generated 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."};
const TWINSHOT_SNIPER = {"name":"Twinshot Sniper","type":"Artifact Creature — Goblin Archer","mana":"{3}{R}","cmc":4,"power":"2","toughness":"3","keywords":["Reach","Channel"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach\nWhen this creature enters, it deals 2 damage to any target.\nChannel — {1}{R}, Discard this card: It deals 2 damage to any target."};
const CHOMPING_CHANGELING = {"name":"Chomping Changeling","type":"Creature — Shapeshifter","mana":"{2}{G}","cmc":3,"power":"1","toughness":"2","keywords":["Changeling"],"colors":["G"],"colorIdentity":["G"],"oracle":"Changeling (This card is every creature type.)\nWhen this creature enters, destroy up to one target artifact or enchantment."};
const KNIGHT_OF_AUTUMN = {"name":"Knight of Autumn","type":"Creature — Dryad Knight","mana":"{1}{G}{W}","cmc":3,"power":"2","toughness":"1","keywords":[],"colors":["G","W"],"colorIdentity":["G","W"],"oracle":"When this creature enters, choose one —\n• Put two +1/+1 counters on this creature.\n• Destroy target artifact or enchantment.\n• You gain 4 life."};
const PHANTASMAL_BEAR = {"name":"Phantasmal Bear","type":"Creature — Bear Illusion","mana":"{U}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"When this creature becomes the target of a spell or ability, sacrifice it."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}{C}."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game in the user's precombat main phase, the stack empty; `humans` is state.humanSeats (createLearnSession stamps ["user"] below Expert). */
function board({ user = [], ai = [], hand = [], humans = ["user"] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
/** The person casts `cardId` from hand through the session driver; returns the driver's next stop. */
function cast(state, cardId) {
  const first = advanceUntilDecision(session(state));
  const action = first.decision.options.find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  return applyChoice(first.session, action);
}
const choose = (r, candidateId) => applyPendingChoice(r.session, { kind: "trigger-target", candidateId });
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const labelOf = (c) => [c.label ?? null, ...(c.targets || []).map((t) => `${t.type}:${t.id}`)].filter(Boolean).join(" ") || "(none)";
const offered = (d) => (d?.candidates || []).map(labelOf);
const idFor = (d, label) => (d?.candidates || []).find((c) => labelOf(c) === label)?.id;
const enter = (s, ...ids) => ids.reduce((st, id) => checkEnterTriggers(st, [...st.players.user.battlefield, ...st.players.ai.battlefield].find((p) => p.id === id)), s);

describe("CR 603.3d / 601.2c — a person chooses the targets of their own triggered ability", () => {
  it("⭐ Ravenous Chupacabra enters under your control: you are asked, only the opponent's creatures are offered, and your pick dies — the Hill Giant, where the automatic chooser takes the first legal (the Bears)", () => {
    const paused = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), "chupa");
    const d = paused.decision;
    const onStack = paused.session.state.stack.map((o) => ({ source: o.source?.name, targets: o.targets.map((t) => t.id) }));
    const after = choose(paused, idFor(d, "creature:giant"));
    const row = {
      asked: [d.kind, d.controller, d.sourceName, d.abilityText], offered: offered(d), onStack,
      aiBoard: names(after.session.state, "ai"), nextAsk: after.decision.kind === "trigger-target",
    };
    console.log(`  WITNESS chupacabra ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: ["trigger-target", "user", "Ravenous Chupacabra", "When this creature enters, destroy target creature an opponent controls"],
      offered: ["creature:bear", "creature:giant"], onStack: [{ source: "Ravenous Chupacabra", targets: [] }],
      aiBoard: ["Grizzly Bears"], nextAsk: false,
    });
  });

  it("Twinshot Sniper's \"any target\" offers every creature and both players — yours too — and your pick takes the 2 damage: the opponent's face", () => {
    const paused = cast(board({ hand: [{ id: "sniper", ...TWINSHOT_SNIPER }], user: [P("ubear", GRIZZLY_BEARS, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai")] }), "sniper");
    const d = paused.decision;
    const after = choose(paused, idFor(d, "player:ai"));
    const sniper = paused.session.state.players.user.battlefield.find((p) => p.card?.name === "Twinshot Sniper")?.id; // the permanent the cast minted
    const row = { kind: d.kind, offered: [...offered(d)].sort(), aiLife: after.session.state.players.ai.life, aiBoard: names(after.session.state, "ai") };
    console.log(`  WITNESS sniper ${JSON.stringify(row)}`);
    expect(row).toEqual({
      kind: "trigger-target", offered: ["creature:bear", `creature:${sniper}`, "creature:ubear", "player:ai", "player:user"].sort(),
      aiLife: 18, aiBoard: ["Grizzly Bears"],
    });
  });

  it("an \"up to one\" target can be declined: Chomping Changeling offers no target beside each artifact, and declining destroys nothing (the automatic chooser destroys the Sol Ring)", () => {
    const paused = cast(board({ hand: [{ id: "chomp", ...CHOMPING_CHANGELING }], ai: [P("sol", SOL_RING, "ai"), P("stone", MIND_STONE, "ai")] }), "chomp");
    const d = paused.decision;
    const after = choose(paused, idFor(d, "(none)"));
    const row = { kind: d.kind, offered: offered(d), aiBoard: names(after.session.state, "ai") };
    console.log(`  WITNESS chomping ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "trigger-target", offered: ["permanent:sol", "permanent:stone", "(none)"], aiBoard: ["Mind Stone", "Sol Ring"] });
  });

  it("a modal trigger: Knight of Autumn offers each mode (with its targets) and resolves the one you choose — You gain 4 life, where the automatic chooser takes the counters", () => {
    const paused = cast(board({ hand: [{ id: "knight", ...KNIGHT_OF_AUTUMN }], ai: [P("sol", SOL_RING, "ai")] }), "knight");
    const d = paused.decision;
    const life = d.candidates?.find((c) => /gain 4 life/i.test(c.label || ""))?.id;
    const after = choose(paused, life);
    const knight = after.session.state.players.user.battlefield.find((p) => p.card?.name === "Knight of Autumn");
    const row = { kind: d.kind, modes: (d.candidates || []).length, life: after.session.state.players.user.life, counters: knight?.counters?.["+1/+1"] ?? 0, aiBoard: names(after.session.state, "ai") };
    console.log(`  WITNESS knight ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "trigger-target", modes: 3, life: 24, counters: 0, aiBoard: ["Sol Ring"] });
  });

  it("the post-target events follow your pick: targeting the opponent's Phantasmal Bear makes it sacrifice itself (its becomes-the-target trigger goes on the stack above yours); targeting the Hill Giant leaves the Bear alone", () => {
    const start = board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("phant", PHANTASMAL_BEAR, "ai"), P("giant", HILL_GIANT, "ai")] });
    const paused = cast(start, "chupa");
    const atBear = applyPendingChoice(paused.session, { kind: "trigger-target", candidateId: idFor(paused.decision, "creature:phant") });
    const atGiant = applyPendingChoice(cast(start, "chupa").session, { kind: "trigger-target", candidateId: idFor(paused.decision, "creature:giant") });
    const log = atBear.session.state.log || [];
    const row = { atBear: names(atBear.session.state, "ai"), atGiant: names(atGiant.session.state, "ai"),
      bearSacrificed: log.some((e) => e.effect === "sacrifice" && e.sacrificed === "phant"),
      chupacabraFizzled: log.some((e) => e.kind === "spell-fizzle" && e.source === "Ravenous Chupacabra") };
    console.log(`  WITNESS phantasmal ${JSON.stringify(row)}`);
    expect(row).toEqual({ atBear: ["Hill Giant"], atGiant: ["Phantasmal Bear"], bearSacrificed: true, chupacabraFizzled: true });
  });

  it("an answer that is no candidate decides nothing: the question stands, and the stack keeps the ability with no target", () => {
    const paused = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), "chupa");
    const junk = choose(paused, "99");
    expect({ kind: junk.decision.kind, candidates: offered(junk.decision), targets: junk.session.state.stack.map((o) => o.targets.length), aiBoard: names(junk.session.state, "ai") })
      .toEqual({ kind: "trigger-target", candidates: ["creature:bear", "creature:giant"], targets: [0], aiBoard: ["Grizzly Bears", "Hill Giant"] });
  });

  it("a game saved mid-question restores intact (plain JSON): the restored pause settles exactly as the live one", () => {
    const paused = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), "chupa");
    const restored = { ...paused.session, state: JSON.parse(JSON.stringify(paused.session.state)) };
    const id = idFor(paused.decision, "creature:giant");
    const live = applyPendingChoice(paused.session, { kind: "trigger-target", candidateId: id });
    const again = applyPendingChoice(restored, { kind: "trigger-target", candidateId: id });
    expect(paused.decision.kind).toBe("trigger-target");
    expect(names(again.session.state, "ai")).toEqual(["Grizzly Bears"]);
    expect(JSON.parse(JSON.stringify(again.session.state))).toEqual(JSON.parse(JSON.stringify(live.session.state)));
  });
});

describe("CR 603.3b — simultaneous triggers: APNAP, and a person's own in the order they went on the stack", () => {
  it("two of your enters triggers at once: each is asked in stack order (the first put on the stack first), and each takes its own pick", () => {
    const s0 = board({ user: [P("c1", RAVENOUS_CHUPACABRA, "user"), P("c2", RAVENOUS_CHUPACABRA, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai"), P("bear2", GRIZZLY_BEARS, "ai")] });
    const flushed = flushTriggers(enter(s0, "c1", "c2"), { chooseTargets: chooseTriggerTargets });
    const first = advanceUntilDecision(session(flushed));
    const second = choose(first, idFor(first.decision, "creature:giant"));
    const third = choose(second, idFor(second.decision, "creature:bear2"));
    const row = {
      firstAsked: [first.decision.kind, first.decision.stackObjectId === first.session.state.stack[0]?.id],
      secondAsked: [second.decision.kind, second.decision.stackObjectId === second.session.state.stack[1]?.id],
      stackAfterAnswers: second.session.state.stack.map((o) => o.targets.map((t) => t.id)),
      aiBoard: names(third.session.state, "ai"),
    };
    console.log(`  WITNESS two-triggers ${JSON.stringify(row)}`);
    expect(row).toEqual({ firstAsked: ["trigger-target", true], secondAsked: ["trigger-target", true], stackAfterAnswers: [["giant"], []], aiBoard: ["Grizzly Bears"] });
  });

  it("your trigger and the opponent's at once on your turn: yours goes on the stack first (APNAP) and waits for your choice; the opponent's is targeted by the automatic chooser, unasked", () => {
    const s0 = board({ user: [P("chupa", RAVENOUS_CHUPACABRA, "user"), P("ubear", GRIZZLY_BEARS, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai"), P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa", "chupa"), { chooseTargets: chooseTriggerTargets });
    const r = advanceUntilDecision(session(flushed));
    const row = {
      stack: r.session.state.stack.map((o) => [o.controller, o.targets.map((t) => t.id)]),
      asked: [r.decision.kind, r.decision.controller, r.decision.stackObjectId === r.session.state.stack[0]?.id],
    };
    console.log(`  WITNESS apnap ${JSON.stringify(row)}`);
    expect(row).toEqual({ stack: [["user", []], ["ai", ["chupa"]]], asked: ["trigger-target", "user", true] });
  });
});

describe("controls — unchanged on both trees", () => {
  it("a single legal target is no choice: your Ravenous Chupacabra facing one creature destroys it without a question", () => {
    const r = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("bear", GRIZZLY_BEARS, "ai")] }), "chupa");
    expect({ kind: r.decision.kind, aiBoard: names(r.session.state, "ai") }).toEqual({ kind: "ask", aiBoard: [] });
  });

  it("the AI's trigger in a game with a person at it is targeted exactly as in a game without one", () => {
    const s0 = (humans) => board({ humans, user: [P("ubear", GRIZZLY_BEARS, "user"), P("ugiant", HILL_GIANT, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const withPerson = flushTriggers(enter(s0(["user"]), "aichupa"), { chooseTargets: chooseTriggerTargets });
    const without = flushTriggers(enter(s0(null), "aichupa"), { chooseTargets: chooseTriggerTargets });
    const strip = ({ humanSeats: _h, ...rest }) => rest;
    expect(withPerson.stack.map((o) => o.targets.map((t) => t.id))).toEqual([["ubear"]]);
    expect(strip(withPerson)).toEqual(without);
  });

  it("a table with no person at it (self-play, Expert): the user seat's trigger is targeted by the automatic chooser and resolves — no question", () => {
    const s0 = board({ humans: null, user: [P("chupa", RAVENOUS_CHUPACABRA, "user")], ai: [P("bear", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] });
    const flushed = flushTriggers(enter(s0, "chupa"), { chooseTargets: chooseTriggerTargets });
    const resolved = resolveTopOfStack(flushed);
    expect({ targets: flushed.stack.map((o) => o.targets.map((t) => t.id)), pending: flushed.pendingChoice ?? null, aiBoard: names(resolved, "ai") })
      .toEqual({ targets: [["bear"]], pending: null, aiBoard: ["Hill Giant"] });
  });
});
