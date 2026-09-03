/**
 * hostExileAura.test.js — CORPUS ④-N (2026-09-03 night): the AURA-OWN ONE-SHOT ON THE HOST — "{2}{W}: Exile enchanted
 * creature." (Cooped Up / Dreadful Apathy / Redemption Arc) and "{W}: Return enchanted creature to its owner's hand."
 * (Sun Clasp). The aura-own activated family (tap / untap / pump / regenerate on the fixed enchanted referent) gains
 * exile and bounce: two parser arms, and the two enchanted-referent allowlists (the own-activated tier gate and the
 * bonus-walk validator) admit the ops. The zone moves are the ordinary appliers; the Aura falls off by the SBA once
 * its host is gone. Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseAuraBonus } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const COOPED_UP = { id: "c-coop", name: "Cooped Up", type: "Enchantment — Aura", mana: "{W}", cmc: 1, keywords: [],
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\n{2}{W}: Exile enchanted creature." };
const DREADFUL_APATHY = { id: "c-da", name: "Dreadful Apathy", type: "Enchantment — Aura", mana: "{2}{W}", cmc: 3, keywords: [],
  oracle: "Enchant creature\nEnchanted creature can't attack or block.\n{2}{W}: Exile enchanted creature." };
const REDEMPTION_ARC = { id: "c-ra", name: "Redemption Arc", type: "Enchantment — Aura", mana: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Enchant creature\nEnchanted creature has indestructible and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\n{1}{W}: Exile enchanted creature." };
const SUN_CLASP = { id: "c-sc", name: "Sun Clasp", type: "Enchantment — Aura", mana: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Enchant creature\nEnchanted creature gets +1/+3.\n{W}: Return enchanted creature to its owner's hand." };
const UTTER_INSIGNIFICANCE = { id: "c-ui", name: "Utter Insignificance", type: "Enchantment — Aura", mana: "{1}{U}", cmc: 2, keywords: [],
  oracle: "Flash\nEnchant creature\nEnchanted creature loses all abilities and has base power and toughness 1/1.\n{2}{C}: Exile enchanted creature." };

function setup(auraCard, pool) {
  const host = createPermanent({ id: "host", card: { id: "c-host", name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai", summoningSick: false });
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "host"; host.attachments = ["aura"];
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players,
      user: { ...base.players.user, graveyard: [], battlefield: [a], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...base.players.ai, hand: [], graveyard: [], exile: [], battlefield: [host] } } };
}
const auraActs = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "aura");

describe("the parse + the tiers", () => {
  it("⭐ the two arms parse on the fixed enchanted referent; a rider falls through", () => {
    expect(parseEffectClause("exile enchanted creature", "Enchantment").atoms).toEqual([{ op: "exile", target: "enchanted" }]);
    expect(parseEffectClause("return enchanted creature to its owner's hand", "Enchantment").atoms).toEqual([{ op: "bounce", target: "enchanted" }]);
    expect(parseEffectClause("exile enchanted creature unless its controller pays {2}", "Enchantment").confidence).not.toBe("high");
  });
  it("⭐ the four flip native; Utter Insignificance stays parked on loses-all-abilities", () => {
    for (const c of [COOPED_UP, DREADFUL_APATHY, REDEMPTION_ARC, SUN_CLASP]) expect(classifyCard(c)).toMatch(/^native/);
    expect(classifyCard(UTTER_INSIGNIFICANCE)).not.toMatch(/^native/);
    // the activated line no longer poisons the static half — Sun Clasp's +1/+3 survives the bonus parse
    expect(parseAuraBonus(SUN_CLASP).map((d) => d.op)).toEqual([{ layerOp: "ptModify", power: 1, toughness: 3 }]);
  });
  it("the ACTIVATED-ONLY shape (no static half) sits on the own-activated tier — SYNTHETIC: no printed Aura is only \"{W}: Exile enchanted creature\"", () => {
    // Every printed carrier has a static half and is credited through the residue walk; this pins the own-activated
    // gate's own widening (the two allowlists must move together), so a future print of the bare shape is credited.
    expect(classifyCard({ id: "c-syn", name: "Probe Banisher", type: "Enchantment — Aura", mana: "{W}", cmc: 1, keywords: [],
      oracle: "Enchant creature\n{W}: Exile enchanted creature." })).toBe("native-activated");
  });
});

describe("runtime — the Aura's own ability removes its host", () => {
  it("⭐ Cooped Up: {2}{W} exiles the enchanted Bear, and the Aura falls off to the graveyard", () => {
    const s = setup(COOPED_UP, { W: 1, C: 2 });
    const act = auraActs(s).find((a) => /exile enchanted creature/i.test(a.abilityText));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "host")).toBeFalsy();
    expect(out.players.ai.exile.some((c) => c.name === "Host Bear")).toBe(true);
    expect(findPermanent(out, "aura")).toBeFalsy();
    expect(out.players.user.graveyard.some((c) => c.name === "Cooped Up")).toBe(true);
    expect(out.players.user.manaPool.W).toBe(0);
  });
  it("⭐ Sun Clasp: {W} returns the enchanted Bear to its owner's hand", () => {
    const s = setup(SUN_CLASP, { W: 1 });
    const act = auraActs(s).find((a) => /return enchanted creature/i.test(a.abilityText));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "host")).toBeFalsy();
    expect(out.players.ai.hand.some((c) => c.name === "Host Bear")).toBe(true);
    expect(findPermanent(out, "aura")).toBeFalsy();
  });
  it("⛔ unaffordable → not offered", () => {
    expect(auraActs(setup(COOPED_UP, { W: 1 })).some((a) => /exile enchanted creature/i.test(a.abilityText))).toBe(false);
  });
});

describe("the three riders the flip-diff surfaced — each audited on the board before it was credited", () => {
  const SIGARDAS = { id: "c-si", name: "Sigarda's Imprisonment", type: "Enchantment — Aura", mana: "{2}{W}", cmc: 3, keywords: [],
    oracle: "Enchant creature\nEnchanted creature can't attack or block.\n{4}{W}: Exile enchanted creature. Create a Blood token. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")" };
  const GHOSTLY_WINGS = { id: "c-gw", name: "Ghostly Wings", type: "Enchantment — Aura", mana: "{1}{U}", cmc: 2, keywords: [],
    oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has flying.\nDiscard a card: Return enchanted creature to its owner's hand." };
  const BRIGHTS = { id: "c-cb", name: "Caught in the Brights", type: "Enchantment — Aura", mana: "{2}{W}", cmc: 3, keywords: [],
    oracle: "Enchant creature\nEnchanted creature can't attack or block.\nWhen a Vehicle you control attacks, exile enchanted creature." };

  it("Sigarda's Imprisonment: the exile lands AND the Blood token is created with its printed ability", () => {
    const s = setup(SIGARDAS, { W: 1, C: 4 });
    const out = resolveTopOfStack(dispatchAction(s, auraActs(s)[0]));
    expect(findPermanent(out, "host")).toBeFalsy();
    const blood = out.players.user.battlefield.find((p) => p.card?.name === "Blood");
    expect(blood).toBeTruthy();
    expect(blood.card.oracle).toMatch(/Discard a card, Sacrifice this artifact: Draw a card/);
  });
  it("Ghostly Wings: the DISCARD cost is offered only with a card in hand, and it is really paid", () => {
    const spare = { id: "h1", name: "Spare Card", type: "Sorcery", mana: "{G}", cmc: 1, keywords: [], oracle: "You gain 1 life." };
    const s0 = setup(GHOSTLY_WINGS, {});
    expect(auraActs(s0).length).toBe(0);
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [spare] } } };
    const act = auraActs(s)[0];
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.hand.length).toBe(0);
    expect(out.players.user.graveyard.some((c) => c.name === "Spare Card")).toBe(true);
    expect(out.players.ai.hand.some((c) => c.name === "Host Bear")).toBe(true);
  });
  it("Caught in the Brights: a VEHICLE attacking exiles the host; a plain creature attacking fires nothing", () => {
    const s0 = setup(BRIGHTS, {});
    const veh = createPermanent({ id: "veh", card: { id: "c-veh", name: "Smuggler's Copter", type: "Artifact — Vehicle", power: 3, toughness: 3, keywords: [], oracle: "Flying\nCrew 1" }, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "ub", card: { id: "c-ub", name: "Plain Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });
    const s = { ...s0, phase: "combat", step: "declare-attackers", players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, veh, bear] } } };
    const vehicleAttack = flushTriggers(checkAttackTriggers({ ...s, combat: { attackers: [{ permanentId: "veh", attackingPlayer: "user", defender: "ai" }], blockers: [] } }));
    expect(vehicleAttack.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    expect(findPermanent(resolveTopOfStack(vehicleAttack), "host")).toBeFalsy();
    const bearAttack = flushTriggers(checkAttackTriggers({ ...s, combat: { attackers: [{ permanentId: "ub", attackingPlayer: "user", defender: "ai" }], blockers: [] } }));
    expect(bearAttack.stack.length).toBe(0);
  });
});
