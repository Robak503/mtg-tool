/**
 * untapCreatureOrLand.test.js — "untap target CREATURE OR LAND [you control]" (SHELF-TAIL SH22 — Thrun's
 * Saryth, the Viper's Fang). The untap clause parser (combat.js) already handled every SINGLE type (creature,
 * artifact, permanent, …); Saryth's activated "{1},{T}: Untap another target creature or land you control" is
 * a UNION. The union targetType `creatureOrLand` already exists (SAC_UNION_CANON + the enumeration), so this is
 * a pure vocabulary widen onto it — same notSource ("another") + controller ("you control") lanes as the
 * single-type arm. Flip +3/0/0: Saryth (native-mixed — anthems + this activated), Civic Gardener + Initiate's
 * Companion (native-trigger — an attack / combat-damage trigger + the unscoped union).
 *
 * Mutation-checked (via Edit): (1) neuter the parser union arm → the untap clause stays LOW → all three cards
 * drop (parse + classify die); (2) neuter the applier's creatureOrLand case → the untap resolves on NEITHER a
 * creature nor a land (the runtime pins die). #2 is a real HOLLOW-GATE this witness caught: the parse flipped
 * the cards native, but the applier's creature-only fallback silently dropped land targets until this fix.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

describe("SH22 — parse + classify", () => {
  it("the union parses to an untap on targetType creatureOrLand, with the 'another' + 'you control' lanes", () => {
    expect(parseEffectClause("untap another target creature or land you control", "Instant").atoms[0])
      .toEqual({ op: "untap", targetType: "creatureOrLand", restrictions: [{ kind: "notSource" }, { kind: "controller", who: "you" }] });
    // the bare (unscoped) union — Civic Gardener / Initiate's Companion
    expect(parseEffectClause("untap target creature or land", "Instant").atoms[0])
      .toEqual({ op: "untap", targetType: "creatureOrLand", restrictions: [] });
  });
  it("Saryth is native-mixed; Civic Gardener + Initiate's Companion are native-trigger", () => {
    expect(classifyCard({ name: "Saryth, the Viper's Fang", type: "Legendary Creature — Snake", power: 2, toughness: 3, mana: "{1}{G}{G}",
      oracle: "Other tapped creatures you control have deathtouch.\nOther untapped creatures you control have hexproof.\n{1}, {T}: Untap another target creature or land you control." })).toBe("native-mixed");
    expect(classifyCard({ name: "Civic Gardener", type: "Creature — Human Citizen", power: 1, toughness: 3, oracle: "Whenever this creature attacks, untap target creature or land." })).toBe("native-trigger");
    expect(classifyCard({ name: "Initiate's Companion", type: "Creature — Cat", power: 2, toughness: 2, oracle: "Whenever this creature deals combat damage to a player, untap target creature or land." })).toBe("native-trigger");
  });
});

describe("SH22 — RUNTIME: the untap resolves on EITHER a creature or a land", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const cre = createPermanent({ id: "cre", card: { name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const land = createPermanent({ id: "land", card: { name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    cre.tapped = true; land.tapped = true;
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [cre, land] } } };
  }
  it("untaps a tapped creature target", () => {
    const s = resolveAtom(board(), { op: "untap", targetType: "creatureOrLand", restrictions: [] }, { controller: "user", targets: [{ type: "creatureOrLand", id: "cre" }] });
    expect(s.players.user.battlefield.find((p) => p.id === "cre").tapped).toBe(false);
  });
  it("untaps a tapped LAND target (the union's whole point)", () => {
    const s = resolveAtom(board(), { op: "untap", targetType: "creatureOrLand", restrictions: [] }, { controller: "user", targets: [{ type: "creatureOrLand", id: "land" }] });
    expect(s.players.user.battlefield.find((p) => p.id === "land").tapped).toBe(false);
  });
});
