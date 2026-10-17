/**
 * dfcFaceUpSweep.test.js — a multi-face permanent is read as its FACE THAT IS UP everywhere, not only in the layer derive
 * (2026-10-17, the sweep after the three 10-16 double-faced-card slices).
 *
 * THE BUG. In-game cards for a double-faced, adventure or flip card carry Scryfall's COMBINED fields (cardIndex.publicCard):
 * the "Front // Back" type line, an oracle of both face blocks, and a `keywords` array holding both faces' keywords. The
 * 10-16 slices taught the layer derive (faceUpTypeLine) and the mana model (manaModel.faceUpManaCard) to read the face that
 * is up; every other reader still read the whole card, so a front face had its back face's
 *   · keywords (keywords.hasKeyword — Westvale Abbey was flying, lifelink, indestructible and hasty),
 *   · activated abilities (the offer — Halvar, God of Battle offered its Sword's Equip, Chalice of Life "{T}: Target player
 *     loses 5 life", Treasure Map Treasure Cove's draw, Neglected Heirloom Ashmouth Blade's Equip {3}),
 *   · triggered and static abilities (classLevels.classLiveCard — Lambholt Elder drew off Silverpelt Werewolf's trigger,
 *     Bloodline Keeper gave other Vampires Lord of Lineage's +2/+2, Liliana's Other Contract made its controller unable to
 *     lose the game),
 *   · card types in the readers outside the derive (summoning sickness — Hostile Hostel could not tap the turn it was
 *     played; the trigger scopes — Treasure Map, an artifact, fired landfall; the attach pools and the Enchant-land host; the
 *     legend rule; the graveyard counts — a Westvale Abbey in a graveyard was a creature card and two card types).
 *
 * THE RULE. A double-faced permanent with its front face up has only its front face's characteristics (CR 712.8d); a
 * double-faced card in a graveyard, library or hand has only its front face's (CR 712.8a). A split card is the exception:
 * outside the stack it has both halves' card types and abilities (CR 709.4c), so it stays whole (faceUp.faceUpView).
 *
 * Real oracle fixtures: the bundled snapshot through cardIndex.publicCard + learnDeckEnrich.mergeCardData (a game deck card's
 * shape), generated 2026-10-17. Land drops and offers come from legalActionsForPlayer and dispatchAction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution } from "./gameEngine.js";
import { assignsCombatDamageWithToughness, permanentHasKeyword, permanentPower, permanentToughness, playerCantLoseGame } from "./layers.js";
import { hasKeyword } from "./keywords.js";
import { faceUpView } from "./faceUp.js";
import { manaSources } from "./manaModel.js";
import { enumerateTargets } from "./spellEffects.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { mustBeBlockedIfAble } from "./combatEvasion.js";
import { checkAllStateBasedActions } from "./sba.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, isIndestructible, lastKnownIsCreature, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall via cardIndex.publicCard + learnDeckEnrich.mergeCardData, 2026-10-17) ──
const ABBEY = {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","cmc":0,"power":null,"toughness":null,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"layout":"transform","colors":[],"colorIdentity":["B"],"oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste"};
const HOSTEL = {"name":"Hostile Hostel // Creeping Inn","type":"Land // Artifact Creature — Horror Construct","mana":"","cmc":0,"power":null,"toughness":null,"keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":["B"],"oracle":"Hostile Hostel - Land \n{T}: Add {C}.\n{1}, {T}, Sacrifice a creature: Put a soul counter on this land. Then if there are three or more soul counters on it, remove those counters, transform it, then untap it. Activate only as a sorcery.\n//\nCreeping Inn - Artifact Creature — Horror Construct \nWhenever this creature attacks, you may exile a creature card from your graveyard. If you do, each opponent loses X life and you gain X life, where X is the number of creature cards exiled with this creature.\n{4}: This creature phases out."};
const SOUL_WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"layout":"normal","colors":["W"],"colorIdentity":["W"],"oracle":"Whenever another creature enters, you gain 1 life."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":""};
const SERRA = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"layout":"normal","colors":["W"],"colorIdentity":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"};
const DOROTHEA = {"name":"Dorothea, Vengeful Victim // Dorothea's Retribution","type":"Legendary Creature — Spirit // Enchantment — Aura","mana":"{W}{U}","cmc":2,"power":"4","toughness":"4","keywords":["Flying","Transform","Enchant","Disturb"],"layout":"transform","colors":[],"colorIdentity":["U","W"],"oracle":"Dorothea, Vengeful Victim - Legendary Creature — Spirit {W}{U}\nFlying\nWhen Dorothea attacks or blocks, sacrifice it at end of combat.\nDisturb {1}{W}{U} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nDorothea's Retribution - Enchantment — Aura \nEnchant creature\nEnchanted creature has \"Whenever this creature attacks, create a 4/4 white Spirit creature token with flying that's tapped and attacking. Sacrifice that token at end of combat.\"\nIf Dorothea's Retribution would be put into a graveyard from anywhere, exile it instead."};
const LUNARCH = {"name":"Lunarch Veteran // Luminous Phantom","type":"Creature — Human Cleric // Creature — Spirit Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Transform","Disturb"],"layout":"transform","colors":[],"colorIdentity":["W"],"oracle":"Lunarch Veteran - Creature — Human Cleric {W}\nWhenever another creature you control enters, you gain 1 life.\nDisturb {1}{W} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nLuminous Phantom - Creature — Spirit Cleric \nFlying\nWhenever another creature you control leaves the battlefield, you gain 1 life.\nIf Luminous Phantom would be put into a graveyard from anywhere, exile it instead."};
const HALVAR = {"name":"Halvar, God of Battle // Sword of the Realms","type":"Legendary Creature — God // Legendary Artifact — Equipment","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","keywords":["Equip"],"layout":"modal_dfc","colors":[],"colorIdentity":["W"],"oracle":"Halvar, God of Battle - Legendary Creature — God {2}{W}{W}\nCreatures you control that are enchanted or equipped have double strike.\nAt the beginning of each combat, you may attach target Aura or Equipment attached to a creature you control to target creature you control.\n//\nSword of the Realms - Legendary Artifact — Equipment {1}{W}\nEquipped creature gets +2/+0 and has vigilance.\nWhenever equipped creature dies, return it to its owner's hand.\nEquip {1}{W}"};
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"layout":"normal","colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"};
const HEIRLOOM = {"name":"Neglected Heirloom // Ashmouth Blade","type":"Artifact — Equipment // Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Transform","Equip"],"layout":"transform","colors":[],"colorIdentity":[],"oracle":"Neglected Heirloom - Artifact — Equipment {1}\nEquipped creature gets +1/+1.\nWhen equipped creature transforms, transform this Equipment.\nEquip {1}\n//\nAshmouth Blade - Artifact — Equipment \nEquipped creature gets +3/+3 and has first strike.\nEquip {3}"};
const CHALICE = {"name":"Chalice of Life // Chalice of Death","type":"Artifact // Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":[],"oracle":"Chalice of Life - Artifact {3}\n{T}: You gain 1 life. Then if you have at least 10 life more than your starting life total, transform this artifact.\n//\nChalice of Death - Artifact \n{T}: Target player loses 5 life."};
const TREASURE_MAP = {"name":"Treasure Map // Treasure Cove","type":"Artifact // Land","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Transform","Treasure","Scry"],"layout":"transform","colors":[],"colorIdentity":[],"oracle":"Treasure Map - Artifact {2}\n{1}, {T}: Scry 1. Put a landmark counter on this artifact. Then if there are three or more landmark counters on it, remove those counters, transform this artifact, and create three Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\n//\nTreasure Cove - Land \n(Transforms from Treasure Map.)\n{T}: Add {C}.\n{T}, Sacrifice a Treasure: Draw a card."};
const JERREN = {"name":"Jerren, Corrupted Bishop // Ormendahl, the Corrupter","type":"Legendary Creature — Human Cleric // Legendary Creature — Demon","mana":"{2}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Flying","Lifelink","Transform","Trample"],"layout":"transform","colors":[],"colorIdentity":["B"],"oracle":"Jerren, Corrupted Bishop - Legendary Creature — Human Cleric {2}{B}\nWhenever Jerren enters or another nontoken Human you control dies, you lose 1 life and create a 1/1 white Human creature token.\n{2}: Target Human you control gains lifelink until end of turn.\nAt the beginning of your end step, if you have exactly 13 life, you may pay {4}{B}{B}. If you do, transform Jerren.\n//\nOrmendahl, the Corrupter - Legendary Creature — Demon \nFlying, trample, lifelink\nSacrifice another creature: Draw a card."};
const ROVER = {"name":"Rover Blades","type":"Artifact — Equipment Vehicle","mana":"{3}","cmc":3,"power":"2","toughness":"2","keywords":["Crew","Equip","Double strike"],"layout":"normal","colors":[],"colorIdentity":[],"oracle":"Double strike\nEquipped creature has double strike.\nEquip {4}\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn. Creatures can't be attached to other permanents.)"};
const CAP = {"name":"Captain America, First Avenger","type":"Legendary Creature — Human Soldier Hero","mana":"{R}{W}{U}","cmc":3,"power":"4","toughness":"4","keywords":["Throw ...","... Catch"],"layout":"normal","colors":["R","U","W"],"colorIdentity":["R","U","W"],"oracle":"Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America."};
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."};
const GOYF = {"name":"Tarmogoyf","type":"Creature — Lhurgoyf","mana":"{1}{G}","cmc":2,"power":"*","toughness":"1+*","keywords":[],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1."};
const WURM = {"name":"Boneyard Wurm","type":"Creature — Wurm","mana":"{1}{G}","cmc":2,"power":"*","toughness":"*","keywords":[],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"Boneyard Wurm's power and toughness are each equal to the number of creature cards in your graveyard."};
const COMMIT = {"name":"Commit // Memory","type":"Instant // Sorcery","mana":"{3}{U} // {4}{U}{U}","cmc":10,"power":null,"toughness":null,"keywords":["Aftermath"],"layout":"split","colors":["U"],"colorIdentity":["U"],"oracle":"Commit - Instant {3}{U}\nPut target spell or nonland permanent into its owner's library second from the top.\n//\nMemory - Sorcery {4}{U}{U}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nEach player shuffles their hand and graveyard into their library, then draws seven cards."};
const ALTAR = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"layout":"normal","colors":[],"colorIdentity":[],"oracle":"Sacrifice a creature: Add {C}{C}."};
const DRUM = {"name":"Springleaf Drum","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"layout":"normal","colors":[],"colorIdentity":[],"oracle":"{T}, Tap an untapped creature you control: Add one mana of any color."};
const COBRA = {"name":"Lotus Cobra","type":"Creature — Snake","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":["Landfall"],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"Landfall — Whenever a land you control enters, add one mana of any color."};
const KEEPER = {"name":"Bloodline Keeper // Lord of Lineage","type":"Creature — Vampire // Creature — Vampire","mana":"{2}{B}{B}","cmc":4,"power":"3","toughness":"3","keywords":["Flying","Transform"],"layout":"transform","colors":[],"colorIdentity":["B"],"oracle":"Bloodline Keeper - Creature — Vampire {2}{B}{B}\nFlying\n{T}: Create a 2/2 black Vampire creature token with flying.\n{B}: Transform this creature. Activate only if you control five or more Vampires.\n//\nLord of Lineage - Creature — Vampire \nFlying\nOther Vampire creatures you control get +2/+2.\n{T}: Create a 2/2 black Vampire creature token with flying."};
const CONTRACT = {"name":"Liliana's Other Contract // Liliana's Undead Minion","type":"Enchantment // Legendary Planeswalker — You","mana":"{4}{B}","cmc":5,"power":null,"toughness":null,"keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":["B"],"oracle":"Liliana's Other Contract - Enchantment {4}{B}\nWhen Liliana's Other Contract enters the battlefield, you draw three cards and you lose 3 life.\nIf you would lose the game, instead exile Liliana's Other Contract, then return it to the battlefield transformed under your control.\n//\nLiliana's Undead Minion - Legendary Planeswalker — You \nYou can't lose the game.\n+1: Each opponent loses 1 life.\n−4: Destroy target creature."};
const LAMBHOLT = {"name":"Lambholt Elder // Silverpelt Werewolf","type":"Creature — Human Werewolf // Creature — Werewolf","mana":"{2}{G}","cmc":3,"power":"1","toughness":"2","keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":["G"],"oracle":"Lambholt Elder - Creature — Human Werewolf {2}{G}\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.\n//\nSilverpelt Werewolf - Creature — Werewolf \nWhenever this creature deals combat damage to a player, draw a card.\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"layout":"normal","colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"{T}: Add {G}."};
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"layout":"normal","colors":["B"],"colorIdentity":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"layout":"token","colors":[],"colorIdentity":[],"oracle":"{T}, Sacrifice this token: Add one mana of any color."};
const AJANIS_CHOSEN = {"name":"Ajani's Chosen","type":"Creature — Cat Soldier","mana":"{2}{W}{W}","cmc":4,"power":"3","toughness":"3","keywords":[],"layout":"normal","colors":["W"],"colorIdentity":["W"],"oracle":"Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may attach it to the token."};
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"layout":"normal","colors":["W"],"colorIdentity":["W"],"oracle":"Creatures you control get +1/+1."};
const TANGLECLAW = {"name":"Tangleclaw Werewolf // Fibrous Entangler","type":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","mana":"{2}{G}{G}","cmc":4,"power":"2","toughness":"4","keywords":["Vigilance","Transform"],"layout":"transform","colors":[],"colorIdentity":["G"],"oracle":"Tangleclaw Werewolf - Creature — Werewolf Horror {2}{G}{G}\nThis creature can block an additional creature each combat.\n{6}{G}: Transform this creature.\n//\nFibrous Entangler - Creature — Eldrazi Werewolf \nVigilance\nThis creature must be blocked if able.\nThis creature can block an additional creature each combat."};
const FOOTING = {"name":"Solid Footing","type":"Enchantment — Aura","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant","Flash"],"layout":"normal","colors":["W"],"colorIdentity":["W"],"oracle":"Flash\nEnchant creature\nEnchanted creature gets +1/+1.\nAs long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather than its power."};
const DUSKWATCH = {"name":"Duskwatch Recruiter // Krallenhorde Howler","type":"Creature — Human Warrior Werewolf // Creature — Werewolf","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":["G"],"oracle":"Duskwatch Recruiter - Creature — Human Warrior Werewolf {1}{G}\n{2}{G}: Look at the top three cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.\n//\nKrallenhorde Howler - Creature — Werewolf \nCreature spells you cast cost {1} less to cast.\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature."};
const EMET = {"name":"Emet-Selch, Unsundered // Hades, Sorcerer of Eld","type":"Legendary Creature — Elder Wizard // Legendary Creature — Avatar","mana":"{1}{U}{B}","cmc":3,"power":"2","toughness":"4","keywords":["Vigilance","Echo of the Lost","Transform"],"layout":"transform","colors":[],"colorIdentity":["B","U"],"oracle":"Emet-Selch, Unsundered - Legendary Creature — Elder Wizard {1}{U}{B}\nVigilance\nWhenever Emet-Selch enters or attacks, draw a card, then discard a card.\nAt the beginning of your upkeep, if there are fourteen or more cards in your graveyard, you may transform Emet-Selch.\n//\nHades, Sorcerer of Eld - Legendary Creature — Avatar \nVigilance\nEcho of the Lost — During your turn, you may play cards from your graveyard.\nIf a card or token would be put into your graveyard from anywhere, exile it instead."};
const HELIOD = {"name":"Heliod, the Radiant Dawn // Heliod, the Warped Eclipse","type":"Legendary Enchantment Creature — God // Legendary Enchantment Creature — Phyrexian God","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","keywords":["Transform"],"layout":"transform","colors":[],"colorIdentity":["U","W"],"oracle":"Heliod, the Radiant Dawn - Legendary Enchantment Creature — God {2}{W}{W}\nWhen Heliod enters, return target enchantment card that isn't a God from your graveyard to your hand.\n{3}{U/P}: Transform Heliod. Activate only as a sorcery. ({U/P} can be paid with either {U} or 2 life.)\n//\nHeliod, the Warped Eclipse - Legendary Enchantment Creature — Phyrexian God \nYou may cast spells as though they had flash.\nSpells you cast cost {1} less to cast for each card your opponents have drawn this turn."};
const PROTECTOR = {"name":"Gaea's Protector","type":"Creature — Elemental Warrior","mana":"{3}{G}","cmc":4,"power":"4","toughness":"2","keywords":[],"layout":"normal","colors":["G"],"colorIdentity":["G"],"oracle":"This creature must be blocked if able."};
const FIREWEAVER = {"name":"Reckless Fireweaver","type":"Creature — Human Artificer","mana":"{1}{R}","cmc":2,"power":"1","toughness":"3","keywords":[],"layout":"normal","colors":["R"],"colorIdentity":["R"],"oracle":"Whenever an artifact you control enters, this creature deals 1 damage to each opponent."};

const P = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

/** A two-seat game in the user's precombat main phase (turn 3): the stack empty, the land drop unused, `pool` of each colour. */
function board({ hand = [], user = [], ai = [], graveyard = [], pool = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...BEARS }));
  const mana = Object.fromEntries(["W", "U", "B", "R", "G", "C"].map((c) => [c, pool]));
  return { ...s, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, hand, battlefield: user, graveyard, landsPlayedThisTurn: 0, manaPool: { ...s.players.user.manaPool, ...mana }, library: lib("user") },
      ai: { ...s.players.ai, battlefield: ai, library: lib("ai") } } };
}
/** Play `card` from the hand as the land drop beside `user`, and let the engine settle it. */
function playLand(card, user = []) {
  const s0 = board({ hand: [{ id: "h-land", ...card }], user });
  const action = legalActionsForPlayer(s0, "user").find((a) => a.cardId === "h-land" && a.kind === "play-land");
  if (!action) throw new Error(`no play-land offered for ${card.name}`);
  const s = finalizeStackResolution(dispatchAction(s0, action));
  return { s, perm: s.players.user.battlefield.find((p) => p.card.name === card.name) };
}
/** Put `card` onto the user's battlefield from the graveyard (a non-cast entry: the enters and landfall checks run). */
function putFromGraveyard(card, user = []) {
  const s0 = board({ user, graveyard: [{ id: "g-card", ...card }] });
  const r = enterCardFromZone(s0, { playerId: "user", cardId: "g-card", fromZone: "graveyard" });
  if (!r.entered) throw new Error(`${card.name} did not enter`);
  return r.state;
}
const activations = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const abilityTexts = (s, permId) => [...new Set(activations(s, permId).map((a) => a.abilityText))];
const equipTargets = (s, permId) => activations(s, permId).filter((a) => a.isEquipAbility).map((a) => a.targets[0].id).sort();
const tapsFor = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === permId);
const pendingFrom = (s, name) => (s.pendingTriggers || []).filter((t) => t.source?.name === name);
const ids = (targets) => targets.map((t) => t.id).sort();

// ─── 1 · keywords ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("1 · a front face has only its own keywords (keywords.hasKeyword reads the face that is up)", () => {
  it("⭐ Westvale Abbey, played as the land drop, has none of Ormendahl's flying, lifelink, indestructible or haste", () => {
    const { s, perm } = playLand(ABBEY);
    const kws = ["Flying", "Lifelink", "Indestructible", "Haste"].filter((k) => permanentHasKeyword(s, perm.id, k));
    expect({ kws, indestructible: isIndestructible(perm, s), printed: hasKeyword(ABBEY, "Flying") }).toEqual({ kws: [], indestructible: false, printed: false });
  });

  it("⭐ Lunarch Veteran is no flier front face up (its back face, Luminous Phantom, flies)", () => {
    const s = board({ user: [P("lunarch", LUNARCH)] });
    expect(permanentHasKeyword(s, "lunarch", "Flying")).toBe(false);
  });

  it("CONTROL — a printed flier still flies, and a front face keeps the keyword it prints (Dorothea's flying)", () => {
    const s = board({ user: [P("serra", SERRA), P("dorothea", DOROTHEA)] });
    expect({ serra: permanentHasKeyword(s, "serra", "Flying"), vigilance: permanentHasKeyword(s, "serra", "Vigilance"), dorothea: permanentHasKeyword(s, "dorothea", "Flying") })
      .toEqual({ serra: true, vigilance: true, dorothea: true });
  });

  it("⭐ Solid Footing's printed-keyword gate reads the host's face that is up: Tangleclaw Werewolf has no vigilance (Fibrous Entangler's), a Serra Angel has", () => {
    const on = (host) => attachPermanent(board({ user: [P("host", host), P("aura", FOOTING)] }), { equipId: "aura", targetId: "host" });
    expect({ tangleclaw: !!assignsCombatDamageWithToughness(on(TANGLECLAW), "host"), serra: !!assignsCombatDamageWithToughness(on(SERRA), "host") })
      .toEqual({ tangleclaw: false, serra: true });
  });

  it("CONTROL — a split card keeps both halves' keywords outside the stack (CR 709.4c): Commit // Memory has aftermath", () => {
    expect({ aftermath: hasKeyword(COMMIT, "Aftermath"), sameObject: faceUpView(COMMIT) === COMMIT }).toEqual({ aftermath: true, sameObject: true });
  });

  it("CONTROL — Westvale Abbey still taps for {C} the turn it is played and offers its {T} token ability (a land is not summoning sick, CR 302.6)", () => {
    const { s, perm } = playLand(ABBEY, [P("f1", FOREST), P("f2", FOREST), P("f3", FOREST), P("f4", FOREST), P("f5", FOREST)]);
    expect(tapsFor(s, perm.id)).toHaveLength(1);
    expect(manaSources(s, "user").some((r) => r.permanentId === perm.id)).toBe(true);
    expect(abilityTexts(s, perm.id).some((t) => /Create a 1\/1/i.test(t || ""))).toBe(true);
  });

  it("⭐ Hostile Hostel taps for {C} the turn it is played (the sickness read took the back face's Creature off the combined line)", () => {
    const { s, perm } = playLand(HOSTEL);
    expect({ taps: tapsFor(s, perm.id).length, source: manaSources(s, "user").some((r) => r.permanentId === perm.id) }).toEqual({ taps: 1, source: true });
  });
});

// ─── 2 · activated abilities and the Equip offer ───────────────────────────────────────────────────────────────────

describe("2 · a front face offers only its own activated abilities, and the Equip offer asks cannotEquipNow", () => {
  it("⭐ Halvar, God of Battle offers no Equip (front face up it is a God, CR 712.8d); an ordinary Equipment still equips Halvar", () => {
    const s = board({ user: [P("halvar", HALVAR), P("bears", BEARS), P("bone", BONESPLITTER)], pool: 6 });
    expect(activations(s, "halvar").filter((a) => a.isEquipAbility)).toEqual([]);
    expect(equipTargets(s, "bone")).toEqual(["bears", "halvar"]);
  });

  it("⭐ Neglected Heirloom offers its own Equip {1} only — never Ashmouth Blade's Equip {3}", () => {
    const s = board({ user: [P("heirloom", HEIRLOOM), P("bears", BEARS)], pool: 6 });
    expect(abilityTexts(s, "heirloom")).toEqual(["Equip {1}"]);
  });

  it("⭐ Chalice of Life offers no \"Target player loses 5 life\"; Treasure Map no Treasure Cove draw; Jerren no Ormendahl sacrifice-draw", () => {
    const s = board({ user: [P("chalice", CHALICE), P("map", TREASURE_MAP), P("tre", { ...TREASURE, token: true }), P("jerren", JERREN), P("bears", BEARS)], pool: 6 });
    expect(abilityTexts(s, "chalice")).toEqual([]);
    expect(abilityTexts(s, "map").filter((t) => /draw/i.test(t || ""))).toEqual([]);
    const jerren = abilityTexts(s, "jerren");
    expect({ sacDraw: jerren.filter((t) => /draw a card/i.test(t || "")), lifelink: jerren.some((t) => /gains lifelink/i.test(t || "")) }).toEqual({ sacDraw: [], lifelink: true });
  });

  it("⭐ the Equip offer refuses what the resolver refuses (layers.cannotEquipNow): a crewed Rover Blades offers no Equip; uncrewed it does", () => {
    const s0 = board({ user: [P("rover", ROVER), P("bears", BEARS), P("giant", { ...BEARS, name: "Hill Giant", power: "3", toughness: "3" })], pool: 6 });
    expect(equipTargets(s0, "rover")).toEqual(["bears", "giant"]);
    const crew = legalActionsForPlayer(s0, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "rover");
    const crewed = dispatchAction(s0, crew);
    expect(equipTargets(crewed, "rover")).toEqual([]);
  });
});

// ─── 3 · triggers and statics ──────────────────────────────────────────────────────────────────────────────────────

describe("3 · a front face has only its own triggers and statics; a trigger's type scope reads the face that is up", () => {
  it("CONTROL — Soul Warden gains nothing when Westvale Abbey is played, and gains 1 when a creature enters", () => {
    const { s } = playLand(ABBEY, [P("warden", SOUL_WARDEN)]);
    expect({ life: s.players.user.life, pending: pendingFrom(s, "Soul Warden").length }).toEqual({ life: 40, pending: 0 });
    const s2 = putFromGraveyard(BEARS, [P("warden", SOUL_WARDEN)]);
    expect(pendingFrom(s2, "Soul Warden")).toHaveLength(1);
  });

  it("⭐ a look-back with no layer types answers by its face that is up (gameState.lastKnownIsCreature): a Westvale Abbey is no creature", () => {
    expect({ abbey: lastKnownIsCreature({ id: "gone", card: ABBEY }), bears: lastKnownIsCreature({ id: "gone", card: BEARS }) }).toEqual({ abbey: false, bears: true });
  });

  it("⭐ Treasure Map entering is no landfall (an artifact front face up); a Forest entering is (Lotus Cobra)", () => {
    expect(pendingFrom(putFromGraveyard(TREASURE_MAP, [P("cobra", COBRA)]), "Lotus Cobra")).toHaveLength(0);
    expect(pendingFrom(putFromGraveyard(FOREST, [P("cobra", COBRA)]), "Lotus Cobra")).toHaveLength(1);
  });

  it("⭐ Halvar entering is no artifact entering (Reckless Fireweaver); Bonesplitter is", () => {
    expect(pendingFrom(putFromGraveyard(HALVAR, [P("weaver", FIREWEAVER)]), "Reckless Fireweaver")).toHaveLength(0);
    expect(pendingFrom(putFromGraveyard(BONESPLITTER, [P("weaver", FIREWEAVER)]), "Reckless Fireweaver")).toHaveLength(1);
  });

  it("⭐ Dorothea entering is no enchantment entering (Ajani's Chosen); Glorious Anthem is", () => {
    expect(pendingFrom(putFromGraveyard(DOROTHEA, [P("chosen", AJANIS_CHOSEN)]), "Ajani's Chosen")).toHaveLength(0);
    expect(pendingFrom(putFromGraveyard(ANTHEM, [P("chosen", AJANIS_CHOSEN)]), "Ajani's Chosen")).toHaveLength(1);
  });

  it("⭐ Lambholt Elder dealing combat damage draws nothing (the draw is Silverpelt Werewolf's)", () => {
    const s0 = board({ user: [P("elder", LAMBHOLT)] });
    const s = resolveCombatDamage({ ...s0, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "elder", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect({ aiLife: s.players.ai.life, triggers: pendingFrom(s, LAMBHOLT.name).length }).toEqual({ aiLife: 39, triggers: 0 });
  });

  it("⭐ Bloodline Keeper gives other Vampires nothing (the +2/+2 is Lord of Lineage's); Liliana's Other Contract leaves its controller able to lose", () => {
    const s = board({ user: [P("keeper", KEEPER), P("hawk", NIGHTHAWK), P("contract", CONTRACT)] });
    expect({ p: permanentPower(s, "hawk"), t: permanentToughness(s, "hawk"), cantLose: playerCantLoseGame(s, "user") }).toEqual({ p: 2, t: 3, cantLose: false });
  });

  it("⭐ Duskwatch Recruiter makes no creature spell cheaper (the discount is Krallenhorde Howler's)", () => {
    const s = board({ hand: [{ id: "h-bears", ...BEARS }], user: [P("dusk", DUSKWATCH)], pool: 6 });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bears");
    expect({ generic: cast.cost.generic, G: cast.cost.G }).toEqual({ generic: 1, G: 1 });
  });

  it("⭐ Emet-Selch exiles nothing put into its controller's graveyard (the replacement is Hades, Sorcerer of Eld's)", () => {
    const s = moveCardToZone(board({ user: [P("emet", EMET), P("bears", BEARS)] }), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bears" });
    expect({ graveyard: s.players.user.graveyard.map((c) => c.name), exile: s.players.user.exile.map((c) => c.name) }).toEqual({ graveyard: ["Grizzly Bears"], exile: [] });
  });

  it("⭐ Heliod, the Radiant Dawn gives no flash (the permission is Heliod, the Warped Eclipse's): a creature can't be cast with a spell on the stack", () => {
    const s0 = board({ hand: [{ id: "h-bears", ...BEARS }], user: [P("heliod", HELIOD)], pool: 6 });
    const s = { ...s0, stack: [{ id: "st-1", kind: "ability", controller: "ai", payload: { resolver: "manual", params: {} }, source: { name: "Pending" } }] };
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-bears")).toEqual([]);
    expect(legalActionsForPlayer(s0, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bears")).toBe(true);
  });

  it("⭐ Tangleclaw Werewolf need not be blocked (combatEvasion's text read — the requirement is Fibrous Entangler's); Gaea's Protector must be", () => {
    expect({ tangleclaw: mustBeBlockedIfAble(TANGLECLAW), protector: mustBeBlockedIfAble(PROTECTOR) }).toEqual({ tangleclaw: false, protector: true });
  });

  it("CONTROL — a front face's own trigger still fires: Lunarch Veteran gains 1 when another creature enters", () => {
    const s = putFromGraveyard(BEARS, [P("lunarch", LUNARCH)]);
    expect(pendingFrom(s, LUNARCH.name)).toHaveLength(1);
  });
});

// ─── 4 · attach pools, the attach-to-self guard, the Enchant-land host, the legend rule, the graveyard ─────────────

describe("4 · the attach lanes, the state-based actions and the graveyard read the face that is up", () => {
  it("⭐ \"target Equipment you control\" (Captain America's Catch) lists Bonesplitter, not Halvar", () => {
    const s = board({ user: [P("cap", CAP), P("halvar", HALVAR), P("bone", BONESPLITTER)] });
    expect(ids(enumerateTargets(s, "user", { targetType: "equipmentYouControl" }))).toEqual(["bone"]);
  });

  it("⭐ the attach-to-self atom moves no object that is not an Equipment now (CR 701.3b): Halvar stays put, Bonesplitter attaches", () => {
    const s = board({ user: [P("cap", CAP), P("halvar", HALVAR), P("bone", BONESPLITTER)] });
    const atom = { op: "attach-to-self", targetType: "equipmentYouControl", optionalTarget: true };
    const onCap = (st) => st.players.user.battlefield.find((p) => p.id === "cap").attachments || [];
    expect(onCap(resolveAtom(s, atom, { controller: "user", sourceId: "cap", targets: [{ type: "permanent", id: "halvar" }] }))).toEqual([]);
    expect(onCap(resolveAtom(s, atom, { controller: "user", sourceId: "cap", targets: [{ type: "permanent", id: "bone" }] }))).toEqual(["bone"]);
  });

  it("⭐ \"target Aura or Equipment you control\" (Codsworth) lists Wild Growth and Bonesplitter, not Dorothea or Halvar", () => {
    const s = attachPermanent(board({ user: [P("forest", FOREST), P("wg", WILD_GROWTH), P("bone", BONESPLITTER), P("dorothea", DOROTHEA), P("halvar", HALVAR)] }), { equipId: "wg", targetId: "forest" });
    expect(ids(enumerateTargets(s, "user", { targetType: "auraOrEquipmentYouControl" }))).toEqual(["bone", "wg"]);
  });

  it("⭐ an Enchant-land Aura on a Treasure Map (an artifact front face up) is put into the graveyard (CR 704.5m); on a Forest it stays", () => {
    const onMap = checkAllStateBasedActions(attachPermanent(board({ user: [P("map", TREASURE_MAP), P("wg", WILD_GROWTH)] }), { equipId: "wg", targetId: "map" }));
    expect(onMap.players.user.graveyard.map((c) => c.name)).toEqual(["Wild Growth"]);
    const onForest = checkAllStateBasedActions(attachPermanent(board({ user: [P("forest", FOREST), P("wg", WILD_GROWTH)] }), { equipId: "wg", targetId: "forest" }));
    expect(onForest.players.user.battlefield.find((p) => p.id === "wg")?.attachedTo).toBe("forest");
  });

  it("⭐ the legend rule leaves two Westvale Abbeys alone (the front face is not legendary, CR 704.5j); two Halvars still meet it", () => {
    const abbeys = checkAllStateBasedActions(board({ user: [P("a1", ABBEY), P("a2", ABBEY)] }));
    expect(abbeys.players.user.battlefield.map((p) => p.id)).toEqual(["a1", "a2"]);
    const halvars = checkAllStateBasedActions(board({ user: [P("h1", HALVAR), P("h2", HALVAR)] }));
    expect(halvars.players.user.battlefield).toHaveLength(1);
  });

  it("⭐ a Westvale Abbey in a graveyard is a land card only (CR 712.8a): Boneyard Wurm, Tarmogoyf and Gnaw to the Bone's count", () => {
    const s = board({ user: [P("wurm", WURM), P("goyf", GOYF)], graveyard: [{ id: "g1", ...ABBEY }, { id: "g2", ...BEARS }] });
    expect({ wurm: permanentPower(s, "wurm"), goyf: permanentPower(s, "goyf"), gnaw: countForSpec(s, { controller: "user" }, { kind: "cardsInGraveyard", cardType: "creature" }) })
      .toEqual({ wurm: 1, goyf: 2, gnaw: 1 });
    const abbeyOnly = board({ user: [P("goyf", GOYF)], graveyard: [{ id: "g1", ...ABBEY }] });
    expect(permanentPower(abbeyOnly, "goyf")).toBe(1);
  });

  it("⭐ the graveyard conditions read the front face too (interveningIf): a lone Westvale Abbey is one card type and no creature card", () => {
    const s = board({ graveyard: [{ id: "g1", ...ABBEY }] });
    expect({
      delirium2: evaluateInterveningIf(s, "there are two or more card types among cards in your graveyard", "user"),
      creatureCard: evaluateInterveningIf(s, "there is a creature card in your graveyard", "user"),
      landCard: evaluateInterveningIf(s, "there is a land card in your graveyard", "user"),
    }).toEqual({ delirium2: false, creatureCard: false, landCard: true });
  });

  it("CONTROL — a split card in a graveyard has both halves' card types (CR 709.4c): Commit // Memory is an instant and a sorcery", () => {
    const s = board({ user: [P("goyf", GOYF)], graveyard: [{ id: "g1", ...COMMIT }] });
    expect(permanentPower(s, "goyf")).toBe(2);
    expect(evaluateInterveningIf(s, "there are two or more card types among cards in your graveyard", "user")).toBe(true);
  });
});

// ─── 5 · the mana model's cost payers ──────────────────────────────────────────────────────────────────────────────

describe("5 · a Westvale Abbey is no creature to sacrifice or tap for a mana cost (CONTROLS — already read face up at 72e05f63)", () => {
  it("Ashnod's Altar can't sacrifice a Westvale Abbey; it sacrifices a Grizzly Bears", () => {
    const sources = (bf) => manaSources(board({ user: bf }), "user").filter((r) => r.permanentId === "altar");
    expect({ abbey: sources([P("altar", ALTAR), P("abbey", ABBEY)]).length, bears: sources([P("altar", ALTAR), P("b", BEARS)]).length }).toEqual({ abbey: 0, bears: 1 });
  });

  it("Springleaf Drum can't tap a Westvale Abbey as its creature; it taps a Llanowar Elves", () => {
    const sources = (bf) => manaSources(board({ user: bf }), "user").filter((r) => r.permanentId === "drum");
    expect({ abbey: sources([P("drum", DRUM), P("abbey", ABBEY)]).length, elves: sources([P("drum", DRUM), P("e", ELVES)]).length }).toEqual({ abbey: 0, elves: 1 });
  });
});
