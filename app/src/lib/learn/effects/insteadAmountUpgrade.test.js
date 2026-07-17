/**
 * insteadAmountUpgrade.test.js — INSTEAD-AMOUNT, the condition-gated ability-word amount upgrade (BLITZ INST-1).
 *
 * The generalization of METALCRAFT-DAMAGE (Galvanic Blast) beyond Metalcraft/artifacts: a spell whose base
 * effect's AMOUNT upgrades when a board condition holds — "<base>. <Ability-word> — <upgraded amount> instead
 * if <condition>" (CR 614 "instead"). The second sentence REWRITES the amount, so the sentence splitter would
 * leave it as residue → low; the matcher collapses it into ONE atom carrying `amountUpgrade` (a scalar amount
 * read via the SHARED resolveScaledAmount) or `ptUpgrade` (a P/T pair read in applyPumpEffect). Both readers
 * evaluate the board condition at RESOLUTION (evaluateInterveningIf, CR 608.2) and swap to the upgraded value
 * ONLY when it holds — the base value otherwise. The condition is gated on a CURATED ability-word →
 * canonical-condition map AND spellConditionParseable, so a mis-reader (the graveyard "permanent cards" count)
 * or a mismatched condition can never apply the bigger amount (the forbidden FP).
 *
 * All oracle text below is the real printed text, verified against the bundled Scryfall corpus.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram } from "./parser.js";
import { resolveAtom } from "./effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, creaturePower, creatureToughness } from "../gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real printed oracle ──────────────────────────────────────────────────────────
const BRIMSTONE_VOLLEY = { name: "Brimstone Volley", type: "Instant", oracle: "Brimstone Volley deals 3 damage to any target.\nMorbid — Brimstone Volley deals 5 damage instead if a creature died this turn." };
const CACKLING_FLAMES = { name: "Cackling Flames", type: "Instant", oracle: "Cackling Flames deals 3 damage to any target.\nHellbent — Cackling Flames deals 5 damage instead if you have no cards in hand." };
const FIRECANNON_BLAST = { name: "Firecannon Blast", type: "Sorcery", oracle: "Firecannon Blast deals 3 damage to target creature.\nRaid — Firecannon Blast deals 6 damage instead if you attacked this turn." };
const FEED_THE_CLAN = { name: "Feed the Clan", type: "Instant", oracle: "You gain 5 life.\nFerocious — You gain 10 life instead if you control a creature with power 4 or greater." };
const HUNGER_OF_THE_HOWLPACK = { name: "Hunger of the Howlpack", type: "Instant", oracle: "Put a +1/+1 counter on target creature.\nMorbid — Put three +1/+1 counters on that creature instead if a creature died this turn." };
const MIRRAN_METTLE = { name: "Mirran Mettle", type: "Instant", oracle: "Target creature gets +2/+2 until end of turn.\nMetalcraft — That creature gets +4/+4 until end of turn instead if you control three or more artifacts." };
const TRAGIC_SLIP = { name: "Tragic Slip", type: "Instant", oracle: "Target creature gets -1/-1 until end of turn.\nMorbid — That creature gets -13/-13 until end of turn instead if a creature died this turn." };
const TRAGIC_FALL = { name: "Tragic Fall", type: "Instant", oracle: "Target creature gets -3/-3 until end of turn.\nHellbent — That creature gets -13/-13 until end of turn instead if you have no cards in hand." };
const GALVANIC_BLAST = { name: "Galvanic Blast", type: "Instant", oracle: "Galvanic Blast deals 2 damage to any target.\nMetalcraft — Galvanic Blast deals 4 damage instead if you control three or more artifacts." };

// ── state builders ───────────────────────────────────────────────────────────────
const base = () => createGameState({ userDeck: [], aiDeck: [] });
// A survivable ai creature to target (big toughness so an upgraded burn/counter doesn't remove it before a read).
const withTarget = (s, power = 4, toughness = 30) => {
  const tgt = createPermanent({ id: "tgt", card: { name: "Ox", type: "Creature — Ox", power, toughness }, controller: "ai" });
  return { s: { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [tgt] } } }, tgt };
};
const setUser = (s, patch) => ({ ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } });
const artifacts = (n) => Array.from({ length: n }, (_, i) => createPermanent({ id: "a" + i, card: { name: "Rock" + i, type: "Artifact" }, controller: "user" }));
const parseAtom = (card) => {
  const p = parseEffectProgram(card);
  expect(p.confidence).toBe("high");
  expect(p.atoms).toHaveLength(1);
  return p.atoms[0];
};

describe("INSTEAD-AMOUNT — recognition (real oracle → one folded atom, HIGH)", () => {
  it("Brimstone Volley — Morbid burn 3 → 5", () => {
    expect(parseAtom(BRIMSTONE_VOLLEY)).toEqual({ op: "deal-damage", amount: 3, targetType: "any", amountUpgrade: { condition: "a creature died this turn", amount: 5 } });
  });
  it("Cackling Flames — Hellbent burn 3 → 5", () => {
    expect(parseAtom(CACKLING_FLAMES)).toEqual({ op: "deal-damage", amount: 3, targetType: "any", amountUpgrade: { condition: "you have no cards in hand", amount: 5 } });
  });
  it("Firecannon Blast — Raid burn to target creature 3 → 6", () => {
    expect(parseAtom(FIRECANNON_BLAST)).toEqual({ op: "deal-damage", amount: 3, targetType: "creature", amountUpgrade: { condition: "you attacked this turn", amount: 6 } });
  });
  it("Feed the Clan — Ferocious life 5 → 10", () => {
    expect(parseAtom(FEED_THE_CLAN)).toEqual({ op: "gain-life", amount: 5, targetType: null, amountUpgrade: { condition: "you control a creature with power 4 or greater", amount: 10 } });
  });
  it("Hunger of the Howlpack — Morbid +1/+1 counter 1 → 3", () => {
    expect(parseAtom(HUNGER_OF_THE_HOWLPACK)).toEqual({ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature", amountUpgrade: { condition: "a creature died this turn", amount: 3 } });
  });
  it("Mirran Mettle — Metalcraft pump +2/+2 → +4/+4 (ptUpgrade)", () => {
    expect(parseAtom(MIRRAN_METTLE)).toEqual({ op: "pump", ptDelta: { p: 2, t: 2 }, targetType: "creature", duration: "endOfTurn", ptUpgrade: { condition: "you control three or more artifacts", ptDelta: { p: 4, t: 4 } } });
  });
  it("Tragic Slip — Morbid debuff -1/-1 → -13/-13 (ptUpgrade)", () => {
    expect(parseAtom(TRAGIC_SLIP)).toEqual({ op: "pump", ptDelta: { p: -1, t: -1 }, targetType: "creature", duration: "endOfTurn", ptUpgrade: { condition: "a creature died this turn", ptDelta: { p: -13, t: -13 } } });
  });
  it("Tragic Fall — Hellbent debuff -3/-3 → -13/-13 (ptUpgrade)", () => {
    expect(parseAtom(TRAGIC_FALL)).toEqual({ op: "pump", ptDelta: { p: -3, t: -3 }, targetType: "creature", duration: "endOfTurn", ptUpgrade: { condition: "you have no cards in hand", ptDelta: { p: -13, t: -13 } } });
  });
  it("Galvanic Blast is UNTOUCHED — still the metalcraft {kind:artifactsYouControl} shape (byte-identical)", () => {
    expect(parseAtom(GALVANIC_BLAST)).toEqual({ op: "deal-damage", amount: 2, targetType: "any", amountUpgrade: { kind: "artifactsYouControl", atLeast: 3, amount: 4 } });
  });
});

describe("INSTEAD-AMOUNT — runtime: base amount when the condition is off, upgraded when it holds (read at resolution)", () => {
  it("BURN (Brimstone Volley, Morbid): 3 damage with no death this turn, 5 after a creature died", () => {
    const atom = parseAtom(BRIMSTONE_VOLLEY);
    const mk = (died) => { const { s } = withTarget(base()); return died ? setUser(s, { creaturesDiedThisTurn: 1 }) : s; };
    const hit = (s) => resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt" }] });
    expect(findPermanent(hit(mk(false)), "tgt").permanent.damageMarked).toBe(3); // Morbid OFF
    expect(findPermanent(hit(mk(true)), "tgt").permanent.damageMarked).toBe(5);  // Morbid ON
  });

  it("LIFE (Feed the Clan, Ferocious): gain 5 with no big creature, 10 with a power-4 creature", () => {
    const atom = parseAtom(FEED_THE_CLAN);
    const mk = (pw) => setUser(base(), { life: 20, battlefield: [createPermanent({ id: "c", card: { name: "Beast", type: "Creature — Beast", power: pw, toughness: 5 }, controller: "user" })] });
    const life = (s) => resolveAtom(s, atom, { controller: "user", targets: [] }).players.user.life;
    expect(life(mk(2))).toBe(25); // Ferocious OFF (power 2)
    expect(life(mk(4))).toBe(30); // Ferocious ON  (power 4)
  });

  it("COUNTER (Hunger of the Howlpack, Morbid): +1/+1 x1 with no death, x3 after a creature died", () => {
    const atom = parseAtom(HUNGER_OF_THE_HOWLPACK);
    const mk = (died) => { const { s } = withTarget(base()); return died ? setUser(s, { creaturesDiedThisTurn: 1 }) : s; };
    const ctr = (s) => findPermanent(resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "tgt" }] }), "tgt").permanent.counters?.["+1/+1"] || 0;
    expect(ctr(mk(false))).toBe(1); // Morbid OFF
    expect(ctr(mk(true))).toBe(3);  // Morbid ON
  });

  it("PUMP (Mirran Mettle, Metalcraft): +2/+2 under 3 artifacts, +4/+4 at 3+ (read at resolution)", () => {
    const atom = parseAtom(MIRRAN_METTLE);
    const pt = (nArts) => {
      const { s: s0, tgt } = withTarget(base(), 3, 3);
      const s = setUser(s0, { battlefield: artifacts(nArts) });
      const next = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: tgt.id }] });
      const lk = findPermanent(next, tgt.id).permanent;
      return `${creaturePower(lk, next)}/${creatureToughness(lk, next)}`;
    };
    expect(pt(2)).toBe("5/5"); // Metalcraft OFF (3/3 base + 2/2)
    expect(pt(3)).toBe("7/7"); // Metalcraft ON  (3/3 base + 4/4)
  });

  it("DEBUFF (Tragic Slip, Morbid): -1/-1 with no death, -13/-13 after a creature died", () => {
    const atom = parseAtom(TRAGIC_SLIP);
    const pt = (died) => {
      const { s: s0, tgt } = withTarget(base(), 20, 20);
      const s = died ? setUser(s0, { creaturesDiedThisTurn: 1 }) : s0;
      const next = resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: tgt.id }] });
      const lk = findPermanent(next, tgt.id);
      return lk ? `${creaturePower(lk.permanent, next)}/${creatureToughness(lk.permanent, next)}` : "DEAD";
    };
    expect(pt(false)).toBe("19/19"); // Morbid OFF (20/20 - 1/1)
    expect(pt(true)).toBe("7/7");    // Morbid ON  (20/20 - 13/13)
  });
});

describe("INSTEAD-AMOUNT — CREED park guards (whole-card-or-park; a mis-readable/mismatched condition never upgrades)", () => {
  const foldFields = (card) => {
    const p = parseEffectProgram(card);
    const atoms = p?.atoms || [];
    return atoms.some((a) => a.amountUpgrade?.condition || a.ptUpgrade);
  };

  it("Descend (Join the Dead) PARKS — the graveyard 'permanent cards' count is a mis-reader; never folded", () => {
    // "there are four or more permanent cards in your graveyard": the reader would scan \bPermanent\b in type
    // lines (always 0), so it's NOT in the curated map → the whole card stays LOW (arbiter-spell).
    const JOIN_THE_DEAD = { name: "Join the Dead", type: "Instant", oracle: "Target creature gets -5/-5 until end of turn.\nDescend 4 — That creature gets -10/-10 until end of turn instead if there are four or more permanent cards in your graveyard." };
    expect(foldFields(JOIN_THE_DEAD)).toBe(false);
    expect(parseEffectProgram(JOIN_THE_DEAD).confidence).not.toBe("high");
  });

  it("Threshold mana (Cabal Ritual) PARKS — 'seven or more cards in your graveyard' has no reader", () => {
    const CABAL_RITUAL = { name: "Cabal Ritual", type: "Instant", oracle: "Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard." };
    expect(foldFields(CABAL_RITUAL)).toBe(false);
  });

  it("Reworded upgrade (Arrow Storm, Raid) PARKS — the upgrade adds 'damage can't be prevented', not a pure swap", () => {
    const ARROW_STORM = { name: "Arrow Storm", type: "Sorcery", oracle: "Arrow Storm deals 4 damage to any target.\nRaid — If you attacked this turn, instead Arrow Storm deals 5 damage to that permanent or player and the damage can't be prevented." };
    expect(foldFields(ARROW_STORM)).toBe(false);
    expect(parseEffectProgram(ARROW_STORM).confidence).not.toBe("high");
  });

  it("X amount (Crater's Claws, Ferocious) PARKS — 'X plus 2' is not a fixed numeral", () => {
    const CRATERS_CLAWS = { name: "Crater's Claws", type: "Sorcery", oracle: "Crater's Claws deals X damage to any target.\nFerocious — Crater's Claws deals X plus 2 damage instead if you control a creature with power 4 or greater." };
    expect(foldFields(CRATERS_CLAWS)).toBe(false);
  });

  it("mismatched ability-word / condition PARKS — Morbid printed with the Metalcraft condition is not canonical", () => {
    // A crafted card: the ability word is Morbid but the printed condition is Metalcraft's. The curated exact
    // match rejects it (Morbid's canonical condition is "a creature died this turn") → never a fabricated swap.
    const MISMATCH = { name: "Fake Morbid Bolt", type: "Instant", oracle: "Fake Morbid Bolt deals 3 damage to any target.\nMorbid — Fake Morbid Bolt deals 5 damage instead if you control three or more artifacts." };
    expect(foldFields(MISMATCH)).toBe(false);
  });
});
