/**
 * arenaOfGlory.test.js — ARENA OF GLORY (the play-weighted program, EDHREC #372):
 *
 *   "This land enters tapped unless you control a Mountain.
 *    {T}: Add {R}.
 *    {R}, {T}, Exert this land: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn. (An
 *    exerted permanent won't untap during your next untap step.)"
 *
 * The first two lines already read; the exert line had no lane. It nets nothing over the plain tap (its {R} costs what that makes),
 * so a payment never needs it and the planner never sees it (manaModel.manualOnlyManaRecords): it is the explicit tap alone — its
 * pip paid from floating mana — and its {R}{R} float as a TAGGED entry carrying the rider (player.restrictedMana, no spend
 * restriction): a creature spell any of it pays for gains haste until end of turn, and so does the permanent it becomes (CR 400.7a);
 * exerting (CR 701.43a) keeps the land tapped through its controller's next untap step. The bundled rulings witnessed: the mana can
 * be spent on anything; spent on two creature spells, each gains haste; spent on a noncreature spell that makes tokens, they don't;
 * already untapped when the untap step comes, the exert effect ends doing nothing; exerted while borrowed, it untaps during its
 * controller's untap step. The default AI exerts it for a creature it would cast now that gains from haste.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, untapAll } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { permanentHasKeyword } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { actionLabel } from "./actionLabel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ARENA = {"name":"Arena of Glory","type":"Land","mana":"","oracle":"This land enters tapped unless you control a Mountain.\n{T}: Add {R}.\n{R}, {T}, Exert this land: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn. (An exerted permanent won't untap during your next untap step.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Exert"],"colors":[],"colorIdentity":["R"]}; // EDHREC #372
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const RAIDERS = {"name":"Mons's Goblin Raiders","type":"Creature — Goblin","mana":"{R}","oracle":"","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #24664
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const KRENKOS_COMMAND = {"name":"Krenko's Command","type":"Sorcery","mana":"{1}{R}","oracle":"Create two 1/1 red Goblin creature tokens.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #2040
const RAGING = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #16191
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (seat) => Array.from({ length: 5 }, (_, i) => ({ ...PLAINS, id: `L-${seat}-${i}` }));
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
/** `seat`'s precombat main: Arena untapped, `mountains` Mountains, `hand`; `pool` floating. */
function table({ seat = "user", mountains = 2, hand = [], pool = EMPTY, bf = [], phase = "precombat-main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [on(seat, "arena", ARENA), ...Array.from({ length: mountains }, (_, i) => on(seat, `m${i}`, MOUNTAIN)), ...bf];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, hand, graveyard: [], library: lib(seat), landsPlayedThisTurn: 1, manaPool: { ...pool } },
    [opp]: { ...g.players[opp], battlefield: [], hand: [], graveyard: [], library: lib(opp) } };
  return { ...g, turn: 5, phase, step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return finalizeStackResolution(n);
}
const taps = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "tap-for-mana" && a.permanentId === "arena");
const exertTap = (s, seat = "user") => taps(s, seat).find((a) => a.exertHaste);
const castOf = (s, seat, cardId, pred = () => true) => legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a));
const named = (s, seat, name) => s.players[seat].battlefield.filter((p) => p.card?.name === name);
const tagged = (s, seat = "user") => (s.players[seat].restrictedMana || []).map((e) => ({ R: e.pool.R, rider: e.rider?.kind || null }));
/** Exert the land with {R} floating (from `pool`). */
function exert(s, seat = "user") {
  const a = exertTap(s, seat);
  expect(a, "the exert line is not offered").toBeTruthy();
  return dispatchAction(s, a);
}

describe("the card", () => {
  it("⭐ a covered land; the planner sees only its plain {T}: Add {R}", () => {
    const s = table();
    expect({ tier: classifyCard(ARENA), planner: manaSources(s, "user").filter((x) => x.permanentId === "arena").map((x) => [x.colors, x.amount]) }).toEqual({ tier: "land", planner: [[["R"], 1]] });
  });
  it("⭐ the explicit taps: the plain {R}, and the exert line only while {R} floats to pay its pip", () => {
    const dry = taps(table());
    const wet = taps(table({ pool: { ...EMPTY, R: 1 } }));
    expect({ dry: dry.map((a) => [a.color, a.amount, !!a.exertHaste]), wet: wet.map((a) => [a.color, a.amount, !!a.exertHaste]).sort(), label: actionLabel(wet.find((a) => a.exertHaste)) })
      .toEqual({ dry: [["R", 1, false]], wet: [["R", 1, false], ["R", 2, true]], label: "Exert Arena of Glory: pay {R}, add {R}{R} (a creature spell it pays for gains haste)" });
  });
  it("⭐ exerted: the pip is paid, {R}{R} floats tagged with the rider, the land is tapped and exerted (its controller's next untap step)", () => {
    const s = exert(table({ pool: { ...EMPTY, R: 1 } }));
    const arena = named(s, "user", "Arena of Glory")[0];
    expect({ pool: s.players.user.manaPool.R, tagged: tagged(s), tapped: arena?.tapped, exertedFor: arena?.doesNotUntapNext }).toEqual({ pool: 0, tagged: [{ R: 2, rider: "creatureSpellHasteEot" }], tapped: true, exertedFor: "user" });
  });
});

describe("if any of that mana is spent on a creature spell, it gains haste until end of turn", () => {
  it("⭐ Hill Giant paid with it has haste — it can attack this turn — and not after the turn", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...GIANT, id: "h-giant" }] }));
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-giant")));
    const giant = named(s, "user", "Hill Giant")[0];
    const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    const later = { ...s, turn: s.turn + 1, continuousEffects: (s.continuousEffects || []).filter((e) => !(e.duration?.kind === "endOfTurn" && e.duration.turn === s.turn)) };
    expect({ haste: permanentHasKeyword(s, giant?.id, "Haste"), attacks: legalActionsForPlayer(atk, "user").some((a) => a.kind === "declare-attacker" && a.permanentId === giant?.id), tagged: tagged(s), nextTurn: permanentHasKeyword(later, giant?.id, "Haste") })
      .toEqual({ haste: true, attacks: true, tagged: [], nextTurn: false });
  });
  it("CONTROL — the same Giant paid by the Mountains and Arena's plain tap: no haste", () => {
    const s0 = table({ mountains: 3, hand: [{ ...GIANT, id: "h-giant" }] });
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-giant")));
    expect(permanentHasKeyword(s, named(s, "user", "Hill Giant")[0]?.id, "Haste")).toBe(false);
  });
  it("⭐ spent on two creature spells, each gains haste (its ruling): two Goblin Raiders, one {R} each", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...RAIDERS, id: "h-r1" }, { ...RAIDERS, id: "h-r2" }] }));
    const s1 = settle(dispatchAction(s0, castOf(s0, "user", "h-r1")));
    const s = settle(dispatchAction(s1, castOf(s1, "user", "h-r2")));
    expect({ between: tagged(s1), hasty: named(s, "user", "Mons's Goblin Raiders").map((p) => permanentHasKeyword(s, p.id, "Haste")) }).toEqual({ between: [{ R: 1, rider: "creatureSpellHasteEot" }], hasty: [true, true] });
  });
  it("⭐ the mana can pay for anything (its ruling): a Lightning Bolt takes one {R}, gains nothing; the other {R} still hastes a creature", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...BOLT, id: "h-bolt" }, { ...RAIDERS, id: "h-r1" }] }));
    const s1 = settle(dispatchAction(s0, castOf(s0, "user", "h-bolt", (a) => (a.targets || []).some((t) => t.id === "ai"))));
    const s = settle(dispatchAction(s1, castOf(s1, "user", "h-r1")));
    expect({ aiLife: s1.players.ai.life, left: tagged(s1), raider: permanentHasKeyword(s, named(s, "user", "Mons's Goblin Raiders")[0]?.id, "Haste") }).toEqual({ aiLife: 37, left: [{ R: 1, rider: "creatureSpellHasteEot" }], raider: true });
  });
  it("⛔ spent on a noncreature spell that makes tokens (its ruling): Krenko's Command's Goblins don't gain haste", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...KRENKOS_COMMAND, id: "h-kc" }] }));
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-kc")));
    const goblins = s.players.user.battlefield.filter((p) => p.card?.token);
    expect({ goblins: goblins.length, hasty: goblins.some((p) => permanentHasKeyword(s, p.id, "Haste")) }).toEqual({ goblins: 2, hasty: false });
  });
  it("⛔ spent on a noncreature permanent spell (Smuggler's Copter, a Vehicle): it is no creature spell, so the Copter has no haste", () => {
    const COPTER = {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Crew"],"colors":[],"colorIdentity":[]}; // EDHREC #1913
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, mountains: 0, hand: [{ ...COPTER, id: "h-cop" }] }));
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-cop")));
    const copter = named(s, "user", "Smuggler's Copter")[0];
    expect({ copter: !!copter, haste: permanentHasKeyword(s, copter?.id, "Haste"), tagged: tagged(s) }).toEqual({ copter: true, haste: false, tagged: [] });
  });
  it("⭐ the tagged mana empties with the step like any floating mana", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 } }));
    const s = nextStep({ ...s0, consecutivePasses: 0 });
    expect({ step: s.step, tagged: tagged(s) }).toEqual({ step: "beginning-of-combat", tagged: [] });
  });
});

describe("exert", () => {
  it("⭐ the land stays tapped through its controller's next untap step and untaps in the one after", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 } }));
    const u1 = untapAll(s0, { playerId: "user" });
    const u2 = untapAll(u1, { playerId: "user" });
    const a = (s) => named(s, "user", "Arena of Glory")[0];
    expect({ after1: [a(u1)?.tapped, a(u1)?.doesNotUntapNext ?? null], after2: a(u2)?.tapped }).toEqual({ after1: [true, null], after2: false });
  });
  it("⭐ already untapped when that untap step comes (an effect untapped it), the exert ends doing nothing (its ruling)", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 } }));
    const untapped = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: s0.players.user.battlefield.map((p) => (p.id === "arena" ? { ...p, tapped: false } : p)) } } };
    const u1 = untapAll(untapped, { playerId: "user" });
    const arena = named(u1, "user", "Arena of Glory")[0];
    expect({ tapped: arena?.tapped, flag: arena?.doesNotUntapNext ?? null }).toEqual({ tapped: false, flag: null });
  });
  it("⭐ exerted while borrowed (its ruling): back under its owner, it untaps during the owner's step; the exerter's step ends the effect", () => {
    const s0 = table();
    const borrowed = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: s0.players.user.battlefield.filter((p) => p.id !== "arena") },
      ai: { ...s0.players.ai, battlefield: [{ ...on("ai", "arena", ARENA), tapped: true, doesNotUntapNext: "user" }] } } };
    const ownerStep = untapAll(borrowed, { playerId: "ai" });
    const exerterStep = untapAll(ownerStep, { playerId: "user" });
    const a = (s) => s.players.ai.battlefield.find((p) => p.id === "arena");
    expect({ owner: [a(ownerStep)?.tapped, a(ownerStep)?.doesNotUntapNext ?? null], exerter: a(exerterStep)?.doesNotUntapNext ?? null }).toEqual({ owner: [false, "user"], exerter: null });
  });
});

describe("the default AI", () => {
  it("⭐ precombat with a Hill Giant to cast: it floats {R} from a Mountain, exerts Arena, casts the Giant with haste", () => {
    let s = table({ seat: "ai", mountains: 3, hand: [{ ...GIANT, id: "h-giant" }] });
    const p1 = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p1?.kind, permanentId: p1?.permanentId, exert: !!p1?.exertHaste }).toEqual({ kind: "tap-for-mana", permanentId: "m0", exert: false });
    s = dispatchAction(s, p1);
    const p2 = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p2?.kind, permanentId: p2?.permanentId, exert: !!p2?.exertHaste }).toEqual({ kind: "tap-for-mana", permanentId: "arena", exert: true });
    s = dispatchAction(s, p2);
    const p3 = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p3?.kind, cardId: p3?.cardId }).toEqual({ kind: "cast-spell", cardId: "h-giant" });
    s = settle(dispatchAction(s, p3));
    expect(permanentHasKeyword(s, named(s, "ai", "Hill Giant")[0]?.id, "Haste")).toBe(true);
  });
  it("⛔ it doesn't exert for a creature with haste of its own (Raging Goblin) — it just casts it", () => {
    const s = table({ seat: "ai", mountains: 1, hand: [{ ...RAGING, id: "h-rg" }] });
    const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p?.kind, cardId: p?.cardId }).toEqual({ kind: "cast-spell", cardId: "h-rg" });
  });
  it("⛔ it doesn't exert for a creature its {R}{R} can't pay any of (Llanowar Elves' {G}) — it casts the Elves off the Forest", () => {
    const s = table({ seat: "ai", mountains: 2, bf: [on("ai", "f0", { name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)", cmc: 0, keywords: [], colors: [] })], hand: [{ ...ELVES, id: "h-elves" }] });
    const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p?.kind, cardId: p?.cardId }).toEqual({ kind: "cast-spell", cardId: "h-elves" });
  });
  it("⛔ postcombat it doesn't exert (the haste would buy nothing)", () => {
    const s = table({ seat: "ai", mountains: 3, phase: "postcombat-main", hand: [{ ...GIANT, id: "h-giant" }] });
    const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: p?.kind, cardId: p?.cardId }).toEqual({ kind: "cast-spell", cardId: "h-giant" });
  });
});

// CR 707.2 / 707.10 — the haste is an effect of Arena's mana ability on the spell it paid for, not a characteristic or a choice made
// for it: a copy of that spell (Reflections of Littjara, Double Major) does not have it, and the permanent the copy becomes (a token,
// CR 707.10f) enters without haste. The blind review's F1.
const REFLECTIONS = {"name":"Reflections of Littjara","type":"Enchantment","mana":"{4}{U}","oracle":"As this enchantment enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell. (A copy of a permanent spell becomes a token.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #689
const DOUBLE_MAJOR = {"name":"Double Major","type":"Instant","mana":"{G}{U}","oracle":"Copy target creature spell you control, except it isn't legendary if the spell is legendary. (A copy of a creature spell becomes a token.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G","U"],"colorIdentity":["G","U"]}; // EDHREC #3100
const hastyGiants = (s, seat = "user") => {
  const atk = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
  const attackers = new Set(legalActionsForPlayer(atk, seat).filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId));
  return named(s, seat, "Hill Giant").map((p) => ({ token: !!p.card?.token, haste: permanentHasKeyword(s, p.id, "Haste"), attacks: attackers.has(p.id) }))
    .sort((a, b) => Number(b.token) - Number(a.token));
};

describe("a copy of the creature spell it paid for gains nothing (CR 707.2, 707.10)", () => {
  it("⭐ Reflections of Littjara (Giant) copies a Hill Giant paid with the exert mana: the cast Giant has haste and attacks, the token Giant neither", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...GIANT, id: "h-giant" }], bf: [on("user", "refl", REFLECTIONS, { chosenType: "Giant" })] }));
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-giant")));
    expect(hastyGiants(s)).toEqual([{ token: true, haste: false, attacks: false }, { token: false, haste: true, attacks: true }]);
  });
  it("⭐ Double Major copies a Hill Giant paid with the exert mana: the cast Giant has haste and attacks, the token Giant neither", () => {
    const s0 = exert(table({ pool: { ...EMPTY, R: 1 }, hand: [{ ...GIANT, id: "h-giant" }, { ...DOUBLE_MAJOR, id: "h-dm" }] }));
    let s = dispatchAction(s0, castOf(s0, "user", "h-giant"));
    const giantSpell = s.stack.find((o) => o.source?.name === "Hill Giant");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...EMPTY, G: 1, U: 1 } } } };
    const dm = castOf(s, "user", "h-dm", (a) => (a.targets || []).some((t) => t.id === giantSpell?.id));
    expect(dm, "no Double Major cast at the Giant spell").toBeTruthy();
    s = settle(dispatchAction(s, dm));
    expect(hastyGiants(s)).toEqual([{ token: true, haste: false, attacks: false }, { token: false, haste: true, attacks: true }]);
  });
  it("CONTROL — Reflections copies a Hill Giant paid by the Mountains and Arena's plain tap: neither Giant has haste", () => {
    const s0 = table({ mountains: 3, hand: [{ ...GIANT, id: "h-giant" }], bf: [on("user", "refl", REFLECTIONS, { chosenType: "Giant" })] });
    const s = settle(dispatchAction(s0, castOf(s0, "user", "h-giant")));
    expect(hastyGiants(s)).toEqual([{ token: true, haste: false, attacks: false }, { token: false, haste: false, attacks: false }]);
  });
});
