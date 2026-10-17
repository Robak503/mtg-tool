/**
 * auraClauseSide.test.js — THE AI READS AN AURA'S SIDE CLAUSE BY CLAUSE; NO AURA LANE OFFERS A HOST IT MAY NOT ENCHANT (2026-10-17).
 *
 * 1. Since every Aura spell is cast targeting a host (auraSpellHost.js, CR 303.4a), the AI places one by auraEntry.auraCastIntent
 *    and holds one whose side that reading can't tell. The reading was parseAuraBonus's all-or-nothing bonus parse alone, so one
 *    line about the enchanted creature it doesn't model ("When enchanted creature dies, return this card to its owner's hand")
 *    held the card: only 49 of the 623 Auras no modeled lane casts read a side, and the Light-Paws Voltron profile deck held
 *    Angelic Destiny, Spectra Ward, Benevolent Blessing, Darksteel Mutation and Swift Reconfiguration. Where the bonus parse
 *    reads nothing, auraCastIntent now reads the printed text clause by clause (auraPrintedSide.js): each sentence helps the
 *    host, hurts it, is the Aura's own business, or is unreadable; the side is their consensus, and mixed or unreadable holds.
 *    The non-cast entry choice reads the same answer (auraEntryIntent). Unmodeled text stays inert at runtime: only where the
 *    AI casts an Aura, and whether it does, moves.
 * 2. The native Aura lanes enumerated their hosts by targeting alone, so Pacifism was offered on — and resolved onto — Azorius
 *    First-Wing ("protection from enchantments": it can't be targeted by enchantment spells, CR 702.16b, nor enchanted by
 *    enchantment Auras, CR 702.16c). Every Aura cast lane now narrows its hosts by auraEntry.mayBeEnchantedBy, as the body-only
 *    lane did, and AURA_ETB's resolution re-check asks it too (CR 608.2b, 608.3b; a bestowed Aura whose target is illegal
 *    resolves as a creature, CR 702.103e).
 * 3. mayBeEnchantedBy kept out any permanent whose text MENTIONED an unread protection, and read "multicolored" as unread: Mother
 *    of Runes and Giver of Runes (they grant protection to a target) and Stonecoil Serpent (protection from multicolored) were
 *    never hosts in the body-only lane, and would have stopped being hosts in every lane with (2). The printed protection read
 *    is now the permanent's own (a grant to a target, the player or a host is masked), and multicolored / monocolored /
 *    colorless are read against the Aura's colours (CR 105.2a, 105.2b, 105.2c).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier, unchanged by this
 * slice). Every case runs through the engine's own entry points: legalActionsForPlayer, dispatchAction, passPriority,
 * pickAction, auraCastIntent, chooseAuraEntryHost.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { auraCastIntent, auraEntryIntent, chooseAuraEntryHost } from "./auraEntry.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
// The Light-Paws Voltron deck's Auras that no modeled lane casts, and two native ones it holds:
const ANGELIC_DESTINY = {"name":"Angelic Destiny","type":"Enchantment — Aura","mana":"{2}{W}{W}","cmc":4,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.\nWhen enchanted creature dies, return this card to its owner's hand."}; // body-only
const SPECTRA_WARD = {"name":"Spectra Ward","type":"Enchantment — Aura","mana":"{3}{W}{W}","cmc":5,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and has protection from each color. This effect doesn't remove Auras. (It can't be blocked, targeted, or dealt damage by anything that's white, blue, black, red, or green.)"}; // body-only
const BENEVOLENT_BLESSING = {"name":"Benevolent Blessing","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant","Flash"],"colors":["W"],"oracle":"Flash\nEnchant creature\nAs this Aura enters, choose a color.\nEnchanted creature has protection from the chosen color. This effect doesn't remove Auras and Equipment you control that are already attached to it."}; // body-only
const DARKSTEEL_MUTATION = {"name":"Darksteel Mutation","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types."}; // body-only
const SWIFT_RECONFIGURATION = {"name":"Swift Reconfiguration","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant","Flash"],"colors":["W"],"oracle":"Flash\nEnchant creature or Vehicle\nEnchanted permanent is a Vehicle artifact with crew 5 and it loses all other card types. (It's not a creature unless it's crewed.)"}; // body-only
const ON_THIN_ICE = {"name":"On Thin Ice","type":"Snow Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant snow land you control\nWhen this Aura enters, exile target creature an opponent controls until this Aura leaves the battlefield."}; // native-trigger
const CHAINS_OF_CUSTODY = {"name":"Chains of Custody","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature you control\nWhen this Aura enters, exile target nonland permanent an opponent controls until this Aura leaves the battlefield.\nEnchanted creature has ward {2}. (Whenever it becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)"}; // native-aura
const SHELTERED_BY_GHOSTS = {"name":"Sheltered by Ghosts","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature you control\nWhen this Aura enters, exile target nonland permanent an opponent controls until this Aura leaves the battlefield.\nEnchanted creature gets +1/+0 and has lifelink and ward {2}."}; // native-aura
const PARIAH = {"name":"Pariah","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead."}; // native-aura
const SOLID_FOOTING = {"name":"Solid Footing","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant","Flash"],"colors":["W"],"oracle":"Flash\nEnchant creature\nEnchanted creature gets +1/+1.\nAs long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather than its power."}; // native-aura
const GAUNTLETS_OF_LIGHT = {"name":"Gauntlets of Light","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +0/+2 and assigns combat damage equal to its toughness rather than its power.\nEnchanted creature has \"{2}{W}: Untap this creature.\""}; // native-activated
// Other Auras:
const HERMETIC_STUDY = {"name":"Hermetic Study","type":"Enchantment — Aura","mana":"{1}{U}","cmc":2,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature has \"{T}: This creature deals 1 damage to any target.\""}; // native-activated
const KENRITHS_TRANSFORMATION = {"name":"Kenrith's Transformation","type":"Enchantment — Aura","mana":"{1}{G}","cmc":2,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)"}; // body-only
const BETRAYAL = {"name":"Betrayal","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature an opponent controls\nWhenever enchanted creature becomes tapped, you draw a card."}; // body-only
const CURSED_LAND = {"name":"Cursed Land","type":"Enchantment — Aura","mana":"{2}{B}{B}","cmc":4,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant land\nAt the beginning of the upkeep of enchanted land's controller, this Aura deals 1 damage to that player."}; // body-only
const PSYCHIC_IMPETUS = {"name":"Psychic Impetus","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Goad","Enchant","Scry"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you scry 2."}; // body-only
const CLUTCH_OF_UNDEATH = {"name":"Clutch of Undeath","type":"Enchantment — Aura","mana":"{3}{B}{B}","cmc":5,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature\nEnchanted creature gets +3/+3 as long as it's a Zombie. Otherwise, it gets -3/-3."}; // body-only
const AIR_BLADDER = {"name":"Air Bladder","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature has flying.\nEnchanted creature can block only creatures with flying."}; // body-only
const LEADEN_FISTS = {"name":"Leaden Fists","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Enchant","Flash"],"colors":["U"],"oracle":"Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature gets +3/+3 and doesn't untap during its controller's untap step."}; // body-only
const SPECTRAL_STEEL = {"name":"Spectral Steel","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2.\n{1}{W}, Exile this card from your graveyard: Return another target Aura or Equipment card from your graveyard to your hand."}; // body-only
const WORLD_WEARY = {"name":"World-Weary","type":"Enchantment — Aura","mana":"{3}{B}{B}","cmc":5,"keywords":["Landcycling","Enchant","Basic landcycling","Typecycling","Cycling"],"colors":["B"],"oracle":"Enchant creature\nEnchanted creature gets -4/-4.\nBasic landcycling {1}{B} ({1}{B}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)"}; // body-only
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."}; // native-mana-aura
const SQUIRREL_NEST = {"name":"Squirrel Nest","type":"Enchantment — Aura","mana":"{1}{G}{G}","cmc":3,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nEnchanted land has \"{T}: Create a 1/1 green Squirrel creature token.\""}; // native-activated
const CONSECRATE_LAND = {"name":"Consecrate Land","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant land\nEnchanted land has indestructible and can't be enchanted by other Auras."}; // body-only
const NYXBORN_WOLF = {"name":"Nyxborn Wolf","type":"Enchantment Creature — Wolf","mana":"{2}{G}","cmc":3,"power":"3","toughness":"1","keywords":["Bestow"],"colors":["G"],"oracle":"Bestow {4}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +3/+1."}; // native-aura
const SPECTRAL_SHIELD = {"name":"Spectral Shield","type":"Enchantment — Aura","mana":"{1}{W}{U}","cmc":3,"keywords":["Enchant"],"colors":["U","W"],"oracle":"Enchant creature\nEnchanted creature gets +0/+2 and can't be the target of spells."}; // body-only
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."}; // native-activated
const GIVER_OF_RUNES = {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn."}; // native-activated
const STONECOIL_SERPENT = {"name":"Stonecoil Serpent","type":"Artifact Creature — Snake","mana":"{X}","cmc":0,"power":"0","toughness":"0","keywords":["Reach","Protection","Trample"],"colors":[],"oracle":"Reach, trample, protection from multicolored\nThis creature enters with X +1/+1 counters on it."}; // native-body
const AZORIUS_FIRST_WING = {"name":"Azorius First-Wing","type":"Creature — Griffin","mana":"{W}{U}","cmc":2,"power":"2","toughness":"2","keywords":["Flying","Protection"],"colors":["U","W"],"oracle":"Flying, protection from enchantments"}; // native-body
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SNOW_COVERED_PLAINS = {"name":"Snow-Covered Plains","type":"Basic Snow Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const FULL_POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** ai1 (the caster) a Bears and a Hill Giant and a Snow-Covered Plains; ai2 a Bears and a Forest; ai3 a Hill Giant. */
const BOARD = () => ({
  ai1: [P("b1", GRIZZLY_BEARS, "ai1"), P("g1", HILL_GIANT, "ai1"), P("s1", SNOW_COVERED_PLAINS, "ai1")],
  ai2: [P("b2", GRIZZLY_BEARS, "ai2"), P("f2", FOREST, "ai2")],
  ai3: [P("g3", HILL_GIANT, "ai3")],
});

/** A four-seat pod (user → ai1 → ai2 → ai3) in ai1's precombat main phase; ai1 holds `aura` (id "aura1") and a full pool. */
function pod({ aura, boards = BOARD() } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: [], library: library(pid) };
  }
  players.ai1 = { ...players.ai1, hand: aura ? [{ ...aura, id: "aura1" }] : [], manaPool: { ...players.ai1.manaPool, ...FULL_POOL } };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "ai1", priorityHolder: "ai1", consecutivePasses: 0 };
}

const auraOffers = (s) => legalActionsForPlayer(s, "ai1").filter((a) => a.kind === "cast-spell" && a.cardId === "aura1");
/** The hosts the Aura is offered on, sorted ids (a bestow card's bestow casts only). */
const offeredHosts = (s, { bestow = false } = {}) => auraOffers(s).filter((a) => !bestow || a.bestow).map((a) => a.targets?.[0]?.id ?? "NO TARGET").sort();
/** The AI's pick for ai1: the id of the permanent its Aura cast targets, or "held". */
function aiPick(s) {
  const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
  if (pick?.kind !== "cast-spell" || pick.cardId !== "aura1") return "held";
  return pick.targets?.[0]?.id ?? "NO TARGET";
}
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
/** Where a card is after the stack settles: "<seat>.<zone>", with the host for an attached permanent. */
function whereIs(s, name) {
  const out = [];
  for (const [pid, p] of Object.entries(s.players)) {
    for (const zone of ["hand", "battlefield", "graveyard", "exile"]) {
      for (const o of p[zone] || []) {
        if ((o.card?.name ?? o.name) === name) out.push(`${pid}.${zone}${o.attachedTo ? ` on ${o.attachedTo}` : ""}`);
      }
    }
  }
  return out;
}
/** Only the AI's own creatures on the board / only its opponents'. */
const OWN_ONLY = () => ({ ai1: [P("b1", GRIZZLY_BEARS, "ai1"), P("g1", HILL_GIANT, "ai1")] });
const ENEMY_ONLY = () => ({ ai2: [P("b2", GRIZZLY_BEARS, "ai2")], ai3: [P("g3", HILL_GIANT, "ai3")] });

describe("the AI casts a body-only buff Aura on its own best creature — the Light-Paws Voltron Auras", () => {
  it("⭐ Angelic Destiny (+4/+4, flying, first strike; its card returns when the creature dies) goes on ai1's Hill Giant — it was held", () => {
    expect(aiPick(pod({ aura: ANGELIC_DESTINY }))).toBe("g1");
  });

  it("⭐ Spectra Ward (+2/+2, protection from each colour) and Benevolent Blessing (protection from a chosen colour) go on ai1's Hill Giant", () => {
    expect({ ward: aiPick(pod({ aura: SPECTRA_WARD })), blessing: aiPick(pod({ aura: BENEVOLENT_BLESSING })) }).toEqual({ ward: "g1", blessing: "g1" });
  });

  it("⭐ the deck's native Auras whose bonus never parsed whole: Chains of Custody (ward {2}, an enters exile) and Sheltered by Ghosts go on ai1's Hill Giant", () => {
    expect({ chains: aiPick(pod({ aura: CHAINS_OF_CUSTODY })), ghosts: aiPick(pod({ aura: SHELTERED_BY_GHOSTS })) }).toEqual({ chains: "g1", ghosts: "g1" });
  });

  it("⭐ a granted activated ability is its controller's to use (CR 602.1): Hermetic Study (\"{T}: This creature deals 1 damage to any target\", a creature host) goes on ai1's Hill Giant — it was held", () => {
    expect(aiPick(pod({ aura: HERMETIC_STUDY }))).toBe("g1");
  });

  it("⭐ On Thin Ice — only the Aura's own business (its enters exile), and its Enchant line names ai1's side: cast on ai1's snow land", () => {
    expect(aiPick(pod({ aura: ON_THIN_ICE }))).toBe("s1");
  });

  it("a buff with only the opponents' creatures to enchant is held — never hung on an enemy", () => {
    expect(aiPick(pod({ aura: ANGELIC_DESTINY, boards: ENEMY_ONLY() }))).toBe("held");
  });
});

describe("the AI casts a body-only debuff Aura on the biggest enemy creature", () => {
  it("⭐ Darksteel Mutation (the host becomes an indestructible 0/1 Insect with no other abilities) goes on ai3's Hill Giant — it was held", () => {
    expect(aiPick(pod({ aura: DARKSTEEL_MUTATION }))).toBe("g3");
  });

  it("⭐ Swift Reconfiguration (no longer a creature: a crew-5 Vehicle) and Kenrith's Transformation (a vanilla 3/3 Elk) go on ai3's Hill Giant", () => {
    expect({ swift: aiPick(pod({ aura: SWIFT_RECONFIGURATION })), elk: aiPick(pod({ aura: KENRITHS_TRANSFORMATION })) }).toEqual({ swift: "g3", elk: "g3" });
  });

  it("⭐ Cursed Land (damage to the enchanted land's controller each upkeep) goes on ai2's Forest, the only opposing land", () => {
    expect(aiPick(pod({ aura: CURSED_LAND }))).toBe("f2");
  });

  it("⭐ Betrayal — only the Aura's own business (its draw), and its Enchant line names an opponent's creature: the biggest one", () => {
    expect(aiPick(pod({ aura: BETRAYAL }))).toBe("g3");
  });

  it("the cast resolves: Darksteel Mutation enters attached to ai3's Hill Giant", () => {
    const s = pod({ aura: DARKSTEEL_MUTATION });
    const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
    expect(whereIs(resolveStack(dispatchAction(s, pick)), "Darksteel Mutation")).toEqual(["ai1.battlefield on g3"]);
  });

  it("a debuff with only the AI's own creatures to enchant is held — never cast on itself", () => {
    expect(aiPick(pod({ aura: DARKSTEEL_MUTATION, boards: OWN_ONLY() }))).toBe("held");
  });
});

describe("a mixed or unreadable Aura is held — never a guess", () => {
  it("⭐ mixed: Psychic Impetus (+2/+2 beside goad), Clutch of Undeath (+3/+3, otherwise -3/-3), Air Bladder (flying beside a block limit), Leaden Fists (+3/+3 beside an untap lock)", () => {
    expect([PSYCHIC_IMPETUS, CLUTCH_OF_UNDEATH, AIR_BLADDER, LEADEN_FISTS].map((a) => aiPick(pod({ aura: a })))).toEqual(["held", "held", "held", "held"]);
  });

  it("unreadable: Pariah (your damage redirected to it), Solid Footing (a bonus gated on the host's own vigilance), Gauntlets of Light (damage by toughness)", () => {
    expect([PARIAH, SOLID_FOOTING, GAUNTLETS_OF_LIGHT].map((a) => aiPick(pod({ aura: a })))).toEqual(["held", "held", "held"]);
  });
});

describe("the reading — auraCastIntent, the cast pick's and the non-cast entry's one answer", () => {
  it("⭐ the Light-Paws Voltron Auras read a side; the mixed and the unreadable read none", () => {
    const row = (c) => [c.name, auraCastIntent(c)];
    expect([ANGELIC_DESTINY, SPECTRA_WARD, BENEVOLENT_BLESSING, DARKSTEEL_MUTATION, SWIFT_RECONFIGURATION, ON_THIN_ICE, CHAINS_OF_CUSTODY, SHELTERED_BY_GHOSTS, PARIAH, SOLID_FOOTING, GAUNTLETS_OF_LIGHT].map(row)).toEqual([
      ["Angelic Destiny", "own"], ["Spectra Ward", "own"], ["Benevolent Blessing", "own"], ["Darksteel Mutation", "enemy"],
      ["Swift Reconfiguration", "enemy"], ["On Thin Ice", "own"], ["Chains of Custody", "own"], ["Sheltered by Ghosts", "own"],
      ["Pariah", null], ["Solid Footing", null], ["Gauntlets of Light", null],
    ]);
  });

  it("controls: what the bonus parse already read is unchanged — Spectral Steel own, World-Weary and Pacifism enemy, Leaden Fists none", () => {
    expect([SPECTRAL_STEEL, WORLD_WEARY, PACIFISM, LEADEN_FISTS].map(auraCastIntent)).toEqual(["own", "enemy", "enemy", null]);
  });

  it("⭐ the non-cast entry agrees (CR 303.4f): Darksteel Mutation entering under ai1 goes onto ai3's Hill Giant, Angelic Destiny onto ai1's", () => {
    const s = pod({});
    expect({
      intent: auraEntryIntent(DARKSTEEL_MUTATION),
      mutation: chooseAuraEntryHost(s, { ...DARKSTEEL_MUTATION, id: "m1" }, "ai1").hostId,
      destiny: chooseAuraEntryHost(s, { ...ANGELIC_DESTINY, id: "d1" }, "ai1").hostId,
    }).toEqual({ intent: "enemy", mutation: "g3", destiny: "g1" });
  });
});

describe("no Aura cast lane offers a host with protection from the Aura (CR 702.16b, 702.16c), or one that can't be enchanted", () => {
  const WING = () => ({ ai1: [P("b1", GRIZZLY_BEARS, "ai1")], ai2: [P("w2", AZORIUS_FIRST_WING, "ai2"), P("b2", GRIZZLY_BEARS, "ai2")] });

  it("⭐ Pacifism (native) is never offered on Azorius First-Wing (protection from enchantments); every other creature still is", () => {
    expect(offeredHosts(pod({ aura: PACIFISM, boards: WING() }))).toEqual(["b1", "b2"]);
  });

  it("⭐ with First-Wing the only opposing creature the AI holds Pacifism — it used to cast it there", () => {
    const boards = { ai1: [P("b1", GRIZZLY_BEARS, "ai1")], ai2: [P("w2", AZORIUS_FIRST_WING, "ai2")] };
    expect(aiPick(pod({ aura: PACIFISM, boards }))).toBe("held");
  });

  it("⭐ a Pacifism cast aimed at First-Wing anyway doesn't resolve: its target is illegal (CR 608.2b, 608.3b) and it goes to its owner's graveyard", () => {
    const s = pod({ aura: PACIFISM, boards: WING() });
    const onBears = auraOffers(s).find((a) => a.targets?.[0]?.id === "b2");
    expect(onBears).toBeDefined();
    const aimed = { ...onBears, targets: [{ ...onBears.targets[0], id: "w2", name: "Azorius First-Wing" }], targetName: "Azorius First-Wing" };
    expect(whereIs(resolveStack(dispatchAction(s, aimed)), "Pacifism")).toEqual(["ai1.graveyard"]);
  });

  it("⭐ the bestow lane: Nyxborn Wolf is offered bestowed on every creature but First-Wing", () => {
    expect(offeredHosts(pod({ aura: NYXBORN_WOLF, boards: WING() }), { bestow: true })).toEqual(["b1", "b2"]);
  });

  const SANCTIFIED = () => ({
    ai1: [P("f1", FOREST, "ai1", { attachments: ["cl1"] }), P("cl1", CONSECRATE_LAND, "ai1", { attachedTo: "f1" }), P("f9", FOREST, "ai1")],
  });

  it("⭐ the mana-boost lane: Wild Growth skips ai1's Forest that can't be enchanted by other Auras (Consecrate Land)", () => {
    expect(offeredHosts(pod({ aura: WILD_GROWTH, boards: SANCTIFIED() }))).toEqual(["f9"]);
  });

  it("⭐ the granted-ability lane: Squirrel Nest skips it too", () => {
    expect(offeredHosts(pod({ aura: SQUIRREL_NEST, boards: SANCTIFIED() }))).toEqual(["f9"]);
  });

  it("controls: Pacifism still resolves onto a creature it may enchant; the tiers don't move", () => {
    const s = pod({ aura: PACIFISM, boards: WING() });
    const onBears = auraOffers(s).find((a) => a.targets?.[0]?.id === "b2");
    expect({
      resolved: whereIs(resolveStack(dispatchAction(s, onBears)), "Pacifism"),
      tiers: [ANGELIC_DESTINY, DARKSTEEL_MUTATION, ON_THIN_ICE, CHAINS_OF_CUSTODY, PACIFISM, WILD_GROWTH, SQUIRREL_NEST, NYXBORN_WOLF].map((c) => classifyCard(c)),
    }).toEqual({
      resolved: ["ai1.battlefield on b2"],
      tiers: ["body-only", "body-only", "native-trigger", "native-aura", "native-aura", "native-mana-aura", "native-activated", "native-aura"],
    });
  });
});

describe("the printed protection that keeps an Aura out is the permanent's own, read exactly (CR 702.16b, 702.16c, 105.2a, 105.2b)", () => {
  const RUNES = () => ({
    ai1: [P("m1", MOTHER_OF_RUNES, "ai1"), P("v1", GIVER_OF_RUNES, "ai1")],
    ai2: [P("sc2", STONECOIL_SERPENT, "ai2"), P("b2", GRIZZLY_BEARS, "ai2")],
  });

  it("⭐ mono-white Spectral Steel may enchant Mother of Runes and Giver of Runes (they grant protection, they don't have it) and Stonecoil Serpent (protection from multicolored only) — the body-only lane used to skip all three", () => {
    expect(offeredHosts(pod({ aura: SPECTRAL_STEEL, boards: RUNES() }))).toEqual(["b2", "m1", "sc2", "v1"]);
  });

  it("⭐ multicolored Spectral Shield may not enchant Stonecoil Serpent; Mother of Runes and Giver of Runes still may", () => {
    expect(offeredHosts(pod({ aura: SPECTRAL_SHIELD, boards: RUNES() }))).toEqual(["b2", "m1", "v1"]);
  });

  it("⭐ the non-cast entry reads the same (CR 303.4f): Angelic Destiny entering under ai1 with only Mother of Runes on its side goes onto her", () => {
    const boards = { ai1: [P("m1", MOTHER_OF_RUNES, "ai1")], ai2: [P("b2", GRIZZLY_BEARS, "ai2")] };
    expect(chooseAuraEntryHost(pod({ boards }), { ...ANGELIC_DESTINY, id: "d1" }, "ai1").hostId).toBe("m1");
  });

  it("control: Pacifism (native) is still offered on all three", () => {
    expect(offeredHosts(pod({ aura: PACIFISM, boards: RUNES() }))).toEqual(["b2", "m1", "sc2", "v1"]);
  });
});
