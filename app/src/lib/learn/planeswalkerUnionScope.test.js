/**
 * planeswalkerUnionScope.test.js — UP-1: "target creature or planeswalker <scope>" finally carries its
 * scope. Skysovereign Consul Flagship, Careless Celebrant, Iroas's Blessing, Surge of Righteousness, Fry.
 *
 * ⭐⭐ THE DIAGNOSIS IS THE SLICE, AND THE FIRST FRAMING WAS WRONG. The vein was banked as "union + scope
 * fails", which implied something wrong with the SCOPES. Nothing was. `you control` failed exactly as hard
 * as `an opponent controls`, and that symmetry is what identified the real cause: parser.js's damage/destroy
 * fold was gated on `atom.targetType === "creature"`, so a UNION atom never entered the restriction parse at
 * all. It fell through to `isCleanClause(s)` instead — where the scope phrase is ITSELF an UNMODELED_MARKER.
 * The scope was never being read; it was only ever being tripped over.
 *
 * ⛔⛔ THE ONE-LINE VERSION OF THIS FIX WOULD HAVE BEEN THE BUG. Making "or planeswalker" clean GLOBALLY in
 * parseCreatureTargetRestrictions reaches SIX call sites, including legalChoices' legacy single-target path,
 * and would let a union be treated as a plain CREATURE target somewhere else — a planeswalker offered where
 * only creatures are legal. The union noun is therefore consumed under an OPT-IN flag that only a caller
 * which has ALREADY resolved the union targetType may pass. The residue is a guard, not an oversight.
 *
 * ⭐⭐ FRY IS THE FIND, AND IT IS A BUG ON AN ALREADY-NATIVE CARD. Fry read native-spell before this slice
 * with `{op:"deal-damage", amount:5, targetType:"creatureOrPlaneswalker"}` and NO restrictions — its printed
 * "that's white or blue" silently dropped. The engine would have aimed a 5-damage bolt at a green creature
 * and nothing would have looked wrong; the card simply appeared to have more reach than it prints. It never
 * showed up as a parked card because it was never parked. The tier number cannot find this class of defect —
 * only the parsed-atoms assertion below does.
 *
 * ⚠️ THE PHANTOM LETTER. Fry then surfaced as a LOST row (native → arbiter) the moment the fold admitted it,
 * because `clean` was false for a reason no reading of the card predicts: the filler strip matched bare
 * `that` inside the contraction `that's` (a `\b` sits between "t" and "'"), the `[^a-z]+` sweep ate the
 * apostrophe, and an ORPHAN "s" stood as residue. A letter no printed word ever contributed was parking
 * every "target creature that's <colour>" card — on the PLAIN-creature lane just as much as the union one,
 * which is how Surge of Righteousness (untouched by the union work) rode in on the same fix.
 * ⛔ Consuming the contraction does NOT loosen the qualifier gate: the closing describe pins three real
 * unmodeled qualifiers still parking. Only the phantom letter stopped surviving.
 *
 * Mutation-checked (2026-08-06, each grep-verified as applied AND verified to reach the case under test):
 *   · fold's targetType condition reverted to `=== "creature"` alone -> Skysovereign, Careless Celebrant and
 *     Iroas's Blessing go back to body-only, and Fry loses its colorAny restriction (silently, still native).
 *   · `allowPlaneswalkerUnion` forced to false at the fold -> the same three park; the union noun survives
 *     as residue and `clean` is false.
 *   · `that's` removed from the filler alternation -> Surge of Righteousness goes back to arbiter-spell and
 *     Fry drops to arbiter-spell (the LOST row, reproduced on demand).
 *   · the union noun made clean GLOBALLY (flag ignored, always strip) -> this suite still passes, which is
 *     the point: the danger of that mutation is at the OTHER five call sites, not here. The guard against it
 *     is the default-false parameter, not a test — said out loud so nobody later "simplifies" the flag away
 *     on the evidence of a green suite.
 * ⚠️⚠️ A FOURTH MUTATION SURVIVED, AND THE CODE WAS WRONG RATHER THAN THE TEST. The first version of this
 * slice ALSO stripped the union noun from `cleanedOracle`, with a comment asserting that the fold's second
 * gate `isCleanClause(cleanedOracle)` would otherwise refuse the card. Removing that line changed NOTHING
 * for any of the five carriers: `UNMODELED_MARKERS` never names "planeswalker". The line was deleted rather
 * than pinned, and the reason it is absent now lives at the `cleanedOracle` build in spellEffects.js.
 * ⭐ That is twice in one run that a confident comment justified code doing nothing. The mutation caught
 * both; re-reading the code did not.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets, parseCreatureTargetRestrictions } from "./spellEffects.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SKYSOVEREIGN = { id: "c-sky", name: "Skysovereign, Consul Flagship", type: "Legendary Artifact — Vehicle", mana: "{5}",
  oracle: "Flying\nWhenever Skysovereign enters or attacks, it deals 3 damage to target creature or planeswalker an opponent controls.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const CARELESS_CELEBRANT = { id: "c-cc", name: "Careless Celebrant", type: "Creature — Satyr Shaman", mana: "{1}{R}", power: "2", toughness: "1",
  oracle: "When this creature dies, it deals 2 damage to target creature or planeswalker an opponent controls." };
const IROASS_BLESSING = { id: "c-ib", name: "Iroas's Blessing", type: "Enchantment — Aura", mana: "{3}{R}",
  oracle: "Enchant creature you control\nWhen this Aura enters, it deals 4 damage to target creature or planeswalker an opponent controls.\nEnchanted creature gets +1/+1." };
const SURGE_OF_RIGHTEOUSNESS = { id: "c-sr", name: "Surge of Righteousness", type: "Instant", mana: "{1}{W}",
  oracle: "Destroy target black or red creature that's attacking or blocking. You gain 2 life." };
const FRY = { id: "c-fry", name: "Fry", type: "Instant", mana: "{1}{R}",
  oracle: "This spell can't be countered.\nFry deals 5 damage to target creature or planeswalker that's white or blue." };

describe("the flipped cards", () => {
  it("⭐ all four flip native", () => {
    for (const c of [SKYSOVEREIGN, CARELESS_CELEBRANT, IROASS_BLESSING, SURGE_OF_RIGHTEOUSNESS]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ FRY — native BEFORE and AFTER, so only the parsed restriction can pin the fix", () => {
    // The tier is identical on both sides of this slice. A tier-only assertion here would be a green light
    // over a live illegal-target bug, which is precisely what shipped before today.
    const row = { tier: classifyCard(FRY), atoms: parseEffectProgram(FRY)?.atoms };
    console.log("  WITNESS fryParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toMatch(/^native/);
    expect(row.atoms).toEqual([
      { op: "deal-damage", amount: 5, targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "colorAny", colors: ["W", "U"] }] },
    ]);
  });

  it("⭐⭐ the parsed atom per card — the union targetType AND its scope, together", () => {
    // Careless Celebrant's whole card is one dies-trigger, so its atoms come off the TRIGGER path
    // (parseEffectProgram is the spell path and returns nothing for it) — three of the four flipped cards
    // are triggers, and reading them through the wrong door would have pinned an undefined.
    // ⚠️ THE SECOND ARGUMENT IS "Instant", NOT THE CARD'S OWN TYPE. Passing "Creature — Satyr Shaman" here
    // returned `[]` — a clean, well-formed EMPTY that would have read as "the union still doesn't parse"
    // and sent this slice chasing the code instead of the harness. Every production caller of a trigger's
    // effectClause passes "Instant" (coverage.js:4147, triggerRouting.js:167); this mirrors them exactly.
    const trig = detectTriggers(CARELESS_CELEBRANT)[0];
    const row = {
      careless: parseEffectClause(trig.effectClause, "Instant", { hasX: !!trig.effectHasX, sourceScoped: true })?.atoms,
      surge: parseEffectProgram(SURGE_OF_RIGHTEOUSNESS)?.atoms,
    };
    console.log("  WITNESS unionScopeParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.careless).toEqual([{
      op: "deal-damage", amount: 2, targetType: "creatureOrPlaneswalker",
      restrictions: [{ kind: "controller", who: "opponent" }],
    }]);
    // Surge rode in on the CONTRACTION half, not the union half — it is a plain creature target. Its
    // "attacking or blocking" must be ONE combat restriction valued "either"; two ANDed entries would
    // demand a creature be simultaneously attacking and blocking, i.e. hit nothing.
    expect(row.surge?.[0]).toEqual({
      op: "destroy", targetType: "creature",
      restrictions: [{ kind: "combat", value: "either" }, { kind: "colorAny", colors: ["B", "R"] }],
    });
  });

  it("⭐ the opt-in is OPT-IN — the shared noun grammar is unchanged for the other five callers", () => {
    // ⛔ THIS IS THE SAFETY ARGUMENT OF THE WHOLE SLICE, so it is asserted rather than commented.
    // Default-false must still refuse the union noun; if this ever goes clean, a union has become
    // indistinguishable from a plain creature target at every call site that never opted in.
    const clause = "fry deals 5 damage to target creature or planeswalker that's white or blue";
    const row = {
      defaulted: parseCreatureTargetRestrictions({ oracle: clause }).clean,
      optedIn: parseCreatureTargetRestrictions({ oracle: clause }, { allowPlaneswalkerUnion: true }).clean,
    };
    console.log("  WITNESS unionOptIn", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ defaulted: false, optedIn: true });
  });
});

// A board where BOTH halves of the union are present on BOTH sides, in a legal and an illegal colour.
// Exclusion assertions are meaningless against a board that has nothing wrong to offer.
function unionBoard() {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const cre = (id, name, colors, ctl) => createPermanent({
    id, controller: ctl, summoningSick: false,
    card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", colors },
  });
  const pw = (id, name, colors, ctl) => ({
    ...createPermanent({ id, controller: ctl, summoningSick: false,
      card: { id: `c-${id}`, name, type: "Legendary Planeswalker — Test", oracle: "", colors, cmc: 4 } }),
    counters: { loyalty: 4 },
  });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [
        cre("uw", "MyWhiteCre", ["W"], "user"), cre("ug", "MyGreenCre", ["G"], "user"),
        pw("upw", "MyWhitePW", ["W"], "user"), pw("upg", "MyGreenPW", ["G"], "user")] },
      ai1: { ...s.players.ai1, battlefield: [
        cre("ow", "OppWhiteCre", ["W"], "ai1"), cre("og", "OppGreenCre", ["G"], "ai1"),
        pw("opw", "OppWhitePW", ["W"], "ai1")] } } };
}

describe("⭐⭐ LAW 6 — the enumerated pools, with the excluded permanents named", () => {
  it("⭐⭐ a scope on a union reaches BOTH halves — your own planeswalker is not a legal Skysovereign target", () => {
    const s = unionBoard();
    const pool = (spec) => enumerateTargets(s, "user", spec, []).map((t) => t.id).sort();
    const row = {
      // Skysovereign / Careless Celebrant / Iroas's Blessing all share this spec.
      oppControls: pool({ targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "controller", who: "opponent" }] }),
      // Fry: colour-scoped, NOT controller-scoped — your own white creature IS a legal Fry target, and a
      // pool that dropped it would be the safe-but-wrong direction.
      fryWhiteOrBlue: pool({ targetType: "creatureOrPlaneswalker", restrictions: [{ kind: "colorAny", colors: ["W", "U"] }] }),
      // The control: with no restriction the union offers everything, so every exclusion above is the
      // restriction doing work rather than the board being empty.
      unrestricted: pool({ targetType: "creatureOrPlaneswalker", restrictions: [] }),
    };
    console.log("  WITNESS unionScopePools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // ⛔ upw / upg ABSENT — before this slice the union carried NO restrictions, so your own planeswalker
      // was offered to a card that reads "an opponent controls". That is the illegal-target FP, by name.
      oppControls: ["og", "opw", "ow"],
      // ⛔ ug / og / upg ABSENT — green is excluded on BOTH sides and in BOTH halves of the union.
      fryWhiteOrBlue: ["opw", "ow", "upw", "uw"],
      unrestricted: ["og", "opw", "ow", "ug", "upg", "upw", "uw"],
    });
  });
});

describe("⭐⭐ the graduated pin — a stacked mixed restriction set, ENFORCED", () => {
  it("⭐⭐ tapped + opponent-controls + attacking each narrow the pool independently", () => {
    // ⛔ THIS TEST IS THE GRADUATION'S EVIDENCE. "Destroy target tapped creature an opponent controls
    // that's attacking." moved out of parser.test.js's MUST_DROP_TO_LOW gate in this slice, and a
    // graduation justified only by a comment is the hollow-gate failure this project has a standing law
    // about. HIGH confidence is only defensible if every one of the three restrictions actually excludes
    // something at enumeration — so each is measured by removing it and watching the pool grow.
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, ctl, tapped) => ({
      ...createPermanent({ id, controller: ctl, summoningSick: false,
        card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", colors: ["G"] } }),
      tapped,
    });
    // ⚠️ ATTACKERS LIVE IN `state.combat.attackers`, NOT ON THE PERMANENT. A first pass set `attacking: true`
    // on each permanent and every pool came back EMPTY — including the creature meeting all three
    // conditions. That reads exactly like "the restriction is too tight" and would have been filed as a
    // code bug; it was the harness. The all-zero rule earned its keep again.
    const st = { ...s, phase: "combat-damage", step: "combat-damage", activePlayer: "ai1", priorityHolder: "user", turn: 5,
      combat: { attackers: [{ permanentId: "OPPtapATK" }, { permanentId: "OPPuntapATK" }, { permanentId: "MINEtapATK" }], blockers: [] },
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [mk("MINEtapATK", "user", true)] },
        ai1: { ...s.players.ai1, battlefield: [mk("OPPtapATK", "ai1", true), mk("OPPtapNOatk", "ai1", true), mk("OPPuntapATK", "ai1", false)] } } };
    const pool = (r) => enumerateTargets(st, "user", { targetType: "creature", restrictions: r }, []).map((t) => t.id).sort();
    const row = {
      allThree: pool([{ kind: "tapped", value: true }, { kind: "controller", who: "opponent" }, { kind: "combat", value: "attacking" }]),
      withoutCombat: pool([{ kind: "tapped", value: true }, { kind: "controller", who: "opponent" }]),
      combatOnly: pool([{ kind: "combat", value: "attacking" }]),
    };
    console.log("  WITNESS stackedRestrictionPools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      allThree: ["OPPtapATK"],                          // ⛔ NOT my own attacker, NOT the untapped one, NOT the idle one
      withoutCombat: ["OPPtapATK", "OPPtapNOatk"],      // combat was carrying its own weight
      combatOnly: ["MINEtapATK", "OPPtapATK", "OPPuntapATK"],
    });
  });
});

describe("⭐ the contraction fix consumes a phantom letter, not a qualifier", () => {
  it("⭐⭐ real unmodeled qualifiers after `that's` STILL park the card", () => {
    // If any of these goes clean, the filler strip has started swallowing meaning instead of punctuation,
    // and the CREED's forbidden direction is back on the table.
    const row = {};
    for (const q of ["enchanted", "been dealt damage this turn", "a copy of another creature"]) {
      row[q] = parseCreatureTargetRestrictions({ oracle: `destroy target creature that's ${q}` }).clean;
    }
    console.log("  WITNESS contractionGuard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(Object.values(row)).toEqual([false, false, false]);
  });

  it("⭐ the contraction was never union-specific — the plain creature lane parked on it too", () => {
    // This is why the fix lives in the shared filler strip rather than behind the union flag: Surge of
    // Righteousness has no planeswalker in it anywhere.
    const plain = parseCreatureTargetRestrictions({ oracle: "deals 5 damage to target creature that's white or blue" });
    expect(plain.clean).toBe(true);
    expect(plain.restrictions).toEqual([{ kind: "colorAny", colors: ["W", "U"] }]);
  });

  it("⭐ a union with no scope at all is still a plain union — the additive control", () => {
    expect(parseEffectClause("it deals 3 damage to target creature or planeswalker", "Instant", { sourceScoped: true })?.atoms)
      .toEqual([{ op: "deal-damage", amount: 3, targetType: "creatureOrPlaneswalker" }]);
  });
});
