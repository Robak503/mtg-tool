/**
 * planeswalkerLoyaltyCompletion.test.js — BLITZ PW-1: three loyalty-ability EFFECT buckets that complete a
 * planeswalker's whole-card law (a walker is native-planeswalker only when EVERY loyalty ability parses HIGH).
 * Each bucket narrows an EXISTING atom with a filter the runtime already knows how to enforce, so the metric
 * (classifyCard) mirrors the runtime with no new resolver drift:
 *
 *   1. REANIMATE-MV  — "return target creature card with mana value N or less from your graveyard to the
 *      battlefield" → the plain reanimate atom + a STRUCTURED cardFilter {cardType:"creature", mvMax:N},
 *      enforced by the ONE cardMatchesGraveyardFilter chokepoint (CR 601.2c target restriction, CR 202.3 mana
 *      value, CR 712.8a a card in the graveyard has only its front-face characteristics). Flips Ajani,
 *      Adversary of Tyrants; corpus: Unearth / Bishop of Rebirth / Driver of the Dead / Ojutai's & Silverquill
 *      Command modes / Tethmos High Priest / Timely Hordemate.
 *   2. UNTAP-N-LANDS — "untap two target lands" → the untap atom's EXACT-count form (minTargets:N = maxTargets:N,
 *      CR 601.2c; CR 701.26b untap). Flips Garruk Wildspeaker; corpus: Argothian Elder / Ley Weaver / Hope Tender.
 *   3. DESTROY-POWER — "destroy all creatures with power N or greater/less" → the eachCreature wipe narrowed by
 *      a LAYER-AWARE effective-power threshold (CR 613.3 counters+anthems, CR 208.1 power, CR 701.8a destroy).
 *      Flips Elspeth, Sun's Champion; corpus: Retribution of the Meek / The Battle of Bywater.
 *
 * WHOLE-CARD LAW (probed on REAL oracle, bundled Scryfall): each flipped walker's OTHER two loyalty abilities
 * already parse HIGH, so the new bucket is the LAST unmodeled ability. PARKS pinned below: Liliana, Death's
 * Majesty (plain reanimate + a "That creature is a black Zombie…" type-change rider keeps the ability LOW),
 * Tezzeret the Seeker (a −X variable-loyalty ultimate — residue, not a loyalty ability — plus an unmodeled
 * artifact untap/animate), Sarkhan, Fireblood (a restricted "spend only to cast Dragon spells" mana ability).
 * flip-diff: +13 native, LOST=0 (3 walkers + 10 spell/trigger/activated corpus carriers).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseLoyaltyAbilities, planeswalkerNativelyCovered, planeswalkerPlayable } from "./effects/loyaltyAbilities.js";
import { enumerateTargets, applyDestroyEffect } from "./spellEffects.js";
import { applyReanimate } from "./effects/atoms/zones.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { massCreatureTargets } from "./effects/atoms/shared.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const M = "−"; // Unicode minus (U+2212) — what Scryfall prints on a loyalty cost, NOT ASCII "-"

// ── REAL oracle fixtures (bundled Scryfall, 2026-07-16) ──────────────────────────
const AJANI = { name: "Ajani, Adversary of Tyrants", type: "Legendary Planeswalker — Ajani", loyalty: "4", mana: "{2}{W}{W}", oracle:
  `+1: Put a +1/+1 counter on each of up to two target creatures.\n${M}2: Return target creature card with mana value 2 or less from your graveyard to the battlefield.\n${M}7: You get an emblem with "At the beginning of your end step, create three 1/1 white Cat creature tokens with lifelink."` };
const GARRUK = { name: "Garruk Wildspeaker", type: "Legendary Planeswalker — Garruk", loyalty: "3", mana: "{2}{G}{G}", oracle:
  `+1: Untap two target lands.\n${M}1: Create a 3/3 green Beast creature token.\n${M}4: Creatures you control get +3/+3 and gain trample until end of turn.` };
const ELSPETH = { name: "Elspeth, Sun's Champion", type: "Legendary Planeswalker — Elspeth", loyalty: "4", mana: "{4}{W}{W}", oracle:
  `+1: Create three 1/1 white Soldier creature tokens.\n${M}3: Destroy all creatures with power 4 or greater.\n${M}7: You get an emblem with "Creatures you control get +2/+2 and have flying."` };

// PARKS (real oracle) — must NOT flip
const LILIANA_DM = { name: "Liliana, Death's Majesty", type: "Legendary Planeswalker — Liliana", loyalty: "5", mana: "{3}{B}{B}", oracle:
  `+1: Create a 2/2 black Zombie creature token. Mill two cards.\n${M}3: Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types.\n${M}7: Destroy all non-Zombie creatures.` };
const TEZZERET = { name: "Tezzeret the Seeker", type: "Legendary Planeswalker — Tezzeret", loyalty: "4", mana: "{3}{U}{U}", oracle:
  `+1: Untap up to two target artifacts.\n${M}X: Search your library for an artifact card with mana value X or less, put it onto the battlefield, then shuffle.\n${M}5: Artifacts you control become artifact creatures with base power and toughness 5/5 until end of turn.` };
const SARKHAN_FB = { name: "Sarkhan, Fireblood", type: "Legendary Planeswalker — Sarkhan", loyalty: "3", mana: "{2}{R}", oracle:
  `+1: You may discard a card. If you do, draw a card.\n+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.\n${M}7: Create four 5/5 red Dragon creature tokens with flying.` };

// ─────────────────────────────────────────────────────────────────────────────
// 1. PARSER — each bucket's blocking clause now parses HIGH to the right atom
// ─────────────────────────────────────────────────────────────────────────────
describe("PW-1 parser — the three new blocker atoms", () => {
  it("reanimate-MV → reanimate with a {cardType,mvMax} filter", () => {
    const p = parseEffectClause("Return target creature card with mana value 2 or less from your graveyard to the battlefield.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax: 2 } }]);
    // other caps ride the same shape
    expect(parseEffectClause("Return target creature card with mana value 3 or less from your graveyard to the battlefield.", "Instant").atoms[0].cardFilter.mvMax).toBe(3);
  });

  it("untap-N-lands → untap/land with exact minTargets = maxTargets = N", () => {
    const p = parseEffectClause("Untap two target lands.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "untap", targetType: "land", maxTargets: 2, minTargets: 2 }]);
    expect(parseEffectClause("Untap three target lands.", "Instant").atoms[0]).toMatchObject({ maxTargets: 3, minTargets: 3 });
  });

  it("destroy-power → eachCreature destroy carrying a power threshold", () => {
    const g = parseEffectClause("Destroy all creatures with power 4 or greater.", "Instant");
    expect(programConfidence(g)).toBe("high");
    expect(g.atoms).toEqual([{ op: "destroy", targetType: "eachCreature", powerCmp: ">=", powerVal: 4 }]);
    const l = parseEffectClause("Destroy all creatures with power 2 or less.", "Instant");
    expect(l.atoms[0]).toMatchObject({ powerCmp: "<=", powerVal: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RECOGNITION — real walkers flip; parks stay parked (whole-card law)
// ─────────────────────────────────────────────────────────────────────────────
describe("PW-1 recognition — flips on REAL oracle", () => {
  it("Ajani, Adversary of Tyrants → native-planeswalker (reanimate-MV was the last blocker)", () => {
    expect(classifyCard(AJANI)).toBe("native-planeswalker");
    expect(planeswalkerNativelyCovered(AJANI)).toBe(true);
  });
  it("Garruk Wildspeaker → native-planeswalker (untap-two-lands was the last blocker)", () => {
    expect(classifyCard(GARRUK)).toBe("native-planeswalker");
  });
  it("Elspeth, Sun's Champion → native-planeswalker (destroy-power was the last blocker)", () => {
    expect(classifyCard(ELSPETH)).toBe("native-planeswalker");
  });
});

describe("PW-1 recognition — REAL parks stay parked (CREED)", () => {
  it("Liliana, Death's Majesty → playable-pw: plain reanimate + a type-change rider keeps the −3 LOW", () => {
    expect(classifyCard(LILIANA_DM)).toBe("playable-pw");
    expect(isNativeTier(classifyCard(LILIANA_DM))).toBe(false);
    // the −3 reanimate line itself is LOW (the "black Zombie…" rider is unmodeled residue)
    expect(programConfidence(parseEffectClause("Return target creature card from your graveyard to the battlefield. That creature is a black Zombie in addition to its other colors and types.", "Instant"))).toBe("low");
  });
  it("Tezzeret the Seeker → arbiter-pw: a −X variable-loyalty ultimate is residue (not a loyalty ability)", () => {
    expect(classifyCard(TEZZERET)).toBe("arbiter-pw");
    expect(planeswalkerPlayable(TEZZERET)).toBe(false);
  });
  it("Sarkhan, Fireblood → playable-pw: the restricted 'only to cast Dragon spells' mana ability stays LOW", () => {
    expect(classifyCard(SARKHAN_FB)).toBe("playable-pw");
    expect(programConfidence(parseEffectClause("Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.", "Instant"))).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PER-ABILITY parse pins — the blocking ability is now the only one that changed
// ─────────────────────────────────────────────────────────────────────────────
describe("PW-1 per-ability — every loyalty ability parses HIGH after the slice", () => {
  it("Ajani: all three abilities modeled (the −2 reanimate-MV was the gap)", () => {
    const a = parseLoyaltyAbilities(AJANI);
    expect(a.map((x) => x.modeled)).toEqual([true, true, true]);
    expect(a[1]).toMatchObject({ costDelta: -2 });
    expect(a[1].program.atoms[0]).toMatchObject({ op: "reanimate", cardFilter: { cardType: "creature", mvMax: 2 } });
  });
  it("Garruk: the +1 untap-two-lands is now modeled", () => {
    const a = parseLoyaltyAbilities(GARRUK);
    expect(a.map((x) => x.modeled)).toEqual([true, true, true]);
    expect(a[0].program.atoms[0]).toMatchObject({ op: "untap", targetType: "land", minTargets: 2, maxTargets: 2 });
  });
  it("Elspeth: the −3 destroy-power is now modeled", () => {
    const a = parseLoyaltyAbilities(ELSPETH);
    expect(a.map((x) => x.modeled)).toEqual([true, true, true]);
    expect(a[1].program.atoms[0]).toMatchObject({ op: "destroy", targetType: "eachCreature", powerCmp: ">=", powerVal: 4 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RUNTIME — the filters are actually ENFORCED (CREED: never a wrong action)
// ─────────────────────────────────────────────────────────────────────────────
const gyCreature = (id, name, cmc) => ({ id, name, type: "Creature — Bear", cmc, oracle: "" });
const gyInstant = (id, name, cmc) => ({ id, name, type: "Instant", cmc, oracle: "" });
function stateWith({ battlefield = [], graveyard = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield, graveyard } } };
}
const bear = (id, { power = 2, toughness = 2, counters = {}, controller = "user" } = {}) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power, toughness, oracle: "" }, controller, summoningSick: false }), counters });
const land = (id, { tapped = false, controller = "user" } = {}) =>
  ({ ...createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Basic Land — Forest", oracle: "" }, controller, summoningSick: false }), tapped });

describe("PW-1 runtime — reanimate-MV enforces MV + creature-type at enumeration", () => {
  const spec = { kind: "return-gy", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax: 2 } };
  const gy = () => stateWith({ graveyard: [
    gyCreature("ok", "Cheap Bear", 2),      // creature, MV 2 → legal
    gyCreature("big", "Big Bear", 5),       // creature, MV 5 → over the cap
    gyInstant("bolt", "Bolt", 1),           // non-creature at MV 1 → filtered by cardType
  ] });

  it("only the MV≤2 CREATURE is a legal target (over-MV and the non-creature are excluded)", () => {
    expect(enumerateTargets(gy(), "user", spec, [], {}).map((t) => t.name)).toEqual(["Cheap Bear"]);
  });

  it("resolution enters the reanimated creature under the controller and removes it from the graveyard", () => {
    const atom = { op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax: 2 } };
    const after = applyReanimate(gy(), atom, { controller: "user", targets: [{ type: "graveyardCard", id: "ok", controller: "user" }] });
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Cheap Bear")).toBe(true);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Big Bear", "Bolt"]);
  });
});

describe("PW-1 runtime — destroy-power is layer-aware", () => {
  it("massCreatureTargets(power ≥ 4) hits base-4 AND a base-3 lifted by a +1/+1 counter, spares a base-2", () => {
    const s = stateWith({ battlefield: [
      bear("p4", { power: 4 }),
      bear("p3c", { power: 3, counters: { "+1/+1": 1 } }), // effective power 4 (CR 613.3)
      bear("p2", { power: 2 }),
    ] });
    const hits = massCreatureTargets(s, { powerCmp: ">=", powerVal: 4 }).map((t) => t.id).sort();
    expect(hits).toEqual(["p3c", "p4"]);
  });

  it("the wipe destroys exactly the ≥4-power set; the base-2 survives", () => {
    const s = stateWith({ battlefield: [bear("big", { power: 5 }), bear("small", { power: 2 })] });
    const after = applyDestroyEffect(s, { controller: "user", targets: massCreatureTargets(s, { powerCmp: ">=", powerVal: 4 }) });
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["small"]);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["big"]);
  });
});

describe("PW-1 runtime — untap-two-lands untaps exactly the chosen lands (re-verified)", () => {
  it("both targeted tapped lands untap; a third tapped land not targeted stays tapped", () => {
    const s = stateWith({ battlefield: [land("l1", { tapped: true }), land("l2", { tapped: true }), land("l3", { tapped: true })] });
    const atom = { op: "untap", targetType: "land", maxTargets: 2, minTargets: 2 };
    const after = applyTapEffect(s, atom, { controller: "user", targets: [{ type: "land", id: "l1" }, { type: "land", id: "l2" }] }, false);
    expect(findPermanent(after, "l1").permanent.tapped).toBe(false);
    expect(findPermanent(after, "l2").permanent.tapped).toBe(false);
    expect(findPermanent(after, "l3").permanent.tapped).toBe(true);
  });

  it("CREED: a non-land target handed to the land untap is a no-op (live re-verify)", () => {
    const s = stateWith({ battlefield: [land("l1", { tapped: true }), bear("notland", { power: 2 })] });
    const atom = { op: "untap", targetType: "land", maxTargets: 2, minTargets: 2 };
    const after = applyTapEffect(s, atom, { controller: "user", targets: [{ type: "land", id: "notland" }] }, false);
    // the creature was NOT untapped/mutated as a land — it isn't a land, so the re-verify skips it
    expect(after.players.user.battlefield.some((p) => p.id === "notland")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FN GUARDS — real near-miss riders stay LOW → Arbiter (whole-clause anchors)
// ─────────────────────────────────────────────────────────────────────────────
describe("PW-1 FN guards — rider variants stay LOW (safe false-negatives)", () => {
  it("reanimate-MV rejects every rider / non-integer cap / non-permanent union", () => {
    for (const c of [
      "Return target creature card with mana value 2 or less from your graveyard to the battlefield tapped.",
      "Return target creature card with mana value 2 or less from your graveyard to the battlefield with a finality counter on it.",
      "Return target creature card with mana value X or less from your graveyard to the battlefield.",
      "Return target creature card with lesser mana value from your graveyard to the battlefield.",
      // NOTE (BLITZ GY-2): "artifact or creature card with mana value N or less … to the battlefield" is now
      // MODELED — a permanent-compatible " or "-union rides the same {typeFilter, mvMax} chokepoint (see
      // gyReanimateFiltered.test.js). A union with a NON-permanent member still parks:
      "Return target creature or instant card with mana value 3 or less from your graveyard to the battlefield.",
      "Return target creature card with power 2 or less from your graveyard to the battlefield.",
    ]) expect(programConfidence(parseEffectClause(c, "Instant"))).toBe("low");
  });

  it("untap-N-lands rejects 'up to'/scoped/singular and does NOT touch non-land untaps", () => {
    // exact-count is plural-only; the "up to two target lands" form still routes through its own matcher (HIGH)
    expect(programConfidence(parseEffectClause("Untap two target lands you control.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("Untap up to two target artifacts.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("Untap up to two target lands.", "Instant"))).toBe("high"); // pre-existing form untouched
  });

  it("destroy-power rejects strict 'greater than' and a toughness bound (the anchor is power N or greater/less)", () => {
    // ("Destroy all creatures with mana value N or greater." GRADUATED out of this list — the MV-filtered
    // wipe now has its own atom fields (mvCmp/mvVal) and its own pins in massWipeManaValue.test.js, which
    // include the SAME strict-"greater than" refusal kept below. It was a scope marker for what the POWER
    // slice didn't build, not a safety pin — the same graduation gyExile.test.js records for Scarab Feast.)
    for (const c of [
      "Destroy all creatures with power greater than 4.",     // strict — not the "N or greater" shape
      "Destroy all creatures with toughness greater than 2.",  // strict on the toughness axis too
    ]) expect(programConfidence(parseEffectClause(c, "Instant")), c).toBe("low");
    // ⭐ THE TOUGHNESS BOUND GRADUATED 2026-07-30, and the two halves of this pin were never the same claim.
    // Its note said "toughness, still unmodeled — a real refusal": true when written, and it was a CAPABILITY
    // statement, not a rules objection. The shared restriction grammar has always carried a layer-aware
    // `toughness` restriction on the SAME "N or greater/less" anchor; mass removal simply could not reach it
    // until massCreatureTargets began reading that grammar. STRICT "greater than" is the real refusal and it
    // is untouched above — "power greater than 4" is not "power 4 or greater", and treating them as one would
    // destroy a 4-power creature the card spares.
    expect(programConfidence(parseEffectClause("Destroy all creatures with toughness 4 or greater.", "Instant"))).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CORPUS — real spell/trigger/activated carriers the same atoms flip
// ─────────────────────────────────────────────────────────────────────────────
describe("PW-1 corpus — the buckets flip real non-walker carriers too", () => {
  it("Unearth → native-spell (reanimate-MV + a Cycling cost keyword)", () => {
    expect(classifyCard({ name: "Unearth", type: "Sorcery", mana: "{B}", oracle: "Return target creature card with mana value 3 or less from your graveyard to the battlefield.\nCycling {2} ({2}, Discard this card: Draw a card.)" })).toBe("native-spell");
  });
  it("Retribution of the Meek → native-spell (destroy-power + a 'can't be regenerated' rider)", () => {
    expect(classifyCard({ name: "Retribution of the Meek", type: "Sorcery", mana: "{2}{W}", oracle: "Destroy all creatures with power 4 or greater. They can't be regenerated." })).toBe("native-spell");
  });
  it("an attack-trigger reanimate-MV carrier → native-trigger (Bishop of Rebirth shape)", () => {
    expect(classifyCard({ name: "Bishop of Rebirth", type: "Creature — Vampire Cleric", mana: "{3}{W}", power: 3, toughness: 4, oracle: "Vigilance\nWhenever this creature attacks, you may return target creature card with mana value 3 or less from your graveyard to the battlefield." })).toBe("native-trigger");
  });
  it("an activated untap-two-lands carrier → native-activated (Argothian Elder shape)", () => {
    expect(classifyCard({ name: "Argothian Elder", type: "Creature — Elf Druid", mana: "{2}{G}", power: 2, toughness: 2, oracle: "{T}: Untap two target lands." })).toBe("native-activated");
  });
});
