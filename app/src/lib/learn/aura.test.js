/**
 * Aura attach mechanic — casting an Aura spell that targets a creature, entering the
 * battlefield attached to it (CR 303.4f), the enchanted-creature static bonus (P/T +
 * keywords via the CR-613 layer engine, scoped to attachedTo), the falls-off SBA
 * (CR 704.5n — an Aura that loses its host goes to the graveyard, unlike Equipment),
 * and the all-or-nothing native-aura coverage tier (no silent partial buff, no
 * do-nothing permanent — a non-native Aura routes to the Arbiter seam instead).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent, moveCardToZone, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseAuraBonus, isNativeAura } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const STRENGTH = { id: "c-str", name: "Unholy Strength", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature gets +2/+1." };
const FLIGHT = { id: "c-fly", name: "Flight", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature has flying." };
const COMBINED = { id: "c-comb", name: "Might of Old Krosa", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has trample." };
const WEAKNESS = { id: "c-weak", name: "Weakness", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature gets -2/-1." };
const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardState({ user = [], ai = [], hand = [], pool = { C: 5 } } = {}) {
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

describe("parser — enchanted-creature bonus", () => {
  it("parses the enchanted-creature bonus (P/T, keyword, combined) — all-or-nothing", () => {
    expect(parseAuraBonus(STRENGTH)).toEqual([{ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 1 }, duration: { kind: "permanent" } }]);
    expect(parseAuraBonus(FLIGHT).map(e => e.op)).toEqual([{ layerOp: "addKeyword", keyword: "Flying" }]);
    expect(parseAuraBonus(COMBINED).map(e => e.op)).toEqual([{ layerOp: "ptModify", power: 1, toughness: 1 }, { layerOp: "addKeyword", keyword: "Trample" }]);
    expect(parseAuraBonus(WEAKNESS).map(e => e.op)).toEqual([{ layerOp: "ptModify", power: -2, toughness: -1 }]);
    // A rider beyond P/T + grantable keywords drops the WHOLE bonus (no misleading partial).
    expect(parseAuraBonus({ oracle: "Enchant creature\nEnchanted creature gets +1/+1 and can't be blocked." })).toEqual([]);
    // A separate-sentence pronoun rider on the creature also drops the whole bonus.
    expect(parseAuraBonus({ oracle: "Enchant creature\nEnchanted creature gets +2/+2. It can't be blocked." })).toEqual([]);
  });
});

describe("isNativeAura — all-or-nothing native gate", () => {
  it("a clean Aura (Enchant creature + modeled bonus, no residue) is native", () => {
    expect(isNativeAura(STRENGTH)).toBe(true);
    expect(isNativeAura(FLIGHT)).toBe(true);
    expect(isNativeAura(WEAKNESS)).toBe(true);
  });
  it("a non-creature / unmodeled enchant subject is NOT native", () => {
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant permanent\nEnchanted permanent doesn't untap." })).toBe(false);
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant land\nEnchanted land has '{T}: Add one mana of any color.'" })).toBe(false);
    // A controller-inverted / restricted subject is still unmodeled.
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant creature an opponent controls\nEnchanted creature gets -1/-1." })).toBe(false);
  });
  it('"Enchant creature you control" IS native (the controller:"you" restriction gates the aura to own creatures)', () => {
    // SUPER STATE subject support: "creature you control" resolves to a controller:"you" target restriction,
    // so the aura can only attach to the caster's own creatures — a modeled, all-or-nothing subject.
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant creature you control\nEnchanted creature gets +1/+1." })).toBe(true);
  });
  it("an unmodeled bonus or an extra (triggered/activated) clause is NOT native (no silent gap)", () => {
    // Bonus has an unmodeled rider → parseAuraBonus is [] → not native.
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 and can't be blocked." })).toBe(false);
    // A residual triggered ability on the Aura (not touching the creature) would be dropped → not native.
    expect(isNativeAura({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhen Aura enters the battlefield, draw a card." })).toBe(false);
    // A non-Aura enchantment is never an Aura.
    expect(isNativeAura({ type: "Enchantment", oracle: "Creatures you control get +1/+1." })).toBe(false);
  });
});

describe("coverage — native-aura tier", () => {
  it("a clean Aura is native-aura", () => {
    expect(classifyCard(STRENGTH)).toBe("native-aura");
    expect(classifyCard(FLIGHT)).toBe("native-aura");
    expect(classifyCard(COMBINED)).toBe("native-aura");
  });
  it("a complex / restricted Aura stays body-only (routed to Arbiter at cast, never over-claimed)", () => {
    expect(classifyCard({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1 and can't be blocked.", name: "X" })).toBe("body-only");
    expect(classifyCard({ type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhenever enchanted creature dies, draw a card.", name: "Y" })).toBe("body-only");
    expect(classifyCard({ type: "Enchantment — Aura", oracle: "Enchant land\nEnchanted land has '{T}: Add {C}{C}.'", name: "Z" })).toBe("body-only");
  });
});

describe("cast resolution — Aura enters attached and the bonus applies via layers", () => {
  it("offers a cast action per creature; resolving enters the Aura attached with +P/+T", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [STRENGTH] });
    expect(permanentPower(s, "bear")).toBe(2);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    expect(cast).toMatchObject({ cardId: "c-str", targets: [{ id: "bear" }], needsTargets: true });
    s = resolveTopOfStack(dispatchAction(s, cast));
    // The Aura is now a permanent on the battlefield, attached to the bear, granting +2/+1.
    const aura = s.players.user.battlefield.find(p => p.card?.name === "Unholy Strength");
    expect(aura.attachedTo).toBe("bear");
    expect(findPermanent(s, "bear").permanent.attachments).toEqual([aura.id]);
    expect(permanentPower(s, "bear")).toBe(4);
    expect(permanentToughness(s, "bear")).toBe(3);
  });
  it("grants the enchanted creature a keyword (Flying)", () => {
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [FLIGHT] });
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(false);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(true);
  });
  it("a debuff Aura can target an OPPONENT's creature (Enchant creature has no controller restriction)", () => {
    const enemy = createPermanent({ id: "enemy", card: bearCard, controller: "ai", summoningSick: false });
    let s = boardState({ ai: [enemy], hand: [WEAKNESS] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.isAuraSpell);
    expect(casts.map(c => c.targets[0].id)).toContain("enemy");
    s = resolveTopOfStack(dispatchAction(s, casts.find(c => c.targets[0].id === "enemy")));
    expect(permanentPower(s, "enemy")).toBe(0); // 2 - 2
    expect(permanentToughness(s, "enemy")).toBe(1); // 2 - 1
  });
  it("no creature on any battlefield → the Aura can't be cast (CR 303.4a)", () => {
    const s = boardState({ hand: [STRENGTH] });
    expect(filterActions(legalActionsForPlayer(s, "user"), "cast-spell").some(a => a.isAuraSpell)).toBe(false);
  });
});

describe("falls-off SBA (CR 704.5n) — Aura to graveyard, Equipment stays", () => {
  it("when the enchanted creature leaves, the Aura goes to its owner's graveyard", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: STRENGTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "bear" });
    expect(permanentPower(s, "bear")).toBe(4);
    // Bear dies → the Aura can't stay → it's put into the graveyard (NOT left unattached).
    const s2 = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    expect(s2.players.user.battlefield.some(p => p.id === "aura")).toBe(false);
    expect(s2.players.user.graveyard.some(c => c.name === "Unholy Strength")).toBe(true);
  });
  it("a debuff Aura on an opponent's creature returns to ITS controller's graveyard when the host dies", () => {
    const enemy = createPermanent({ id: "enemy", card: bearCard, controller: "ai", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: WEAKNESS, controller: "user", summoningSick: false });
    let s = boardState({ user: [aura], ai: [enemy] });
    s = attachPermanent(s, { equipId: "aura", targetId: "enemy" });
    const s2 = moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "enemy" });
    // Aura is gone from the battlefield and lands in the USER's graveyard (its owner), not the AI's.
    expect(s2.players.user.battlefield.some(p => p.id === "aura")).toBe(false);
    expect(s2.players.user.graveyard.some(c => c.name === "Weakness")).toBe(true);
    expect(s2.players.ai.graveyard.some(c => c.name === "Weakness")).toBe(false);
  });
  it("when the Aura itself leaves, the creature keeps living and just loses the bonus", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: STRENGTH, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear, aura] });
    s = attachPermanent(s, { equipId: "aura", targetId: "bear" });
    const s2 = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "aura" });
    expect(findPermanent(s2, "bear").permanent.attachments).toEqual([]);
    expect(permanentPower(s2, "bear")).toBe(2); // bonus gone
  });
});

describe("REVIEW FIX — granted keywords are honored at runtime (no partial application)", () => {
  it("a creature granted Vigilance by an Aura does NOT tap when it attacks (layer-aware tap)", () => {
    const VIGIL = { id: "c-vig", name: "Sentinel's Eyes", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nEnchanted creature has vigilance." };
    expect(isNativeAura(VIGIL)).toBe(true);
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [VIGIL], pool: { C: 5 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "bear", "Vigilance")).toBe(true);
    // Move to combat and declare the (now vigilant) bear as an attacker — it must stay UNTAPPED.
    s = { ...s, phase: "combat", step: "declare-attackers" };
    s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "bear" });
    expect(findPermanent(s, "bear").permanent.tapped).toBe(false);
  });
  it("a mana-dork granted Haste by an Aura can tap for mana the turn it's still summoning-sick", () => {
    const HASTE = { id: "c-haste", name: "Crown of Flames", type: "Enchantment — Aura", mana: "{R}", oracle: "Enchant creature\nEnchanted creature has haste." };
    expect(isNativeAura(HASTE)).toBe(true);
    // A summoning-sick mana dork ("{T}: Add {G}") — normally can't tap the turn it enters.
    const dorkCard = { name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}.", power: 1, toughness: 1 };
    const dork = createPermanent({ id: "dork", card: dorkCard, controller: "user", summoningSick: true });
    let s = boardState({ user: [dork], hand: [HASTE], pool: { R: 1 } });
    expect(filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").some(a => a.permanentId === "dork")).toBe(false);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    s = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentHasKeyword(s, "dork", "Haste")).toBe(true);
    // With granted haste, the summoning-sick dork is now a legal mana source.
    expect(filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").some(a => a.permanentId === "dork")).toBe(true);
  });
  it("an Aura granting Menace IS native — Menace is enforced via permanentHasKeyword/attackerHasMenace (GATED-GY-EXT)", () => {
    const MENACE = { id: "c-men", name: "Madcap Skills", type: "Enchantment — Aura", mana: "{1}{R}", oracle: "Enchant creature\nEnchanted creature gets +3/+0 and has menace." };
    expect(isNativeAura(MENACE)).toBe(true);
    expect(classifyCard(MENACE)).toBe("native-aura");
  });
});

describe("cast legality + Arbiter routing", () => {
  it("a non-native Aura is offered but routes to the Arbiter seam at resolution (no do-nothing permanent)", () => {
    // A still-non-native Aura: an aura-own DIES trigger detectTriggers doesn't recognize (BLITZ AU-3 credits
    // only auras whose whole body is DETECTED + ROUTED triggers — Curiosity, Sigil of Sleep — so a
    // dies-return aura like Bequeathal stays body-only and must still route to the Arbiter, never a do-nothing permanent).
    const COMPLEX = { id: "c-cplx", name: "Bequeathal", type: "Enchantment — Aura", mana: "{1}", oracle: "Enchant creature\nWhen enchanted creature dies, you draw two cards." };
    let s = boardState({ user: [createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false })], hand: [COMPLEX] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.cardId === "c-cplx");
    expect(cast.isAuraSpell).toBeUndefined(); // not a native aura → no targeted attach
    s = resolveTopOfStack(dispatchAction(s, cast));
    // It did NOT enter the battlefield as a permanent; it flagged the Arbiter seam.
    expect(s.players.user.battlefield.some(p => p.card?.name === "Bequeathal")).toBe(false);
    expect(s.pendingArbiter).toBeTruthy();
  });
  it("if the target is gone by resolution, the Aura spell fizzles and never enters (CR 608.3b)", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear], hand: [STRENGTH] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find(a => a.isAuraSpell);
    s = dispatchAction(s, cast);
    // Remove the target before the Aura resolves.
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some(p => p.card?.name === "Unholy Strength")).toBe(false);
    expect((s.log || []).some(e => e.kind === "spell-fizzle")).toBe(true);
  });
});

describe("AI — casts Auras on-intent (W7e / AI-F6: the deferred seam is unlocked)", () => {
  const auraState = () => {
    const aiBear = createPermanent({ id: "ab", card: bearCard, controller: "ai", summoningSick: false });
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...base.players, ai: { ...base.players.ai, battlefield: [aiBear], hand: [STRENGTH], manaPool: { C: 5 } } },
    };
  };
  it("the AI casts a beneficial Aura onto its OWN creature (was the blanket hold)", () => {
    const s = auraState();
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked).toMatchObject({ kind: "cast-spell", isAuraSpell: true });
    expect(picked.targets[0].id).toBe("ab"); // own-intent buff → own creature, never an opponent's
  });
  it('policy aura:"v1" recovers the legacy hold-always for the A/B probe', () => {
    const s = auraState();
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { policy: { aura: "v1" } });
    expect(picked?.kind === "cast-spell" && picked?.isAuraSpell).toBeFalsy();
  });
});
