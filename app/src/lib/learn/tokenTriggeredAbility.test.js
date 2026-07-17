/**
 * tokenTriggeredAbility.test.js — TOKENS T5 (BLITZ TK-1): a minted token carrying a curated, runtime-verified
 * self-DIES triggered ability, end to end.
 *
 * The CREED-critical invariant this file pins: a token stamped with a quoted triggered ability ("When this
 * token dies, you gain N life" / "…it deals N damage to any target / to each opponent") actually FIRES that
 * ability at runtime — checkDiesTriggers detects the self-dies descriptor off the minted token's own oracle
 * (selfRef matches "this token") and the payoff resolves through the normal pending-trigger flush. So a Pest's
 * dies→gain-life and a Devil's dies→deal-damage are HONORED, never dropped (a token that carried the ability
 * on paper but didn't fire it would be the forbidden false-positive native this gate exists to avoid).
 *
 * The gate is CURATED + `^…$`-anchored, FAIL-CLOSED: only the three runtime-verified corpus forms are admitted;
 * an unmodeled quoted ability (a non-modeled trigger, an attacks trigger not yet driven through combat here, a
 * create-token payoff that could recurse) returns null → the whole token drops to low → Arbiter.
 *
 * Also pins the ". They have" plural-token normalization (the plural of the existing ". It has" merge), which
 * binds a quoted ability to a MULTI-token creation (Dread Drone's Eldrazi Spawn, a plural Devil-maker) — the
 * clean-mana (T4) and triggered (T5) gates then apply to it exactly as to the singular form.
 *
 * Real printed oracles (bundled Scryfall, verified 2026-07-17 via cardIndex.lookupCard).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { createTokenClauseParser } from "./effects/atoms/tokens.js";
import { parseTokenTriggeredAbility } from "./effects/parseHelpers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall). {oracle,type} shape = the publicCard shape the tier-fingerprint
// classifies, so classifyCard here matches the flip-diff authority.
const PEST_SUMMONING = { name: "Pest Summoning", type: "Sorcery", mana: "{1}{B/G}{B/G}",
  oracle: 'Create two 1/1 black and green Pest creature tokens with "When this token dies, you gain 1 life."' };
const DEVILS_PLAYGROUND = { name: "Devils' Playground", type: "Sorcery", mana: "{4}{R}",
  oracle: 'Create four 1/1 red Devil creature tokens. They have "When this token dies, it deals 1 damage to any target."' };
const MAKE_MISCHIEF = { name: "Make Mischief", type: "Sorcery", mana: "{1}{R}",
  oracle: 'Make Mischief deals 1 damage to any target. Create a 1/1 red Devil creature token. It has "When this token dies, it deals 1 damage to any target."' };
const DANCE_WITH_DEVILS = { name: "Dance with Devils", type: "Instant", mana: "{2}{R}",
  oracle: 'Create two 1/1 red Devil creature tokens. They have "When this token dies, it deals 1 damage to any target."' };
// Plural Eldrazi Spawn/Scion mana-token makers — flip via the ". They have" normalization + the existing T4
// clean-mana gate (their "Sacrifice this token: Add {C}" was already modeled; the plural boundary orphaned it).
const CALL_THE_SCIONS = { name: "Call the Scions", type: "Sorcery", mana: "{2}{G}",
  oracle: 'Devoid (This card has no color.)\nCreate two 1/1 colorless Eldrazi Scion creature tokens. They have "Sacrifice this token: Add {C}."' };
const SKITTERING_INVASION = { name: "Skittering Invasion", type: "Sorcery", mana: "{4}{G}",
  oracle: 'Create five 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."' };
const CORPSEHATCH = { name: "Corpsehatch", type: "Sorcery", mana: "{3}{B}",
  oracle: 'Destroy target nonblack creature. Create two 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."' };
const ESSENCE_FEED = { name: "Essence Feed", type: "Sorcery", mana: "{4}{B}",
  oracle: 'Target player loses 3 life. You gain 3 life and create three 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."' };

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const withBattlefield = (state, pid, perms) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } });
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 25) s = resolveTopOfStack(s);
  return s;
}
// A minted token permanent carrying `oracle`, marked lethal so the next SBA kills it.
function dyingToken(oracle, id) {
  const card = { id: `tok-${id}`, name: "Tk", type: "Token Creature — Test", power: 1, toughness: 1, oracle, keywords: [], token: true };
  return { ...createPermanent({ id, card, controller: "user", summoningSick: false }), damageMarked: 99 };
}

describe("TK-1 — parseTokenTriggeredAbility gate (curated, anchored, fail-closed)", () => {
  it("admits the three runtime-verified self-dies forms, canonicalized to clean Oracle text", () => {
    expect(parseTokenTriggeredAbility('"When this token dies, you gain 1 life."')).toBe("When this token dies, you gain 1 life.");
    expect(parseTokenTriggeredAbility('"When this token dies, you gain 2 life."')).toBe("When this token dies, you gain 2 life.");
    expect(parseTokenTriggeredAbility('"When this token dies, it deals 1 damage to any target."')).toBe("When this token dies, it deals 1 damage to any target.");
    expect(parseTokenTriggeredAbility('"When this token dies, it deals 2 damage to each opponent."')).toBe("When this token dies, it deals 2 damage to each opponent.");
    // curly quotes + already-lowercased input (the createTokenClauseParser contract) both work
    expect(parseTokenTriggeredAbility('“when this token dies, you gain 1 life.”')).toBe("When this token dies, you gain 1 life.");
  });
  it("rejects anything outside the curated set (FN-safe → the whole token parks)", () => {
    expect(parseTokenTriggeredAbility('"When this token dies, scry 1."')).toBeNull();               // unmodeled payoff
    expect(parseTokenTriggeredAbility('"When this token dies, draw a card."')).toBeNull();           // not in the set
    expect(parseTokenTriggeredAbility('"When this token dies, create two 1/1 green Ooze creature tokens."')).toBeNull(); // recursion guard
    expect(parseTokenTriggeredAbility('"Whenever this token attacks, you gain 1 life."')).toBeNull(); // attacks form deferred
    expect(parseTokenTriggeredAbility('"Sacrifice this token: Add {C}."')).toBeNull();               // a mana ability (the T4 gate's job)
  });
});

describe("TK-1 — createTokenClauseParser binds the triggered ability as the token's oracle", () => {
  it("the inline 'with \"…\"' quoted-trigger form stamps tokenOracle (Pest, Devil)", () => {
    expect(createTokenClauseParser('create two 1/1 black and green pest creature tokens with "when this token dies, you gain 1 life."'))
      .toMatchObject({ op: "create-token", count: 2, power: 1, toughness: 1, tokenOracle: "When this token dies, you gain 1 life." });
    expect(createTokenClauseParser('create a 1/1 red devil creature token with "when this token dies, it deals 1 damage to any target."'))
      .toMatchObject({ op: "create-token", count: 1, tokenOracle: "When this token dies, it deals 1 damage to any target." });
  });
  it("a quoted ability outside BOTH the mana and trigger gates drops the whole clause (→ low → Arbiter)", () => {
    expect(createTokenClauseParser('create a 1/1 red devil creature token with "when this token dies, scry 1."')).toBeNull();
  });
});

describe("TK-1 — the minted token FIRES its triggered ability at runtime (the CREED invariant)", () => {
  it("dies → 'you gain N life' resolves off the token's own oracle", () => {
    const s = withBattlefield(baseState(), "user", [dyingToken("When this token dies, you gain 1 life.", "p")]);
    const life0 = s.players.user.life;
    const r = destroyLethalCreatures(s);
    const after = resolveAll(checkDiesTriggers(r.state, r.dead));
    expect(after.players.user.life).toBe(life0 + 1);
  });
  it("dies → 'it deals N damage to each opponent' drains every opponent", () => {
    const s = withBattlefield(baseState(), "user", [dyingToken("When this token dies, it deals 2 damage to each opponent.", "d")]);
    const opp = Object.keys(s.players).find((p) => p !== "user");
    const oppLife0 = s.players[opp].life;
    const r = destroyLethalCreatures(s);
    const after = resolveAll(checkDiesTriggers(r.state, r.dead));
    expect(after.players[opp].life).toBe(oppLife0 - 2);
  });
  it("the minted token's oracle is detected as a SELF-dies trigger (fires only when the token itself dies)", () => {
    const [d] = detectTriggers({ name: "Tk", type: "Creature", oracle: "When this token dies, you gain 1 life." }).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self" });
  });
});

describe("TK-1 — real cards flip native (whole-card, LOST=0)", () => {
  it("Pest dies→gain-life makers flip", () => {
    expect(classifyCard(PEST_SUMMONING)).toBe("native-spell");
  });
  it("Devil dies→damage makers flip (inline 'with', plural 'They have')", () => {
    expect(classifyCard(MAKE_MISCHIEF)).toBe("native-spell");
    expect(classifyCard(DEVILS_PLAYGROUND)).toBe("native-spell");
    expect(classifyCard(DANCE_WITH_DEVILS)).toBe("native-spell");
  });
  it("plural Eldrazi Spawn/Scion mana-token makers flip via the 'They have' normalization", () => {
    expect(classifyCard(CALL_THE_SCIONS)).toBe("native-spell");
    expect(classifyCard(SKITTERING_INVASION)).toBe("native-spell");
    expect(classifyCard(CORPSEHATCH)).toBe("native-spell");   // destroy target + mana tokens both modeled
    expect(classifyCard(ESSENCE_FEED)).toBe("native-spell");  // lose/gain life + mana tokens
  });
});

describe("TK-1 — '. They have' plural normalization (parser-level, mirrors '. It has')", () => {
  it("binds a quoted ability to a multi-token creation so the create-token atom carries it", () => {
    // clean-mana (T4): plural Eldrazi Spawn → the mana ability rides on the minted tokens
    const mana = parseEffectClause('Create five 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."', "Sorcery");
    expect(programConfidence(mana)).toBe("high");
    expect(mana.atoms[0]).toMatchObject({ op: "create-token", count: 5 });
    expect(mana.atoms[0].tokenOracle).toMatch(/Sacrifice this .*Add \{C\}/i);
    // triggered (T5): plural Devil → the dies-damage ability rides on the minted tokens
    const trig = parseEffectClause('Create two 1/1 red Devil creature tokens. They have "When this token dies, it deals 1 damage to any target."', "Instant");
    expect(programConfidence(trig)).toBe("high");
    expect(trig.atoms[0]).toMatchObject({ op: "create-token", count: 2, tokenOracle: "When this token dies, it deals 1 damage to any target." });
  });
});
