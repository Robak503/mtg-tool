/**
 * drainByCount.test.js — BLITZ FE-1: FOR-EACH / count-scaled spell magnitudes.
 *
 * Two count-binding gaps, both reusing EXISTING count evaluators (parseCountSource → countForSpec) and
 * EXISTING effect atoms (deal-damage amountCount, gain-life amountCount) — nothing new is counted, only
 * newly BOUND:
 *
 *   DRAIN-BY-COUNT (matchDrainByCount, a fused whole-oracle matcher before splitClauses) — the "deal X and
 *   gain X, where X is the number of <count>" compound: Tendrils of Corruption (Swamps → target creature),
 *   Consuming Corruption (Swamps → target creature or planeswalker), Harsh Sustenance (creatures you control
 *   → any target). The single "where X is the number of <count>" governs BOTH halves (CR templating), so the
 *   top-level " and " split would shatter it and silently drop the lifegain — a forbidden partial. Matched
 *   whole and emitted as [gain-life, deal-damage], both bound to the SAME controller count. CREED — X LOCKED
 *   ONCE (CR 107.3b): gain-life is emitted FIRST so its count is read off the PRE-damage board; gaining life
 *   never mutates a permanent count, so the deal-damage atom then reads the identical value even when the
 *   damage kills a counted creature (Harsh Sustenance targeting your own).
 *
 *   MASS-SCALE (dealDamageScaledClauseParser "each creature") — Gates Ablaze "deals X damage to each creature,
 *   where X is the number of Gates you control": the bare eachCreature board sweep, scaled by a controller
 *   board count. Reuses the eachCreature deal-damage path verbatim; only the target-allowlist entry is new.
 *
 * FN guards: Corrupt (its lifegain is "the damage DEALT this way" — a different, prevention-sensitive
 * mechanism, NOT the count) parks; an unmodeled count (Clerics on the battlefield) parks; an opponent-scoped
 * count ("creatures they control") has no anaphoric referent on a controller drain → parks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const prog = (card) => parseEffectProgram(card);
const conf = (card) => { const p = parseEffectProgram(card); return p ? programConfidence(p) : "low"; };

// Real oracle text + type (verified against the bundled Scryfall index — see census). Inline objects
// (the house pattern) so the test needs no live card-index sync; classifyCard reads the card directly.
const REAL = {
  "Tendrils of Corruption": { name: "Tendrils of Corruption", type: "Instant", oracle: "Tendrils of Corruption deals X damage to target creature and you gain X life, where X is the number of Swamps you control." },
  "Consuming Corruption": { name: "Consuming Corruption", type: "Sorcery", oracle: "Consuming Corruption deals X damage to target creature or planeswalker and you gain X life, where X is the number of Swamps you control." },
  "Harsh Sustenance": { name: "Harsh Sustenance", type: "Instant", oracle: "Harsh Sustenance deals X damage to any target and you gain X life, where X is the number of creatures you control." },
  "Gates Ablaze": { name: "Gates Ablaze", type: "Sorcery", oracle: "Gates Ablaze deals X damage to each creature, where X is the number of Gates you control." },
  "Corrupt": { name: "Corrupt", type: "Sorcery", oracle: "Corrupt deals damage to any target equal to the number of Swamps you control. You gain life equal to the damage dealt this way." },
};
const realCard = (name) => REAL[name];

function creature(id, { power = 1, toughness = 5, subtype = "Beast", controller = "user" } = {}) {
  return createPermanent({ id, card: { id: `c-${id}`, name: id, type: `Creature — ${subtype}`, power, toughness }, controller, summoningSick: false });
}
function landPerm(id, sub, controller = "user") {
  return createPermanent({ id, card: { id: `c-${id}`, name: sub, type: `Basic Land — ${sub}` }, controller });
}
function gatePerm(id, controller = "user") {
  return createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Land — Gate" }, controller });
}
function stateWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "main1", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library: [], life: over.userLife ?? 40, hand: [] },
      ai: { ...s.players.ai, battlefield: over.ai || [], library: [], life: over.aiLife ?? 40 },
    },
  };
}
// Resolve every atom in the program in order (the shared runner threads ctx per atom).
function castProgram(s, p, ctx) {
  let n = s;
  for (const atom of p.atoms) n = resolveAtom(n, atom, ctx);
  return n;
}
const dmgOf = (s, pid, id) => (s.players[pid].battlefield.find((x) => x.id === id)?.damageMarked || 0);
const alive = (s, pid, id) => !!s.players[pid].battlefield.find((x) => x.id === id);

// ────────────────────────────────────────────────────────────────────────────
// RECOGNITION — real oracle (via cardIndex), whole-compound program shape
// ────────────────────────────────────────────────────────────────────────────
describe("DRAIN-BY-COUNT — recognition on the real oracle", () => {
  it("Tendrils of Corruption → [gain-life, deal-damage] both bound to the Swamp count; native-spell", () => {
    expect(classifyCard(realCard("Tendrils of Corruption"))).toBe("native-spell");
    const p = prog(realCard("Tendrils of Corruption"));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toMatchObject([
      { op: "gain-life", amountCount: { kind: "permanentsYouControl", subtype: "Swamp", per: 1 }, targetType: null },
      { op: "deal-damage", targetType: "creature", amountCount: { kind: "permanentsYouControl", subtype: "Swamp", per: 1 } },
    ]);
    // the deal-damage atom still enumerates a chosen creature target (a real single-target burn)
    expect(programNeedsChosenTarget(p)).toBe(true);
  });

  it("Consuming Corruption → target creature or planeswalker, Swamp count; native-spell", () => {
    expect(classifyCard(realCard("Consuming Corruption"))).toBe("native-spell");
    const p = prog(realCard("Consuming Corruption"));
    expect(p.atoms).toMatchObject([
      { op: "gain-life", amountCount: { kind: "permanentsYouControl", subtype: "Swamp", per: 1 } },
      { op: "deal-damage", targetType: "creatureOrPlaneswalker", amountCount: { kind: "permanentsYouControl", subtype: "Swamp", per: 1 } },
    ]);
  });

  it("Harsh Sustenance → any target, creatures-you-control count; native-spell", () => {
    expect(classifyCard(realCard("Harsh Sustenance"))).toBe("native-spell");
    const p = prog(realCard("Harsh Sustenance"));
    expect(p.atoms).toMatchObject([
      { op: "gain-life", amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } },
      { op: "deal-damage", targetType: "any", amountCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } },
    ]);
  });

  it("Gates Ablaze → eachCreature mass damage bound to the Gate count; native-spell", () => {
    expect(classifyCard(realCard("Gates Ablaze"))).toBe("native-spell");
    const p = prog(realCard("Gates Ablaze"));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toMatchObject([
      { op: "deal-damage", targetType: "eachCreature", amountCount: { kind: "permanentsYouControl", subtype: "Gate" } },
    ]);
    expect(programNeedsChosenTarget(p)).toBe(false); // a mass wipe — no chosen target
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RUNTIME magnitude pins — damage = count AND life = count, read at resolution
// ────────────────────────────────────────────────────────────────────────────
describe("DRAIN-BY-COUNT — runtime magnitude (Tendrils of Corruption)", () => {
  it("3 Swamps → target creature takes 3, controller gains 3 (both = the SAME count)", () => {
    const p = prog(realCard("Tendrils of Corruption"));
    let s = stateWith({
      user: [landPerm("s1", "Swamp"), landPerm("s2", "Swamp"), landPerm("s3", "Swamp")],
      ai: [creature("victim", { toughness: 5, controller: "ai" })],
    });
    s = castProgram(s, p, { controller: "user", targets: [{ type: "creature", id: "victim", controller: "ai" }] });
    expect(dmgOf(s, "ai", "victim")).toBe(3); // damage = Swamp count
    expect(s.players.user.life).toBe(43);     // life = the SAME count
  });

  it("DYNAMIC: a 4th Swamp added before resolution scales BOTH damage and life to 4 (read AT RESOLUTION)", () => {
    const p = prog(realCard("Tendrils of Corruption"));
    let s = stateWith({
      user: [landPerm("s1", "Swamp"), landPerm("s2", "Swamp"), landPerm("s3", "Swamp"), landPerm("s4", "Swamp")],
      ai: [creature("victim", { toughness: 6, controller: "ai" })],
    });
    s = castProgram(s, p, { controller: "user", targets: [{ type: "creature", id: "victim", controller: "ai" }] });
    expect(dmgOf(s, "ai", "victim")).toBe(4);
    expect(s.players.user.life).toBe(44);
  });

  it("SCOPE: counts the CONTROLLER's Swamps only — an opponent's Swamps never inflate it (3, not 5)", () => {
    const p = prog(realCard("Tendrils of Corruption"));
    let s = stateWith({
      user: [landPerm("s1", "Swamp"), landPerm("s2", "Swamp"), landPerm("s3", "Swamp")],
      ai: [landPerm("o1", "Swamp", "ai"), landPerm("o2", "Swamp", "ai"), creature("victim", { toughness: 5, controller: "ai" })],
    });
    s = castProgram(s, p, { controller: "user", targets: [{ type: "creature", id: "victim", controller: "ai" }] });
    expect(dmgOf(s, "ai", "victim")).toBe(3); // user's 3 Swamps, NOT 3+2
    expect(s.players.user.life).toBe(43);
  });

  it("CREED: 0 Swamps → 0 damage, 0 life gained (clean no-op, never forced to 1)", () => {
    const p = prog(realCard("Tendrils of Corruption"));
    let s = stateWith({ user: [], ai: [creature("victim", { toughness: 5, controller: "ai" })] });
    s = castProgram(s, p, { controller: "user", targets: [{ type: "creature", id: "victim", controller: "ai" }] });
    expect(dmgOf(s, "ai", "victim")).toBe(0);
    expect(s.players.user.life).toBe(40);
    expect(alive(s, "ai", "victim")).toBe(true);
  });
});

describe("DRAIN-BY-COUNT — X LOCKED ONCE off-by-one guard (Harsh Sustenance)", () => {
  it("count 'creatures you control' + own-creature target: life = the FULL count even though the damage kills one", () => {
    // 2 creatures you control (count = 2); target your OWN c1 (toughness 1 — dies to 2 damage). gain-life is
    // emitted FIRST, so it reads the count off the PRE-damage board (2) and gains 2; the deal-damage atom then
    // reads the SAME 2 and kills c1. Result: life = 42 (the full locked count) with only ONE creature left —
    // exactly CR 107.3b. Were the order reversed, the gain would read the post-death count (1) → life 41 (WRONG).
    const p = prog(realCard("Harsh Sustenance"));
    let s = stateWith({ user: [creature("c1", { toughness: 1 }), creature("c2", { toughness: 5 })] });
    s = castProgram(s, p, { controller: "user", targets: [{ type: "creature", id: "c1", controller: "user" }] });
    expect(s.players.user.life).toBe(42);      // gained the full count of 2, NOT 1
    expect(alive(s, "user", "c1")).toBe(false); // the damage killed the counted creature
    expect(alive(s, "user", "c2")).toBe(true);
    // the deal-damage atom is second in the program — the ordering IS the guarantee
    expect(p.atoms[0].op).toBe("gain-life");
    expect(p.atoms[1].op).toBe("deal-damage");
  });
});

describe("MASS-SCALE — Gates Ablaze (eachCreature by count)", () => {
  it("2 Gates → every creature on every battlefield takes 2 (a controller-scoped magnitude, a symmetric sweep)", () => {
    const p = prog(realCard("Gates Ablaze"));
    let s = stateWith({
      user: [gatePerm("g1"), gatePerm("g2"), creature("mine", { toughness: 5 })],
      ai: [creature("theirs", { toughness: 5, controller: "ai" })],
    });
    s = castProgram(s, p, { controller: "user", targets: [] });
    expect(dmgOf(s, "user", "mine")).toBe(2);
    expect(dmgOf(s, "ai", "theirs")).toBe(2);
  });

  it("DYNAMIC + CREED: 3 Gates → 3 to each; 0 Gates → 0 (no fabricated wipe)", () => {
    const p = prog(realCard("Gates Ablaze"));
    let s3 = stateWith({ user: [gatePerm("g1"), gatePerm("g2"), gatePerm("g3"), creature("mine", { toughness: 6 })], ai: [creature("theirs", { toughness: 6, controller: "ai" })] });
    s3 = castProgram(s3, p, { controller: "user", targets: [] });
    expect(dmgOf(s3, "user", "mine")).toBe(3);
    expect(dmgOf(s3, "ai", "theirs")).toBe(3);
    let s0 = stateWith({ user: [creature("mine", { toughness: 6 })], ai: [creature("theirs", { toughness: 6, controller: "ai" })] });
    s0 = castProgram(s0, p, { controller: "user", targets: [] });
    expect(dmgOf(s0, "user", "mine")).toBe(0);
    expect(dmgOf(s0, "ai", "theirs")).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FN GUARDS — the un-modeled siblings STAY parked (false-neg safe, never a wrong native)
// ────────────────────────────────────────────────────────────────────────────
describe("DRAIN-BY-COUNT — FN guards (never a wrong native)", () => {
  it("Corrupt PARKS: its lifegain is 'the damage DEALT this way' (a different, prevention-sensitive mechanism), NOT the count", () => {
    expect(classifyCard(realCard("Corrupt"))).toBe("arbiter-spell");
    expect(conf(I("Corrupt deals damage to any target equal to the number of Swamps you control. You gain life equal to the damage dealt this way."))).toBe("low");
  });

  it("an UNMODELED count ('Clerics on the battlefield' — Profane Prayers) PARKS → Arbiter", () => {
    expect(conf(I("Profane Prayers deals X damage to any target and you gain X life, where X is the number of Clerics on the battlefield."))).toBe("low");
  });

  it("an OPPONENT-scoped count ('creatures they control') has no referent on a controller drain → PARKS", () => {
    expect(conf(I("It deals X damage to any target and you gain X life, where X is the number of creatures they control."))).toBe("low");
  });

  it("a compound with a THIRD clause (a 3-way 'draws X cards' rider — Together as One) is not this shape → PARKS", () => {
    expect(conf(I("Target player draws X cards, it deals X damage to any target, and you gain X life, where X is the number of Swamps you control."))).toBe("low");
  });
});
