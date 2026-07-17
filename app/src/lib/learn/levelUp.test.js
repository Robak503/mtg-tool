/**
 * levelUp.test.js — BLITZ LV-1: the LEVEL UP subsystem (CR 702.87 + CR 711, verified against
 * knowledge/mtg-judge/data/cr/cr_current.json 2026-07-16).
 *
 *   702.87a  "Level up [cost]" = "[Cost]: Put a level counter on this permanent. Activate only
 *            as a sorcery." — modeled by rewriting the frame to exactly that text and parsing it
 *            through the standard activated-ability lane (the add-named-counter-self atom).
 *   711.2a/b Each {LEVEL N1-N2} / {LEVEL N3+} symbol is a STATIC ability: base P/T set (layer 7b)
 *            + granted abilities, active only while N1 <= level counters <= N2 (open bands have
 *            no upper bound). Emitted as level-counter-gated statics (gateMet atLeast/atMost).
 *   711.5    Below the first band's N1 the creature has its printed (uppermost) P/T.
 *   711.4    Abilities outside every band are normal always-on abilities.
 *
 * WHOLE-CARD-OR-PARK (THE CREED): a leveler is native ONLY when the level-up cost, every band's
 * P/T box, every band keyword (closed GRANTABLE_STATIC_KEYWORDS vocabulary), and every band
 * activated line are ALL modeled. One unmodeled band line ⇒ modeledLeveler null ⇒ the runtime
 * emits NOTHING (no level-up offer, no band statics — the pre-slice vanilla body) and the metric
 * keeps the card body-only.
 *
 * Real oracle fixtures (bundled Scryfall oracle_cards.json, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseLeveler, parseBandKeywordLine, isLevelerFrame } from "./leveler.js";
import { parseActivatedAbilities, modeledLeveler } from "./effects/abilities.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { hasKeyword } from "./keywords.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";
import { serializeState, deserializeState } from "./serialization.js";

beforeEach(() => _resetIdsForTests());

// ─── Real oracle fixtures ────────────────────────────────────────────────────────────────────

const STUDENT = {
  id: "sow", name: "Student of Warfare", type: "Creature — Human Knight", mana: "{W}",
  power: "1", toughness: "1", keywords: ["First strike", "Double strike", "Level up"],
  oracle: "Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-6\n3/3\nFirst strike\nLEVEL 7+\n4/4\nDouble strike",
};
const BRIMSTONE = {
  id: "bm", name: "Brimstone Mage", type: "Creature — Human Shaman", mana: "{2}{R}",
  power: "2", toughness: "2", keywords: ["Level up"],
  oracle: "Level up {3}{R} ({3}{R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n2/3\n{T}: This creature deals 1 damage to any target.\nLEVEL 3+\n2/4\n{T}: This creature deals 3 damage to any target.",
};
const TRANSCENDENT = {
  name: "Transcendent Master", type: "Creature — Human Cleric Avatar", mana: "{1}{W}{W}",
  power: "3", toughness: "3", keywords: ["Lifelink", "Indestructible", "Level up"],
  oracle: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 6-11\n6/6\nLifelink\nLEVEL 12+\n9/9\nLifelink, indestructible",
};
const KARGAN = {
  name: "Kargan Dragonlord", type: "Creature — Human Warrior", mana: "{R}{R}",
  power: "2", toughness: "2", keywords: ["Flying", "Trample", "Level up"],
  oracle: "Level up {R} ({R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 4-7\n4/4\nFlying\nLEVEL 8+\n8/8\nFlying, trample\n{R}: This creature gets +1/+0 until end of turn.",
};
// Parks — each carries one honestly-unmodelable band piece:
const HALIMAR = { // islandwalk is not a grantable keyword the engine enforces
  name: "Halimar Wavewatch", type: "Creature — Merfolk Soldier", mana: "{1}{U}", power: "0", toughness: "3",
  keywords: ["Islandwalk", "Level up"],
  oracle: "Level up {2} ({2}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-4\n0/6\nLEVEL 5+\n6/6\nIslandwalk (This creature can't be blocked as long as defending player controls an Island.)",
};
const ZULAPORT = { // "can't be blocked except by black creatures" — an unmodeled band static
  name: "Zulaport Enforcer", type: "Creature — Human Warrior", mana: "{B}", power: "1", toughness: "1",
  oracle: "Level up {4} ({4}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n3/3\nLEVEL 3+\n5/5\nThis creature can't be blocked except by black creatures.",
};
// Kabira Vindicator (banded GROUP anthem) FLIPPED in BLITZ SG-1 — its source-gated band anthem is now
// modeled; the whole-card + runtime pins live in sourceGatedAnthem.test.js.
const ECHO_MAGE = { // banded copy-spell activated ability — the effect doesn't parse modeled
  name: "Echo Mage", type: "Creature — Human Wizard", mana: "{1}{U}{U}", power: "2", toughness: "3",
  oracle: "Level up {1}{U} ({1}{U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n2/4\n{U}{U}, {T}: Copy target instant or sorcery spell. You may choose new targets for the copy.\nLEVEL 4+\n2/5\n{U}{U}, {T}: Copy target instant or sorcery spell twice. You may choose new targets for the copies.",
};
const JORAGA = { // banded MANA ability + a quoted group grant — neither lane is band-gated
  name: "Joraga Treespeaker", type: "Creature — Elf Druid", mana: "{G}", power: "1", toughness: "1",
  oracle: "Level up {1}{G} ({1}{G}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-4\n1/2\n{T}: Add {G}{G}.\nLEVEL 5+\n1/4\nElves you control have \"{T}: Add {G}{G}.\"",
};
const SKYSCRAPER = { // the one non-creature leveler — a Land (tier `land`); band mana is not band-gated → no leveler emission
  name: "Under-Construction Skyscraper", type: "Land", mana: "",
  oracle: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\n{T}: Add {C}.\nLEVEL 1-7\n{T}: Add {W}, {B}, {G}, or {C}.\nLEVEL 8+\n{T}: Add {W}, {B}, {G}, or {C}. Scry 1.",
};

// The remaining real levelers, for the classification audit (oracle verbatim from the bundle).
const OTHER_FLIPS = [
  ["Ikiral Outrider", "Creature — Human Soldier", "1", "2", "Level up {4} ({4}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-3\n2/6\nVigilance\nLEVEL 4+\n3/10\nVigilance"],
  ["Knight of Cliffhaven", "Creature — Kor Knight", "2", "2", "Level up {3} ({3}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-3\n2/3\nFlying\nLEVEL 4+\n4/4\nFlying, vigilance"],
  ["Nirkana Cutthroat", "Creature — Vampire Warrior", "3", "2", "Level up {2}{B} ({2}{B}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n4/3\nDeathtouch\nLEVEL 3+\n5/4\nFirst strike, deathtouch"],
  ["Beastbreaker of Bala Ged", "Creature — Human Warrior", "2", "2", "Level up {2}{G} ({2}{G}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-3\n4/4\nLEVEL 4+\n6/6\nTrample"],
  ["Caravan Escort", "Creature — Human Knight", "1", "1", "Level up {2} ({2}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-4\n2/2\nLEVEL 5+\n5/5\nFirst strike"],
  ["Skywatcher Adept", "Creature — Merfolk Wizard", "1", "1", "Level up {3} ({3}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n2/2\nFlying\nLEVEL 3+\n4/2\nFlying"],
  ["Guul Draz Assassin", "Creature — Vampire Assassin", "1", "1", "Level up {1}{B} ({1}{B}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n2/2\n{B}, {T}: Target creature gets -2/-2 until end of turn.\nLEVEL 4+\n4/4\n{B}, {T}: Target creature gets -4/-4 until end of turn."],
  ["Null Champion", "Creature — Zombie Warrior", "1", "1", "Level up {3} ({3}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-3\n4/2\nLEVEL 4+\n7/3\n{B}: Regenerate this creature."],
  ["Enclave Cryptologist", "Creature — Merfolk Wizard", "0", "1", "Level up {1}{U} ({1}{U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n0/1\n{T}: Draw a card, then discard a card.\nLEVEL 3+\n0/1\n{T}: Draw a card."],
  ["Kazandu Tuskcaller", "Creature — Human Shaman", "1", "1", "Level up {1}{G} ({1}{G}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-5\n1/1\n{T}: Create a 3/3 green Elephant creature token.\nLEVEL 6+\n1/1\n{T}: Create two 3/3 green Elephant creature tokens."],
];
const OTHER_PARKS = [
  ["Hexdrinker", "Creature — Snake", "2", "1", "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 3-7\n4/4\nProtection from instants\nLEVEL 8+\n6/6\nProtection from everything"],
  ["Hada Spy Patrol", "Creature — Human Rogue", "1", "1", "Level up {2}{U} ({2}{U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n2/2\nThis creature can't be blocked.\nLEVEL 3+\n3/3\nShroud (This creature can't be the target of spells or abilities.)\nThis creature can't be blocked."],
  ["Lighthouse Chronologist", "Creature — Human Wizard", "1", "3", "Level up {U} ({U}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 4-6\n2/4\nLEVEL 7+\n3/5\nAt the beginning of each end step, if it's not your turn, take an extra turn after this one."],
  ["Lord of Shatterskull Pass", "Creature — Minotaur Shaman", "3", "3", "Level up {1}{R} ({1}{R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-5\n6/6\nLEVEL 6+\n6/6\nWhenever this creature attacks, it deals 6 damage to each creature defending player controls."],
  // Coralhelm Commander (band GROUP anthem) FLIPPED in BLITZ SG-1 — pins in sourceGatedAnthem.test.js.
  ["Hedron-Field Purists", "Creature — Human Cleric", "0", "3", "Level up {2}{W} ({2}{W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-4\n1/4\nIf a source would deal damage to you or a creature you control, prevent 1 of that damage.\nLEVEL 5+\n2/5\nIf a source would deal damage to you or a creature you control, prevent 2 of that damage."],
];

// ─── Structural parse (leveler.js) ───────────────────────────────────────────────────────────

describe("parseLeveler — the frame parser", () => {
  it("Student of Warfare: cost, two bands, P/T boxes, validated keywords", () => {
    const lv = parseLeveler(STUDENT);
    expect(lv).not.toBeNull();
    expect(lv.levelUpPips).toBe("{W}");
    expect(lv.preBandLines).toEqual([]);
    expect(lv.bands).toHaveLength(2);
    expect(lv.bands[0]).toMatchObject({ atLeast: 2, atMost: 6, pt: { power: 3, toughness: 3 }, keywords: ["first strike"] });
    expect(lv.bands[1]).toMatchObject({ atLeast: 7, atMost: null, pt: { power: 4, toughness: 4 }, keywords: ["double strike"] });
  });
  it("band colon lines land in colonLines, unknown band text lands in unmodeledLines", () => {
    const bm = parseLeveler(BRIMSTONE);
    expect(bm.bands[0].colonLines).toEqual(["{T}: This creature deals 1 damage to any target."]);
    const hal = parseLeveler(HALIMAR);
    expect(hal.bands[1].unmodeledLines).toEqual(["Islandwalk"]); // not in the grantable vocabulary → fail closed
    const jor = parseLeveler(JORAGA);
    // the quoted group grant's colon is INSIDE the quotes → NOT this card's own colon line
    expect(jor.bands[1].colonLines).toEqual([]);
    expect(jor.bands[1].unmodeledLines).toEqual(['Elves you control have "{T}: Add {G}{G}."']);
  });
  it("keyword-line vocabulary is closed: unknown words fail the whole line", () => {
    expect(parseBandKeywordLine("First strike")).toEqual(["first strike"]);
    expect(parseBandKeywordLine("Lifelink, indestructible")).toEqual(["lifelink", "indestructible"]);
    expect(parseBandKeywordLine("Islandwalk")).toBeNull();
    expect(parseBandKeywordLine("Protection from instants")).toBeNull();
    expect(parseBandKeywordLine("Flying, islandwalk")).toBeNull(); // one bad word poisons the line
  });
  it("Class enchantments are NOT the leveler frame (CR 716.4 / 711.7)", () => {
    const cls = { name: "Fighter Class", type: "Enchantment — Class", oracle: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{3}{R}{W}: Level 2\nEquipment you control have equip {1}.\n{3}{R}{W}: Level 3\nAt the beginning of combat on your turn, attach up to one target Equipment you control to target creature you control." };
    expect(isLevelerFrame(cls.oracle)).toBe(false);
    expect(parseLeveler(cls)).toBeNull();
  });
});

// ─── The whole-card gate (modeledLeveler) + classification ─────────────────────────────────

describe("modeledLeveler + classifyCard — whole card or park", () => {
  it("the 14 modeled levelers classify native-mixed", () => {
    for (const card of [STUDENT, BRIMSTONE, TRANSCENDENT, KARGAN]) {
      expect(modeledLeveler(card), card.name).not.toBeNull();
      expect(classifyCard(card), card.name).toBe("native-mixed");
    }
    for (const [name, type, power, toughness, oracle] of OTHER_FLIPS) {
      expect(classifyCard({ name, type, power, toughness, oracle }), name).toBe("native-mixed");
    }
  });
  it("FN guards: every leveler with an unmodeled band piece parks whole (body-only)", () => {
    for (const card of [HALIMAR, ZULAPORT, ECHO_MAGE, JORAGA]) {
      expect(modeledLeveler(card), card.name).toBeNull();
      expect(classifyCard(card), card.name).toBe("body-only");
    }
    for (const [name, type, power, toughness, oracle] of OTHER_PARKS) {
      const card = { name, type, power, toughness, oracle };
      expect(modeledLeveler(card), name).toBeNull();
      expect(classifyCard(card), name).toBe("body-only");
    }
  });
  it("a parked leveler emits NOTHING at runtime: no abilities, no statics", () => {
    for (const card of [HALIMAR, ZULAPORT, ECHO_MAGE, JORAGA]) {
      expect(parseActivatedAbilities(card), card.name).toEqual([]);
      expect(parseStaticAbilities(card), card.name).toEqual([]);
    }
  });
  it("Under-Construction Skyscraper (the Land leveler) keeps the land tier and gets no leveler emission", () => {
    expect(classifyCard(SKYSCRAPER)).toBe("land");
    expect(modeledLeveler(SKYSCRAPER)).toBeNull();
    expect(parseActivatedAbilities(SKYSCRAPER)).toEqual([]);
  });
  it("Kargan Dragonlord: the band-8+ firebreathing is level-gated, never always-on", () => {
    const abs = parseActivatedAbilities(KARGAN);
    const fire = abs.find((a) => a.raw.includes("+1/+0"));
    expect(fire.modeled).toBe(true);
    expect(fire.levelGate).toEqual({ atLeast: 8, atMost: null });
  });
  it("the level-up ability parses as CR 702.87a's rewrite: mana cost, level counter, sorcery-only", () => {
    const abs = parseActivatedAbilities(STUDENT);
    const lu = abs.find((a) => a.isLevelUp);
    expect(lu).toBeDefined();
    expect(lu.manaPips).toBe("{W}");
    expect(lu.sorceryOnly).toBe(true);
    expect(lu.modeled).toBe(true);
    expect(lu.program.atoms).toEqual([{ op: "add-named-counter-self", counterType: "level", amount: 1 }]);
  });
});

// ─── The printed-keyword primitive (the pre-existing band FP, fixed) ────────────────────────

describe("hasKeyword — band keywords are not always-on printed keywords", () => {
  it("Student of Warfare has NEITHER strike keyword printed always-on (array and oracle both band-scoped)", () => {
    expect(hasKeyword(STUDENT, "First strike")).toBe(false);
    expect(hasKeyword(STUDENT, "Double strike")).toBe(false);
  });
  it("a non-leveler's keywords array and oracle scan are untouched", () => {
    expect(hasKeyword({ name: "X", keywords: ["First strike"], oracle: "" }, "First strike")).toBe(true);
    expect(hasKeyword({ name: "Y", oracle: "Flying\nWhen this creature enters, draw a card." }, "Flying")).toBe(true);
  });
});

// ─── Runtime: bands via the layer engine (CR 711.2a/b, 711.5) ───────────────────────────────

function boardWith(card, permId, lands) {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: permId, card, controller: "user", summoningSick: false });
  const land = (id, name, pip) => createPermanent({ id, card: { name, type: `Basic Land — ${name}`, oracle: `{T}: Add {${pip}}.` }, controller: "user", summoningSick: false });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: [perm, ...lands.map((l, i) => land(`l${i}`, l[0], l[1]))] } },
  };
}
const withLevel = (s, permId, n) => ({
  ...s,
  players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === permId ? { ...p, counters: n ? { level: n } : {} } : p)) } },
});

describe("runtime — band boundaries switch base P/T and keywords at exactly the printed counts", () => {
  it("Student of Warfare across 0/1/2/6/7/12 level counters", () => {
    const s = boardWith(STUDENT, "p1", []);
    const read = (n) => {
      const t = withLevel(s, "p1", n);
      return [`${permanentPower(t, "p1")}/${permanentToughness(t, "p1")}`, permanentHasKeyword(t, "p1", "First strike"), permanentHasKeyword(t, "p1", "Double strike")];
    };
    expect(read(0)).toEqual(["1/1", false, false]); // CR 711.5 — below N1, printed box
    expect(read(1)).toEqual(["1/1", false, false]);
    expect(read(2)).toEqual(["3/3", true, false]);  // band 2-6 opens
    expect(read(6)).toEqual(["3/3", true, false]);  // upper edge inclusive
    expect(read(7)).toEqual(["4/4", false, true]);  // band 2-6 CLOSES (atMost), band 7+ opens
    expect(read(12)).toEqual(["4/4", false, true]); // open band has no upper bound
  });
  it("level counters are not P/T counters: no ±1/±1 delta leaks in", () => {
    const s = withLevel(boardWith(BRIMSTONE, "p1", []), "p1", 3);
    expect(permanentPower(s, "p1")).toBe(2);      // band 3+ box is 2/4, not 2+3
    expect(permanentToughness(s, "p1")).toBe(4);
  });
});

// ─── Runtime: the level-up activation (CR 702.87a) ──────────────────────────────────────────

describe("runtime — level up activates as a sorcery, any number of times, and puts the counter", () => {
  const levelUpOffers = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === id && /level counter/.test(a.abilityText || ""));

  it("offered at own main with an empty stack; pays the cost; the counter lands on resolution", () => {
    let s = boardWith(STUDENT, "p1", [["Plains", "W"], ["Plains", "W"]]);
    const offers = levelUpOffers(s, "p1");
    expect(offers).toHaveLength(1);
    s = dispatchAction(s, offers[0]);
    expect(s.stack).toHaveLength(1); // an activated ability uses the stack (CR 602.2)
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.id === "p1").counters).toEqual({ level: 1 });
  });
  it("any number of activations per turn (CR 702.87a has no frequency restriction)", () => {
    let s = boardWith(STUDENT, "p1", [["Plains", "W"], ["Plains", "W"]]);
    for (let i = 0; i < 2; i++) {
      const offers = levelUpOffers(s, "p1");
      expect(offers).toHaveLength(1);
      s = resolveTopOfStack(dispatchAction(s, offers[0]));
      s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    }
    expect(s.players.user.battlefield.find((p) => p.id === "p1").counters).toEqual({ level: 2 });
  });
  it("sorcery-only: NOT offered while the stack is non-empty (CR 602.5i)", () => {
    const s = boardWith(STUDENT, "p1", [["Plains", "W"]]);
    const busy = { ...s, stack: [{ id: "x", resolver: "SPELL_NOOP", params: {} }] };
    expect(levelUpOffers(busy, "p1")).toHaveLength(0);
  });
  it("NOT offered outside the controller's main step", () => {
    const s = boardWith(STUDENT, "p1", [["Plains", "W"]]);
    expect(levelUpOffers({ ...s, step: "declare-attackers", phase: "combat" }, "p1")).toHaveLength(0);
    expect(levelUpOffers({ ...s, activePlayer: "opp1" }, "p1")).toHaveLength(0);
  });
  it("can be activated while summoning-sick (no {T} in the cost — CR 302.6 doesn't apply)", () => {
    let s = boardWith(STUDENT, "p1", [["Plains", "W"]]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "p1" ? { ...p, summoningSick: true } : p)) } } };
    expect(levelUpOffers(s, "p1")).toHaveLength(1);
  });
});

describe("runtime — band activated abilities are offered only inside their band", () => {
  const bandOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p1" && /deals \d damage/.test(a.abilityText || ""));
  it("Brimstone Mage: no pinger at 0; the 1-damage pinger at 1-2; ONLY the 3-damage pinger at 3+", () => {
    const s = boardWith(BRIMSTONE, "p1", [["Mountain", "R"]]);
    expect(bandOffers(withLevel(s, "p1", 0))).toHaveLength(0);
    const l1 = bandOffers(withLevel(s, "p1", 1));
    expect(l1.length).toBeGreaterThan(0);
    expect(l1.every((a) => a.abilityText.includes("deals 1 damage"))).toBe(true);
    const l3 = bandOffers(withLevel(s, "p1", 3));
    expect(l3.length).toBeGreaterThan(0);
    expect(l3.every((a) => a.abilityText.includes("deals 3 damage"))).toBe(true);
  });
});

// ─── Persistence: counters + bands survive save/load ────────────────────────────────────────

describe("serialization — level counters and derived band state survive a save/load round trip", () => {
  it("Brimstone Mage at level 3 round-trips to the same derived P/T", () => {
    const s = withLevel(boardWith(BRIMSTONE, "p1", [["Mountain", "R"]]), "p1", 3);
    const back = deserializeState(serializeState(s));
    expect(back.players.user.battlefield.find((p) => p.id === "p1").counters).toEqual({ level: 3 });
    expect(permanentPower(back, "p1")).toBe(2);
    expect(permanentToughness(back, "p1")).toBe(4);
  });
});

// ─── The AI seat's activation policy ─────────────────────────────────────────────────────────

describe("AI — the documented level-up policy: leftover-mana leveling, ranked after the other safe activations", () => {
  it("the default policy activates level up when it's the available action", () => {
    const s = boardWith(STUDENT, "p1", [["Plains", "W"], ["Plains", "W"]]);
    const actions = legalActionsForPlayer(s, "user");
    const pick = pickAction(s, "user", actions);
    expect(pick?.kind).toBe("activate-ability");
    expect(pick.abilityText).toBe("Put a level counter on this permanent.");
  });
  it("policy ability:'v1' recovers never-activate (the A/B seam)", () => {
    const s = boardWith(STUDENT, "p1", [["Plains", "W"], ["Plains", "W"]]);
    const actions = legalActionsForPlayer(s, "user");
    const pick = pickAction(s, "user", actions, { policy: { ability: "v1" } });
    expect(pick?.kind).not.toBe("activate-ability");
  });
});
