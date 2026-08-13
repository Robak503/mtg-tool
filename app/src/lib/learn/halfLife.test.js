/**
 * halfLife.test.js — HALF-LIFE: "loses half their life, rounded up|down" (CR 118.5), computed from the
 * RECIPIENT's live total at resolution. Flip-diff +8/0/0: Quietus Spike + Scytheclaw (equipped grant),
 * Virtus the Veiled / Radioactive Man / Ebonblade Reaper (self combat-damage), Havoc Festival (upkeep
 * sentinel), and two OVER the measured ceiling — Infernal Contract + Cruel Bargain ("Draw four cards.
 * You lose half your life, rounded up.") through the controller arm on the SPELL lane, where the caster
 * is the referent and no event gate is needed.
 *
 * ⭐ Three arms, one computation: who:"damagedPlayer" (gate-kept by combatDamageReferentSatisfied — an
 * upkeep/cast "that player" can NEVER route here), who:"upkeepPlayer" (the Havoc Festival sentinel),
 * who:"controller". applyLoseLife.amountFor halves PER RECIPIENT — the precomputed fixed amount is 0
 * for a half atom, which is why the per-branch read is load-bearing, not cosmetic.
 *
 * ⭐ ROUNDING IS REAL DATA: Raving Dead prints "rounded down" — at 21 life, up loses 11 and down loses
 * 10. (Raving Dead itself stays parked on its random-attack line; the arm still enforces its printed
 * number when the card appears in sims.)
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the three matcher arms removed -> all half-life carriers park.
 *   · rounding inverted (down → ceil) -> the 21-life rounded-down row loses 11 instead of 10.
 *   · the SCALED damagedPlayer arms disabled -> Marauder + Emissary park and both runtime rows die.
 *   · the "they control" → "that player controls" normalize dropped -> Emissary's count falls to the
 *     defendingPlayer referent (unset on a combat-damage event) → 0 → the recipient-scope row dies.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { applyLoseLife, lifeClauseParser } from "./effects/atoms/life.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const QUIETUS = { id: "c-qs", name: "Quietus Spike", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature has deathtouch.\nWhenever equipped creature deals combat damage to a player, that player loses half their life, rounded up.\nEquip {3}" };
const VIRTUS = { id: "c-vv", name: "Virtus the Veiled", type: "Legendary Creature — Elf Rogue", mana: "{2}{B}", power: "1", toughness: "1",
  oracle: "Partner with Gorm the Great (When this creature enters, target player may put Gorm into their hand from their library, then shuffle.)\nDeathtouch\nWhenever Virtus deals combat damage to a player, that player loses half their life, rounded up." };
const HAVOC = { id: "c-hf", name: "Havoc Festival", type: "Enchantment", mana: "{2}{B}{R}",
  oracle: "Players can't gain life.\nAt the beginning of each player's upkeep, that player loses half their life, rounded up." };
const CONTRACT = { id: "c-ic", name: "Infernal Contract", type: "Sorcery", mana: "{B}{B}{B}",
  oracle: "Draw four cards. You lose half your life, rounded up." };

describe("the carriers and the arms", () => {
  it("⭐ the carriers flip native", () => {
    for (const c of [QUIETUS, VIRTUS, HAVOC, CONTRACT]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the parser — three referents, the rounding captured, the unrounded form refused", () => {
    const p = (s) => lifeClauseParser(s);
    const row = {
      damagedUp: p("that player loses half their life, rounded up"),
      damagedDown: p("that player loses half their life, rounded down"),
      upkeep: p("the upkeep player loses half their life, rounded up"),
      you: p("you lose half your life, rounded up"),
      unrounded: p("each player loses half their life"), // Goblin Game's shape — no carrier arm, parked
    };
    console.log("  WITNESS halfLifeParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.damagedUp).toEqual({ op: "lose-life", who: "damagedPlayer", half: "up", targetType: null });
    expect(row.damagedDown).toEqual({ op: "lose-life", who: "damagedPlayer", half: "down", targetType: null });
    expect(row.upkeep).toEqual({ op: "lose-life", who: "upkeepPlayer", half: "up", targetType: null });
    expect(row.you).toEqual({ op: "lose-life", who: "controller", half: "up", targetType: null });
    expect(row.unrounded).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — halves computed from the recipient's LIVE total", () => {
  function stateWithLife(life) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...s, players: { ...s.players, ai1: { ...s.players.ai1, life } } };
  }
  const DMG_UP = { op: "lose-life", who: "damagedPlayer", half: "up", targetType: null };
  const DMG_DOWN = { op: "lose-life", who: "damagedPlayer", half: "down", targetType: null };

  it("⭐⭐ 21 life, rounded UP: loses 11 → 10 left; rounded DOWN: loses 10 → 11 left", () => {
    const up = applyLoseLife(stateWithLife(21), DMG_UP, { controller: "user", damagedPlayerId: "ai1", targets: [] });
    const down = applyLoseLife(stateWithLife(21), DMG_DOWN, { controller: "user", damagedPlayerId: "ai1", targets: [] });
    const row = { upLeft: up.players.ai1.life, downLeft: down.players.ai1.life };
    console.log("  WITNESS halfLifeRounding", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ upLeft: 10, downLeft: 11 });
  });

  it("⛔ NO referent (a spell's anaphoric 'that player'): clean no-op, nobody loses anything", () => {
    const s = stateWithLife(21);
    const after = applyLoseLife(s, DMG_UP, { controller: "user", targets: [] });
    const row = Object.fromEntries(Object.keys(after.players).map((p) => [p, after.players[p].life]));
    console.log("  WITNESS halfLifeNoReferent", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    for (const p of Object.keys(s.players)) expect(after.players[p].life).toBe(s.players[p].life);
  });

  it("⭐ the controller arm halves the CASTER (Infernal Contract at 39 → loses 20 → 19)", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, life: 39 } } };
    const after = applyLoseLife(s, { op: "lose-life", who: "controller", half: "up", targetType: null }, { controller: "user", targets: [] });
    expect(after.players.user.life).toBe(19);
  });

  it("⛔ life at 0 or below halves to ZERO — never a life gain from rounding a negative", () => {
    const after = applyLoseLife(stateWithLife(-3), DMG_UP, { controller: "user", damagedPlayerId: "ai1", targets: [] });
    expect(after.players.ai1.life).toBe(-3);
  });
});

describe("⭐⭐ SCALED DAMAGED-PLAYER — the count reads the RIGHT seat (2026-08-12 slice)", () => {
  const MARAUDER = { id: "c-gm", name: "Graveblade Marauder", type: "Creature — Human Warrior", mana: "{2}{B}", power: "1", toughness: "4",
    oracle: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever this creature deals combat damage to a player, that player loses life equal to the number of creature cards in your graveyard." };
  const EMISSARY = { id: "c-ed", name: "Emissary of Despair", type: "Creature — Spirit", mana: "{2}{B}{B}", power: "2", toughness: "1",
    oracle: "Flying\nWhenever this creature deals combat damage to a player, that player loses 1 life for each artifact they control." };

  it("⭐ the pair flips; Tomb Blade's unless-sac rider stays parked; the arms parse", () => {
    for (const c of [MARAUDER, EMISSARY]) expect(classifyCard(c), c.name).toMatch(/^native/);
    expect(classifyCard({ id: "c-tb", name: "Tomb Blade", type: "Artifact Creature — Necron", mana: "{2}{B}", power: "2", toughness: "1",
      oracle: "Flying\nWhenever this creature deals combat damage to a player, that player loses life equal to the number of creatures they control unless they sacrifice a creature of their choice.\nUnearth {6}{B}{B}" })).toBe("body-only");
    const row = {
      marauder: lifeClauseParser("that player loses life equal to the number of creature cards in your graveyard"),
      emissary: lifeClauseParser("that player loses 1 life for each artifact they control"),
      unmodeledSrc: lifeClauseParser("that player loses 1 life for each wish they made"),
    };
    console.log("  WITNESS scaledDamagedParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.marauder).toMatchObject({ op: "lose-life", who: "damagedPlayer" });
    expect(row.emissary).toMatchObject({ op: "lose-life", who: "damagedPlayer" });
    expect(row.unmodeledSrc).toBeNull();
  });

  function board() {
    // MY graveyard: 3 creature cards + 2 sorceries. ai1 controls 2 artifacts; I control 5 artifacts.
    // The seat mix-ups this witnesses against: Marauder counting ai1's graveyard, Emissary counting MINE.
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const art = (pid, ctrl) => ({ id: pid, controller: ctrl, tapped: false, summoningSick: false, card: { id: "card-" + pid, name: "Sol Ring " + pid, type: "Artifact", oracle: "" }, counters: {} });
    return { ...s0, players: { ...s0.players,
      user: { ...s0.players.user,
        graveyard: [...Array.from({ length: 3 }, (_, i) => ({ id: "gc" + i, name: "Dead Bear " + i, type: "Creature — Bear", oracle: "" })),
          ...Array.from({ length: 2 }, (_, i) => ({ id: "gs" + i, name: "Old Spell " + i, type: "Sorcery", oracle: "" }))],
        battlefield: Array.from({ length: 5 }, (_, i) => art("UA" + i, "user")) },
      ai1: { ...s0.players.ai1, battlefield: Array.from({ length: 2 }, (_, i) => art("XA" + i, "ai1")) } } };
  }

  it("⭐⭐ Marauder: the damaged player loses MY creature-card count (3, not my whole graveyard of 5)", () => {
    const atom = lifeClauseParser("that player loses life equal to the number of creature cards in your graveyard");
    const after = applyLoseLife(board(), atom, { controller: "user", damagedPlayerId: "ai1", targets: [] });
    const row = { ai1Life: after.players.ai1.life };
    console.log("  WITNESS marauderCount", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai1Life: 37 });
  });

  it("⭐⭐ Emissary: the damaged player loses THEIR artifact count (2), never MINE (5)", () => {
    const atom = lifeClauseParser("that player loses 1 life for each artifact they control");
    const after = applyLoseLife(board(), atom, { controller: "user", damagedPlayerId: "ai1", targets: [] });
    const row = { ai1Life: after.players.ai1.life, userLife: after.players.user.life };
    console.log("  WITNESS emissaryRecipientScope", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai1Life: 38, userLife: 40 });
  });
});
