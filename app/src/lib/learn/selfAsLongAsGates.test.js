/**
 * selfAsLongAsGates.test.js — BLITZ CA-2: SELF-subject "as long as" conditionals — the second half of the
 * census #1 as-long-as vein (CA-1 landed the GROUP half). "[This creature] gets +X/+Y [and has <kw>…] as
 * long as <condition>" and the leading-order twin route through the SAME parseAsLongAsGate the CA-1 group
 * branch uses (one shared condition vocabulary — classifier credit and layers enforcement can never
 * diverge) and reduce through the SAME all-or-nothing emitGatedEffect (CR 611.3a/b live re-evaluation;
 * CR 613.4c layer-7c gated P/T; CR 613.1f layer-6 gated keywords). gateOn is stripped for the self lane
 * (the gate subject IS the affected permanent == the source).
 *
 * New gate kinds, each an exact PURE-STATE evaluator (plain zone/flag/ledger reads — no derived
 * characteristics, no event reconstruction): attacking (combat.attackers mirror of CA-1's notAttacking),
 * isEnchanted (Aura-attachment mirror of isEquipped), lifeAtLeast / opponentLifeAtMost (live life),
 * opponentCardsInHandAtMost / moreCardsInHandThanEachOpponent (hand lengths), opponentGraveyardAtLeast
 * (zone length), opponentPoisonAtLeast (the KW-POISON per-seat tally), spellsCastThisTurnAtLeast /
 * gainedLifeThisTurn / lostLifeThisTurn (the TRIG-CAST2 / LG-1 per-turn ledgers), enteredThisTurn
 * (perm.enteredOnTurn vs state.turn), opponentsControl board counts, planeswalker-TYPE control gates
 * ("a Liliana planeswalker" — a word-bounded type-line token), typed/subtype graveyard presence, the
 * cardsInHand hellbent floor (atMost 0), zero bands (no cards in your graveyard / no untapped lands /
 * no <name> counters on it), and countersOnSelf extensions (P/T-counter presence + threshold, named
 * presence, all-kinds total). Real oracle fixtures (bundled Scryfall, verified 2026-07-17 via
 * cardIndex.lookupCard).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, updatePermanentSafe, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ── Real-oracle carrier fixtures ────────────────────────────────────────────────────────────────────────
const ADANTO_VANGUARD = { id: "adv", name: "Adanto Vanguard", type: "Creature — Vampire Soldier", mana: "{1}{W}",
  power: "1", toughness: "1",
  oracle: "As long as this creature is attacking, it gets +2/+0.\nPay 4 life: This creature gains indestructible until end of turn." };
const KITESAIL_CORSAIR = { id: "ktc", name: "Kitesail Corsair", type: "Creature — Human Pirate", mana: "{1}{U}",
  power: "2", toughness: "1",
  oracle: "This creature has flying as long as it's attacking." };
const FAITHFUL_PIKEMASTER = { id: "fpm", name: "Faithful Pikemaster", type: "Creature — Dwarf Soldier", mana: "{1}{W}",
  power: "2", toughness: "1",
  oracle: "Flash\nAs long as it's your turn, this creature has first strike." };
const GIANT_TORTOISE = { id: "gto", name: "Giant Tortoise", type: "Creature — Turtle", mana: "{1}{U}",
  power: "1", toughness: "1",
  oracle: "This creature gets +0/+3 as long as it's untapped." };
const THRAN_GOLEM = { id: "thg", name: "Thran Golem", type: "Artifact Creature — Golem", mana: "{5}",
  power: "3", toughness: "3",
  oracle: "As long as this creature is enchanted, it gets +2/+2 and has flying, first strike, and trample." };
const FLEDGLING_OSPREY = { id: "flo", name: "Fledgling Osprey", type: "Creature — Bird", mana: "{1}{W}",
  power: "1", toughness: "3",
  oracle: "This creature has flying as long as it's enchanted." };
const DIVINITY_OF_PRIDE = { id: "dvp", name: "Divinity of Pride", type: "Creature — Spirit Avatar", mana: "{W/B}{W/B}{W/B}{W/B}{W/B}",
  power: "4", toughness: "4",
  oracle: "Flying, lifelink\nThis creature gets +4/+4 as long as you have 25 or more life." };
const SERRA_ASCENDANT = { id: "sas", name: "Serra Ascendant", type: "Creature — Human Monk", mana: "{W}",
  power: "1", toughness: "1",
  oracle: "Lifelink\nAs long as you have 30 or more life, this creature gets +5/+5 and has flying." };
const RUTHLESS_CULLBLADE = { id: "rcb", name: "Ruthless Cullblade", type: "Creature — Vampire Warrior", mana: "{1}{B}",
  power: "2", toughness: "1",
  oracle: "This creature gets +2/+1 as long as an opponent has 10 or less life." };
const DEMONS_JESTER = { id: "dmj", name: "Demon's Jester", type: "Creature — Imp", mana: "{2}{B}",
  power: "2", toughness: "1",
  oracle: "Flying\nHellbent — This creature gets +2/+1 as long as you have no cards in hand." };
const AKKI_UNDERLING = { id: "aku", name: "Akki Underling", type: "Creature — Goblin Warrior", mana: "{1}{R}",
  power: "1", toughness: "2",
  oracle: "As long as you have seven or more cards in hand, this creature gets +2/+1 and has first strike." };
const GUUL_DRAZ_SPECTER = { id: "gds", name: "Guul Draz Specter", type: "Creature — Specter", mana: "{2}{B}{B}",
  power: "2", toughness: "2",
  oracle: "Flying\nThis creature gets +3/+3 as long as an opponent has no cards in hand.\nWhenever this creature deals combat damage to a player, that player discards a card." };
const OKINA_NIGHTWATCH = { id: "onw", name: "Okina Nightwatch", type: "Creature — Human Monk", mana: "{3}{G}",
  power: "3", toughness: "2",
  oracle: "As long as you have more cards in hand than each opponent, this creature gets +3/+3." };
const JACES_PHANTASM = { id: "jph", name: "Jace's Phantasm", type: "Creature — Illusion", mana: "{U}",
  power: "1", toughness: "1",
  oracle: "Flying\nThis creature gets +4/+4 as long as an opponent has ten or more cards in their graveyard." };
const BONEPICKER_SKIRGE = { id: "bps", name: "Bonepicker Skirge", type: "Creature — Phyrexian Imp", mana: "{1}{B}",
  power: "2", toughness: "1",
  oracle: "Flying\nCorrupted — As long as an opponent has three or more poison counters, this creature has deathtouch and lifelink." };
const VIRIDIAN_BETRAYERS = { id: "vbt", name: "Viridian Betrayers", type: "Creature — Phyrexian Human Warrior", mana: "{2}{G}",
  power: "3", toughness: "2",
  oracle: "This creature has infect as long as an opponent is poisoned." };
const BRIGHTSPEAR_ZEALOT = { id: "bsz", name: "Brightspear Zealot", type: "Creature — Human Knight", mana: "{W}",
  power: "1", toughness: "1",
  oracle: "This creature gets +2/+0 as long as you've cast two or more spells this turn." };
const ULNA_ALLEY_SHOPKEEP = { id: "uas", name: "Ulna Alley Shopkeep", type: "Creature — Skeleton Citizen", mana: "{B}",
  power: "1", toughness: "1",
  oracle: "Infusion — This creature gets +2/+0 as long as you gained life this turn." };
const ESSENCE_CHANNELER = { id: "esc", name: "Essence Channeler", type: "Creature — Human Cleric", mana: "{W}",
  power: "1", toughness: "1",
  oracle: "As long as you've lost life this turn, this creature has flying and vigilance.\nWhen this creature dies, put its counters on target creature you control." };
const CREW_CAPTAIN = { id: "crc", name: "Crew Captain", type: "Creature — Human Pilot", mana: "{R}",
  power: "1", toughness: "1",
  oracle: "This creature has indestructible as long as it entered this turn." };
const WU_ADMIRAL = { id: "wua", name: "Wu Admiral", type: "Creature — Human Soldier", mana: "{3}{U}",
  power: "3", toughness: "3",
  oracle: "This creature gets +1/+1 as long as an opponent controls an Island." };
const ARISEN_GORGON = { id: "ags", name: "Arisen Gorgon", type: "Creature — Zombie Gorgon", mana: "{1}{B}{B}",
  power: "3", toughness: "3",
  oracle: "This creature has deathtouch as long as you control a Liliana planeswalker." };
const MURASA_BEHEMOTH = { id: "mbh", name: "Murasa Behemoth", type: "Creature — Elemental", mana: "{5}{G}",
  power: "5", toughness: "4",
  oracle: "This creature gets +3/+3 as long as there is a land card in your graveyard." };
const GORILLA_TITAN = { id: "gti", name: "Gorilla Titan", type: "Creature — Ape", mana: "{2}{G}{G}",
  power: "4", toughness: "4",
  oracle: "Trample\nThis creature gets +4/+4 as long as there are no cards in your graveyard." };
const SPUR_GRAPPLER = { id: "spg", name: "Spur Grappler", type: "Creature — Kavu", mana: "{2}{R}",
  power: "2", toughness: "2",
  oracle: "This creature gets +2/+1 as long as you control no untapped lands." };
const LIGHTWALKER = { id: "lwk", name: "Lightwalker", type: "Creature — Human Soldier Ally", mana: "{1}{W}",
  power: "2", toughness: "1",
  oracle: "This creature has flying as long as it has a +1/+1 counter on it." };
const THUNDERBLUST = { id: "tbl", name: "Thunderblust", type: "Creature — Elemental", mana: "{3}{R}{R}",
  power: "7", toughness: "2",
  oracle: "Haste\nThis creature has trample as long as it has a -1/-1 counter on it.\nPersist" };
const MYOJIN_NIGHT = { id: "myn", name: "Myojin of Night's Reach", type: "Legendary Creature — Spirit", mana: "{5}{B}{B}{B}",
  power: "5", toughness: "2",
  oracle: "This creature enters with a divinity counter on it if you cast it from your hand.\nMyojin of Night's Reach has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Night's Reach: Each opponent discards their hand." };
const WARDEN_INNER_SKY = { id: "wis", name: "Warden of the Inner Sky", type: "Creature — Human Soldier", mana: "{W}",
  power: "1", toughness: "2",
  oracle: "As long as this creature has three or more counters on it, it has flying and vigilance.\n{3}, Tap three untapped artifacts, creatures, and/or lands you control: Put a +1/+1 counter on this creature. Scry 1." };
const VOICE_OF_THE_BLESSED = { id: "vob", name: "Voice of the Blessed", type: "Creature — Spirit Cleric", mana: "{1}{W}",
  power: "2", toughness: "2",
  oracle: "Whenever you gain life, put a +1/+1 counter on this creature.\nAs long as this creature has four or more +1/+1 counters on it, it has flying and vigilance.\nAs long as this creature has ten or more +1/+1 counters on it, it has indestructible." };
const GATE_HOUND = { id: "gth", name: "Gate Hound", type: "Creature — Dog", mana: "{2}{W}",
  power: "1", toughness: "3",
  oracle: "Creatures you control have vigilance as long as this creature is enchanted." };
const SCORPION_SENTINEL = { id: "scs", name: "Scorpion Sentinel", type: "Creature — Scorpion", mana: "{1}{B}",
  power: "1", toughness: "4",
  oracle: "As long as you control seven or more lands, this creature gets +3/+0." };

// FN-guard fixtures — recognized family shapes whose condition (or effect rider) has no exact evaluator.
const SKYMARCHER_ASPIRANT = { id: "sma", name: "Skymarcher Aspirant", type: "Creature — Vampire Soldier", mana: "{W}",
  power: "2", toughness: "1",
  oracle: "This creature has flying as long as you have the city's blessing." };
// ⭐ MOVED OUT OF THE FN-GUARD LIST 2026-08-05 — the monstrous state IS modelled now (a `monstrous` gate
// reading the latch applyMonstrosity sets; see monstrousGate.test.js for the drive through the real atom).
// It stays here as a POSITIVE pin so this file records that the boundary moved rather than silently losing
// the case: an FN-guard list that quietly drops entries stops being a record of what the engine refuses.
const CHILLERPILLAR = { id: "chp", name: "Chillerpillar", type: "Snow Creature — Caterpillar", mana: "{3}{U}",
  power: "2", toughness: "4",
  oracle: "{4}{S}: Monstrosity 2.\nAs long as this creature is monstrous, it has flying." };
const MESSENGER_HAWK = { id: "mhk", name: "Messenger Hawk", type: "Creature — Bird", mana: "{2}{W}",
  power: "2", toughness: "2",
  oracle: "Flying\nThis creature gets +2/+0 as long as you've drawn two or more cards this turn." };
const BRIARBERRY_COHORT = { id: "bbc", name: "Briarberry Cohort", type: "Creature — Faerie Soldier", mana: "{1}{U}",
  power: "2", toughness: "1",
  oracle: "Flying\nThis creature gets +1/+1 as long as you control another blue creature." };
const IYMRITH = { id: "iym", name: "Iymrith, Desert Doom", type: "Legendary Creature — Dragon", mana: "{3}{U}{U}",
  power: "5", toughness: "5",
  oracle: "Flying\nIymrith has ward {4} as long as it's untapped.\nWhenever Iymrith deals combat damage to a player, draw a card, then draw cards equal to the amount of mana from Ancient Silver Dragon's ability." };
const SLIPPERY_SCOUNDREL = { id: "ssc", name: "Slippery Scoundrel", type: "Creature — Human Pirate", mana: "{2}{U}",
  power: "2", toughness: "2",
  oracle: "As long as you have the city's blessing, this creature has hexproof and can't be blocked." };
const HAVI = { id: "hav", name: "Havi, the All-Father", type: "Legendary Creature — God", mana: "{3}{W}{B}",
  power: "4", toughness: "4",
  oracle: "Havi has indestructible as long as there are four or more historic cards in your graveyard." };
const SOLITARY_CAMEL = { id: "soc", name: "Solitary Camel", type: "Creature — Camel", mana: "{2}{B}",
  power: "3", toughness: "2",
  oracle: "This creature has lifelink as long as you control a Desert or there is a Desert card in your graveyard." };
const BLOOD_BARON = { id: "bbv", name: "Blood Baron of Vizkopa", type: "Creature — Vampire", mana: "{3}{W}{B}",
  power: "4", toughness: "4",
  oracle: "Lifelink, protection from white and from black\nAs long as you have 30 or more life and an opponent has 10 or less life, this creature gets +6/+6 and has flying." };
const SKYKNIGHT_SQUIRE = { id: "sks", name: "Skyknight Squire", type: "Creature — Human Soldier", mana: "{1}{W}",
  power: "1", toughness: "2",
  oracle: "As long as this creature has three or more +1/+1 counters on it, it has flying and is a Knight in addition to its other types." };
const SARDIAN_CLIFFSTOMPER = { id: "scl", name: "Sardian Cliffstomper", type: "Creature — Giant", mana: "{1}{R}",
  power: "0", toughness: "4",
  oracle: "As long as it's your turn and you control four or more Mountains, this creature gets +X/+0, where X is the number of Mountains you control." };
const LEAPFROG = { id: "lpf", name: "Leapfrog", type: "Creature — Frog", mana: "{1}{U}",
  power: "3", toughness: "1",
  oracle: "This creature has flying as long as you've cast an instant or sorcery spell this turn." };

// ── Bare fixtures + state helpers ───────────────────────────────────────────────────────────────────────
const PLAIN = { id: "pc", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const AURA = { id: "aur", name: "Plain Veil", type: "Enchantment — Aura", mana: "{W}", oracle: "" };
const SWORD = { id: "swd", name: "Plain Sword", type: "Artifact — Equipment", mana: "{1}", oracle: "" };
const LILIANA = { id: "lil", name: "Liliana, Death Mage", type: "Legendary Planeswalker — Liliana", mana: "{2}{B}{B}", oracle: "" };
const JACE_PW = { id: "jpw", name: "Jace, Mind Mage", type: "Legendary Planeswalker — Jace", mana: "{2}{U}", oracle: "" };
const ISLAND = { id: "isl", name: "Island", type: "Basic Land — Island", oracle: "" };
const MOUNTAIN = (id) => ({ id, name: `Mountain ${id}`, type: "Basic Land — Mountain", oracle: "" });
const CARD = (n) => ({ name: `Yard Card ${n}`, type: "Sorcery" });
const LAND_CARD = { name: "Yard Forest", type: "Basic Land — Forest" };

function boardOf(...perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const perm = (card, over = {}) => ({ ...createPermanent({ id: card.id, card, controller: "user", summoningSick: false }), ...over });
const aiPerm = (card, over = {}) => ({ ...createPermanent({ id: card.id, card, controller: "ai1", summoningSick: false }), ...over });
const withUser = (s, patch) => ({ ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } });
const withAi = (s, patch) => ({ ...s, players: { ...s.players, ai1: { ...s.players.ai1, ...patch } } });

// ── Recognition (classify) — real oracles flip; the whole-card law holds ────────────────────────────────
describe("CA-2 — recognition on real oracle", () => {
  it("pure self-gated statics flip native-static", () => {
    for (const card of [KITESAIL_CORSAIR, GIANT_TORTOISE, THRAN_GOLEM, FLEDGLING_OSPREY, DIVINITY_OF_PRIDE,
      SERRA_ASCENDANT, RUTHLESS_CULLBLADE, DEMONS_JESTER, AKKI_UNDERLING, OKINA_NIGHTWATCH, JACES_PHANTASM,
      BONEPICKER_SKIRGE, VIRIDIAN_BETRAYERS, BRIGHTSPEAR_ZEALOT, ULNA_ALLEY_SHOPKEEP, CREW_CAPTAIN,
      WU_ADMIRAL, ARISEN_GORGON, MURASA_BEHEMOTH, GORILLA_TITAN, SPUR_GRAPPLER, LIGHTWALKER,
      SCORPION_SENTINEL, GATE_HOUND, FAITHFUL_PIKEMASTER]) {
      expect(classifyCard(card), card.name).toBe("native-static");
    }
  });
  it("self-gated clause + other modeled abilities flip native-mixed", () => {
    expect(classifyCard(ADANTO_VANGUARD)).toBe("native-mixed");   // + modeled pay-life activated grant
    expect(classifyCard(GUUL_DRAZ_SPECTER)).toBe("native-mixed"); // + combat-damage discard trigger
    expect(classifyCard(VOICE_OF_THE_BLESSED)).toBe("native-mixed"); // + gain-life counter trigger
  });
});

// ── LIVE flips — BOTH directions, per gate family ───────────────────────────────────────────────────────
describe("CA-2 — attacking gate flips LIVE at declaration and when combat clears (Adanto Vanguard)", () => {
  it("+2/+0 only while THIS creature is a declared attacker; a teammate attacking does nothing", () => {
    const s = boardOf(perm(ADANTO_VANGUARD), perm(PLAIN));
    expect(permanentPower(s, "adv")).toBe(1);
    const attacking = { ...s, combat: { attackers: [{ permanentId: "adv", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(permanentPower(attacking, "adv")).toBe(3);            // declared → +2/+0
    expect(permanentPower(attacking, "pc")).toBe(2);             // SELF scope: the teammate is never buffed
    const teammateAttacks = { ...s, combat: { attackers: [{ permanentId: "pc", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(permanentPower(teammateAttacks, "adv")).toBe(1);      // gate reads SELF, not "any attacker"
    const cleared = { ...attacking, combat: { attackers: [], blockers: [] } };
    expect(permanentPower(cleared, "adv")).toBe(1);              // combat over → gate re-closes
  });
  it("the keyword twin (Kitesail Corsair's flying) rides the same gate at the keyword seam", () => {
    const s = boardOf(perm(KITESAIL_CORSAIR));
    expect(permanentHasKeyword(s, "ktc", "Flying")).toBe(false);
    const attacking = { ...s, combat: { attackers: [{ permanentId: "ktc", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(permanentHasKeyword(attacking, "ktc", "Flying")).toBe(true);
  });
});

describe("CA-2 — your-turn phrasing ('as long as it's your turn') reuses the DT-1 evaluator (Faithful Pikemaster)", () => {
  it("first strike exactly while the controller is the active player", () => {
    const s = boardOf(perm(FAITHFUL_PIKEMASTER));
    expect(permanentHasKeyword({ ...s, activePlayer: "user" }, "fpm", "First strike")).toBe(true);
    expect(permanentHasKeyword({ ...s, activePlayer: "ai1" }, "fpm", "First strike")).toBe(false);
  });
});

describe("CA-2 — untapped contraction ('as long as it's untapped') — Giant Tortoise", () => {
  it("+0/+3 while untapped; tapping drops it; untapping restores it", () => {
    const s = boardOf(perm(GIANT_TORTOISE, { tapped: false }));
    expect(permanentToughness(s, "gto")).toBe(4);
    const tapped = updatePermanentSafe(s, "gto", p => ({ ...p, tapped: true }));
    expect(permanentToughness(tapped, "gto")).toBe(1);
    const untapped = updatePermanentSafe(tapped, "gto", p => ({ ...p, tapped: false }));
    expect(permanentToughness(untapped, "gto")).toBe(4);
  });
});

describe("CA-2 — isEnchanted gate (Thran Golem / Fledgling Osprey) flips with Aura attachment", () => {
  it("Thran Golem: +2/+2 and the full keyword list only while an Aura is attached; an Equipment does NOT open it", () => {
    const s = boardOf(perm(THRAN_GOLEM), perm(AURA), perm(SWORD));
    expect(permanentPower(s, "thg")).toBe(3);
    expect(permanentHasKeyword(s, "thg", "Trample")).toBe(false);
    const equipped = updatePermanentSafe(s, "swd", p => ({ ...p, attachedTo: "thg" }));
    expect(permanentPower(equipped, "thg")).toBe(3);             // equipped ≠ enchanted (CR 303.4 vs 301.5)
    const enchanted = updatePermanentSafe(s, "aur", p => ({ ...p, attachedTo: "thg" }));
    expect(permanentPower(enchanted, "thg")).toBe(5);
    expect(permanentHasKeyword(enchanted, "thg", "Flying")).toBe(true);
    expect(permanentHasKeyword(enchanted, "thg", "First strike")).toBe(true);
    expect(permanentHasKeyword(enchanted, "thg", "Trample")).toBe(true);
    const detached = updatePermanentSafe(enchanted, "aur", p => ({ ...p, attachedTo: null }));
    expect(permanentPower(detached, "thg")).toBe(3);             // Aura gone → gate re-closes
  });
  it("Fledgling Osprey's flying rides the same gate; an Aura on ANOTHER creature does not open it", () => {
    const s = boardOf(perm(FLEDGLING_OSPREY), perm(PLAIN), perm(AURA));
    const wrongHost = updatePermanentSafe(s, "aur", p => ({ ...p, attachedTo: "pc" }));
    expect(permanentHasKeyword(wrongHost, "flo", "Flying")).toBe(false);
    const enchanted = updatePermanentSafe(s, "aur", p => ({ ...p, attachedTo: "flo" }));
    expect(permanentHasKeyword(enchanted, "flo", "Flying")).toBe(true);
  });
});

describe("CA-2 — life-total gates read LIVE life (Divinity of Pride / Serra Ascendant / Ruthless Cullblade)", () => {
  it("Divinity of Pride: +4/+4 at 25 life, gone at 24, back at 25", () => {
    const s = boardOf(perm(DIVINITY_OF_PRIDE));
    expect(permanentPower(withUser(s, { life: 25 }), "dvp")).toBe(8);
    expect(permanentPower(withUser(s, { life: 24 }), "dvp")).toBe(4);
    expect(permanentPower(withUser(s, { life: 25 }), "dvp")).toBe(8);
  });
  it("Serra Ascendant: the 30-band carries both the P/T and the flying grant together", () => {
    const s = boardOf(perm(SERRA_ASCENDANT));
    const rich = withUser(s, { life: 40 });
    expect(permanentPower(rich, "sas")).toBe(6);
    expect(permanentHasKeyword(rich, "sas", "Flying")).toBe(true);
    const poor = withUser(s, { life: 29 });
    expect(permanentPower(poor, "sas")).toBe(1);
    expect(permanentHasKeyword(poor, "sas", "Flying")).toBe(false);
  });
  it("Ruthless Cullblade reads OPPONENTS' life — never the controller's own", () => {
    const s = boardOf(perm(RUTHLESS_CULLBLADE));
    expect(permanentPower(withAi(s, { life: 10 }), "rcb")).toBe(4);   // an opponent at 10 → open
    expect(permanentPower(withAi(s, { life: 11 }), "rcb")).toBe(2);   // all opponents above 10 → closed
    expect(permanentPower(withUser(withAi(s, { life: 11 }), { life: 5 }), "rcb")).toBe(2); // MY low life is not "an opponent"
  });
});

describe("CA-2 — hand-size gates (hellbent floor / seven-band / opponent-empty / more-than-each)", () => {
  it("Demon's Jester (Hellbent label stripped): +2/+1 exactly at zero cards in hand", () => {
    const s = boardOf(perm(DEMONS_JESTER));
    expect(permanentPower(withUser(s, { hand: [] }), "dmj")).toBe(4);
    expect(permanentPower(withUser(s, { hand: [CARD(1)] }), "dmj")).toBe(2);
  });
  it("Akki Underling: the seven-or-more band flips at the boundary, P/T + first strike together", () => {
    const s = boardOf(perm(AKKI_UNDERLING));
    const at7 = withUser(s, { hand: Array.from({ length: 7 }, (_, i) => CARD(i)) });
    expect(permanentPower(at7, "aku")).toBe(3);
    expect(permanentHasKeyword(at7, "aku", "First strike")).toBe(true);
    const at6 = withUser(s, { hand: Array.from({ length: 6 }, (_, i) => CARD(i)) });
    expect(permanentPower(at6, "aku")).toBe(1);
    expect(permanentHasKeyword(at6, "aku", "First strike")).toBe(false);
  });
  it("Guul Draz Specter: ANY opponent with an empty hand opens the gate; mine doesn't count", () => {
    const s = boardOf(perm(GUUL_DRAZ_SPECTER));
    const oppEmpty = withUser(withAi(s, { hand: [] }), { hand: [CARD(1)] });
    expect(permanentPower(oppEmpty, "gds")).toBe(5);
    // ALL opponents holding cards → closed, even with MY hand empty (self-hand is not "an opponent").
    let allHold = withUser(s, { hand: [] });
    for (const pid of Object.keys(allHold.players)) {
      if (pid !== "user") allHold = { ...allHold, players: { ...allHold.players, [pid]: { ...allHold.players[pid], hand: [CARD(9)] } } };
    }
    expect(permanentPower(allHold, "gds")).toBe(2);
  });
  it("Okina Nightwatch: strictly MORE than EACH opponent — a tie with any single opponent closes it", () => {
    const s = boardOf(perm(OKINA_NIGHTWATCH));
    const ahead = withAi(withUser(s, { hand: [CARD(1), CARD(2)] }), { hand: [CARD(3)] });
    expect(permanentPower(ahead, "onw")).toBe(6);                // 2 > 1 (and > every other opponent's 0)
    const tied = withAi(withUser(s, { hand: [CARD(1)] }), { hand: [CARD(3)] });
    expect(permanentPower(tied, "onw")).toBe(3);                 // 1 > 1 fails → closed
  });
});

describe("CA-2 — opponent graveyard / poison gates (Jace's Phantasm / Bonepicker Skirge / Viridian Betrayers)", () => {
  it("Jace's Phantasm: an OPPONENT's 10-card graveyard opens it; my own graveyard never does", () => {
    const s = boardOf(perm(JACES_PHANTASM));
    const myYard = withUser(s, { graveyard: Array.from({ length: 10 }, (_, i) => CARD(i)) });
    expect(permanentPower(myYard, "jph")).toBe(1);               // own graveyard is not "an opponent's"
    const oppYard = withAi(s, { graveyard: Array.from({ length: 10 }, (_, i) => CARD(i)) });
    expect(permanentPower(oppYard, "jph")).toBe(5);
    const oppYard9 = withAi(s, { graveyard: Array.from({ length: 9 }, (_, i) => CARD(i)) });
    expect(permanentPower(oppYard9, "jph")).toBe(1);             // below ten → closed
  });
  it("Corrupted (Bonepicker Skirge): deathtouch+lifelink at three opponent poison, off at two", () => {
    const s = boardOf(perm(BONEPICKER_SKIRGE));
    expect(permanentHasKeyword(withAi(s, { poison: 3 }), "bps", "Deathtouch")).toBe(true);
    expect(permanentHasKeyword(withAi(s, { poison: 3 }), "bps", "Lifelink")).toBe(true);
    expect(permanentHasKeyword(withAi(s, { poison: 2 }), "bps", "Deathtouch")).toBe(false);
  });
  it("Viridian Betrayers: 'is poisoned' = one or more poison counters", () => {
    const s = boardOf(perm(VIRIDIAN_BETRAYERS));
    expect(permanentHasKeyword(withAi(s, { poison: 1 }), "vbt", "infect")).toBe(true);
    expect(permanentHasKeyword(withAi(s, { poison: 0 }), "vbt", "infect")).toBe(false);
  });
});

describe("CA-2 — per-turn ledger gates (spells cast / life gained / life lost)", () => {
  it("Brightspear Zealot: +2/+0 at two spells cast this turn, off at one (the TRIG-CAST2 ledger)", () => {
    const s = boardOf(perm(BRIGHTSPEAR_ZEALOT));
    expect(permanentPower(withUser(s, { spellsCastThisTurn: 2 }), "bsz")).toBe(3);
    expect(permanentPower(withUser(s, { spellsCastThisTurn: 1 }), "bsz")).toBe(1);
  });
  it("Ulna Alley Shopkeep (Infusion label stripped): the LG-1 lifeGainedThisTurn ledger", () => {
    const s = boardOf(perm(ULNA_ALLEY_SHOPKEEP));
    expect(permanentPower(withUser(s, { lifeGainedThisTurn: 3 }), "uas")).toBe(3);
    expect(permanentPower(withUser(s, { lifeGainedThisTurn: 0 }), "uas")).toBe(1);
  });
  it("Essence Channeler: flying+vigilance exactly while lifeLostThisTurn ≥ 1", () => {
    const s = boardOf(perm(ESSENCE_CHANNELER));
    expect(permanentHasKeyword(withUser(s, { lifeLostThisTurn: 2 }), "esc", "Flying")).toBe(true);
    expect(permanentHasKeyword(withUser(s, { lifeLostThisTurn: 2 }), "esc", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(withUser(s, { lifeLostThisTurn: 0 }), "esc", "Flying")).toBe(false);
  });
});

describe("CA-2 — enteredThisTurn gate (Crew Captain): the entry stamp vs the live turn counter", () => {
  it("indestructible on the entry turn; gone the next turn", () => {
    const s = boardOf(perm(CREW_CAPTAIN, { enteredOnTurn: 3 }));
    expect(permanentHasKeyword({ ...s, turn: 3 }, "crc", "indestructible")).toBe(true);
    expect(permanentHasKeyword({ ...s, turn: 4 }, "crc", "indestructible")).toBe(false);
  });
});

describe("CA-2 — opponent-controls and planeswalker-type board gates", () => {
  it("Wu Admiral: an OPPONENT's Island opens it; my own Island does not", () => {
    const s = boardOf(perm(WU_ADMIRAL), perm(ISLAND));
    expect(permanentPower(s, "wua")).toBe(3);                    // my Island is not "an opponent controls"
    const oppIsland = withAi(s, { battlefield: [aiPerm(ISLAND)] });
    expect(permanentPower(oppIsland, "wua")).toBe(4);
    expect(permanentPower(withAi(oppIsland, { battlefield: [] }), "wua")).toBe(3); // Island leaves → re-closes
  });
  it("Arisen Gorgon: deathtouch only with a LILIANA planeswalker — another planeswalker type does not count", () => {
    const s = boardOf(perm(ARISEN_GORGON), perm(JACE_PW));
    expect(permanentHasKeyword(s, "ags", "Deathtouch")).toBe(false); // a Jace is not a Liliana
    const withLil = boardOf(perm(ARISEN_GORGON), perm(LILIANA));
    expect(permanentHasKeyword(withLil, "ags", "Deathtouch")).toBe(true);
  });
});

describe("CA-2 — typed graveyard presence + the zero bands", () => {
  it("Murasa Behemoth: a land CARD in the graveyard (a sorcery does not open the typed gate)", () => {
    const s = boardOf(perm(MURASA_BEHEMOTH));
    expect(permanentPower(withUser(s, { graveyard: [CARD(1)] }), "mbh")).toBe(5);       // sorcery ≠ land card
    expect(permanentPower(withUser(s, { graveyard: [LAND_CARD] }), "mbh")).toBe(8);     // land card → +3/+3
    expect(permanentPower(withUser(s, { graveyard: [] }), "mbh")).toBe(5);              // empties → re-closes
  });
  it("Gorilla Titan: the EMPTY-graveyard band (+4/+4 at zero cards, off at one)", () => {
    const s = boardOf(perm(GORILLA_TITAN));
    expect(permanentPower(withUser(s, { graveyard: [] }), "gti")).toBe(8);
    expect(permanentPower(withUser(s, { graveyard: [CARD(1)] }), "gti")).toBe(4);
  });
  it("Spur Grappler: the no-untapped-lands band — tapping the last land opens it, untapping closes it", () => {
    const m = MOUNTAIN("mt1");
    const s = boardOf(perm(SPUR_GRAPPLER), perm(m, { tapped: false }));
    expect(permanentPower(s, "spg")).toBe(2);                    // an untapped land → closed
    const allTapped = updatePermanentSafe(s, "mt1", p => ({ ...p, tapped: true }));
    expect(permanentPower(allTapped, "spg")).toBe(4);            // no untapped lands → +2/+1
    const landless = boardOf(perm(SPUR_GRAPPLER));
    expect(permanentPower(landless, "spg")).toBe(4);             // zero lands also satisfies "no untapped lands"
  });
});

describe("CA-2 — countersOnSelf extensions (presence / -1-1 twin / named / all-kinds total / threshold)", () => {
  it("Lightwalker: flying with any +1/+1 counter, gone when the pile empties", () => {
    const s = boardOf(perm(LIGHTWALKER, { counters: { "+1/+1": 1 } }));
    expect(permanentHasKeyword(s, "lwk", "Flying")).toBe(true);
    const none = boardOf(perm(LIGHTWALKER, { counters: {} }));
    expect(permanentHasKeyword(none, "lwk", "Flying")).toBe(false);
  });
  it("Thunderblust: the -1/-1 presence twin (persist's counter turns trample ON)", () => {
    const s = boardOf(perm(THUNDERBLUST, { counters: { "-1/-1": 1 } }));
    expect(permanentHasKeyword(s, "tbl", "Trample")).toBe(true);
    const none = boardOf(perm(THUNDERBLUST, { counters: {} }));
    expect(permanentHasKeyword(none, "tbl", "Trample")).toBe(false);
  });
  it("Myojin of Night's Reach: named divinity presence — indestructible while the counter remains (runtime models the clause even though the card's other lines keep it body-only)", () => {
    const s = boardOf(perm(MYOJIN_NIGHT, { counters: { divinity: 1 } }));
    expect(permanentHasKeyword(s, "myn", "indestructible")).toBe(true);
    const spent = boardOf(perm(MYOJIN_NIGHT, { counters: { divinity: 0 } }));
    expect(permanentHasKeyword(spent, "myn", "indestructible")).toBe(false);
    expect(classifyCard(MYOJIN_NIGHT)).toBe("body-only");        // whole-card law: the conditional ETB + the sac-activated line still park it
  });
  it("Warden of the Inner Sky: the ALL-KINDS total (two +1/+1 and one charge = three counters)", () => {
    const mixed = boardOf(perm(WARDEN_INNER_SKY, { counters: { "+1/+1": 2, charge: 1 } }));
    expect(permanentHasKeyword(mixed, "wis", "Flying")).toBe(true);
    expect(permanentHasKeyword(mixed, "wis", "Vigilance")).toBe(true);
    const two = boardOf(perm(WARDEN_INNER_SKY, { counters: { "+1/+1": 2 } }));
    expect(permanentHasKeyword(two, "wis", "Flying")).toBe(false);
  });
  it("Voice of the Blessed: the four-band and ten-band open independently as the pile grows", () => {
    const at4 = boardOf(perm(VOICE_OF_THE_BLESSED, { counters: { "+1/+1": 4 } }));
    expect(permanentHasKeyword(at4, "vob", "Flying")).toBe(true);
    expect(permanentHasKeyword(at4, "vob", "indestructible")).toBe(false);
    const at10 = boardOf(perm(VOICE_OF_THE_BLESSED, { counters: { "+1/+1": 10 } }));
    expect(permanentHasKeyword(at10, "vob", "indestructible")).toBe(true);
    const at3 = boardOf(perm(VOICE_OF_THE_BLESSED, { counters: { "+1/+1": 3 } }));
    expect(permanentHasKeyword(at3, "vob", "Flying")).toBe(false);
  });
});

// ── SCOPE PINS — self vs group non-interference ─────────────────────────────────────────────────────────
describe("CA-2 — scope pins: a self-gated card emits SELF descriptors only; the group twin stays per-source", () => {
  it("every gated descriptor of the self carriers has affects.mode 'self'", () => {
    for (const card of [ADANTO_VANGUARD, GIANT_TORTOISE, THRAN_GOLEM, DIVINITY_OF_PRIDE, DEMONS_JESTER,
      JACES_PHANTASM, BRIGHTSPEAR_ZEALOT, CREW_CAPTAIN, WU_ADMIRAL, ARISEN_GORGON, MURASA_BEHEMOTH,
      SPUR_GRAPPLER, LIGHTWALKER, SCORPION_SENTINEL]) {
      const gated = parseStaticAbilities(card).filter(d => d.op?.gate);
      expect(gated.length, card.name).toBeGreaterThan(0);
      for (const d of gated) {
        expect(d.affects?.mode, `${card.name}: gated descriptor must be SELF`).toBe("self");
        expect(d.op.gate.gateOn, `${card.name}: self gate carries no gateOn`).toBeUndefined();
      }
    }
  });
  it("Gate Hound (the GROUP twin of isEnchanted): source-enchanted buffs OTHERS; enchanting a teammate does nothing", () => {
    const gated = parseStaticAbilities(GATE_HOUND).filter(d => d.op?.gate);
    expect(gated.length).toBeGreaterThan(0);
    for (const d of gated) {
      expect(d.affects?.mode).toBe("dynamic");                   // group selector, never self
      expect(d.op.gate.gateOn).toBe("source");                   // reads the DOG's enchanted state
    }
    const s = boardOf(perm(GATE_HOUND), perm(PLAIN), perm(AURA));
    expect(permanentHasKeyword(s, "pc", "Vigilance")).toBe(false);
    const wrongHost = updatePermanentSafe(s, "aur", p => ({ ...p, attachedTo: "pc" }));
    expect(permanentHasKeyword(wrongHost, "pc", "Vigilance")).toBe(false); // teammate enchanted ≠ the Dog
    const dogEnchanted = updatePermanentSafe(s, "aur", p => ({ ...p, attachedTo: "gth" }));
    expect(permanentHasKeyword(dogEnchanted, "pc", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(dogEnchanted, "gth", "Vigilance")).toBe(true); // "creatures you control" includes the Dog
  });
  it("Scorpion Sentinel: the word-number quant ('seven or more lands') the pre-CA-2 self lanes could not spell", () => {
    const lands = (n) => Array.from({ length: n }, (_, i) => perm(MOUNTAIN(`m${i}`)));
    const at7 = boardOf(perm(SCORPION_SENTINEL), ...lands(7));
    expect(permanentPower(at7, "scs")).toBe(4);
    const at6 = boardOf(perm(SCORPION_SENTINEL), ...lands(6));
    expect(permanentPower(at6, "scs")).toBe(1);
  });
});

// ── FN guards — no exact evaluator (or an unconsumed effect rider) → NOTHING emitted ────────────────────
describe("CA-2 — a guard that GRADUATED: monstrous is modelled now", () => {
  it("⭐ Briarberry Cohort graduated — and its 'another' is what needed the care", () => {
    // Guard note said "a derived-characteristic color count". The colour read is PRINTED, not derived
    // (the documented colour-OR precedent), which is what makes it recursion-safe inside a gate eval.
    // The real hazard was "ANOTHER": the Cohort is itself blue, so without excludeSelf it satisfies its
    // own gate alone on the battlefield. Driven in colorControlGate.test.js.
    expect(parseStaticAbilities(BRIARBERRY_COHORT)[0].op.gate.countSpec.excludeSelf).toBe(true);
  });

  it("⭐ Messenger Hawk graduated too — and its guard note was FACTUALLY WRONG, not merely stale", () => {
    // It read "no drawn-cards-this-turn ledger exists". gameState has carried `cardsDrawnThisTurn` all
    // along — one increment chokepoint, reset for every seat at untap. The note turned a gap into a
    // decision nobody re-examined, and ten cards sat behind it. Drive: cardsDrawnGate.test.js.
    expect(parseStaticAbilities(MESSENGER_HAWK).map((e) => `${e.op?.layerOp}|${e.op?.gate?.kind}`))
      .toEqual(["ptModifyGated|cardsDrawnThisTurnAtLeast"]);
  });

  it("⭐ Chillerpillar was an FN-guard fixture here and is now a positive pin", () => {
    // Kept rather than deleted: this file is the record of what the engine refuses, so an entry that
    // graduates should show as graduated. The drive through the real monstrosity atom lives in
    // monstrousGate.test.js; here we only assert the boundary moved.
    expect(parseStaticAbilities(CHILLERPILLAR).map((e) => `${e.op?.keyword}|${e.op?.gate?.kind}`))
      .toEqual(["Flying|monstrous"]);
  });
});

describe("CA-2 — FN guards: unevaluable conditions / unconsumed riders emit NOTHING", () => {
  const parked = [
    // Skymarcher Aspirant GRADUATED (shelf D5, 2026-09-30 — the city's blessing is modeled; ascendCitysBlessing.test.js).
    ["a flying-as-long-as twin on the initiative (a designation still unmodeled)", { ...SKYMARCHER_ASPIRANT, id: "sma-i", name: "Initiative Aspirant", oracle: "This creature has flying as long as you have the initiative." }],
    ["Iymrith ('ward {4}' is not a grantable keyword)", IYMRITH],
    ["Slippery Scoundrel (city's blessing + a can't-be-blocked rider)", SLIPPERY_SCOUNDREL],
    ["Havi ('historic cards' — a defined characteristic no type-line test evaluates)", HAVI],
    ["Solitary Camel (an OR-compound condition)", SOLITARY_CAMEL],
    ["Blood Baron of Vizkopa (an AND-compound condition)", BLOOD_BARON],
    ["Skyknight Squire (an 'is a Knight in addition' type-add rider)", SKYKNIGHT_SQUIRE],
    ["Sardian Cliffstomper (compound condition + X-magnitude effect)", SARDIAN_CLIFFSTOMPER],
    ["Leapfrog (no TYPED cast ledger — spellsCastThisTurn counts all spells)", LEAPFROG],
  ];
  for (const [label, card] of parked) {
    it(`${label} stays body-only with zero gated descriptors`, () => {
      expect(classifyCard(card)).toBe("body-only");
      const gated = parseStaticAbilities(card).filter(d => d.op?.gate);
      expect(gated).toHaveLength(0);
    });
  }
});
