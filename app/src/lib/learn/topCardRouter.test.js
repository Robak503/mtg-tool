/**
 * topCardRouter.test.js — the parameterized TOP-CARD ROUTER family (the generalized Lurking Predators atom).
 *
 * "Reveal the top card of your library. If it's a <TYPE> card, put it <onto the battlefield|into your
 * hand>. Otherwise, put <it|that card> into your <graveyard|hand>." — one fused atom
 * (reveal-top-conditional + {predicate, thenRoute, elseRoute}), exact-anchored per combo:
 *   - matchRevealTopConditional's router branch emits the params (the param-free Lurking shape is
 *     byte-identical legacy);
 *   - applyRevealTopConditional routes: battlefield → enterCardFromZone (ETB fires); hand/graveyard →
 *     moveCardToZone. CR-honest: the hand route is NOT a draw (no draw triggers — CR 121.1 draws come
 *     only from draws), and the graveyard route is NOT a mill (CR 701.13a — no milled watchers);
 *   - the coverage residue anchor is generalized to exactly the modeled combos.
 *
 * Flips: Zoologist · Call of the Wild (activated) · Neurok Familiar · Coiling Oracle (ETB) · Skyward Eye
 * Prophets (activated). CREED: Matter Reshaper ("You may put … if … mana value 3 or less"), Candles of
 * Leng (name-match predicate), and a "then shuffle" rider all stay body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NEUROK_ORACLE = "Flying\nWhen this creature enters, reveal the top card of your library. If it's an artifact card, put it into your hand. Otherwise, put it into your graveyard.";
const drain = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };

describe("TOP-CARD ROUTER — recognition", () => {
  it("the router combos parse to the parameterized atom; the Lurking legacy shape stays param-free", () => {
    const p = parseEffectClause("reveal the top card of your library. if it's an artifact card, put it into your hand. otherwise, put it into your graveyard", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "reveal-top-conditional", predicate: "artifact", thenRoute: "hand", elseRoute: "graveyard" });
    const legacy = parseEffectClause("reveal the top card of your library. if it's a creature card, put it onto the battlefield. otherwise, you may put that card on the bottom of your library", "Instant", { hasX: false });
    expect(legacy.atoms[0].predicate).toBeUndefined(); // byte-identical legacy branch
  });

  it("classification flips: the five router cards; Lurking Predators unchanged", () => {
    expect(classifyCard({ name: "Neurok Familiar", type: "Creature — Bird", oracle: NEUROK_ORACLE })).toBe("native-trigger");
    expect(classifyCard({ name: "Zoologist", type: "Creature — Human Druid", oracle: "{3}{G}, {T}: Reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, put it into your graveyard." })).toBe("native-activated");
    expect(classifyCard({ name: "Coiling Oracle", type: "Creature — Snake Elf Druid", oracle: "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put it into your hand." })).toBe("native-trigger");
  });

  it("CREED: the unmodeled variants stay body-only (may-then, MV cap, name predicate, shuffle rider)", () => {
    expect(classifyCard({ name: "Matter Reshaper", type: "Creature — Eldrazi", oracle: "When this creature dies, reveal the top card of your library. You may put that card onto the battlefield if it's a permanent card with mana value 3 or less. Otherwise, put that card into your hand." })).toBe("body-only");
    expect(classifyCard({ name: "Candles of Leng", type: "Artifact", oracle: "{4}, {T}: Reveal the top card of your library. If it has the same name as a card in your graveyard, put it into your graveyard. Otherwise, draw a card." })).toBe("body-only");
    expect(classifyCard({ name: "Synth", type: "Creature — Human", oracle: "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put it into your hand. Then shuffle." })).toBe("body-only");
  });
});

describe("TOP-CARD ROUTER v2 — no-else / draw / OR-predicate / scry-compose", () => {
  it("Track Down parses to [scry, router] with the OR-predicate, draw then-route, and leave else-route", () => {
    const p = parseEffectClause("scry 3, then reveal the top card of your library. if it's a creature or land card, draw a card", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["scry", "reveal-top-conditional"]);
    expect(p.atoms[1]).toMatchObject({ predicates: ["creature", "land"], thenRoute: "draw", elseRoute: "leave" });
  });

  it("classification: Llanowar Empath (scry-compose ETB) + Track Down (spell) flip; Iron Lad now flips too", () => {
    expect(classifyCard({ name: "Llanowar Empath", type: "Creature — Elf Shaman", oracle: "When this creature enters, scry 2, then reveal the top card of your library. If it's a creature card, put it into your hand." })).toBe("native-trigger");
    expect(classifyCard({ name: "Track Down", type: "Sorcery", oracle: "Scry 3, then reveal the top card of your library. If it's a creature or land card, draw a card." })).toBe("native-spell");
    // ⭐ UPDATED 2026-07-28. This asserted body-only, and the PARSER cited this very pin as its reason for
    // declining to credit "You may look at the top card of your library any time" — which was circular:
    // Iron Lad was parked ONLY by that line. Measured before changing anything: its activated ability
    // classifies native-activated standing alone, and flying/vigilance are native body. Nothing else held it.
    //
    // The look-at-top static is now credited INERT alongside its already-credited and strictly MORE public
    // sibling, "play with the top card of your library revealed". Looking changes no game state, and this
    // sim is perfect-information, so neither grants the engine anything it lacks — there is no effect being
    // dropped, which is precisely why crediting it cannot become a claimed-native no-op. The PLAY/CAST
    // permissions that usually accompany it are separate lines carrying their own markers and their own
    // runtime enforcement, so this credits the INFORMATION half only.
    expect(classifyCard({ name: "Iron Lad", type: "Legendary Creature — Human Hero", oracle: "Flying, vigilance\nYou may look at the top card of your library any time.\n{T}: Reveal the top card of your library. If it's an artifact card, draw a card." })).toBe("native-mixed");
  });

  it("runtime: the no-else miss LEAVES the card on top (no zone change, no draw bump)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const empath = createPermanent({ id: "emp", card: { name: "Synth Empath", type: "Creature — Elf", oracle: "When this creature enters, reveal the top card of your library. If it's a creature card, put it into your hand." }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [empath], hand: [], library: [{ id: "top1", name: "NotACreature", type: "Sorcery" }] } } };
    s = drain(flushTriggers(checkEnterTriggers(s, empath), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.library.map((c) => c.name)).toEqual(["NotACreature"]); // stays on top
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.cardsDrawnThisTurn || 0).toBe(0);
  });

  it("runtime: the draw then-route is a REAL draw (count bumps — the opposite of put-into-hand)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const watcher = createPermanent({ id: "w", card: { name: "Synth Drawer", type: "Creature — Human", oracle: "When this creature enters, reveal the top card of your library. If it's a land card, draw a card." }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [watcher], hand: [], library: [{ id: "top1", name: "Forest", type: "Basic Land — Forest" }, { id: "lib2", name: "Under", type: "Instant" }] } } };
    s = drain(flushTriggers(checkEnterTriggers(s, watcher), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Forest"]); // the revealed top IS the drawn card
    expect(s.players.user.cardsDrawnThisTurn).toBe(1);                  // a genuine draw
  });
});

describe("TOP-CARD ROUTER — runtime (Neurok Familiar, both arms)", () => {
  function enterNeurok(topCard) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const bird = createPermanent({ id: "bird", card: { name: "Neurok Familiar", type: "Creature — Bird", oracle: NEUROK_ORACLE }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [bird], hand: [], graveyard: [], library: [topCard, { id: "lib2", name: "Under", type: "Instant" }] } } };
    return drain(flushTriggers(checkEnterTriggers(s, bird), { chooseTargets: chooseTriggerTargets }));
  }

  it("artifact on top → into HAND (and it is NOT a draw — no cardsDrawnThisTurn bump)", () => {
    const s = enterNeurok({ id: "top1", name: "Sol Ring", type: "Artifact" });
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Sol Ring"]);
    expect(s.players.user.graveyard).toHaveLength(0);
    expect(s.players.user.cardsDrawnThisTurn || 0).toBe(0); // CR: put-into-hand ≠ draw
  });

  it("non-artifact on top → into GRAVEYARD (and it is NOT a mill)", () => {
    const s = enterNeurok({ id: "top1", name: "Bearish", type: "Creature — Bear" });
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Bearish"]);
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("empty library → clean no-op", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const bird = createPermanent({ id: "bird", card: { name: "Neurok Familiar", type: "Creature — Bird", oracle: NEUROK_ORACLE }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [bird], hand: [], graveyard: [], library: [] } } };
    s = drain(flushTriggers(checkEnterTriggers(s, bird), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.graveyard).toHaveLength(0);
  });

  it("Coiling Oracle: land on top → onto the BATTLEFIELD (ETB seam, counts as a permanent entry)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const oracle = createPermanent({ id: "orc", card: { name: "Coiling Oracle", type: "Creature — Snake Elf Druid", oracle: "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put it into your hand." }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [oracle], hand: [], library: [{ id: "top1", name: "Forest", type: "Basic Land — Forest" }] } } };
    s = drain(flushTriggers(checkEnterTriggers(s, oracle), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.battlefield.some((p) => p.card.name === "Forest")).toBe(true);
    expect(s.players.user.library).toHaveLength(0);
  });
});
