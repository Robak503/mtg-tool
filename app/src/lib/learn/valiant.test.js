/**
 * valiant.test.js — VALIANT (Bloomburrow's mouse cycle, 13 corpus carriers, CR 603.2 + CR 207.2c label).
 *
 *   "Valiant — Whenever this creature becomes the target of a spell or ability YOU CONTROL for the first
 *    time each turn, <effect>."
 *
 * Three pieces, all of which already existed except one:
 *   • the `becomesTarget` event — built (the Phantasmal Illusion family), fires at all four target-choice sites
 *   • "for the first time each turn" → the once-per-turn latch — built one slice ago
 *   • "…YOU CONTROL" — THE ONLY NEW THING, and it is the whole card
 *
 * ⛔ THE NARROWING IS WHY VALIANT IS PLAYABLE AT ALL. It exists so your own pump spell grows the creature
 * and an opponent's removal spell does NOT. Firing on any targeter would hand every one of these mice a
 * trigger off an opposing Shock — the over-fire direction, and one that makes the card read stronger than
 * printed. The gate lives at the FIRING SITE (checkBecomesTargetTriggers), comparing the targeting stack
 * object's controller to the targeted permanent's, because only the runtime knows who cast the spell.
 *
 * ⚠️ WHITELIST DRIFT, CAUGHT AGAIN. `targeterIsController` had to be named in detectTriggers' descriptor
 * field list, which is an explicit allowlist — and the very comment block above it warns that an unlisted
 * field is silently dropped and becomes an over-fire. It happened anyway: the arm returned the flag, the
 * descriptor did not carry it, and detection looked perfect. That is the fourth whitelist of this run
 * (trigger descriptor · tutor destination ×3 · stun count ×2 · this one).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkBecomesTargetTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HERO = {
  id: "c-hero", name: "Heartfire Hero", type: "Creature — Mouse Warrior", mana: "{R}", power: 2, toughness: 1, keywords: [],
  oracle: "Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, put a +1/+1 counter on it.",
};
// Same event, NO narrowing — the Phantasmal Illusion lane. It must keep firing off anyone's spell.
const PHANTASM = {
  id: "c-ph", name: "Phantasmal Bear", type: "Creature — Bear Illusion", mana: "{U}", power: 2, toughness: 2, keywords: [],
  oracle: "Whenever this creature becomes the target of a spell or ability, sacrifice it.",
};

describe("detection — the label, the narrowing, and the latch all survive to the descriptor", () => {
  it("⭐ the full printed line detects with BOTH flags", () => {
    const d = detectTriggers(HERO);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "becomesTarget", scope: "self", targeterIsController: true, oncePerTurnTrigger: true });
  });

  it("⭐ the 'Valiant —' ability-word label is stripped (CR 207.2c — pure flavor)", () => {
    // Without the strip the boundary-anchored trigger regex never sees the "Whenever" and the card detects
    // NOTHING — which is how all 13 carriers were parking.
    expect(detectTriggers({ ...HERO, oracle: HERO.oracle.replace("Valiant — ", "") })).toHaveLength(1);
  });

  it("⭐ and the effect clause is clean — no label, no qualifier residue", () => {
    expect(detectTriggers(HERO)[0].effectClause).toBe("put a +1/+1 counter on this creature");
  });

  it("CONTROL — the UNNARROWED form does not pick up the flag", () => {
    expect(detectTriggers(PHANTASM)[0].targeterIsController).toBeFalsy();
  });
});

describe("⭐ RUNTIME — whose spell it is decides whether Valiant fires", () => {
  function board(card) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "mouse", card, controller: "user", summoningSick: false })] } },
    };
  }
  const targeting = (controller) => ({ kind: "spell", controller, source: { name: "Shock" }, targets: [{ id: "mouse", type: "permanent" }] });
  const fired = (card, controller) => (checkBecomesTargetTriggers(board(card), targeting(controller)).pendingTriggers || []).length;

  it("⭐ YOUR OWN spell targeting it fires the trigger", () => {
    expect(fired(HERO, "user")).toBe(1);
  });

  it("⛔ THE OPPONENT'S spell targeting it does NOT — this is the entire point of the card", () => {
    expect(fired(HERO, "ai")).toBe(0);
  });

  it("⛔ and a stack object with NO controller does not fire it either", () => {
    // ⚠️ HONEST NOTE ON THE GUARD THIS COVERS: the gate also requires a TRUTHY targeter, and a mutation
    // removing that requirement SURVIVES this test — because a permanent found on a battlefield always has
    // a controller, so `undefined === "user"` is already false and the case fails closed without it. The
    // truthy check is defence against a shape that cannot occur today, not a tested path. Recorded rather
    // than dressed up: a redundant guard is fine, claiming it is load-bearing is not.
    const out = checkBecomesTargetTriggers(board(HERO), { kind: "spell", targets: [{ id: "mouse", type: "permanent" }] });
    expect(out.pendingTriggers || []).toHaveLength(0);
  });

  it("CONTROL — the UNNARROWED trigger still fires off the OPPONENT's spell, untouched", () => {
    // The regression guard for the Phantasmal Illusion family: the gate must drop only flagged descriptors.
    expect(fired(PHANTASM, "ai")).toBe(1);
    expect(fired(PHANTASM, "user")).toBe(1);
  });
});

describe("tier", () => {
  it("⭐ the mice whose payoff already parses flip", () => {
    expect(classifyCard({ name: "Heartfire Hero", type: "Creature — Mouse Warrior", mana: "{R}", power: "2", toughness: "1", oracle: HERO.oracle }))
      .toBe("native-trigger");
  });

  it("⛔ the WARD-TAX lane is still a different card and still parks", () => {
    // "…of a spell or ability AN OPPONENT controls" needs the opposite comparison AND a tax. Nothing here
    // widened toward it, and a mutation that made the gate symmetric would have to pass this too.
    expect(classifyCard({ name: "Warded", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2",
      oracle: "Whenever this creature becomes the target of a spell or ability an opponent controls, put a +1/+1 counter on it." }))
      .not.toMatch(/^native/);
  });
});
