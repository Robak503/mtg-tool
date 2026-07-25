/**
 * activationLimitCount.test.js — the COUNTED per-turn activation limit (census slice 11).
 *
 * BLITZ ONCE-1 modeled the frequency restriction as a BOOLEAN, so only "Activate only once each turn."
 * was expressible. A boolean cannot say "twice" — Pit Imp / Phyrexian Battleflies ("Activate no more than
 * twice each turn.") and Soul Kiss ("…three times…") had no lane, and their pump was already modeled, so
 * the limit sentence alone was the blocker.
 *
 * The parsed value is now `activationLimit` (a COUNT, 1 for the "only once" frame) and the ledger records
 * `{ turn, n }` instead of a bare turn.
 *
 * THE FALSE POSITIVE THIS GUARDS. The forbidden direction here is a PERMISSIVE engine — an off-by-one in
 * the offer gate (`used > limit` instead of `used >= limit`) or a counter that fails to restart on a new
 * turn hands out an activation the card does not have. Both boundaries are pinned below, on both a real
 * counted carrier AND the pre-existing once-per-turn frame (the 56 native carriers of which are the real
 * regression risk in this change, not the 7 new ones).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PIT_IMP = { id: "pi", name: "Pit Imp", type: "Creature — Imp", mana: "{B}", power: "0", toughness: "1",
  oracle: "Flying\n{B}: This creature gets +1/+0 until end of turn. Activate no more than twice each turn." };
const ROOTWALLA = { id: "rw", name: "Rootwalla", type: "Creature — Lizard", mana: "{2}{G}", power: "2", toughness: "2",
  oracle: "{1}{G}: This creature gets +2/+2 until end of turn. Activate only once each turn." };

describe("parse", () => {
  it("the counted frame yields activationLimit 2 and strips for the effect parse", () => {
    const abs = parseActivatedAbilities(PIT_IMP);
    expect(abs).toHaveLength(1);
    expect(abs[0].activationLimit).toBe(2);
    expect(abs[0].modeled).toBe(true);
    expect(abs[0].effectClause.toLowerCase()).not.toContain("activate no more than");
  });

  it("'three times' yields 3 (Soul Kiss's printed frame)", () => {
    const abs = parseActivatedAbilities({ id: "sk", name: "Soul Kiss", type: "Enchantment — Aura", mana: "{2}{B}",
      oracle: "Enchant creature\n{B}, Pay 1 life: Enchanted creature gets +2/+2 until end of turn. Activate no more than three times each turn." });
    expect(abs[0].activationLimit).toBe(3);
  });

  it("the pre-existing 'only once' frame still parses as 1 (the 56 native carriers)", () => {
    expect(parseActivatedAbilities(ROOTWALLA)[0].activationLimit).toBe(1);
  });

  it("an ability with NO limit rider carries null — a limit is never invented", () => {
    const abs = parseActivatedAbilities({ id: "x", name: "X", type: "Creature — Bear", mana: "{G}",
      oracle: "{G}: This creature gets +1/+1 until end of turn." });
    expect(abs[0].activationLimit).toBeNull();
  });

  it("Pit Imp flips native-activated", () => {
    expect(classifyCard(PIT_IMP)).toBe("native-activated");
  });
});

describe("RUNTIME — the count is enforced, and the boundary is exact", () => {
  function board(card, permId, lands = 3) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const subject = createPermanent({ id: permId, card, controller: "user", summoningSick: false });
    const swamp = (id) => createPermanent({ id, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false });
    const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    const mana = Array.from({ length: lands }, (_, i) => (card === ROOTWALLA ? forest(`f${i}`) : swamp(`s${i}`)));
    return {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, battlefield: [subject, ...mana] } },
    };
  }
  const untapAllMana = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } });
  const offers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);

  it("a limit-2 ability is offered for activations 1 and 2, and NOT for 3", () => {
    let s = board(PIT_IMP, "pi");
    expect(offers(s, "pi")).toHaveLength(1);          // 1st — legal
    s = untapAllMana(dispatchAction(s, offers(s, "pi")[0]));
    expect(s.activatedOncePerTurn?.["pi:{B}: This creature gets +1/+0 until end of turn. Activate no more than twice each turn."]).toEqual({ turn: 3, n: 1 });

    expect(offers(s, "pi")).toHaveLength(1);          // 2nd — still legal, the boundary itself
    s = untapAllMana(dispatchAction(s, offers(s, "pi")[0]));
    const rec = Object.values(s.activatedOncePerTurn)[0];
    expect(rec).toEqual({ turn: 3, n: 2 });

    expect(offers(s, "pi")).toHaveLength(0);          // 3rd — the card says no
  });

  it("the counter RESTARTS on a new turn (self-expiring ledger, not a permanent lockout)", () => {
    let s = board(PIT_IMP, "pi");
    s = untapAllMana(dispatchAction(s, offers(s, "pi")[0]));
    s = untapAllMana(dispatchAction(s, offers(s, "pi")[0]));
    expect(offers(s, "pi")).toHaveLength(0);
    const nextTurn = untapAllMana({ ...s, turn: 4 });
    expect(offers(nextTurn, "pi")).toHaveLength(1);
    // …and the fresh turn's first activation restarts the count at 1 rather than resuming at 3.
    const after = dispatchAction(nextTurn, offers(nextTurn, "pi")[0]);
    expect(Object.values(after.activatedOncePerTurn)[0]).toEqual({ turn: 4, n: 1 });
  });

  it("REGRESSION — the once-per-turn frame still allows exactly ONE activation", () => {
    let s = board(ROOTWALLA, "rw");
    expect(offers(s, "rw")).toHaveLength(1);
    s = untapAllMana(dispatchAction(s, offers(s, "rw")[0]));
    expect(offers(s, "rw")).toHaveLength(0);
    expect(offers(untapAllMana({ ...s, turn: 4 }), "rw")).toHaveLength(1);
  });

  it("an UNLIMITED ability is never gated (no ledger key, no cap)", () => {
    const free = { id: "fr", name: "Free", type: "Creature — Bear", mana: "{B}", power: "1", toughness: "1",
      oracle: "{B}: This creature gets +1/+0 until end of turn." };
    let s = board(free, "fr");
    expect(offers(s, "fr")[0].oncePerTurnKey).toBeUndefined();
    s = untapAllMana(dispatchAction(s, offers(s, "fr")[0]));
    expect(offers(s, "fr")).toHaveLength(1);
    s = untapAllMana(dispatchAction(s, offers(s, "fr")[0]));
    expect(offers(s, "fr")).toHaveLength(1);
  });
});
