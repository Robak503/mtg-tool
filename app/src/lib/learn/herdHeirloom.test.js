/**
 * herdHeirloom.test.js — the POWER-THRESHOLD until-EOT quoted grant (Herd Heirloom, Jurassic shelf,
 * 2026-08-15): "{T}: Until end of turn, target creature you control with power 4 or greater gains
 * trample and 'Whenever this creature deals combat damage to a player, draw a card.'"
 *
 * One widening on the shipped TG-1 shape-D arm (grantUntilEot) + its splitClauses keep-whole guard
 * (the two mirror each other and must never drift): the optional "with power N or greater" threshold,
 * emitted as the { kind:"power", op:">=" } restriction the shared 16-kind satisfier already enforces
 * layer-aware. The restricted-mana line ("{T}: Add one mana of any color. Spend this mana only to
 * cast a creature spell.") was already modeled — this closes the card's other half.
 *
 * Mutation-checked (2026-08-15): the arm's power-restriction group dropped (restrictions omit the
 * power entry) → the weenie-exclusion enumeration control dies (a power-2 creature is offered).
 * Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CLAUSE = "Until end of turn, target creature you control with power 4 or greater gains trample and \"Whenever this creature deals combat damage to a player, draw a card.\"";
const HEIRLOOM = { name: "Herd Heirloom", type: "Artifact", mana: "{2}",
  oracle: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell.\n{T}: Until end of turn, target creature you control with power 4 or greater gains trample and \"Whenever this creature deals combat damage to a player, draw a card.\"" };

describe("parse + classify", () => {
  it("⭐ the power-threshold quoted grant parses HIGH; Herd Heirloom classifies native", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    const row = { conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(HEIRLOOM) };
    console.log("  WITNESS herdHeirloom", JSON.stringify({ conf: row.conf, tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({
      op: "grant-until-eot", targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }, { kind: "power", op: ">=", value: 4 }],
      grantKeywords: ["Trample"], grantKind: "triggered",
      quoted: "Whenever this creature deals combat damage to a player, draw a card.",
    });
  });
});

describe("⭐⭐ enumeration — the power threshold and the controller scope both bite", () => {
  it("⭐⭐ offers ONLY my power-4+ creature — never my weenie, never the opponent's fatty", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const perm = (id, controller, power) => ({ id, controller, card: { id: `${id}-c`, name: `C${id}`, type: "Creature — Beast", power: String(power), toughness: "4", oracle: "" }, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [perm("big", "user", 5), perm("small", "user", 2)] },
      ai: { ...s0.players.ai, battlefield: [perm("theirs", "ai", 6)] } } };
    const p = parseEffectClause(CLAUSE, "Instant");
    const program = { version: 1, source: "parser", confidence: "high", structure: "sequence", atoms: p.atoms, modal: null, xSpell: false, unparsedTail: null };
    const offered = expandCastChoices(s, "user", program).flatMap((c) => c.targets.map((t) => t.id));
    console.log("  WITNESS herdEnum", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["big"]);
  });
});
