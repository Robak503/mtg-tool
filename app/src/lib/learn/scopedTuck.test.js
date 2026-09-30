/**
 * scopedTuck.test.js — the TARGET-RESTRICTED tuck (a plain zone change — no keyword action): "put target creature YOU CONTROL /
 * target ATTACKING OR BLOCKING creature on top of its owner's library." Nightscape Apprentice, Sunscape
 * Apprentice, Civic Guildmage, Shadow Guildmage; Warrant // Warden, Whisk Away, Aethertow, Azorius Charm.
 *
 * ⭐ ONE MISSING RESTRICTION GROUP, TWO FAMILIES. Found by tier-splitting the phrase: the BARE tuck is native
 * on 7 carriers, "…you control" was native on ZERO, and "attacking or blocking" was native on ZERO.
 * `tuckClauseParser` was a single anchored regex with no restriction lane at all — its own comment named the
 * gap ("a scoped ('you control') … variant fails the exact anchor").
 *
 * ⭐ THE OUT-OF-FAMILY CONFIRMATION MATTERS (gate 20). Four Guildmage-shaped creatures sharing a symptom is
 * not evidence of a shared cause — they could share a Guildmage-specific problem. The attacking-or-blocking
 * spells are the cards OUTSIDE that family with the SAME symptom, and they fall out of the same missing
 * group. That is what makes this one slice rather than two guesses.
 *
 * ⭐ NOTHING NEW AT RUNTIME. Both restriction kinds already ship and are enforced layer-aware by
 * creatureSatisfiesRestrictions (`controller/you`, `combat/either`), and atomTargetSpec's generic branch
 * already forwards `atom.restrictions`. This slice only lets the wording produce them — which is why the
 * pins below drive ENUMERATION: that is where the restriction does its work, and where a wrong one would
 * offer an illegal target (the cardinal CREED sin).
 *
 * ⛔ ONLY THE TWO EVIDENCED FORMS. Bare "attacking" / "blocking" would enforce identically — same restriction
 * kind — but every corpus carrier of those wordings has a rider that parks the card anyway, so admitting
 * them would claim coverage nothing can use. Pinned as refused.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * controller restriction dropped -> the witness shows an OPPONENT's creature offered as a legal target; the
 * combat restriction dropped -> a creature sitting at home is offered to Whisk Away.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { applyZoneMove } from "./effects/atoms/zones.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OWN = "put target creature you control on top of its owner's library";
const COMBAT = "put target attacking or blocking creature on top of its owner's library";
const parse = (s) => parseEffectClause(splitClauses(s)[0], "Instant");

describe("the restriction reaches the atom", () => {
  it("⭐ you-control carries the controller restriction", () => {
    const p = parse(OWN);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "tuck", targetType: "creature", where: "top", restrictions: [{ kind: "controller", who: "you" }] }]);
  });

  it("⭐ attacking-or-blocking carries the combat restriction", () => {
    expect(parse(COMBAT).atoms).toEqual([{ op: "tuck", targetType: "creature", where: "top", restrictions: [{ kind: "combat", value: "either" }] }]);
  });

  it("⛔ the BARE form is untouched — no restrictions key appears on it", () => {
    expect(parse("put target creature on top of its owner's library").atoms).toEqual([{ op: "tuck", targetType: "creature", where: "top" }]);
  });

  it("⭐ bare 'attacking' / 'blocking' now ride the ④-AE combat-role peel (2026-09-03) — the role word comes off the subject and back as the combat restriction", () => {
    // Pinned REFUSED until ④-AE, "no clean corpus carrier to serve"; the subject peel in parseClauseToAtom now
    // serves every arm at once, this one included — the same `combat` restriction Whisk Away's "either" form carries.
    expect(parse("put target attacking creature on top of its owner's library").atoms)
      .toEqual([{ op: "tuck", targetType: "creature", where: "top", restrictions: [{ kind: "combat", value: "attacking" }] }]);
    expect(parse("put target blocking creature on the bottom of its owner's library").atoms)
      .toEqual([{ op: "tuck", targetType: "creature", where: "bottom", restrictions: [{ kind: "combat", value: "blocking" }] }]);
  });

  it("⭐ the whole cards flip, both families", () => {
    expect(classifyCard({ name: "Nightscape Apprentice", type: "Creature — Zombie Wizard", mana: "{B}", power: "1", toughness: "1",
      oracle: "{U}, {T}: Put target creature you control on top of its owner's library.\n{R}, {T}: Target creature gains first strike until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Whisk Away", type: "Instant", mana: "{2}{U}", oracle: "Put target attacking or blocking creature on top of its owner's library." })).toBe("native-spell");
  });
});

describe("⭐⭐ LAW 6 — the restriction is enforced at ENUMERATION, where an illegal target would be born", () => {
  /** user controls "mine"; ai controls "theirs". `attackers` lists ids currently attacking. */
  function board({ attackers = [] } = {}) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller, summoningSick: false });
    return { ...g,
      players: { ...g.players, user: { ...g.players.user, battlefield: [mk("mine", "user")], library: [] }, ai: { ...g.players.ai, battlefield: [mk("theirs", "ai")], library: [] } },
      combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })), blockers: [] } };
  }
  const offered = (state, clause) => expandCastChoices(state, "user", parse(clause), [], {}).flatMap((c) => (c.targets || []).map((t) => t.id)).sort();

  it("⭐⭐ 'you control' offers ONLY your creature — never the opponent's", () => {
    const row = { ownClause: offered(board(), OWN), bareClause: offered(board(), "put target creature on top of its owner's library") };
    console.log("  WITNESS scopedTuck/controller", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ownClause: ["mine"], bareClause: ["mine", "theirs"] });
  });

  it("⭐⭐ 'attacking or blocking' offers only the creature actually in combat", () => {
    const row = { noCombat: offered(board(), COMBAT), theirsAttacking: offered(board({ attackers: ["theirs"] }), COMBAT) };
    console.log("  WITNESS scopedTuck/combat", JSON.stringify(row));
    // ⛔ noCombat empty is the pin: with no attackers declared, Whisk Away has NO legal target at all.
    expect(row).toEqual({ noCombat: [], theirsAttacking: ["theirs"] });
  });

  it("⭐ and the chosen creature really lands on top of its owner's library", () => {
    const s = board();
    const after = applyZoneMove(s, parse(OWN).atoms[0], { targets: [{ id: "mine", type: "creature", controller: "user" }], controller: "user" }, "library", true);
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual([]);
    expect(after.players.user.library[0]?.name).toBe("mine");
  });
});
