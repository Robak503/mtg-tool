/**
 * sliverDeckWave.test.js — the v0.52.0 Sliver-deck coverage wave: three of the deck's body-only/Arbiter
 * cards driven to CREED-clean native, plus pins on the cards that REMAIN Arbiter-domain (whole-card or park).
 *
 *   • Harmonized Crescendo — CONVOKE (cost-only keyword) + "Choose a creature type. Draw a card for each
 *       permanent you control of that type." Convoke changes only the cast COST (the spell ALSO has a printed
 *       {4}{U}{U}); the runtime hard-casts at full cost and resolves the chosen-type count-draw identically, so
 *       stripping the Convoke line (parseHelpers.stripCostOnlyKeywordLines) lets the effect parse HIGH →
 *       native-spell. (Same safe trade as the Ninjutsu/Cycling cost gates.)
 *   • Thrumming Hivepool — AFFINITY for Slivers (cost-only keyword) + "Slivers you control have double strike
 *       and haste." (group keyword grant, native-static) + "At the beginning of your upkeep, create two 1/1
 *       colorless Sliver creature tokens." (upkeep token trigger, routes native). Affinity changes only the
 *       cast cost → strip it → the body is fully modeled → native-mixed.
 *   • Guardian Project — "Whenever a nontoken creature you control enters, if it doesn't have the same name as
 *       another creature you control or a creature card in your graveyard, draw a card." The SAME-NAME ETB
 *       intervening-if (CR 603.4 + 201.2) now evaluates against the entering permanent (interveningIf.js reads
 *       ctx.triggeringPermanentId), so the conditional ETB draw routes natively → native-trigger. Engine-first
 *       (THE CREED): the draw both classifies native AND fires/withholds correctly per the same-name check.
 *
 * PARKED (pinned non-native here with the exact blocker, so a future flip is deliberate, never accidental):
 *   Bident of Thassa (force-attack-opponents activated = goad-class, unmodeled), Damn (Overload modal cast
 *   target→each, unmodeled), Lifecrafter's Bestiary (optional-mana-payment reflexive "you may pay {G}. If you
 *   do, draw" — unmodeled), For the Ancestors (reveal-dig — Arbiter-domain). Ponder / Windfall flip in this wave.
 *   NOTE: Essence / Magma / Lazotep Slivers + Sliver Overlord FLIPPED — subtypeGlobal damage→controller-lifegain /
 *   granted count-scaled subtype pump / afflict-subsystem group grant / gain-control (CR 720) respectively;
 *   positive pins live in the per-card test files (essenceSliver / magmaSliver / afflict / sliverOverlord).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { stripCostOnlyKeywordLines, hasCostOnlyKeywordLine } from "./effects/parseHelpers.js";

beforeEach(() => _resetIdsForTests());

const REMINDER_CONVOKE = "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)";

// ───────────────────────────────────────────────────────────────────────────────
// Harmonized Crescendo — CONVOKE strip + chosen-type count draw
// ───────────────────────────────────────────────────────────────────────────────
describe("Harmonized Crescendo — CONVOKE (cost-only keyword) + chosen-type count draw → native-spell", () => {
  const ORACLE = REMINDER_CONVOKE + "\nChoose a creature type. Draw a card for each permanent you control of that type.";
  const CARD = { name: "Harmonized Crescendo", type: "Instant", mana: "{4}{U}{U}", oracle: ORACLE };

  it("classifies native-spell (the Convoke line is stripped before the effect is parsed)", () => {
    expect(classifyCard(CARD)).toBe("native-spell");
  });

  it("the Convoke line is detected + stripped, leaving only the spell effect", () => {
    expect(hasCostOnlyKeywordLine(ORACLE)).toBe(true);
    expect(stripCostOnlyKeywordLines(ORACLE)).toBe("Choose a creature type. Draw a card for each permanent you control of that type.");
  });

  function drawProbe(battlefield, aiBattlefield = []) {
    const program = parseEffectProgram({ type: "Instant", oracle: "Choose a creature type. Draw a card for each permanent you control of that type.", mana: "{4}{U}{U}" });
    let s = createGameState({ userDeck: Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, type: "Instant", oracle: "" })), aiDeck: [{ name: "A1", type: "Instant", oracle: "" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield, hand: [] }, ai: { ...s.players.ai, battlefield: aiBattlefield } } };
    const before = s.players.user.hand.length;
    const stackObj = { payload: { params: { program, controller: "user", targets: [], sourceId: null } } };
    s = runEffectProgram(s, stackObj);
    return s.players.user.hand.length - before;
  }
  const cp = (id, typeLine, controller = "user") => createPermanent({ id, card: { name: id, type: typeLine, power: 1, toughness: 1, oracle: "" }, controller });

  it("RUNTIME: draws one card per permanent of the optimal (most-populous) chosen type", () => {
    // 3 Slivers + 1 Goblin → choose Sliver → draw 3.
    expect(drawProbe([cp("s1", "Creature — Sliver"), cp("s2", "Creature — Sliver"), cp("s3", "Creature — Sliver"), cp("g1", "Creature — Goblin")])).toBe(3);
  });
  it("CREED: counts only the controller's permanents, not an opponent's chosen-type creatures", () => {
    expect(drawProbe([cp("mine", "Creature — Sliver", "user")], [cp("o1", "Creature — Sliver", "ai"), cp("o2", "Creature — Sliver", "ai")])).toBe(1);
  });
  it("CREED: no creatures → draws 0 (a safe floor, never a fabricated draw)", () => {
    expect(drawProbe([createPermanent({ id: "rock", card: { name: "Sol Ring", type: "Artifact", oracle: "" }, controller: "user" })])).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Thrumming Hivepool — AFFINITY strip + group keyword grant + upkeep token trigger
// ───────────────────────────────────────────────────────────────────────────────
describe("Thrumming Hivepool — AFFINITY (cost-only keyword) + modeled body → native-mixed", () => {
  const ORACLE =
    "Affinity for Slivers (This spell costs {1} less to cast for each Sliver you control.)\n" +
    "Slivers you control have double strike and haste.\n" +
    "At the beginning of your upkeep, create two 1/1 colorless Sliver creature tokens.";
  const CARD = { name: "Thrumming Hivepool", type: "Artifact", mana: "{6}", oracle: ORACLE };

  it("classifies native (the Affinity line is stripped; the group grant + upkeep token trigger are modeled)", () => {
    expect(classifyCard(CARD)).toBe("native-mixed");
  });
  it("the Affinity line is detected + stripped, leaving the modeled body", () => {
    expect(hasCostOnlyKeywordLine(ORACLE)).toBe(true);
    expect(stripCostOnlyKeywordLines(ORACLE)).toBe("Slivers you control have double strike and haste.\nAt the beginning of your upkeep, create two 1/1 colorless Sliver creature tokens.");
  });
  it("CREED: WITHOUT the strip the bare 'Affinity for Slivers' line is unmodeled residue → body-only (proves the strip is load-bearing, not over-claiming)", () => {
    // A hypothetical card whose ONLY text is the affinity line (no modeled body) must NOT be native.
    expect(classifyCard({ name: "X", type: "Artifact", mana: "{6}", oracle: "Affinity for Slivers (This spell costs {1} less to cast for each Sliver you control.)\nUnknown unmodeled rider that does something exotic and untestable." })).toBe("body-only");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Guardian Project — SAME-NAME ETB intervening-if
// ───────────────────────────────────────────────────────────────────────────────
describe("Guardian Project — SAME-NAME ETB intervening-if (CR 603.4 + 201.2) → native-trigger", () => {
  const ORACLE = "Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card.";
  const CARD = { name: "Guardian Project", type: "Enchantment", mana: "{3}{G}", oracle: ORACLE };

  it("classifies native-trigger", () => {
    expect(classifyCard(CARD)).toBe("native-trigger");
  });

  it("the same-name condition is in the modeled intervening-if vocabulary", () => {
    expect(interveningIfParseable("it doesn't have the same name as another creature you control or a creature card in your graveyard")).toBe(true);
  });

  // ── unit: evaluateInterveningIf against a constructed board ──
  const cp = (id, name, controller = "user", type = "Creature — Sliver") => createPermanent({ id, card: { name, type, power: 1, toughness: 1, oracle: "" }, controller });
  function evalSameName({ board = [], gy = [] }) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: board, graveyard: gy } } };
    return evaluateInterveningIf(state, "it doesn't have the same name as another creature you control or a creature card in your graveyard", "user", { triggeringPermanentId: "ent" });
  }
  it("TRUE when the entering creature's name is unique (no dup on field or in graveyard)", () => {
    expect(evalSameName({ board: [cp("ent", "Sliver A")] })).toBe(true);
  });
  it("FALSE when ANOTHER creature you control shares the name (CR 113.7 — 'another' excludes itself)", () => {
    expect(evalSameName({ board: [cp("ent", "Sliver A"), cp("dup", "Sliver A")] })).toBe(false);
  });
  it("FALSE when a creature CARD in your graveyard shares the name", () => {
    expect(evalSameName({ board: [cp("ent", "Sliver A")], gy: [{ name: "Sliver A", type: "Creature — Sliver", oracle: "" }] })).toBe(false);
  });
  it("CREED: a NON-creature card in the graveyard sharing the name does NOT block the draw (condition is 'creature card')", () => {
    expect(evalSameName({ board: [cp("ent", "Sliver A")], gy: [{ name: "Sliver A", type: "Sorcery", oracle: "" }] })).toBe(true);
  });
  it("null (can't confirm) when the entering permanent isn't in context (FN-safe — never fail-open)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(evaluateInterveningIf(s, "it doesn't have the same name as another creature you control or a creature card in your graveyard", "user", null)).toBeNull();
  });

  // ── end-to-end: ETB → flush → resolve, observe the draw ──
  function etbDrawProbe({ boardNames = [], gyNames = [], enteringName = "Sliver A" }) {
    let s = createGameState({ userDeck: [{ id: "lib1", name: "Lib Card", type: "Creature — Bear", oracle: "", power: 1, toughness: 1 }], aiDeck: [] });
    const gp = createPermanent({ id: "gp", card: { id: "cgp", name: "Guardian Project", type: "Enchantment", oracle: ORACLE }, controller: "user" });
    const others = boardNames.map((n, i) => createPermanent({ id: `o${i}`, card: { id: `co${i}`, name: n, type: "Creature — Sliver", oracle: "", power: 1, toughness: 1 }, controller: "user" }));
    const gy = gyNames.map((n, i) => ({ id: `g${i}`, name: n, type: "Creature — Sliver", oracle: "" }));
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [gp, ...others], graveyard: gy, hand: [] } } };
    const before = s.players.user.hand.length;
    s = enterPermanent(s, { id: "ent", name: enteringName, type: "Creature — Sliver", oracle: "", power: 1, toughness: 1 }, "user");
    s = flushTriggers(s);
    let guard = 0; while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
    return s.players.user.hand.length - before;
  }
  it("RUNTIME: a unique creature entering → draws a card", () => {
    expect(etbDrawProbe({ enteringName: "Sliver A" })).toBe(1);
  });
  it("RUNTIME CREED: a creature entering with a same-named board dup → does NOT draw", () => {
    expect(etbDrawProbe({ boardNames: ["Sliver A"], enteringName: "Sliver A" })).toBe(0);
  });
  it("RUNTIME CREED: a creature entering with a same-named graveyard card → does NOT draw", () => {
    expect(etbDrawProbe({ gyNames: ["Sliver A"], enteringName: "Sliver A" })).toBe(0);
  });
  it("RUNTIME: a creature entering with only a DIFFERENT-named board creature → draws a card", () => {
    expect(etbDrawProbe({ boardNames: ["Sliver B"], enteringName: "Sliver A" })).toBe(1);
  });
});

describe("Lifecrafter's Bestiary — OPTIONAL-MANA-PAYMENT (CR 603.7c) → native-trigger", () => {
  // The upkeep scry was already native; modeling the cast-trigger "you may pay {G}. If you do, draw a card."
  // (the optional-mana-payment reflexive) flips the WHOLE Slivers-deck card. Both triggers now route natively.
  const CARD = { name: "Lifecrafter's Bestiary", type: "Artifact", mana: "{3}", oracle: "At the beginning of your upkeep, scry 1.\nWhenever you cast a creature spell, you may pay {G}. If you do, draw a card." };
  it("classifies native-trigger", () => {
    expect(classifyCard(CARD)).toBe("native-trigger");
  });
});

describe("Essence Sliver — GLOBAL SUBTYPE damage → controller-lifegain → native-trigger", () => {
  // "Whenever a Sliver deals damage, its controller gains that much life." A Sliver-wide TRIGGERED grant that
  // reuses the subtypeGlobal + itsController machinery (Synapse/Brood) plus a new "gain that much life"
  // combat-damage-scaled sentinel. Full runtime lifegain proofs (amount scaling, beneficiary, CREED near-misses)
  // live in essenceSliver.test.js; this is the deck-wave classification pin.
  const CARD = { name: "Essence Sliver", type: "Creature — Sliver", mana: "{3}{W}", oracle: "Whenever a Sliver deals damage, its controller gains that much life." };
  it("classifies native-trigger", () => {
    expect(classifyCard(CARD)).toBe("native-trigger");
  });
});

describe("Sliver Overlord — GAIN-CONTROL (CR 720 / 702.10c) → native-activated", () => {
  // The tutor half ("Search your library for a Sliver card …") was already modeled (the shipped Sliver-filtered
  // tutor); modeling the second ability's INDEFINITE control change ("Gain control of target Sliver.") — the new
  // op:"gain-control" atom — flips the WHOLE card. Both activated abilities now route natively. Full runtime +
  // CREED near-miss coverage lives in sliverOverlord.test.js.
  const CARD = { name: "Sliver Overlord", type: "Legendary Creature — Sliver Mutant", mana: "{W}{U}{B}{R}{G}", oracle: "{3}: Search your library for a Sliver card, reveal that card, put it into your hand, then shuffle.\n{3}: Gain control of target Sliver. (This effect lasts indefinitely.)" };
  it("classifies native-activated", () => {
    expect(classifyCard(CARD)).toBe("native-activated");
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// PARKED — pin the Arbiter-domain tail (whole-card or park; a future flip must be deliberate)
// ───────────────────────────────────────────────────────────────────────────────
describe("Slivers PARK pins — these remain non-native until their blocker subsystem ships", () => {
  const cases = [
    // NOTE: Bident of Thassa FLIPPED to native-mixed (FORCE-ATTACK-1, CR 508.1a) — its combat-damage may-draw
    // trigger already routed native; modeling the "{1}{U},{T}: Creatures your opponents control attack this turn
    // if able." activated ability (a turn-scoped attack requirement, enforced in opponentAI.pickAttackPlan) flips
    // the WHOLE card. The positive pin lives in forceAttack.test.js.
    // NOTE: Damn FLIPPED to native-spell (OVERLOAD now in the parser's CAST_KEYWORD_LINE family) — its printed
    // single-target mode ("Destroy target creature. …") is the one the engine casts; the "each" overload rewrite
    // is vacuous for the normal cast. The positive pin lives in warpOverloadCoverage.test.js.
    // NOTE: Lifecrafter's Bestiary FLIPPED to native-trigger (OPTIONAL-MANA-PAYMENT, CR 603.7c) — its upkeep
    // scry was already native; modeling "you may pay {G}. If you do, draw a card." flips the WHOLE card. The
    // positive pin moved to the "Slivers native" block below.
    // NOTE: Essence / Magma / Lazotep Slivers + Sliver Overlord ALL FLIPPED — positive pins live in the
    // dedicated describe blocks above and the per-card test files (essenceSliver / magmaSliver / afflict /
    // sliverOverlord). None remain body-only, so their PARK entries are removed from this cases list.
    ["Ponder", "Sorcery", "{U}", "Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.", "arbiter-spell"], // library reorder
    ["Windfall", "Sorcery", "{2}{U}", "Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.", "arbiter-spell"], // wheel / symmetric draw
    ["For the Ancestors", "Instant", "{2}{G}", "Choose a creature type. Look at the top six cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed cards into your hand. Put the rest on the bottom of your library in a random order.\nFlashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", "arbiter-spell"], // reveal-dig
  ];
  it.each(cases)("%s stays non-native (%s)", (name, type, mana, oracle, expectedTier) => {
    const tier = classifyCard({ name, type, mana, oracle });
    expect(tier).toBe(expectedTier);
  });
});
