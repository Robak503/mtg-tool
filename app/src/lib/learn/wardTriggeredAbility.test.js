/**
 * wardTriggeredAbility.test.js — WARD TRIGGERS ON A TRIGGERED ABILITY (CR 702.21a). A triggered ability an opponent controls that
 * targets a permanent with ward is countered unless its controller pays the ward cost — the same pay-or-be-countered question a
 * spell or an activated ability already raises.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 702.21a — "Ward is a triggered ability. Ward [cost] means 'Whenever this permanent becomes the target of a spell or ability
 *     an opponent controls, counter that spell or ability unless that player pays [cost].'" A triggered ability is an ability.
 *   · CR 603.3d → 601.2c — a triggered ability's targets are chosen as it is put on the stack; the chosen objects become its targets,
 *     and abilities that trigger on that wait to be put on the stack until the next time a player would receive priority (CR 603.3).
 *
 * THE GAP (660c7639): ward was raised for spells (actionDispatcher, the cast path) and activated abilities (the ability path) only.
 * gameEngine.flushTriggers' target-event loop — and the trigger-target pause's settle, where a person's answer runs the same events —
 * ran becomes-the-target, crime and Kira, never ward: an opponent's Ravenous Chupacabra destroyed a Leonin Lightbringer for free.
 *
 * Engine paths: flushTriggers + checkEnterTriggers for an AI seat's trigger, the session driver (advanceUntilDecision / applyChoice /
 * applyPendingChoice) for the ward question, a person's cast through to its enters trigger, and the cast path for a spell and its cast
 * trigger together. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers } from "./gameEngine.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."};
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."};
const OWLIN_SHIELDMAGE = {"name":"Owlin Shieldmage","type":"Creature — Bird Warlock","mana":"{3}{W}{B}","cmc":5,"power":"3","toughness":"3","keywords":["Flying","Ward"],"colors":["B","W"],"colorIdentity":["B","W"],"oracle":"Flying\nWard—Pay 3 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 3 life.)"};
const SPECTRAL_SNATCHER = {"name":"Spectral Snatcher","type":"Creature — Spirit","mana":"{4}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":["Landcycling","Ward","Typecycling","Cycling","Swampcycling"],"colors":["B"],"colorIdentity":["B"],"oracle":"Ward—Discard a card. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card.)\nSwampcycling {2} ({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}{C}."};
const BOND_BEETLE = {"name":"Bond Beetle","type":"Creature — Insect","mana":"{G}","cmc":1,"power":"0","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"When this creature enters, put a +1/+1 counter on target creature."};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"Destroy target creature."};
const WEAVER_OF_LIGHTNING = {"name":"Weaver of Lightning","type":"Creature — Human Shaman","mana":"{2}{R}","cmc":3,"power":"1","toughness":"4","keywords":["Reach"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach (This creature can block creatures with flying.)\nWhenever you cast an instant or sorcery spell, this creature deals 1 damage to target creature an opponent controls."};

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game in the user's precombat main phase, the stack empty; the user seat is a person (state.humanSeats, as createLearnSession stamps it below Expert). */
function board({ user = [], ai = [], hand = [], aiHand = [], userPool = FULL, humans = ["user"] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...userPool }, library: LIB("user") },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, library: LIB("ai") } } };
}
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
/** The person casts `cardId` from hand through the session driver (aimed at `targetId` when given); returns the driver's next stop. */
function cast(state, cardId, targetId = null) {
  const first = advanceUntilDecision(session(state));
  const action = first.decision.options.find((a) => a.kind === "cast-spell" && a.cardId === cardId && (!targetId || (a.targets || []).some((t) => t.id === targetId)));
  return applyChoice(first.session, action);
}
/** Pass priority while the stack holds anything and the person is asked to act (the opponent, the AI, passes back). */
function passUntilEmpty(r) {
  let cur = r;
  for (let i = 0; i < 12 && cur.decision.kind === "ask" && cur.session.state.stack.length; i++) {
    cur = applyChoice(cur.session, cur.decision.options.find((a) => a.kind === "pass-priority"));
  }
  return cur;
}
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const labelOf = (c) => [c.label ?? null, ...(c.targets || []).map((t) => `${t.type}:${t.id}`)].filter(Boolean).join(" ") || "(none)";
const idFor = (d, label) => (d?.candidates || []).find((c) => labelOf(c) === label)?.id;
const enter = (s, ...ids) => ids.reduce((st, id) => checkEnterTriggers(st, [...st.players.user.battlefield, ...st.players.ai.battlefield].find((p) => p.id === id)), s);
/** The ward questions the log records — [who pays, the ward permanent, the amount] — and how each was settled. */
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.sourceName, e.amount]);
const wardPaid = (s) => (s.log || []).filter((e) => e.effect === "soft-counter-paid").map((e) => e.spellName);
const counteredIds = (s) => (s.log || []).filter((e) => e.effect === "counter" && e.via === "soft-counter").map((e) => e.targetId);
const tapped = (s, seat, id) => !!s.players[seat].battlefield.find((p) => p.id === id)?.tapped;

describe("CR 702.21a — ward triggers when an opponent's TRIGGERED ability targets the permanent", () => {
  it("⭐ the AI's Ravenous Chupacabra aims at your Leonin Lightbringer (ward {2}) with no mana to pay: the ward is demanded of the AI, the ability is countered, and the Lightbringer lives — it was destroyed for free", () => {
    const s0 = board({ user: [P("light", LEONIN_LIGHTBRINGER, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets });
    const trig = flushed.stack[0]?.id;
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    const row = { targeted: flushed.stack.map((o) => o.targets.map((t) => t.id)), asked: wardAsks(end), countered: counteredIds(end).includes(trig), userBoard: names(end, "user"), stack: end.stack.length };
    console.log(`  WITNESS chupacabra-unpaid ${JSON.stringify(row)}`);
    expect(row).toEqual({ targeted: [["light"]], asked: [["ai", "Leonin Lightbringer", 2]], countered: true, userBoard: ["Leonin Lightbringer"], stack: 0 });
  });

  it("the AI pays the {2} with its Sol Ring: the ability resolves and the Lightbringer dies — the Sol Ring is tapped for the ward", () => {
    // A card in your hand keeps the driver at your main phase (with nothing to do it would pass on into the AI's untap step).
    const s0 = board({ user: [P("light", LEONIN_LIGHTBRINGER, "user")], hand: [{ id: "ubears", ...GRIZZLY_BEARS }], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai"), P("sol", SOL_RING, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets });
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    const row = { asked: wardAsks(end), paid: wardPaid(end), solTapped: tapped(end, "ai", "sol"), userBoard: names(end, "user") };
    console.log(`  WITNESS chupacabra-paid ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Leonin Lightbringer", 2]], paid: ["Ravenous Chupacabra"], solTapped: true, userBoard: [] });
  });

  it("a life ward: Owlin Shieldmage (Ward—Pay 3 life) — the AI pays 3 life, 20 → 17, and its Chupacabra destroys the Shieldmage", () => {
    const s0 = board({ user: [P("owl", OWLIN_SHIELDMAGE, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const end = passUntilEmpty(advanceUntilDecision(session(flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets })))).session.state;
    const row = { asked: wardAsks(end), aiLife: end.players.ai.life, userBoard: names(end, "user") };
    console.log(`  WITNESS shieldmage-life ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Owlin Shieldmage", 3]], aiLife: 17, userBoard: [] });
  });

  it("a discard ward: Spectral Snatcher (Ward—Discard a card) facing an AI with an empty hand — it can't pay, the ability is countered, the Snatcher lives", () => {
    const s0 = board({ user: [P("snatch", SPECTRAL_SNATCHER, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets });
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    const row = { asked: wardAsks(end), countered: counteredIds(end).includes(flushed.stack[0]?.id), userBoard: names(end, "user") };
    console.log(`  WITNESS snatcher-discard ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Spectral Snatcher", 1]], countered: true, userBoard: ["Spectral Snatcher"] });
  });

  it("⭐ the person's answer raises it too: your Chupacabra, the opponent's Leonin Lightbringer and Grizzly Bears — you choose the Lightbringer and are asked to pay {2} or have your ability countered; declining saves the Lightbringer, paying destroys it", () => {
    const start = board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("bear", GRIZZLY_BEARS, "ai")] });
    const paused = cast(start, "chupa");
    const pick = idFor(paused.decision, "creature:light");
    const asked = applyPendingChoice(paused.session, { kind: "trigger-target", candidateId: pick });
    const declined = asked.decision.kind === "soft-counter" ? passUntilEmpty(applyPendingChoice(asked.session, { kind: "soft-counter", pay: false })) : passUntilEmpty(asked);
    const askedAgain = applyPendingChoice(cast(start, "chupa").session, { kind: "trigger-target", candidateId: pick });
    const paid = askedAgain.decision.kind === "soft-counter" ? passUntilEmpty(applyPendingChoice(askedAgain.session, { kind: "soft-counter", pay: true })) : passUntilEmpty(askedAgain);
    const d = asked.decision;
    const row = {
      firstAsk: paused.decision.kind, wardAsk: [d.kind, d.controller ?? null, d.spellName ?? null, d.sourceName ?? null, d.cost ?? null],
      declinedAiBoard: names(declined.session.state, "ai"), paidAiBoard: names(paid.session.state, "ai"),
    };
    console.log(`  WITNESS person-pick ${JSON.stringify(row)}`);
    expect(row).toEqual({
      firstAsk: "trigger-target",
      wardAsk: ["soft-counter", "user", "Ravenous Chupacabra", "Leonin Lightbringer", { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } }],
      declinedAiBoard: ["Grizzly Bears", "Leonin Lightbringer"], paidAiBoard: ["Grizzly Bears"],
    });
  });

  it("the person's single-target ability (aimed by the automatic chooser, unasked) raises it as well: your Chupacabra facing only the opponent's Lightbringer asks for the ward, not for a target", () => {
    const r = cast(board({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")] }), "chupa");
    const row = { kind: r.decision.kind, controller: r.decision.controller ?? null, sourceName: r.decision.sourceName ?? null, aiBoard: names(r.session.state, "ai") };
    console.log(`  WITNESS person-single ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", sourceName: "Leonin Lightbringer", aiBoard: ["Leonin Lightbringer"] });
  });

  it("a spell and its cast trigger aim at the same ward creature: both wards are demanded, the spell's first — your Murder and your Weaver of Lightning's ping at the opponent's Lightbringer ask {2} twice (one choice slot never drops the second)", () => {
    const r1 = cast(board({ user: [P("weaver", WEAVER_OF_LIGHTNING, "user")], hand: [{ id: "murder", ...MURDER }], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")] }), "murder", "light");
    const r2 = r1.decision.kind === "soft-counter" ? applyPendingChoice(r1.session, { kind: "soft-counter", pay: true }) : r1;
    const r3 = r2.decision.kind === "soft-counter" ? applyPendingChoice(r2.session, { kind: "soft-counter", pay: true }) : r2;
    const end = passUntilEmpty(r3).session.state;
    const row = {
      asks: [r1.decision, r2.decision].map((d) => [d.kind, d.spellName ?? null]),
      paid: wardPaid(end), aiBoard: names(end, "ai"),
    };
    console.log(`  WITNESS spell-and-cast-trigger ${JSON.stringify(row)}`);
    expect(row).toEqual({ asks: [["soft-counter", "Murder"], ["soft-counter", "Weaver of Lightning"]], paid: ["Murder", "Weaver of Lightning"], aiBoard: [] });
  });

  it("two of your triggers at once: the first one's ward is asked only after the second has its targets — the batch goes on the stack before the ward triggers do (CR 603.3, 603.3b)", () => {
    const s0 = board({ user: [P("c1", RAVENOUS_CHUPACABRA, "user"), P("c2", RAVENOUS_CHUPACABRA, "user")], ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("bear", GRIZZLY_BEARS, "ai")] });
    const flushed = flushTriggers(enter(s0, "c1", "c2"), { chooseTargets: chooseTriggerTargets });
    // Two abilities of two sources: their order is asked first (CR 603.3b — triggerOrderChoice.test.js); the order they stand in is kept here.
    const ordering = advanceUntilDecision(session(flushed));
    expect(ordering.decision.kind).toBe("trigger-order");
    const first = applyPendingChoice(ordering.session, { kind: "trigger-order", resolveOrder: (ordering.decision.candidates || []).map((c) => c.id) });
    const second = applyPendingChoice(first.session, { kind: "trigger-target", candidateId: idFor(first.decision, "creature:light") });
    const third = second.decision.kind === "trigger-target" ? applyPendingChoice(second.session, { kind: "trigger-target", candidateId: idFor(second.decision, "creature:bear") }) : second;
    const row = {
      sequence: [first.decision, second.decision, third.decision].map((d) => [d.kind, d.spellName ?? d.sourceName ?? null]),
      wardFor: third.decision.spellId === third.session.state.stack[0]?.id,
    };
    console.log(`  WITNESS batch-order ${JSON.stringify(row)}`);
    expect(row).toEqual({ sequence: [["trigger-target", "Ravenous Chupacabra"], ["trigger-target", "Ravenous Chupacabra"], ["soft-counter", "Ravenous Chupacabra"]], wardFor: true });
  });
});

describe("the AI's trigger targets — a ward it can't pay is passed over while another correct-side target is free of it", () => {
  it("no mana: the AI's Chupacabra facing your Leonin Lightbringer and your Grizzly Bears destroys the Bears — the first legal target was the Lightbringer, whose ward would have countered it", () => {
    const s0 = board({ user: [P("light", LEONIN_LIGHTBRINGER, "user"), P("bear", GRIZZLY_BEARS, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets });
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    const row = { targeted: flushed.stack.map((o) => o.targets.map((t) => t.id)), asked: wardAsks(end), userBoard: names(end, "user") };
    console.log(`  WITNESS chooser-unpayable ${JSON.stringify(row)}`);
    expect(row).toEqual({ targeted: [["bear"]], asked: [], userBoard: ["Leonin Lightbringer"] });
  });

  it("with the {2} available (Sol Ring) it keeps its first choice, pays, and the Lightbringer dies", () => {
    const s0 = board({ user: [P("light", LEONIN_LIGHTBRINGER, "user"), P("bear", GRIZZLY_BEARS, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai"), P("sol", SOL_RING, "ai")] });
    const flushed = flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets });
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    const row = { targeted: flushed.stack.map((o) => o.targets.map((t) => t.id)), paid: wardPaid(end), solTapped: tapped(end, "ai", "sol"), userBoard: names(end, "user") };
    console.log(`  WITNESS chooser-payable ${JSON.stringify(row)}`);
    expect(row).toEqual({ targeted: [["light"]], paid: ["Ravenous Chupacabra"], solTapped: true, userBoard: ["Grizzly Bears"] });
  });
});

describe("controls — unchanged on both trees", () => {
  it("your own trigger aimed at your own ward creature asks nothing: your Bond Beetle's +1/+1 counter goes on your Leonin Lightbringer", () => {
    const paused = cast(board({ user: [P("light", LEONIN_LIGHTBRINGER, "user")], hand: [{ id: "beetle", ...BOND_BEETLE }], ai: [P("bear", GRIZZLY_BEARS, "ai")] }), "beetle");
    const after = applyPendingChoice(paused.session, { kind: "trigger-target", candidateId: idFor(paused.decision, "creature:light") });
    const end = passUntilEmpty(after).session.state;
    const row = { first: paused.decision.kind, next: after.decision.kind, asked: wardAsks(end), counters: end.players.user.battlefield.find((p) => p.id === "light")?.counters?.["+1/+1"] ?? 0 };
    expect(row).toEqual({ first: "trigger-target", next: "ask", asked: [], counters: 1 });
  });

  it("the AI's own trigger aimed at its own ward creature asks nothing: its Bond Beetle's counter lands on its Lightbringer", () => {
    const s0 = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("beetle", BOND_BEETLE, "ai")], user: [P("bear", GRIZZLY_BEARS, "user")] });
    const atLight = (cands) => cands.find((c) => (c.targets || []).some((t) => t.id === "light"));
    const flushed = flushTriggers(enter(s0, "beetle"), { chooseTargets: atLight });
    const end = passUntilEmpty(advanceUntilDecision(session(flushed))).session.state;
    expect({ targeted: flushed.stack.map((o) => o.targets.map((t) => t.id)), asked: wardAsks(end), counters: end.players.ai.battlefield.find((p) => p.id === "light")?.counters?.["+1/+1"] ?? 0 })
      .toEqual({ targeted: [["light"]], asked: [], counters: 1 });
  });

  it("a spell aimed at a ward creature asks for the ward exactly as before: your Murder at the opponent's Leonin Lightbringer", () => {
    const r = cast(board({ hand: [{ id: "murder", ...MURDER }], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")] }), "murder", "light");
    const declined = passUntilEmpty(applyPendingChoice(r.session, { kind: "soft-counter", pay: false }));
    expect({ kind: r.decision.kind, controller: r.decision.controller, spellName: r.decision.spellName, sourceName: r.decision.sourceName, aiBoard: names(declined.session.state, "ai") })
      .toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Leonin Lightbringer", aiBoard: ["Leonin Lightbringer"] });
  });

  it("a trigger aimed at a creature without ward asks nothing: the AI's Chupacabra destroys your Grizzly Bears", () => {
    const s0 = board({ user: [P("bear", GRIZZLY_BEARS, "user")], ai: [P("aichupa", RAVENOUS_CHUPACABRA, "ai")] });
    const end = passUntilEmpty(advanceUntilDecision(session(flushTriggers(enter(s0, "aichupa"), { chooseTargets: chooseTriggerTargets })))).session.state;
    expect({ asked: wardAsks(end), userBoard: names(end, "user") }).toEqual({ asked: [], userBoard: [] });
  });
});
