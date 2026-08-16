/**
 * primalMightXPump.test.js — the X-scaled pump-then-fight (SHELF-TAIL SH23 — Thrun's Primal Might). The fixed-N
 * "Target creature you control gets +N/+N until end of turn. Then it fights up to one target creature you don't
 * control" was already native (matchPumpThenFight → a fight-pair carrying fighterPump). Primal Might is the X
 * form — "+X/+X" — so this widens the matcher to admit both-X, marks the program xSpell (X chosen at cast, CR
 * 601.2b), and the fighterPump binds to the chosen X (ctx.xValue) at resolution via the amountX lane
 * applyPumpEffect already reads. Flip +1/0/0 (Thrun-specific).
 *
 * Mutation-checked (via Edit): (1) drop the X alternation in the matcher → Primal Might arbiter-spell (parse +
 * classify die); (2) neuter the amountX branch in the fighterPump applier → the fighter is NOT pumped, so with
 * X=3 it LOSES the fight it should win (the runtime scaling pin dies).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PRIMAL = "Target creature you control gets +X/+X until end of turn. Then it fights up to one target creature you don't control.";
const FIXED = "Target creature you control gets +2/+2 until end of turn. Then it fights up to one target creature you don't control.";

describe("SH23 — parse + classify", () => {
  it("the X form is an X-spell whose fighterPump binds to X; the fixed form is unchanged", () => {
    const px = parseEffectClause(PRIMAL, "Sorcery", { hasX: true });
    expect(px.xSpell).toBe(true);
    expect(px.atoms[0]).toMatchObject({ op: "fight-pair", fighterPump: { amountX: true } });
    const pf = parseEffectClause(FIXED, "Sorcery");
    expect(pf.xSpell).toBeFalsy();
    expect(pf.atoms[0].fighterPump).toEqual({ power: 2, toughness: 2 });
  });
  it("Primal Might classifies native-spell", () => {
    expect(classifyCard({ name: "Primal Might", type: "Sorcery", mana: "{X}{G}", oracle: PRIMAL })).toBe("native-spell");
  });
});

describe("SH23 — RUNTIME: the X-pump scales the fighter BEFORE the fight (CREED core)", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const fighter = createPermanent({ id: "f", card: { name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const enemy = createPermanent({ id: "e", card: { name: "Ogre", type: "Creature — Ogre", power: "3", toughness: "3", oracle: "" }, controller: "ai", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [fighter] }, ai: { ...s.players.ai, battlefield: [enemy] } } };
  }
  const atom = () => parseEffectClause(PRIMAL, "Sorcery", { hasX: true }).atoms[0];
  const targets = [{ type: "creature", id: "f", role: "fighter" }, { type: "creature", id: "e", role: "target" }];

  it("X=3 → the 2/2 fighter becomes 5/5, KILLS the 3/3 enemy, and survives (3 marked)", () => {
    const after = resolveAtom(board(), atom(), { controller: "user", xValue: 3, targets, cardName: "Primal Might" });
    expect(after.players.ai.battlefield.find((p) => p.id === "e")).toBeUndefined();     // enemy dead (took 5)
    const f = after.players.user.battlefield.find((p) => p.id === "f");
    expect(f).toBeTruthy();                                                              // fighter survived
    expect(f.damageMarked).toBe(3);                                                      // took the enemy's 3, not lethal to a 5/5
  });
  it("CONTROL — X=0 → the 2/2 fighter is NOT pumped, so it dies to the 3/3 enemy (proves the scaling is load-bearing)", () => {
    const after = resolveAtom(board(), atom(), { controller: "user", xValue: 0, targets, cardName: "Primal Might" });
    expect(after.players.user.battlefield.find((p) => p.id === "f")).toBeUndefined();    // fighter dead (took 3 on a 2/2)
    expect(after.players.ai.battlefield.find((p) => p.id === "e")).toBeTruthy();         // enemy survived (took only 2)
  });
});
