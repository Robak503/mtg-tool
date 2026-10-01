/**
 * realityShift.test.js — Reality Shift and turning a manifest face up (the play-weighted program, P·19, 2026-10-01: EDHREC
 * rank #273; CR 701.40a/b/g, 708.8, 116.2b, 608.2b).
 *
 *   Reality Shift (Instant {1}{U}): "Exile target creature. Its controller manifests the top card of their library."
 *
 * The rider rides the removal controller-rider (captured before the exile, like Path to Exile's search). What makes the claim
 * honest is the other half: a manifested creature card can be turned face up any time its controller has priority by paying
 * its mana cost (CR 701.40b) — a special action the engine now offers. Without it the opponent's manifest would be a 2/2
 * forever, a stronger card than printed. Manifest dread benefits too (it played as a vanilla 2/2 until now).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { manifestCard } from "./effects/atoms/manifest.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectProgram } from "./effects/parser.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REALITY_SHIFT = { name: "Reality Shift", type: "Instant", mana: "{1}{U}", cmc: 2, colors: ["U"], keywords: ["Manifest"],
  oracle: "Exile target creature. Its controller manifests the top card of their library. (That player puts the top card of their library onto the battlefield face down as a 2/2 creature. If it's a creature card, it can be turned face up any time for its mana cost.)" };
const SOUL_SUMMONS = { name: "Soul Summons", type: "Sorcery", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Manifest"],
  oracle: "Manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Draw two cards." };

/** Two players; the user holds priority in their main phase. `aiTop` heads the opponent's library. */
function table({ aiTop = WURM, userTop = WURM } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: [{ ...REALITY_SHIFT, id: "rs" }, { ...SOUL_SUMMONS, id: "ss" }], library: [{ ...userTop, id: "u-top" }], manaPool: { ...g.players.user.manaPool, U: 2, W: 1, C: 1 } },
      ai: { ...g.players.ai, library: [{ ...aiTop, id: "ai-top" }], battlefield: [createPermanent({ id: "p-bears", card: { ...BEARS, id: "bears" }, controller: "ai", summoningSick: false })] } } };
}
const shift = (s) => resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "rs" && a.targets?.[0]?.id === "p-bears")));
const faceDowns = (s, pid) => s.players[pid].battlefield.filter((p) => p.faceDown);
/** A face-down manifest of `card` already under `pid`, with the given mana floating and priority. */
function manifested(card, { pid = "user", pool = {}, damage = 0, counters = {} } = {}) {
  const base = table();
  const withLib = { ...base, priorityHolder: pid, players: { ...base.players, [pid]: { ...base.players[pid], hand: [], library: [{ ...card, id: "m-card" }],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } }; // exactly `pool`, an empty hand — only the turn-up is on offer
  const s = manifestCard(withLib, pid, withLib.players[pid].library[0]);
  const fd = faceDowns(s, pid)[0];
  return { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: s.players[pid].battlefield.map((p) => (p.id === fd.id ? { ...p, damageMarked: damage, counters: { ...p.counters, ...counters } } : p)) } } };
}
const turnUps = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "turn-face-up");

describe("the cards", () => {
  it("Reality Shift is an exile with a manifest controller-rider; both it and Soul Summons are native-spell", () => {
    expect({ atoms: parseEffectProgram(REALITY_SHIFT).atoms.map((a) => [a.op, a.controllerRider?.kind]), tiers: [classifyCard(REALITY_SHIFT), classifyCard(SOUL_SUMMONS)] })
      .toEqual({ atoms: [["exile", "manifestTop"]], tiers: ["native-spell", "native-spell"] });
  });
});

describe("Reality Shift", () => {
  it("exiles their creature and they manifest their top card face down (WITNESS)", () => {
    const s = shift(table());
    const fd = faceDowns(s, "ai")[0];
    const witness = { exiled: s.players.ai.exile.map((c) => c.name), faceDown: fd && { name: fd.card.name, size: [permanentPower(s, fd.id), permanentToughness(s, fd.id)], real: fd.faceUpCard?.name }, library: s.players.ai.library.length };
    console.log(`WITNESS realityShift ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ exiled: ["Grizzly Bears"], faceDown: { name: "", size: [2, 2], real: "Craw Wurm" }, library: 0 });
  });

  it("⛔ the target gone before it resolves: the spell fizzles — nobody manifests (CR 608.2b)", () => {
    const s0 = table();
    const cast = dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "rs"));
    const gone = { ...cast, players: { ...cast.players, ai: { ...cast.players.ai, battlefield: [] } } };
    expect(faceDowns(resolveTopOfStack(gone), "ai")).toEqual([]);
  });
});

describe("turning a manifest face up (CR 701.40b)", () => {
  it("its controller pays the card's mana cost and it becomes that creature — the same permanent, its counters kept (CR 708.8)", () => {
    const s = manifested(WURM, { pool: { G: 6 }, counters: { "+1/+1": 1 } });
    const fd = faceDowns(s, "user")[0];
    const offer = turnUps(s);
    const up = dispatchAction(s, offer[0]);
    const now = up.players.user.battlefield.find((p) => p.id === fd.id);
    expect({ offered: offer.map((a) => [a.name, a.cost.generic, a.cost.G]), name: now.card.name, faceDown: !!now.faceDown, size: [permanentPower(up, fd.id), permanentToughness(up, fd.id)], pool: up.players.user.manaPool.G })
      .toEqual({ offered: [["Craw Wurm", 4, 2]], name: "Craw Wurm", faceDown: false, size: [7, 5], pool: 0 });
  });

  it("⛔ an instant or sorcery card stays face down (CR 701.40g); an unaffordable cost or another player's priority offers nothing", () => {
    expect([turnUps(manifested(DIVINATION, { pool: { U: 3 } })).length, turnUps(manifested(WURM, { pool: { G: 5 } })).length,
      turnUps({ ...manifested(WURM, { pool: { G: 6 } }), priorityHolder: "ai" }).length]).toEqual([0, 0, 0]);
  });

  it("⛔ a creature card with no mana cost can't pay one (CR 118.6 — Dryad Arbor), and an {X} cost isn't offered (Hangarback Walker)", () => {
    const ARBOR = { name: "Dryad Arbor", type: "Land Creature — Forest Dryad", mana: "", cmc: 0, colors: [], power: "1", toughness: "1", keywords: [],
      oracle: "(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")" };
    const HANGARBACK = { name: "Hangarback Walker", type: "Artifact Creature — Construct", mana: "{X}{X}", cmc: 0, colors: [], power: "0", toughness: "0", keywords: [],
      oracle: "This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature." };
    expect([turnUps(manifested(ARBOR, { pool: { G: 3 } })).length, turnUps(manifested(HANGARBACK, { pool: { C: 4 } })).length]).toEqual([0, 0]);
  });

  it("⛔ a card whose own text triggers on its flip is never turned up (Kadena's Silencer) — the trigger the engine doesn't fire never fires", () => {
    const SILENCER = { name: "Kadena's Silencer", type: "Creature — Snake Wizard", mana: "{1}{U}", cmc: 2, colors: ["U"], power: "2", toughness: "1", keywords: ["Megamorph"],
      oracle: "When this creature is turned face up, counter all abilities your opponents control.\nMegamorph {1}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)" };
    expect(turnUps(manifested(SILENCER, { pool: { U: 2 } })).length).toBe(0);
  });

  it("⛔ a WATCHER of other permanents' flips is reachable now, so it is residue — Trail of Mystery and Mastery of the Unseen stay body-only", () => {
    const TRAIL = { name: "Trail of Mystery", type: "Enchantment", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [],
      oracle: "Whenever a face-down creature you control enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nWhenever a permanent you control is turned face up, if it's a creature, it gets +2/+2 until end of turn." };
    const MASTERY = { name: "Mastery of the Unseen", type: "Enchantment", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Manifest"],
      oracle: "Whenever a permanent you control is turned face up, you gain 1 life for each creature you control.\n{3}{W}: Manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)" };
    expect([classifyCard(TRAIL), classifyCard(MASTERY)]).toEqual(["body-only", "body-only"]);
  });

  it("⛔ a crafted turn-up of a manifested sorcery is refused by the dispatcher", () => {
    const s = manifested(DIVINATION, { pool: { U: 3 } });
    const fd = faceDowns(s, "user")[0];
    expect(() => dispatchAction(s, { kind: "turn-face-up", playerId: "user", permanentId: fd.id, name: "Divination", cost: { generic: 2, U: 1 }, cmc: 3 }))
      .toThrow(/stays face down/);
  });

  it("the damage it carries stays: a 2/2 with 1 damage turned into a 1/1 dies", () => {
    const s = manifested(ELVES, { pool: { G: 1 }, damage: 1 });
    const up = dispatchAction(s, turnUps(s)[0]);
    expect({ battlefield: up.players.user.battlefield.length, graveyard: up.players.user.graveyard.map((c) => c.name) }).toEqual({ battlefield: 0, graveyard: ["Llanowar Elves"] });
  });

  it("Soul Summons manifests your own top card", () => {
    const s = table({ userTop: BEARS });
    const done = resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "ss")));
    expect(faceDowns(done, "user").map((p) => p.faceUpCard?.name)).toEqual(["Grizzly Bears"]);
  });

  it("the AI turns up a manifest bigger than a 2/2 on its main phase, and leaves a smaller one down", () => {
    const big = manifested(WURM, { pool: { G: 6 } });
    const small = manifested(ELVES, { pool: { G: 1 } });
    const pick = (s) => pickAction(s, "user", legalActionsForPlayer(s, "user"))?.kind;
    expect([pick(big), pick(small)]).toEqual(["turn-face-up", "pass-priority"]);
  });
});
