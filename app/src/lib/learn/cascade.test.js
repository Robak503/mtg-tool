/**
 * cascade.test.js — CASCADE (CR 702.85) as a synthesized SELF-CAST keyword trigger (the Storm + Discover
 * precedent fused). "Cascade (When you cast this spell, exile cards from the top of your library until you exile
 * a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the
 * bottom in a random order.)"
 *
 * THE PATH (all reused machinery):
 *   1. detectTriggers synthesizes a selfCast `cascade:true` descriptor off the keyword's canonical reminder
 *      signature (the BUSHIDO/RAMPAGE/STORM keyword→trigger precedent — the real trigger lives in stripped
 *      reminder parens). A GRANT ("the next/first spell you cast … has cascade") and DOUBLE cascade
 *      ("Cascade, cascade") are excluded (CREED — never a partial / fabricated dig).
 *   2. checkCastTriggers' self-cast block fires it ABOVE the spell, threading the cascading spell's mana value
 *      onto context.cascadeSpellMv (snapshotted at cast — the dig stops at a nonland with MV STRICTLY LESS).
 *   3. applyCascadeAtom (the trigger payload) digs the controller's library, parks the found card in
 *      state.pendingCascade, and bottoms the rest in a deterministic-seed random order.
 *   4. The action layer (legalChoices.actionsCascadeDecision) offers a free-cast-from-exile (the EXACT cast
 *      machinery — target/mode/additional-cost enumeration, the stack, cast triggers, AI) OR a decline that
 *      bottoms the found card (CR 702.85a — "the rest"). actionDispatcher clears pendingCascade on either.
 *
 * BUILT (whole-card CREED-clean): Maelstrom Colossus / Shardless Agent / Bloodbraid Elf (keyword-only bodies)
 * and Bituminous Blast / Violent Outburst / Demonic Dread (instant/sorcery cascade whose non-cascade body is a
 * modeled spell). Real oracle text verified vs the bundled local index, verbatim.
 *
 * CREED anti-FP pins: a GRANT (The First Sliver), DOUBLE cascade (Apex Devastator / Maelstrom Wanderer), and a
 * cascade card with an UNMODELED sibling clause (Noise Marine's ETB damage) all stay body-only/Arbiter — the
 * cascade detector flips ONLY a single-cascade card whose whole non-cascade text is modeled.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// The canonical Cascade reminder (CR 702.85a), shared so every pinned card uses the EXACT real text.
const CASC = "(When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)";

// ── helpers ──────────────────────────────────────────────────────────────────────
const land = (id, name = "Forest") => ({ id, name, type: "Basic Land — Forest", oracle: "", mana: "" });
const spell = (id, name, mv) => ({ id, name, type: "Instant", oracle: "", mana: `{${mv}}` });
const creature = (id, name, mv) => ({ id, name, type: "Creature — Beast", oracle: "", mana: `{${mv}}`, power: "2", toughness: "2" });
function stateWithLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, rngSeed: 12345, players: { ...s.players, user: { ...s.players.user, library: lib, exile: [] } } };
}
const cascade = (st, cap) => resolveAtom(st, { op: "cascade", targetType: null }, { controller: "user", targets: [], cascadeSpellMv: cap, cardName: "Cascader" });

// ── detection ──────────────────────────────────────────────────────────────────
describe("CASCADE — detectTriggers synthesizes a selfCast cascade trigger from the keyword", () => {
  it("a card with the Cascade keyword → an event:selfCast descriptor with cascade:true + the synthetic clause", () => {
    const card = { name: "Maelstrom Colossus", type: "Artifact Creature — Golem", mana: "{8}", oracle: `Cascade ${CASC}` };
    const trg = detectTriggers(card);
    expect(trg.length).toBe(1);
    expect(trg[0]).toMatchObject({ event: "selfCast", scope: "self", whose: "you", cascade: true, effectClause: "cascade through your library" });
  });

  it("the synthesized cascade trigger routes natively (HIGH, non-targeted)", () => {
    const card = { name: "X", type: "Creature — Beast", mana: "{5}", oracle: `Cascade ${CASC}` };
    expect(detectTriggers(card).every(triggerRoutesNatively)).toBe(true);
  });

  it("a GRANT ('Sliver spells you cast have cascade') still detects the card's OWN cascade only (no extra)", () => {
    // The First Sliver has its OWN Cascade keyword PLUS a grant; the grant is not a self-cast trigger of this card.
    const card = { name: "The First Sliver", type: "Legendary Creature — Sliver", mana: "{W}{U}{B}{R}{G}",
      oracle: `Cascade ${CASC}\nSliver spells you cast have cascade.` };
    const cascTrigs = detectTriggers(card).filter((d) => d.cascade);
    expect(cascTrigs.length).toBe(1); // only its own cascade, not the grant
  });

  it("DOUBLE cascade ('Cascade, cascade') emits NO cascade descriptor (the multi-dig is deferred)", () => {
    const card = { name: "Maelstrom Wanderer", type: "Legendary Creature — Elemental", mana: "{5}{G}{U}{R}",
      oracle: `Creatures you control have haste.\nCascade, cascade ${CASC.replace("in a random order.", "in a random order. Then do it again.")}` };
    expect(detectTriggers(card).some((d) => d.cascade)).toBe(false);
  });

  it("a card merely NAMED with 'cascade' but without the keyword reminder is NOT a cascade trigger", () => {
    const card = { name: "Cascade Bluffs", type: "Land", mana: "", oracle: "{T}: Add {C}." };
    expect(detectTriggers(card).some((d) => d.cascade)).toBe(false);
  });
});

// ── parser ───────────────────────────────────────────────────────────────────────
describe("CASCADE — the synthetic clause parses to a HIGH non-targeted cascade atom", () => {
  it("'cascade through your library' → { op: cascade } at HIGH confidence", () => {
    const prog = parseEffectClause("cascade through your library", "Instant");
    expect(prog?.atoms).toEqual([{ op: "cascade", targetType: null }]);
    expect(programConfidence(prog)).toBe("high");
  });
  it("an arbitrary clause does NOT parse to a cascade atom (sentinel-anchored)", () => {
    expect(parseEffectClause("draw a card", "Instant")?.atoms?.some((a) => a.op === "cascade")).toBeFalsy();
  });
});

// ── the dig resolver ───────────────────────────────────────────────────────────────
describe("cascade resolver — exile from top until a nonland that COSTS LESS than the spell", () => {
  it("finds the first nonland with MV < cap; parks it; the rest go to the bottom; cards below stay on top", () => {
    // cap 6 (a {6} cascade spell). top→bottom: Forest(land), Bolt(MV1), Bear(MV2).
    const st = cascade(stateWithLibrary([land("l1"), spell("s1", "Bolt", 1), creature("c1", "Bear", 2)]), 6);
    expect(st.pendingCascade).toMatchObject({ controller: "user", cardId: "s1", mv: 1, cap: 6 }); // Bolt found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Bolt"]);                            // parked in exile
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Bear", "Forest"]);                // Bear stays top, Forest bottomed
  });

  it("'costs less' is STRICTLY less — a nonland whose MV EQUALS the spell's MV is skipped", () => {
    const st = cascade(stateWithLibrary([creature("eq", "Equal", 4), creature("lo", "Low", 2)]), 4);
    expect(st.pendingCascade).toMatchObject({ cardId: "lo", mv: 2 }); // MV4 == cap skipped, MV2 found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Low"]);
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Equal"]); // the skipped MV4 → bottom
  });

  it("lands are never the found card even when cheaper", () => {
    const st = cascade(stateWithLibrary([land("l1"), land("l2"), creature("c1", "Beast", 1)]), 5);
    expect(st.pendingCascade).toMatchObject({ cardId: "c1" });
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Beast"]);
  });

  it("a whiff (no nonland cheaper than the spell) sets NO decision and bottoms everything exiled", () => {
    const st = cascade(stateWithLibrary([spell("s1", "Pricey", 5), land("l1")]), 3); // nothing nonland MV<3
    expect(st.pendingCascade).toBeFalsy();
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(2); // both back, none exiled/cast
  });

  it("a 0-MV cascade spell whiffs (nothing can cost less than 0 — CR-correct)", () => {
    const st = cascade(stateWithLibrary([creature("c0", "Free", 0), creature("c1", "One", 1)]), 0);
    expect(st.pendingCascade).toBeFalsy(); // MV0 is not < 0
    expect(st.players.user.exile).toHaveLength(0);
  });

  it("a missing cap (defensive — never the real path) is treated as 0 → a safe whiff, never an uncapped hit", () => {
    const st = resolveAtom(stateWithLibrary([creature("c1", "Beast", 1)]), { op: "cascade", targetType: null }, { controller: "user", targets: [] });
    expect(st.pendingCascade).toBeFalsy();
    expect(st.players.user.exile).toHaveLength(0);
  });
});

// ── the cast-free / decline decision (action layer) ─────────────────────────────────
describe("cascade decision — the found card is cast FREE or declined to the BOTTOM (action layer)", () => {
  function midCascade(found) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, exile: [found], library: [land("lib1")], manaPool: { ...s.players.user.manaPool } } },
      pendingCascade: { controller: "user", cardId: found.id, mv: 2, cap: 4 },
    };
  }

  it("while a cascade is pending, ONLY the two decisions are offered (cast-free-from-exile + decline)", () => {
    const st = midCascade(creature("f1", "Found Beast", 2));
    const acts = legalActionsForPlayer(st, "user");
    expect(acts.every((a) => a.kind === "cast-spell" || a.kind === "cascade-decline")).toBe(true);
    expect(filterActions(acts, "cast-spell").every((a) => a.freeCast && a.fromZone === "exile")).toBe(true);
    expect(acts.some((a) => a.kind === "cascade-decline")).toBe(true);
    expect(legalActionsForPlayer(st, "ai")).toEqual([]); // no one else acts mid-resolution
  });

  it("casting the found creature FREE puts it on the stack with no mana paid → it enters the battlefield", () => {
    let st = midCascade(creature("f1", "Found Beast", 2));
    const cast = filterActions(legalActionsForPlayer(st, "user"), "cast-spell")[0];
    st = dispatchAction(st, cast);
    expect(st.pendingCascade).toBeFalsy();                                            // decision resolved
    expect(st.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // no mana paid
    expect(st.players.user.exile).toHaveLength(0);                                    // left exile (now on the stack)
    st = resolveTopOfStack(st);
    expect(st.players.user.battlefield.some((p) => p.card.name === "Found Beast")).toBe(true);
  });

  it("declining bottoms the found card (NOT to hand — the cascade difference) and clears the decision", () => {
    let st = midCascade(spell("f1", "Found Bolt", 1));
    const decline = legalActionsForPlayer(st, "user").find((a) => a.kind === "cascade-decline");
    st = dispatchAction(st, decline);
    expect(st.pendingCascade).toBeFalsy();
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.players.user.hand).toHaveLength(0);                                 // NOT to hand (unlike discover)
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Forest", "Found Bolt"]); // appended to the BOTTOM
    expect(st.stack).toHaveLength(0);                                             // not cast
  });

  it("the AI resolves a pending cascade (never stalls): casts a free body or declines, never returns null", () => {
    const st = midCascade(creature("f1", "Found Beast", 2));
    const picked = pickAction(st, "user", legalActionsForPlayer(st, "user"));
    expect(picked).toBeTruthy();
    expect(["cast-spell", "cascade-decline"]).toContain(picked.kind);
  });
});

// ── END-TO-END: cast a cascade spell, the trigger fires above it, dig + free-cast ──────
describe("CASCADE — END-TO-END engine sim (cast → trigger above the spell → dig → free-cast)", () => {
  const SHARDLESS = { id: "sa", name: "Shardless Agent", type: "Artifact Creature — Human Rogue", mana: "{1}{G}{U}", power: 2, toughness: 2,
    oracle: `Cascade ${CASC}` };
  function setup(library) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, rngSeed: 7, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [{ ...SHARDLESS }], library, manaPool: { W: 0, U: 5, B: 0, R: 0, G: 5, C: 5 }, exile: [] } },
    };
  }

  it("casting Shardless Agent ({1}{G}{U}, MV3) puts the cascade trigger ABOVE the spell, then digs to a cheaper card", () => {
    let s = setup([land("l1"), creature("hit", "Free Beast", 2), creature("deep", "Deep One", 1)]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sa");
    s = dispatchAction(s, cast);
    // spell + its cascade trigger on the stack; the trigger is ON TOP (resolves first, CR 603.3b).
    expect(s.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    s = resolveTopOfStack(s); // resolve the cascade trigger → dig
    expect(s.pendingCascade).toMatchObject({ controller: "user", cardId: "hit", mv: 2, cap: 3 }); // Free Beast (MV2) < 3
    expect(s.players.user.exile.map((c) => c.name)).toEqual(["Free Beast"]);
  });

  it("the cascaded creature is cast FREE → it enters the battlefield, then Shardless Agent resolves", () => {
    let s = setup([creature("hit", "Free Beast", 2)]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sa");
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s); // cascade dig
    expect(s.pendingCascade).toMatchObject({ cardId: "hit" });
    const free = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")[0];
    s = dispatchAction(s, free);
    expect(s.pendingCascade).toBeFalsy();
    s = resolveTopOfStack(s); // the free Free Beast resolves
    expect(s.players.user.battlefield.some((p) => p.card.name === "Free Beast")).toBe(true);
    s = resolveTopOfStack(s); // Shardless Agent itself resolves
    expect(s.players.user.battlefield.some((p) => p.card.id === "sa")).toBe(true);
  });

  it("declining mid-sim bottoms the found card; Shardless Agent still resolves", () => {
    let s = setup([creature("hit", "Free Beast", 2), land("l1")]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sa");
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s);
    const decline = legalActionsForPlayer(s, "user").find((a) => a.kind === "cascade-decline");
    s = dispatchAction(s, decline);
    expect(s.pendingCascade).toBeFalsy();
    expect(s.players.user.exile).toHaveLength(0);
    expect(s.players.user.library[s.players.user.library.length - 1].name).toBe("Free Beast"); // bottomed
    s = resolveTopOfStack(s); // Shardless Agent resolves
    expect(s.players.user.battlefield.some((p) => p.card.id === "sa")).toBe(true);
  });
});

// ── classification: BUILT cards flip native ──────────────────────────────────────────
describe("CASCADE — built cards classify native (real oracle, verbatim)", () => {
  const NATIVE = {
    "Maelstrom Colossus (keyword-only permanent)": { card: { name: "Maelstrom Colossus", type: "Artifact Creature — Golem", mana: "{8}", power: 6, toughness: 4, oracle: `Cascade ${CASC}` } },
    "Shardless Agent (keyword-only permanent)": { card: { name: "Shardless Agent", type: "Artifact Creature — Human Rogue", mana: "{1}{G}{U}", power: 2, toughness: 2, oracle: `Cascade ${CASC}` } },
    "Bloodbraid Elf (Haste + cascade)": { card: { name: "Bloodbraid Elf", type: "Creature — Elf Berserker", mana: "{2}{R}{G}", power: 3, toughness: 2, oracle: `Haste (This creature can attack and {T} as soon as it comes under your control.)\nCascade ${CASC}` } },
    "Bituminous Blast (cascade + damage spell)": { card: { name: "Bituminous Blast", type: "Instant", mana: "{3}{B}{R}", oracle: `Cascade ${CASC}\nBituminous Blast deals 4 damage to target creature.` } },
    "Violent Outburst (cascade + team pump)": { card: { name: "Violent Outburst", type: "Instant", mana: "{1}{R}{G}", oracle: `Cascade ${CASC}\nCreatures you control get +1/+0 until end of turn.` } },
    "Demonic Dread (cascade + can't-block)": { card: { name: "Demonic Dread", type: "Sorcery", mana: "{1}{B}{R}", oracle: `Cascade ${CASC}\nTarget creature can't block this turn.` } },
  };
  for (const [label, { card }] of Object.entries(NATIVE)) {
    it(`${label} → native`, () => {
      expect(isNativeTier(classifyCard(card))).toBe(true);
    });
  }
});

// ── CREED anti-FP pins: parked cards stay body-only / Arbiter ─────────────────────────
describe("CASCADE — PARKED: a card the cascade slice must NOT flip native", () => {
  const PARKED = {
    // DOUBLE cascade — digs multiple times ("Then do it again" / "Multiple instances … trigger separately").
    "Apex Devastator (Cascade x4)": { name: "Apex Devastator", type: "Creature — Hydra", mana: "{6}{G}{U}{R}{R}", power: 10, toughness: 8,
      oracle: "Cascade, cascade, cascade, cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order. Multiple instances of cascade each trigger separately.)" },
    "Maelstrom Wanderer (Cascade, cascade + haste anthem)": { name: "Maelstrom Wanderer", type: "Legendary Creature — Elemental", mana: "{5}{G}{U}{R}", power: 7, toughness: 5,
      oracle: "Creatures you control have haste.\nCascade, cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order. Then do it again.)" },
    // GRANT — gives cascade to OTHER spells (its own cascade is fine, but the grant is unmodeled residue).
    "The First Sliver (cascade + grant)": { name: "The First Sliver", type: "Legendary Creature — Sliver", mana: "{W}{U}{B}{R}{G}", power: 7, toughness: 7,
      oracle: `Cascade ${CASC}\nSliver spells you cast have cascade.` },
    // UNMODELED sibling clause — cascade + an ETB damage trigger whose amount is a spells-cast count (deferred).
    "Noise Marine (cascade + ETB damage rider)": { name: "Noise Marine", type: "Creature — Astartes Warrior", mana: "{4}{R}", power: 4, toughness: 4,
      oracle: `Cascade ${CASC}\nSonic Blaster — When this creature enters, it deals damage equal to the number of spells you've cast this turn to any target.` },
  };
  for (const [label, card] of Object.entries(PARKED)) {
    it(`${label} stays non-native`, () => {
      expect(isNativeTier(classifyCard(card))).toBe(false);
    });
  }
});
