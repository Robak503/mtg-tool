/**
 * PUT-FROM-HAND-ONTO-BATTLEFIELD (Cindy / deck-unlocker) — "[you may] put a/up to N/any number of
 * <creature|permanent|artifact|…> card(s) from your hand onto the battlefield[ tapped]" (CR 701 "put onto the
 * battlefield" — a permanent card moved hand → battlefield WITHOUT being cast: no mana, no stack, no cast
 * triggers; ETB fires on entry). Top deck-unblockers: Dramatic Entrance, Last March of the Ents,
 * Ghalta Stampede Tyrant (ETB), Elvish Piper / Quicksilver Amulet ({cost} activated).
 *
 * Built by REUSING the proven tutor seam (the land-from-hand slice already wired `sourceZone:"hand"` +
 * `destination:"battlefield"` + `remaining` multi-pick + `entersTapped`). The new parser
 * (atoms/putFromHand.putFromHandClauseParser) emits `op:"tutor"` atoms with a CREATURE/PERMANENT/typed/colored
 * HAND filter; applyTutor gathers the matching hand cards into a pendingChoice and resolveTutorChoice moves
 * each chosen card hand → battlefield via enterCardFromZone (ETB + landfall + PERM-ENTERS fire). LAND stays on
 * the land-from-hand path. A rider (haste / sacrifice / "becomes") / cast-restriction / subtype / MV filter →
 * low → Arbiter (CREED: whole card or PARK).
 *
 * enterCardFromZone gap CLOSED here too: it now also fires checkPermanentEntersTriggers (artifact-ETB /
 * enchantment-ETB watchers), which the canonical enterPermanent already fired but this non-cast entry path
 * historically skipped — so an artifact card put from hand (and a reanimated / ramped artifact) now triggers
 * "whenever an artifact you control enters".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { putFromHandClauseParser } from "./effects/atoms/putFromHand.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;
const isHigh = (txt, ct = "Sorcery") => programConfidence(parseEffectClause(txt, ct)) === "high";

// The canonical clean put atom (creature, mandatory single).
const PUT_CREATURE = { op: "tutor", sourceZone: "hand", filter: { groups: [["creature"]] }, filterLabel: "creature card from your hand", destination: "battlefield", entersTapped: false, targetType: null };

function stateWith({ hand = [], battlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, battlefield, library: [] } } };
}
const bear = (id, name = "Grizzly Bears", colors = ["G"]) => ({ id, name, type: "Creature — Bear", power: 2, toughness: 2, colors, oracle: "" });
const bolt = (id) => ({ id, name: "Lightning Bolt", type: "Instant", colors: ["R"], oracle: "" });
const artifact = (id, name = "Servo") => ({ id, name, type: "Artifact Creature — Servo", power: 1, toughness: 1, colors: [], oracle: "" });

describe("parser — put-from-hand emits a tutor atom (sourceZone:hand → battlefield)", () => {
  it("parses 'put a creature card from your hand onto the battlefield' (mandatory)", () => {
    expect(atomsOf("Put a creature card from your hand onto the battlefield.")).toEqual([PUT_CREATURE]);
  });

  it("'you may' (α2) stamps optional; ' tapped' sets entersTapped; 'permanent' = an empty (all-type) filter", () => {
    expect(atomsOf("You may put a creature card from your hand onto the battlefield.")).toEqual([{ ...PUT_CREATURE, optional: true }]);
    expect(atomsOf("Put a creature card from your hand onto the battlefield tapped.")).toEqual([{ ...PUT_CREATURE, entersTapped: true }]);
    expect(atomsOf("Put a permanent card from your hand onto the battlefield.")).toEqual([{ ...PUT_CREATURE, filter: { groups: [] }, filterLabel: "permanent card from your hand" }]);
  });

  it("a COLOR filter ('green creature' / 'nonwhite creature') rides filter.colors", () => {
    expect(atomsOf("You may put a green creature card from your hand onto the battlefield.")).toEqual([
      { ...PUT_CREATURE, filter: { groups: [["creature"]], colors: ["green"] }, filterLabel: "green creature card from your hand", optional: true },
    ]);
    expect(atomsOf("Put a nonwhite creature card from your hand onto the battlefield.")[0].filter.colors).toEqual(["nonwhite"]);
  });

  it("COUNT — 'up to N' caps remaining; 'any number of' is hand-bounded (large cap)", () => {
    expect(atomsOf("Put up to two creature cards from your hand onto the battlefield.")).toEqual([{ ...PUT_CREATURE, remaining: 2 }]);
    expect(atomsOf("Put up to three creature cards from your hand onto the battlefield.")[0].remaining).toBe(3);
    expect(atomsOf("Put any number of creature cards from your hand onto the battlefield.")[0].remaining).toBe(99);
  });

  it("CREED — a rider / cast-restriction / subtype / MV / LAND stays LOW (→ Arbiter), never a partial atom", () => {
    // haste + sacrifice rider (Through the Breach / Sneak Attack) — the put alone is modeled, but the
    // trailing clauses aren't, so the whole program stays low (no half-resolved put).
    expect(isHigh("You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice that creature at the beginning of the next end step.", "Instant")).toBe(false);
    // a subtype filter (no "Dragon"-from-hand modeled here) → low, empty atoms (no partial put).
    expect(isHigh("Put a Dragon creature card from your hand onto the battlefield.")).toBe(false);
    expect(atomsOf("Put a Dragon creature card from your hand onto the battlefield.")).toEqual([]);
    // an MV-constrained put (Mind into Matter / Emergency Powers) → low.
    expect(isHigh("Put a permanent card with mana value 7 or less from your hand onto the battlefield.")).toBe(false);
    // LAND is the land-from-hand path's job — this parser must NOT claim it (it emits the SAME atom shape,
    // but via tutorClauseParser's lfh; here we assert this parser declines a land so there's no double-match).
    expect(putFromHandClauseParser("put a land card from your hand onto the battlefield")).toBeNull();
  });
});

describe("engine — the chosen creature LEAVES HAND and ENTERS the battlefield (no mana, no stack)", () => {
  it("only a creature is a candidate; it enters from hand; an instant in hand is untouched", () => {
    let st = stateWith({ hand: [bear("b1"), bolt("x1")] });
    st = resolveAtom(st, PUT_CREATURE, { controller: "user", targets: [], cardName: "Test" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", sourceZone: "hand", destination: "battlefield" });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Grizzly Bears"]); // the instant is filtered out
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.map((p) => p.card.name)).toEqual(["Grizzly Bears"]);
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]); // creature left, instant stayed
    expect(st.players.user.battlefield[0].summoningSick).toBe(true);              // a creature enters summoning-sick
    expect(st.pendingChoice).toBeFalsy();
  });

  it("the put is NOT a cast — no mana is spent (manaPool unchanged) and nothing goes on the stack", () => {
    let st = stateWith({ hand: [bear("b1")] });
    const poolBefore = JSON.stringify(st.players.user.manaPool || {});
    const stackBefore = st.stack.length;
    st = resolveAtom(st, PUT_CREATURE, { controller: "user", targets: [], cardName: "Test" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(JSON.stringify(st.players.user.manaPool || {})).toBe(poolBefore); // no mana paid
    expect(st.stack.length).toBe(stackBefore);                               // never put on the stack
  });

  it("'you may' DECLINE puts nothing (the creature stays in hand)", () => {
    let st = stateWith({ hand: [bear("b1")] });
    st = resolveAtom(st, { ...PUT_CREATURE, optional: true }, { controller: "user", targets: [], cardName: "T" });
    // the optional atom still pauses on the tutor choice (applyTutor ran); decline = pick nothing
    st = resolveTutorChoice(st, null);
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.players.user.hand).toHaveLength(1);
    expect(st.pendingChoice).toBeFalsy();
  });

  it("no matching card in hand → an empty candidate set, a clean no-op (never a fabricated permanent)", () => {
    let st = stateWith({ hand: [bolt("x1")] }); // only an instant — no creature to put
    st = resolveAtom(st, PUT_CREATURE, { controller: "user", targets: [], cardName: "T" });
    expect(st.pendingChoice.candidates).toEqual([]);
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield).toHaveLength(0);
    expect(st.pendingChoice).toBeFalsy();
  });

  it("MULTI 'up to two' puts BOTH creatures from a 3-creature hand (the chain drains), leaving one", () => {
    let st = stateWith({ hand: [bear("b1", "Bear A"), bear("b2", "Bear B"), bear("b3", "Bear C")] });
    st = resolveAtom(st, { ...PUT_CREATURE, remaining: 2 }, { controller: "user", targets: [], cardName: "T" });
    let guard = 0;
    while (st.pendingChoice?.kind === "tutor-search" && guard++ < 10) {
      st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    }
    expect(st.players.user.battlefield).toHaveLength(2);
    expect(st.players.user.hand).toHaveLength(1); // exactly one creature left behind
    expect(st.pendingChoice).toBeFalsy();
  });

  it("'any number' (remaining 99) is HAND-BOUNDED — it puts every creature, never fabricates extras", () => {
    let st = stateWith({ hand: [bear("b1", "A"), bear("b2", "B"), bolt("x1")] });
    st = resolveAtom(st, { ...PUT_CREATURE, remaining: 99 }, { controller: "user", targets: [], cardName: "T" });
    let guard = 0;
    while (st.pendingChoice?.kind === "tutor-search" && guard++ < 200) {
      st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    }
    expect(st.players.user.battlefield.map((p) => p.card.name).sort()).toEqual(["A", "B"]); // both creatures
    expect(st.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]);            // the instant remains
  });

  it("COLOR filter — a 'green creature' put offers ONLY the green creature (a red one is excluded)", () => {
    const red = { id: "r1", name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, colors: ["R"], oracle: "" };
    let st = stateWith({ hand: [red, bear("g1", "Elf", ["G"])] });
    const greenAtom = atomsOf("You may put a green creature card from your hand onto the battlefield.", "Instant")[0];
    st = resolveAtom(st, greenAtom, { controller: "user", targets: [], cardName: "Dramatic Entrance" });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Elf"]); // the red Goblin is filtered out
  });
});

describe("engine — ETB fires on the put (CREED: a genuine enter, not a silent move)", () => {
  it("a creature put from hand fires the 'creature enters' chokepoint (permanent-enters logged)", () => {
    let st = stateWith({ hand: [bear("b1")] });
    st = resolveAtom(st, PUT_CREATURE, { controller: "user", targets: [], cardName: "T" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    const entered = (st.log || []).filter((e) => e.kind === "permanent-enters" && e.cardName === "Grizzly Bears");
    expect(entered).toHaveLength(1);
  });

  it("an ARTIFACT put from hand fires an artifact-ETB watcher (enterCardFromZone gap closed)", () => {
    const watcher = createPermanent({ id: "w1", card: { id: "cw", name: "Fireweaver", type: "Creature — Artificer", oracle: "Whenever an artifact you control enters, this creature deals 1 damage to each opponent.", power: 1, toughness: 1 }, controller: "user" });
    let st = stateWith({ hand: [artifact("a1")], battlefield: [watcher] });
    const artAtom = atomsOf("Put an artifact card from your hand onto the battlefield.")[0];
    st = resolveAtom(st, artAtom, { controller: "user", targets: [], cardName: "T" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    const permEnters = (st.pendingTriggers || []).filter((t) => t.event === "permanentEnters");
    expect(permEnters.length).toBe(1); // the artifact-ETB watcher saw the put artifact
  });
});

describe("coverage — the deck-unblocker staples flip native; riders/special-rules bounce", () => {
  const C = (type, oracle, name, mana = "") => ({ type, oracle, mana, name });
  it("Dramatic Entrance + Last March of the Ents flip native-spell", () => {
    expect(classifyCard(C("Instant", "You may put a green creature card from your hand onto the battlefield.", "Dramatic Entrance", "{3}{G}{G}"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "This spell can't be countered.\nDraw cards equal to the greatest toughness among creatures you control, then put any number of creature cards from your hand onto the battlefield.", "Last March of the Ents", "{6}{G}{G}"))).toBe("native-spell");
  });

  it("Ghalta's ETB put flips native-trigger; the {cost} activated forms flip native-activated", () => {
    expect(classifyCard(C("Legendary Creature — Elder Dinosaur", "Trample\nWhen Ghalta enters, put any number of creature cards from your hand onto the battlefield.", "Ghalta, Stampede Tyrant", "{8}{G}{G}"))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Elf Shaman", "{G}, {T}: You may put a creature card from your hand onto the battlefield.", "Elvish Piper", "{3}{G}"))).toBe("native-activated");
    expect(classifyCard(C("Artifact", "{4}, {T}: You may put a creature card from your hand onto the battlefield.", "Quicksilver Amulet", "{4}"))).toBe("native-activated");
  });

  it("CREED — a haste/sacrifice rider keeps the card on the Arbiter (Through the Breach / Sneak Attack)", () => {
    expect(classifyCard(C("Instant — Arcane", "You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice that creature at the beginning of the next end step.", "Through the Breach", "{4}{R}"))).not.toBe("native-spell");
    // Lure of Prey — a cast restriction (unmodeled) keeps the whole spell off native even though the put is clean.
    expect(classifyCard(C("Instant", "Cast this spell only if an opponent cast a creature spell this turn.\nYou may put a green creature card from your hand onto the battlefield.", "Lure of Prey", "{2}{G}{G}"))).not.toBe("native-spell");
  });
});

describe("trigger path — Ghalta's ETB resolves the put on the trigger flush (any-number creatures enter)", () => {
  const GHALTA = { name: "Ghalta, Stampede Tyrant", type: "Legendary Creature — Elder Dinosaur", power: 12, toughness: 12,
    oracle: "Trample\nWhen Ghalta enters, put any number of creature cards from your hand onto the battlefield." };
  it("ETB → every creature in hand enters from hand (the picker chain drained); non-creatures stay", () => {
    let s = stateWith({ hand: [bear("b1", "A"), bear("b2", "B"), bolt("x1")] });
    s = flushTriggers(enterPermanent(s, GHALTA, "user"));
    while (s.stack.length) s = resolveTopOfStack(s);                         // resolve the ETB trigger onto the put
    let guard = 0;
    while (s.pendingChoice && guard++ < 200) {
      if (s.pendingChoice.kind === "tutor-search") s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
      else break;
    }
    const creatures = s.players.user.battlefield.filter((p) => /Creature/.test(p.card.type) && p.card.name !== "Ghalta, Stampede Tyrant");
    expect(creatures.map((c) => c.card.name).sort()).toEqual(["A", "B"]); // both hand creatures entered
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt"]); // the instant remains in hand
    expect(s.pendingChoice).toBeFalsy();
  });
});
