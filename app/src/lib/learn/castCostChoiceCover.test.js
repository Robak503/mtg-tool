/**
 * castCostChoiceCover.test.js — a cost choice beside a target list past the cap (the target-cap blind review's F1, 2026-11-03). A
 * sacrifice outlet's activation, or a spell with "sacrifice a creature" as an additional cost, is offered once per victim per target
 * combination (CR 602.2b / 601.2h — the cost's choice and the targets are both announced). With the offer over the cap (targeting.js)
 * listing every target of a one-slot ability, victims × targets grew with the square of a token board: on Squirrel Girl's board,
 * Blasting Station beside 360 Squirrels made `legalActionsForPlayer` throw RangeError (the appended list passed V8's spread limit), and
 * the game ended engine-stopped. Now every victim stands beside the rows the capped offer had — the base's rows, in the base's order —
 * and each row past them once, beside the least valuable victim that can pay for it and isn't its target (live mana value, then live
 * power — the round-2 and round-3 rechecks): V × 64 + (C − 64).
 *
 * Played through the real paths (legalActionsForPlayer). Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, offeredPaymentPlan, _internals } from "./legalChoices.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const STATION = {"name":"Blasting Station","type":"Artifact","mana":"{3}","oracle":"{T}, Sacrifice a creature: This artifact deals 1 damage to any target.\nWhenever a creature enters, you may untap this artifact.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #3476
const BONE_SPLINTERS = {"name":"Bone Splinters","type":"Sorcery","mana":"{B}","oracle":"As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #5994
const SQUIRREL_GIRL = {"name":"The Unbeatable Squirrel Girl","type":"Legendary Creature — Squirrel Human Hero","mana":"{1}{G}{G}{G}","oracle":"Do You Like Squirrels? — Whenever The Unbeatable Squirrel Girl enters or attacks, create a 1/1 green Squirrel creature token.\nI LOVE Squirrels! — {1}{G}{G}{G}: Create X 1/1 green Squirrel creature tokens, where X is the number of Squirrels you control.","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":["I LOVE Squirrels!"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #6369
const SQUIRREL = { name: "Squirrel", type: "Token Creature — Squirrel", power: "1", toughness: "1", oracle: "", keywords: [], token: true, colors: ["G"] }; // the token Squirrel Girl creates
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #9445
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]};
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const FLING = {"name":"Fling","type":"Instant","mana":"{1}{R}","oracle":"As an additional cost to cast this spell, sacrifice a creature.\nFling deals damage equal to the sacrificed creature's power to any target.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1452
const LIGHTNING_AXE = {"name":"Lightning Axe","type":"Instant","mana":"{R}","oracle":"As an additional cost to cast this spell, discard a card or pay {5}.\nLightning Axe deals 5 damage to target creature.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #7027
const NOXIOUS_REVIVAL = {"name":"Noxious Revival","type":"Instant","mana":"{G/P}","oracle":"({G/P} can be paid with either {G} or 2 life.)\nPut target card from a graveyard on top of its owner's library.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #627
const GITAXIAN_PROBE = {"name":"Gitaxian Probe","type":"Sorcery","mana":"{U/P}","oracle":"({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #524
const WALKING_BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.","layout":"normal","cmc":0,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #425
const CORROSIVE_GALE = {"name":"Corrosive Gale","type":"Sorcery","mana":"{X}{G/P}","oracle":"({G/P} can be paid with either {G} or 2 life.)\nCorrosive Gale deals X damage to each creature with flying.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #24086
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};

const SEATS = ["user", "ai1", "ai2", "ai3"];
const CAP = 64; // targeting.MAX_CAST_EXPANSIONS — written here, so the file runs (and fails on its assertions) on an engine without the export
const on = (seat, id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: seat, summoningSick: false });
/** A four-seat pod on the user's precombat main: the user's `mine`, each opponent 3 Grizzly Bears and 9 Forests, the user's `hand`. */
function pod({ mine = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of SEATS.slice(1)) {
    const bf = [...Array.from({ length: 3 }, (_, i) => on(seat, `${seat}-bear${i}`, BEARS)), ...Array.from({ length: 9 }, (_, i) => on(seat, `${seat}-forest${i}`, FOREST))];
    players[seat] = { ...players[seat], battlefield: bf };
  }
  players.user = { ...players.user, battlefield: mine, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...players.user.manaPool, ...mana } };
  return { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], players };
}
/** legalActionsForPlayer, its throw (if any) returned beside it so a throw fails an assertion rather than the test. */
function offer(s) {
  try { return { actions: legalActionsForPlayer(s, "user"), threw: null }; } catch (e) { return { actions: [], threw: `${e?.name}: ${e?.message}` }; }
}
const opponentsBears = SEATS.slice(1).flatMap((p) => [0, 1, 2].map((i) => `${p}-bear${i}`));

describe("Blasting Station beside 600 Squirrels (Squirrel Girl's board)", () => {
  const squirrels = Array.from({ length: 600 }, (_, i) => `sq${i}`);
  const board = () => pod({ mine: [on("user", "sg", SQUIRREL_GIRL), on("user", "station", STATION), ...squirrels.map((id) => on("user", id, SQUIRREL))] });
  it("⭐ legalActionsForPlayer returns; the Station's offer is at most 601 victims × 64 + every target once more", () => {
    const { actions, threw } = offer(board());
    expect(threw).toBe(null);
    const station = actions.filter((a) => a.kind === "activate-ability" && a.permanentId === "station");
    const targets = 4 + 601 + opponentsBears.length; // the four players, Squirrel Girl and her 600 Squirrels, the opponents' 9 Bears
    expect(station.length).toBeGreaterThan(601 * (CAP - 1));
    expect(station.length).toBeLessThanOrEqual(601 * CAP + targets);
    // every legal target is offered in some activation, and every victim pays for some activation
    expect(new Set(station.map((a) => a.targets[0].id)).size).toBe(targets);
    expect(new Set(station.map((a) => a.sacCreatureId)).size).toBe(601);
    for (const a of station) expect(a.targets[0].id).not.toBe(a.sacCreatureId); // never the victim itself (CR 608.2b — it would fizzle)
  });
  it("⭐ the base's rows come first, in the base's order: each victim beside the capped offer's 64 targets (players first), less itself", () => {
    const { actions, threw } = offer(board());
    expect(threw).toBe(null);
    const station = actions.filter((a) => a.kind === "activate-ability" && a.permanentId === "station").map((a) => `${a.sacCreatureId}>${a.targets[0].id}`);
    const first64 = [...SEATS, "sg", ...squirrels.slice(0, CAP - 5)]; // a slot past 64 lists the players first (playersFirstOverCap)
    const baseRows = ["sg", ...squirrels].flatMap((v) => first64.filter((t) => t !== v).map((t) => `${v}>${t}`));
    expect(station.slice(0, baseRows.length)).toEqual(baseRows);
  });
});

/**
 * A table of `seats` (each seat's [id, card, extra] list), `seat` acting in its precombat main with `hand` and `mana`, the stack empty.
 */
function table({ seats = {}, seat = "user", hand = [], mana = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const s of SEATS) players[s] = { ...players[s], battlefield: (seats[s] || []).map(([id, c, extra]) => ({ ...on(s, id, c), ...(extra || {}) })), hand: [] };
  players[seat] = { ...players[seat], hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...players[seat].manaPool, ...mana } };
  return { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, stack: [], pendingTriggers: [], players };
}
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const victimsAimedAt = (offers, id) => [...new Set(offers.filter((a) => a.targets?.[0]?.id === id).map((a) => a.sacCreatureId))];

describe("a row past the cap is paid with the least valuable choice that can pay (the round-2 recheck's R2-F1)", () => {
  // Squirrel Girl's own board: her, 70 Squirrel tokens and 6 Forests; each opponent a Serra Angel and 4 Plains.
  const squirrels = range(70, (i) => `sq${i}`);
  const sgBoard = (hand, more = []) => table({
    seats: {
      user: [["sg", SQUIRREL_GIRL, { card: { ...SQUIRREL_GIRL, id: "c-sg", isCommander: true } }], ...squirrels.map((id) => [id, SQUIRREL]), ...range(6, (i) => [`uf${i}`, FOREST]), ...more],
      ...Object.fromEntries(SEATS.slice(1).map((s) => [s, [[`${s}-angel`, ANGEL], ...range(4, (i) => [`${s}-plains${i}`, PLAINS])]])),
    },
    hand, mana: { B: 1, R: 1, C: 1 },
  });
  const angels = SEATS.slice(1).map((s) => `${s}-angel`);
  it("⭐ Bone Splinters, Fling and Blasting Station: every target past the 64th stands beside the cheapest Squirrel token, never Squirrel Girl", () => {
    const { actions, threw } = offer(sgBoard([["bs", BONE_SPLINTERS], ["fling", FLING]], [["station", STATION]]));
    expect(threw).toBe(null);
    const lanes = {
      bs: { offers: actions.filter((a) => a.kind === "cast-spell" && a.cardId === "bs"), past: [...squirrels.slice(63), ...angels] }, // creatures: sg + sq0..sq62 first
      fling: { offers: actions.filter((a) => a.kind === "cast-spell" && a.cardId === "fling"), past: [...squirrels.slice(59), ...angels] }, // any target: the players first
      station: { offers: actions.filter((a) => a.kind === "activate-ability" && a.permanentId === "station"), past: [...squirrels.slice(59), ...angels] },
    };
    for (const [lane, { offers, past }] of Object.entries(lanes)) {
      for (const t of past) expect(victimsAimedAt(offers, t), `${lane} → ${t}`).toEqual(["sq0"]);
      expect(offers.some((a) => a.sacCreatureId === "sg" && past.includes(a.targets[0].id)), lane).toBe(false);
    }
  });
  it("⭐ the default AI's Bone Splinters at an opponent's Angel sacrifices a Squirrel token, not its commander", () => {
    const s = sgBoard([["bs", BONE_SPLINTERS]]);
    const p = pickAction(s, "user", legalActionsForPlayer(s, "user"));
    expect({ kind: p?.kind, cardId: p?.cardId, sac: p?.sacCreatureId ?? null }).toEqual({ kind: "cast-spell", cardId: "bs", sac: "sq0" });
    expect(angels).toContain(p.targets[0].id);
  });
  it("⭐ by LIVE values (the round-3 recheck's R3-F1): beside a Walking Ballista grown to 3/3 — printed mana value 0 and power 0 — the rows past the cap still sacrifice a 1/1 Squirrel token, never the Ballista or Squirrel Girl", () => {
    const ballista = ["ballista", WALKING_BALLISTA, { counters: { "+1/+1": 3 } }];
    const { actions, threw } = offer(sgBoard([["bs", BONE_SPLINTERS], ["fling", FLING]], [ballista, ["station", STATION]]));
    expect(threw).toBe(null);
    const lanes = {
      bs: { offers: actions.filter((a) => a.kind === "cast-spell" && a.cardId === "bs"), past: [...squirrels.slice(63), "ballista", ...angels] },
      fling: { offers: actions.filter((a) => a.kind === "cast-spell" && a.cardId === "fling"), past: [...squirrels.slice(59), "ballista", ...angels] },
      station: { offers: actions.filter((a) => a.kind === "activate-ability" && a.permanentId === "station"), past: [...squirrels.slice(59), "ballista", ...angels] },
    };
    for (const [lane, { offers, past }] of Object.entries(lanes)) {
      for (const t of past) expect(victimsAimedAt(offers, t), `${lane} → ${t}`).toEqual(["sq0"]);
      expect(offers.some((a) => ["ballista", "sg"].includes(a.sacCreatureId) && past.includes(a.targets[0].id)), lane).toBe(false);
    }
    // the default AI: Bone Splinters at an opponent's Angel, a Squirrel token sacrificed
    const s = sgBoard([["bs", BONE_SPLINTERS]], [ballista]);
    const pick = pickAction(s, "user", legalActionsForPlayer(s, "user"));
    expect({ kind: pick?.kind, cardId: pick?.cardId, sac: pick?.sacCreatureId ?? null }).toEqual({ kind: "cast-spell", cardId: "bs", sac: "sq0" });
    expect(angels).toContain(pick.targets[0].id);
  });
  it("⭐ payers that differ — ai3's Craw Wurm, its commander Squirrel Girl and a Squirrel token, in that battlefield order: each row past the cap sacrifices the token, the row aimed at the token the commander", () => {
    const s = table({
      seat: "ai3", hand: [["bs", BONE_SPLINTERS]], mana: { B: 1 },
      seats: {
        user: range(30, (i) => [`user-bear${i}`, BEARS]), ai1: range(20, (i) => [`ai1-bear${i}`, BEARS]), ai2: range(20, (i) => [`ai2-bear${i}`, BEARS]),
        ai3: [["ai3-wurm", WURM], ["ai3-sg", SQUIRREL_GIRL, { card: { ...SQUIRREL_GIRL, id: "c-ai3-sg", isCommander: true } }], ["ai3-tok", SQUIRREL]],
      },
    });
    const { actions, threw } = (() => { try { return { actions: legalActionsForPlayer(s, "ai3"), threw: null }; } catch (e) { return { actions: [], threw: String(e) }; } })();
    expect(threw).toBe(null);
    const offers = actions.filter((a) => a.kind === "cast-spell" && a.cardId === "bs");
    // the 73 creatures in seat order; the first 64 are the user's 30, ai1's 20 and ai2's first 14
    const past = [...range(6, (i) => `ai2-bear${14 + i}`), "ai3-wurm", "ai3-sg", "ai3-tok"];
    expect(past.map((t) => `${t}:${victimsAimedAt(offers, t).join(",")}`)).toEqual([...past.slice(0, 8).map((t) => `${t}:ai3-tok`), "ai3-tok:ai3-sg"]);
  });
  it("⭐ a discard choice: Lightning Axe beside 70 creatures discards the least valuable card in hand (the Forest) for the targets past the 64th", () => {
    const s = table({
      hand: [["axe", LIGHTNING_AXE], ["h-wurm", WURM], ["h-forest", FOREST], ["h-bears", BEARS]], mana: { R: 1 },
      seats: { ai1: range(70, (i) => [`ai1-bear${i}`, BEARS]) },
    });
    const { actions, threw } = offer(s);
    expect(threw).toBe(null);
    const casts = actions.filter((a) => a.kind === "cast-spell" && a.cardId === "axe");
    const pastDiscards = [...new Set(casts.filter((a) => Number(a.targets[0].id.slice("ai1-bear".length)) >= 64).map((a) => a.discardCardId))];
    expect(pastDiscards).toEqual(["h-forest"]);
    expect(new Set(casts.map((a) => a.targets[0].id)).size).toBe(70);
  });
});

describe("the payment passes price one plan per action shape (the round-2 recheck's R2-F2)", () => {
  it("⭐ Noxious Revival beside 240 graveyard cards and Gitaxian Probe: a cast per target, each carrying what its own plan pays, from ONE plan a card", () => {
    // Forests only: Noxious Revival's {G/P} is paid with {G}, Gitaxian Probe's {U/P} with 2 life — two shapes that must not share a plan
    const s = table({ hand: [["nox", NOXIOUS_REVIVAL], ["probe", GITAXIAN_PROBE]], seats: { user: range(3, (i) => [`uf${i}`, FOREST]) } });
    for (const p of SEATS) s.players[p] = { ...s.players[p], graveyard: range(60, (i) => ({ ...BEARS, id: `${p}-gy${i}` })) };
    const count = _internals.paymentPlanComputations;
    expect(typeof count).toBe("function");
    const before = count();
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");
    expect(count() - before).toBe(2); // each card's casts are the same but for their targets
    const nox = casts.filter((a) => a.cardId === "nox"), probe = casts.filter((a) => a.cardId === "probe");
    expect(new Set(nox.map((a) => a.targets[0].id)).size).toBe(240);
    expect(probe.length).toBe(4);
    for (const a of casts) expect(a.phyrexianLife ?? 0, a.name).toBe(offeredPaymentPlan(s, "user", a)?.phyrexianLife ?? 0); // as the unshared plan prices it
    expect([nox[0].phyrexianLife ?? 0, probe[0].phyrexianLife ?? 0]).toEqual([0, 2]);
  });
  it("⭐ a shape is its whole cost (the round-3 recheck's R3-F2): Corrosive Gale ({X}{G/P}) from {G}{C}{C} and 5 life — X = 1 and 2 pay no life, X = 3 pays 2; one plan per X", () => {
    const s = table({ hand: [["gale", CORROSIVE_GALE]], mana: { G: 1, C: 2 } });
    s.players.user = { ...s.players.user, life: 5 };
    const count = _internals.paymentPlanComputations;
    expect(typeof count).toBe("function");
    const before = count();
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "gale");
    const byX = Object.fromEntries(casts.map((a) => [a.xValue, a.phyrexianLife ?? 0]));
    expect(byX).toMatchObject({ 1: 0, 2: 0, 3: 2 });
    for (const a of casts) expect(a.phyrexianLife ?? 0, `X=${a.xValue}`).toBe(offeredPaymentPlan(s, "user", a)?.phyrexianLife ?? 0);
    expect(count() - before).toBe(new Set(casts.map((a) => a.xValue)).size);
  });
});

describe("the append is a loop (the round-2 recheck's R2-F4a)", () => {
  it("⭐ Blasting Station beside 2,000 Squirrels: legalActionsForPlayer returns its ~130,000 plays — a spread append threw RangeError past ~120,000", () => {
    const sq = range(2000, (i) => `sq${i}`);
    const { actions, threw } = offer(pod({ mine: [on("user", "sg", SQUIRREL_GIRL), on("user", "station", STATION), ...sq.map((id) => on("user", id, SQUIRREL))] }));
    expect(threw).toBe(null);
    expect(actions.filter((a) => a.kind === "activate-ability" && a.permanentId === "station").length).toBeGreaterThan(2001 * (CAP - 1));
  });
});

describe("Bone Splinters beside 380 creatures (a sacrifice as an additional cost)", () => {
  const bears = Array.from({ length: 380 }, (_, i) => `ub${i}`);
  const board = () => pod({ mine: bears.map((id) => on("user", id, BEARS)), hand: [["bs", BONE_SPLINTERS]], mana: { B: 1 } });
  it("⭐ legalActionsForPlayer returns; the casts are at most 380 victims × 64 + every target once more, every creature reached", () => {
    const { actions, threw } = offer(board());
    expect(threw).toBe(null);
    const casts = actions.filter((a) => a.kind === "cast-spell" && a.cardId === "bs");
    const targets = 380 + opponentsBears.length;
    expect(casts.length).toBeLessThanOrEqual(380 * CAP + targets);
    expect(new Set(casts.map((a) => a.targets[0].id)).size).toBe(targets);
    for (const a of casts) expect(a.targets[0].id).not.toBe(a.sacCreatureId);
  });
  it("⭐ the base's rows come first: each victim beside the first 64 creatures, less itself; then each later creature once", () => {
    const { actions, threw } = offer(board());
    expect(threw).toBe(null);
    const casts = actions.filter((a) => a.kind === "cast-spell" && a.cardId === "bs").map((a) => `${a.sacCreatureId}>${a.targets[0].id}`);
    const first64 = bears.slice(0, CAP);
    const baseRows = bears.flatMap((v) => first64.filter((t) => t !== v).map((t) => `${v}>${t}`));
    expect(casts.slice(0, baseRows.length)).toEqual(baseRows);
    // past them, each later target once, beside the first victim that isn't it — the first Bear
    expect(casts.slice(baseRows.length)).toEqual([...bears.slice(CAP), ...opponentsBears].map((t) => `ub0>${t}`));
  });
});
