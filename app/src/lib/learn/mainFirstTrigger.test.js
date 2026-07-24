/**
 * mainFirstTrigger.test.js — the "At the beginning of your first main phase" timing (CR 505.1a),
 * which ALREADY existed as event "firstMain" (triggerScheduler.detectPhaseTrigger + the gameEngine
 * precombat-main fire) — this file pins the timing end to end for the first time, extends the
 * detector with the pre-2021 "your precombat main phase" templating (Radiation, Wrenn and One,
 * Alberix), and ships two sibling fixes found while verifying the timing against real carriers.
 * (Process note, banked in the wake report: the first attempt DUPLICATED the timing under a second
 * event name before finding the registry — grep for the existing mechanism before adding one.)
 *
 * The two sibling fixes:
 *   1. VANISHING-REMINDER SUBJECTS — the reminder-strip in detectTriggers only knew "this
 *      creature|permanent", so a vanishing ENCHANTMENT's reminder ("This enchantment enters with four
 *      time counters…") leaked through as a phantom unroutable upkeep descriptor, parking Four Knocks
 *      (and masking Crack in Time). Corpus census: creature 23 · enchantment 8 · artifact 2 · aura 1 ·
 *      land 1 — the alternation now covers all five.
 *   2. COMPOUND-AT-BEGINNING SPLIT — "When A and at the beginning of B, E" (Crack in Time, Mystic
 *      Barrier, 53 carriers) is two abilities sharing one effect; unsplit, the condition leaked through
 *      the unanchored `\benters\b` self-ETB containment check as a bare etb descriptor — the card could
 *      classify native on the ETB half while the runtime silently never fired the recurring half (a
 *      latent CREED FP). Split like the existing "and when(ever)" family; compoundTriggerCount bumps the
 *      shaped count so an unmodeled half still parks the whole card (FN-safe).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { advanceStep, runStepActions, resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (id, name, type, oracle) => ({ id, name, type, power: 1, toughness: 1, oracle });
const watcher = (id, c, controller = "user") => createPermanent({ id, card: c, controller, summoningSick: false });

describe("TRIG-MAIN-FIRST — detection", () => {
  it("maps 'your first main phase' AND the older 'your precombat main phase' templating to mainFirst / whose:yours", () => {
    const modern = card("x", "Synth", "Enchantment", "At the beginning of your first main phase, draw a card.");
    expect(detectTriggers(modern)[0]).toMatchObject({ event: "firstMain", scope: "you", whose: "yours" });
    const older = card("x", "Synth", "Enchantment", "At the beginning of your precombat main phase, draw a card.");
    expect(detectTriggers(older)[0]).toMatchObject({ event: "firstMain", scope: "you", whose: "yours" });
  });
  it("'each player's first main phase' stays UNDETECTED (needs the eachPlayersUpkeep treatment — safe FN)", () => {
    const each = card("x", "Blinkmoth Urn", "Artifact", "At the beginning of each player's first main phase, that player adds {C} for each artifact they control.");
    expect(detectTriggers(each).some((d) => d.event === "firstMain")).toBe(false);
  });
});

describe("VANISHING-REMINDER SUBJECTS — the phantom-descriptor fix (Four Knocks)", () => {
  const REM = "Vanishing 4 (This enchantment enters with four time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)";
  it("a vanishing ENCHANTMENT's reminder no longer leaks a phantom upkeep descriptor", () => {
    const fk = card("x", "Four Knocks", "Enchantment", `${REM}\nAt the beginning of your first main phase, draw a card.`);
    const ds = detectTriggers(fk);
    expect(ds).toHaveLength(1); // ONLY the real main-phase trigger — no phantom "remove a time counter" upkeep
    expect(ds[0]).toMatchObject({ event: "firstMain" });
  });
  it("Four Knocks (real oracle) flips native-trigger — the firstMain timing + the reminder fix together", () => {
    expect(classifyCard({ name: "Four Knocks", type: "Enchantment", mana: "{2}{U}", oracle: `${REM}\nAt the beginning of your first main phase, draw a card.` })).toBe("native-trigger");
  });
});

describe("COMPOUND-AT-BEGINNING — 'When A and at the beginning of B, E' splits to two abilities", () => {
  const CRACK = "Vanishing 3 (This enchantment enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this enchantment enters and at the beginning of your first main phase, exile target creature an opponent controls until this enchantment leaves the battlefield.";
  it("Crack in Time detects BOTH halves (etb + firstMain), each carrying the shared effect", () => {
    const ds = detectTriggers(card("x", "Crack in Time", "Enchantment", CRACK));
    expect(ds.map((d) => d.event).sort()).toEqual(["etb", "firstMain"]);
    for (const d of ds) expect(d.effectClause).toMatch(/^exile target creature an opponent controls/);
  });
  it("Crack in Time classifies native-trigger — faithfully, on BOTH halves routing (not the old etb-only misread)", () => {
    expect(classifyCard({ name: "Crack in Time", type: "Enchantment", mana: "{2}{W}", oracle: CRACK })).toBe("native-trigger");
  });
  it("CREED guard: an unmodeled second timing parks the WHOLE card (shaped out-runs detected)", () => {
    // "the first upkeep in a game where it's your turn" (Rafi, Retro Racer's shape) is outside the timing
    // vocabulary — the split still happens, the second half classifies null, detected < shaped → body-only.
    const rafi = card("x", "Rafi", "Creature — Human", "When this creature enters and at the beginning of the first upkeep in a game where it's your turn, draw a card.");
    expect(classifyCard({ name: "Rafi", type: "Creature — Human", mana: "{1}{R}", oracle: rafi.oracle })).toBe("body-only");
  });
});

describe("TRIG-MAIN-FIRST — runtime: the engine fires it at the precombat-main entry (CR 505.1a)", () => {
  const DRAW_AT_MAIN = card("card-fm", "Synth", "Enchantment", "At the beginning of your first main phase, draw a card.");

  function atDrawStep(bf, { active = "user" } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      activePlayer: active,
      phase: "beginning",
      step: "draw",
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: bf, library: [{ id: "lib-top", name: "Forest", type: "Basic Land — Forest" }, { id: "lib-2", name: "Island", type: "Basic Land — Island" }], hand: [] },
      },
    };
  }
  const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
  // runStepActions FLUSHES step triggers onto the STACK before returning ("they ride the same flush
  // onto the stack" — the step-entry flush block), so the fired-or-not assertion must read the stack
  // AND the pending queue: asserting pendingTriggers alone is vacuously empty either way. (This test's
  // own first draft asserted only pendingTriggers and false-failed against a correctly-firing engine —
  // the same wrong-layer trap as the night's earlier isCommander bug; banked in the wake report.)
  const firedAtAll = (s) =>
    (s.stack || []).some((e) => e.kind === "triggered-ability" && e.source?.cardId === "card-fm")
    || (s.pendingTriggers || []).some((t) => t.descriptor?.event === "firstMain");

  it("advancing draw → precombat-main puts the firstMain trigger on the stack; resolving it draws", () => {
    let s = atDrawStep([watcher("w", DRAW_AT_MAIN)]);
    s = runStepActions(advanceStep(s));
    expect(s.phase).toBe("precombat-main");
    expect(firedAtAll(s)).toBe(true);
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.hand.map((c) => c.id)).toContain("lib-top");
  });

  it("the POSTCOMBAT main does NOT fire it (both mains share step 'main'; the phase gate holds)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...base,
      activePlayer: "user",
      phase: "combat",
      step: "end-of-combat",
      players: { ...base.players, user: { ...base.players.user, battlefield: [watcher("w", DRAW_AT_MAIN)], library: [{ id: "lib-top", name: "Forest", type: "Basic Land — Forest" }], hand: [] } },
    };
    s = runStepActions(advanceStep(s));
    expect(s.phase).toBe("postcombat-main");
    expect(firedAtAll(s)).toBe(false);
  });

  it("whose:'yours' — an OPPONENT's watcher does not fire on the active player's main phase", () => {
    let s = atDrawStep([], { active: "user" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [watcher("w", DRAW_AT_MAIN, "ai")] } } };
    s = runStepActions(advanceStep(s));
    expect(s.phase).toBe("precombat-main");
    expect(firedAtAll(s)).toBe(false);
  });
});
