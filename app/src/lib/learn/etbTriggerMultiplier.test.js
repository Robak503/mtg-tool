/**
 * etbTriggerMultiplier.test.js — Panharmonicon #261 · Ancient Greenwarden #681 · Yarok #2530 ·
 * Starfield Vocalist #2082 (CR 603.x).
 *
 *   "If <filter> entering [the battlefield] causes a triggered ability of a permanent you control to
 *    trigger, that ability triggers an additional time."
 *
 * The third member of the multiplier family (after Teysa's dies and Isshin's attacks) and the first that
 * carries a FILTER on the entering object: Panharmonicon doubles for an artifact or creature,
 * Greenwarden only for a land, Yarok for anything. So the counter is closed over the entering card
 * instead of taking only a controller.
 *
 * ⚠️ TWO FIRE SITES, NOT ONE. A LANDFALL trigger is a triggered ability that triggered because a
 * permanent entered, so Greenwarden and Yarok double it exactly as they double an ETB. Wiring only
 * checkEnterTriggers would leave Ancient Greenwarden — a card whose entire purpose is doubling landfall —
 * classified native while doing nothing on the ability people play it for. Both sites are pinned.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { etbTriggerMultiplierCount } from "./layers.js";
import { checkEnterTriggers, checkLandfallTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PANHARMONICON = { id: "c-ph", name: "Panharmonicon", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };
const YAROK = { id: "c-yk", name: "Yarok, the Desecrated", type: "Legendary Creature — Elemental Nightmare", mana: "{2}{B}{G}{U}", power: 3, toughness: 5, keywords: ["Flying", "Deathtouch"],
  oracle: "Flying, deathtouch\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };
const GREENWARDEN = { id: "c-gw", name: "Ancient Greenwarden", type: "Creature — Elemental", mana: "{4}{G}{G}", power: 5, toughness: 7, keywords: ["Reach"],
  oracle: "Reach\nYou may play lands from your graveyard.\nIf a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };
const NABAN = { id: "c-nb", name: "Naban, Dean of Iteration", type: "Legendary Creature — Human Wizard", mana: "{1}{U}", power: 2, toughness: 1, keywords: [],
  oracle: "If a Wizard you control entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };

const ETB_WATCHER = { id: "c-ew", name: "Welcome Wagon", type: "Enchantment", keywords: [],
  oracle: "Whenever a creature you control enters, you gain 1 life." };
const LANDFALL_WATCHER = { id: "c-lw", name: "Life Ridge", type: "Enchantment", keywords: [],
  oracle: "Landfall — Whenever a land you control enters, you gain 1 life." };

const ENTERING = {
  bear: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  forest: { id: "c-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" },
};

function board(mine) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine.map((c, i) => createPermanent({ id: `m${i}`, card: c, controller: "user", summoningSick: false })) },
    },
  };
}
/** Enter `card` under the user and report how many triggers were enqueued. */
function entering(mine, card, { landfall = false } = {}) {
  const s = board(mine);
  const perm = createPermanent({ id: "in", card, controller: "user" });
  const withIt = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, perm] } } };
  const after = landfall ? checkLandfallTriggers(withIt, perm) : checkEnterTriggers(withIt, perm);
  return (after.pendingTriggers || []).length;
}

describe("recognition — the filter rides the op", () => {
  it("each carrier emits its own entering filter", () => {
    expect(parseStaticAbilities(PANHARMONICON)[0].op).toEqual({ layerOp: "etbTriggerMultiplier", entering: "artifact or creature" });
    expect(parseStaticAbilities(YAROK).find((d) => d.op?.layerOp === "etbTriggerMultiplier").op.entering).toBe("permanent");
    expect(parseStaticAbilities(GREENWARDEN).find((d) => d.op?.layerOp === "etbTriggerMultiplier").op.entering).toBe("land");
  });

  it("CREED — a CONTROLLER-qualified / subtype filter is NOT claimed (Naban's 'a Wizard you control')", () => {
    expect(parseStaticAbilities(NABAN).find((d) => d.op?.layerOp === "etbTriggerMultiplier")).toBeUndefined();
    expect(classifyCard(NABAN)).toBe("body-only");
  });

  it("the count is FILTERED, not just a board tally", () => {
    const s = board([PANHARMONICON, GREENWARDEN]);
    expect(etbTriggerMultiplierCount(s, "user", ENTERING.bear)).toBe(1);    // Panharmonicon only
    expect(etbTriggerMultiplierCount(s, "user", ENTERING.forest)).toBe(1);  // Greenwarden only
    expect(etbTriggerMultiplierCount(board([YAROK]), "user", ENTERING.forest)).toBe(1); // Yarok takes anything
  });
});

describe("RUNTIME — the ETB fire site", () => {
  it("without a multiplier the ETB watcher fires ONCE", () => {
    expect(entering([ETB_WATCHER], ENTERING.bear)).toBe(1);
  });

  it("THE LOAD-BEARING ONE — Panharmonicon doubles a creature entering", () => {
    expect(entering([ETB_WATCHER, PANHARMONICON], ENTERING.bear)).toBe(2);
  });

  it("THE FILTER BITES — Ancient Greenwarden does NOT double a creature entering", () => {
    // Greenwarden's filter is a LAND. Doubling every ETB would be a much stronger card than the printed
    // one, and the coverage tier reads native either way.
    expect(entering([ETB_WATCHER, GREENWARDEN], ENTERING.bear)).toBe(1);
  });

  it("Yarok doubles anything entering", () => {
    expect(entering([ETB_WATCHER, YAROK], ENTERING.bear)).toBe(2);
  });

  it("two multipliers that BOTH match → three fires (the Teysa ruling)", () => {
    expect(entering([ETB_WATCHER, PANHARMONICON, YAROK], ENTERING.bear)).toBe(3);
  });

  it("an OPPONENT's Panharmonicon doesn't double the user's trigger", () => {
    const s = board([ETB_WATCHER]);
    const opp = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [createPermanent({ id: "op", card: PANHARMONICON, controller: "ai" })] } } };
    const perm = createPermanent({ id: "in", card: ENTERING.bear, controller: "user" });
    const withIt = { ...opp, players: { ...opp.players, user: { ...opp.players.user, battlefield: [...opp.players.user.battlefield, perm] } } };
    expect((checkEnterTriggers(withIt, perm).pendingTriggers || []).length).toBe(1);
  });
});

describe("RUNTIME — the LANDFALL fire site, the half that is easy to forget", () => {
  it("Ancient Greenwarden doubles a LANDFALL trigger", () => {
    // The ability Greenwarden is actually played for. Wiring only checkEnterTriggers would leave this
    // card classified native while doing nothing on its whole reason to exist.
    expect(entering([LANDFALL_WATCHER, GREENWARDEN], ENTERING.forest, { landfall: true })).toBe(2);
  });

  it("Yarok doubles landfall too (a land IS a permanent)", () => {
    expect(entering([LANDFALL_WATCHER, YAROK], ENTERING.forest, { landfall: true })).toBe(2);
  });

  it("Panharmonicon does NOT — a land is neither artifact nor creature", () => {
    expect(entering([LANDFALL_WATCHER, PANHARMONICON], ENTERING.forest, { landfall: true })).toBe(1);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Panharmonicon #261, Ancient Greenwarden #681 and Yarok #2530 flip", () => {
    expect(classifyCard(PANHARMONICON)).toBe("native-static");
    expect(classifyCard(GREENWARDEN)).toMatch(/^native/);   // Reach + play-lands-from-graveyard + the multiplier
    expect(classifyCard(YAROK)).toMatch(/^native/);         // Flying, deathtouch + the multiplier
  });

  it("Elesh Norn stays PARKED — her second static HALVES opponents' triggers, which is unmodeled", () => {
    expect(classifyCard({ name: "Elesh Norn, Mother of Machines", type: "Legendary Creature — Phyrexian Praetor", mana: "{4}{W}", power: 4, toughness: 7, keywords: ["Vigilance"],
      oracle: "Vigilance\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nPermanents entering cause abilities of permanents your opponents control to trigger only once." }))
      .toBe("body-only");
  });
});
