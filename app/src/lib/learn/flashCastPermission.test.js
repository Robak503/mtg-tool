/**
 * FLASH-CAST-PERMISSION (CR 601.3e / 702.8f) — a STATIC casting-permission that lets the controller cast a
 * class of THEIR OWN spells at instant speed: "You may cast <FILTER> spells as though they had flash."
 *
 * Build (mirrors the { cantCast } / { extraLandDrops } coverage-marker family):
 *   • parser — a new FLASH-CAST-PERMISSION branch in staticAbilityParser.parseClause emits a
 *     { castFlashPermission: spec } marker (NO affects/op, so the layer engine ignores it). The FILTER is
 *     reduced to a serializable spec by parseFlashCastFilter — a CLOSED vocabulary of card types / colors / the
 *     noncreature+colorless specials / a single subtype, with "X and Y" unions. An unmodeled filter → no marker
 *     → the card stays body-only (a safe FN). staticAbilitiesCoverCard then sees the clause as modeled, so a
 *     card whose ONLY non-keyword text is this static flips native-static.
 *   • runtime — legalChoices gathers the caster's specs from the battlefield (flashPermissionSpecsFor) once per
 *     castActionsFromZone; a sorcery-speed card matching any spec (spellMatchesFlashFilter) is offered at instant
 *     speed (subject to the normal instant-speed priority window). The metric and the runtime share the SAME
 *     spec + matcher, so the "native" claim can never diverge from what the engine actually offers.
 *
 * CREED all-or-nothing: only a card whose EVERY clause models flips. The SYMMETRIC "Any player may cast …"
 * (Tidal Barracuda, Vernal Equinox, Quick Sliver) grants opponents too — the controller-only reader doesn't
 * model that half, so those stay body-only (a fabricated opponent-timing grant is a forbidden false positive).
 * An unmodeled FILTER ("historic spells" — Raff Capashen; "Secret Lair spells" — a two-word subtype) likewise
 * emits nothing. A card carrying ANOTHER unmodeled clause next to the static (Leyline of Anticipation's
 * begin-the-game clause, Prophet of Kruphix's untap-during-each-other-player's-step) stays body-only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, flashCastPermissionsOf, spellMatchesFlashFilter } from "./staticAbilityParser.js";
import { legalActionsForPlayer, flashPermissionSpecsFor } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall, 2026-06) ────────────────────────────────────────────────────
const YEVA = { id: "c-yeva", name: "Yeva, Nature's Herald", type: "Legendary Creature — Elf Shaman", mana: "{2}{G}{G}", power: "4", toughness: "4", keywords: ["Flash"], oracle: "Flash (You may cast this spell any time you could cast an instant.)\nYou may cast green creature spells as though they had flash." };
const VEDALKEN_ORRERY = { id: "c-orrery", name: "Vedalken Orrery", type: "Artifact", mana: "{4}", oracle: "You may cast spells as though they had flash." };
const SHIMMER_MYR = { id: "c-shimmer", name: "Shimmer Myr", type: "Artifact Creature — Myr", mana: "{4}", power: "1", toughness: "1", oracle: "Flash\nYou may cast artifact spells as though they had flash." };
const HYPERSONIC = { id: "c-hyper", name: "Hypersonic Dragon", type: "Creature — Dragon", mana: "{3}{U}{R}", power: "4", toughness: "4", keywords: ["Flying", "Haste"], oracle: "Flying, haste\nYou may cast sorcery spells as though they had flash. (You may cast them any time you could cast an instant.)" };

// CREED near-misses — must NOT emit a marker / must stay non-native.
const TIDAL_BARRACUDA = { id: "c-tidal", name: "Tidal Barracuda", type: "Creature — Fish", mana: "{4}{U}", power: "3", toughness: "3", keywords: ["Flash"], oracle: "Flash\nAny player may cast spells as though they had flash.\nSpells your opponents cast during your turn cost {2} more to cast." };
const RAFF = { id: "c-raff", name: "Raff Capashen, Ship's Mage", type: "Legendary Creature — Human Wizard", mana: "{2}{W}{U}", power: "3", toughness: "3", keywords: ["Flash"], oracle: "Flash\nYou may cast historic spells as though they had flash. (Artifacts, legendaries, and Sagas are historic.)" };
const LEYLINE = { id: "c-leyline", name: "Leyline of Anticipation", type: "Enchantment", mana: "{2}{U}{U}", oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou may cast spells as though they had flash." };
const PROPHET = { id: "c-prophet", name: "Prophet of Kruphix", type: "Creature — Human Wizard", mana: "{3}{G}{U}", power: "2", toughness: "3", oracle: "Untap all creatures and lands you control during each other player's untap step.\nYou may cast creature spells as though they had flash." };

// Spells to test the matcher / runtime against.
const LLANOWAR = { id: "s-llan", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", colors: ["G"], power: "1", toughness: "1", oracle: "{T}: Add {G}." };
const BEARS = { id: "s-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", oracle: "" };
const SERRA = { id: "s-serra", name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", colors: ["W"], power: "4", toughness: "4", oracle: "Flying, vigilance" };
const CULTIVATE = { id: "s-cult", name: "Cultivate", type: "Sorcery", mana: "{2}{G}", colors: ["G"], oracle: "Search your library for up to two basic land cards…" };
const BOLT = { id: "s-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const SOL_RING = { id: "s-sol", name: "Sol Ring", type: "Artifact", mana: "{1}", colors: [], oracle: "{T}: Add {C}{C}." };

// ─── Parse / classify ─────────────────────────────────────────────────────────────────────────────
describe("FLASH-CAST-PERMISSION — parser marker + classifyCard flip", () => {
  it("Yeva parses the static to a { colors:[G], types:[Creature] } spec and classifies native-static", () => {
    const statics = parseStaticAbilities(YEVA).filter((s) => s.castFlashPermission);
    expect(statics).toEqual([{ castFlashPermission: { qualifiers: [{ colors: ["G"], types: ["Creature"] }] } }]);
    expect(classifyCard(YEVA)).toBe("native-static");
  });

  it("Vedalken Orrery (all spells) + Shimmer Myr (artifact) + Hypersonic Dragon (sorcery) classify native", () => {
    expect(flashCastPermissionsOf(VEDALKEN_ORRERY)).toEqual([{ any: true }]);
    expect(classifyCard(VEDALKEN_ORRERY)).toBe("native-static");
    expect(classifyCard(SHIMMER_MYR)).toBe("native-static");     // Flash keyword + artifact-flash static, nothing else
    expect(classifyCard(HYPERSONIC)).toBe("native-static");      // flying/haste keywords + sorcery-flash static
  });

  it("CREED: 'Any player may cast …' emits NO marker (symmetric grant unmodeled) — Tidal Barracuda stays body-only", () => {
    expect(parseStaticAbilities(TIDAL_BARRACUDA).filter((s) => s.castFlashPermission)).toEqual([]);
    expect(classifyCard(TIDAL_BARRACUDA)).not.toMatch(/^native/);
  });

  it("CREED: an unmodeled FILTER ('historic') emits NO marker — Raff Capashen stays body-only", () => {
    expect(parseStaticAbilities(RAFF).filter((s) => s.castFlashPermission)).toEqual([]);
    expect(classifyCard(RAFF)).not.toMatch(/^native/);
  });

  it("CREED: an unmodeled SIBLING clause keeps the card body-only even though the flash static is modeled", () => {
    // Leyline of Anticipation's 'begin the game with it on the battlefield' + Prophet's 'untap during each other
    // player's untap step' are unmodeled residue → staticAbilitiesCoverCard returns false → body-only.
    expect(flashCastPermissionsOf(LEYLINE)).toEqual([{ any: true }]);           // the flash static IS modeled…
    expect(classifyCard(LEYLINE)).not.toMatch(/^native/);                        // …but the opening-hand clause is not
    expect(flashCastPermissionsOf(PROPHET)).toEqual([{ qualifiers: [{ types: ["Creature"] }] }]);
    expect(classifyCard(PROPHET)).not.toMatch(/^native/);                        // untap-others static is unmodeled
  });
});

// ─── Filter matcher (pure) ──────────────────────────────────────────────────────────────────────────
describe("FLASH-CAST-PERMISSION — spellMatchesFlashFilter", () => {
  const yevaSpec = flashCastPermissionsOf(YEVA)[0];       // green creature
  const anySpec = flashCastPermissionsOf(VEDALKEN_ORRERY)[0]; // { any }
  const artSpec = flashCastPermissionsOf(SHIMMER_MYR)[0];  // artifact
  const sorcSpec = flashCastPermissionsOf(HYPERSONIC)[0];  // sorcery

  it("Yeva (green creature) matches only green creatures", () => {
    expect(spellMatchesFlashFilter(yevaSpec, LLANOWAR)).toBe(true);
    expect(spellMatchesFlashFilter(yevaSpec, BEARS)).toBe(true);
    expect(spellMatchesFlashFilter(yevaSpec, SERRA)).toBe(false);   // creature but WHITE, not green
    expect(spellMatchesFlashFilter(yevaSpec, CULTIVATE)).toBe(false); // GREEN but a sorcery, not a creature
    expect(spellMatchesFlashFilter(yevaSpec, BOLT)).toBe(false);
  });

  it("{ any } matches every spell; artifact matches only artifacts; sorcery matches only sorceries", () => {
    expect(spellMatchesFlashFilter(anySpec, BOLT)).toBe(true);
    expect(spellMatchesFlashFilter(anySpec, LLANOWAR)).toBe(true);
    expect(spellMatchesFlashFilter(artSpec, SOL_RING)).toBe(true);
    expect(spellMatchesFlashFilter(artSpec, LLANOWAR)).toBe(false);
    expect(spellMatchesFlashFilter(sorcSpec, CULTIVATE)).toBe(true);
    expect(spellMatchesFlashFilter(sorcSpec, BOLT)).toBe(false);      // an instant is not a sorcery
    expect(spellMatchesFlashFilter(sorcSpec, LLANOWAR)).toBe(false);
  });
});

// ─── Runtime: the cast is actually OFFERED at instant speed (the CREED metric-mirrors-runtime bar) ──
describe("FLASH-CAST-PERMISSION — runtime timing (metric mirrors runtime)", () => {
  // A player's OWN UPKEEP: they hold priority (instant speed OK), but a sorcery-speed cast is illegal
  // (canCastSorcerySpeed needs a main phase). So a cast offered here comes SOLELY from the flash permission.
  function upkeepState({ battlefield = [], hand = [] } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    // Fill the pool so affordability never masks the timing gate under test.
    return {
      ...s, phase: "upkeep", step: "upkeep", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield, hand, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const perm = (id, card) => ({ id, card, controller: "user", tapped: false, summoningSick: false });
  const castsOf = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");

  it("flashPermissionSpecsFor reads the battlefield: Yeva present → its spec; absent → []", () => {
    expect(flashPermissionSpecsFor(upkeepState({ battlefield: [perm("y", YEVA)] }), "user"))
      .toEqual([{ qualifiers: [{ colors: ["G"], types: ["Creature"] }] }]);
    expect(flashPermissionSpecsFor(upkeepState({ battlefield: [] }), "user")).toEqual([]);
  });

  it("with Yeva out, a green creature in hand IS offered at instant speed; a white creature and a green sorcery are NOT", () => {
    const s = upkeepState({ battlefield: [perm("y", YEVA)], hand: [LLANOWAR, SERRA, CULTIVATE] });
    const casts = castsOf(s);
    expect(casts.some((a) => a.cardId === "s-llan")).toBe(true);   // green creature — flash-permitted
    expect(casts.some((a) => a.cardId === "s-serra")).toBe(false); // white creature — not green
    expect(casts.some((a) => a.cardId === "s-cult")).toBe(false);  // green sorcery — not a creature
  });

  it("CREED: WITHOUT Yeva, the same green creature is NOT castable in the upkeep (sorcery-speed only, no permission)", () => {
    const s = upkeepState({ battlefield: [], hand: [LLANOWAR] });
    expect(castsOf(s).some((a) => a.cardId === "s-llan")).toBe(false);
  });

  it("Vedalken Orrery ({ any }) lets ANY spell — even an instant already, and a sorcery — be cast in the upkeep", () => {
    const s = upkeepState({ battlefield: [perm("o", VEDALKEN_ORRERY)], hand: [CULTIVATE, BOLT] });
    const casts = castsOf(s);
    expect(casts.some((a) => a.cardId === "s-cult")).toBe(true);   // sorcery — now flash-permitted
    expect(casts.some((a) => a.cardId === "s-bolt")).toBe(true);   // an instant is instant-speed regardless
  });

  it("CREED: a flash permission for player 'user' does NOT widen an opponent's timing (per-controller scope)", () => {
    // The opponent controls nothing; even with the user's Yeva out, the opponent gets no flash permission.
    const s = upkeepState({ battlefield: [perm("y", YEVA)] });
    const opp = Object.keys(s.players).find((p) => p !== "user");
    expect(flashPermissionSpecsFor(s, opp)).toEqual([]);
  });
});
