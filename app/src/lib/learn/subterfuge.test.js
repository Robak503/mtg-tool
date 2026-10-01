/**
 * subterfuge.test.js — Subterfuge (shelf decks D28, 2026-09-30: Teval, the Balanced Scale Test). "When this creature enters,
 * target creature gains flying and "Whenever this creature deals combat damage to a player, draw that many cards" until end
 * of turn."
 *
 * The until-end-of-turn quoted grant (TG-1) anchored only the LEADING "Until end of turn, …" form; the TRAILING duration is
 * the same grant, so it moves to the front, and the quoted body gets back the period it lost to the outer sentence (the body
 * validators read a whole ability). On a TRIGGER the grant needs a side: the quoted ability becomes the recipient's own, so
 * it is aimed at your own creature (atomTargetIntent "own").
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the normalization.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkCombatDamageTriggers, checkEnterTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { grantUntilEotClauseParser } from "./effects/atoms/grantUntilEot.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SUBTERFUGE = { name: "Subterfuge", type: "Creature — Elemental Incarnation", mana: "{4}{U}", power: "3", toughness: "5", keywords: ["Encore"],
  oracle: "When this creature enters, target creature gains flying and \"Whenever this creature deals combat damage to a player, draw that many cards\" until end of turn.\nEncore {7}{U}{U} ({7}{U}{U}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };

/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
/** Subterfuge enters beside your Bear (and the opponent's); its ETB resolves. */
function entered() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const sub = createPermanent({ id: "sub", card: { ...SUBTERFUGE, id: "c-sub" }, controller: "user", summoningSick: false });
  const bear = createPermanent({ id: "bear", card: { ...BEAR, id: "c-bear" }, controller: "user", summoningSick: false });
  const aiBear = createPermanent({ id: "aiBear", card: { ...BEAR, id: "c-aiBear" }, controller: "ai", summoningSick: false });
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  const s = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [sub, bear], library: lib }, ai: { ...g.players.ai, battlefield: [aiBear] } } };
  return settle(checkEnterTriggers(s, sub));
}

describe("the card", () => {
  it("the trailing duration moves to the front with the body's period restored; the ETB aims at your own creature; reads native", () => {
    const d = detectTriggers(SUBTERFUGE).find((x) => x.event === "etb");
    const atom = grantUntilEotClauseParser(d.effectClause);
    expect({ atom, intent: atomTargetIntent(atom), tier: classifyCard(SUBTERFUGE) }).toEqual({
      atom: { op: "grant-until-eot", targetType: "creature", grantKeywords: ["Flying"], grantKind: "triggered", quoted: "Whenever this creature deals combat damage to a player, draw that many cards." },
      intent: "own",
      tier: "native-trigger",
    });
  });
  it("SYNTHETIC: a body that already ends in a period keeps ONE; a duration INSIDE the quote never moves; a shrinking pump is enemy-side", () => {
    expect({
      keepsPeriod: grantUntilEotClauseParser("target creature gains \"When this creature dies, draw a card.\" until end of turn")?.quoted,
      insideQuote: grantUntilEotClauseParser("target creature gains \"Whenever this creature attacks, it gets +1/+0 until end of turn\""),
      shrink: atomTargetIntent({ op: "grant-until-eot", targetType: "creature", ptDelta: { p: -2, t: -2 }, grantKind: "triggered", quoted: "x" }),
    }).toEqual({ keepsPeriod: "When this creature dies, draw a card.", insideQuote: null, shrink: "enemy" });
  });
});

describe("⭐ in play", () => {
  it("⭐ it enters: one of YOUR creatures gains flying and the quoted trigger (never the opponent's); it connects for 3 → three cards; at cleanup the grant is gone", () => {
    const s = entered();
    // Subterfuge has no flying of its own, so whichever of yours flies now is the one the own-side chooser picked.
    const granted = ["sub", "bear"].filter((id) => permanentHasKeyword(s, id, "Flying"));
    const who = granted[0];
    const hit = settle(checkCombatDamageTriggers({ ...s, phase: "combat", step: "combat-damage" }, [{ kind: "combat-damage-player", attackerId: who, attackingPlayer: "user", defender: "ai", amount: 3 }]));
    const drew = 5 - hit.players.user.library.length;
    const later = expireContinuousEffects(hit, { atCleanupOfTurn: hit.turn });
    const row = { granted: granted.length, aiBearFlies: permanentHasKeyword(s, "aiBear", "Flying"), drew, flyingAfterCleanup: permanentHasKeyword(later, who, "Flying") };
    console.log(`WITNESS subterfuge ${JSON.stringify({ ...row, who })}`);
    expect(row).toEqual({ granted: 1, aiBearFlies: false, drew: 3, flyingAfterCleanup: false });
  });
  it("the quoted trigger is the recipient's alone: your other creature connecting draws nothing", () => {
    const s = entered();
    const who = ["sub", "bear"].find((id) => permanentHasKeyword(s, id, "Flying"));
    const other = who === "sub" ? "bear" : "sub";
    const hit = settle(checkCombatDamageTriggers({ ...s, phase: "combat", step: "combat-damage" }, [{ kind: "combat-damage-player", attackerId: other, attackingPlayer: "user", defender: "ai", amount: 2 }]));
    expect(5 - hit.players.user.library.length).toBe(0);
  });
});
