/**
 * SENTINEL'S MARK — the Addendum: a main-phase cast look-back on the Aura's own ETB. SHELF-85 · Light-Paws L4, 2026-09-05.
 * "Flash / Enchant creature / Enchanted creature gets +1/+2 and has vigilance. / Addendum — When this Aura enters, if you
 * cast it during your main phase, enchanted creature gains lifelink until end of turn."
 *
 * The cast chokepoint stamps `castDuringMainPhase` beside `castFromZone` (the caster is the active player and the phase is
 * a main phase — the stack may hold other objects, CR 505.1); the Aura cast resolver carries it (and `wasCast`) onto the
 * entering Aura; the condition reader "you cast it during your main phase" answers from the triggering Aura's stamps.
 *
 * Mutation-checked: see the run ledger (docs-sk111).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { interveningIfParseable } from "./interveningIf.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction, castDuringMainPhaseNow } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MARK = { id: "c-sm", name: "Sentinel's Mark", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Flash"],
  oracle: "Flash\nEnchant creature\nEnchanted creature gets +1/+2 and has vigilance.\nAddendum — When this Aura enters, if you cast it during your main phase, enchanted creature gains lifelink until end of turn." };

describe("the parser", () => {
  it("the Addendum ETB carries the main-phase condition, the reader knows it, the card flips native", () => {
    const t = detectTriggers(MARK).find((x) => x.event === "etb");
    const row = { iff: t?.interveningIf, parseable: interveningIfParseable("you cast it during your main phase"), tier: classifyCard(MARK) };
    console.log("  WITNESS sentinelsMark", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.iff).toBe("you cast it during your main phase");
    expect(row.parseable).toBe(true);
    expect(row.tier).toMatch(/^native/);
  });
});

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
function castIn(phase, step, activePlayer = "user") {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const plains = (i) => createPermanent({ id: `pl${i}`, card: { id: `c-pl${i}`, name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller: "user" });
  const host = createPermanent({ id: "host", card: { id: "c-host", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });
  const s = { ...s0, phase, step, activePlayer, priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [MARK], battlefield: [plains(1), plains(2), host] } } };
  const cast = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-sm");
  expect(cast).toBeTruthy();
  let out = resolveAll(dispatchAction(s, cast));           // the Aura resolves and enters attached; its ETB is queued
  out = resolveAll(flushTriggers(out, { chooseTargets: chooseTriggerTargets }));
  const aura = findPermanent(out, "aura")?.permanent ?? out.players.user.battlefield.find((p) => p.card?.id === "c-sm");
  return { stamp: aura?.castDuringMainPhase ?? null, wasCast: aura?.wasCast ?? null, power: permanentPower(out, "host"), toughness: permanentToughness(out, "host"), vigilance: !!permanentHasKeyword(out, "host", "Vigilance"), lifelink: !!permanentHasKeyword(out, "host", "Lifelink") };
}

describe("RUNTIME — the stamp and the look-back", () => {
  it("cast in your main phase: the Aura carries the stamp, the host is 3/4 with vigilance AND lifelink", () => {
    const row = castIn("precombat-main", "main");
    console.log("  WITNESS sentinelsMarkMain", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stamp: true, wasCast: true, power: 3, toughness: 4, vigilance: true, lifelink: true });
  });
  it("the stamp's reader: your own main phase reads true; your combat and the opponent's main phase read false (the offer never casts an Aura outside its main-phase window — Flash goes unused — so the false branch is pinned at the reader, never faked through a cast)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const row = {
      ownMain: castDuringMainPhaseNow({ ...base, activePlayer: "user", phase: "precombat-main" }, "user"),
      ownPostMain: castDuringMainPhaseNow({ ...base, activePlayer: "user", phase: "postcombat-main" }, "user"),
      ownCombat: castDuringMainPhaseNow({ ...base, activePlayer: "user", phase: "combat" }, "user"),
      theirMain: castDuringMainPhaseNow({ ...base, activePlayer: "ai", phase: "precombat-main" }, "user"),
    };
    console.log("  WITNESS sentinelsMarkReader", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ownMain: true, ownPostMain: true, ownCombat: false, theirMain: false });
  });
});
