/**
 * sepharaSkysBlade.test.js — SEPHARA, SKY'S BLADE (the play-weighted program, EDHREC #1374):
 *
 *   "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost.
 *    Flying, lifelink
 *    Other creatures you control with flying have indestructible."
 *
 * The first line was the one unread: an alternative cost of {W} and four untapped creatures with flying tapped (castModifiers'
 * payManaTapCreatures; legalChoices' alternative-cost lane — the payments are sets of four untapped creatures you control that have
 * flying now, CR 118.9, 601.2b, 601.2h; a person's seat chooses which, every other seat pays the house's four least valuable). The {W}
 * is paid like any mana cost after the increases (CR 118.9d — the commander tax from the command zone, CR 903.8), and a creature tapped
 * for the cost can't also tap for that mana (CR 601.2g, 601.2h). Its rulings: any untapped creatures with flying may be tapped, the
 * summoning-sick ones too (CR 302.6 bars only their own {T} abilities); the total cost starts from the alternative cost, then the
 * increases and reductions; the mana value stays 7.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { extractAltCost } from "./effects/castModifiers.js";
import { expandCostChoices } from "./costChoices.js";
import { pickAction } from "./opponentAI.js";
import { actionLabel } from "./actionLabel.js";

beforeEach(() => _resetIdsForTests());

const SEPHARA = {"name":"Sephara, Sky's Blade","type":"Legendary Creature — Angel","mana":"{4}{W}{W}{W}","oracle":"You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost.\nFlying, lifelink\nOther creatures you control with flying have indestructible. (Damage and effects that say \"destroy\" don't destroy them.)","layout":"normal","cmc":7,"power":"7","toughness":"7","loyalty":null,"keywords":["Flying","Lifelink"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1374
const HAWK = {"name":"Suntail Hawk","type":"Creature — Bird","mana":"{W}","oracle":"Flying","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #19959
const DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","oracle":"Flying","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #26647
const ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #9445
const BIRDS = {"name":"Birds of Paradise","type":"Creature — Bird","mana":"{G}","oracle":"Flying\n{T}: Add one mana of any color.","layout":"normal","cmc":1,"power":"0","toughness":"1","loyalty":null,"keywords":["Flying"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #35
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const PHYREXIAN_ALTAR = {"name":"Phyrexian Altar","type":"Artifact","mana":"{3}","oracle":"Sacrifice a creature: Add one mana of any color.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #309
const ASHNODS_ALTAR = {"name":"Ashnod's Altar","type":"Artifact","mana":"{3}","oracle":"Sacrifice a creature: Add {C}{C}.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #134
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `seat` active with priority in its precombat main, Sephara in hand (or in the command zone); the person plays the user seat. */
function table({ seat = "user", boards = {}, human = true, commander = false, castCount = 0 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const mine = pid === seat;
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], library: [], manaPool: { ...EMPTY },
      hand: mine && !commander ? [{ ...SEPHARA, id: "h-seph" }] : [],
      command: mine && commander ? [{ ...SEPHARA, id: "h-seph", isCommander: true, commanderInstanceId: `${pid}::h-seph` }] : [], // the instance key createGameState stamps
      commanderCastCount: mine && commander ? { [`${pid}::h-seph`]: castCount } : {} };
  }
  return { ...g, ...(human ? { humanSeats: ["user"] } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const sephCasts = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.cardId === "h-seph");
const altCast = (s, seat = "user") => sephCasts(s, seat).find((a) => a.altCost);
/** Every payment of the alternative cast, as the sorted ids of the four creatures it taps. */
const paymentSets = (a) => (a ? expandCostChoices(a).map((v) => [...v.altCost.tapCreatureIds].sort().join("+")).sort() : []);
/** Every payment of the alternative cast, as the sorted names of the four creatures it taps (two that pay alike are one payment). */
const paymentNames = (a) => (a ? expandCostChoices(a).map((v) => [...v.altCost.tapCreatureNames].sort().join(" + ")).sort() : []);
const payWithNames = (a, names) => {
  const want = [...names].sort().join(" + ");
  const v = expandCostChoices(a).find((x) => [...x.altCost.tapCreatureNames].sort().join(" + ") === want);
  expect(v, `no payment tapping ${want}`).toBeTruthy();
  return v;
};
const payWith = (a, ids) => {
  const want = [...ids].sort().join("+");
  const v = expandCostChoices(a).find((x) => [...x.altCost.tapCreatureIds].sort().join("+") === want);
  expect(v, `no payment tapping ${want}`).toBeTruthy();
  return v;
};
const tappedIds = (s, seat = "user") => s.players[seat].battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const five = (seat = "user", extra = {}) => [on(seat, "hawk", HAWK), on(seat, "drake", DRAKE), on(seat, "angel", ANGEL), on(seat, "thopter", ORNITHOPTER), on(seat, "hawk2", HAWK, extra)];

describe("the card", () => {
  it("⭐ native: the alternative cost, flying and lifelink, and the indestructible grant", () => {
    expect(isNativeTier(classifyCard(SEPHARA))).toBe(true);
    expect(extractAltCost(SEPHARA.oracle).altCost).toEqual({ kind: "payManaTapCreatures", pips: "{W}", count: 4, keyword: "Flying", condition: "always" });
  });
});

describe("the person's cast", () => {
  it("⭐ five fliers (two Suntail Hawks that pay alike) and a Plains: one alternative cast whose four payments are every distinct four of the five; the person keeps Serra Angel untapped — the four tap, the Plains pays {W}, Sephara resolves", () => {
    const s0 = table({ boards: { user: [...five(), on("user", "plains", PLAINS), on("user", "bears", BEARS)] } });
    const a = altCast(s0);
    expect(paymentNames(a)).toEqual([
      "Ornithopter + Serra Angel + Suntail Hawk + Suntail Hawk", "Ornithopter + Serra Angel + Suntail Hawk + Wind Drake",
      "Ornithopter + Suntail Hawk + Suntail Hawk + Wind Drake", "Serra Angel + Suntail Hawk + Suntail Hawk + Wind Drake",
    ]);
    expect(a.cost).toMatchObject({ W: 1, generic: 0 });
    const cast = dispatchAction(s0, payWithNames(a, ["Suntail Hawk", "Suntail Hawk", "Wind Drake", "Ornithopter"]));
    expect({ tapped: tappedIds(cast), stack: cast.stack.map((o) => o.card?.name ?? o.source?.name) })
      .toEqual({ tapped: ["drake", "hawk", "hawk2", "plains", "thopter"], stack: ["Sephara, Sky's Blade"] });
    const done = resolveTopOfStack(cast);
    const seph = done.players.user.battlefield.find((p) => p.card?.name === "Sephara, Sky's Blade");
    expect({ seph: !!seph, angelTapped: done.players.user.battlefield.find((p) => p.id === "angel").tapped, mv: seph?.card?.cmc }).toEqual({ seph: true, angelTapped: false, mv: 7 });
  });
  it("⭐ summoning-sick fliers may pay (its ruling, CR 302.6); a tapped flier and a creature without flying never do", () => {
    const s0 = table({ boards: { user: [on("user", "hawk", HAWK, { summoningSick: true }), on("user", "drake", DRAKE, { summoningSick: true }), on("user", "thopter", ORNITHOPTER), on("user", "angel", ANGEL, { tapped: true }), on("user", "hawk2", HAWK), on("user", "bears", BEARS), on("user", "plains", PLAINS)] } });
    expect(paymentSets(altCast(s0))).toEqual(["drake+hawk+hawk2+thopter"]);
  });
  it("⭐ a creature tapped for the cost can't also pay the {W}: four fliers with Birds of Paradise the only white source — no alternative cast", () => {
    const s0 = table({ boards: { user: [on("user", "birds", BIRDS), on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER)] } });
    expect(altCast(s0)).toBeFalsy();
    // With a Plains for the {W}, the same four (Birds of Paradise among them) pay.
    const withPlains = table({ boards: { user: [...s0.players.user.battlefield, on("user", "plains", PLAINS)] } });
    expect(paymentSets(altCast(withPlains))).toEqual(["birds+drake+hawk+thopter"]);
  });
  it("⭐ five fliers, Birds of Paradise among them and no Plains: only the four that leave Birds untapped pay — Birds taps for the {W}", () => {
    const s0 = table({ boards: { user: [on("user", "birds", BIRDS), on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "angel", ANGEL)] } });
    const a = altCast(s0);
    expect(paymentSets(a)).toEqual(["angel+drake+hawk+thopter"]);
    const cast = dispatchAction(s0, payWith(a, ["angel", "drake", "hawk", "thopter"]));
    expect(tappedIds(cast)).toEqual(["angel", "birds", "drake", "hawk", "thopter"]);
  });
  it("⭐ five Suntail Hawks, one of them summoning sick: two distinct payments, labelled apart, the {W} named once (pw29's review, F4)", () => {
    const s0 = table({ boards: { user: [on("user", "h1", HAWK), on("user", "h2", HAWK), on("user", "h3", HAWK), on("user", "h4", HAWK), on("user", "h5", HAWK, { summoningSick: true }), on("user", "plains", PLAINS)] } });
    const variants = expandCostChoices(altCast(s0));
    const labels = variants.map((v) => actionLabel(v)).sort();
    expect(labels).toEqual([
      "Cast Sephara, Sky's Blade (tap Suntail Hawk, Suntail Hawk, Suntail Hawk, Suntail Hawk (summoning sick); pay {W})",
      "Cast Sephara, Sky's Blade (tap Suntail Hawk, Suntail Hawk, Suntail Hawk, Suntail Hawk; pay {W})",
    ]);
    const sick = variants.find((v) => v.altCost.tapCreatureIds.includes("h5"));
    const done = resolveTopOfStack(dispatchAction(s0, sick));
    expect({ seph: done.players.user.battlefield.some((p) => p.card?.name === "Sephara, Sky's Blade"), untapped: done.players.user.battlefield.filter((p) => !p.tapped && p.card?.name === "Suntail Hawk").length, h5: done.players.user.battlefield.find((p) => p.id === "h5").tapped })
      .toEqual({ seph: true, untapped: 1, h5: true });
  });
  it("⭐ a flier tapped for the cost can't be sacrificed for the {W} (pw29's review, F2): four fliers, Grizzly Bears and Phyrexian Altar, no white source — the cast sacrifices the Bears for {W} and taps the four", () => {
    const s0 = table({ boards: { user: [on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "angel", ANGEL), on("user", "bears", BEARS), on("user", "altar", PHYREXIAN_ALTAR)] } });
    const a = altCast(s0);
    expect(paymentNames(a)).toEqual(["Ornithopter + Serra Angel + Suntail Hawk + Wind Drake"]);
    const cast = dispatchAction(s0, a);
    const done = resolveTopOfStack(cast);
    expect({ gy: done.players.user.graveyard.map((c) => c.id), tapped: tappedIds(done).filter((id) => id !== "altar"), seph: done.players.user.battlefield.some((p) => p.card?.name === "Sephara, Sky's Blade") })
      .toEqual({ gy: ["c-bears"], tapped: ["angel", "drake", "hawk", "thopter"], seph: true });
  });
  it("⭐ four fliers and Phyrexian Altar alone: no creature left to feed it — no alternative cast is offered (never an unpayable one)", () => {
    const s0 = table({ boards: { user: [on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "angel", ANGEL), on("user", "altar", PHYREXIAN_ALTAR)] } });
    expect(altCast(s0)).toBeFalsy();
  });
  it("⭐ from the command zone with Ashnod's Altar paying the tax: {2}{W} — the Bears sacrificed for {C}{C}, the Plains for {W}, the four fliers tapped", () => {
    const s0 = table({ commander: true, castCount: 1, boards: { user: [on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "angel", ANGEL), on("user", "bears", BEARS), on("user", "altar", ASHNODS_ALTAR), on("user", "plains", PLAINS)] } });
    const a = altCast(s0);
    expect({ zone: a?.fromZone, cost: a && { W: a.cost.W, generic: a.cost.generic } }).toEqual({ zone: "command", cost: { W: 1, generic: 2 } });
    const done = resolveTopOfStack(dispatchAction(s0, a));
    expect({ gy: done.players.user.graveyard.map((c) => c.id), tapped: tappedIds(done).filter((id) => id !== "altar"), seph: done.players.user.battlefield.some((p) => p.card?.name === "Sephara, Sky's Blade") })
      .toEqual({ gy: ["c-bears"], tapped: ["angel", "drake", "hawk", "plains", "thopter"], seph: true });
  });
  it("control: three fliers — the alternative cost can't be paid; with seven mana the printed cost is still offered", () => {
    const s0 = table({ boards: { user: [on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "plains", PLAINS)] } });
    expect(altCast(s0)).toBeFalsy();
    const rich = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { ...EMPTY, W: 7 } } } };
    expect(sephCasts(rich).filter((a) => !a.altCost).length).toBe(1);
  });
  it("⭐ from the command zone (CR 903.8 — the tax applies to the alternative cost, CR 118.9d): one earlier cast — {2}{W} and the four fliers", () => {
    const s0 = table({ commander: true, castCount: 1, boards: { user: [on("user", "hawk", HAWK), on("user", "drake", DRAKE), on("user", "thopter", ORNITHOPTER), on("user", "hawk2", HAWK), on("user", "p1", PLAINS), on("user", "p2", PLAINS), on("user", "p3", PLAINS)] } });
    const a = altCast(s0);
    expect({ zone: a?.fromZone, cost: a && { W: a.cost.W, generic: a.cost.generic }, sets: paymentSets(a) }).toEqual({ zone: "command", cost: { W: 1, generic: 2 }, sets: ["drake+hawk+hawk2+thopter"] });
    const done = resolveTopOfStack(dispatchAction(s0, a));
    expect({ seph: done.players.user.battlefield.some((p) => p.card?.name === "Sephara, Sky's Blade"), tapped: tappedIds(done), count: done.players.user.commanderCastCount["user::h-seph"] })
      .toEqual({ seph: true, tapped: ["drake", "hawk", "hawk2", "p1", "p2", "p3", "thopter"], count: 2 });
  });
});

describe("a seat no person plays", () => {
  it("⭐ one payment: the house's four least valuable fliers (Serra Angel stays untapped)", () => {
    const s0 = table({ seat: "ai", human: false, boards: { ai: [...five("ai"), on("ai", "plains", PLAINS)] } });
    const a = altCast(s0, "ai");
    expect(paymentSets(a)).toEqual(["drake+hawk+hawk2+thopter"]);
    const done = resolveTopOfStack(dispatchAction(s0, a));
    expect({ seph: done.players.ai.battlefield.some((p) => p.card?.name === "Sephara, Sky's Blade"), angel: done.players.ai.battlefield.find((p) => p.id === "angel").tapped }).toEqual({ seph: true, angel: false });
  });
  it("the default AI pays no alternative cost for a spell that is no interaction (opponentAI.filterAltCastVariants): four fliers and one Plains — it holds Sephara; with seven Plains it casts her for her mana cost", () => {
    const poor = table({ seat: "ai", human: false, boards: { ai: [on("ai", "hawk", HAWK), on("ai", "drake", DRAKE), on("ai", "thopter", ORNITHOPTER), on("ai", "hawk2", HAWK), on("ai", "p0", PLAINS)] } });
    expect(altCast(poor, "ai")).toBeTruthy(); // offered to the seat
    expect(pickAction(poor, "ai", legalActionsForPlayer(poor, "ai"))?.cardId === "h-seph").toBe(false);
    const rich = table({ seat: "ai", human: false, boards: { ai: [on("ai", "hawk", HAWK), on("ai", "drake", DRAKE), on("ai", "thopter", ORNITHOPTER), on("ai", "hawk2", HAWK), ...Array.from({ length: 7 }, (_, i) => on("ai", `p${i}`, PLAINS))] } });
    const pick = pickAction(rich, "ai", legalActionsForPlayer(rich, "ai"));
    expect({ card: pick?.cardId, alt: !!pick?.altCost }).toEqual({ card: "h-seph", alt: false });
  });
});
