/**
 * exileWhatItDamaged.test.js — "If a creature dealt damage by this creature this turn would die, exile it instead."
 * (Incendiary Oracle, Kumano's Pupils, Frostwielder — the 09-06 plan's stage ③, census row ⑧, 2026-09-30).
 *
 * A replacement from a STATIC ability (CR 614), so it applies only while the source is on the battlefield. The engine
 * already had the per-permanent `damagedBy` record (combat pairs via recordDamageSource; "deals N damage" effects) and a
 * death-to-exile path (Lava Coil's `exileIfDiesTurn` stamp, honored at the lethal-damage and legend-rule death sites).
 * The build asks at the MOMENT OF DEATH — of the pre-removal state — whether a permanent in the dying creature's
 * damagedBy is on the battlefield carrying the static. Deliberately NOT a stamp at damage time: a stamp would still exile
 * after the source had left the battlefield, which the pin below forbids.
 *
 * Documented under-application (the safe side): a fight records no damage source. (Until ③ · 18 a creature damaged by the
 * source and then DESTROYED or SACRIFICED that turn also went to the graveyard — only lethal damage and the legend rule asked;
 * every death site asks now, pinned in diesExiledInstead.test.js.)
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, destroyLethalCreatures, applyLegendRule, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = { name: "Incendiary Oracle", type: "Creature — Human Shaman", mana: "{1}{R}", power: 2, toughness: 2,
  oracle: "{1}{R}: This creature gets +1/+0 until end of turn.\nIf a creature dealt damage by this creature this turn would die, exile it instead." };
const PUPILS = { id: "pup-c", name: "Kumano's Pupils", type: "Creature — Human Shaman", mana: "{4}{R}", power: 3, toughness: 3,
  oracle: "If a creature dealt damage by this creature this turn would die, exile it instead." };
const FROSTWIELDER = { id: "fw-c", name: "Frostwielder", type: "Creature — Human Shaman", mana: "{2}{R}{R}", power: 1, toughness: 2,
  oracle: "If a creature dealt damage by this creature this turn would die, exile it instead.\n{T}: This creature deals 1 damage to any target." };
const PRODIGAL = { id: "ps-c", name: "Prodigal Sorcerer", type: "Creature — Human Wizard Sorcerer", mana: "{2}{U}", power: 1, toughness: 1,
  oracle: "{T}: This creature deals 1 damage to any target." };
const WISP = (id) => ({ id: `${id}-c`, name: "Frail Wisp", type: "Creature — Spirit", mana: "{W}", power: 1, toughness: 1, oracle: "" });
const BEAR = (id) => ({ id: `${id}-c`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });
const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });
// createPermanent builds a clean permanent, so a damage record is laid on AFTER — exactly what combat leaves behind.
const damaged = (card, id, controller, damageMarked, damagedBy) => ({ ...perm(card, id, controller), damageMarked, damagedBy });

function base({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const where = (s, pid, name) => ({
  exile: (s.players[pid].exile || []).some((c) => c.name === name),
  graveyard: (s.players[pid].graveyard || []).some((c) => c.name === name),
  battlefield: s.players[pid].battlefield.some((p) => p.card?.name === name),
});
function ping(pingerCard, pingerId) {
  const s = base({ user: [perm(pingerCard, pingerId, "user")], ai: [perm(WISP("w"), "p-w", "ai")] });
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === pingerId && (a.targets || []).some((t) => t.id === "p-w"));
  expect(act).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}

describe("classification", () => {
  it("Incendiary Oracle, Kumano's Pupils, Frostwielder → native", () => {
    expect(classifyCard(ORACLE)).toBe("native-mixed");
    expect(classifyCard(PUPILS)).toBe("native-static");
    expect(classifyCard(FROSTWIELDER)).toBe("native-mixed");
  });
});

describe("RUNTIME — what it damaged is exiled, while it is on the battlefield", () => {
  it("VACUITY CONTROL — a plain pinger's 1 damage kills the Wisp into the GRAVEYARD", () => {
    const out = ping(PRODIGAL, "p-ps");
    expect(where(out, "ai", "Frail Wisp")).toEqual({ exile: false, graveyard: true, battlefield: false });
  });

  it("⭐ Frostwielder's ping kills the Wisp into EXILE (the ability's damage records its source)", () => {
    const out = ping(FROSTWIELDER, "p-fw");
    expect(where(out, "ai", "Frail Wisp")).toEqual({ exile: true, graveyard: false, battlefield: false });
    console.log(`WITNESS frostwielderPing ${JSON.stringify(where(out, "ai", "Frail Wisp"))}`);
  });

  it("⭐ UNPLANNED GAIN — Kumano, Master Yamabushi (its static names ITSELF: 'dealt damage by Kumano'): its {1}{R} ping exiles the Wisp", () => {
    const KUMANO = { id: "kum-c", name: "Kumano, Master Yamabushi", type: "Legendary Creature — Human Shaman", mana: "{3}{R}{R}", power: 4, toughness: 4,
      oracle: "{1}{R}: Kumano deals 1 damage to any target.\nIf a creature dealt damage by Kumano this turn would die, exile it instead." };
    expect(classifyCard(KUMANO)).toBe("native-mixed");
    const s0 = base({ user: [perm(KUMANO, "p-kum", "user")], ai: [perm(WISP("w"), "p-w", "ai")] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { ...s0.players.user.manaPool, R: 1, C: 1 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "p-kum" && (a.targets || []).some((t) => t.id === "p-w"));
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(where(out, "ai", "Frail Wisp")).toEqual({ exile: true, graveyard: false, battlefield: false });
    console.log(`WITNESS kumanoPing ${JSON.stringify(where(out, "ai", "Frail Wisp"))}`);
  });

  it("⭐ COMBAT — Kumano's Pupils blocked by Grizzly Bears: the Bears are exiled", () => {
    const s0 = base({ user: [perm(PUPILS, "p-pup", "user")], ai: [perm(BEAR("b"), "p-b", "ai")] });
    const s = { ...s0, phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "p-pup", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "p-b", blockingPlayer: "ai", attackerId: "p-pup" }] } };
    const out = destroyLethalCreatures(resolveCombatDamage(s)).state;
    expect(where(out, "ai", "Grizzly Bears")).toEqual({ exile: true, graveyard: false, battlefield: false });
    console.log(`WITNESS pupilsCombat ${JSON.stringify(where(out, "ai", "Grizzly Bears"))}`);
  });

  it("⭐ ASKED AT DEATH: the same damaged creature is exiled while the source is present — and goes to the graveyard once it has left", () => {
    // The Bears carry lethal damage and a damagedBy record naming the Pupils (as combat leaves them).
    const present = destroyLethalCreatures(base({ user: [perm(PUPILS, "p-pup", "user")], ai: [damaged(BEAR("b"), "p-b", "ai", 2, ["p-pup"])] })).state;
    expect(where(present, "ai", "Grizzly Bears")).toEqual({ exile: true, graveyard: false, battlefield: false });
    const gone = destroyLethalCreatures(base({ user: [], ai: [damaged(BEAR("b"), "p-b", "ai", 2, ["p-pup"])] })).state;
    expect(where(gone, "ai", "Grizzly Bears")).toEqual({ exile: false, graveyard: true, battlefield: false });
  });

  it("⭐ the LEGEND-RULE death site asks too (CR 700.4 — that IS dying): the older Isamaru, damaged by the Pupils, is exiled", () => {
    const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: 2, toughness: 2, oracle: "" };
    const older = { ...damaged(ISAMARU, "p-i1", "ai", 0, ["p-pup"]), timestamp: 1 };
    const newer = { ...perm(ISAMARU, "p-i2", "ai"), timestamp: 2 };
    const out = applyLegendRule(base({ user: [perm(PUPILS, "p-pup", "user")], ai: [older, newer] })).state;
    expect((out.players.ai.exile || []).map((c) => c.name)).toEqual(["Isamaru, Hound of Konda"]);
    expect(out.players.ai.battlefield.map((p) => p.id)).toEqual(["p-i2"]);
  });

  it("⛔ a creature the source never damaged dies normally, even with the source on the battlefield", () => {
    const out = destroyLethalCreatures(base({ user: [perm(PUPILS, "p-pup", "user")], ai: [damaged(BEAR("b"), "p-b", "ai", 2, ["someone-else"])] })).state;
    expect(where(out, "ai", "Grizzly Bears")).toEqual({ exile: false, graveyard: true, battlefield: false });
  });
});
