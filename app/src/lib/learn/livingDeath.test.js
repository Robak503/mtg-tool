/**
 * LIVING DEATH — the play-weighted program, P·35 (EDHREC #474); LIVING END with it (the same effect behind suspend).
 *   "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards
 *    they exiled this way onto the battlefield."
 *
 * One atom (effects/atoms/livingDeath.js), three ordered steps (CR 608.2c): exile each graveyard's creature cards (kept per player);
 * sacrifice every creature AS ONE EVENT (removal.sacrificeCreaturesTogether — a sacrifice, so indestructible goes too; the dies
 * triggers fire once for the batch, so Blood Artist sacrificed with the others sees each of them, CR 603.10a); return what each
 * player exiled, under their control. A creature a replacement exiled in step 2 (Rest in Peace) is never "exiled this way".
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); each cast run for real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { addContinuousEffect } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const LIVING_DEATH = { name: "Living Death", type: "Sorcery", mana: "{3}{B}{B}", cmc: 5, keywords: [], oracle: "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield." };
const LIVING_END = { name: "Living End", type: "Sorcery", mana: "", cmc: 0, keywords: ["Suspend"], oracle: "Suspend 3—{2}{B}{B}\nEach player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield." };
const BLOOD_ARTIST = { name: "Blood Artist", type: "Creature — Vampire", mana: "{1}{B}", cmc: 2, power: "0", toughness: "1", keywords: [], oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, power: "3", toughness: "3", keywords: [], oracle: "" };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], oracle: "" };
const THOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const MYR = { name: "Darksteel Myr", type: "Artifact Creature — Myr", mana: "{3}", cmc: 3, power: "0", toughness: "1", keywords: ["Indestructible"], oracle: "Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const RIP = { name: "Rest in Peace", type: "Enchantment", mana: "{1}{W}", cmc: 2, keywords: [], oracle: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." };

const P = (id, ctrl, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false });
const G = (id, card) => ({ ...card, id });
function board({ user = [], ai = [], userGy = [], aiGy = [], hand = [{ ...LIVING_DEATH, id: "ld" }], pool = { B: 2, C: 3 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, graveyard: aiGy, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const cast = (s0, cardId = "ld") => resolveTopOfStack(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId)));
const names = (zone) => zone.map((x) => x.card?.name ?? x.name).sort();

describe("parse + classify", () => {
  it("Living Death and Living End classify native-spell; Living End is really suspendable", () => {
    expect([classifyCard(LIVING_DEATH), classifyCard(LIVING_END)]).toEqual(["native-spell", "native-spell"]);
    const s = board({ hand: [{ ...LIVING_END, id: "le" }], pool: { B: 2, C: 2 } });
    expect(legalActionsForPlayer(s, "user").some((a) => a.cardId === "le" && /suspend/i.test(a.kind))).toBe(true);
  });
});

describe("the swap", () => {
  it("⭐ each graveyard's creature cards come back, every creature on the battlefield goes — your Wurm and their Ornithopter return", () => {
    const s0 = board({ user: [P("bears", "user", BEARS)], ai: [P("giant", "ai", GIANT)], userGy: [G("g-wurm", WURM), G("g-bolt", BOLT)], aiGy: [G("g-thopter", THOPTER)] });
    const s = cast(s0);
    const row = { you: names(s.players.user.battlefield), them: names(s.players.ai.battlefield), yourGy: names(s.players.user.graveyard), theirGy: names(s.players.ai.graveyard) };
    console.log("  WITNESS livingDeath", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ you: ["Craw Wurm"], them: ["Ornithopter"], yourGy: ["Grizzly Bears", "Lightning Bolt", "Living Death"], theirGy: ["Hill Giant"] });
    expect(s.players.user.battlefield[0].summoningSick).toBe(true); // a new object this turn
  });

  it("creature CARDS by their front face (CR 712.8a): Westvale Abbey — a land in the graveyard — stays there", () => {
    const ABBEY = { name: "Westvale Abbey // Ormendahl, Profane Prince", type: "Land // Legendary Creature — Demon", mana: "", cmc: 0, keywords: [], oracle: "" };
    const s = cast(board({ userGy: [G("g-abbey", ABBEY), G("g-wurm", WURM)] }));
    expect({ you: names(s.players.user.battlefield), gy: names(s.players.user.graveyard) }).toEqual({ you: ["Craw Wurm"], gy: [ABBEY.name, "Living Death"].sort() });
  });

  it("creatures on the battlefield are read layer-aware: a land animated into a 2/2 creature is sacrificed", () => {
    const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };
    const s0 = board({ user: [P("forest", "user", FOREST)] });
    const effect = (layer, op, extra = {}) => ({ layer, ...extra, op, affects: { mode: "fixed", permanentIds: ["forest"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, cardName: "Animate" } });
    const animated = addContinuousEffect(addContinuousEffect(s0, effect(4, { types: ["Creature"] })).state, effect(7, { layerOp: "ptSet", power: 2, toughness: 2 }, { sublayer: "7b" })).state;
    const s = cast(animated);
    expect({ you: names(s.players.user.battlefield), gy: names(s.players.user.graveyard) }).toEqual({ you: [], gy: ["Forest", "Living Death"] });
  });

  it("a sacrifice, not a destroy: the indestructible Darksteel Myr goes too", () => {
    const s = cast(board({ user: [P("myr", "user", MYR)] }));
    expect({ you: names(s.players.user.battlefield), gy: names(s.players.user.graveyard) }).toEqual({ you: [], gy: ["Darksteel Myr", "Living Death"] });
  });

  it("the sacrifices are ONE event: Blood Artist, listed first, still triggers for each creature sacrificed with it (CR 603.10a)", () => {
    const s = cast(board({ user: [P("ba", "user", BLOOD_ARTIST), P("bears", "user", BEARS)], ai: [P("giant", "ai", GIANT)] }));
    const drains = (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Blood Artist").map((o) => o.payload?.params?.context?.triggeringPermanentId).sort();
    expect(drains).toEqual(["ba", "bears", "giant"]);
  });

  it("each sacrifice is still a sacrifice: Dragon Appeasement triggers once for each of your creatures", () => {
    const APPEASEMENT = { name: "Dragon Appeasement", type: "Enchantment", mana: "{3}{B}{R}{G}", cmc: 6, keywords: [], oracle: "Skip your draw step.\nWhenever you sacrifice a creature, you may draw a card." };
    const s = cast(board({ user: [P("app", "user", APPEASEMENT), P("bears", "user", BEARS), P("giant", "user", GIANT)], ai: [P("aibears", "ai", BEARS)] }));
    expect((s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Dragon Appeasement").length).toBe(2);
  });

  it("a creature under a death-specific exile (Lava Coil's stamp) is exiled, never died — Blood Artist doesn't see it", () => {
    const s = cast(board({ user: [P("ba", "user", BLOOD_ARTIST)], ai: [{ ...P("coiled", "ai", BEARS), exileIfDiesTurn: 4 }] }));
    const drains = (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Blood Artist").map((o) => o.payload?.params?.context?.triggeringPermanentId);
    expect({ aiExile: names(s.players.ai.exile), aiGraveyard: names(s.players.ai.graveyard), drains }).toEqual({ aiExile: ["Grizzly Bears"], aiGraveyard: [], drains: ["ba"] });
  });

  it("with Rest in Peace out, the sacrificed creatures are exiled instead and stay exiled; only what was exiled THIS WAY returns", () => {
    const s = cast(board({ user: [P("rip", "user", RIP), P("bears", "user", BEARS)], userGy: [G("g-wurm", WURM)] }));
    expect({ you: names(s.players.user.battlefield), exile: names(s.players.user.exile) }).toEqual({ you: ["Craw Wurm", "Rest in Peace"], exile: ["Grizzly Bears", "Living Death"] });
  });
});
