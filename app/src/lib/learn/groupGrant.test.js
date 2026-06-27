/**
 * groupGrant.test.js — WAVE 4 GROUP-EVASION / KEYWORD-GRANT (brief slice #17).
 *
 * Two CREED-clean pieces:
 *  (A) SUBTYPE-WITHOUT-"creatures" selector — "<Subtype> you control (get|have) …" (no "creatures" word,
 *      no leading determiner): Thrumming Hivepool "Slivers you control have double strike and haste",
 *      Call the Spirit Dragons "Dragons you control have indestructible". All-or-nothing on a non-grantable
 *      keyword; FP-guarded against board-state / type / quality subjects.
 *  (B) GRANTED QUOTED MANA ability — "<selector> have \"{T}: Add …\"" mints a fully-modeled mana ability
 *      onto every matching permanent (Gemhide/Manaweft Sliver, Enduring Vitality). The grant PROPAGATES to
 *      sibling permanents (the runtime gap), is DEDUPED against the granter's own quoted-text source (no
 *      double-tap), is summoning-sickness gated, and a quoted ability that ISN'T a fully-modeled mana
 *      ability (regenerate, a trigger, X-scaling, a spending restriction, a cost rider) stays non-native.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword, grantedManaSpecsFor } from "./layers.js";
import { manaSources } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function perm(name, id, controller, { type = "Creature — Sliver", oracle = "", summoningSick = false } = {}) {
  return createPermanent({ id, card: { name, type, power: 1, toughness: 1, oracle }, controller, summoningSick });
}
function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}

// ─── (A) subtype-without-"creatures" selector ───────────────────────────────────

describe("GROUP-GRANT (A) — subtype-without-\"creatures\" selector", () => {
  it("Thrumming Hivepool: 'Slivers you control have double strike and haste' grants both", () => {
    const d = parseStaticAbilities({ name: "Thrumming Hivepool", type: "Artifact", oracle: "Slivers you control have double strike and haste." });
    expect(d.map((x) => x.op.keyword).sort()).toEqual(["Double strike", "Haste"]);
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], subtypes: ["Sliver"] });
  });

  it("Call the Spirit Dragons: 'Dragons you control have indestructible' grants it (subtype, no 'creatures')", () => {
    const d = parseStaticAbilities({ name: "Call the Spirit Dragons", type: "Enchantment", oracle: "Dragons you control have indestructible." });
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "indestructible" });
    expect(d[0].affects.selector.subtypes).toEqual(["Dragon"]);
  });

  it("irregular plurals canonicalize (Elves→Elf, Allies→Ally, Wolves→Wolf)", () => {
    expect(parseStaticAbilities({ name: "x", oracle: "Elves you control have haste." })[0].affects.selector.subtypes).toEqual(["Elf"]);
    expect(parseStaticAbilities({ name: "x", oracle: "Allies you control have lifelink." })[0].affects.selector.subtypes).toEqual(["Ally"]);
    expect(parseStaticAbilities({ name: "x", oracle: "Wolves you control have trample." })[0].affects.selector.subtypes).toEqual(["Wolf"]);
  });

  it("FP guard: a board-STATE / quality / type subject is NOT a subtype grant (selects nobody → must drop)", () => {
    // singular-form exclusion words also catch their bare plural
    expect(parseStaticAbilities({ name: "x", oracle: "Tokens you control have haste." })).toEqual([]);
    expect(parseStaticAbilities({ name: "x", oracle: "Legendaries you control have flying." })).toEqual([]);
    expect(parseStaticAbilities({ name: "x", oracle: "Nonland permanents you control have indestructible." })).toEqual([]);
    // PERMANENT-type words route to the non-creature grant (or drop), never a zero-selecting creature-subtype grant
    expect(parseStaticAbilities({ name: "x", oracle: "Planeswalkers you control have flying." })).toEqual([]);
  });

  it("FP guard: a NON-CREATURE SUBTYPE subject (Vehicle/Food/Treasure/Equipment/Clue) drops — selects no creature", () => {
    // A Creature-restricted grant on a non-creature subtype reaches ZERO permanents (crew unmodeled; Food/
    // Treasure/Clue/Equipment are never creatures), so claiming native would be a CREED FP (Aeronaut Admiral).
    for (const sub of ["Vehicles", "Foods", "Treasures", "Equipment", "Clues"]) {
      expect(parseStaticAbilities({ name: "x", oracle: `${sub} you control have flying.` }), sub).toEqual([]);
    }
    // Whole-card: Aeronaut Admiral ("Flying / Vehicles you control have flying.") stays body-only, NOT native-static.
    expect(classifyCard({ type: "Creature — Human Pilot", name: "Aeronaut Admiral", oracle: "Flying\nVehicles you control have flying." })).toBe("body-only");
  });

  it("all-or-nothing: a non-grantable keyword drops the WHOLE subtype clause (CREED)", () => {
    expect(parseStaticAbilities({ name: "x", oracle: "Dragons you control have ward {1}." })).toEqual([]);
    expect(parseStaticAbilities({ name: "x", oracle: "Wraiths you control have protection from Ring-bearers." })).toEqual([]);
    expect(parseStaticAbilities({ name: "x", oracle: "Snakes you control have daunt, deathtouch, and poisonous 2." })).toEqual([]);
  });

  it("static-only guard: an 'until end of turn' combat-trick grant is NOT a static (ignored)", () => {
    expect(parseStaticAbilities({ name: "x", oracle: "Dinosaurs you control gain trample until end of turn." })).toEqual([]);
  });

  it("runtime: Thrumming Hivepool grants double strike + haste to a SIBLING Sliver, not a non-Sliver", () => {
    const hive = perm("Thrumming Hivepool", "hive", "user", { type: "Artifact", oracle: "Slivers you control have double strike and haste." });
    const sliver = perm("Muscle Sliver", "sliv", "user", { type: "Creature — Sliver" });
    const bear = perm("Grizzly Bears", "bear", "user", { type: "Creature — Bear" });
    const s = stateWith([hive, sliver, bear]);
    expect(permanentHasKeyword(s, "sliv", "Double strike")).toBe(true);
    expect(permanentHasKeyword(s, "sliv", "Haste")).toBe(true);
    expect(permanentHasKeyword(s, "bear", "Double strike")).toBe(false);
  });

  it("the determiner form ('Other Dragons you control have flying') still excludeSelf — unchanged", () => {
    const d = parseStaticAbilities({ name: "x", oracle: "Other Dragons you control have flying." });
    expect(d[0].affects.selector).toMatchObject({ subtypes: ["Dragon"], excludeSelf: true });
  });
});

// ─── (B) granted quoted MANA ability ─────────────────────────────────────────────

describe("GROUP-GRANT (B) — granted quoted MANA ability (parse + CREED gate)", () => {
  it("Gemhide / Manaweft / Enduring Vitality emit a fully-modeled mana grant", () => {
    for (const [name, oracle] of [
      ["Gemhide Sliver", 'All Slivers have "{T}: Add one mana of any color."'],
      ["Manaweft Sliver", 'Sliver creatures you control have "{T}: Add one mana of any color."'],
      ["Enduring Vitality", 'Creatures you control have "{T}: Add one mana of any color."'],
    ]) {
      const d = parseStaticAbilities({ name, oracle }).filter((x) => x.op.layerOp === "addAbility");
      expect(d, name).toHaveLength(1);
      expect(d[0].op.grant).toEqual({ kind: "mana", spec: { colors: ["W", "U", "B", "R", "G"], amount: 1 } });
    }
  });

  it("fixed pips + N-of-any-one-color parse to the exact spec", () => {
    expect(parseStaticAbilities({ name: "Tyvar Kell", oracle: 'Elves you control have "{T}: Add {B}."' })[0].op.grant.spec)
      .toEqual({ colors: ["B"], amount: 1 });
    expect(parseStaticAbilities({ name: "Sachi", oracle: 'Shamans you control have "{T}: Add {G}{G}."' })[0].op.grant.spec)
      .toEqual({ colors: ["G"], amount: 2 });
  });

  it("CREED: a quoted ability that is NOT a fully-modeled mana ability does NOT emit a grant", () => {
    // regenerate (activated, non-mana), a triggered ability, and an X-scaling ability all stay non-native
    expect(parseStaticAbilities({ name: "Crypt Sliver", oracle: 'All Slivers have "{T}: Regenerate target Sliver."' })).toEqual([]);
    expect(parseStaticAbilities({ name: "Tempered Sliver", oracle: 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."' })).toEqual([]);
    expect(parseStaticAbilities({ name: "Magma Sliver", oracle: 'All Slivers have "{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the number of Slivers on the battlefield."' })).toEqual([]);
  });

  it("CREED: a spending RESTRICTION or a non-{T} cost rider is rejected (would grant free/unrestricted mana)", () => {
    // spending restriction (Battery Bearer / Clement / Charitable Drafter)
    expect(parseStaticAbilities({ name: "Battery Bearer", oracle: 'Creatures you control have "{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell."' })).toEqual([]);
    expect(parseStaticAbilities({ name: "Clement", oracle: 'Frogs you control have "{T}: Add {G} or {U}. Spend this mana only to cast a creature spell."' })).toEqual([]);
    // cost rider (Forgotten Monument's "{T}, Pay 1 life")
    expect(parseStaticAbilities({ name: "Forgotten Monument", oracle: 'Other Caves you control have "{T}, Pay 1 life: Add one mana of any color."' })).toEqual([]);
  });

  it("classification: Gemhide/Manaweft stay native-mana; a non-mana grant stays body-only", () => {
    expect(classifyCard({ type: "Creature — Sliver", name: "Gemhide Sliver", oracle: 'All Slivers have "{T}: Add one mana of any color."' })).toBe("native-mana");
    expect(classifyCard({ type: "Creature — Sliver", name: "Manaweft Sliver", oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' })).toBe("native-mana");
    expect(classifyCard({ type: "Creature — Sliver", name: "Crypt Sliver", oracle: 'All Slivers have "{T}: Regenerate target Sliver."' })).toBe("body-only");
    // STATIC-HEXPROOF-SHROUD: "All Slivers have shroud" is now native-static (shroud admitted to the grant set).
    expect(classifyCard({ type: "Creature — Sliver", name: "Crystalline Sliver", oracle: "All Slivers have shroud." })).toBe("native-static");
  });
});

describe("GROUP-GRANT (B) — granted MANA ability at runtime (propagation + dedup + sickness)", () => {
  it("layers.grantedManaSpecsFor: a sibling Sliver gains the spec; the granter & a non-Sliver do not", () => {
    const manaweft = perm("Manaweft Sliver", "mw", "user", { oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' });
    const sliver = perm("Muscle Sliver", "sliv", "user");
    const bear = perm("Grizzly Bears", "bear", "user", { type: "Creature — Bear" });
    const s = stateWith([manaweft, sliver, bear]);
    expect(grantedManaSpecsFor(s, "sliv")).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 1 }]);
    expect(grantedManaSpecsFor(s, "bear")).toEqual([]);
  });

  it("manaSources: a sibling Sliver becomes a mana source; the granter is NOT double-counted", () => {
    const manaweft = perm("Manaweft Sliver", "mw", "user", { oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' });
    const sliver = perm("Muscle Sliver", "sliv", "user");
    const s = stateWith([manaweft, sliver]);
    const src = manaSources(s, "user");
    const counts = {};
    for (const x of src) counts[x.permanentId] = (counts[x.permanentId] || 0) + 1;
    expect(counts.mw).toBe(1);   // own quoted-text source only — never doubled by its own "Sliver creatures you control" grant
    expect(counts.sliv).toBe(1); // granted source
    expect(src.find((x) => x.permanentId === "sliv").colors).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("'All Slivers' is symmetric: an OPPONENT's Sliver gains the granted mana too (CR — 'All Slivers')", () => {
    const gemhide = perm("Gemhide Sliver", "gem", "user", { oracle: 'All Slivers have "{T}: Add one mana of any color."' });
    const oppSliver = perm("Muscle Sliver", "opp", "ai");
    const s = stateWith([gemhide], [oppSliver]);
    expect(grantedManaSpecsFor(s, "opp")).toEqual([{ colors: ["W", "U", "B", "R", "G"], amount: 1 }]);
    // ...but "creatures YOU control" (Manaweft/Enduring Vitality) does NOT reach an opponent
    const manaweft = perm("Manaweft Sliver", "mw", "user", { oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' });
    const s2 = stateWith([manaweft], [perm("Muscle Sliver", "opp2", "ai")]);
    expect(grantedManaSpecsFor(s2, "opp2")).toEqual([]);
  });

  it("summoning sickness gates the granted {T} mana ability (a fresh Sliver can't tap it)", () => {
    const manaweft = perm("Manaweft Sliver", "mw", "user", { oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' });
    const fresh = perm("Muscle Sliver", "fresh", "user", { summoningSick: true });
    const s = stateWith([manaweft, fresh]);
    expect(manaSources(s, "user").some((x) => x.permanentId === "fresh")).toBe(false);
    // legalChoices also gates it — no tap-for-mana action for the sick recipient
    const tap = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "fresh");
    expect(tap).toHaveLength(0);
  });

  it("legalChoices offers a tap-for-mana action for the un-sick recipient (all five colors)", () => {
    const manaweft = perm("Manaweft Sliver", "mw", "user", { oracle: 'Sliver creatures you control have "{T}: Add one mana of any color."' });
    const sliver = perm("Muscle Sliver", "sliv", "user");
    const s = stateWith([manaweft, sliver]);
    const taps = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "sliv");
    expect(taps.map((t) => t.color).sort()).toEqual(["B", "G", "R", "U", "W"]);
  });
});
