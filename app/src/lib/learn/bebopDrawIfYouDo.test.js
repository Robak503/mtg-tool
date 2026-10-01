/**
 * bebopDrawIfYouDo.test.js — Bebop, Skull & Crossbones (shelf decks D23, 2026-09-30: Halfshell heroes). "Whenever Bebop deals
 * combat damage to a player, you may draw X cards, where X is the number of counters on Bebop. If you do, you lose X life."
 *
 *   • "draw X cards, where X is the number of <count>" — the "draw cards equal to the number of" count, worded with X;
 *   • "the number of counters on this creature" — every counter of every kind (countForSpec's all-kinds countersOnSource);
 *   • the self-name ("counters on Bebop") rewritten to the source inside this exact grammar;
 *   • "you may draw …. If you do, you lose X life" — the optional draw gates the life loss (reflexiveGate), and the loss binds
 *     the SAME X. Only a draw may lead this shape: it always happens once chosen (CR 121.3).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BEBOP = { name: "Bebop, Skull & Crossbones", type: "Legendary Creature — Boar Mutant", mana: "{1}{B}", power: "2", toughness: "2", keywords: ["Deathtouch"],
  oracle: "Partner with Rocksteady, Mutant Marauder (When this creature enters, target player may put Rocksteady into their hand from their library, then shuffle.)\nDeathtouch\nWhenever Bebop deals combat damage to a player, you may draw X cards, where X is the number of counters on Bebop. If you do, you lose X life." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };

function board(counters) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const bebop = { ...createPermanent({ id: "bebop", card: { ...BEBOP, id: "c-bebop" }, controller: "user", summoningSick: false }), counters };
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [bebop], library: lib } } };
}
/** Bebop connects; resolve to the "you may draw" question. */
function connect(counters) {
  let s = flushTriggers(checkCombatDamageTriggers(board(counters), [{ kind: "combat-damage-player", attackerId: "bebop", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while (s.stack?.length && !s.pendingChoice && g++ < 10) s = resolveTopOfStack(s);
  return s;
}
const drawn = (s) => 5 - s.players.user.library.length;
const lifeLost = (s) => 40 - s.players.user.life;

describe("the card", () => {
  it("the self-name rewrites to the source; the draw counts every counter and the life loss is gated on it; reads native", () => {
    const d = detectTriggers(BEBOP).find((x) => x.event === "combatDamageToPlayer");
    const p = parseEffectClause(d.effectClause, "Instant", { sourceScoped: true });
    expect({ clause: d.effectClause, conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(BEBOP) }).toEqual({
      clause: "you may draw X cards, where X is the number of counters on this creature. If you do, you lose X life",
      conf: "high",
      atoms: [
        { op: "draw", amountCount: { kind: "countersOnSource", per: 1 }, targetType: null, optional: true },
        { op: "lose-life", who: "controller", amountCount: { kind: "countersOnSource", per: 1 }, targetType: null, reflexiveGate: true },
      ],
      tier: "native-trigger",
    });
  });
  it("only a lone optional draw leads the shape, and only \"you lose X life\" follows it", () => {
    const conf = (t) => programConfidence(parseEffectClause(t, "Instant", { sourceScoped: true }));
    expect({
      drawXPlain: conf("draw X cards, where X is the number of creatures you control"),
      otherPayoff: conf("you may draw X cards, where X is the number of counters on this creature. If you do, you gain X life"),
      notADraw: conf("you may gain life equal to the number of creatures you control. If you do, you lose X life"),
      noX: conf("you may draw a card. If you do, you lose X life"),
      unmodeledCount: conf("you may draw X cards, where X is the number of times you've cast a spell this game. If you do, you lose X life"),
    }).toEqual({ drawXPlain: "high", otherPayoff: "low", notADraw: "low", noX: "low", unmodeledCount: "low" });
  });
});

describe("⭐ in play", () => {
  it("⭐ with two +1/+1 counters and a shield counter on him, Bebop asks; yes → three cards and three life", () => {
    const s = connect({ "+1/+1": 2, shield: 1 });
    const asked = s.pendingChoice?.kind;
    const after = resolveOptionalChoice(s, true);
    const row = { asked, drew: drawn(after), lost: lifeLost(after) };
    console.log(`WITNESS bebopTakes ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: "optional-effect", drew: 3, lost: 3 });
  });
  it("no → no cards and no life lost (the \"if you do\" gate)", () => {
    const after = resolveOptionalChoice(connect({ "+1/+1": 2, shield: 1 }), false);
    expect({ drew: drawn(after), lost: lifeLost(after) }).toEqual({ drew: 0, lost: 0 });
  });
});

// ── The same two arms reach four more printed cards (the flip-diff's unaimed gains) — each verified in play. (Two others the
// first build reached were FALSE and are fenced: Flay Essence's "counters on it" names the exiled target, not a source — the
// all-kinds count admits only "this creature"; Camaraderie's "gain X life and draw X cards, where X is …" — splitClauses keeps
// one X across conjuncts whole.)
const STANDARD_BEARER = { name: "Liliana's Standard Bearer", type: "Creature — Zombie Knight", mana: "{2}{B}", power: "3", toughness: "1", keywords: ["Flash"], oracle: "Flash\nWhen this creature enters, draw X cards, where X is the number of creatures that died under your control this turn." };
const SPECTRUM = { name: "Brilliant Spectrum", type: "Sorcery", mana: "{3}{U}", keywords: [], oracle: "Converge — Draw X cards, where X is the number of colors of mana spent to cast this spell. Then discard two cards." };
const SPELLBLADE = { name: "Surrakar Spellblade", type: "Creature — Surrakar", mana: "{1}{U}{U}", power: "2", toughness: "1", keywords: [], oracle: "Whenever you cast an instant or sorcery spell, you may put a charge counter on this creature.\nWhenever this creature deals combat damage to a player, you may draw X cards, where X is the number of charge counters on it." };
const CODEX = { name: "Barrin's Codex", type: "Artifact — Book", mana: "{4}", keywords: [], oracle: "At the beginning of your upkeep, you may put a page counter on this artifact.\n{4}, {T}, Sacrifice this artifact: Draw X cards, where X is the number of page counters on this artifact." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target.", colors: ["R"] };

function table({ user = [], ai = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: lib, manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no action"); return dispatchAction(s, a); }
const settle = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };

describe("the unaimed gains, in play", () => {
  it("Liliana's Standard Bearer draws one per creature that died under YOUR control this turn — two of yours, not theirs", () => {
    let s = table({ user: [P("b1", BEAR), P("b2", BEAR)], ai: [P("t1", BEAR, "ai")], hand: [["bolt1", BOLT], ["bolt2", BOLT], ["bolt3", BOLT], ["lsb", STANDARD_BEARER]], mana: { R: 3, B: 1, C: 2 } });
    for (const [bolt, victim] of [["bolt1", "b1"], ["bolt2", "b2"], ["bolt3", "t1"]]) s = settle(act(s, (a) => a.kind === "cast-spell" && a.cardId === bolt && a.targets?.[0]?.id === victim));
    s = settle(act(s, (a) => a.kind === "cast-spell" && a.cardId === "lsb"));
    expect({ tier: classifyCard(STANDARD_BEARER), drew: drawn(s) }).toEqual({ tier: "native-trigger", drew: 2 });
  });
  it("Brilliant Spectrum, cast with blue, green and red (and a colorless), draws three before its discard", () => {
    const s = settle(act(table({ hand: [["bs", SPECTRUM], ["keep1", BEAR], ["keep2", BEAR]], mana: { U: 1, G: 1, R: 1, C: 1 } }), (a) => a.kind === "cast-spell" && a.cardId === "bs"));
    expect({ tier: classifyCard(SPECTRUM), drew: drawn(s), discardAsked: !!s.pendingChoice }).toEqual({ tier: "native-spell", drew: 3, discardAsked: true });
  });
  it("Surrakar Spellblade connects with two charge counters: yes → two cards", () => {
    let s = table({ user: [P("sb", SPELLBLADE, "user", { counters: { charge: 2 } })] });
    s = settle(flushTriggers(checkCombatDamageTriggers({ ...s, phase: "combat", step: "combat-damage" }, [{ kind: "combat-damage-player", attackerId: "sb", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: chooseTriggerTargets }));
    const after = resolveOptionalChoice(s, true);
    expect({ tier: classifyCard(SPELLBLADE), drew: drawn(after) }).toEqual({ tier: "native-trigger", drew: 2 });
  });
  it("Barrin's Codex sacrificed with three page counters draws three — its counters as it last existed (CR 608.2h)", () => {
    const s = settle(act(table({ user: [P("codex", CODEX, "user", { counters: { page: 3 } })], mana: { C: 4 } }), (a) => a.kind === "activate-ability" && a.permanentId === "codex"));
    expect({ tier: classifyCard(CODEX), drew: drawn(s), gone: !s.players.user.battlefield.some((p) => p.id === "codex") }).toEqual({ tier: "native-mixed", drew: 3, gone: true });
  });
});

describe("⛔ the two the first build reached falsely stay fenced", () => {
  it("Camaraderie's \"You gain X life and draw X cards, where X is …\" stays unclaimed — one X across conjuncts isn't split onto the cost X", () => {
    const CAMARADERIE = { name: "Camaraderie", type: "Sorcery", mana: "{4}{G}{W}", keywords: [], oracle: "You gain X life and draw X cards, where X is the number of creatures you control. Creatures you control get +1/+1 until end of turn." };
    expect(classifyCard(CAMARADERIE)).not.toMatch(/^native/);
  });
});
