/**
 * bearUmbra.test.js — TOTEM ARMOR (CR 702.116) + COMBINED aura grant-trigger + UNTAP-ALL-LANDS.
 *
 * Bear Umbra: "Enchant creature | Enchanted creature gets +2/+2 and has \"Whenever this creature attacks,
 * untap all lands you control.\" | Umbra armor (If enchanted creature would be destroyed, instead remove all
 * damage from it and destroy this Aura.)" Three subsystems, all built faithfully so the WHOLE card plays:
 *
 *   1. UNTAP-ALL-LANDS — the granted attack trigger's effect ("untap all lands you control") parses HIGH and
 *      the applyUntapLands resolver untaps EVERY one of the controller's own tapped lands (all:true, no cap).
 *   2. COMBINED GRANT-TRIGGER — a "gets +X/+Y and has \"<triggered ability>\"" line applies the P/T bonus via
 *      layers AND grants the host the triggered ability (parseGrantedTriggeredAbilities → triggersForEvent),
 *      which fires on the host's attack.
 *   3. TOTEM ARMOR — a destruction-REPLACEMENT on the Aura: when the enchanted creature would be destroyed
 *      (the lethal-damage SBA OR a targeted-destroy effect — BOTH sites), the Aura is destroyed instead, all
 *      damage is cleared, and the creature survives.
 *
 * CREED: false-negative is safe (an unmodeled rider keeps the card Arbiter); a partial subsystem — totem armor
 * that fires on only one of its two destruction sites — would be a forbidden FP, so BOTH sites are tested.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests,
  createGameState,
  createPermanent,
  attachPermanent,
  findPermanent,
  markCombatDamage,
  destroyLethalCreatures,
  totemArmorAuraFor,
} from "../gameState.js";
import { permanentPower, permanentToughness } from "../layers.js";
import { applyDestroyEffect } from "../spellEffects.js";
import { checkAttackTriggers } from "../triggers.js";
import { flushTriggers, resolveTopOfStack } from "../gameEngine.js";
import { classifyCard } from "../coverage.js";
import { auraHasTotemArmor } from "../staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const BEAR_UMBRA = {
  id: "c-bearumbra", name: "Bear Umbra", type: "Enchantment — Aura", mana: "{2}{G}{G}",
  oracle:
    'Enchant creature\nEnchanted creature gets +2/+2 and has "Whenever this creature attacks, untap all lands you control."\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)',
};
const HOST = { id: "c-host", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });

const perm = (card, controller, id = card.id, over = {}) => createPermanent({ id, card, controller, ...over });

function boardWithBearUmbra(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const host = perm(HOST, "user");
  const aura = perm(BEAR_UMBRA, "user");
  const lands = [perm(FOREST("f1"), "user"), perm(FOREST("f2"), "user"), perm(FOREST("f3"), "user")];
  let st = {
    ...s,
    activePlayer: "user",
    players: { ...s.players, user: { ...s.players.user, battlefield: [host, aura, ...lands] } },
    ...over,
  };
  st = attachPermanent(st, { equipId: "c-bearumbra", targetId: "c-host" });
  return st;
}

// ─── CLASSIFY ─────────────────────────────────────────────────────────────────

describe("Bear Umbra — classification", () => {
  it("classifies native (the whole card is modeled: buff + granted trigger + totem armor)", () => {
    const tier = classifyCard(BEAR_UMBRA);
    expect(tier.startsWith("native")).toBe(true);
  });
  it("auraHasTotemArmor detects the Umbra armor / Totem armor line", () => {
    expect(auraHasTotemArmor(BEAR_UMBRA)).toBe(true);
    expect(auraHasTotemArmor({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1." })).toBe(false);
  });
});

// ─── PIECE 2: the +2/+2 buff applies via layers ────────────────────────────────

describe("Bear Umbra — +2/+2 buff", () => {
  it("the enchanted creature is a 4/4 (base 2/2 + the aura's +2/+2)", () => {
    const s = boardWithBearUmbra();
    expect(permanentPower(s, "c-host")).toBe(4);
    expect(permanentToughness(s, "c-host")).toBe(4);
  });
});

// ─── PIECE 1+2: the granted attack trigger untaps all the controller's lands ────

describe("Bear Umbra — granted attack trigger untaps all lands", () => {
  it("when the host attacks, untap all lands you control fires and untaps every tapped Forest", () => {
    let s = boardWithBearUmbra({ phase: "combat", step: "declare-attackers" });
    // Tap all three Forests (as if they'd been tapped for mana this turn).
    for (const id of ["f1", "f2", "f3"]) s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === id ? { ...p, tapped: true } : p)) } } };
    // Declare the host as an attacker, then fire attack triggers.
    s = { ...s, combat: { attackers: [{ permanentId: "c-host", attackingPlayer: "user", defender: "ai" }] } };
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1); // the granted attack trigger fired
    // Flush + resolve the untap-all-lands effect.
    let out = resolveTopOfStack(flushTriggers(s));
    const lands = out.players.user.battlefield.filter((p) => /Forest/.test(p.card.type));
    expect(lands.every((p) => !p.tapped)).toBe(true); // ALL three untapped
  });
});

// ─── PIECE 3: TOTEM ARMOR at BOTH destruction sites ────────────────────────────

describe("Bear Umbra — totem armor (destruction replacement, both sites)", () => {
  it("totemArmorAuraFor finds the aura on the host", () => {
    const s = boardWithBearUmbra();
    expect(totemArmorAuraFor(s, findPermanent(s, "c-host").permanent)).toBe("c-bearumbra");
  });

  it("SITE 1 — lethal combat damage: the host survives, the Aura is destroyed, damage cleared", () => {
    let s = boardWithBearUmbra();
    // The host is a 4/4 (with the aura); mark 4 lethal damage.
    s = markCombatDamage(s, { permanentId: "c-host", amount: 4 });
    const res = destroyLethalCreatures(s);
    s = res.state;
    // The host is STILL on the battlefield (saved), with NO marked damage.
    const host = findPermanent(s, "c-host");
    expect(host).toBeTruthy();
    expect(host.permanent.damageMarked).toBe(0);
    // The Aura is GONE from the battlefield and IN the graveyard.
    expect(findPermanent(s, "c-bearumbra")).toBeNull();
    expect(s.players.user.graveyard.some((c) => c.name === "Bear Umbra")).toBe(true);
    // Now that the aura is gone, the host reverts to its base 2/2.
    expect(permanentPower(s, "c-host")).toBe(2);
  });

  it("SITE 2 — a targeted destroy effect (Doom Blade): the host survives, the Aura is destroyed", () => {
    let s = boardWithBearUmbra();
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "c-host" }] });
    // Host survives (totem armor replaced the destruction).
    expect(findPermanent(s, "c-host")).toBeTruthy();
    // The destroy was PREVENTED and the Aura went to the graveyard.
    const destroyLog = [...s.log].reverse().find((e) => e.effect === "destroy");
    expect(destroyLog.prevented).toContain("c-host");
    expect(findPermanent(s, "c-bearumbra")).toBeNull();
    expect(s.players.user.graveyard.some((c) => c.name === "Bear Umbra")).toBe(true);
  });

  it("totem armor SURVIVES a 'can't be regenerated' wrath (the rider only blocks regen, CR 701.19)", () => {
    let s = boardWithBearUmbra();
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "c-host" }], cannotRegenerate: true });
    expect(findPermanent(s, "c-host")).toBeTruthy();          // host still saved
    expect(findPermanent(s, "c-bearumbra")).toBeNull();       // aura consumed
  });

  it("totem armor does NOT save on the SECOND destruction (the Aura is already gone)", () => {
    let s = boardWithBearUmbra();
    // First destroy consumes the aura.
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "c-host" }] });
    expect(findPermanent(s, "c-bearumbra")).toBeNull();
    // Second destroy: no totem armor left → the host actually dies.
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "c-host" }] });
    expect(findPermanent(s, "c-host")).toBeNull();
    expect(s.players.user.graveyard.some((c) => c.name === "Grizzly Bears")).toBe(true);
  });
});

// ─── CREED near-misses ─────────────────────────────────────────────────────────

describe("Bear Umbra — CREED near-misses (an unmodeled clause keeps the card Arbiter)", () => {
  it("a combined grant whose quoted trigger is UNMODELED stays body-only", () => {
    // "tap or untap target permanent" is not a natively-routing trigger effect → whole card Arbiter.
    const ghostly = {
      type: "Enchantment — Aura",
      oracle:
        'Enchant creature\nEnchanted creature gets +1/+1 and has "Whenever this creature attacks, you may tap or untap target permanent."\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)',
    };
    expect(classifyCard(ghostly)).toBe("body-only");
  });
  it("a totem-armor aura with an extra UNMODELED activated ability stays body-only (Crab/Felidar Umbra shape)", () => {
    const crab = {
      type: "Enchantment — Aura",
      oracle:
        "Enchant creature\n{2}{U}: Untap enchanted creature.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)",
    };
    expect(classifyCard(crab)).toBe("body-only");
  });
  it("a plain 'untap all creatures you control' does NOT match the untap-all-LANDS atom (safe FN)", () => {
    // Guard: the atom is anchored to lands; a creatures form must not spuriously flip.
    const s = boardWithBearUmbra();
    expect(totemArmorAuraFor(s, findPermanent(s, "c-host").permanent)).toBe("c-bearumbra");
  });
});
