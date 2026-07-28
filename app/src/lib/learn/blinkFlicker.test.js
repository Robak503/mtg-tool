/**
 * blinkFlicker.test.js — BLINK / FLICKER (CR 400.7): "Exile target creature you control, then return that
 * card to the battlefield under your control" (Ephemerate #440, Cloudshift #792, Blur, Momentary Blink,
 * Acrobatic Maneuver, Personify, Settle Beyond Reality — 19 carriers, 0 native before this).
 *
 * TWO SEPARATE FIXES WERE NEEDED, and the first is the interesting one.
 *
 * 1. THE CLAUSE SPLITTER severed the sentence on ", then" into a bare exile plus an orphaned return. That is
 *    normally a safe failure — splitClauses' own comment reasons a mis-split "just yields an unmodeled clause
 *    → low → Arbiter, never a confident wrong partial". NOT TRUE HERE: "exile target creature you control"
 *    parses HIGH entirely on its own, so the split described a card that EXILES your creature and never
 *    returns it. A keep-whole guard (the mechanism the conditional-rider seams already use) closes that.
 *
 * 2. THE ATOM is pure COMPOSITION of two existing chokepoints — moveCardToZone off the battlefield (fires
 *    LTB) and enterCardFromZone (the helper reanimation uses, fires ETB). No new zone machinery.
 *
 * RE-TRIGGERING THE ETB IS THE ENTIRE POINT OF THE CARD. A blink that returns the creature but skips its ETB
 * is a blank, and would pass any test that only checked the permanent is still on the battlefield — so the
 * ETB assertion below is the one that matters.
 *
 * CR 400.7: the returned object is a NEW object — new permanent id, no counters, summoning-sick. Pinned,
 * because carrying that state across the hop is the tempting shortcut and would silently make blink a
 * counter-doubling trick it is not.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { applyBlink } from "./effects/atoms/zones.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const BLINK_YOURS = "Exile target creature you control, then return that card to the battlefield under your control.";
const BLINK_OWNER = "Exile target creature you control, then return it to the battlefield under its owner's control.";

const bearCard = (oracle = "") => ({ id: "cb", name: "Blinky", type: "Creature — Bear", oracle, power: 2, toughness: 2 });

function boardWith(card, { counters = {}, controller = "user" } = {}) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      [controller]: {
        ...s0.players[controller],
        battlefield: [{ id: "p1", controller, owner: controller, card, counters, summoningSick: false }],
      },
    },
  };
}

const blink = (state, atom = { op: "blink", returnTo: "controller" }) =>
  applyBlink(state, atom, { controller: "user", targets: [{ type: "creature", id: "p1" }] });

const bf = (s, pid = "user") => s.players[pid].battlefield;

describe("the splitter fix — without it the atom is unreachable", () => {
  it("the blink sentence survives the ', then' split as ONE clause", () => {
    expect(splitClauses(BLINK_YOURS)).toHaveLength(1);
  });

  it("THE DANGEROUS HALF — the leading fragment parses HIGH on its own, so a split is NOT fail-safe", () => {
    // This is why keep-whole was required rather than letting the split fail into the Arbiter: the first
    // half is a complete, confident exile. A split card would exile your creature and never return it.
    const p = parseEffectClause("exile target creature you control");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0].op).toBe("exile");
  });

  it("an unrelated ', then' sentence still splits normally (the guard is anchored)", () => {
    expect(splitClauses("Scry 2, then draw a card.")).toHaveLength(2);
  });
});

describe("parse", () => {
  it("'under your control' returns it to the CASTER", () => {
    expect(parseEffectClause("exile target creature you control, then return that card to the battlefield under your control").atoms)
      .toEqual([{ op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: "controller" }]);
  });

  it("'under its owner's control' is a DIFFERENT card for a stolen creature", () => {
    expect(parseEffectClause("exile target creature you control, then return it to the battlefield under its owner's control").atoms[0].returnTo)
      .toBe("owner");
  });
});

describe("RUNTIME — it comes back, and its ETB fires", () => {
  it("the creature is on the battlefield again (not left in exile)", () => {
    const s = blink(boardWith(bearCard()));
    expect(bf(s).map((p) => p.card.name)).toEqual(["Blinky"]);
    expect((s.players.user.exile || []).map((c) => c.name)).not.toContain("Blinky");
  });

  it("THE LOAD-BEARING ONE — the returned creature's ETB TRIGGER FIRES (the point of the card)", () => {
    // A blink that returns the creature but skips its ETB is a blank, and would pass the test above.
    const s = blink(boardWith(bearCard("When this creature enters, draw a card.")));
    expect((s.pendingTriggers || []).length).toBeGreaterThan(0);
  });

  it("CR 400.7 — it returns as a NEW object: a fresh permanent id", () => {
    const s = blink(boardWith(bearCard()));
    expect(bf(s)[0].id).not.toBe("p1");
  });

  it("CR 400.7 — COUNTERS do not survive the hop (blink is not a counter trick)", () => {
    const s = blink(boardWith(bearCard(), { counters: { "+1/+1": 3 } }));
    expect(bf(s)[0].counters?.["+1/+1"] || 0).toBe(0);
  });

  it("it returns SUMMONING-SICK (a new object that has not been controlled since the turn began)", () => {
    const s = blink(boardWith(bearCard()));
    expect(bf(s)[0].summoningSick).not.toBe(false);
  });

  it("a target that vanished before resolution is a clean no-op (CR 608.2b)", () => {
    const state = boardWith(bearCard());
    const s = applyBlink(state, { op: "blink", returnTo: "controller" }, { controller: "user", targets: [{ type: "creature", id: "gone" }] });
    expect(bf(s)).toHaveLength(1);
    expect(bf(s)[0].id).toBe("p1");   // untouched
  });
});

describe("classification — the staples this unblocks", () => {
  it("Cloudshift's shape flips", () => {
    expect(classifyCard({ name: "Cloudshift", type: "Instant", mana: "{W}", keywords: [], oracle: BLINK_YOURS })).toMatch(/^native/);
  });

  it("the owner-control wording flips too (Ephemerate #440 class)", () => {
    expect(classifyCard({ name: "Blinker", type: "Instant", mana: "{W}", keywords: [], oracle: BLINK_OWNER })).toMatch(/^native/);
  });
});
