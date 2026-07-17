/**
 * lookTopTake.test.js — BLITZ LK-2: the TOP-CARD TAKE-OR-LEAVE-ON-TOP family.
 *
 * The clean follow-up LK-1 scoped out (see lookAtTopRevealTake.test.js's park note): "Look at the top card of
 * your library. If it's a <quality> card[ of the chosen type], you may reveal it and put it into your hand." —
 * top-1, take-or-leave, and a DECLINED or NON-MATCHING card STAYS ON TOP (no rest / bottom / graveyard
 * disposal). A DISTINCT mechanic from impulse-dig (which bottoms/graveyards the rest): declining is NOT
 * strictly dominated here — the card is simply drawn next turn either way — so it gets its own atom
 * (`look-top-take`) and its own pendingChoice kind ("look-top-take").
 *
 * FLIPS (native):
 *   • Dryad Greenseeker — {T} activated dig (fixed-type: land) → native-activated.
 *   • Herald's Horn — chooser + chosen-type {1}-less cost reducer + this upkeep trigger (chosen-type creature),
 *     the trigger being its LAST blocker → native-mixed (classifyChosenTypeCostReducer, extended to admit ONE
 *     natively-routing look-top-take trigger).
 *   • Domri Rade — a BONUS planeswalker flip: its +1 IS this exact top-card take-or-leave (creature), and it was
 *     the last unmodeled loyalty ability (−2 fight-pair + −7 create-emblem were already modeled) → native-planeswalker.
 *
 * AI POLICY (documented, deterministic — autoPickLookTopTake): ALWAYS TAKE. A matched top card into hand is
 * strict card advantage at zero cost (a net +1 — you still draw a fresh card next); declining only leaves it on
 * top to be drawn anyway, so taking is never worse. A HUMAN keeps a real, non-dominated choice (leave it on top).
 *
 * ZONE HONESTY: a NON-matching top card is looked at PRIVATELY and stays on top UNREVEALED — the atom resolves
 * it INLINE with NO pause and NO candidate surfaced (mirroring impulse-dig's empty-pool inline no-op), so the
 * card the controller looked at is NEVER placed on pendingChoice and can never leak to an opponent.
 *
 * PARKED (SAFE false-negatives, documented):
 *   • Frost Augur — its EFFECT models natively (look-top-take, snow), but its `{S}` SNOW-MANA activation cost is
 *     a separate unmodeled mechanic (costModeled:false), so the whole card stays body-only. A clean snow-mana slice.
 *   • Every decline-DISPOSAL variant (Vivien's Grizzly bottoms, Archghoul / Cabaretti / Gathering Stone /
 *     Traveling Botanist / Sarinth Steelseeker / Territory Culler graveyard/bottom the declined card) — a
 *     DIFFERENT mechanic (an explicit alternate zone). The $-anchored matcher rejects the "If you don't put …"
 *     tail; those stay Arbiter/body-only.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyLookTopTakeAtom } from "./effects/atoms/library.js";
import { autoPickLookTopTake, resolveLookTopTakeChoice } from "./effects/runProgram.js";

// ── REAL oracle (verified via cardIndex.lookupCard during authoring — carried inline per house style) ──
const DRYAD_GREENSEEKER = { name: "Dryad Greenseeker", type: "Creature — Dryad", oracle: "{T}: Look at the top card of your library. If it's a land card, you may reveal it and put it into your hand." };
const HERALDS_HORN = { name: "Herald's Horn", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand." };
const DOMRI_RADE = { name: "Domri Rade", type: "Legendary Planeswalker — Domri", oracle: "+1: Look at the top card of your library. If it's a creature card, you may reveal it and put it into your hand.\n−2: Target creature you control fights another target creature.\n−7: You get an emblem with \"Creatures you control have double strike, trample, hexproof, and haste.\"", loyalty: "3" };

// ── PARK guards (must STAY parked — SAFE false-negatives) ──
const FROST_AUGUR = { name: "Frost Augur", type: "Snow Creature — Human Wizard", oracle: "{S}, {T}: Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)" };
const VIVIENS_GRIZZLY = { name: "Vivien's Grizzly", type: "Creature — Bear Spirit", oracle: "{3}{G}: Look at the top card of your library. If it's a creature or planeswalker card, you may reveal it and put it into your hand. If you don't put the card into your hand, put it on the bottom of your library." };
const ARCHGHOUL = { name: "Archghoul of Thraben", type: "Creature — Zombie Cleric", oracle: "Whenever this creature or another Zombie you control dies, look at the top card of your library. If it's a Zombie card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard." };
const CABARETTI = { name: "Cabaretti Ascendancy", type: "Enchantment", oracle: "At the beginning of your upkeep, look at the top card of your library. If it's a creature or planeswalker card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it on the bottom of your library." };
const GATHERING_STONE = { name: "Gathering Stone", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nSpells you cast of the chosen type cost {1} less to cast.\nWhen this artifact enters and at the beginning of your upkeep, look at the top card of your library. If it's a card of the chosen type, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard." };
const TRAVELING_BOTANIST = { name: "Traveling Botanist", type: "Creature — Dog Scout", oracle: "Whenever this creature becomes tapped, look at the top card of your library. If it's a land card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard." };

describe("LK-2 recognition — the take-or-leave-on-top carriers flip native", () => {
  it("Dryad Greenseeker ({T} activated, fixed-type land) → native-activated", () => {
    expect(classifyCard(DRYAD_GREENSEEKER)).toBe("native-activated");
  });
  it("Herald's Horn (chooser + chosen-type reducer + upkeep look trigger) → native-mixed", () => {
    expect(classifyCard(HERALDS_HORN)).toBe("native-mixed");
  });
  it("Domri Rade (+1 look-top-take was its last loyalty gap) → native-planeswalker", () => {
    expect(classifyCard(DOMRI_RADE)).toBe("native-planeswalker");
  });
});

describe("LK-2 parser — the look-top-take atom emission", () => {
  it("fixed-type: 'If it's a land card, you may reveal it and put it into your hand' → look-top-take (land)", () => {
    const p = parseEffectClause("Look at the top card of your library. If it's a land card, you may reveal it and put it into your hand.", "Creature", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "look-top-take", filter: { groups: [["land"]] }, filterLabel: "land card" }]);
  });
  it("snow supertype quality parses (the whole-effect model; Frost Augur parks on {S}, not the effect)", () => {
    const p = parseEffectClause("Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand.", "Creature", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "look-top-take", filter: { groups: [["snow"]] }, filterLabel: "snow card" });
  });
  it("chosen-type qualifier → filter.chosenTypeOfSource (Herald's Horn's upkeep look)", () => {
    const p = parseEffectClause("look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand", "Artifact", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "look-top-take", filter: { groups: [["creature"]], chosenTypeOfSource: true }, filterLabel: "creature card of the chosen type" });
  });
  it("Frost Augur's trailing reminder text is stripped before the $-anchor (still matches)", () => {
    const p = parseEffectClause("Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)", "Creature", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].op).toBe("look-top-take");
  });
  it("a decline-DISPOSAL tail defeats the $-anchor → NOT look-top-take (LOW → Arbiter)", () => {
    // Vivien's Grizzly / Cabaretti shape — "If you don't put the card into your hand, put it on the bottom …"
    const p = parseEffectClause("Look at the top card of your library. If it's a creature card, you may reveal it and put it into your hand. If you don't put the card into your hand, put it on the bottom of your library.", "Creature", { hasX: false });
    expect(programConfidence(p)).not.toBe("high");
    expect((p?.atoms || []).some((a) => a.op === "look-top-take")).toBe(false);
  });
});

// The CREED runtime gate: the metric claims native, so the resolver must actually play it. Unit-drive
// applyLookTopTakeAtom + resolveLookTopTakeChoice against a crafted state.
describe("LK-2 runtime — take / leave / non-match, on the controller's OWN library", () => {
  const CREATURE = { id: "c1", name: "Grizzly Bears", type: "Creature — Bear" };
  const LAND = { id: "l1", name: "Forest", type: "Basic Land — Forest" };
  const INSTANT = { id: "i1", name: "Lightning Bolt", type: "Instant" };
  const mkState = (library, extra = {}) => ({
    players: { user: { library, hand: [], battlefield: [{ id: "SRC", card: { name: "Dryad Greenseeker" }, ...extra }] } },
    log: [],
  });
  const landAtom = { op: "look-top-take", filter: { groups: [["land"]] }, filterLabel: "land card" };
  const ctx = { controller: "user", sourceId: "SRC", cardName: "Dryad Greenseeker" };

  it("MATCH → pauses on a look-top-take choice offering exactly the matched top card (its OWN library)", () => {
    const paused = applyLookTopTakeAtom(mkState([LAND, CREATURE]), landAtom, ctx);
    expect(paused.pendingChoice).toMatchObject({ kind: "look-top-take", controller: "user", restTo: "top" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["l1"]);
  });
  it("MATCH → TAKE puts the top card into HAND (autoPickLookTopTake always takes — the AI policy)", () => {
    const paused = applyLookTopTakeAtom(mkState([LAND, CREATURE]), landAtom, ctx);
    const taken = autoPickLookTopTake(paused, paused.pendingChoice);
    expect(taken).toBe("l1"); // AI always takes
    const after = resolveLookTopTakeChoice(paused, taken);
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["l1"]);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["c1"]); // the rest of the library, top card removed
  });
  it("MATCH → LEAVE (cardId null) keeps the card ON TOP — no zone change (the DEFINING non-dominated trait)", () => {
    const paused = applyLookTopTakeAtom(mkState([LAND, CREATURE]), landAtom, ctx);
    const after = resolveLookTopTakeChoice(paused, null);
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["l1", "c1"]); // Forest STILL on top
  });
  it("NON-MATCH → the top card can't be taken and stays ON TOP: NO pause, NO candidate surfaced (zone honesty)", () => {
    const after = applyLookTopTakeAtom(mkState([INSTANT, LAND]), landAtom, ctx);
    expect(after.pendingChoice).toBeUndefined(); // never surfaced — opponent can't learn the looked-at card
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["i1", "l1"]); // untouched
  });
  it("EMPTY library → a clean logged no-op (nothing to look at)", () => {
    const after = applyLookTopTakeAtom(mkState([]), landAtom, ctx);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.library).toHaveLength(0);
  });

  // Chosen-type (Herald's Horn) — the atom reads the SOURCE permanent's stored chosenType via ctx.sourceId.
  const chosenAtom = { op: "look-top-take", filter: { groups: [["creature"]], chosenTypeOfSource: true }, filterLabel: "creature card of the chosen type" };
  const ELF = { id: "e1", name: "Llanowar Elves", type: "Creature — Elf Druid" };
  const GOBLIN = { id: "g1", name: "Goblin Guide", type: "Creature — Goblin Scout" };
  it("CHOSEN-TYPE: the top card must be BOTH a creature AND the chosen type (perm.chosenType) to be takeable", () => {
    const st = { players: { user: { library: [ELF, GOBLIN], hand: [], battlefield: [{ id: "SRC", chosenType: "Elf", card: { name: "Herald's Horn" } }] } }, log: [] };
    const paused = applyLookTopTakeAtom(st, chosenAtom, { controller: "user", sourceId: "SRC", cardName: "Herald's Horn" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["e1"]); // the Elf is offered
  });
  it("CHOSEN-TYPE: a top card of the WRONG chosen type → no take, stays on top (no pause)", () => {
    const st = { players: { user: { library: [GOBLIN, ELF], hand: [], battlefield: [{ id: "SRC", chosenType: "Elf", card: { name: "Herald's Horn" } }] } }, log: [] };
    const after = applyLookTopTakeAtom(st, chosenAtom, { controller: "user", sourceId: "SRC", cardName: "Herald's Horn" });
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.library.map((c) => c.id)).toEqual(["g1", "e1"]); // Goblin stays on top
  });
  it("CHOSEN-TYPE: an UNSET chosenType (malformed source) matches nothing → SAFE no-op, never a fabricated keep", () => {
    const st = { players: { user: { library: [ELF], hand: [], battlefield: [{ id: "SRC", card: { name: "Herald's Horn" } }] } }, log: [] };
    const after = applyLookTopTakeAtom(st, chosenAtom, { controller: "user", sourceId: "SRC", cardName: "Herald's Horn" });
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.hand).toHaveLength(0);
  });
});

describe("LK-2 FN guards — near-miss carriers STAY parked (false-negative SAFE, false-positive FORBIDDEN)", () => {
  it("Frost Augur — the EFFECT is native, but the {S} snow-mana activation cost is unmodeled → body-only", () => {
    expect(classifyCard(FROST_AUGUR)).toBe("body-only");
  });
  it("a decline-to-BOTTOM tail (Vivien's Grizzly) is a different mechanic → body-only (parked)", () => {
    expect(classifyCard(VIVIENS_GRIZZLY)).toBe("body-only");
  });
  it("decline-to-GRAVEYARD tails (Archghoul / Cabaretti / Traveling Botanist) stay parked", () => {
    expect(classifyCard(ARCHGHOUL)).toBe("body-only");
    expect(classifyCard(CABARETTI)).toBe("body-only");
    expect(classifyCard(TRAVELING_BOTANIST)).toBe("body-only");
  });
  it("Gathering Stone — a chosen-type reducer + a decline-to-graveyard look trigger (NOT this template) → body-only", () => {
    // Same chooser + reducer shape as Herald, but its look trigger has a decline-disposal tail (fails
    // triggerRoutesNatively) AND a compound "When … and at the beginning …" event — so classifyChosenTypeCostReducer
    // must NOT credit it. The reducer still applies at runtime; only the flip is withheld.
    expect(classifyCard(GATHERING_STONE)).toBe("body-only");
  });
});
