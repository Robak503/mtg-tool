/**
 * venserSpellPermanentBounce.test.js — VENSER, SHAPER SAVANT (2026-08-14). "When Venser enters, return
 * target spell or permanent to its owner's hand."
 *
 * ⭐ THE STACK∪BATTLEFIELD UNION: a new targetType (spellOrPermanent — stack spells + every permanent),
 * one resolver in stack.js (the layering {zones} <- removal <- stack is why it lives there: only stack
 * may reach both counterSpellById and applyZoneMove), and the enemy-side intent case that lets the
 * ETB-trigger flush place the target (the Man-o'-War logic with a wider pool).
 *
 * ⭐⭐ RETURN ≠ COUNTER (CR 701.6a): the atom's notCounter flag bypasses the uncounterable exclusions at
 * enumeration — Venser legally bounces a spell Counterspell cannot touch. Witnessed as a PAIR (the same
 * board, both atoms, opposite pools).
 *
 * Whole-card audit: Flash (keyword) + this ETB — nothing else on the card.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the zones.js parser arm disabled -> Venser parks (body-only).
 *   · notCounter dropped from the atom -> the uncounterable spell vanishes from Venser's pool (⭐⭐ dies).
 *   · the intent case removed -> ambiguous intent -> the trigger is not routable -> Venser parks.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VENSER = { id: "c-vss", name: "Venser, Shaper Savant", type: "Legendary Creature — Human Wizard", mana: "{2}{U}{U}",
  power: "2", toughness: "2", oracle: "Flash\nWhen Venser enters, return target spell or permanent to its owner's hand." };
const CLAUSE = "return target spell or permanent to its owner's hand";

/** A board: an UNCOUNTERABLE spell on the stack (ai1's) + one enemy permanent + one own permanent. */
function board() {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const spell = createStackObject({
    id: "stk-unc", kind: "spell", controller: "ai1", targets: [],
    source: { id: "card-unc", name: "Supreme Verdict", type: "Sorcery", cmc: 4, oracle: "This spell can't be countered.\nDestroy all creatures." },
    payload: { resolver: "manual", params: {} },
  });
  const enemyPerm = createPermanent({ id: "eP", controller: "ai1", summoningSick: false,
    card: { id: "card-eP", name: "Rhystic Study", type: "Enchantment", oracle: "" } });
  const ownPerm = createPermanent({ id: "oP", controller: "user", summoningSick: false,
    card: { id: "card-oP", name: "Mulldrifter", type: "Creature — Elemental", power: "2", toughness: "2", oracle: "" } });
  return {
    ...g,
    stack: [spell],
    players: { ...g.players,
      ai1: { ...g.players.ai1, battlefield: [enemyPerm] },
      user: { ...g.players.user, battlefield: [ownPerm], hand: [] } },
  };
}

describe("the carrier and the shape", () => {
  it("⭐ Venser flips native-trigger; the atom carries the union + notCounter; intent is enemy-side", () => {
    expect(classifyCard(VENSER)).toBe("native-trigger");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "bounce-spell-or-permanent", targetType: "spellOrPermanent", notCounter: true });
    expect(atomTargetIntent(p.atoms[0])).toBe("enemy");
  });
});

describe("⭐⭐ LAW 6 — the union pool, the not-a-counter exemption, and both resolution halves", () => {
  it("⭐⭐ RETURN ≠ COUNTER: the uncounterable spell is IN Venser's pool and OUT of Counterspell's", () => {
    const s = board();
    const venser = parseEffectClause(CLAUSE, "Instant");
    const counter = parseEffectClause("counter target spell", "Instant");
    const pool = (prog) => expandCastChoices(s, "user", prog, [], {}).flatMap((c) => (c.targets || []).map((t) => t.id));
    const vPool = pool(venser), cPool = pool(counter);
    const row = { venserSeesSpell: vPool.includes("stk-unc"), counterSeesSpell: cPool.includes("stk-unc"),
      venserSeesEnemyPerm: vPool.includes("eP"), venserSeesOwnPerm: vPool.includes("oP") };
    console.log("  WITNESS venserPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ venserSeesSpell: true, counterSeesSpell: false, venserSeesEnemyPerm: true, venserSeesOwnPerm: true });
  });

  it("⭐⭐ stack half: the bounced spell leaves the stack to its owner's HAND (never the graveyard)", () => {
    const s = board();
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["bounce-spell-or-permanent"](s, atom, { controller: "user", targets: [{ type: "spell", id: "stk-unc" }] });
    const row = { stack: after.stack.length, inHand: after.players.ai1.hand.some((c) => c.id === "card-unc"),
      inGy: (after.players.ai1.graveyard || []).some((c) => c.id === "card-unc") };
    console.log("  WITNESS venserSpellHalf", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stack: 0, inHand: true, inGy: false });
  });

  it("⭐ battlefield half: the bounced permanent goes to its owner's hand", () => {
    const s = board();
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["bounce-spell-or-permanent"](s, atom, { controller: "user", targets: [{ type: "creature", id: "eP" }] });
    const row = { onField: after.players.ai1.battlefield.length, inHand: after.players.ai1.hand.some((c) => c.id === "card-eP") };
    console.log("  WITNESS venserPermHalf", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ onField: 0, inHand: true });
  });

  it("⛔ a target in NEITHER zone fizzled — clean no-op (CR 608.2b)", () => {
    const s = board();
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["bounce-spell-or-permanent"](s, atom, { controller: "user", targets: [{ type: "creature", id: "ghost" }] });
    expect(after.stack.length).toBe(1);
    expect(after.players.ai1.battlefield.length).toBe(1);
  });
});
