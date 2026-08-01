/**
 * KAMAHL-ANIMATE-YOUCONTROL — the TARGETED "target land YOU CONTROL becomes a N/N … creature" activated
 * ability (Kamahl, Heart of Krosa "{1}{G}: … target land you control becomes a 1/1 Elemental creature with
 * vigilance, indestructible, and haste. It's still a land."; Clan Guildmage; Skarrg Guildmage). This extends
 * the WALT-ANIMATE `anm` matcher (which only accepted the unqualified "target land") with the "you control"
 * qualifier, emitted as a controller:"you" target restriction so the enumerator offers ONLY the controller's
 * own lands — never an opponent's, which would be an illegal target (CR 601.2c). Everything downstream
 * (layer-4 type-ADD + 7b P/T-SET + layer-6 keyword grants, all endOfTurn) is the SAME proven applyAnimateEffect.
 *
 * KW-PARTNER — the same slice credits the bare "Partner" keyword (CR 702.124a) as keyword-only. Partner is a
 * DECKBUILDING keyword fully modeled at the command zone (cmdPartner seats BOTH partners); on the battlefield
 * it is a no-op with no clause to drop. This is what lets Kamahl's WHOLE card (combat-trigger + this activated
 * ability + Partner) read native. "Partner with <name>" was EXACT-anchored out and stayed body-only —
 * ✅ INVERTED 2026-08-01, once its linked ETB tutor (CR 702.124j) was actually built.
 *
 * CREED: only the cleanly-modelable subset flips. An opponent's land is never offered (illegal target); a
 * permanent animate / color-set / un-grantable keyword still routes to the Arbiter; "Partner with itself"
 * (which names no other card) stays non-native.
 */

import { describe, it, expect } from "vitest";
import { parseEffectClause, programConfidence } from "./parser.js";
import { runEffectProgram } from "./runProgram.js";
import { expandCastChoices } from "./targeting.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { createGameState, createPermanent } from "../gameState.js";
import { permanentIsCreature, permanentPower, permanentToughness, permanentHasKeyword, permanentTypes, expireContinuousEffects } from "../layers.js";
import { classifyCard, isKeywordOnly } from "../coverage.js";

// Synthetic cards carrying the REAL oracle text (matching coverage.js's publicCard shape). vitest runs
// without MTG_APP_ROOT, so the on-disk index isn't available; the oracle strings below are copied verbatim
// from the bundled Scryfall data (verified out-of-band against classifyCard(publicCard(lookupCard(name)))).
const card = (name, type, oracle) => ({ name, type, oracle });

const clauseConf = (clause) => programConfidence(parseEffectClause(clause, "Instant"));
const clauseAtom = (clause) => (parseEffectClause(clause, "Instant").atoms || []).find((a) => a.op === "animate");

// A state with an OWN untapped Forest ("MINE") + an OPPONENT'S Forest ("OPP"), both non-creature lands.
function twoLandState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mine = createPermanent({ id: "MINE", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
  const opp = createPermanent({ id: "OPP", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "ai", summoningSick: false });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mine] }, ai: { ...s.players.ai, battlefield: [opp] } } };
}

describe("KAMAHL-ANIMATE-YOUCONTROL — parser (HIGH, controller-restricted)", () => {
  it("Kamahl's ability — '… target land you control becomes a 1/1 Elemental creature with vigilance, indestructible, and haste' → HIGH", () => {
    const clause = "Until end of turn, target land you control becomes a 1/1 Elemental creature with vigilance, indestructible, and haste. It's still a land.";
    expect(clauseConf(clause)).toBe("high");
    expect(clauseAtom(clause)).toEqual({
      op: "animate", targetType: "land", power: 1, toughness: 1, subtypes: ["Elemental"],
      grantKeywords: ["Vigilance", "indestructible", "Haste"], duration: "endOfTurn",
      restrictions: [{ kind: "controller", who: "you" }],
    });
  });

  it("Skarrg Guildmage — no-subtype 'target land you control becomes a 4/4 creature' → HIGH with the restriction", () => {
    const clause = "Target land you control becomes a 4/4 creature until end of turn. It's still a land.";
    expect(clauseConf(clause)).toBe("high");
    expect(clauseAtom(clause)).toMatchObject({ op: "animate", targetType: "land", power: 4, toughness: 4, restrictions: [{ kind: "controller", who: "you" }] });
  });

  it("the UNqualified 'target land' (Animate Land) is UNCHANGED — HIGH with NO restriction (still any land)", () => {
    const clause = "Until end of turn, target land becomes a 3/3 creature that's still a land.";
    const atom = clauseAtom(clause);
    expect(clauseConf(clause)).toBe("high");
    expect(atom.restrictions).toBeUndefined();
  });
});

describe("KAMAHL-ANIMATE-YOUCONTROL — enumeration offers ONLY the controller's own lands", () => {
  it("with a land on each side, only MINE is a legal target — the opponent's land is never offered", () => {
    const state = twoLandState();
    const program = parseEffectClause("Until end of turn, target land you control becomes a 1/1 Elemental creature with vigilance, indestructible, and haste. It's still a land.", "Instant");
    const combos = expandCastChoices(state, "user", program);
    const offered = new Set();
    for (const combo of combos) for (const t of (combo.targets || [])) offered.add(t.id);
    expect([...offered]).toEqual(["MINE"]); // OPP (the opponent's land) is an illegal target — never offered (CREED)
  });
});

describe("KAMAHL-ANIMATE-YOUCONTROL — resolves end-to-end (activation path)", () => {
  it("animates the OWN land into a 1/1 Elemental with vigilance+indestructible+haste, still a land, reverts at cleanup", () => {
    let state = twoLandState();
    const program = parseEffectClause("Until end of turn, target land you control becomes a 1/1 Elemental creature with vigilance, indestructible, and haste. It's still a land.", "Instant");
    const targets = [{ type: "permanent", id: "MINE", controller: "user", atomIndex: 0 }];
    const stackObj = {
      id: "stk-kamahl", kind: "ability", source: { name: "Kamahl, Heart of Krosa", oracle: "" },
      controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets, sourceId: "KAMAHL" } },
    };
    state = runEffectProgram(state, stackObj);

    expect(permanentIsCreature(state, "MINE")).toBe(true);
    expect(permanentPower(state, "MINE")).toBe(1);
    expect(permanentToughness(state, "MINE")).toBe(1);
    expect(permanentHasKeyword(state, "MINE", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(state, "MINE", "Indestructible")).toBe(true);
    expect(permanentHasKeyword(state, "MINE", "Haste")).toBe(true);
    expect(permanentTypes(state, "MINE").subtypes).toContain("Elemental");
    expect(String(state.players.user.battlefield.find((p) => p.id === "MINE").card.type)).toMatch(/Land/); // still a land

    // the opponent's land is untouched (never targeted)
    expect(permanentIsCreature(state, "OPP")).toBe(false);

    state = expireContinuousEffects(state, { atCleanupOfTurn: state.turn });
    expect(permanentIsCreature(state, "MINE")).toBe(false); // reverts at end of turn
  });
});

describe("KAMAHL-ANIMATE-YOUCONTROL — CREED routing (LOW → Arbiter)", () => {
  it("a PERMANENT 'you control' animate (no until-end-of-turn) → LOW", () => {
    expect(clauseConf("Target land you control becomes a 1/1 Elemental creature with haste.")).toBe("low");
  });
  it("a color-SET 'you control' animate ('becomes a green creature') → LOW", () => {
    expect(clauseConf("Until end of turn, target land you control becomes a 3/3 green creature. It's still a land.")).toBe("low");
  });
  it("an un-grantable keyword rider ('you control' + banding) → LOW", () => {
    // (infect graduated to grantable in BLITZ EQ-1; banding remains un-grantable — the CREED guard holds.)
    expect(clauseConf("Until end of turn, target land you control becomes a 1/1 creature with banding. It's still a land.")).toBe("low");
  });
});

describe("KAMAHL — KW-PARTNER keyword-only gating", () => {
  it("the whole INERT pairing family is keyword-only; 'Partner with <name>' alone is NOT", () => {
    // ⚠️ UPDATED 2026-07-28. This asserted that "Friends forever" and "Choose a Background" were NOT
    // keyword-only, on the old comment's claim that they "carry extra unmodeled text". The corpus says
    // otherwise: all 47 pairing lines in the index carry ONLY a reminder ("You can have two commanders if
    // both have this ability." / "You can have a Background as a second commander."), and reminders are
    // stripped before this check. Nothing is being dropped — the engine never reads these to seat anyone,
    // since `commanderCards` comes from the DECK DEFINITION. Keeping the old expectation parked 19
    // "Partner—" cards plus the entire Background and Doctor's-companion cycles.
    expect(isKeywordOnly("Partner", "X")).toBe(true);
    expect(isKeywordOnly("Partner—Character select", "X")).toBe(true);
    expect(isKeywordOnly("Friends forever", "X")).toBe(true);
    expect(isKeywordOnly("Choose a Background", "X")).toBe(true);
    // ✅ INVERTED 2026-08-01. This asserted `isKeywordOnly("Partner with Bruse Tarl") === false`, because its
    // linked ETB tutor (CR 702.124j) was unmodeled and crediting it would have dropped a real effect. That
    // ETB is now BUILT — the named tutor searches the TARGETED player's library (see partnerWith.test.js) —
    // so the line is stripped and the form reads keyword-only. The warrant is different from the inert
    // siblings above and that difference is the thing worth keeping: they are credited for doing NOTHING
    // during play, this one for its ability being IMPLEMENTED.
    expect(isKeywordOnly("Partner with Bruse Tarl", "X")).toBe(true);
    // ⛔ THE ONE THAT STAYS REFUSED, and the successor to the assertion above: "Partner with itself"
    // (Mothers Yamazaki) names no other card and is not modeled. It is also the guard that keeps the
    // bare-"Partner" credit from ever widening to swallow the whole with-form by vacuity.
    expect(isKeywordOnly("Partner with itself", "X")).toBe(false);
  });
});

describe("KAMAHL — full-card classification flips to a native tier (real oracle text)", () => {
  it("Kamahl, Heart of Krosa is native (combat-trigger + land-animate activated + Partner all modeled)", () => {
    const kamahl = card(
      "Kamahl, Heart of Krosa",
      "Legendary Creature — Human Druid",
      "At the beginning of combat on your turn, creatures you control get +3/+3 and gain trample until end of turn.\n" +
        "{1}{G}: Until end of turn, target land you control becomes a 1/1 Elemental creature with vigilance, indestructible, and haste. It's still a land.\n" +
        "Partner (You can have two commanders if both have partner.)",
    );
    expect(classifyCard(kamahl)).toMatch(/^native-/); // native-mixed: trigger + activated + partner keyword
  });

  it("Clan Guildmage + Skarrg Guildmage (sibling 'land you control' animate abilities) are native", () => {
    const clan = card(
      "Clan Guildmage",
      "Creature — Human Shaman",
      "{1}{R}, {T}: Target creature can't block this turn.\n" +
        "{2}{G}, {T}: Target land you control becomes a 4/4 Elemental creature with haste until end of turn. It's still a land.",
    );
    const skarrg = card(
      "Skarrg Guildmage",
      "Creature — Human Shaman",
      "{R}{G}: Creatures you control gain trample until end of turn.\n" +
        "{1}{R}{G}: Target land you control becomes a 4/4 creature until end of turn. It's still a land.",
    );
    expect(classifyCard(clan), "Clan Guildmage").toMatch(/^native-/);
    expect(classifyCard(skarrg), "Skarrg Guildmage").toMatch(/^native-/);
  });

  it("CREED near-miss — the SAME card whose animate is PERMANENT (no until-end-of-turn) stays body-only", () => {
    // Kamahl-shaped, but the land-animate is a permanent animate (unmodeled) → the activated ability is
    // unmodeled → the whole card must NOT flip. Guards against a parse-only over-claim.
    const nearMiss = card(
      "Kamahl (near-miss)",
      "Legendary Creature — Human Druid",
      "At the beginning of combat on your turn, creatures you control get +3/+3 and gain trample until end of turn.\n" +
        "{1}{G}: Target land you control becomes a 1/1 Elemental creature with haste. It's still a land.\n" +
        "Partner (You can have two commanders if both have partner.)",
    );
    expect(classifyCard(nearMiss)).toBe("body-only");
  });
});
