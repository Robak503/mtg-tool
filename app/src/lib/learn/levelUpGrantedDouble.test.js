/**
 * levelUpGrantedDouble.test.js — Level Up (CR 121 + 608.2): an Aura that GRANTS a quoted attack trigger whose
 * payload is a counter-double followed by a conditional rider.
 *
 *   "Enchant creature / When this Aura enters, put a +1/+1 counter on enchanted creature. /
 *    Enchanted creature has 'Whenever this creature attacks, double the number of +1/+1 counters on it.
 *    Then if it has power 10 or greater, draw a card.'"
 *
 * ⭐ THE BIGGEST SINGLE ITEM ON THE SHELF: three below-bar decks run it (Wolverine, claws out! · Hulk Smash ·
 * Halfshell heroes), so one card is three deck slots.
 *
 * ⭐ AND EVERY PIECE WAS ALREADY BUILT. The quoted-grant machinery, the counter-double, the "it" → source
 * pronoun rewrite, and the parser's "then if <cond>, <effect>" peel (which reads "it has power N or greater"
 * in a self-scoped trigger) all shipped separately. The ONE thing in the way was that the pronoun rewrite was
 * WHOLE-CLAUSE anchored, so it refused to fire the moment a second sentence followed. A comment in triggers.js
 * even predicted this card would park "until the threshold half is modelled" — the threshold half was already
 * modelled; the anchor was the blocker.
 *
 * ⛔ THE ANCHOR WAS RELOCATED, NOT REMOVED. The rewrite touches the pronoun in the FIRST sentence only and
 * leaves every following sentence byte-identical, so an unmodelled rider still parks the whole card. The
 * "flurgle" test below is the witness that whole-card safety survived.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkAttackTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LEVEL_UP = {
  name: "Level Up", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant creature\nWhen this Aura enters, put a +1/+1 counter on enchanted creature.\nEnchanted creature has \"Whenever this creature attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card.\"",
};

const permObj = (card, controller, id, over = {}) =>
  ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });

function board({ counters = 3, power = 2 } = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers" };
  const host = permObj({ name: "Host", type: "Creature — Bear", power, toughness: power, oracle: "" }, "user", "host", { attachments: ["aura"], counters: { "+1/+1": counters } });
  const aura = permObj(LEVEL_UP, "user", "aura", { attachedTo: "host" });
  const library = Array.from({ length: 5 }, (_, i) => ({ id: `lib${i}`, name: `Lib${i}`, type: "Instant", oracle: "" }));
  return {
    ...base,
    combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...base.players, user: { ...base.players.user, battlefield: [host, aura], library, hand: [] } },
  };
}
const resolveAll = (s) => { let st = flushTriggers(s); for (let i = 0; i < 12 && st.stack?.length; i++) st = resolveTopOfStack(st); return st; };
const countersOf = (s) => s.players.user.battlefield.find((p) => p.id === "host")?.counters?.["+1/+1"] ?? 0;

describe("⭐⭐ RUNTIME — the granted trigger fires and the HOST's counters double", () => {
  it("the trigger fires when the enchanted creature attacks", () => {
    expect((checkAttackTriggers(board()).pendingTriggers || []).length).toBe(1);
  });

  it("3 counters → 6 on the enchanted creature", () => {
    expect(countersOf(resolveAll(checkAttackTriggers(board({ counters: 3 }))))).toBe(6);
  });

  it("it is a DOUBLE, not a fixed bonus: 1 → 2, 5 → 10", () => {
    expect(countersOf(resolveAll(checkAttackTriggers(board({ counters: 1 }))))).toBe(2);
    expect(countersOf(resolveAll(checkAttackTriggers(board({ counters: 5 }))))).toBe(10);
  });
});

describe("⭐ the conditional rider is a real gate, not decoration", () => {
  it("power BELOW the threshold after doubling → no card drawn", () => {
    // base power 2 + 3 counters, doubled to 6 → power 8. Under 10, so the rider must not fire.
    const s = resolveAll(checkAttackTriggers(board({ counters: 3, power: 2 })));
    expect(countersOf(s)).toBe(6);
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("power AT OR ABOVE the threshold after doubling → a card IS drawn", () => {
    // base power 2 + 5 counters, doubled to 10 → power 12. The rider fires.
    const s = resolveAll(checkAttackTriggers(board({ counters: 5, power: 2 })));
    expect(countersOf(s)).toBe(10);
    expect(s.players.user.hand).toHaveLength(1);
  });
});

describe("recognition + the whole-card guard", () => {
  it("Level Up flips", () => {
    expect(classifyCard(LEVEL_UP)).toBe("native-trigger");
  });

  it("⛔ an UNMODELLED rider after the doubling still parks the whole card", () => {
    // The relocated anchor rewrites only the first sentence's pronoun; the remainder still has to parse.
    expect(classifyCard({ ...LEVEL_UP, name: "Nonsense Rider",
      oracle: LEVEL_UP.oracle.replace("Then if it has power 10 or greater, draw a card.", "Then flurgle the wumpus.") })).not.toMatch(/^native/);
  });

  it("⛔ a NON-SELF trigger's 'it' is never bound by this rewrite (CREED — it is the OTHER creature)", () => {
    // For "Whenever ANOTHER creature you control attacks", "it" is the triggering creature, not the source.
    // Rewriting it to "this creature" would double the WATCHER's counters — confidently wrong. The self-scope
    // gate is what prevents that, and this is the assertion that holds the gate in place.
    expect(classifyCard({ name: "Non-self Compound", type: "Creature — Bear", mana: "{2}{G}", power: "2", toughness: "2",
      oracle: "Whenever another creature you control attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card." })).not.toMatch(/^native/);
  });

  it("⛔ the no-rider form is unchanged (the whole-clause rewrite still wins)", () => {
    expect(classifyCard({ name: "Plain Doubler", type: "Creature — Hydra", mana: "{3}{G}", power: "3", toughness: "3",
      oracle: "Whenever this creature attacks, double the number of +1/+1 counters on it." })).toBe("native-trigger");
  });
});
