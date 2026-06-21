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
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, stripTriggerAbilityLabel } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
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
  it("CREED — an unmodeled landfall payoff (mana / filtered subject) stays body-only", () => {
    expect(classifyCard({ type: "Creature — Snake", name: "Lotus Cobra", mana: "{1}{G}", oracle: "Landfall — Whenever a land you control enters, add one mana of any color." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Elemental", name: "Filtered", mana: "{2}{G}", oracle: "Landfall — Whenever a basic land you control enters, you gain 1 life." })).toBe("body-only");
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
