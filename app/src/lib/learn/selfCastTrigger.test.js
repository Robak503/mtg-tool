/**
 * selfCastTrigger.test.js — the SELF-CAST trigger subsystem (CR 603.2 + 601.2).
 *
 * "When you cast THIS spell, <effect>" is the SPELL's OWN cast trigger — distinct from every other cast trigger
 * in the engine, which are battlefield WATCHERS ("Whenever you cast a[n] <…> spell, …") scanned by
 * checkCastTriggers. The diagnosed gap: the engine had NO self-cast trigger event, so detectTriggers returned
 * nothing for "When you cast this spell" and the cast-time effect never fired.
 *
 * THE PATH (all here):
 *   1. detectSelfCast (registered detector) classifies the EXACT "you cast this spell" condition → an
 *      event:"selfCast" descriptor carrying the effectClause (so coverage's allTriggerSentencesModeled counts
 *      it and triggerRoutesNatively gates the effect).
 *   2. checkCastTriggers' self-cast block enqueues ONE pending trigger off the SPELL being cast (the source is
 *      the spell, not a battlefield permanent — like the heroic/prowess non-watcher cases), threading the cast's
 *      chosen X into context.xValue.
 *   3. buildTriggerStack reads context.xValue into the EFFECT_PROGRAM params, so a half-X / X-amount payoff
 *      (Hydroid Krasis — covered in zaxaraHydras.test.js) resolves at the real X. The trigger goes on the stack
 *      ABOVE the spell and resolves FIRST (CR 603.3b).
 *
 * BUILT (whole-card CREED-clean): Desolation Twin ({10} — "When you cast this spell, create a 10/10 colorless
 * Eldrazi creature token"). Its only text IS the self-cast trigger, and create-token parses HIGH.
 * (Hydroid Krasis — the half-X cross-deck flip — has its own runtime suite in zaxaraHydras.test.js.)
 *
 * CREED anti-FP pins: every OTHER self-cast card carries an UNMODELED sibling clause (Emerge / Rebound /
 * Annihilator + the Kozilek graveyard-shuffle trigger) and stays body-only — the self-cast detector flips ONLY
 * cards whose whole text is modeled. A battlefield cast WATCHER ("Whenever you cast an artifact spell, …") is
 * untouched (it's not "this spell"). Real oracle text (verified vs the bundled local index), verbatim.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// ── detection ───────────────────────────────────────────────────────────────────
describe("SELF-CAST — detectTriggers recognizes the spell's own cast trigger", () => {
  it("\"When you cast this spell, …\" → an event:selfCast descriptor with the effect clause", () => {
    const card = { name: "X", type: "Creature — Eldrazi", mana: "{10}", oracle: "When you cast this spell, create a 10/10 colorless Eldrazi creature token." };
    const trg = detectTriggers(card);
    expect(trg.length).toBe(1);
    expect(trg[0].event).toBe("selfCast");
    expect(trg[0].scope).toBe("self");
    expect(trg[0].whose).toBe("you");
    expect(trg[0].effectClause).toBe("create a 10/10 colorless Eldrazi creature token");
  });
  it("a battlefield cast WATCHER (\"Whenever you cast an artifact spell, …\") is NOT a self-cast trigger", () => {
    const card = { name: "Watcher", type: "Artifact", mana: "{3}", oracle: "Whenever you cast an artifact spell, draw a card." };
    const trg = detectTriggers(card);
    expect(trg.some((d) => d.event === "selfCast")).toBe(false);
    expect(trg.some((d) => d.event === "cast")).toBe(true); // it's the existing watcher event
  });
});

// ── Desolation Twin — the BUILT card ──────────────────────────────────────────────
const DESOLATION_TWIN = {
  name: "Desolation Twin", type: "Creature — Eldrazi", mana: "{10}", power: 10, toughness: 10,
  oracle: "When you cast this spell, create a 10/10 colorless Eldrazi creature token.",
};

describe("SELF-CAST — Desolation Twin classifies + resolves native", () => {
  it("classifies native-trigger (the whole card is the self-cast create-token trigger)", () => {
    expect(classifyCard(DESOLATION_TWIN)).toBe("native-trigger");
  });

  it("RUNTIME: casting it fires the self-cast trigger ABOVE the spell — the 10/10 token enters FIRST", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const card = { ...DESOLATION_TWIN, id: "dt" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [card], manaPool: { ...s.players.user.manaPool, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dt");
    expect(cast, "the cast was offered").toBeTruthy();
    s = dispatchAction(s, cast);
    // The spell + its self-cast trigger are on the stack; the trigger is ON TOP (resolves first, CR 603.3b).
    s = resolveTopOfStack(s);
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(1);
    expect(tokens[0].card.power).toBe(10);
    expect(tokens[0].card.toughness).toBe(10);
    // The real Desolation Twin hasn't resolved yet — only the token is on the battlefield so far.
    expect(s.players.user.battlefield.some((p) => p.card.id === "dt")).toBe(false);
    // Now resolve the spell itself.
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some((p) => p.card.id === "dt")).toBe(true);
    expect(s.players.user.battlefield.filter((p) => p.card?.token).length).toBe(1); // still exactly the one token
  });
});

// ── CREED anti-FP pins — a self-cast card with an UNMODELED sibling clause stays body-only ──
describe("SELF-CAST — PARKED: a self-cast card with an unmodeled sibling clause stays body-only", () => {
  const parked = {
    // Emerge (CR 702.97) is an unmodeled alternative cast cost → the whole card stays non-native.
    "Wretched Gryff (Emerge alt-cost unmodeled)": {
      name: "Wretched Gryff", type: "Creature — Eldrazi Hippogriff", mana: "{7}", power: 3, toughness: 4,
      oracle: "Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, draw a card.\nFlying",
    },
    "It of the Horrid Swarm (Emerge alt-cost unmodeled)": {
      name: "It of the Horrid Swarm", type: "Creature — Eldrazi Insect", mana: "{8}", power: 4, toughness: 4,
      oracle: "Emerge {6}{G} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, create two 1/1 green Insect creature tokens.",
    },
    // Rebound (CR 702.88) — an unmodeled cast-from-exile keyword.
    "Jeskai Baller (Rebound unmodeled)": {
      name: "Jeskai Baller", type: "Creature — Human Athlete", mana: "{2}{W}", power: 2, toughness: 2,
      oracle: "When you cast this spell, create a 1/1 white Athlete creature token.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)",
    },
    // Annihilator (CR 702.85) + the second "put into a graveyard" trigger — both unmodeled.
    "Kozilek, Butcher of Truth (Annihilator + GY-shuffle trigger unmodeled)": {
      name: "Kozilek, Butcher of Truth", type: "Legendary Creature — Eldrazi", mana: "{10}", power: 12, toughness: 12,
      oracle: "When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.",
    },
  };
  for (const [label, card] of Object.entries(parked)) {
    it(`${label} stays body-only`, () => {
      expect(classifyCard(card)).toBe("body-only");
    });
  }
});
