/**
 * castVsPutEtb.test.js — "When ~ enters, IF YOU CAST IT, <effect>" (CR 603.2).
 *
 * The rider fires the ETB only when the permanent arrived by being CAST — not reanimated, not put onto the
 * battlefield by a Show and Tell, not a token copy, not blinked back. 38 corpus cards carry it and none
 * could be modelled without it; it is the SOLE blocker on five, including Tiamat (shelf — Did you say
 * Dragons?) and Zacama, Primal Calamity (rank 1786).
 *
 * ⛔ FAIL-OPEN HERE WOULD HAND A FREE TIAMAT TUTOR TO EVERY REANIMATION SPELL — exactly the abuse the
 * printed rider exists to prevent, and the reason every uncertain path below returns null or false. The
 * flag is stamped ONLY by the two CAST resolvers (PERMANENT_ETB / AURA_ETB); every other entry route leaves
 * it unset, so the condition reads false and the trigger correctly does not fire.
 *
 * Modelled on the `wasKicked` precedent one arm above it in interveningIf.js — a per-permanent fact about
 * the cast, stamped durably on the object by enterPermanent, keyed on ctx.triggeringPermanentId so it reads
 * identically at flush AND at the CR 603.4 resolution re-check.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text, verbatim.
const TIAMAT = {
  name: "Tiamat", type: "Legendary Creature — Dragon", mana: "{3}{W}{U}{B}{R}{G}", power: "7", toughness: "7",
  oracle: "Flying\nWhen Tiamat enters, if you cast it, search your library for up to five Dragon cards not named Tiamat that each have different names, reveal them, put them into your hand, then shuffle.",
};

describe("the condition is captured and now answerable", () => {
  it("detectTriggers carries the rider as an intervening-if", () => {
    const [d] = detectTriggers(TIAMAT);
    expect(d.event).toBe("etb");
    expect(d.interveningIf).toBe("you cast it");
  });

  it("⭐ Tiamat flips body-only → native-trigger", () => {
    expect(classifyCard(TIAMAT)).toBe("native-trigger");
  });

  it("⭐ so does Zacama, Primal Calamity (rank 1786)", () => {
    expect(classifyCard({ name: "Zacama, Primal Calamity", type: "Legendary Creature — Elder Dinosaur",
      mana: "{6}{R}{G}{W}", power: "9", toughness: "9",
      oracle: "When Zacama enters, if you cast it, untap all lands you control.\nVigilance, reach, trample\n{2}{R}: Zacama deals 2 damage to target creature.\n{2}{G}: Destroy target artifact or enchantment.\n{2}{W}: You gain 3 life." }))
      .toBe("native-mixed");
  });
});

describe("⭐ THE RUNTIME ASSERTION — cast fires it, every other arrival does not", () => {
  const board = (perm) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perm ? [perm] : [] } } };
  };
  const ask = (state, id) => evaluateInterveningIf(state, "you cast it", "user", { triggeringPermanentId: id });

  it("⭐ a CAST permanent (enterPermanent with wasCast) satisfies the condition", () => {
    const s = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...TIAMAT, id: "t1" }, "user", { wasCast: true });
    const perm = s.players.user.battlefield.at(-1);
    expect(perm.wasCast).toBe(true);
    expect(ask(s, perm.id)).toBe(true);
  });

  it("⛔ a REANIMATED / put-onto-the-battlefield permanent does NOT — the whole point of the rider", () => {
    // enterPermanent WITHOUT the cast opt is every non-cast route: reanimation, Show and Tell, blink,
    // a token copy. Fail-open here is a free tutor off any reanimation spell.
    const s = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...TIAMAT, id: "t2" }, "user");
    const perm = s.players.user.battlefield.at(-1);
    expect(perm.wasCast).toBeUndefined();
    expect(ask(s, perm.id)).toBe(false);
  });

  it("⛔ no entering permanent in context → null (can't confirm), never true", () => {
    expect(ask(board(null), undefined)).toBeNull();
  });

  it("⛔ the entering permanent already gone → null, never true", () => {
    expect(ask(board(null), "vanished")).toBeNull();
  });

  it("CONTROL — the condition is genuinely being evaluated, not defaulting", () => {
    // Both a true and a false answer above come from the same call shape; without this a stubbed
    // evaluator returning one constant would satisfy half the file.
    const cast = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...TIAMAT, id: "t3" }, "user", { wasCast: true });
    const put = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...TIAMAT, id: "t4" }, "user");
    expect(ask(cast, cast.players.user.battlefield.at(-1).id)).toBe(true);
    expect(ask(put, put.players.user.battlefield.at(-1).id)).toBe(false);
  });

  it("⛔ the flag does not leak onto an unrelated permanent", () => {
    const bystander = createPermanent({ id: "by", card: { id: "by", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    expect(ask(board(bystander), "by")).toBe(false);
  });
});

describe("⭐ THE SEAM — a REAL cast through the dispatcher stamps the permanent", () => {
  // ⚠️ THIS SECTION EXISTS BECAUSE A SABOTAGE CHECK SURVIVED WITHOUT IT. Removing `wasCast: true` from the
  // PERMANENT_ETB resolver — so no real cast is ever stamped and the rider can never fire — left all twelve
  // assertions above green, because they call enterPermanent directly with the flag already set. Those test
  // the stamp mechanism and the evaluator; nothing tested that the CAST PATH actually sets it, which is the
  // only place the card's behaviour lives. Same shape as the Esper Sentinel slice one commit earlier.
  const BEAR = { id: "b1", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

  function castIt(card) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [card], manaPool: { ...s.players.user.manaPool, C: 20, G: 20, W: 20, U: 20, B: 20, R: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === card.id);
    expect(cast, `${card.name}: cast offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 40) s = resolveTopOfStack(s);
    return s;
  }

  it("⭐ casting a creature for real leaves wasCast on the permanent that entered", () => {
    const s = castIt(BEAR);
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect(perm, "the Bear resolved onto the battlefield").toBeTruthy();
    expect(perm.wasCast).toBe(true);
  });

  it("⭐ and the condition therefore answers TRUE for it, end to end", () => {
    const s = castIt(BEAR);
    const perm = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect(evaluateInterveningIf(s, "you cast it", "user", { triggeringPermanentId: perm.id })).toBe(true);
  });

  it("⛔ CONTROL — the same card put onto the battlefield instead answers FALSE", () => {
    // The pair is the point: identical card, two arrival routes, two answers. Either one alone could be
    // satisfied by a constant.
    const put = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...BEAR, id: "b2" }, "user");
    const perm = put.players.user.battlefield.at(-1);
    expect(evaluateInterveningIf(put, "you cast it", "user", { triggeringPermanentId: perm.id })).toBe(false);
  });
});

describe("TIAMAT's two search riders (CR 701.19) — enforced, not assumed vacuous", () => {
  it("⭐ both ride on the tutor filter", async () => {
    const { parseEffectClause } = await import("./effects/parser.js");
    const atom = parseEffectClause(
      "search your library for up to five Dragon cards not named Tiamat that each have different names, reveal them, put them into your hand, then shuffle",
      "Instant", { hasX: false }).atoms[0];
    expect(atom.op).toBe("tutor");
    expect(atom.remaining).toBe(5);
    expect(atom.filter).toMatchObject({ excludeName: "tiamat", distinctNames: true });
  });

  it("⛔ the EXCLUDED name is not a legal candidate", async () => {
    const { cardMatchesTutorFilter } = await import("./effects/atoms/library.js");
    const f = { groups: [["dragon"]], excludeName: "Tiamat" };
    expect(cardMatchesTutorFilter({ name: "Tiamat", type: "Legendary Creature — Dragon" }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Shivan Dragon", type: "Creature — Dragon" }, f)).toBe(true);
  });

  it("CONTROL — a filter with no exclusion still accepts that name", async () => {
    // Without this, an exclusion applied unconditionally would pass the assertion above.
    const { cardMatchesTutorFilter } = await import("./effects/atoms/library.js");
    expect(cardMatchesTutorFilter({ name: "Tiamat", type: "Legendary Creature — Dragon" }, { groups: [["dragon"]] })).toBe(true);
  });
});
