/**
 * KINNAN FILLS — POD-SIM THREE · KN-4 (2026-09-05): Treasure Vault · Moonsilver Key · Cephalid Coliseum.
 *
 * Treasure Vault — "{X}{X}, {T}, Sacrifice this land: Create X Treasure tokens." A run of X pips owes 2X (CR 107.3); the
 * bare "Create X Treasure tokens" reads X off the activation.
 * Moonsilver Key — "…Search your library for an artifact card with a mana ability or a basic land card…" — the artifact
 * group demands a printed mana ability (Sol Ring yes, Swiftfoot Boots no); a basic land qualifies, a nonbasic does not.
 * Cephalid Coliseum — threshold-gated sac: "Target player draws three cards, then discards three cards" as ONE atom for
 * the SAME player; "Activate only if there are seven or more cards in your graveyard" read at activation.
 *
 * Mutation-checked: see the run ledger (docs-sk46).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice, resolveDiscardChoice, autoPickDiscardCandidate } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VAULT = { name: "Treasure Vault", type: "Artifact Land", oracle: "{T}: Add {C}.\n{X}{X}, {T}, Sacrifice this land: Create X Treasure tokens." };
const KEY = { name: "Moonsilver Key", type: "Artifact", mana: "{2}", cmc: 2, oracle: "{1}, {T}, Sacrifice this artifact: Search your library for an artifact card with a mana ability or a basic land card, reveal it, put it into your hand, then shuffle." };
const COLISEUM = { name: "Cephalid Coliseum", type: "Land", oracle: "{T}: Add {U}. This land deals 1 damage to you.\nThreshold — {U}, {T}, Sacrifice this land: Target player draws three cards, then discards three cards. Activate only if there are seven or more cards in your graveyard." };

const perm = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const filler = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`, type: "Sorcery", cmc: 1 }));
function state({ userBf = [], userPool = {}, userLib = [], userGy = [], aiLib = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: userLib, graveyard: userGy, manaPool: { ...s.players.user.manaPool, ...userPool } },
      ai: { ...s.players.ai, library: aiLib, hand: aiHand },
    },
  };
}
const activations = (s, permId) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.permanentId === permId);
const settle = (s) => { let n = s; while (n.stack.length && !n.pendingChoice) n = resolveTopOfStack(n); return n; };

describe("classify", () => {
  it("Treasure Vault and Cephalid Coliseum are whole lands; Moonsilver Key is native-activated", () => {
    const row = { vault: classifyCard({ ...VAULT, keywords: [] }), key: classifyCard({ ...KEY, keywords: [] }), coliseum: classifyCard({ ...COLISEUM, keywords: [] }) };
    console.log("  WITNESS kn4Classify", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.vault).toBe("land");
    expect(row.key).toBe("native-activated");
    expect(row.coliseum).toBe("land");
  });
});

describe("Treasure Vault — {X}{X} owes 2X, X Treasures", () => {
  it("with six in the pool X = 1..3 are offered (costs 2, 4, 6 — never X = 4); X = 2 makes two Treasures and the Vault is sacrificed", () => {
    const s = state({ userBf: [perm("vault", VAULT)], userPool: { C: 6 } });
    const acts = activations(s, "vault").filter((a) => a.xValue != null);
    const row = { xs: acts.map((a) => a.xValue), costs: acts.map((a) => a.cost?.generic) };
    console.log("  WITNESS vaultX", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.xs).toEqual([1, 2, 3]);
    expect(row.costs).toEqual([2, 4, 6]);
    const after = settle(dispatchAction(s, acts.find((a) => a.xValue === 2)));
    const treasures = after.players.user.battlefield.filter((p) => p.card?.name === "Treasure");
    expect(treasures).toHaveLength(2);
    expect(after.players.user.battlefield.some((p) => p.id === "vault")).toBe(false);
    expect(after.players.user.graveyard.some((c) => c.name === "Treasure Vault")).toBe(true);
    expect(activations(state({ userBf: [perm("vault", VAULT)], userPool: { C: 1 } }), "vault").filter((a) => a.xValue != null)).toHaveLength(0); // one mana funds no X
  });
});

describe("Moonsilver Key — artifact WITH a mana ability, or a basic land", () => {
  it("the pause offers Sol Ring and the Island — never Swiftfoot Boots (no mana ability), Command Tower (nonbasic) or a creature; the pick lands in hand and the Key is sacrificed", () => {
    const lib = [
      { id: "sol", name: "Sol Ring", type: "Artifact", cmc: 1, oracle: "{T}: Add {C}{C}." },
      { id: "boots", name: "Swiftfoot Boots", type: "Artifact — Equipment", cmc: 2, oracle: "Equipped creature has hexproof and haste.\nEquip {1}" },
      { id: "isl", name: "Island", type: "Basic Land — Island", cmc: 0, oracle: "({T}: Add {U}.)" },
      { id: "tower", name: "Command Tower", type: "Land", cmc: 0, oracle: "{T}: Add one mana of any color in your commander's color identity." },
      { id: "bear", name: "Bear", type: "Creature — Bear", cmc: 2, power: 2, toughness: 2, oracle: "" },
    ];
    const s = state({ userBf: [perm("key", KEY)], userPool: { C: 1 }, userLib: lib });
    const acts = activations(s, "key");
    expect(acts).toHaveLength(1);
    const paused = settle(dispatchAction(s, acts[0]));
    expect(paused.pendingChoice?.kind).toBe("tutor-search");
    const offered = paused.pendingChoice.candidates.map((c) => c.id).sort();
    const after = settle(resolveTutorChoice(paused, "sol"));
    const row = { offered, hand: after.players.user.hand.map((c) => c.name), keyGone: !after.players.user.battlefield.some((p) => p.id === "key") };
    console.log("  WITNESS keyTutor", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["isl", "sol"]);
    expect(row.hand).toEqual(["Sol Ring"]);
    expect(row.keyGone).toBe(true);
  });
});

describe("Cephalid Coliseum — threshold sac: the same player draws three, then discards three", () => {
  it("offered only with seven or more cards in MY graveyard; aimed at the opponent, they draw three and discard three (library −3, graveyard +3, hand unchanged) and the land is sacrificed", () => {
    const mk = (gy) => state({ userBf: [perm("col", COLISEUM)], userPool: { U: 1 }, userGy: filler("g", gy), aiLib: filler("L", 5), aiHand: filler("H", 2) });
    expect(activations(mk(6), "col")).toHaveLength(0);
    const s = mk(7);
    const acts = activations(s, "col");
    const atAi = acts.find((a) => (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    expect(atAi).toBeTruthy();
    let after = settle(dispatchAction(s, atAi));
    expect(after.pendingChoice?.kind).toBe("discard"); // the opponent's discard is a choice (the session driver auto-picks for the AI)
    while (after.pendingChoice?.kind === "discard") after = resolveDiscardChoice(after, autoPickDiscardCandidate(after, after.pendingChoice));
    after = settle(after);
    const ai = after.players.ai;
    const row = { lib: ai.library.length, hand: ai.hand.length, gy: ai.graveyard.length, colGone: !after.players.user.battlefield.some((p) => p.id === "col"), pause: after.pendingChoice?.kind || null };
    console.log("  WITNESS coliseum", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.lib).toBe(2);
    expect(row.hand).toBe(2);
    expect(row.gy).toBe(3);
    expect(row.colGone).toBe(true);
    expect(row.pause).toBe(null);
  });
});
