/**
 * annihilatorComposite.test.js — CORPUS ④-M (2026-09-03 night): ANNIHILATOR + A ROUTING TRIGGER compose.
 * The annihilator classifier demanded detectTriggers(card) be EMPTY, so Artisan of Kozilek (cast: reanimate) and
 * Nulldrifter (cast: draw two) each classified native ALONE on either line and parked together — the census's
 * two-flip signature. The annihilator hook (applyAnnihilatorTriggers at declare-blockers) and the trigger system fire
 * independently, so the gate now admits a second trigger iff EVERY detected trigger routes natively and the body with
 * those trigger lines removed is still keyword-only. An unrouted trigger still parks the card (Ulamog's graveyard
 * shuffle). Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { applyAnnihilatorTriggers } from "./annihilator.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const NULLDRIFTER = { id: "c-null", name: "Nulldrifter", type: "Creature — Eldrazi Elemental", mana: "{5}{U}{U}", mana_cost: "{5}{U}{U}", cmc: 7, power: 4, toughness: 4, keywords: ["Flying"],
  oracle: "When you cast this spell, draw two cards.\nFlying\nAnnihilator 1 (Whenever this creature attacks, defending player sacrifices a permanent of their choice.)\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)" };
const ARTISAN = { id: "c-art", name: "Artisan of Kozilek", type: "Creature — Eldrazi", mana: "{9}", mana_cost: "{9}", cmc: 9, power: 10, toughness: 9, keywords: [],
  oracle: "When you cast this spell, you may return target creature card from your graveyard to the battlefield.\nAnnihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)" };
const ULAMOG = { id: "c-ula", name: "Ulamog, the Infinite Gyre", type: "Legendary Creature — Eldrazi", mana: "{11}", cmc: 11, power: 10, toughness: 10, keywords: [],
  oracle: "When you cast this spell, destroy target permanent.\nIndestructible\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Ulamog, the Infinite Gyre is put into a graveyard from anywhere, its owner shuffles their graveyard into their library." };
const CARD = (id, name, extra = {}) => ({ id, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "", ...extra });

describe("the tiers", () => {
  it("⭐ Nulldrifter and Artisan of Kozilek are native-trigger (annihilator + a routing cast trigger)", () => {
    expect(classifyCard(NULLDRIFTER)).toBe("native-trigger");
    expect(classifyCard(ARTISAN)).toBe("native-trigger");
  });
  it("⛔ an UNROUTED sibling trigger still parks the whole card (Ulamog's graveyard shuffle)", () => {
    expect(classifyCard(ULAMOG)).not.toMatch(/^native/);
    // Ulamog's shuffle line is never DETECTED (it parks on residue). This SYNTHETIC sibling IS detected as an ETB and
    // does not route — the case the routing check alone guards. Not a printed card; a pin on the refusal only.
    expect(classifyCard({ id: "c-syn", name: "Probe Eldrazi", type: "Creature — Eldrazi", mana: "{7}", cmc: 7, power: 7, toughness: 7, keywords: [],
      oracle: "Annihilator 1\nWhen this creature enters, the ring tempts you." })).not.toMatch(/^native/);
  });
});

describe("runtime — both halves fire, independently", () => {
  function board() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, turn: 8, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [{ ...NULLDRIFTER, id: "h-null" }], library: [CARD("l1", "Lib One"), CARD("l2", "Lib Two"), CARD("l3", "Lib Three")], graveyard: [], battlefield: [], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 5 } },
        ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "aL", card: { id: "c-aL", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "ai" }), createPermanent({ id: "aB", card: CARD("c-aB", "Grizzly Bears"), controller: "ai", summoningSick: false })] } } };
  }
  const drain = (s) => { let cur = s, guard = 0; while (cur.pendingChoice?.kind === "sacrifice-choice" && guard++ < 50) cur = resolveSacrificeChoice(cur, autoPickSacrificeCandidate(cur, cur.pendingChoice)); return cur; };

  it("⭐ cast Nulldrifter: the cast trigger draws two; then it attacks and the AI sacrifices one permanent", () => {
    const s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-null" && !a.evoke && !a.alternativeCost);
    expect(act).toBeTruthy();
    const cast = flushTriggers(dispatchAction(s, act));
    expect(cast.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const drew = resolveTopOfStack(cast);                       // the cast trigger resolves first (on top)
    expect(drew.players.user.hand.length).toBe(2);
    const entered = resolveTopOfStack(drew);
    const drifter = entered.players.user.battlefield.find((p) => p.card?.name === "Nulldrifter");
    expect(drifter).toBeTruthy();
    const combat = { ...entered, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: drifter.id, attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const out = drain(applyAnnihilatorTriggers(combat));
    expect(out.players.ai.battlefield.length).toBe(1);
  });
});
