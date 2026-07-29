/**
 * earthRumble.test.js — Earth Rumble, and the OPTIONAL FIGHTER half of a fight-pair.
 *
 * "Earthbend 2. When you do, UP TO ONE target creature you control fights target creature an opponent
 * controls."
 *
 * Everything this card needs already existed — earthbend, the CR 603.7 reflexive "when you do" seam, and
 * fight-pair. It fell to LOW on ONE missing arm: "up to one" was supported on the ENEMY side of the pair
 * (Smell Fear) and never on the FIGHTER side. That is the MISSING-SIBLING shape this engine keeps hitting —
 * a modifier wired for one entry point and never applied to its twin.
 *
 * ⚠️ IT NEEDED ITS OWN FLAG. `optionalTarget` is bound to the PRIMARY target in targeting.js, and the
 * fight-pair atom's primary is the ENEMY (role "target") with the fighter as SECONDARY. Reusing
 * optionalTarget would have made the opponent's creature declinable instead — a different card entirely,
 * and one that reads as working until someone checks which half got declined.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EARTH_RUMBLE = {
  name: "Earth Rumble", type: "Sorcery", mana: "{3}{G}",
  oracle: "Earthbend 2. When you do, up to one target creature you control fights target creature an opponent controls. (To earthbend 2, target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped. Creatures that fight each deal damage equal to their power to the other.)",
};
const OPTIONAL = "up to one target creature you control fights target creature an opponent controls";
const REQUIRED = "target creature you control fights target creature an opponent controls";

describe("parsing", () => {
  it("Earth Rumble classifies native — earthbend + the reflexive fight", () => {
    expect(classifyCard(EARTH_RUMBLE)).toBe("native-spell");
    const p = parseEffectClause("earthbend 2. when you do, " + OPTIONAL, "Sorcery", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["earthbend", "fight-pair"]);
  });

  it("⭐ the optionality lands on the FIGHTER half, not the enemy half", () => {
    const [atom] = parseEffectClause(OPTIONAL, "Sorcery", { hasX: false }).atoms;
    expect(atom).toMatchObject({ op: "fight-pair", secondaryRole: "fighter", secondaryOptionalTarget: true });
    // The ENEMY stays mandatory — if this ever flips, the card silently becomes "may fight their creature".
    expect(atom.optionalTarget).toBeUndefined();
  });

  it("the REQUIRED form is untouched (no stray optionality)", () => {
    const [atom] = parseEffectClause(REQUIRED, "Sorcery", { hasX: false }).atoms;
    expect(atom.op).toBe("fight-pair");
    expect(atom.secondaryOptionalTarget).toBeUndefined();
  });
});

describe("⭐ RUNTIME — the decline is real, and it is the FIGHTER being declined", () => {
  const mine = () => createPermanent({ id: "mine", card: { id: "mine", name: "Bear", type: "Creature — Bear", power: 3, toughness: 3, oracle: "" }, controller: "user" });
  const theirs = () => createPermanent({ id: "theirs", card: { id: "theirs", name: "Ogre", type: "Creature — Ogre", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
  function board(myBattlefield) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: myBattlefield }, ai: { ...s.players.ai, battlefield: [theirs()] } } };
  }
  const combos = (clause, myBf) => expandCastChoices(board(myBf), "user", parseEffectClause(clause, "Sorcery", { hasX: false })) || [];

  it("with a fighter available, BOTH fighting and declining are offered", () => {
    expect(combos(OPTIONAL, [mine()])).toHaveLength(2);
  });

  it("⭐ with NO creature at all it is still CASTABLE — the decline is the whole point", () => {
    // Earth Rumble is cast for the earthbend; the fight is a rider you may have no creature for.
    expect(combos(OPTIONAL, [])).toHaveLength(1);
  });

  it("CONTROL — the REQUIRED form with no creature is uncastable", () => {
    // Without this, the assertion above proves nothing: it would pass if the enumerator returned
    // everything unconditionally.
    expect(combos(REQUIRED, [])).toHaveLength(0);
  });

  it("⭐ a declined fighter resolves as a clean no-op — nothing dies, no fabricated fight", () => {
    const st = board([mine()]);
    const [atom] = parseEffectClause(OPTIONAL, "Sorcery", { hasX: false }).atoms;
    // No targets chosen at all = the declined branch.
    const after = resolveAtom(st, atom, { controller: "user", targets: [], cardName: "Earth Rumble", sourceId: null });
    expect(after.players.user.battlefield).toHaveLength(1);
    expect(after.players.ai.battlefield).toHaveLength(1);
  });
});
