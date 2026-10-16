/**
 * selfSacCompoundManaCost.test.js — a SELF-SACRIFICE mana cost with a consumable beside it (2026-10-16).
 *
 * manaCostModelable accepted ANY cost containing "Sacrifice this …", so Lion's Eye Diamond ("Discard your hand, Sacrifice
 * this artifact: Add three mana of any one color. Activate only as an instant.") and Overeager Apprentice ("Discard a card,
 * Sacrifice this creature: Add {B}{B}{B}.") were plain one-shot sources — three mana for the sacrifice, the discard never
 * charged nor even required. Driven on a board, Phyrexian Arena was cast off either card with the whole hand kept. The {T}
 * half of the same function already refused a compound cost (the SHELF S7 guard); the self-sacrifice half now applies the
 * same residue rule, so both cards make no mana — an honest under-offer until the discard is charged. The clean
 * self-sacrifices (Lotus Petal, Treasure, Eldrazi Spawn, and the mana-costed Satyr Hedonist / Chromatic Star / Coal Golem,
 * whose pips manaActivationCost charges) are unchanged, and so is Basal Sliver, whose self-included "All Slivers have …"
 * grant is its own ability with its cost inside the quote. The old branch also read a quote a card only SHARES as its own
 * ability — Oddric, Lunar Marquis sacrificed himself for {C} — and that phantom is gone with it.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-10-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { manaProduction, manaSources, manaActivationCost } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LED = {"name":"Lion's Eye Diamond","type":"Artifact","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"Discard your hand, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant."};
const APPRENTICE = {"name":"Overeager Apprentice","type":"Creature — Human Minion","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Discard a card, Sacrifice this creature: Add {B}{B}{B}.","power":"1","toughness":"2"};
const LOTUS_PETAL = {"name":"Lotus Petal","type":"Artifact","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this artifact: Add one mana of any color."};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this token: Add one mana of any color."};
const SPAWN = {"name":"Eldrazi Spawn","type":"Token Creature — Eldrazi Spawn","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"Sacrifice this creature: Add {C}.","power":"0","toughness":"1"};
const SATYR_HEDONIST = {"name":"Satyr Hedonist","type":"Creature — Satyr","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"{R}, Sacrifice this creature: Add {R}{R}{R}.","power":"2","toughness":"1"};
const CHROMATIC_STAR = {"name":"Chromatic Star","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{1}, {T}, Sacrifice this artifact: Add one mana of any color.\nWhen this artifact is put into a graveyard from the battlefield, draw a card."};
const COAL_GOLEM = {"name":"Coal Golem","type":"Artifact Creature — Golem","mana":"{5}","cmc":5,"keywords":[],"colors":[],"oracle":"{3}, Sacrifice this creature: Add {R}{R}{R}.","power":"3","toughness":"3"};
const ARENA = {"name":"Phyrexian Arena","type":"Enchantment","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, you draw a card and lose 1 life."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const WHISPER = {"name":"Night's Whisper","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"You draw two cards and lose 2 life."};
const DARK_RITUAL = {"name":"Dark Ritual","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Add {B}{B}{B}."};
const BASAL_SLIVER = {"name":"Basal Sliver","type":"Creature — Sliver","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"","power":"2","toughness":"2"};
const ODDRIC = {"name":"Oddric, Lunar Marquis","type":"Legendary Creature — Human Soldier","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"At the beginning of each combat, creatures you control gain banding until end of turn if a creature you control has banding. The same is true for changeling, devoid, fear, flanking, horsemanship, ingest, intimidate, landwalk, shroud, tantrum, wither, and the activated ability \"Sacrifice this creature: Add {C}.\"","power":"3","toughness":"3"};
const RAIN_OF_FILTH = {"name":"Rain of Filth","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Until end of turn, lands you control gain \"Sacrifice this land: Add {B}.\""};

describe("the production — the self-sacrifice must be the cost's only non-mana part", () => {
  it("⛔ a discard beside the self-sacrifice refuses the source: Lion's Eye Diamond and Overeager Apprentice make no mana", () => {
    expect(manaProduction(LED)).toBeNull();
    expect(manaProduction(APPRENTICE)).toBeNull();
  });

  it("a clean self-sacrifice is still a one-shot source — with {T}, without it, and behind a mana cost the planner charges", () => {
    expect(manaProduction(LOTUS_PETAL)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: true });
    expect(manaProduction(TREASURE)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: true });
    expect(manaProduction(SPAWN)).toEqual({ colors: ["C"], amount: 1, sacrifices: true, requiresTap: false });
    expect(manaProduction(SATYR_HEDONIST)).toEqual({ colors: ["R"], amount: 3, sacrifices: true, requiresTap: false });
    expect(manaProduction(COAL_GOLEM)).toEqual({ colors: ["R"], amount: 3, sacrifices: true, requiresTap: false });
    expect(manaProduction(CHROMATIC_STAR)).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: true });
    // the pips in front of the sacrifice are a real cost: the planner funds them before the source produces
    expect(manaActivationCost(SATYR_HEDONIST)).toMatchObject({ generic: 0, R: 1 });
    expect(manaActivationCost(COAL_GOLEM)).toMatchObject({ generic: 3 });
    expect(manaActivationCost(CHROMATIC_STAR)).toMatchObject({ generic: 1 });
  });

  it("⛔ a second victim written after the self-sacrifice is residue too, with or without {T}", () => {
    expect(manaProduction({ name: "Probe Tap Double Sac", type: "Artifact", oracle: "{T}, Sacrifice this artifact and a creature: Add {C}{C}." })).toBeNull();
    expect(manaProduction({ name: "Probe Double Sac", type: "Artifact", oracle: "Sacrifice this artifact and a creature: Add {C}{C}." })).toBeNull();
    expect(manaProduction({ name: "Probe Life Sac", type: "Artifact", oracle: "Pay 2 life, Sacrifice this artifact: Add {C}{C}." })).toBeNull();
  });

  it("a self-included group grant keeps its self-sacrifice: Basal Sliver is still a one-shot {B}{B} of its own", () => {
    // "All Slivers have" is the grant, not a cost item — the cost starts at the opening quote. Refusing it here would not
    // merely under-offer: manaSources would fall back to the GRANT path, whose record carries no sacrifice — a {B}{B} tap
    // every turn. The board assertion below pins exactly that.
    expect(manaProduction(BASAL_SLIVER)).toEqual({ colors: ["B"], amount: 2, sacrifices: true, requiresTap: false });
  });

  it("⛔ a quote the card only GAINS or SHARES is not its own ability: Oddric, Lunar Marquis and Rain of Filth make no mana", () => {
    expect(manaProduction(ODDRIC)).toBeNull();
    expect(manaProduction(RAIN_OF_FILTH)).toBeNull();
  });
});

function board(sourceCards, hand) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user,
      battlefield: sourceCards.map((c, i) => createPermanent({ id: `src${i}`, card: { ...c, id: `c-src${i}` }, controller: "user", summoningSick: false })),
      hand: hand.map((c, i) => ({ ...c, id: `h${i}` })),
      graveyard: [], library: [{ id: "L0", name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" }],
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}
const HAND = [ARENA, BEARS, WHISPER];
const sourceIds = (s) => manaSources(s, "user").map((x) => x.permanentId);
const actionsOf = (s, kind) => legalActionsForPlayer(s, "user").filter((a) => a.kind === kind);

describe("on a board — nothing is paid by the sacrifice alone", () => {
  it("⭐ Lion's Eye Diamond: no source record, no tap-for-mana action, and no spell in hand is castable off it", () => {
    const s = board([LED], HAND);
    expect(sourceIds(s)).toEqual([]);
    expect(actionsOf(s, "tap-for-mana")).toEqual([]);
    expect(actionsOf(s, "cast-spell")).toEqual([]);
  });

  it("⭐ Overeager Apprentice: the {B}{B}{B} is not offered, so Phyrexian Arena and Night's Whisper stay uncastable", () => {
    const s = board([APPRENTICE], HAND);
    expect(sourceIds(s)).toEqual([]);
    expect(actionsOf(s, "tap-for-mana")).toEqual([]);
    expect(actionsOf(s, "cast-spell")).toEqual([]);
  });

  it("the same board with a clean self-sacrifice beside them still pays — Lotus Petal casts Dark Ritual and is cracked", () => {
    const s = board([LED, APPRENTICE, LOTUS_PETAL, SPAWN], [DARK_RITUAL]);
    expect(sourceIds(s).sort()).toEqual(["src2", "src3"]);
    expect(manaSources(s, "user").find((x) => x.permanentId === "src3")).toMatchObject({ colors: ["C"], amount: 1, sacrifices: true });
    const cast = actionsOf(s, "cast-spell").find((a) => a.cardId === "h0");
    expect(cast).toBeTruthy();
    const after = dispatchAction(s, cast);
    expect(after.stack).toHaveLength(1);
    const left = after.players.user.battlefield.map((p) => p.id).sort();
    expect(left).toEqual(["src0", "src1", "src3"]);                // the Petal cracked; the refused sources untouched
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Lotus Petal"]);
  });

  it("⭐ Basal Sliver on the battlefield is ONE record that sacrifices it; Oddric is none", () => {
    const s = board([BASAL_SLIVER, ODDRIC], []);
    expect(manaSources(s, "user")).toEqual([{ permanentId: "src0", colors: ["B"], amount: 2, sacrifices: true }]);
    expect(actionsOf(s, "tap-for-mana").map((a) => [a.permanentId, a.color, a.amount, a.sacrifices])).toEqual([["src0", "B", 2, true]]);
  });
});

describe("classification", () => {
  // NOTE (2026-10-16): both cards were native-mana. The tier stood on manaProduction, which credited three mana for a
  // cost the engine never charged — the credit was the over-claim. With the source refused they fall to body-only (the
  // Arbiter), where they stay until the discard is paid for real.
  it("Lion's Eye Diamond and Overeager Apprentice are not native-mana; the clean self-sacrifices still are", () => {
    expect(classifyCard(LED)).toBe("body-only");
    expect(classifyCard(APPRENTICE)).toBe("body-only");
    expect(classifyCard(LOTUS_PETAL)).toBe("native-mana");
    expect(classifyCard(SATYR_HEDONIST)).toBe("native-mana");
  });
});
