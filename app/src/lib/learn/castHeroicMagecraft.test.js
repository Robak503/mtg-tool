/**
 * CAST-HEROIC — two new cast-trigger conditions:
 *
 * 1. HEROIC (CR 702.35): "Whenever you cast a spell that targets this creature, <effect>"
 *    Fires when the controller casts a spell that has this permanent as a chosen target.
 *    The "Heroic —" ability-word label (CR 207.2c) is stripped by stripTriggerAbilityLabel.
 *    Engine: checkCastTriggers scans action.targets for heroic-bearing permanents the caster
 *    controls and fires their triggers (scope:"self", whose:"you").
 *
 * 2. MAGECRAFT (CR 702.173): "Whenever you cast or copy an instant or sorcery spell, <effect>"
 *    Routes to the existing event:"cast" + spellFilter:"instantSorcery" path; the "copy" half
 *    (CR 706.10) is a safe false-negative — the engine only fires on cast.
 *    The "Magecraft —" ability-word label is stripped by stripTriggerAbilityLabel.
 *
 * CREED guard: a trailing rider on heroic ("that targets this creature and another target")
 * stays UNDETECTED → Arbiter. A heroic trigger with an unmodeled effect (e.g. become a copy,
 * land animation) also stays body-only — no silent partial.
 *
 * Immediate corpus flips: +17 heroic + +10 magecraft = +27 cards.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, stripTriggerAbilityLabel, checkCastTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── helpers ─────────────────────────────────────────────────────────────────

const cr = (oracle, type = "Creature — Human Warrior", p = 1, t = 1) => ({
  id: "hero-1", name: "Test Hero", type, power: p, toughness: t, oracle,
});
const inst = (oracle) => ({ id: "sp-1", name: "Test Spell", type: "Instant", oracle });

function boardWith(heroCard, extraPerms = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "hero", card: heroCard, controller: "user" });
  const bf = [self, ...extraPerms];
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}

function castTargetingHero(state, spellCard, casterId = "user") {
  return checkCastTriggers(state, {
    spellCard,
    casterId,
    targets: [{ id: "hero" }],
  });
}

// ─── ability-label strip ──────────────────────────────────────────────────────

describe("stripTriggerAbilityLabel — Heroic / Magecraft labels", () => {
  it("strips 'Heroic —' so the trigger regex sees bare 'Whenever'", () => {
    const stripped = stripTriggerAbilityLabel(
      "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.",
    );
    expect(stripped).not.toMatch(/^Heroic/i);
    expect(stripped).toMatch(/^Whenever/);
  });
  it("strips 'Magecraft —' so the trigger regex sees bare 'Whenever'", () => {
    const stripped = stripTriggerAbilityLabel(
      "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+0 until end of turn.",
    );
    expect(stripped).not.toMatch(/^Magecraft/i);
    expect(stripped).toMatch(/^Whenever/);
  });
  it("is case-insensitive and handles em-dash / en-dash", () => {
    expect(stripTriggerAbilityLabel("heroic — Whenever")).toMatch(/^Whenever/);
    expect(stripTriggerAbilityLabel("MAGECRAFT – Whenever")).toMatch(/^Whenever/);
  });
});

// ─── trigger detection ────────────────────────────────────────────────────────

describe("detectTriggers — heroic condition", () => {
  it("detects the heroic trigger on a creature with a +1/+1 counter effect", () => {
    const triggers = detectTriggers(
      cr("Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature."),
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0].event).toBe("heroic");
    expect(triggers[0].effectClause).toContain("+1/+1 counter on this creature");
  });

  it("detects heroic on Lagonna-Band Trailblazer (real card)", () => {
    const lagonna = {
      id: "lt", name: "Lagonna-Band Trailblazer", type: "Creature — Centaur Scout", power: 0, toughness: 4,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on it.",
    };
    const triggers = detectTriggers(lagonna);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].event).toBe("heroic");
  });

  it("does NOT detect heroic with a trailing rider (safe false-negative)", () => {
    const triggers = detectTriggers(
      cr("Heroic — Whenever you cast a spell that targets this creature and another target, put a +1/+1 counter on this creature."),
    );
    expect(triggers.filter(d => d.event === "heroic")).toHaveLength(0);
  });

  it("does NOT detect heroic on a creature without heroic text", () => {
    const triggers = detectTriggers(cr("Flying."));
    expect(triggers.filter(d => d.event === "heroic")).toHaveLength(0);
  });
});

describe("detectTriggers — magecraft condition", () => {
  it("detects magecraft as a cast+instantSorcery event", () => {
    const triggers = detectTriggers(
      cr("Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+0 until end of turn."),
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0].event).toBe("cast");
    expect(triggers[0].spellFilter).toBe("instantSorcery");
    expect(triggers[0].whose).toBe("you");
  });

  it("detects magecraft on Leonin Lightscribe (real card)", () => {
    const leonin = {
      id: "ll", name: "Leonin Lightscribe", type: "Creature — Cat Cleric", power: 2, toughness: 2,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, creatures you control get +1/+1 until end of turn.",
    };
    const triggers = detectTriggers(leonin);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].event).toBe("cast");
    expect(triggers[0].spellFilter).toBe("instantSorcery");
  });

  it("does NOT detect a bare non-instant/sorcery magecraft (stays body-only, safe false-negative)", () => {
    const triggers = detectTriggers(
      cr("Magecraft — Whenever you cast or copy an instant or sorcery spell, that player discards a card."),
    );
    // "that player" → unmodeled effect → triggerRoutesNatively=false → doesn't flip native
    expect(triggers).toHaveLength(1); // detected but effect is LOW → won't flip coverage
    expect(triggers[0].event).toBe("cast");
  });
});

// ─── coverage flips ───────────────────────────────────────────────────────────

describe("CAST-HEROIC — coverage flips (real cards)", () => {
  it("Lagonna-Band Trailblazer — heroic +1/+1 counter flips native", () => {
    expect(classifyCard({
      name: "Lagonna-Band Trailblazer", type: "Creature — Centaur Scout", power: 0, toughness: 4,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on it.",
    })).toMatch(/^native/);
  });

  it("Centaur Battlemaster — heroic 3 counters flips native", () => {
    expect(classifyCard({
      name: "Centaur Battlemaster", type: "Creature — Centaur Warrior", power: 2, toughness: 2,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, put three +1/+1 counters on this creature.",
    })).toMatch(/^native/);
  });

  it("Battlewise Hoplite — heroic counter + scry flips native", () => {
    expect(classifyCard({
      name: "Battlewise Hoplite", type: "Creature — Human Soldier", power: 2, toughness: 2,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature, then scry 1.",
    })).toMatch(/^native/);
  });

  it("Setessan Battle Priest — heroic gain 2 life flips native", () => {
    expect(classifyCard({
      name: "Setessan Battle Priest", type: "Creature — Human Cleric", power: 1, toughness: 2,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, you gain 2 life.",
    })).toMatch(/^native/);
  });

  it("Phalanx Leader — heroic counter on ALL creatures flips native", () => {
    expect(classifyCard({
      name: "Phalanx Leader", type: "Creature — Human Soldier", power: 1, toughness: 1,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on each creature you control.",
    })).toMatch(/^native/);
  });

  it("Elite Skirmisher — heroic tap target creature flips native", () => {
    expect(classifyCard({
      name: "Elite Skirmisher", type: "Creature — Human Soldier", power: 1, toughness: 1,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, you may tap target creature.",
    })).toMatch(/^native/);
  });

  it("Ashiok's Adept — heroic each opponent discards a card flips native", () => {
    expect(classifyCard({
      name: "Ashiok's Adept", type: "Creature — Human Wizard", power: 1, toughness: 3,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, each opponent discards a card.",
    })).toMatch(/^native/);
  });

  it("Akroan Crusader — heroic create 1/1 token flips native", () => {
    expect(classifyCard({
      name: "Akroan Crusader", type: "Creature — Human Soldier", power: 1, toughness: 1,
      oracle: 'Heroic — Whenever you cast a spell that targets this creature, create a 1/1 red Soldier creature token with haste.',
    })).toMatch(/^native/);
  });
});

describe("CAST-HEROIC — magecraft coverage flips (real cards)", () => {
  it("Leonin Lightscribe — magecraft team pump flips native", () => {
    expect(classifyCard({
      name: "Leonin Lightscribe", type: "Creature — Cat Cleric", power: 2, toughness: 2,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, creatures you control get +1/+1 until end of turn.",
    })).toMatch(/^native/);
  });

  it("Witherbloom Apprentice — magecraft drain 1 flips native", () => {
    expect(classifyCard({
      name: "Witherbloom Apprentice", type: "Creature — Human Druid", power: 1, toughness: 3,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, each opponent loses 1 life and you gain 1 life.",
    })).toMatch(/^native/);
  });

  it("Clever Lumimancer — magecraft +2/+2 to self flips native", () => {
    expect(classifyCard({
      name: "Clever Lumimancer", type: "Creature — Human Wizard", power: 0, toughness: 1,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +2/+2 until end of turn.",
    })).toMatch(/^native/);
  });

  it("Eager First-Year — magecraft self +1/+0 flips native", () => {
    expect(classifyCard({
      name: "Eager First-Year", type: "Creature — Human Wizard", power: 1, toughness: 2,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+0 until end of turn.",
    })).toMatch(/^native/);
  });

  it("Storm-Kiln Artist — magecraft create Treasure flips native", () => {
    expect(classifyCard({
      name: "Storm-Kiln Artist", type: "Creature — Dwarf Shaman", power: 1, toughness: 1,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")",
    })).toMatch(/^native/);
  });

  it("Witherbloom Pledgemage — magecraft gain 1 life flips native", () => {
    expect(classifyCard({
      name: "Witherbloom Pledgemage", type: "Creature — Vampire Druid", power: 1, toughness: 2,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, you gain 1 life.",
    })).toMatch(/^native/);
  });
});

// ─── CREED: unmodeled riders stay body-only ───────────────────────────────────

describe("CAST-HEROIC — CREED: unmodeled effects stay body-only", () => {
  it("heroic that animates lands stays body-only (effect is LOW)", () => {
    expect(classifyCard({
      name: "Anthousa, Setessan Hero", type: "Creature — Human Warrior", power: 4, toughness: 5,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, up to three target lands you control each become 2/2 Warrior creatures until end of turn.",
    })).toBe("body-only");
  });

  it("heroic that gains control of a creature stays body-only (effect is LOW)", () => {
    expect(classifyCard({
      name: "Akroan Conscriptor", type: "Creature — Human Shaman", power: 2, toughness: 2,
      oracle: "Heroic — Whenever you cast a spell that targets this creature, gain control of another target creature until end of turn. Untap that creature. It gains haste until end of turn.",
    })).toBe("body-only");
  });

  it("magecraft with 'that player' reference stays body-only (unmodeled scope)", () => {
    expect(classifyCard({
      name: "Zaffai Stub", type: "Creature — Human Shaman", power: 3, toughness: 2,
      oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, scry 1. If that spell's mana value is 5 or greater, create a 4/4 blue and red Elemental creature token.",
    })).toBe("body-only");
  });
});

// ─── engine: heroic fires when you cast a targeting spell ────────────────────

describe("CAST-HEROIC — engine: heroic trigger fires and resolves", () => {
  const HEROIC_COUNTER = cr(
    "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.",
    "Creature — Human Warrior", 1, 1,
  );
  const PUMP_SPELL = inst("Target creature you control gets +2/+2 until end of turn.");

  it("casting a targeting spell fires the heroic trigger", () => {
    const state = boardWith(HEROIC_COUNTER);
    const after = castTargetingHero(state, PUMP_SPELL);
    expect(after.pendingTriggers?.length).toBeGreaterThanOrEqual(1);
    const heroicTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "heroic");
    expect(heroicTrig).toBeDefined();
  });

  it("casting a spell that does NOT target the hero does NOT fire heroic", () => {
    const state = boardWith(HEROIC_COUNTER);
    // No targets → no heroic fire
    const after = checkCastTriggers(state, { spellCard: PUMP_SPELL, casterId: "user", targets: [] });
    const heroicTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "heroic");
    expect(heroicTrig).toBeUndefined();
  });

  it("targeting an OPPONENT's creature does NOT fire heroic (only controller's own)", () => {
    const state = boardWith(HEROIC_COUNTER);
    // Cast from ai targeting hero — heroic only fires if casterId === controller
    const after = checkCastTriggers(state, {
      spellCard: PUMP_SPELL,
      casterId: "ai",        // opponent is the caster
      targets: [{ id: "hero" }],
    });
    const heroicTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "heroic");
    expect(heroicTrig).toBeUndefined();
  });

  it("multiple targets — heroic fires once per targeted heroic permanent", () => {
    const HEROIC_2 = { ...HEROIC_COUNTER, id: "hero-2", name: "Hero 2" };
    const perm2 = createPermanent({ id: "hero-2", card: HEROIC_2, controller: "user" });
    const state = boardWith(HEROIC_COUNTER, [perm2]);
    const after = checkCastTriggers(state, {
      spellCard: PUMP_SPELL,
      casterId: "user",
      targets: [{ id: "hero" }, { id: "hero-2" }],
    });
    const heroicTrigs = after.pendingTriggers?.filter(t => t.descriptor?.event === "heroic") || [];
    expect(heroicTrigs).toHaveLength(2);
  });
});

// ─── engine: magecraft fires on instant/sorcery cast ─────────────────────────

describe("CAST-HEROIC — engine: magecraft fires via cast event", () => {
  const MAGECRAFT_CARD = cr(
    "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+0 until end of turn.",
    "Creature — Human Wizard", 1, 1,
  );
  const SORCERY = { id: "sp-2", name: "Ponder", type: "Sorcery", oracle: "Look at the top 3 cards of your library..." };
  const CREATURE_SPELL = { id: "sp-3", name: "Bear", type: "Creature — Bear", oracle: "" };

  it("casting an instant fires magecraft", () => {
    const state = boardWith(MAGECRAFT_CARD);
    const after = checkCastTriggers(state, { spellCard: inst("Target player draws a card."), casterId: "user", targets: [] });
    const mcTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "cast");
    expect(mcTrig).toBeDefined();
  });

  it("casting a sorcery fires magecraft", () => {
    const state = boardWith(MAGECRAFT_CARD);
    const after = checkCastTriggers(state, { spellCard: SORCERY, casterId: "user", targets: [] });
    const mcTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "cast");
    expect(mcTrig).toBeDefined();
  });

  it("casting a creature spell does NOT fire magecraft", () => {
    const state = boardWith(MAGECRAFT_CARD);
    const after = checkCastTriggers(state, { spellCard: CREATURE_SPELL, casterId: "user", targets: [] });
    const mcTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "cast" && t.descriptor?.spellFilter === "instantSorcery");
    expect(mcTrig).toBeUndefined();
  });

  it("opponent casting a sorcery does NOT fire your magecraft", () => {
    const state = boardWith(MAGECRAFT_CARD);
    const after = checkCastTriggers(state, { spellCard: SORCERY, casterId: "ai", targets: [] });
    const mcTrig = after.pendingTriggers?.find(t => t.descriptor?.event === "cast");
    expect(mcTrig).toBeUndefined();
  });
});
