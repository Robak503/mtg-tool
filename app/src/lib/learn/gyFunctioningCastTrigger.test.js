/**
 * gyFunctioningCastTrigger.test.js — "Whenever you cast a multicolored spell, you may return this card from
 * your graveyard to your hand." The Eidolon cycle: Enigma · Aurora · Sandstorm · Verdant.
 *
 * A GRAVEYARD-FUNCTIONING trigger (CR 603.3d), the cast-event sibling of the milled-event one Infesting
 * Radroach already had. The seam it reuses is the point of the slice: the stamp
 * (functionsFromGraveyard), the [gy-self-return:hand] sentinel and applyGySelfReturnHand all existed —
 * only the cast path lacked a graveyard scan.
 *
 * ⭐ THE ZONE STATEMENT SITS IN THE EFFECT HERE, NOT IN AN INTERVENING-IF. Radroach says "…if this creature
 * is in your graveyard, you may return it to your hand"; the Eidolon says "…return THIS CARD FROM YOUR
 * GRAVEYARD to your hand". Both state where the ability functions; only the sentence position differs. The
 * zone re-check survives the missing intervening-if because applyGySelfReturnHand keys on the exact
 * sourceCardId and no-ops when the card is gone (CR 608.2b).
 *
 * ⛔ THE THREE NEGATIVES ARE THE SLICE. A graveyard scan is the easiest place in this engine to fire for the
 * wrong seat: the loop walks each player's graveyard, so the scanned graveyard belongs to the WATCHER while
 * `whose` is checked against the CASTER. Get that backwards and your Eidolon returns itself whenever an
 * OPPONENT casts something — which is not what "whenever YOU cast" says, and which the happy-path test
 * cannot see.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkCastTriggers, detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const EIDOLON_LINE = "Whenever you cast a multicolored spell, you may return this card from your graveyard to your hand.";
const ENIGMA = { id: "ge", name: "Enigma Eidolon", type: "Creature — Spirit", mana: "{3}{U}", power: 2, toughness: 2,
  oracle: `{U}, Sacrifice this creature: Target player mills three cards.\n${EIDOLON_LINE}` };

const MULTICOLORED = { id: "mc", name: "Electrolyze", type: "Instant", mana: "{1}{U}{R}", colors: ["U", "R"], oracle: "" };
const MONOCOLORED = { id: "sc", name: "Shock", type: "Instant", mana: "{R}", colors: ["R"], oracle: "" };

/** The Eidolon in `zone` for the user; nothing else on the board. */
function board({ zone = "graveyard" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const user = { ...s0.players.user, hand: [], graveyard: [], battlefield: [] };
  if (zone === "graveyard") user.graveyard = [{ ...ENIGMA }];
  else user.battlefield = [createPermanent({ id: "e", card: ENIGMA, controller: "user" })];
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user } };
}

/** Cast `spell` as `caster`, settle everything, and report where the Eidolon ended up. */
function cast(state, spell, caster) {
  let s = flushTriggers(checkCastTriggers(state, { spellCard: spell, casterId: caster }), { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 12) {
    if (s.pendingChoice) { s = resolveOptionalChoice(s, true); continue; }   // the printed "you may"
    s = resolveTopOfStack(s);
  }
  return {
    hand: s.players.user.hand.map((c) => c.name),
    graveyard: s.players.user.graveyard.map((c) => c.name),
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ it really comes back — from the graveyard, on your multicolored cast", () => {
  it("casting a multicolored spell returns the Eidolon to hand", () => {
    const r = cast(board(), MULTICOLORED, "user");
    expect(r.hand).toEqual(["Enigma Eidolon"]);
    expect(r.graveyard).toEqual([]);
    expect(r.errors).toBe(0);
  });
});

describe("⛔ the three ways this fires wrongly", () => {
  it("a MONOCOLORED spell does nothing — the filter is real", () => {
    const r = cast(board(), MONOCOLORED, "user");
    expect(r.hand).toEqual([]);
    expect(r.graveyard).toEqual(["Enigma Eidolon"]);
  });

  it("⭐ an OPPONENT casting a multicolored spell does nothing — 'whenever YOU cast'", () => {
    // The scan walks the WATCHER's graveyard while `whose` is checked against the CASTER. Reversing those
    // two reads gives a trigger that fires on everyone's turn and still passes the happy-path test.
    const r = cast(board(), MULTICOLORED, "ai1");
    expect(r.hand).toEqual([]);
    expect(r.graveyard).toEqual(["Enigma Eidolon"]);
  });

  it("⭐ an Eidolon on the BATTLEFIELD does nothing — the ability functions only from the graveyard", () => {
    // Its own text says where it works (CR 603.3d). A battlefield copy returning "this card from your
    // graveyard" would be returning a card that is not there.
    const r = cast(board({ zone: "battlefield" }), MULTICOLORED, "user");
    expect(r.hand).toEqual([]);
    expect(r.graveyard).toEqual([]);
    expect(r.errors).toBe(0);
  });

  it("⛔ …and no trigger is even CREATED for the battlefield copy", () => {
    // The assertion above passes for a weaker reason than it looks: the gy-self-return effect keys on
    // ctx.sourceCardId, which only the graveyard scan stamps, so a battlefield fire would resolve to nothing
    // anyway. A mutation deleting the battlefield exclusion SURVIVED until this test existed. What the
    // exclusion actually guarantees is that nothing reaches the stack at all — so that is what gets pinned,
    // rather than leaving a line in the engine that no test can defend.
    const out = checkCastTriggers(board({ zone: "battlefield" }), { spellCard: MULTICOLORED, casterId: "user" });
    expect(out.pendingTriggers || []).toHaveLength(0);
  });
});

describe("the stamp is exact", () => {
  const stamped = (oracle) => detectTriggers({ name: "X", type: "Creature — Spirit", oracle }).filter((d) => d.functionsFromGraveyard);

  it("stamps the printed line, with the multicolored filter and the caster gate", () => {
    expect(stamped(EIDOLON_LINE)).toMatchObject([{ event: "cast", spellFilter: "multicolored", whose: "you" }]);
  });

  it("⛔ does NOT stamp a plain return-to-hand cast trigger — no zone statement, so it is a battlefield ability", () => {
    expect(stamped("Whenever you cast a multicolored spell, you may return this card to your hand.")).toHaveLength(0);
  });

  it("⛔ does NOT stamp a return to a DIFFERENT destination", () => {
    expect(stamped("Whenever you cast a multicolored spell, you may return this card from your graveyard to the battlefield.")).toHaveLength(0);
  });
});

describe("classification — the four real carriers flip", () => {
  const CASES = [
    ["Enigma Eidolon", "{U}, Sacrifice this creature: Target player mills three cards."],
    ["Aurora Eidolon", "{W}, Sacrifice this creature: Prevent the next 3 damage that would be dealt to any target this turn."],
    ["Sandstorm Eidolon", "{R}, Sacrifice this creature: Target creature can't block this turn."],
    ["Verdant Eidolon", "{G}, Sacrifice this creature: Add three mana of any one color."],
  ];
  for (const [name, ability] of CASES) {
    it(`${name}`, () => {
      expect(classifyCard({ name, type: "Creature — Spirit", mana: "{3}{U}", power: "2", toughness: "2", oracle: `${ability}\n${EIDOLON_LINE}` })).toMatch(/^native/);
    });
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Creature — Spirit", mana: "{3}{U}", power: "2", toughness: "2", oracle: `${EIDOLON_LINE}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
