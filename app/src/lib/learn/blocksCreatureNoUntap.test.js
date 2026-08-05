/**
 * blocksCreatureNoUntap.test.js — "Whenever this creature blocks A CREATURE, that creature doesn't untap
 * during its controller's next untap step." (CR 509.1a / 509.3d / 302.6): Wall of Frost, Labyrinth Minotaur,
 * Cleric of Chill Depths, and the Illusion token.
 *
 * ⛔⛔ THE EVENT DID NOT EXIST — 0 NATIVE ACROSS 14 CARDS. The bare "Whenever this creature blocks" event has
 * been modelled for a long time, and the guard beside it rejects anything not ending on "blocks". The trailing
 * two words " a creature" sent the entire family to Arbiter. Wall of Frost — the card that DEFINES this
 * effect — was a 0/4 Defender.
 *
 * ⭐ THE TWO WORDS ARE NOT COSMETIC, which is why this is a separate event rather than a widened regex:
 *   · MULTIPLICITY — the bare wording fires once per combat (CR 509.3c); "a creature" fires ONCE PER CREATURE
 *     blocked (CR 509.3d), so a Wall of Frost blocking two attackers locks BOTH. Pinned below.
 *   · REFERENT — "that creature" is the BLOCKED ATTACKER, so source ≠ triggering permanent. Every other block
 *     event in checkBlockTriggers passes the same permanent twice; this one deliberately does not, which is
 *     why it carries its own scope (scope:"self" contracts source === triggering and would reject it).
 *
 * ⓘ MEASURED BEFORE BUILDING, and the measurement changed the scope. Swapping the unmodelled event for the
 * already-modelled per-creature sibling flipped ZERO of the 14 cards — the event is NECESSARY BUT NOT
 * SUFFICIENT; each card also needs its effect built. Only the no-untap effect is modelled today, so this
 * slice claims 3 real cards (+ the token), not 14, and the other ten stay parked on destroy /
 * bounce-at-end-of-combat / can't-attack-next-turn.
 *
 * ⛔ THE REFERENT RIDES THE EXISTING SENTINEL. triggers.js rewrites "that creature" → "the triggering
 * creature" (a phrase in ZERO printed oracle text) so the shipped target:"thatCreature" lane binds it. No new
 * referent kind, so no other family's binding moves. Event-gated and whole-clause anchored: Vertigo Spawn's
 * two-sentence "tap that creature. That creature doesn't untap…" leaves residue → unrewritten → Arbiter.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the fire
 * site's blocksCreature line removed -> nothing fires and the witness shows the attacker never flagged; the
 * scope case removed -> same, because scopeMatches falls through to false; source/triggering swapped at the
 * fire site -> the BLOCKER gets locked instead of the attacker, the exact wrong-referent failure.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { checkBlockTriggers, detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Whenever this creature blocks a creature, that creature doesn't untap during its controller's next untap step.";
const SENTINEL = "the triggering creature doesn't untap during its controller's next untap step";
const WALL_OF_FROST = { id: "c-wof", name: "Wall of Frost", type: "Creature — Wall", mana: "{1}{U}{U}", power: "0", toughness: "7", oracle: `Defender\n${LINE}` };
const LABYRINTH_MINOTAUR = { id: "c-lm", name: "Labyrinth Minotaur", type: "Creature — Minotaur", mana: "{3}{U}", power: "1", toughness: "4", oracle: LINE };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const OGRE = { id: "c-ogre", name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", oracle: "" };

describe("detect + sentinel + classify", () => {
  it("⭐ ONE descriptor on the NEW event, with the referent normalized to the shared sentinel", () => {
    const ds = detectTriggers(WALL_OF_FROST).filter((t) => t.event === "blocksCreature");
    expect(ds).toHaveLength(1);
    expect(ds[0].scope).toBe("blocksCreature");
    expect(ds[0].effectClause).toBe(SENTINEL);
  });

  it("⭐ the sentinel parses HIGH to a lockOnly no-untap on the triggering creature", () => {
    const p = parseEffectClause(SENTINEL, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "tap", target: "thatCreature", noUntapNext: true, lockOnly: true }]);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(WALL_OF_FROST)).toBe("native-trigger");
    expect(classifyCard(LABYRINTH_MINOTAUR)).toBe("native-trigger");
    expect(classifyCard({ id: "c-cocd", name: "Cleric of Chill Depths", type: "Creature — Merfolk Cleric", mana: "{1}{U}", power: "1", toughness: "3", oracle: LINE })).toBe("native-trigger");
  });

  it("⛔ the BARE 'blocks' event is untouched — it still detects, and as its OWN event", () => {
    const ds = detectTriggers({ name: "Prowler", type: "Creature — Rogue", power: "2", toughness: "2",
      oracle: "Whenever this creature blocks, draw a card." });
    expect(ds.filter((t) => t.event === "blocks")).toHaveLength(1);
    expect(ds.filter((t) => t.event === "blocksCreature")).toHaveLength(0);
  });

  it("⛔ every OTHER effect in this family still parks (CREED — the event alone claims nothing)", () => {
    const mk = (tail) => ({ name: "Probe", type: "Creature — Wall", mana: "{2}{U}", power: "0", toughness: "4",
      oracle: `Whenever this creature blocks a creature, ${tail}` });
    for (const tail of [
      "that creature can't attack during its controller's next turn.",   // Wall of Dust
      "destroy that creature at end of combat.",                         // Infernal Medusa
      "return that creature to its owner's hand at end of combat.",      // Wall of Tears / Aether Membrane
      "tap that creature. That creature doesn't untap during its controller's next untap step.", // Vertigo Spawn — two sentences
    ]) {
      expect(classifyCard(mk(tail))).not.toMatch(/^native/);
    }
  });
});

describe("⭐⭐ LAW 6 — it fires per blocked creature, and locks the ATTACKER", () => {
  /** Wall of Frost blocking `attackerIds`, each attacker controlled by ai1. */
  function combat(attackerIds) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const wall = createPermanent({ id: "wof", card: WALL_OF_FROST, controller: "user", summoningSick: false });
    const atts = attackerIds.map((id, i) => createPermanent({ id, card: i === 0 ? BEAR : OGRE, controller: "ai1", summoningSick: false }));
    return { ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [wall] }, ai1: { ...s.players.ai1, battlefield: atts } },
      combat: {
        attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "ai1", defender: "user" })),
        blockers: attackerIds.map((id) => ({ blockerId: "wof", attackerId: id })),
      } };
  }
  const ours = (s) => (s.pendingTriggers || []).filter((t) => t.event === "blocksCreature");

  it("⭐⭐ one attacker → one trigger, referent = the ATTACKER, and the resolved effect locks IT", () => {
    const fired = checkBlockTriggers(combat(["att1"]));
    const trigs = ours(fired);
    const atom = parseEffectClause(SENTINEL, "Creature").atoms[0];
    const after = applyTapEffect(fired, atom, { triggeringPermanentId: trigs[0].context.triggeringPermanentId, sourceId: "wof" }, true);
    const row = {
      triggers: trigs.length,
      referent: trigs[0].context.triggeringPermanentId,
      attackerFlagged: !!findPermanent(after, "att1")?.permanent?.doesNotUntapNext,
      attackerTapped: !!findPermanent(after, "att1")?.permanent?.tapped,
      wallFlagged: !!findPermanent(after, "wof")?.permanent?.doesNotUntapNext,
    };
    console.log("  WITNESS blocksCreature", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⭐ referent "att1" and wallFlagged FALSE together are the pin: the effect must land on the creature the
    // Wall blocked, never on the Wall that printed the ability.
    expect(row).toEqual({ triggers: 1, referent: "att1", attackerFlagged: true, attackerTapped: false, wallFlagged: false });
  });

  it("⭐ TWO attackers blocked → TWO triggers, one per blocked creature (CR 509.3d, not 509.3c)", () => {
    const trigs = ours(checkBlockTriggers(combat(["att1", "att2"])));
    expect(trigs).toHaveLength(2);
    expect(trigs.map((t) => t.context.triggeringPermanentId).sort()).toEqual(["att1", "att2"]);
  });

  it("⛔ no block, no trigger", () => {
    const s = combat(["att1"]);
    expect(ours(checkBlockTriggers({ ...s, combat: { ...s.combat, blockers: [] } }))).toHaveLength(0);
  });
});
