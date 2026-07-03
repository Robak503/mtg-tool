/**
 * Sliver tribal wave — the Sliver deck's remaining body-only tribal statics, now CREED-clean native:
 *
 *   • Shifting Sliver  — GROUP-EVASION "Slivers can't be blocked except by Slivers" (combatEvasion.js).
 *   • Root Sliver      — CANT-BE-COUNTERED "Sliver spells can't be countered" + self (staticAbilityParser
 *                        marker + spellEffects counter-target enumeration).
 *   • Tempered Sliver  — GROUP-TRIGGERED grant "Sliver creatures you control have \"Whenever this creature
 *                        deals combat damage to a player, put a +1/+1 counter on it.\"" (the new group-grant
 *                        kind:"triggered" path: staticAbilityParser emit → layers.grantedTriggeredQuotedFor →
 *                        triggers.grantedTriggersForGroup, gated by triggerRouting.isModeledGroupTriggeredBody).
 *   • Diffusion Sliver — GROUP-WARD trigger "…becomes the target of a spell/ability an opponent controls,
 *                        counter that spell or ability unless its controller pays {2}" (groupWard.js, reusing
 *                        the ward soft-counter chokepoint).
 *
 * Engine-first (THE CREED): each card both CLASSIFIES native AND its behavior RESOLVES end-to-end — a matcher
 * with no working resolution is itself a false positive. PARKED (covered by their own comments): Sliver
 * Overlord (indefinite control-change is unmodeled). (Lazotep Sliver's afflict group grant IS now modeled —
 * it flips native-mixed; see afflict.test.js.)
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { canBlockAttacker, blockableOnlyBySubtypeOf } from "./combatEvasion.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseStaticAbilities, uncounterableSubtypesOnBattlefield } from "./staticAbilityParser.js";
import { grantedTriggeredQuotedFor } from "./layers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { groupWardTaxForStackObject, parseGroupWard, isNativeGroupWard } from "./groupWard.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveSoftCounterChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── helpers ──
function perm(id, controller, type, oracle = "", { power = 2, toughness = 2, summoningSick = false, keywords } = {}) {
  const card = { id: `c-${id}`, name: id, type, oracle, power, toughness };
  if (keywords) card.keywords = keywords;
  return createPermanent({ id, card, controller, summoningSick });
}
function combatState(userBf, aiBf, attackers) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
const counters = (s, pid, id) => (s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0);

// ───────────────────────────────────────────────────────────────────────────────
describe("Shifting Sliver — GROUP-EVASION (Slivers can't be blocked except by Slivers)", () => {
  const ORACLE = "Slivers can't be blocked except by Slivers.";
  it("classifies native-body; parser extracts the subtype", () => {
    expect(classifyCard({ name: "Shifting Sliver", type: "Creature — Sliver", mana: "{3}{U}", oracle: ORACLE })).toBe("native-body");
    expect(blockableOnlyBySubtypeOf({ name: "Shifting Sliver", oracle: ORACLE })).toBe("Sliver");
    // a different-subtype "except by" form is NOT the modeled same-subtype shape → null (safe FN)
    expect(blockableOnlyBySubtypeOf({ name: "X", oracle: "Slivers can't be blocked except by Walls." })).toBeNull();
  });
  it("a non-Sliver can't block a Sliver attacker; a Sliver (or changeling) can", () => {
    const shift = perm("shift", "user", "Creature — Sliver", ORACLE);
    const atk = perm("atk", "user", "Creature — Sliver");
    const bear = perm("bear", "ai", "Creature — Bear");
    const blkSliver = perm("blk", "ai", "Creature — Sliver");
    const change = perm("change", "ai", "Creature — Shapeshifter", "Changeling", { keywords: ["Changeling"] });
    const state = { players: { user: { battlefield: [shift, atk] }, ai: { battlefield: [bear, blkSliver, change] } } };
    expect(canBlockAttacker(state, "bear", "atk", "ai")).toBe(false);   // non-Sliver blocked
    expect(canBlockAttacker(state, "blk", "atk", "ai")).toBe(true);     // Sliver may block
    expect(canBlockAttacker(state, "change", "atk", "ai")).toBe(true);  // changeling is a Sliver (CR 702.73a)
  });
  it("the restriction applies ONLY to Sliver attackers, and ONLY while a Shifting Sliver is in play", () => {
    const shift = perm("shift", "user", "Creature — Sliver", ORACLE);
    const bearAtk = perm("bearAtk", "user", "Creature — Bear");
    const bearBlk = perm("bearBlk", "ai", "Creature — Bear");
    // Sliver static present, but the ATTACKER is a Bear → unrestricted
    expect(canBlockAttacker({ players: { user: { battlefield: [shift, bearAtk] }, ai: { battlefield: [bearBlk] } } }, "bearBlk", "bearAtk", "ai")).toBe(true);
    // no Shifting Sliver in play → a Bear can block a Sliver
    const sliverAtk = perm("sa", "user", "Creature — Sliver");
    expect(canBlockAttacker({ players: { user: { battlefield: [sliverAtk] }, ai: { battlefield: [bearBlk] } } }, "bearBlk", "sa", "ai")).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe("Root Sliver — CANT-BE-COUNTERED (Sliver spells can't be countered)", () => {
  const ROOT = { name: "Root Sliver", type: "Creature — Sliver", mana: "{3}{G}", oracle: "This spell can't be countered.\nSliver spells can't be countered." };
  it("classifies native-static; the subtype marker is parsed", () => {
    expect(classifyCard(ROOT)).toBe("native-static");
    expect([...uncounterableSubtypesOnBattlefield([ROOT])]).toEqual(["sliver"]);
    // the SELF "this spell can't be countered" marker is NOT a battlefield subtype static (excluded from the set)
    const descs = parseStaticAbilities(ROOT);
    expect(descs.some((d) => d.cantBeCountered?.scope === "self")).toBe(true);
    expect(descs.some((d) => d.cantBeCountered?.subtype === "Sliver")).toBe(true);
  });
  it("a Sliver spell on the stack is NOT a legal counter target while Root Sliver is on the battlefield", () => {
    const rootPerm = { id: "root", card: ROOT, controller: "user", counters: {}, attachments: [], attachedTo: null };
    const state = {
      players: { user: { battlefield: [rootPerm] }, ai: { battlefield: [] } },
      stack: [
        { id: "sp1", kind: "spell", source: { name: "Muscle Sliver", type: "Creature — Sliver", oracle: "" }, controller: "ai" },
        { id: "sp2", kind: "spell", source: { name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }, controller: "ai" },
      ],
    };
    const targets = enumerateTargets(state, "user", { targetType: "spell", spellFilter: "any" });
    expect(targets.map((t) => t.id)).toEqual(["sp2"]); // only the non-Sliver spell is counterable
  });
  it("without Root Sliver in play, a Sliver spell IS counterable (no over-reach)", () => {
    const state = { players: { user: { battlefield: [] }, ai: { battlefield: [] } }, stack: [{ id: "sp1", kind: "spell", source: { name: "Muscle Sliver", type: "Creature — Sliver" }, controller: "ai" }] };
    expect(enumerateTargets(state, "user", { targetType: "spell", spellFilter: "any" }).map((t) => t.id)).toEqual(["sp1"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe("Tempered Sliver — GROUP-TRIGGERED grant (combat-damage → +1/+1 counter)", () => {
  const ORACLE = 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."';
  const TEMP = { name: "Tempered Sliver", type: "Creature — Sliver", mana: "{2}{G}", oracle: ORACLE };
  it("classifies native-static and emits a layer-6 triggered grant scoped to Sliver creatures you control", () => {
    expect(classifyCard(TEMP)).toBe("native-static");
    const d = parseStaticAbilities(TEMP);
    expect(d).toHaveLength(1);
    expect(d[0].op).toMatchObject({ layerOp: "addAbility", grant: { kind: "triggered" } });
    expect(d[0].affects).toMatchObject({ mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], subtypes: ["Sliver"] } });
  });
  it("the grant reaches every Sliver you control (incl. the source) but NOT a non-Sliver", () => {
    const temp = perm("temp", "user", "Creature — Sliver", ORACLE);
    const musc = perm("musc", "user", "Creature — Sliver");
    const bear = perm("bear", "user", "Creature — Bear");
    const state = { activePlayer: "user", players: { user: { battlefield: [temp, musc, bear] }, ai: { battlefield: [] } } };
    expect(grantedTriggeredQuotedFor(state, "musc")).toHaveLength(1);
    expect(grantedTriggeredQuotedFor(state, "temp")).toHaveLength(1); // a Sliver itself
    expect(grantedTriggeredQuotedFor(state, "bear")).toHaveLength(0); // not a Sliver
  });
  it("a Sliver dealing combat damage to a player gets a +1/+1 counter (end-to-end); a Bear does not", () => {
    const temp = perm("temp", "user", "Creature — Sliver", ORACLE);
    const musc = perm("musc", "user", "Creature — Sliver");
    const bear = perm("bear", "user", "Creature — Bear");
    let s = combatState([temp, musc, bear], [], [
      { permanentId: "musc", attackingPlayer: "user", defender: "ai" },
      { permanentId: "bear", attackingPlayer: "user", defender: "ai" },
      { permanentId: "temp", attackingPlayer: "user", defender: "ai" },
    ]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(34); // 3 attackers × 2
    let g = 0; s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); while ((s.stack || []).length && g++ < 25) s = resolveTopOfStack(s);
    expect(counters(s, "user", "musc")).toBe(1); // granted trigger fired + resolved on the Sliver
    expect(counters(s, "user", "temp")).toBe(1); // the source is a Sliver too
    expect(counters(s, "user", "bear")).toBe(0); // a non-Sliver got no grant
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe("Diffusion Sliver — GROUP-WARD (opponent targeting your Sliver pays {2} or is countered)", () => {
  const ORACLE = "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.";
  const DIFF = { name: "Diffusion Sliver", type: "Creature — Sliver", mana: "{1}{U}", oracle: ORACLE };
  it("classifies native-trigger; parser extracts the subtype + generic cost", () => {
    expect(classifyCard(DIFF)).toBe("native-trigger");
    expect(parseGroupWard(DIFF)).toEqual({ subtype: "Sliver", generic: 2 });
    expect(isNativeGroupWard(DIFF)).toBe(true);
    // a rider keeps it body-only (all-or-nothing — a Flying line is residue the runtime wouldn't reflect)
    expect(isNativeGroupWard({ name: "X", oracle: ORACLE + "\nFlying" })).toBe(false);
  });
  it("the tax fires for an opponent targeting your Sliver, never for your own spell or a non-Sliver", () => {
    const diff = perm("diff", "user", "Creature — Sliver", ORACLE);
    const musc = perm("musc", "user", "Creature — Sliver");
    const bear = perm("bear", "ai", "Creature — Bear");
    const state = { players: { user: { battlefield: [diff, musc] }, ai: { battlefield: [bear] } } };
    const aiVsMusc = { kind: "spell", controller: "ai", source: { name: "Doom Blade" }, targets: [{ type: "creature", id: "musc" }] };
    expect(groupWardTaxForStackObject(state, aiVsMusc)).toMatchObject({ cost: { kind: "mana", mana: { generic: 2 } } });
    const aiVsBear = { kind: "spell", controller: "ai", source: { name: "Giant Growth" }, targets: [{ type: "creature", id: "bear" }] };
    expect(groupWardTaxForStackObject(state, aiVsBear)).toBeNull(); // opponent targeting its own creature
    const userVsMusc = { kind: "spell", controller: "user", source: { name: "Giant Growth" }, targets: [{ type: "creature", id: "musc" }] };
    expect(groupWardTaxForStackObject(state, userVsMusc)).toBeNull(); // you targeting your own Sliver
  });
  it("end-to-end: an opponent's removal targeting your Sliver raises the soft-counter; pay → resolves, decline → countered", () => {
    const diff = createPermanent({ card: { id: "diff-c", name: "Diffusion Sliver", power: 1, toughness: 1, type_line: "Creature — Sliver", oracle: ORACLE }, controller: "ai" });
    const target = createPermanent({ card: { id: "musc-c", name: "Muscle Sliver", power: 2, toughness: 2, type_line: "Creature — Sliver", oracle: "" }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [removal], manaPool: { ...s.players.user.manaPool, B: 1, C: 2 } }, ai: { ...s.players.ai, battlefield: [diff, target] } },
    };
    // user casts Doom Blade at the (opponent's) Muscle Sliver → Diffusion taxes the user
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === target.id));
    expect(cast).toBeTruthy();
    const out = dispatchAction(s, cast);
    expect(out.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "user", sourceName: "Diffusion Sliver" });
    expect(out.pendingChoice.cost).toEqual({ kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
    // decline → Doom Blade is countered, the Sliver survives
    const declined = resolveSoftCounterChoice(out, false);
    expect(declined.players.user.graveyard.map((c) => c.name)).toContain("Doom Blade");
    expect(declined.players.ai.battlefield.some((p) => p.id === target.id)).toBe(true);
  });
});
