/**
 * DAUTHI VOIDWALKER — the play-weighted program, P·28 (EDHREC #384).
 *   "Shadow
 *    If a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it.
 *    {T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn
 *    without paying its mana cost."
 *
 * The P·27 replacement in its void-counter form: the card is exiled with `_voidCounter` at every road in (moveCardToZone's
 * redirect, a resolved / countered spell, mill, surveil, a dig, and — the death sites now take their DESTINATION from the
 * death-specific exile only — a dying creature through the same redirect). With Rest in Peace also out the owner picks the plain
 * exile (CR 616.1), so no counter. A card leaving exile loses its counter (CR 400.7). The ability stamps the chosen card's free
 * play permission, which the cross-player exile cast lane (Ragavan's) offers without its mana cost; two or more candidates pause
 * through the milled-pick (toZone "playFree").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, createStackObject, _resetIdsForTests, moveCardToZone, millCards, destroyLethalCreatures, applyLegendRule } from "./gameState.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";
import { counterSpellById } from "./effects/atoms/stack.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { finishSpellResolution, resolveMilledPickChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { PAUSING_ATOM_OPS } from "./effects/effectAtoms.js";
import { advanceUntilDecision } from "./learnSession.js";
import { decisionViewForWire } from "./decisionWire.js";

beforeEach(() => _resetIdsForTests());

const DAUTHI = { name: "Dauthi Voidwalker", type: "Creature — Dauthi Rogue", mana: "{B}{B}", cmc: 2, power: "3", toughness: "2", keywords: ["Shadow"], oracle: "Shadow (This creature can block or be blocked by only creatures with shadow.)\nIf a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it.\n{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost." };
const RIP = { name: "Rest in Peace", type: "Enchantment", mana: "{1}{W}", cmc: 2, keywords: [], oracle: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." };
const BLOOD_ARTIST = { name: "Blood Artist", type: "Creature — Vampire", mana: "{1}{B}", cmc: 2, power: "0", toughness: "1", keywords: [], oracle: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, keywords: [], oracle: "Draw two cards." };
const MEMNITE = { name: "Memnite", type: "Artifact Creature — Construct", mana: "{0}", cmc: 0, power: "1", toughness: "1", keywords: [], oracle: "" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {U}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
function board({ user = [], ai = [], userHand = [], aiHand = [], aiLibrary = [], aiExile = [], userLibrary = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand: userHand, library: userLibrary.length ? userLibrary : [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) }, ai: { ...s.players.ai, battlefield: ai, hand: aiHand, library: aiLibrary, exile: aiExile } } };
}
const voided = (s, pid) => (s.players[pid].exile || []).filter((c) => c._voidCounter).map((c) => c.name).sort();

describe("parse + classify", () => {
  it("the replacement carries the void counter; the ability is one void-play-grant atom; Dauthi classifies native-mixed", () => {
    expect(parseStaticAbilities(DAUTHI).filter((d) => d.graveyardExile)).toEqual([{ graveyardExile: { scope: "opponents", tokens: false, voidCounter: true } }]);
    const ab = parseActivatedAbilities(DAUTHI).find((a) => /void counter/.test(a.raw));
    expect(ab.effectClause).toMatch(/^Choose an exiled card an opponent owns with a void counter on it\. You may play it this turn without paying its mana cost\.?$/);
    expect(classifyCard(DAUTHI)).toBe("native-mixed");
    expect(PAUSING_ATOM_OPS.has("void-play-grant")).toBe(true); // it can pause, so the parser's pausing-atom gates see it
  });
});

describe("the replacement — void counters", () => {
  it("an opponent's dying creature, resolved sorcery and milled cards are exiled WITH a void counter; it never died (no Blood Artist trigger); your own cards go to your graveyard", () => {
    let s = board({ user: [P("dauthi", "user", DAUTHI), P("artist", "user", BLOOD_ARTIST), P("b1", "user", BEARS)], ai: [P("x1", "ai", BEARS)], aiLibrary: [{ ...FOREST, id: "al1" }, { ...DIVINATION, id: "al2" }] });
    s = applyDestroyEffect(s, { controller: "user", targets: [{ type: "creature", id: "x1" }] });
    const afterDestroy = (s.pendingTriggers || []).length;
    s = finishSpellResolution(s, { playerId: "ai", card: { ...DIVINATION, id: "ai-div" } });
    s = millCards(s, { playerId: "ai", count: 2 });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "b1" });
    const row = { voided: voided(s, "ai"), aiGraveyard: s.players.ai.graveyard.length, userGraveyard: s.players.user.graveyard.map((c) => c.name), triggersFromTheOpponentsDeath: afterDestroy };
    console.log("  WITNESS dauthiReplacement", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ voided: ["Divination", "Divination", "Forest", "Grizzly Bears"], aiGraveyard: 0, userGraveyard: ["Grizzly Bears"], triggersFromTheOpponentsDeath: 0 });
  });

  it("every other death site and the counter path stamp it too: lethal damage, a sacrifice, the legend rule, a countered spell", () => {
    const LEGEND = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", cmc: 1, power: "2", toughness: "2", keywords: [], oracle: "" };
    let s = board({ user: [P("dauthi", "user", DAUTHI)], ai: [P("hurt", "ai", BEARS, { damageMarked: 2 }), P("sac", "ai", { ...BEARS, name: "Hill Giant" }), P("leg1", "ai", LEGEND), P("leg2", "ai", LEGEND)] });
    s = destroyLethalCreatures(s).state;
    s = sacrificeCreatureEffect(s, "ai", "sac");
    s = applyLegendRule(s).state;
    const spell = createStackObject({ id: "stk-ai", kind: "spell", source: { ...DIVINATION, id: "ai-cast" }, controller: "ai", targets: [], payload: { resolver: "effect-program", params: { controller: "ai" } } });
    s = counterSpellById({ ...s, stack: [spell] }, "stk-ai");
    expect(voided(s, "ai")).toEqual(["Divination", "Grizzly Bears", "Hill Giant", "Isamaru, Hound of Konda"]);
  });

  it("with Rest in Peace out too, the owner picks the plain exile (CR 616.1): exiled, no void counter — whichever entered first", () => {
    for (const user of [[P("dauthi", "user", DAUTHI), P("rip", "user", RIP)], [P("rip", "user", RIP), P("dauthi", "user", DAUTHI)]]) {
      const s = applyDestroyEffect(board({ user, ai: [P("x1", "ai", BEARS)] }), { controller: "user", targets: [{ type: "creature", id: "x1" }] });
      expect({ exiled: s.players.ai.exile.map((c) => c.name), voided: voided(s, "ai") }).toEqual({ exiled: ["Grizzly Bears"], voided: [] });
    }
  });

  it("a death-specific exile (Lava Coil's \"if that creature would die this turn, exile it instead\") is the owner's plain-exile pick too", () => {
    const s = destroyLethalCreatures(board({ user: [P("dauthi", "user", DAUTHI)], ai: [P("coiled", "ai", BEARS, { damageMarked: 4, exileIfDiesTurn: 4 })] })).state;
    expect({ exiled: s.players.ai.exile.map((c) => c.name), voided: voided(s, "ai") }).toEqual({ exiled: ["Grizzly Bears"], voided: [] });
  });

  it("a stolen creature an opponent owns: it would go to its OWNER's graveyard, so it is exiled into theirs with the counter", () => {
    const s = applyDestroyEffect(board({ user: [P("dauthi", "user", DAUTHI), P("stolen", "user", BEARS, { owner: "ai" })] }), { controller: "user", targets: [{ type: "creature", id: "stolen" }] });
    expect({ aiVoided: voided(s, "ai"), userExile: s.players.user.exile.length, userGraveyard: s.players.user.graveyard.length }).toEqual({ aiVoided: ["Grizzly Bears"], userExile: 0, userGraveyard: 0 });
  });

  it("a card that leaves exile loses its void counter (CR 400.7)", () => {
    let s = applyDestroyEffect(board({ user: [P("dauthi", "user", DAUTHI)], ai: [P("x1", "ai", BEARS)] }), { controller: "user", targets: [{ type: "creature", id: "x1" }] });
    const id = s.players.ai.exile[0].id;
    s = moveCardToZone(s, { playerId: "ai", fromZone: "exile", toZone: "hand", cardId: id });
    s = moveCardToZone(s, { playerId: "ai", fromZone: "hand", toZone: "exile", cardId: id });
    expect(voided(s, "ai")).toEqual([]);
  });
});

describe("the ability — choose a void-countered card, play it free this turn", () => {
  const activate = (s) => {
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "dauthi");
    expect(a).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, a));
  };
  // "beginner": your pause stops for you (the panel); "expert": your choices run through the pilot's offered actions.
  const sessionOf = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
  const freeCasts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.fromPlayerId === "ai").map((a) => ({ name: a.name ?? a.cardName ?? null, cardId: a.cardId, freeCast: !!a.freeCast }));

  it("one candidate: it is granted, and you may cast it from their exile without paying its mana cost (only that way) — this turn only", () => {
    const islands = [1, 2, 3].map((i) => P(`isl${i}`, "user", ISLAND));
    const s = activate(board({ user: [P("dauthi", "user", DAUTHI), ...islands], aiExile: [{ ...DIVINATION, id: "v1", _voidCounter: true }, { ...BEARS, id: "plain" }] }));
    const offers = freeCasts(s); // {U}{U}{U} up: a paid cast would be affordable, and is still not offered
    const nextTurn = freeCasts({ ...s, turn: s.turn + 1 });
    console.log("  WITNESS dauthiGrant", JSON.stringify({ offers, nextTurn })); // vitest 4 needs --disable-console-intercept
    expect(offers.map((o) => [o.cardId, o.freeCast])).toEqual([["v1", true]]);
    expect(nextTurn).toEqual([]);
    expect(s.players.user.battlefield.some((p) => p.id === "dauthi")).toBe(false); // sacrificed as the cost
  });

  it("cast free: Divination resolves for you with no mana spent, and the card goes home to its owner", () => {
    const s0 = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...DIVINATION, id: "v1", _voidCounter: true }] }));
    const cast = filterActions(legalActionsForPlayer(s0, "user"), "cast-spell").find((a) => a.cardId === "v1" && a.fromPlayerId === "ai");
    const s = resolveTopOfStack(dispatchAction(s0, cast));
    expect({ hand: s.players.user.hand.length, aiExile: s.players.ai.exile.map((c) => c.id), aiGraveyard: s.players.ai.graveyard.map((c) => c.id) }).toEqual({ hand: 2, aiExile: [], aiGraveyard: ["v1"] });
    // It left exile, so its void counter stayed behind (CR 400.7) — a later exile for another reason can't read as void-countered.
    expect(Object.keys(s.players.ai.graveyard[0]).filter((k) => k === "_voidCounter" || k.startsWith("_impulse"))).toEqual([]);
  });

  it("only cards an OPPONENT owns: your own void-countered card (an opponent's Dauthi put it there) is never a candidate", () => {
    const s0 = board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...DIVINATION, id: "v1", _voidCounter: true }] });
    const s = activate({ ...s0, players: { ...s0.players, user: { ...s0.players.user, exile: [{ ...BEARS, id: "mine", _voidCounter: true }] } } });
    expect({ pause: s.pendingChoice?.kind ?? null, granted: freeCasts(s).map((o) => o.cardId), mine: s.players.user.exile[0]._impulse ?? null }).toEqual({ pause: null, granted: ["v1"], mine: null });
  });

  it("a pick that left exile during the pause falls through to the next still-valid candidate (CR 608.2b)", () => {
    const paused = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...BEARS, id: "vbear", _voidCounter: true }, { ...DIVINATION, id: "vdiv", _voidCounter: true }] }));
    const gone = { ...paused, players: { ...paused.players, ai: { ...paused.players.ai, exile: paused.players.ai.exile.filter((c) => c.id !== "vbear") } } };
    expect(freeCasts(resolveMilledPickChoice(gone, "vbear")).map((o) => o.cardId)).toEqual(["vdiv"]);
    // Synthetic: the same card back in exile as a new object without its counter (CR 400.7) is no longer a valid pick either.
    const stripped = { ...paused, players: { ...paused.players, ai: { ...paused.players.ai, exile: paused.players.ai.exile.map((c) => (c.id === "vbear" ? { ...c, _voidCounter: undefined } : c)) } } };
    expect(freeCasts(resolveMilledPickChoice(stripped, "vbear")).map((o) => o.cardId)).toEqual(["vdiv"]);
  });

  it("two or more: you choose — nonlands first, most mana value first (a land can't be cast from there) — and only the chosen one is granted", () => {
    const paused = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...FOREST, id: "vland", _voidCounter: true }, { ...BEARS, id: "vbear", _voidCounter: true }, { ...DIVINATION, id: "vdiv", _voidCounter: true }, { ...MEMNITE, id: "vzero", _voidCounter: true }] }));
    const pc = paused.pendingChoice;
    const s = resolveMilledPickChoice(paused, "vbear");
    expect({ kind: pc?.kind, toZone: pc?.toZone, order: (pc?.candidates || []).map((c) => c.id), granted: freeCasts(s).map((o) => o.cardId) })
      .toEqual({ kind: "milled-pick", toZone: "playFree", order: ["vdiv", "vbear", "vzero", "vland"], granted: ["vbear"] });
  });

  it("the pause reaches a human's panel as the free-play pick (toZone survives the wire), and a pilot is offered \"Play … free this turn\"", () => {
    const paused = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...BEARS, id: "vbear", _voidCounter: true }, { ...DIVINATION, id: "vdiv", _voidCounter: true }] }));
    const wire = decisionViewForWire(advanceUntilDecision(sessionOf(paused)).decision);
    let offered = null;
    const decide = ({ legalActions }) => {
      if (legalActions.some((a) => a.choiceKind === "milled-pick")) offered = legalActions.map((a) => a.label);
      return legalActions.find((a) => a.value === "vbear") ?? legalActions[0];
    };
    const { session } = advanceUntilDecision(sessionOf(paused, "expert"), { decide });
    // The pilot plays on past the pick (the turn may end), so the grant is read from the log.
    const grant = (session.state.log || []).find((e) => e.effect === "void-play-grant");
    expect({ kind: wire.kind, toZone: wire.toZone, sourceName: wire.sourceName, candidates: wire.candidates.map((c) => c.id), offered, granted: grant?.granted ?? null })
      .toEqual({ kind: "milled-pick", toZone: "playFree", sourceName: "Dauthi Voidwalker", candidates: ["vdiv", "vbear"], offered: ["Play Divination free this turn", "Play Grizzly Bears free this turn"], granted: "Grizzly Bears" });
  });

  it("a player who leaves the game mid-pause (CR 800.4a): the chooser's ability is gone; a departed owner's card falls through", () => {
    const paused = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...BEARS, id: "vbear", _voidCounter: true }, { ...DIVINATION, id: "vdiv", _voidCounter: true }] }));
    const { user: _departed, ...rest } = paused.players;
    const chooserGone = resolveMilledPickChoice({ ...paused, players: rest, turnOrder: ["ai"] }, "vbear");
    expect({ pause: chooserGone.pendingChoice ?? null, stamped: chooserGone.players.ai.exile.filter((c) => c._impulse).map((c) => c.id) }).toEqual({ pause: null, stamped: [] });
    // Commander: the candidates sit in two opponents' exiles; the owner of the pick leaves.
    const c0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const cmd = { ...c0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...c0.players, user: { ...c0.players.user, battlefield: [P("dauthi", "user", DAUTHI)] }, ai1: { ...c0.players.ai1, exile: [{ ...DIVINATION, id: "vdiv", _voidCounter: true }] }, ai2: { ...c0.players.ai2, exile: [{ ...BEARS, id: "vbear", _voidCounter: true }] } } };
    const cmdPaused = activate(cmd);
    const { ai2: _gone, ...left } = cmdPaused.players;
    const s = resolveMilledPickChoice({ ...cmdPaused, players: left, turnOrder: (cmdPaused.turnOrder || []).filter((id) => id !== "ai2") }, "vbear");
    expect({ order: cmdPaused.pendingChoice?.candidates.map((c) => [c.id, c.owner]), granted: s.players.ai1.exile.filter((c) => c._impulseFree && c._impulseFor === "user").map((c) => c.id) })
      .toEqual({ order: [["vdiv", "ai1"], ["vbear", "ai2"]], granted: ["vdiv"] });
  });

  it("no void-countered card an opponent owns: the ability does nothing — no pause, no grant", () => {
    const s = activate(board({ user: [P("dauthi", "user", DAUTHI)], aiExile: [{ ...BEARS, id: "plain" }] }));
    expect({ pause: s.pendingChoice ?? null, granted: freeCasts(s), dauthi: s.players.user.battlefield.length }).toEqual({ pause: null, granted: [], dauthi: 0 });
  });
});
