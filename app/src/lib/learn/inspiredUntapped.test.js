/**
 * inspiredUntapped.test.js — INSPIRED (CR 702.108a). Thirteen carriers, ZERO native before this.
 *
 * "Inspired — Whenever this creature becomes untapped, …" (King Macar the Gold-Cursed, Pain Seer, Servant
 * of Tymaret, Disciple of Deceit and the rest of the Born of the Gods cycle).
 *
 * ⭐ THE RUNTIME WAS ALREADY FINISHED. The `untapped` event, its firing site (checkUntapTriggers draining
 * gameState's pendingUntapEvents), and the self-scope gate (`triggeringPermanent.id === sourcePermanent.id`)
 * all shipped with Mesmeric Orb's "a permanent becomes untapped". ONLY THE DETECTOR WAS MISSING — the whole
 * cycle sat on the Arbiter while the machinery to run it was already built and tested. The new arm is a
 * verbatim mirror of the becomes-TAPPED self arm directly above it.
 *
 * ⛔ TWO GAPS AGAIN, AND THE ORDER OF DISCOVERY MATTERED. Adding the detector alone changed nothing,
 * because the "Inspired —" label was not in the shared CR 207.2c list and the condition never reached it.
 * Measured at each step rather than assumed:
 *     "Whenever this creature becomes untapped, …"              -> detected after the arm  ✅
 *     "Inspired — Whenever this creature becomes untapped, …"   -> still nothing           ❌
 * — which is what isolated the label as the second, independent gap.
 *
 * ⛔ AND THE LABEL LIST IS NOT A FREE-FOR-ALL. A corpus sweep found ~20 unlisted "<Word> —" labels, and
 * MOST MUST STAY OUT: adamant, revolt, coven, corrupted and their kin put the CONDITION in the label
 * ("Revolt — if a permanent you controlled left the battlefield this turn"), so stripping it would delete
 * the gate and credit the effect unconditionally — an over-fire. `inspired` is admitted precisely because
 * it is decorative: the real condition ("Whenever this creature becomes untapped") follows it, exactly like
 * `landfall` and `battalion`.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test): the
 * detector arm disabled -> every pin red; `inspired` removed from the label list -> the flip pins red while
 * the unlabelled synthetic stays green (which is what proves the two gaps are independent).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkUntapTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SERVANT_OF_TYMARET = { id: "c-st", name: "Servant of Tymaret", type: "Creature — Zombie", mana: "{B}",
  power: 2, toughness: 1, oracle: "Inspired — Whenever this creature becomes untapped, each opponent loses 1 life." };
const PAIN_SEER = { id: "c-ps", name: "Pain Seer", type: "Creature — Human Cleric", mana: "{1}{B}",
  power: 2, toughness: 2, oracle: "Inspired — Whenever this creature becomes untapped, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value." };
const NAMED_SUBJECT = { id: "c-km", name: "King Macar", type: "Legendary Creature — Human", mana: "{2}{B}",
  power: 2, toughness: 3, oracle: "Inspired — Whenever King Macar becomes untapped, each opponent loses 1 life." };

const perm = (card, id, over = {}) => ({ id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

/** Record an untap transition for `untappedId` and count the triggers checkUntapTriggers enqueues. */
function triggersOnUntap(card, untappedId) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const battlefield = [perm(card, "src"), perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear")];
  const s = { ...b, activePlayer: "user",
    players: { ...b.players, user: { ...b.players.user, battlefield } },
    ...(untappedId ? { pendingUntapEvents: [{ id: untappedId, controller: "user" }] } : {}) };
  return (checkUntapTriggers(s).pendingTriggers || []).length;
}

describe("detection — the detector and the label were two separate gaps", () => {
  it("the labelled and named-subject forms both detect as a SELF-scoped untapped trigger", () => {
    for (const card of [SERVANT_OF_TYMARET, PAIN_SEER, NAMED_SUBJECT]) {
      const [t, ...rest] = detectTriggers(card);
      expect(rest).toHaveLength(0);
      expect(t).toMatchObject({ event: "untapped", scope: "self" });
      expect(triggerRoutesNatively(t, card)).toBe(true);
    }
  });

  it("the carriers flip", () => {
    expect(classifyCard(SERVANT_OF_TYMARET)).toBe("native-trigger");
    expect(classifyCard(NAMED_SUBJECT)).toBe("native-trigger");
  });

  it("⛔ Mesmeric Orb's bare 'a permanent becomes untapped' keeps its OWN scope, unchanged", () => {
    const [t] = detectTriggers({ id: "c-mo", name: "Mesmeric Orb", type: "Artifact", mana: "{2}",
      oracle: "Whenever a permanent becomes untapped, that permanent's controller mills a card." });
    expect(t).toMatchObject({ event: "untapped", scope: "anyPermanent" });
  });

  it("⛔ a WATCHER form stays undetected — self-scope only, never a mis-scoped fire", () => {
    expect(detectTriggers({ id: "c-x", name: "Odd Seer", type: "Creature — Human", mana: "{1}{B}", power: 2, toughness: 2,
      oracle: "Whenever a creature you control becomes untapped, each opponent loses 1 life." })).toEqual([]);
  });
});

describe("⭐ LAW 6 — the trigger fires off a real untap transition", () => {
  it("fires when the SOURCE untaps", () => {
    expect(triggersOnUntap(SERVANT_OF_TYMARET, "src")).toBe(1);
  });

  it("⛔ does NOT fire when ANOTHER permanent untaps (the self gate)", () => {
    expect(triggersOnUntap(SERVANT_OF_TYMARET, "bear")).toBe(0);
  });

  it("⛔ no untap transition, no trigger — a creature that was never tapped cannot fire it", () => {
    expect(triggersOnUntap(SERVANT_OF_TYMARET, null)).toBe(0);
  });
});
