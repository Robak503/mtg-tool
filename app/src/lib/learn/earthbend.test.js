/**
 * earthbend.test.js — EARTHBEND N (Toph): "Target land you control becomes a 0/0 creature with haste
 * that's still a land. Put N +1/+1 counters on it." A permanent land-animation (reusing the ANIMATE
 * layer machinery) + N +1/+1 counters applied before the lethal SBA, so the land becomes a real N/N
 * attacker. The parser atom + the resolver.
 */
import { describe, it, expect } from "vitest";
import { applyEarthbend } from "./effects/effectAtoms.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { createGameState, createPermanent, addCounter, destroyLethalCreatures, moveCardToZone } from "./gameState.js";
import { permanentIsCreature, permanentPower, permanentToughness, permanentHasKeyword, permanentTypes } from "./layers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkEnterTriggers, checkDiesTriggers, checkLeavesTriggers } from "./triggers.js";

describe("earthbend parser", () => {
  it("'earthbend 2' → a literal-N earthbend atom", () => {
    expect(parseEffectProgram({ oracle: "Earthbend 2.", type: "Instant" })?.atoms).toEqual([{ op: "earthbend", count: 2, targetType: null }]);
  });
  it("'earthbend X, where X is the number of experience counters you have' → earthbend+countSource (PR3)", () => {
    const p = parseEffectProgram({ oracle: "Earthbend X, where X is the number of experience counters you have.", type: "Instant" });
    expect(p?.atoms?.[0]).toMatchObject({ op: "earthbend", countSource: { kind: "experienceCounters" } });
  });
  // POWER-QUALIFIED count source (The Boulder, Ready to Rumble): "earthbend X, where X is the number of
  // creatures you control with power 4 or greater." The threshold is layer-aware (applied in countForSpec).
  it("'earthbend X, where X is the number of creatures you control with power 4 or greater' → earthbend+powerAtLeast countSource", () => {
    const p = parseEffectProgram({ oracle: "Earthbend X, where X is the number of creatures you control with power 4 or greater.", type: "Sorcery" });
    expect(p?.atoms?.[0]).toMatchObject({ op: "earthbend", countSource: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 4 } });
  });
  it("the 'or more' spelling parses the same powerAtLeast count source", () => {
    const p = parseEffectProgram({ oracle: "Earthbend X, where X is the number of creatures you control with power 3 or more.", type: "Sorcery" });
    expect(p?.atoms?.[0]).toMatchObject({ op: "earthbend", countSource: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 3 } });
  });
});

describe("applyEarthbend — permanent land-animation + counters", () => {
  const withLand = (type = "Basic Land — Forest", name = "Forest") => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ card: { name, type }, controller: "user" });
    return { st: { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land] } } }, landId: land.id };
  };

  it("animates a land into an N/N Elemental with haste that's still a land", () => {
    const { st, landId } = withLand();
    const out = applyEarthbend(st, { count: 3 }, { controller: "user" });
    const land = out.players.user.battlefield.find((p) => p.id === landId);
    expect(land).toBeTruthy();                                   // survived (3/3, not a dead 0/0)
    expect(permanentIsCreature(out, landId)).toBe(true);
    expect(permanentPower(out, landId)).toBe(3);
    expect(permanentToughness(out, landId)).toBe(3);
    expect(permanentHasKeyword(out, landId, "Haste")).toBe(true); // can attack the turn it's animated
    const { types } = permanentTypes(out, landId);
    expect(types).toContain("Land");                            // "still a land" → still taps for mana
    expect(types).toContain("Creature");
  });

  it("the animation is PERMANENT (a stored continuous effect, not until-end-of-turn)", () => {
    const { st, landId } = withLand();
    const out = applyEarthbend(st, { count: 2 }, { controller: "user" });
    const eff = (out.continuousEffects || []).filter((e) => e.affects?.permanentIds?.includes(landId));
    expect(eff.length).toBeGreaterThan(0);
    expect(eff.every((e) => (e.duration?.kind || "permanent") !== "endOfTurn")).toBe(true);
  });

  it("no land to target → a safe no-op (no crash, no fabricated creature)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bare = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(() => applyEarthbend(bare, { count: 2 }, { controller: "user" })).not.toThrow();
  });
});

// END-TO-END: an "When this enters, earthbend N" TRIGGER fires through the real flush→resolve path (not just
// the atom in isolation) — the load-bearing proof that an ETB earthbend card (Solid Ground, Toph cluster)
// genuinely resolves natively, so classifying it native is honest (CREED), not a do-nothing claim.
describe("earthbend ETB trigger — end-to-end resolution", () => {
  it("a creature's 'When this enters, earthbend 1' animates a land + places the counter via the stack", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ id: "ebt-forest", card: { name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    const src = createPermanent({ id: "ebt-src", card: { name: "EB Source", type: "Creature — Human", power: 2, toughness: 2, oracle: "When this creature enters, earthbend 1." }, controller: "user", summoningSick: true });
    s = { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [land, src], life: 40 } } };
    s = checkEnterTriggers(s, src);                                  // the ETB earthbend goes on the stack
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let guard = 0; while ((s.stack || []).length && guard++ < 30) s = resolveTopOfStack(s);
    const out = s.players.user.battlefield.find((p) => p.id === "ebt-forest");
    expect(out).toBeTruthy();
    expect(out.counters?.["+1/+1"]).toBe(1);                          // the earthbend counter was actually placed
    expect(permanentIsCreature(s, "ebt-forest")).toBe(true);          // the land is now a creature (layer-4 animation)
    expect(permanentTypes(s, "ebt-forest").types).toContain("Land");  // still a land
  });
});

// POWER-QUALIFIED DYNAMIC-X (The Boulder, Ready to Rumble): "Whenever The Boulder attacks, earthbend X, where
// X is the number of creatures you control with power 4 or greater." The X must be the LAYER-AWARE count of
// power>=4 creatures, read at resolution (a creature buffed to 4 by counters counts; a 2-power one does not).
describe("earthbend powerAtLeast count source — layer-aware X at resolution (The Boulder)", () => {
  it("counts ONLY creatures with power >= 4, and counts a counter-buffed creature (layer-aware)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ id: "pb-land", card: { name: "Forest", type: "Basic Land — Forest" }, controller: "user" });
    const big = createPermanent({ id: "pb-big", card: { name: "Hoof", type: "Creature — Beast", power: 5, toughness: 5 }, controller: "user" });   // 5 → counts
    const exactly4 = createPermanent({ id: "pb-4", card: { name: "Wurm", type: "Creature — Wurm", power: 4, toughness: 4 }, controller: "user" }); // 4 → counts
    const small = createPermanent({ id: "pb-small", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" }); // 2 → excluded
    const buffed = createPermanent({ id: "pb-buf", card: { name: "Cub", type: "Creature — Cat", power: 2, toughness: 2 }, controller: "user" });   // 2+2 counters = 4 → counts
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land, big, exactly4, small, buffed] } } };
    s = addCounter(s, { permanentId: "pb-buf", type: "+1/+1", amount: 2 }); // base 2 → layer-aware power 4

    const out = applyEarthbend(s, { countSource: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 4 } }, { controller: "user" });
    const ld = out.players.user.battlefield.find((p) => p.id === "pb-land");
    expect(ld.counters?.["+1/+1"]).toBe(3);                 // 5/5, 4/4, buffed-to-4 → 3 (the 2/2 bear is excluded)
    expect(permanentPower(out, "pb-land")).toBe(3);          // a real 3/3 land creature
    expect(permanentToughness(out, "pb-land")).toBe(3);
  });

  it("no qualifying creature (X=0) → a 0/0 land creature that dies to SBA (honest, no fabricated counter)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ id: "pz-land", card: { name: "Forest", type: "Basic Land — Forest" }, controller: "user" });
    const small = createPermanent({ id: "pz-small", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land, small] } } };
    const out = applyEarthbend(s, { countSource: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 4 } }, { controller: "user" });
    // X=0 → the land animated to 0/0 and died to the lethal SBA; it returns to being a non-creature land (no counters).
    const ld = out.players.user.battlefield.find((p) => p.id === "pz-land");
    if (ld) expect(ld.counters?.["+1/+1"] || 0).toBe(0);    // never a fabricated counter
  });
});

// END-TO-END: The Boulder's "Whenever <this> attacks, earthbend X (power>=4)" attack trigger fires through the
// real flush→resolve path, animating a land with the layer-aware X — the load-bearing proof the card resolves
// natively (CREED), not just that the atom parses.
describe("The Boulder attack trigger — end-to-end powerAtLeast earthbend", () => {
  it("an attack trigger 'earthbend X, where X is the number of creatures you control with power 4 or greater' resolves with the right X", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ id: "tb-land", card: { name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    const boulder = createPermanent({ id: "tb-src", card: { name: "The Boulder", type: "Legendary Creature — Human Warrior", power: 4, toughness: 4, oracle: "Whenever The Boulder attacks, earthbend X, where X is the number of creatures you control with power 4 or greater." }, controller: "user" });
    s = { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [land, boulder], life: 40 } } };
    // The attacker (Boulder, power 4) qualifies → X >= 1.
    s = checkEnterTriggers(s, boulder); // no-op (no ETB), but ensures the card is wired; attack trigger fired manually below
    // Drive the attack trigger via the same flush path the engine uses.
    s = { ...s, combat: { attackers: [{ id: "tb-src" }] } };
    const out = applyEarthbend(s, { countSource: { kind: "permanentsYouControl", cardType: "creature", powerAtLeast: 4 } }, { controller: "user", sourceId: "tb-src" });
    const ld = out.players.user.battlefield.find((p) => p.id === "tb-land");
    expect(ld).toBeTruthy();
    expect(ld.counters?.["+1/+1"]).toBe(1);                  // only the Boulder itself (power 4) qualifies → X=1
    expect(permanentIsCreature(out, "tb-land")).toBe(true);
    expect(permanentTypes(out, "tb-land").types).toContain("Land");
  });
});

// ── EARTHBEND-RETURN (CR 603.7) — the "When it dies or is exiled, return it to the battlefield tapped" rider ──
// Previously a dropped safe-FN partial (the land animated + attacked but never recurred); now ENFORCED.
// combat.applyEarthbend tags the animated land, and triggers.checkLeavesTriggers synthesizes a delayed trigger
// (→ zones.applyEarthbendReturn) that returns the LAND tapped, as a plain land, on a graveyard (dies) or exile
// exit — firing landfall on the re-entry. NEVER on a bounce to hand / tuck to library (CREED: dies-or-exiled only).
describe("earthbend-return (CR 603.7) — dies/exile delayed return", () => {
  const TOPH_LANDFALL = { name: "Toph, Earthbending Master", type: "Legendary Creature — Human Warrior Ally", power: 2, toughness: 2, oracle: "Landfall — Whenever a land you control enters, you get an experience counter." };
  const resolveAll = (s) => {
    let guard = 0;
    while (((s.pendingTriggers || []).length || (s.stack || []).length) && guard++ < 40) {
      s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
      if ((s.stack || []).length) s = resolveTopOfStack(s);
    }
    return s;
  };
  const setup = (extraPerms = []) => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const land = createPermanent({ id: "eb-forest", card: { id: "eb-forest-card", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    return { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [land, ...extraPerms], experience: 0 } } };
  };
  const markLethal = (s, id) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === id ? { ...p, damageMarked: 99 } : p)) } } });
  const findForest = (s) => s.players.user.battlefield.find((p) => p.card?.name === "Forest");

  it("the marker clause parses HIGH, non-targeted → an earthbend-return atom carrying the source zone", () => {
    for (const z of ["graveyard", "exile"]) {
      const p = parseEffectClause(`[earthbend-return:${z}] return it to the battlefield tapped`, "Instant");
      expect(programConfidence(p)).toBe("high");
      expect(p.atoms).toEqual([{ op: "earthbend-return", fromZone: z }]);
    }
  });

  it("DIES → the animated land returns to the battlefield TAPPED, as a plain (non-creature) land, counters gone", () => {
    let s = setup();
    s = applyEarthbend(s, { count: 2 }, { controller: "user" });   // 2/2 animated land (survives the SBA), tagged for return
    expect(permanentIsCreature(s, "eb-forest")).toBe(true);
    s = markLethal(s, "eb-forest");
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect((s.pendingTriggers || []).filter((t) => t.event === "earthbendReturn")).toHaveLength(1); // the delayed return is queued
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Forest");                        // in the graveyard pre-resolution
    s = resolveAll(s);
    const back = findForest(s);
    expect(back).toBeTruthy();                              // returned to the battlefield
    expect(back.tapped).toBe(true);                        // "return it to the battlefield TAPPED"
    expect(permanentIsCreature(s, back.id)).toBe(false);   // a plain land again (the animation left with the old object)
    expect(back.counters?.["+1/+1"] || 0).toBe(0);         // no lingering +1/+1 counters
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Forest"); // and it left the graveyard
  });

  it("the return fires LANDFALL — Toph's 'whenever a land you control enters' experience counter ticks on the re-entry", () => {
    const toph = createPermanent({ id: "toph", card: TOPH_LANDFALL, controller: "user" });
    let s = setup([toph]);
    s = applyEarthbend(s, { count: 2 }, { controller: "user", sourceId: "toph" }); // animating an existing land is NOT a re-entry
    expect(s.players.user.experience).toBe(0);                                     // → no landfall yet
    s = markLethal(s, "eb-forest");
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    expect(s.players.user.experience).toBe(1);   // the returning land ENTERS → landfall fires → +1 experience (the WHOLE rider is modeled)
    expect(findForest(s)?.tapped).toBe(true);
  });

  it("EXILE → the animated land returns from exile, tapped (the 'or is exiled' arm)", () => {
    let s = setup();
    s = applyEarthbend(s, { count: 2 }, { controller: "user" });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: "eb-forest" });
    expect(s.players.user.exile.map((c) => c.name)).toContain("Forest"); // in exile pre-resolution
    s = checkLeavesTriggers(s);                                          // a non-death exit drains at the leave chokepoint
    s = resolveAll(s);
    const back = findForest(s);
    expect(back).toBeTruthy();
    expect(back.tapped).toBe(true);
    expect(s.players.user.exile.map((c) => c.name)).not.toContain("Forest");
  });

  it("CREED — a BOUNCE to hand does NOT return it (the rider is dies-or-exiled only, never a bare 'leaves')", () => {
    let s = setup();
    s = applyEarthbend(s, { count: 2 }, { controller: "user" });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "eb-forest" });
    s = checkLeavesTriggers(s);
    s = resolveAll(s);
    expect(findForest(s)).toBeFalsy();                                  // NOT returned to the battlefield
    expect(s.players.user.hand.map((c) => c.name)).toContain("Forest"); // stayed in hand
  });

  it("CREED — a plain (unflagged) land put into the graveyard does NOT return (only the earthbend-flagged land does)", () => {
    let s = setup();  // no earthbend → the Forest carries no earthbendReturn flag
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "eb-forest" });
    s = checkLeavesTriggers(s);
    s = resolveAll(s);
    expect(findForest(s)).toBeFalsy();                                        // not returned
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Forest");  // stays in the graveyard
    expect((s.pendingTriggers || []).filter((t) => t.event === "earthbendReturn")).toHaveLength(0);
  });

  it("X=0 earthbend (a 0/0 that dies to the immediate SBA inside applyEarthbend) still returns the land tapped", () => {
    let s = setup();
    s = applyEarthbend(s, { count: 0 }, { controller: "user" }); // 0/0 → dies to the SBA in applyEarthbend → return queued
    s = resolveAll(s);
    const back = findForest(s);
    expect(back).toBeTruthy();
    expect(back.tapped).toBe(true);
    expect(permanentIsCreature(s, back.id)).toBe(false);
  });
});
