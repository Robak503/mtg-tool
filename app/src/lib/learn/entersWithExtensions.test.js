/**
 * ENTERS-WITH EXTENSIONS (BLITZ EW-1; CR 614.1c + 122.6a) — three enters-with-counter families beyond the
 * bare +1/+1 trunk, each metric⇄runtime lockstepped (parser = the single source both the resolver and the
 * coverage strip read):
 *
 *   1. NAMED counter kinds ("~ enters with three charge counters on it" — Trigon of Rage; oil / javelin /
 *      brick / shell / wish…) — the resolver already placed ANY single-word kind; coverage now credits the
 *      sentence ONLY for an HONEST kind (isHonestEnterCounterKind): the audited inert vocabulary, the
 *      modeled-semantics pair (shield — CR 122.1c destroy-replacement + damage-prevention; stun — CR 122.1d
 *      untap replacement), or an enforced CR 122.1b keyword counter (permanentHasKeyword's counter read).
 *   2. CONDITIONAL counters ("Morbid — … enters with four +1/+1 counters on it if a creature died this
 *      turn" — Gravetiller Wurm; Raid — War-Name Aspirant; Ferocious — Frontier Mastodon) — the resolver
 *      evaluates the condition via evaluateInterveningIf against the PRE-entry state (CR 614.1c); coverage
 *      credits only spellConditionParseable conditions (the shared vocabulary gate).
 *   3. CHOICE keyword counters ("… your choice of a deathtouch counter or a lifelink counter" — Boot
 *      Nipper; Grimdancer's two-of-three) — deterministic house auto-pick (first `pick` printed options),
 *      every option must be an enforced 122.1b kind or the whole clause fails closed.
 *
 * Whole-clause ^…$ anchors fail closed: a trailing rider, a leading-if (Adamant), a kicked form (kicker.js
 * owns it), an unenforced choice option, or an out-of-vocabulary condition → null → the card PARKS (CREED:
 * false-negative safe, false-positive forbidden). Every enters-with write routes through applyCounterDoubling
 * (CR 616 — Doubling Season doubles enters-with counters, CTR-2 seam).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { enterPermanent } from "./resolvers.js";
import { entersWithNamedCounters, entersWithConditionalCounters, entersWithChoiceCounters, isHonestEnterCounterKind } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const state0 = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), turn: 3 });
const creature = (name, oracle, p = 2, t = 2, type = "Creature — Beast") => ({ id: `c-${name}`, name, type, power: p, toughness: t, oracle });
const artifact = (name, oracle) => ({ id: `a-${name}`, name, type: "Artifact", oracle });
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];
const withDoublingSeason = (s) => {
  const ds = createPermanent({ id: "ds", card: { id: "ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ds] } } };
};

// ─── Real oracle texts (bundled Scryfall, verbatim) ─────────────────────────────────────────────────────────
const TRIGON_OF_RAGE = "This artifact enters with three charge counters on it.\n{R}{R}, {T}: Put a charge counter on this artifact.\n{2}, {T}, Remove a charge counter from this artifact: Target creature gets +3/+0 until end of turn.";
const SHRIEKHORN = "This artifact enters with three charge counters on it.\n{T}, Remove a charge counter from this artifact: Target player mills two cards.";
const SWOOPING_PROTECTOR = "Flash\nFlying\nThis creature enters with a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)";
const DISCIPLINED_DUELIST = "Double strike\nThis creature enters with a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)";
const GRAVETILLER_WURM = "Trample\nMorbid — This creature enters with four +1/+1 counters on it if a creature died this turn.";
const SOMBERWALD_SPIDER = "Reach (This creature can block creatures with flying.)\nMorbid — This creature enters with two +1/+1 counters on it if a creature died this turn.";
const WAR_NAME_ASPIRANT = "Raid — This creature enters with a +1/+1 counter on it if you attacked this turn.\nThis creature can't be blocked by creatures with power 1 or less.";
const FRONTIER_MASTODON = "Ferocious — This creature enters with a +1/+1 counter on it if you control a creature with power 4 or greater.";
const EFFORTLESS_MASTER = "Vigilance\nMenace (This creature can't be blocked except by two or more creatures.)\nThis creature enters with two +1/+1 counters on it if you've cast two or more spells this turn.";
const PATIENT_TURTLE = "Patient Turtle enters with two +1/+1 counters on it if you didn't go first this game.";
const GREENWHEEL_LIBERATOR = "Revolt — This creature enters with two +1/+1 counters on it if a permanent left the battlefield under your control this turn.";
const BOOT_NIPPER = "This creature enters with your choice of a deathtouch counter or a lifelink counter on it.";
const GRIMDANCER = "This creature enters with your choice of two different counters on it from among menace, deathtouch, and lifelink.";
const HELICA_GLIDER = "This creature enters with your choice of a flying counter or a first strike counter on it.";
const TONBERRY = "This creature enters tapped with a stun counter on it. (If it would become untapped, remove a stun counter from it instead.)\nChef's Knife — During your turn, this creature has first strike and deathtouch.";
const SUNSET_PYRAMID = "This artifact enters with three brick counters on it.\n{2}, {T}, Remove a brick counter from this artifact: Draw a card.\n{2}, {T}: Scry 1.";
const ICATIAN_JAVELINEERS = "This creature enters with a javelin counter on it.\n{T}, Remove a javelin counter from this creature: It deals 1 damage to any target.";

describe("EW-1 parsers — recognition on real oracle (single source of truth)", () => {
  it("entersWithNamedCounters reads the literal kind + count", () => {
    expect(entersWithNamedCounters(creature("T", TRIGON_OF_RAGE))).toEqual({ type: "charge", n: 3 });
    expect(entersWithNamedCounters(creature("S", SWOOPING_PROTECTOR))).toEqual({ type: "shield", n: 1 });
    expect(entersWithNamedCounters(creature("K", "This creature enters with a deathtouch counter on it."))).toEqual({ type: "deathtouch", n: 1 });
  });
  it("tolerates the tapped combination (Tonberry — 'enters tapped with a stun counter')", () => {
    expect(entersWithNamedCounters(creature("Tb", TONBERRY))).toEqual({ type: "stun", n: 1 });
  });
  it("FAIL-CLOSED: a trailing rider breaks the whole-sentence anchor (never a silent drop)", () => {
    expect(entersWithNamedCounters(creature("R", "This creature enters with two charge counters on it and can't block."))).toBeNull();
  });
  it("FAIL-CLOSED: fade/time stay reserved to fading.js (no double-add)", () => {
    expect(entersWithNamedCounters(creature("F", "This creature enters with three fade counters on it."))).toBeNull();
  });
  it("isHonestEnterCounterKind — inert + modeled + enforced-keyword kinds pass; the rest fail closed", () => {
    for (const k of ["charge", "oil", "javelin", "brick", "shield", "stun", "deathtouch", "menace", "hexproof", "indestructible"]) {
      expect(isHonestEnterCounterKind(k)).toBe(true);
    }
    // finality = an UNMODELED dies→exile replacement (a placed-but-inert finality counter would misplay);
    // fade/time/loyalty = reserved paths; decayed/exalted = 122.1b kinds the runtime does NOT enforce;
    // slumber/verse = not in the audited vocabulary (FN-safe park).
    for (const k of ["finality", "fade", "time", "loyalty", "decayed", "exalted", "slumber", "verse"]) {
      expect(isHonestEnterCounterKind(k)).toBe(false);
    }
  });
  it("entersWithConditionalCounters captures {n, condition} for the Morbid/Raid family", () => {
    expect(entersWithConditionalCounters(creature("G", GRAVETILLER_WURM))).toEqual({ n: 4, condition: "a creature died this turn" });
    expect(entersWithConditionalCounters(creature("W", WAR_NAME_ASPIRANT))).toEqual({ n: 1, condition: "you attacked this turn" });
    expect(entersWithConditionalCounters(creature("P", PATIENT_TURTLE))).toEqual({ n: 2, condition: "you didn't go first this game" });
  });
  it("FAIL-CLOSED: kicked and leading-if (Adamant) forms are NOT this seam", () => {
    expect(entersWithConditionalCounters(creature("K", "If this creature was kicked, it enters with two +1/+1 counters on it."))).toBeNull();
    expect(entersWithConditionalCounters(creature("A", "If at least three white mana was spent to cast this spell, this creature enters with a +1/+1 counter on it."))).toBeNull();
  });
  it("entersWithChoiceCounters — two-option and Grimdancer's two-of-three shapes, printed order", () => {
    expect(entersWithChoiceCounters(creature("B", BOOT_NIPPER))).toEqual({ pick: 1, options: ["deathtouch", "lifelink"] });
    expect(entersWithChoiceCounters(creature("G", GRIMDANCER))).toEqual({ pick: 2, options: ["menace", "deathtouch", "lifelink"] });
    expect(entersWithChoiceCounters(creature("H", HELICA_GLIDER))).toEqual({ pick: 1, options: ["flying", "first strike"] });
  });
  it("FAIL-CLOSED: one unenforced choice option parks the WHOLE clause (decayed is unmodeled)", () => {
    expect(entersWithChoiceCounters(creature("D", "This creature enters with your choice of a decayed counter or a flying counter on it."))).toBeNull();
  });
});

describe("EW-1 runtime — named kinds enter with their counters (CR 614.1c + 122.6a)", () => {
  it("Trigon of Rage enters with three charge counters", () => {
    const s = enterPermanent(state0(), artifact("Trigon of Rage", TRIGON_OF_RAGE), "user");
    expect(enteredPerm(s).counters.charge).toBe(3);
  });
  it("CR 616 (CTR-2): Doubling Season doubles the entering charge counters (3 → 6)", () => {
    const s = enterPermanent(withDoublingSeason(state0()), artifact("Trigon of Rage", TRIGON_OF_RAGE), "user");
    expect(enteredPerm(s).counters.charge).toBe(6);
  });
  it("Tonberry enters TAPPED with a stun counter (both replacements compose)", () => {
    const s = enterPermanent(state0(), creature("Tonberry", TONBERRY, 2, 1), "user");
    const perm = enteredPerm(s);
    expect(perm.tapped).toBe(true);
    expect(perm.counters.stun).toBe(1);
  });
  it("CR 122.1c: Swooping Protector's shield counter absorbs a destroy effect (removed instead of dying)", () => {
    let s = enterPermanent(state0(), creature("Swooping Protector", SWOOPING_PROTECTOR, 2, 1), "user");
    const perm = enteredPerm(s);
    expect(perm.counters.shield).toBe(1);
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: perm.id }] });
    const after = findPermanent(s, perm.id);
    expect(after).not.toBeNull();                          // survived — the shield replaced the destruction
    expect(after.permanent.counters?.shield || 0).toBe(0); // …by consuming itself
  });
});

describe("EW-1 runtime — conditional counters evaluate at ETB against the PRE-entry state (both branches)", () => {
  it("Morbid TRUE: a creature died this turn → Gravetiller Wurm enters 8/8 (four counters)", () => {
    let s = state0();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, creaturesDiedThisTurn: 1 } } };
    s = enterPermanent(s, creature("Gravetiller Wurm", GRAVETILLER_WURM, 4, 4), "user");
    const perm = enteredPerm(s);
    expect(perm.counters["+1/+1"]).toBe(4);
    expect(permanentPower(s, perm.id)).toBe(8);
    expect(permanentToughness(s, perm.id)).toBe(8);
  });
  it("Morbid FALSE: no deaths this turn → enters as the printed 4/4 (no counters)", () => {
    const s = enterPermanent(state0(), creature("Gravetiller Wurm", GRAVETILLER_WURM, 4, 4), "user");
    expect(enteredPerm(s).counters["+1/+1"] || 0).toBe(0);
    expect(permanentPower(s, enteredPerm(s).id)).toBe(4);
  });
  it("Raid TRUE / FALSE: the attackedThisTurn flag gates War-Name Aspirant's counter", () => {
    let sT = state0();
    sT = { ...sT, players: { ...sT.players, user: { ...sT.players.user, attackedThisTurn: true } } };
    sT = enterPermanent(sT, creature("War-Name Aspirant", WAR_NAME_ASPIRANT, 2, 1), "user");
    expect(enteredPerm(sT).counters["+1/+1"]).toBe(1);
    const sF = enterPermanent(state0(), creature("War-Name Aspirant", WAR_NAME_ASPIRANT, 2, 1), "user");
    expect(enteredPerm(sF).counters["+1/+1"] || 0).toBe(0);
  });
  it("CR 616: Doubling Season doubles a Morbid entry (four → eight counters)", () => {
    let s = withDoublingSeason(state0());
    s = { ...s, players: { ...s.players, user: { ...s.players.user, creaturesDiedThisTurn: 1 } } };
    s = enterPermanent(s, creature("Gravetiller Wurm", GRAVETILLER_WURM, 4, 4), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(8);
  });
  it("FN-SAFE: an out-of-vocabulary condition adds NO counters (Patient Turtle — the pre-EW-1 behavior)", () => {
    const s = enterPermanent(state0(), creature("Patient Turtle", PATIENT_TURTLE, 3, 3), "user");
    expect(enteredPerm(s).counters["+1/+1"] || 0).toBe(0);
  });
});

describe("EW-1 runtime — choice keyword counters (deterministic house auto-pick: first `pick` printed options)", () => {
  it("Boot Nipper picks its FIRST option (deathtouch) — the counter grants the keyword layer-aware", () => {
    const s = enterPermanent(state0(), creature("Boot Nipper", BOOT_NIPPER, 2, 1), "user");
    const perm = enteredPerm(s);
    expect(perm.counters.deathtouch).toBe(1);
    expect(perm.counters.lifelink).toBeUndefined();
    expect(permanentHasKeyword(s, perm.id, "Deathtouch")).toBe(true);
    expect(permanentHasKeyword(s, perm.id, "Lifelink")).toBe(false);
  });
  it("Grimdancer picks its first TWO options (menace + deathtouch, never lifelink)", () => {
    const s = enterPermanent(state0(), creature("Grimdancer", GRIMDANCER, 3, 3), "user");
    const perm = enteredPerm(s);
    expect(perm.counters.menace).toBe(1);
    expect(perm.counters.deathtouch).toBe(1);
    expect(perm.counters.lifelink).toBeUndefined();
  });
  it("Helica Glider's flying counter is honored by permanentHasKeyword (CR 122.1b + 613.1f)", () => {
    const s = enterPermanent(state0(), creature("Helica Glider", HELICA_GLIDER, 2, 2), "user");
    expect(permanentHasKeyword(s, enteredPerm(s).id, "Flying")).toBe(true);
  });
});

describe("EW-1 coverage — whole-card flips (audited real oracles)", () => {
  const cases = [
    ["Trigon of Rage", "Artifact", "{2}", TRIGON_OF_RAGE, "native-activated"],
    ["Shriekhorn", "Artifact", "{1}", SHRIEKHORN, "native-activated"],
    ["Sunset Pyramid", "Artifact", "{2}", SUNSET_PYRAMID, "native-activated"],
    ["Icatian Javelineers", "Creature — Human Soldier", "{W}", ICATIAN_JAVELINEERS, "native-activated"],
    ["Swooping Protector", "Creature — Bird Citizen", "{3}{W}", SWOOPING_PROTECTOR, "native-body"],
    ["Disciplined Duelist", "Creature — Human Citizen", "{G}{W}{U}", DISCIPLINED_DUELIST, "native-body"],
    ["Gravetiller Wurm", "Creature — Wurm", "{5}{G}", GRAVETILLER_WURM, "native-body"],
    ["Somberwald Spider", "Creature — Spider", "{4}{G}", SOMBERWALD_SPIDER, "native-body"],
    ["War-Name Aspirant", "Creature — Human Warrior", "{1}{R}", WAR_NAME_ASPIRANT, "native-body"],
    ["Frontier Mastodon", "Creature — Elephant", "{2}{G}", FRONTIER_MASTODON, "native-body"],
    ["Effortless Master", "Creature — Orc Monk", "{2}{U}{R}", EFFORTLESS_MASTER, "native-body"],
    ["Boot Nipper", "Creature — Beast", "{1}{B}", BOOT_NIPPER, "native-body"],
    ["Grimdancer", "Creature — Nightmare", "{1}{B}{B}", GRIMDANCER, "native-body"],
    ["Helica Glider", "Creature — Nightmare Squirrel", "{2}{W}", HELICA_GLIDER, "native-body"],
  ];
  for (const [name, type, mana, oracle, tier] of cases) {
    it(`${name} → ${tier}`, () => {
      expect(classifyCard({ name, type, mana, oracle })).toBe(tier);
    });
  }
});

describe("EW-1 coverage — FN guards (the parks stay parked; CREED whole-card-or-park)", () => {
  it("Patient Turtle parks: 'you didn't go first this game' is outside the interveningIf vocabulary", () => {
    expect(classifyCard({ name: "Patient Turtle", type: "Creature — Turtle", mana: "{2}{G}{G}", oracle: PATIENT_TURTLE })).toBe("body-only");
  });
  it("Greenwheel Liberator parks: Revolt's permanent-left-the-battlefield ledger is unmodeled", () => {
    expect(classifyCard({ name: "Greenwheel Liberator", type: "Creature — Elf Warrior", mana: "{1}{G}", oracle: GREENWHEEL_LIBERATOR })).toBe("body-only");
  });
  it("a FINALITY counter parks: its dies→exile replacement is unmodeled (an inert one would misplay)", () => {
    expect(classifyCard({ name: "Finality Test", type: "Creature — Zombie", mana: "{2}{B}", oracle: "This creature enters with a finality counter on it." })).toBe("body-only");
  });
  it("a bare FADE counter (no fading keyword) parks: the vanishing/fading upkeep machinery owns fade/time", () => {
    expect(classifyCard({ name: "Fade Test", type: "Creature — Spirit", mana: "{2}{W}", oracle: "This creature enters with three fade counters on it." })).toBe("body-only");
  });
  it("a trailing rider parks the card AND places no counters (anchored parser — never a silent drop)", () => {
    const card = { name: "Rider Test", type: "Creature — Ogre", mana: "{2}{R}", oracle: "This creature enters with two charge counters on it and can't block." };
    expect(classifyCard(card)).toBe("body-only");
    const s = enterPermanent(state0(), { id: "c-rider", power: 3, toughness: 3, ...card }, "user");
    expect(enteredPerm(s).counters.charge || 0).toBe(0);
  });
  it("an unenforced choice option parks the whole card (decayed)", () => {
    expect(classifyCard({ name: "Decayed Choice", type: "Creature — Zombie", mana: "{1}{B}", oracle: "This creature enters with your choice of a decayed counter or a flying counter on it." })).toBe("body-only");
  });
});
