/**
 * conditionGatedAnthem.test.js — BLITZ CA-1: CONDITION-GATED GROUP ANTHEMS. The "as long as <board
 * condition>" static P/T family SF-1/GA-1 parked behind the static-only "as long as" bail. The condition
 * becomes a serializable GATE (staticAbilityParser.parseAsLongAsGate) that layers.gateMet re-evaluates
 * LIVE at every P/T derive and keyword read (CR 611.3a — a static's continuous effect is never locked in;
 * CR 613.4c layer 7c for the P/T, CR 613.1f layer 6 for gated keyword tails). Two scopes, kept distinct:
 *   • PER-SOURCE gates carry gateOn:"source" (layers.gatePermForEffect swaps the gate subject to the
 *     anthem's SOURCE): graveyard counts (Divine Sacrament), board counts (Jor Kadeen / Jetmir / Weapons
 *     Trainer), source-equipped (Raksha Golden Cub), source-untapped (Juniper Order Advocate), source
 *     counter piles (Beastmaster Ascension), hand size (Neheb, the Worthy), the exactly-one-creature band
 *     (Homicidal Seclusion / Deadly Wanderings).
 *   • PER-CANDIDATE gates read the AFFECTED creature: {kind:"notAttacking"} (Arcades Sabboth).
 * Every condition is a PURE state read (graveyard/battlefield arrays, tapped flags, combat.attackers,
 * counter piles, hand length) — no derived characteristics, no event history → no derive re-entry.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-17 via cardIndex.lookupCard).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, updatePermanentSafe, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ── Real-oracle carrier fixtures ────────────────────────────────────────────────────────────────────────
const DIVINE_SACRAMENT = { id: "dsa", name: "Divine Sacrament", type: "Enchantment", mana: "{2}{W}{W}",
  oracle: "White creatures get +1/+1.\nThreshold — White creatures get an additional +1/+1 as long as there are seven or more cards in your graveyard." };
const SILVER_SERAPH = { id: "ssr", name: "Silver Seraph", type: "Creature — Angel", mana: "{6}{W}{W}",
  power: "6", toughness: "6",
  oracle: "Flying\nThreshold — Other creatures you control get +2/+2 as long as there are seven or more cards in your graveyard." };
const JOR_KADEEN = { id: "jrk", name: "Jor Kadeen, the Prevailer", type: "Legendary Creature — Human Warrior", mana: "{3}{R}{W}",
  power: "5", toughness: "4",
  oracle: "First strike\nMetalcraft — Creatures you control get +3/+0 as long as you control three or more artifacts." };
const WEAPONS_TRAINER = { id: "wtr", name: "Weapons Trainer", type: "Creature — Human Soldier Ally", mana: "{R}{W}",
  power: "3", toughness: "2",
  oracle: "Other creatures you control get +1/+0 as long as you control an Equipment." };
const JETMIR = { id: "jet", name: "Jetmir, Nexus of Revels", type: "Legendary Creature — Cat Demon", mana: "{1}{R}{G}{W}",
  power: "5", toughness: "4",
  oracle: "Creatures you control get +1/+0 and have vigilance as long as you control three or more creatures.\nCreatures you control also get +1/+0 and have trample as long as you control six or more creatures.\nCreatures you control also get +1/+0 and have double strike as long as you control nine or more creatures." };
const RAKSHA = { id: "rk", name: "Raksha Golden Cub", type: "Legendary Creature — Cat Soldier", mana: "{4}{W}{W}",
  power: "3", toughness: "4",
  oracle: "Vigilance\nAs long as Raksha Golden Cub is equipped, Cat creatures you control get +2/+2 and have double strike." };
const JUNIPER = { id: "jun", name: "Juniper Order Advocate", type: "Creature — Human Knight", mana: "{2}{W}",
  power: "1", toughness: "2",
  oracle: "As long as this creature is untapped, green creatures you control get +1/+1." };
const ARCADES_SABBOTH = { id: "arc", name: "Arcades Sabboth", type: "Legendary Creature — Elder Dragon", mana: "{2}{G}{W}{U}",
  power: "7", toughness: "7",
  oracle: "Flying\nAt the beginning of your upkeep, sacrifice Arcades Sabboth unless you pay {G}{W}{U}.\nEach untapped creature you control gets +0/+2 as long as it's not attacking.\n{W}: Arcades Sabboth gets +0/+1 until end of turn." };
const HOMICIDAL_SECLUSION = { id: "hms", name: "Homicidal Seclusion", type: "Enchantment", mana: "{4}{B}",
  oracle: "As long as you control exactly one creature, that creature gets +3/+1 and has lifelink." };
const DEADLY_WANDERINGS = { id: "dwa", name: "Deadly Wanderings", type: "Enchantment", mana: "{2}{B}",
  oracle: "As long as you control exactly one creature, that creature gets +2/+0 and has deathtouch and lifelink." };
const EARTH_SURGE = { id: "esu", name: "Earth Surge", type: "Enchantment", mana: "{3}{G}",
  oracle: "Each land gets +2/+2 as long as it's a creature." };
const BEASTMASTER_ASCENSION = { id: "bma", name: "Beastmaster Ascension", type: "Enchantment", mana: "{2}{G}",
  oracle: "Whenever a creature you control attacks, you may put a quest counter on this enchantment.\nAs long as this enchantment has seven or more quest counters on it, creatures you control get +5/+5." };
const NEHEB = { id: "nhb", name: "Neheb, the Worthy", type: "Legendary Creature — Minotaur Warrior", mana: "{1}{B}{R}",
  power: "2", toughness: "2",
  oracle: "First strike\nOther Minotaurs you control have first strike.\nAs long as you have one or fewer cards in hand, Minotaurs you control get +2/+0.\nWhenever Neheb deals combat damage to a player, each player discards a card." };

// FN-guard fixtures — recognized family shapes whose CONDITION has no exact evaluator (each parks whole).
const COMMON_CAUSE = { id: "cmc", name: "Common Cause", type: "Enchantment", mana: "{3}{W}",
  oracle: "Nonartifact creatures get +2/+2 as long as they all share a color." };
const CALL_TO_ARMS = { id: "cta", name: "Call to Arms", type: "Enchantment", mana: "{1}{W}",
  oracle: "As this enchantment enters, choose a color and an opponent.\nWhite creatures get +1/+1 as long as the chosen color is the most common color among nontoken permanents the chosen player controls but isn't tied for most common.\nWhen the chosen color isn't the most common color among nontoken permanents the chosen player controls or is tied for most common, sacrifice this enchantment." };
const JIHAD = { id: "jhd", name: "Jihad", type: "Enchantment", mana: "{W}{W}{W}",
  oracle: "As this enchantment enters, choose a color and an opponent.\nWhite creatures get +2/+1 as long as the chosen player controls a nontoken permanent of the chosen color.\nWhen the chosen player controls no nontoken permanents of the chosen color, sacrifice this enchantment." };
const ANGELIC_VOICES = { id: "avo", name: "Angelic Voices", type: "Enchantment", mana: "{3}{W}",
  oracle: "Creatures you control get +1/+1 as long as you control no nonartifact, nonwhite creatures." };
const WATCHDOG = { id: "wdg", name: "Watchdog", type: "Artifact Creature — Dog", mana: "{3}",
  power: "1", toughness: "2",
  oracle: "As long as this creature is untapped, all creatures attacking you get -1/-0." };
const DEPALA = { id: "dpl", name: "Depala, Pilot Exemplar", type: "Legendary Creature — Dwarf Pilot", mana: "{1}{R}{W}",
  power: "3", toughness: "3",
  oracle: "Other Dwarves you control get +1/+1.\nEach Vehicle you control gets +1/+1 as long as it's a creature.\nWhenever Depala, Pilot Exemplar attacks, you may pay {X}. If you do, reveal the top X cards of your library. Put all Dwarf and Vehicle cards from among them into your hand and the rest on the bottom of your library in a random order." };
const SOARING_THOUGHT_THIEF = { id: "stt", name: "Soaring Thought-Thief", type: "Creature — Human Rogue", mana: "{U}{B}",
  power: "1", toughness: "3",
  oracle: "Flash\nFlying\nAs long as an opponent has eight or more cards in their graveyard, Rogues you control get +1/+0.\nWhenever one or more Rogues you control attack, each opponent mills two cards." };
const LIU_BEI = { id: "lbe", name: "Liu Bei, Lord of Shu", type: "Legendary Creature — Human Soldier", mana: "{3}{W}{W}",
  power: "2", toughness: "4",
  oracle: "Liu Bei gets +2/+2 as long as you control a permanent named Guan Yu, Sainted Warrior or a permanent named Zhang Fei, Fierce Warrior." };

// ── Bare fixtures ───────────────────────────────────────────────────────────────────────────────────────
const PLAIN = { id: "pc", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const PLAIN2 = { id: "pc2", name: "Runeclaw Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const WHITE = { id: "wc", name: "White Bear", type: "Creature — Bear", mana: "{2}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" };
const WHITE2 = { id: "wc2", name: "Opposing White Bear", type: "Creature — Bear", mana: "{2}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" };
const GREEN = { id: "gc", name: "Green Bear", type: "Creature — Bear", mana: "{2}{G}", colors: ["G"], power: "2", toughness: "2", oracle: "" };
const CAT = { id: "cat", name: "Leonin Bear", type: "Creature — Cat", mana: "{1}{W}", colors: ["W"], power: "2", toughness: "2", oracle: "" };
const MINOTAUR = { id: "min", name: "Plain Minotaur", type: "Creature — Minotaur", mana: "{2}{R}", colors: ["R"], power: "2", toughness: "3", oracle: "" };
const SWORD = { id: "swd", name: "Plain Sword", type: "Artifact — Equipment", mana: "{1}", oracle: "" };
const TRINKET = (id) => ({ id, name: `Trinket ${id}`, type: "Artifact", mana: "{1}", oracle: "" });
const DRYAD_ARBOR = { id: "dry", name: "Dryad Arbor", type: "Land Creature — Forest Dryad", colors: ["G"], power: "1", toughness: "1", oracle: "" };
const CARD = (n) => ({ name: `Yard Card ${n}`, type: "Sorcery" });

function boardOf(...perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const perm = (card, over = {}) => ({ ...createPermanent({ id: card.id, card, controller: "user", summoningSick: false }), ...over });
const aiPerm = (card, over = {}) => ({ ...createPermanent({ id: card.id, card, controller: "ai1", summoningSick: false }), ...over });
const withUserGraveyard = (s, n) => ({ ...s, players: { ...s.players, user: { ...s.players.user, graveyard: Array.from({ length: n }, (_, i) => CARD(i)) } } });
const withAiBattlefield = (s, perms) => ({ ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: perms } } });

// ── Recognition (classify) — real oracles flip; the whole-card law holds ────────────────────────────────
describe("CA-1 — recognition on real oracle", () => {
  it("per-source gated anthems flip native-static", () => {
    expect(classifyCard(DIVINE_SACRAMENT)).toBe("native-static");
    expect(classifyCard(SILVER_SERAPH)).toBe("native-static");
    expect(classifyCard(JOR_KADEEN)).toBe("native-static");
    expect(classifyCard(WEAPONS_TRAINER)).toBe("native-static");
    expect(classifyCard(JETMIR)).toBe("native-static");
    expect(classifyCard(RAKSHA)).toBe("native-static");
    expect(classifyCard(JUNIPER)).toBe("native-static");
    expect(classifyCard(HOMICIDAL_SECLUSION)).toBe("native-static");
    expect(classifyCard(DEADLY_WANDERINGS)).toBe("native-static");
    expect(classifyCard(EARTH_SURGE)).toBe("native-static");
  });
  it("gated anthem + modeled trigger cards flip native-mixed", () => {
    expect(classifyCard(BEASTMASTER_ASCENSION)).toBe("native-mixed");
    expect(classifyCard(NEHEB)).toBe("native-mixed");
  });
});

// ── LIVE condition flip — BOTH directions, per gate family ──────────────────────────────────────────────
describe("CA-1 — graveyard gate flips LIVE at the threshold boundary (Divine Sacrament)", () => {
  it("6 cards → base anthem only; 7 → the additional +1/+1; back under → drops", () => {
    const base = boardOf(perm(DIVINE_SACRAMENT), perm(WHITE), perm(PLAIN));
    const at6 = withUserGraveyard(base, 6);
    expect(permanentPower(at6, "wc")).toBe(3);        // flat "White creatures get +1/+1" only
    expect(permanentPower(at6, "pc")).toBe(2);        // nonwhite → untouched by both
    const at7 = withUserGraveyard(base, 7);
    expect(permanentPower(at7, "wc")).toBe(4);        // threshold open → +1/+1 more (2+1+1)
    expect(permanentToughness(at7, "wc")).toBe(4);
    expect(permanentPower(at7, "pc")).toBe(2);
    const backTo6 = withUserGraveyard(at7, 6);
    expect(permanentPower(backTo6, "wc")).toBe(3);    // gate re-closes on the new state
  });
});

describe("CA-1 — board-count gate flips LIVE (Jor Kadeen metalcraft; Weapons Trainer Equipment)", () => {
  it("Jor Kadeen: +3/+0 appears at the 3rd artifact and vanishes when one leaves", () => {
    const at2 = boardOf(perm(JOR_KADEEN), perm(PLAIN), perm(TRINKET("t1")), perm(TRINKET("t2")));
    expect(permanentPower(at2, "pc")).toBe(2);        // 2 artifacts → gate closed
    const at3 = boardOf(perm(JOR_KADEEN), perm(PLAIN), perm(TRINKET("t1")), perm(TRINKET("t2")), perm(TRINKET("t3")));
    expect(permanentPower(at3, "pc")).toBe(5);        // metalcraft on → +3/+0
    expect(permanentPower(at3, "jrk")).toBe(8);       // "Creatures you control" includes Jor Kadeen himself
    const backTo2 = { ...at3, players: { ...at3.players, user: { ...at3.players.user, battlefield: at3.players.user.battlefield.filter(p => p.id !== "t3") } } };
    expect(permanentPower(backTo2, "pc")).toBe(2);    // 3rd artifact gone → gate re-closes
  });
  it("Weapons Trainer: 'an Equipment' opens at one, excludes the source itself from the buff", () => {
    const no = boardOf(perm(WEAPONS_TRAINER), perm(PLAIN));
    expect(permanentPower(no, "pc")).toBe(2);
    const yes = boardOf(perm(WEAPONS_TRAINER), perm(PLAIN), perm(SWORD));
    expect(permanentPower(yes, "pc")).toBe(3);        // Equipment present → other creatures +1/+0
    expect(permanentPower(yes, "wtr")).toBe(3);       // "Other" → the trainer itself is NOT buffed
  });
});

describe("CA-1 — source tap-state gate (Juniper Order Advocate) flips LIVE across tap/untap", () => {
  it("green creatures lose the buff the moment the SOURCE taps, regain it on untap", () => {
    const s = boardOf(perm(JUNIPER, { tapped: false }), perm(GREEN), perm(WHITE));
    expect(permanentPower(s, "gc")).toBe(3);          // source untapped → green +1/+1
    expect(permanentPower(s, "wc")).toBe(2);          // white → untouched (color filter)
    const tapped = updatePermanentSafe(s, "jun", p => ({ ...p, tapped: true }));
    expect(permanentPower(tapped, "gc")).toBe(2);     // SOURCE tapped → gate closed
    const untapped = updatePermanentSafe(tapped, "jun", p => ({ ...p, tapped: false }));
    expect(permanentPower(untapped, "gc")).toBe(3);   // back on
  });
});

describe("CA-1 — source counter-pile gate (Beastmaster Ascension) flips at the 7th quest counter", () => {
  it("6 counters → nothing; 7 → +5/+5 on the controller's creatures", () => {
    const at6 = boardOf(perm(BEASTMASTER_ASCENSION, { counters: { quest: 6 } }), perm(PLAIN));
    expect(permanentPower(at6, "pc")).toBe(2);
    const at7 = boardOf(perm(BEASTMASTER_ASCENSION, { counters: { quest: 7 } }), perm(PLAIN));
    expect(permanentPower(at7, "pc")).toBe(7);
    expect(permanentToughness(at7, "pc")).toBe(7);
  });
});

describe("CA-1 — hand-size gate (Neheb, the Worthy) reads the controller's LIVE hand", () => {
  it("2 cards in hand → closed; 1 → open; the anthem includes Neheb himself (no 'other')", () => {
    const base = boardOf(perm(NEHEB), perm(MINOTAUR), perm(PLAIN));
    const at2 = { ...base, players: { ...base.players, user: { ...base.players.user, hand: [CARD(1), CARD(2)] } } };
    expect(permanentPower(at2, "min")).toBe(2);
    const at1 = { ...base, players: { ...base.players, user: { ...base.players.user, hand: [CARD(1)] } } };
    expect(permanentPower(at1, "min")).toBe(4);       // hellbent-adjacent gate open → Minotaurs +2/+0
    expect(permanentPower(at1, "nhb")).toBe(4);       // Neheb is a Minotaur → buffed too
    expect(permanentPower(at1, "pc")).toBe(2);        // non-Minotaur → untouched
  });
});

// ── SCOPE SPLIT — per-candidate vs per-source-controller, pinned apart ──────────────────────────────────
describe("CA-1 — scope split: PER-CANDIDATE notAttacking gate (Arcades Sabboth)", () => {
  it("of two untapped creatures, ONLY the declared attacker loses the +0/+2 — simultaneously", () => {
    const s = boardOf(perm(ARCADES_SABBOTH), perm(PLAIN, { tapped: false }), perm(PLAIN2, { tapped: false }));
    expect(permanentToughness(s, "pc")).toBe(4);      // untapped, not attacking → +0/+2
    expect(permanentToughness(s, "pc2")).toBe(4);
    // Declare pc an attacker WITHOUT tapping it (the vigilance case SF-1 could not express: untapped AND
    // attacking). The per-candidate gate closes for pc alone; pc2 keeps the buff on the SAME state.
    const combat = { ...s, combat: { attackers: [{ permanentId: "pc", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect(permanentToughness(combat, "pc")).toBe(2);   // attacking → gate closed for THIS candidate
    expect(permanentToughness(combat, "pc2")).toBe(4);  // not attacking → still buffed
    const cleared = { ...combat, combat: { attackers: [], blockers: [] } };
    expect(permanentToughness(cleared, "pc")).toBe(2 + 2); // combat over → buff returns
  });
  it("a TAPPED non-attacker gets nothing (the untapped selector still gates)", () => {
    const s = boardOf(perm(ARCADES_SABBOTH), perm(PLAIN, { tapped: true }));
    expect(permanentToughness(s, "pc")).toBe(2);
  });
});

describe("CA-1 — scope split: PER-SOURCE-CONTROLLER graveyard gate (Divine Sacrament)", () => {
  it("MY 7-card graveyard buffs EVERY player's white creatures; the OPPONENT's graveyard never opens it", () => {
    const base = withAiBattlefield(boardOf(perm(DIVINE_SACRAMENT), perm(WHITE)), [aiPerm(WHITE2)]);
    // Opponent has 7 cards in THEIR graveyard; the source controller has 0 → gate CLOSED (it reads "your
    // graveyard" = the enchantment controller's, via gateOn:"source" — never the candidate's controller's).
    const oppYard = { ...base, players: { ...base.players, ai1: { ...base.players.ai1, graveyard: Array.from({ length: 7 }, (_, i) => CARD(i)) } } };
    expect(permanentPower(oppYard, "wc")).toBe(3);    // flat +1/+1 only
    expect(permanentPower(oppYard, "wc2")).toBe(3);   // global anthem reaches the opponent's white creature too
    // NOW the source controller's graveyard crosses seven → the gate opens for BOTH players' white creatures.
    const myYard = withUserGraveyard(base, 7);
    expect(permanentPower(myYard, "wc")).toBe(4);
    expect(permanentPower(myYard, "wc2")).toBe(4);    // per-SOURCE gate, per-CANDIDATE reach
  });
});

describe("CA-1 — gated KEYWORD tail reads the SOURCE at the keyword seam (Raksha Golden Cub)", () => {
  it("an UNequipped cat gains double strike while RAKSHA is equipped — and not vice versa", () => {
    const bare = boardOf(perm(RAKSHA), perm(CAT), perm(SWORD));
    // Sword attached to the CAT (not Raksha): the gate reads RAKSHA's equipped state → closed.
    const catEquipped = updatePermanentSafe(bare, "swd", p => ({ ...p, attachedTo: "cat" }));
    expect(permanentPower(catEquipped, "cat")).toBe(2);
    expect(permanentHasKeyword(catEquipped, "cat", "Double strike")).toBe(false);
    // Sword attached to RAKSHA: every Cat (the unequipped one included, Raksha herself included) flips on.
    const rakshaEquipped = updatePermanentSafe(bare, "swd", p => ({ ...p, attachedTo: "rk" }));
    expect(permanentPower(rakshaEquipped, "cat")).toBe(4);          // +2/+2
    expect(permanentToughness(rakshaEquipped, "cat")).toBe(4);
    expect(permanentHasKeyword(rakshaEquipped, "cat", "Double strike")).toBe(true);
    expect(permanentPower(rakshaEquipped, "rk")).toBe(5);           // Raksha is a Cat → buffs herself
    expect(permanentHasKeyword(rakshaEquipped, "rk", "Double strike")).toBe(true);
  });
});

describe("CA-1 — tiered thresholds stack independently (Jetmir)", () => {
  it("3 creatures → +1/+0 & vigilance; 6 → +2/+0 & trample too; 2 → nothing", () => {
    const two = boardOf(perm(JETMIR), perm(PLAIN));
    expect(permanentPower(two, "pc")).toBe(2);
    expect(permanentHasKeyword(two, "pc", "Vigilance")).toBe(false);
    const three = boardOf(perm(JETMIR), perm(PLAIN), perm(PLAIN2));
    expect(permanentPower(three, "pc")).toBe(3);                    // first band only
    expect(permanentHasKeyword(three, "pc", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(three, "pc", "Trample")).toBe(false);
    const six = boardOf(perm(JETMIR), perm(PLAIN), perm(PLAIN2),
      perm({ ...WHITE }), perm({ ...GREEN }), perm({ ...CAT }));
    expect(permanentPower(six, "pc")).toBe(4);                      // +1 and also +1 (two bands open)
    expect(permanentHasKeyword(six, "pc", "Trample")).toBe(true);
    expect(permanentHasKeyword(six, "pc", "Double strike")).toBe(false); // nine-band still closed
  });
});

describe("CA-1 — exactly-one band (Homicidal Seclusion): closed at zero, open at one, closed at two", () => {
  it("the lone creature gets +3/+1 and lifelink; a second creature shuts the whole gate", () => {
    const one = boardOf(perm(HOMICIDAL_SECLUSION), perm(PLAIN));
    expect(permanentPower(one, "pc")).toBe(5);
    expect(permanentToughness(one, "pc")).toBe(3);
    expect(permanentHasKeyword(one, "pc", "Lifelink")).toBe(true);
    const twoCreatures = boardOf(perm(HOMICIDAL_SECLUSION), perm(PLAIN), perm(PLAIN2));
    expect(permanentPower(twoCreatures, "pc")).toBe(2);             // exactly-one violated → no buff at all
    expect(permanentHasKeyword(twoCreatures, "pc", "Lifelink")).toBe(false);
    expect(permanentHasKeyword(twoCreatures, "pc2", "Lifelink")).toBe(false);
  });
});

describe("CA-1 — animated-land anthem (Earth Surge): the type condition IS the selector", () => {
  it("a Land Creature gets +2/+2; a plain (non-Land) creature is untouched", () => {
    const s = boardOf(perm(EARTH_SURGE), perm(DRYAD_ARBOR), perm(PLAIN));
    expect(permanentPower(s, "dry")).toBe(3);         // Land AND Creature → +2/+2
    expect(permanentToughness(s, "dry")).toBe(3);
    expect(permanentPower(s, "pc")).toBe(2);          // Creature but not Land → AND-gate excludes
  });
});

// ── FN guards — recognized family shapes whose condition has NO exact evaluator park WHOLE ──────────────
describe("CA-1 — FN guards: unevaluable conditions emit NOTHING (whole-card park)", () => {
  const parked = [
    ["Common Cause (they all share a color — reads every creature's derived colors)", COMMON_CAUSE],
    ["Call to Arms (chosen color/opponent + most-common-with-tie computation)", CALL_TO_ARMS],
    ["Jihad (chosen color/opponent)", JIHAD],
    ["Angelic Voices (universal-negative compound filter)", ANGELIC_VOICES],
    ["Watchdog ('attacking you' defender scope unmodeled)", WATCHDOG],
    ["Depala ('as long as it's a creature' on Vehicles — crew unmodeled)", DEPALA],
    ["Soaring Thought-Thief (an OPPONENT's graveyard — exists-quantifier unmodeled)", SOARING_THOUGHT_THIEF],
    ["Liu Bei (named-permanent condition)", LIU_BEI],
  ];
  for (const [label, card] of parked) {
    it(`${label} stays body-only with zero gated descriptors`, () => {
      expect(classifyCard(card)).toBe("body-only");
      const gated = parseStaticAbilities(card).filter(s => s.op?.gate || s.op?.layerOp === "ptModifyGated");
      expect(gated).toHaveLength(0);
    });
  }
});
