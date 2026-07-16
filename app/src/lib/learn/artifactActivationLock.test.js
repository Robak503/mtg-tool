/**
 * artifactActivationLock.test.js — BLITZ NR-1 (CR 604.2): "Activated abilities of artifacts can't be
 * activated." (Null Rod / Stony Silence / Collector Ouphe — the ONLY three carriers of the exact line.)
 *
 * The line parses to a coverage MARKER ({ artifactActivationLock } — the castLimit pattern), and the
 * RUNTIME lock is a LIVE board query (staticAbilityParser.artifactActivationsLocked — never a stored
 * flag, so it lifts the instant the carrier leaves) consulted at EVERY site that offers an activated
 * ability of a battlefield artifact, with a LAYER-AWARE Artifact read (layers.permanentTypes):
 *   • mana (CR 605.1a — a mana ability IS an activated ability): legalChoices.actionsTapForMana +
 *     actionsDoubleManaPool + manaModel.manaSources (the one affordability/payment gatherer — a locked
 *     Sol Ring neither enumerates NOR pays);
 *   • stack-activated: actionsActivateAbility (printed + aura/group-granted on an artifact HOST + equip,
 *     CR 702.6a);
 *   • crew (CR 702.122a — an activated ability of a Vehicle): actionsCrewVehicle;
 *   • loyalty (CR 606.2 — loyalty abilities are activated): actionsActivateLoyalty (artifact walkers).
 * SYMMETRIC (CR 109.2 — "artifacts" = artifact permanents on the battlefield, ANY controller): an
 * opponent's carrier locks the user's artifacts and vice versa. NOT locked: casting artifact spells
 * (CR 601.2), triggered abilities (CR 603.2), statics (CR 604.1), non-artifact activations, and
 * out-of-battlefield activations (cycling from hand — official Stony Silence ruling; graveyard
 * recursion) — those cards are not "artifacts" per CR 109.2.
 *
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { manaSources } from "./manaModel.js";
import { enterPermanent } from "./resolvers.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { artifactActivationLockOf, artifactActivationsLocked, parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NULL_ROD = { id: "nr", name: "Null Rod", type: "Artifact", mana: "{2}",
  oracle: "Activated abilities of artifacts can't be activated." };
const STONY_SILENCE = { id: "st", name: "Stony Silence", type: "Enchantment", mana: "{1}{W}",
  oracle: "Activated abilities of artifacts can't be activated." };
const COLLECTOR_OUPHE = { id: "co", name: "Collector Ouphe", type: "Creature — Ouphe", power: "2", toughness: "2", mana: "{1}{G}",
  oracle: "Activated abilities of artifacts can't be activated." };
const SOL_RING = { id: "sr", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const MIND_STONE = { id: "ms", name: "Mind Stone", type: "Artifact", mana: "{2}",
  oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const FOREST = { id: "fo", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const TRIP_NOOSE = { id: "tn", name: "Trip Noose", type: "Artifact", mana: "{2}", oracle: "{2}, {T}: Tap target creature." };
const PRODIGAL_SORCERER = { id: "ps", name: "Prodigal Sorcerer", type: "Creature — Human Wizard Sorcerer", power: "1", toughness: "1", mana: "{2}{U}",
  oracle: "{T}: This creature deals 1 damage to any target." };
const DOUBLING_CUBE = { id: "dc", name: "Doubling Cube", type: "Artifact", mana: "{2}",
  oracle: "{3}, {T}: Double the amount of each type of unspent mana you have." };
const SLEEK_SCHOONER = { id: "ss", name: "Sleek Schooner", type: "Artifact — Vehicle", power: "4", toughness: "3", mana: "{3}",
  oracle: "Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const PROPHETIC_PRISM = { id: "pp", name: "Prophetic Prism", type: "Artifact", mana: "{2}",
  oracle: "When this artifact enters, draw a card.\n{1}, {T}: Add one mana of any color." };
const HERMETIC_STUDY = 'Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."';
const BEAR = { id: "rb", name: "Ready Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const SABLE = { id: "bs", name: "Bronze Sable", type: "Artifact Creature — Sable", power: "2", toughness: "1", oracle: "" };

describe("parse + classify (the three carriers, no variants)", () => {
  it("Null Rod / Stony Silence / Collector Ouphe flip native-static", () => {
    for (const c of [NULL_ROD, STONY_SILENCE, COLLECTOR_OUPHE]) {
      expect(artifactActivationLockOf(c)).toBe(true);
      expect(parseStaticAbilities(c)).toEqual([{ artifactActivationLock: true }]);
      expect(classifyCard(c)).toBe("native-static");
      expect(isNativeTier(classifyCard(c))).toBe(true);
    }
  });
  it("CREED — variant lines never match the reader (safe FN, stays Arbiter)", () => {
    const variants = [
      "Activated abilities of artifacts your opponents control can't be activated.",
      "Activated abilities of creatures can't be activated.",
      "Activated abilities of artifact cards in graveyards can't be activated.",
    ];
    for (const oracle of variants) {
      const c = { id: "v", name: "Variant", type: "Artifact", oracle };
      expect(artifactActivationLockOf(c)).toBe(false);
      expect(parseStaticAbilities(c)).toEqual([]);
      expect(classifyCard(c)).toBe("body-only");
    }
  });
});

describe("runtime — the artifact activation lock", () => {
  // Standard 1v1 board: the user's battlefield vs the AI's — the carrier defaults to the AI side so
  // every gate is proven SYMMETRIC (an opponent's lock binds the user, CR 109.2). Own turn + priority +
  // main step (the engine's universal activation window).
  function board({ userBf = [], aiBf = [], hand = [], pool = {}, library = [] } = {}) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: userBf, hand, library, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
        ai: { ...base.players.ai, battlefield: aiBf },
      },
    };
  }
  const perm = (id, card, over = {}) => Object.assign(createPermanent({ id, card, controller: over.controller || "user", summoningSick: false }), { enteredOnTurn: 1, ...over });
  const kindNames = (s, kind) => legalActionsForPlayer(s, "user").filter((a) => a.kind === kind).map((a) => a.name ?? a.vehicleName); // crew actions carry vehicleName

  it("MANA — a locked Sol Ring neither enumerates nor counts as a source; a land still taps (either lock side)", () => {
    const bf = () => [perm("sol", SOL_RING), perm("for", FOREST)];
    const unlocked = board({ userBf: bf() });
    expect(kindNames(unlocked, "tap-for-mana").sort()).toEqual(["Forest", "Sol Ring"]);
    // OPPONENT-side carrier (symmetric): the user's ring is off, the user's land is not.
    const oppLock = board({ userBf: bf(), aiBf: [perm("rod", NULL_ROD, { controller: "ai" })] });
    expect(artifactActivationsLocked(oppLock)).toBe(true);
    expect(kindNames(oppLock, "tap-for-mana")).toEqual(["Forest"]);
    expect(manaSources(oppLock, "user").map((s) => s.permanentId)).toEqual(["for"]);
    // OWN-side carrier (Collector Ouphe — a creature carrier): locks the user's own ring identically.
    const ownLock = board({ userBf: [...bf(), perm("ouphe", COLLECTOR_OUPHE)] });
    expect(kindNames(ownLock, "tap-for-mana")).toEqual(["Forest"]);
  });

  it("MANA-PAY — a spell affordable only through an artifact source is not offered while locked", () => {
    // Forest alone = 1 mana; Mind Stone {2} needs the ring's {C}{C}. Locked → unaffordable → no offer.
    const bf = () => [perm("sol", SOL_RING), perm("for", FOREST)];
    const locked = board({ userBf: bf(), aiBf: [perm("st", STONY_SILENCE, { controller: "ai" })], hand: [{ ...MIND_STONE }] });
    expect(kindNames(locked, "cast-spell")).toEqual([]);
    const unlocked = board({ userBf: bf(), hand: [{ ...MIND_STONE }] });
    expect(kindNames(unlocked, "cast-spell")).toEqual(["Mind Stone"]);
  });

  it("CREW + DOUBLE-MANA-POOL — a Vehicle can't be crewed, a Doubling Cube can't fire", () => {
    const bf = () => [perm("veh", SLEEK_SCHOONER), perm("bear", BEAR), perm("cube", DOUBLING_CUBE)];
    const unlocked = board({ userBf: bf(), pool: { C: 9 } });
    expect(kindNames(unlocked, "crew-vehicle")).toEqual(["Sleek Schooner"]);
    expect(kindNames(unlocked, "double-mana-pool")).toEqual(["Doubling Cube"]);
    const locked = board({ userBf: bf(), aiBf: [perm("rod", NULL_ROD, { controller: "ai" })], pool: { C: 9 } });
    expect(kindNames(locked, "crew-vehicle")).toEqual([]);
    expect(kindNames(locked, "double-mana-pool")).toEqual([]);
  });

  it("ACTIVATE — an artifact's printed ability is off; a creature's stays on (never over-locked)", () => {
    const bf = () => [perm("noose", TRIP_NOOSE), perm("tim", PRODIGAL_SORCERER), perm("bear", BEAR)];
    const unlocked = board({ userBf: bf(), pool: { C: 9 } });
    expect(kindNames(unlocked, "activate-ability")).toContain("Trip Noose");
    expect(kindNames(unlocked, "activate-ability")).toContain("Prodigal Sorcerer");
    const locked = board({ userBf: bf(), aiBf: [perm("rod", NULL_ROD, { controller: "ai" })], pool: { C: 9 } });
    expect(kindNames(locked, "activate-ability")).not.toContain("Trip Noose");
    expect(kindNames(locked, "activate-ability")).toContain("Prodigal Sorcerer");
  });

  it("GRANTED — an aura-granted ability is off on an ARTIFACT host, on for a non-artifact host", () => {
    // Hermetic Study grants "{T}: ping" — the granted ability belongs to the HOST (CR 613.1f), so an
    // artifact-creature host (Bronze Sable) is locked while a plain Bear host is not.
    const withAura = (hostCard, hostId) => {
      const host = perm(hostId, hostCard);
      const aura = perm("aura", { id: "hs", name: "Hermetic Study", type: "Enchantment — Aura", mana: "{1}{U}", oracle: HERMETIC_STUDY });
      aura.attachedTo = hostId;
      host.attachments = ["aura"];
      return [host, aura];
    };
    const rod = () => [perm("rod", NULL_ROD, { controller: "ai" })];
    const sableLocked = board({ userBf: withAura(SABLE, "sable"), aiBf: rod(), pool: { C: 9 } });
    expect(kindNames(sableLocked, "activate-ability")).toEqual([]);
    const bearLocked = board({ userBf: withAura(BEAR, "bear"), aiBf: rod(), pool: { C: 9 } });
    expect(kindNames(bearLocked, "activate-ability")).toContain("Ready Bear");
    // Control: the artifact host's granted ping IS offered without the lock.
    const sableFree = board({ userBf: withAura(SABLE, "sable"), pool: { C: 9 } });
    expect(kindNames(sableFree, "activate-ability")).toContain("Bronze Sable");
  });

  it("LOYALTY — an artifact planeswalker's loyalty is locked; a plain walker's is not (CR 606.2)", () => {
    const APW = { id: "apw", name: "Test Spark", type: "Legendary Artifact Planeswalker — Test", oracle: "+1: You gain 2 life.", loyalty: "3" };
    const PW = { id: "pw", name: "Plain Spark", type: "Legendary Planeswalker — Test", oracle: "+1: You gain 2 life.", loyalty: "3" };
    const bf = () => [perm("w1", APW, { counters: { loyalty: 3 } }), perm("w2", PW, { counters: { loyalty: 3 } })];
    expect(kindNames(board({ userBf: bf() }), "activate-loyalty").sort()).toEqual(["Plain Spark", "Test Spark"]);
    const locked = board({ userBf: bf(), aiBf: [perm("rod", NULL_ROD, { controller: "ai" })] });
    expect(kindNames(locked, "activate-loyalty")).toEqual(["Plain Spark"]);
  });

  it("NOT LOCKED — casting an artifact spell stays legal (CR 601.2: casting is not activating)", () => {
    const locked = board({ userBf: [perm("for", FOREST)], aiBf: [perm("rod", NULL_ROD, { controller: "ai" })], hand: [{ ...SOL_RING }] });
    expect(kindNames(locked, "cast-spell")).toEqual(["Sol Ring"]);
  });

  it("NOT LOCKED — an artifact's TRIGGERED ability still fires under the lock (CR 603.2)", () => {
    // Prophetic Prism resolves while a Null Rod is out: its ETB draw fires through the stack even though
    // its "{1}, {T}: Add one mana of any color" activated ability is locked.
    let s = board({ aiBf: [perm("rod", NULL_ROD, { controller: "ai" })], library: [{ id: "lib-1", name: "Top Card" }] });
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: { ...PROPHETIC_PRISM }, controller: "user", targets: [], cost: null,
      payload: { resolver: "spell.permanent", params: { card: { ...PROPHETIC_PRISM }, controller: "user" } } }] };
    const afterSpell = resolveTopOfStack(s);
    expect(afterSpell.players.user.battlefield).toHaveLength(1);
    expect(afterSpell.stack).toHaveLength(1);
    expect(afterSpell.stack[0].kind).toBe("triggered-ability");
    const afterTrigger = resolveTopOfStack(afterSpell);
    expect(afterTrigger.players.user.hand.map((c) => c.id)).toEqual(["lib-1"]);
    // …and the prism it left on the battlefield is still NOT a mana source (the lock holds).
    expect(manaSources(afterTrigger, "user")).toEqual([]);
  });

  it("LIFT — the lock is a live board query: the carrier leaving restores every offer", () => {
    const bf = () => [perm("sol", SOL_RING), perm("veh", SLEEK_SCHOONER), perm("bear", BEAR)];
    const locked = board({ userBf: [...bf(), perm("ouphe", COLLECTOR_OUPHE)] });
    expect(kindNames(locked, "tap-for-mana")).toEqual([]);
    expect(kindNames(locked, "crew-vehicle")).toEqual([]);
    // The Ouphe dies (leaves the battlefield) — same state minus the carrier, nothing else changed.
    const lifted = { ...locked, players: { ...locked.players, user: { ...locked.players.user,
      battlefield: locked.players.user.battlefield.filter((p) => p.id !== "ouphe") } } };
    expect(artifactActivationsLocked(lifted)).toBe(false);
    expect(kindNames(lifted, "tap-for-mana")).toEqual(["Sol Ring"]);
    expect(kindNames(lifted, "crew-vehicle")).toEqual(["Sleek Schooner"]);
  });

  it("ENTER — a Prophetic Prism entering while locked enqueues its ETB trigger (the enter chokepoint)", () => {
    const s = board({ aiBf: [perm("rod", NULL_ROD, { controller: "ai" })], library: [{ id: "lib-1", name: "Top Card" }] });
    const out = enterPermanent(s, { ...PROPHETIC_PRISM }, "user");
    expect(out.players.user.battlefield).toHaveLength(1);
    expect(out.pendingTriggers).toHaveLength(1);
    expect(out.pendingTriggers[0].descriptor.effectClause).toMatch(/draw a card/i);
  });
});
