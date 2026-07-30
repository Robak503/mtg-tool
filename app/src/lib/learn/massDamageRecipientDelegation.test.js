/**
 * massDamageRecipientDelegation.test.js — the mass-damage RECIPIENT vocabulary, delegated (25 cards).
 *
 * THE AXIS. `massFilteredDamageClauseParser` hand-rolled two filters — `with|without flying` and
 * `you control|your opponents control` — while `creatureSatisfiesRestrictions` already enforced SIXTEEN kinds
 * on that very sweep (typeNeg, colorNeg, subtype, tapped, combat, power, toughness, manaValue, cardType …).
 * Single-target removal reaches all of them by delegating its recipient phrase to the shared
 * `parseCreatureTargetRestrictions` grammar. The mass arm now delegates too, so the vocabulary arrives whole:
 * Whipflare (nonartifact), Sandstorm (attacking), Calamity of Cinders (untapped), Scorch the Fields (Human),
 * Oros (nonwhite), Fang Dragon's adventure (you don't control), Leonin Bladetrap (attacking AND non-flying).
 *
 * THREE GATES had to open, and they are listed in the order a clause meets them:
 *   1. splitClauses' SYMBURN-1 keep-whole guard — `\d+` + the BARE form only, so it SHATTERED every filtered
 *      and every X-amount "…and each player" sentence. Hurricane split into a half that parsed HIGH on its
 *      own plus an unbindable "each player".
 *   2. massFilteredDamageClauseParser — the delegating arm, placed LAST so the four exact matchers above it
 *      stay byte-identical (the ordering rule).
 *   3. applyDamageEffect's `eachCreatureAndPlayer` branch — it never filtered its creature half, because until
 *      now no parse arm could hand it a restriction. Shipping gate 2 without gate 3 would make Hurricane burn
 *      the whole board.
 *
 * ⛔ THE TWO GUARDS THAT CARRY THE FP RISK, both pinned at RUNTIME below, not just at the parser:
 *   A. "OTHER" IS PEELED, NEVER DELEGATED. parseCreatureTargetRestrictions treats "other" as filler and
 *      silently strips it, so delegating "each other creature you control" would come back clean carrying only
 *      a controller restriction — and the source would damage ITSELF (CR 113.7). Harbinger of the Hunt and
 *      Scourge of Kher Ridges are flying Dragons whose second ability hits "each other creature with flying";
 *      losing the peel makes each Dragon nuke itself.
 *   B. `clean === false` REFUSES. An unmodeled qualifier ("each creature dealt damage this turn", "each
 *      creature blocking it") must park on the Arbiter rather than resolve against the wrong set.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (clause, type = "Sorcery", opts = { hasX: false }) => (parseEffectClause(clause, type, opts)?.atoms || [])[0] || null;
const dmg = (s, side, id) => (s.players[side].battlefield.find((p) => p.id === id)?.damageMarked || 0);
const life = (s, side) => s.players[side].life;

describe("⭐ the delegated recipient vocabulary — kinds the hand-rolled arms could never say", () => {
  const CASES = [
    ["Whipflare deals 2 damage to each nonartifact creature.", "eachCreature", [{ kind: "typeNeg", type: "artifact" }]],
    ["Oros deals 3 damage to each nonwhite creature.", "eachCreature", [{ kind: "colorNeg", color: "W" }]],
    ["Scorch the Fields deals 1 damage to each Human creature.", "eachCreature", [{ kind: "subtype", subtype: "human" }]],
    ["Calamity of Cinders deals 6 damage to each untapped creature.", "eachCreature", [{ kind: "tapped", value: false }]],
    ["Sandstorm deals 1 damage to each attacking creature.", "eachCreature", [{ kind: "combat", value: "attacking" }]],
    ["Forktail Sweep deals 1 damage to each creature you don't control.", "eachCreature", [{ kind: "controller", who: "opponent" }]],
  ];
  for (const [clause, tt, restrictions] of CASES) {
    it(`«${clause.slice(0, 62)}…» → ${tt} + ${restrictions[0].kind}`, () => {
      expect(atomOf(clause)).toEqual({ op: "deal-damage", amount: expect.any(Number), targetType: tt, restrictions });
    });
  }

  it("⭐ TWO restrictions COMPOSE — Leonin Bladetrap's 'each attacking creature without flying'", () => {
    // The crossing the hand-rolled arms structurally could not express: one regex per printed phrase can
    // never produce a two-restriction set. Delegation gets it for free, in printed order.
    expect(atomOf("It deals 2 damage to each attacking creature without flying.", "Artifact")).toEqual({
      op: "deal-damage", amount: 2, targetType: "eachCreature",
      restrictions: [{ kind: "combat", value: "attacking" }, { kind: "hasKeyword", keyword: "flying", negate: true }],
    });
  });
});

describe("⭐ gate 1 — the splitter no longer shatters a FILTERED or X-amount '…and each player'", () => {
  it("a filtered creature half + each player survives as ONE clause", () => {
    expect(splitClauses("Volcanic Spray deals 1 damage to each creature without flying and each player."))
      .toEqual(["Volcanic Spray deals 1 damage to each creature without flying and each player"]);
  });

  it("⭐ the X form too — the splitter runs BEFORE the X→sentinel rewrite, so it sees a literal X", () => {
    expect(splitClauses("Hurricane deals X damage to each creature with flying and each player."))
      .toEqual(["Hurricane deals X damage to each creature with flying and each player"]);
    const a = atomOf("Hurricane deals X damage to each creature with flying and each player.", "Sorcery", { hasX: true });
    expect(a).toEqual({ op: "deal-damage", amountX: true, targetType: "eachCreatureAndPlayer", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] });
  });

  it("⛔ the SUBJECT-PREFIX guard still holds — a LEADING effect joined by ' and ' must still split", () => {
    // If this sentence were kept whole, the "You gain 5 life" half would be silently DROPPED. That guard is
    // the reason the keep-whole regex checks for a top-level " and " before the verb, and widening the
    // recipient must not have relaxed it.
    const parts = splitClauses("You gain 5 life and Nameless deals 2 damage to each creature with flying and each player.");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toMatch(/^You gain 5 life$/);
  });

  it("⛔ a qualifier on the PLAYER half still fails the tail anchor → splits → parks", () => {
    expect(atomOf("Nameless deals 2 damage to each creature with flying and each player who controls a Mountain.")).toBe(null);
  });
});

describe("⛔⭐ GUARD A — 'other' is PEELED, so a source never damages itself", () => {
  it("parser: 'each other creature <filter>' keeps the source-excluding scope", () => {
    expect(atomOf("This creature deals 6 damage to each other creature with flying.", "Creature")).toEqual({
      op: "deal-damage", amount: 6, targetType: "eachOtherCreature",
      restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }],
    });
    expect(atomOf("This creature deals 2 damage to each other creature you control.", "Creature")).toEqual({
      op: "deal-damage", amount: 2, targetType: "eachOtherCreature",
      restrictions: [{ kind: "controller", who: "you" }],
    });
  });

  it("⛔⭐ RUNTIME: Scourge of Kher Ridges is a FLYER wiping other flyers — it must not hit itself", () => {
    // ⚠️ WHAT THIS TEST DOES AND DOES NOT CATCH, stated exactly, because the mutation run corrected me.
    // Guard A is a TWO-LINK chain: (1) the parser must emit eachOtherCreature for an "other" phrase, and
    // (2) the runtime must actually skip the source for that scope. Forcing isOther=false was caught by the
    // PARSER assertion above, not by this one — this test hand-builds its atom, so it cannot see a parse-side
    // regression. It pins link 2: that eachOtherCreature + a restriction spares the source while still
    // filtering. Both links are pinned; neither test covers both.
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, ctrl, kws) => createPermanent({ id, card: { id, name: id, type: "Creature — Dragon", power: 4, toughness: 9, keywords: kws }, controller: ctrl });
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [mk("src", "user", ["flying"]), mk("u-fly", "user", ["flying"]), mk("u-ground", "user", [])] },
      ai: { ...s.players.ai, battlefield: [mk("a-fly", "ai", ["flying"])] } } };
    const after = resolveAtom(s, { op: "deal-damage", amount: 6, targetType: "eachOtherCreature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }, { controller: "user", sourceId: "src" });
    expect(dmg(after, "user", "src")).toBe(0);       // ⛔ the source is spared
    expect(dmg(after, "user", "u-fly")).toBe(6);
    expect(dmg(after, "ai", "a-fly")).toBe(6);
    expect(dmg(after, "user", "u-ground")).toBe(0);  // the filter still applies
  });

  it("⛔ 'each other creature … and each player' is REFUSED — no combined source-excluding scope exists", () => {
    // Conductor of Cacophony is the only printed carrier. Inventing a fourth targetType to reach one card
    // would risk either the exclusion or the player half; it parks instead (a SAFE FN).
    expect(atomOf("Nameless deals 1 damage to each other creature and each player.", "Creature")).toBe(null);
  });
});

describe("⛔⭐ GUARD B — an unmodeled qualifier leaves residue and REFUSES", () => {
  const REFUSED = [
    "Inflame deals 2 damage to each creature dealt damage this turn.",
    "Battle-Scarred Goblin deals 1 damage to each creature blocking it.",
    "Flame Sweep deals 2 damage to each creature except for creatures you control with flying.",
    "Simoon deals 2 damage to each creature target opponent controls.",
    "Shadowstorm deals 1 damage to each creature with shadow.",
    "Splatter Technique deals 3 damage to each creature and planeswalker.",
  ];
  for (const clause of REFUSED) {
    it(`⛔ «${clause.slice(0, 58)}…» parks`, () => expect(atomOf(clause)).toBe(null));
  }

  it("⛔ a non-creature mass recipient never reaches the creature grammar", () => {
    expect(atomOf("Nameless deals 2 damage to each planeswalker.")).toBe(null);
  });
});

describe("⛔⭐ gate 3 — the RUNTIME filters the creature half of a combined sweep, never the players", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, ctrl, kws) => createPermanent({ id, card: { id, name: id, type: "Creature — Test", power: 2, toughness: 9, keywords: kws }, controller: ctrl });
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [mk("u-fly", "user", ["flying"]), mk("u-ground", "user", [])] },
      ai: { ...s.players.ai, battlefield: [mk("a-fly", "ai", ["flying"]), mk("a-ground", "ai", [])] } } };
  }

  it("⭐ Hurricane: every FLYER and every PLAYER — ground creatures spared", () => {
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlayer", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }, { controller: "user" });
    expect(dmg(after, "user", "u-fly")).toBe(3);
    expect(dmg(after, "ai", "a-fly")).toBe(3);
    expect(dmg(after, "user", "u-ground")).toBe(0);
    expect(dmg(after, "ai", "a-ground")).toBe(0);
    // ⛔ the PLAYER half is UNFILTERED — a creature predicate says nothing about which seats take damage,
    // and "each player" includes the caster (CR — not "each opponent").
    expect(life(after, "user")).toBe(life(before, "user") - 3);
    expect(life(after, "ai")).toBe(life(before, "ai") - 3);
  });

  it("⭐ Earthquake: the negated twin — ground creatures and every player, flyers spared", () => {
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlayer", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }, { controller: "user" });
    expect(dmg(after, "user", "u-ground")).toBe(3);
    expect(dmg(after, "ai", "a-ground")).toBe(3);
    expect(dmg(after, "user", "u-fly")).toBe(0);
    expect(dmg(after, "ai", "a-fly")).toBe(0);
    expect(life(after, "ai")).toBe(life(before, "ai") - 3);
  });

  it("⛔ THE INCUMBENT IS BYTE-IDENTICAL — an UNRESTRICTED combined sweep still hits everything", () => {
    // Inferno / Fire Tempest / Evincar's Justice pass restrictions=[] and creatureSatisfiesRestrictions over
    // [] is true, so the added filter call is a no-op for every card that shipped before this slice.
    const before = board();
    const after = resolveAtom(before, { op: "deal-damage", amount: 3, targetType: "eachCreatureAndPlayer" }, { controller: "user" });
    for (const [side, id] of [["user", "u-fly"], ["user", "u-ground"], ["ai", "a-fly"], ["ai", "a-ground"]]) {
      expect(dmg(after, side, id), `${side}/${id}`).toBe(3);
    }
    expect(life(after, "user")).toBe(life(before, "user") - 3);
    expect(atomOf("Inferno deals 6 damage to each creature and each player.", "Instant")).toEqual({ op: "deal-damage", amount: 6, targetType: "eachCreatureAndPlayer" });
  });
});

describe("⭐ the cards this slice graduated (classifier end-to-end)", () => {
  const CARDS = [
    { name: "Hurricane", type: "Sorcery", mana: "{X}{G}", oracle: "Hurricane deals X damage to each creature with flying and each player." },
    { name: "Earthquake", type: "Sorcery", mana: "{X}{R}", oracle: "Earthquake deals X damage to each creature without flying and each player." },
    { name: "Whipflare", type: "Sorcery", mana: "{1}{R}", oracle: "Whipflare deals 2 damage to each nonartifact creature." },
    { name: "Sandstorm", type: "Instant", mana: "{G}", oracle: "Sandstorm deals 1 damage to each attacking creature." },
    { name: "Cloudthresher", type: "Creature — Elemental", mana: "{2}{G}{G}{G}{G}", power: 7, toughness: 7, keywords: ["Flash", "Reach"], oracle: "Flash\nReach\nWhen this creature enters, it deals 2 damage to each creature with flying and each player." },
    { name: "Scourge of Kher Ridges", type: "Creature — Dragon", mana: "{6}{R}{R}", power: 6, toughness: 6, keywords: ["Flying"], oracle: "Flying\n{1}{R}: This creature deals 2 damage to each creature without flying.\n{5}{R}: This creature deals 6 damage to each other creature with flying." },
  ];
  for (const card of CARDS) {
    it(`${card.name} is native`, () => expect(isNativeTier(classifyCard(card)), classifyCard(card)).toBe(true));
  }
});
