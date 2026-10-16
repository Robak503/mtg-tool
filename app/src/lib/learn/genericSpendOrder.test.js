/**
 * genericSpendOrder.test.js — generic is paid COLORLESS FIRST from mana already made (manaModel GENERIC_SPEND_ORDER).
 *
 * Shelf slice D26 (2026-09-30) measured the old order: the planner drained the floating pool W→U→B→R→G→C, so a {2}{R}
 * paid from {R:3, C:2} spent all three red and kept both colorless, and the Lightning Bolt meant to follow could not be
 * cast. Any type of mana pays generic (CR 107.4b); a colored mana left floating can still pay a colored pip later in the
 * step (CR 106.4), a colorless one only generic or a colorless symbol (CR 107.4c). One order now serves every generic
 * spend: the floating pool, the mana a tap makes beside the color it was taken for, a restricted entry, and the explicit
 * tap's activation cost (payActivationFromPool, which was colorless-first already).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-16): Purphoros, God of the Forge · Sliver Queen · Lightning
 * Bolt · Rakdos Signet. The two planner pins at the end use hand-built records, because no real card reaches those paths
 * with colorless beside a color (measured on the bundled corpus 2026-10-16): of the twelve cards that add {C} beside a
 * color, eleven print the {C} first (Coral Atoll's "{T}: Add {C}{U}." among them) and the twelfth, Opening Ceremony's
 * {W}{U}{B}{R}{G}{C}, is a sorcery; and no card mints a restricted entry holding colorless beside a color.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { planPayment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PURPHOROS = { name: "Purphoros, God of the Forge", type: "Legendary Enchantment Creature — God", mana: "{3}{R}", power: "6", toughness: "5", keywords: ["Indestructible"], colors: ["R"],
  oracle: "Indestructible\nAs long as your devotion to red is less than five, Purphoros isn't a creature.\nWhenever another creature you control enters, Purphoros deals 2 damage to each opponent.\n{2}{R}: Creatures you control get +1/+0 until end of turn." };
const SLIVER_QUEEN = { name: "Sliver Queen", type: "Legendary Creature — Sliver", mana: "{W}{U}{B}{R}{G}", power: "7", toughness: "7", keywords: [], colors: ["B", "G", "R", "U", "W"],
  oracle: "{2}: Create a 1/1 colorless Sliver creature token." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const RAKDOS_SIGNET = { name: "Rakdos Signet", type: "Artifact", mana: "{2}", keywords: [], colors: [], oracle: "{1}, {T}: Add {B}{R}." };

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function table({ user = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...NO_MANA, ...mana } } } };
}
const P = (id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false });
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no such action offered"); return dispatchAction(s, a); }
/** Resolve the stack — and fail loudly on a resolver crash (the engine logs one as a stack-resolve-error instead of throwing). */
const settle = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
const pool = (s) => ({ ...s.players.user.manaPool });
const boltAtAi = (a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ai";
const boltOffered = (s) => legalActionsForPlayer(s, "user").some(boltAtAi);

describe("the cards", () => {
  it("Purphoros, Sliver Queen, Lightning Bolt and Rakdos Signet read native", () => {
    expect(Object.fromEntries([PURPHOROS, SLIVER_QUEEN, BOLT, RAKDOS_SIGNET].map((c) => [c.name, classifyCard(c)]))).toEqual({
      "Purphoros, God of the Forge": "native-mixed", "Sliver Queen": "native-activated", "Lightning Bolt": "native-spell", "Rakdos Signet": "native-mana",
    });
  });
});

describe("the floating pool pays generic colorless first — through legalActionsForPlayer + dispatchAction", () => {
  it("{2}{R} from {R:3, C:2}: the two colorless pay the generic, {R:2} floats, and the Bolt is cast with it", () => {
    const s0 = table({ user: [P("purph", PURPHOROS)], hand: [["bolt", BOLT]], mana: { R: 3, C: 2 } });
    const paid = act(s0, (a) => a.kind === "activate-ability" && a.permanentId === "purph");
    const resolved = settle(paid);
    const lifeBefore = resolved.players.ai.life;
    const bolted = settle(act(resolved, boltAtAi));
    expect({ afterActivation: pool(paid), boltOffered: boltOffered(resolved), afterBolt: pool(bolted), damage: lifeBefore - bolted.players.ai.life })
      .toEqual({ afterActivation: { ...NO_MANA, R: 2 }, boltOffered: true, afterBolt: { ...NO_MANA, R: 1 }, damage: 3 });
  });

  it("{2} from {R:1, C:2}: the red is left unspent, and the Bolt is cast with it", () => {
    const s0 = table({ user: [P("queen", SLIVER_QUEEN)], hand: [["bolt", BOLT]], mana: { R: 1, C: 2 } });
    const paid = act(s0, (a) => a.kind === "activate-ability" && a.permanentId === "queen");
    const resolved = settle(paid);
    const lifeBefore = resolved.players.ai.life;
    const bolted = settle(act(resolved, boltAtAi));
    expect({ afterActivation: pool(paid), slivers: resolved.players.user.battlefield.filter((p) => p.card?.token).length, afterBolt: pool(bolted), damage: lifeBefore - bolted.players.ai.life })
      .toEqual({ afterActivation: { ...NO_MANA, R: 1 }, slivers: 1, afterBolt: NO_MANA, damage: 3 });
  });

  it("an exact payment is unchanged: {2}{R} from {R:1, C:2} spends all three — the red on the {R} pip, the colorless on the generic", () => {
    const s0 = table({ user: [P("purph", PURPHOROS)], hand: [["bolt", BOLT]], mana: { R: 1, C: 2 } });
    const paid = act(s0, (a) => a.kind === "activate-ability" && a.permanentId === "purph");
    expect({ afterActivation: pool(paid), boltOffered: boltOffered(settle(paid)) }).toEqual({ afterActivation: NO_MANA, boltOffered: false });
  });

  it("the explicit tap of a mana-costed source pays its activation colorless first: Rakdos Signet's {1} from {R:1, C:1}", () => {
    const s0 = table({ user: [P("signet", RAKDOS_SIGNET)], mana: { R: 1, C: 1 } });
    const tapped = act(s0, (a) => a.kind === "tap-for-mana" && a.permanentId === "signet");
    expect(pool(tapped)).toEqual({ ...NO_MANA, B: 1, R: 2 });
  });
});

describe("the planner's other two generic spends (hand-built records — see the header)", () => {
  it("a tap that prints its color before its colorless pays generic with the colorless, and the color floats", () => {
    const bundle = { permanentId: "bundle", colors: ["U", "C"], amount: 2, fixed: { U: 1, C: 1 } };
    const plan = planPayment(NO_MANA, [bundle], { generic: 1 });
    expect({ taps: plan.taps.map((t) => t.permanentId), spend: plan.spend }).toEqual({ taps: ["bundle"], spend: { ...NO_MANA, C: 1 } });
  });

  it("a restricted entry pays generic with its colorless first, and its red stays in the entry", () => {
    const entry = { pool: { ...NO_MANA, R: 1, C: 1 }, restriction: { castTypes: ["@any-spell"] } };
    const plan = planPayment(NO_MANA, [], { generic: 1 }, { castCard: BOLT, restrictedEntries: [entry] });
    expect({ entrySpends: plan.entrySpends, spend: plan.spend }).toEqual({ entrySpends: [{ entry: 0, spend: { ...NO_MANA, C: 1 } }], spend: NO_MANA });
  });
});
