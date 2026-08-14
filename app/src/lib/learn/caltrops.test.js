/**
 * caltrops.test.js — CALTROPS (2026-08-14), the ANY-CREATURE attacks scope. "Whenever a creature
 * attacks, this artifact deals 1 damage to it." Sibling that rode in (flip-diff audited whole-card):
 * Righteous Cause ("Whenever a creature attacks, you gain 1 life").
 *
 * ⭐ THREE PIECES: the bare `^a creature attacks$` detect arm (scope anyCreature — the watcher may sit
 * on ANY battlefield), the fire-site partition (the attacker self-call + the attacking player's watcher
 * loop cover the attacking side; a NEW non-attacking-players scan gated to exactly this scope completes
 * the space — the subtypeGlobal de-dup pattern, with the attached-watcher scan excluding the scope so an
 * attached watcher can never double-fire), and the attacker damage-pronoun rewrite ("deals 1 damage to
 * IT" → the triggering-creature sentinel the TRIG-PRONOUN damage arm binds to ctx).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the detect arm disabled → Caltrops parks (classify falls to body-only).
 *   · the non-attacking-players scan dropped → the DEFENDER-side fire dies (the whole point of the card).
 *   · the scan's scope gate widened to all scopes → a defender-controlled Aura on the attacker
 *     DOUBLE-FIRES (attached scan + this scan; attachedFire 1→2). NB a first M3 guess — "the defender's
 *     you-control watchers over-fire" — SURVIVED: scopeMatches' controller check already blocks that
 *     leak; the gate's real load — attached-linkage scopes whose match ignores controllers — is what the
 *     single-fire witness below pins.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14 — full texts).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CALTROPS = { name: "Caltrops", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "Whenever a creature attacks, this artifact deals 1 damage to it." };
const RIGHTEOUS = { name: "Righteous Cause", type: "Enchantment", mana: "{3}{W}{W}", keywords: [],
  oracle: "Whenever a creature attacks, you gain 1 life." };

const mk = (id, controller, card) => createPermanent({ id, controller, summoningSick: false,
  card: { id: "card-" + id, oracle: "", ...card } });
const soldier = (id, controller, toughness = "1") =>
  mk(id, controller, { name: "Soldier " + id, type: "Creature — Soldier", power: "2", toughness });

/** ai1 attacking `user` with `attackers`; each side's battlefield as given. */
function combatBoard({ userBf = [], aiBf = [], attackers }) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...g,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: userBf, life: 40 },
      ai1: { ...g.players.ai1, battlefield: aiBf, life: 40 } },
    combat: { attackers, blockers: [] },
  };
}
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const bf = (s, pid) => s.players[pid].battlefield;

describe("the carriers and the descriptor", () => {
  it("⭐ Caltrops + Righteous Cause flip native-trigger; the pronoun rewrites to the sentinel", () => {
    expect(classifyCard(CALTROPS)).toBe("native-trigger");
    expect(classifyCard(RIGHTEOUS)).toBe("native-trigger");
    const d = detectTriggers(CALTROPS)[0];
    expect(d).toMatchObject({ event: "attacks", scope: "anyCreature",
      effectClause: "this artifact deals 1 damage to the triggering creature" });
  });

  it("⛔ CREED: a RESTRICTED variant stays undetected (no silent restriction drop)", () => {
    expect(detectTriggers({ name: "P", type: "Artifact",
      oracle: "Whenever a creature with flying attacks, this artifact deals 1 damage to it." })).toEqual([]);
  });
});

describe("⭐⭐ LAW 6 — the cross-battlefield fire (the whole point of the card)", () => {
  it("⭐⭐ the DEFENDER's Caltrops kills an opposing 1-toughness attacker", () => {
    let s = combatBoard({
      userBf: [mk("CAL", "user", CALTROPS)],
      aiBf: [soldier("ATK", "ai1")],
      attackers: [{ permanentId: "ATK", attackingPlayer: "ai1", defender: "user" }],
    });
    s = checkAttackTriggers(s);
    const fires = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "CAL");
    s = flush(s);
    const row = { fires: fires.length, attackerDead: !bf(s, "ai1").some((p) => p.id === "ATK") };
    console.log("  WITNESS caltrops", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fires: 1, attackerDead: true });
  });

  it("the ATTACKING player's own Caltrops fires too (the partition's other half) — exactly once", () => {
    let s = combatBoard({
      userBf: [],
      aiBf: [mk("CAL", "ai1", CALTROPS), soldier("ATK", "ai1")],
      attackers: [{ permanentId: "ATK", attackingPlayer: "ai1", defender: "user" }],
    });
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.source?.permanentId === "CAL")).toHaveLength(1);
    s = flush(s);
    expect(bf(s, "ai1").some((p) => p.id === "ATK")).toBe(false); // its own 1-toughness attacker dies
  });

  it("⭐ Righteous Cause: the DEFENDER gains 1 per attacker (the watcher's controller, not the attacker's)", () => {
    let s = combatBoard({
      userBf: [mk("RC", "user", RIGHTEOUS)],
      aiBf: [soldier("A1", "ai1", "3"), soldier("A2", "ai1", "3")],
      attackers: [
        { permanentId: "A1", attackingPlayer: "ai1", defender: "user" },
        { permanentId: "A2", attackingPlayer: "ai1", defender: "user" },
      ],
    });
    s = flush(checkAttackTriggers(s));
    expect(s.players.user.life).toBe(42); // +1 per attacking creature, to the enchantment's controller
    expect(s.players.ai1.life).toBe(40);
  });

  it("⛔ a defender-controlled Aura on the attacker fires exactly ONCE (the scope gate's real load)", () => {
    // The attached-watcher scan covers a cross-controller Aura; the anyCreature scan must skip it (its
    // scope gate) or the pair double-fires — the exact mutant M3 kills.
    const s0 = combatBoard({ userBf: [], aiBf: [soldier("ATK", "ai1")],
      attackers: [{ permanentId: "ATK", attackingPlayer: "ai1", defender: "user" }] });
    const aura = mk("AUR", "user", { name: "Watch-Aura", type: "Enchantment — Aura",
      oracle: "Whenever enchanted creature attacks, you gain 1 life." });
    aura.attachedTo = "ATK";
    const s = checkAttackTriggers({ ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [aura] },
      ai1: { ...s0.players.ai1, battlefield: s0.players.ai1.battlefield.map((p) => p.id === "ATK" ? { ...p, attachments: ["AUR"] } : p) } } });
    expect((s.pendingTriggers || []).filter((t) => t.source?.permanentId === "AUR")).toHaveLength(1);
  });

  it("a 3-toughness attacker takes the 1 and SURVIVES with damage marked (never over-killed)", () => {
    let s = combatBoard({
      userBf: [mk("CAL", "user", CALTROPS)],
      aiBf: [soldier("BIG", "ai1", "3")],
      attackers: [{ permanentId: "BIG", attackingPlayer: "ai1", defender: "user" }],
    });
    s = flush(checkAttackTriggers(s));
    const big = bf(s, "ai1").find((p) => p.id === "BIG");
    expect(big).toBeTruthy();
    expect(big.damageMarked).toBe(1);
  });
});
