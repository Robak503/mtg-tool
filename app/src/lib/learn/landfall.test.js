/**
 * LANDFALL (CR 603 — landfall is an ability word [CR 207.2c] for a TRIGGERED ability, not a replacement
 * effect) — "Landfall — Whenever a land you control enters, <payoff>" (Tatyova, Jaddi Offshoot,
 * Rampaging Baloths, the Zendikar landfall family). A NEW land-entry trigger event, fired by the PLAY-LAND
 * path (applyPlayLand → checkLandfallTriggers). The "Landfall —" ability-word label (CR 207.2c, flavor) is
 * stripped IDENTICALLY in detectTriggers and the coverage metric (stripTriggerAbilityLabel) so the
 * shaped-sentence count and the detected-trigger count agree. Controller-scoped (the entering land is YOURS).
 *
 * CREED: only the bare "a land you control enters" / "a land enters the battlefield under your control" forms
 * with a MODELED payoff flip; a filtered subject ("a basic land", "another land", an opponent's land), an
 * "enters tapped" rider, or an unmodeled payoff (Lotus Cobra's landfall MANA) stays on the Arbiter. The
 * ramp/fetch land-entry path is a follow-up slice (a missed landfall there is a SAFE under-fire).
 *
 * LANDFALL-COMPOSITE (Toph TIER-2): a landfall trigger MIXED with another modeled ability (Aesi = extra-land
 * static + optional-draw; Bristly Bill = double-counters activated + counter-on-target; Maja = anthem + token)
 * now composes to native-mixed. The blocker was permanentFullyCovered (coverage.js): it didn't stripTrigger-
 * AbilityLabel before its trigger-sentence strip, so the whole "Landfall — …" sentence survived as residue.
 * The fix mirrors permanentTriggersCovered (strip the label FIRST). The 6-land token-copy (Scute Swarm) and
 * the 2nd-resolution doubler (Scythecat Cub) riders are unmodeled → those payoffs parse LOW → stay body-only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, stripTriggerAbilityLabel } from "./triggers.js";
import { classifyCard, permanentFullyCovered } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creatureCard = (name, oracle, over = {}) => ({ id: `card-${name}`, name, type: "Creature — Elemental", power: 2, toughness: 2, oracle, ...over });

describe("LANDFALL — detection (label-stripped, controller-scoped)", () => {
  const lf = (oracle) => detectTriggers(creatureCard("Watcher", oracle)).find((t) => t.event === "landfall");
  it("strips the 'Landfall —' label and detects the land-entry event", () => {
    expect(lf("Landfall — Whenever a land you control enters, you gain 1 life and draw a card.")).toMatchObject({ event: "landfall", scope: "landYouControl" });
    expect(lf("Landfall — Whenever a land enters the battlefield under your control, create a 4/4 green Beast creature token.")).toMatchObject({ event: "landfall", scope: "landYouControl" });
  });
  it("detects the UNLABELED form too (Tatyova prints without the ability word in some templates)", () => {
    expect(lf("Whenever a land you control enters, you gain 1 life.")).toMatchObject({ event: "landfall", scope: "landYouControl" });
  });
  it("CREED: a filtered subject / opponent's land / 'enters tapped' rider stays UNDETECTED → Arbiter", () => {
    expect(lf("Landfall — Whenever a basic land you control enters, draw a card.")).toBeUndefined();
    expect(lf("Whenever another land you control enters, draw a card.")).toBeUndefined();
    expect(lf("Whenever a land an opponent controls enters, you draw a card.")).toBeUndefined();
    expect(lf("Whenever a land you control enters tapped, draw a card.")).toBeUndefined();
  });
  it("stripTriggerAbilityLabel removes only a leading Landfall label", () => {
    expect(stripTriggerAbilityLabel("Landfall — Whenever a land you control enters, draw a card.")).toBe("Whenever a land you control enters, draw a card.");
    expect(stripTriggerAbilityLabel("Flying\nLandfall — Whenever a land you control enters, draw a card.")).toBe("Flying\nWhenever a land you control enters, draw a card.");
    expect(stripTriggerAbilityLabel("When this enters, draw a card.")).toBe("When this enters, draw a card."); // untouched
  });
});

describe("LANDFALL — coverage flips (synthetic cards, real oracle text)", () => {
  it("a landfall payoff the compiler models flips native", () => {
    expect(classifyCard({ type: "Legendary Creature — Merfolk Druid", name: "Tatyova, Benthic Druid", mana: "{3}{G}{U}", oracle: "Landfall — Whenever a land you control enters, you gain 1 life and draw a card." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Beast", name: "Rampaging Baloths", mana: "{4}{G}{G}", oracle: "Trample\nLandfall — Whenever a land you control enters, create a 4/4 green Beast creature token." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Plant", name: "Jaddi Offshoot", mana: "{G}", oracle: "Defender\nLandfall — Whenever a land you control enters, you gain 1 life." })).toBe("native-trigger");
  });
  it("CREED — an unmodeled landfall payoff (a FILTERED subject) stays body-only", () => {
    // ⚠️ Lotus Cobra was asserted here too, on "a fabricated mana is a forbidden FP" — correct when written,
    // because the mana payoff genuinely was not modeled. It is now: exactly ONE mana, in a colour taken from
    // the controller's commander identity (falling back to the source's own colours), board-verified. The
    // amount is exact, so a suboptimal colour is a play-quality loss, never fabricated mana. It moves to the
    // positive pin below. The FILTERED subject stays here — still genuinely unmodeled.
    expect(classifyCard({ type: "Creature — Elemental", name: "Filtered", mana: "{2}{G}", oracle: "Landfall — Whenever a basic land you control enters, you gain 1 life." })).toBe("body-only");
  });

  it("⭐ Lotus Cobra #323 — the landfall MANA payoff is modeled now", () => {
    expect(classifyCard({ type: "Creature — Snake", name: "Lotus Cobra", mana: "{1}{G}", colors: ["G"], oracle: "Landfall — Whenever a land you control enters, add one mana of any color." })).toBe("native-trigger");
  });
});

describe("LANDFALL — engine: playing a land FIRES the landfall trigger (CREED — proves the wiring, not just classification)", () => {
  const FOREST = { id: "forest1", name: "Forest", type: "Basic Land — Forest", mana: "" };
  // user always holds the Forest; the watcher (or none) sits on the named side's battlefield.
  function board(watcherCard, watcherSide /* "user" | "ai" | null */) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = watcherCard ? [createPermanent({ id: "watcher", card: watcherCard, controller: watcherSide })] : [];
    return {
      ...s, phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user",
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [FOREST], battlefield: watcherSide === "user" ? watcher : [] },
        ai: { ...s.players.ai, battlefield: watcherSide === "ai" ? watcher : [] },
      },
    };
  }
  const playForest = (s) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "forest1", name: "Forest" });
  const tatyova = () => creatureCard("Tatyova", "Landfall — Whenever a land you control enters, you gain 1 life and draw a card.");

  it("a user landfall watcher fires when the user plays a land", () => {
    const after = playForest(board(tatyova(), "user"));
    expect((after.pendingTriggers || []).filter((t) => t.event === "landfall" && t.controller === "user")).toHaveLength(1);
    expect(after.players.user.battlefield.some((p) => p.card.name === "Forest")).toBe(true);
  });
  it("an OPPONENT's landfall watcher does NOT fire when the user plays a land (controller-scoped)", () => {
    const after = playForest(board(tatyova(), "ai"));
    expect((after.pendingTriggers || []).some((t) => t.event === "landfall")).toBe(false);
  });
  it("no watcher → playing a land queues no landfall trigger (clean no-op)", () => {
    const after = playForest(board(creatureCard("Bear", "Flying"), "user"));
    expect((after.pendingTriggers || []).some((t) => t.event === "landfall")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// LANDFALL-COMPOSITE (Toph TIER-2) — a landfall trigger MIXED with another modeled ability (a static, an
// activated). The landfall payoff already routed natively (native-trigger tier), but the WHOLE card read
// body-only because permanentFullyCovered (the composite combiner) didn't strip the "Landfall —" ability-word
// label before its trigger-sentence strip, so the entire landfall sentence survived as apparent residue. The
// fix mirrors permanentTriggersCovered: stripTriggerAbilityLabel FIRST. Real Scryfall oracle text.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("LANDFALL-COMPOSITE — a modeled landfall trigger + another modeled ability flips native-mixed", () => {
  // Aesi = "You may play an additional land …" (extra-land static) + landfall "you may draw a card" (α2 optional → draw).
  const AESI = { id: "c-aesi", name: "Aesi, Tyrant of Gyre Strait", type: "Legendary Creature — Serpent", power: 5, toughness: 5, mana: "{4}{G}{U}", oracle: "You may play an additional land on each of your turns.\nLandfall — Whenever a land you control enters, you may draw a card." };
  // Bristly Bill = landfall "+1/+1 counter on target creature" + "{3}{G}{G}: Double the number of +1/+1 counters on each creature you control" (activated, DOUBLE-COUNTERS-EACH).
  const BRISTLY_BILL = { id: "c-bb", name: "Bristly Bill, Spine Sower", type: "Legendary Creature — Plant Druid", power: 1, toughness: 1, mana: "{1}{G}", oracle: "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature.\n{3}{G}{G}: Double the number of +1/+1 counters on each creature you control." };
  // Maja = anthem static ("Other creatures you control get +1/+1") + landfall "create a 1/1 white Human Warrior creature token".
  const MAJA = { id: "c-maja", name: "Maja, Bretagard Protector", type: "Legendary Creature — Human Warrior", power: 3, toughness: 3, mana: "{3}{G}{W}", oracle: "Other creatures you control get +1/+1.\nLandfall — Whenever a land you control enters, create a 1/1 white Human Warrior creature token." };

  it("Aesi, Bristly Bill, Maja classify native-mixed (label-stripped composite)", () => {
    expect(permanentFullyCovered(AESI)).toBe(true);
    expect(permanentFullyCovered(BRISTLY_BILL)).toBe(true);
    expect(permanentFullyCovered(MAJA)).toBe(true);
    expect(classifyCard(AESI)).toBe("native-mixed");
    expect(classifyCard(BRISTLY_BILL)).toBe("native-mixed");
    expect(classifyCard(MAJA)).toBe("native-mixed");
  });

  // ── CREED anti-FP pins: a landfall card whose PAYOFF (or a rider on it) is unmodeled stays body-only ──
  it("⭐ Scute Swarm's six-land token-copy rider is MODELED now (conditional replacement, CR 608.2)", () => {
    // ⚠️ Scute Swarm was the second card in the pin below, deferred as an unmodeled rider. It is a
    // REPLACEMENT ("create a copy instead"), which now has a branch atom: both halves parse HIGH and
    // "you control six or more lands" is decidable. Board-verified in conditionalReplacement.test.js —
    // three lands makes the 1/1 Insect, six makes the copy.
    expect(classifyCard({ id: "c-scute", name: "Scute Swarm", type: "Creature — Insect", power: 1, toughness: 1, mana: "{2}{G}", oracle: "Landfall — Whenever a land you control enters, create a 1/1 green Insect creature token. If you control six or more lands, create a token that's a copy of this creature instead." })).toBe("native-trigger");
  });

  it("CREED — Scythecat Cub (2nd-resolution doubler rider) stays body-only", () => {
    // ⚠️ Lotus Cobra was the third card in this pin, on "a fabricated mana is a forbidden FP". That was true
    // when written and is not now: the trigger→effect bridge models "add one mana of any color" as exactly
    // ONE mana in a colour drawn from the controller's commander identity. The two riders below are still
    // genuinely unmodeled, so the CREED half of this pin is intact — only the stale member left.
    // (Scute Swarm was the second member and has MOVED to its own positive pin above — its replacement is
    // modeled now. Scythecat Cub stays: its condition is genuinely inexpressible.)
    // Scythecat Cub — the "If this is the second time this ability has resolved this turn, double … instead"
    // per-turn-resolution-count rider is unmodeled → the payoff parses LOW → body-only.
    expect(classifyCard({ id: "c-scythe", name: "Scythecat Cub", type: "Creature — Cat", power: 2, toughness: 2, mana: "{1}{G}", oracle: "Trample\nLandfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control. If this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead." })).toBe("body-only");
  });

  // ── RUNTIME: the landfall genuinely FIRES + the effect happens (CREED — proves the wiring, not just the metric) ──
  const FOREST = { id: "forest1", name: "Forest", type: "Basic Land — Forest", mana: "" };
  function boardWith(watcherCard) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user",
      players: { ...s.players, user: { ...s.players.user, hand: [FOREST], library: [{ id: "lib1", name: "Forest", type: "Basic Land — Forest", oracle: "" }], battlefield: [createPermanent({ id: "watcher", card: watcherCard, controller: "user" })] } },
    };
  }
  const playForest = (s) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "forest1", name: "Forest" });
  const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; };

  it("Bristly Bill: playing a land resolves the landfall +1/+1 counter (lands on the only creature)", () => {
    let s = playForest(boardWith(BRISTLY_BILL));
    expect((s.pendingTriggers || []).filter((t) => t.event === "landfall")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const bb = s.players.user.battlefield.find((p) => p.id === "watcher");
    expect(bb?.counters?.["+1/+1"]).toBe(1); // the counter genuinely landed
  });

  it("Maja: playing a land resolves the landfall token (a 1/1 Human Warrior enters)", () => {
    let s = playForest(boardWith(MAJA));
    expect((s.pendingTriggers || []).filter((t) => t.event === "landfall")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const warriors = s.players.user.battlefield.filter((p) => p.id !== "watcher" && /Warrior/.test(p.card?.name || ""));
    expect(warriors).toHaveLength(1); // the token genuinely entered
  });

  it("Aesi: the landfall optional draw, when TAKEN (the session auto-takes a beneficial 'you may'), draws a card", () => {
    // The landfall trigger fires + suspends on the α2 optional ("you may draw"); learnSession auto-takes a
    // beneficial optional for an AI/Expert seat. Drive that auto-take (resolveOptionalChoice(state, true)) and
    // assert the draw resolves — proving the modeled payoff genuinely fires at runtime (CREED, not just metric).
    let s = playForest(boardWith(AESI));
    expect((s.pendingTriggers || []).filter((t) => t.event === "landfall")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // The optional pauses at resolution; the session-level auto-take answers YES.
    let guard = 0;
    while (s.pendingChoice?.kind === "optional-effect" && guard++ < 5) s = resolveAll(resolveOptionalChoice(s, true));
    // started with 1 card (the Forest) → played it (0) → drew via landfall (1); library 1 → 0.
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.library).toHaveLength(0);
  });
});
