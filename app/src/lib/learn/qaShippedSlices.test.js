/**
 * qaShippedSlices.test.js — END-TO-END QA for the cards shipped 2026-08-01. **Do these cards actually PLAY?**
 *
 * ⭐ WHY THIS FILE EXISTS (Colton, 2026-08-01): "do a QA pass and bug test for the work you're doing to make
 * sure the cards you make actually play." Every slice this session already had a runtime test — but those
 * called `runEffectProgram` DIRECTLY, which proves the effect resolves once handed a program. It does NOT
 * prove the card can be CAST: that the action enumerator offers it, that the dispatcher accepts it, that the
 * stack resolves it. That gap is a documented failure mode on this project — the MASS-NC slice shipped cards
 * that classified native and were UNCASTABLE, because the cast flow treated a mass effect as targeted, found
 * no target, and dropped the action. A green classification test saw nothing.
 *
 * So every case here goes the whole way: legalActionsForPlayer → dispatchAction → resolveTopOfStack, and then
 * asserts the board actually changed. Fixtures use real printed oracle text from the bundled index.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}

/** Put `card` in hand with the mana to pay for it, plus whatever zones the case needs. */
function withHand(card, mana, zones = {}) {
  const s = mainState();
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [card], manaPool: { ...s.players.user.manaPool, ...mana }, ...zones },
    },
  };
}

/** Cast a card end-to-end and return the post-resolution state. Fails loudly if it was never OFFERED. */
function castAndResolve(state, cardId) {
  const cast = legalActionsForPlayer(state, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(cast, `${cardId} must be OFFERED by legalActionsForPlayer — an unoffered card is uncastable`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(state, cast));
}

const gyCard = (id, name, type) => ({ id, name, type, mana: "{1}" });
const bfNames = (s, pid = "user") => (s.players[pid].battlefield || []).map((p) => p.card?.name ?? p.name).sort();
/** Graveyard contents EXCLUDING the spell that just resolved — CR 608.2m puts it there as the last step of
 *  its own resolution, so it is expected company and would otherwise mask what the effect actually left. */
const gyNamesExcept = (s, spellName) => (s.players.user.graveyard || []).map((c) => c.name).filter((n) => n !== spellName).sort();

// ─────────────────────── MASS GRAVEYARD REANIMATE (+7) ───────────────────────

describe("QA — Splendid Reclamation is castable and actually returns the lands", () => {
  it("cast → every land card leaves the graveyard and enters the battlefield TAPPED", () => {
    const card = { id: "c-splendid", name: "Splendid Reclamation", type: "Sorcery", mana: "{3}{G}",
      oracle: "Return all land cards from your graveyard to the battlefield tapped." };
    const s = withHand(card, { G: 1, C: 3 }, {
      graveyard: [gyCard("g1", "Forest", "Basic Land — Forest"), gyCard("g2", "Island", "Basic Land — Island"), gyCard("g3", "Shock", "Instant")],
    });
    const after = castAndResolve(s, "c-splendid");
    expect(bfNames(after)).toEqual(["Forest", "Island"]);
    expect(gyNamesExcept(after, "Splendid Reclamation")).toEqual(["Shock"]); // the non-land stayed put
    // "tapped" is printed on the card — a fetch that arrives untapped is a materially stronger card.
    const returned = after.players.user.battlefield.filter((p) => ["Forest", "Island"].includes(p.card?.name));
    expect(returned.every((p) => p.tapped === true)).toBe(true);
  });
});

describe("QA — Brilliant Restoration (the ' and '-union) is castable and returns BOTH types", () => {
  it("cast → artifacts AND enchantments come back, creatures do not", () => {
    const card = { id: "c-brilliant", name: "Brilliant Restoration", type: "Sorcery", mana: "{4}{W}{W}",
      oracle: "Return all artifact and enchantment cards from your graveyard to the battlefield." };
    const s = withHand(card, { W: 2, C: 4 }, {
      graveyard: [gyCard("g1", "Sol Ring", "Artifact"), gyCard("g2", "Ghostly Prison", "Enchantment"), gyCard("g3", "Grizzly Bears", "Creature — Bear")],
    });
    const after = castAndResolve(s, "c-brilliant");
    expect(bfNames(after)).toEqual(["Ghostly Prison", "Sol Ring"]);
    expect(gyNamesExcept(after, "Brilliant Restoration")).toEqual(["Grizzly Bears"]);
  });
});

// ─────────────────────── MASS RETURN TO HAND (+2) ───────────────────────

describe("QA — Wisdom of Ages is castable and actually fills the hand", () => {
  it("cast → every instant/sorcery card leaves the graveyard for the hand", () => {
    const card = { id: "c-wisdom", name: "Wisdom of Ages", type: "Sorcery", mana: "{4}{U}{U}{U}",
      oracle: "Return all instant and sorcery cards from your graveyard to your hand." };
    const s = withHand(card, { U: 3, C: 4 }, {
      graveyard: [gyCard("g1", "Ancestral Recall", "Instant"), gyCard("g2", "Demonic Tutor", "Sorcery"), gyCard("g3", "Grizzly Bears", "Creature — Bear")],
    });
    const after = castAndResolve(s, "c-wisdom");
    expect(after.players.user.hand.map((c) => c.name).sort()).toEqual(["Ancestral Recall", "Demonic Tutor"]);
    expect(gyNamesExcept(after, "Wisdom of Ages")).toEqual(["Grizzly Bears"]);
    expect(after.players.user.battlefield.length).toBe(0); // hand, never the battlefield
  });
});

// ─────────────────────── PARTNER WITH (+16) ───────────────────────

describe("QA — a Partner with creature is castable and its ETB really offers the search", () => {
  it("cast Lore Weaver → it enters, and the ETB pauses on a choice that can only find Ley Weaver", () => {
    // Partner-with's ability is an ETB TRIGGER, so "plays" means: the creature casts, resolves onto the
    // battlefield, and the trigger reaches a real pending choice — not merely that the atom works.
    const card = { id: "c-lore", name: "Lore Weaver", type: "Creature — Human Wizard", mana: "{3}{U}", power: "2", toughness: "3",
      oracle: "Partner with Ley Weaver (When this creature enters, target player may put Ley Weaver into their hand from their library, then shuffle.)\n{5}{U}{U}: Target player draws two cards." };
    const s = withHand(card, { U: 1, C: 3 }, {
      library: [{ id: "L1", name: "Ley Weaver", type: "Creature — Human Druid", mana: "{3}{G}" },
        { id: "L2", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}" }],
    });
    let after = castAndResolve(s, "c-lore");
    expect(bfNames(after)).toContain("Lore Weaver");                 // the body actually landed
    after = flushTriggers(after, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while ((after.stack || []).length && !after.pendingChoice && guard++ < 20) after = resolveTopOfStack(after);
    // The ability is a "may", so the engine parks on a decision rather than acting.
    expect(after.pendingChoice, "the ETB must reach a real decision").toBeTruthy();
    expect(["optional-effect", "tutor-search"]).toContain(after.pendingChoice.kind);

    // ⭐ AND DRIVE IT HOME — "reaches a decision" is not "plays". Take the may, then the search, and assert
    // the named partner is genuinely in hand and out of the library. Stopping short of this is the exact
    // half-measure that let the aura host-dies trigger look healthy while doing nothing.
    if (after.pendingChoice.kind === "optional-effect") after = resolveOptionalChoice(after, true);
    expect(after.pendingChoice?.kind).toBe("tutor-search");
    expect(after.pendingChoice.candidates.map((c) => c.name)).toEqual(["Ley Weaver"]); // only the NAMED card
    after = resolveTutorChoice(after, "L1");
    expect(after.players.user.hand.map((c) => c.name)).toEqual(["Ley Weaver"]);
    expect(after.players.user.library.map((c) => c.name)).toEqual(["Llanowar Elves"]);
  });
});
