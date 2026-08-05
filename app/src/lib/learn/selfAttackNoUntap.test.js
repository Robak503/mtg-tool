/**
 * selfAttackNoUntap.test.js — SELF next-untap lock on attack (CR 302.6): "Whenever this creature attacks, it
 * doesn't untap during its controller's next untap step." Lead Golem and Apes of Rath.
 *
 * ⭐ THE THIRD AND LAST REFERENT IN THIS FAMILY, completing it: a CHOSEN target (Barl's Cage), the TRIGGERING
 * permanent (Wall of Frost, Kashi-Tribe Warriors), and now the SOURCE. Same runtime, three bindings.
 *
 * ⛔⛔ SENTINEL-GATED RATHER THAN MATCHED DIRECTLY, and that choice is the CREED content of this slice. A bare
 * "it doesn't untap during its controller's next untap step" clause arriving from a SPELL is an anaphor for
 * that spell's TARGET; a self-target atom matching it would silently lock the SOURCE instead — a confident
 * wrong effect that no flip-diff would ever show. The folded tap-and-lock spells are joined by splitClauses
 * so they never arrive bare today, but a future unfolded wording would, so the gate is the trigger SCOPE, not
 * the sentence. The sentinel "the source creature" appears in ZERO printed oracle text. Pinned below.
 *
 * ⛔ lockOnly, and it matters on a VIGILANT attacker: the card says the creature doesn't untap, NOT that it
 * taps. Attacking normally taps it anyway — so the wrong behaviour is invisible on an ordinary creature and
 * shows up only with vigilance, which is exactly why the witness drives that case.
 *
 * ⓘ "your next untap step" is accepted alongside "its controller's": on a SELF attacks trigger the controller
 * IS "you". Spectral Force and Spectral Bears print that wording and STILL park — their intervening-if
 * ("if defending player controls no black permanents") is a separate unmodelled gate, so they are the FN pins.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the scope
 * gate widened to any event -> a spell's anaphoric clause binds to the source; lockOnly dropped -> the
 * witness shows a vigilant attacker tapped by its own trigger.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, untapAll } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Whenever this creature attacks, it doesn't untap during its controller's next untap step.";
const SENTINEL = "the source creature doesn't untap during its controller's next untap step";
const LEAD_GOLEM = { id: "c-lg", name: "Lead Golem", type: "Artifact Creature — Golem", mana: "{5}", power: "4", toughness: "4", oracle: LINE };
const APES = { id: "c-ar", name: "Apes of Rath", type: "Creature — Ape", mana: "{2}{G}{G}", power: "3", toughness: "3", oracle: LINE };

describe("detect + sentinel + classify", () => {
  it("⭐ the self attacks trigger rewrites its pronoun to the source sentinel", () => {
    const ds = detectTriggers(LEAD_GOLEM).filter((t) => t.event === "attacks");
    expect(ds).toHaveLength(1);
    expect(ds[0].scope).toBe("self");
    expect(ds[0].effectClause).toBe(SENTINEL);
  });

  it("⭐ the sentinel parses HIGH to a lockOnly self lock", () => {
    const p = parseEffectClause(SENTINEL, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "tap", target: "self", noUntapNext: true, lockOnly: true }]);
  });

  it("⭐ both whole-card carriers flip", () => {
    expect(classifyCard(LEAD_GOLEM)).toBe("native-trigger");
    expect(classifyCard(APES)).toBe("native-trigger");
  });

  it("⛔⛔ THE FP GATE — a raw pronoun clause NEVER parses to a self lock on its own", () => {
    // If this ever starts returning an atom, an anaphoric "It doesn't untap…" would silently lock the SOURCE.
    // The rewrite is the only way in, and it is scope-gated.
    expect(parseEffectClause("it doesn't untap during its controller's next untap step", "Instant").atoms).toEqual([]);
    expect(parseEffectClause("this creature doesn't untap during its controller's next untap step", "Creature").atoms).toEqual([]);
  });

  it("⛔⛔ THE SCOPE GATE, AND THE PIN THAT ACTUALLY CATCHES IT", () => {
    // ⚠️ WRITTEN SECOND, BECAUSE THE FIRST MUTANT SURVIVED. Removing `cls.scope === "self"` from the rewrite
    // broke nothing above — the parser pin tests the PARSER, not the gate. This is the case that fails:
    // a NON-SELF attacks watcher, where "it" is the ATTACKING creature (CR 608.2c), not the watcher. With the
    // gate gone this classifies native-trigger and locks the WRONG permanent — a silent wrong effect on a
    // card that reads perfectly covered.
    const nonSelf = { id: "z", name: "Probe Lord", type: "Creature — Human", mana: "{2}{W}", power: "2", toughness: "2",
      oracle: "Whenever a creature you control attacks, it doesn't untap during its controller's next untap step." };
    expect(detectTriggers(nonSelf)[0].effectClause).toBe("it doesn't untap during its controller's next untap step"); // UNrewritten
    expect(classifyCard(nonSelf)).not.toMatch(/^native/);
  });

  it("⛔ the intervening-if carriers still park (a separate unmodelled gate, not this one)", () => {
    expect(classifyCard({ id: "c-sf", name: "Spectral Force", type: "Creature — Elemental Spirit", mana: "{3}{G}{G}", power: "8", toughness: "8",
      oracle: "Trample\nWhenever this creature attacks, if defending player controls no black permanents, it doesn't untap during your next untap step." })).not.toMatch(/^native/);
  });
});

describe("⭐ LAW 6 — the source is locked, and a VIGILANT attacker is not tapped", () => {
  function board(extraOracle = "") {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const card = { ...LEAD_GOLEM, oracle: extraOracle ? `${extraOracle}\n${LINE}` : LINE };
    const perm = createPermanent({ id: "lg", card, controller: "user", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
  }
  const ATOM = parseEffectClause(SENTINEL, "Creature").atoms[0];

  it("⭐⭐ a VIGILANT attacker is flagged but NOT tapped — then held one untap step", () => {
    let s = applyTapEffect(board("Vigilance"), ATOM, { sourceId: "lg" }, true);
    const rows = [{ when: "after resolve", tapped: !!findPermanent(s, "lg").permanent.tapped, flagged: !!findPermanent(s, "lg").permanent.doesNotUntapNext }];
    // Vigilance means it never tapped to attack, so nothing is stuck down — the lock only bites once
    // something else taps it. Tap it by hand and walk two untap steps to show the lock is real and one-shot.
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => (p.id === "lg" ? { ...p, tapped: true } : p)) } } };
    s = untapAll(s, { playerId: "user" });
    rows.push({ when: "untap step 1", tapped: !!findPermanent(s, "lg").permanent.tapped, flagged: !!findPermanent(s, "lg").permanent.doesNotUntapNext });
    s = untapAll(s, { playerId: "user" });
    rows.push({ when: "untap step 2", tapped: !!findPermanent(s, "lg").permanent.tapped, flagged: !!findPermanent(s, "lg").permanent.doesNotUntapNext });
    console.log("  WITNESS selfAttackLock", JSON.stringify(rows));
    expect(rows).toEqual([
      { when: "after resolve", tapped: false, flagged: true },  // ⭐ the lockOnly cell
      { when: "untap step 1", tapped: true, flagged: false },
      { when: "untap step 2", tapped: false, flagged: false },
    ]);
  });

  it("⛔ an ordinary attacker already tapped from attacking stays tapped through the lock", () => {
    const start = board();
    const tapped = { ...start, players: { ...start.players, user: { ...start.players.user,
      battlefield: start.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } } };
    let s = applyTapEffect(tapped, ATOM, { sourceId: "lg" }, true);
    expect(findPermanent(s, "lg").permanent.doesNotUntapNext).toBe(true);
    s = untapAll(s, { playerId: "user" });
    expect(findPermanent(s, "lg").permanent.tapped).toBe(true);
  });
});
