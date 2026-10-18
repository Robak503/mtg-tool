/**
 * aiTargetedActivation.test.js — the AI uses its targeted activated abilities in its own main phase (2026-10-17).
 *
 * The gap: the generic activation picker (`pickSafeAbilityActivation`) skips every activation with a target, and only Equip,
 * the combat-role abilities (in a combat step) and the Candelabra mana line take one. Measured over the 80-game A/B batch on
 * 6661f114: 0 main-phase activations of a targeted damage, destroy, shrink, counter, grant or graveyard ability, though the
 * profile decks were offered them in 1,000+ decisions (Deathrite Shaman 79 times in its own main phase with the stack empty).
 *
 * The policy, an AI choice among offered actions (the offer and the resolution are unchanged): in its own main phase with the
 * stack empty, after the casts, an activation whose cost is the source's tap and/or mana (a +1/+1 counter removed from a source
 * that survives, for a kill only; a single-ability noncreature token sacrificed, for a +1/+1 counter only) and whose one
 * targeted effect is clearly good on the side it lands:
 *   · damage / -N/-N / a -1/-1 counter / destroy / exile that KILLS an opponent's creature (the biggest threat first) or
 *     removes an opponent's permanent;
 *   · in the postcombat main, a damage shot at an opponent's planeswalker or, failing that, the opponent with the least life;
 *   · a +1/+1 counter on its own creature; a fight its own creature wins and survives;
 *   · exiling a card from an opponent's graveyard beside a drain or a life gain — or alone, when the card is one its owner
 *     could use from there (a creature card, a card with a graveyard keyword);
 *   · in the precombat main, haste for its own summoning-sick creature, "can't be blocked" for its own ready attacker.
 * Never a harmful effect on its own side; nothing paid in life, other permanents, cards or counters it needs.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, type, mana, cmc, power, toughness, colors, keywords, oracle) => ({ name, type, mana, cmc, power, toughness, colors, keywords, oracle });
const PYROMANCER = creature("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", 3, "1", "1", ["R"], [], "{T}: This creature deals 1 damage to any target.");
const VISARA = creature("Visara the Dreadful", "Legendary Creature — Gorgon", "{3}{B}{B}{B}", 6, "5", "5", ["B"], ["Flying"], "Flying\n{T}: Destroy target creature. It can't be regenerated.");
const SENGIR = creature("Grandmother Sengir", "Legendary Creature — Human Wizard", "{4}{B}", 5, "3", "3", ["B"], [], "{1}{B}, {T}: Target creature gets -1/-1 until end of turn.");
const DEATHRITE = creature("Deathrite Shaman", "Creature — Elf Shaman", "{B/G}", 1, "1", "2", ["B", "G"], [],
  "{T}: Exile target land card from a graveyard. Add one mana of any color. (Activate only as an instant.)\n{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.\n{G}, {T}: Exile target creature card from a graveyard. You gain 2 life.");
const PALEONTOLOGIST = creature("Intrepid Paleontologist", "Creature — Human Druid", "{1}{G}", 2, "2", "2", ["G"], [],
  "{T}: Add one mana of any color.\n{2}: Exile target card from a graveyard.\nYou may cast Dinosaur creature spells from among cards you own exiled with this creature. If you cast a spell this way, that creature enters with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)");
const TRACKER = creature("Ulvenwald Tracker", "Creature — Human Shaman", "{G}", 1, "1", "1", ["G"], ["Fight"], "{1}{G}, {T}: Target creature you control fights another target creature.");
const BALLISTA = creature("Walking Ballista", "Artifact Creature — Construct", "{X}{X}", 0, "0", "0", [], [],
  "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.");
const ZACAMA = creature("Zacama, Primal Calamity", "Legendary Creature — Elder Dinosaur", "{6}{R}{G}{W}", 9, "9", "9", ["G", "R", "W"], ["Reach", "Vigilance", "Trample"],
  "Reach, vigilance, trample\nWhen Zacama enters, if you cast it, untap all lands you control.\n{2}{R}: Zacama deals 3 damage to target creature.\n{2}{G}: Destroy target artifact or enchantment.\n{2}{W}: You gain 3 life.");
const OTEPEC = creature("Otepec Huntmaster", "Creature — Human Shaman", "{1}{R}", 2, "1", "2", ["R"], [], "Dinosaur spells you cast cost {1} less to cast.\n{T}: Target Dinosaur gains haste until end of turn.");
const DREADMAW = creature("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", 6, "6", "6", ["G"], ["Trample"], "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)");
const HAYWIRE_MITE = creature("Haywire Mite", "Artifact Creature — Insect", "{1}", 1, "1", "1", [], [], "When this creature dies, you gain 2 life.\n{G}, Sacrifice this creature: Exile target noncreature artifact or noncreature enchantment.");
const NYLEA = creature("Nylea, God of the Hunt", "Legendary Enchantment Creature — God", "{3}{G}", 4, "6", "6", ["G"], ["Indestructible"],
  "Indestructible\nAs long as your devotion to green is less than five, Nylea isn't a creature. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nOther creatures you control have trample.\n{3}{G}: Target creature gets +2/+2 until end of turn.");
const CONFIDANT = creature("Dark Confidant", "Creature — Human Wizard", "{1}{B}", 2, "2", "1", ["B"], [], "At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.");
const ELVES = creature("Llanowar Elves", "Creature — Elf Druid", "{G}", 1, "1", "1", ["G"], [], "{T}: Add {G}.");
const BEARS = creature("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "2", "2", ["G"], [], "");
const SERRA = creature("Serra Angel", "Creature — Angel", "{3}{W}{W}", 5, "4", "4", ["W"], ["Flying", "Vigilance"], "Flying\nVigilance (Attacking doesn't cause this creature to tap.)");
const DARKSTEEL_MYR = creature("Darksteel Myr", "Artifact Creature — Myr", "{3}", 3, "0", "1", [], ["Indestructible"],
  "Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)");
const INDOMITABLE = creature("Indomitable Ancients", "Creature — Treefolk Warrior", "{2}{W}{W}", 4, "2", "10", ["W"], [], "");
const noncreature = (name, type, mana, cmc, colors, keywords, oracle, extra = {}) => ({ name, type, mana, cmc, colors, keywords, oracle, ...extra });
const FEVERED = noncreature("Fevered Convulsions", "Enchantment", "{B}{B}", 2, ["B"], [], "{2}{B}{B}: Put a -1/-1 counter on target creature.");
const SIMIC_ASCENDANCY = noncreature("Simic Ascendancy", "Enchantment", "{G}{U}", 2, ["G", "U"], [],
  "{1}{G}{U}: Put a +1/+1 counter on target creature you control.\nWhenever one or more +1/+1 counters are put on a creature you control, put that many growth counters on this enchantment.\nAt the beginning of your upkeep, if this enchantment has twenty or more growth counters on it, you win the game.");
const MUTAGEN = noncreature("Mutagen", "Token Artifact — Mutagen", "", 0, [], [], "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.", { token: true });
const AETHERFLUX = noncreature("Aetherflux Reservoir", "Artifact", "{4}", 4, [], [], "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.\nPay 50 life: This artifact deals 50 damage to any target.");
const SOL_RING = noncreature("Sol Ring", "Artifact", "{1}", 1, [], [], "{T}: Add {C}{C}.");
const LILIANA = noncreature("Liliana of the Veil", "Legendary Planeswalker — Liliana", "{1}{B}{B}", 3, ["B"], [],
  "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", { loyalty: "3" });
const ROGUES_PASSAGE = noncreature("Rogue's Passage", "Land", "", 0, [], [], "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.");
const LIGHTNING_BOLT = noncreature("Lightning Bolt", "Instant", "{R}", 1, ["R"], [], "Lightning Bolt deals 3 damage to any target.");
const THINK_TWICE = noncreature("Think Twice", "Instant", "{1}{U}", 2, ["U"], ["Flashback"], "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)");
const basic = (name, sub, c) => noncreature(name, `Basic Land — ${sub}`, "", 0, [], [], `({T}: Add {${c}}.)`);
const FOREST = basic("Forest", "Forest", "G");
const SWAMP = basic("Swamp", "Swamp", "B");
const MOUNTAIN = basic("Mountain", "Mountain", "R");
const ISLAND = basic("Island", "Island", "U");
const PLAINS = basic("Plains", "Plains", "W");

/**
 * The AI's main phase (precombat unless `phase` says otherwise), the stack empty. `ai` / `user` = [[permId, card, opts]] on each
 * battlefield (untapped, not summoning-sick unless opts say so; opts.counters / opts.loyalty), `aiGy` / `userGy` = [[cardId, card]].
 */
function table({ ai = [], user = [], aiGy = [], userGy = [], phase = "precombat-main", life = 40 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => {
    const p = createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } });
    const counters = { ...(o.counters || {}), ...(o.loyalty != null ? { loyalty: o.loyalty } : {}) };
    return { ...p, counters };
  };
  const cards = (list) => list.map(([id, c]) => ({ ...c, id }));
  return { ...s0, turn: 6, phase, step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    players: { ...s0.players,
      ai: { ...s0.players.ai, life, landsPlayedThisTurn: 1, battlefield: ai.map(P("ai")), graveyard: cards(aiGy) },
      user: { ...s0.players.user, battlefield: user.map(P("user")), graveyard: cards(userGy) } } };
}
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
const offered = (s, permId) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const isActivation = (a, permId) => !!a && a.kind === "activate-ability" && a.permanentId === permId;
const targetOf = (a) => a?.targets?.[0]?.id;

describe("damage and -N/-N kill an opponent's creature", () => {
  it("⭐ Prodigal Pyromancer pings the opponent's X/1 (Llanowar Elves), not the 2/2 it can't kill", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["elf", ELVES], ["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "pyro")).toBe(true);
    expect(targetOf(a)).toBe("elf");
  });

  it("⭐ never at its own creature: with its own Llanowar Elves offered beside the opponent's, the opponent's dies", () => {
    const s = table({ ai: [["myelf", ELVES], ["pyro", PYROMANCER]], user: [["elf", ELVES]] });
    expect(offered(s, "pyro").map(targetOf)).toEqual(expect.arrayContaining(["myelf", "pyro", "elf"]));
    const a = aiPick(s);
    expect(isActivation(a, "pyro")).toBe(true);
    expect(targetOf(a)).toBe("elf");
  });

  it("⭐ the biggest threat first: of two X/1s the Pyromancer shoots the 2/1 Dark Confidant, not the 1/1 Elves", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["elf", ELVES], ["dc", CONFIDANT]] });
    const a = aiPick(s);
    expect(isActivation(a, "pyro")).toBe(true);
    expect(targetOf(a)).toBe("dc");
  });

  it("⭐ Zacama's {2}{R} — 3 damage kills the opponent's 2/2 (Grizzly Bears)", () => {
    const s = table({ ai: [["zac", ZACAMA], ["m1", MOUNTAIN], ["m2", MOUNTAIN], ["m3", MOUNTAIN]], user: [["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "zac")).toBe(true);
    expect(targetOf(a)).toBe("bear");
  });

  it("⭐ Grandmother Sengir's -1/-1 kills the opponent's X/1", () => {
    const s = table({ ai: [["gs", SENGIR], ["s1", SWAMP], ["s2", SWAMP]], user: [["elf", ELVES], ["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "gs")).toBe(true);
    expect(targetOf(a)).toBe("elf");
  });

  it("⭐ Fevered Convulsions' -1/-1 counter kills the opponent's X/1", () => {
    const s = table({ ai: [["fc", FEVERED], ["s1", SWAMP], ["s2", SWAMP], ["s3", SWAMP], ["s4", SWAMP]], user: [["bear", BEARS], ["elf", ELVES]] });
    const a = aiPick(s);
    expect(isActivation(a, "fc")).toBe(true);
    expect(targetOf(a)).toBe("elf");
  });

  it("⭐ Walking Ballista with three counters spends one to kill the opponent's X/1", () => {
    const s = table({ ai: [["wb", BALLISTA, { counters: { "+1/+1": 3 } }]], user: [["elf", ELVES]] });
    const a = aiPick(s);
    expect(isActivation(a, "wb")).toBe(true);
    expect(targetOf(a)).toBe("elf");
  });

  it("control: Walking Ballista with ONE counter does not shoot (it would die for an X/1)", () => {
    const s = table({ ai: [["wb", BALLISTA, { counters: { "+1/+1": 1 } }]], user: [["elf", ELVES]] });
    expect(offered(s, "wb").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "wb")).toBe(false);
  });

  it("control: nothing to kill in the precombat main — the Pyromancer holds (a face ping waits for the postcombat main)", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["serra", SERRA]] });
    expect(offered(s, "pyro").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "pyro")).toBe(false);
  });

  it("control: only its own creatures and players to hit in the precombat main — the Pyromancer holds", () => {
    const s = table({ ai: [["myelf", ELVES], ["pyro", PYROMANCER]] });
    expect(isActivation(aiPick(s), "pyro")).toBe(false);
  });

  it("control: Zacama's 3 damage holds against a 2/10 and an indestructible X/1 (no kill)", () => {
    const s = table({ ai: [["zac", ZACAMA], ["m1", MOUNTAIN], ["m2", MOUNTAIN], ["m3", MOUNTAIN]], user: [["anc", INDOMITABLE], ["myr", DARKSTEEL_MYR]] });
    expect(offered(s, "zac").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "zac")).toBe(false);
  });

  it("control: policy target:'v1' recovers the old skip", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["elf", ELVES]] });
    expect(offered(s, "pyro").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s, { policy: { target: "v1" } }), "pyro")).toBe(false);
  });

  it("⭐ the policy seam: `target` is a POLICY_KEYS subsystem", () => {
    expect(POLICY_KEYS).toContain("target");
  });
});

describe("in the postcombat main, a damage shot goes at an opponent's planeswalker, then the opponent with the least life", () => {
  it("⭐ Prodigal Pyromancer pings Liliana of the Veil", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["serra", SERRA], ["lili", LILIANA, { loyalty: 3 }]], phase: "postcombat-main" });
    const a = aiPick(s);
    expect(isActivation(a, "pyro")).toBe(true);
    expect(targetOf(a)).toBe("lili");
  });

  it("⭐ Prodigal Pyromancer pings the opponent when no creature dies and no planeswalker is out", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["serra", SERRA]], phase: "postcombat-main" });
    const a = aiPick(s);
    expect(isActivation(a, "pyro")).toBe(true);
    expect(a.targets[0]).toMatchObject({ type: "player", id: "user" });
  });

  it("control: under the life floor (8 life) the Pyromancer keeps its tap — no postcombat shot that kills nothing", () => {
    const s = table({ ai: [["pyro", PYROMANCER]], user: [["serra", SERRA]], phase: "postcombat-main", life: 8 });
    expect(offered(s, "pyro").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "pyro")).toBe(false);
  });
});

describe("removal goes on the biggest threat", () => {
  it("⭐ Visara destroys the opponent's Serra Angel, not the Grizzly Bears nor its own Elves", () => {
    const s = table({ ai: [["myelf", ELVES], ["vis", VISARA]], user: [["bear", BEARS], ["serra", SERRA]] });
    const a = aiPick(s);
    expect(isActivation(a, "vis")).toBe(true);
    expect(targetOf(a)).toBe("serra");
  });

  it("⭐ Zacama's {2}{G} destroys the opponent's Sol Ring", () => {
    const s = table({ ai: [["zac", ZACAMA], ["f1", FOREST], ["f2", FOREST], ["f3", FOREST]], user: [["ring", SOL_RING]] });
    const a = aiPick(s);
    expect(isActivation(a, "zac")).toBe(true);
    expect(targetOf(a)).toBe("ring");
  });

  it("control: Visara holds when every creature it could destroy is its own", () => {
    const s = table({ ai: [["myelf", ELVES], ["vis", VISARA]] });
    expect(offered(s, "vis").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "vis")).toBe(false);
  });

  it("control: Haywire Mite is not sacrificed (a self-sacrifice cost stays skipped)", () => {
    const s = table({ ai: [["mite", HAYWIRE_MITE], ["f1", FOREST]], user: [["ring", SOL_RING]] });
    expect(offered(s, "mite").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "mite")).toBe(false);
  });

  it("control: Aetherflux Reservoir's 50 life is never paid", () => {
    const s = table({ ai: [["af", AETHERFLUX]], user: [["serra", SERRA]], phase: "postcombat-main", life: 80 });
    expect(offered(s, "af").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "af")).toBe(false);
  });
});

describe("counters, fights, grants", () => {
  it("⭐ Simic Ascendancy puts its +1/+1 counter on its own biggest creature", () => {
    const s = table({ ai: [["sa", SIMIC_ASCENDANCY], ["myelf", ELVES], ["serra", SERRA], ["f1", FOREST], ["i1", ISLAND], ["f2", FOREST]], user: [["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "sa")).toBe(true);
    expect(targetOf(a)).toBe("serra");
  });

  it("⭐ a Mutagen token is spent on a +1/+1 counter for its own creature, never the opponent's", () => {
    const s = table({ ai: [["mut", MUTAGEN], ["serra", SERRA], ["f1", FOREST]], user: [["bear", BEARS]] });
    expect(offered(s, "mut").map(targetOf)).toEqual(expect.arrayContaining(["serra", "bear"]));
    const a = aiPick(s);
    expect(isActivation(a, "mut")).toBe(true);
    expect(targetOf(a)).toBe("serra");
  });

  it("⭐ Ulvenwald Tracker: its own Serra Angel fights and kills the opponent's Grizzly Bears", () => {
    const s = table({ ai: [["trk", TRACKER], ["serra", SERRA], ["f1", FOREST], ["f2", FOREST]], user: [["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "trk")).toBe(true);
    expect(a.targets.find((t) => t.role === "fighter")?.id).toBe("serra");
    expect(a.targets.find((t) => t.role === "target")?.id).toBe("bear");
  });

  it("⭐ Otepec Huntmaster gives its summoning-sick Colossal Dreadmaw haste in the precombat main", () => {
    const s = table({ ai: [["ot", OTEPEC], ["maw", DREADMAW, { sick: true }]], user: [["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "ot")).toBe(true);
    expect(targetOf(a)).toBe("maw");
  });

  it("⭐ Rogue's Passage makes its ready Serra Angel unblockable in the precombat main when the opponent has an untapped blocker", () => {
    const s = table({ ai: [["rp", ROGUES_PASSAGE], ["serra", SERRA], ["p1", PLAINS], ["p2", PLAINS], ["p3", PLAINS], ["p4", PLAINS]], user: [["bear", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "rp")).toBe(true);
    expect(targetOf(a)).toBe("serra");
  });

  it("control: no haste for a Dreadmaw that can already attack; no unblockable in the postcombat main", () => {
    const s1 = table({ ai: [["ot", OTEPEC], ["maw", DREADMAW]], user: [["bear", BEARS]] });
    expect(offered(s1, "ot").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s1), "ot")).toBe(false);
    const s2 = table({ ai: [["rp", ROGUES_PASSAGE], ["serra", SERRA], ["p1", PLAINS], ["p2", PLAINS], ["p3", PLAINS], ["p4", PLAINS]], user: [["bear", BEARS]], phase: "postcombat-main" });
    expect(offered(s2, "rp").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s2), "rp")).toBe(false);
  });

  it("control: Nylea's +2/+2 is not spent in a main phase (its worth is after blocks, which the engine does not offer)", () => {
    const s = table({ ai: [["ny", NYLEA], ["serra", SERRA], ["f1", FOREST], ["f2", FOREST], ["f3", FOREST], ["f4", FOREST]], user: [["bear", BEARS]] });
    expect(offered(s, "ny").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "ny")).toBe(false);
  });
});

describe("graveyard hate", () => {
  it("⭐ Deathrite Shaman's {B} ability exiles the opponent's Lightning Bolt (each opponent loses 2), never its own Think Twice", () => {
    const s = table({ ai: [["drs", DEATHRITE], ["s1", SWAMP]], aiGy: [["g1", THINK_TWICE]], userGy: [["g2", LIGHTNING_BOLT]] });
    expect(offered(s, "drs").map(targetOf)).toEqual(expect.arrayContaining(["g1", "g2"]));
    const a = aiPick(s);
    expect(isActivation(a, "drs")).toBe(true);
    expect(targetOf(a)).toBe("g2");
  });

  it("⭐ Deathrite Shaman's {G} ability exiles the opponent's creature card (you gain 2)", () => {
    const s = table({ ai: [["drs", DEATHRITE], ["f1", FOREST]], userGy: [["g1", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "drs")).toBe(true);
    expect(targetOf(a)).toBe("g1");
  });

  it("⭐ Intrepid Paleontologist exiles the opponent's creature card", () => {
    const s = table({ ai: [["ip", PALEONTOLOGIST], ["f1", FOREST], ["f2", FOREST]], userGy: [["g1", SWAMP], ["g2", BEARS]] });
    const a = aiPick(s);
    expect(isActivation(a, "ip")).toBe(true);
    expect(targetOf(a)).toBe("g2");
  });

  it("control: Deathrite's mana ability is not tapped for an opponent's land card (the mana would empty unused)", () => {
    const s = table({ ai: [["drs", DEATHRITE]], userGy: [["g1", SWAMP]] });
    expect(offered(s, "drs").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "drs")).toBe(false);
  });

  it("control: Deathrite's drain holds when the only instant is in its own graveyard", () => {
    const s = table({ ai: [["drs", DEATHRITE], ["s1", SWAMP]], aiGy: [["g1", THINK_TWICE]] });
    expect(offered(s, "drs").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "drs")).toBe(false);
  });

  it("control: Intrepid Paleontologist exiles neither an opponent's basic land card nor its own creature card", () => {
    const s = table({ ai: [["ip", PALEONTOLOGIST], ["f1", FOREST], ["f2", FOREST]], aiGy: [["g1", BEARS]], userGy: [["g2", SWAMP]] });
    expect(offered(s, "ip").length).toBeGreaterThan(0);
    expect(isActivation(aiPick(s), "ip")).toBe(false);
  });
});
