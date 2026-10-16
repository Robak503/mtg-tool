/**
 * manaCostSacrificeDies.test.js — a creature sacrificed to pay a mana ability's cost DIES (CR 700.4), through the one death
 * look-back every other death site builds (gameState.deathLookback) (2026-10-16).
 *
 * commitManaTap sacrificed two kinds of permanent and neither went through it. The source's own self-sacrifice (an Eldrazi Spawn's
 * "Sacrifice this creature: Add {C}.", Basal Sliver and every Sliver it grants the ability) moved the card and fired only the
 * sacrifice watchers: the creature never died — no Blood Artist drain for its controller's watchers OR an opponent's, no
 * deaths-this-turn count. The Altar's victim built its own death entry without the replacement flags, so a creature Rest in Peace
 * exiled still fired dies triggers and counted as a death (CR 700.4: it never died) — and the victim never reached the
 * "whenever you sacrifice" watchers at all. Both now leave through manaModel.sacrificeForManaCost, the canonical sacrifice
 * (effects/atoms/removal.sacrificeCreatureEffect's sequence): layer-aware types as it left (CR 603.10a), the death look-back, the
 * death-specific exile honoured, dies triggers, sacrifice triggers, the leave drain.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-10-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaSources, planPayment, commitPaymentPlan } from "./manaModel.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const SPAWN = {"name":"Eldrazi Spawn","type":"Token Creature — Eldrazi Spawn","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"Sacrifice this creature: Add {C}.","power":"0","toughness":"1","token":true};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this token: Add one mana of any color.","token":true};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const KORVOLD = {"name":"Korvold, Fae-Cursed King","type":"Legendary Creature — Dragon Noble","mana":"{2}{B}{R}{G}","cmc":5,"keywords":["Flying"],"colors":["B","G","R"],"oracle":"Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.","power":"4","toughness":"4"};
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."};
const ASHNODS_ALTAR = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add {C}{C}."};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const BASAL = {"name":"Basal Sliver","type":"Creature — Sliver","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"","power":"2","toughness":"2"};
const METALLIC = {"name":"Metallic Sliver","type":"Artifact Creature — Sliver","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const LIVING_PLANE = {"name":"Living Plane","type":"World Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"All lands are 1/1 creatures that are still lands."};
const CRYSTAL_VEIN = {"name":"Crystal Vein","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}, Sacrifice this land: Add {C}{C}."};
const SMOTHERING = {"name":"Smothering Abomination","type":"Creature — Eldrazi","mana":"{2}{B}{B}","cmc":4,"keywords":["Flying","Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nFlying\nAt the beginning of your upkeep, sacrifice a creature.\nWhenever you sacrifice a creature, draw a card.","power":"4","toughness":"3"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const SIGN_IN_BLOOD = {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target player draws two cards and loses 2 life."};

// mine / theirs: [id, card, { tapped, sick, ...permanent fields }]
function board(mine, hand = [], theirs = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const perms = (list, controller) => list.map(([id, card, o = {}]) => {
    const { tapped = false, sick = false, ...extra } = o;
    return { ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, tapped, summoningSick: sick }), enteredOnTurn: sick ? 3 : 1, ...extra };
  });
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: perms(mine, "user"), hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), graveyard: [], exile: [],
        library: Array.from({ length: 4 }, (_, i) => ({ id: `L${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" })),
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, battlefield: perms(theirs, "ai") } },
  };
}
const castFirst = (s) => {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
  expect(cast).toBeTruthy();
  return dispatchAction(s, cast);
};
const triggers = (s) => (s.stack || []).filter((o) => o.kind === "triggered-ability").map((o) => `${o.controller}:${o.source?.name}`);
const zoneNames = (s, zone) => (s.players.user[zone] || []).map((c) => c.name);

describe("a creature that sacrifices itself for mana dies", () => {
  it("⭐ an Eldrazi Spawn cracked for Sol Ring: Blood Artist triggers above the spell, and the death is counted", () => {
    const after = castFirst(board([["spawn", SPAWN], ["artist", BLOOD_ARTIST]], [SOL_RING]));
    expect(after.players.user.battlefield.some((p) => p.id === "spawn")).toBe(false);
    expect(after.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    expect(triggers(after)).toEqual(["user:Blood Artist"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
  });

  it("⭐ the OPPONENT's Blood Artist sees it too — its drain targets the Spawn's controller (a summoning-sick Spawn may pay: no {T})", () => {
    const after = castFirst(board([["spawn", SPAWN, { sick: true }]], [SOL_RING], [["oppArtist", BLOOD_ARTIST]]));
    const drain = after.stack.find((o) => o.kind === "triggered-ability");
    expect(drain).toMatchObject({ controller: "ai", source: { name: "Blood Artist" } });
    expect(drain.targets).toEqual([expect.objectContaining({ type: "player", id: "user" })]);
  });

  it("⭐ a Sliver paying with Basal Sliver's granted ability dies — the grant's sacrifice is a real one, end to end", () => {
    const after = castFirst(board([["basal", BASAL, { tapped: true }], ["metal", METALLIC], ["artist", BLOOD_ARTIST]], [SIGN_IN_BLOOD]));
    expect(zoneNames(after, "graveyard")).toEqual(["Metallic Sliver"]);
    expect(triggers(after)).toEqual(["user:Blood Artist"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
  });

  it("an animated land sacrificed for mana dies — and is a creature sacrifice — as what it was (layer-aware, CR 603.10a)", () => {
    // Crystal Vein's "{T}, Sacrifice this land: Add {C}{C}." line, committed through the plan the dispatcher would commit (the
    // planner reached alone; beside its own {C} line it takes the {C} first). Under Living Plane the land is a 1/1 creature as it
    // leaves: Blood Artist sees a death, Smothering Abomination ("whenever you sacrifice a creature") a creature. Without Living
    // Plane it is only a land.
    const pay = (s) => {
      const plan = planPayment(s.players.user.manaPool, manaSources(s, "user").filter((r) => r.permanentId === "vein" && r.sacrifices), parseManaCost(MIND_STONE.mana));
      expect(plan?.taps).toEqual([expect.objectContaining({ permanentId: "vein", amount: 2, sacrifices: true })]);
      return commitPaymentPlan(s, "user", plan);
    };
    const pendingFrom = (s) => (s.pendingTriggers || []).map((t) => t.source?.card?.name || t.source?.name).sort();
    const animated = pay(board([["vein", CRYSTAL_VEIN], ["plane", LIVING_PLANE], ["artist", BLOOD_ARTIST], ["smother", SMOTHERING]]));
    expect(zoneNames(animated, "graveyard")).toEqual(["Crystal Vein"]);
    expect(pendingFrom(animated)).toEqual(["Blood Artist", "Smothering Abomination"]);
    expect(animated.players.user.creaturesDiedThisTurn).toBe(1);
    const plain = pay(board([["vein", CRYSTAL_VEIN], ["artist", BLOOD_ARTIST], ["smother", SMOTHERING]]));
    expect(zoneNames(plain, "graveyard")).toEqual(["Crystal Vein"]);
    expect(pendingFrom(plain)).toEqual([]);
    expect(plain.players.user.creaturesDiedThisTurn || 0).toBe(0);
  });

  it("⛔ under Rest in Peace the Spawn is exiled and never died — but it WAS sacrificed: Korvold still triggers", () => {
    const after = castFirst(board([["spawn", SPAWN], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]], [SOL_RING]));
    expect(zoneNames(after, "graveyard")).toEqual([]);
    expect(triggers(after)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
  });

  it("⛔ a creature that would be exiled if it died this turn goes to exile, not the graveyard, and fires no dies trigger", () => {
    // exileIfDiesTurn — the stamp a "if that creature would die this turn, exile it instead" effect leaves (Lava Coil's rider).
    const after = castFirst(board([["basal", BASAL, { tapped: true }], ["metal", METALLIC, { exileIfDiesTurn: 3 }], ["artist", BLOOD_ARTIST]], [SIGN_IN_BLOOD]));
    expect(zoneNames(after, "exile")).toEqual(["Metallic Sliver"]);
    expect(zoneNames(after, "graveyard")).toEqual([]);
    expect(triggers(after)).toEqual([]);
  });

  it("a Treasure is no creature: Korvold sees the sacrifice, Blood Artist sees no death", () => {
    const after = castFirst(board([["treasure", TREASURE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]], [SOL_RING]));
    expect(after.players.user.battlefield.some((p) => p.id === "treasure")).toBe(false);
    expect(triggers(after)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
  });
});

describe("the Altar's victim dies through the same look-back", () => {
  it("⭐⛔ Ashnod's Altar feeding on Memnite under Rest in Peace: exiled, so no Blood Artist drain and no death counted", () => {
    const after = castFirst(board([["altar", ASHNODS_ALTAR], ["memnite", MEMNITE], ["artist", BLOOD_ARTIST], ["rip", REST_IN_PEACE]], [MIND_STONE]));
    expect(zoneNames(after, "exile")).toEqual(["Memnite"]);
    expect(triggers(after)).toEqual([]);
    expect(after.players.user.creaturesDiedThisTurn || 0).toBe(0);
    // the log names where it went, as every sacrifice site logs a replaced death (gameState.deathEventKind)
    expect(after.log.filter((e) => e.kind === "creature-exiled-instead").map((e) => [e.cardName, e.via])).toEqual([["Memnite", "sacrifice"]]);
  });

  it("⭐ without Rest in Peace the victim dies (Blood Artist) and is a sacrifice Korvold sees", () => {
    const after = castFirst(board([["altar", ASHNODS_ALTAR], ["memnite", MEMNITE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]], [MIND_STONE]));
    expect(zoneNames(after, "graveyard")).toEqual(["Memnite"]);
    expect(triggers(after).sort()).toEqual(["user:Blood Artist", "user:Korvold, Fae-Cursed King"]);
    expect(after.players.user.creaturesDiedThisTurn).toBe(1);
    expect(after.log.some((e) => e.event === "sacrifice-creature-cost" && e.victimName === "Memnite")).toBe(true);
  });
});
