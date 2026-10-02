/**
 * DEPARTED WATCHERS LOOK BACK (CR 603.10a) — a leaves-the-battlefield ability is checked against the game as it stood immediately
 * BEFORE the event, so a watcher that dies in the same event as the creatures it watches still triggers for each of them. Blood
 * Artist's ruling (2016-06-08): "If Blood Artist and one or more other creatures die at the same time, its ability will trigger for
 * each of those creatures."
 *
 * Before triggers.deadLookBackSources both dies passes (checkDiesTriggers' singular sweep and checkDiesBatchTriggers) offered
 * battlefield sources only, so a Blood Artist caught in a board wipe drained once — for its own death — instead of once per creature.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); the wrath is cast for real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, destroyLethalCreatures } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const BLOOD_ARTIST = { name: "Blood Artist", type: "Creature — Vampire", mana: "{1}{B}", cmc: 2, power: "0", toughness: "1", keywords: [], oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." };
const ZULAPORT = { name: "Zulaport Cutthroat", type: "Creature — Human Rogue Ally", mana: "{1}{B}", cmc: 2, power: "1", toughness: "1", keywords: [], oracle: "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life." };
const OPPORTUNIST = { name: "Morbid Opportunist", type: "Creature — Human Rogue", mana: "{2}{B}", cmc: 3, power: "1", toughness: "3", keywords: [], oracle: "Whenever one or more other creatures die, draw a card. This ability triggers only once each turn." };
const TRAVELER = { name: "Doomed Traveler", type: "Creature — Human Soldier", mana: "{W}", cmc: 1, power: "1", toughness: "1", keywords: [], oracle: "When this creature dies, create a 1/1 white Spirit creature token with flying." };
const DAY = { name: "Day of Judgment", type: "Sorcery", mana: "{2}{W}{W}", cmc: 4, keywords: [], oracle: "Destroy all creatures." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, W: 2, C: 2 }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 20 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
const wrath = (s0) => {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "day");
  return resolveTopOfStack(dispatchAction(s0, act));
};
const firedBy = (s, name) => (s.pendingTriggers || []).filter((t) => t.source?.name === name).length;
/** The triggered abilities `name` put on the stack, by the creature whose death caused each. */
const stackedFor = (s, name) => (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === name).map((o) => o.payload?.params?.context?.triggeringPermanentId).sort();

describe("CR 603.10a — a watcher that dies in the same event still sees the others", () => {
  it("⭐ Day of Judgment with Blood Artist and two Bears out: Blood Artist triggers for each of the three (its ruling)", () => {
    const s0 = board({ user: [P("ba", "user", BLOOD_ARTIST), P("b1", "user", BEARS)], ai: [P("b2", "ai", BEARS)], hand: [{ ...DAY, id: "day" }] });
    const resolved = wrath(s0);
    const s = settle(resolved);
    const row = { triggers: stackedFor(resolved, "Blood Artist"), aiLife: s0.players.ai.life - s.players.ai.life, yourLife: s.players.user.life - s0.players.user.life };
    console.log("  WITNESS bloodArtistWrath", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ triggers: ["b1", "b2", "ba"], aiLife: 3, yourLife: 3 });
  });

  it("the same in an SBA batch (lethal damage), whichever order the battlefield lists them", () => {
    for (const first of [true, false]) {
      const ba = P("ba", "user", BLOOD_ARTIST, { damageMarked: 1 });
      const b1 = P("b1", "user", BEARS, { damageMarked: 2 });
      const r = destroyLethalCreatures(board({ user: first ? [ba, b1] : [b1, ba], ai: [P("b2", "ai", BEARS, { damageMarked: 2 })] }));
      expect(firedBy(checkDiesTriggers(r.state, r.dead), "Blood Artist")).toBe(3);
    }
  });

  it("Zulaport Cutthroat (another creature YOU control) looks back at your creatures only: itself and your Bears, not theirs", () => {
    const resolved = wrath(board({ user: [P("zula", "user", ZULAPORT), P("b1", "user", BEARS)], ai: [P("b2", "ai", BEARS)], hand: [{ ...DAY, id: "day" }] }));
    expect(stackedFor(resolved, "Zulaport Cutthroat")).toEqual(["b1", "zula"]);
  });

  it("Morbid Opportunist (one or more OTHER creatures, once a turn) dies in the wrath and still draws its card", () => {
    const s0 = board({ user: [P("opp", "user", OPPORTUNIST), P("b1", "user", BEARS)], ai: [P("b2", "ai", BEARS)], hand: [{ ...DAY, id: "day" }] });
    const s = settle(wrath(s0));
    expect(s.players.user.hand.length).toBe(1);
  });

  it("a self-only \"when this creature dies\" is not widened: Doomed Traveler dying beside two Bears makes ONE Spirit", () => {
    const s = settle(wrath(board({ user: [P("trav", "user", TRAVELER), P("b1", "user", BEARS)], ai: [P("b2", "ai", BEARS)], hand: [{ ...DAY, id: "day" }] })));
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Spirit" || /Spirit/.test(p.card?.type || "")).length).toBe(1);
  });

  it("a watcher still on the battlefield is the battlefield sweep's, never offered twice (synthetic dead entry)", () => {
    // Synthetic: Blood Artist's own death entry arrives while it is still on the battlefield, beside a Bears that really left.
    const s0 = board({ user: [P("ba", "user", BLOOD_ARTIST)] });
    const dead = [{ id: "ba", controller: "user", card: s0.players.user.battlefield[0].card }, { id: "b1", controller: "user", card: { ...BEARS, id: "c-b1" } }];
    const fromBears = (checkDiesTriggers(s0, dead).pendingTriggers || []).filter((x) => x.source?.name === "Blood Artist" && x.context?.triggeringPermanentId === "b1");
    expect(fromBears.length).toBe(1); // the Bears' death reaches it once — the battlefield sweep's, not again as a departed source
  });
});
