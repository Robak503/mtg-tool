/**
 * gyToBottom.test.js — BLITZ AR-1: GY-TO-BOTTOM ("put target card from a graveyard on the bottom of its
 * owner's library" — Cogwork Archivist / Jade-Cast Sentinel / Phyrexian Archivist / Junktroller / Reito
 * Lantern class; 14 corpus carriers, probed 2026-07-16). The clause parses to the return-from-graveyard
 * atom with anyGraveyard (the GY-EXILE scope — EVERY player's graveyard) + toLibraryBottom (library append;
 * index 0 is the top), and applyReturnFromGraveyard routes both the removal and the destination library by
 * the TARGET's zone holder (t.controller — "its owner's", the engine's controller-as-owner proxy).
 *
 * INTENT GATE (the reanimate-from-any discipline): the anyGraveyard scope makes atomTargetIntent
 * "ambiguous", so an ETB TRIGGER carrying this clause (Nantuko Tracer / Vessel of Endless Rest) routes to
 * the Arbiter — never a side-blind auto-pick; only the player-driven activated/cast paths run it natively.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, atomTargetIntent, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BOTTOM_CLAUSE = "Put target card from a graveyard on the bottom of its owner's library.";
const ARCHIVIST_ORACLE = "Reach\n{2}, {T}: Put target card from a graveyard on the bottom of its owner's library.";
const COGWORK_ARCHIVIST = { id: "c-cog", name: "Cogwork Archivist", type: "Artifact Creature — Construct", power: 2, toughness: 4, mana: "{6}", oracle: ARCHIVIST_ORACLE };
const JADE_CAST_SENTINEL = { id: "c-jcs", name: "Jade-Cast Sentinel", type: "Artifact Creature — Ape Snake", power: 3, toughness: 3, mana: "{4}", oracle: ARCHIVIST_ORACLE };
const PHYREXIAN_ARCHIVIST = { id: "c-pxa", name: "Phyrexian Archivist", type: "Artifact Creature — Phyrexian Construct", power: 3, toughness: 3, mana: "{6}", oracle: ARCHIVIST_ORACLE };
const JUNKTROLLER = { id: "c-jt", name: "Junktroller", type: "Artifact Creature — Golem", power: 0, toughness: 6, mana: "{4}", oracle: "Defender\n{T}: Put target card from a graveyard on the bottom of its owner's library." };
const NANTUKO_TRACER = { id: "c-nt", name: "Nantuko Tracer", type: "Creature — Insect Druid", power: 2, toughness: 1, mana: "{1}{G}", oracle: "When this creature enters, you may put target card from a graveyard on the bottom of its owner's library." };

const gyCard = (id, name, type = "Creature — Bear") => ({ id, name, type, oracle: "" });
const EXPECTED_ATOM = { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", anyGraveyard: true, toLibraryBottom: true };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}

describe("AR-1 parser — the bottom-return clause is HIGH; every near-miss stays LOW", () => {
  it("parses the anyGraveyard + toLibraryBottom atom", () => {
    const p = parseEffectClause(BOTTOM_CLAUSE, "Artifact");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([EXPECTED_ATOM]);
  });
  it("FN guards: a typed filter / up-to-one count / own-graveyard scope stays LOW (top GRADUATED)", () => {
    const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Artifact"))).toBe("low");
    low("Put target artifact, instant, or sorcery card from a graveyard on the bottom of its owner's library."); // Keeper of the Cadence — typed filter
    low("Put up to one target card from a graveyard on the bottom of its owner's library.");                     // Swiftgear Drake — optional count
    low("Put target card from your graveyard on the bottom of its owner's library.");                            // own-graveyard scope variant (unevidenced)
    // The top-destination form left this list 2026-08-14: Noxious Revival is the evidence ("Put target
    // card from a graveyard on top of its owner's library" — its own arm + witnesses in
    // stepThroughNoxious.test.js). Pinned HIGH here so the two files can't disagree silently.
    expect(programConfidence(parseEffectClause("Put target card from a graveyard on top of its owner's library.", "Artifact"))).toBe("high");
  });
  it("intent is AMBIGUOUS (anyGraveyard — the reanimate-from-any discipline); own-gy returns stay own", () => {
    expect(atomTargetIntent(EXPECTED_ATOM)).toBe("ambiguous");
    expect(atomTargetIntent({ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" })).toBe("own");
  });
});

describe("AR-1 classify — activated carriers flip native-activated; the ambiguous ETB trigger stays body-only", () => {
  it("the {2},{T} carriers + Junktroller's {T} flip native-activated", () => {
    expect(classifyCard(COGWORK_ARCHIVIST)).toBe("native-activated");
    expect(classifyCard(JADE_CAST_SENTINEL)).toBe("native-activated");
    expect(classifyCard(PHYREXIAN_ARCHIVIST)).toBe("native-activated");
    expect(classifyCard(JUNKTROLLER)).toBe("native-activated");
  });
  it("Nantuko Tracer (ETB trigger, any-graveyard target) stays body-only — the flush chooser can't prove a side", () => {
    expect(classifyCard(NANTUKO_TRACER)).toBe("body-only");
  });
});

describe("AR-1 enumeration — every player's graveyard, any card type, tokens excluded", () => {
  it("offers cards from BOTH graveyards, stamped with their zone holder; a token is never offered", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { graveyard: [gyCard("u1", "Bear"), gyCard("u2", "Forest", "Land")] });
    s = withPlayerBits(s, "ai", { graveyard: [gyCard("a1", "Bolt", "Instant"), { ...gyCard("a2", "Tok"), token: true }] });
    const t = enumerateTargets(s, "user", EXPECTED_ATOM);
    expect(t.map((x) => x.id).sort()).toEqual(["a1", "u1", "u2"]);           // any card type, both yards, no token
    expect(t.find((x) => x.id === "a1").controller).toBe("ai");              // zone holder stamped
    expect(t.find((x) => x.id === "u1").controller).toBe("user");
  });
});

describe("AR-1 runtime — the activated ability bottoms the chosen card in ITS OWNER's library", () => {
  function setup() {
    const archivist = createPermanent({ id: "perm-cog", card: COGWORK_ARCHIVIST, controller: "user", summoningSick: false });
    let s = mainState();
    s = withPlayerBits(s, "user", {
      battlefield: [archivist],
      graveyard: [gyCard("u-dead", "Own Bear")],
      library: [gyCard("u-top", "Own Top")],
      manaPool: { ...s.players.user.manaPool, C: 2 },
    });
    s = withPlayerBits(s, "ai", {
      graveyard: [gyCard("a-dead", "Enemy Bear")],
      library: [gyCard("a-top", "Enemy Top"), gyCard("a-mid", "Enemy Mid")],
    });
    return s;
  }

  it("bottoms an OPPONENT's graveyard card into the OPPONENT's library (under their existing cards)", () => {
    let s = setup();
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "perm-cog")
      .find((a) => a.targets?.[0]?.id === "a-dead");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.graveyard.some((c) => c.id === "a-dead")).toBe(false);                   // left the opponent's graveyard
    expect(s.players.ai.library.map((c) => c.id)).toEqual(["a-top", "a-mid", "a-dead"]);          // BOTTOM of the OPPONENT's library (index 0 = top)
    expect(s.players.user.library.map((c) => c.id)).toEqual(["u-top"]);                           // caster's library untouched
    expect(s.players.user.battlefield.find((p) => p.id === "perm-cog").tapped).toBe(true);        // {T} paid
  });

  it("bottoms the caster's OWN graveyard card into the caster's library", () => {
    let s = setup();
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "perm-cog")
      .find((a) => a.targets?.[0]?.id === "u-dead");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.user.graveyard.some((c) => c.id === "u-dead")).toBe(false);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["u-top", "u-dead"]);                 // own library bottom
    expect(s.players.ai.library.map((c) => c.id)).toEqual(["a-top", "a-mid"]);                    // opponent untouched
  });

  it("a target that left its graveyard is a clean no-op (CR 608.2b) — no throw, no library change", () => {
    let s = mainState();
    s = withPlayerBits(s, "ai", { graveyard: [], library: [gyCard("a-top", "Enemy Top")] });
    const after = ATOM_RESOLVERS["return-from-graveyard"](s, EXPECTED_ATOM,
      { controller: "user", targets: [{ type: "graveyardCard", id: "gone", controller: "ai" }] });
    expect(after.players.ai.library.map((c) => c.id)).toEqual(["a-top"]);
    expect(after.players.user.library).toHaveLength(0);
  });
});
