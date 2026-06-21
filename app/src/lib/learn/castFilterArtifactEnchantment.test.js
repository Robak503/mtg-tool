/**
 * CAST-FILTER (artifact / enchantment) — extend the modeled cast-trigger spell-type filters beyond
 * instant/sorcery/creature/noncreature to "Whenever you cast an ARTIFACT spell" (improvise/affinity payoffs —
 * Patchwork Automaton, Efficient Construction) and "…an ENCHANTMENT spell" (enchantress payoffs — Generous
 * Visitor, Sigil of the Empty Throne, Blessed Spirits). The cast event + firing already exist; this only
 * teaches castSpellFilter + spellMatchesFilter the two extra types. The payoff (counter / token / gain-life /
 * untap) is already a modeled effect, so the card flips native-trigger.
 *
 * CREED: an Artifact Creature spell IS an artifact spell (type-line substring), so the filter fires on it —
 * matching the CR. A color / subtype / historic / rider filter still stays unmodeled (→ Arbiter).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const castDescriptors = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle }).filter((d) => d.event === "cast");

describe("CAST-FILTER — detection", () => {
  it("detects the artifact / enchantment spell-type filter", () => {
    expect(castDescriptors("Whenever you cast an artifact spell, put a +1/+1 counter on this creature.")[0]).toMatchObject({ whose: "you", spellFilter: "artifact" });
    expect(castDescriptors("Whenever you cast an enchantment spell, put a +1/+1 counter on target creature.")[0]).toMatchObject({ whose: "you", spellFilter: "enchantment" });
  });
});

describe("CAST-FILTER — coverage flips", () => {
  it("an artifact/enchantment cast trigger with a modeled payoff flips native", () => {
    expect(classifyCard({ type: "Artifact Creature — Construct", name: "Patchwork-ish", mana: "{2}", oracle: "Whenever you cast an artifact spell, put a +1/+1 counter on this creature." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Spirit", name: "Blessed-ish", mana: "{3}{W}", oracle: "Flying\nWhenever you cast an enchantment spell, put a +1/+1 counter on this creature." })).toBe("native-trigger");
  });
});

describe("CAST-FILTER — engine: fires on the matching spell type, not others", () => {
  function stateWith(bf) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const fires = (watcherOracle, spellType) => {
    const w = createPermanent({ id: "w", card: { id: "cw", name: "Watcher", type: "Creature — Wizard", power: 1, toughness: 1, oracle: watcherOracle }, controller: "user" });
    return (checkCastTriggers(stateWith([w]), { spellCard: { name: "S", type: spellType }, casterId: "user" }).pendingTriggers || []).length;
  };
  it("an artifact-cast watcher fires on an artifact (incl. Artifact Creature) spell, not on an instant", () => {
    const o = "Whenever you cast an artifact spell, put a +1/+1 counter on this creature.";
    expect(fires(o, "Artifact")).toBe(1);
    expect(fires(o, "Artifact Creature — Golem")).toBe(1);
    expect(fires(o, "Instant")).toBe(0);
  });
  it("an enchantment-cast watcher fires on an enchantment spell, not on a creature", () => {
    const o = "Whenever you cast an enchantment spell, put a +1/+1 counter on this creature.";
    expect(fires(o, "Enchantment")).toBe(1);
    expect(fires(o, "Enchantment Creature — God")).toBe(1);
    expect(fires(o, "Creature — Bear")).toBe(0);
  });
});
