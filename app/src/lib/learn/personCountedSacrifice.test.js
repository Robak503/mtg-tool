/**
 * personCountedSacrifice.test.js — A PERSON'S COUNTED SACRIFICE, told apart and paid (pw29's review, F4 and F6; its round-2 recheck,
 * R2-F1; pw28's round-4 recheck, R4-N1):
 *
 * legalChoices' countedChoicesFor gives a seat a person plays one offer per set of permanents a counted sacrifice may be paid with
 * (CR 602.2b, 601.2h). Two permanents are one choice only when nothing on the state tells them apart (the shared
 * interchangeablePayerKey — a blocker, a layer-1 copy, a pumped or exerted creature, a chosen type, a per-turn ledger key keep each its
 * own; its id boundary is a letter, a digit or a hyphen, so an underscore-joined ledger key such as "otpt_<id>_dies" names it), so
 * identical payers are one offer; each offer names its set (`sacCountNames`, payerLabels — the printed name plus what tells it apart),
 * and each set's mana is checked against the sources it leaves (`emitRow` — a permanent sacrificed for the cost can't also tap for mana).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { interchangeablePayerKey, legalActionsForPlayer } from "./legalChoices.js";
import { applyBecomeCopy } from "./effects/atoms/becomeCopy.js";
import { detectTriggers } from "./triggers.js";
import { permanentPower } from "./layers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { actionLabel } from "./actionLabel.js";

beforeEach(() => _resetIdsForTests());

const KNAVE = {"name":"Ruthless Knave","type":"Creature — Orc Pirate","mana":"{2}{B}","oracle":"{2}{B}, Sacrifice a creature: Create two Treasure tokens. (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")\nSacrifice three Treasures: Draw a card.","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Treasure"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #9259
const ENGINEERS = {"name":"Krark-Clan Engineers","type":"Creature — Goblin Artificer","mana":"{3}{R}","oracle":"{R}, Sacrifice two artifacts: Destroy target artifact.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #27569
const FIRE_DIAMOND = {"name":"Fire Diamond","type":"Artifact","mana":"{2}","oracle":"This artifact enters tapped.\n{T}: Add {R}.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #724
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","oracle":"({T}: Add {B}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["B"]}; // EDHREC #—
const PRIEST = {"name":"Priest of Forgotten Gods","type":"Creature — Human Cleric","mana":"{1}{B}","oracle":"{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and draw a card. (Activate only as an instant.)","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1391
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const MORBID = {"name":"Morbid Opportunist","type":"Creature — Human Rogue","mana":"{2}{B}","oracle":"Whenever one or more other creatures die, draw a card. This ability triggers only once each turn.","layout":"normal","cmc":3,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #249
const MIMIC = {"name":"Metallic Mimic","type":"Artifact Creature — Shapeshifter","mana":"{2}","oracle":"As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #961
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const ZOMBIE = { name: "Zombie", type: "Token Creature — Zombie", mana: "", oracle: "", layout: "token", cmc: 0, power: "2", toughness: "2", loyalty: null, keywords: [], colors: ["B"], colorIdentity: ["B"], token: true };
const THOPTER = { name: "Thopter", type: "Token Artifact Creature — Thopter", mana: "", oracle: "Flying", layout: "token", cmc: 0, power: "1", toughness: "1", loyalty: null, keywords: ["Flying"], colors: [], colorIdentity: [], token: true };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", mana: "", oracle: "{T}, Sacrifice this token: Add one mana of any color.", layout: "token", cmc: 0, power: null, toughness: null, loyalty: null, keywords: [], colors: [], colorIdentity: [], token: true };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
function table({ seat = "user", boards = {}, human = true } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: [], library: Array.from({ length: 3 }, (_, i) => ({ ...SWAMP, id: `lib${i}-${pid}` })), manaPool: { ...EMPTY } };
  }
  return { ...g, ...(human ? { humanSeats: ["user"] } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const offersOf = (s, seat, permId, abilityIndex) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === permId && (abilityIndex == null || a.abilityIndex === abilityIndex));
const treasures = (seat, tappedId = null) => ["t1", "t2", "t3", "t4"].map((id) => on(seat, id, TREASURE, id === tappedId ? { tapped: true } : {}));

describe("identical payers are one choice, and each choice is named (F4)", () => {
  it("⭐ Ruthless Knave's \"Sacrifice three Treasures\" beside four Treasures, one tapped: two offers, labelled apart; the one with the tapped Treasure keeps an untapped one", () => {
    const s0 = table({ boards: { user: [on("user", "knave", KNAVE), ...treasures("user", "t2")] } });
    const offers = offersOf(s0, "user", "knave").filter((a) => (a.sacCountIds || []).length === 3);
    expect(offers.map((a) => actionLabel(a)).sort()).toEqual([
      "Activate Ruthless Knave: Sacrifice Treasure, Treasure, Treasure (tapped): Draw a card",
      "Activate Ruthless Knave: Sacrifice Treasure, Treasure, Treasure: Draw a card",
    ]);
    expect(offers.map((a) => a.sacCountNames.join(", ")).sort()).toEqual(["Treasure, Treasure, Treasure", "Treasure, Treasure, Treasure (tapped)"]);
    const keepUntapped = offers.find((a) => a.sacCountIds.includes("t2"));
    const done = resolveTopOfStack(dispatchAction(s0, keepUntapped));
    const left = done.players.user.battlefield.filter((p) => p.card?.name === "Treasure");
    expect({ left: left.length, untapped: left.every((p) => !p.tapped), hand: done.players.user.hand.map((c) => c.id) }).toEqual({ left: 1, untapped: true, hand: ["lib0-user"] });
  });
  it("⭐ four identical untapped Treasures: one offer (they pay alike)", () => {
    const s0 = table({ boards: { user: [on("user", "knave", KNAVE), ...treasures("user")] } });
    expect(offersOf(s0, "user", "knave").filter((a) => (a.sacCountIds || []).length === 3).length).toBe(1);
  });
  it("control: a seat no person plays keeps the one house set and its label", () => {
    const s0 = table({ seat: "ai", human: false, boards: { ai: [on("ai", "knave", KNAVE), ...treasures("ai", "t2")] } });
    const offers = offersOf(s0, "ai", "knave").filter((a) => (a.sacCountIds || []).length === 3);
    expect({ n: offers.length, names: offers[0]?.sacCountNames ?? null }).toEqual({ n: 1, names: null });
  });
});

describe("each set's mana is paid from what it leaves (F6)", () => {
  it("⭐ Krark-Clan Engineers ({R}, Sacrifice two artifacts) with two Ornithopters and Fire Diamond: only the two Ornithopters pay — Fire Diamond is the {R}; every offer dispatches", () => {
    const s0 = table({ boards: { user: [on("user", "eng", ENGINEERS), on("user", "o1", ORNITHOPTER), on("user", "o2", ORNITHOPTER), on("user", "fd", FIRE_DIAMOND)], ai: [on("ai", "sol", SOL)] } });
    const offers = offersOf(s0, "user", "eng");
    expect(offers.length).toBeGreaterThan(0);
    const sets = [...new Set(offers.map((a) => [...a.sacCountIds].sort().join("+")))];
    expect(sets).toEqual(["o1+o2"]);
    for (const a of offers) {
      const after = dispatchAction(s0, a);
      expect(after.players.user.battlefield.find((p) => p.id === "fd")?.tapped).toBe(true);
    }
    const atSol = offers.find((a) => a.targets?.[0]?.id === "sol");
    const done = resolveTopOfStack(dispatchAction(s0, atSol));
    expect({ sol: done.players.ai.battlefield.some((p) => p.id === "sol"), gy: done.players.user.graveyard.map((c) => c.id).sort() }).toEqual({ sol: false, gy: ["c-o1", "c-o2"] });
  });
});

/** The distinct sets a person's offers sacrifice, each as its sorted payer labels joined by " + ". */
const offeredSets = (offers) => [...new Set(offers.map((a) => [...(a.sacCountNames || [])].sort().join(" + ")))].sort();
const idSets = (offers) => [...new Set(offers.map((a) => [...(a.sacCountIds || [])].sort().join("+")))].sort();
const priestOffers = (s) => offersOf(s, "user", "priest");

describe("permanents the state tells apart stay apart (the round-2 recheck, R2-F1)", () => {
  it("⭐ three Zombie tokens, z3 blocking the AI's Hill Giant: a person may sacrifice the blocker — {z1, z3} is offered beside {z1, z2}, labelled with the blocker", () => {
    const base = table({ seat: "ai", boards: { user: [on("user", "priest", PRIEST), on("user", "z1", ZOMBIE), on("user", "z2", ZOMBIE), on("user", "z3", ZOMBIE)], ai: [on("ai", "giant", GIANT, { tapped: true })] } });
    const s0 = { ...base, phase: "combat", step: "declare-blockers", activePlayer: "ai", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "giant", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "z3", blockingPlayer: "user", attackerId: "giant" }] } };
    const offers = priestOffers(s0);
    expect(offeredSets(offers)).toEqual(["Zombie + Zombie", "Zombie + Zombie (blocking Hill Giant)"]);
    expect(idSets(offers)).toEqual(["z1+z2", "z1+z3"]);
    const withBlocker = offers.find((a) => a.sacCountIds.includes("z3") && (a.targets || []).length === 0);
    expect(actionLabel(withBlocker)).toContain("Zombie (blocking Hill Giant)");
    const done = resolveTopOfStack(dispatchAction(s0, withBlocker));
    expect(done.players.user.battlefield.map((p) => p.id).sort()).toEqual(["priest", "z2"]);
  });
  it("⭐ a layer-1 copy (Grizzly Bears that became a Hill Giant) is not the plain Grizzly Bears: both pairs are offered, and taking the \"Grizzly Bears\" offer keeps the 3/3", () => {
    let s0 = table({ boards: { user: [on("user", "priest", PRIEST), on("user", "elves", ELVES), on("user", "bA", BEARS), on("user", "bB", BEARS)], ai: [on("ai", "giant", GIANT)] } });
    s0 = applyBecomeCopy(s0, { op: "become-copy", targetType: "creature" }, { sourceId: "bA", controller: "user", targets: [{ id: "giant", type: "creature", controller: "ai" }] });
    expect(permanentPower(s0, "bA")).toBe(3);
    const offers = priestOffers(s0);
    expect(offeredSets(offers)).toEqual(["Grizzly Bears (copy of Hill Giant) + Llanowar Elves", "Grizzly Bears + Grizzly Bears (copy of Hill Giant)", "Grizzly Bears + Llanowar Elves"]);
    const plain = offers.find((a) => [...a.sacCountNames].sort().join(" + ") === "Grizzly Bears + Llanowar Elves" && (a.targets || []).length === 0);
    const done = resolveTopOfStack(dispatchAction(s0, plain));
    expect({ left: done.players.user.battlefield.map((p) => p.id).sort(), power: permanentPower(done, "bA") }).toEqual({ left: ["bA", "priest"], power: 3 });
  });
  it("⭐ two Metallic Mimics with different chosen types are two choices beside an Ornithopter (Krark-Clan Engineers)", () => {
    const s0 = table({ boards: { user: [on("user", "eng", ENGINEERS), on("user", "mm1", MIMIC, { chosenType: "Elf" }), on("user", "mm2", MIMIC, { chosenType: "Goblin" }), on("user", "orn", ORNITHOPTER), on("user", "mtn", MOUNTAIN)], ai: [on("ai", "sol", SOL)] } });
    const atSol = offersOf(s0, "user", "eng").filter((a) => a.targets?.[0]?.id === "sol");
    expect(idSets(atSol)).toEqual(["mm1+mm2", "mm1+orn", "mm2+orn"]);
    expect(offeredSets(atSol)).toEqual(["Metallic Mimic (Elf chosen) + Metallic Mimic (Goblin chosen)", "Metallic Mimic (Elf chosen) + Ornithopter", "Metallic Mimic (Goblin chosen) + Ornithopter"]);
  });
});

describe("an underscore-joined ledger key names its permanent (pw28's round-4 recheck, R4-N1)", () => {
  const priestBoard = (fired) => ({ ...table({ boards: { user: [on("user", "priest", PRIEST), on("user", "elves", ELVES), on("user", "mo1", MORBID), on("user", "mo2", MORBID)] } }), ...(fired ? { onceTriggersFiredThisTurn: fired } : {}) });
  it("⭐ two Morbid Opportunists, one of which already drew this turn (its once-each-turn ledger key): keeping either is a choice — {Elves, mo1} and {Elves, mo2} are both offered", () => {
    const event = detectTriggers(MORBID)[0]?.event;
    expect(event).toBeTruthy();
    expect(idSets(priestOffers(priestBoard({ [`otpt_mo1_${event}`]: true })))).toEqual(["elves+mo1", "elves+mo2", "mo1+mo2"]);
  });
  it("control: with no ledger key the two Morbid Opportunists pay alike — the Elves beside one of them is one offer", () => {
    expect(idSets(priestOffers(priestBoard(null))).length).toBe(2);
  });
  it("⭐ two identical Thopter tokens with only \"otpt_tok-2_dies\" set on one: two keys (and with none set, one)", () => {
    const board = (fired) => ({ ...table({ boards: { user: [on("user", "tok-1", THOPTER), on("user", "tok-2", THOPTER)] } }), ...(fired ? { onceTriggersFiredThisTurn: fired } : {}) });
    const keys = (s) => s.players.user.battlefield.map((p) => interchangeablePayerKey(s, p));
    const [k1, k2] = keys(board({ "otpt_tok-2_dies": true }));
    expect(k1 === k2).toBe(false);
    const [c1, c2] = keys(board(null));
    expect(c1).toBe(c2);
  });
});
