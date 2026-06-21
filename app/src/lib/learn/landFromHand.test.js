/**
 * LAND-FROM-HAND (Dex, real-deck-unlock) — "[You may] put a land card from your hand onto the
 * battlefield[ tapped]." (Growth Spiral, Eureka Moment, Broken Bond, Swell of Growth; the activated
 * ramp dorks Sakura-Tribe Scout / Llanowar Scout / Walking Atlas; Gretchen Titchwillow). A
 * controller-scoped optional land drop sourced from the HAND, not the library — modeled by REUSING the
 * tutor pending-choice seam with `sourceZone:"hand"` (applyTutor gathers the hand lands, the driver
 * surfaces the same picker / auto-picks, resolveTutorChoice moves hand→battlefield, NO shuffle). It
 * bypasses the land-per-turn limit (CR — "put", not "play").
 *
 * Growth Spiral ("Draw a card. You may put a land …") is the first printed MULTI-ATOM optional card, so
 * it also exercises the α2 optional-scope guard tightened to a SUFFIX rule: a mandatory-then-optional
 * sequence is HIGH; an optional-then-mandatory ("you may X and Y") stays LOW → Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate, resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt, ct = "Instant") => parseEffectClause(txt, ct)?.atoms;
const isHigh = (txt, ct = "Instant") => programConfidence(parseEffectClause(txt, ct)) === "high";
const PUT = { op: "tutor", sourceZone: "hand", filter: { groups: [["land"]] }, filterLabel: "land card from your hand", destination: "battlefield", entersTapped: false, targetType: null, optional: true };

function stateWith({ hand = [], library = [] }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, library, battlefield: [] } } };
}
const forest = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const bolt = (id) => ({ id, name: "Lightning Bolt", type: "Instant", oracle: "" });

describe("parser — land-from-hand reuses the tutor seam (sourceZone:hand)", () => {
  it("parses '[you may] put a land from your hand onto the battlefield[ tapped]'", () => {
    expect(atomsOf("You may put a land card from your hand onto the battlefield.")).toEqual([PUT]);
    expect(atomsOf("You may put a land card from your hand onto the battlefield tapped.")).toEqual([{ ...PUT, entersTapped: true }]);
    // Growth Spiral: a MANDATORY draw + the OPTIONAL land-from-hand (suffix optional → HIGH).
    expect(parseEffectProgram({ type: "Instant", oracle: "Draw a card. You may put a land card from your hand onto the battlefield.", mana: "", name: "Growth Spiral" }).atoms)
      .toEqual([{ op: "draw", amount: 1, targetType: null }, PUT]);
  });

  it("CREED: optional-then-mandatory stays LOW; library search is untouched", () => {
    // α2 suffix rule — an optional FOLLOWED by a mandatory ("you may X and Y") keeps the ambiguity blocked.
    expect(isHigh("You may draw a card and gain 2 life.")).toBe(false);
    // A LIBRARY search is the RAMP-1 path, not this from-HAND put (it never carries sourceZone:"hand").
    expect(atomsOf("Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.")[0].sourceZone).not.toBe("hand");
  });
});

describe("engine — puts a land from HAND onto the battlefield, library untouched (no shuffle)", () => {
  it("the chosen Forest leaves hand → enters untapped; the spell card in hand + the library are unchanged", () => {
    let st = stateWith({ hand: [forest("f1"), bolt("b1")], library: [forest("lib1")] });
    st = resolveAtom(st, PUT, { controller: "user", targets: [], cardName: "Growth Spiral" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", sourceZone: "hand", destination: "battlefield" });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Forest"]); // only the land is a candidate
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.map((c) => `${c.card.name}:${c.tapped ? "T" : "U"}`)).toEqual(["Forest:U"]);
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]); // land left hand, spell stayed
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Forest"]);      // library untouched, no shuffle
    expect(st.pendingChoice).toBeFalsy();
  });

  it("'you may' DECLINE puts nothing (no land enters, hand keeps the land)", () => {
    let st = stateWith({ hand: [forest("f1")] });
    st = resolveAtom(st, PUT, { controller: "user", targets: [], cardName: "Growth Spiral" });
    st = resolveTutorChoice(st, null); // decline
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.players.user.hand).toHaveLength(1);
    expect(st.pendingChoice).toBeFalsy();
  });

  it("no land in hand → an empty candidate set, a clean no-op (never a fabricated land)", () => {
    let st = stateWith({ hand: [bolt("b1")] });
    st = resolveAtom(st, PUT, { controller: "user", targets: [], cardName: "Growth Spiral" });
    expect(st.pendingChoice.candidates).toEqual([]);
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice)); // auto-pick → null
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.pendingChoice).toBeFalsy();
  });
});

describe("coverage — land-from-hand staples flip native; trigger/replacement variants bounce", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("the spell + activated land-droppers are native; an ETB-trigger variant stays body-only", () => {
    expect(classifyCard(C("Instant", "Draw a card. You may put a land card from your hand onto the battlefield.", "Growth Spiral"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Draw two cards. You may put a land card from your hand onto the battlefield.", "Eureka Moment"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Destroy target artifact or enchantment. You may put a land card from your hand onto the battlefield.", "Broken Bond"))).toBe("native-spell");
    // Activated ramp dork — "{T}: You may put a land …" flips native-activated (the effect is now modeled).
    expect(classifyCard(C("Creature — Elf Scout", "{T}: You may put a land card from your hand onto the battlefield.", "Llanowar Scout"))).toBe("native-activated");
    // ETB land-dropper — the now-modeled non-targeted effect compiles via the trigger compiler (like RAMP-1's
    // Sylvan Ranger ETB tutor) → native-trigger. The trigger-path resolution is verified below.
    expect(classifyCard(C("Creature — Plant", "Reach\nWhen this creature enters, you may put a land card from your hand onto the battlefield tapped.", "Arboreal Grazer"))).toBe("native-trigger");
  });
});

describe("trigger path — an ETB land-dropper (Arboreal Grazer) resolves the put on the trigger path", () => {
  const GRAZER = { name: "Arboreal Grazer", type: "Creature — Plant", power: 0, toughness: 3,
    oracle: "Reach\nWhen this creature enters, you may put a land card from your hand onto the battlefield tapped." };
  it("ETB → a land from hand enters TAPPED (the optional yes/no then the picker, both drained)", () => {
    let s = stateWith({ hand: [forest("f1"), bolt("b1")] });
    s = flushTriggers(enterPermanent(s, GRAZER, "user"));
    while (s.stack.length) s = resolveTopOfStack(s);                          // resolve the ETB trigger
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, true);          // accept "you may"
    if (s.pendingChoice?.kind === "tutor-search") s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice)); // pick the land
    const lands = s.players.user.battlefield.filter((p) => /Land/.test(p.card.type));
    expect(lands.map((c) => `${c.card.name}:${c.tapped ? "T" : "U"}`)).toEqual(["Forest:T"]); // entered tapped
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]);                 // land left hand
    expect(s.pendingChoice).toBeFalsy();
  });
});
