/**
 * selfDealerDestroy.test.js — "Whenever THIS CREATURE deals combat damage to a creature, destroy that
 * creature." (Voracious Cobra, Dripping Dead, Stinkweed Imp).
 *
 * ⛔ OHRAN VIPER AND SERPENTINE BASILISK ARE **NOT** IN THAT LIST, and they are why the effect anchor is
 * whole-string. Both print "...destroy that creature AT END OF COMBAT" — a DELAYED destroy. A prefix test
 * (`^destroy that creature`) matched them and would have resolved the destroy IMMEDIATELY: strictly
 * stronger than printed, the forbidden direction. The first measurement said GAINED 5; two of those five
 * were wrong, and tightening the anchor to the whole effect took it to a correct GAINED 3. The pin for it
 * is below.
 *
 * ⭐ THE PIPELINE WAS ALREADY BUILT for the GLOBAL-subtype twin (Toxin Sliver): the event, the per-pair
 * firing site off combatResolution's creature-damage events, the "destroy that creature" → "destroy the
 * triggering creature" rewrite, and the cannotRegenerate re-stamp. Only the SELF scope was missing, so a
 * two-line card sat on the Arbiter while the machinery to run it was shipped and tested.
 *
 * ⛔ AND IT COULD NOT REUSE scope:"self" — THAT MISTAKE SHIPPED A CLEAN FLIP-DIFF WITH A DEAD TRIGGER.
 * `self` asks "triggeringPermanent === sourcePermanent". Here the triggering permanent is deliberately the
 * DAMAGED creature (it is the destroy target, threaded so "that creature" binds), while the dealer is the
 * watcher — two different objects, never equal. The first build measured GAINED 5 / LOST 0 and the trigger
 * FIRED ZERO TIMES on a real board:
 *     Cobra deals the damage -> 0 triggers   (correct answer: 1)
 * Five cards would have been credited native with an ability that can never happen. The flip-diff could not
 * see it; only driving the firing site could. Hence the dedicated `selfDealerToCreature` scope, which
 * confirms the triggering object is a creature and leaves the DEALER identity to the firing site — the same
 * division of labour the subtypeGlobal twin uses.
 *
 * CREED, mirroring the global arm verbatim: the bare self condition only (a "you control" variant or any
 * rider fails the anchor), and the effect must be the WHOLE "destroy that creature" — optionally plus the
 * regeneration rider, which the shared parseEffectClause wrapper re-detects and stamps onto the destroy
 * atom. A delayed "…at end of combat" payoff stays on the Arbiter as a safe false-negative.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test): the
 * dealer-identity gate removed -> the unrelated-dealer pin goes red (the Cobra destroys off a Bear's combat
 * damage, the widest over-fire); the detector disabled -> every flip pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCombatDamageToCreatureTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VORACIOUS_COBRA = { id: "c-vc", name: "Voracious Cobra", type: "Creature — Snake", mana: "{3}{G}",
  power: 2, toughness: 2, oracle: "First strike\nWhenever this creature deals combat damage to a creature, destroy that creature." };
const STINKWEED_IMP = { id: "c-si", name: "Stinkweed Imp", type: "Creature — Imp", mana: "{2}{B}",
  power: 1, toughness: 2, oracle: "Flying\nWhenever this creature deals combat damage to a creature, destroy that creature.\nDredge 5" };

const perm = (card, id, controller = "user") => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });

/** Deal combat damage from `dealerId` to an opponent's creature and count the triggers enqueued. */
function triggersOnDamage(card, dealerId) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const mine = [perm(card, "src"), perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear")];
  const theirs = [perm({ name: "Ogre Warrior", type: "Creature — Ogre", power: 3, toughness: 3, oracle: "" }, "ogre", "ai")];
  const s = { ...b, players: { ...b.players, user: { ...b.players.user, battlefield: mine }, ai: { ...b.players.ai, battlefield: theirs } } };
  const after = checkCombatDamageToCreatureTriggers(s, [{ dealerId, damagedCreatureId: "ogre", dealerController: "user" }]);
  return (after.pendingTriggers || []).length;
}

describe("detection", () => {
  it("detects on its OWN scope, not the generic self scope", () => {
    for (const card of [VORACIOUS_COBRA, STINKWEED_IMP]) {
      const [t, ...rest] = detectTriggers(card);
      expect(rest).toHaveLength(0);
      expect(t).toMatchObject({ event: "combatDamageToCreature", scope: "selfDealerToCreature", destroyThatCreature: true });
      expect(triggerRoutesNatively(t, card)).toBe(true);
    }
  });

  it("the carriers flip", () => {
    expect(classifyCard(VORACIOUS_COBRA)).toBe("native-trigger");
    expect(classifyCard(STINKWEED_IMP)).toBe("native-trigger");
  });

  it("⛔ a non-self subject and an unmodeled payoff both stay parked", () => {
    expect(classifyCard({ ...VORACIOUS_COBRA, id: "c-x", name: "Odd Cobra",
      oracle: "Whenever a creature you control deals combat damage to a creature, destroy that creature." })).toBe("body-only");
    // ⭐ THE REAL FALSE POSITIVE, pinned with its real cards: Ohran Viper and Serpentine Basilisk print
    // exactly this delayed wording and were credited as IMMEDIATE by a prefix anchor.
    expect(classifyCard({ ...VORACIOUS_COBRA, id: "c-y", name: "Slow Cobra",
      oracle: "Whenever this creature deals combat damage to a creature, destroy that creature at end of combat." })).toBe("body-only");
    expect(classifyCard({ ...VORACIOUS_COBRA, id: "c-z", name: "Ohran Viper",
      oracle: "Whenever this creature deals combat damage to a creature, destroy that creature at end of combat.\nWhenever this creature deals combat damage to a player, you may draw a card." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the trigger actually FIRES (a flip-diff could not see this)", () => {
  it("⭐ fires when the SOURCE deals the combat damage", () => {
    // The pin that caught the dead trigger. Under scope:"self" this read 0 while the card still classified
    // native-trigger and the flip-diff still showed +5.
    expect(triggersOnDamage(VORACIOUS_COBRA, "src")).toBe(1);
  });

  it("⛔ does NOT fire off an UNRELATED creature's combat damage", () => {
    // Without the dealer-identity gate the Cobra would destroy whatever a Grizzly Bear happened to hit.
    expect(triggersOnDamage(VORACIOUS_COBRA, "bear")).toBe(0);
  });
});
