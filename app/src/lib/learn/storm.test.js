/**
 * storm.test.js — the STORM keyword subsystem (CR 702.40).
 *
 * "Storm (When you cast this spell, copy it for each spell cast before it this turn.)" is a printed KEYWORD
 * whose triggered ability lives in REMINDER parens — like Bushido/Rampage, the boundary-anchored When/Whenever
 * regex can't see it, so triggers.detectTriggers SYNTHESIZES a selfCast `copy-spell` trigger off the keyword.
 *
 * THE STORM-COPY PATH (all here):
 *   1. detectTriggers → an event:"selfCast" descriptor { stormCopy:true, effectClause:"copy this spell for each
 *      spell cast before it this turn" }. copySpellClauseParser maps that synthetic clause → a non-targeted
 *      `copy-spell` atom, so triggerRoutesNatively gates it HIGH + non-targeted (the α1 non-targeted path).
 *   2. checkCastTriggers' self-cast block snapshots stormCount = spellsCastThisTurn-1 (spells cast BEFORE this
 *      one this turn, CR 702.40a) + the storm spell's frozen payload onto the trigger's context.
 *   3. The storm trigger goes on the stack ABOVE the spell (flushTriggers) and resolves FIRST; the copy-spell
 *      atom pushes N copies of the spell's payload (each isCopy/token — not a card, CR 707.10a) onto the stack.
 *   4. Each copy resolves its frozen EFFECT_PROGRAM (create-token / gain-life) independently, then ceases to
 *      exist — exactly like the original except no card disposition.
 *
 * BUILT (whole-card CREED-clean, NON-targeted bodies whose copies need no new targets): Empty the Warrens,
 * Chatterstorm, Hunting Pack (create-token), Weather the Storm (gain-life).
 *
 * CREED anti-FP pins: a TARGETED-body storm spell (Grapeshot, Tendrils, Brain Freeze) stays on the Arbiter —
 * its copy would need new targets the copy-spell atom doesn't model (STORM-COPY-TARGET GATE). A creature storm
 * spell with an unmodeled anthem (Stormscale Scion / Stormscale Wurm — the Ur-Dragon card) stays body-only. A
 * LOW-body storm spell (Crow Storm — a named token; Dragonstorm — a tutor-to-battlefield) stays Arbiter. Real
 * oracle text (verified vs the bundled local index), verbatim.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

// ── real oracle text (verbatim) ──────────────────────────────────────────────────
const EMPTY_THE_WARRENS = {
  name: "Empty the Warrens", type: "Sorcery", mana: "{3}{R}",
  oracle: "Create two 1/1 red Goblin creature tokens.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};
const CHATTERSTORM = {
  name: "Chatterstorm", type: "Sorcery", mana: "{1}{G}",
  oracle: "Create a 1/1 green Squirrel creature token.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};
const HUNTING_PACK = {
  name: "Hunting Pack", type: "Instant", mana: "{5}{G}{G}",
  oracle: "Create a 4/4 green Beast creature token.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};
const WEATHER_THE_STORM = {
  name: "Weather the Storm", type: "Instant", mana: "{1}{G}",
  oracle: "You gain 3 life.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};
// Non-targeted bodies that ride along: proliferate (Radstorm) + a basic-land tutor-to-hand (Sprouting Vines).
const RADSTORM = {
  name: "Radstorm", type: "Instant", mana: "{3}{U}",
  oracle: "Storm (When you cast this spell, copy it for each spell cast before it this turn.)\nProliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)",
};
const SPROUTING_VINES = {
  name: "Sprouting Vines", type: "Instant", mana: "{2}{G}",
  oracle: "Search your library for a basic land card, reveal that card, put it into your hand, then shuffle.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};

// ── detection ─────────────────────────────────────────────────────────────────────
describe("STORM — detectTriggers synthesizes a selfCast copy-spell trigger from the keyword", () => {
  it("Empty the Warrens → an event:selfCast stormCopy descriptor with the copy-spell clause", () => {
    const trg = detectTriggers(EMPTY_THE_WARRENS);
    const storm = trg.find((d) => d.stormCopy);
    expect(storm).toBeTruthy();
    expect(storm.event).toBe("selfCast");
    expect(storm.scope).toBe("self");
    expect(storm.whose).toBe("you");
    expect(storm.effectClause).toBe("copy this spell for each spell cast before it this turn");
  });
  it("a non-storm spell has NO stormCopy trigger", () => {
    const card = { name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
    expect(detectTriggers(card).some((d) => d.stormCopy)).toBe(false);
  });
});

// ── classification: native ──────────────────────────────────────────────────────
describe("STORM — clean non-targeted storm spells classify native-spell", () => {
  for (const card of [EMPTY_THE_WARRENS, CHATTERSTORM, HUNTING_PACK, WEATHER_THE_STORM, RADSTORM, SPROUTING_VINES]) {
    it(`${card.name} → native-spell`, () => {
      expect(classifyCard(card)).toBe("native-spell");
    });
  }
});

// ── classification: CREED anti-FP (parked) ───────────────────────────────────────
describe("STORM — PARKED: storm spells whose whole card isn't modeled stay non-native", () => {
  const parked = {
    // TARGETED body — a copy needs new targets the copy-spell atom doesn't choose (STORM-COPY-TARGET GATE).
    "Grapeshot (targeted body)": {
      name: "Grapeshot", type: "Sorcery", mana: "{1}{R}",
      oracle: "Grapeshot deals 1 damage to any target.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
    },
    "Tendrils of Agony (targeted body)": {
      name: "Tendrils of Agony", type: "Sorcery", mana: "{2}{B}{B}",
      oracle: "Target player loses 2 life and you gain 2 life.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
    },
    "Brain Freeze (targeted body)": {
      name: "Brain Freeze", type: "Instant", mana: "{1}{U}",
      oracle: "Target player mills three cards.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
    },
    // Creature storm spell with an UNMODELED anthem (the Ur-Dragon card) — body-only.
    "Stormscale Scion (anthem unmodeled)": {
      name: "Stormscale Scion", type: "Creature — Dragon", mana: "{4}{R}{R}", power: 4, toughness: 4,
      oracle: "Flying\nOther Dragons you control get +1/+1.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. Copies become tokens.)",
    },
    "Stormscale Wurm (anthem unmodeled)": {
      name: "Stormscale Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", power: 7, toughness: 7,
      oracle: "Trample\nOther Wurms you control get +1/+1.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. The copies become tokens.)",
    },
    // LOW body (named token / tutor-to-battlefield) — the body itself isn't modeled, so the whole card parks.
    "Crow Storm (named token, LOW body)": {
      name: "Crow Storm", type: "Sorcery", mana: "{2}{U}",
      oracle: "Create a 1/2 blue Bird creature token with flying named Storm Crow.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
    },
    "Dragonstorm (tutor-to-battlefield, LOW body)": {
      name: "Dragonstorm", type: "Sorcery", mana: "{8}{R}",
      oracle: "Search your library for a Dragon permanent card, put it onto the battlefield, then shuffle.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
    },
  };
  for (const [label, card] of Object.entries(parked)) {
    it(`${label} is NOT native-spell`, () => {
      expect(classifyCard(card)).not.toBe("native-spell");
    });
  }
});

// ── runtime: the storm-copy path ─────────────────────────────────────────────────
// Cast a storm spell with `prior` spells already cast this turn; resolve the storm trigger (on top), then
// resolve each copy + the original. Returns the post-resolution state.
function castStormAndResolveAll(card, { prior }) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const c = { ...card, id: "storm1" };
  s = {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      // prior = spells already cast this turn BEFORE the storm spell (recordSpellCast bumps it to prior+1 at cast).
      user: { ...s.players.user, hand: [c], manaPool: { ...s.players.user.manaPool, C: 20, R: 20, G: 20, U: 20 }, spellsCastThisTurn: prior },
    },
  };
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "storm1");
  expect(cast, `${card.name}: cast offered`).toBeTruthy();
  s = dispatchAction(s, cast);
  // Drain the stack: the storm trigger (top) resolves first → pushes copies; then copies; then the original.
  let guard = 0;
  while (s.stack.length > 0 && guard++ < 50) {
    s = resolveTopOfStack(s);
  }
  return s;
}

describe("STORM — RUNTIME: the trigger copies the spell N = spells cast before it this turn", () => {
  it("Empty the Warrens as the 3rd spell (2 before) → 3 resolutions × 2 Goblins = 6 tokens", () => {
    const s = castStormAndResolveAll(EMPTY_THE_WARRENS, { prior: 2 });
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(6); // original (2) + 2 copies (2 each)
  });

  it("Chatterstorm as the 1st spell (0 before) → NO copies, just the original 1 Squirrel", () => {
    const s = castStormAndResolveAll(CHATTERSTORM, { prior: 0 });
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(1); // original only — storm count 0
  });

  it("Chatterstorm as the 4th spell (3 before) → 4 resolutions × 1 Squirrel = 4 tokens", () => {
    const s = castStormAndResolveAll(CHATTERSTORM, { prior: 3 });
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(4);
  });

  it("Hunting Pack as the 2nd spell (1 before) → 2 resolutions × one 4/4 Beast = 2 tokens", () => {
    const s = castStormAndResolveAll(HUNTING_PACK, { prior: 1 });
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens.length).toBe(2);
    expect(tokens.every((t) => t.card.power === 4 && t.card.toughness === 4)).toBe(true);
  });

  it("Weather the Storm as the 3rd spell (2 before) → 3 resolutions × gain 3 = +9 life", () => {
    const start = createGameState({ userDeck: [], aiDeck: [] }).players.user.life;
    const s = castStormAndResolveAll(WEATHER_THE_STORM, { prior: 2 });
    expect(s.players.user.life).toBe(start + 9); // gain 3, three times
  });

  it("a storm-copy log records the copy count", () => {
    const s = castStormAndResolveAll(EMPTY_THE_WARRENS, { prior: 2 });
    const copyLog = (s.log || []).find((e) => e.effect === "storm-copy" && e.count === 2);
    expect(copyLog, "storm-copy log with count 2").toBeTruthy();
  });

  it("Radstorm as the 3rd spell (2 before) → 3 proliferate resolutions, no wedge", () => {
    const s = castStormAndResolveAll(RADSTORM, { prior: 2 });
    expect(s.stack.length).toBe(0);
    const prolifs = (s.log || []).filter((e) => e.effect === "proliferate");
    expect(prolifs.length).toBe(3); // original + 2 copies
  });
});

// Sprouting Vines (a tutor body) — each copy suspends on its tutor choice; the Expert auto-pick settles it and
// the program resumes (the standard interactive-tutor path), so N copies fetch N basics. Drives the same
// autoPickTutorCandidate the self-play Expert driver uses.
describe("STORM — RUNTIME: a tutor-body storm spell copies + each copy fetches (Sprouting Vines)", () => {
  it("3rd spell (2 before) → 3 tutor resolutions → 3 basics to hand", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const c = { ...SPROUTING_VINES, id: "sv" };
    const lib = [
      { id: "f1", name: "Forest", type: "Basic Land — Forest" },
      { id: "f2", name: "Forest", type: "Basic Land — Forest" },
      { id: "f3", name: "Forest", type: "Basic Land — Forest" },
    ];
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [c], library: lib, manaPool: { ...s.players.user.manaPool, C: 20, G: 20 }, spellsCastThisTurn: 2 } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sv");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    let guard = 0;
    while ((s.stack.length > 0 || s.pendingChoice) && guard++ < 60) {
      if (s.pendingChoice?.kind === "tutor-search") {
        s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
        s = finalizeStackResolution(s);
        continue;
      }
      if (s.pendingChoice) break; // unexpected pause — let the assertion below catch the wedge
      s = resolveTopOfStack(s);
    }
    expect(s.stack.length).toBe(0);
    expect(s.pendingChoice).toBeFalsy();
    const tutorLogs = (s.log || []).filter((e) => e.effect === "tutor");
    expect(tutorLogs.length).toBe(3); // original + 2 copies each fetched
    expect(s.players.user.hand.filter((x) => x.name === "Forest").length).toBe(3);
  });
});
