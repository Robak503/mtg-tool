/**
 * GATED-SELFBUFF — "This creature gets +X/+Y as long as you control a/another/N <type>" (Mire Kavu, Loam
 * Lion, Grixis Grimblade, Markov Crusader…) now resolves as a live, layer-correct FIXED self-buff that's
 * applied only WHILE the gate holds — reusing #295's count infra as a threshold instead of a scale. The gate
 * type must be a single bare card-type / basic-land / creature subtype; a color/compound/negated condition
 * stays LOW (Arbiter). "another <type>" excludes the source from its own count.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Put the self-buff creature + any gating permanents on the user's battlefield, return [state, selfPermId].
function board(selfCard, others = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "self", card: selfCard, controller: "user" });
  const perms = [self, ...others.map((c, i) => createPermanent({ id: `o${i}`, card: c, controller: "user" }))];
  return [{ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } }, "self"];
}
const creature = (oracle, type = "Creature — Beast", p = 2, t = 2) => ({ name: "Gated One", type, power: p, toughness: t, oracle });

describe("GATED-SELFBUFF — coverage flips", () => {
  it("a bare 'gets +X/+Y as long as you control a <type>' classifies native", () => {
    expect(classifyCard({ type: "Creature — Cat", name: "Loam Lion", mana: "{W}", oracle: "This creature gets +1/+2 as long as you control a Forest." })).toMatch(/^native/);
    expect(classifyCard({ type: "Creature — Construct", name: "Foundry Screecher", mana: "{4}{B}", oracle: "Flying\nThis creature gets +1/+0 as long as you control an artifact." })).toMatch(/^native/);
  });
  it("a color / compound / negated gate stays body-only (LOW → Arbiter)", () => {
    expect(classifyCard({ type: "Creature — Cleric", name: "Gearsmith Guardian", mana: "{4}{U}", oracle: "This creature gets +2/+0 as long as you control a blue creature." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Beast", name: "Scoria Cat", mana: "{3}{R}", oracle: "This creature gets +3/+3 as long as you control no untapped lands." })).toBe("body-only");
  });
});

describe("GATED-SELFBUFF — layer: the buff is live + gated", () => {
  it("applies the buff only while the gating type is on the battlefield", () => {
    const [withArt] = board(creature("This creature gets +2/+2 as long as you control an artifact.", "Creature — Beast", 2, 2), [{ name: "Bauble", type: "Artifact" }]);
    expect(permanentPower(withArt, "self")).toBe(4);
    expect(permanentToughness(withArt, "self")).toBe(4);
    const [noArt] = board(creature("This creature gets +2/+2 as long as you control an artifact.", "Creature — Beast", 2, 2), []);
    expect(permanentPower(noArt, "self")).toBe(2); // gate not met → printed body
  });
  it("counts the source itself for 'a <type>' (a Swamp creature controlling itself)", () => {
    const [s] = board(creature("This creature gets +1/+1 as long as you control a Swamp.", "Creature — Zombie", 2, 2), [{ name: "Swamp", type: "Basic Land — Swamp" }]);
    expect(permanentPower(s, "self")).toBe(3);
  });
  it("'another <type>' EXCLUDES the source: a lone Vampire gets nothing, a second turns it on", () => {
    const vamp = creature("This creature gets +1/+1 as long as you control another Vampire.", "Creature — Vampire", 2, 2);
    const [lone] = board(vamp, []);
    expect(permanentPower(lone, "self")).toBe(2); // only itself → excluded → gate closed
    const [pair] = board(vamp, [{ name: "Bat", type: "Creature — Vampire" }]);
    expect(permanentPower(pair, "self")).toBe(3); // a second Vampire → gate open
  });
  it("'two or more <type>' needs the threshold", () => {
    const c = creature("This creature gets +3/+0 as long as you control two or more Goblins.", "Creature — Goblin", 1, 1);
    const [one] = board(c, []); // itself = 1 Goblin
    expect(permanentPower(one, "self")).toBe(1);
    const [three] = board(c, [{ name: "Gob", type: "Creature — Goblin" }, { name: "Gob2", type: "Creature — Goblin" }]);
    expect(permanentPower(three, "self")).toBe(4); // 3 Goblins ≥ 2
  });
});
