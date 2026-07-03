/**
 * Lane B1 — AI cast-target discipline pins (AI-F1 / AI-F2 / AI-F11 / AI-F12).
 *
 * AI-F1 — the kicked-cast branch used to bypass ALL target discipline: pickCastAction
 * short-circuited on the first `kicked:true` action, so a kicked TARGETED spell was
 * aimed at the first enumerated target combo — seat-order enumeration that put the
 * AI's OWN permanents first (self-bounce with Into the Roil). Kicked variants now run
 * the SAME discipline cascade as unkicked casts (kicked preferred when approved);
 * kicker creatures (always targets:[]) keep the legacy prefer-kicked pick bit-for-bit.
 *
 * AI-F2 — a LOW-confidence instant/sorcery with ZERO runnable atoms resolves as
 * markPendingArbiter and VANISHES in self-play (the Tier-1 census's spell-unresolved
 * rows: Ember Island Production / Reality Shift / Teferi's Protection). The AI now
 * HOLDS these (ranking only — the action stays offered; THE CREED gates no legality);
 * policy { unresolvable: "v1" } recovers the legacy cast-it-anyway for the A/B probe.
 *
 * AI-F11 — POLICY_KEYS is exported so the probe derives `--legacy=all` from the one
 * real list instead of a hand-copied one that silently dropped new subsystems.
 *
 * AI-F12 — a mixed-target X group (targeted-unscorable variants + an untargeted
 * "up to …" decline) used to be held forever; the decline fallback now casts the
 * best untargeted variant at max X. An all-targeted unscorable group stays held.
 *
 * All card fixtures are REAL printed cards with exact Scryfall oracle text.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) ─────────────────────────────
const INTO_THE_ROIL = { name: "Into the Roil", type: "Instant", mana: "{1}{U}",
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." };
const HURLOON_BATTLE_HYMN = { name: "Hurloon Battle Hymn", type: "Instant", mana: "{2}{R}",
  oracle: "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nHurloon Battle Hymn deals 4 damage to target creature or planeswalker. If this spell was kicked, you gain 4 life." };
const TEFERIS_PROTECTION = { name: "Teferi's Protection", type: "Instant", mana: "{2}{W}",
  oracle: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection." };
const REALITY_SHIFT = { name: "Reality Shift", type: "Instant", mana: "{1}{U}",
  oracle: "Exile target creature. Its controller manifests the top card of their library. (That player puts the top card of their library onto the battlefield face down as a 2/2 creature. If it's a creature card, it can be turned face up any time for its mana cost.)" };
const EMBER_ISLAND_PRODUCTION = { name: "Ember Island Production", type: "Sorcery", mana: "{3}{U}{U}",
  oracle: "Choose one —\n• Create a token that's a copy of target creature you control, except it's not legendary and it's a 4/4 Hero in addition to its other types.\n• Create a token that's a copy of target creature an opponent controls, except it's not legendary and it's a 2/2 Coward in addition to its other types." };

// ── State scaffolding: the AI holds priority in its own main phase ──────────────
function aiMainState({ hand = [], mana = {}, board = [], oppBoard = [] } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
    players: { ...b.players,
      ai: { ...b.players.ai, hand, battlefield: board, manaPool: { ...b.players.ai.manaPool, ...mana } },
      user: { ...b.players.user, battlefield: oppBoard },
    } };
}
const ownBear = () => createPermanent({ id: "mine1", card: { name: "Grizzly Bears", id: "gb", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
const enemyBear = () => createPermanent({ id: "theirs1", card: { name: "Runeclaw Bear", id: "rb", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
const aiPick = (s, opts = {}) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange", ...opts });

describe("AI-F1 — kicked targeted spells run the same target discipline as unkicked", () => {
  it("Into the Roil (kicked affordable, own permanent the only target) — HELD, never self-bounced", () => {
    const s = aiMainState({ hand: [{ ...INTO_THE_ROIL, id: "c1" }], mana: { U: 2, C: 2 }, board: [ownBear()] });
    const offered = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === "c1");
    expect(offered.some((a) => a.kicked === true)).toBe(true); // the kicked cast IS offered (legality ungated)
    const pick = aiPick(s);
    expect(pick?.kind).not.toBe("cast-spell"); // bounce has no scorer yet → held (the pre-existing safe FN)
  });

  it("Into the Roil with BOTH boards populated — still held; specifically never cast at its own permanent", () => {
    const s = aiMainState({ hand: [{ ...INTO_THE_ROIL, id: "c1" }], mana: { U: 2, C: 2 }, board: [ownBear()], oppBoard: [enemyBear()] });
    const pick = aiPick(s);
    if (pick?.kind === "cast-spell" && pick.cardId === "c1") {
      expect(pick.targets?.[0]?.controller).not.toBe("ai"); // hard floor: no self-target ever
    } else {
      expect(pick?.kind).toBe("pass-priority"); // current model: held (unscorable bounce)
    }
  });

  it("Hurloon Battle Hymn (scorable kicked damage) with ONLY its own creature — held, never friendly fire", () => {
    const s = aiMainState({ hand: [{ ...HURLOON_BATTLE_HYMN, id: "c1" }], mana: { R: 3, W: 1 }, board: [ownBear()] });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("Hurloon Battle Hymn kicked/unkicked TARGET PARITY: both aim at the same enemy creature", () => {
    // Unkicked (no W for the kicker): the discipline cascade picks the enemy target.
    const s1 = aiMainState({ hand: [{ ...HURLOON_BATTLE_HYMN, id: "c1" }], mana: { R: 3 }, board: [ownBear()], oppBoard: [enemyBear()] });
    const unkicked = aiPick(s1);
    expect(unkicked).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: false });
    expect(unkicked.targets?.[0]?.id).toBe("theirs1");
    // Kicked affordable: prefer the kicked cast — at the SAME disciplined target, not combo #1.
    const s2 = aiMainState({ hand: [{ ...HURLOON_BATTLE_HYMN, id: "c1" }], mana: { R: 3, W: 1 }, board: [ownBear()], oppBoard: [enemyBear()] });
    const kicked = aiPick(s2);
    expect(kicked).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: true });
    expect(kicked.targets?.[0]?.id).toBe(unkicked.targets?.[0]?.id);
  });
});

describe("AI-F2 — unresolvable LOW-confidence spells are HELD (they'd vanish via markPendingArbiter)", () => {
  const cases = [
    { card: TEFERIS_PROTECTION, mana: { W: 1, C: 2 } },
    { card: REALITY_SHIFT, mana: { U: 1, C: 1 } },
    { card: EMBER_ISLAND_PRODUCTION, mana: { U: 2, C: 3 } },
  ];
  for (const { card, mana } of cases) {
    it(`${card.name}: offered but HELD by default; policy unresolvable:"v1" recovers the legacy cast`, () => {
      const s = aiMainState({ hand: [{ ...card, id: "c1" }], mana, oppBoard: [enemyBear()] });
      const offered = legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === "c1");
      expect(offered.length).toBeGreaterThan(0);          // THE CREED — the offer is untouched
      expect(offered[0].targets?.length || 0).toBe(0);    // the untargeted fall-through shape (the census bug)
      expect(aiPick(s)?.kind).toBe("pass-priority");      // default policy: hold the vanishing cast
      const legacy = aiPick(s, { policy: { unresolvable: "v1" } });
      expect(legacy).toMatchObject({ kind: "cast-spell", cardId: "c1" }); // A/B probe's OLD side still casts
    });
  }
});

describe("AI-F11 — POLICY_KEYS is the probe's single source of truth", () => {
  it("exports every policy subsystem (the probe derives --legacy=all from this)", () => {
    expect(POLICY_KEYS).toEqual(expect.arrayContaining(["land", "block", "attack", "xSizing", "counter", "unresolvable"]));
  });
});

describe("AI-F12 — mixed-target X groups fall back to the best untargeted (decline) variant", () => {
  const pass = { kind: "pass-priority", playerId: "ai" };
  // Synthetic action group in the exact shape legalChoices emits for an "up to one target"
  // X program: per-X targeted variants (unscorable — no synthetic damage effect) plus the
  // per-X untargeted DECLINE combos (CR 601.2c; expandAtoms enumerates the decline).
  const xCard = { id: "c-x", name: "X Value Spell", type: "Sorcery", mana: "{X}{U}", oracle: "" };
  const targetedVariant = (x) => ({
    kind: "cast-spell", playerId: "ai", cardId: xCard.id, name: xCard.name,
    cost: { generic: x, U: 1 }, cmc: 1 + x, xValue: x, effect: null,
    targets: [{ type: "creature", id: "theirs1", controller: "user", name: "Runeclaw Bear" }], needsTargets: true,
  });
  const declineVariant = (x) => ({
    kind: "cast-spell", playerId: "ai", cardId: xCard.id, name: xCard.name,
    cost: { generic: x, U: 1 }, cmc: 1 + x, xValue: x, effect: null,
    targets: [], needsTargets: false,
  });

  it("picks the MAX-X untargeted decline when every targeted variant is unscorable", () => {
    const s = aiMainState({ hand: [{ ...xCard }], oppBoard: [enemyBear()] });
    const actions = [targetedVariant(1), declineVariant(1), targetedVariant(2), declineVariant(2), targetedVariant(3), declineVariant(3)];
    const pick = pickAction(s, "ai", [...actions, pass], { archetype: "midrange" });
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "c-x", xValue: 3 });
    expect(pick.targets).toEqual([]);
  });

  it("an ALL-TARGETED unscorable X group is still held (the existing safe hold)", () => {
    const s = aiMainState({ hand: [{ ...xCard }], oppBoard: [enemyBear()] });
    const actions = [targetedVariant(1), targetedVariant(2), targetedVariant(3)];
    const pick = pickAction(s, "ai", [...actions, pass], { archetype: "midrange" });
    expect(pick).toMatchObject({ kind: "pass-priority" });
  });
});
