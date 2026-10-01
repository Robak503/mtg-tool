/**
 * malakirRebirth.test.js — Malakir Rebirth // Malakir Mire (the play-weighted program, P·14, 2026-10-01: EDHREC rank #246;
 * CR 712.8, 608.2b, 611.2c).
 *
 *   Malakir Rebirth (Instant {B}): "Choose target creature. You lose 2 life. Until end of turn, that creature gains "When
 *   this creature dies, return it to the battlefield tapped under its owner's control.""
 *   Malakir Mire (Land): "This land enters tapped. {T}: Add {B}."
 *
 * matchChooseLoseLifeGrant (effects/atoms/grantUntilEot.js) reads the front whole: the controller's life loss, then the
 * until-EOT grant on the chosen target ("that creature" is the creature the first sentence chose). The grant and the
 * dies-return it carries are the Feign Death family's (grantUntilEot.test.js); this file pins the frame, the face cast and
 * what is new to it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { expireContinuousEffects } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REBIRTH_TEXT = "Choose target creature. You lose 2 life. Until end of turn, that creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\"";
const MALAKIR = { id: "h-mr", name: "Malakir Rebirth // Malakir Mire", type: "Instant // Land", mana: "{B}", mana_cost: "{B}", cmc: 1, keywords: [], layout: "modal_dfc",
  oracle: `Malakir Rebirth - Instant {B}\n${REBIRTH_TEXT}\n//\nMalakir Mire - Land \nThis land enters tapped.\n{T}: Add {B}.` };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: [MALAKIR], manaPool: { ...g.players.user.manaPool, B: 1 },
        battlefield: [createPermanent({ id: "my-bear", card: { ...BEARS, id: "c-my-bear" }, controller: "user", summoningSick: false })] },
      ai: { ...g.players.ai, battlefield: [createPermanent({ id: "their-bear", card: { ...BEARS, id: "c-their-bear" }, controller: "ai", summoningSick: false })] } } };
}
const castAt = (s, targetId) => {
  const a = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "h-mr" && x.targets?.[0]?.id === targetId);
  if (a.length !== 1) throw new Error(`expected exactly one cast at ${targetId}, found ${a.length}`);
  return dispatchAction(s, a[0]);
};
/** Resolve the stack and any pending triggers to quiet. */
function settle(s) {
  let n = finalizeStackResolution(s), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = finalizeStackResolution(n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const destroy = (s, id) => settle(ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "creature" }, { controller: "ai", targets: [{ type: "creature", id }] }));
const bearsOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.name === "Grizzly Bears").map((p) => ({ id: p.id, tapped: p.tapped }));

describe("the card", () => {
  it("the front reads whole — the life loss, then the grant on the chosen target — and the card is native-spell", () => {
    const p = parseEffectClause(REBIRTH_TEXT, "Instant");
    expect({ conf: p.confidence, atoms: p.atoms, tier: classifyCard(MALAKIR) }).toEqual({ conf: "high", tier: "native-spell", atoms: [
      { op: "lose-life", amount: 2, who: "controller", targetType: null },
      { op: "grant-until-eot", targetType: "creature", grantKind: "triggered", quoted: "When this creature dies, return it to the battlefield tapped under its owner's control." },
    ] });
  });

  it("⛔ an unmodeled granted body, or anything between the sentences, leaves the front unread (land-partial)", () => {
    const unmodeled = REBIRTH_TEXT.replace("return it to the battlefield tapped under its owner's control.", "put its power in +1/+1 counters on target creature.");
    const rider = REBIRTH_TEXT.replace("You lose 2 life.", "You lose 2 life and draw a card.");
    expect([unmodeled, rider].map((t) => [parseEffectClause(t, "Instant").confidence, classifyCard({ ...MALAKIR, oracle: MALAKIR.oracle.replace(REBIRTH_TEXT, t) })]))
      .toEqual([["low", "land-partial"], ["low", "land-partial"]]);
  });
});

describe("in play", () => {
  it("cast at your creature: you lose 2; it dies and returns tapped as a new object (WITNESS)", () => {
    const cast = settle(castAt(table(), "my-bear"));
    const died = destroy(cast, "my-bear");
    const witness = { life: died.players.user.life, bears: bearsOf(died, "user"), yard: died.players.user.graveyard.map((c) => c.name) };
    console.log(`WITNESS malakirRebirth ${JSON.stringify(witness)}`);
    expect(witness.life).toBe(38); // 40 (the default starting life) - 2
    expect(witness.bears).toHaveLength(1);
    expect(witness.bears[0]).toMatchObject({ tapped: true });
    expect(witness.bears[0].id).not.toBe("my-bear"); // a new object (CR 400.7)
    expect(witness.yard).toEqual(["Malakir Rebirth // Malakir Mire"]);
  });

  it("cast at an opponent's creature: it returns under ITS OWNER's control", () => {
    const died = destroy(settle(castAt(table(), "their-bear")), "their-bear");
    expect({ user: died.players.user.life, mine: bearsOf(died, "user").length, theirs: bearsOf(died, "ai").map((b) => b.tapped) })
      .toEqual({ user: 38, mine: 1, theirs: [true] });
  });

  it("⛔ the target leaves before it resolves: the spell fizzles whole — no life is lost (CR 608.2b)", () => {
    const cast = castAt(table(), "my-bear");
    const gone = { ...cast, players: { ...cast.players, user: { ...cast.players.user, battlefield: [] } } };
    const s = settle(gone);
    expect({ life: s.players.user.life, fizzled: (s.log || []).some((e) => e.kind === "spell-fizzle") }).toEqual({ life: 40, fizzled: true });
  });

  it("the grant ends at cleanup: dying next turn, it stays dead", () => {
    const cast = settle(castAt(table(), "my-bear"));
    const expired = expireContinuousEffects(cast, { atCleanupOfTurn: cast.turn });
    const died = destroy(expired, "my-bear");
    expect({ bears: bearsOf(died, "user").length, yard: died.players.user.graveyard.map((c) => c.name).sort() })
      .toEqual({ bears: 0, yard: ["Grizzly Bears", "Malakir Rebirth // Malakir Mire"] });
  });
});
