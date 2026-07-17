/**
 * sameNameMassPump.test.js — BLITZ BB-1: the SAME-NAME mass pump/debuff (CR 611.2c).
 *
 * "Target creature and all other creatures with the same name as that creature get ±N/±N until end of turn."
 * Carriers: Bile Blight (-3/-3), Echoing Decay (-2/-2), Echoing Courage (+2/+2). ONE chosen target
 * (targetType:"creature" → the normal single-creature enumeration); at RESOLUTION the effect fans out to EVERY
 * battlefield creature (all players; tokens count) sharing the chosen creature's card NAME, the fixed set locked
 * as the one-shot begins (CR 611.2c). The nameFanout flag drives atomTargets' same-name gather; applyPumpEffect
 * applies the existing per-creature ±N/±N endOfTurn layer-7c effect + the lethal SBA. A scoped ("its controller
 * controls") or damage/exile fanout stays on the Arbiter (FN-safe). Real oracle fixtures (bundled Scryfall).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BILE_BLIGHT = { id: "c-bb", name: "Bile Blight", type: "Instant", mana: "{B}{B}",
  oracle: "Target creature and all other creatures with the same name as that creature get -3/-3 until end of turn." };
const ECHOING_DECAY = { id: "c-ed", name: "Echoing Decay", type: "Instant", mana: "{1}{B}",
  oracle: "Target creature and all other creatures with the same name as that creature get -2/-2 until end of turn." };
const ECHOING_COURAGE = { id: "c-ec", name: "Echoing Courage", type: "Instant", mana: "{1}{G}",
  oracle: "Target creature and all other creatures with the same name as that creature get +2/+2 until end of turn." };

describe("BB-1 parser — the same-name fanout parses to ONE nameFanout pump atom (both directions)", () => {
  it("Bile Blight / Echoing Decay / Echoing Courage → pump atom { nameFanout, ptDelta }", () => {
    expect(parseEffectProgram(BILE_BLIGHT).atoms).toEqual([
      { op: "pump", targetType: "creature", nameFanout: true, ptDelta: { p: -3, t: -3 } },
    ]);
    expect(parseEffectProgram(ECHOING_DECAY).atoms).toEqual([
      { op: "pump", targetType: "creature", nameFanout: true, ptDelta: { p: -2, t: -2 } },
    ]);
    expect(parseEffectProgram(ECHOING_COURAGE).atoms).toEqual([
      { op: "pump", targetType: "creature", nameFanout: true, ptDelta: { p: 2, t: 2 } },
    ]);
  });
  it("classify: all three flip native-spell", () => {
    expect(classifyCard(BILE_BLIGHT)).toBe("native-spell");
    expect(classifyCard(ECHOING_DECAY)).toBe("native-spell");
    expect(classifyCard(ECHOING_COURAGE)).toBe("native-spell");
  });
  it("FN guards: a scoped / damage / exile fanout stays on the Arbiter (whole-clause anchor)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: "Instant", oracle, mana: "{2}{B}" }))).toBe("low");
    // Controller-scoped fanout (Declaration in Stone / Legion's End shape) — "its controller controls" is a
    // different set (only that player's) the nameFanout gather doesn't model → parked.
    low("Exile target creature and all other creatures its controller controls with the same name as that creature.");
    // DAMAGE fanout (Homing Lightning) — a same-name spread of DAMAGE, not a pump → not this atom → parked.
    low("This deals 4 damage to target creature and each other creature with the same name as that creature.");
    // EXILE fanout (Sever the Bloodline) — same-name exile, not a pump → parked.
    low("Exile target creature and all other creatures with the same name as that creature.");
    // An INTERNAL keyword-grant rider ("…and gain deathtouch until end of turn") breaks the "get ±N/±N until end
    // of turn$" anchor, so the sentence is NOT kept whole → it shatters on the internal " and " → LOW (never a
    // partial that pumps but silently drops the grant).
    low("Target creature and all other creatures with the same name as that creature get -3/-3 and gain deathtouch until end of turn.");
  });
});

describe("BB-1 runtime — the fanout fixes the set at resolution (CR 611.2c), all players, tokens count", () => {
  function mainState(over = {}) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
  }
  function withPlayerBits(state, playerId, bits) {
    return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
  }
  // a 2/2 creature; `token:true` marks a token whose card.name is still the shared name (CR 111.3 — tokens have names)
  const scion = (id, controller, name = "Eldrazi Scion") =>
    createPermanent({ id, card: { id: "c-" + id, name, type: "Creature — Eldrazi Scion", power: 2, toughness: 2, oracle: "" }, controller });

  it("Bile Blight -3/-3 kills EVERY same-name creature on ALL battlefields; a differently-named creature survives", () => {
    let s = mainState();
    // two same-name "Eldrazi Scion" on ai + one on the CASTER's own board (all players) + a differently-named Bear on ai.
    const aiA = scion("ai-a", "ai");
    const aiB = scion("ai-b", "ai");
    const userScion = scion("u-s", "user");
    const bear = createPermanent({ id: "ai-bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
    s = withPlayerBits(s, "ai", { battlefield: [aiA, aiB, bear] });
    s = withPlayerBits(s, "user", { battlefield: [userScion], hand: [BILE_BLIGHT], manaPool: { ...s.players.user.manaPool, B: 2 } });
    // Cast targeting ONE Scion (aiA); the enumeration offers it as a single creature target.
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-bb" && a.targets?.[0]?.id === "ai-a");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    // Both ai Scions AND the caster's own Scion (same name, all players) died to the -3/-3 → 2/2 becomes -1/-1.
    expect(s.players.ai.battlefield.some((p) => p.card.name === "Eldrazi Scion")).toBe(false);
    expect(s.players.user.battlefield.some((p) => p.card.name === "Eldrazi Scion")).toBe(false);
    expect(s.players.ai.graveyard.filter((c) => c.name === "Eldrazi Scion").length).toBe(2);
    expect(s.players.user.graveyard.filter((c) => c.name === "Eldrazi Scion").length).toBe(1);
    // The differently-named Bear is untouched (still on the battlefield at full 2/2).
    const survivor = s.players.ai.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect(survivor).toBeTruthy();
    expect(permanentToughness(s, survivor.id)).toBe(2);
  });

  it("Echoing Courage +2/+2 buffs the chosen creature AND its same-name twin (fixed set, non-lethal)", () => {
    let s = mainState();
    const a = scion("ai-a", "ai");
    const b = scion("ai-b", "ai");
    s = withPlayerBits(s, "ai", { battlefield: [a, b] });
    s = withPlayerBits(s, "user", { hand: [ECHOING_COURAGE], manaPool: { ...s.players.user.manaPool, G: 1, C: 1 } });
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((x) => x.cardId === "c-ec" && x.targets?.[0]?.id === "ai-a");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    // Both same-name Scions are now 4/4 (the +2/+2 fanned to the whole same-name set).
    for (const id of ["ai-a", "ai-b"]) {
      expect(permanentPower(s, id)).toBe(4);
      expect(permanentToughness(s, id)).toBe(4);
    }
  });
});
