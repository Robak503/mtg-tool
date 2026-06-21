/**
 * DISCOVER engine + Pantlaza trigger (Dex, PANTLAZA lane).
 *
 * Covers: the exile-top-until-nonland-MV<=N resolver, the cast-free/to-hand action-layer decision,
 * Pantlaza's three trigger pieces:
 *   [a] subtype-ETB-self scope ("Whenever Pantlaza or another Dinosaur you control enters")
 *   [b] discover X = that creature's toughness (triggeringPermanentId → layer-resolved toughness)
 *   [c] once-per-turn gate ("Do this only once each turn")
 * All pieces are required for Pantlaza to flip to native-trigger (CREED: model the WHOLE card).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const land = (id, name = "Forest") => ({ id, name, type: "Basic Land — Forest", oracle: "", mana: "" });
const spell = (id, name, mv) => ({ id, name, type: "Instant", oracle: "", mana: `{${mv}}` });
const creature = (id, name, mv) => ({ id, name, type: "Creature — Beast", oracle: "", mana: `{${mv}}` });

function stateWithLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, rngSeed: 12345, players: { ...s.players, user: { ...s.players.user, library: lib, exile: [] } } };
}
const discover = (st, n) => resolveAtom(st, { op: "discover", amount: n, targetType: null }, { controller: "user", targets: [], cardName: "Discoverer" });

describe("discover resolver — exile from top until a nonland with MV <= N", () => {
  it("finds the first nonland with MV<=N; parks it in exile; the rest go to the bottom; cards below stay on top", () => {
    // top→bottom: Forest(land), Bolt(MV1 nonland), Bear(MV2 nonland)
    let st = discover(stateWithLibrary([land("l1"), spell("s1", "Bolt", 1), creature("c1", "Bear", 2)]), 3);
    expect(st.pendingDiscover).toMatchObject({ controller: "user", cardId: "s1", mv: 1 }); // Bolt found (first nonland MV<=3)
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Bolt"]);                     // found card parked in exile
    // Bear (below the found card) stays on top; Forest (exiled, not found) goes to the bottom.
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Bear", "Forest"]);
  });

  it("skips a nonland whose MV is too high, then finds the next eligible nonland", () => {
    let st = discover(stateWithLibrary([creature("big", "Hydra", 5), creature("small", "Bird", 2)]), 3);
    expect(st.pendingDiscover).toMatchObject({ cardId: "small", mv: 2 }); // Hydra MV5 > 3 skipped, Bird MV2 found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Bird"]);
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Hydra"]); // the skipped Hydra → bottom
  });

  it("a whiff (no nonland with MV<=N) sets NO decision and bottoms everything exiled (never fabricates)", () => {
    let st = discover(stateWithLibrary([spell("s1", "Pricey", 5), land("l1")]), 2); // nothing MV<=2 nonland
    expect(st.pendingDiscover).toBeFalsy();
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(2); // both cards back at the bottom, none exiled/cast
  });

  it("lands are never the found card even at high N", () => {
    let st = discover(stateWithLibrary([land("l1"), land("l2"), creature("c1", "Beast", 1)]), 9);
    expect(st.pendingDiscover).toMatchObject({ cardId: "c1" }); // both lands skipped, the creature found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Beast"]);
  });
});

describe("discover decision — the found card is cast FREE or put in hand (action layer)", () => {
  // A state mid-discover: the found card sits in exile + pendingDiscover is set. The decision is resolved
  // via legalChoices → dispatch (reusing the cast machinery: a freeCast cast-spell from exile, or to-hand).
  function midDiscover(found) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, exile: [found], manaPool: { ...s.players.user.manaPool } } },
      pendingDiscover: { controller: "user", cardId: found.id, mv: 2 },
    };
  }

  it("while a discover is pending, ONLY the two decisions are offered (cast-free + to-hand), nothing else", () => {
    const st = midDiscover(creature("f1", "Found Beast", 2));
    const acts = legalActionsForPlayer(st, "user");
    expect(acts.every(a => a.kind === "cast-spell" || a.kind === "discover-to-hand")).toBe(true);
    expect(filterActions(acts, "cast-spell").every(a => a.freeCast && a.fromZone === "exile")).toBe(true); // free, from exile
    expect(acts.some(a => a.kind === "discover-to-hand")).toBe(true);
    expect(legalActionsForPlayer(st, "ai")).toEqual([]); // no one else acts mid-resolution
  });

  it("casting the found creature FREE puts it on the stack with no mana paid → it enters the battlefield", () => {
    let st = midDiscover(creature("f1", "Found Beast", 2));
    const cast = filterActions(legalActionsForPlayer(st, "user"), "cast-spell")[0];
    st = dispatchAction(st, cast);
    expect(st.pendingDiscover).toBeFalsy();                                   // decision resolved
    expect(st.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // no mana paid
    expect(st.players.user.exile).toHaveLength(0);                            // left exile (now on the stack)
    st = resolveTopOfStack(st);                                               // the free-cast creature resolves
    expect(st.players.user.battlefield.some(p => p.card.name === "Found Beast")).toBe(true);
  });

  it("choosing put-in-hand moves the found card to hand and clears the decision (no cast)", () => {
    let st = midDiscover(spell("f1", "Found Bolt", 1));
    const toHand = legalActionsForPlayer(st, "user").find(a => a.kind === "discover-to-hand");
    st = dispatchAction(st, toHand);
    expect(st.pendingDiscover).toBeFalsy();
    expect(st.players.user.hand.map(c => c.name)).toEqual(["Found Bolt"]);
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.stack).toHaveLength(0); // not cast
  });

  it("the AI resolves a pending discover (never stalls): casts a free body, never returns null", () => {
    const st = midDiscover(creature("f1", "Found Beast", 2));
    const picked = pickAction(st, "user", legalActionsForPlayer(st, "user"));
    expect(picked).toBeTruthy();
    expect(["cast-spell", "discover-to-hand"]).toContain(picked.kind);
  });
});

describe("discover — parser + coverage pins", () => {
  const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;
  const isHigh = (txt, ct = "Sorcery") => programConfidence(parseEffectClause(txt, ct)) === "high";
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });

  it("parses the fixed 'Discover N' clause to a discover atom", () => {
    expect(atomsOf("Discover 5.")).toEqual([{ op: "discover", amount: 5, targetType: null }]);
    expect(atomsOf("Discover 3.")).toEqual([{ op: "discover", amount: 3, targetType: null }]);
  });

  it("Primordial Gnawer's dies-trigger 'discover 3' flips native-trigger (the engine resolves it)", () => {
    expect(classifyCard(C("Creature — Rat", "When this creature dies, discover 3.", "Primordial Gnawer"))).toBe("native-trigger");
  });

  it("CREED: count-scaled 'discover X', a discover-not-last sequence, and unmodeled riders stay LOW", () => {
    expect(isHigh("Discover 5. If the discovered card's mana value is less than 5, create a Treasure token.")).toBe(false); // Hit-the-Mother-Lode rider
    expect(isHigh("Discover 3, where X is that spell's mana value.")).toBe(false);                                          // count-scaled X (deferred)
    expect(isHigh("Discover 3. Draw a card.")).toBe(false); // discover-not-last → the decision resolves after the program (reorder guard)
    expect(classifyCard(C("Sorcery", "Up to three target creatures can't block this turn. Discover 4.", "Daring Discovery"))).toBe("arbiter-spell"); // unmodeled lead clause
  });
});

describe("discover X = that creature's toughness (Pantlaza piece [b])", () => {
  const atomsOf = (txt) => parseEffectClause(txt, "Creature — Dinosaur")?.atoms;
  const dinoPerm = (id, t) => ({ id, card: { name: id, type: "Creature — Dinosaur", oracle: "", power: "2", toughness: String(t) }, tapped: false, counters: {} });
  function stateWith(battlefield, library) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, rngSeed: 7, players: { ...s.players, user: { ...s.players.user, battlefield, library, exile: [] } } };
  }

  it("parses 'discover X, where X is that creature's toughness' to the toughness-X discover atom", () => {
    expect(atomsOf("Discover X, where X is that creature's toughness.")).toEqual([{ op: "discover", amountToughnessOfTrigger: true, targetType: null }]);
  });

  it("X = the triggering creature's layer-resolved toughness (read via ctx.triggeringPermanentId)", () => {
    // Triggering Dino has toughness 5 → discover 5 finds the first nonland with MV <= 5.
    let st = stateWith([dinoPerm("dino", 5)], [creature("c6", "MV6", 6), creature("c4", "MV4", 4)]);
    st = resolveAtom(st, { op: "discover", amountToughnessOfTrigger: true, targetType: null }, { controller: "user", triggeringPermanentId: "dino", targets: [] });
    expect(st.pendingDiscover).toMatchObject({ cardId: "c4", mv: 4 }); // MV6 skipped (>5), MV4 found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["MV4"]);
    expect(st.players.user.library.map((c) => c.name)).toEqual(["MV6"]); // skipped card → bottom
  });

  it("a triggering creature that already left the battlefield → X=0, a safe whiff (no fabrication)", () => {
    let st = stateWith([], [creature("c1", "MV1", 1)]);
    st = resolveAtom(st, { op: "discover", amountToughnessOfTrigger: true, targetType: null }, { controller: "user", triggeringPermanentId: "gone", targets: [] });
    expect(st.pendingDiscover).toBeFalsy(); // X=0 → no nonland with MV<=0 → whiff, nothing exiled
    expect(st.players.user.exile).toHaveLength(0);
  });
});

// ─── Pantlaza piece [a] — subtype-ETB-self trigger scope ───────────────────────────────────────

const PANTLAZA_ORACLE = "Whenever Pantlaza, Sun's Vanguard or another Dinosaur you control enters the battlefield, discover X, where X is that creature's toughness. Do this only once each turn.";
const pantlazaCard = { name: "Pantlaza, Sun's Vanguard", type: "Legendary Creature — Dinosaur", oracle: PANTLAZA_ORACLE, mana: "{4}{R}{G}", power: "4", toughness: "4" };
const dinoPerm = (id, t, controller = "user") => ({ id, controller, card: { name: `Dino-${id}`, type: "Creature — Dinosaur", oracle: "", power: "2", toughness: String(t), mana: `{${t}}` }, tapped: false, counters: {} });
const beastPerm = (id, controller = "user") => ({ id, controller, card: { name: `Beast-${id}`, type: "Creature — Beast", oracle: "", power: "2", toughness: "2", mana: "{2}" }, tapped: false, counters: {} });

describe("Pantlaza piece [a] — subtype-ETB-self trigger detection + scope", () => {
  it("detectTriggers extracts one trigger from Pantlaza's oracle with scope subtypeYouControl and subtypeFilter Dinosaur", () => {
    const trigs = detectTriggers(pantlazaCard);
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Dinosaur", whose: "any" });
  });

  it("the trigger's effectClause carries the toughness-discover + once-per-turn rider for the parser", () => {
    const trigs = detectTriggers(pantlazaCard);
    expect(trigs[0].effectClause).toMatch(/discover x, where x is that creature's toughness/i);
    expect(trigs[0].effectClause).toMatch(/do this only once each turn/i);
  });

  it("checkEnterTriggers fires when a Dinosaur you control enters (including Pantlaza itself)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pantPerm = { id: "pant1", controller: "user", card: pantlazaCard, tapped: false, counters: {} };
    const entering = dinoPerm("dino1", 3);
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [pantPerm] } } };
    const after = checkEnterTriggers({ ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [pantPerm, entering] } } }, entering);
    expect(after.pendingTriggers?.length).toBeGreaterThanOrEqual(1);
    expect(after.pendingTriggers.some(t => t.descriptor?.scope === "subtypeYouControl")).toBe(true);
  });

  it("checkEnterTriggers does NOT fire when a non-Dinosaur creature you control enters", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pantPerm = { id: "pant1", controller: "user", card: pantlazaCard, tapped: false, counters: {} };
    const entering = beastPerm("beast1"); // Beast, not a Dinosaur
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [pantPerm, entering] } } };
    const after = checkEnterTriggers(state, entering);
    // No subtypeYouControl trigger fired (Pantlaza doesn't trigger for non-Dinos)
    expect((after.pendingTriggers || []).filter(t => t.descriptor?.scope === "subtypeYouControl")).toHaveLength(0);
  });

  it("Pantlaza self-ETB fires the trigger (it is itself a Dinosaur you control)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pantPerm = { id: "pant1", controller: "user", card: pantlazaCard, tapped: false, counters: {} };
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [pantPerm] } } };
    const after = checkEnterTriggers(state, pantPerm); // Pantlaza itself enters
    expect(after.pendingTriggers?.some(t => t.descriptor?.scope === "subtypeYouControl")).toBe(true);
  });

  it("does NOT fire for an opponent's Dinosaur entering (scope restricted to you control)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pantPerm = { id: "pant1", controller: "user", card: pantlazaCard, tapped: false, counters: {} };
    const oppDino = dinoPerm("d_opp", 3, "ai"); // Dinosaur but controlled by opponent
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [pantPerm] }, ai: { ...s.players.ai, battlefield: [oppDino] } } };
    const after = checkEnterTriggers({ ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: [oppDino] } } }, oppDino);
    expect((after.pendingTriggers || []).filter(t => t.descriptor?.scope === "subtypeYouControl")).toHaveLength(0);
  });
});

// ─── Pantlaza piece [c] — once-per-turn gate ───────────────────────────────────────────────────

describe("Pantlaza piece [c] — once-per-turn gate + full card classification", () => {
  it("parser strips 'Do this only once each turn' and yields HIGH discover atom with oncePerTurn:true", () => {
    const prog = parseEffectClause("Discover X, where X is that creature's toughness. Do this only once each turn.", "Creature — Dinosaur");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0]).toMatchObject({ op: "discover", amountToughnessOfTrigger: true, oncePerTurn: true });
  });

  it("Pantlaza classifies as native-trigger (all three pieces modeled)", () => {
    expect(classifyCard(pantlazaCard)).toBe("native-trigger");
  });

  it("applyDiscoverAtom with oncePerTurn:true skips if the gate is already set for this source", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const gateKey = "src1_discover";
    const locked = { ...s, onceTriggersFiredThisTurn: { [gateKey]: true }, rngSeed: 1,
      players: { ...s.players, user: { ...s.players.user, library: [creature("c1", "MV2", 2)], exile: [] } } };
    const atom = { op: "discover", amount: 5, targetType: null, oncePerTurn: true };
    const after = resolveAtom(locked, atom, { controller: "user", sourceId: "src1", targets: [] });
    expect(after.pendingDiscover).toBeFalsy(); // gate was set → discover suppressed
    expect(after.players.user.library).toHaveLength(1); // library untouched
  });

  it("applyDiscoverAtom with oncePerTurn:true sets the gate and allows the first discover to run", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const fresh = { ...s, rngSeed: 1,
      players: { ...s.players, user: { ...s.players.user, library: [creature("c1", "Bolt", 1)], exile: [] } } };
    const atom = { op: "discover", amount: 5, targetType: null, oncePerTurn: true };
    const after = resolveAtom(fresh, atom, { controller: "user", sourceId: "src1", targets: [] });
    expect(after.pendingDiscover).toMatchObject({ cardId: "c1" }); // first discover ran
    expect(after.onceTriggersFiredThisTurn?.["src1_discover"]).toBe(true); // gate is now set
  });

  it("the once-per-turn gate is cleared at the start of each untap step", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const locked = { ...s, step: "untap", onceTriggersFiredThisTurn: { "src1_discover": true } };
    const after = runStepActions(locked);
    expect(after.onceTriggersFiredThisTurn).toEqual({}); // cleared
  });
});
