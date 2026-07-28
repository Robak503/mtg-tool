/**
 * diesBatchTrigger.test.js — BATCHED DEATHS (CR 603.1): "Whenever ONE OR MORE … die".
 *
 * The first arm of the largest vein in the engine (~214 parked cards across seven event verbs). The events
 * were already modeled and so was the "This ability triggers only once each turn" rider — `detectTriggers`
 * simply returned 0 on the plural phrasing, because the singular arm is gated on /\bdies\b/ and the plural
 * says "die". A pure detection gap with everything downstream already built.
 *
 * ⚠️ "ONE OR MORE" IS NOT A SYNONYM FOR THE SINGULAR, and that is the whole reason this needed its own
 * event rather than a regex widening. "Whenever one or more creatures die" fires ONCE for a simultaneous
 * batch; "whenever a creature dies" fires once PER creature. Mapping the plural onto the singular detector
 * would make a board wipe draw 5 cards instead of 1 — an over-fire, the forbidden direction.
 *
 * The defence is structural, copied from the shipped `combatDamageBatch` (Grim Hireling / Olivia): a
 * DEDICATED EVENT NAME with its own check function. A diesBatch descriptor has no route into the per-object
 * fire loop at all, so the over-fire is unrepresentable rather than merely gated. The once-vs-thrice
 * contrast below is the assertion that proves it — a suite without it would be green and worthless.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

const watcherCard = (oracle) => ({
  id: "cw", name: "Watcher", type: "Creature — Human Rogue", mana: "{2}{B}",
  power: 2, toughness: 2, keywords: [], oracle,
});
const BATCH = "Whenever one or more other creatures die, draw a card.";
const SINGULAR = "Whenever another creature dies, draw a card.";

/** A board with the watcher out, plus `n` creatures about to die simultaneously. */
function boardWith(oracle) {
  _resetIdsForTests();
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s0,
    players: {
      ...s0.players,
      user: {
        ...s0.players.user,
        battlefield: [{ id: "w", controller: "user", card: watcherCard(oracle) }],
      },
    },
  };
}

const deaths = (n) => Array.from({ length: n }, (_, i) => ({
  id: `d${i}`, controller: "user", name: `Bear${i}`, counters: {}, attachments: [],
  card: { id: `cd${i}`, name: `Bear${i}`, type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
}));

const fires = (oracle, n) => (checkDiesTriggers(boardWith(oracle), deaths(n)).pendingTriggers || []).length;

describe("detection", () => {
  it("the plural phrasing is its OWN event, not the singular one", () => {
    const d = detectTriggers(watcherCard(BATCH));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "diesBatch", scope: "eachOtherCreature" });
  });

  it("each controller scope maps through the SAME switch the singular arm uses", () => {
    const scopeOf = (o) => detectTriggers(watcherCard(o))[0]?.scope;
    expect(scopeOf("Whenever one or more creatures die, draw a card.")).toBe("eachCreature");
    expect(scopeOf("Whenever one or more creatures you control die, draw a card.")).toBe("creatureYouControl");
  });

  it("REGRESSION PIN — the SINGULAR form still detects as `dies`", () => {
    expect(detectTriggers(watcherCard(SINGULAR))[0]).toMatchObject({ event: "dies", scope: "eachOtherCreature" });
  });

  it("CREED — a rider on the batch clause leaves it UNDETECTED (safe FN, never a guessed scope)", () => {
    expect(detectTriggers(watcherCard("Whenever one or more creatures die during your turn, draw a card."))).toHaveLength(0);
  });
});

describe("RUNTIME — once per batch, and the contrast that proves it", () => {
  it("THE LOAD-BEARING ONE — THREE simultaneous deaths fire the batch watcher exactly ONCE", () => {
    expect(fires(BATCH, 3)).toBe(1);
  });

  it("…while the SINGULAR watcher fires THREE times on the same board (CR 603.1 contrast)", () => {
    // If this ever equals the line above, the plural has been folded onto the singular detector and every
    // batch card is silently over-firing.
    expect(fires(SINGULAR, 3)).toBe(3);
  });

  it("a single death fires the batch watcher once (the counts coincide at n=1 — never test only this)", () => {
    expect(fires(BATCH, 1)).toBe(1);
  });

  it("no deaths fire nothing", () => {
    expect(fires(BATCH, 0)).toBe(0);
  });

  it("an EXILED-INSTEAD death is not a death and does not fire the batch (CR 614 / 700.4)", () => {
    const dead = deaths(2).map((d) => ({ ...d, exileInstead: true }));
    expect((checkDiesTriggers(boardWith(BATCH), dead).pendingTriggers || []).length).toBe(0);
  });

  it("the watcher's OWN death does not fire its 'other creatures' batch (scope excludes self)", () => {
    const self = [{ id: "w", controller: "user", name: "Watcher", counters: {}, attachments: [], card: watcherCard(BATCH) }];
    expect((checkDiesTriggers(boardWith(BATCH), self).pendingTriggers || []).length).toBe(0);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Morbid Opportunist's shape flips, rider and all", () => {
    expect(classifyCard(watcherCard("Whenever one or more other creatures die, draw a card. This ability triggers only once each turn.")))
      .toMatch(/^native/);
  });
});

/**
 * The ATTACK sibling lives here because it belongs to the same CR-603.1 family, but it needed NO new
 * machinery at all — and the reason is worth recording. "Whenever one or more creatures you control attack"
 * is simply the OLDER TEMPLATING for the condition Wizards now words as "Whenever you attack" (CR 508.1):
 * both fire exactly once per combat in which you declared an attacker. So it maps onto the EXISTING
 * `youAttack` event, whose once-per-combat pass in checkAttackTriggers already predates this work.
 *
 * That mapping is also the safety argument: routing it through the per-attacker `attacks` event instead
 * would fire once per attacker, so a three-creature alpha strike would draw three cards.
 *
 * HONEST SCORE: this flips ZERO cards today. The five corpus carriers of the bare form (Grand Warlord
 * Radha #5380, Angelic Guardian, Ancestor Dragon, …) are blocked by their EFFECTS, not by detection.
 * Recorded as such rather than counted as a win.
 */
describe("ATTACK sibling — older templating for an event that already existed", () => {
  const soldier = (o) => ({ name: "Probe", type: "Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 2, keywords: [], oracle: o });

  it("maps onto the EXISTING once-per-combat youAttack event", () => {
    expect(detectTriggers(soldier("Whenever one or more creatures you control attack, draw a card."))[0])
      .toMatchObject({ event: "youAttack", scope: "you" });
  });

  it("REGRESSION PIN — the modern wording is unchanged", () => {
    expect(detectTriggers(soldier("Whenever you attack, draw a card."))[0]).toMatchObject({ event: "youAttack" });
  });

  it("THE LOAD-BEARING ONE — DEFENDER-side is a different event and stays undetected", () => {
    // "one or more creatures attack YOU" is an OPPONENT attacking. Mapping it to youAttack would fire the
    // controller's own attack trigger when they were being attacked — a wrong trigger, not a missing one.
    expect(detectTriggers(soldier("Whenever one or more creatures attack you, draw a card."))).toHaveLength(0);
  });

  it("CREED — a variant with an OBJECT is not claimed (bare form only)", () => {
    expect(detectTriggers(soldier("Whenever one or more creatures you control attack a player, draw a card."))).toHaveLength(0);
  });
});
