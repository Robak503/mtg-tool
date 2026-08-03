/**
 * suspendNoCost.test.js — KW-SUSPEND for cards with NO printed mana cost (CR 702.62): Lotus Bloom /
 * Sol Talisman / Mox Tantalite (+ the modeled-effect spells the same gate reaches — Ancestral
 * Vision, Crashing Footfalls). Suspending is their ONLY route onto the stack, so the with-cost
 * "vacuous alt-cast" pre-strip could never honestly credit them.
 *
 * The flow: the SUSPEND special action (pay {cost}, hand → exile with `_suspendCounters: N`, the
 * plot stamp pattern) → one time counter removed at each of the OWNER's upkeeps
 * (fading.applySuspendUpkeep, wired beside fade/vanish) → at ZERO the card is `_suspendReady` and
 * the FREE cast is offered from exile through the REAL cast machinery (castActionsFromZone
 * freeCast), so cast triggers/watchers fire exactly as a hand cast's would.
 *
 * TWO DOCUMENTED SIMPLIFICATIONS (both FN-safe by direction):
 *   - CR 702.62e makes the zero-counter cast MANDATORY; the engine OFFERS it (an offer can never
 *     fire wrongly — a declined Bloom under-uses the card, never mis-plays it);
 *   - the cast window is "owner has priority once ready" rather than exactly the upkeep trigger's
 *     resolution. The scoped carriers are noncreature (a creature carrier needs the suspend haste
 *     grant and parseSuspendNoCost returns null for it — parked, and the classifier reads the SAME
 *     gate, so credit and runtime cannot diverge).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { applySuspendUpkeep, parseSuspendNoCost } from "./fading.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall, pulled 2026-08-02).
const LOTUS_BLOOM = { id: "lb-card", name: "Lotus Bloom", type: "Artifact", mana: "",
  oracle: "Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color." };
const ANCESTRAL_VISION = { id: "av-card", name: "Ancestral Vision", type: "Sorcery", mana: "",
  oracle: "Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, cast it without paying its mana cost.)\nTarget player draws three cards." };
const DURKWOOD = { id: "db-card", name: "Durkwood Baloth", type: "Creature — Beast", power: "5", toughness: "5", mana: "",
  oracle: "Suspend 5—{G} (Rather than cast this card from your hand, pay {G} and exile it with five time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, cast it without paying its mana cost. It has haste.)" };

function setup({ hand = [], mana = {}, lib = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players,
      user: { ...s.players.user, hand, library: lib, battlefield: [], manaPool: { ...s.players.user.manaPool, ...mana } } } };
}
const acts = (s, kind) => filterActions(legalActionsForPlayer(s, "user"), kind);
function drain(s) { let g = 0; while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s); return s; }

describe("KW-SUSPEND — the no-cost gate (metric⇄runtime shared)", () => {
  it("admits the noncreature no-cost trio's shape, reminder-on-the-same-line tolerated", () => {
    expect(parseSuspendNoCost(LOTUS_BLOOM)).toEqual({ n: 3, costPips: "{0}" });
    expect(parseSuspendNoCost(ANCESTRAL_VISION)).toEqual({ n: 4, costPips: "{U}" });
  });
  it("CREED — a creature (needs the haste grant), a with-cost carrier, and a rider all return null", () => {
    expect(parseSuspendNoCost(DURKWOOD)).toBeNull();
    expect(parseSuspendNoCost({ name: "X", type: "Creature", mana: "{1}{G}", oracle: "Suspend 4—{1}{G}" })).toBeNull();
    expect(parseSuspendNoCost({ name: "X", type: "Artifact", mana: "", oracle: "Suspend 3—{0}, Sacrifice a land." })).toBeNull();
  });
  it("classification reads the same gate: the trio + modeled spells flip; the creature stays native-body via the OLD path only", () => {
    expect(classifyCard(LOTUS_BLOOM)).toBe("native-mana");
    expect(classifyCard(ANCESTRAL_VISION)).toBe("native-spell");
    // Hypergenesis: suspend parses but its EFFECT is unmodeled — the whole-card law keeps it parked.
    expect(classifyCard({ name: "Hypergenesis", type: "Sorcery", mana: "",
      oracle: "Suspend 3—{1}{G}{G}\nStarting with you, each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield. Repeat this process until no one puts a card onto the battlefield." })).toBe("arbiter-spell");
  });
});

describe("KW-SUSPEND — the live flow", () => {
  it("⭐ Lotus Bloom end to end: suspend {0} → three OWN upkeeps → free cast → on the battlefield as a mana source", () => {
    let s = setup({ hand: [LOTUS_BLOOM] });
    const sus = acts(s, "suspend").find((a) => a.cardId === "lb-card");
    expect(sus).toBeTruthy();
    expect(sus.suspendCounters).toBe(3);
    s = dispatchAction(s, sus);
    expect(s.players.user.hand).toEqual([]);
    expect(s.players.user.exile[0]).toMatchObject({ name: "Lotus Bloom", _suspendCounters: 3 });

    // Tick three of the OWNER's upkeeps; an OPPONENT's upkeep must not tick it.
    s = applySuspendUpkeep({ ...s, activePlayer: "ai" });
    expect(s.players.user.exile[0]._suspendCounters).toBe(3);          // not my upkeep — no tick
    for (let i = 0; i < 2; i++) {
      s = applySuspendUpkeep({ ...s, activePlayer: "user" });
    }
    expect(s.players.user.exile[0]._suspendCounters).toBe(1);
    expect(acts({ ...s, activePlayer: "user" }, "cast-spell").filter((a) => a.cardId === "lb-card")).toHaveLength(0); // not ready — never offered early
    s = applySuspendUpkeep({ ...s, activePlayer: "user" });
    expect(s.players.user.exile[0]).toMatchObject({ _suspendCounters: 0, _suspendReady: true });

    // The free cast is offered from exile through the real cast machinery.
    const cast = acts({ ...s, activePlayer: "user" }, "cast-spell").find((a) => a.cardId === "lb-card");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction({ ...s, activePlayer: "user", priorityHolder: "user" }, cast));
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Lotus Bloom")).toBe(true);
    expect(s.players.user.exile).toEqual([]);
    // …and it is a live mana source (the sac-for-mana ability).
    const srcs = manaSources(s, "user");
    expect(srcs.some((x) => x.sacrifices)).toBe(true);
  });

  it("a suspended SORCERY casts free with its target and resolves (Ancestral Vision)", () => {
    let s = setup({ hand: [ANCESTRAL_VISION], mana: { U: 1 },
      lib: [{ id: "D1", name: "A" }, { id: "D2", name: "B" }, { id: "D3", name: "C" }] });
    const sus = acts(s, "suspend").find((a) => a.cardId === "av-card");
    expect(sus).toBeTruthy();
    s = dispatchAction(s, sus);
    for (let i = 0; i < 4; i++) s = applySuspendUpkeep({ ...s, activePlayer: "user" });
    expect(s.players.user.exile[0]._suspendReady).toBe(true);
    const cast = acts({ ...s, activePlayer: "user" }, "cast-spell").find((a) => a.cardId === "av-card" && a.targets?.[0]?.id === "user");
    expect(cast).toBeTruthy();
    s = drain(dispatchAction({ ...s, activePlayer: "user", priorityHolder: "user" }, cast));
    expect(s.players.user.hand.map((c) => c.id).sort()).toEqual(["D1", "D2", "D3"]); // drew three
    expect(s.players.user.graveyard.some((c) => c.name === "Ancestral Vision")).toBe(true);
  });

  it("CREED — no suspend action is ever offered for the creature carrier", () => {
    const s = setup({ hand: [DURKWOOD], mana: { G: 1 } });
    expect(acts(s, "suspend")).toHaveLength(0);
  });
});
