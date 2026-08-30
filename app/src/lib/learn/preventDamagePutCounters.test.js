/**
 * preventDamagePutCounters.test.js — SHELF CAP9 (CR 615): the prevent-and-PUT-counters wall, the
 * INVERSE of the counter-shield (Phantom / Bloatfly) that spends counters to pay for itself.
 *
 * Two corpus-unique printed shapes, both enforced at the two damage funnels:
 *   ATTACHED  Panther Habit   — ALL damage to the equipped creature, "that many" counters.
 *   SELF      Ironscale Hydra — COMBAT damage from a CREATURE only, exactly ONE counter.
 *
 * ⛔ THE PAYOUT IS THE HALF THAT MAKES THE COVERAGE CREDIT HONEST. A wall credited without its counters
 * is an over-claim in the mirror image of the counter-shield's: there, prevention-without-payment yields
 * a creature that never pays; here, prevention-without-payout yields one that never grows, and the
 * counters ARE the card's whole upside. Every prevention assertion below is paired with a counter
 * assertion for that reason.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import {
  attachedPreventPutCountersOf,
  selfPreventPutCounters,
  attachedPreventPutCounters,
  counterShieldPrevention,
} from "./combatEvasion.js";
import { applyDamageEffect } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PANTHER_HABIT = {
  id: "ph", name: "Panther Habit", type: "Artifact — Equipment", mana: "{4}",
  oracle: "If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on it.\nEquip {2}",
};
const IRONSCALE_HYDRA = {
  id: "ih", name: "Ironscale Hydra", type: "Creature — Hydra", mana: "{3}{G}{G}", power: "5", toughness: "5",
  oracle: "If a creature would deal combat damage to this creature, prevent that damage and put a +1/+1 counter on this creature.",
};
// The counter-SHIELD family (the inverse mechanism) — must NOT read as prevent-and-put, and vice versa.
const PROTEAN_HYDRA = {
  id: "pth", name: "Protean Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: "0", toughness: "0",
  oracle: "This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage and remove that many +1/+1 counters from it.\nWhenever a +1/+1 counter is removed from this creature, put two +1/+1 counters on it at the beginning of the next end step.",
};
const PHANTOM_NANTUKO = {
  id: "pn", name: "Phantom Nantuko", type: "Creature — Insect Druid Spirit", mana: "{3}{G}", power: "0", toughness: "0",
  oracle: "This creature enters with two +1/+1 counters on it.\nIf damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature.\n{T}: Put a +1/+1 counter on this creature.",
};
// Same "prevent … and put that many" payload, but each carries a rider the engine does not model —
// they MUST stay parked, or the reader has been widened past what the runtime enforces.
const ANTI_VENOM = {
  id: "av", name: "Anti-Venom, Horrifying Healer", type: "Legendary Creature — Symbiote Hero", mana: "{2}{W}{B}", power: "3", toughness: "3",
  oracle: "When Anti-Venom enters, if he was cast, return target creature card from your graveyard to the battlefield.\nIf damage would be dealt to Anti-Venom, prevent that damage and put that many +1/+1 counters on him.",
};
const JARED_CARTHALION = {
  id: "jc", name: "Jared Carthalion, True Heir", type: "Legendary Creature — Human Warrior", mana: "{R}{G}{W}", power: "3", toughness: "3",
  oracle: "When Jared Carthalion enters, target opponent becomes the monarch. You can't become the monarch this turn.\nIf damage would be dealt to Jared Carthalion while you're the monarch, prevent that damage and put that many +1/+1 counters on it.",
};

const counters = (perm) => (perm?.counters?.["+1/+1"]) || 0;
const find = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);

describe("readers — the two shapes read, and the counter-SHIELD family never collides", () => {
  it("Panther Habit is the attached shape; Ironscale Hydra is the self shape", () => {
    expect(attachedPreventPutCountersOf(PANTHER_HABIT)).toBe("put-that-many");
    expect(selfPreventPutCounters(IRONSCALE_HYDRA)).toBe("combat-put-one");
  });

  it("the two readers do NOT cross: an attached wall is not a self wall, and vice versa", () => {
    expect(selfPreventPutCounters(PANTHER_HABIT)).toBe(null);
    expect(attachedPreventPutCountersOf(IRONSCALE_HYDRA)).toBe(null);
  });

  it("the counter-SHIELD carriers (remove) never read as prevent-and-PUT — the families stay disjoint", () => {
    expect(attachedPreventPutCountersOf(PROTEAN_HYDRA)).toBe(null);
    expect(selfPreventPutCounters(PROTEAN_HYDRA)).toBe(null);
    expect(selfPreventPutCounters(PHANTOM_NANTUKO)).toBe(null);
    // …and the shield reader is unmoved by the new carriers (no regression on the sibling).
    expect(counterShieldPrevention(IRONSCALE_HYDRA)).toBe(null);
    expect(counterShieldPrevention(PHANTOM_NANTUKO)).toBe("phantom");
  });
});

describe("coverage — the two carriers flip, and the ridered siblings stay parked", () => {
  it("Panther Habit → native-equipment, Ironscale Hydra → native-static", () => {
    expect(classifyCard(PANTHER_HABIT)).toBe("native-equipment");
    expect(classifyCard(IRONSCALE_HYDRA)).toBe("native-static");
  });

  it("FP GUARD — same payload plus an unmodeled rider stays body-only (whole-card CREED)", () => {
    // Anti-Venom's cast-conditional reanimation ETB and Jared's monarch condition + monarch-granting ETB
    // are NOT modeled by this slice. Crediting either would claim a card the engine half-plays.
    expect(classifyCard(ANTI_VENOM)).toBe("body-only");
    expect(classifyCard(JARED_CARTHALION)).toBe("body-only");
    // The counter-SHIELD carriers are likewise untouched by this slice.
    expect(classifyCard(PROTEAN_HYDRA)).toBe("body-only");
  });
});

// ─── Runtime ────────────────────────────────────────────────────────────────────────────────────────

/** A user-controlled 4/4 wearing `equipCard` (both attachment links wired), facing `attackers` from ai1. */
function equippedBoard(equipCard, attackerSpecs = [{ id: "atk", power: "3" }], hostToughness = "4") {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const host = createPermanent({
    id: "host",
    card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "4", toughness: hostToughness, oracle: "" },
    controller: "user", summoningSick: false,
  });
  const equip = createPermanent({ id: "equip", card: equipCard, controller: "user", summoningSick: false });
  // BOTH links — the host's `attachments` list is what attachedPreventPutCounters reads; wiring only
  // `attachedTo` produces a silently inert fixture (the B7 mis-wired-harness trap).
  equip.attachedTo = "host";
  host.attachments = ["equip"];
  const attackers = attackerSpecs.map((a) => createPermanent({
    id: a.id,
    card: { id: `c${a.id}`, name: `Raider ${a.id}`, type: a.type || "Creature — Human", power: a.power, toughness: "3", oracle: "" },
    controller: "ai1", summoningSick: false,
  }));
  return {
    ...s, turn: 5,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [host, equip] },
      ai1: { ...s.players.ai1, battlefield: attackers },
    },
  };
}

/** A user-controlled Ironscale Hydra facing `attackers` from ai1. */
function hydraBoard(attackerSpecs = [{ id: "atk", power: "3" }]) {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const hydra = createPermanent({ id: "hydra", card: IRONSCALE_HYDRA, controller: "user", summoningSick: false });
  const attackers = attackerSpecs.map((a) => createPermanent({
    id: a.id,
    card: { id: `c${a.id}`, name: `Raider ${a.id}`, type: a.type || "Creature — Human", power: a.power, toughness: "3", oracle: "" },
    controller: "ai1", summoningSick: false,
  }));
  return {
    ...s, turn: 5,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [hydra] },
      ai1: { ...s.players.ai1, battlefield: attackers },
    },
  };
}

const blockWith = (s, blockerId, attackerIds) => ({
  ...s,
  combat: {
    attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "ai1", defender: "user" })),
    blockers: attackerIds.map((id) => ({ blockerId, attackerId: id })),
  },
});

describe("Panther Habit — the ATTACHED wall (all damage, that many counters)", () => {
  it("combat: the wearer takes NO damage and grows by exactly the prevented amount", () => {
    const s = equippedBoard(PANTHER_HABIT, [{ id: "atk", power: "3" }]);
    const out = resolveCombatDamage(blockWith(s, "host", ["atk"]));
    const host = find(out, "user", "host");
    expect(host.damageMarked || 0).toBe(0);   // prevented
    expect(counters(host)).toBe(3);           // …and PAID OUT, "that many"
  });

  it("noncombat: a Bolt is prevented too (ALL damage) and pays the same way", () => {
    const s = equippedBoard(PANTHER_HABIT);
    const out = applyDamageEffect(s, { controller: "ai1", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "host" }], source: null });
    const host = find(out, "user", "host");
    expect(host.damageMarked || 0).toBe(0);
    expect(counters(host)).toBe(2);
  });

  it("TWO hits in one step each pay — the wall has no budget to exhaust (contrast the counter-shield)", () => {
    // The shield needs a per-step budget because it SPENDS a finite pool; this pays OUT, so blocking two
    // attackers must earn the SUM. A mis-copied budget here would cap the second hit at zero.
    // The host is given a large toughness on purpose: with a small one, CR 510.1a's per-blocker lethal
    // cap (`give = min(remaining, lethalNeed)`) shrinks what each attacker ASSIGNS, and this test would
    // then be measuring that cap rather than the absence of a budget. See the pairing test below.
    const s = equippedBoard(PANTHER_HABIT, [{ id: "atk", power: "3" }, { id: "atk2", power: "5" }], "40");
    const out = resolveCombatDamage(blockWith(s, "host", ["atk", "atk2"]));
    const host = find(out, "user", "host");
    expect(host.damageMarked || 0).toBe(0);
    expect(counters(host)).toBe(8);
  });

  it("'that many' tracks what the engine would ACTUALLY have dealt, not the attacker's raw power", () => {
    // A 4-toughness host absorbs only its lethal need from each attacker (CR 510.1a), so 3+5 power
    // assigns 3+4 = 7. The wall pays 7, matching the damage it prevented — the two numbers are read
    // from the same value, so they cannot drift apart.
    //
    // ⚠️ BANKED FINDING (out of scope here, do NOT "fix" it in this slice): that per-blocker cap is
    // applied even when a NON-TRAMPLER has a single blocker, where CR 510.1a requires it to assign ALL
    // its damage to that one blocker. Measured: a 7/7 lifelinker blocked by one 4/4 gains 4 life, not 7.
    // Invisible for lethality, but visible to lifelink, damage-dealt triggers, and now this wall.
    const s = equippedBoard(PANTHER_HABIT, [{ id: "atk", power: "3" }, { id: "atk2", power: "5" }], "4");
    const out = resolveCombatDamage(blockWith(s, "host", ["atk", "atk2"]));
    const host = find(out, "user", "host");
    expect(host.damageMarked || 0).toBe(0);
    expect(counters(host)).toBe(7);
  });

  it("the wall is synthesized-on-read: unequip and the damage lands with no counters", () => {
    const s = equippedBoard(PANTHER_HABIT);
    const bare = {
      ...s,
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: s.players.user.battlefield.map((p) => (p.id === "host" ? { ...p, attachments: [] } : p)),
        },
      },
    };
    expect(attachedPreventPutCounters(bare, "host")).toBe(null);
    const out = resolveCombatDamage(blockWith(bare, "host", ["atk"]));
    const host = find(out, "user", "host");
    expect(host.damageMarked).toBe(3);        // takes it now
    expect(counters(host)).toBe(0);
  });
});

describe("Ironscale Hydra — the SELF wall (combat only, from a creature, exactly one counter)", () => {
  it("combat: prevented, and grows by ONE — never 'that many'", () => {
    const s = hydraBoard([{ id: "atk", power: "6" }]);
    const out = resolveCombatDamage(blockWith(s, "hydra", ["atk"]));
    const hydra = find(out, "user", "hydra");
    expect(hydra.damageMarked || 0).toBe(0);
    expect(counters(hydra)).toBe(1);          // ONE, not 6
  });

  it("FP GUARD — a Bolt LANDS: the printed scope is COMBAT damage, and nothing is earned", () => {
    const s = hydraBoard();
    const out = applyDamageEffect(s, { controller: "ai1", amount: 4, targetType: "creature", targets: [{ type: "creature", id: "hydra" }], source: null });
    const hydra = find(out, "user", "hydra");
    expect(hydra.damageMarked).toBe(4);       // the wall does NOT bind here
    expect(counters(hydra)).toBe(0);
  });

  it("two blockers, two prevented hits, two counters — one per damage event", () => {
    const s = hydraBoard([{ id: "atk", power: "3" }, { id: "atk2", power: "4" }]);
    const out = resolveCombatDamage(blockWith(s, "hydra", ["atk", "atk2"]));
    const hydra = find(out, "user", "hydra");
    expect(hydra.damageMarked || 0).toBe(0);
    expect(counters(hydra)).toBe(2);
  });
});

describe("negative control — a board with neither wall is untouched", () => {
  it("an ordinary Equipment prevents nothing and pays nothing", () => {
    const PLAIN = { id: "pl", name: "Plain Blade", type: "Artifact — Equipment", mana: "{1}",
      oracle: "Equipped creature gets +1/+1.\nEquip {2}" };
    const s = equippedBoard(PLAIN);
    expect(attachedPreventPutCounters(s, "host")).toBe(null);
    const out = resolveCombatDamage(blockWith(s, "host", ["atk"]));
    const host = find(out, "user", "host");
    expect(host.damageMarked).toBe(3);
    expect(counters(host)).toBe(0);
  });
});
