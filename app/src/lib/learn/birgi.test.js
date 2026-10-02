/**
 * BIRGI, GOD OF STORYTELLING // HARNFEL, HORN OF BOUNTY — the play-weighted program, P·37 (EDHREC #489).
 *   Birgi: "Whenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.
 *           Creatures you control can boast twice during each of your turns rather than once."
 *   Harnfel (already native): "Discard a card: Exile the top two cards of your library. You may play those cards this turn."
 *
 * The held red is ordinary pool mana (spendable on anything — a boast cost included) plus an EXACT until-end-of-turn hold on that
 * amount (gameState.holdManaUntilEndOfTurn → emptyManaPools keeps up to it at each step/phase end; commitPaymentPlan clamps it to
 * what is left of the color, so once it is spent a later red can't ride it; cleanup drops it, CR 514.2). Boast twice raises boast's
 * once-each-turn limit (CR 702.135b) to two on its controller's own turns.
 *
 * ⚠ Birgi // Harnfel ITSELF stays body-only: a creature // artifact modal DFC, and the engine casts neither face of one until a
 * spell // spell modal-DFC lane exists (coverage splits only land-back MDFCs). Its front's two lines are modeled and witnessed
 * here on the front face's own view, ready for that lane. The same "you don't lose this mana" sentence is what flipped Savage
 * Ventmaw, Brazen Collector and Sakura-Tribe Springcaller (Ventmaw is witnessed below).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); casts and activations run for real (legal action → dispatch).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets, emptyManaPools, finishCleanupActions } from "./gameEngine.js";
import { triggersForEvent } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BIRGI = { name: "Birgi, God of Storytelling", type: "Legendary Creature — God", mana: "{2}{R}", cmc: 3, power: "3", toughness: "3", keywords: [], oracle: "Whenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once." };
const HARNFEL = { name: "Harnfel, Horn of Bounty", type: "Legendary Artifact", mana: "{4}{R}", cmc: 5, keywords: [], oracle: "Discard a card: Exile the top two cards of your library. You may play those cards this turn." };
const PUP = { name: "Fearless Pup", type: "Creature — Wolf", mana: "{R}", cmc: 1, power: "1", toughness: "1", keywords: ["First strike", "Boast"], oracle: "First strike\nBoast — {2}{R}: This creature gets +2/+0 until end of turn. (Activate only if this creature attacked this turn and only once each turn.)" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...over });
function board({ user = [], hand = [], pool = {}, active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) } } };
}
const red = (s) => s.players.user.manaPool.R;
const addPool = (s, mana) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: Object.fromEntries(Object.entries(s.players.user.manaPool).map(([c, n]) => [c, n + (mana[c] || 0)])) } } });
/** Cast the Bolt at the opponent, let Birgi's trigger and the Bolt resolve: Birgi's {R} is in the pool, held. */
const castBolt = (s0) => {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ai");
  let s = flushTriggers(dispatchAction(s0, act), { chooseTargets: chooseTriggerTargets });
  while ((s.stack || []).length) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
};
const boasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "pup");

describe("classify", () => {
  it("Birgi → native-mixed; Harnfel → native-activated", () => {
    expect([classifyCard(BIRGI), classifyCard(HARNFEL)]).toEqual(["native-mixed", "native-activated"]);
  });
});

describe("whenever you cast a spell, add {R} — and you don't lose THIS mana until end of turn", () => {
  it("⭐ the {R} survives the step's end; a Mountain's red beside it does not; cleanup empties it", () => {
    const s = castBolt(board({ user: [P("birgi", BIRGI)], hand: [{ ...BOLT, id: "bolt" }], pool: { R: 1 } }));
    const afterStep = emptyManaPools(s);
    const withMountain = emptyManaPools(addPool(s, { R: 1 }));
    const row = { added: red(s), afterStep: red(afterStep), withMountain: red(withMountain), afterCleanup: red(finishCleanupActions(afterStep)) };
    console.log("  WITNESS birgiMana", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ added: 1, afterStep: 1, withMountain: 1, afterCleanup: 0 });
  });

  it("the same sentence on other carriers, across colors: Savage Ventmaw attacks — {R}{R}{R}{G}{G}{G}, all of it held to end of turn", () => {
    const VENTMAW = { name: "Savage Ventmaw", type: "Creature — Dragon", mana: "{4}{R}{G}", cmc: 6, power: "4", toughness: "4", keywords: ["Flying"], oracle: "Flying\nWhenever this creature attacks, add {R}{R}{R}{G}{G}{G}. Until end of turn, you don't lose this mana as steps and phases end." };
    const s0 = board({ user: [P("ventmaw", VENTMAW)] });
    const fired = triggersForEvent(s0, { event: "attacks", sourcePermanent: s0.players.user.battlefield[0] });
    const s = resolveTopOfStack(flushTriggers({ ...s0, pendingTriggers: fired }, { chooseTargets: chooseTriggerTargets }));
    const pool = (x) => ({ R: x.players.user.manaPool.R, G: x.players.user.manaPool.G });
    expect({ fired: fired.length, added: pool(s), afterStep: pool(emptyManaPools(s)), afterCleanup: pool(finishCleanupActions(s)) })
      .toEqual({ fired: 1, added: { R: 3, G: 3 }, afterStep: { R: 3, G: 3 }, afterCleanup: { R: 0, G: 0 } });
  });

  it("spent — on a boast, an ability — the hold goes with it: red added afterwards empties at the step's end", () => {
    const s0 = castBolt(board({ user: [P("birgi", BIRGI), P("pup", PUP, { attackedThisTurn: true })], hand: [{ ...BOLT, id: "bolt" }], pool: { R: 1 } }));
    const spent = resolveTopOfStack(dispatchAction(addPool(s0, { C: 2 }), boasts(addPool(s0, { C: 2 }))[0]));
    expect({ redLeft: red(spent), afterMountainStep: red(emptyManaPools(addPool(spent, { R: 1 }))) }).toEqual({ redLeft: 0, afterMountainStep: 0 });
  });
});

describe("creatures you control can boast twice during each of your turns", () => {
  // Mana for three boasts ({2}{R} each), so a third that isn't offered is the limit's doing, never the pool's.
  const twice = (birgi) => {
    let s = board({ user: [...(birgi ? [P("birgi", BIRGI)] : []), P("pup", PUP, { attackedThisTurn: true })], pool: { R: 9 } });
    const offered = [];
    for (let i = 0; i < 3; i++) {
      const act = boasts(s)[0];
      offered.push(!!act);
      if (!act) break;
      s = resolveTopOfStack(dispatchAction(s, act));
    }
    return offered;
  };
  it("⭐ with Birgi: a second boast this turn, not a third; without her: once", () => {
    expect({ withBirgi: twice(true), without: twice(false) }).toEqual({ withBirgi: [true, true, false], without: [true, false] });
  });
});
