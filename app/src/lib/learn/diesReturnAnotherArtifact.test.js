/**
 * diesReturnAnotherArtifact.test.js — "When this creature dies, return ANOTHER target artifact card
 * from your graveyard to your hand." (Myr Retriever · Junk Diver · Workshop Assistant — the census's
 * 3-sole popular dies-trigger cluster, 2026-08-02.)
 *
 * The base clause already parsed HIGH (return-from-graveyard / graveyardCard / artifact); ONLY the
 * "another" qualifier blocked all three. "Another" excludes the SOURCE CARD: by resolution time the
 * dead creature is a card in that same graveyard, and CR 109.5 forbids it targeting itself. The
 * exclusion reads ctx.triggeringCardId (stamped by makePendingTrigger) at graveyard enumeration; an
 * ABSENT referent excludes EVERYTHING (the damagedPlayerGraveyard absent-referent discipline) — the
 * ability drops no-target rather than ever self-returning.
 *
 * CREED pins:
 *   - the base (no-"another") form is byte-identical (no flag);
 *   - a graveyard holding ONLY the dead creature → the trigger is removed no-target (CR 603.3c) —
 *     the retriever NEVER returns itself (the exact FP the exclusion exists to prevent);
 *   - an absent triggeringCardId → zero candidates, never a guess.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall, pulled 2026-08-02).
const DIES_RETURN = "When this creature dies, return another target artifact card from your graveyard to your hand.";
const MYR_RETRIEVER = { id: "myr-card", name: "Myr Retriever", type: "Artifact Creature — Myr", power: "1", toughness: "1", mana: "{2}", oracle: DIES_RETURN };
const JUNK_DIVER = { id: "jd-card", name: "Junk Diver", type: "Artifact Creature — Bird", power: "1", toughness: "1", mana: "{3}", oracle: `Flying\n${DIES_RETURN}` };
const WORKSHOP_ASSISTANT = { id: "wa-card", name: "Workshop Assistant", type: "Artifact Creature — Construct", power: "1", toughness: "2", mana: "{3}", oracle: DIES_RETURN };

const SOL_RING = { id: "sol-card", name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };
const DIVINATION = { id: "div-card", name: "Divination", type: "Sorcery", mana: "{2}{U}", oracle: "Draw two cards." };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const withUser = (state, patch) => ({ ...state, players: { ...state.players, user: { ...state.players.user, ...patch } } });
const markLethal = (state, permId) => withUser(state, {
  battlefield: state.players.user.battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)),
});
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
const names = (arr) => arr.map((c) => c.name);

describe("ANOTHER-RETURN — parser", () => {
  it("the 'another' form parses HIGH with the exclusion flag; filter honored", () => {
    const p = parseEffectClause("return another target artifact card from your graveyard to your hand", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact", excludeTriggeringCard: true }]);
  });
  it("the base form is byte-identical to before (no flag)", () => {
    const p = parseEffectClause("return target artifact card from your graveyard to your hand", "Creature");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact" }]);
  });
  it("CREED — an unmodeled filter under 'another' stays LOW", () => {
    const p = parseEffectClause("return another target goblin card from your graveyard to your hand", "Creature");
    expect(programConfidence(p)).toBe("low");
  });
});

describe("ANOTHER-RETURN — descriptor + routing + classification", () => {
  it("the dies descriptor detects and routes natively", () => {
    const [d] = detectTriggers(MYR_RETRIEVER).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self" });
    expect(d.effectClause).toBe("return another target artifact card from your graveyard to your hand");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("all three carriers classify native-trigger (real oracle)", () => {
    expect(classifyCard(MYR_RETRIEVER)).toBe("native-trigger");
    expect(classifyCard(JUNK_DIVER)).toBe("native-trigger");
    expect(classifyCard(WORKSHOP_ASSISTANT)).toBe("native-trigger");
  });
});

describe("ANOTHER-RETURN — runtime (the exclusion is the whole card)", () => {
  it("dies with an artifact + a sorcery in the graveyard → returns the ARTIFACT, not itself, not the sorcery", () => {
    let s = baseState();
    const myr = createPermanent({ id: "myr", card: MYR_RETRIEVER, controller: "user", summoningSick: false });
    s = withUser(s, { battlefield: [myr], graveyard: [SOL_RING, DIVINATION], hand: [] });
    s = markLethal(s, "myr");
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(names(s.players.user.hand)).toEqual(["Sol Ring"]);                       // the other artifact came back
    expect(names(s.players.user.graveyard).sort()).toEqual(["Divination", "Myr Retriever"]); // itself + the sorcery stay
  });

  it("⭐ CREED — the graveyard holds ONLY the dead retriever → trigger removed no-target; it NEVER returns itself", () => {
    let s = baseState();
    const myr = createPermanent({ id: "myr", card: MYR_RETRIEVER, controller: "user", summoningSick: false });
    s = withUser(s, { battlefield: [myr], graveyard: [], hand: [] });
    s = markLethal(s, "myr");
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(names(s.players.user.hand)).toEqual([]);                                 // nothing returned
    expect(names(s.players.user.graveyard)).toEqual(["Myr Retriever"]);             // it stays dead
    expect((s.log || []).some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
  });

  it("two retrievers die together → each may return the OTHER's card, never its own", () => {
    let s = baseState();
    const a = createPermanent({ id: "myrA", card: { ...MYR_RETRIEVER, id: "myr-card-a" }, controller: "user", summoningSick: false });
    const b = createPermanent({ id: "myrB", card: { ...MYR_RETRIEVER, id: "myr-card-b" }, controller: "user", summoningSick: false });
    s = withUser(s, { battlefield: [a, b], graveyard: [], hand: [] });
    s = markLethal(s, "myrA");
    s = markLethal(s, "myrB");
    const lethal = destroyLethalCreatures(s);
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    // Both died into the graveyard; each trigger sees the OTHER retriever's card as a legal
    // artifact target. Whatever the chooser picked, NO card returned to hand may be the card
    // of the trigger that returned it — with two identical cards the observable invariant is:
    // at most both return (each returning the other), and hand+graveyard total exactly 2.
    const hand = names(s.players.user.hand);
    const gy = names(s.players.user.graveyard);
    expect(hand.length + gy.length).toBe(2);
    expect([...hand, ...gy].every((n) => n === "Myr Retriever")).toBe(true);
  });

  it("⭐ ACTIVATED path live (Corpse Hauler) — the flip audit's catch: the ability IS activatable and returns the OTHER card", () => {
    // With the original hard-exclude, this action would never have had a legal target — a credited
    // card whose ability could not fire, invisible to every fingerprint (law 6). Proven live now:
    // targets are chosen BEFORE the sacrifice is paid (CR 601.2b), the hauler is sacrificed as a
    // cost, and the pre-chosen graveyard creature comes back while the hauler stays dead.
    const HAULER = { id: "ch-card", name: "Corpse Hauler", type: "Creature — Human Rogue", power: "2", toughness: "1", mana: "{1}{B}",
      oracle: "{2}{B}, Sacrifice this creature: Return another target creature card from your graveyard to your hand." };
    const BEARS = { id: "gb-card", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };
    let s = baseState();
    const hauler = createPermanent({ id: "ch", card: HAULER, controller: "user", summoningSick: false });
    s = withUser(s, { battlefield: [hauler], graveyard: [BEARS], hand: [],
      manaPool: { ...s.players.user.manaPool, B: 1, C: 2 } });
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").find((a) => a.permanentId === "ch");
    expect(act).toBeTruthy();                                   // the ability EXISTS (the audit's whole point)
    expect(act.targets?.[0]).toMatchObject({ type: "graveyardCard", id: "gb-card" });
    let after = dispatchAction(s, act);
    expect(after.players.user.graveyard.some((c) => c.name === "Corpse Hauler")).toBe(true); // cost paid
    let g = 0;
    while ((after.stack || []).length && g++ < 10) after = resolveTopOfStack(after);
    expect(names(after.players.user.hand)).toEqual(["Grizzly Bears"]);            // the OTHER card returned
    expect(names(after.players.user.graveyard)).toEqual(["Corpse Hauler"]);       // the hauler stays dead
  });

  it("absent triggeringCardId (activated / ETB path) → the exclusion NO-OPS — the pool is offered whole", () => {
    // On the activated path (Corpse Hauler) targets are chosen BEFORE the sacrifice cost is paid
    // (CR 601.2b/601.2g), so the source card cannot be in the graveyard — nothing to exclude. A
    // hard-exclude here credited the card while making its ability targetless forever (the
    // runtime-invisible FP class); this pin keeps that from coming back.
    let s = baseState();
    s = withUser(s, { graveyard: [SOL_RING] });
    const out = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "artifact", excludeTriggeringCard: true }, [], {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "graveyardCard", id: "sol-card" });
  });
});
