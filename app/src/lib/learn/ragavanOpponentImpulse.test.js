/**
 * ragavanOpponentImpulse.test.js — "Whenever Ragavan deals combat damage to a player, create a Treasure token and exile
 * the top card of that player's library. Until end of turn, you may cast that card." (shelf deck work, D3, 2026-09-30 —
 * Ragavan, Nimble Pilferer, in both the cdh and Shalai lists.)
 *
 * The engine had never cast a card someone else owns. The exiled card stays its OWNER's (CR 108.3): it sits in their
 * exile, stamped with who may cast it (`_impulseFor`), and it is only ever offered as a cast (the printed verb). The
 * caster's cast takes it out of the owner's exile (the action names `fromPlayerId`), the stack object carries the owner,
 * and the card goes home from there: a permanent enters under the caster's control with `owner` stamped (the seam
 * reanimation already uses), an instant resolves into its owner's graveyard (CR 608.2n), a countered spell goes to its
 * owner's graveyard (CR 701.6a). The permission (CR 601.3) lasts this turn and lapses at cleanup. CR 400.7 — the card that
 * leaves exile is a new object, so the permission never rides it anywhere.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets, runStepActions, finalizeStackResolution } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { counterSpellById } from "./effects/atoms/stack.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RAGAVAN = { name: "Ragavan, Nimble Pilferer", type: "Legendary Creature — Monkey Pirate", mana: "{R}", cmc: 1, colors: ["R"], power: "2", toughness: "1", keywords: ["Treasure", "Dash"],
  oracle: "Whenever Ragavan deals combat damage to a player, create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card.\nDash {1}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, colors: ["R"], keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {R}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };
const HOLY_STRENGTH = { name: "Holy Strength", type: "Enchantment — Aura", mana: "{W}", cmc: 1, colors: ["W"], keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature gets +1/+2." };
const CLONE = { name: "Clone", type: "Creature — Shapeshifter", mana: "{3}{U}", cmc: 4, colors: ["U"], power: "0", toughness: "0", keywords: [], oracle: "You may have this creature enter as a copy of any creature on the battlefield." };
const FRAYING_SANITY = { name: "Fraying Sanity", type: "Enchantment — Aura Curse", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: ["Enchant", "Mill"],
  oracle: "Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn." };
const CLAUSE = "create a Treasure token and exile the top card of that player's library. Until end of turn, you may cast that card";

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** `attacker`'s Ragavan connects with `defender` (the other seat of a duel, or ai1 of a four-player game), whose library
 *  is `defenderLibrary` and whose exile already holds `defenderExile`. */
function combat({ attacker = "user", defenderLibrary, defenderExile = [], attackerLands = [], attackerCreatures = [], seats = 2 }) {
  const g = seats === 4 ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const defender = attacker === "user" ? (seats === 4 ? "ai1" : "ai") : "user";
  return { ...g, turn: 5, activePlayer: attacker, priorityHolder: attacker, phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    combat: { attackers: [{ permanentId: "rag", attackingPlayer: attacker, defender }], blockers: [] },
    players: { ...g.players,
      [attacker]: { ...g.players[attacker], battlefield: [perm("rag", RAGAVAN, attacker), ...attackerCreatures, ...attackerLands], life: 40 },
      [defender]: { ...g.players[defender], battlefield: [], library: defenderLibrary, exile: defenderExile, life: 40 } } };
}
const resolveAll = (s) => { let st = s; for (let i = 0; i < 25 && (st.stack || []).length && !st.pendingChoice; i++) st = resolveTopOfStack(st); return st; };
const connect = (s) => resolveAll(flushTriggers(resolveCombatDamage(s), { chooseTargets: chooseTriggerTargets }));
const toMain = (s, who) => ({ ...s, phase: "postcombat-main", step: "main", activePlayer: who, priorityHolder: who, combat: null });
const castsFrom = (s, who, cardId) => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const exiled = (s, pid, cardId) => (s.players[pid].exile || []).find((c) => c.id === cardId) || null;
const onBattlefield = (s, pid, cardId) => (s.players[pid].battlefield || []).find((p) => p.card?.id === cardId || p.printedCard?.id === cardId) || null;
const graveyards = (s, ...pids) => Object.fromEntries(pids.map((pid) => [pid, s.players[pid].graveyard.map((c) => c.id)]));

describe("the card", () => {
  it("⭐ Ragavan reads native — its combat-damage trigger is modeled", () => {
    expect(classifyCard(RAGAVAN)).toBe("native-trigger");
  });
  it("the trigger parses to a Treasure and a cast-only impulse from the damaged player's library", () => {
    const [t] = detectTriggers(RAGAVAN);
    expect(t.event).toBe("combatDamageToPlayer");
    const p = parseEffectClause(t.effectClause, "Instant", { sourceScoped: true });
    expect({ conf: programConfidence(p), atoms: p.atoms }).toEqual({ conf: "high", atoms: [
      { op: "create-named-token", token: "treasure", count: 1, targetType: null },
      { op: "impulse-exile", targetType: null, who: "damagedPlayer" },
    ] });
  });
  it("the referent is the combat-damage one — the shared gate refuses it anywhere else", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(combatDamageReferentSatisfied(p, "combatDamageToPlayer")).toBe(true);
    expect(combatDamageReferentSatisfied(p, "etb")).toBe(false);
  });
  it("near misses stay unmodeled: play instead of cast, and a trailing window", () => {
    for (const c of ["exile the top card of that player's library. Until end of turn, you may play that card",
      "exile the top card of that player's library. You may cast that card this turn"]) {
      expect(programConfidence(parseEffectClause(c, "Instant", { sourceScoped: true }))).toBe("low");
    }
  });
});

describe("⭐ the real trigger", () => {
  it("⭐ Ragavan connects: a Treasure, and their top card in THEIR exile, castable by you and not by them", () => {
    // A Forest beside the new Treasure makes the {1}{G} affordable — the offer is a real, payable cast.
    const s = connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], attackerLands: [perm("f1", FOREST, "user")] }));
    const row = {
      aiLife: s.players.ai.life,
      treasures: s.players.user.battlefield.filter((p) => p.card?.name === "Treasure").length,
      inAiExile: !!exiled(s, "ai", "ai-bears"),
      userMayCast: castsFrom(toMain(s, "user"), "user", "ai-bears").length > 0,
      aiMayCast: castsFrom(toMain(s, "ai"), "ai", "ai-bears").length > 0,
    };
    console.log(`WITNESS ragavanPilfer ${JSON.stringify(row)}`);
    expect(row).toEqual({ aiLife: 38, treasures: 1, inAiExile: true, userMayCast: true, aiMayCast: false });
  });

  it("⭐ you cast it with the Treasure: it enters under your control, still their card — and dies into THEIR graveyard", () => {
    // Their exile already holds another card: the cast takes exactly the one it names out of THEIR exile, nothing else.
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], defenderExile: [{ ...BOLT, id: "ai-old" }], attackerLands: [perm("f1", FOREST, "user")] })), "user");
    const [cast] = castsFrom(s, "user", "ai-bears");
    expect(cast.fromPlayerId).toBe("ai");
    const out = resolveAll(dispatchAction(s, cast));
    const bears = onBattlefield(out, "user", "ai-bears");
    expect({ controller: bears?.controller, owner: bears?.owner, aiExile: out.players.ai.exile.map((c) => c.id), userExile: out.players.user.exile.map((c) => c.id),
      treasureSpent: !out.players.user.battlefield.some((p) => p.card?.name === "Treasure") }).toEqual({ controller: "user", owner: "ai", aiExile: ["ai-old"], userExile: [], treasureSpent: true });
    const dead = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: bears.id });
    expect({ ai: dead.players.ai.graveyard.map((c) => c.id), user: dead.players.user.graveyard.map((c) => c.id) }).toEqual({ ai: ["ai-bears"], user: [] });
  });

  it("an instant you cast from their exile resolves into THEIR graveyard (CR 608.2n)", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BOLT, id: "ai-bolt" }], attackerLands: [perm("m1", MOUNTAIN, "user")] })), "user");
    const cast = castsFrom(s, "user", "ai-bolt").find((a) => (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    const out = resolveAll(dispatchAction(s, cast));
    expect({ aiLife: out.players.ai.life, ai: out.players.ai.graveyard.map((c) => c.id), user: out.players.user.graveyard.map((c) => c.id) })
      .toEqual({ aiLife: 35, ai: ["ai-bolt"], user: [] });
  });

  it("countered, it goes to its owner's graveyard (CR 701.6a)", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], attackerLands: [perm("f1", FOREST, "user")] })), "user");
    const onStack = dispatchAction(s, castsFrom(s, "user", "ai-bears")[0]);
    const spell = onStack.stack.find((o) => o.source?.id === "ai-bears");
    expect(spell.owner).toBe("ai");
    const out = counterSpellById(onStack, spell.id);
    expect({ ai: out.players.ai.graveyard.map((c) => c.id), user: out.players.user.graveyard.map((c) => c.id) }).toEqual({ ai: ["ai-bears"], user: [] });
  });

  it("an Aura cast from their exile enters on your creature, still theirs — and, its target gone, fizzles into THEIR graveyard", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...HOLY_STRENGTH, id: "ai-hs" }] })), "user");
    const cast = castsFrom(s, "user", "ai-hs").find((a) => (a.targets || []).some((t) => t.id === "rag"));
    const out = resolveAll(dispatchAction(s, cast));
    const aura = onBattlefield(out, "user", "ai-hs");
    expect({ owner: aura?.owner, attachedTo: aura?.attachedTo }).toEqual({ owner: "ai", attachedTo: "rag" });
    const noTarget = moveCardToZone(dispatchAction(s, cast), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "rag" });
    expect(graveyards(resolveAll(noTarget), "ai", "user")).toEqual({ ai: ["ai-hs"], user: ["c-rag"] });
  });

  it("a Curse cast from one opponent's exile onto another stays its owner's — and fizzles home when that player is gone", () => {
    const s = toMain(connect(combat({ seats: 4, defenderLibrary: [{ ...FRAYING_SANITY, id: "a1-fs" }], attackerLands: [perm("i1", ISLAND, "user"), perm("i2", ISLAND, "user")] })), "user");
    const cast = castsFrom(s, "user", "a1-fs").find((a) => a.enchantsPlayer && a.targets[0]?.id === "ai2");
    const out = resolveAll(dispatchAction(s, cast));
    const curse = onBattlefield(out, "user", "a1-fs");
    expect({ owner: curse?.owner, enchanted: curse?.enchantedPlayerId }).toEqual({ owner: "ai1", enchanted: "ai2" });
    const onStack = dispatchAction(s, cast);
    const { ai2: _gone, ...rest } = onStack.players;
    expect(graveyards(resolveAll({ ...onStack, players: rest }), "ai1", "user")).toEqual({ ai1: ["a1-fs"], user: [] });
  });

  it("a Clone cast from their exile copies as it enters and stays theirs through the choice — and dies into THEIR graveyard", () => {
    const islands = [perm("i1", ISLAND, "user"), perm("i2", ISLAND, "user"), perm("i3", ISLAND, "user")];
    const s = toMain(connect(combat({ defenderLibrary: [{ ...CLONE, id: "ai-clone" }], attackerCreatures: [perm("b1", BEARS, "user")], attackerLands: islands })), "user");
    let out = resolveAll(dispatchAction(s, castsFrom(s, "user", "ai-clone")[0]));
    expect(out.pendingChoice).toBeTruthy();
    out = finalizeStackResolution(resolveCloneChoice(out, "b1"));
    const copy = onBattlefield(out, "user", "ai-clone");
    expect({ name: copy?.card?.name, owner: copy?.owner }).toEqual({ name: "Grizzly Bears", owner: "ai" });
    const dead = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: copy.id });
    expect(graveyards(dead, "ai", "user")).toEqual({ ai: ["ai-clone"], user: [] });
  });

  it("a Clone whose copy is declined enters as itself, dies, and goes to THEIR graveyard", () => {
    const islands = [perm("i1", ISLAND, "user"), perm("i2", ISLAND, "user"), perm("i3", ISLAND, "user")];
    const s = toMain(connect(combat({ defenderLibrary: [{ ...CLONE, id: "ai-clone" }], attackerCreatures: [perm("b1", BEARS, "user")], attackerLands: islands })), "user");
    const paused = resolveAll(dispatchAction(s, castsFrom(s, "user", "ai-clone")[0]));
    expect(graveyards(finalizeStackResolution(resolveCloneChoice(paused, null)), "ai", "user")).toEqual({ ai: ["ai-clone"], user: [] });
  });

  it("a Clone with nothing left to copy enters as itself, dies, and goes to THEIR graveyard", () => {
    const islands = [perm("i1", ISLAND, "user"), perm("i2", ISLAND, "user"), perm("i3", ISLAND, "user")];
    const s = toMain(connect(combat({ defenderLibrary: [{ ...CLONE, id: "ai-clone" }], attackerLands: islands })), "user");
    const onStack = dispatchAction(s, castsFrom(s, "user", "ai-clone")[0]);
    const empty = moveCardToZone(onStack, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "rag" });
    expect(graveyards(resolveAll(empty), "ai", "user")).toEqual({ ai: ["ai-clone"], user: ["c-rag"] });
  });

  it("a land exiled this way stays in exile — the printed verb is cast, and nobody plays it", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...FOREST, id: "ai-forest" }] })), "user");
    expect(exiled(s, "ai", "ai-forest")?._impulseFor).toBe("user");
    const offered = (st, who) => legalActionsForPlayer(st, who).filter((a) => a.cardId === "ai-forest").length;
    expect({ user: offered(s, "user"), ai: offered(toMain(s, "ai"), "ai") }).toEqual({ user: 0, ai: 0 });
  });

  it("the window closes at cleanup: the stamps come off and the card stays in their exile, no longer offered", () => {
    const s = connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }] }));
    const after = runStepActions({ ...s, phase: "ending", step: "cleanup", priorityHolder: null, combat: null });
    const card = exiled(after, "ai", "ai-bears");
    expect({ there: !!card, impulse: card?._impulse ?? null, for: card?._impulseFor ?? null }).toEqual({ there: true, impulse: null, for: null });
    expect(castsFrom(toMain(after, "user"), "user", "ai-bears")).toEqual([]);
  });

  it("a stamp from an earlier turn grants nothing — the window is this turn's", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], attackerLands: [perm("f1", FOREST, "user")] })), "user");
    expect(castsFrom(s, "user", "ai-bears").length).toBeGreaterThan(0);
    expect(castsFrom({ ...s, turn: s.turn + 1 }, "user", "ai-bears")).toEqual([]);
  });

  it("CR 400.7 — cast, then exiled again the same turn, it is not castable again", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], attackerLands: [perm("f1", FOREST, "user")] })), "user");
    const out = resolveAll(dispatchAction(s, castsFrom(s, "user", "ai-bears")[0]));
    const gone = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: onBattlefield(out, "user", "ai-bears").id });
    expect({ inAiExile: !!exiled(gone, "ai", "ai-bears"), stamped: !!exiled(gone, "ai", "ai-bears")?._impulse, recast: castsFrom(gone, "user", "ai-bears").length })
      .toEqual({ inAiExile: true, stamped: false, recast: 0 });
  });

  it("the same holds for your own impulse card: cast from exile, exiled again the same turn, not offered again", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm("f1", FOREST, "user"), perm("f2", FOREST, "user")], library: [{ ...BEARS, id: "u-bears" }] } } };
    s = resolveAtom(s, { op: "impulse-exile", targetType: null }, { controller: "user" });
    const out = resolveAll(dispatchAction(s, castsFrom(s, "user", "u-bears")[0]));
    const gone = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: onBattlefield(out, "user", "u-bears").id });
    expect({ inExile: !!exiled(gone, "user", "u-bears"), recast: castsFrom(gone, "user", "u-bears").length }).toEqual({ inExile: true, recast: 0 });
  });

  it("a cast out of another player's exile without the stamp is refused, never cast", () => {
    const s = toMain(connect(combat({ defenderLibrary: [{ ...BEARS, id: "ai-bears" }], attackerLands: [perm("f1", FOREST, "user")] })), "user");
    const [cast] = castsFrom(s, "user", "ai-bears");
    const unstamped = { ...s, players: { ...s.players, ai: { ...s.players.ai, exile: s.players.ai.exile.map((c) => ({ ...c, _impulseFor: "someone-else" })) } } };
    expect(() => dispatchAction(unstamped, cast)).toThrow(/no permission/);
  });

  it("⭐ the AI pilot casts the card its Ragavan exiled", () => {
    const s = toMain(connect(combat({ attacker: "ai", defenderLibrary: [{ ...BEARS, id: "u-bears" }], attackerLands: [perm("f1", FOREST, "ai")] })), "ai");
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: picked?.kind, cardId: picked?.cardId, from: picked?.fromPlayerId }).toEqual({ kind: "cast-spell", cardId: "u-bears", from: "user" });
  });

  it("no damaged player, no exile — never the caster's own card", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, library: [{ ...BEARS, id: "u-bears" }] } } };
    const out = resolveAtom(s, { op: "impulse-exile", targetType: null, who: "damagedPlayer" }, { controller: "user" });
    expect({ userLib: out.players.user.library.length, userExile: out.players.user.exile.length, aiExile: out.players.ai.exile.length }).toEqual({ userLib: 1, userExile: 0, aiExile: 0 });
    expect(out.log.at(-1)).toMatchObject({ effect: "impulse-exile", exiled: null });
  });
});
