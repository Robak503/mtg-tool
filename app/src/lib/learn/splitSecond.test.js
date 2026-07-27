/**
 * splitSecond.test.js — the split second restriction (CR 702.19a, census slice 42).
 *
 * "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities
 * that aren't mana abilities.)"
 *
 * WHY THIS IS ENFORCED RATHER THAN WAVED THROUGH. Several keywords in this engine are credited because they
 * are genuinely VACUOUS here — an optional zone-cast the engine never offers, where the hard cast resolves
 * identically. Split second is NOT one of those, and the difference is worth stating: the engine really does
 * hand opponents priority with a non-empty stack, so a split-second spell that failed to lock them out would
 * be a live divergence from the printed card, not a no-op. It is credited because splitSecondOnStack imposes
 * the restriction, and these tests are what make that claim checkable.
 *
 * THE SCOPE, precisely as CR 702.19a words it:
 *   - casting spells            → suppressed, for EVERY player (not just opponents)
 *   - non-mana activated abilities → suppressed (activate / crew / cycling / loyalty)
 *   - MANA abilities            → still legal, exempted by name
 *   - CR 116.2 special actions  → still legal (playing a land is neither casting nor activating)
 *
 * The "every player" part is why this cannot reuse the Grand Abolisher lane next to it: that restriction is
 * scoped to "your opponents", which let it lean on the engine's own-turn-only activation gating. Split
 * second binds the caster too, on their own turn, so the activation half needed explicit enforcement.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

const SS_REMINDER = "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)";
const KROSAN = { name: "Krosan Grip", type: "Instant", mana: "{2}{G}", keywords: [], oracle: `${SS_REMINDER}\nDestroy target artifact or enchantment.` };

/** A board with lands, a castable spell in hand, and an activatable creature — then optionally a stack. */
function board({ stack = [] } = {}) {
  _resetIdsForTests();
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = [];
  for (let i = 0; i < 6; i++) {
    bf.push(createPermanent({ id: `l${i}`, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false }));
  }
  bf.push(createPermanent({
    id: "pinger",
    card: { name: "Pinger", type: "Creature — Human", power: 1, toughness: 1, oracle: "{T}: This creature deals 1 damage to target creature." },
    controller: "user", summoningSick: false,
  }));
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
    stack,
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: bf,
          // An INSTANT, deliberately: with anything on the stack a sorcery-speed card is unavailable for
        // reasons that have nothing to do with split second, which would make every assertion below
        // meaningless. The control stack (ORDINARY_STACK) exists for the same reason.
      hand: [{ id: "h1", name: "Giant Growth", type: "Instant", mana: "{G}", oracle: "Target creature gets +3/+3 until end of turn." }, { id: "h2", name: "Forest", type: "Basic Land — Forest" }],
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 9, C: 9 },
      },
    },
  };
}

const ssStack = [{ id: "stk", kind: "spell", controller: "ai1", targets: [], source: KROSAN }];
// The CONTROL: an ordinary spell occupying the stack. Comparing against this rather than an empty stack is
// what isolates split second's actual contribution — a non-empty stack already forbids land drops and
// sorcery-speed casts on its own (CR 116.2a), and crediting split second for those would be a false claim.
const ORDINARY_STACK = [{ id: "stk", kind: "spell", controller: "ai1", targets: [], source: { name: "Lightning Bolt", type: "Instant", oracle: "Lightning Bolt deals 3 damage to any target." } }];
const kinds = (s, pid = "user") => new Set(legalActionsForPlayer(s, pid).map((a) => a.kind));

describe("baseline — these actions ARE offered with an ordinary spell on the stack", () => {
  it("casting, activating and mana are all available", () => {
    const k = kinds(board({ stack: ORDINARY_STACK }));
    expect(k.has("cast-spell")).toBe(true);
    expect(k.has("activate-ability")).toBe(true);
    expect(k.has("tap-for-mana")).toBe(true);
  });

  it("and with an EMPTY stack, land drops are available too", () => {
    expect(kinds(board()).has("play-land")).toBe(true);
  });
});

describe("ENFORCEMENT — while a split-second spell is on the stack", () => {
  it("casting is suppressed", () => {
    expect(kinds(board({ stack: ssStack })).has("cast-spell")).toBe(false);
  });

  it("non-mana activated abilities are suppressed", () => {
    expect(kinds(board({ stack: ssStack })).has("activate-ability")).toBe(false);
  });

  it("MANA abilities are still legal — the rule exempts them by name", () => {
    expect(kinds(board({ stack: ssStack })).has("tap-for-mana")).toBe(true);
  });

  it("it takes away EXACTLY casting and non-mana activation, nothing else", () => {
    // The honest scope check: diff the split-second board against the ordinary-spell board. Whatever
    // disappears is split second's doing; everything else must survive. If this ever grows a third entry,
    // the restriction has over-reached past what CR 702.19a says.
    const lost = [...kinds(board({ stack: ORDINARY_STACK }))].filter((k) => !kinds(board({ stack: ssStack })).has(k));
    expect(lost.sort()).toEqual(["activate-ability", "cast-spell"]);
  });

  it("it binds the CASTER too, not only opponents — the Grand Abolisher lane could not have covered this", () => {
    // The split-second spell is controlled by ai1 above; here the ACTIVE player (user) is equally locked.
    // A restriction scoped to "your opponents" would have left this player free.
    const mine = [{ id: "stk", kind: "spell", controller: "user", targets: [], source: KROSAN }];
    expect(kinds(board({ stack: mine })).has("cast-spell")).toBe(false);
  });

  it("and it LIFTS once the spell leaves the stack", () => {
    expect(kinds(board({ stack: [] })).has("cast-spell")).toBe(true);
  });
});

describe("CREED — the anchor cannot be tripped by accident", () => {
  it("a spell that merely MENTIONS split second in its text imposes nothing", () => {
    const talker = { name: "Rules Lawyer", type: "Instant", oracle: "Counter target spell with split second." };
    const stack = [{ id: "stk", kind: "spell", controller: "ai1", targets: [], source: talker }];
    expect(kinds(board({ stack })).has("cast-spell")).toBe(true);
  });

  it("a non-spell stack object (a triggered ability) imposes nothing", () => {
    const stack = [{ id: "stk", kind: "trigger", controller: "ai1", targets: [], source: KROSAN }];
    expect(kinds(board({ stack })).has("cast-spell")).toBe(true);
  });
});

describe("classification", () => {
  it("the carrier flips", () => {
    expect(classifyCard(KROSAN)).toMatch(/^native/);
  });

  it("CREED — a COMPOUND keyword line is not stripped, so the card parks rather than losing a rider", () => {
    // The strip is deliberately the tight madness-line shape (keyword, optional reminder, end of line). A
    // greedy tail on a costless keyword could swallow real text off the same line.
    expect(classifyCard({ ...KROSAN, oracle: "Split second, flying, and each opponent glorbulates.\nDestroy target artifact or enchantment." })).not.toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...KROSAN, oracle: `${SS_REMINDER}\nDestroy target artifact or enchantment.\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
