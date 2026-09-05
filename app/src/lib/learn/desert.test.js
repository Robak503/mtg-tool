/**
 * DESERT — the combat-step activation rider. SHELF-85 · Phase 3 (Hulk Smash), 2026-09-05.
 * "{T}: Add {C}. / {T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step."
 *
 * The combat-role target (④-AE's window) and the ping existed; the trailing "Activate only during the <step> step" rider
 * sat in the effect text and dragged it LOW. The ability parser peels it into `combatStepOnly` (the engine's step key) and
 * the offer gate opens the ability in EXACTLY that step of the combat window — never the main phase, never another step.
 *
 * Mutation-checked: see the run ledger (docs-sk113).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DESERT = { id: "c-des", name: "Desert", type: "Land — Desert", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: This land deals 1 damage to target attacking creature. Activate only during the end of combat step." };

describe("the ability parser", () => {
  it("the ping carries combatStepOnly 'end-of-combat' with a clean effect and stays modeled; Desert flips native", () => {
    const abs = parseActivatedAbilities(DESERT);
    const ping = abs.find((a) => /deals 1 damage/i.test(a.effectClause));
    const row = { count: abs.length, effect: ping?.effectClause, step: ping?.combatStepOnly, modeled: ping?.modeled, tier: classifyCard(DESERT) };
    console.log("  WITNESS desert", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.count).toBe(2);
    expect(row.effect).toBe("This land deals 1 damage to target attacking creature");
    expect(row.step).toBe("end-of-combat");
    expect(row.modeled).toBe(true);
    expect(row.tier).toBe("land"); // the land tier IS a native tier (NATIVE_TIERS) — a land-partial became a whole land
  });
});

function board(step, phase = "combat") {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const desert = createPermanent({ id: "des", card: DESERT, controller: "user" });
  const attacker = createPermanent({ id: "atk", card: { id: "c-atk", name: "Raider", type: "Creature — Orc", mana: "{1}{R}", power: 2, toughness: 1, keywords: [], oracle: "" }, controller: "ai", summoningSick: false });
  return { ...s0, phase, step, activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [desert] }, ai: { ...s0.players.ai, battlefield: [attacker] } },
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
}
const pings = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "des" && x.targets?.length);

describe("RUNTIME — offered only in the end of combat step; the ping resolves", () => {
  it("end of combat: offered (one target, the attacker); resolving kills the 2/1; declare blockers and combat damage: not offered; the defender's own main: not offered", () => {
    const eoc = board("end-of-combat");
    const offered = pings(eoc);
    const out = offered.length ? resolveTopOfStack(dispatchAction(eoc, offered[0])) : eoc;
    const row = { eoc: offered.map((x) => x.targets[0].id), dead: !findPermanent(out, "atk"), blockers: pings(board("declare-blockers")).length, damage: pings(board("combat-damage")).length, main: pings({ ...board("main", "precombat-main"), activePlayer: "user", combat: { attackers: [], blockers: [] } }).length };
    console.log("  WITNESS desertWindow", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ eoc: ["atk"], dead: true, blockers: 0, damage: 0, main: 0 });
  });
});
