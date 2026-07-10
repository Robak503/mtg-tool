/**
 * exileInsteadDiesTriggers.test.js — R1.1 (audit 2026-07-09, HIGH): a creature EXILED INSTEAD of
 * dying (CR 614 replacement — Lava Coil family, exileIfDiesTurn) never DIED (CR 700.4), so it must
 * fire NO dies-triggers — not its own, not any watcher's. Before the fix, checkDiesTriggers fired
 * them anyway: every exile-removal fed phantom Blood-Artist drains into self-play outcomes while
 * the per-turn death tally (recordCreatureDeaths) correctly excluded the same entry — the two
 * surfaces disagreed. Also pins the log relabel: the death chokepoint logs exile-instead removals
 * as `creature-exiled-instead`, never `creature-dies` (gameAnalysis counts real deaths from that).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, markExileIfDies, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { checkDiesTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, p, t, oracle = "") => ({ name, type: "Creature — Vampire", power: p, toughness: t, oracle });
const BLOOD_ARTIST = creature("Blood Artist", 0, 1, "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.");

function board({ user = [], ai = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("R1.1 — exile-instead suppresses dies-triggers (CR 614 + 700.4)", () => {
  it("a watcher (Blood Artist) does NOT drain when the creature is exiled instead", () => {
    let s = board({
      user: [createPermanent({ id: "ba", card: BLOOD_ARTIST, controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "vic", card: creature("Victim", 2, 2), controller: "ai", summoningSick: false })],
    });
    const userLife = s.players.user.life;
    const aiLife = s.players.ai.life;
    // The exiled-instead look-back (what destroyLethalCreatures builds for a flagged creature).
    const lookBack = { id: "vic", controller: "ai", name: "Victim", card: creature("Victim", 2, 2), exileInstead: true };
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [lookBack])));
    expect(s.players.user.life).toBe(userLife); // no gain — no death happened
    expect(s.players.ai.life).toBe(aiLife); // no drain
  });

  it("the SAME look-back without exileInstead still drains (the trigger itself is alive)", () => {
    // Zulaport Cutthroat — untargeted payoff, so the minimal harness resolves it without a target ask.
    const CUTTHROAT = creature("Zulaport Cutthroat", 1, 1, "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.");
    let s = board({
      user: [createPermanent({ id: "zc", card: CUTTHROAT, controller: "user", summoningSick: false })],
    });
    const userLife = s.players.user.life;
    const aiLife = s.players.ai.life;
    const lookBack = { id: "vic", controller: "user", name: "Victim", card: creature("Victim", 2, 2) };
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [lookBack])));
    expect(s.players.user.life).toBe(userLife + 1); // real death → the drain fires
    expect(s.players.ai.life).toBe(aiLife - 1);
  });

  it("the creature's OWN dies-trigger is also suppressed on exile-instead", () => {
    const HOARDER = creature("Doomed Dissenter", 1, 1, "When this creature dies, create a 2/2 black Zombie creature token.");
    let s = board({ user: [createPermanent({ id: "dd", card: HOARDER, controller: "user", summoningSick: false })] });
    const lookBack = { id: "dd", controller: "user", name: "Doomed Dissenter", card: HOARDER, exileInstead: true };
    s = resolveAll(flushTriggers(checkDiesTriggers(s, [lookBack])));
    expect(s.players.user.battlefield.some((p) => /zombie/i.test(p.card?.name || ""))).toBe(false);
  });

  it("death chokepoint LOGS exile-instead as creature-exiled-instead, real deaths as creature-dies", () => {
    let s = board({
      user: [
        createPermanent({ id: "flagged", card: creature("Flagged", 0, 0), controller: "user", summoningSick: false }),
        createPermanent({ id: "plain", card: creature("Plain", 0, 0), controller: "user", summoningSick: false }),
      ],
    });
    s = markExileIfDies(s, { permanentId: "flagged", turn: s.turn });
    const out = destroyLethalCreatures(s); // both are 0-toughness → both removed by the SBA
    const kinds = Object.fromEntries(out.state.log.filter((e) => /creature-(dies|exiled-instead)/.test(e.kind)).map((e) => [e.cardName, e.kind]));
    expect(kinds.Flagged).toBe("creature-exiled-instead");
    expect(kinds.Plain).toBe("creature-dies");
    // Zone truth: flagged → exile, plain → graveyard.
    expect(out.state.players.user.exile.some((c) => (c.card || c).name === "Flagged")).toBe(true);
    expect(out.state.players.user.graveyard.some((c) => (c.card || c).name === "Plain")).toBe(true);
  });
});
