/**
 * becomesTargetGroup.test.js — the GROUP "a creature you control becomes the target of a SPELL" event
 * (CR 603.2 / CR 115.1; Gargos, Vicious Watcher / Venerated Rotpriest). UNLIKE the self becomesTarget event
 * (the Phantasmal Illusion family, where the targeted creature IS the source), here the WATCHER is a different
 * permanent than the targeted creature — so detectTriggers emits a `becomesTargetGroup` descriptor scoped
 * `creatureYouControl`, its effect subject (the source name — "Gargos") is rewritten to "this creature", and
 * checkBecomesTargetTriggers fans out to the targeted creature's controller's watchers. SPELL-ONLY (Gargos's
 * printed event is "of a spell", CR 115.1 — target chosen at cast): an activated/loyalty/triggered ability
 * targeting the creature never fires it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Gargos's real oracle (Scryfall-bundled shape). {3}{G}{G}{G}, 8/7 Hydra.
const GARGOS = {
  name: "Gargos, Vicious Watcher",
  type_line: "Legendary Creature — Hydra",
  type: "Legendary Creature — Hydra",
  oracle: "Vigilance\nHydra spells you cast cost {4} less to cast.\nWhenever a creature you control becomes the target of a spell, Gargos fights up to one target creature you don't control.",
  mana: "{3}{G}{G}{G}",
  power: 8, toughness: 7,
};
const pub = (c) => ({ name: c.name, type: c.type_line || c.type, type_line: c.type_line || c.type, oracle: c.oracle, oracle_text: c.oracle, mana: c.mana_cost || c.mana, power: c.power, toughness: c.toughness });

function mainState({ user = {}, ai = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } },
      ai: { ...s.players.ai, ...ai, manaPool: { ...s.players.ai.manaPool, ...(ai.manaPool || {}) } },
    },
  };
}

// ─── detection + classification ──────────────────────────────────────────────────────────────────────────
describe("detectTriggers — the group becomesTargetGroup event (Gargos)", () => {
  it("detects the group trigger, scopes it creatureYouControl, and rewrites the source name → 'this creature'", () => {
    const dets = detectTriggers(pub(GARGOS));
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({
      event: "becomesTargetGroup",
      scope: "creatureYouControl",
      effectClause: "this creature fights up to one target creature you don't control",
    });
  });

  it("classifies Gargos native-mixed (Vigilance + Hydra cost reduction static + the group-fight trigger)", () => {
    expect(classifyCard(pub(GARGOS))).toBe("native-mixed");
  });

  it("CREED near-miss: the WARD-tax '…an opponent controls' rider stays UNDETECTED as a group event", () => {
    // Shapers' Sanctuary — a different (unenforceable-at-cast) lane; must not be mis-detected as becomesTargetGroup.
    const ward = pub({ ...GARGOS, oracle: "Whenever a creature you control becomes the target of a spell or ability an opponent controls, you may draw a card." });
    expect(detectTriggers(ward).some((d) => d.event === "becomesTargetGroup")).toBe(false);
  });

  it("CREED near-miss: a RESTRICTED subject ('a Dragon you control') stays UNDETECTED as a group event", () => {
    const dragon = pub({ ...GARGOS, oracle: "Whenever a Dragon you control becomes the target of a spell, this deals 3 damage to that player." });
    expect(detectTriggers(dragon).some((d) => d.event === "becomesTargetGroup")).toBe(false);
  });

  it("CREED near-miss: 'an instant or sorcery spell' variant stays UNDETECTED as a group event", () => {
    // Wild Defiance — "becomes the target of an instant or sorcery spell": not the bare "of a spell" anchor.
    const wild = pub({ ...GARGOS, oracle: "Whenever a creature you control becomes the target of an instant or sorcery spell, that creature gets +3/+3 until end of turn." });
    expect(detectTriggers(wild).some((d) => d.event === "becomesTargetGroup")).toBe(false);
  });
});

// ─── runtime: the group fan-out fires the fight when a spell targets a creature the controller controls ─────
describe("runtime — Gargos fights when a spell targets a creature its controller controls (spell-only)", () => {
  // A vanilla friend for the spell to target (so the target isn't Gargos itself — proves the GROUP fan-out).
  const friend = () => ({ id: "friend-c", name: "Llanowar Elves", type_line: "Creature — Elf Druid", type: "Creature — Elf Druid", oracle: "", power: 1, toughness: 1 });
  const enemy = () => ({ id: "enemy-c", name: "Grizzly Bears", type_line: "Creature — Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 });

  it("a spell targeting the controller's OTHER creature fires Gargos's fight ABOVE the spell", () => {
    const gargos = createPermanent({ id: "perm-g", card: GARGOS, controller: "user", summoningSick: false });
    const pal = createPermanent({ id: "perm-f", card: friend(), controller: "user" });
    const foe = createPermanent({ id: "perm-e", card: enemy(), controller: "ai" });
    // user buffs their own Llanowar Elves → a creature they control became a spell's target → Gargos triggers.
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = mainState({ user: { hand: [buff], battlefield: [gargos, pal], manaPool: { G: 1 } }, ai: { battlefield: [foe] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === "perm-f"));
    expect(cast).toBeTruthy();
    let out = dispatchAction(s, cast);
    // Gargos's fight trigger sits ABOVE Giant Growth on the stack (targeting the enemy creature).
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    const fightTrig = out.stack.find((o) => o.kind === "triggered-ability");
    expect((fightTrig.targets || []).some((t) => t.id === "perm-e")).toBe(true);
    out = resolveTopOfStack(out); // the fight resolves first (Gargos 8/7 fights the 2/2 Grizzly Bears)
    // Grizzly Bears (2 toughness) took 8 → dead; Gargos (7 toughness) took 2 → survives.
    expect(out.players.ai.battlefield.some((p) => p.card.name === "Grizzly Bears")).toBe(false);
    expect(out.players.user.battlefield.some((p) => p.card.name === "Gargos, Vicious Watcher")).toBe(true);
  });

  it("CR 603.2 self-inclusion: a spell targeting GARGOS ITSELF also fires the group trigger (it's a creature you control)", () => {
    const gargos = createPermanent({ id: "perm-g", card: GARGOS, controller: "user", summoningSick: false });
    const foe = createPermanent({ id: "perm-e", card: enemy(), controller: "ai" });
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = mainState({ user: { hand: [buff], battlefield: [gargos], manaPool: { G: 1 } }, ai: { battlefield: [foe] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === "perm-g"));
    expect(cast).toBeTruthy();
    let out = dispatchAction(s, cast);
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    out = resolveTopOfStack(out);
    expect(out.players.ai.battlefield.some((p) => p.card.name === "Grizzly Bears")).toBe(false);
  });

  it("no false fire: a spell targeting an OPPONENT's creature does NOT fire Gargos (controller gate)", () => {
    const gargos = createPermanent({ id: "perm-g", card: GARGOS, controller: "user", summoningSick: false });
    const foe = createPermanent({ id: "perm-e", card: enemy(), controller: "ai" });
    // user targets the AI's creature — NOT a creature the user controls → Gargos must not trigger.
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = mainState({ user: { hand: [buff], battlefield: [gargos], manaPool: { G: 1 } }, ai: { battlefield: [foe] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === "perm-e"));
    expect(cast).toBeTruthy();
    const out = dispatchAction(s, cast);
    expect(out.stack.some((o) => o.kind === "triggered-ability")).toBe(false);
  });

  it("SPELL-ONLY (CR 115.1): an activated ability targeting the controller's creature does NOT fire Gargos", () => {
    const gargos = createPermanent({ id: "perm-g", card: GARGOS, controller: "user", summoningSick: false });
    const pal = createPermanent({ id: "perm-f", card: friend(), controller: "user" });
    // A pinger the user controls, targeting their OWN Llanowar Elves via an ACTIVATED ability (not a spell).
    const pinger = createPermanent({ id: "perm-p", card: { id: "pinger-c", name: "Prodigal Sorcerer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{T}: This creature deals 1 damage to target creature." }, controller: "user", summoningSick: false });
    let s = mainState({ user: { battlefield: [gargos, pal, pinger], manaPool: { C: 2 } } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-p" && (a.targets || []).some((t) => t.id === "perm-f"));
    expect(act).toBeTruthy();
    const out = dispatchAction(s, act);
    // Only the activated ability is on the stack — Gargos's SPELL-only trigger never fired.
    expect(out.stack.map((o) => o.kind)).toEqual(["activated-ability"]);
  });
});
