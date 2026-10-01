/**
 * kikiFamilyTokenCopy.test.js — the token copy that is gone at the next end step (shelf decks D26, 2026-09-30: Halfshell
 * heroes' Tempestra, Dame of Games). "Create a token that's a copy of [another] target [nonlegendary] creature you control
 * [, except it has haste | , except it isn't legendary]. [It gains haste.] Sacrifice it at the beginning of the next end
 * step." — Kiki-Jiki, Tempestra, Orthion, The Fire Crystal; Stormsplitter's "Exile that token" rides the same seam.
 *
 * "It" after a copy is the TOKEN: "It gains haste." is a lasting layer-6 grant on exactly the minted tokens (not the
 * copiable "except it has haste", CR 707.9b), and the end-step sacrifice is baked onto the minted ids (CR 603.7) — every
 * token the copy made, a doubler's extras included; a sacrifice takes only one you still control (CR 701.21a).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the parser's fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyCreateTokenCopy } from "./effects/atoms/tokens.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TEMPESTRA = { name: "Tempestra, Dame of Games", type: "Legendary Creature — Elemental Illusion", mana: "{1}{R}", power: "1", toughness: "3", keywords: [],
  oracle: "{2}{R}, {T}, Sacrifice an artifact: Create a token that's a copy of another target creature you control, except it isn't legendary. It gains haste. Sacrifice it at the beginning of the next end step." };
const KIKI = { name: "Kiki-Jiki, Mirror Breaker", type: "Legendary Creature — Goblin Shaman", mana: "{2}{R}{R}{R}", power: "2", toughness: "2", keywords: ["Haste"],
  oracle: "Haste\n{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step." };
const ORTHION = { name: "Orthion, Hero of Lavabrink", type: "Legendary Creature — Human Soldier", mana: "{3}{R}", power: "3", toughness: "3", keywords: [],
  oracle: "{1}{R}, {T}: Create a token that's a copy of another target creature you control. It gains haste. Sacrifice it at the beginning of the next end step. Activate only as a sorcery.\n{6}{R}{R}{R}, {T}: Create five tokens that are copies of another target creature you control. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery." };
const FIRE_CRYSTAL = { name: "The Fire Crystal", type: "Legendary Artifact", mana: "{2}{R}{R}", keywords: [],
  oracle: "Red spells you cast cost {1} less to cast.\nCreatures you control have haste.\n{4}{R}{R}, {T}: Create a token that's a copy of target creature you control. Sacrifice it at the beginning of the next end step." };
const STORMSPLITTER = { name: "Stormsplitter", type: "Creature — Otter Wizard", mana: "{3}{R}", power: "1", toughness: "4", keywords: ["Haste"],
  oracle: "Haste\nWhenever you cast an instant or sorcery spell, create a token that's a copy of this creature. Exile that token at the beginning of the next end step." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: "2", toughness: "2", keywords: [], oracle: "" };
const PARALLEL_LIVES = { name: "Parallel Lives", type: "Enchantment", mana: "{3}{G}", keywords: [], oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], oracle: "{T}: Add {C}{C}." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };

function table({ user = [], ai = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: lib, manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no action"); return dispatchAction(s, a); }
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (the engine logs a crash as
 * a stack-resolve-error rather than throwing, so a witness that never looked would pass over one). */
const settle = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
const offered = (s, permId, abilityIndex) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId && (abilityIndex == null || a.abilityIndex === abilityIndex)).map((a) => a.targets?.[0]?.id).sort();
const activate = (s, permId, target, abilityIndex) => settle(act(s, (a) => a.kind === "activate-ability" && a.permanentId === permId && a.targets?.[0]?.id === target && (abilityIndex == null || a.abilityIndex === abilityIndex)));
/** Step the way the driver does (enter, then run the step's actions) to the end step, then let what fires resolve. */
function toEndStep(s) { let n = s, g = 0; while (n.step !== "end" && g++ < 30) n = runStepActions(advanceStep(n)); return settle(n); }
const tokens = (s, pid = "user") => s.players[pid].battlefield.filter((p) => p.card?.token);
const onField = (s, id) => Object.values(s.players).some((p) => p.battlefield.some((x) => x.id === id));

describe("the cards", () => {
  it("Kiki-Jiki, Tempestra, Orthion, The Fire Crystal and Stormsplitter read native", () => {
    expect(Object.fromEntries([KIKI, TEMPESTRA, ORTHION, FIRE_CRYSTAL, STORMSPLITTER].map((c) => [c.name, classifyCard(c)]))).toEqual({
      "Kiki-Jiki, Mirror Breaker": "native-activated", "Tempestra, Dame of Games": "native-activated", "Orthion, Hero of Lavabrink": "native-activated",
      "The Fire Crystal": "native-mixed", "Stormsplitter": "native-trigger",
    });
  });
  it("Tempestra's copy: another, not legendary, gains haste, sacrificed at the next end step; Kiki-Jiki's: nonlegendary only, copiable haste", () => {
    const tempestra = parseEffectClause("Create a token that's a copy of another target creature you control, except it isn't legendary. It gains haste. Sacrifice it at the beginning of the next end step.", "Instant");
    const kiki = parseEffectClause("Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", "Instant");
    const leave = { op: "schedule-minted-leave", fate: "sacrifice", fireStep: "end", fireScope: "any", targetType: null };
    expect({ tempestra: tempestra.atoms, kiki: kiki.atoms, storm: detectTriggers(STORMSPLITTER).map((d) => d.effectClause) }).toEqual({
      tempestra: [{ op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "notSource" }], notLegendary: true, gainsHaste: true }, leave],
      kiki: [{ op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "supertype", value: "legendary", negate: true }], grantKeywords: ["haste"] }, leave],
      storm: ["create a token that's a copy of this creature. Exile that token at the beginning of the next end step"],
    });
  });
});

describe("⛔ the fences", () => {
  it("SYNTHETIC clauses: a referent after a copy names the TOKEN, so binding it to the copied creature is refused; the folds need a copy; the pronoun must agree", () => {
    const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
    expect({
      eotHasteAfterCopy: conf("Create a token that's a copy of target creature you control. It gains haste until end of turn."),
      hasteWithoutCopy: conf("Target creature gets +1/+0 until end of turn. It gains haste."),
      themForOne: conf("Create a token that's a copy of target creature you control. Sacrifice them at the beginning of the next end step."),
      itForFive: conf("Create five tokens that are copies of another target creature you control. They gain haste. Sacrifice it at the beginning of the next end step."),
      leaveWithoutCopy: conf("Target creature gets +1/+0 until end of turn. Sacrifice it at the beginning of the next end step."),
    }).toEqual({ eotHasteAfterCopy: "low", hasteWithoutCopy: "low", themForOne: "low", itForFive: "low", leaveWithoutCopy: "low" });
  });
  it("the plain copy keeps its old shape (Quasiduplicate's family)", () => {
    expect(parseEffectClause("Create a token that's a copy of target creature you control, except it isn't legendary.", "Instant").atoms)
      .toEqual([{ op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], notLegendary: true }]);
  });
  it("SYNTHETIC: a copy that makes nothing clears an older stamp — the end-step sacrifice can never take another effect's tokens", () => {
    const s = { ...table({ user: [P("old", BEAR, "user", { card: { ...BEAR, id: "c-old", token: true } })] }), _lastMintedTokenIds: ["old"] };
    const after = applyCreateTokenCopy(s, { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "gone" }] });
    expect(after._lastMintedTokenIds).toEqual([]);
  });
});

describe("⭐ in play", () => {
  it("⭐ Tempestra copies Isamaru (only another creature you control is offered): the token isn't legendary, has haste, and is sacrificed at the end step", () => {
    const s0 = table({ user: [P("tempestra", TEMPESTRA), P("isamaru", ISAMARU), P("ring", SOL_RING)], ai: [P("aiBear", BEAR, "ai")], mana: { R: 1, C: 2 } });
    const pool = offered(s0, "tempestra");
    const s = activate(s0, "tempestra", "isamaru");
    const [tok] = tokens(s);
    const end = toEndStep(s);
    const row = { offered: pool, token: tok?.card?.name, legendary: /Legendary/.test(String(tok?.card?.type)), haste: !!tok && permanentHasKeyword(s, tok.id, "Haste"),
      bothLegendsStay: onField(s, "isamaru") && !!tok, ringSacrificed: !onField(s, "ring"), tokenAfterEnd: !!tok && onField(end, tok.id), isamaruAfterEnd: onField(end, "isamaru") };
    console.log(`WITNESS tempestra ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["isamaru"], token: "Isamaru, Hound of Konda", legendary: false, haste: true, bothLegendsStay: true, ringSacrificed: true, tokenAfterEnd: false, isamaruAfterEnd: true });
  });
  it("Kiki-Jiki offers only a nonlegendary creature you control; the Bear's copy has haste and is sacrificed at the end step", () => {
    const s0 = table({ user: [P("kiki", KIKI), P("isamaru", ISAMARU), P("bear", BEAR)], ai: [P("aiBear", BEAR, "ai")] });
    const pool = offered(s0, "kiki");
    const s = activate(s0, "kiki", "bear");
    const [tok] = tokens(s);
    const end = toEndStep(s);
    const sacrificed = end.log.some((e) => e.effect === "sacrifice" && e.sacrificed === tok?.id);
    expect({ pool, haste: !!tok && permanentHasKeyword(s, tok.id, "Haste"), gone: !onField(end, tok?.id), sacrificed, bearStays: onField(end, "bear") })
      .toEqual({ pool: ["bear"], haste: true, gone: true, sacrificed: true, bearStays: true });
  });
  it("with Parallel Lives, Kiki-Jiki makes two tokens — \"it\" is both, and both are sacrificed", () => {
    const s = activate(table({ user: [P("kiki", KIKI), P("bear", BEAR), P("lives", PARALLEL_LIVES)] }), "kiki", "bear");
    const made = tokens(s).map((t) => t.id);
    const end = toEndStep(s);
    expect({ made: made.length, left: made.filter((id) => onField(end, id)).length }).toEqual({ made: 2, left: 0 });
  });
  it("a token another player now controls is not sacrificed (CR 701.21a — SYNTHETIC control change); one already dead is left alone", () => {
    const s0 = table({ user: [P("tempestra", TEMPESTRA), P("isamaru", ISAMARU), P("ring", SOL_RING)], hand: [["bolt", BOLT]], mana: { R: 1, C: 2 } });
    const s = activate(s0, "tempestra", "isamaru");
    const [tok] = tokens(s);
    const stolen = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== tok.id) }, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, { ...tok, controller: "ai" }] } } };
    const withRed = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 1 } } } }; // the auto-payer spent red on the generic cost
    const killed = settle(act(withRed, (a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === tok.id));
    // "It gains haste" states no duration, so it lasts (CR 611.2a): the kept token is still hasty on the next turn.
    let later = toEndStep(stolen), g = 0;
    while (later.turn === 6 && g++ < 30) later = runStepActions(advanceStep(later));
    expect({ stolenStays: onField(later, tok.id), stillHasty: permanentHasKeyword(later, tok.id, "Haste"), turn: later.turn, killedGone: !onField(killed, tok.id), quietEnd: !onField(toEndStep(killed), tok.id) })
      .toEqual({ stolenStays: true, stillHasty: true, turn: 7, killedGone: true, quietEnd: true });
  });
  it("Orthion's second ability: five hasty copies, all five sacrificed at the end step", () => {
    const s0 = table({ user: [P("orthion", ORTHION), P("bear", BEAR)], mana: { R: 3, C: 6 } });
    const s = activate(s0, "orthion", "bear", 1);
    const made = tokens(s);
    const end = toEndStep(s);
    expect({ made: made.length, hasty: made.filter((t) => permanentHasKeyword(s, t.id, "Haste")).length, left: made.filter((t) => onField(end, t.id)).length })
      .toEqual({ made: 5, hasty: 5, left: 0 });
  });
  it("The Fire Crystal: the copy is sacrificed at the end step", () => {
    const s = activate(table({ user: [P("crystal", FIRE_CRYSTAL), P("bear", BEAR)], mana: { R: 2, C: 4 } }), "crystal", "bear");
    const [tok] = tokens(s);
    expect({ made: !!tok, left: onField(toEndStep(s), tok?.id) }).toEqual({ made: true, left: false });
  });
  it("Stormsplitter: an instant cast makes a copy of it, EXILED (not sacrificed) at the end step", () => {
    const s = settle(act(table({ user: [P("storm", STORMSPLITTER)], hand: [["bolt", BOLT]], mana: { R: 1 } }), (a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ai"));
    const [tok] = tokens(s);
    const end = toEndStep(s);
    expect({ token: tok?.card?.name, left: onField(end, tok?.id), exiled: end.log.some((e) => e.effect === "exile" && (e.targets || []).includes(tok?.id)), sacrificed: end.log.some((e) => e.effect === "sacrifice" && e.sacrificed === tok?.id) })
      .toEqual({ token: "Stormsplitter", left: false, exiled: true, sacrificed: false });
  });
});
