/**
 * steelHellkite.test.js — STEEL HELLKITE (the play-weighted program, EDHREC #1184):
 *
 *   "Flying
 *    {2}: This creature gets +1/+0 until end of turn.
 *    {X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn.
 *    Activate only once each turn."
 *
 * The last line was the one unread: an {X} activation (X chosen as it is activated, CR 107.3a — 0 included: its ruling, "with X equal
 * to 0, it will destroy each nonland permanent with mana value 0") whose set is read as it resolves (CR 608.2h): every nonland
 * permanent with mana value exactly X (CR 202.3 — a copy's is the copied card's, a token's 0) controlled by a player this creature
 * dealt combat damage to this turn. The record is the turn's combat damage ledger (combatResolution's `combatDamageToPlayersThisTurn`,
 * keyed by the dealing object — a new object after a blink has none, CR 400.7). Its rulings: it doesn't matter who controlled those
 * permanents when the damage was dealt, or whether they were on the battlefield then; it may be activated with no damage dealt and does
 * nothing; X exactly, not "or less". "Activate only once each turn" is the activation limit (CR 602.5b).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

const HELLKITE = {"name":"Steel Hellkite","type":"Artifact Creature — Dragon","mana":"{6}","oracle":"Flying\n{2}: This creature gets +1/+0 until end of turn.\n{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn.","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #1184
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const RELIC = {"name":"Darksteel Relic","type":"Artifact","mana":"{0}","oracle":"Indestructible (Effects that say \"destroy\" don't destroy this artifact.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #8171
const CLOUDSHIFT = {"name":"Cloudshift","type":"Instant","mana":"{W}","oracle":"Exile target creature you control, then return that card to the battlefield under your control.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #774
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","oracle":"Destroy target creature.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #861
const WIND_DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","oracle":"Flying","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #26647
const BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented.","layout":"normal","cmc":2,"power":"3","toughness":"2","loyalty":null,"keywords":["Haste","Trample"],"colors":["G"],"colorIdentity":["G"]};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (pid) => Array.from({ length: 6 }, (_, i) => ({ ...FOREST, id: `lib${i}-${pid}` }));
const aiBoard = (seat = "ai") => [on(seat, `${seat}-ring`, SOL_RING), on(seat, `${seat}-stone`, MIND_STONE), on(seat, `${seat}-bears`, BEARS), on(seat, `${seat}-thopter`, ORNITHOPTER), on(seat, `${seat}-relic`, RELIC), on(seat, `${seat}-forest`, FOREST)];
/** `seat` active; the Hellkite `hk` on the user's battlefield (tapped and attacking `defender` when `attackAt` is given), in the declare
 *  blockers step after the block declaration; `pod` a four-seat Commander pod. */
function table({ seat = "user", boards = {}, hands = {}, pools = {}, pod = false, attackAt = null, attacker = "hk", blocks = [] } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: hands[pid] || [], library: lib(pid), manaPool: { ...EMPTY, ...(pools[pid] || {}) } };
  }
  const base = { ...g, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
  if (!attackAt) return { ...base, phase: "precombat-main", step: "main" };
  return { ...base, phase: "combat", step: "declare-blockers",
    combat: { attackers: [{ permanentId: attacker, attackingPlayer: seat, defender: attackAt }], blockers: blocks.map(([b, a, who]) => ({ blockerId: b, blockingPlayer: who, attackerId: a })), _blockTriggersFired: true } };
}
const hellkite = (extra = {}) => on("user", "hk", HELLKITE, extra);
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && ((s.stack || []).length || (s.pendingTriggers || []).length) && !s.pendingChoice; i++) {
    s = (s.pendingTriggers || []).length ? flushTriggers(s, { chooseTargets: chooseTriggerTargets }) : flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return s;
}
function toMain2(s0) {
  let s = s0;
  for (let i = 0; i < 12 && !(s.phase === "postcombat-main" && s.step === "main"); i++) s = settle(nextStep(s));
  expect({ phase: s.phase, step: s.step }).toEqual({ phase: "postcombat-main", step: "main" });
  return s;
}
const xActs = (s, seat = "user", permId = "hk") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === permId && a.xValue != null);
const xAct = (s, x, seat = "user", permId = "hk") => { const a = xActs(s, seat, permId).find((y) => y.xValue === x); expect(a, `X = ${x} is not offered`).toBeTruthy(); return a; };
const names = (s, seat) => (s.players[seat]?.battlefield || []).map((p) => p.card?.name).sort();
const withPool = (s, seat, pool) => ({ ...s, players: { ...s.players, [seat]: { ...s.players[seat], manaPool: { ...EMPTY, ...pool } } } });

describe("the card", () => {
  it("⭐ native: the {X} activation is modeled — X exact, the set read off the source's combat damage this turn", () => {
    expect(isNativeTier(classifyCard(HELLKITE))).toBe(true);
    const ab = parseActivatedAbilities(HELLKITE).find((a) => /^\{X\}/.test(a.raw));
    expect({ modeled: ab.modeled, limit: ab.activationLimit, xSpell: ab.program?.xSpell }).toEqual({ modeled: true, limit: 1, xSpell: true });
  });
  it("controls: \"mana value X or less\" and \"each opponent\" stay unread", () => {
    expect(parseEffectClause("Destroy each nonland permanent with mana value X or less whose controller was dealt combat damage by this creature this turn.", "Instant", { hasX: true }).confidence).toBe("low");
    expect(parseEffectClause("Destroy each nonland permanent with mana value X.", "Instant", { hasX: true }).confidence).toBe("low");
  });
});

describe("the game — the person", () => {
  it("⭐ unblocked, 5 to the AI: X = 2 destroys the AI's Mind Stone and Grizzly Bears — not Sol Ring, the Forest, nor the user's own Mind Stone", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true }), on("user", "u-stone", MIND_STONE)], ai: aiBoard() } });
    const main2 = toMain2(s0);
    expect(main2.players.ai.life).toBe(s0.players.ai.life - 5);
    const s = settle(dispatchAction(withPool(main2, "user", { C: 2 }), xAct(withPool(main2, "user", { C: 2 }), 2)));
    expect({ ai: names(s, "ai"), user: names(s, "user"), aiGy: s.players.ai.graveyard.map((c) => c.name).sort() })
      .toEqual({ ai: ["Darksteel Relic", "Forest", "Ornithopter", "Sol Ring"], user: ["Mind Stone", "Steel Hellkite"], aiGy: ["Grizzly Bears", "Mind Stone"] });
  });
  it("⭐ X = 0 is offered (its ruling): it destroys the AI's mana-value-0 Ornithopter and Treasure token — Darksteel Relic is indestructible", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() } });
    const treasure = resolveAtom(s0, parseEffectClause("Create a Treasure token.", "Instant").atoms[0], { controller: "ai", targets: [] });
    const main2 = toMain2(treasure);
    expect(names(main2, "ai")).toContain("Treasure");
    const s = settle(dispatchAction(main2, xAct(main2, 0)));
    expect(names(s, "ai")).toEqual(["Darksteel Relic", "Forest", "Grizzly Bears", "Mind Stone", "Sol Ring"]);
  });
  it("⭐ activate only once each turn: after X = 1 the {X} ability is not offered again this turn; it is the next turn", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() } });
    const main2 = withPool(toMain2(s0), "user", { C: 5 });
    const s = settle(dispatchAction(main2, xAct(main2, 1)));
    expect({ ring: names(s, "ai").includes("Sol Ring"), again: xActs(withPool(s, "user", { C: 5 })).length }).toEqual({ ring: false, again: 0 });
    const next = { ...withPool(s, "user", { C: 5 }), turn: s.turn + 1, phase: "precombat-main", step: "main" };
    expect(xActs(next).length).toBeGreaterThan(0);
  });
  it("⭐ blocked by Wind Drake — no combat damage to a player: X = 2 does nothing (its ruling — it may be activated, and does nothing)", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: [...aiBoard(), on("ai", "wall", WIND_DRAKE)] }, blocks: [["wall", "hk", "ai"]] });
    const main2 = withPool(toMain2(s0), "user", { C: 2 });
    expect(main2.players.ai.life).toBe(s0.players.ai.life);
    const s = settle(dispatchAction(main2, xAct(main2, 2)));
    expect({ ai: names(s, "ai"), drake: names(main2, "ai").includes("Wind Drake") }).toEqual({ ai: names(main2, "ai"), drake: false });
  });
  it("⭐ before combat this turn: offered, and does nothing", () => {
    const s0 = withPool(table({ boards: { user: [hellkite()], ai: aiBoard() } }), "user", { C: 2 });
    const s = settle(dispatchAction(s0, xAct(s0, 2)));
    expect(names(s, "ai")).toEqual(names(s0, "ai"));
  });
  it("⭐ a pod: the Hellkite hit ai1 only — X = 2 takes ai1's Mind Stone and Bears, never ai2's", () => {
    const s0 = table({ pod: true, attackAt: "ai1", boards: { user: [hellkite({ tapped: true })], ai1: aiBoard("ai1"), ai2: aiBoard("ai2") } });
    const main2 = withPool(toMain2(s0), "user", { C: 2 });
    const s = settle(dispatchAction(main2, xAct(main2, 2)));
    expect({ ai1: names(s, "ai1"), ai2: names(s, "ai2") }).toEqual({ ai1: ["Darksteel Relic", "Forest", "Ornithopter", "Sol Ring"], ai2: names(main2, "ai2") });
  });
  it("⭐ its ruling — a permanent the damaged player got after the damage is destroyed too: the AI's Bears entering after combat", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: [on("ai", "forest", FOREST)] } });
    const main2 = toMain2(s0);
    const late = { ...main2, players: { ...main2.players, ai: { ...main2.players.ai, battlefield: [...main2.players.ai.battlefield, on("ai", "late-bears", BEARS, { enteredOnTurn: main2.turn })] } } };
    const s = settle(dispatchAction(withPool(late, "user", { C: 2 }), xAct(withPool(late, "user", { C: 2 }), 2)));
    expect(names(s, "ai")).toEqual(["Forest"]);
  });
  it("⭐ a new object (CR 400.7): the Hellkite Cloudshifted after combat has dealt no combat damage this turn — X = 2 does nothing", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() }, hands: { user: [{ ...CLOUDSHIFT, id: "h-shift" }] } });
    const main2 = withPool(toMain2(s0), "user", { W: 1 });
    const shift = legalActionsForPlayer(main2, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-shift" && a.targets?.[0]?.id === "hk");
    expect(shift, "Cloudshift on the Hellkite is not offered").toBeTruthy();
    const back = settle(dispatchAction(main2, shift));
    const newId = back.players.user.battlefield.find((p) => p.card?.name === "Steel Hellkite")?.id;
    expect(newId && newId !== "hk").toBe(true);
    const fed = withPool(back, "user", { C: 2 });
    const s = settle(dispatchAction(fed, xAct(fed, 2, "user", newId)));
    expect(names(s, "ai")).toEqual(names(main2, "ai"));
  });
  it("⭐ the ability resolves from its record though the Hellkite is gone: the AI Murders it in response — Mind Stone and Bears are still destroyed", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() }, hands: { ai: [{ ...MURDER, id: "h-murder" }] } });
    const main2 = withPool(withPool(toMain2(s0), "user", { C: 2 }), "ai", { B: 2, C: 1 });
    const activated = flushTriggers(dispatchAction(main2, xAct(main2, 2)), { chooseTargets: chooseTriggerTargets });
    const aiPrio = { ...activated, priorityHolder: "ai" };
    const murder = legalActionsForPlayer(aiPrio, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h-murder" && a.targets?.[0]?.id === "hk");
    expect(murder, "Murder on the Hellkite is not offered").toBeTruthy();
    const s = settle(dispatchAction(aiPrio, murder));
    expect({ hk: !!findPermanent(s, "hk"), ai: names(s, "ai") }).toEqual({ hk: false, ai: ["Darksteel Relic", "Forest", "Ornithopter", "Sol Ring"] });
  });
});

describe("the record's guards (pw27's review, F2)", () => {
  it("⭐ protection from everything (The One Ring's): the unblocked Hellkite's damage to the AI is prevented (CR 702.16j) — no record, X = 2 destroys nothing", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() } });
    const ring = parseEffectClause("You gain protection from everything until your next turn.", "Instant");
    expect(ring.atoms.map((a) => a.op)).toEqual(["player-protection-everything"]);
    const shielded = resolveAtom(s0, ring.atoms[0], { controller: "ai", targets: [] }); // The One Ring's enters trigger, resolved for the AI
    const main2 = withPool(toMain2(shielded), "user", { C: 2 });
    expect({ aiLife: main2.players.ai.life, record: main2.combatDamageToPlayersThisTurn?.bySource?.hk ?? null }).toEqual({ aiLife: s0.players.ai.life, record: null });
    const s = settle(dispatchAction(main2, xAct(main2, 2)));
    expect(names(s, "ai")).toEqual(names(main2, "ai"));
  });
  it("⭐ combat damage can't be prevented (Frenzied Baloth, CR 615.12): the protected AI is dealt the 5 — recorded, X = 2 destroys", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true }), on("user", "bal", BALOTH)], ai: aiBoard() } });
    const ring = parseEffectClause("You gain protection from everything until your next turn.", "Instant");
    const shielded = resolveAtom(s0, ring.atoms[0], { controller: "ai", targets: [] }); // The One Ring's enters trigger, resolved for the AI
    const main2 = withPool(toMain2(shielded), "user", { C: 2 });
    expect({ aiLife: main2.players.ai.life, record: main2.combatDamageToPlayersThisTurn?.bySource?.hk ?? null }).toEqual({ aiLife: s0.players.ai.life - 5, record: ["ai"] });
    const s = settle(dispatchAction(main2, xAct(main2, 2)));
    expect(names(s, "ai")).toEqual(["Darksteel Relic", "Forest", "Ornithopter", "Sol Ring"]);
  });
  it("⭐ a stale turn: the Hellkite hit the AI on turn 5; on the user's next turn, with no combat yet, X = 2 destroys nothing", () => {
    const s0 = table({ attackAt: "ai", boards: { user: [hellkite({ tapped: true })], ai: aiBoard() } });
    let s = toMain2(s0);
    expect(s.combatDamageToPlayersThisTurn).toEqual({ turn: 5, bySource: { hk: ["ai"] } });
    for (let i = 0; i < 40 && !(s.activePlayer === "user" && s.turn > 5 && s.phase === "precombat-main" && s.step === "main"); i++) s = settle(nextStep(s));
    expect({ turn: s.turn, active: s.activePlayer, phase: s.phase, record: s.combatDamageToPlayersThisTurn?.turn }).toEqual({ turn: 7, active: "user", phase: "precombat-main", record: 5 });
    const fed = withPool(s, "user", { C: 2 });
    const after = settle(dispatchAction(fed, xAct(fed, 2)));
    expect(names(after, "ai")).toEqual(names(fed, "ai"));
    expect(names(fed, "ai")).toContain("Mind Stone");
  });
});

describe("the game — the default AI", () => {
  it("⭐ the AI's Hellkite hit the user: the default AI holds the {X} ability (it is offered; the AI doesn't take it)", () => {
    const s0 = table({ seat: "ai", attackAt: "user", boards: { ai: [{ ...on("ai", "hk", HELLKITE), tapped: true }], user: aiBoard("user") } });
    const main2 = withPool(toMain2(s0), "ai", { C: 3 });
    expect(xActs(main2, "ai").map((a) => a.xValue).sort()).toEqual([0, 1, 2, 3]);
    const pick = pickAction(main2, "ai", legalActionsForPlayer(main2, "ai"));
    expect(pick?.kind === "activate-ability" && pick?.permanentId === "hk").toBe(false);
  });
});
