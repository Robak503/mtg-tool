/**
 * typeFilteredUntap.test.js — the TYPE-filtered member of the "during each other player's untap step"
 * family: Unwinding Clock #545 (artifacts) · Drumbellower #1940 (creatures) · Prophet of Kruphix
 * (creatures and lands).
 *
 * The family already had two members and both were single-card hooks — seedbornUntap.js ("all
 * permanents") and murkfiendUntap.js ("all green and/or blue creatures"). This third shape is
 * PARAMETERIZED by its type list rather than being a third hard-coded twin: three near-identical modules
 * is exactly how untap-step semantics drift apart, and the stun / becomes-untapped / summoning-sickness
 * handling is the fiddly part that must not fork again.
 *
 * The pins that matter are the ones about what is NOT untapped. A hook that untaps too much is a
 * confident wrong — Unwinding Clock untapping lands is a strictly better card, and the coverage tier
 * cannot see the difference.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseTypeFilteredUntap, applyTypeFilteredUntap } from "./typeFilteredUntap.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLOCK = { id: "c-uc", name: "Unwinding Clock", type: "Artifact", mana: "{4}",
  oracle: "Untap all artifacts you control during each other player's untap step." };
const DRUMBELLOWER = { id: "c-db", name: "Drumbellower", type: "Creature — Elemental", mana: "{4}{G}", power: 3, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nUntap all creatures you control during each other player's untap step." };
const PROPHET = { id: "c-pk", name: "Prophet of Kruphix", type: "Creature — Human Wizard", mana: "{3}{G}{U}", power: 2, toughness: 3,
  oracle: "Untap all creatures and lands you control during each other player's untap step.\nYou may cast creature spells as though they had flash." };
const QUEST = { id: "c-qr", name: "Quest for Renewal", type: "Enchantment", mana: "{2}{G}",
  oracle: "Whenever a creature you control becomes tapped, you may put a quest counter on this enchantment.\nAs long as there are four or more quest counters on this enchantment, untap all creatures you control during each other player's untap step." };

const tapped = (id, card) => createPermanent({ id, card, controller: "ai", summoningSick: false, tapped: true });
const CARDS = {
  bear: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  rock: { id: "c-rock", name: "Sol Ring", type: "Artifact", oracle: "" },
  forest: { id: "c-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" },
};

/** The AI (a non-active seat) controls `watcher` plus one tapped bear, rock and Forest. */
function board(watchers) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      ai: {
        ...s.players.ai,
        battlefield: [
          ...watchers.map((c, i) => createPermanent({ id: `w${i}`, card: c, controller: "ai", summoningSick: false })),
          tapped("bear", CARDS.bear), tapped("rock", CARDS.rock), tapped("forest", CARDS.forest),
        ],
      },
    },
  };
}
/** Only the three PROBE permanents — the watchers themselves enter untapped and would just be noise. */
const untappedIds = (s) => s.players.ai.battlefield
  .filter((p) => ["bear", "rock", "forest"].includes(p.id) && !p.tapped)
  .map((p) => p.id).sort();

describe("the parser — three printed shapes, anchored", () => {
  it("reads each card's type list", () => {
    expect(parseTypeFilteredUntap(CLOCK)).toEqual(["Artifact"]);
    expect(parseTypeFilteredUntap(DRUMBELLOWER)).toEqual(["Creature"]);
    expect(parseTypeFilteredUntap(PROPHET)).toEqual(["Creature", "Land"]);
  });

  it("CREED — a SUBTYPE filter is not claimed (Ohabi Caleria's Archers)", () => {
    expect(parseTypeFilteredUntap({ oracle: "Untap all Archers you control during each other player's untap step." })).toBeNull();
  });

  it("the Seedborn 'all permanents' form is NOT this parser (its own hook owns it)", () => {
    expect(parseTypeFilteredUntap({ oracle: "Untap all permanents you control during each other player's untap step." })).toBeNull();
  });
});

describe("RUNTIME — the filter is the point", () => {
  it("THE LOAD-BEARING ONE — Unwinding Clock untaps the artifact and NOTHING else", () => {
    // Untapping the Forest here would be a strictly better card than the one printed, and the coverage
    // tier reads native either way.
    expect(untappedIds(applyTypeFilteredUntap(board([CLOCK]), "user"))).toEqual(["rock"]);
  });

  it("Drumbellower untaps the creature only", () => {
    expect(untappedIds(applyTypeFilteredUntap(board([DRUMBELLOWER]), "user"))).toEqual(["bear"]);
  });

  it("Prophet of Kruphix untaps creatures AND lands, not artifacts", () => {
    expect(untappedIds(applyTypeFilteredUntap(board([PROPHET]), "user"))).toEqual(["bear", "forest"]);
  });

  it("two different watchers untap the UNION — each static applies independently", () => {
    expect(untappedIds(applyTypeFilteredUntap(board([CLOCK, DRUMBELLOWER]), "user"))).toEqual(["bear", "rock"]);
  });

  it("the ACTIVE player's own board is untouched here (their turn-based untap already ran)", () => {
    const s = board([CLOCK]);
    const active = { ...s, activePlayer: "ai" };
    expect(untappedIds(applyTypeFilteredUntap(active, "ai"))).toEqual([]);
  });

  it("a board with no watcher is returned UNCHANGED (identity, not a rebuild)", () => {
    const s = board([]);
    expect(applyTypeFilteredUntap(s, "user")).toBe(s);
  });

  it("a STUNNED permanent consumes a stun counter instead of untapping (CR 122.1c)", () => {
    const s = board([CLOCK]);
    const stunned = {
      ...s,
      players: { ...s.players, ai: { ...s.players.ai,
        battlefield: s.players.ai.battlefield.map((p) => (p.id === "rock" ? { ...p, counters: { stun: 1 } } : p)) } },
    };
    const after = applyTypeFilteredUntap(stunned, "user");
    const rock = after.players.ai.battlefield.find((p) => p.id === "rock");
    expect(rock.tapped).toBe(true);
    expect(rock.counters.stun).toBe(0);
    expect(after.pendingUntapEvents || []).not.toContainEqual({ id: "rock", controller: "ai" });
  });

  it("real transitions are recorded as becomes-untapped events (Mesmeric Orb)", () => {
    const after = applyTypeFilteredUntap(board([DRUMBELLOWER]), "user");
    expect(after.pendingUntapEvents).toEqual([{ id: "bear", controller: "ai" }]);
  });
});

describe("classification — what flips and what honestly doesn't", () => {
  it("Unwinding Clock, Drumbellower and Prophet of Kruphix flip", () => {
    expect(classifyCard(CLOCK)).toBe("native-static");
    expect(classifyCard(DRUMBELLOWER)).toBe("native-static");   // Flying is keyword-only residue
    expect(classifyCard(PROPHET)).toBe("native-static");        // the flash-cast permission is a modeled static
  });

  it("Quest for Renewal stays PARKED — a counter-gated untap plus an unmodeled trigger", () => {
    expect(classifyCard(QUEST)).toBe("body-only");
  });

  it("REGRESSION PIN — Seedborn Muse and Murkfiend Liege still classify through their own hooks", () => {
    expect(classifyCard({ id: "c-sm", name: "Seedborn Muse", type: "Creature — Spirit", mana: "{3}{G}{G}", power: 2, toughness: 4,
      oracle: "Untap all permanents you control during each other player's untap step." })).toBe("native-static");
    expect(classifyCard({ id: "c-ml", name: "Murkfiend Liege", type: "Creature — Horror", mana: "{2}{G}{G}{U}{U}", power: 4, toughness: 4,
      oracle: "Other green creatures you control get +1/+1.\nOther blue creatures you control get +1/+1.\nUntap all green and/or blue creatures you control during each other player's untap step." })).toBe("native-static");
  });
});
