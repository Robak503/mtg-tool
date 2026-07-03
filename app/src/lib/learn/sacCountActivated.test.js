/**
 * ===== SAC-N-SUBTYPE activated cost (γ1d) + ACTIVATE-ONLY-AS-A-SORCERY rider strip =====
 *
 * Two thin, reusable extensions to the activated-ability subsystem (effects/abilities.js), each riding the
 * already-shipped activate-ability runtime (legalChoices.actionsActivateAbility → actionDispatcher.apply-
 * ActivateAbility → resolveTopOfStack). No new effect atom.
 *
 *   1. SAC-N-SUBTYPE COST (parseAbilityCost γ1d) — "[{mana}, ]Sacrifice N <fungible subtype>" (a COUNT ≥ 2 of
 *      a fungible value-TOKEN subtype: Treasure/Clue/Food/Gold/Blood/Map/Powerstone/Incubator). Those tokens
 *      are interchangeable, so paying N is a NO-DECISION cost (CR 701.16) — legalChoices gathers the matching
 *      victims and AUTO-PICKS N (excluding any the effect targets, and any that would silently drop a leave-
 *      trigger — the single-sac fail-safe). The dispatcher sacrifices each (battlefield→graveyard, firing dies
 *      + TRIG-SACRIFICE watchers — cracking value tokens is a real sacrifice, CR 701.21). A COUNT-sac of a
 *      DISTINGUISHABLE class ("two artifacts", "two creatures", "two other artifacts and/or creatures") stays
 *      UNMODELED → Arbiter: which value permanents to give up is a real choice the auto-pick can't make.
 *
 *   2. ACTIVATE-ONLY-AS-A-SORCERY rider strip (parseActivatedAbilities) — a trailing "Activate [this ability]
 *      only as a sorcery" (CR 602.5i) is a WHEN restriction the runtime ALREADY enforces (activated abilities
 *      are offered only at step==="main"), never a WHAT. It was being swept into the effect program and
 *      dragging an otherwise-HIGH effect LOW. Stripped before the effect is parsed (single-sourced for the
 *      parser AND the coverage metric), it can NEVER let the engine play an ability faster than the card allows.
 *
 * CREED (CLAUDE.md §1.2/§8): whole-card or PARK. Each ability is `modeled` only when its WHOLE cost reduces to
 * the modeled subset AND its (rider-stripped) effect parses HIGH. The CREED pins below prove the unmodeled
 * shapes (Grim Hireling's X-Treasures, Kellogg's sac-5 + gain-control, Mondrak's compound-class sac, a sac of
 * a distinguishable class) STAY body-only. Full-corpus positional flip-diff: 49 cards flip to native (Ruthless
 * Knave + Tamiyo's Journal via sac-N; the rest via the rider strip), ZERO regressions in either direction.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const conf = (c) => programConfidence(parseEffectClause(c, "Instant"));
const treasure = (id) => createPermanent({
  id, controller: "user",
  card: { id: "c-" + id, name: "Treasure", type: "Token Artifact — Treasure", token: true, oracle: "{T}, Sacrifice this artifact: Add one mana of any color." },
});
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBf(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
const activateActions = (state, playerId = "user") =>
  legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");

// ────────────────────────────────────────────────────────────────────────────
// 1. parseAbilityCost — sac-N-subtype shape
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-N-SUBTYPE — cost parsing (γ1d)", () => {
  it("'{B}, Sacrifice three Treasures' → mana {B} + sacCount(treasure, 3)", () => {
    expect(parseAbilityCost("{B}, Sacrifice three Treasures")).toMatchObject({
      manaPips: "{B}", sacCount: { type: "permanent", subtype: "treasure", count: 3 },
    });
  });
  it("'Sacrifice two Foods' (plural noun) → sacCount(food, 2), no mana", () => {
    expect(parseAbilityCost("Sacrifice two Foods")).toMatchObject({
      manaPips: "", sacCount: { type: "permanent", subtype: "food", count: 2 },
    });
  });
  it("digit counts 2–5 parse the same as the word-numbers", () => {
    expect(parseAbilityCost("Sacrifice 5 Treasures").sacCount).toMatchObject({ subtype: "treasure", count: 5 });
  });

  // CREED — distinguishable / out-of-range count sacs stay UNMODELED (null)
  it("'Sacrifice two artifacts' (distinguishable class) → null (real choice, deferred)", () => {
    expect(parseAbilityCost("Sacrifice two artifacts")).toBeNull();
  });
  it("'Sacrifice two creatures' → null", () => {
    expect(parseAbilityCost("Sacrifice two creatures")).toBeNull();
  });
  it("'Sacrifice two other artifacts and/or creatures' (Mondrak) → null", () => {
    expect(parseAbilityCost("Sacrifice two other artifacts and/or creatures")).toBeNull();
  });
  it("'Sacrifice six Treasures' (count out of range) → null", () => {
    expect(parseAbilityCost("Sacrifice six Treasures")).toBeNull();
  });
  it("a single 'Sacrifice a Treasure' is the existing γ1b sacOther, NOT sacCount", () => {
    const cost = parseAbilityCost("Sacrifice a Treasure");
    expect(cost.sacOther).toMatchObject({ type: "permanent", subtype: "treasure" });
    expect(cost.sacCount).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. ACTIVATE-ONLY-AS-A-SORCERY rider strip
// ────────────────────────────────────────────────────────────────────────────
describe("ACTIVATE-ONLY-AS-A-SORCERY — the rider is stripped before the effect parses", () => {
  it("the bare effect parses HIGH but the rider-suffixed clause parsed LOW (proving the drag)", () => {
    expect(conf("Put two +1/+1 counters on each creature you control")).toBe("high");
    expect(conf("Put two +1/+1 counters on each creature you control. Activate only as a sorcery.")).toBe("low");
  });
  it("an activated ability with the rider is modeled, and its effectClause has the rider removed", () => {
    const [ab] = parseActivatedAbilities({
      name: "X", type: "Creature — Wizard",
      oracle: "{B}: Target player discards a card. Activate only as a sorcery.",
    });
    expect(ab.modeled).toBe(true);
    expect(ab.effectClause).toBe("Target player discards a card"); // rider + its trailing period removed
  });
  it("'Activate this ability only as a sorcery' (the verbose form) is also stripped", () => {
    const [ab] = parseActivatedAbilities({
      name: "X", type: "Creature — Wizard",
      oracle: "{1}: Draw a card. Activate this ability only as a sorcery.",
    });
    expect(ab.modeled).toBe(true);
    expect(ab.effectClause).toBe("Draw a card"); // rider + its trailing period removed
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. classification — real-oracle flips + CREED pins
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-N-SUBTYPE — classification flips (real bundled oracle)", () => {
  it("Ruthless Knave → native-activated (sac-a-creature make-Treasures + sac-3-Treasures draw)", () => {
    expect(classifyCard({
      name: "Ruthless Knave", type: "Creature — Orc Pirate", mana: "{2}{B}",
      oracle: "{2}{B}, Sacrifice a creature: Create two Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\nSacrifice three Treasures: Draw a card.",
    })).toBe("native-activated");
  });
  it("Tamiyo's Journal → native-mixed (upkeep investigate trigger + {T}, Sacrifice three Clues tutor)", () => {
    expect(classifyCard({
      name: "Tamiyo's Journal", type: "Legendary Artifact — Book", mana: "{5}",
      oracle: "At the beginning of your upkeep, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\n{T}, Sacrifice three Clues: Search your library for a card, put that card into your hand, then shuffle.",
    })).toBe("native-mixed");
  });
  it("a bare 'Sacrifice three Treasures: Draw a card.' permanent is native-activated", () => {
    expect(classifyCard({ name: "T", type: "Creature — Wizard", mana: "{2}{B}", oracle: "Sacrifice three Treasures: Draw a card." }))
      .toBe("native-activated");
  });
});

describe("SAC-N-SUBTYPE — CREED: unmodeled cards STAY body-only (no over-claim)", () => {
  // Grim Hireling's "{B}, Sacrifice X Treasures: …-X/-X" is now MODELED by the γ1e sac-X subtype cost + the
  // negative symmetric X-pump (see sacXActivated.test.js) — it classifies native-mixed (combat-damage-team
  // Treasure trigger + the sac-X debuff). This former CREED pin migrated there; the γ1d pins below stay.
  it("Kellogg, Dangerous Mind — 'Sacrifice five Treasures: Gain control …' (LOW effect) stays body-only", () => {
    expect(classifyCard({
      name: "Kellogg, Dangerous Mind", type: "Legendary Creature — Human Mercenary", mana: "{1}{B}{R}",
      oracle: "First strike, haste\nWhenever Kellogg attacks, create a Treasure token.\nSacrifice five Treasures: Gain control of target creature for as long as you control Kellogg. Activate only as a sorcery.",
    })).toBe("body-only");
  });
  it("Mondrak, Glory Dominus — '…Sacrifice two other artifacts and/or creatures…' (compound class) stays body-only", () => {
    expect(classifyCard({
      name: "Mondrak, Glory Dominus", type: "Legendary Creature — Phyrexian Horror", mana: "{2}{W}{W}",
      oracle: "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: Put an indestructible counter on Mondrak.",
    })).toBe("body-only");
  });
  it("a 'Sacrifice two artifacts: Draw a card.' permanent (distinguishable class) stays body-only", () => {
    expect(classifyCard({ name: "T", type: "Creature — Wizard", mana: "{2}{B}", oracle: "{1}, Sacrifice two artifacts: Draw a card." }))
      .toBe("body-only");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. RUNTIME — the N fungible victims are GENUINELY sacrificed, then the effect happens
// ────────────────────────────────────────────────────────────────────────────
describe("SAC-N-SUBTYPE — runtime (legalChoices → dispatch → resolve)", () => {
  const KNAVE = { id: "c-kn", name: "Ruthless Knave", type: "Creature — Orc Pirate", power: 2, toughness: 2, oracle: "Sacrifice three Treasures: Draw a card." };

  it("offers the sac-3 ability only when ≥3 Treasures are out, and the action carries 3 victim ids", () => {
    const knave = createPermanent({ id: "kn", card: KNAVE, controller: "user", summoningSick: false });
    let s = withBf(mainState(), "user", [knave, treasure("t1"), treasure("t2"), treasure("t3")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L0", name: "Card" }] } } };
    const acts = activateActions(s).filter((a) => a.permanentId === "kn");
    expect(acts).toHaveLength(1);
    expect(acts[0].sacCountIds).toHaveLength(3);
    expect(acts[0].sacCountIds.sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("CREED — with only 2 Treasures the sac-3 ability is NOT offered (a cost we can't pay)", () => {
    const knave = createPermanent({ id: "kn", card: KNAVE, controller: "user", summoningSick: false });
    const s = withBf(mainState(), "user", [knave, treasure("t1"), treasure("t2")]);
    expect(activateActions(s).filter((a) => a.permanentId === "kn")).toHaveLength(0);
  });

  it("dispatch sacrifices exactly 3 Treasures (→ graveyard), then resolving draws a card", () => {
    const knave = createPermanent({ id: "kn", card: KNAVE, controller: "user", summoningSick: false });
    let s = withBf(mainState(), "user", [knave, treasure("t1"), treasure("t2"), treasure("t3"), treasure("t4")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L0", name: "Card" }] } } };
    const act = activateActions(s).find((a) => a.permanentId === "kn");

    const after = dispatchAction(s, act);
    expect(treasureCount(after, "user")).toBe(1);                                    // 4 → 1 (three cracked)
    expect(after.players.user.graveyard.filter((c) => c.name === "Treasure")).toHaveLength(3);
    expect(after.players.user.battlefield.find((p) => p.id === "kn")).toBeTruthy();  // the SOURCE stays
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("L0");             // drew
  });

  it("a mana+sac-N cost ({3}, Sacrifice two Treasures) pays both, then resolves the mass pump", () => {
    // Olivia's activated ability in isolation (its trigger is the unrelated blocker on the full card).
    const olivia = createPermanent({
      id: "ol", controller: "user", summoningSick: false,
      card: { id: "c-ol", name: "Olivia", type: "Legendary Creature — Vampire", power: 3, toughness: 4, oracle: "{3}, Sacrifice two Treasures: Put two +1/+1 counters on each creature you control. Activate only as a sorcery." },
    });
    const buddy = createPermanent({ id: "bd", controller: "user", summoningSick: false, card: { id: "c-bd", name: "Buddy", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "" } });
    let s = withBf(mainState(), "user", [olivia, buddy, treasure("t1"), treasure("t2")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } } };
    const act = activateActions(s).find((a) => a.permanentId === "ol");
    expect(act).toBeTruthy();
    expect(act.sacCountIds).toHaveLength(2);

    const after = dispatchAction(s, act);
    expect(after.players.user.manaPool.C).toBe(0);                                   // {3} paid
    expect(treasureCount(after, "user")).toBe(0);                                    // both Treasures cracked
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.battlefield.find((p) => p.id === "ol").counters?.["+1/+1"]).toBe(2);
    expect(resolved.players.user.battlefield.find((p) => p.id === "bd").counters?.["+1/+1"]).toBe(2);
  });

  it("CREED — a Treasure sacrificed for the cost can NOT also be cracked for the {mana} part (no double-spend)", () => {
    // Olivia "{3}, Sacrifice two Treasures" with 5 Treasures + empty pool: the {3} comes from cracking 3
    // Treasures, the sac-2 consumes the other 2 — all 5 are spent, and the dispatch must NOT try to sac a
    // Treasure already cracked for mana (that previously crashed with PERM_NOT_FOUND).
    const olivia = createPermanent({
      id: "ol", controller: "user", summoningSick: false,
      card: { id: "c-ol", name: "Olivia", type: "Legendary Creature — Vampire", power: 3, toughness: 4, oracle: "{3}, Sacrifice two Treasures: Put two +1/+1 counters on each creature you control. Activate only as a sorcery." },
    });
    let s = withBf(mainState(), "user", [olivia, treasure("t1"), treasure("t2"), treasure("t3"), treasure("t4"), treasure("t5")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    const act = activateActions(s).find((a) => a.permanentId === "ol");
    expect(act).toBeTruthy();                                   // affordable: 3 Treasures for {3} + 2 to sac
    const after = dispatchAction(s, act);                       // must NOT throw
    expect(treasureCount(after, "user")).toBe(0);              // all 5 consumed (3 mana + 2 sac)
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.battlefield.find((p) => p.id === "ol").counters?.["+1/+1"]).toBe(2);
  });

  it("CREED — 4 Treasures + empty pool is UNPAYABLE for '{3}, Sacrifice two' (need 5 total) → not offered", () => {
    const olivia = createPermanent({
      id: "ol", controller: "user", summoningSick: false,
      card: { id: "c-ol", name: "Olivia", type: "Legendary Creature — Vampire", power: 3, toughness: 4, oracle: "{3}, Sacrifice two Treasures: Put two +1/+1 counters on each creature you control. Activate only as a sorcery." },
    });
    let s = withBf(mainState(), "user", [olivia, treasure("t1"), treasure("t2"), treasure("t3"), treasure("t4")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    expect(activateActions(s).filter((a) => a.permanentId === "ol")).toHaveLength(0);
  });

  it("cracking the N Treasures as a cost fires a TRIG-SACRIFICE watcher (CR 701.21)", () => {
    const knave = createPermanent({ id: "kn", card: KNAVE, controller: "user", summoningSick: false });
    const mayhem = createPermanent({
      id: "may", controller: "user", summoningSick: false,
      card: { id: "c-may", name: "Mayhem Devil", type: "Creature — Devil", power: 3, toughness: 3, oracle: "Whenever you sacrifice a permanent, Mayhem Devil deals 1 damage to any target." },
    });
    let s = withBf(mainState(), "user", [knave, mayhem, treasure("t1"), treasure("t2"), treasure("t3")]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L0", name: "Card" }] }, ai: { ...s.players.ai, life: 40 } } };
    const act = activateActions(s).find((a) => a.permanentId === "kn");
    let after = dispatchAction(s, act);
    // Three sacrifices → three Mayhem Devil triggers on the stack (above the ability). Resolve everything.
    after = flushTriggers(after, { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while ((after.stack || []).length && guard++ < 40) after = resolveTopOfStack(after);
    // The three pings landed somewhere (default target the opponent) → 3 damage total.
    expect(after.players.ai.life).toBeLessThanOrEqual(37);
  });
});
