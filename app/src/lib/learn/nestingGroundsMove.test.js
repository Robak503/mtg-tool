/**
 * nestingGroundsMove.test.js — "Move a counter from target permanent you control onto a second target permanent." (shelf deck
 * work, D2, 2026-09-30 — Nesting Grounds, the card Mothman Cometh needed to reach 90%).
 *
 * CR 122.5: moving a counter removes it from the first object and puts it onto the second; if either half is impossible,
 * nothing moves. The atom rides the fight-pair two-target shape: the destination is the primary ("onto", any permanent), the
 * source the secondary ("from", a permanent you control that carries a counter). Which counter is the mover's choice; the
 * house policy is deterministic — a +1/+1 onto your own permanent, a -1/-1 onto another player's, else the kind the source
 * carries most of.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NESTING_GROUNDS = { name: "Nesting Grounds", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{1}, {T}: Move a counter from target permanent you control onto a second target permanent. Activate only as a sorcery." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const SQUIRE = { name: "Squire", type: "Creature — Human Soldier", mana: "{1}{W}", cmc: 2, colors: ["W"], power: "1", toughness: "2", keywords: [], oracle: "" };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };

const perm = (id, card, controller, counters) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...(counters ? { counters } : {}) });
function board({ user = [], ai = [], active = "user", step = "main", phase = "precombat-main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase, step, activePlayer: active, priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [perm("ng", NESTING_GROUNDS, "user"), ...user], manaPool: { ...g.players.user.manaPool, C: 1 } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const moves = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "ng" && (a.targets || []).length === 2);
const pick = (s, fromId, ontoId) => moves(s).find((a) => a.targets.some((t) => t.role === "from" && t.id === fromId) && a.targets.some((t) => t.role === "onto" && t.id === ontoId));
const run = (s, a) => { let out = dispatchAction(s, a); for (let i = 0; i < 4 && out.stack.length && !out.pendingChoice; i++) out = resolveTopOfStack(out); return out; };
const counters = (s, id) => { for (const p of Object.values(s.players)) { const x = p.battlefield.find((q) => q.id === id); if (x) return x.counters || {}; } return null; };

describe("the card", () => {
  it("⭐ Nesting Grounds reads native (a land)", () => {
    expect(classifyCard(NESTING_GROUNDS)).toBe("land");
  });
});

describe("⭐ the real activation", () => {
  it("⭐ a +1/+1 counter moves from one of your creatures to another", () => {
    const s = board({ user: [perm("b1", BEAR, "user", { "+1/+1": 2 }), perm("b2", BEAR, "user")] });
    const out = run(s, pick(s, "b1", "b2"));
    const row = { from: counters(out, "b1")["+1/+1"] ?? 0, onto: counters(out, "b2")["+1/+1"] ?? 0, groundsTapped: out.players.user.battlefield.find((p) => p.id === "ng").tapped };
    console.log(`WITNESS nestingGroundsMove ${JSON.stringify(row)}`);
    expect(row).toEqual({ from: 1, onto: 1, groundsTapped: true });
  });
  it("the sources offered are the permanents you control that carry a counter; the destination may be anyone's", () => {
    const s = board({ user: [perm("b1", BEAR, "user", { "+1/+1": 1 }), perm("b2", BEAR, "user")], ai: [perm("o1", SQUIRE, "ai")] });
    const from = [...new Set(moves(s).map((a) => a.targets.find((t) => t.role === "from").id))].sort();
    const onto = [...new Set(moves(s).map((a) => a.targets.find((t) => t.role === "onto").id))].sort();
    expect({ from, onto }).toEqual({ from: ["b1"], onto: ["b2", "ng", "o1"] });
  });
  // (A permanent never holds +1/+1 and -1/-1 counters together — they annihilate, CR 704.5q — so the policy is shown against a
  // different kind: oil, carried in greater number.)
  it("⭐ onto an opponent's creature the -1/-1 goes, not the more numerous oil — their 1/2 Squire takes it, and a second one kills it", () => {
    const s = board({ user: [perm("w1", CRAW_WURM, "user", { "-1/-1": 2, oil: 3 })], ai: [perm("o1", SQUIRE, "ai")] });
    const once = run(s, pick(s, "w1", "o1"));
    expect({ onSquire: counters(once, "o1"), wurm: counters(once, "w1") }).toEqual({ onSquire: { "-1/-1": 1 }, wurm: { "-1/-1": 1, oil: 3 } });
    const again = { ...once, players: { ...once.players, user: { ...once.players.user, manaPool: { ...once.players.user.manaPool, C: 1 }, battlefield: once.players.user.battlefield.map((p) => (p.id === "ng" ? { ...p, tapped: false } : p)) } } };
    const twice = run(again, pick(again, "w1", "o1"));
    expect(twice.players.ai.battlefield.some((p) => p.id === "o1")).toBe(false); // 1/2 with two -1/-1 → 0 toughness → dies
  });
  it("⭐ onto your own creature the +1/+1 goes, not the more numerous oil", () => {
    const s = board({ user: [perm("w1", CRAW_WURM, "user", { "+1/+1": 1, oil: 3 }), perm("b2", BEAR, "user")] });
    const out = run(s, pick(s, "w1", "b2"));
    expect({ onBear: counters(out, "b2"), wurm: counters(out, "w1") }).toEqual({ onBear: { "+1/+1": 1 }, wurm: { oil: 3 } });
  });
  it("⭐ a moved +1/+1 is a placed one — Terrasymbiosis's watcher fires; a moved oil counter does not", () => {
    const TERRASYMBIOSIS = { name: "Terrasymbiosis", type: "Enchantment", mana: "{2}{G}", cmc: 3, colors: ["G"], keywords: [],
      oracle: "Whenever you put one or more +1/+1 counters on a creature you control, you may draw that many cards. Do this only once each turn." };
    const fired = (s) => (s.pendingTriggers || []).some((t) => t.event === "countersPlaced")
      || (s.stack || []).some((o) => o.source?.name === "Terrasymbiosis") || s.pendingChoice?.sourceName === "Terrasymbiosis";
    const after = (fromCounters) => {
      const s = board({ user: [perm("w1", CRAW_WURM, "user", fromCounters), perm("b2", BEAR, "user"), perm("ts", TERRASYMBIOSIS, "user")] });
      return resolveTopOfStack(dispatchAction(s, pick(s, "w1", "b2")));
    };
    expect({ plus: fired(after({ "+1/+1": 1 })), oil: fired(after({ oil: 1 })) }).toEqual({ plus: true, oil: false });
  });
  it("⛔ activate only as a sorcery: not offered on the opponent's turn", () => {
    expect(moves(board({ user: [perm("b1", BEAR, "user", { "+1/+1": 1 }), perm("b2", BEAR, "user")], active: "ai" })).length).toBe(0);
  });
  it("⛔ CR 122.5 — the counter is gone by resolution: nothing moves", () => {
    const s = board({ user: [perm("b1", BEAR, "user", { "+1/+1": 1 }), perm("b2", BEAR, "user")] });
    let out = dispatchAction(s, pick(s, "b1", "b2"));
    out = { ...out, players: { ...out.players, user: { ...out.players.user, battlefield: out.players.user.battlefield.map((p) => (p.id === "b1" ? { ...p, counters: {} } : p)) } } };
    for (let i = 0; i < 4 && out.stack.length && !out.pendingChoice; i++) out = resolveTopOfStack(out);
    const log = out.log || [];
    expect({
      moved: counters(out, "b2")["+1/+1"] ?? 0,
      noOp: log.some((e) => e.effect === "move-counter" && e.moved === 0),
      errors: log.filter((e) => e.kind === "stack-resolve-error").length,
    }).toEqual({ moved: 0, noOp: true, errors: 0 });
  });
});
