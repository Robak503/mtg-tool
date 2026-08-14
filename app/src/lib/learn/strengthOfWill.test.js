/**
 * strengthOfWill.test.js — STRENGTH OF WILL (2026-08-14), shape D of the until-EOT quoted grant:
 * "Until end of turn, target creature you control gains indestructible and 'Whenever this creature
 * is dealt damage, put that many +1/+1 counters on it.'"
 *
 * ⭐ ONE NEW ARM (grantUntilEot shape D: KEYWORD(S) + quoted body, optional you-control scope) on three
 * existing machines: parseGrantedKeywords (the all-or-nothing keyword validator), the Feign Death
 * fixed-ids addAbility vehicle, and the Enrage dealtDamage amount threading (ctx.dealtDamageAmount).
 * The splitter's until-EOT quoted-grant guard widened in lockstep (the two-site law: the arm never sees
 * a sentence the splitter severed). The apply stores the keyword half as addKeyword effects over the
 * SAME fixed ids + duration, so keyword and quoted ability expire at the same cleanup.
 * Siblings that rode in (flip-diff audited whole-card): Infuse with Vitality + Pain 101 (deathtouch +
 * the exact Feign Death dies-return body), Run Wild (trample + a validated activated regenerate body).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · arm D disabled → Strength of Will parks (splitter guard alone flips nothing).
 *   · the splitter-guard widening reverted → the sentence severs → parks (arm alone flips nothing).
 *   · the addKeyword storage loop dropped → the indestructible half is LOST (the survival witness dies).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { applyDamageEffect } from "./spellEffects.js";
import { finishCleanupActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { grantedTriggeredQuotedFor } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SOW = { name: "Strength of Will", type: "Instant", mana: "{1}{G}", keywords: [],
  oracle: "Until end of turn, target creature you control gains indestructible and \"Whenever this creature is dealt damage, put that many +1/+1 counters on it.\"" };
const CLAUSE = SOW.oracle;

const bear = (id, controller = "user") => createPermanent({ id, controller, summoningSick: false,
  card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
const board = (perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players,
    user: { ...s.players.user, battlefield: perms.filter((p) => p.controller === "user") },
    ai: { ...s.players.ai, battlefield: perms.filter((p) => p.controller === "ai") } } };
};
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const find = (s, id) => s.players.user.battlefield.find((p) => p.id === id) || null;
const grant = (s, prog, id) => runEffectProgram(s, { source: { name: "Strength of Will" },
  payload: { params: { program: prog, controller: "user", targets: [{ type: "creature", id, atomIndex: 0 }] } } });

describe("Strength of Will — parse shape and the carrier", () => {
  it("⭐ flips native-spell; the atom carries the you-control scope, the keyword, and the quoted body", () => {
    expect(classifyCard(SOW)).toBe("native-spell");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "grant-until-eot", targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }], grantKeywords: ["indestructible"],
      grantKind: "triggered", quoted: "Whenever this creature is dealt damage, put that many +1/+1 counters on it." }]);
  });

  it("⛔ CREED: an unmodeled keyword in the same shape stays LOW (banding is not grantable)", () => {
    const p = parseEffectClause("Until end of turn, target creature you control gains banding and \"Whenever this creature is dealt damage, put that many +1/+1 counters on it.\"", "Instant");
    expect(p.confidence).toBe("low");
  });

  it("the you-control scope binds at enumeration: an opponent's creature is never offered", () => {
    const prog = parseEffectClause(CLAUSE, "Instant", { hasX: false });
    const s = board([bear("own1"), bear("enemy1", "ai")]);
    const combos = expandCastChoices(s, "user", prog, [], {});
    const offered = combos.flatMap((c) => (c.targets || []).map((t) => t.id));
    expect(offered).toContain("own1");
    expect(offered).not.toContain("enemy1");
  });
});

describe("⭐⭐ LAW 6 — the granted pair works, then expires together", () => {
  const prog = parseEffectClause(CLAUSE, "Instant", { hasX: false });

  it("⛔ SEEN-TO-FAIL control: the UNGRANTED twin dies to 3 damage (the SBA sweep is real)", () => {
    let s = board([bear("ctrl")]);
    s = applyDamageEffect(s, { controller: "ai", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "ctrl" }] });
    expect(find(s, "ctrl")).toBeNull(); // a 2/2 taking 3 without the grant is DEAD — survival below is not vacuous
  });

  it("⭐⭐ granted: survives 3 damage (indestructible) AND the quoted Enrage puts THREE counters (amount-scaled)", () => {
    let s = board([bear("b1")]);
    s = grant(s, prog, "b1");
    s = applyDamageEffect(s, { controller: "ai", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "b1" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
    s = flush(s);
    const p = find(s, "b1");
    const row = { alive: !!p, counters: p?.counters?.["+1/+1"] ?? 0 };
    console.log("  WITNESS strengthOfWill", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ alive: true, counters: 3 });
  });

  it("⭐ the keyword and the quoted trigger EXPIRE at the same cleanup (fixed-ids, endOfTurn)", () => {
    let s = board([bear("b2")]);
    s = grant(s, prog, "b2");
    expect(grantedTriggeredQuotedFor(s, "b2")).toHaveLength(1);
    s = finishCleanupActions(s);
    expect(grantedTriggeredQuotedFor(s, "b2")).toHaveLength(0); // the quoted half gone
    // The keyword half gone too: the same 3 damage now KILLS it (behavioral — the same SBA the control proves).
    s = applyDamageEffect(s, { controller: "ai", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "b2" }] });
    expect(find(s, "b2")).toBeNull();
  });
});
