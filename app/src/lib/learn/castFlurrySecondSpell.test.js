/**
 * BLITZ CC-1 — FLURRY / FLURRY OF BLOWS / EUKRASIA second-spell ability-word strip.
 *
 * The engine already models the counted second-spell trigger end to end: a spellsCastThisTurn ledger
 * (recordSpellCast at the cast chokepoint), a castSecond event in checkCastTriggers that fires ONCE when
 * the count reaches 2, and the "you cast your second spell each turn" detector in classifyCondition (see
 * trigCast2.test.js). What was MISSING is the ability-word LABEL: "Flurry —" (CR 207.2c), "Flurry of Blows —"
 * (Monk of the Open Hand's card-specific flavor name) and "Eukrasia —" (FIN, newer than the CR snapshot) sit
 * between the line start and "Whenever", so the boundary-anchored trigger regex never saw the bare "Whenever
 * you cast your second spell each turn" — every one of these cards was body-only even when its payoff is a
 * fully-modeled program. Ability words have NO rules meaning (CR 207.2c), and the BLITZ CC-1 corpus scan
 * confirmed all 16 labelled cards write the full trigger after the label with NO intervening-if, so adding
 * the three labels to stripTriggerAbilityLabel is FN-safe and FP-closing (it can only REVEAL a trigger the
 * counter already knows how to fire, never hide one).
 *
 * Corpus flips (tier-fingerprint flip-diff, LOST=0): +4 native-trigger —
 *   Cori Mountain Stalwart, Devoted Duelist, Monk of the Open Hand, Wingblade Disciple.
 * Cards whose payoff stays unmodeled (rally counters, base-P/T set, Partner-with) correctly STAY body-only.
 *
 * Oracle fixtures below are the REAL text (verified via cardIndex.lookupCard during authoring).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, stripTriggerAbilityLabel, checkCastTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Real-corpus fixtures (faithful publicCard oracle shape) ───────────────────
const CORI = {
  id: "cori", name: "Cori Mountain Stalwart", type: "Creature — Human Monk", power: 3, toughness: 3,
  oracle: "Flurry — Whenever you cast your second spell each turn, this creature deals 2 damage to each opponent and you gain 2 life.",
};
const DUELIST = {
  id: "duelist", name: "Devoted Duelist", type: "Creature — Goblin Monk", power: 2, toughness: 1,
  oracle: "Haste\nFlurry — Whenever you cast your second spell each turn, this creature deals 1 damage to each opponent.",
};
const MONK = {
  id: "monk", name: "Monk of the Open Hand", type: "Creature — Elf Monk", power: 1, toughness: 1,
  oracle: "Flurry of Blows — Whenever you cast your second spell each turn, put a +1/+1 counter on this creature.",
};
const WINGBLADE = {
  id: "wing", name: "Wingblade Disciple", type: "Creature — Human Monk", power: 2, toughness: 2,
  oracle: "Flying\nFlurry — Whenever you cast your second spell each turn, create a 1/1 white Bird creature token with flying.",
};
// FN guards — same Flurry/Eukrasia label, payoff (or a sibling clause) the engine does NOT model → body-only.
const ALIGNED_HEART = {
  id: "aligned", name: "Aligned Heart", type: "Enchantment",
  oracle: "Flurry — Whenever you cast your second spell each turn, put a rally counter on this enchantment. Then create a 1/1 white Monk creature token with prowess for each rally counter on it. (Whenever you cast a noncreature spell, the token gets +1/+1 until end of turn.)",
};
const DRAGONBLOOD = {
  id: "twins", name: "Dragonblood Twins", type: "Creature — Human Monk", power: 2, toughness: 2,
  oracle: "Double team\nFlurry — Whenever you cast your second spell each turn, until end of turn, this creature has base power and toughness 4/4 and gains flying.",
};
const ALPHINAUD = {
  id: "alph", name: "Alphinaud Leveilleur", type: "Legendary Creature — Elf Wizard", power: 2, toughness: 4,
  oracle: "Partner with Alisaie Leveilleur (When this creature enters, target player may put Alisaie Leveilleur into their hand from their library, then shuffle.)\nVigilance\nEukrasia — Whenever you cast your second spell each turn, draw a card.",
};

// ─── ability-label strip ───────────────────────────────────────────────────────
describe("stripTriggerAbilityLabel — Flurry / Flurry of Blows / Eukrasia", () => {
  it("strips 'Flurry —' so the trigger regex sees a bare 'Whenever'", () => {
    const out = stripTriggerAbilityLabel("Flurry — Whenever you cast your second spell each turn, draw a card.");
    expect(out).not.toMatch(/^Flurry/i);
    expect(out).toMatch(/^Whenever you cast your second spell each turn/);
  });

  it("consumes 'Flurry of Blows —' WHOLE (longest-first) — no leftover 'of Blows'", () => {
    const out = stripTriggerAbilityLabel("Flurry of Blows — Whenever you cast your second spell each turn, put a +1/+1 counter on this creature.");
    expect(out).toMatch(/^Whenever you cast your second spell each turn/);
    expect(out).not.toMatch(/Blows/);
  });

  it("strips 'Eukrasia —' (FIN flavor label, corpus-verified pure flavor)", () => {
    const out = stripTriggerAbilityLabel("Eukrasia — Whenever you cast your second spell each turn, draw a card.");
    expect(out).toMatch(/^Whenever you cast your second spell each turn/);
  });

  it("strips the label only at a line boundary, leaving other lines intact", () => {
    const out = stripTriggerAbilityLabel("Haste\nFlurry — Whenever you cast your second spell each turn, this creature deals 1 damage to each opponent.");
    expect(out).toMatch(/Haste/);
    expect(out).toMatch(/\bWhenever you cast your second spell each turn/);
    expect(out).not.toMatch(/Flurry/);
  });
});

// ─── detection: labelled forms now yield castSecond ─────────────────────────────
describe("detectTriggers — labelled second-spell trigger routes to castSecond", () => {
  it("finds a castSecond event on each of the four flip cards", () => {
    for (const card of [CORI, DUELIST, MONK, WINGBLADE]) {
      expect(detectTriggers(card).some((d) => d.event === "castSecond")).toBe(true);
    }
  });

  it("does not manufacture a castSecond for a non-second-spell 'Flurry' partial", () => {
    // A bare 'Flurry' with no dash + trigger keyword is not a label to strip and yields no castSecond.
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Flurry of activity fills the air." }).some((d) => d.event === "castSecond")).toBe(false);
  });
});

// ─── classification on REAL oracle ──────────────────────────────────────────────
describe("classifyCard — the four Flurry flips are native-trigger", () => {
  it.each([
    ["Cori Mountain Stalwart", CORI],
    ["Devoted Duelist", DUELIST],
    ["Monk of the Open Hand", MONK],
    ["Wingblade Disciple", WINGBLADE],
    // Moved up from the FN-guard block below when its Partner-with residue was modeled (2026-08-01).
    ["Alphinaud Leveilleur", ALPHINAUD],
  ])("%s → native-trigger", (_name, card) => {
    expect(classifyCard(card)).toBe("native-trigger");
  });
});

describe("classifyCard — CREED FN guards: unmodeled payoff/rider stays body-only", () => {
  it("Aligned Heart (rally-counter scaling payoff) stays body-only", () => {
    expect(classifyCard(ALIGNED_HEART)).toBe("body-only");
  });
  it("Dragonblood Twins (Double team keyword + base-P/T set) stays body-only", () => {
    expect(classifyCard(DRAGONBLOOD)).toBe("body-only");
  });
  // ✅ INVERTED 2026-08-01 — "Alphinaud Leveilleur (Partner-with residue) stays body-only" lived here and no
  // longer holds. The pin was correct when written: its Eukrasia trigger parsed, and the card parked only on
  // the unmodeled "Partner with Alisaie Leveilleur" line. That line's ETB is now built (CR 702.124j — see
  // partnerWith.test.js), so the residue is gone and the card is native. The pin is not deleted, it is MOVED:
  // the assertion now lives in the native block above, so this file still watches the same card.
  // ⛔ What this block was really guarding — a Flurry/Eukrasia card with a genuinely unmodeled sibling clause
  // staying body-only — is still guarded by the two cases above, which is why no replacement guard is added.
});

// ─── runtime pin: castSecond fires on exactly the 2nd cast, label present ────────
describe("checkCastTriggers — labelled Flurry watcher fires on the 2nd cast only", () => {
  function stateAt(spellsCast) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = createPermanent({ id: "w", card: MONK, controller: "user", summoningSick: false });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [watcher], spellsCastThisTurn: spellsCast },
      },
    };
  }
  const fired = (s) => (checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "user" }).pendingTriggers || []).length;

  it("does not fire at 1, fires at 2, does not fire at 3 — through the stripped label", () => {
    expect(fired(stateAt(1))).toBe(0);
    expect(fired(stateAt(2))).toBe(1);
    expect(fired(stateAt(3))).toBe(0);
  });
});
