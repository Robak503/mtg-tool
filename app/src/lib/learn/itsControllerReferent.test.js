/**
 * itsControllerReferent.test.js — IC-1: "ITS CONTROLLER" on a trigger means the controller of the object
 * that TRIGGERED it. Poisonbelly Ogre (etb, another creature) · Fate Foretold (dies, enchanted creature) ·
 * Parasitic Impetus (attacks, enchanted creature).
 *
 * ⭐⭐ BUILT ENGINE, NO IGNITION — EXACTLY. `triggeringPermanentController` has been bound in
 * makePendingTrigger's generic context all along with ZERO consumers: a grep across learn/ returned the
 * binding line and nothing else. This slice is the consumer, not new machinery.
 *
 * ⛔⛔ THE REWRITE IS REQUIRED, NOT COSMETIC, AND THAT WAS MEASURED. A parser arm matching the RAW pronoun
 * returns the correct atom when the parser is called DIRECTLY, and parseEffectClause on the identical
 * string still yields [] — while its sibling "the upkeep player loses 1 life" passes the same pipeline.
 * The pipeline deliberately refuses a bare pronoun as a clause subject; the event-gated SENTINEL is how
 * every sibling referent earns that trust (gyOwner / upkeep / discarding / casting / drawing all do it).
 * A first attempt at this vein was reverted precisely because the arms were unreachable without it.
 *
 * ⛔⛔ `scope !== "self"` IS THE LOAD-BEARING HALF OF THE GATE. On a SELF trigger "its" is the source, whose
 * controller IS the ability's controller — the default path is already right there, and rewriting would
 * only introduce a referent that can go unbound. The carriers that need this are exactly the ones where
 * the triggering object belongs to SOMEONE ELSE.
 *
 * ⛔⛔ AND THAT IS WHY THE WRONG-SEAT PIN MATTERS MORE HERE THAN ANYWHERE: the fallback (ctx.controller) is
 * not merely a different seat, it is the OPPOSITE one. Poisonbelly Ogre's watcher is MINE while the
 * entering creature is usually an OPPONENT'S; Parasitic Impetus is MY aura on THEIR creature. A resolver
 * that fell through would drain ME for a card that drains THEM — and every "a player lost life" assertion
 * would pass while it happened.
 *
 * ⛔ THE SPELL FENCE: a SPELL has no triggering permanent, so this referent would silently no-op there.
 * All THREE of coverage's spell-path referent loops name it now — the third has a different tail and was
 * missed on the first pass, which is why they are counted rather than eyeballed.
 *
 * Mutation-checked (2026-08-06, grep-verified as applied AND verified to reach the guarded case):
 *   · the sentinel rewrite disabled -> effectClause keeps the raw pronoun, all three carriers park.
 *   · the lose-life resolver arm removed -> the trigger resolves and NOBODY loses life, classification green.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OGRE = { id: "c-po", name: "Poisonbelly Ogre", type: "Creature — Ogre Warrior", mana: "{3}{B}", power: "3", toughness: "3",
  oracle: "Whenever another creature enters, its controller loses 1 life." };
const FATE_FORETOLD = { id: "c-ff", name: "Fate Foretold", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: ["Enchant creature", "When this Aura enters, draw a card.", "When enchanted creature dies, its controller draws a card."].join("\n") };
const PARASITIC = { id: "c-pi", name: "Parasitic Impetus", type: "Enchantment — Aura", mana: "{2}{B}",
  oracle: ["Enchant creature", "Enchanted creature gets +2/+2 and is goaded.",
    "Whenever enchanted creature attacks, its controller loses 2 life and you gain 2 life."].join("\n") };

describe("the carriers", () => {
  it("⭐ all three flip, across etb / dies / attacks", () => {
    for (const c of [OGRE, FATE_FORETOLD, PARASITIC]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the rewrite fires on a NON-self scope and leaves a SELF trigger alone", () => {
    const ogre = detectTriggers(OGRE).find((d) => d.event === "etb");
    expect(ogre.scope).not.toBe("self");
    expect(String(ogre.effectClause)).toContain("the triggering permanent's controller");
    // ⛔ A self-scoped trigger keeps the pronoun: "its" is the source, whose controller already IS the
    // ability's controller, so the default path is correct and a referent would only add a way to miss.
    const selfTrig = detectTriggers({ name: "P", type: "Creature — Bear", mana: "{2}", power: "2", toughness: "2",
      oracle: "When this creature dies, its controller loses 1 life." }).find((d) => d.event === "dies");
    expect(String(selfTrig?.effectClause || "")).not.toContain("the triggering permanent's controller");
  });
});

describe("⭐⭐ LAW 6 — the TRIGGERING permanent's controller, not the ability's", () => {
  it("⭐⭐ MY Ogre, THEIR creature enters: THEY lose the life", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const ogre = createPermanent({ id: "ogre", card: OGRE, controller: "user", summoningSick: false });
    // The entering creature belongs to ai2 — the seat that must pay. The watcher is MINE.
    const entering = createPermanent({ id: "theirs", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai2", summoningSick: true });
    const before = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [ogre] },
      ai2: { ...s0.players.ai2, battlefield: [entering] } } };
    let s = checkEnterTriggers(before, entering);
    s = flushTriggers(s);
    let g = 0;
    while ((s.stack || []).length && g++ < 10) s = resolveTopOfStack(s);
    const life = (st) => Object.fromEntries(Object.keys(st.players).map((p) => [p, st.players[p].life]));
    const row = { before: life(before), after: life(s) };
    console.log("  WITNESS itsControllerLifeLoss", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⛔ THE ASSERTION THAT MATTERS: ai2 pays and the CONTROLLER does not. A fallback to ctx.controller
    // would have drained "user" — the exact opposite seat — and still logged a life loss.
    expect(row.after.ai2).toBe(row.before.ai2 - 1);
    expect(row.after.user).toBe(row.before.user);
    expect(row.after.ai1).toBe(row.before.ai1);
    expect(row.after.ai3).toBe(row.before.ai3);
  });
});
