/**
 * PERM-ENTERS — "whenever an artifact you control enters" (Reckless Fireweaver, Salivating Gremlins,
 * Thopter Architect…) and "whenever an enchantment you control enters" (Constellation payoffs —
 * Setessan Champion, Favored of Iroas, Nexus Wardens…). Extends classifyCondition with two new
 * scope predicates (artifactYouControl / enchantmentYouControl) and fires them from enterPermanent
 * via the new checkPermanentEntersTriggers helper. The "Constellation —" / "Eerie —" ability-word
 * labels are stripped by stripTriggerAbilityLabel before classifyCondition sees them.
 *
 * CREED: Artifact Creature spells match the "artifact" filter (type-line substring, CR 205.2);
 * the opponent's artifact does NOT fire (controller gate); Eerie compound event stays UNDETECTED.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, stripTriggerAbilityLabel } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ─── Label stripping ──────────────────────────────────────────────────────────

describe("PERM-ENTERS — stripTriggerAbilityLabel", () => {
  it("strips Constellation — prefix", () => {
    expect(stripTriggerAbilityLabel("Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on this creature.")).toBe(
      "Whenever an enchantment you control enters, put a +1/+1 counter on this creature."
    );
  });
  it("strips Eerie — prefix", () => {
    expect(stripTriggerAbilityLabel("Eerie — Whenever an enchantment you control enters and whenever you fully unlock a room, draw a card.")).toBe(
      "Whenever an enchantment you control enters and whenever you fully unlock a room, draw a card."
    );
  });
  it("does not strip mid-line Constellation text", () => {
    const s = "You get a constellation bonus. Whenever an enchantment enters, draw.";
    expect(stripTriggerAbilityLabel(s)).toBe(s);
  });
});

// ─── Detection ───────────────────────────────────────────────────────────────

describe("PERM-ENTERS — detection", () => {
  const triggers = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle });

  it("detects artifact-ETB trigger", () => {
    const ds = triggers("Whenever an artifact you control enters, put a +1/+1 counter on this creature.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "permanentEnters", permanentFilter: "artifact", scope: "artifactYouControl" });
  });

  it("detects enchantment-ETB trigger (bare form)", () => {
    const ds = triggers("Whenever an enchantment you control enters, you gain 2 life.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "permanentEnters", permanentFilter: "enchantment", scope: "enchantmentYouControl" });
  });

  it("detects Constellation — prefixed enchantment-ETB", () => {
    const ds = triggers("Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on this creature.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "permanentEnters", permanentFilter: "enchantment", scope: "enchantmentYouControl" });
  });

  it("SPLITS an Eerie compound — the enchantment-enters half detects; the unmodeled 'unlock a room' half keeps the card non-native", () => {
    // COMPOUND TRIGGER (CR 603.1): two INDEPENDENT abilities sharing an effect line. The "enchantment you control
    // enters → draw" half is modeled and now detected; the "fully unlock a room" half is unmodeled, so detectTriggers
    // returns only the modeled half and coverage's count reconciliation keeps the whole card non-native (CREED — the
    // unlock half is never silently claimed native).
    const ds = triggers("Eerie — Whenever an enchantment you control enters and whenever you fully unlock a room, draw a card.");
    expect(ds.map((t) => t.event)).toEqual(["permanentEnters"]);
  });

  it("COMPOUND both-halves-modeled flips NATIVE (Up the Beanstalk) — splits 'When A and whenever B, draw' into two firing triggers", () => {
    const beanstalk = { name: "Up the Beanstalk", type: "Enchantment", mana: "{1}{G}", oracle: "When this enchantment enters and whenever you cast a spell with mana value 5 or greater, draw a card." };
    expect(detectTriggers(beanstalk).map((t) => t.event).sort()).toEqual(["cast", "etb"]); // both real abilities detected
    expect(classifyCard(beanstalk)).toBe("native-trigger");
  });

  it("does NOT detect bare 'an artifact enters' (no controller gate)", () => {
    const ds = triggers("Whenever an artifact enters the battlefield, put a +1/+1 counter on this creature.");
    expect(ds).toHaveLength(0);
  });
});

// ─── Coverage flips ───────────────────────────────────────────────────────────

describe("PERM-ENTERS — coverage flips", () => {
  it("Reckless-Fireweaver-style artifact-ETB flip native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Human Artificer",
      name: "Test Fireweaver",
      mana: "{1}{R}",
      oracle: "Whenever an artifact you control enters, this creature deals 1 damage to each opponent.",
    })).toBe("native-trigger");
  });

  it("Salivating-Gremlins-style (temp buff + keyword) flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Gremlin",
      name: "Test Gremlin",
      mana: "{2}{R}",
      oracle: "Whenever an artifact you control enters, this creature gets +2/+0 and gains trample until end of turn.",
    })).toBe("native-trigger");
  });

  it("Constellation payoff (self-counter) flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Human Warrior",
      name: "Test Champion",
      mana: "{2}{G}",
      oracle: "Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on this creature.",
    })).toBe("native-trigger");
  });

  it("Nexus-Wardens-style life-gain flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Nymph Archer",
      name: "Test Wardens",
      mana: "{2}{G}",
      oracle: "Reach\nConstellation — Whenever an enchantment you control enters, you gain 2 life.",
    })).toBe("native-trigger");
  });

  it("Artifact Creature entering matches artifact watcher (type-line substring)", () => {
    expect(classifyCard({
      type: "Creature — Human Artificer",
      name: "Test Artificer",
      mana: "{2}",
      oracle: "Whenever an artifact you control enters, this creature gets +1/+0 until end of turn.",
    })).toBe("native-trigger");
  });
});

// ─── Engine: fires on the right type, not on others ──────────────────────────

describe("PERM-ENTERS — engine", () => {
  function baseState() {
    return createGameState({ userDeck: [], aiDeck: [] });
  }

  function stateWithWatcher(watcherOracle) {
    const s = baseState();
    const watcher = createPermanent({
      id: "w1",
      card: { id: "cw", name: "Watcher", type: "Creature — Artificer", oracle: watcherOracle, power: 1, toughness: 1 },
      controller: "user",
    });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [watcher] } } };
  }

  function triggerCount(state, enteringCard) {
    const s2 = enterPermanent(state, enteringCard, "user");
    return (s2.pendingTriggers || []).filter(t => t.event === "permanentEnters").length;
  }

  it("artifact-ETB watcher fires when an artifact enters for the same controller", () => {
    const state = stateWithWatcher("Whenever an artifact you control enters, put a +1/+1 counter on this creature.");
    const artifactCard = { id: "art1", name: "Servo", type: "Artifact Creature — Servo", oracle: "", power: 1, toughness: 1 };
    expect(triggerCount(state, artifactCard)).toBe(1);
  });

  it("artifact-ETB watcher does NOT fire when a plain creature enters", () => {
    const state = stateWithWatcher("Whenever an artifact you control enters, put a +1/+1 counter on this creature.");
    const creatureCard = { id: "c1", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 };
    expect(triggerCount(state, creatureCard)).toBe(0);
  });

  it("artifact-ETB watcher fires on Artifact Creature (type-line substring)", () => {
    const state = stateWithWatcher("Whenever an artifact you control enters, this creature gets +2/+0 and gains trample until end of turn.");
    const artifactCreature = { id: "ac1", name: "Construct", type: "Artifact Creature — Construct", oracle: "", power: 0, toughness: 0 };
    expect(triggerCount(state, artifactCreature)).toBe(1);
  });

  it("enchantment-ETB watcher fires when an enchantment enters for the same controller", () => {
    const s = baseState();
    const watcher = createPermanent({
      id: "w2",
      card: { id: "cw2", name: "Enchantress", type: "Creature — Human Druid", oracle: "Constellation — Whenever an enchantment you control enters, you gain 2 life.", power: 0, toughness: 1 },
      controller: "user",
    });
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [watcher] } } };
    const enchCard = { id: "enc1", name: "Aura", type: "Enchantment — Aura", oracle: "", power: 0, toughness: 0 };
    const s2 = enterPermanent(state, enchCard, "user");
    const permEnters = (s2.pendingTriggers || []).filter(t => t.event === "permanentEnters");
    expect(permEnters).toHaveLength(1);
  });

  it("artifact-ETB watcher does NOT fire for an artifact controlled by the opponent", () => {
    const state = stateWithWatcher("Whenever an artifact you control enters, put a +1/+1 counter on this creature.");
    const artifactCard = { id: "art2", name: "Thopter", type: "Artifact Creature — Thopter", oracle: "", power: 1, toughness: 1 };
    // Opponent enters the artifact
    const s2 = enterPermanent(state, artifactCard, "ai");
    const permEnters = (s2.pendingTriggers || []).filter(t => t.event === "permanentEnters");
    expect(permEnters).toHaveLength(0);
  });
});
