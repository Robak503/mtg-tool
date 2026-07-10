/**
 * millOnEvent.test.js — MILL-ON-EVENT trigger bind (Wave 3b, CR 701.13a — milling cards is a SINGLE event).
 *
 * detectTriggers' classifyCondition had no "milled" case, so a milled-trigger condition was UNDETECTED and
 * the WHOLE card routed to the Arbiter. This slice supplies the missing BIND:
 *   - the `milled` event in classifyCondition (two corpus templates),
 *   - the scopeMatches "milled" case,
 *   - checkMilledTriggers (fired off the two real mill chokepoints — the mill effect atom in
 *     effects/atoms/library.js, and the inherent radiation ability via gameEngine.runStepActions).
 *
 * Two templates, two cardinalities (the load-bearing landmine):
 *   BATCH "one or more [nonland] cards are milled" → fires ONCE per mill event regardless of count
 *     (Mirelurk Queen, Screeching Scorchbeast, The Wise Mothman).
 *   PER-CARD "a player|an opponent mills a [nonland] card" → fires once PER matching card milled
 *     (Glowing One "you gain 1 life" per nonland; Infesting Radroach on an opponent's mill).
 *
 * CREED: this is the bind only. The milled-card payoffs already exist; a payoff that can't parse HIGH (a
 * "once each turn" / scaling / conditional rider) still routes the WHOLE trigger to the Arbiter no-op at
 * flush (buildTriggerStack), never a partial. Glowing One — whose every clause parses HIGH — flips native.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkMilledTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers, runStepActions } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const nonland = (id) => ({ id, name: id, type: "Sorcery", oracle: "" });
const basicland = (id) => ({ id, name: id, type: "Basic Land — Forest" });
// MDFC whose BACK is a land (Malakir Rebirth // Malakir Mire): a NONLAND when milled (front face, CR 712.8a).
const mdfcLandBack = (id) => ({ id, name: id, type: "Sorcery", card_faces: [{ type_line: "Instant" }, { type_line: "Land" }] });

// ─── Detection ──────────────────────────────────────────────────────────────────
describe("detectTriggers — the milled event (both corpus templates)", () => {
  const C = (oracle) => ({ name: "X", type: "Creature — Beast", oracle });
  it("BATCH 'one or more nonland cards are milled' → milled, perCard:false, nonland filter, whose:any", () => {
    const d = detectTriggers(C("Whenever one or more nonland cards are milled, draw a card.")).find((x) => x.event === "milled");
    expect(d).toMatchObject({ event: "milled", perCard: false, milledFilter: "nonland", whose: "any" });
  });
  it("BATCH 'one or more cards are milled' (no filter) → milledFilter:null (drift-insurance form)", () => {
    const d = detectTriggers(C("Whenever one or more cards are milled, draw a card.")).find((x) => x.event === "milled");
    expect(d).toMatchObject({ event: "milled", perCard: false, milledFilter: null });
  });
  it("PER-CARD 'a player mills a nonland card' → perCard:true, whose:any (Glowing One)", () => {
    const d = detectTriggers(C("Whenever a player mills a nonland card, you gain 1 life.")).find((x) => x.event === "milled");
    expect(d).toMatchObject({ event: "milled", perCard: true, milledFilter: "nonland", whose: "any" });
  });
  it("PER-CARD 'an opponent mills a nonland card' → perCard:true, whose:opponent (Infesting Radroach)", () => {
    const d = detectTriggers(C("Whenever an opponent mills a nonland card, you gain 1 life.")).find((x) => x.event === "milled");
    expect(d).toMatchObject({ event: "milled", perCard: true, milledFilter: "nonland", whose: "opponent" });
  });
  it("the effect clause is captured WHOLE (the split anchors at the condition comma, not a later one)", () => {
    // Without 'milled' in hasEventVerb, the split would advance to the comma after 'draw a card' (matching
    // 'draws? a'), swallowing the first effect sentence into the condition.
    const d = detectTriggers(C("Whenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature.")).find((x) => x.event === "milled");
    expect(d.effectClause).toMatch(/^draw a card, then put a \+1\/\+1 counter on this creature/i);
  });
  it("a TYPE-filtered variant ('creature cards') is NOT detected → Arbiter (safe under-fire)", () => {
    expect(detectTriggers(C("Whenever a player mills one or more creature cards, draw a card.")).some((x) => x.event === "milled")).toBe(false);
  });
});

// ─── checkMilledTriggers (unit) — cardinality + filter + whose gate ───────────────
describe("checkMilledTriggers — cardinality, nonland filter, whose gate", () => {
  function board(oracle, controller = "user", placeOn = "user") {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "watcher", card: { name: "W", type: "Creature — Beast", power: 1, toughness: 1, oracle }, controller });
    return { ...s, players: { ...s.players, [placeOn]: { ...s.players[placeOn], battlefield: [perm] } } };
  }
  const milledOf = (s) => (s.pendingTriggers || []).filter((t) => t.event === "milled");

  it("BATCH fires ONCE per event regardless of how many nonland cards milled (CR 701.13a)", () => {
    const s = board("Whenever one or more nonland cards are milled, draw a card.");
    const out = checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [nonland("a"), nonland("b"), nonland("c")] });
    expect(milledOf(out)).toHaveLength(1); // ONE trigger for three milled cards
    expect(out.pendingTriggers[0].context).toMatchObject({ milledByPlayer: "user", milledCount: 3, nonlandMilledCount: 3 });
  });
  it("PER-CARD fires once per matching nonland card milled (Glowing One — N life from N nonlands)", () => {
    const s = board("Whenever a player mills a nonland card, you gain 1 life.");
    const out = checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [nonland("a"), nonland("b"), nonland("c")] });
    expect(milledOf(out)).toHaveLength(3); // three separate triggers, one per nonland card
  });
  it("the nonland filter excludes lands — a batch of 2 lands + 1 nonland counts 1 nonland", () => {
    const batch = board("Whenever one or more nonland cards are milled, draw a card.");
    const out1 = checkMilledTriggers(batch, { milledByPlayer: "user", milledCards: [basicland("l1"), basicland("l2"), nonland("n1")] });
    expect(milledOf(out1)).toHaveLength(1); // still fires (>= 1 nonland)
    expect(out1.pendingTriggers[0].context).toMatchObject({ milledCount: 3, nonlandMilledCount: 1 });

    const perCard = board("Whenever a player mills a nonland card, you gain 1 life.");
    const out2 = checkMilledTriggers(perCard, { milledByPlayer: "user", milledCards: [basicland("l1"), basicland("l2"), nonland("n1")] });
    expect(milledOf(out2)).toHaveLength(1); // one nonland → one trigger
  });
  it("a nonland trigger does NOT fire when ONLY lands were milled (filter count 0)", () => {
    const s = board("Whenever one or more nonland cards are milled, draw a card.");
    const out = checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [basicland("l1"), basicland("l2")] });
    expect(milledOf(out)).toHaveLength(0);
  });
  it("an MDFC whose BACK is a land is a NONLAND when milled (front-face, CR 712.8a)", () => {
    const s = board("Whenever one or more nonland cards are milled, draw a card.");
    const out = checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [mdfcLandBack("m1")] });
    expect(milledOf(out)).toHaveLength(1);
  });
  it("whose:opponent fires only when the MILLING player is an opponent of the watcher's controller", () => {
    const s = board("Whenever an opponent mills a nonland card, you gain 1 life."); // watcher controlled by user
    // The user themselves milling → does NOT fire (the user is not the user's opponent).
    expect(milledOf(checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [nonland("a")] }))).toHaveLength(0);
    // An opponent (ai1) milling → fires.
    expect(milledOf(checkMilledTriggers(s, { milledByPlayer: "ai1", milledCards: [nonland("a")] }))).toHaveLength(1);
  });
  it("a global 'a player mills' watcher fires regardless of WHO milled (incl. an opponent's mill)", () => {
    const s = board("Whenever a player mills a nonland card, you gain 1 life.");
    expect(milledOf(checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [nonland("a")] }))).toHaveLength(1);
    expect(milledOf(checkMilledTriggers(s, { milledByPlayer: "ai1", milledCards: [nonland("a")] }))).toHaveLength(1);
  });
  it("is a no-op for an empty / missing mill batch", () => {
    const s = board("Whenever one or more nonland cards are milled, draw a card.");
    expect(checkMilledTriggers(s, { milledByPlayer: "user", milledCards: [] })).toBe(s);
    expect(checkMilledTriggers(s, { milledByPlayer: "ghost", milledCards: [nonland("a")] })).toBe(s);
    expect(checkMilledTriggers(s, {})).toBe(s);
  });
});

// ─── Runtime — the mill effect-atom chokepoint (applyMill) ────────────────────────
describe("runtime — a mill SPELL fires the milled trigger bind, which then routes per CREED", () => {
  function withWatcher(oracle, lib) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "watcher", card: { name: "Glow", type: "Creature — Beast", power: 1, toughness: 1, oracle }, controller: "user" });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, life: 40, battlefield: [perm], library: lib } } };
  }
  it("Glowing One's per-card 'you gain 1 life' fires once per nonland milled by a mill spell (HIGH → native)", () => {
    // Mill three nonland cards via the effect atom (applyMill → millOnePlayer → checkMilledTriggers).
    let s = withWatcher("Whenever a player mills a nonland card, you gain 1 life.", [nonland("a"), nonland("b"), nonland("c"), nonland("d")]);
    const prog = parseEffectProgram({ type: "Sorcery", oracle: "You mill three cards." });
    expect(prog.atoms[0]).toMatchObject({ op: "mill", amount: 3, who: "controller" });
    // Drive the mill atom through the EffectProgram interpreter (the real spell-resolution path: applyMill
    // → millOnePlayer → checkMilledTriggers enqueues the bind).
    s = runEffectProgram(s, { payload: { params: { program: prog, controller: "user", context: {}, targets: [] } } });
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["a", "b", "c"]); // milled top 3
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.life).toBe(43); // +1 per nonland milled (3)
  });
});

// ─── Runtime — the radiation chokepoint (applyRadiation via runStepActions) ───────
describe("runtime — the inherent radiation mill fires the milled trigger bind", () => {
  function radWatcher(oracle, { rad = 3, lib } = {}) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "glow", card: { name: "Glow", type: "Creature — Beast", power: 1, toughness: 1, oracle }, controller: "user" });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, life: 40, radCounters: rad, battlefield: [perm], library: lib } } };
  }
  it("Glowing One gains 1 life per nonland the radiation ability mills (rad 3 → 2 nonland + 1 land)", () => {
    let s = radWatcher("Whenever a player mills a nonland card, you gain 1 life.", { rad: 3, lib: [nonland("n0"), nonland("n1"), basicland("L0")] });
    s = runStepActions(s);            // applyRadiation mills 3 (2 nonland + 1 land), then fires checkMilledTriggers
    s = resolveAll(flushTriggers(s)); // resolve the queued milled triggers
    // Radiation: 3 milled → graveyard 3; 2 nonland → lose 2 life + remove 2 rad. Glowing One: +2 life (2 nonlands).
    expect(s.players.user.graveyard).toHaveLength(3);
    expect(s.players.user.radCounters).toBe(1);
    expect(s.players.user.life).toBe(40 - 2 + 2); // -2 radiation, +2 Glowing One → net 40
  });
});

// ─── CREED — riders route the WHOLE trigger to the Arbiter (no partial) ───────────
describe("CREED — a milled payoff with an unmodeled rider routes to Arbiter (no partial)", () => {
  function withWatcher(oracle, rad, lib) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "q", card: { name: "Q", type: "Creature — Beast", power: 1, toughness: 1, oracle }, controller: "user" });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, life: 40, radCounters: rad, battlefield: [perm], library: lib, counters: {} } } };
  }
  it("Mirelurk Queen (SHELF M1a): the payoff FIRES — draw + self counter — and the once-per-turn latch is set", () => {
    let s = withWatcher("Whenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature. This ability triggers only once each turn.", 2, [nonland("n0"), nonland("n1"), nonland("n2")]);
    const handBefore = s.players.user.hand.length;
    s = runStepActions(s);
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.hand.length).toBe(handBefore + 1); // drew exactly once
    const watcher = s.players.user.battlefield.find((p) => p.id === "q");
    expect(watcher?.counters?.["+1/+1"]).toBe(1);            // and one counter (the whole payoff, no partial)
    expect(Object.keys(s.onceTriggersFiredThisTurn || {}).some((k) => k.startsWith("otpt_"))).toBe(true); // latched
  });
});

// ─── Coverage metric — the named consuming cards (CREED-honest) ───────────────────
describe("coverage — the consuming cards classify honestly", () => {
  const C = (name, oracle) => ({ name, type: "Creature — Beast", oracle });
  it("Glowing One flips to native-trigger (every clause parses HIGH)", () => {
    expect(classifyCard(C("Glowing One", "Deathtouch\nWhenever this creature deals combat damage to a player, they get four rad counters.\nWhenever a player mills a nonland card, you gain 1 life."))).toBe("native-trigger");
  });
  it("Mirelurk Queen FLIPS native (SHELF M1a — the once-per-turn trigger latch is runtime-enforced)", () => {
    expect(classifyCard(C("Mirelurk Queen", "Vigilance\nWhen this creature enters, target player gets two rad counters.\nWhenever one or more nonland cards are milled, draw a card, then put a +1/+1 counter on this creature. This ability triggers only once each turn."))).toBe("native-trigger");
  });
  it("Screeching Scorchbeast FLIPS native (SHELF M1b — milled-count tokens + the create-token once-per-turn latch)", () => {
    expect(classifyCard(C("Screeching Scorchbeast", "Flying, menace\nWhenever this creature attacks, each player gets two rad counters.\nWhenever one or more nonland cards are milled, you may create that many 2/2 black Zombie Mutant creature tokens. Do this only once each turn."))).toBe("native-trigger");
  });
  it("Wise Mothman / Infesting Radroach stay non-native (riders → Arbiter)", () => {
    expect(classifyCard(C("The Wise Mothman", "Flying\nWhenever The Wise Mothman enters or attacks, each player gets a rad counter.\nWhenever one or more nonland cards are milled, put a +1/+1 counter on each of up to X target creatures, where X is the number of nonland cards milled this way."))).toBe("body-only");
    expect(classifyCard(C("Infesting Radroach", "Flying\nThis creature can't block.\nWhenever this creature deals combat damage to a player, they get that many rad counters.\nWhenever an opponent mills a nonland card, if this creature is in your graveyard, you may return it to your hand."))).toBe("body-only");
  });
  it("MILLED-COUNT runtime (M1b): the mill event mints tokens = nonland milled, once per turn", () => {
    const SCORCH = { name: "Screeching Scorchbeast", type: "Creature — Mutant Bat", power: 4, toughness: 4,
      oracle: "Whenever one or more nonland cards are milled, you may create that many 2/2 black Zombie Mutant creature tokens. Do this only once each turn." };
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const scorch = createPermanent({ id: "sb", card: SCORCH, controller: "user" });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [scorch] } } };
    const settleOptionals = (st) => { let g = 0; while (st.pendingChoice && st.pendingChoice.kind === "optional-effect" && g++ < 20) { st = resolveOptionalChoice(st, true); st = resolveAll(st); } return st; };
    const mill = (st) => checkMilledTriggers(st, { milledByPlayer: "user", milledCards: [nonland("a"), nonland("b"), basicland("c")] });
    s = settleOptionals(resolveAll(flushTriggers(mill(s))));
    const tokens = (st) => st.players.user.battlefield.filter((p) => p.card.token);
    expect(tokens(s)).toHaveLength(2);                        // 2 nonland milled → 2 tokens (the land doesn't count)
    s = settleOptionals(resolveAll(flushTriggers(mill(s)))); // second event the same turn
    expect(tokens(s)).toHaveLength(2);                        // latched — no extra tokens
  });
});
