/**
 * becomesMonstrous.test.js — the BECOMES-MONSTROUS event + Alpha Deathclaw (SHELF S7, CR 701.32d).
 *
 * The old guard parked every "becomes monstrous" trigger because the event never fired. Now:
 *   1. applyMonstrosity fires checkBecomesMonstrousTriggers on the REAL not-yet-monstrous transition
 *      (an already-monstrous re-activation stays a logged no-op — never a re-fire).
 *   2. "enters or becomes monstrous" splits via DISJUNCTION_MONSTROUS into two sentences, one per event
 *      (Alpha Deathclaw — "destroy target permanent" fires on entry AND on the monstrous transition).
 *   3. Only the SELF form detects; any other monstrous shape stays parked (CREED FN-safe).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, checkBecomesMonstrousTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { applyMonstrosity } from "./effects/atoms/counters.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const DEATHCLAW_ORACLE =
  "Menace, trample\nWhen this creature enters or becomes monstrous, destroy target permanent.\n{5}{B}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)";
const deathclawCard = (id = "ad-card") => ({
  id, name: "Alpha Deathclaw", type: "Creature — Lizard Mutant", power: "6", toughness: "6", mana: "{4}{B}{B}{G}", oracle: DEATHCLAW_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function resolveAll(state) {
  // The AI target chooser (enemy-intent for a destroy) — the same chooser every real driver passes.
  const opts = { chooseTargets: chooseTriggerTargets };
  let s = flushTriggers(state, opts);
  let guard = 0;
  while ((s.stack || []).length && guard++ < 30) { s = resolveTopOfStack(s); s = flushTriggers(s, opts); }
  return s;
}

describe("detection + split + classify", () => {
  it("the disjunction splits into etb + becomesMonstrous, both natively routed; the card classifies native", () => {
    const ds = detectTriggers(deathclawCard());
    expect(ds.map((d) => d.event).sort()).toEqual(["becomesMonstrous", "etb"]);
    for (const d of ds) {
      expect(d.scope).toBe("self");
      expect(d.effectClause).toBe("destroy target permanent");
      expect(triggerRoutesNatively(d)).toBe(true);
    }
    expect(classifyCard(deathclawCard())).toBe("native-mixed");
  });

  it("CREED guard: a non-self monstrous watcher stays undetected → body-only", () => {
    const watcher = { name: "Monstrous Watcher", type: "Creature — Human", power: "1", toughness: "1", oracle: "Whenever a creature you control becomes monstrous, draw a card." };
    expect(detectTriggers(watcher)).toHaveLength(0);
    expect(classifyCard(watcher)).toBe("body-only");
  });
});

describe("engine (CREED core — fires once, on the real transition only)", () => {
  it("monstrosity fires the trigger exactly once; a repeat activation never re-fires", () => {
    let s = baseState();
    const claw = createPermanent({ id: "claw", card: deathclawCard(), controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [claw] } } };
    s = applyMonstrosity(s, { amount: 4 }, { sourceId: "claw", controller: "user" });
    expect((s.pendingTriggers || []).filter((t) => t.event === "becomesMonstrous")).toHaveLength(1);
    expect(s.players.user.battlefield[0].counters?.["+1/+1"]).toBe(4);
    expect(s.players.user.battlefield[0].monstrous).toBe(true);
    // repeat: already monstrous → no counters, no trigger
    const again = applyMonstrosity(s, { amount: 4 }, { sourceId: "claw", controller: "user" });
    expect((again.pendingTriggers || []).filter((t) => t.event === "becomesMonstrous")).toHaveLength(1);
    expect(again.players.user.battlefield[0].counters?.["+1/+1"]).toBe(4);
  });

  it("the monstrous-transition trigger resolves its destroy against an enemy permanent", () => {
    let s = baseState();
    const claw = createPermanent({ id: "claw", card: deathclawCard(), controller: "user" });
    const enemy = createPermanent({ id: "enemy", card: { name: "Enemy Rock", type: "Artifact", oracle: "" }, controller: "ai1" });
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [claw] },
      ai1: { ...s.players.ai1, battlefield: [enemy] },
    } };
    s = applyMonstrosity(s, { amount: 4 }, { sourceId: "claw", controller: "user" });
    const after = resolveAll(s);
    expect(after.players.ai1.battlefield).toHaveLength(0); // the destroy landed on the enemy permanent
    expect(after.players.user.battlefield.find((p) => p.id === "claw")).toBeDefined(); // never on the source
  });

  it("checkBecomesMonstrousTriggers no-ops on a vanished source", () => {
    const s = baseState();
    expect(checkBecomesMonstrousTriggers(s, "ghost")).toBe(s);
  });
});
