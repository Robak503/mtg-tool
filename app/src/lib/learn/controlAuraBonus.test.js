/**
 * controlAuraBonus.test.js — CORPUS ④-K (2026-09-03 night): a CONTROL AURA CARRIES ITS BONUS, and a BESTOW STEAL.
 *
 * THE FP THIS CLOSES (measured on the board, 2026-09-03): Spirit Away / Yavimaya's Embrace / Corrupted Conscience were
 * credited native-aura — the tier gate accepts "You control enchanted creature." as a deliverer — but the control line
 * POISONED parseAuraBonus (all-or-nothing: an unrecognised clause drops the whole bonus to []), so the stolen host
 * never got its +2/+2 flying / trample / infect. The line is delivered by controlAura.js at the attach chokepoint,
 * never by the layer engine, so the parse now SKIPS it (the tap-lock line's proven skip shape) and the bonus survives.
 *
 * HYPNOTIC SIREN rides the same fix: its bestow gate needs a surviving aura bonus, and a BESTOWED permanent is an Aura
 * while attached (CR 702.103e) — isControlAuraPermanent reads the `bestowed` flag so the steal + revert hooks fire.
 * The AI reads any control line as ENEMY-intent (it used to HOLD every control Aura; with the bonus alive it would
 * have read Spirit Away as an own buff). Real oracle fixtures (bundled Scryfall snapshot, read in-session).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, attachPermanent, moveCardToZone, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword, permanentIsCreature } from "./layers.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { isControlAura, isControlAuraPermanent, grantsControlWhenAttached } from "./controlAura.js";
import { classifyCard, isNativeBestow } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SPIRIT_AWAY = { id: "c-sa", name: "Spirit Away", type: "Enchantment — Aura", mana: "{3}{U}{U}", mana_cost: "{3}{U}{U}", cmc: 5, keywords: [],
  oracle: "Enchant creature\nYou control enchanted creature.\nEnchanted creature gets +2/+2 and has flying." };
const EMBRACE = { id: "c-ye", name: "Yavimaya's Embrace", type: "Enchantment — Aura", mana: "{5}{G}{U}", cmc: 7, keywords: [],
  oracle: "Enchant creature\nYou control enchanted creature.\nEnchanted creature gets +2/+2 and has trample." };
const CONSCIENCE = { id: "c-cc", name: "Corrupted Conscience", type: "Enchantment — Aura", mana: "{3}{U}{U}", cmc: 5, keywords: [],
  oracle: "Enchant creature\nYou control enchanted creature.\nEnchanted creature has infect. (It deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" };
const SIREN = { id: "c-siren", name: "Hypnotic Siren", type: "Enchantment Creature — Siren", mana: "{U}", mana_cost: "{U}", cmc: 1, power: 1, toughness: 1, keywords: ["Flying"],
  oracle: "Bestow {5}{U}{U} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nFlying\nYou control enchanted creature.\nEnchanted creature gets +1/+1 and has flying." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };
const WURM = { id: "c-wurm", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: 6, toughness: 4, keywords: [], oracle: "" };

const controllerOf = (s, id) => findPermanent(s, id)?.controller ?? "GONE";

function attachedBoard(auraCard) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, players: { ...s0.players,
    user: { ...s0.players.user, battlefield: [createPermanent({ id: "A", card: auraCard, controller: "user" })] },
    ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "H", card: BEAR, controller: "ai", summoningSick: false })] } } };
  return attachPermanent(s, { equipId: "A", targetId: "H" });
}

describe("the parse — the control line no longer poisons the bonus", () => {
  it("⭐ Spirit Away reads +2/+2 and flying; Yavimaya's Embrace +2/+2 and trample; Corrupted Conscience infect", () => {
    expect(parseAuraBonus(SPIRIT_AWAY).map((d) => d.op)).toEqual([{ layerOp: "ptModify", power: 2, toughness: 2 }, { layerOp: "addKeyword", keyword: "Flying" }]);
    expect(parseAuraBonus(EMBRACE).map((d) => d.op)).toEqual([{ layerOp: "ptModify", power: 2, toughness: 2 }, { layerOp: "addKeyword", keyword: "Trample" }]);
    expect(parseAuraBonus(CONSCIENCE).map((d) => d.op)).toEqual([{ layerOp: "addKeyword", keyword: "infect" }]);
  });
  it("the tiers hold: all three native-aura, and Hypnotic Siren joins through the bestow gate", () => {
    for (const c of [SPIRIT_AWAY, EMBRACE, CONSCIENCE]) expect(classifyCard(c)).toBe("native-aura");
    expect(isNativeBestow(SIREN)).toBe(true);
    expect(classifyCard(SIREN)).toBe("native-aura");
  });
  it("recognition: isControlAura stays type-strict; grantsControlWhenAttached is type-blind; the permanent read needs bestowed", () => {
    expect(isControlAura(SIREN)).toBe(false);
    expect(grantsControlWhenAttached(SIREN)).toBe(true);
    expect(isControlAuraPermanent({ card: SIREN })).toBe(false);
    expect(isControlAuraPermanent({ card: SIREN, bestowed: true })).toBe(true);
    expect(isControlAuraPermanent({ card: SPIRIT_AWAY })).toBe(true);
  });
});

describe("runtime — the stolen host gets the bonus (the FP closed)", () => {
  it("⭐ Spirit Away: the Bear is ours AND a 4/4 flier", () => {
    const s = attachedBoard(SPIRIT_AWAY);
    expect(controllerOf(s, "H")).toBe("user");
    expect(permanentPower(s, "H")).toBe(4);
    expect(permanentToughness(s, "H")).toBe(4);
    expect(permanentHasKeyword(s, "H", "flying")).toBe(true);
  });
  it("Corrupted Conscience: the Bear is ours and has infect", () => {
    const s = attachedBoard(CONSCIENCE);
    expect(controllerOf(s, "H")).toBe("user");
    expect(permanentHasKeyword(s, "H", "infect")).toBe(true);
  });
  it("and when Spirit Away leaves, the Bear goes home a plain 2/2", () => {
    const s = moveCardToZone(attachedBoard(SPIRIT_AWAY), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "A" });
    expect(controllerOf(s, "H")).toBe("ai");
    expect(permanentPower(s, "H")).toBe(2);
    expect(permanentHasKeyword(s, "H", "flying")).toBe(false);
  });
});

describe("runtime — Hypnotic Siren bestowed onto the opponent's creature", () => {
  function sirenBoard() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, turn: 7, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        user: { ...s0.players.user, hand: [{ ...SIREN, id: "h-siren" }], battlefield: [], manaPool: { W: 0, U: 7, B: 0, R: 0, G: 0, C: 0 } },
        ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "bear", card: BEAR, controller: "ai", summoningSick: false })] } } };
  }
  const bestowCast = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-siren" && a.bestow && a.targets?.[0]?.id === "bear");

  it("⭐ the bestow cast is offered on the opponent's Bear; resolving it STEALS the Bear as a 3/3 flier, the Siren an attached non-creature", () => {
    const s = sirenBoard();
    const act = bestowCast(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    const siren = out.players.user.battlefield.find((p) => p.card?.name === "Hypnotic Siren");
    expect(siren).toBeTruthy();
    expect(siren.bestowed).toBe(true);
    expect(siren.attachedTo).toBe("bear");
    expect(permanentIsCreature(out, siren.id)).toBe(false);
    expect(controllerOf(out, "bear")).toBe("user");
    expect(permanentPower(out, "bear")).toBe(3);
    expect(permanentToughness(out, "bear")).toBe(3);
    expect(permanentHasKeyword(out, "bear", "flying")).toBe(true);
  });
  it("⛔ a PLAIN bestow (Nyxborn Rollicker) onto the opponent's Bear buffs it and steals NOTHING", () => {
    const ROLLICKER = { id: "h-roll", name: "Nyxborn Rollicker", type: "Enchantment Creature — Satyr", mana: "{R}", mana_cost: "{R}", cmc: 1, power: 1, toughness: 1, keywords: [],
      oracle: "Bestow {1}{R} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +1/+1." };
    const s0 = sirenBoard();
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [ROLLICKER], manaPool: { ...s0.players.user.manaPool, R: 2 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-roll" && a.bestow && a.targets?.[0]?.id === "bear");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.battlefield.find((p) => p.card?.name === "Nyxborn Rollicker").bestowed).toBe(true);
    expect(controllerOf(out, "bear")).toBe("ai");
    expect(permanentPower(out, "bear")).toBe(3);
  });
  it("the Siren leaving sends the Bear home; the Bear dying leaves the Siren behind as OUR creature (CR 702.103e)", () => {
    const s = sirenBoard();
    const out = resolveTopOfStack(dispatchAction(s, bestowCast(s)));
    const sirenId = out.players.user.battlefield.find((p) => p.card?.name === "Hypnotic Siren").id;
    const gone = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: sirenId });
    expect(controllerOf(gone, "bear")).toBe("ai");
    expect(permanentPower(gone, "bear")).toBe(2);
    const hostDied = moveCardToZone(out, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    const siren = hostDied.players.user.battlefield.find((p) => p.id === sirenId);
    expect(siren).toBeTruthy();
    expect(siren.attachedTo).toBeFalsy();
    expect(permanentIsCreature(hostDied, sirenId)).toBe(true);
  });
});

describe("the AI — a control Aura is enemy-intent", () => {
  let seq = 0;
  const perm = (card, controller) => { seq += 1; return createPermanent({ id: `${controller}-p${seq}`, card: { ...card, id: `${controller}-c${seq}` }, controller, summoningSick: false }); };
  function aiMain({ hand, mana, board = [], oppBoard = [] }) {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    return { ...b, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: { ...b.players, ai: { ...b.players.ai, hand, battlefield: board, manaPool: { ...b.players.ai.manaPool, ...mana } }, user: { ...b.players.user, battlefield: oppBoard } } };
  }
  const aiPick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });

  it("⭐ Spirit Away goes on the BIGGEST ENEMY creature, never the AI's own", () => {
    const enemyWurm = perm(WURM, "user");
    const s = aiMain({ hand: [{ ...SPIRIT_AWAY, id: "aura1" }], mana: { U: 5 }, board: [perm(WURM, "ai")], oppBoard: [perm(BEAR, "user"), enemyWurm] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "aura1", isAuraSpell: true });
    expect(pick.targets[0].id).toBe(enemyWurm.id);
  });
  it("with only its OWN creatures on the table the AI HOLDS Spirit Away", () => {
    const s = aiMain({ hand: [{ ...SPIRIT_AWAY, id: "aura1" }], mana: { U: 5 }, board: [perm(WURM, "ai"), perm(BEAR, "ai")] });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });
});
