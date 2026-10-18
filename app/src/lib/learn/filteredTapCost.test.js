/**
 * filteredTapCost.test.js — the play-weighted program (2026-10-18): "Tap N untapped <filter> you control:" as an activation
 * cost when the filter is not "creature" — Clock of Omens (EDHREC #1709) "Tap two untapped artifacts you control: Untap target
 * artifact.", Cryptbreaker (#1993) "Tap three untapped Zombies you control: …", Whirler Rogue (#2263) "Tap two untapped
 * artifacts you control: …", Lathril, Blade of the Elves (#2007) "{T}, Tap ten untapped Elves you control: …", and the twins
 * (Shimmer Dragon, Azami, Lady of Scrolls, Sunshot Militia, Gravespawn Sovereign, Kumena, Tyrant of Orazca).
 *
 * The cost is the counted / single "Tap an untapped creature you control" cost with a different payer filter: a card type
 * (artifact), the artifact-or-creature union, a token, or a creature type read through the closed CR 205.3m vocabulary. The
 * payers are every permanent the filter admits as it is now (the sacrifice pools' reader); a summoning-sick permanent may pay
 * (CR 302.6 restricts only its own {T}); the source pays too unless the cost also taps it ({T}) or says "another".
 *
 * Bundled rulings witnessed (rulings.json): Cryptbreaker (2016-07-13) "This includes Cryptbreaker itself."; Whirler Rogue
 * (2015-06-22) "including artifact creatures that haven't been under your control continuously …"; Lathril (2021-02-05)
 * "Lathril doesn't count as one of the ten."; Gravespawn Sovereign (2004-10-04) "(including this creature)".
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-18).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword } from "./layers.js";
import { activationCostText } from "./actionLabel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CLOCK = { id: "c-clock", name: "Clock of Omens", type: "Artifact", mana: "{4}", keywords: [],
  oracle: "Tap two untapped artifacts you control: Untap target artifact." };
const CRYPTBREAKER = { id: "c-crypt", name: "Cryptbreaker", type: "Creature — Zombie", mana: "{B}", power: 1, toughness: 1, keywords: [],
  oracle: "{1}{B}, {T}, Discard a card: Create a 2/2 black Zombie creature token.\nTap three untapped Zombies you control: You draw a card and lose 1 life." };
const WHIRLER = { id: "c-whirl", name: "Whirler Rogue", type: "Creature — Human Rogue Artificer", mana: "{2}{U}{U}", power: 2, toughness: 2, keywords: [],
  oracle: "When this creature enters, create two 1/1 colorless Thopter artifact creature tokens with flying.\nTap two untapped artifacts you control: Target creature can't be blocked this turn." };
const LATHRIL = { id: "c-lath", name: "Lathril, Blade of the Elves", type: "Legendary Creature — Elf Noble", mana: "{2}{B}{G}", power: 2, toughness: 3, keywords: ["Menace"],
  oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever Lathril deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life." };
const AZAMI = { id: "c-azami", name: "Azami, Lady of Scrolls", type: "Legendary Creature — Human Wizard", mana: "{2}{U}{U}{U}", power: 0, toughness: 2, keywords: [],
  oracle: "Tap an untapped Wizard you control: Draw a card." };
const SHIMMER = { id: "c-shim", name: "Shimmer Dragon", type: "Creature — Dragon", mana: "{4}{U}{U}", power: 5, toughness: 6, keywords: ["Flying"],
  oracle: "Flying\nAs long as you control four or more artifacts, this creature has hexproof. (It can't be the target of spells or abilities your opponents control.)\nTap two untapped artifacts you control: Draw a card." };
const SUNSHOT = { id: "c-sun", name: "Sunshot Militia", type: "Creature — Human Soldier", mana: "{1}{R}", power: 1, toughness: 3, keywords: [],
  oracle: "Tap two untapped artifacts and/or creatures you control: This creature deals 1 damage to each opponent. Activate only as a sorcery." };
const GRAVESPAWN = { id: "c-grave", name: "Gravespawn Sovereign", type: "Creature — Zombie", mana: "{4}{B}{B}", power: 3, toughness: 3, keywords: [],
  oracle: "Tap five untapped Zombies you control: Put target creature card from a graveyard onto the battlefield under your control." };
const KUMENA = { id: "c-kum", name: "Kumena, Tyrant of Orazca", type: "Legendary Creature — Merfolk Shaman", mana: "{1}{G}{U}", power: 2, toughness: 4, keywords: [],
  oracle: "Tap another untapped Merfolk you control: Kumena can't be blocked this turn.\nTap three untapped Merfolk you control: Draw a card.\nTap five untapped Merfolk you control: Put a +1/+1 counter on each Merfolk you control." };
// Near-misses (CREED controls — the filter is outside the read vocabulary, so the whole cost stays unmodeled on both trees).
const CRACKLING = { id: "c-crack", name: "Crackling Perimeter", type: "Enchantment", mana: "{1}{R}", keywords: [],
  oracle: "Tap an untapped Gate you control: This enchantment deals 1 damage to each opponent." };
const SHAKU = { id: "c-shaku", name: "Honor-Worn Shaku", type: "Artifact", mana: "{3}", keywords: [],
  oracle: "{T}: Add {C}.\nTap an untapped legendary permanent you control: Untap this artifact." };

const ORNITHOPTER = (id) => ({ id: "c-" + id, name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", power: 0, toughness: 2, keywords: ["Flying"], oracle: "Flying" });
const SOL_RING = (id) => ({ id: "c-" + id, name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], oracle: "{T}: Add {C}{C}." });
const THOPTER_TOKEN = (id) => ({ id: "c-" + id, name: "Thopter", type: "Token Artifact Creature — Thopter", power: 1, toughness: 1, keywords: ["Flying"], oracle: "Flying", token: true });
const ZOMBIE_TOKEN = (id) => ({ id: "c-" + id, name: "Zombie", type: "Token Creature — Zombie", power: 2, toughness: 2, keywords: [], oracle: "", token: true });
const ELF_TOKEN = (id) => ({ id: "c-" + id, name: "Elf Warrior", type: "Token Creature — Elf Warrior", power: 1, toughness: 1, keywords: [], oracle: "", token: true });
const WIZARD = (id) => ({ id: "c-" + id, name: "Probe Wizard", type: "Creature — Human Wizard", power: 1, toughness: 1, keywords: [], oracle: "" });
const MERFOLK = (id) => ({ id: "c-" + id, name: "Probe Merfolk", type: "Creature — Merfolk", power: 1, toughness: 1, keywords: [], oracle: "" });
const BEAR = (id) => ({ id: "c-" + id, name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" });
const SHAPESHIFTER = (id) => ({ id: "c-" + id, name: "Probe Changeling", type: "Creature — Shapeshifter", power: 1, toughness: 1, keywords: ["Changeling"], oracle: "Changeling (This card is every creature type.)" });
const FOREST = (id) => ({ id: "c-" + id, name: "Forest", type: "Basic Land — Forest", keywords: [], oracle: "({T}: Add {G}.)" });

const put = (card, id, controller = "user", over = {}) => ({ ...createPermanent({ id, card, controller }), summoningSick: false, ...over });
const lib = (n, tag = "u") => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));
const offers = (s, pid, permId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const perm = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
const resolveAll = (s) => { let g = 0; while (s.stack.length && g++ < 20) s = resolveTopOfStack(s); return s; };

function mainPhase(pid, perms, other = [], extra = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const opp = pid === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: pid, priorityHolder: pid, consecutivePasses: 0, turn: 3,
    players: { ...s.players, [pid]: { ...s.players[pid], library: lib(6), battlefield: perms, ...extra }, [opp]: { ...s.players[opp], library: lib(6, "o"), battlefield: other } } };
}

describe("classifier — the whole cards", () => {
  it("Clock of Omens, Cryptbreaker and Whirler Rogue are native", () => {
    expect(classifyCard(CLOCK)).toBe("native-activated");
    expect(classifyCard(CRYPTBREAKER)).toBe("native-activated");
    expect(classifyCard(WHIRLER)).toMatch(/^native-/);
  });
  it("the twins: Shimmer Dragon, Azami, Sunshot Militia, Gravespawn Sovereign, Kumena", () => {
    for (const c of [SHIMMER, AZAMI, SUNSHOT, GRAVESPAWN, KUMENA]) expect([c.name, classifyCard(c)]).toEqual([c.name, expect.stringMatching(/^native-/)]);
  });
  it("CREED controls: a land subtype (Gate) and a qualified payer (legendary permanent) stay unread", () => {
    expect(classifyCard(CRACKLING)).toBe("body-only");
    expect(classifyCard(SHAKU)).toBe("body-only");
    expect(parseActivatedAbilities({ id: "c-x", name: "Probe", type: "Enchantment", oracle: "Tap two untapped blue creatures you control: Draw a card." })[0]?.costModeled ?? false).toBe(false);
    expect(parseActivatedAbilities({ id: "c-y", name: "Probe", type: "Enchantment", oracle: "Tap two untapped nontoken artifacts you control: Draw a card." })[0]?.costModeled ?? false).toBe(false);
  });
});

describe("parser — the payer filter rides the tap cost", () => {
  it("artifact, a creature type, the artifact-or-creature union; the count up to ten; 'another'", () => {
    expect(parseActivatedAbilities(CLOCK)[0]?.tapCreature).toEqual({ another: false, count: 2, type: "artifact", noun: "artifacts" });
    expect(parseActivatedAbilities(CRYPTBREAKER)[1]?.tapCreature).toEqual({ another: false, count: 3, type: "permanent", subtype: "zombie", noun: "Zombies" });
    expect(parseActivatedAbilities(AZAMI)[0]?.tapCreature).toEqual({ another: false, type: "permanent", subtype: "wizard" });
    expect(parseActivatedAbilities(SUNSHOT)[0]?.tapCreature).toEqual({ another: false, count: 2, type: "artifactOrCreature", noun: "artifacts and/or creatures" });
    expect(parseActivatedAbilities(LATHRIL).find((a) => a.tapSelf)?.tapCreature).toEqual({ another: false, count: 10, type: "permanent", subtype: "elf", noun: "Elves" });
    expect(parseActivatedAbilities(KUMENA)[0]?.tapCreature).toEqual({ another: true, type: "permanent", subtype: "merfolk" });
  });
});

describe("Clock of Omens — two untapped artifacts pay, the target is untapped", () => {
  it("offered with the Clock and an Ornithopter frozen; the tapped Sol Ring untaps; both payers end tapped", () => {
    let s = mainPhase("user", [put(CLOCK, "CLK"), put(ORNITHOPTER("ORN"), "ORN"), put(SOL_RING("SR"), "SR", "user", { tapped: true })]);
    const acts = offers(s, "user", "CLK");
    const act = acts.find((a) => a.targets?.[0]?.id === "SR");
    expect(act).toBeTruthy();
    expect([...act.tapCountIds].sort()).toEqual(["CLK", "ORN"]);
    expect(activationCostText(act)).toBe("tap 2 untapped artifacts");
    s = dispatchAction(s, act);
    expect(perm(s, "user", "CLK").tapped).toBe(true);
    expect(perm(s, "user", "ORN").tapped).toBe(true);
    s = resolveAll(s);
    expect(perm(s, "user", "SR").tapped).toBe(false);
  });
  it("a creature that is not an artifact never pays: Clock + Grizzly Bears → not offered", () => {
    const s = mainPhase("user", [put(CLOCK, "CLK"), put(BEAR("B1"), "B1"), put(SOL_RING("SR"), "SR", "user", { tapped: true })]);
    expect(offers(s, "user", "CLK")).toHaveLength(0);
  });
  it("a mana rock is the last payer picked: the Clock and the Ornithopter pay, the untapped Sol Ring is spared", () => {
    const s = mainPhase("user", [put(SOL_RING("SR"), "SR"), put(CLOCK, "CLK"), put(ORNITHOPTER("ORN"), "ORN")], [put(SOL_RING("ASR"), "ASR", "ai", { tapped: true })]);
    const act = offers(s, "user", "CLK").find((a) => a.targets?.[0]?.id === "ASR");
    expect(act).toBeTruthy();
    expect([...act.tapCountIds].sort()).toEqual(["CLK", "ORN"]);
  });
});

describe("Cryptbreaker — three untapped Zombies, Cryptbreaker itself and summoning-sick ones included (the ruling)", () => {
  it("two Zombies are not enough; a changeling is a Zombie; the draw and the life loss resolve", () => {
    const two = mainPhase("user", [put(CRYPTBREAKER, "CB", "user", { summoningSick: true }), put(ZOMBIE_TOKEN("Z1"), "Z1", "user", { summoningSick: true }), put(BEAR("B1"), "B1")]);
    expect(offers(two, "user", "CB").filter((a) => a.tapCountIds?.length)).toHaveLength(0);
    let s = mainPhase("user", [put(CRYPTBREAKER, "CB", "user", { summoningSick: true }), put(ZOMBIE_TOKEN("Z1"), "Z1", "user", { summoningSick: true }), put(BEAR("B1"), "B1"), put(SHAPESHIFTER("SH"), "SH")]);
    const act = offers(s, "user", "CB").find((a) => a.tapCountIds?.length);
    expect(act).toBeTruthy();
    expect([...act.tapCountIds].sort()).toEqual(["CB", "SH", "Z1"]);
    const life0 = s.players.user.life;
    s = dispatchAction(s, act);
    expect(perm(s, "user", "B1").tapped).toBe(false);
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.life).toBe(life0 - 1);
  });
});

describe("Whirler Rogue — its two Thopters pay the turn they arrive (the ruling)", () => {
  it("the summoning-sick Thopters are frozen; the Rogue can't be blocked", () => {
    let s = mainPhase("user", [put(WHIRLER, "WR", "user", { summoningSick: true }), put(THOPTER_TOKEN("T1"), "T1", "user", { summoningSick: true }), put(THOPTER_TOKEN("T2"), "T2", "user", { summoningSick: true })]);
    const act = offers(s, "user", "WR").find((a) => a.targets?.[0]?.id === "WR");
    expect(act).toBeTruthy();
    expect([...act.tapCountIds].sort()).toEqual(["T1", "T2"]);
    s = resolveAll(dispatchAction(s, act));
    expect(permanentHasKeyword(s, "WR", "unblockable")).toBe(true);
  });
});

describe("Lathril — {T} and ten OTHER untapped Elves (the ruling: Lathril doesn't count as one of the ten)", () => {
  const elves = (n, sick) => Array.from({ length: n }, (_, i) => put(ELF_TOKEN("E" + i), "E" + i, "user", { summoningSick: sick && i % 2 === 0 }));
  it("nine other Elves → not offered; ten → offered, Lathril not among the payers; each opponent loses 10, you gain 10", () => {
    const nine = mainPhase("user", [put(LATHRIL, "LA"), ...elves(9, true)]);
    expect(offers(nine, "user", "LA")).toHaveLength(0);
    let s = mainPhase("user", [put(LATHRIL, "LA"), ...elves(10, true)]);
    const act = offers(s, "user", "LA")[0];
    expect(act).toBeTruthy();
    expect(act.tapCountIds).toHaveLength(10);
    expect(act.tapCountIds).not.toContain("LA");
    const [mine, theirs] = [s.players.user.life, s.players.ai.life];
    s = resolveAll(dispatchAction(s, act));
    expect(perm(s, "user", "LA").tapped).toBe(true);
    expect(s.players.ai.life).toBe(theirs - 10);
    expect(s.players.user.life).toBe(mine + 10);
  });
});

describe("the single form — Azami picks which Wizard taps, herself included", () => {
  it("one action per untapped Wizard; tapping Azami draws a card", () => {
    let s = mainPhase("user", [put(AZAMI, "AZ", "user", { summoningSick: true }), put(WIZARD("W1"), "W1"), put(BEAR("B1"), "B1")]);
    const acts = offers(s, "user", "AZ");
    expect(acts.map((a) => a.tapCreatureId).sort()).toEqual(["AZ", "W1"]);
    s = resolveAll(dispatchAction(s, acts.find((a) => a.tapCreatureId === "AZ")));
    expect(perm(s, "user", "AZ").tapped).toBe(true);
    expect(s.players.user.hand).toHaveLength(1);
  });
  it("Kumena's 'another': Kumena never pays its own unblockable cost", () => {
    const s = mainPhase("user", [put(KUMENA, "KU"), put(MERFOLK("M1"), "M1")]);
    const acts = offers(s, "user", "KU").filter((a) => a.tapCreatureId);
    expect(acts.map((a) => a.tapCreatureId)).toEqual(["M1"]);
  });
});

describe("the artifact-or-creature union — Sunshot Militia", () => {
  it("a Bear and a Sol Ring pay; a Forest never does", () => {
    const land = mainPhase("user", [put(SUNSHOT, "SM"), put(FOREST("F1"), "F1")]);
    expect(offers(land, "user", "SM")).toHaveLength(0);
    let s = mainPhase("user", [put(SUNSHOT, "SM"), put(FOREST("F1"), "F1"), put(SOL_RING("SR"), "SR")]);
    const act = offers(s, "user", "SM")[0];
    expect(act).toBeTruthy();
    expect([...act.tapCountIds].sort()).toEqual(["SM", "SR"]);
    const theirs = s.players.ai.life;
    s = resolveAll(dispatchAction(s, act));
    expect(s.players.ai.life).toBe(theirs - 1);
    expect(perm(s, "user", "F1").tapped).toBe(false);
  });
});

const CATAPULT_SQUAD = { id: "c-cs", name: "Catapult Squad", type: "Creature — Human Soldier", mana: "{1}{W}", power: 2, toughness: 1, keywords: [],
  oracle: "Tap two untapped Soldiers you control: This creature deals 2 damage to target attacking or blocking creature." };
const SOLDIER = (id) => ({ id: "c-" + id, name: "Probe Soldier", type: "Creature — Human Soldier", power: 1, toughness: 1, keywords: [], oracle: "" });

describe("the AI never auto-spends a filtered tap cost", () => {
  it("Catapult Squad in a combat step: the combat-role shot is offered, the AI leaves its Soldiers untapped", () => {
    const s0 = mainPhase("user", [put(BEAR("UB"), "UB", "user", { tapped: true })], [put(CATAPULT_SQUAD, "CS", "ai"), put(SOLDIER("S1"), "S1", "ai")]);
    const s = { ...s0, phase: "combat", step: "declare-attackers", priorityHolder: "ai", combat: { attackers: [{ permanentId: "UB", attackingPlayer: "user", defender: "ai" }], blockers: [], declaredAttackerCount: 1 } };
    const shot = offers(s, "ai", "CS").find((a) => a.targets?.[0]?.id === "UB");
    expect(shot).toBeTruthy();
    expect([...shot.tapCountIds].sort()).toEqual(["CS", "S1"]);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick && pick.kind === "activate-ability" && pick.permanentId === "CS").toBe(false);
  });
  it("Shimmer Dragon with two untapped artifacts in the AI's main phase is offered, not picked", () => {
    const s = mainPhase("ai", [put(SHIMMER, "SD", "ai"), put(SOL_RING("A1"), "A1", "ai"), put(ORNITHOPTER("A2"), "A2", "ai")]);
    expect(offers(s, "ai", "SD")).toHaveLength(1);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick && pick.kind === "activate-ability" && pick.permanentId === "SD").toBe(false);
  });
});
