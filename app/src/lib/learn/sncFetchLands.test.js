/**
 * sncFetchLands.test.js — the Streets of New Capenna family fetch lands (play-weighted #716 Riveteers Overlook, #969 Cabaretti
 * Courtyard, #1284 Maestros Theater, #1315 Brokers Hideout, #1671 Obscura Storefront):
 *
 *   "When this land enters, sacrifice it. When you do, search your library for a basic A, B, or C card, put it onto the
 *    battlefield tapped, then shuffle and you gain 1 life."
 *
 * Three readings meet here:
 *  · "it" in a self-scope enters trigger is the land itself (CR 608.2c), so "sacrifice it" is the self-sacrifice;
 *  · "When you do, …" is a reflexive trigger (CR 603.7): it triggers only if the land WAS sacrificed — a land that left the
 *    battlefield before the trigger resolved (bounced in response) can't be sacrificed (CR 701.21a), and then nothing is
 *    searched and no life is gained. The engine folds the reflexive into the program and gates it on the sacrifice actually
 *    happening (`ifSacrificed`), the gate carried across the search's pause;
 *  · "then shuffle and you gain 1 life" — the life comes after the search, found or not.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { createGameState, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle) => ({ name, type: "Land", mana: "", cmc: 0, colors: [], keywords: [], oracle });
const RIVETEERS = L("Riveteers Overlook", "When this land enters, sacrifice it. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const CABARETTI = L("Cabaretti Courtyard", "When this land enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const MAESTROS = L("Maestros Theater", "When this land enters, sacrifice it. When you do, search your library for a basic Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const BROKERS = L("Brokers Hideout", "When this land enters, sacrifice it. When you do, search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const OBSCURA = L("Obscura Storefront", "When this land enters, sacrifice it. When you do, search your library for a basic Plains, Island, or Swamp card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const FAMILY = [RIVETEERS, CABARETTI, MAESTROS, BROKERS, OBSCURA];

const basic = (id, sub) => ({ id, name: sub, type: `Basic Land — ${sub}`, mana: "", cmc: 0, colors: [], keywords: [], oracle: `({T}: Add {${{ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" }[sub]}}.)` });
const SNOW_SWAMP = { id: "lib-snow", name: "Snow-Covered Swamp", type: "Basic Snow Land — Swamp", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {B}.)" };
const BLOOD_CRYPT = { id: "lib-crypt", name: "Blood Crypt", type: "Land — Swamp Mountain", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {B} or {R}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." };

/** Play `card` from hand with `library`; flush its enters trigger and resolve until a pause (or an empty stack). */
function playLand(card, library, { beforeResolve = null } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  let s = {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3,
    players: { ...s0.players, user: { ...s0.players.user, life: 40, hand: [{ ...card, id: "L" }], battlefield: [], library, landsPlayedThisTurn: 0 } },
  };
  s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "L" });
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  if (beforeResolve) s = beforeResolve(s);
  let guard = 0;
  while ((s.stack || []).length && !s.pendingChoice && guard++ < 6) s = resolveTopOfStack(s);
  return s;
}
const user = (s) => s.players.user;
const names = (zone) => zone.map((c) => c.card?.name ?? c.name).sort();
const crash = (s) => (s.log || []).find((e) => e.kind === "stack-resolve-error" || e.kind === "spell-unresolved");

describe("classification", () => {
  it("⭐ the five family lands are `land` (every line modelled)", () => {
    const row = Object.fromEntries(FAMILY.map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual(Object.fromEntries(FAMILY.map((c) => [c.name, "land"])));
  });

  it("⭐ the enters trigger routes natively: the self-sacrifice, then the gated search and the life", () => {
    const [d] = detectTriggers(RIVETEERS);
    expect(d.event).toBe("etb");
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("⛔ CREED — a rider the search doesn't read keeps the land parked", () => {
    expect(classifyCard({ ...RIVETEERS, oracle: RIVETEERS.oracle.replace("gain 1 life.", "gain 1 life. Draw a card for each opponent who controls a Swamp.") })).toBe("land-partial");
    expect(classifyCard({ ...RIVETEERS, oracle: RIVETEERS.oracle.replace("sacrifice it.", "sacrifice it unless you discard a card.") })).toBe("land-partial");
  });

  it("control — Evolving Wilds stays `land`; a Plan's \"sacrifice it. When you do\" on a counter event stays parked", () => {
    expect(classifyCard(L("Evolving Wilds", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle."))).toBe("land");
    const CLAIM = { name: "Claim the Kingdom", type: "Enchantment — Plan", mana: "{2}{G}", cmc: 3, colors: ["G"], keywords: ["Landfall"],
      oracle: "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control and a plan counter on this enchantment.\nWhen the fourth plan counter is put on this enchantment, sacrifice it. When you do, put an indestructible counter on target creature you control." };
    expect(classifyCard(CLAIM)).toBe("body-only");
  });
});

describe("runtime — play the land, the trigger resolves", () => {
  const LIB = () => [basic("lib-plains", "Plains"), basic("lib-forest", "Forest"), basic("lib-swamp", "Swamp"), SNOW_SWAMP, BLOOD_CRYPT, basic("lib-island", "Island")];

  it("⭐ it is sacrificed and the search offers exactly the basic Swamp / Mountain / Forest cards", () => {
    const s = playLand(RIVETEERS, LIB());
    expect(crash(s)).toBeUndefined();
    expect(names(user(s).graveyard)).toEqual(["Riveteers Overlook"]);
    expect(user(s).battlefield).toEqual([]);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", destination: "battlefield", entersTapped: true });
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["lib-forest", "lib-snow", "lib-swamp"]);
    expect(user(s).life).toBe(40); // the life comes after the search
  });

  it("⭐ the found basic enters TAPPED, and the controller gains 1 life after the search", () => {
    const after = resolveTutorChoice(playLand(RIVETEERS, LIB()), "lib-forest");
    expect(crash(after)).toBeUndefined();
    expect(after.pendingChoice).toBeFalsy();
    expect(names(user(after).battlefield)).toEqual(["Forest"]);
    expect(user(after).battlefield[0].tapped).toBe(true);
    expect(user(after).life).toBe(41);
    expect(user(after).library.some((c) => c.id === "lib-forest")).toBe(false);
  });

  it("⭐ finding nothing still shuffles and still gains the life (the life is not conditional on the find)", () => {
    const s = playLand(CABARETTI, [basic("lib-island", "Island"), basic("lib-swamp", "Swamp")]);
    expect(s.pendingChoice?.candidates ?? []).toEqual([]);
    const after = s.pendingChoice ? resolveTutorChoice(s, null) : s;
    expect(user(after).battlefield).toEqual([]);
    expect(user(after).life).toBe(41);
  });

  it("⭐ each family member searches its own three basic types", () => {
    const lib = () => ["Plains", "Island", "Swamp", "Mountain", "Forest"].map((t) => basic(`lib-${t}`, t));
    const row = Object.fromEntries(FAMILY.map((c) => [c.name, (playLand(c, lib()).pendingChoice?.candidates ?? []).map((x) => x.name).sort()]));
    expect(row).toEqual({
      "Riveteers Overlook": ["Forest", "Mountain", "Swamp"],
      "Cabaretti Courtyard": ["Forest", "Mountain", "Plains"],
      "Maestros Theater": ["Island", "Mountain", "Swamp"],
      "Brokers Hideout": ["Forest", "Island", "Plains"],
      "Obscura Storefront": ["Island", "Plains", "Swamp"],
    });
  });

  it("⭐ the auto-pick (the AI's search) takes one of the offered basics and the life follows", () => {
    const s = playLand(MAESTROS, LIB());
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    const pick = autoPickTutorCandidate(s, s.pendingChoice);
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["lib-island", "lib-snow", "lib-swamp"]);
    expect(["lib-island", "lib-snow", "lib-swamp"]).toContain(pick);
    const after = resolveTutorChoice(s, pick);
    expect(user(after).battlefield.map((p) => p.card.id)).toEqual([pick]);
    expect(user(after).life).toBe(41);
  });

  it("⛔ CR 603.7 — bounced before the trigger resolves: it can't be sacrificed, so nothing is searched and no life is gained", () => {
    const bounce = (s) => {
      const perm = user(s).battlefield.find((p) => p.card?.name === "Riveteers Overlook");
      return moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: perm.id });
    };
    const s = playLand(RIVETEERS, LIB(), { beforeResolve: bounce });
    expect(crash(s)).toBeUndefined();
    expect(s.pendingChoice).toBeFalsy();
    expect(names(user(s).hand)).toEqual(["Riveteers Overlook"]);
    expect(user(s).battlefield).toEqual([]);
    expect(user(s).life).toBe(40);
    expect(user(s).library).toHaveLength(6);
  });
});


describe("the reflexive gate on a self-sacrifice primary (CR 603.7)", () => {
  // Smoke Bomb's upkeep trigger is the one other bundled card whose reflexive folds behind a self-sacrifice. Its reflexive now
  // runs only when the sacrifice happened, the same gate the fetch lands ride.
  const SMOKE_BOMB_EFFECT = "sacrifice this artifact. When you do, target creature you control can't be blocked this turn";

  it("⭐ the folded reflexive atoms carry the sacrifice gate", () => {
    const p = parseEffectClause(SMOKE_BOMB_EFFECT, "Artifact");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => [a.op, a.target ?? null, a.ifSacrificed === true])).toEqual([["sacrifice", "self", false], ["cant-be-blocked", null, true]]);
  });

  it("control — a reflexive behind a primary that always happens stays ungated (Faebloom Trick)", () => {
    const p = parseEffectClause("Create two 1/1 blue Faerie creature tokens with flying. When you do, tap target creature an opponent controls.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.some((a) => a.ifSacrificed)).toBe(false);
  });
});

describe("the AI's land drop reads the family land as the tapped basic it fetches from the library", () => {
  const DIMIR_GUILDGATE = { ...L("Dimir Guildgate", "This land enters tapped.\n{T}: Add {U} or {B}."), type: "Land — Gate" };
  const ARID_MESA = L("Arid Mesa", "{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain or Plains card, put it onto the battlefield, then shuffle.");
  function aiHand(hand, { needs = "{1}{G}" } = {}) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const spell = { id: "spell", name: "Needs Mana", type: "Creature — Bear", mana: needs, cmc: 2, colors: ["G"], keywords: [], power: "2", toughness: "2", oracle: "" };
    return { ...s0, turn: 2, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
      players: { ...s0.players, ai: { ...s0.players.ai, hand: [...hand.map(([id, c]) => ({ ...c, id })), spell], battlefield: [], landsPlayedThisTurn: 0, library: [basic("lib-f", "Forest"), basic("lib-s", "Swamp")] } } };
  }
  const landPick = async (s) => {
    const { pickAction } = await import("./opponentAI.js");
    const { legalActionsForPlayer } = await import("./legalChoices.js");
    return pickAction(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "play-land"));
  };

  it("⭐ Maestros Theater (it finds a Swamp) over a Forest when the hand needs {B} and the Forest's mana casts nothing — the Forest was first by name", async () => {
    const a = await landPick(aiHand([["theater", MAESTROS], ["forest", basic("forest", "Forest")]], { needs: "{1}{B}" }));
    expect(a.cardId).toBe("theater");
  });

  it("⭐ Maestros Theater over Arid Mesa when the hand needs {B} (the Mesa finds nothing in the library: a land that makes no mana)", async () => {
    const a = await landPick(aiHand([["mesa", ARID_MESA], ["theater", MAESTROS]], { needs: "{1}{B}" }));
    expect(a.cardId).toBe("theater");
  });

  it("control — a colour it can't fetch counts for nothing: the Forest (first by name) when the hand needs {W}", async () => {
    const a = await landPick(aiHand([["theater", MAESTROS], ["forest", basic("forest", "Forest")]], { needs: "{1}{W}" }));
    expect(a.cardId).toBe("forest");
  });

  // 2026-10-17 (the land drop reads what a fetch yields — opponentAI.landDropYield): the deferred tapped reading. Before, the
  // Overlook was read as an untapped land and went down over the Guildgate the hand needed.
  it("⭐ it is ranked as the tapped land it becomes: Dimir Guildgate (the {U} the hand needs) over the Overlook (a tapped Forest or Swamp)", async () => {
    const a = await landPick(aiHand([["gate", DIMIR_GUILDGATE], ["overlook", RIVETEERS]], { needs: "{1}{U}" }));
    expect(a.cardId).toBe("gate");
  });
});
