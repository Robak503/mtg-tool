/**
 * partyCount.test.js — "This spell costs {1} less to cast for each creature in your party" (the 09-06 plan's stage ② · 2,
 * 2026-09-30) and the party count itself (CR 700.8, verified in cr_current.json):
 *   700.8  — up to one Cleric, one Rogue, one Warrior and one Wizard creature the player controls (0..4);
 *   700.8b — a creature with several of those types fills only ONE slot, counted the way that gives the HIGHEST result.
 * So partyCount (layers.js) is a maximum matching of the four roles onto the creatures, never a per-type tally, and ONE helper
 * serves both count evaluators (layers.js countForSpec and effects/atoms/shared.js countForSpec).
 *
 * Flips (tier snapshots 19d8ba0a → this): Shatterskull Minotaur, Journey to Oblivion, Sea Gate Colossus, and — UNPLANNED —
 * Ravager's Mace ("Equipped creature gets +1/+0 for each creature in your party and has menace"), whose RUNTIME is pinned
 * below. Deadly Alliance / Spoils of Adventure were already native-spell (the spell path strips the sentence) but cast at FULL
 * price — the reduction now applies at cast (a runtime change, pinned). Coveted Prize, Thwart the Grave, Zagras, Veteran
 * Adventurer and Tazri keep parking on their other lines.
 *
 * Carrier fixtures are the real oracle (bundled Scryfall, probed 2026-09-30); party members are synthetic (their text is
 * irrelevant — only their type lines count), built with createPermanent (engine-shaped).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { partyCount, permanentPower, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const REMINDER = " (Your party consists of up to one each of Cleric, Rogue, Warrior, and Wizard.)";
const REDUCE = "This spell costs {1} less to cast for each creature in your party.";
const SHATTERSKULL = { id: "c-shat", name: "Shatterskull Minotaur", type: "Creature — Minotaur Warrior", mana: "{4}{R}{R}", cmc: 6, colors: ["R"],
  power: 5, toughness: 4, keywords: ["Haste"], oracle: `${REDUCE}${REMINDER}\nHaste` };
const JOURNEY = { id: "c-jour", name: "Journey to Oblivion", type: "Enchantment", mana: "{4}{W}", cmc: 5, colors: ["W"], keywords: [],
  oracle: `${REDUCE}${REMINDER}\nWhen this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.` };
const COLOSSUS = { id: "c-colo", name: "Sea Gate Colossus", type: "Artifact Creature — Golem Warrior", mana: "{7}", cmc: 7, colors: [],
  power: 7, toughness: 5, keywords: [], oracle: `${REDUCE}${REMINDER}` };
const ALLIANCE = { id: "c-alli", name: "Deadly Alliance", type: "Instant", mana: "{4}{B}", cmc: 5, colors: ["B"], keywords: [],
  oracle: `${REDUCE}${REMINDER}\nDestroy target creature or planeswalker.` };
const SPOILS = { id: "c-spoi", name: "Spoils of Adventure", type: "Instant", mana: "{4}{W}{U}", cmc: 6, colors: ["U", "W"], keywords: [],
  oracle: `${REDUCE}${REMINDER}\nYou gain 3 life and draw three cards.` };
const MACE = { id: "c-mace", name: "Ravager's Mace", type: "Artifact — Equipment", mana: "{1}{B}{R}", cmc: 3, colors: ["B", "R"], keywords: ["Equip"],
  oracle: `When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +1/+0 for each creature in your party and has menace.${REMINDER}\nEquip {2}{B}{R}` };
const PARKED = [
  { name: "Zagras, Thief of Heartbeats", type: "Legendary Creature — Vampire Rogue", mana: "{4}{B}{R}", power: 4, toughness: 4, keywords: ["Deathtouch", "Flying", "Haste"],
    oracle: `${REDUCE}\nFlying, deathtouch, haste\nOther creatures you control have deathtouch.\nWhenever a creature you control deals combat damage to a planeswalker, destroy that planeswalker.` },
  { name: "Veteran Adventurer", type: "Creature — Human", mana: "{5}{G}", power: 5, toughness: 5, keywords: ["Vigilance"],
    oracle: `Veteran Adventurer is also a Cleric, Rogue, Warrior, and Wizard.\n${REDUCE}\nVigilance` },
  { name: "Coveted Prize", type: "Sorcery", mana: "{4}{B}", keywords: [],
    oracle: `${REDUCE}${REMINDER}\nSearch your library for a card, put it into your hand, then shuffle. If you have a full party, you may cast a spell with mana value 4 or less from your hand without paying its mana cost.` },
  { name: "Thwart the Grave", type: "Sorcery", mana: "{4}{B}{B}", keywords: [],
    oracle: `${REDUCE}${REMINDER}\nReturn target creature card and up to one target Cleric, Rogue, Warrior, or Wizard creature card from your graveyard to the battlefield.` },
  { name: "Tazri, Beacon of Unity", type: "Legendary Creature — Human Warrior", mana: "{4}{W}", power: 4, toughness: 6, keywords: [],
    oracle: `${REDUCE}\n{2/U}{2/B}{2/R}{2/G}: Look at the top six cards of your library. You may reveal up to two Cleric, Rogue, Warrior, Wizard, and/or Ally cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order.` },
];

// Party members: only the type line matters. `extra` lets a fixture add keywords (a changeling) or change the card type.
const member = (id, subtypes, { controller = "user", type = "Creature", keywords = [], oracle = "" } = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type: `${type} — ${subtypes}`, mana: "{1}", power: 1, toughness: 1, keywords, oracle }, controller });
const CHANGELING = (id) => member(id, "Shapeshifter", { keywords: ["Changeling"], oracle: "Changeling (This card is every creature type.)" });

function board(userBattlefield, { hand = [], pool = {}, oppBattlefield = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 7, stack: [],
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: userBattlefield, hand, library: [], manaPool: { ...s0.players.user.manaPool, ...pool } },
      ai: { ...s0.players.ai, battlefield: oppBattlefield },
    } };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("partyCount — CR 700.8 / 700.8b", () => {
  it("0 with no creatures; one of each role is 4; a fifth creature of a filled role adds nothing", () => {
    expect(partyCount(board([]), "user")).toBe(0);
    const four = [member("cl", "Human Cleric"), member("ro", "Elf Rogue"), member("wa", "Orc Warrior"), member("wi", "Merfolk Wizard")];
    expect(partyCount(board(four), "user")).toBe(4);
    expect(partyCount(board([...four, member("cl2", "Human Cleric")]), "user")).toBe(4);
  });

  it("⭐ 700.8b — a Cleric-Rogue plus a plain Cleric is a party of TWO, in either order (a per-type or greedy count gets 1)", () => {
    const multi = member("cr", "Human Cleric Rogue");
    const cleric = member("cl", "Human Cleric");
    expect(partyCount(board([multi, cleric]), "user")).toBe(2);
    expect(partyCount(board([cleric, multi]), "user")).toBe(2);
  });

  it("⭐ 700.8b — a changeling fills ONE slot, not four; with a Cleric beside it the party is 2", () => {
    expect(partyCount(board([CHANGELING("ch")]), "user")).toBe(1);
    expect(partyCount(board([CHANGELING("ch"), member("cl", "Human Cleric")]), "user")).toBe(2);
    expect(partyCount(board([CHANGELING("c1"), CHANGELING("c2"), CHANGELING("c3"), CHANGELING("c4"), CHANGELING("c5")]), "user")).toBe(4);
  });

  it("⛔ a noncreature carrying a party subtype never counts; neither do an opponent's creatures", () => {
    const kindred = member("kw", "Wizard", { type: "Kindred Artifact" });
    expect(partyCount(board([kindred]), "user")).toBe(0);
    const s = board([member("cl", "Human Cleric")], { oppBattlefield: [member("ow", "Merfolk Wizard", { controller: "ai" })] });
    expect(partyCount(s, "user")).toBe(1);
    expect(partyCount(s, "ai")).toBe(1);
  });
});

describe("the classifier", () => {
  it("⭐ the four flips read native; the two spells stay native; five carriers keep parking on their other lines", () => {
    const row = Object.fromEntries([SHATTERSKULL, JOURNEY, COLOSSUS, MACE, ALLIANCE, SPOILS].map((c) => [c.name, classifyCard(c)]));
    console.log("  WITNESS partyTiers", JSON.stringify(row)); // vitest 4: --disable-console-intercept
    expect(row).toEqual({
      "Shatterskull Minotaur": "native-body", "Journey to Oblivion": "native-trigger", "Sea Gate Colossus": "native-body",
      "Ravager's Mace": "native-equipment", "Deadly Alliance": "native-spell", "Spoils of Adventure": "native-spell",
    });
    for (const c of PARKED) expect(classifyCard(c), c.name).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the cast reduction reads the party", () => {
  const FULL = [member("cl", "Human Cleric"), member("ro", "Elf Rogue"), member("wa", "Orc Warrior"), member("wi", "Merfolk Wizard")];

  it("⭐⭐ Shatterskull Minotaur: party 4 → {R}{R}; party 2 → {2}{R}{R}; party 0 → the printed {4}{R}{R}", () => {
    const at = (bf) => castOf(board(bf, { hand: [SHATTERSKULL], pool: { R: 6 } }), "c-shat")?.cost ?? null;
    const pick = (c) => (c ? { generic: c.generic, R: c.R } : null);
    const row = { party4: pick(at(FULL)), party2: pick(at(FULL.slice(0, 2))), party0: pick(at([])) };
    console.log("  WITNESS partyCastShatterskull", JSON.stringify(row));
    expect(row).toMatchObject({ party4: { generic: 0, R: 2 }, party2: { generic: 2, R: 2 }, party0: { generic: 4, R: 2 } });
  });

  it("⭐ Deadly Alliance (already native, but cast at FULL price before this): party 3 → {1}{B}", () => {
    const target = member("ob", "Bear", { controller: "ai" });
    const cast = castOf(board(FULL.slice(0, 3), { hand: [ALLIANCE], pool: { B: 6 }, oppBattlefield: [target] }), "c-alli");
    expect(cast?.cost).toMatchObject({ generic: 1, B: 1 });
  });

  it("⭐ the 700.8b count is the one the cast reads: a Cleric-Rogue + a Cleric discounts {2}, not {1}", () => {
    const cast = castOf(board([member("cr", "Human Cleric Rogue"), member("cl", "Human Cleric")], { hand: [SHATTERSKULL], pool: { R: 6 } }), "c-shat");
    expect(cast?.cost).toMatchObject({ generic: 2, R: 2 });
  });
});

describe("RUNTIME — Ravager's Mace (the unplanned gain): the layer bonus reads the same party", () => {
  it("⭐⭐ a Warrior wearing the Mace, beside a Cleric and a Wizard (party 3): +3/+0 and menace", () => {
    const host = { ...member("host", "Orc Warrior"), attachments: ["mace"] };
    const mace = { ...createPermanent({ id: "mace", card: MACE, controller: "user" }), attachedTo: "host" };
    const s = board([host, mace, member("cl", "Human Cleric"), member("wi", "Merfolk Wizard")]);
    const row = { party: partyCount(s, "user"), power: permanentPower(s, "host"), menace: permanentHasKeyword(s, "host", "menace") };
    console.log("  WITNESS partyMace", JSON.stringify(row));
    expect(row).toEqual({ party: 3, power: 4, menace: true });
  });
});
