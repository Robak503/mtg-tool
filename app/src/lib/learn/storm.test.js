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
 * BUILT — NON-targeted bodies (copies need no new targets): Empty the Warrens, Chatterstorm, Hunting Pack
 * (create-token), Weather the Storm (gain-life).
 * BUILT — TARGETED bodies (STORM-COPY-TARGET, CR 707.10c "You may choose new targets for the copies"): Grapeshot
 * ("deals 1 damage to any target") + Tendrils of Agony ("target player loses 2 life and you gain 2 life"). Each
 * copy re-picks its OWN legal target as it's put on the stack (applyCopySpell → expandCastChoices), aiming at an
 * opponent (the enemy-side chooser), so N copies of Grapeshot = N separate 1-damage instances each to a chosen
 * target. The body flips ONLY when every chosen-target atom is intent-resolvable (programTriggerTargetsResolvable).
 *
 * CREED anti-FP pins: a targeted-body storm spell whose body parses LOW (Brain Freeze — "target player mills
 * three cards" isn't a modeled atom) stays on the Arbiter (the HIGH-body gate catches it BEFORE the target gate).
 * A creature storm spell with an unmodeled anthem (Stormscale Scion / Stormscale Wurm — the Ur-Dragon card) stays
 * body-only. A LOW-body storm spell (Crow Storm — a named token; Dragonstorm — a tutor-to-battlefield) stays
 * Arbiter. Real oracle text (verified vs the bundled local index), verbatim.
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
// TARGETED bodies — copies re-pick a fresh legal target per copy (STORM-COPY-TARGET, CR 707.10c).
const GRAPESHOT = {
  name: "Grapeshot", type: "Sorcery", mana: "{1}{R}",
  oracle: "Grapeshot deals 1 damage to any target.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
};
const TENDRILS_OF_AGONY = {
  name: "Tendrils of Agony", type: "Sorcery", mana: "{2}{B}{B}",
  oracle: "Target player loses 2 life and you gain 2 life.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
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

// STORM-COPY-TARGET (CR 707.10c) — targeted bodies flip native now that each copy re-picks a legal target.
describe("STORM — targeted-body storm spells classify native-spell (copies choose new targets)", () => {
  for (const card of [GRAPESHOT, TENDRILS_OF_AGONY]) {
    it(`${card.name} → native-spell`, () => {
      expect(classifyCard(card)).toBe("native-spell");
    });
  }
});

// ── classification: CREED anti-FP (parked) ───────────────────────────────────────
describe("STORM — PARKED: storm spells whose whole card isn't modeled stay non-native", () => {
  const parked = {
    // LOW body — "target player mills three cards" isn't a modeled atom, so the HIGH-body gate parks it BEFORE
    // the target gate is ever consulted (a targeted-mill atom is a separate, larger build). CREED whole-card.
    "Brain Freeze (LOW targeted-mill body)": {
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

// ── runtime: TARGETED storm copies each choose a fresh legal target (STORM-COPY-TARGET, CR 707.10c) ──────────
// Cast a targeted storm spell AIMING THE ORIGINAL AT THE OPPONENT (pick the cast action whose every target is the
// opponent), then drain the stack. Each copy independently re-picks an opponent target (the enemy-side chooser),
// so all N+1 resolutions hit the opponent. Returns the post-resolution state. (The CAST-path AI target choice for
// the ORIGINAL is a separate concern; we pin the original at the opponent so the assertion isolates copy behavior.)
function castTargetedStormAtOpponent(card, { prior }) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const c = { ...card, id: "storm1" };
  s = {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [c], manaPool: { ...s.players.user.manaPool, C: 20, R: 20, G: 20, U: 20, B: 20 }, spellsCastThisTurn: prior },
    },
  };
  const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "storm1");
  // The cast whose every target is the opponent ("ai"); fall back to the first cast if none enumerated (defensive).
  const cast = casts.find((a) => (a.targets || []).length > 0 && (a.targets || []).every((t) => t.id === "ai")) || casts[0];
  expect(cast, `${card.name}: an opponent-targeting cast offered`).toBeTruthy();
  s = dispatchAction(s, cast);
  let guard = 0;
  while (s.stack.length > 0 && guard++ < 50) s = resolveTopOfStack(s);
  return s;
}

describe("STORM — RUNTIME: a TARGETED body copies + each copy hits a chosen target", () => {
  it("Grapeshot as the 3rd spell (2 before) → 3 × 1 damage to the opponent (original + 2 copies); caster untouched", () => {
    const start = createGameState({ userDeck: [], aiDeck: [] });
    const s = castTargetedStormAtOpponent(GRAPESHOT, { prior: 2 });
    expect(s.stack.length).toBe(0);
    expect(start.players.ai.life - s.players.ai.life).toBe(3); // original + 2 copies, each 1 damage
    expect(s.players.user.life).toBe(start.players.user.life); // NO copy aimed at the caster (enemy-side chooser)
    const copyLog = (s.log || []).find((e) => e.effect === "storm-copy");
    expect(copyLog?.count).toBe(2); // 2 copies made
  });

  it("Grapeshot as the 1st spell (0 before) → no copies, 1 damage to the opponent", () => {
    const start = createGameState({ userDeck: [], aiDeck: [] });
    const s = castTargetedStormAtOpponent(GRAPESHOT, { prior: 0 });
    expect(start.players.ai.life - s.players.ai.life).toBe(1); // original only
    const copyLog = (s.log || []).find((e) => e.effect === "storm-copy");
    expect(copyLog?.count).toBe(0); // storm count 0 → zero copies
  });

  it("Tendrils of Agony as the 4th spell (3 before) → opponent loses 2 each (×4 = 8); caster gains 2 each (×4 = 8)", () => {
    const start = createGameState({ userDeck: [], aiDeck: [] });
    const s = castTargetedStormAtOpponent(TENDRILS_OF_AGONY, { prior: 3 });
    expect(s.stack.length).toBe(0);
    expect(start.players.ai.life - s.players.ai.life).toBe(8); // 4 resolutions × "target player loses 2 life" → opponent
    expect(s.players.user.life - start.players.user.life).toBe(8); // 4 resolutions × "you gain 2 life" → caster
    const copyLog = (s.log || []).find((e) => e.effect === "storm-copy");
    expect(copyLog?.count).toBe(3);
  });

  // CR 707.10c DEFAULT — when a copy has NO fresh legal target (the only opponent is gone), it keeps the original
  // spell's target. Here the opponent has left, so the sole legal "target player" is the caster: each copy keeps
  // the original (caster) target rather than being dropped. Tendrils on a lone caster = lose 2 + gain 2 = net 0
  // per resolution, so the caster's life is unchanged across all copies (no fabricated drop, no fabricated drain).
  it("Tendrils with the opponent removed → copies fall back to the original (caster) target (CR 707.10c)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const c = { ...TENDRILS_OF_AGONY, id: "storm1" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { user: { ...s.players.user, hand: [c], manaPool: { ...s.players.user.manaPool, C: 20, B: 20 }, spellsCastThisTurn: 2 } }, // ONLY the caster remains
    };
    const start = s.players.user.life;
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "storm1");
    expect(casts.length).toBeGreaterThan(0);
    s = dispatchAction(s, casts[0]); // only the caster is a legal target now
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 50) s = resolveTopOfStack(s);
    expect(s.stack.length).toBe(0);
    expect(s.players.user.life).toBe(start); // lose 2 + gain 2, three times → net 0; copies kept the original target
    const copyLog = (s.log || []).find((e) => e.effect === "storm-copy");
    expect(copyLog?.count).toBe(2); // copies were NOT removed — they fell back to the original target
    expect((s.log || []).some((e) => e.effect === "storm-copy-removed")).toBe(false);
  });
});

// STORM-COPY-TARGET — the per-copy chooser is SIDE-AWARE (copyAtomIntent): an OWN-side buff (pump +N/+N) is aimed
// at the controller's OWN creature, never an opponent's, even when both are legal. Astral Steel ("Target creature
// gets +1/+2") is the real-card shape; this regression-locks the `pump → own` branch of the inline intent mirror.
describe("STORM — RUNTIME: an OWN-side buff copy targets the controller's own creature (pump own-preference)", () => {
  const ASTRAL_STEEL = {
    name: "Astral Steel", type: "Instant", mana: "{1}{W}",
    oracle: "Target creature gets +1/+2 until end of turn.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)",
  };
  it("Astral Steel as the 2nd spell (1 before) → the copy buffs the caster's own creature, not the opponent's", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const c = { ...ASTRAL_STEEL, id: "storm1" };
    const ownCreature = { id: "mine", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
    const oppCreature = { id: "theirs", name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3 };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [c], manaPool: { ...s.players.user.manaPool, C: 20, W: 20 }, battlefield: [{ id: "mine", card: ownCreature, controller: "user", tapped: false }], spellsCastThisTurn: 1 },
        ai: { ...s.players.ai, battlefield: [{ id: "theirs", card: oppCreature, controller: "ai", tapped: false }] },
      },
    };
    // Cast the original at the OWN creature; resolve only the storm trigger (top) so we can read the copy's target.
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "storm1");
    const cast = casts.find((a) => (a.targets || []).every((t) => t.id === "mine")) || casts[0];
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s); // storm trigger → pushes 1 copy
    const copy = s.stack.find((o) => o.isCopy);
    expect(copy, "a storm copy was made").toBeTruthy();
    expect((copy.targets || []).map((t) => t.id)).toEqual(["mine"]); // own-side preference, NOT "theirs"
  });
});
