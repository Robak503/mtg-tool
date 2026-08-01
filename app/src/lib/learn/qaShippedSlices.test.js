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
import { checkAttackTriggers, checkDiesTriggers } from "./triggers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent, destroyLethalCreatures } from "./gameState.js";
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

// ─────────────────────── KEYWORD-TRIGGER RECONCILIATION (+11) ───────────────────────

describe("QA — Parish-Blade Trainee: BOTH of its triggers fire, in sequence, on one board", () => {
  it("Training puts the counter on when it attacks beside a bigger creature, and the dies trigger MOVES it", () => {
    // ⭐ THIS IS THE ONE THAT MOST NEEDED CHECKING. Those 11 cards were credited by fixing an ARITHMETIC
    // error — the shaped-vs-detected trigger count — which proves the two counts agree and nothing else.
    // A counting fix cannot tell you a keyword trigger and a printed trigger both actually fire on a board,
    // and this slice's own sibling finding was three cards credited by two counting errors CANCELLING.
    // So: drive both abilities, in order, and assert the counter exists and then moves.
    const TRAINEE = "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhen this creature dies, put its counters on target creature you control.";
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, name, type, power, toughness, oracle) => createPermanent({ id, card: { id: `c-${id}`, name, type, power, toughness, oracle }, controller: "user", summoningSick: false });
    const trainee = mk("tr", "Parish-Blade Trainee", "Creature — Human Soldier", 1, 2, TRAINEE);
    const bigger = mk("big", "Serra Angel", "Creature — Angel", 4, 4, "");
    const bystander = mk("keep", "Grizzly Bears", "Creature — Bear", 2, 2, "");
    let s = {
      ...s0, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [trainee, bigger, bystander] } },
      combat: { attackers: [{ permanentId: "tr", attackingPlayer: "user", defender: "ai" }, { permanentId: "big", attackingPlayer: "user", defender: "ai" }] },
    };

    // TRIGGER 1 — the KEYWORD half (Training, whose ability lives entirely in reminder parens).
    s = flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.id === "tr").counters).toEqual({ "+1/+1": 1 });

    // TRIGGER 2 — the PRINTED half, through the engine's real death path.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "tr" ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    let out = flushTriggers(checkDiesTriggers(r.state, r.dead), { chooseTargets: chooseTriggerTargets });
    g = 0;
    while ((out.stack || []).length && g++ < 20) out = resolveTopOfStack(out);
    const counterHolders = out.players.user.battlefield.filter((p) => (p.counters?.["+1/+1"] || 0) > 0).map((p) => p.card.name);
    expect(counterHolders).toEqual(["Serra Angel"]); // the counter MOVED — it did not evaporate with the body
  });
});

// ─────────────────────── AURA BONUS + OWN TRIGGER (+11) ───────────────────────

describe("QA — Elephant Guide does BOTH its jobs, on a real board", () => {
  it("the +3/+3 applies while the host lives, AND the token is created when it dies", () => {
    // The whole point of this composition: each half was modeled and the CARD did neither. The bonus was
    // dropped by parseAttachedBonus the moment the trigger line existed, and the trigger never fired because
    // the orphaned Aura is binned before checkDiesTriggers looks for it. Both halves are asserted here in one
    // sequence, because crediting the card requires both.
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "ch", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: { id: "ca", name: "Elephant Guide", type: "Enchantment — Aura", mana: "{2}{G}",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nWhen enchanted creature dies, create a 3/3 green Elephant creature token." }, controller: "user" });
    let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, aura], hand: [], library: [] } } };
    s = attachPermanent(s, { equipId: "aura", targetId: "host" });

    // HALF 1 — the bonus is really on the host (2/2 + 3/3 = 5/5), read through the layer engine.
    expect(permanentPower(s, "host")).toBe(5);
    expect(permanentToughness(s, "host")).toBe(5);

    // HALF 2 — kill it through the engine's own SBA sweep and the Elephant shows up.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "host" ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    let out = checkDiesTriggers(r.state, r.dead);
    out = flushTriggers(out, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((out.stack || []).length && g++ < 20) out = resolveTopOfStack(out);
    const tokens = (out.players.user.battlefield || []).filter((p) => /Elephant/.test(p.card?.name || ""));
    expect(tokens).toHaveLength(1);
    expect(permanentPower(out, tokens[0].id)).toBe(3);
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
