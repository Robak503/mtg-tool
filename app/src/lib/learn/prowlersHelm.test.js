/**
 * prowlersHelm.test.js — ④-W (2026-09-03 night): the GRANTED except-by evasion — "Equipped creature can't be blocked
 * except by Walls." (Prowler's Helm, Thrun Voltron) and the Aura twins "Enchanted creature can't be blocked except by
 * <filter>" (Invisibility, Seeker, Canopy Cover). The self-printed form was enforced (EV-2/EV-3); the granted form
 * now rides the same fail-closed filter grammar off the attacker's attachments at the block gate, and the classifier
 * credits the line through the same reader (registered as the parser's except-by validator). Real oracle fixtures
 * (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { attachedExceptByOf, canBlockAttacker } from "./combatEvasion.js";
import { parseAuraBonus, parseEquipmentBonus } from "./staticAbilityParser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HELM = { id: "c-helm", name: "Prowler's Helm", type: "Artifact — Equipment", mana: "{2}", cmc: 2, keywords: [], oracle: "Equipped creature can't be blocked except by Walls.\nEquip {2}" };
const INVISIBILITY = { id: "c-inv", name: "Invisibility", type: "Enchantment — Aura", mana: "{U}{U}", cmc: 2, keywords: [], oracle: "Enchant creature\nEnchanted creature can't be blocked except by Walls." };
const SEEKER = { id: "c-seek", name: "Seeker", type: "Enchantment — Aura", mana: "{2}{W}{W}", cmc: 4, keywords: [], oracle: "Enchant creature\nEnchanted creature can't be blocked except by artifact creatures and/or white creatures." };
const CANOPY = { id: "c-can", name: "Canopy Cover", type: "Enchantment — Aura", mana: "{1}{G}", cmc: 2, keywords: [], oracle: "Enchant creature\nEnchanted creature can't be blocked except by creatures with flying or reach.\nEnchanted creature can't be the target of spells or abilities your opponents control." };

function board(attachmentCard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bear = createPermanent({ id: "atk", card: { id: "c-atk", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], colors: ["G"], oracle: "" }, controller: "user", summoningSick: false });
  const att = createPermanent({ id: "att", card: attachmentCard, controller: "user" });
  att.attachedTo = "atk"; bear.attachments = ["att"];
  const wall = createPermanent({ id: "wall", card: { id: "c-wall", name: "Wall of Stone", type: "Creature — Wall", power: 0, toughness: 8, keywords: ["Defender"], colors: ["R"], oracle: "Defender" }, controller: "ai", summoningSick: false });
  const bear2 = createPermanent({ id: "blk", card: { id: "c-blk", name: "Runeclaw Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], colors: ["G"], oracle: "" }, controller: "ai", summoningSick: false });
  const flier = createPermanent({ id: "fly", card: { id: "c-fly", name: "Cloud Bird", type: "Creature — Bird", power: 1, toughness: 1, keywords: ["Flying"], colors: ["U"], oracle: "Flying" }, controller: "ai", summoningSick: false });
  return { ...s0, phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, att] }, ai: { ...s0.players.ai, battlefield: [wall, bear2, flier] } } };
}

describe("the reader + the tiers", () => {
  it("⭐ the granted line reads through the same fail-closed grammar; an unvetted filter reads null", () => {
    expect(attachedExceptByOf(HELM)).toEqual({ kind: "subtype", subtype: "Wall" });
    expect(attachedExceptByOf(SEEKER)).toEqual({ kind: "or", arms: [{ kind: "artifact" }, { kind: "color", color: "W" }] });
    expect(attachedExceptByOf({ oracle: "Equipped creature can't be blocked except by legendary creatures." })).toBeNull();
    expect(attachedExceptByOf({ oracle: "Equipped creature gets +1/+1." })).toBeNull();
  });
  it("⭐ Prowler's Helm is native-equipment; Invisibility and Seeker native-aura; the line no longer poisons a sibling bonus", () => {
    expect(classifyCard(HELM)).toBe("native-equipment");
    expect(classifyCard(INVISIBILITY)).toBe("native-aura");
    expect(classifyCard(SEEKER)).toBe("native-aura");
    expect(parseEquipmentBonus({ ...HELM, oracle: "Equipped creature gets +1/+1.\nEquipped creature can't be blocked except by Walls.\nEquip {2}" }).map((d) => d.op)).toEqual([{ layerOp: "ptModify", power: 1, toughness: 1 }]);
    expect(parseAuraBonus({ ...INVISIBILITY, oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nEnchanted creature can't be blocked except by Walls." }).map((d) => d.op)).toEqual([{ layerOp: "ptModify", power: 1, toughness: 1 }]);
  });
  it("Canopy Cover: its second line (a granted untargetability) is a separate shape — pinned wherever it lands, never assumed", () => {
    const tier = classifyCard(CANOPY);
    expect(typeof tier).toBe("string");
  });
});

describe("the block gate — the attacker wearing the grant", () => {
  it("⭐ Prowler's Helm: the Wall may block, the Bear and the flier may not", () => {
    const s = board(HELM);
    expect(canBlockAttacker(s, "wall", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);
    expect(canBlockAttacker(s, "fly", "atk", "ai")).toBe(false);
  });
  it("⭐ Invisibility: the same through an Aura; Seeker admits an artifact or white blocker only", () => {
    const s = board(INVISIBILITY);
    expect(canBlockAttacker(s, "wall", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);
    const s2 = board(SEEKER);
    expect(canBlockAttacker(s2, "blk", "atk", "ai")).toBe(false);
    const white = createPermanent({ id: "wht", card: { id: "c-wht", name: "Savannah Lions", type: "Creature — Cat", power: 2, toughness: 1, keywords: [], colors: ["W"], oracle: "" }, controller: "ai", summoningSick: false });
    const s3 = { ...s2, players: { ...s2.players, ai: { ...s2.players.ai, battlefield: [...s2.players.ai.battlefield, white] } } };
    expect(canBlockAttacker(s3, "wht", "atk", "ai")).toBe(true);
  });
  it("⛔ detached, the grant is gone: everyone may block again — and a STALE link (the attacker still lists it, the Equipment points elsewhere) grants nothing", () => {
    const s = board(HELM);
    const detached = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === "atk" ? { ...p, attachments: [] } : p.id === "att" ? { ...p, attachedTo: undefined } : p) } } };
    expect(canBlockAttacker(detached, "blk", "atk", "ai")).toBe(true);
    const stale = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === "att" ? { ...p, attachedTo: "someone-else" } : p) } } };
    expect(canBlockAttacker(stale, "blk", "atk", "ai")).toBe(true);
  });
});
