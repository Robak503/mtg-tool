/**
 * gyExileOpponent.test.js — "exile target card from an opponent's graveyard" (CR 608).
 *
 * The exile-from-graveyard atom already supported opponentGraveyard at RESOLUTION (like Ashen Powder's
 * reanimate); the gaps were (1) the parser form and (2) the trigger intent. Both closed: the matcher now emits
 * { op:"exile-from-graveyard", opponentGraveyard:true }, and atomTargetIntent reports "enemy" for the
 * opponent-scoped form (unambiguously enemy-side — the only candidates are opponents' graveyard cards), so an
 * ETB TRIGGER routes natively. "from a graveyard" (anyGraveyard) stays "ambiguous" → Arbiter (a SAFE FN).
 * Flip-diff GAINED=5 (Disposal Mummy, Disruptor Wanderglyph, Leonin of the Lost Pride, Ruin Rat, Scavenging Harpy).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

describe("gy-exile from an opponent's graveyard — parse + intent", () => {
  it("parses to exile-from-graveyard with opponentGraveyard; intent is ENEMY", () => {
    const atom = parseEffectClause("exile target card from an opponent's graveyard").atoms[0];
    expect(atom).toMatchObject({ op: "exile-from-graveyard", targetType: "graveyardCard", opponentGraveyard: true });
    expect(atomTargetIntent(atom)).toBe("enemy");
  });
  it('CREED guard: "from a graveyard" (any) stays AMBIGUOUS → Arbiter (unchanged)', () => {
    expect(atomTargetIntent(parseEffectClause("exile target card from a graveyard").atoms[0])).toBe("ambiguous");
  });
  it("Disposal Mummy classifies native", () => {
    expect(classifyCard({ name: "Disposal Mummy", type: "Creature — Zombie Jackal", mana: "{2}{W}", oracle: "When this creature enters, exile target card from an opponent's graveyard." })).toBe("native-trigger");
  });
});

describe("gy-exile from an opponent's graveyard — runtime (exiles the OPPONENT's card, never own)", () => {
  it("an ETB exiles a card from the opponent's graveyard and leaves the controller's own graveyard intact", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mummy = createPermanent({ id: "mummy", card: { id: "c-m", name: "Disposal Mummy", type: "Creature — Zombie Jackal", power: 2, toughness: 2, oracle: "When this creature enters, exile target card from an opponent's graveyard." }, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [mummy], graveyard: [{ id: "myGY", name: "MyCard", type: "Creature" }] },
      ai: { ...s.players.ai, graveyard: [{ id: "foeGY", name: "FoeCard", type: "Creature" }] } } };
    let n = flushTriggers(checkEnterTriggers(s, mummy), { chooseTargets: chooseTriggerTargets });
    let g = 0; while ((n.stack || []).length && g++ < 20) n = resolveTopOfStack(n);
    expect(n.players.ai.graveyard.map((c) => c.name)).not.toContain("FoeCard");   // opponent's card exiled
    expect(n.players.user.graveyard.map((c) => c.name)).toContain("MyCard");       // own graveyard untouched
  });
});
