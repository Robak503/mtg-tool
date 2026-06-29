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
import { resolveTopOfStack, runStepActions, flushTriggers } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { enterPermanent } from "./resolvers.js";
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

  // The discover engine GENERALIZES beyond Pantlaza — these pins lock the whole family's tier so a future
  // change can't silently over-claim (a rider card flipping native) or under-claim (a clean discover dropping).
  it("the discover family classifies correctly across shapes (flip-diff guard)", () => {
    const c3 = (type, oracle, name) => ({ type, oracle, mana: "{3}", name, power: "3", toughness: "3" });
    // CLEAN → native:
    expect(classifyCard(c3("Creature — Dinosaur", "When this creature enters, discover 3.", "Clean ETB"))).toBe("native-trigger");
    expect(classifyCard(c3("Creature — Dinosaur", "When this creature enters, discover 4. Do this only once each turn.", "ETB Once"))).toBe("native-trigger"); // once-per-turn generalizes
    expect(classifyCard(c3("Creature — Dinosaur", "{3}{R}: Discover 5.", "Activated Disc"))).toBe("native-activated"); // activated discover ability
    // RIDERS / unmodeled → never native (no over-claim):
    expect(classifyCard(c3("Sorcery", "Discover 6. If the discovered card's mana value is 6 or greater, create three Treasure tokens.", "Hit the Mother Lode"))).toBe("arbiter-spell");
    expect(classifyCard(c3("Creature — Dinosaur", "When this creature enters, discover 3, then you may cast the card.", "Weird Rider"))).toBe("body-only");
    // CREED: an effect whose resolver does NOT honor the once-per-turn gate must NOT flip native (it would
    // over-fire). `draw` + `gain-life` now DO honor it (COUNTERS-PLACED slice — Terrasymbiosis/EKG), so the
    // guard uses `create-token`, which is NOT in ONCE_PER_TURN_HONORED.
    expect(classifyCard(c3("Enchantment", "At the beginning of your upkeep, create a 1/1 white Soldier creature token. Do this only once each turn.", "Bad Once"))).toBe("body-only");
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

// The EXACT real LCI printed oracle for Pantlaza, Sun-Favored (verified against the bundled Scryfall data).
// Note: self-reference by the SHORT name "Pantlaza" (CR 201.4, the part before the comma), the OPTIONAL
// "you may discover", and the bare "enters". Pinning the real form guards the actual corpus commander —
// an earlier draft modeled a misremembered "Sun's Vanguard" / mandatory-discover variant that did NOT
// match this card (the short-name self-ref went undetected → body-only). Reminder text stripped by the parser.
const PANTLAZA_ORACLE = "Whenever Pantlaza or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn.";
const pantlazaCard = { name: "Pantlaza, Sun-Favored", type: "Legendary Creature — Dinosaur", oracle: PANTLAZA_ORACLE, mana: "{2}{R}{G}{W}", power: "4", toughness: "4" };
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

// ─── SHORT-NAME self-reference (CR 201.4) — the fix that detects Pantlaza's real oracle ─────────
// A legendary card refers to itself by the part of its name before the first comma ("Pantlaza" for
// "Pantlaza, Sun-Favored"). Without this, the real card's self-trigger went UNDETECTED → body-only.
// The fix is GENERAL (corpus flip-diff: +11 legends correctly flip native-trigger, 0 regressions).
describe("short-name self-reference (CR 201.4)", () => {
  const detect = (name, type, oracle) => detectTriggers({ name, type, oracle, mana: "{3}" });

  it("detects a legend's self-trigger templated with its SHORT name (real Pantlaza shape)", () => {
    const t = detect("Pantlaza, Sun-Favored", "Legendary Creature — Dinosaur",
      "Whenever Pantlaza or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn.");
    expect(t.map(x => x.scope)).toContain("subtypeYouControl");
  });

  it("detects a plain short-name self ETB ('When Cao Ren enters, you lose 3 life')", () => {
    const t = detect("Cao Ren, Wei Commander", "Legendary Creature — Human Soldier", "When Cao Ren enters, you lose 3 life.");
    expect(t.some(x => x.event === "etb" && x.scope === "self")).toBe(true);
  });

  it("CREED: a NON-legendary comma-named card gets NO short-name self-ref (avoids common-word over-match)", () => {
    // "Fear" is a keyword + a common word; only legends use the comma-shortname convention, so a
    // non-legendary "Fear, ..." must NOT treat "Fear" as a self-reference.
    const t = detect("Fear, Whatever", "Creature — Horror", "Whenever Fear or another creature you control enters, draw a card.");
    expect(t.filter(x => x.scope === "subtypeYouControl" || x.scope === "self")).toHaveLength(0);
  });

  it("a too-short legend short name (< 3 chars) is not used as a self-ref (guard)", () => {
    // Hypothetical guard case — a 2-char first name can't anchor a self-ref (over-match risk).
    const t = detect("Ix, the Hidden", "Legendary Creature — Horror", "Whenever Ix or another creature you control enters, draw a card.");
    expect(t.filter(x => x.scope === "subtypeYouControl").length).toBe(0);
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

  it("ONCE-PER-TURN — only an HONORED-op effect parses HIGH with the rider; others stay LOW (no over-fire)", () => {
    // The ONCE_PER_TURN_HONORED ops (discover, draw, gain-life) carry a per-source latch their resolver
    // enforces, so they may keep the program HIGH with the rider. `draw` + `gain-life` joined the set for the
    // COUNTERS-PLACED slice (Terrasymbiosis "draw that many cards. Do this only once each turn.", Earth
    // Kingdom General "gain that much life. …") — their atoms honor `oncePerTurn` (gate key `${sourceId}_<op>`).
    expect(programConfidence(parseEffectClause("Draw a card. Do this only once each turn.", "Sorcery"))).toBe("high");
    expect(programConfidence(parseEffectClause("You gain 2 life. Do this only once each turn.", "Sorcery"))).toBe("high");
    // A token effect's resolver does NOT honor the gate → must stay LOW (it would over-fire every turn — a
    // forbidden false positive).
    expect(programConfidence(parseEffectClause("Create a 1/1 white Soldier creature token. Do this only once each turn.", "Sorcery"))).toBe("low");
  });

  it("a fixed 'Discover N. Do this only once each turn.' also flips HIGH with the gate", () => {
    const prog = parseEffectClause("Discover 4. Do this only once each turn.", "Sorcery");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "discover", amount: 4, oncePerTurn: true });
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

// ─── Pantlaza END-TO-END engine sim — the full flow the orders require ─────────────────────────
// Dino enters → trigger fires → discover X = that Dino's toughness → cast-free / to-hand → a 2nd
// Dino entering the SAME turn is blocked by the once-per-turn gate. This drives the LIVE path
// (enterPermanent → checkEnterTriggers → flushTriggers → buildTriggerStack → resolveTopOfStack →
// runEffectProgram → applyDiscoverAtom), proving ctx.triggeringPermanentId threads end-to-end.

describe("Pantlaza — END-TO-END engine sim (the full play-out)", () => {
  function pantlazaState(library) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pantPerm = { id: "pant1", controller: "user", card: pantlazaCard, tapped: false, counters: {}, summoningSick: false, enteredOnTurn: 0, timestamp: 0 };
    return {
      ...s, rngSeed: 99, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [pantPerm], library, exile: [] } },
    };
  }
  // A Dinosaur card to ENTER (toughness drives X). Distinct id/name so enterPermanent mints a fresh perm.
  const dinoCard = (t) => ({ id: `dino-card-${t}`, name: `Raptor ${t}`, type: "Creature — Dinosaur", oracle: "", power: "1", toughness: String(t), mana: `{${t}}` });
  // Resolve the on-stack trigger, then ACCEPT the optional "you may discover" (CR — the real card is
  // optional). resolveTopOfStack runs the effect program; the optional discover atom suspends with a
  // pendingChoice, which resolveOptionalChoice(true) settles → the discover atom runs (parks or gates).
  function resolveTriggerAndDiscover(st) {
    st = resolveTopOfStack(st);
    if (st.pendingChoice?.kind === "optional-effect") st = resolveOptionalChoice(st, true);
    return st;
  }

  it("Dino enters → discover fires with X = its toughness → found card parked for the decision", () => {
    // Library: a creature MV4 on top (discover-able by a toughness-5 Dino), a land, a creature MV2.
    let st = pantlazaState([creature("found", "Stomper", 4), land("l1"), creature("c2", "Bird", 2)]);
    st = enterPermanent(st, dinoCard(5), "user");          // a 5-toughness Dinosaur you control enters
    expect(st.pendingTriggers?.length).toBeGreaterThanOrEqual(1);
    st = flushTriggers(st, {});                             // trigger → stack (effect-program payload)
    expect(st.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    st = resolveTriggerAndDiscover(st);                     // resolve trigger + accept "you may" → discover X=5 runs
    // X=5 → first nonland with MV<=5 is "Stomper" (MV4). It is parked in exile + pendingDiscover.
    expect(st.pendingDiscover).toMatchObject({ controller: "user", cardId: "found", mv: 4 });
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Stomper"]);
    expect(st.onceTriggersFiredThisTurn?.["pant1_discover"]).toBe(true); // gate consumed
  });

  it("the discovered creature is cast FREE → it enters the battlefield (no mana paid)", () => {
    let st = pantlazaState([creature("found", "Free Beast", 3)]);
    st = enterPermanent(st, dinoCard(4), "user");
    st = flushTriggers(st, {});
    st = resolveTriggerAndDiscover(st); // discover X=4 → Free Beast (MV3) parked
    expect(st.pendingDiscover).toMatchObject({ cardId: "found" });
    // Resolve the cast-free decision at the action layer.
    const cast = filterActions(legalActionsForPlayer(st, "user"), "cast-spell")[0];
    expect(cast).toBeTruthy();
    st = dispatchAction(st, cast);
    expect(st.pendingDiscover).toBeFalsy();
    st = resolveTopOfStack(st); // the free-cast creature resolves onto the battlefield
    expect(st.players.user.battlefield.some((p) => p.card.name === "Free Beast")).toBe(true);
  });

  it("a SECOND Dino entering the same turn does NOT discover again (once-per-turn gate)", () => {
    let st = pantlazaState([creature("f1", "First", 2), creature("f2", "Second", 2)]);
    // First Dino: discover fires, parks "First".
    st = enterPermanent(st, dinoCard(3), "user");
    st = flushTriggers(st, {});
    st = resolveTriggerAndDiscover(st);
    expect(st.pendingDiscover).toMatchObject({ cardId: "f1" });
    // Resolve that decision (put in hand) so pendingDiscover clears.
    const toHand = legalActionsForPlayer(st, "user").find((a) => a.kind === "discover-to-hand");
    st = dispatchAction(st, toHand);
    expect(st.pendingDiscover).toBeFalsy();
    // Second Dino SAME turn: the trigger still fires + goes on the stack, the optional may be accepted,
    // but the discover effect is gated off (CR — "do this only once each turn").
    st = enterPermanent(st, dinoCard(3), "user");
    st = flushTriggers(st, {});
    const hadTrigger = st.stack.some((o) => o.kind === "triggered-ability");
    st = resolveTriggerAndDiscover(st);
    expect(hadTrigger).toBe(true);            // the trigger DID fire (gate is on the effect, not the trigger)
    expect(st.pendingDiscover).toBeFalsy();   // but no new discover — gate blocked it
    expect(st.players.user.exile).toHaveLength(0); // nothing exiled the second time
  });

  it("after a new turn (untap clears the gate), a Dino entering discovers again", () => {
    let st = pantlazaState([creature("t1", "TurnOne", 2), creature("t2", "TurnTwo", 2)]);
    st = enterPermanent(st, dinoCard(3), "user");
    st = flushTriggers(st, {});
    st = resolveTriggerAndDiscover(st);
    const toHand = legalActionsForPlayer(st, "user").find((a) => a.kind === "discover-to-hand");
    st = dispatchAction(st, toHand);
    expect(st.onceTriggersFiredThisTurn?.["pant1_discover"]).toBe(true);
    // New turn: the untap step clears the once-per-turn gate.
    st = runStepActions({ ...st, step: "untap" });
    expect(st.onceTriggersFiredThisTurn).toEqual({});
    // A Dino enters on the new turn → discover fires again. "t1" went to hand last turn, so the
    // only library card left is "t2" — finding it proves the gate reopened (not a stale block).
    st = enterPermanent(st, dinoCard(3), "user");
    st = flushTriggers(st, {});
    st = resolveTriggerAndDiscover(st);
    expect(st.pendingDiscover).toMatchObject({ cardId: "t2" }); // discovers again next turn
  });

  it("declining the optional 'you may discover' does nothing (no exile, no decision) but consumes nothing extra", () => {
    let st = pantlazaState([creature("x1", "Decline Me", 2)]);
    st = enterPermanent(st, dinoCard(3), "user");
    st = flushTriggers(st, {});
    st = resolveTopOfStack(st);                       // trigger resolves → optional suspends
    expect(st.pendingChoice?.kind).toBe("optional-effect");
    st = resolveOptionalChoice(st, false);           // DECLINE the discover
    expect(st.pendingDiscover).toBeFalsy();           // no discover happened
    expect(st.players.user.exile).toHaveLength(0);    // nothing exiled
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Decline Me"]); // library untouched
  });
});
