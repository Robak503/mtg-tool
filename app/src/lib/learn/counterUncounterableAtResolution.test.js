/**
 * counterUncounterableAtResolution.test.js — CR 701.6a asked AT RESOLUTION, on every counter path (2026-09-30, the 09-06
 * plan's stage ③ · 2).
 *
 * Uncounterability used to be enforced in exactly one place: the counter-TARGET enumeration, when a counterspell is
 * cast. Four paths never passed through it:
 *   · the counters that name no target — Kira's synchronous counter; the cast-trigger counters (Vexing Bauble, Lunar
 *     Force, …); the Glasskites' becomes-target counter;
 *   · the soft-counter DECLINE (ward, Diffusion Sliver, "unless its controller pays") — and the ward prompt itself,
 *     which asked a player to pay for a counter that could not happen;
 *   · a TARGETED counter whose target was made uncounterable after it was cast (Vexing Shusher's grant in response).
 * One entry now asks first (atoms/stack.js counterIfCounterable, reading staticAbilityParser.stackSpellIsUncounterable).
 *
 * ⭐ THE RIDERS STILL HAPPEN. The target is legal; only the counter fails. Bundled rulings, read 2026-09-30:
 *   Swan Song (2013-09-15) — "That spell won't be countered when Swan Song resolves, but its controller will get a Bird
 *   token." Mana Drain (2020-11-10) — "If the target is legal but not countered … you do add mana." Vexing Shusher
 *   (2020-08-07) — "any additional effects of the countering spell or ability will still happen."
 *
 * ⛔ Venser's bounce is not a counter: it still returns an uncounterable spell to its owner's hand.
 *
 * Every positive case has a VACUITY CONTROL beside it — the same board without the protection, where the counter must
 * land — so a harness that silently does nothing can never pass for a working gate. Real oracle fixtures (bundled
 * Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { stackResolvers } from "./effects/atoms/stack.js";
import { setPendingSoftCounterChoice } from "./pendingChoice.js";
import { resolveSoftCounterChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const CHIMIL = { id: "chimil-c", name: "Chimil, the Inner Sun", type: "Legendary Artifact", mana: "{6}",
  oracle: "Spells you control can't be countered.\nAt the beginning of your end step, discover 5. (Exile cards from the top of your library until you exile a nonland card with mana value 5 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" };
const KIRA = { id: "kira-c", name: "Kira, Great Glass-Spinner", type: "Legendary Creature — Spirit", mana: "{1}{U}{U}", power: 2, toughness: 2,
  oracle: "Flying\nCreatures you control have \"Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.\"" };
const BAUBLE = { id: "bauble-c", name: "Vexing Bauble", type: "Artifact", mana: "{1}",
  oracle: "Whenever a player casts a spell, if no mana was spent to cast it, counter that spell.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const LUNAR_FORCE = { id: "lf-c", name: "Lunar Force", type: "Enchantment", mana: "{2}{U}",
  oracle: "When an opponent casts a spell, sacrifice this enchantment and counter that spell." };
const RAPTOR = { id: "raptor-c", name: "Hulking Raptor", type: "Creature — Dinosaur", mana: "{2}{G}{G}", power: 5, toughness: 3,
  oracle: "Ward {2}\nAt the beginning of your first main phase, add {G}{G}." };
const DIFFUSION = { id: "ds-c", name: "Diffusion Sliver", type: "Creature — Sliver", mana: "{1}{U}", power: 1, toughness: 1,
  oracle: "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}." };
const ORNITHOPTER = { id: "orni-c", name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", mana_cost: "{0}", cmc: 0, power: 0, toughness: 2,
  keywords: ["flying"], oracle: "Flying" };
const BEAR = { id: "gb-c", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const COUNTERSPELL = { id: "cs", name: "Counterspell", type: "Instant", mana: "{U}{U}", oracle: "Counter target spell." };
const SWAN_SONG = { id: "swan", name: "Swan Song", type: "Instant", mana: "{U}",
  oracle: "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying." };
const MANA_DRAIN = { id: "drain", name: "Mana Drain", type: "Instant", mana: "{U}{U}",
  oracle: "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value." };
const MANA_LEAK = { id: "leak", name: "Mana Leak", type: "Instant", mana: "{1}{U}", oracle: "Counter target spell unless its controller pays {3}." };
const shock = (id) => ({ id, name: "Shock", type: "Instant", mana: "{R}", cmc: 1, oracle: "Shock deals 2 damage to any target." });

function mainState({ user = {}, ai = {}, active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } },
      ai: { ...s.players.ai, ...ai, manaPool: { ...s.players.ai.manaPool, ...(ai.manaPool || {}) } },
    },
  };
}
const castBy = (s, pid, cardId, targetId = null) => legalActionsForPlayer(s, pid)
  .find((a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
const logHas = (s, effect) => (s.log || []).some((e) => e.effect === effect);
const onStack = (s, name) => (s.stack || []).some((o) => o.kind === "spell" && o.source?.name === name);

// The AI casts Shock at the user; priority then sits with the user, Shock on the stack.
function aiShockOnStack(user) {
  let s = mainState({ user, ai: { hand: [shock("ai-shock")], manaPool: { R: 1 } }, active: "ai" });
  const act = castBy(s, "ai", "ai-shock", "user");
  expect(act).toBeTruthy();
  s = dispatchAction(s, act);
  const shockId = s.stack.find((o) => o.kind === "spell" && o.source?.name === "Shock").id;
  return { s: { ...s, priorityHolder: "user", consecutivePasses: 0 }, shockId };
}
// Vexing Shusher's "{R/G}: Target spell can't be countered." resolving IN RESPONSE — its real resolver, the way the
// ability would resolve above the counterspell.
const shusherGrant = (s, spellId) => stackResolvers["make-uncounterable"](s,
  { op: "make-uncounterable", targetType: "spell", spellFilter: "any", grantNotCounter: true },
  { targets: [{ type: "spell", id: spellId }], controller: "ai" });
// The user answers the AI's Shock with `card` (castable: the Shock was counterable when it was cast); `grant` decides
// whether the Shusher resolves in response; then the counterspell resolves.
function answerShock(card, { grant, manaPool }) {
  const { s, shockId } = aiShockOnStack({ hand: [card], manaPool });
  const cast = castBy(s, "user", card.id, shockId);
  expect(cast).toBeTruthy();
  let out = dispatchAction(s, cast);
  if (grant) out = shusherGrant(out, shockId);
  out = resolveTopOfStack(out);
  return { out, shockId };
}

describe("TARGETED counters meet a spell made uncounterable after they were cast (Vexing Shusher in response)", () => {
  it("VACUITY CONTROL — with no grant, Counterspell counters the Shock", () => {
    const { out } = answerShock(COUNTERSPELL, { grant: false, manaPool: { U: 2 } });
    expect(onStack(out, "Shock")).toBe(false);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Shock");
  });

  it("Counterspell resolves, the Shock stays, and then lands", () => {
    const { out } = answerShock(COUNTERSPELL, { grant: true, manaPool: { U: 2 } });
    expect(onStack(out, "Shock")).toBe(true);
    expect(logHas(out, "counter-uncounterable")).toBe(true);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Counterspell");
    const lifeBefore = out.players.user.life;
    const after = resolveTopOfStack(out);
    expect(after.players.user.life).toBe(lifeBefore - 2);
  });

  it("⭐ Swan Song: not countered — and its controller STILL gets the Bird (the Swan Song ruling)", () => {
    const { out } = answerShock(SWAN_SONG, { grant: true, manaPool: { U: 1 } });
    expect(onStack(out, "Shock")).toBe(true);
    const birds = out.players.ai.battlefield.filter((p) => /bird/i.test(`${p.card?.name} ${p.card?.type}`));
    expect(birds).toHaveLength(1);
    console.log(`WITNESS uncounterableSwanSong ${JSON.stringify({ shockStayed: onStack(out, "Shock"), aiBirds: birds.length })}`);
  });

  it("⭐ Mana Drain: not countered — and the {C} is STILL scheduled (the Mana Drain ruling)", () => {
    const control = answerShock(MANA_DRAIN, { grant: false, manaPool: { U: 2 } }).out;
    const { out } = answerShock(MANA_DRAIN, { grant: true, manaPool: { U: 2 } });
    expect(onStack(control, "Shock")).toBe(false);
    expect(onStack(out, "Shock")).toBe(true);
    const drains = (st) => (st.delayedTriggers || []).filter((d) => /add \{c\}/i.test(JSON.stringify(d))).length;
    expect(drains(control)).toBe(1);
    expect(drains(out)).toBe(1);
    console.log(`WITNESS uncounterableManaDrain ${JSON.stringify({ shockStayed: onStack(out, "Shock"), scheduled: drains(out) })}`);
  });

  it("Mana Leak asks for no payment (there is nothing it could buy); the Shock stays — control: it asks without the grant", () => {
    const control = answerShock(MANA_LEAK, { grant: false, manaPool: { U: 1, C: 1 } }).out;
    expect(control.pendingChoice).toBeTruthy();
    const { out } = answerShock(MANA_LEAK, { grant: true, manaPool: { U: 1, C: 1 } });
    expect(out.pendingChoice).toBeFalsy();
    expect(onStack(out, "Shock")).toBe(true);
    expect(logHas(out, "counter-uncounterable")).toBe(true);
  });
});

describe("UNTARGETED counters — no enumeration ever ran for these", () => {
  it("Vexing Bauble: a {0} Ornithopter cast by Chimil's controller is NOT countered — control: without Chimil it is", () => {
    const run = (withChimil) => {
      const s = mainState({
        user: { hand: [ORNITHOPTER], battlefield: withChimil ? [createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" })] : [] },
        ai: { battlefield: [createPermanent({ id: "perm-bauble", card: BAUBLE, controller: "ai", summoningSick: false })] },
      });
      let out = flushTriggers(dispatchAction(s, castBy(s, "user", "orni-c")));
      expect(out.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
      out = resolveTopOfStack(out); // the Bauble's trigger
      const stayed = onStack(out, "Ornithopter");
      if (stayed) out = resolveTopOfStack(out);
      return { out, stayed };
    };
    const control = run(false);
    expect(control.stayed).toBe(false);
    expect(control.out.players.user.graveyard.map((c) => c.name)).toContain("Ornithopter");
    const { out, stayed } = run(true);
    expect(stayed).toBe(true);
    expect(out.players.user.battlefield.some((p) => p.card?.name === "Ornithopter")).toBe(true);
    console.log(`WITNESS uncounterableBauble ${JSON.stringify({ controlCountered: !control.stayed, withChimilResolved: stayed })}`);
  });

  it("Lunar Force: still sacrificed (the additional effect happens), but the Shock resolves", () => {
    const s = mainState({
      user: { hand: [shock("u-shock")], manaPool: { R: 1 }, battlefield: [createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" })] },
      ai: { battlefield: [createPermanent({ id: "perm-lf", card: LUNAR_FORCE, controller: "ai" })] },
    });
    const lifeBefore = s.players.ai.life;
    let out = flushTriggers(dispatchAction(s, castBy(s, "user", "u-shock", "ai")));
    out = resolveTopOfStack(out); // Lunar Force's trigger
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Lunar Force");
    expect(onStack(out, "Shock")).toBe(true);
    out = resolveTopOfStack(out);
    expect(out.players.ai.life).toBe(lifeBefore - 2);
  });

  it("Kira: Chimil's controller Shocks a creature under Kira — no counter, the Bears die", () => {
    const s = mainState({
      user: { hand: [shock("u-shock")], manaPool: { R: 1 }, battlefield: [createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" })] },
      ai: { battlefield: [createPermanent({ id: "perm-k", card: KIRA, controller: "ai" }), createPermanent({ id: "perm-b", card: BEAR, controller: "ai" })] },
    });
    let out = dispatchAction(s, castBy(s, "user", "u-shock", "perm-b"));
    expect(onStack(out, "Shock")).toBe(true);
    expect(logHas(out, "counter-uncounterable")).toBe(true);
    out = resolveTopOfStack(out);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
  });
});

describe("WARD asks for no payment against a spell that can't be countered", () => {
  const shockTheRaptor = (withChimil) => {
    const s = mainState({
      user: { hand: [shock("u-shock")], manaPool: { R: 1 }, battlefield: withChimil ? [createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" })] : [] },
      ai: { battlefield: [createPermanent({ id: "perm-r", card: RAPTOR, controller: "ai" })] },
    });
    return dispatchAction(s, castBy(s, "user", "u-shock", "perm-r"));
  };

  it("VACUITY CONTROL — without Chimil the ward payment is asked for", () => {
    expect(shockTheRaptor(false).pendingChoice).toBeTruthy();
  });

  it("with Chimil: no payment asked, the Shock resolves onto the Raptor", () => {
    let out = shockTheRaptor(true);
    expect(out.pendingChoice).toBeFalsy();
    expect(logHas(out, "counter-uncounterable")).toBe(true);
    out = resolveTopOfStack(out);
    expect(out.players.ai.battlefield.find((p) => p.id === "perm-r").damageMarked).toBe(2);
  });
});

describe("DIFFUSION SLIVER (the group ward) asks for no payment either", () => {
  const shockTheSliver = (withChimil) => {
    const s = mainState({
      user: { hand: [shock("u-shock")], manaPool: { R: 1 }, battlefield: withChimil ? [createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" })] : [] },
      ai: { battlefield: [createPermanent({ id: "perm-ds", card: DIFFUSION, controller: "ai" })] },
    });
    return dispatchAction(s, castBy(s, "user", "u-shock", "perm-ds"));
  };

  it("VACUITY CONTROL — without Chimil the Diffusion payment is asked for", () => {
    expect(shockTheSliver(false).pendingChoice).toBeTruthy();
  });

  it("with Chimil: no payment asked, logged, and the Shock resolves", () => {
    let out = shockTheSliver(true);
    expect(out.pendingChoice).toBeFalsy();
    expect(logHas(out, "counter-uncounterable")).toBe(true);
    out = resolveTopOfStack(out);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Diffusion Sliver"); // 2 damage to a 1/1
  });
});

describe("the soft-counter DECLINE asks too — a belt: every prompt path above skips an uncounterable spell first", () => {
  // Driven directly, because play cannot reach it: each prompt is settled before anyone gets priority, and every path
  // that raises one now checks first. The contract still holds on its own — a declined payment never counters a spell
  // that can't be countered — so a hand-built or future path cannot reopen the false positive.
  const declined = (mark) => {
    const { s, shockId } = aiShockOnStack({});
    let st = setPendingSoftCounterChoice(s, { controller: "ai", amount: 3, spellId: shockId, spellName: "Shock", sourceName: "Mana Leak" });
    if (mark) st = shusherGrant(st, shockId);
    return resolveSoftCounterChoice(st, false);
  };

  it("VACUITY CONTROL — declined without the mark, the Shock is countered", () => {
    expect(onStack(declined(false), "Shock")).toBe(false);
  });

  it("declined with the mark, the Shock stays", () => {
    const out = declined(true);
    expect(onStack(out, "Shock")).toBe(true);
    expect(logHas(out, "counter-uncounterable")).toBe(true);
  });
});

describe("⛔ Venser's bounce is NOT a counter", () => {
  it("an uncounterable spell is still returned to its owner's hand", () => {
    const { s, shockId } = aiShockOnStack({});
    const marked = shusherGrant(s, shockId);
    const out = stackResolvers["bounce-spell-or-permanent"](marked, { op: "bounce-spell-or-permanent" },
      { targets: [{ type: "spell", id: shockId }], controller: "user" });
    expect(onStack(out, "Shock")).toBe(false);
    expect(out.players.ai.hand.map((c) => c.name)).toContain("Shock");
  });
});
