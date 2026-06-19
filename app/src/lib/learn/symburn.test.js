/**
 * SYMBURN-1 — symmetric burn: "deals N damage to each creature and each player" (Inferno, Fire
 * Tempest, Evincar's Justice). A new `eachCreatureAndPlayer` damage target that hits every creature on
 * every battlefield AND every player INCLUDING the caster ("each player" ≠ "each opponent"). Bare form
 * only; a qualifier/partial falls through to the each-bail → LOW → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programNeedsChosenTarget } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

describe("SYMBURN-1 — classification", () => {
  it("'each creature and each player' damage flips native-spell, non-targeted, FULL scope (no dropped half)", () => {
    for (const name of ["Inferno", "Fire Tempest", "Evincar's Justice"]) {
      const c = { type: "Sorcery", name, oracle: `${name} deals 6 damage to each creature and each player.` };
      expect(classifyCard(c)).toBe("native-spell");
      const p = parseEffectProgram(c);
      expect(programNeedsChosenTarget(p)).toBe(false); // mass = no chosen target
      // CREED anti-drop pin: the atom must carry the COMBINED scope — if the " and each player" half were
      // severed by the splitter, this would be "eachCreature" (a confident WRONG partial that skips the
      // player damage). One atom, full scope.
      expect(p.atoms).toEqual([{ op: "deal-damage", amount: 6, targetType: "eachCreatureAndPlayer" }]);
    }
  });
  it("MUST stay arbiter — a qualified variant or the each-player-only partial", () => {
    expect(classifyCard({ type: "Sorcery", name: "X", oracle: "X deals 2 damage to each creature and each player that doesn't control a Mountain." })).toBe("arbiter-spell");
    expect(classifyCard({ type: "Sorcery", name: "Y", oracle: "Y deals 2 damage to each player." })).toBe("arbiter-spell"); // each-player-only isn't modeled
  });
  it("HARDENING — a leading effect joined by ' and ' is NOT swallowed (no dropped clause)", () => {
    // Tail-only anchoring would keep this whole and parse it to ONLY [deal-damage], silently dropping
    // "You gain 5 life" — the CREED-forbidden confident-wrong partial. The subject-prefix " and " guard
    // forces it through the splitter instead (→ "each player" unmodeled → low → Arbiter).
    const c = { type: "Sorcery", name: "Foo", oracle: "You gain 5 life and Foo deals 3 damage to each creature and each player." };
    expect(classifyCard(c)).not.toBe("native-spell");
    expect(parseEffectProgram(c).atoms).not.toEqual([{ op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlayer" }]);
  });
  it("a plain 'each creature' burn (Pyroclasm) is unchanged — still native", () => {
    expect(classifyCard({ type: "Sorcery", name: "Pyroclasm", oracle: "Pyroclasm deals 2 damage to each creature." })).toBe("native-spell");
  });
});

describe("SYMBURN-1 — engine-first: every creature AND every player (incl. the controller) takes the damage", () => {
  it("via the real ATOM_RESOLVERS runtime (the path spell/activated/trigger all dispatch through)", () => {
    const userBear = createPermanent({ id: "uc", card: { id: "cuc", name: "U Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const userGiant = createPermanent({ id: "ub", card: { id: "cub", name: "U Giant", type: "Creature — Giant", power: 4, toughness: 5, oracle: "" }, controller: "user" });
    const aiBear = createPermanent({ id: "ac", card: { id: "cac", name: "A Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [userBear, userGiant], life: 20 }, ai: { ...s.players.ai, battlefield: [aiBear], life: 20 } } };

    // ctx.controller = "user" (the source's controller, e.g. Thrashing Wumpus's owner) — it must STILL
    // take the damage; "each player" is symmetric, not "each opponent".
    s = ATOM_RESOLVERS["deal-damage"](s, { op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlayer" }, { controller: "user", targets: [] });

    expect(s.players.user.life).toBe(17);  // the CONTROLLER takes it too
    expect(s.players.ai.life).toBe(17);
    const userBf = s.players.user.battlefield.map((p) => p.card.name);
    expect(userBf).toContain("U Giant");   // 3 < 5 toughness → survives
    expect(userBf).not.toContain("U Bear"); // 3 ≥ 2 → dies
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("A Bear"); // dies
  });
});
