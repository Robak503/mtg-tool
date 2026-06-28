/**
 * chosenTypeAnthem.test.js — the CHOSEN-TYPE COUNT-ANTHEM consumers (Wave 6, building on the Wave-5
 * chosenType primitive). Three cross-deck cards whose payoff reads the type chosen at ETB/resolution:
 *
 *   • Banner of Kinship (Sliver + Ur-Dragon) — "As ~ enters, choose a creature type. This artifact enters
 *     with a fellowship counter on it for each creature you control of the chosen type. Creatures you control
 *     of the chosen type get +1/+1 for each fellowship counter on this artifact." The ETB counter (resolvers.
 *     entersWithChosenTypeCounter) sets the magnitude; the layer-7c CHOSEN-TYPE COUNT-ANTHEM (staticAbility-
 *     Parser + layers.matchesSelector chosenTypeOfSource + countersOnSource) buffs ONLY chosen-type creatures
 *     the controller controls, scaled by the LIVE fellowship-counter count.
 *   • Door of Destinies (Sliver + Pantlaza) — same anthem, scaled instead by a charge counter added by a
 *     "Whenever you cast a spell of the chosen type" trigger (the chosenType cast detector + the
 *     add-named-counter-self atom).
 *   • Distant Melody (Sliver) — sorcery "Choose a creature type. Draw a card for each permanent you control
 *     of that type." (spell-time chosen-type count: shared.chosenTypePermanents, resolved optimally).
 *
 * CREED — the FP here is OVER/UNDER-BUFF (wrong count or wrong group → wrong P/T) or OVER-DRAW. The exact
 * magnitude is asserted at multiple board sizes, and the anthem must touch ONLY creatures of the chosen type
 * the controller controls (a changeling counts; a non-chosen-type creature and an opponent's creature do NOT).
 * An anthem chooser WITHOUT a modeled counter source (Shared Triumph) stays body-only (a SAFE false-negative).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { checkCastTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, getCounter } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { serializeState, deserializeState } from "./serialization.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const BANNER_ORACLE =
  "As this artifact enters, choose a creature type. This artifact enters with a fellowship counter on it for each creature you control of the chosen type.\n" +
  "Creatures you control of the chosen type get +1/+1 for each fellowship counter on this artifact.";
const BANNER = { id: "card-banner", name: "Banner of Kinship", type: "Artifact", oracle: BANNER_ORACLE };

const DOOR_ORACLE =
  "As this artifact enters, choose a creature type.\n" +
  "Whenever you cast a spell of the chosen type, put a charge counter on this artifact.\n" +
  "Creatures you control of the chosen type get +1/+1 for each charge counter on this artifact.";
const DOOR = { id: "card-door", name: "Door of Destinies", type: "Artifact", oracle: DOOR_ORACLE };

const MELODY = { id: "card-melody", name: "Distant Melody", type: "Sorcery", oracle: "Choose a creature type. Draw a card for each permanent you control of that type.", mana: "{3}{U}" };

function baseState(over = {}) {
  const s = createGameState({
    userDeck: Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, type: "Instant", oracle: "" })),
    aiDeck: [{ name: "A1", type: "Instant", oracle: "" }],
  });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function creaturePerm(id, typeLine, pt = [1, 1], controller = "user", oracle = "") {
  return createPermanent({ id, card: { name: id, type: typeLine, power: pt[0], toughness: pt[1], oracle }, controller });
}
// A board with a chosen-type artifact (chosenType pre-set + N counters) and extra permanents.
function withArtifact(card, chosenType, counters, extra = [], over = {}) {
  const s = baseState(over);
  const art = { ...createPermanent({ id: "art", card, controller: "user" }), chosenType, counters };
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [art, ...extra] }, ai: { ...s.players.ai, life: 20 } } };
}

describe("CHOSEN-TYPE COUNT-ANTHEM — classification", () => {
  it("Banner of Kinship → native-static (whole card modeled: chooser + ETB counter + count-anthem)", () => {
    expect(classifyCard(BANNER)).toBe("native-static");
  });
  it("Door of Destinies → native-mixed (chooser + cast trigger + count-anthem)", () => {
    expect(classifyCard(DOOR)).toBe("native-mixed");
  });
  it("Distant Melody → native-spell (spell-time chosen-type draw)", () => {
    expect(classifyCard(MELODY)).toBe("native-spell");
  });

  it("CREED FN boundary — an anthem chooser with NO modeled counter source stays body-only (Shared Triumph)", () => {
    const shared = { name: "Shared Triumph", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nCreatures of the chosen type get +1/+1." };
    expect(classifyCard(shared)).toBe("body-only");
  });
  it("CREED FN boundary — a Banner-shape with an extra UNMODELED clause stays body-only (no partial flip)", () => {
    const ridered = {
      name: "Fake Banner",
      type: "Artifact",
      oracle: BANNER_ORACLE + "\nWhenever this artifact enters, exile target nonland permanent an opponent controls.",
    };
    expect(classifyCard(ridered)).toBe("body-only");
  });
  it("CREED — Kindred Discovery stays native-trigger (the primitive isn't regressed)", () => {
    const kindred = { name: "Kindred Discovery", type: "Enchantment", oracle: "As this enchantment enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card." };
    expect(classifyCard(kindred)).toBe("native-trigger");
  });
  it("CREED — Sliver Legion (GROUP COUNT-ANTHEM) stays native-static (not regressed by the chosen-type branch)", () => {
    expect(classifyCard({ name: "Sliver Legion", type: "Legendary Creature — Sliver", oracle: "All Sliver creatures get +1/+1 for each other Sliver on the battlefield." })).toBe("native-static");
  });
});

describe("Banner of Kinship — ETB fellowship counter + the count-anthem", () => {
  it("enters with a fellowship counter PER chosen-type creature (auto-picks the most-common type)", () => {
    // 2 Elves + 1 Goblin → autoPick = Elf, so 2 fellowship counters.
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      creaturePerm("e1", "Creature — Elf"),
      creaturePerm("e2", "Creature — Elf Warrior"),
      creaturePerm("g1", "Creature — Goblin"),
    ] } } };
    s = enterPermanent(s, BANNER, "user");
    const b = s.players.user.battlefield.find((p) => p.card.name === "Banner of Kinship");
    expect(b.chosenType).toBe("Elf");
    expect(b.counters.fellowship).toBe(2);
  });

  it("a chosen-type creature gets +1/+1 × fellowship counters; a non-chosen creature does NOT", () => {
    const s = withArtifact(BANNER, "Elf", { fellowship: 3 }, [
      creaturePerm("elf", "Creature — Elf", [1, 1]),
      creaturePerm("gob", "Creature — Goblin", [2, 2]),
    ]);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([4, 4]); // 1/1 + 3
    expect([permanentPower(s, "gob"), permanentToughness(s, "gob")]).toEqual([2, 2]); // untouched
  });

  it("the buff scales with the LIVE counter count (re-evaluated, not an ETB snapshot): 0→+0, 1→+1, 4→+4", () => {
    const elf = () => creaturePerm("elf", "Creature — Elf", [2, 2]);
    let s = withArtifact(BANNER, "Elf", { fellowship: 0 }, [elf()]);
    expect(permanentPower(s, "elf")).toBe(2);                                          // +0
    s = withArtifact(BANNER, "Elf", { fellowship: 1 }, [elf()]);
    expect(permanentPower(s, "elf")).toBe(3);                                          // +1
    s = withArtifact(BANNER, "Elf", { fellowship: 4 }, [elf()]);
    expect(permanentPower(s, "elf")).toBe(6);                                          // +4
  });

  it("a CHANGELING counts as the chosen type (CR 702.73a) — buffed by the anthem", () => {
    const s = withArtifact(BANNER, "Elf", { fellowship: 2 }, [
      creaturePerm("ch", "Creature — Shapeshifter", [1, 1], "user", "Changeling (This card is every creature type.)"),
    ]);
    expect([permanentPower(s, "ch"), permanentToughness(s, "ch")]).toEqual([3, 3]); // 1/1 + 2
  });

  it("CREED — an OPPONENT's chosen-type creature is NOT buffed (controllerScope: you)", () => {
    const s = withArtifact(BANNER, "Elf", { fellowship: 3 }, [creaturePerm("oppElf", "Creature — Elf", [1, 1], "ai")]);
    expect([permanentPower(s, "oppElf"), permanentToughness(s, "oppElf")]).toEqual([1, 1]); // untouched
  });

  it("full ETB flow: enter Banner into a 2-Elf board → 2 counters → each Elf becomes 3/3", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      creaturePerm("e1", "Creature — Elf", [1, 1]),
      creaturePerm("e2", "Creature — Elf Warrior", [1, 1]),
    ] } } };
    s = enterPermanent(s, BANNER, "user");
    expect([permanentPower(s, "e1"), permanentToughness(s, "e1")]).toEqual([3, 3]);
    expect([permanentPower(s, "e2"), permanentToughness(s, "e2")]).toEqual([3, 3]);
  });

  it("chosenType + counters SERIALIZE (a save/load round-trip keeps the anthem)", () => {
    const s = withArtifact(BANNER, "Elf", { fellowship: 2 }, [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    const restored = deserializeState(serializeState(s));
    expect([permanentPower(restored, "elf"), permanentToughness(restored, "elf")]).toEqual([3, 3]);
  });
});

describe("Door of Destinies — cast-of-chosen-type charge counter + the count-anthem", () => {
  it("casting a chosen-type spell adds a charge counter; a non-chosen-type cast does NOT", () => {
    let s = withArtifact(DOOR, "Elf", {}, [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    // Cast an Elf spell → 1 charge counter.
    s = checkCastTriggers(s, { spellCard: { name: "Elf Spell", type: "Creature — Elf", oracle: "" }, casterId: "user" });
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s);
    while (s.stack && s.stack.length) s = resolveTopOfStack(s);
    expect(getCounter(s, "art", "charge")).toBe(1);
    // Cast a Goblin spell → no trigger, no counter.
    s = checkCastTriggers(s, { spellCard: { name: "Goblin Spell", type: "Creature — Goblin", oracle: "" }, casterId: "user" });
    expect((s.pendingTriggers || []).length).toBe(0);
    expect(getCounter(s, "art", "charge")).toBe(1);
  });

  it("the anthem scales with the charge counters: 1 charge → +1/+1, 2 charges → +2/+2", () => {
    let s = withArtifact(DOOR, "Elf", {}, [creaturePerm("elf", "Creature — Elf", [1, 1])]);
    const elfSpell = { name: "Elf Spell", type: "Creature — Elf", oracle: "" };
    s = checkCastTriggers(s, { spellCard: elfSpell, casterId: "user" });
    s = flushTriggers(s);
    while (s.stack && s.stack.length) s = resolveTopOfStack(s);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([2, 2]); // 1 charge
    s = checkCastTriggers(s, { spellCard: elfSpell, casterId: "user" });
    s = flushTriggers(s);
    while (s.stack && s.stack.length) s = resolveTopOfStack(s);
    expect([permanentPower(s, "elf"), permanentToughness(s, "elf")]).toEqual([3, 3]); // 2 charges
  });

  it("a CHANGELING spell counts as the chosen type (CR 702.73a) — adds a charge counter", () => {
    let s = withArtifact(DOOR, "Elf", {}, []);
    s = checkCastTriggers(s, { spellCard: { name: "Mistform", type: "Creature — Shapeshifter", oracle: "Changeling (This card is every creature type.)" }, casterId: "user" });
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s);
    while (s.stack && s.stack.length) s = resolveTopOfStack(s);
    expect(getCounter(s, "art", "charge")).toBe(1);
  });

  it("CREED — an OPPONENT casting a chosen-type spell does NOT fire the controller's Door (whose: you)", () => {
    let s = withArtifact(DOOR, "Elf", {}, []);
    s = checkCastTriggers(s, { spellCard: { name: "Elf Spell", type: "Creature — Elf", oracle: "" }, casterId: "ai" });
    expect((s.pendingTriggers || []).length).toBe(0);
  });

  it("CREED — an unset chosenType (malformed Door) never adds a counter on any cast (SAFE no-op)", () => {
    let s = withArtifact(DOOR, undefined, {}, []);
    s = checkCastTriggers(s, { spellCard: { name: "Elf Spell", type: "Creature — Elf", oracle: "" }, casterId: "user" });
    expect((s.pendingTriggers || []).length).toBe(0);
  });
});

describe("Distant Melody — spell-time chosen-type draw", () => {
  function drawProbe(battlefield, aiBattlefield = []) {
    const program = parseEffectProgram(MELODY);
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield, hand: [] }, ai: { ...s.players.ai, battlefield: aiBattlefield } } };
    const before = s.players.user.hand.length;
    const stackObj = { payload: { params: { program, controller: "user", targets: [], sourceId: null } } };
    s = runEffectProgram(s, stackObj);
    return s.players.user.hand.length - before;
  }

  it("draws a card per permanent of the OPTIMAL (most-populous) chosen type", () => {
    // 3 Slivers + 1 Goblin → choose Sliver → draw 3.
    expect(drawProbe([
      creaturePerm("s1", "Creature — Sliver"),
      creaturePerm("s2", "Creature — Sliver"),
      creaturePerm("s3", "Creature — Sliver"),
      creaturePerm("g1", "Creature — Goblin"),
    ])).toBe(3);
  });

  it("counts a CHANGELING toward the chosen type (CR 702.73a)", () => {
    // 2 Slivers + 1 changeling → choose Sliver → draw 3.
    expect(drawProbe([
      creaturePerm("s1", "Creature — Sliver"),
      creaturePerm("s2", "Creature — Sliver"),
      creaturePerm("ch", "Creature — Shapeshifter", [1, 1], "user", "Changeling (This card is every creature type.)"),
    ])).toBe(3);
  });

  it("an artifact-creature of the chosen type counts (it IS a creature, CR 305.4)", () => {
    expect(drawProbe([
      creaturePerm("s1", "Creature — Sliver"),
      creaturePerm("s2", "Artifact Creature — Sliver"),
    ])).toBe(2);
  });

  it("CREED — no creatures → draws 0 (a safe floor, never a fabricated draw)", () => {
    expect(drawProbe([
      createPermanent({ id: "rock", card: { name: "Sol Ring", type: "Artifact", oracle: "" }, controller: "user" }),
    ])).toBe(0);
  });

  it("CREED — counts only the CONTROLLER's permanents, not an opponent's chosen-type creatures", () => {
    // 1 Sliver (mine) + 5 Slivers (opponent's, in the ai battlefield) → choose Sliver → draw 1 (only mine).
    expect(drawProbe(
      [creaturePerm("mine", "Creature — Sliver", [1, 1], "user")],
      [
        creaturePerm("o1", "Creature — Sliver", [1, 1], "ai"),
        creaturePerm("o2", "Creature — Sliver", [1, 1], "ai"),
        creaturePerm("o3", "Creature — Sliver", [1, 1], "ai"),
        creaturePerm("o4", "Creature — Sliver", [1, 1], "ai"),
        creaturePerm("o5", "Creature — Sliver", [1, 1], "ai"),
      ],
    )).toBe(1);
  });
});
