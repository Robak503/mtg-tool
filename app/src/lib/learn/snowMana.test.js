/**
 * snowMana.test.js — BLITZ SN-1: the {S} snow-mana primitive (CR 107.4h / 106.3 / 205.4a).
 *
 * {S} is a snow mana pip payable with ONE mana from a snow source (a permanent whose type line
 * carries the "Snow" supertype). This suite pins the whole primitive:
 *   • isSnowPermanent — the snow-source detector (a Snow-Covered land IS snow; a plain land is NOT).
 *   • parseManaCost / parseAbilityCost — {S} is a modeled pip (cost.snow), no longer dropped to null.
 *   • manaSources — stamps snow:true on a snow permanent's mana source.
 *   • planPayment — pays {S} ONLY by tapping a snow source; REFUSES it otherwise (THE CREED: never
 *     fake-pay {S} from non-snow mana — the forbidden FP).
 *   • classifyCard — the honest flips (Frost Augur & co) and the whole-card-law parks.
 *   • integration — Frost Augur's "{S}, {T}" ability is offered iff a snow source is available, and
 *     paying it taps both the snow land and the source.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { isSnowPermanent, manaSources, planPayment, canAfford } from "./manaModel.js";
import { parseManaCost, legalActionsForPlayer } from "./legalChoices.js";
import { parseAbilityCost } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function lib(card) { return { id: card.id || `c-${card.name}`, ...card }; }
function bf(perms) { return { players: { user: { battlefield: perms } } }; }
function permanent(card, { id, tapped = false, summoningSick = false } = {}) {
  return { id: id || `perm-${card.name}`, card: lib(card), tapped, summoningSick };
}
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const SNOW_ISLAND = { name: "Snow-Covered Island", type: "Basic Snow Land — Island" };
const PLAIN_ISLAND = { name: "Island", type: "Basic Land — Island" };

// ─── the snow-source detector ────────────────────────────────────────────────

describe("isSnowPermanent — the snow-source detector (SN-1)", () => {
  it("a Snow-Covered basic IS snow", () => {
    expect(isSnowPermanent(SNOW_ISLAND)).toBe(true);
    expect(isSnowPermanent({ name: "Snow-Covered Forest", type: "Basic Snow Land — Forest" })).toBe(true);
  });
  it("a plain basic is NOT snow", () => {
    expect(isSnowPermanent(PLAIN_ISLAND)).toBe(false);
    expect(isSnowPermanent({ name: "Forest", type: "Basic Land — Forest" })).toBe(false);
  });
  it("the Snow supertype on ANY permanent type counts (artifact / creature / utility land)", () => {
    expect(isSnowPermanent({ name: "Icehide Golem", type: "Snow Artifact Creature — Golem" })).toBe(true);
    expect(isSnowPermanent({ name: "Frost Augur", type: "Snow Creature — Human Wizard" })).toBe(true);
    expect(isSnowPermanent({ name: "Scrying Sheets", type: "Snow Land" })).toBe(true);
  });
  it("reads the TYPE LINE only — 'snow' in a name or oracle never counts", () => {
    // A card whose reminder text mentions "a snow source" but is not itself snow.
    expect(isSnowPermanent({ name: "Boreal Druid", type: "Creature — Elf Druid", oracle: "{T}: Add {C}. (from a snow source)" })).toBe(false);
  });
});

// ─── the {S} pip is modeled, not dropped ─────────────────────────────────────

describe("parseManaCost — {S} → cost.snow (SN-1)", () => {
  it("{S} is a snow pip, not generic", () => {
    const c = parseManaCost("{S}");
    expect(c.snow).toBe(1);
    expect(c.generic).toBe(0);
  });
  it("{1}{S} → generic 1 + snow 1", () => {
    expect(parseManaCost("{1}{S}")).toMatchObject({ generic: 1, snow: 1 });
  });
  it("{S}{S} → snow 2", () => {
    expect(parseManaCost("{S}{S}").snow).toBe(2);
  });
});

describe("parseAbilityCost — {S} is a modeled cost item (SN-1)", () => {
  it("recognizes Frost Augur's '{S}, {T}' instead of returning null", () => {
    const cost = parseAbilityCost("{S}, {T}");
    expect(cost).not.toBeNull();
    expect(cost.manaPips).toBe("{S}");
    expect(cost.tapSelf).toBe(true);
    expect(parseManaCost(cost.manaPips).snow).toBe(1);
  });
  it("recognizes a mixed '{1}{S}' cost", () => {
    expect(parseAbilityCost("{1}{S}").manaPips).toBe("{1}{S}");
  });
  it("still drops a genuinely-unmodeled symbol ({Q}) to null", () => {
    expect(parseAbilityCost("{Q}")).toBeNull();
  });
});

// ─── manaSources stamps snow ──────────────────────────────────────────────────

describe("manaSources — snow stamp (SN-1)", () => {
  it("stamps snow:true on a Snow-Covered land, absent on a plain land", () => {
    const state = bf([
      permanent(SNOW_ISLAND, { id: "snow" }),
      permanent(PLAIN_ISLAND, { id: "plain" }),
    ]);
    const srcs = manaSources(state, "user");
    expect(srcs.find(s => s.permanentId === "snow")).toMatchObject({ colors: ["U"], snow: true });
    expect(srcs.find(s => s.permanentId === "plain").snow).toBeUndefined();
  });
});

// ─── planPayment: {S} paid ONLY from a snow source (THE CREED) ────────────────

describe("planPayment — {S} paid ONLY from a snow source (SN-1)", () => {
  const snowSrc = { permanentId: "snow", colors: ["U"], amount: 1, snow: true };
  const plainSrc = { permanentId: "plain", colors: ["U"], amount: 1 };

  it("pays {S} by tapping a snow source", () => {
    const plan = planPayment(EMPTY_POOL, [snowSrc], { snow: 1 });
    expect(plan).not.toBeNull();
    expect(plan.taps.map(t => t.permanentId)).toEqual(["snow"]);
  });
  it("REFUSES {S} when only non-snow sources exist — never fake-paid", () => {
    expect(planPayment(EMPTY_POOL, [plainSrc], { snow: 1 })).toBeNull();
    expect(canAfford(EMPTY_POOL, [plainSrc], { snow: 1 })).toBe(false);
  });
  it("REFUSES {S} from floating pool mana (the pool carries no snow provenance — a safe FN)", () => {
    expect(planPayment({ ...EMPTY_POOL, U: 5 }, [], { snow: 1 })).toBeNull();
  });
  it("{S}{U}: the snow source pays {S}, a plain source pays {U}", () => {
    const plan = planPayment(EMPTY_POOL, [snowSrc, plainSrc], { snow: 1, U: 1 });
    expect(plan).not.toBeNull();
    expect(new Set(plan.taps.map(t => t.permanentId))).toEqual(new Set(["snow", "plain"]));
  });
  it("{S}{U} with only ONE snow source is unpayable (1 mana, 2 pips)", () => {
    expect(planPayment(EMPTY_POOL, [snowSrc], { snow: 1, U: 1 })).toBeNull();
  });
  it("{S}{S} needs TWO snow sources", () => {
    expect(planPayment(EMPTY_POOL, [snowSrc], { snow: 2 })).toBeNull();
    const two = planPayment(EMPTY_POOL, [snowSrc, { permanentId: "snow2", colors: ["G"], amount: 1, snow: true }], { snow: 2 });
    expect(two).not.toBeNull();
    expect(new Set(two.taps.map(t => t.permanentId))).toEqual(new Set(["snow", "snow2"]));
  });
});

// ─── classifyCard: honest flips + whole-card-law parks ────────────────────────

function C(name, type, oracle) {
  return { name, type, oracle, power: 1, toughness: 1 };
}

describe("classifyCard — {S}-cost cards flip ONLY when the whole card is modeled (SN-1)", () => {
  it("Frost Augur → native-activated (the snow dig; {S} was the last blocker)", () => {
    expect(classifyCard(C("Frost Augur", "Snow Creature — Human Wizard",
      "{S}, {T}: Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)"))).toBe("native-activated");
  });
  it("Boreal Centaur → native-activated (once-per-turn self-pump)", () => {
    expect(classifyCard(C("Boreal Centaur", "Snow Creature — Centaur Warrior",
      "{S}: This creature gets +1/+1 until end of turn. Activate only once each turn. ({S} can be paid with one mana from a snow source.)"))).toBe("native-activated");
  });
  it("Rimebound Dead → native-activated (self-regenerate)", () => {
    expect(classifyCard(C("Rimebound Dead", "Snow Creature — Skeleton",
      "{S}: Regenerate this creature. ({S} can be paid with one mana from a snow source.)"))).toBe("native-activated");
  });

  // Whole-card-law parks — {S} recognition must NOT flip a card with other unmodeled text.
  it("Ohran Yeti stays body-only — the snow-restricted TARGET is honestly unmodeled (no FP)", () => {
    expect(classifyCard(C("Ohran Yeti", "Snow Creature — Yeti",
      "{2}{S}: Target snow creature gains first strike until end of turn. ({S} can be paid with one mana from a snow source.)"))).toBe("body-only");
  });
  it("Zombie Musher stays body-only — its {S} regen IS modeled, but 'Snow landwalk' residue parks it", () => {
    expect(classifyCard(C("Zombie Musher", "Snow Creature — Zombie",
      "Snow landwalk (This creature can't be blocked as long as defending player controls a snow land.)\n{S}: Regenerate this creature. ({S} can be paid with one mana from a snow source.)"))).toBe("body-only");
  });
  it("Berg Strider stays body-only — the 'if {S} was spent to cast' ETB condition is unmodeled", () => {
    expect(classifyCard(C("Berg Strider", "Snow Creature — Giant Wizard",
      "When this creature enters, tap target artifact or creature an opponent controls. If {S} was spent to cast this spell, that permanent doesn't untap during its controller's next untap step. ({S} is mana from a snow source.)"))).toBe("body-only");
  });
});

// ─── integration: the offer/refuse gate + payment (the CREED at runtime) ──────

const FROST_AUGUR_ORACLE =
  "{S}, {T}: Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)";

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
function augurAbilities(state) {
  return legalActionsForPlayer(state, "user").filter(a => a.kind === "activate-ability" && a.permanentId === "augur");
}
function augur() {
  return createPermanent({
    id: "augur",
    card: { id: "card-augur", name: "Frost Augur", type: "Snow Creature — Human Wizard", power: 1, toughness: 1, oracle: FROST_AUGUR_ORACLE },
    controller: "user", summoningSick: false,
  });
}

describe("integration — Frost Augur's '{S}, {T}' ability gated on a snow source (SN-1)", () => {
  it("OFFERS the ability when a Snow-Covered land can pay {S}", () => {
    const snow = createPermanent({ id: "snow", card: { name: "Snow-Covered Island", type: "Basic Snow Land — Island" }, controller: "user", summoningSick: false });
    const s = withBattlefield(mainState(), "user", [augur(), snow]);
    expect(augurAbilities(s)).toHaveLength(1);
  });
  it("does NOT offer it when only a NON-snow land is available — never fake-pays {S}", () => {
    const plain = createPermanent({ id: "plain", card: { name: "Island", type: "Basic Land — Island" }, controller: "user", summoningSick: false });
    const s = withBattlefield(mainState(), "user", [augur(), plain]);
    expect(augurAbilities(s)).toHaveLength(0);
  });
  it("paying the ability taps BOTH the snow land ({S}) and Frost Augur ({T}); it lands on the stack", () => {
    const snow = createPermanent({ id: "snow", card: { name: "Snow-Covered Island", type: "Basic Snow Land — Island" }, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [augur(), snow]);
    const act = augurAbilities(s)[0];
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    const byId = id => s.players.user.battlefield.find(p => p.id === id);
    expect(byId("augur").tapped).toBe(true);
    expect(byId("snow").tapped).toBe(true);
    expect(s.stack).toHaveLength(1);
  });
});
