/**
 * phyrexianMana.test.js — a Phyrexian mana symbol in a spell's or an activated ability's cost is paid (2026-10-17).
 *
 * CR 107.4f: a Phyrexian mana symbol ({B/P}) is paid with one mana of its colour or 2 life; a hybrid Phyrexian symbol ({G/U/P})
 * with one mana of either colour or 2 life. CR 601.2f/h: it is part of the total cost, paid in full. CR 119.4: life is paid only
 * from a life total at least that large; CR 119.8: not at all while the life total can't change. CR 702.150a (compleated): a
 * planeswalker enters with two fewer loyalty counters for each such symbol paid with life (compleated is unmodeled: those walkers
 * don't resolve yet, so only their cost is checked here).
 *
 * Before this slice the planner skipped the symbols ("assumed paid with life") and no cast or activation charged the life:
 * Dismember cost {1}, Gitaxian Probe cost nothing, Immolating Souleater pumped for free. Hybrid Phyrexian symbols were read as
 * plain hybrid (no life option). The planner now pays each symbol with mana when it can and with 2 life when it can't (the
 * whole payment's life costs together leave at least 1, the engine's policy; none under a life lock), the commit charges it,
 * and the AI pays life only while it stays at LIFE_PRUDENCE_FLOOR or more.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { canAfford, manaSources, planPayment, payManaCost } from "./manaModel.js";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { castVariantClauses } from "./actionLabel.js";
import { pickAction } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent, grantTeferiShield } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DISMEMBER = {"name":"Dismember","type":"Instant","mana":"{1}{B/P}{B/P}","cmc":3,"keywords":[],"colors":["B"],"oracle":"({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn."};
const PROBE = {"name":"Gitaxian Probe","type":"Sorcery","mana":"{U/P}","cmc":1,"keywords":[],"colors":["U"],"oracle":"({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card."};
const SKIRGE = {"name":"Vault Skirge","type":"Artifact Creature — Phyrexian Imp","mana":"{1}{B/P}","cmc":2,"power":"1","toughness":"1","keywords":["Flying","Lifelink"],"colors":["B"],"oracle":"({B/P} can be paid with either {B} or 2 life.)\nFlying\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const TAMIYO = {"name":"Tamiyo, Compleated Sage","type":"Legendary Planeswalker — Tamiyo","mana":"{2}{G}{G/U/P}{U}","cmc":5,"keywords":["Compleated"],"colors":["G","U"],"oracle":"Compleated ({G/U/P} can be paid with {G}, {U}, or 2 life. If life was paid, this planeswalker enters with two fewer loyalty counters.)\n+1: Tap up to one target artifact or creature. It doesn't untap during its controller's next untap step.\n−X: Exile target nonland permanent card with mana value X from your graveyard. Create a token that's a copy of that card.\n−7: Create Tamiyo's Notebook, a legendary colorless Book artifact token with \"Spells you cast cost {2} less to cast\" and \"{T}: Draw a card.\"","loyalty":"5"};
const SOULEATER = {"name":"Immolating Souleater","type":"Artifact Creature — Phyrexian Dog","mana":"{2}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":"{R/P}: This creature gets +1/+0 until end of turn. ({R/P} can be paid with either {R} or 2 life.)"};
const CONFLUENCE = {"name":"Mana Confluence","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Pay 1 life: Add one mana of any color."};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const P = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const LIB = (n) => Array.from({ length: n }, (_, i) => ({ id: `L${i}`, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }));

function table({ user = [], ai = [], hand = [], life = 20, seat = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: LIB(5), life: 20 };
  players[seat] = { ...players[seat], battlefield: user, hand, life };
  const other = seat === "user" ? "ai" : "user";
  players[other] = { ...players[other], battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0 };
}
const casts = (s, cardId, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const tapped = (s, id, seat = "user") => !!s.players[seat].battlefield.find((p) => p.id === id)?.tapped;

describe("the cast pays its Phyrexian symbols — mana first, else 2 life each (CR 107.4f)", () => {
  it("⭐ Dismember off one Island at 20 life: {1} from the Island and 4 life", () => {
    let s = table({ user: [P("i1", ISLAND)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }] });
    const c = casts(s, "h-dis");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].phyrexianLife).toBe(4);
    expect(castVariantClauses(c[0])).toContain("pay 4 life for its Phyrexian mana");
    s = dispatchAction(s, c[0]);
    expect(s.players.user.life).toBe(16);
    expect(tapped(s, "i1")).toBe(true);
  });

  it("⭐ Dismember off three Swamps: all mana, no life", () => {
    let s = table({ user: [P("s1", SWAMP), P("s2", SWAMP), P("s3", SWAMP)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }] });
    s = dispatchAction(s, casts(s, "h-dis")[0]);
    expect(s.players.user.life).toBe(20);
    expect(["s1", "s2", "s3"].every((id) => tapped(s, id))).toBe(true);
  });

  it("⭐ Dismember off a Swamp and an Island: one symbol with {B}, the other with 2 life", () => {
    let s = table({ user: [P("s1", SWAMP), P("i1", ISLAND)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }] });
    s = dispatchAction(s, casts(s, "h-dis")[0]);
    expect(s.players.user.life).toBe(18);
    expect(tapped(s, "s1") && tapped(s, "i1")).toBe(true);
  });

  it("⭐ the payment keeps a life point (the engine's policy): Dismember off one Island at 4 life is not offered, at 5 it is", () => {
    expect(casts(table({ user: [P("i1", ISLAND)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }], life: 4 }), "h-dis")).toEqual([]);
    let s = table({ user: [P("i1", ISLAND)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }], life: 5 });
    const c = casts(s, "h-dis");
    expect(c.length).toBeGreaterThan(0);
    s = dispatchAction(s, c[0]);
    expect(s.players.user.life).toBe(1);
  });

  it("⭐ with the whole payment's life: Mana Confluence's 1 and Dismember's 4 can't come out of 5 life", () => {
    expect(casts(table({ user: [P("mc", CONFLUENCE)], ai: [P("giant", HILL_GIANT, "ai")], hand: [{ ...DISMEMBER, id: "h-dis" }], life: 5 }), "h-dis")).toEqual([]);
  });

  it("⭐ Gitaxian Probe with no mana costs 2 life; with an Island it costs the Island", () => {
    let s = table({ hand: [{ ...PROBE, id: "h-probe" }] });
    const c = casts(s, "h-probe");
    expect(c.length).toBeGreaterThan(0);
    s = dispatchAction(s, c[0]);
    expect(s.players.user.life).toBe(18);
    let t = table({ user: [P("i1", ISLAND)], hand: [{ ...PROBE, id: "h-probe" }] });
    t = dispatchAction(t, casts(t, "h-probe")[0]);
    expect(t.players.user.life).toBe(20);
    expect(tapped(t, "i1")).toBe(true);
  });

  it("⭐ a life total that can't change pays no life (CR 119.8): Gitaxian Probe with no mana isn't offered under Teferi's Protection", () => {
    expect(casts(grantTeferiShield(table({ hand: [{ ...PROBE, id: "h-probe" }] }), "user"), "h-probe")).toEqual([]);
  });

  it("⭐ a hybrid Phyrexian symbol takes either colour or 2 life: Tamiyo ({2}{G}{G/U/P}{U}) off three Forests and an Island pays 2 life", () => {
    // (Tamiyo's compleated static is unmodeled, so the spell doesn't resolve into a planeswalker yet — this checks the cost only.)
    let s = table({ user: [P("f1", FOREST), P("f2", FOREST), P("f3", FOREST), P("i1", ISLAND)], hand: [{ ...TAMIYO, id: "h-tamiyo" }] });
    const c = casts(s, "h-tamiyo");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].phyrexianLife).toBe(2);
    s = dispatchAction(s, c[0]);
    expect(s.players.user.life).toBe(18);
    expect(["f1", "f2", "f3", "i1"].every((id) => tapped(s, id))).toBe(true);
  });

  it("control — Tamiyo off five lands with a colour to spare: no life", () => {
    let s = table({ user: [P("f1", FOREST), P("f2", FOREST), P("f3", FOREST), P("f4", FOREST), P("i1", ISLAND)], hand: [{ ...TAMIYO, id: "h-tamiyo" }] });
    s = dispatchAction(s, casts(s, "h-tamiyo")[0]);
    expect(s.players.user.life).toBe(20);
  });
});

describe("an activated ability pays its Phyrexian symbol too", () => {
  it("⭐ Immolating Souleater's {R/P} with no red source costs 2 life", () => {
    let s = table({ user: [P("dog", SOULEATER)] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "dog");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(s.players.user.life).toBe(18);
  });
});

describe("the planner, canAfford and the resolution layer", () => {
  const P0 = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  it("⭐ with no life context a Phyrexian symbol needs its mana: {B/P} isn't paid by an Island", () => {
    const s = table({ user: [P("i1", ISLAND)] });
    expect(canAfford(P0, manaSources(s, "user"), parseManaCost("{B/P}"))).toBe(false);
    expect(planPayment(P0, manaSources(s, "user"), parseManaCost("{U/P}"))).toBeTruthy();
  });

  it("⭐ payManaCost reads the payer's life: {1}{B/P} off an Island at 20 life pays 2 life", () => {
    const s = table({ user: [P("i1", ISLAND)] });
    const r = payManaCost(s, "user", parseManaCost("{1}{B/P}"));
    expect(r.paid).toBe(true);
    expect(r.state.players.user.life).toBe(18);
  });
});

describe("the AI: mana when it has it, life only above LIFE_PRUDENCE_FLOOR", () => {
  const aiTable = (lands, life) => table({ seat: "ai", user: lands, hand: [{ ...SKIRGE, id: "h-skirge" }], life });
  const pickSkirge = (s) => {
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    return pick?.kind === "cast-spell" && pick.cardId === "h-skirge";
  };
  it("⭐ at 11 life with only an Island it holds Vault Skirge (2 life would leave 9)", () => {
    expect(pickSkirge(aiTable([P("i1", ISLAND, "ai")], 11))).toBe(false);
  });
  it("control — at 20 life with only an Island it casts Vault Skirge, paying 2 life", () => {
    const s = aiTable([P("i1", ISLAND, "ai")], 20);
    expect(pickSkirge(s)).toBe(true);
  });
  it("control — at 11 life with a Swamp and an Island it casts Vault Skirge with mana", () => {
    let s = aiTable([P("s1", SWAMP, "ai"), P("i1", ISLAND, "ai")], 11);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick?.cardId).toBe("h-skirge");
    s = dispatchAction(s, pick);
    expect(s.players.ai.life).toBe(11);
  });
});
