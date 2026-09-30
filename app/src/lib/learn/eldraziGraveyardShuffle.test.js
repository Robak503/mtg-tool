/**
 * eldraziGraveyardShuffle.test.js — "When Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into
 * their library." (Kozilek, Butcher of Truth; Ulamog, the Infinite Gyre — the 09-06 plan's stage ③, census row ⑯,
 * 2026-09-30. Emrakul, the Aeons Torn carries the same line but stays parked on another gap.)
 *
 * The card's OWN arrival in a graveyard, from any zone: a new self event (`gyEnterSelf`) fired by checkGraveyardEventTriggers
 * off the moved card itself — it triggers from the graveyard it lands in, controlled by its OWNER (CR 113.8) — and never by a
 * battlefield watcher. The payoff is the existing shuffle-graveyard atom (Finale of Revelation's), now a plain clause; the
 * trigger's "its owner shuffles their graveyard into their library" is rewritten to it, event-gated.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Each origin run for real: the zone move → the graveyard-event
 * queue → flushTriggers → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, moveCardToZone } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KOZILEK = { id: "koz", name: "Kozilek, Butcher of Truth", type: "Legendary Creature — Eldrazi", mana: "{10}", power: 12, toughness: 12,
  keywords: ["Annihilator"],
  oracle: "When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library." };
const ULAMOG = { name: "Ulamog, the Infinite Gyre", type: "Legendary Creature — Eldrazi", mana: "{11}", power: 10, toughness: 10, keywords: ["Annihilator", "Indestructible"],
  oracle: "When you cast this spell, destroy target permanent.\nIndestructible\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Ulamog is put into a graveyard from anywhere, its owner shuffles their graveyard into their library." };
const EMRAKUL = { name: "Emrakul, the Aeons Torn", type: "Legendary Creature — Eldrazi", mana: "{15}", power: 15, toughness: 15, keywords: ["Annihilator", "Flying", "Protection"],
  oracle: "This spell can't be countered.\nWhen you cast this spell, take an extra turn after this one.\nFlying, protection from spells that are one or more colors, annihilator 6\nWhen Emrakul is put into a graveyard from anywhere, its owner shuffles their graveyard into their library." };
const BEARS = { id: "bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const junk = (n, owner) => Array.from({ length: n }, (_, i) => ({ id: `${owner}-gy${i}`, name: `Old Card ${i}`, type: "Sorcery", oracle: "" }));

function game({ user = {}, ai = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (base, z) => ({ ...base, battlefield: z.battlefield || [], hand: z.hand || [], library: z.library || [], graveyard: z.graveyard || [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...s.players, user: seat(s.players.user, user), ai: seat(s.players.ai, ai) } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 6 && (st.stack || []).length; i++) st = resolveTopOfStack(st); return st; };
const zones = (s, pid) => ({ graveyard: s.players[pid].graveyard.length, library: s.players[pid].library.length,
  kozilekIn: s.players[pid].library.some((c) => c.name === KOZILEK.name) ? "library" : s.players[pid].graveyard.some((c) => c.name === KOZILEK.name) ? "graveyard" : "elsewhere" });

describe("classification", () => {
  it("Kozilek and Ulamog → native-trigger; Emrakul stays parked on its other gap", () => {
    expect([classifyCard(KOZILEK), classifyCard(ULAMOG), classifyCard(EMRAKUL)]).toEqual(["native-trigger", "native-trigger", "body-only"]);
  });

  it("'shuffle your graveyard into your library' is now a plain clause for the existing atom", () => {
    expect(parseEffectClause("shuffle your graveyard into your library", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "shuffle-graveyard-into-library", targetType: null }]);
  });

  it("⛔ only the card ITSELF is the self event — 'a creature card is put into a graveyard from anywhere' is not", () => {
    const watcherLike = { name: "Synthetic Watcher", type: "Creature — Spirit", oracle: "When a creature card is put into a graveyard from anywhere, draw a card." };
    expect(detectTriggers(watcherLike).some((d) => d.event === "gyEnterSelf")).toBe(false);
    expect(detectTriggers(KOZILEK).filter((d) => d.event === "gyEnterSelf").map((d) => d.scope)).toEqual(["self"]);
  });
});

describe("RUNTIME — from anywhere, the owner's graveyard goes home", () => {
  it("VACUITY CONTROL — Grizzly Bears milled: nothing shuffles, the graveyard keeps all four cards", () => {
    const s = settle(moveCardToZone(game({ user: { library: [BEARS, ...junk(2, "lib")], graveyard: junk(3, "user") } }), { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "bears" }));
    expect([s.players.user.graveyard.length, s.players.user.library.length]).toEqual([4, 2]);
  });

  it("⭐ MILLED: Kozilek hits the graveyard from the library, and the whole graveyard (three old cards and Kozilek) shuffles in", () => {
    const s = settle(moveCardToZone(game({ user: { library: [KOZILEK, ...junk(2, "lib")], graveyard: junk(3, "user") } }), { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "koz" }));
    expect(zones(s, "user")).toEqual({ graveyard: 0, library: 6, kozilekIn: "library" });
    console.log(`WITNESS milledKozilek ${JSON.stringify(zones(s, "user"))}`);
  });

  it("⭐ DISCARDED: from the hand, the same", () => {
    const s = settle(moveCardToZone(game({ user: { hand: [KOZILEK], graveyard: junk(2, "user") } }), { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "koz" }));
    expect(zones(s, "user")).toEqual({ graveyard: 0, library: 3, kozilekIn: "library" });
  });

  it("⭐ DIES: from the battlefield, the same", () => {
    const s = settle(moveCardToZone(game({ user: { battlefield: [createPermanent({ id: "pk", card: KOZILEK, controller: "user", summoningSick: false })], graveyard: junk(2, "user") } }),
      { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "pk" }));
    expect(zones(s, "user")).toEqual({ graveyard: 0, library: 3, kozilekIn: "library" });
  });

  it("⭐ its OWNER's: a Kozilek the user stole from the AI dies into the AI's graveyard — the AI's graveyard shuffles, the user's stays", () => {
    const stolen = { ...createPermanent({ id: "pk", card: KOZILEK, controller: "user", summoningSick: false }), owner: "ai" };
    const s = settle(moveCardToZone(game({ user: { battlefield: [stolen], graveyard: junk(2, "user") }, ai: { graveyard: junk(3, "ai") } }),
      { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "pk" }));
    expect([zones(s, "ai"), s.players.user.graveyard.length]).toEqual([{ graveyard: 0, library: 4, kozilekIn: "library" }, 2]);
  });

  it("⛔ SELF only: another card hitting the graveyard while Kozilek sits on the battlefield shuffles nothing", () => {
    const s = settle(moveCardToZone(game({ user: { battlefield: [createPermanent({ id: "pk", card: KOZILEK, controller: "user", summoningSick: false })], hand: [BEARS], graveyard: junk(2, "user") } }),
      { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "bears" }));
    expect(s.players.user.graveyard.length).toBe(3);
  });

  it("⭐ Ulamog, milled, does the same", () => {
    const s = settle(moveCardToZone(game({ user: { library: [{ ...ULAMOG, id: "ul" }], graveyard: junk(2, "user") } }), { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "ul" }));
    expect([s.players.user.graveyard.length, s.players.user.library.length]).toEqual([0, 3]);
  });
});

describe("UNPLANNED gains, each run for real", () => {
  it("⭐ Worldspine Wurm: dying makes its three 5/5 Wurms AND the self trigger tucks the card back into the library", () => {
    const WURM = { id: "ww", name: "Worldspine Wurm", type: "Creature — Wurm", mana: "{8}{G}{G}{G}", power: 15, toughness: 15, keywords: ["Trample"],
      oracle: "Trample\nWhen this creature dies, create three 5/5 green Wurm creature tokens with trample.\nWhen Worldspine Wurm is put into a graveyard from anywhere, shuffle it into its owner's library." };
    const s0 = game({ user: { battlefield: [{ ...createPermanent({ id: "pw", card: WURM, controller: "user", summoningSick: false }), damageMarked: 15 }], graveyard: junk(1, "user") } });
    // The real death path: the lethal-damage SBA, then the dies look-back that enqueues the Wurm's own dies trigger.
    const lethal = destroyLethalCreatures(s0);
    const s = settle(checkDiesTriggers(lethal.state, lethal.dead));
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token && /Wurm/.test(p.card?.type || ""));
    expect({ tokens: tokens.length, inLibrary: s.players.user.library.some((c) => c.name === "Worldspine Wurm"), graveyard: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ tokens: 3, inLibrary: true, graveyard: ["Old Card 0"] });
    console.log(`WITNESS worldspineDies tokens ${tokens.length} · inLibrary ${s.players.user.library.some((c) => c.name === "Worldspine Wurm")} · graveyard ${JSON.stringify(s.players.user.graveyard.map((c) => c.name))}`);
  });

  it("⭐ Worldspine Wurm milled: only the Wurm goes back — the rest of the graveyard stays (it shuffles IT, not the graveyard)", () => {
    const WURM = { id: "ww", name: "Worldspine Wurm", type: "Creature — Wurm", mana: "{8}{G}{G}{G}", power: 15, toughness: 15, keywords: ["Trample"],
      oracle: "Trample\nWhen this creature dies, create three 5/5 green Wurm creature tokens with trample.\nWhen Worldspine Wurm is put into a graveyard from anywhere, shuffle it into its owner's library." };
    const s = settle(moveCardToZone(game({ user: { library: [WURM], graveyard: junk(2, "user") } }), { playerId: "user", fromZone: "library", toZone: "graveyard", cardId: "ww" }));
    expect([s.players.user.graveyard.length, s.players.user.library.map((c) => c.name)]).toEqual([2, ["Worldspine Wurm"]]);
  });

  it("⭐ Feldon's Cane: {T}, exile it — the graveyard shuffles into the library", () => {
    const CANE = { name: "Feldon's Cane", type: "Artifact", mana: "{1}", oracle: "{T}, Exile this artifact: Shuffle your graveyard into your library." };
    const s0 = game({ user: { battlefield: [createPermanent({ id: "cane", card: CANE, controller: "user", summoningSick: false })], graveyard: junk(3, "user") } });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cane");
    expect(act).toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ graveyard: s.players.user.graveyard.length, library: s.players.user.library.length, caneExiled: s.players.user.exile.some((c) => c.name === "Feldon's Cane") })
      .toEqual({ graveyard: 0, library: 3, caneExiled: true });
  });

  it("⭐ Archangel's Light: 2 life per card in the graveyard, THEN the shuffle (the count is taken first)", () => {
    const LIGHT = { id: "al", name: "Archangel's Light", type: "Sorcery", mana: "{7}{W}", oracle: "You gain 2 life for each card in your graveyard, then shuffle your graveyard into your library." };
    const s0 = game({ user: { hand: [LIGHT], graveyard: junk(3, "user") } });
    const pooled = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { ...s0.players.user.manaPool, W: 1, C: 7 } } } };
    const act = legalActionsForPlayer(pooled, "user").find((a) => a.kind === "cast-spell" && a.cardId === "al");
    expect(act).toBeTruthy();
    const s = settle(dispatchAction(pooled, act));
    expect({ gained: s.players.user.life - s0.players.user.life, library: s.players.user.library.length, graveyard: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ gained: 6, library: 3, graveyard: ["Archangel's Light"] });
  });
});
