/**
 * sakashimasProtege.test.js — Sakashima's Protege (shelf decks D36, 2026-09-30: Kellan of the West).
 *
 *   "Flash / Cascade / You may have this creature enter as a copy of any permanent that entered this turn."
 *
 * The clone scope "any permanent that entered this turn" is the widened nonland pool (never a land, an Aura or a Saga —
 * the narrower-is-safe pool Clever Impersonator uses) narrowed to permanents whose enteredOnTurn stamp is this turn, any
 * controller. One helper serves the enumerator and the resolution-time re-check (CR 707.9c), so they cannot drift. The
 * printed Flash and Cascade lines keep their cast-path jobs (timing; the cast trigger, CR 702.85a) and are consumed only
 * in the clone parser's shape view, as Flash already was.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveCloneChoice } from "./resolvers.js";
import { cloneCandidates, parseCloneSpec } from "./cloneCopy.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PROTEGE = { name: "Sakashima's Protege", type: "Creature — Shapeshifter", mana: "{4}{U}{U}", power: "3", toughness: "1", keywords: ["Flash", "Cascade"],
  oracle: "Flash\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nYou may have this creature enter as a copy of any permanent that entered this turn." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const ANGEL = { name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracle: "Flying, vigilance" };
const SOL = { name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], oracle: "{T}: Add {C}{C}." };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "({T}: Add {U}.)" };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", keywords: [], oracle: "Enchant creature\nEnchanted creature can't attack or block." };

const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };

const TURN = 7;
const P = (id, card, controller, enteredOnTurn) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), enteredOnTurn });
function table({ active = "user", library = [], mana = { G: 2 } } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: TURN, activePlayer: active, priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: [{ ...BEARS, id: "bears" }, { ...PROTEGE, id: "protege" }], library: library.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, ...mana } },
      ai: { ...g.players.ai, battlefield: [
        P("ANGEL", ANGEL, "ai", TURN), P("OLD", BEARS, "ai", TURN - 1), P("SOL", SOL, "ai", TURN),
        P("ISL", ISLAND, "ai", TURN), P("AURA", PACIFISM, "ai", TURN),
      ] } } };
}
const cast = (s, cardId) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId && !x.freeCast);
  if (!a) throw new Error(`no cast offered for ${cardId}`);
  return dispatchAction(s, a);
};
/** Resolve until the stack is empty or a choice pauses it; fail loudly on a logged resolver crash. */
function resolveAll(s) {
  let n = s, g = 0;
  while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n);
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
/** The Bears are cast and resolve this turn (the engine stamps their entry), then the Protege is cast and pauses on its copy. */
function protegePaused() {
  let s = resolveAll(cast(table(), "bears"));
  s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, U: 6 } } } };
  return resolveAll(cast(s, "protege"));
}
const bearsId = (s) => s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears")?.id;

describe("the card", () => {
  it("reads native-clone with the entered-this-turn scope; Flash and Cascade are consumed for the shape only", () => {
    expect({ tier: classifyCard(PROTEGE), scope: parseCloneSpec(PROTEGE)?.scope, optional: parseCloneSpec(PROTEGE)?.optional })
      .toEqual({ tier: "native-clone", scope: "anyPermanentEnteredThisTurn", optional: true });
  });

  it("fence (synthetic): an unmodeled leading keyword still parks the clone", () => {
    expect(parseCloneSpec({ ...PROTEGE, keywords: ["Changeling"], oracle: "Changeling\nYou may have this creature enter as a copy of any permanent that entered this turn." })).toBeNull();
  });
});

describe("in play", () => {
  it("the pool is every nonland, non-Aura permanent that entered this turn, any controller — the stamped Bears included", () => {
    const s = resolveAll(cast(table(), "bears"));
    expect(cloneCandidates(s, "user", "anyPermanentEnteredThisTurn").map((c) => c.id).sort()).toEqual(["ANGEL", "SOL", bearsId(s)].sort());
  });

  it("flashed in on the opponent's turn: cascade still fires first, then it copies the opponent's new Serra Angel (WITNESS)", () => {
    // The opponent's turn (Flash is the only way to cast it now), and a library whose second card is a cheaper nonland
    // spell, so the cascade the clone parser no longer reads has to find it on its own (CR 702.85a).
    let s = cast(table({ active: "ai", library: [["isl", ISLAND], ["bolt", BOLT]], mana: { U: 6 } }), "protege");
    let g = 0;
    while (s.stack?.length && !s.pendingCascade && !s.pendingChoice && g++ < 10) s = resolveTopOfStack(s);
    const cascadeFound = s.pendingCascade?.cardId ?? null;
    s = resolveAll(dispatchAction(s, { kind: "cascade-decline", playerId: "user", cardId: cascadeFound }));
    const paused = s;
    const pool = (paused.pendingChoice?.candidates || []).map((c) => c.id).sort();
    s = finalizeStackResolution(resolveCloneChoice(paused, "ANGEL"));
    const clone = s.players.user.battlefield.find((p) => p.printedCard?.name === "Sakashima's Protege");
    const witness = { cascadeFound, pause: paused.pendingChoice?.kind, pool, became: clone?.card?.name, size: clone ? [permanentPower(s, clone.id), permanentToughness(s, clone.id)] : null };
    console.log(`WITNESS sakashimasProtege ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ cascadeFound: "bolt", pause: "clone-search", pool: ["ANGEL", "SOL"], became: "Serra Angel", size: [4, 4] });
  });

  it("a pick from outside the pool (a Bear that entered last turn) is refused: it enters as itself", () => {
    const s = finalizeStackResolution(resolveCloneChoice(protegePaused(), "OLD"));
    const names = s.players.user.battlefield.map((p) => p.card?.name);
    expect(names).toContain("Sakashima's Protege");
    expect(names.filter((n) => n === "Grizzly Bears")).toHaveLength(1); // only the user's own cast Bears
  });
});
