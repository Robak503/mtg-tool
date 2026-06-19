/**
 * CMD-CAST (CR 903.3 / 903.8) — casting your commander from the command zone + the {2}-per-prior-cast
 * tax. The command-zone framework existed (the zone, 40 life, 4P seats) but a commander could never be
 * CAST. This adds: `isCommander` rides the card across zones (903.3), a legal cast-from-command action
 * with the escalating tax (903.8), and `fromZone:"command"` dispatch (splice from the zone + bump count).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { pickAction } from "./opponentAI.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CMDR = () => ({ id: "cmdr1", name: "Test General", type: "Legendary Creature — Elemental", mana: "{2}{G}{G}", oracle: "", keywords: [] });

function cmdState({ mana = { G: 6 }, castCount = 0, command } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [], userCommanders: [CMDR()] });
  return {
    ...base,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...base.players,
      user: {
        ...base.players.user,
        manaPool: { ...base.players.user.manaPool, ...mana },
        commanderCastCount: { cmdr1: castCount },
        ...(command !== undefined ? { command } : {}),
      },
    },
  };
}
const cmdCast = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "cmdr1");

describe("CMD-CAST — setup (CR 903.3 designation)", () => {
  it("tags the commander isCommander (rides the card) + initializes the tax counter", () => {
    const s = createGameState({ userDeck: [], aiDeck: [], userCommanders: [CMDR()] });
    expect(s.players.user.command[0].isCommander).toBe(true);
    expect(s.players.user.commanderCastCount).toEqual({});
  });
});

describe("CMD-CAST — the legal action + the {2} tax (CR 903.8)", () => {
  it("offers casting the commander from the command zone for its printed cost (no prior casts)", () => {
    const a = cmdCast(cmdState({ mana: { G: 4 } }));
    expect(a).toBeTruthy();
    expect(a.fromZone).toBe("command");
    expect(a.cost.generic).toBe(2); // {2}{G}{G} — untaxed
  });
  it("adds {2} of generic per previous command-zone cast", () => {
    expect(cmdCast(cmdState({ mana: { G: 6 }, castCount: 1 })).cost.generic).toBe(4); // 2 + {2}
    expect(cmdCast(cmdState({ mana: { G: 8 }, castCount: 2 })).cost.generic).toBe(6); // 2 + {4}
  });
  it("is UNAFFORDABLE (not offered) when mana doesn't cover the TAXED cost", () => {
    // count 1 → needs {4}{G}{G} = 6 mana; only 4 green available
    expect(cmdCast(cmdState({ mana: { G: 4 }, castCount: 1 }))).toBeFalsy();
  });
  it("is sorcery-speed (a creature commander): not offered in combat", () => {
    const s = { ...cmdState({ mana: { G: 4 } }), phase: "combat", step: "beginning-of-combat" };
    expect(cmdCast(s)).toBeFalsy();
  });
});

describe("CMD-CAST — dispatch (cast from the zone + bump the count)", () => {
  it("casts the commander from the command zone, bumps the count, and it enters as a commander", () => {
    let s = cmdState({ mana: { G: 4 } });
    s = dispatchAction(s, cmdCast(s));
    expect(s.players.user.command.find((c) => c.id === "cmdr1")).toBeUndefined(); // left the command zone
    expect(s.players.user.commanderCastCount.cmdr1).toBe(1);                       // tax counter bumped
    expect(s.stack.some((o) => o.kind === "spell")).toBe(true);                    // on the stack

    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "cmdr1");
    expect(perm).toBeTruthy();                  // resolved onto the battlefield
    expect(perm.card.isCommander).toBe(true);   // the designation persists onto the permanent (CR 903.3)
  });

  it("recast costs more: a second cast after a return would be taxed (count escalates)", () => {
    let s = cmdState({ mana: { G: 4 } });
    s = dispatchAction(s, cmdCast(s));
    expect(s.players.user.commanderCastCount.cmdr1).toBe(1); // next cast from the zone would be +{2}
  });
});

describe("CMD-CAST — the AI casts its commander (4b P1 regression)", () => {
  // The AI resolves a chosen cast action's card via cardFromHand; before the fix it only checked the
  // hand, so a commander (in the command zone) was silently skipped → every AI sat on its commander.
  function aiCmdState() {
    const base = createGameState({ userDeck: [], aiDeck: [], aiCommanders: [CMDR()] });
    return {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...base.players, ai: { ...base.players.ai, manaPool: { ...base.players.ai.manaPool, G: 4 }, commanderCastCount: { cmdr1: 0 } } },
    };
  }
  it("pickAction chooses the command-zone cast when the AI can afford its commander", () => {
    const s = aiCmdState();
    const chosen = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(chosen).toBeTruthy();
    expect(chosen.kind).toBe("cast-spell");
    expect(chosen.cardId).toBe("cmdr1");
    expect(chosen.fromZone).toBe("command");
  });
});

describe("CMD-CAST — Standard is untouched", () => {
  it("offers no command-zone cast when the command zone is empty", () => {
    const s = cmdState({ command: [] });
    expect(filterActions(legalActionsForPlayer(s, "user"), "cast-spell").some((a) => a.fromZone === "command")).toBe(false);
  });
});
