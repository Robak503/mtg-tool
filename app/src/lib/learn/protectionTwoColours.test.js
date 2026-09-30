/**
 * protectionTwoColours.test.js — "Protection from black and from red" (Auriok Champion, Mystic Crusader — census rank 42 of the
 * 09-06 plan's stage ③, 2026-09-30; eleven carriers moved).
 *
 * The runtime enforced both colours all along: protection.parseProtectionColors splits "and from", and layers'
 * permanentProtectionColors feeds the three enforcement sites (blocking, targeting, combat damage). Only the METRIC was wrong:
 * coverage.isKeywordOnly splits clauses on " and ", so the line became "protection from black" plus a bare "from red" no
 * keyword credits, and every carrier parked. The colour list is joined into one clause before the split — colour words only,
 * the words the runtime reader enforces; a non-colour quality after "and from" (Baneslayer's Demons) still splits and parks.
 *
 * Real oracle fixtures (bundled Scryfall, generated 2026-09-30). The rank was skipped in rank order at stage ③ · 24 (the run
 * ledger records the correction).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentProtectionColors } from "./layers.js";
import { parseProtectionColors } from "./protection.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard, isKeywordOnly } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PAIR_CARRIERS = [ // every card this slice moved — real oracle, generated from the bundled Scryfall data 2026-09-30
  {"name":"Akroma, Angel of Fury","type":"Legendary Creature — Angel","mana":"{5}{R}{R}{R}","power":"6","toughness":"6","keywords":["Flying","Morph","Protection","Trample"],"oracle":"This spell can't be countered.\nFlying, trample, protection from white and from blue\n{R}: Akroma gets +1/+0 until end of turn.\nMorph {3}{R}{R}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"},
  {"name":"Akroma, Angel of Wrath","type":"Legendary Creature — Angel","mana":"{5}{W}{W}{W}","power":"6","toughness":"6","keywords":["Flying","Vigilance","First strike","Protection","Haste","Trample"],"oracle":"Flying, first strike, vigilance, trample, haste, protection from black and from red"},
  {"name":"Auriok Champion","type":"Creature — Human Cleric","mana":"{W}{W}","power":"1","toughness":"1","keywords":["Protection"],"oracle":"Protection from black and from red\nWhenever another creature enters, you may gain 1 life."},
  {"name":"Great Sable Stag","type":"Creature — Elk","mana":"{1}{G}{G}","power":"3","toughness":"3","keywords":["Protection"],"oracle":"This spell can't be countered.\nProtection from blue and from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything blue or black.)"},
  {"name":"Mirran Crusader","type":"Creature — Human Knight","mana":"{1}{W}{W}","power":"2","toughness":"2","keywords":["Protection","Double strike"],"oracle":"Double strike, protection from black and from green"},
  {"name":"Mystic Crusader","type":"Creature — Human Nomad Mystic","mana":"{1}{W}{W}","power":"2","toughness":"1","keywords":["Protection","Threshold"],"oracle":"Protection from black and from red\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has flying."},
  {"name":"Paladin en-Vec","type":"Creature — Human Knight","mana":"{1}{W}{W}","power":"2","toughness":"2","keywords":["First strike","Protection"],"oracle":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)"},
  {"name":"Phyrexian Crusader","type":"Creature — Phyrexian Zombie Knight","mana":"{1}{B}{B}","power":"2","toughness":"2","keywords":["First strike","Protection","Infect"],"oracle":"First strike, protection from red and from white\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"},
  {"name":"Sabertooth Nishoba","type":"Creature — Cat Beast Warrior","mana":"{4}{G}{W}","power":"5","toughness":"5","keywords":["Protection","Trample"],"oracle":"Trample, protection from blue and from red"},
  {"name":"Sphinx of the Steel Wind","type":"Artifact Creature — Sphinx","mana":"{5}{W}{U}{B}","power":"6","toughness":"6","keywords":["Flying","Lifelink","Vigilance","First strike","Protection"],"oracle":"Flying, first strike, vigilance, lifelink, protection from red and from green"},
  {"name":"Stillmoon Cavalier","type":"Creature — Zombie Knight","mana":"{1}{W/B}{W/B}","power":"2","toughness":"1","keywords":["Protection"],"oracle":"Protection from white and from black\n{W/B}: This creature gains flying until end of turn.\n{W/B}: This creature gains first strike until end of turn.\n{W/B}{W/B}: This creature gets +1/+0 until end of turn."},
];
const AURIOK = PAIR_CARRIERS.find((c) => c.name === "Auriok Champion");
const LIONS = { name: "Savannah Lions", type: "Creature — Cat", mana: "{W}", power: "2", toughness: "1", oracle: "" }; // the unprotected control
const CORPSE = { name: "Walking Corpse", type: "Creature — Zombie", mana: "{1}{B}", power: "2", toughness: "2", oracle: "" };
const OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: "2", toughness: "2", oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const BOLT = { id: "c-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const GROWTH = { id: "c-growth", name: "Giant Growth", type: "Instant", mana: "{G}", oracle: "Target creature gets +3/+3 until end of turn." };
const COLOUR = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function game({ user = [], ai = [], hand = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }, ai: { ...s.players.ai, battlefield: ai } } };
}
// The ids a cast offers as targets (every target slot of every cast action for that card).
const targetIdsOf = (s, name) => [...new Set(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === name)
  .flatMap((a) => (a.targets || []).map((t) => t.id)))];

describe("the metric", () => {
  it("a colour-pair line is keyword-only; a non-colour quality after \"and from\" still parks", () => {
    expect(isKeywordOnly("Protection from black and from red", "Probe")).toBe(true);
    expect(isKeywordOnly("Protection from white and from blue and from black", "Probe")).toBe(true);
    expect(isKeywordOnly("Protection from Demons and from Dragons", "Probe")).toBe(false);
    expect(isKeywordOnly("Protection from black and from Zombies", "Probe")).toBe(false);
  });
  it("every carrier classifies native", () => {
    for (const card of PAIR_CARRIERS) expect(classifyCard(card), card.name).toMatch(/^native-/);
  });
});

describe("RUNTIME — both colours are enforced, for every carrier and at every site", () => {
  it("⭐ each carrier's protection set is exactly its two printed colours (the reader all three sites consult)", () => {
    const s = game({ user: PAIR_CARRIERS.map((c, i) => perm(c, `p${i}`, "user")) });
    const rows = PAIR_CARRIERS.map((card, i) => {
      const printed = card.oracle.match(/protection from (\w+) and from (\w+)/i).slice(1).map((w) => COLOUR[w.toLowerCase()]).sort();
      return { name: card.name, printed, runtime: [...permanentProtectionColors(s, `p${i}`)].sort() };
    });
    for (const r of rows) expect(r.runtime, r.name).toEqual(r.printed);
    console.log(`WITNESS pairProtection ${JSON.stringify(rows.map((r) => `${r.name}:${r.runtime.join("")}`))}`);
  });

  it("BLOCKING — an attacking Auriok Champion can't be blocked by the black or the red creature, can by the green (the Lions, unprotected, by all three)", () => {
    const s = game({ user: [perm(AURIOK, "au", "user"), perm(LIONS, "li", "user")], ai: [perm(CORPSE, "bk", "ai"), perm(OGRE, "rd", "ai"), perm(BEARS, "gr", "ai")] });
    const blocks = (att) => ["bk", "rd", "gr"].map((b) => canBlockAttacker(s, b, att, "ai"));
    expect(blocks("au")).toEqual([false, false, true]);
    expect(blocks("li")).toEqual([true, true, true]);
  });

  it("TARGETING — Lightning Bolt can't target Auriok Champion but can target the Lions; Giant Growth can target both", () => {
    const s = game({ user: [perm(AURIOK, "au", "user"), perm(LIONS, "li", "user")], hand: [BOLT, GROWTH], pool: { R: 1, G: 1 } });
    const bolt = targetIdsOf(s, "Lightning Bolt");
    expect(bolt).toContain("li");
    expect(bolt).not.toContain("au");
    expect(targetIdsOf(s, "Giant Growth")).toEqual(expect.arrayContaining(["au", "li"]));
  });

  it("COMBAT DAMAGE — blocking the red Gray Ogre, Auriok Champion takes nothing and survives; the Lions blocking it die", () => {
    const fight = (blockerCard) => {
      const s0 = game({ user: [perm(blockerCard, "bl", "user")], ai: [perm(OGRE, "rd", "ai")] });
      const s = { ...s0, activePlayer: "ai", phase: "combat", step: "combat-damage",
        combat: { attackers: [{ permanentId: "rd", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "bl", attackerId: "rd" }] } };
      const out = resolveCombatDamage(s);
      const bl = out.players.user.battlefield.find((p) => p.id === "bl");
      return { marked: bl ? bl.damageMarked || 0 : "dead" };
    };
    expect(fight(AURIOK)).toEqual({ marked: 0 });
    expect(fight(LIONS).marked).not.toBe(0);
  });
});

// The six OTHER cards the period-only sentence end robbed of an unconditional protection (Mystic Crusader is the seventh, above).
const LINE_BREAK_CARRIERS = [
  {"name":"Beasts of Bogardan","type":"Creature — Beast","mana":"{4}{R}","power":"3","toughness":"3","keywords":["Protection"],"oracle":"Protection from red\nThis creature gets +1/+1 as long as an opponent controls a nontoken white permanent."},
  {"name":"Blood Baron of Vizkopa","type":"Creature — Vampire","mana":"{3}{W}{B}","power":"4","toughness":"4","keywords":["Lifelink","Protection"],"oracle":"Lifelink, protection from white and from black\nAs long as you have 30 or more life and an opponent has 10 or less life, this creature gets +6/+6 and has flying."},
  {"name":"Ivory Guardians","type":"Creature — Giant Cleric","mana":"{4}{W}{W}","power":"3","toughness":"3","keywords":["Protection"],"oracle":"Protection from red\nCreatures named Ivory Guardians get +1/+1 as long as an opponent controls a nontoken red permanent."},
  {"name":"Mystic Enforcer","type":"Creature — Human Nomad Mystic","mana":"{2}{G}{W}","power":"3","toughness":"3","keywords":["Protection","Threshold"],"oracle":"Protection from black\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +3/+3 and has flying."},
  {"name":"Nantuko Blightcutter","type":"Creature — Insect Druid","mana":"{2}{G}","power":"2","toughness":"2","keywords":["Protection","Threshold"],"oracle":"Protection from black\nThreshold — This creature gets +1/+1 for each black permanent your opponents control as long as there are seven or more cards in your graveyard."},
  {"name":"Spirit of the Night","type":"Legendary Creature — Demon Spirit","mana":"{6}{B}{B}{B}","power":"6","toughness":"5","keywords":["Flying","Protection","Haste","Trample"],"oracle":"Flying, trample, haste, protection from black\nSpirit of the Night has first strike as long as it's attacking."},
];
// GENUINELY conditional protection — same sentence as its "as long as" — must still be skipped.
const CONDITIONAL = [
  {"name":"Etched Champion","type":"Artifact Creature — Soldier","mana":"{3}","power":"2","toughness":"2","keywords":["Metalcraft"],"oracle":"Metalcraft — This creature has protection from each color as long as you control three or more artifacts."},
  {"name":"Mystic Familiar","type":"Creature — Bird","mana":"{1}{W}","power":"1","toughness":"2","keywords":["Flying","Threshold"],"oracle":"Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has protection from black."},
  {"name":"Pristine Angel","type":"Creature — Angel","mana":"{4}{W}{W}","power":"4","toughness":"4","keywords":["Flying"],"oracle":"Flying\nAs long as this creature is untapped, it has protection from artifacts and from each color.\nWhenever you cast a spell, you may untap this creature."},
];

describe("RUNTIME — the protection reader's sentence ends at a line break (a later \"as long as\" line no longer drops it)", () => {
  it("⭐ the six other cards keep their printed protection — at the printed reader and on the board", () => {
    const s = game({ user: LINE_BREAK_CARRIERS.map((c, i) => perm(c, `lb${i}`, "user")) });
    const rows = LINE_BREAK_CARRIERS.map((card, i) => {
      const words = card.oracle.match(/protection from (\w+)(?: and from (\w+))?/i).slice(1).filter(Boolean);
      return { name: card.name, printed: words.map((w) => COLOUR[w.toLowerCase()]).sort(),
        parsed: [...parseProtectionColors(card)].sort(), runtime: [...permanentProtectionColors(s, `lb${i}`)].sort() };
    });
    for (const r of rows) expect({ parsed: r.parsed, runtime: r.runtime }, r.name).toEqual({ parsed: r.printed, runtime: r.printed });
    console.log(`WITNESS lineBreakProtection ${JSON.stringify(rows.map((r) => `${r.name}:${r.runtime.join("")}`))}`);
  });
  it("⛔ a protection in the SAME sentence as its \"as long as\" is still not printed protection (Etched Champion, Mystic Familiar, Pristine Angel)", () => {
    for (const card of CONDITIONAL) expect([...parseProtectionColors(card)], card.name).toEqual([]);
  });
});
