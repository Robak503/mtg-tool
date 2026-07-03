/**
 * Equipment attach mechanic — the Equip activated ability + the equipped-creature static
 * bonus (P/T + keywords via the CR-613 layer engine, scoped to attachedTo) + bidirectional
 * attach state + LTB detach (CR 704.5n). All-or-nothing bonus parsing (no silent partial buff).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent, moveCardToZone, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEquipmentBonus } from "./staticAbilityParser.js";
import { classifyCard, permanentEquipmentCovered } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SWORD = { id: "c-sword", name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const BANNER = { id: "c-banner", name: "Wings", type: "Artifact — Equipment", mana: "{2}", oracle: "Equipped creature gets +1/+1 and has flying.\nEquip {2}" };
const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardState({ user = [], ai = [], pool = { C: 5 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, manaPool: { ...s.players.user.manaPool, ...pool } }, ai: { ...s.players.ai, battlefield: ai } },
  };
}

describe("parser — Equip ability + equipped bonus", () => {
  it("detects 'Equip {cost}' as a modeled equip activated ability", () => {
    expect(parseActivatedAbilities(SWORD)).toEqual([expect.objectContaining({ isEquipAbility: true, modeled: true, manaPips: "{1}" })]);
    // A non-mana / typed equip cost is unmodeled (not detected).
    expect(parseActivatedAbilities({ oracle: "Equip {2}{W}", type: "Artifact — Equipment" })[0]).toMatchObject({ isEquipAbility: true, manaPips: "{2}{W}" });
    expect(parseActivatedAbilities({ oracle: "Equip legendary creature {3}", type: "Artifact — Equipment" })).toEqual([]);
  });
  it("parses the equipped-creature bonus (P/T, keyword, combined) — all-or-nothing", () => {
    expect(parseEquipmentBonus(SWORD)).toEqual([{ layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 0 }, duration: { kind: "permanent" } }]);
    expect(parseEquipmentBonus(BANNER).map(e => e.op)).toEqual([{ layerOp: "ptModify", power: 1, toughness: 1 }, { layerOp: "addKeyword", keyword: "Flying" }]);
    // A rider beyond P/T + grantable keywords drops the WHOLE bonus (no misleading partial).
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +1/+1 and can't be blocked.\nEquip {2}" })).toEqual([]);
    expect(parseEquipmentBonus({ oracle: "Equipped creature is a 4/4.\nEquip {2}" })).toEqual([]);
  });
  it("REVIEW FIX: a SEPARATE-SENTENCE or conditional rider on the equipped creature drops the whole bonus", () => {
    // The all-or-nothing must span every clause TOUCHING the creature — a period-joined
    // pronoun rider or an "as long as …" conditional, not just leading "Equipped creature".
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +2/+2. It can't be blocked.\nEquip {2}" })).toEqual([]);
    expect(parseEquipmentBonus({ oracle: "Equipped creature gets +1/+1. As long as equipped creature is legendary, it gets an additional +2/+2.\nEquip {2}" })).toEqual([]);
    // A self-keyword on the EQUIPMENT body is irrelevant to the bonus — the +5/+5 still parses.
    expect(parseEquipmentBonus({ oracle: "Indestructible\nEquipped creature gets +5/+5 and has double strike.\nEquip {0}" }).length).toBe(2);
  });
});

describe("coverage — native-equipment tier", () => {
  it("a clean Equipment (Equip + modeled bonus) is native-equipment", () => {
    expect(classifyCard(SWORD)).toBe("native-equipment");
    expect(classifyCard(BANNER)).toBe("native-equipment");
    expect(permanentEquipmentCovered(SWORD)).toBe(true);
  });
  it("a complex Equipment (unmodeled rider / extra ability) stays body-only", () => {
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1 and can't be blocked.\nEquip {2}", name: "X" })).toBe("body-only");
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nWhenever equipped creature dies, draw a card.\nEquip {2}", name: "Y" })).toBe("body-only");
    // An UNMODELED equip variant (a cheaper token-only or typed equip we don't offer) must
    // NOT be over-claimed as fully native — the residue keeps the unstripped equip line.
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nEquip creature token {1}\nEquip {3}", name: "Team Pennant" })).toBe("body-only");
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+1.\nEquip Human {1}\nEquip {3}", name: "Dunedain Blade" })).toBe("body-only");
    // REVIEW FIX (no silent gaps): a separate-sentence rider, a conditional, OR a self-keyword
    // on the equipment body all keep the card body-only (never over-claimed as fully native).
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+2. It can't be blocked.\nEquip {2}", name: "Z" })).toBe("body-only");
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1. As long as equipped creature is legendary, it gets an additional +2/+2.\nEquip {2}", name: "Tenza" })).toBe("body-only");
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "Indestructible\nEquipped creature gets +5/+5.\nEquip {0}", name: "Stoneforged" })).toBe("body-only");
    // SAME-LINE REFLEXIVE TRIGGER (Novel Nunchaku): two triggers on one line — the ETB-attach + a reflexive
    // "When you do, equipped creature fights …". The trigger-strip regex consumes the period after the first,
    // so the count guard misses the second; it must NOT be whitelisted as an "equipped creature" clause. Its
    // fight effect is unmodeled → the whole card stays body-only (no partial flip — CREED).
    expect(classifyCard({ type: "Artifact — Equipment", oracle: "When Novel Nunchaku enters, attach it to target creature you control. When you do, equipped creature fights up to one target creature an opponent controls.\nEquipped creature gets +1/+1.\nEquip {2}", name: "Novel Nunchaku" })).toBe("body-only");
  });
});

describe("resolution — equip attaches and the bonus applies via layers", () => {
  it("offers an Equip action per own creature, attaches on resolution, +P/+T shows in derived stats", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    const sword = createPermanent({ id: "sword", card: SWORD, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear, sword] });
    expect(permanentPower(s, "bear")).toBe(2);
    const equip = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").find(a => a.isEquipAbility);
    expect(equip).toMatchObject({ permanentId: "sword", targets: [{ id: "bear" }] });
    s = resolveTopOfStack(dispatchAction(s, equip));
    expect(findPermanent(s, "sword").permanent.attachedTo).toBe("bear");
    expect(findPermanent(s, "bear").permanent.attachments).toEqual(["sword"]);
    expect(permanentPower(s, "bear")).toBe(4); // 2 + 2 from Bonesplitter
    expect(permanentToughness(s, "bear")).toBe(2);
  });
  it("grants the equipped creature the keyword bonus (Flying)", () => {
    const bear = createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false });
    let s = boardState({ user: [bear, createPermanent({ id: "wings", card: BANNER, controller: "user", summoningSick: false })] });
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(false);
    const equip = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").find(a => a.isEquipAbility);
    s = resolveTopOfStack(dispatchAction(s, equip));
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(true);
    expect(permanentPower(s, "bear")).toBe(3); // +1/+1
  });
  it("the bonus disappears the instant the equipment detaches (LTB)", () => {
    let s = boardState({ user: [
      createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false }),
      createPermanent({ id: "sword", card: SWORD, controller: "user", summoningSick: false }),
    ] });
    s = attachPermanent(s, { equipId: "sword", targetId: "bear" });
    expect(permanentPower(s, "bear")).toBe(4);
    // Bear leaves → sword detaches → no bonus, sword.attachedTo cleared.
    const s2 = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" });
    expect(findPermanent(s2, "sword").permanent.attachedTo).toBeNull();
    // Sword leaves while attached → drops off the creature's attachments list.
    const s3 = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "sword" });
    expect(findPermanent(s3, "bear").permanent.attachments).toEqual([]);
  });
});

describe("REVIEW FIX — granted Vigilance is honored at attack time (shared with Auras/anthems)", () => {
  it("a creature equipped with a Vigilance-granting Equipment does NOT tap when it attacks", () => {
    const SPEAR = { id: "c-spear", name: "Vigil Spear", type: "Artifact — Equipment", mana: "{1}", oracle: "Equipped creature gets +1/+0 and has vigilance.\nEquip {1}" };
    let s = boardState({ user: [
      createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false }),
      createPermanent({ id: "spear", card: SPEAR, controller: "user", summoningSick: false }),
    ] });
    s = attachPermanent(s, { equipId: "spear", targetId: "bear" });
    expect(permanentHasKeyword(s, "bear", "Vigilance")).toBe(true);
    s = { ...s, phase: "combat", step: "declare-attackers" };
    s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "bear" });
    expect(findPermanent(s, "bear").permanent.tapped).toBe(false);
  });
});

describe("attach state helpers", () => {
  it("REVIEW FIX: Equip is sorcery-speed — not offered while the stack is non-empty (CR 702.6f)", () => {
    const board = (stack) => ({ ...boardState({ user: [
      createPermanent({ id: "bear", card: bearCard, controller: "user", summoningSick: false }),
      createPermanent({ id: "sword", card: SWORD, controller: "user", summoningSick: false }),
    ] }), stack });
    expect(filterActions(legalActionsForPlayer(board([]), "user"), "activate-ability").some(a => a.isEquipAbility)).toBe(true);
    const withSpell = board([{ id: "s", kind: "spell", source: { name: "x" }, controller: "user", payload: {} }]);
    expect(filterActions(legalActionsForPlayer(withSpell, "user"), "activate-ability").some(a => a.isEquipAbility)).toBe(false);
  });
  it("REVIEW FIX: attachPermanent no-ops on a missing target (no dangling attachedTo)", () => {
    const s = boardState({ user: [createPermanent({ id: "sword", card: SWORD, controller: "user", summoningSick: false })] });
    expect(findPermanent(attachPermanent(s, { equipId: "sword", targetId: "ghost" }), "sword").permanent.attachedTo).toBeNull();
  });
  it("re-equipping moves the equipment off its prior host", () => {
    let s = boardState({ user: [
      createPermanent({ id: "b1", card: bearCard, controller: "user", summoningSick: false }),
      createPermanent({ id: "b2", card: bearCard, controller: "user", summoningSick: false }),
      createPermanent({ id: "sword", card: SWORD, controller: "user", summoningSick: false }),
    ] });
    s = attachPermanent(s, { equipId: "sword", targetId: "b1" });
    s = attachPermanent(s, { equipId: "sword", targetId: "b2" }); // re-equip
    expect(findPermanent(s, "b1").permanent.attachments).toEqual([]);     // moved off b1
    expect(findPermanent(s, "b2").permanent.attachments).toEqual(["sword"]);
    expect(findPermanent(s, "sword").permanent.attachedTo).toBe("b2");
  });
});

describe("AI — equips (W6 / AI-F3: the deferred seam is unlocked)", () => {
  const equipState = () => {
    const bear = createPermanent({ id: "ab", card: bearCard, controller: "ai", summoningSick: false });
    const sword = createPermanent({ id: "as", card: SWORD, controller: "ai", summoningSick: false });
    return { ...boardState({}), activePlayer: "ai", priorityHolder: "ai",
      players: { ...createGameState({ userDeck: [], aiDeck: [] }).players, ai: { ...createGameState({ userDeck: [], aiDeck: [] }).players.ai, battlefield: [bear, sword], manaPool: { C: 5 } } } };
  };
  it("the AI activates the offered Equip onto its own creature (was the dead-cardboard hold)", () => {
    const s = equipState();
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked).toMatchObject({ kind: "activate-ability", isEquipAbility: true, permanentId: "as" });
    expect(picked.targets[0].id).toBe("ab");
  });
  it('policy ability:"v1" recovers the legacy never-equip for the A/B probe', () => {
    const s = equipState();
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { policy: { ability: "v1" } });
    expect(picked?.kind === "activate-ability").toBe(false);
  });
});
