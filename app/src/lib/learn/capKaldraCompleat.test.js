/**
 * capKaldraCompleat.test.js — the SELF combat-damage-to-a-creature EXILE twin + the GRANTED-descriptor
 * merge at the fire site (SHELF CAP4 — Kaldra Compleat).
 *
 * "Equipped creature gets +5/+5 and has first strike, trample, indestructible, haste, and \"Whenever
 * this creature deals combat damage to a creature, exile that creature.\"" Two pieces:
 *   1. the THIRD payoff shape on the combatDamageToCreature event/scope/fire site (destroy → tap-lock →
 *      EXILE), same gates as its twins: bare self condition, WHOLE-effect anchor ("…at end of combat"
 *      or any rider parks — resolving it immediately would be stronger than printed). Rides the new
 *      removal.js "exile the triggering creature" sentinel → target:"thatCreature" → applyZoneMove.
 *   2. ⛔ THE FIRE SITE READ ONLY PRINTED CARDS. checkCombatDamageToCreatureTriggers bypasses
 *      triggersForEvent (dealer-identity gating), so an attached grant was structurally invisible —
 *      Kaldra classified native-equipment while its granted trigger could NEVER fire (the recurring
 *      runtime-vacuous trap; checkTapTriggers documents the same catch). grantedTriggersForHost/-Group
 *      are merged there now; the host IS the dealer, so the identity gate works unchanged.
 * CREED FP = an exile firing off an unrelated dealer, a delayed variant resolved immediately, or the
 * damaged creature going to the GRAVEYARD instead of exile.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCombatDamageToCreatureTriggers, parseGrantedTriggeredAbilities } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KALDRA = { id: "c-kald", name: "Kaldra Compleat", type: "Legendary Artifact — Equipment", mana: "{7}",
  oracle: "Living weapon\nIndestructible\nEquipped creature gets +5/+5 and has first strike, trample, indestructible, haste, and \"Whenever this creature deals combat damage to a creature, exile that creature.\"\nEquip {7}" };
// A PRINTED carrier of the same wording (Duplicant-class body) for the bare-twin pins.
const PRINTED = { id: "c-pr", name: "Spine Render", type: "Creature — Phyrexian Horror", mana: "{4}{B}",
  power: 3, toughness: 3, oracle: "Whenever this creature deals combat damage to a creature, exile that creature." };

const perm = (card, id, controller = "user", over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function board() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const germ = perm({ name: "Phyrexian Germ", type: "Creature — Phyrexian Germ", power: 0, toughness: 0, oracle: "" }, "germ", "user", { attachments: ["kald"] });
  const kaldra = perm(KALDRA, "kald", "user", { attachedTo: "germ" });
  const bear = perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear", "user");
  const ogre = perm({ name: "Ogre Warrior", type: "Creature — Ogre", power: 3, toughness: 3, oracle: "" }, "ogre", "ai");
  return { ...b, players: { ...b.players,
    user: { ...b.players.user, battlefield: [germ, kaldra, bear] },
    ai: { ...b.players.ai, battlefield: [ogre] } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("detection + classify", () => {
  it("⭐ the exile twin detects on the shared scope and routes natively; the PRINTED carrier flips", () => {
    const [t, ...rest] = detectTriggers(PRINTED);
    expect(rest).toHaveLength(0);
    expect(t).toMatchObject({ event: "combatDamageToCreature", scope: "selfDealerToCreature", exileThatCreature: true });
    expect(t.effectClause).toBe("exile the triggering creature");
    expect(triggerRoutesNatively(t, PRINTED)).toBe(true);
    expect(classifyCard(PRINTED)).toBe("native-trigger");
  });

  it("⭐ KALDRA COMPLEAT flips native-equipment; the quoted grant parses as a granted descriptor", () => {
    expect(classifyCard(KALDRA)).toBe("native-equipment");
    const granted = parseGrantedTriggeredAbilities(KALDRA);
    const ex = granted.find((d) => d.event === "combatDamageToCreature");
    expect(ex).toMatchObject({ scope: "selfDealerToCreature", exileThatCreature: true });
    expect(triggerRoutesNatively(ex)).toBe(true);
  });

  it("⛔ the delayed 'at end of combat' variant and a you-control watcher both park (the twins' shared anchors)", () => {
    expect(classifyCard({ ...PRINTED, id: "c-d", name: "Slow Render",
      oracle: "Whenever this creature deals combat damage to a creature, exile that creature at end of combat." })).toBe("body-only");
    expect(classifyCard({ ...PRINTED, id: "c-w", name: "Watcher Render",
      oracle: "Whenever a creature you control deals combat damage to a creature, exile that creature." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the GRANTED trigger actually fires, and the creature lands in EXILE", () => {
  it("⭐ the equipped host's combat damage fires the granted exile; the damaged creature goes to EXILE, not the graveyard", () => {
    const s = board();
    const fired = checkCombatDamageToCreatureTriggers(s, [{ dealerId: "germ", damagedCreatureId: "ogre", dealerController: "user" }]);
    expect((fired.pendingTriggers || []).length).toBe(1); // the granted descriptor — invisible before the merge
    const after = resolveAll(fired);
    expect(after.players.ai.battlefield.find((p) => p.id === "ogre")).toBeUndefined();
    expect((after.players.ai.exile || []).some((c) => c.name === "Ogre Warrior")).toBe(true);   // exiled
    expect((after.players.ai.graveyard || []).some((c) => c.name === "Ogre Warrior")).toBe(false); // NOT destroyed
  });

  it("⛔ an UNRELATED creature's combat damage does not fire the grant (the dealer-identity gate holds for granted descriptors)", () => {
    const s = board();
    const fired = checkCombatDamageToCreatureTriggers(s, [{ dealerId: "bear", damagedCreatureId: "ogre", dealerController: "user" }]);
    expect((fired.pendingTriggers || []).length).toBe(0);
  });
});
