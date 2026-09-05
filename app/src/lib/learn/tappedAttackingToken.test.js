/**
 * tappedAttackingToken.test.js — the TAPPED-AND-ATTACKING for-each token (SHELF-TAIL O1, CR 508.1c).
 *
 * "Create a <P>/<T> <desc> creature token that's tapped and attacking for each <count source>." Three
 * pieces, all riding existing seams: (a) the splitClauses keep-whole guard (the internal " and " between
 * "tapped" and "attacking" would otherwise sever the clause into a bare token + an orphan — the blink-guard
 * class), (b) the create-token disposition arm (tapped + entersAttacking + countFor), and (c) applyCreateToken's
 * ATTACKING JOIN — registering the minted tokens in state.combat.attackers vs the trigger's defender (the
 * applyMobilize convention), WITHOUT which the entersAttacking flag is inert (the dead-field warning names
 * exactly that trap). Flipped Kessig Cagebreakers (+1, whole-card audited: single ability, count filters to
 * CREATURE cards in graveyard — verified 2-of-3). Otharri, Suns' Glory's SAME trigger now routes but she
 * stays body-only on her separate graveyard-reanimate ability.
 *
 * Mutation-checked (via Edit): the split guard → the clause severs → the classify pin dies; the parser arm
 * → the atom pins die; the combat.attackers join → the "actually attacking" runtime pin dies (the tokens
 * would enter tapped-but-inert — the exact dead-field trap).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyCreateToken } from "./effects/atoms/tokens.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "create a 2/2 green Wolf creature token that's tapped and attacking for each creature card in your graveyard";

function st(graveyard = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] },
    players: { ...s.players, user: { ...s.players.user, graveyard, battlefield: [] } } };
}
const gyCreature = (id) => ({ id, name: id, type: "Creature — Zombie" });

describe("O1 — split guard + parse + classify", () => {
  it("SPLIT GUARD: the tapped-and-attacking clause stays WHOLE (the internal 'and' never severs it)", () => {
    expect(splitClauses(CLAUSE)).toEqual([CLAUSE]);
    // The control: a plain 'and' rider still splits.
    expect(splitClauses("draw a card and you gain 3 life").length).toBe(2);
  });
  it("MUST STAY HIGH: the clause → create-token with countFor + tapped + entersAttacking", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-token", tapped: true, entersAttacking: true, countFor: { kind: "cardsInGraveyard", cardType: "creature" } });
  });
  it("Kessig Cagebreakers classifies native-trigger; Otharri's SAME trigger routes — and since the tap-an-untapped recursion cost (2026-09-05) she is native-mixed, no longer parked on her GY-reanimate", () => {
    expect(classifyCard({ name: "Kessig Cagebreakers", type: "Creature — Human Rogue", power: 2, toughness: 2, oracle: "Whenever this creature attacks, create a 2/2 green Wolf creature token that's tapped and attacking for each creature card in your graveyard." })).toBe("native-trigger");
    // Otharri: the trigger is modeled AND the {2}{R}{W},Tap-a-Rebel graveyard-reanimate is now a modeled cost
    // (parseGraveyardSelfRecursion's tapUntapped component — otharriSelfReturn.test.js pins the runtime), so the
    // card reads native-mixed. This guard used to pin body-only; graduated the day the line flipped.
    expect(classifyCard({ name: "Otharri, Suns' Glory", type: "Legendary Creature — Bird Rebel", power: 3, toughness: 3, oracle: "Flying, lifelink, haste\nWhenever Otharri attacks, you get an experience counter. Then create a 2/2 red Rebel creature token that's tapped and attacking for each experience counter you have.\n{2}{R}{W}, Tap an untapped Rebel you control: Return this card from your graveyard to the battlefield tapped." })).toBe("native-mixed");
  });
});

describe("O1 — the runtime (count + tapped + the ATTACKING JOIN)", () => {
  const atom = { op: "create-token", power: 2, toughness: 2, descriptor: "green wolf", tapped: true, entersAttacking: true, countFor: { kind: "cardsInGraveyard", cardType: "creature" }, targetType: null };
  it("mints one token per creature card in GY, each TAPPED and REGISTERED in combat.attackers vs the defender", () => {
    const s = st([gyCreature("g1"), gyCreature("g2"), { id: "g3", name: "Bolt", type: "Instant" }]);
    const after = applyCreateToken(s, atom, { controller: "user", sourceId: "src", defenderId: "ai" });
    const wolves = after.players.user.battlefield.filter((p) => /wolf/i.test(p.card?.name || ""));
    expect(wolves).toHaveLength(2);                                       // 2 creature cards (the instant excluded)
    expect(wolves.every((w) => w.tapped)).toBe(true);
    expect(after.combat.attackers).toHaveLength(2);                      // the JOIN — actually attacking (mutation-check line)
    expect(after.combat.attackers.every((a) => a.attackingPlayer === "user" && a.defender === "ai")).toBe(true);
    expect(after.combat.attackers.map((a) => a.permanentId).sort()).toEqual(wolves.map((w) => w.id).sort());
  });
  it("no defender in context → tokens enter tapped but never join combat (FN-safe, never a fabricated entry)", () => {
    const s = st([gyCreature("g1")]);
    const after = applyCreateToken(s, atom, { controller: "user", sourceId: "src" });
    expect(after.players.user.battlefield.filter((p) => /wolf/i.test(p.card?.name || ""))).toHaveLength(1);
    expect(after.combat.attackers).toHaveLength(0);
  });
  it("an empty graveyard mints zero tokens (CR 107.3 — never forced to 1)", () => {
    const after = applyCreateToken(st([]), atom, { controller: "user", sourceId: "src", defenderId: "ai" });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.combat.attackers).toHaveLength(0);
  });
});
