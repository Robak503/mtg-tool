/**
 * sourceTriggerMultiplier.test.js — the FIFTH multiplier axis (CR 603.x):
 * Katara, the Fearless · Harmonic Prodigy · Cloud, Midgar Mercenary · Annie Joins Up.
 *
 *   "If a triggered ability of <SUBJECT> triggers, that ability triggers an additional time."
 *
 * ⭐ WHY THIS FAMILY IS ENFORCED SOMEWHERE ELSE THAN THE OTHER FOUR. Teysa (dies), Isshin (attacks),
 * Panharmonicon (enters) and Veyran (cast) are scoped by WHAT CAUSED the trigger, so each is applied at
 * that cause's own enqueue site and cannot reach another event. This family is scoped by WHOSE ABILITY
 * IT IS, which says nothing about the cause — so it must see every trigger from every event. There is no
 * shared enqueue site (each check*Triggers appends to pendingTriggers itself, ~30 places), so it is
 * applied at the universal flush chokepoint, gameEngine.flushTriggers, where the once-per-turn trigger
 * latch already lives for the same reason. These tests therefore assert on what reaches the STACK, not
 * on pendingTriggers — the sibling axes' tests count the latter because that is where they act.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { sourceTriggerMultiplierCount } from "./layers.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KATARA = { id: "c-kt", name: "Katara, the Fearless", type: "Legendary Creature — Human Warrior Ally", mana: "{2}{W}", power: 3, toughness: 3, keywords: [],
  oracle: "If a triggered ability of an Ally you control triggers, that ability triggers an additional time." };
const HARMONIC_PRODIGY = { id: "c-hp", name: "Harmonic Prodigy", type: "Creature — Human Wizard", mana: "{1}{R}", power: 1, toughness: 2, keywords: ["Prowess"],
  oracle: "Prowess\nIf a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time." };
const CLOUD = { id: "c-cl", name: "Cloud, Midgar Mercenary", type: "Legendary Creature — Human Soldier Mercenary", mana: "{W}{W}", power: 2, toughness: 2, keywords: [],
  oracle: "When Cloud enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\nAs long as Cloud is equipped, if a triggered ability of Cloud or an Equipment attached to it triggers, that ability triggers an additional time." };
const ANNIE = { id: "c-an", name: "Annie Joins Up", type: "Legendary Enchantment", mana: "{2}{R}{W}", keywords: [],
  oracle: "When Annie Joins Up enters, it deals 5 damage to target creature or planeswalker an opponent controls.\nIf a triggered ability of a legendary creature you control triggers, that ability triggers an additional time." };
// UNCLAIMED on purpose — each names something this filter set cannot faithfully decide.
const DELNEY = { id: "c-dl", name: "Delney, Streetwise Lookout", type: "Legendary Creature — Human Scout", mana: "{2}{W}", power: 2, toughness: 3, keywords: [],
  oracle: "Creatures you control with power 2 or less can't be blocked by creatures with power 3 or greater.\nIf a triggered ability of a creature you control with power 2 or less triggers, that ability triggers an additional time." };
const ECHOES = { id: "c-ee", name: "Echoes of Eternity", type: "Kindred Enchantment — Eldrazi", mana: "{5}{C}", keywords: [],
  oracle: "If a triggered ability of a colorless spell you control or another colorless permanent you control triggers, that ability triggers an additional time.\nWhenever you cast a colorless spell, copy it. You may choose new targets for the copy." };
// The ENTERS axis's controller-qualified filter — must stay unclaimed by BOTH axes (its clause is
// "…a Wizard you control ENTERING causes…", a different sentence shape from this family's).
const NABAN = { id: "c-nb", name: "Naban, Dean of Iteration", type: "Legendary Creature — Human Wizard", mana: "{1}{U}", power: 2, toughness: 1, keywords: [],
  oracle: "If a Wizard you control entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };

// Trigger-carrying bodies. Each prints one plain ETB so the trigger's SOURCE is the entering permanent.
const etbBody = "When this creature enters, you gain 1 life.";
const ALLY_SCOUT = { id: "c-as", name: "Ally Scout", type: "Creature — Human Soldier Ally", power: 2, toughness: 2, oracle: etbBody };
const PLAIN_BEAR = { id: "c-pb", name: "Plain Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: etbBody };
const OTHER_WIZARD = { id: "c-ow", name: "Other Wizard", type: "Creature — Human Wizard", power: 1, toughness: 1, oracle: etbBody };
const A_SHAMAN = { id: "c-sh", name: "A Shaman", type: "Creature — Human Shaman", power: 1, toughness: 1, oracle: etbBody };
const LEGEND_BEAR = { id: "c-lb", name: "Legend Bear", type: "Legendary Creature — Bear", power: 2, toughness: 2, oracle: etbBody };
const TRIGGER_EQUIP = { id: "c-te", name: "Trigger Blade", type: "Artifact — Equipment", oracle: "Whenever equipped creature attacks, you gain 1 life.\nEquip {2}" };
const PLAIN_EQUIP = { id: "c-pe", name: "Plain Blade", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nEquip {2}" };

describe("recognition — the axis reads, and the unmodeled subjects stay parked", () => {
  const opOf = (card) => parseStaticAbilities(card).find((d) => d.op?.layerOp === "sourceTriggerMultiplier")?.op;

  it("the four carriers each emit their own subject filter", () => {
    expect(opOf(KATARA).sourceFilter).toEqual({ kind: "typedUnion", terms: [{ subtype: "ally" }] });
    expect(opOf(HARMONIC_PRODIGY).sourceFilter).toEqual({
      kind: "typedUnion", terms: [{ subtype: "shaman" }, { subtype: "wizard", excludeSelf: true }],
    });
    expect(opOf(ANNIE).sourceFilter).toEqual({ kind: "typedUnion", terms: [{ supertype: "legendary", cardType: "creature" }] });
    expect(opOf(CLOUD).sourceFilter).toEqual({ kind: "selfOrAttachedEquipment", requiresEquipped: true });
  });

  it("all four classify native", () => {
    expect(classifyCard(KATARA)).toBe("native-static");
    expect(classifyCard(HARMONIC_PRODIGY)).toBe("native-static");
    expect(classifyCard(CLOUD)).toBe("native-mixed");
    expect(classifyCard(ANNIE)).toBe("native-mixed");
  });

  it("CREED — a power predicate and a spell-inclusive scope are NOT claimed", () => {
    // Delney's "with power 2 or less" is a layer-aware predicate this filter set does not carry; Echoes'
    // subject includes SPELLS, which are not permanents and have no entry in the battlefield walk.
    expect(opOf(DELNEY)).toBeUndefined();
    expect(opOf(ECHOES)).toBeUndefined();
    expect(classifyCard(DELNEY)).toBe("body-only");
    expect(classifyCard(ECHOES)).toBe("body-only");
  });

  it("the ENTERS axis's controller-qualified filter is untouched (Naban stays parked, no cross-claim)", () => {
    expect(opOf(NABAN)).toBeUndefined();
    expect(classifyCard(NABAN)).toBe("body-only");
  });
});

// ─── Runtime ────────────────────────────────────────────────────────────────────────────────────────

/** A board of `mine` under the user (and optional `theirs` under ai1), main phase. */
function board(mine, theirs = []) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", turn: 4,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine.map((c, i) => createPermanent({ id: `m${i}`, card: c, controller: "user", summoningSick: false })) },
      ai1: { ...s.players.ai1, battlefield: theirs.map((c, i) => createPermanent({ id: `o${i}`, card: c, controller: "ai1", summoningSick: false })) },
    },
  };
}

/** Enter `card` under `controller`, flush, and count the triggered abilities that reached the STACK. */
function stackedTriggersFor(state, card, controller = "user") {
  const perm = createPermanent({ id: "in", card, controller });
  const withIt = {
    ...state,
    players: { ...state.players, [controller]: { ...state.players[controller], battlefield: [...state.players[controller].battlefield, perm] } },
  };
  const enqueued = checkEnterTriggers(withIt, perm);
  const flushed = flushTriggers(enqueued, { chooseTargets: () => [] });
  return (flushed.stack || []).filter((o) => o.kind === "triggered-ability").length;
}

describe("Katara — an Ally you control", () => {
  it("an Ally's trigger fires twice; a non-Ally's fires once", () => {
    expect(stackedTriggersFor(board([KATARA]), ALLY_SCOUT)).toBe(2);
    expect(stackedTriggersFor(board([KATARA]), PLAIN_BEAR)).toBe(1);
  });

  it("negative control — without Katara the same Ally fires once (byte-identical flush)", () => {
    expect(stackedTriggersFor(board([]), ALLY_SCOUT)).toBe(1);
  });

  it("'you control' is enforced — an OPPONENT's Ally is not doubled by my Katara", () => {
    expect(stackedTriggersFor(board([KATARA]), ALLY_SCOUT, "ai1")).toBe(1);
  });

  it("two Katara-alikes stack: the ability triggers twice ADDITIONALLY (3 total)", () => {
    const twoKatara = board([KATARA, { ...KATARA, id: "c-kt2", name: "Katara, the Fearless" }]);
    expect(stackedTriggersFor(twoKatara, ALLY_SCOUT)).toBe(3);
  });
});

describe("Harmonic Prodigy — 'a Shaman or ANOTHER Wizard you control'", () => {
  it("another Wizard doubles; a Shaman doubles; a plain creature does not", () => {
    expect(stackedTriggersFor(board([HARMONIC_PRODIGY]), OTHER_WIZARD)).toBe(2);
    expect(stackedTriggersFor(board([HARMONIC_PRODIGY]), A_SHAMAN)).toBe(2);
    expect(stackedTriggersFor(board([HARMONIC_PRODIGY]), PLAIN_BEAR)).toBe(1);
  });

  it("⭐ 'ANOTHER' excludes the Prodigy's OWN abilities — it is a Wizard and must not double itself", () => {
    const s = board([HARMONIC_PRODIGY, OTHER_WIZARD]);
    const prodigyId = s.players.user.battlefield[0].id;
    const wizardId = s.players.user.battlefield[1].id;
    expect(sourceTriggerMultiplierCount(s, prodigyId)).toBe(0);   // itself — excluded by "another"
    expect(sourceTriggerMultiplierCount(s, wizardId)).toBe(1);    // the other Wizard — doubled
  });
});

describe("Annie Joins Up — 'a legendary creature you control'", () => {
  it("a legendary creature doubles; a nonlegendary one does not", () => {
    expect(stackedTriggersFor(board([ANNIE]), LEGEND_BEAR)).toBe(2);
    expect(stackedTriggersFor(board([ANNIE]), PLAIN_BEAR)).toBe(1);
  });

  it("Annie herself is a legendary ENCHANTMENT, not a creature — her own abilities are not doubled", () => {
    const s = board([ANNIE]);
    expect(sourceTriggerMultiplierCount(s, s.players.user.battlefield[0].id)).toBe(0);
  });
});

describe("Cloud, Midgar Mercenary — self or an Equipment attached to it, WHILE EQUIPPED", () => {
  /** Cloud on the battlefield, optionally wearing `equipCard` (both attachment links wired). */
  function cloudBoard(equipCard = null) {
    const s = board(equipCard ? [CLOUD, equipCard] : [CLOUD]);
    if (!equipCard) return s;
    const bf = s.players.user.battlefield.map((p) => ({ ...p }));
    // BOTH links: the counter reads the HOST's `attachments` list, so wiring only attachedTo would
    // produce a silently inert fixture (the mis-wired-harness trap).
    bf[0].attachments = [bf[1].id];
    bf[1].attachedTo = bf[0].id;
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }

  it("EQUIPPED — Cloud's own abilities and its Equipment's abilities are both doubled", () => {
    const s = cloudBoard(TRIGGER_EQUIP);
    const [cloudId, equipId] = s.players.user.battlefield.map((p) => p.id);
    expect(sourceTriggerMultiplierCount(s, cloudId)).toBe(1);
    expect(sourceTriggerMultiplierCount(s, equipId)).toBe(1);
  });

  it("⭐ THE GATE IS REAL — an UNEQUIPPED Cloud doubles nothing, not even its own abilities", () => {
    const s = cloudBoard(null);
    expect(sourceTriggerMultiplierCount(s, s.players.user.battlefield[0].id)).toBe(0);
  });

  it("an Equipment sitting in play but NOT attached to Cloud is not covered", () => {
    // Cloud IS equipped (so the gate opens), but the loose Equipment is not one of its attachments.
    const s = cloudBoard(TRIGGER_EQUIP);
    const loose = createPermanent({ id: "loose", card: PLAIN_EQUIP, controller: "user", summoningSick: false });
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, loose] } } };
    expect(sourceTriggerMultiplierCount(s2, "loose")).toBe(0);
  });

  it("end to end — an equipped Cloud's own ETB reaches the stack twice", () => {
    // Enter a Cloud that is already wearing an Equipment, and count what the flush stacks.
    const s = board([TRIGGER_EQUIP]);
    const cloudPerm = createPermanent({ id: "in", card: CLOUD, controller: "user" });
    const equipPerm = { ...s.players.user.battlefield[0], attachedTo: "in" };
    cloudPerm.attachments = [equipPerm.id];
    const withIt = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [equipPerm, cloudPerm] } } };
    const flushed = flushTriggers(checkEnterTriggers(withIt, cloudPerm), { chooseTargets: () => [] });
    expect((flushed.stack || []).filter((o) => o.kind === "triggered-ability").length).toBe(2);
  });
});

describe("the documented false-negative — a source that has already left the battlefield", () => {
  it("a departed source cannot be tested, so it is NOT doubled (under-count, the safe direction)", () => {
    // CR would use last-known information here; the engine looks the source up live and finds nothing.
    // Pinned so the miss reads as a recorded limit rather than as intent.
    const s = board([KATARA]);
    expect(sourceTriggerMultiplierCount(s, "a-permanent-that-is-not-on-the-battlefield")).toBe(0);
  });
});
