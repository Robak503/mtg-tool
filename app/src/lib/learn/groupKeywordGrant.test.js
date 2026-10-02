/**
 * groupKeywordGrant.test.js — GROUP-KEYWORD-GRANT: a one-shot spell/ability that grants keyword(s) to a
 * GROUP until end of turn — "(Creatures|Permanents) you control gain <kw[ and kw]> until end of turn"
 * (Crash Through, Unbreakable Formation, Heroic Intervention "hexproof and indestructible").
 *
 * New `grant-keywords-group` atom (op in atoms/combat.js): a layer-6 endOfTurn `addKeyword` over a FIXED
 * snapshot of the controller's permanents (CR 611.2c — set locked at resolution), enforced LAYER-AWARE by
 * the same readers a printed keyword uses (canBeTargetedBy for hexproof/shroud, isIndestructible, combat
 * evasion for the combat keywords). hexproof/shroud are admitted on THIS one-shot path only (their
 * enforcement is complete) — the shared anthem set is untouched.
 *
 * Coverage: bare group-grant spells (Heroic Intervention, Crash Through, Tortoise Formation), modal modes
 * (Boros/Simic Charm), activated (Selfless Spirit), and triggers (Ankle Shanker) flip native. Riders /
 * filters / color-choices / the static "have" anthem form stay on the Arbiter (FN-safe).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, isIndestructible, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Instant") => ({ name, oracle, type, keywords: [], mana: "{1}{G}" });

// ─── 1. Parser ──────────────────────────────────────────────────────────────────
describe("group-keyword-grant — parser", () => {
  it("'creatures you control gain trample until end of turn' → grant atom (creaturesYouControl)", () => {
    const p = parseEffectClause("Creatures you control gain trample until end of turn.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Trample"] }]);
  });
  it("'permanents you control gain hexproof and indestructible until end of turn' → both keywords, permanentsYouControl", () => {
    const p = parseEffectClause("Permanents you control gain hexproof and indestructible until end of turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "grant-keywords-group", scope: "permanentsYouControl", grantKeywords: ["Hexproof", "Indestructible"] }]);
  });
  it("CREED: un-grantable keyword / filter / color-choice / static 'have' form stay low → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Creatures you control gain protection from the color of your choice until end of turn.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("White creatures you control gain protection from red until end of turn.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("Creatures you control gain banding until end of turn.", "Instant"))).toBe("low"); // banding un-grantable (forestwalk graduated — BLITZ EQ-1)
    expect(programConfidence(parseEffectClause("Creatures you control have hexproof.", "Enchantment"))).toBe("low"); // static anthem, not this one-shot path
  });
});

// ─── 2. Resolver + layer-aware enforcement ────────────────────────────────────────
describe("group-keyword-grant — resolver grants over the fixed snapshot, enforcement honors it", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = [
      createPermanent({ id: "u-cre", card: { id: "u-cre", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" }),
      createPermanent({ id: "u-land", card: { id: "u-land", name: "Forest", type: "Basic Land — Forest" }, controller: "user" }),
      createPermanent({ id: "u-art", card: { id: "u-art", name: "Sol Ring", type: "Artifact" }, controller: "user" }),
    ];
    const theirs = [createPermanent({ id: "a-cre", card: { id: "a-cre", name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3 }, controller: "ai" })];
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: mine }, ai: { ...s.players.ai, battlefield: theirs } } };
  }

  it("Heroic Intervention (permanentsYouControl): EVERY your permanent gains hexproof+indestructible; the opponent's does not", () => {
    const s = board();
    const after = resolveAtom(s, { op: "grant-keywords-group", scope: "permanentsYouControl", grantKeywords: ["Hexproof", "Indestructible"] }, { controller: "user", cardName: "Heroic Intervention" });
    for (const id of ["u-cre", "u-land", "u-art"]) {
      expect(permanentHasKeyword(after, id, "Hexproof")).toBe(true);
      expect(permanentHasKeyword(after, id, "Indestructible")).toBe(true);
    }
    // the opponent's creature is untouched
    expect(permanentHasKeyword(after, "a-cre", "Hexproof")).toBe(false);
    expect(permanentHasKeyword(after, "a-cre", "Indestructible")).toBe(false);
    // enforcement: your LAND is now indestructible; your CREATURE can't be targeted by the opponent (but you can)
    const land = after.players.user.battlefield.find(p => p.id === "u-land");
    const cre = after.players.user.battlefield.find(p => p.id === "u-cre");
    expect(isIndestructible(land, after)).toBe(true);
    expect(canBeTargetedBy(after, cre, "user", "ai")).toBe(false); // opponent can't target
    expect(canBeTargetedBy(after, cre, "user", "user")).toBe(true); // you still can (hexproof, not shroud)
  });

  it("creaturesYouControl (Tortoise Formation shroud): only YOUR CREATURES gain it — your land does not, opponent's creature does not", () => {
    const s = board();
    const after = resolveAtom(s, { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Shroud"] }, { controller: "user", cardName: "Tortoise Formation" });
    expect(permanentHasKeyword(after, "u-cre", "Shroud")).toBe(true);
    expect(permanentHasKeyword(after, "u-land", "Shroud")).toBe(false); // a land is not a creature → excluded
    expect(permanentHasKeyword(after, "a-cre", "Shroud")).toBe(false);  // opponent's creature → excluded
    const cre = after.players.user.battlefield.find(p => p.id === "u-cre");
    expect(canBeTargetedBy(after, cre, "user", "user")).toBe(false); // shroud → untargetable by ANYONE (incl. you)
  });

  it("CR 611.2c: the set is LOCKED at resolution — a creature that enters LATER does not gain the keyword", () => {
    const s = board();
    let after = resolveAtom(s, { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Trample"] }, { controller: "user", cardName: "Crash Through" });
    const latecomer = createPermanent({ id: "u-late", card: { id: "u-late", name: "Elk", type: "Creature — Elk", power: 1, toughness: 1 }, controller: "user" });
    after = { ...after, players: { ...after.players, user: { ...after.players.user, battlefield: [...after.players.user.battlefield, latecomer] } } };
    expect(permanentHasKeyword(after, "u-cre", "Trample")).toBe(true);
    expect(permanentHasKeyword(after, "u-late", "Trample")).toBe(false); // entered after the grant locked
  });

  it("wears off at cleanup (CR 514.2) — expireContinuousEffects drops the endOfTurn grant", () => {
    const s = board();
    const after = resolveAtom(s, { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Trample"] }, { controller: "user", cardName: "Crash Through" });
    expect(permanentHasKeyword(after, "u-cre", "Trample")).toBe(true);
    const cleaned = expireContinuousEffects(after, { atCleanupOfTurn: after.turn });
    expect(permanentHasKeyword(cleaned, "u-cre", "Trample")).toBe(false);
  });

  it("empty board → clean no-op (no throw, no fabricated grant)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    const after = resolveAtom(s, { op: "grant-keywords-group", scope: "permanentsYouControl", grantKeywords: ["Indestructible"] }, { controller: "user" });
    expect((after.continuousEffects || []).length).toBe(0);
  });

  it("requiresCounter (Inspiring Call): only creatures WITH a +1/+1 counter gain the keyword", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const withC = createPermanent({ id: "u-c1", card: { id: "u-c1", name: "Countered", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    withC.counters = { "+1/+1": 1 };
    const bare = createPermanent({ id: "u-c0", card: { id: "u-c0", name: "Bare", type: "Creature — Ox", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [withC, bare] } } };
    const after = resolveAtom(s, { op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Indestructible"], requiresCounter: "+1/+1" }, { controller: "user", cardName: "Inspiring Call" });
    expect(permanentHasKeyword(after, "u-c1", "Indestructible")).toBe(true);  // has a +1/+1 counter → granted
    expect(permanentHasKeyword(after, "u-c0", "Indestructible")).toBe(false); // no counter → excluded
  });
});

// ─── 3. Coverage flips ────────────────────────────────────────────────────────────
describe("group-keyword-grant — coverage flips", () => {
  it("bare group-grant spells → native-spell", () => {
    expect(classifyCard(C("Heroic Intervention", "Permanents you control gain hexproof and indestructible until end of turn."))).toBe("native-spell");
    expect(classifyCard(C("Crash Through", "Creatures you control gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)\nDraw a card.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(C("Tortoise Formation", "Creatures you control gain shroud until end of turn."))).toBe("native-spell");
  });
  it("modal modes that include a group-grant → native-spell (all modes modeled)", () => {
    expect(classifyCard(C("Boros Charm", "Choose one —\n• Boros Charm deals 4 damage to target player or planeswalker.\n• Permanents you control gain indestructible until end of turn.\n• Target creature gains double strike until end of turn."))).toBe("native-spell");
  });
  it("activated + triggered group-grants flip native", () => {
    expect(classifyCard(C("Selfless Spirit", "Flying\nSacrifice this creature: Creatures you control gain indestructible until end of turn.", "Creature — Spirit Cleric"))).toBe("native-activated");
    expect(classifyCard(C("Ankle Shanker", "Haste\nWhenever this creature attacks, creatures you control gain first strike and deathtouch until end of turn.", "Creature — Goblin Berserker"))).toBe("native-trigger");
  });
});

// ─── 4. CREED non-flips ────────────────────────────────────────────────────────────
describe("group-keyword-grant — CREED: rider/filter variants stay non-native", () => {
  it("a trailing rider sentence (Yuan-Ti Scaleshield's 'Seek …') keeps the card off native", () => {
    expect(classifyCard(C("Yuan-Ti Scaleshield", "Permanents you control gain hexproof and indestructible until end of turn.\nSeek a creature card if an opponent has cast a spell with mana value 3 or less this turn."))).not.toMatch(/^native/);
  });
  it("an Addendum / populate rider stays non-native", () => {
    // GRADUATED 2026-10-01 (play-weighted #564) — Unbreakable Formation's own Addendum is modelled now: the spell's cast-time
    // main-phase stamp gates a "those creatures" rider on the group grant (unbreakableFormation.test.js holds the runtime
    // witness). The pin's own reason — "rider unmodeled" — no longer holds for that card. Re-pointed rather than deleted; the
    // live negative follows.
    expect(classifyCard(C("Unbreakable Formation", "Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn."))).toBe("native-spell");
    // Still parked — an Addendum whose PAYLOAD is unmodelled must drop the whole card, which is the invariant this pin protects.
    expect(classifyCard(C("Fake Formation", "Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, populate."))).not.toMatch(/^native/);
  });
});
