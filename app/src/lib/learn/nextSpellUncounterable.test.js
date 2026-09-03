/**
 * nextSpellUncounterable.test.js — LANDS-TIER slice 6 (2026-09-03): "The next spell you cast this turn
 * can't be countered." (Mistrise Village "{U}, {T}: …" — Cap America's carrier; three corpus cards print the
 * sentence, two of them typed forms this slice deliberately does NOT read).
 *
 * THE SHAPE: a per-player, per-turn FLAG (`nextSpellUncounterable`), set by the resolving ability, consumed
 * by the very next spell that player casts through the cast chokepoint (actionDispatcher.applyCastSpell —
 * the ONE site that also records `spellsCastThisTurn`), which stamps that spell's stack object
 * `uncounterable: true` — the mark the counter-target enumeration already honours for Vexing Shusher's
 * grant (spellEffects: `if (obj.uncounterable) continue`). The flag is cleared as it is consumed, and cleared
 * for every seat at untap with the other per-turn spell counters (resetSpellsCastAllPlayers) — "this turn"
 * ends at cleanup, and the next untap is the first moment after it.
 *
 * KNOWN, DOCUMENTED LIMIT: a spell cast by an EFFECT (the free-cast atoms push their own stack objects and
 * do not pass through recordSpellCast either — the same pre-existing gap `spellsCastThisTurn` has) does not
 * consume the flag. The flag then stays armed for the next dispatcher cast — a shield one spell late, which
 * is the direction this slice names rather than hides.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, resetSpellsCastAllPlayers } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { enumerateTargets } from "./spellEffects.js";
import { nextSpellUncounterableClauseParser, stackResolvers } from "./effects/atoms/stack.js";

beforeEach(() => _resetIdsForTests());

const MISTRISE = { id: "c-mistrise", name: "Mistrise Village", type: "Land",
  oracle: "This land enters tapped unless you control a Mountain or a Forest.\n{T}: Add {U}.\n{U}, {T}: The next spell you cast this turn can't be countered." };
const BEARS = { id: "bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "", keywords: [] };
const ELK = { id: "elk", name: "Elk", type: "Creature — Elk", mana: "{1}{G}", power: 2, toughness: 2, oracle: "", keywords: [] };

describe("the parser — exactly the untyped sentence", () => {
  it("reads Mistrise's sentence as the flag atom", () => {
    expect(nextSpellUncounterableClauseParser("The next spell you cast this turn can't be countered.")).toEqual({ op: "next-spell-uncounterable" });
  });

  it("⛔ refuses the typed forms and a different subject", () => {
    expect(nextSpellUncounterableClauseParser("The next creature spell you cast this turn can't be countered.")).toBeNull();
    expect(nextSpellUncounterableClauseParser("The next instant or sorcery spell you cast this turn can't be countered.")).toBeNull();
    expect(nextSpellUncounterableClauseParser("Spells you cast this turn can't be countered.")).toBeNull();
  });
});

function board() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = [
    createPermanent({ id: "src", card: MISTRISE, controller: "user", summoningSick: false }),
    createPermanent({ id: "f1", card: { id: "cf1", name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false }),
  ];
  return {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [BEARS, ELK], manaPool: { W: 0, U: 3, B: 0, R: 0, G: 6, C: 3 }, life: 40 } },
  };
}
const counterTargets = (s) => enumerateTargets(s, "ai1", { targetType: "spell", spellFilter: "any" }).filter((t) => t.type === "spell").map((t) => t.id);
const castFromHand = (s, cardId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  if (!act) throw new Error(`no cast action for ${cardId}`);
  return dispatchAction(s, act);
};

describe("runtime — activate, then the NEXT spell is shielded, and only that one", () => {
  it("⭐ the ability arms the flag; the next cast is stamped uncounterable, the flag clears, the counter enumeration skips it", () => {
    const s = board();
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "src" && !a.isManaAbility);
    expect(acts).toHaveLength(1);
    const armed = resolveTopOfStack(dispatchAction(s, acts[0]));
    expect(armed.players.user.nextSpellUncounterable).toBe(true);
    expect(armed.players.user.battlefield.find((p) => p.id === "src").tapped).toBe(true);

    const cast1 = castFromHand(armed, "bears");
    const spell1 = cast1.stack[cast1.stack.length - 1];
    expect(spell1.kind).toBe("spell");
    expect(spell1.uncounterable).toBe(true);
    expect(cast1.players.user.nextSpellUncounterable).toBe(false);
    expect(counterTargets(cast1)).not.toContain(spell1.id);

    const afterBears = resolveTopOfStack(cast1);
    const cast2 = castFromHand({ ...afterBears, priorityHolder: "user", consecutivePasses: 0 }, "elk");
    const spell2 = cast2.stack[cast2.stack.length - 1];
    expect(spell2.uncounterable).toBeFalsy();
    expect(counterTargets(cast2)).toContain(spell2.id);
  });

  it("without the ability, a cast is a normal counter target (the stamp is never applied by default)", () => {
    const cast = castFromHand(board(), "bears");
    const spell = cast.stack[cast.stack.length - 1];
    expect(spell.uncounterable).toBeFalsy();
    expect(counterTargets(cast)).toContain(spell.id);
  });

  it("the resolver itself sets exactly the controller's flag", () => {
    const s = board();
    const out = stackResolvers["next-spell-uncounterable"](s, { op: "next-spell-uncounterable" }, { controller: "user", targets: [] });
    expect(out.players.user.nextSpellUncounterable).toBe(true);
    expect(out.players.ai1.nextSpellUncounterable).toBeFalsy();
  });

  it("⛔ the flag does not survive the turn: the untap reset clears it for every seat", () => {
    const s = board();
    const armed = { ...s, players: { ...s.players, user: { ...s.players.user, nextSpellUncounterable: true } } };
    expect(resetSpellsCastAllPlayers(armed).players.user.nextSpellUncounterable).toBe(false);
  });
});

describe("classification", () => {
  it("Mistrise Village is `land`; a typed variant stays land-partial", () => {
    expect(classifyCard(MISTRISE)).toBe("land");
    expect(classifyCard({ ...MISTRISE, oracle: MISTRISE.oracle.replace("The next spell", "The next creature spell") })).toBe("land-partial");
  });
});
