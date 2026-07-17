/**
 * runemarkConditionalKeyword.test.js — BLITZ AU-1 (AURA STAGE-1, the conditional-keyword rider tail).
 *
 * The stage-1 pump family — an Aura whose whole body is "Enchant creature" + "Enchanted creature gets
 * +X/+Y" (± "and has <enforced keyword>") — was ALREADY native (parseAuraBonus + isNativeAura, 62 cards).
 * This slice closes the ONE residual that is still a genuine pump+keyword Aura: the Runemark cycle, whose
 * keyword grant is CONDITIONAL — "Enchanted creature has <keyword> as long as you control a <colorA> or
 * <colorB> permanent." The unconditional +2/+2 is already modeled; the whole card parked only because the
 * conditional keyword clause failed parseAttachedClause's all-or-nothing gate.
 *
 * The flip reuses the SAME two primitives the group-anthem / self-static gated grants stand on:
 *   • parseAsLongAsGate (staticAbilityParser) — the shared "as long as <condition>" → serializable gate
 *     parser, here widened with a COLOR-OR control gate ("you control a black or green permanent").
 *   • the layer engine's GATED layer-6 addKeyword (layers.keywordSet / permanentHasKeyword), whose gate is
 *     re-evaluated LIVE every derive; gateOn:"source" (baked into the spec) reads the AURA controller's
 *     board — CR 109.5: "you" is the source's controller, which the enchanted creature need NOT be.
 *   • a new countSelfSpecOnBoard spec kind (colorPermanentsYouControl) counting printed-color matches.
 *
 * Spectral Cloak ("has shroud as long as it's untapped") rides the SAME branch through a PER-CANDIDATE
 * gate (kind:"untapped", no gateOn — the enchanted creature's own tap state).
 *
 * CREED: false-neg SAFE, false-pos FORBIDDEN, whole-card-or-park. An unmodeled condition drops the whole
 * bonus (a safe FN — Predator's Gambit parks); the grant never leaks to a non-enchanted creature; the gate
 * reads the SOURCE's board, never the host's.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent, moveCardToZone, attachPermanent, destroyLethalCreatures } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseAuraBonus, isNativeAura } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle text (bundled Scryfall, probed 2026-07-17 via cardIndex.lookupCard). ────────────────────
const ABZAN = { name: "Abzan Runemark", type: "Enchantment — Aura", mana: "{2}{W}", colors: ["W"], oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has vigilance as long as you control a black or green permanent." };
const JESKAI = { name: "Jeskai Runemark", type: "Enchantment — Aura", mana: "{2}{U}", colors: ["U"], oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has flying as long as you control a red or white permanent." };
const MARDU = { name: "Mardu Runemark", type: "Enchantment — Aura", mana: "{2}{R}", colors: ["R"], oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has first strike as long as you control a white or black permanent." };
const SULTAI = { name: "Sultai Runemark", type: "Enchantment — Aura", mana: "{2}{B}", colors: ["B"], oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has deathtouch as long as you control a green or blue permanent." };
const TEMUR = { name: "Temur Runemark", type: "Enchantment — Aura", mana: "{2}{G}", colors: ["G"], oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nEnchanted creature has trample as long as you control a blue or red permanent." };
const SPECTRAL_CLOAK = { name: "Spectral Cloak", type: "Enchantment — Aura", mana: "{1}{U}", colors: ["U"], oracle: "Enchant creature\nEnchanted creature has shroud as long as it's untapped." };
// Negative-pump family member (already native — used here to pin the toughness-death SBA end of the pipeline).
const ENFEEBLEMENT = { name: "Enfeeblement", type: "Enchantment — Aura", mana: "{B}", colors: ["B"], oracle: "Enchant creature\nEnchanted creature gets -2/-2." };

// FN guards — parked sub-buckets (whole-card-or-park).
const PREDATORS_GAMBIT = { name: "Predator's Gambit", type: "Enchantment — Aura", mana: "{B}", colors: ["B"], oracle: "Enchant creature\nEnchanted creature gets +2/+1.\nEnchanted creature has intimidate as long as its controller controls no other creatures." };
const HOLY_MANTLE = { name: "Holy Mantle", type: "Enchantment — Aura", mana: "{3}{W}", colors: ["W"], oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has protection from creatures." };
const SPIRIT_MANTLE = { name: "Spirit Mantle", type: "Enchantment — Aura", mana: "{1}{W}", colors: ["W"], oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has protection from creatures." };
const ELDRAZI_CONSCRIPTION = { name: "Eldrazi Conscription", type: "Enchantment — Aura", mana: "{8}", colors: [], oracle: "Enchant creature\nEnchanted creature gets +10/+10 and has trample and annihilator 2." };

// A colorless 2/2 host — its color never satisfies the black-or-green gate, so the gate depends ONLY on
// the permanents a test explicitly puts on the board (a green Forest would NOT count — lands are colorless).
const GOLEM = { name: "Test Golem", type: "Artifact Creature — Golem", power: 2, toughness: 2, colors: [], mana: "{2}", oracle: "" };
// A genuinely GREEN permanent (a creature — colorsOf reads printed colors; a basic land is colorless).
const GREEN_ELF = { name: "Test Elf", type: "Creature — Elf", power: 1, toughness: 1, colors: ["G"], mana: "{G}", oracle: "" };

function boardState({ user = [], ai = [], hand = [], pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}
const withBattlefield = (s, pid, bf) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: bf } } });

describe("BLITZ AU-1 — recognition (real oracle)", () => {
  it("the 5 Runemarks + Spectral Cloak classify native-aura", () => {
    for (const c of [ABZAN, JESKAI, MARDU, SULTAI, TEMUR, SPECTRAL_CLOAK]) {
      expect(isNativeAura(c)).toBe(true);
      expect(classifyCard(c)).toBe("native-aura");
    }
  });

  it("Abzan Runemark parses the unconditional +2/+2 AND the color-OR-gated (gateOn:source) vigilance grant", () => {
    expect(parseAuraBonus(ABZAN)).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Vigilance", gate: { countSpec: { kind: "colorPermanentsYouControl", colors: ["B", "G"] }, atLeast: 1, gateOn: "source" } }, duration: { kind: "permanent" } },
    ]);
  });

  it("each Runemark carries the right keyword + color pair", () => {
    const kwGate = (c) => parseAuraBonus(c).find(e => e.op.layerOp === "addKeyword").op;
    expect(kwGate(JESKAI)).toMatchObject({ keyword: "Flying", gate: { countSpec: { colors: ["R", "W"] } } });
    expect(kwGate(MARDU)).toMatchObject({ keyword: "First strike", gate: { countSpec: { colors: ["W", "B"] } } });
    expect(kwGate(SULTAI)).toMatchObject({ keyword: "Deathtouch", gate: { countSpec: { colors: ["G", "U"] } } });
    expect(kwGate(TEMUR)).toMatchObject({ keyword: "Trample", gate: { countSpec: { colors: ["U", "R"] } } });
  });

  it("Spectral Cloak parses a PER-CANDIDATE 'untapped'-gated shroud grant (no gateOn — reads the host)", () => {
    expect(parseAuraBonus(SPECTRAL_CLOAK)).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "shroud", gate: { kind: "untapped" } }, duration: { kind: "permanent" } },
    ]);
  });

  it("FN guards — parked sub-buckets stay body-only (whole-card-or-park)", () => {
    // Predator's Gambit: the condition reads the HOST's controller ("its controller controls no other
    // creatures"), a gate shape this slice does not model → parseAsLongAsGate null → whole bonus drops.
    expect(isNativeAura(PREDATORS_GAMBIT)).toBe(false);
    expect(classifyCard(PREDATORS_GAMBIT)).toBe("body-only");
    // Holy Mantle / Spirit Mantle: "protection from creatures" — protection-from-TYPE is unenforced.
    expect(classifyCard(HOLY_MANTLE)).toBe("body-only");
    expect(classifyCard(SPIRIT_MANTLE)).toBe("body-only");
    // Eldrazi Conscription: annihilator is not a grantable keyword.
    expect(classifyCard(ELDRAZI_CONSCRIPTION)).toBe("body-only");
  });
});

describe("BLITZ AU-1 — full-pipeline runtime (cast → attach → gated grant → host dies → aura dies)", () => {
  it("cast Abzan Runemark from hand → enters attached, +2/+2 lives, vigilance gated on MY board", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false });
    const green = createPermanent({ id: "green", card: GREEN_ELF, controller: "user", summoningSick: false });
    let s = boardState({ user: [golem, green], hand: [{ id: "c-abzan", ...ABZAN }] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell && a.targets?.[0]?.id === "golem");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Abzan Runemark");
    expect(aura.attachedTo).toBe("golem");
    expect(findPermanent(s, "golem").permanent.attachments).toEqual([aura.id]);
    expect(permanentPower(s, "golem")).toBe(4);
    expect(permanentToughness(s, "golem")).toBe(4);
    expect(permanentHasKeyword(s, "golem", "Vigilance")).toBe(true); // a green permanent (the Elf) is on my board
  });

  it("gated keyword flips LIVE with the board — vigilance only while I control a black-or-green permanent; +2/+2 is unconditional", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ABZAN, controller: "user" });
    // Gate CLOSED: my board is only the colorless golem + the WHITE aura — no black/green permanent.
    let s = boardState({ user: [golem, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "golem" });
    expect(permanentPower(s, "golem")).toBe(4);                          // +2/+2 unconditional
    expect(permanentToughness(s, "golem")).toBe(4);
    expect(permanentHasKeyword(s, "golem", "Vigilance")).toBe(false);    // gate closed → no vigilance
    // Gate OPEN: add a GREEN permanent I control.
    const green = createPermanent({ id: "green", card: GREEN_ELF, controller: "user", summoningSick: false });
    const s2 = withBattlefield(s, "user", [...s.players.user.battlefield, green]);
    expect(permanentHasKeyword(s2, "golem", "Vigilance")).toBe(true);    // gate open → vigilance
    expect(permanentPower(s2, "golem")).toBe(4);                         // pump unchanged
  });

  it("gateOn:source — an OPPONENT-enchanted Runemark reads MY board, never the host's controller (CR 109.5)", () => {
    const oppCrea = createPermanent({ id: "oppcrea", card: GOLEM, controller: "ai", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ABZAN, controller: "user" });
    const myGreen = createPermanent({ id: "mygreen", card: GREEN_ELF, controller: "user", summoningSick: false });
    let s = boardState({ user: [aura, myGreen], ai: [oppCrea] });
    s = attachPermanent(s, { equipId: "aura", targetId: "oppcrea" });
    // I control a green permanent → the opponent's enchanted creature HAS vigilance (+2/+2 too).
    expect(permanentHasKeyword(s, "oppcrea", "Vigilance")).toBe(true);
    expect(permanentPower(s, "oppcrea")).toBe(4);
    // Move the green permanent to the OPPONENT's side: now only the opponent controls one. The gate reads
    // the SOURCE (my aura) controller's board → still CLOSED. The +2/+2 (unconditional) is unaffected.
    let s2 = withBattlefield(s, "user", s.players.user.battlefield.filter(p => p.id !== "mygreen"));
    const oppGreen = createPermanent({ id: "oppgreen", card: GREEN_ELF, controller: "ai", summoningSick: false });
    s2 = withBattlefield(s2, "ai", [...s2.players.ai.battlefield, oppGreen]);
    expect(permanentHasKeyword(s2, "oppcrea", "Vigilance")).toBe(false); // reads MY board, not the host's
    expect(permanentPower(s2, "oppcrea")).toBe(4);
  });

  it("the grant never leaks to a non-enchanted creature", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "other", card: GOLEM, controller: "user", summoningSick: false });
    const green = createPermanent({ id: "green", card: GREEN_ELF, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ABZAN, controller: "user" });
    let s = boardState({ user: [golem, other, green, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "golem" });
    expect(permanentHasKeyword(s, "golem", "Vigilance")).toBe(true);
    expect(permanentPower(s, "golem")).toBe(4);
    // The OTHER creature (same controller, unenchanted) gets neither the keyword nor the pump.
    expect(permanentHasKeyword(s, "other", "Vigilance")).toBe(false);
    expect(permanentPower(s, "other")).toBe(2);
    expect(permanentToughness(s, "other")).toBe(2);
  });

  it("host dies → the Aura is put into its owner's graveyard (falls-off SBA, CR 704.5m)", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ABZAN, controller: "user" });
    let s = boardState({ user: [golem, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "golem" });
    const s2 = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "golem" });
    expect(s2.players.user.battlefield.some(p => p.id === "aura")).toBe(false);
    expect(s2.players.user.graveyard.some(c => c.name === "Abzan Runemark")).toBe(true);
  });

  it("negative-pump Aura drops toughness to 0 → destroyLethalCreatures kills the host (SBA, CR 704.5f)", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false }); // 2/2
    const aura = createPermanent({ id: "aura", card: ENFEEBLEMENT, controller: "user" });
    let s = boardState({ user: [golem, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "golem" });
    expect(permanentToughness(s, "golem")).toBe(0); // 2 - 2
    const { state: s2, dead } = destroyLethalCreatures(s);
    expect(dead.some(d => d.id === "golem")).toBe(true);
    expect(s2.players.user.battlefield.some(p => p.id === "golem")).toBe(false);
  });

  it("Spectral Cloak — per-candidate 'untapped' gate: shroud while the host is untapped, gone when tapped", () => {
    const golem = createPermanent({ id: "golem", card: GOLEM, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: SPECTRAL_CLOAK, controller: "user" });
    let s = boardState({ user: [golem, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "golem" });
    expect(permanentHasKeyword(s, "golem", "Shroud")).toBe(true); // untapped
    const s2 = withBattlefield(s, "user", s.players.user.battlefield.map(p => p.id === "golem" ? { ...p, tapped: true } : p));
    expect(permanentHasKeyword(s2, "golem", "Shroud")).toBe(false); // tapped → the per-candidate gate closes
  });
});
