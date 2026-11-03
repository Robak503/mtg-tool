/**
 * lootExuberantExplorer.test.js — LOOT, EXUBERANT EXPLORER (the play-weighted program, EDHREC #883):
 *
 *   "You may play an additional land on each of your turns.
 *    {4}{G}{G}, {T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to
 *    the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order."
 *
 * The extra land drop already read; the dig had no reader. It is the battlefield dig (spanMatchers.matchImpulseDig 2b') with its
 * mana-value cap a COUNT — the lands its controller controls, read once as the ability resolves (CR 608.2h) — so a card's mana value
 * is compared with it: an {X} card's X is 0 there (CR 202.3e; the bundled ruling). Declining is allowed ("You may"); the rest go to the
 * bottom at random. Played through the real paths: the activation offered and paid (legalChoices, the dispatcher), the stack, the
 * dig's choice settled (runProgram.resolveImpulseDigChoice — the default AI's pick is runProgram.autoPickTutorCandidate, the
 * highest mana value among what it may take). Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, landDropAllowance } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveImpulseDigChoice, resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LOOT = {"name":"Loot, Exuberant Explorer","type":"Legendary Creature — Beast Noble","mana":"{2}{G}","oracle":"You may play an additional land on each of your turns.\n{4}{G}{G}, {T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order.","layout":"normal","cmc":3,"power":"1","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #883
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const HANGARBACK = {"name":"Hangarback Walker","type":"Artifact Creature — Construct","mana":"{X}{X}","oracle":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature.","layout":"normal","cmc":0,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1522
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","oracle":"Shock deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2215
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]};
const GHOST_QUARTER = {"name":"Ghost Quarter","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #829

const LIBRARY = [
  { ...BEARS, id: "l-bears" }, { ...GIANT, id: "l-giant" }, { ...WURM, id: "l-wurm" }, { ...HANGARBACK, id: "l-hang" }, { ...SHOCK, id: "l-shock" }, { ...FOREST, id: "l-forest" },
  { ...MOUNTAIN, id: "l-seventh" },
];
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `seat`'s precombat main: Loot untapped, `lands` Forests, {4}{G}{G} floating (so no land is tapped to pay), the seven-card library. */
function table({ seat = "user", lands = 4, oppLands = 0, extra = [], oppExtra = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const bf = [on(seat, "loot", LOOT), ...Array.from({ length: lands }, (_, i) => on(seat, `f${i}`, FOREST)), ...extra];
  const obf = [...Array.from({ length: oppLands }, (_, i) => on(opp, `o${i}`, MOUNTAIN)), ...oppExtra];
  const players = {
    ...g.players,
    [seat]: { ...g.players[seat], battlefield: bf, hand: [], library: LIBRARY.map((c) => ({ ...c })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 4 }, landsPlayedThisTurn: 0 },
    [opp]: { ...g.players[opp], battlefield: obf, hand: [], library: [{ ...FOREST, id: "ol-forest" }] },
  };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const digAction = (s, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "loot");
/** Activate the dig and resolve it to its choice. */
function dig(s, seat = "user") {
  const act = digAction(s, seat);
  expect(act, "Loot's dig is not offered").toBeTruthy();
  const paused = resolveTopOfStack(dispatchAction(s, act));
  expect(paused.pendingChoice?.kind, "the dig did not reach its choice").toBe("impulse-dig");
  return paused;
}
const ids = (cards) => cards.map((c) => c.id).sort();
const onBattlefield = (s, seat, id) => (s.players[seat].battlefield || []).some((p) => p.card?.id === id);

describe("the card", () => {
  it("⭐ native: the dig reads as a battlefield dig whose mana-value cap is the lands you control", () => {
    const ab = parseActivatedAbilities(LOOT).find((a) => a.manaPips === "{4}{G}{G}");
    expect({ tier: classifyCard(LOOT), modeled: ab?.modeled, atoms: ab?.program?.atoms }).toEqual({
      tier: "native-mixed", modeled: true,
      atoms: [{ op: "impulse-dig", amount: 6, restTo: "bottom", filter: { groups: [["creature"]] }, mvMaxCount: { kind: "permanentsYouControl", cardType: "land" },
        filterLabel: "creature card with mana value less than or equal to the number of lands you control", chosenTo: "battlefield", restOrder: "random" }],
    });
  });
  it("the first line still reads: two land drops a turn", () => {
    expect(landDropAllowance(table(), "user")).toBe(2);
  });
});

describe("the dig", () => {
  it("⭐ four lands: the creature cards of mana value 4 or less are offered (not the Wurm, not the Shock or the Forest); the Giant enters, the rest go to the bottom", () => {
    const paused = dig(table({ lands: 4 }));
    expect(ids(paused.pendingChoice.candidates)).toEqual(["l-bears", "l-giant", "l-hang"]);
    const out = resolveImpulseDigChoice(paused, "l-giant");
    const lib = out.players.user.library;
    expect({ giant: onBattlefield(out, "user", "l-giant"), libSize: lib.length, top: lib[0].id, bottom: ids(lib.slice(1)), hand: out.players.user.hand.length,
      lootTapped: out.players.user.battlefield.find((p) => p.id === "loot").tapped, pending: out.pendingChoice ?? null })
      .toEqual({ giant: true, libSize: 6, top: "l-seventh", bottom: ["l-bears", "l-forest", "l-hang", "l-shock", "l-wurm"], hand: 0, lootTapped: true, pending: null });
  });
  it("⭐ six lands: the Wurm (mana value 6) may be taken too", () => {
    const paused = dig(table({ lands: 6 }));
    expect(ids(paused.pendingChoice.candidates)).toEqual(["l-bears", "l-giant", "l-hang", "l-wurm"]);
    expect(onBattlefield(resolveImpulseDigChoice(paused, "l-wurm"), "user", "l-wurm")).toBe(true);
  });
  it("⭐ one land: only the Hangarback Walker (an {X} card's mana value is 0 in the library — the bundled ruling); it enters with no counters and dies", () => {
    const paused = dig(table({ lands: 1 }));
    expect(ids(paused.pendingChoice.candidates)).toEqual(["l-hang"]);
    const out = finalizeStackResolution(resolveImpulseDigChoice(paused, "l-hang")); // the state-based check the session runs after the settle
    expect({ onBf: onBattlefield(out, "user", "l-hang"), inGy: out.players.user.graveyard.some((c) => c.id === "l-hang") }).toEqual({ onBf: false, inGy: true });
  });
  it("⛔ the lands an OPPONENT controls are not counted: two lands of yours beside eight of theirs offer mana value 2 or less", () => {
    const paused = dig(table({ lands: 2, oppLands: 8 }));
    expect(ids(paused.pendingChoice.candidates)).toEqual(["l-bears", "l-hang"]);
  });
  it("⭐ the count is read as the ability resolves (CR 608.2h): an opponent's Ghost Quarter destroys one of four Forests in response — mana value 3 or less, the Giant is out", () => {
    let s = table({ lands: 4, oppExtra: [on("ai", "gq", GHOST_QUARTER)] });
    const act = digAction(s);
    expect(act, "Loot's dig is not offered").toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.stack.length).toBe(1);
    s = { ...s, priorityHolder: "ai" };
    const gq = legalActionsForPlayer(s, "ai").find((a) => a.kind === "activate-ability" && a.permanentId === "gq" && (a.targets || []).some((t) => t.id === "f0"));
    expect(gq, "the Ghost Quarter activation at a Forest is not offered").toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, gq));
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, null);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Forest").length).toBe(3);
    const paused = resolveTopOfStack(s);
    expect(paused.pendingChoice?.kind).toBe("impulse-dig");
    expect(ids(paused.pendingChoice.candidates)).toEqual(["l-bears", "l-hang"]);
  });
  it("declined (\"You may\"): nothing enters; all six looked-at cards go to the bottom, the seventh card is on top", () => {
    const out = resolveImpulseDigChoice(dig(table({ lands: 4 })), null);
    expect({ entered: out.players.user.battlefield.filter((p) => LIBRARY.some((c) => c.id === p.card?.id)).length, top: out.players.user.library[0].id, size: out.players.user.library.length })
      .toEqual({ entered: 0, top: "l-seventh", size: 7 });
  });
  it("⛔ not offered without {4}{G}{G}, and not offered tapped", () => {
    const poor = table();
    const noMana = { ...poor, players: { ...poor.players, user: { ...poor.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 }, battlefield: poor.players.user.battlefield.map((p) => (p.card?.name === "Forest" ? { ...p, tapped: true } : p)) } } };
    const tapped = { ...poor, players: { ...poor.players, user: { ...poor.players.user, battlefield: poor.players.user.battlefield.map((p) => (p.id === "loot" ? { ...p, tapped: true } : p)) } } };
    expect({ noMana: digAction(noMana), tapped: digAction(tapped) }).toEqual({ noMana: undefined, tapped: undefined });
  });
});

describe("the default AI", () => {
  it("⭐ an AI's dig takes the highest mana value it may take (the Giant at four lands, never the Wurm), and it enters under the AI", () => {
    const paused = dig(table({ seat: "ai", lands: 4 }), "ai");
    const pick = autoPickTutorCandidate(paused, paused.pendingChoice);
    const out = resolveImpulseDigChoice(paused, pick);
    expect({ pick, entered: onBattlefield(out, "ai", "l-giant"), wurm: onBattlefield(out, "ai", "l-wurm") }).toEqual({ pick: "l-giant", entered: true, wurm: false });
  });
});
