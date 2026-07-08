/**
 * ===== SAC-X-SUBTYPE activated cost (γ1e) + NEGATIVE symmetric X-pump ("-X/-X") =====
 *
 * A thin extension to the activated-ability subsystem (effects/abilities.js) + the X-pump parser
 * (effects/parser.js) + the pump resolver (effects/atoms/combat.js), riding the already-shipped activate-
 * ability runtime (legalChoices.actionsActivateAbility → actionDispatcher.applyActivateAbility →
 * resolveTopOfStack). No new effect atom — the existing `pump` atom's amountX path gains a negative flavor.
 *
 * THE CARD — Grim Hireling ("{B}, Sacrifice X Treasures: Target creature gets -X/-X until end of turn.
 * Activate only as a sorcery."): the PLAYER chooses X (how many Treasures to sacrifice), and that SAME X is
 * the magnitude of the -X/-X. Three coupled pieces:
 *
 *   1. SAC-X-SUBTYPE COST (parseAbilityCost γ1e) — "Sacrifice X <fungible subtype>" (a VARIABLE count of a
 *      fungible value-TOKEN subtype: Treasure/Clue/Food/…). Interchangeable tokens, so paying X is a NO-
 *      DECISION cost given a chosen X (CR 701.16). legalChoices offers ONE action per affordable X (1..
 *      available), auto-picking X victims (target-overlap + leave-trigger-fail-safe aware); the dispatcher
 *      sacrifices each via the existing sacCountIds path. A sac-X of a DISTINGUISHABLE / non-fungible class
 *      ("Sacrifice X creatures/lands/artifacts") stays UNMODELED → Arbiter (a real choice the auto-pick can't
 *      make — CREED).
 *
 *   2. NEGATIVE symmetric X-pump (parser rewriteAmountX "-X/-X" → amountXNeg) — the effect "-X/-X" binds both
 *      pips to -ctx.xValue. applyPumpEffect subtracts X on both stats and runs the lethal SBA (CR 704.5f), so
 *      an X large enough drops the target's derived toughness to <=0 and it dies.
 *
 *   3. X THREADING — the chosen X threads action.xValue → dispatcher params.xValue → runEffectProgram ctx.xValue,
 *      so the "-X/-X" applies the EXACT X the player paid in sacrificed Treasures (no drift between cost and
 *      effect).
 *
 * CREED (CLAUDE.md §1.2/§8): whole-card or PARK. The sac-X ability is `modeled` ONLY when its effect is an
 * X-SCALED (xSpell) HIGH program — an effect that doesn't consume X (a fixed effect under a sac-X cost) leaves
 * the paid X with no payoff (a half-model) and is NOT modeled. The CREED pins below prove a non-fungible sac-X
 * class and a non-X effect STAY body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const treasure = (id) => createPermanent({
  id, controller: "user",
  card: { id: "c-" + id, name: "Treasure", type: "Token Artifact — Treasure", token: true, oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
});
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const activateActions = (state, permId, playerId = "user") =>
  legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability" && a.permanentId === permId);

const GRIM = {
  id: "c-gr", name: "Grim Hireling", type: "Creature — Tiefling Rogue", power: 3, toughness: 3,
  oracle: "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.\n{B}, Sacrifice X Treasures: Target creature gets -X/-X until end of turn. Activate only as a sorcery.",
};
const grimPerm = () => createPermanent({ id: "gr", card: GRIM, controller: "user", summoningSick: false });
const enemy = (id, name, p, t) => createPermanent({ id, controller: "ai", summoningSick: false, card: { id: "c-" + id, name, type: "Creature — Beast", power: p, toughness: t, oracle: "" } });

// ────────────────────────────────────────────────────────────────────────────
// 1. parseAbilityCost — sac-X-subtype shape
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-X-SUBTYPE — cost parsing (γ1e)", () => {
  it("'{B}, Sacrifice X Treasures' → mana {B} + sacX(treasure)", () => {
    expect(parseAbilityCost("{B}, Sacrifice X Treasures")).toMatchObject({
      manaPips: "{B}", sacX: { type: "permanent", subtype: "treasure" }, sacCount: null,
    });
  });
  it("'Sacrifice X Foods' (no mana, plural) → sacX(food)", () => {
    expect(parseAbilityCost("Sacrifice X Foods")).toMatchObject({ manaPips: "", sacX: { type: "permanent", subtype: "food" } });
  });
  // CREED — a distinguishable / non-fungible class sac-X stays UNMODELED (null)
  it("'Sacrifice X creatures' (distinguishable class) → null (real choice, deferred)", () => {
    expect(parseAbilityCost("Sacrifice X creatures")).toBeNull();
  });
  it("'Sacrifice X lands' → null", () => {
    expect(parseAbilityCost("Sacrifice X lands")).toBeNull();
  });
  it("'Sacrifice X artifacts' → null (not a fungible value-token subtype)", () => {
    expect(parseAbilityCost("Sacrifice X artifacts")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. NEGATIVE symmetric X-pump — parser + amountXNeg
// ────────────────────────────────────────────────────────────────────────────
describe("NEGATIVE symmetric X-pump — '-X/-X' parses to an amountXNeg pump", () => {
  it("'Target creature gets -X/-X until end of turn' (hasX) → HIGH pump {amountX, amountXNeg}", () => {
    const p = parseEffectClause("Target creature gets -X/-X until end of turn", "Instant", { hasX: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "pump", targetType: "creature", amountX: true, duration: "endOfTurn", amountXNeg: true }]);
  });
  it("without hasX (no X binder) the '-X/-X' clause stays LOW (a bare X we don't model)", () => {
    const p = parseEffectClause("Target creature gets -X/-X until end of turn", "Instant");
    expect(programConfidence(p)).toBe("low");
  });
  it("the POSITIVE '+X/+X' path is unchanged (no amountXNeg)", () => {
    const p = parseEffectClause("Target creature gets +X/+X until end of turn", "Instant", { hasX: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].amountXNeg).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. parseActivatedAbilities — the sac-X ability is modeled
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-X-SUBTYPE — the activated ability is modeled end to end", () => {
  it("Grim Hireling's sac-X ability is modeled with an X-scaled negative pump program", () => {
    const abils = parseActivatedAbilities(GRIM);
    expect(abils).toHaveLength(1);
    expect(abils[0]).toMatchObject({ modeled: true, needsTarget: true, sacX: { subtype: "treasure" } });
    expect(abils[0].program.atoms[0]).toMatchObject({ op: "pump", amountX: true, amountXNeg: true });
  });
  // CREED — a sac-X cost whose effect is FIXED (doesn't consume X) is NOT modeled (the paid X has no payoff)
  it("CREED — '{B}, Sacrifice X Treasures: Draw a card.' (fixed effect, no X) is NOT modeled", () => {
    const [ab] = parseActivatedAbilities({ name: "T", type: "Creature — Wizard", oracle: "{B}, Sacrifice X Treasures: Draw a card." });
    expect(ab.sacX).toMatchObject({ subtype: "treasure" });
    expect(ab.modeled).toBe(false); // the effect doesn't scale by X → the sac-X choice has no payoff → parked
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. classification — the real-oracle flip + CREED pins
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-X-SUBTYPE — classification (real bundled oracle)", () => {
  it("Grim Hireling → native-mixed (combat-damage-team Treasure trigger + sac-X -X/-X)", () => {
    expect(classifyCard({
      name: "Grim Hireling", type: "Creature — Tiefling Rogue", mana: "{3}{B}",
      oracle: "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.\n{B}, Sacrifice X Treasures: Target creature gets -X/-X until end of turn. Activate only as a sorcery.",
    })).toBe("native-mixed");
  });
  it("CREED — a sac-X of a NON-fungible class ('Sacrifice X creatures: …-X/-X') stays body-only", () => {
    expect(classifyCard({
      name: "Fake", type: "Creature — Wizard", mana: "{2}{B}",
      oracle: "{B}, Sacrifice X creatures: Target creature gets -X/-X until end of turn.",
    })).toBe("body-only");
  });
  it("CREED — a sac-X with a FIXED (non-X) effect stays body-only", () => {
    expect(classifyCard({
      name: "Fake2", type: "Creature — Wizard", mana: "{2}{B}",
      oracle: "{B}, Sacrifice X Treasures: Draw a card.",
    })).toBe("body-only");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. RUNTIME — the player chooses X, X Treasures are cracked, -X/-X lands
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-X-SUBTYPE — runtime (legalChoices → dispatch → resolve)", () => {
  it("offers one action per affordable X (1..available), each carrying that many victim ids + xValue", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [grimPerm(), treasure("t1"), treasure("t2"), treasure("t3")], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } } } };
    // One enemy creature target + the Grim itself → each X (1,2,3) offered per legal target.
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [enemy("vic", "Big", 5, 5)] } } };
    const acts = activateActions(s, "gr");
    const xs = [...new Set(acts.map((a) => a.xValue))].sort();
    expect(xs).toEqual([1, 2, 3]);                                  // X spans 1..(three Treasures)
    const x2 = acts.find((a) => a.xValue === 2 && a.targets.some((t) => t.id === "vic"));
    expect(x2.sacCountIds).toHaveLength(2);                          // exactly 2 victims for X=2
  });

  it("dispatch sacrifices exactly X Treasures + pays {B}, then resolving applies -X/-X (non-lethal survives)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [grimPerm(), treasure("t1"), treasure("t2"), treasure("t3")], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } },
      ai: { ...s.players.ai, battlefield: [enemy("vic", "Big", 5, 5)] } } };
    const act = activateActions(s, "gr").find((a) => a.xValue === 2 && a.targets.some((t) => t.id === "vic"));
    const after = dispatchAction(s, act);
    expect(treasureCount(after, "user")).toBe(1);                   // 3 → 1 (two cracked for the sac)
    expect(after.players.user.graveyard.filter((c) => c.name === "Treasure")).toHaveLength(0); // the cracked TOKENS cease to exist (CR 111.7)
    expect(after.players.user.manaPool.B).toBe(1);                  // {B} paid (2 → 1)
    const resolved = resolveTopOfStack(after);
    const big = resolved.players.ai.battlefield.find((p) => p.id === "vic");
    expect(big).toBeTruthy();                                       // 5/5 → 3/3 survives -2/-2
  });

  it("a lethal X drops the target's toughness to <=0 → it dies (CR 704.5f lethal SBA)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [grimPerm(), treasure("t1"), treasure("t2")], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } },
      ai: { ...s.players.ai, battlefield: [enemy("sm", "Small", 2, 2)] } } };
    const act = activateActions(s, "gr").find((a) => a.xValue === 2 && a.targets.some((t) => t.id === "sm"));
    let after = dispatchAction(s, act);
    after = resolveTopOfStack(after);
    expect(after.players.ai.battlefield.find((p) => p.id === "sm")).toBeUndefined(); // -2/-2 kills the 2/2
    expect(after.players.ai.graveyard.some((c) => c.name === "Small")).toBe(true);
  });

  it("CREED — with ZERO Treasures the ability is NOT offered (X>=1 unpayable)", () => {
    let s = mainState();
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [grimPerm()], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } },
      ai: { ...s.players.ai, battlefield: [enemy("vic", "Big", 5, 5)] } } };
    expect(activateActions(s, "gr")).toHaveLength(0);
  });

  it("CREED — a Treasure cracked for the {B} can NOT also be sacrificed for X (no double-spend)", () => {
    // 2 Treasures, empty pool: the {B} needs 1 Treasure to tap, leaving only 1 sacrificeable → max X = 1.
    let s = mainState();
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [grimPerm(), treasure("t1"), treasure("t2")], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s.players.ai, battlefield: [enemy("vic", "Big", 5, 5)] } } };
    const acts = activateActions(s, "gr").filter((a) => a.targets.some((t) => t.id === "vic"));
    // Only X=1 is payable (1 Treasure taps for {B}, the other is sacrificed); X=2 would need a 3rd source.
    expect([...new Set(acts.map((a) => a.xValue))]).toEqual([1]);
    const after = dispatchAction(s, acts[0]);                       // must NOT throw (no double-spend)
    expect(treasureCount(after, "user")).toBe(0);                   // one tapped for {B}, one sacrificed
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.ai.battlefield.find((p) => p.id === "vic")).toBeTruthy(); // 5/5 → 4/4 survives -1/-1
  });
});
