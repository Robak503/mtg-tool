/**
 * indomitableMight.test.js — the GRANTED assign-as-unblocked (SHELF-TAIL SH19 — Thrun's Indomitable Might;
 * CR 508.1h). The aura-granted twin of Thorn Elemental's printed line (thornAssign.test.js): "Enchanted
 * creature gets +3/+3. Enchanted creature's controller may have it assign its combat damage as though it
 * weren't blocked." The +3/+3 is the ordinary attached ptModify; the second sentence grants the
 * `assignsCombatDamageAsUnblocked` pseudo-keyword, read printed-OR-granted at combatResolution's assign site
 * (the enchanted creature's own text says nothing — the grant is read beside the printed regex, exactly like
 * the cantBlock/mustAttack grants). Flip +1/0/0 (Thrun-specific).
 *
 * Mutation-checked (via Edit): (1) neuter the parse arm → Indomitable Might body-only (parse + classify die);
 * (2) drop the granted branch of the combatResolution read → the enchanted creature's damage goes to the
 * BLOCKER, not the defender (the runtime enforcement pin dies — a native flip that does nothing in combat).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const INDOMITABLE = { name: "Indomitable Might", type: "Enchantment — Aura", mana: "{3}{G}",
  oracle: "Flash\nEnchant creature\nEnchanted creature gets +3/+3.\nEnchanted creature's controller may have it assign its combat damage as though it weren't blocked." };

describe("parse + classify", () => {
  it("emits the +3/+3 ptModify AND the assign-as-unblocked grant; the card is native-aura", () => {
    expect(parseAttachedBonus(INDOMITABLE).map((d) => d.op)).toEqual([
      { layerOp: "ptModify", power: 3, toughness: 3 },
      { layerOp: "addKeyword", keyword: "assignsCombatDamageAsUnblocked" },
    ]);
    expect(classifyCard(INDOMITABLE)).toBe("native-aura");
  });
});

describe("runtime — the enchanted creature is blocked yet the player takes it all", () => {
  function board() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "b", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    bear.attachments = ["aura"];
    const aura = createPermanent({ id: "aura", card: { id: "ca", name: INDOMITABLE.name, type: INDOMITABLE.type, oracle: INDOMITABLE.oracle }, controller: "user" });
    aura.attachedTo = "b";
    const wall = createPermanent({ id: "wl", card: { id: "wc", name: "Big Wall", type: "Creature — Wall", power: "1", toughness: "9", oracle: "" }, controller: "ai1", summoningSick: false });
    return { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura] }, ai1: { ...s.players.ai1, battlefield: [wall] } } };
  }
  it("the grant is live layer-aware (the enchanted creature has the keyword and is a 5/5)", () => {
    expect(permanentHasKeyword(board(), "b", "assignsCombatDamageAsUnblocked")).toBe(true);
  });
  it("blocked, the enchanted 5/5 deals its FULL 5 to the defender; the wall takes 0 but deals back", () => {
    const s = board();
    const before = s.players.ai1.life;
    const after = resolveCombatDamage({ ...s, combat: {
      attackers: [{ permanentId: "b", attackingPlayer: "user", defender: "ai1" }],
      blockers: [{ blockerId: "wl", blockingPlayer: "ai1", attackerId: "b" }],
    } });
    expect(before - after.players.ai1.life).toBe(5);                                          // 2 base + 3 from the aura, straight to the player
    expect(after.players.ai1.battlefield.find((p) => p.id === "wl").damageMarked || 0).toBe(0); // nothing to the blocker
    expect(after.players.user.battlefield.find((p) => p.id === "b").damageMarked || 0).toBe(1); // the wall dealt back
  });
  it("CONTROL — the SAME bear without the aura, blocked, deals to the WALL (not the player)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "b", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const wall = createPermanent({ id: "wl", card: { id: "wc", name: "Big Wall", type: "Creature — Wall", power: "1", toughness: "9", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] }, ai1: { ...s.players.ai1, battlefield: [wall] } } };
    const before = s.players.ai1.life;
    const after = resolveCombatDamage({ ...s, combat: {
      attackers: [{ permanentId: "b", attackingPlayer: "user", defender: "ai1" }],
      blockers: [{ blockerId: "wl", blockingPlayer: "ai1", attackerId: "b" }],
    } });
    expect(after.players.ai1.life).toBe(before);                                              // player untouched
    expect(after.players.ai1.battlefield.find((p) => p.id === "wl").damageMarked || 0).toBe(2); // 2 to the wall
  });
});
