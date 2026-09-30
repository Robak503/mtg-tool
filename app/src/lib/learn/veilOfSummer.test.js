/**
 * veilOfSummer.test.js — Veil of Summer (shelf decks D18, 2026-09-30: Kinnan and Killer Turts). "Draw a card if an opponent has
 * cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain
 * hexproof from blue and from black until end of turn."
 *
 *   • the draw reads D17's colour ledger, widened to "has cast" and a two-colour "blue or black" (either colour satisfies it);
 *   • "can't be countered this turn" is a turn stamp on the controller, honoured by the one uncounterable predicate every
 *     counter path reads — for spells already on the stack and spells cast later that turn;
 *   • hexproof from blue and from black (CR 702.11d/f): the player half is read by the player-targeting seam, the permanents
 *     get an end-of-turn target shield — the set locked as it resolves (CR 611.2c). Only OPPONENTS' blue/black sources are
 *     refused, and "opponents" are the shielded permanent's CURRENT controller's (CR 109.5): a Giant stolen after Veil is
 *     shielded against its old controller. A path that threads no source colours (triggers) is refused outright.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { expireContinuousEffects } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const VEIL = card("Veil of Summer", "Instant", "{G}", 1, "Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)", { colors: ["G"] });
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, "Return target creature to its owner's hand.", { colors: ["U"] });
const BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const MIND_ROT = card("Mind Rot", "Sorcery", "{2}{B}", 3, "Target player discards two cards.", { colors: ["B"] });
const COUNTERSPELL = card("Counterspell", "Instant", "{U}{U}", 2, "Counter target spell.", { colors: ["U"] });
const GIANT_GROWTH = card("Giant Growth", "Instant", "{G}", 1, "Target creature gets +3/+3 until end of turn.", { colors: ["G"] });
const INSPIRATION = card("Inspiration", "Instant", "{3}{U}", 4, "Target player draws two cards.", { colors: ["U"] });
const TREASON = card("Act of Treason", "Sorcery", "{2}{R}", 3, "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)", { colors: ["R"] });
const FRAYING = card("Fraying Sanity", "Enchantment — Aura Curse", "{2}{U}", 3, "Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.", { colors: ["U"], keywords: ["Enchant", "Mill"] });
const MANOWAR = card("Man-o'-War", "Creature — Jellyfish", "{2}{U}", 3, "When this creature enters, return target creature to its owner's hand.", { power: "2", toughness: "2", colors: ["U"] });
const RATS = card("Ravenous Rats", "Creature — Rat", "{1}{B}", 2, "When this creature enters, target opponent discards a card.", { power: "1", toughness: "1", colors: ["B"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3", colors: ["R"] });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function board({ active = "ai", user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: (o.library || []).map((c, i) => ({ ...c, id: `${id}-lib${i}` })), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) } };
}
const castsOf = (s, who, id) => legalActionsForPlayer({ ...s, priorityHolder: who }, who).filter((a) => a.kind === "cast-spell" && a.cardId === id);
function cast(s, who, id, pick = () => true) {
  const a = castsOf(s, who, id).find(pick);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
const drain = (s) => { let n = s, g = 0; while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
const targetsOf = (s, who, id) => [...new Set(castsOf(s, who, id).map((a) => a.targets[0]?.id))].sort();
/** This turn's cleanup (CR 514.2 — "until end of turn" effects end), then the next turn. */
const nextTurn = (s) => ({ ...expireContinuousEffects(s, { atCleanupOfTurn: s.turn }), turn: s.turn + 1 });
const topUp = (s, who, mana) => ({ ...s, players: { ...s.players, [who]: { ...s.players[who], manaPool: { ...s.players[who].manaPool, ...mana } } } });

describe("the card", () => {
  it("parses into its three parts and reads native", () => {
    const p = parseEffectProgram(VEIL);
    expect({ conf: programConfidence(p), atoms: p.atoms.map((a) => [a.op, a.condition ?? a.colors ?? null]), tier: classifyCard(VEIL) }).toEqual({
      conf: "high",
      atoms: [["draw", "an opponent has cast a blue or black spell this turn"], ["spells-uncounterable-this-turn", null], ["hexproof-from-colors", ["U", "B"]]],
      tier: "native-spell",
    });
  });
});

describe("⭐ in play", () => {
  /** The AI's turn; you hold Veil of Summer with a Giant out; the AI holds the spells it will try. */
  const aiTurn = (aiHand, aiMana = { U: 2, R: 1, B: 3 }, userHand = []) => board({ user: { hand: [["veil", VEIL], ...userHand], bf: [perm("giant", GIANT, "user")], mana: { G: 1, U: 1 }, library: [BEAR, BEAR] }, ai: { hand: aiHand, mana: aiMana } });
  it("⭐ draws after an opponent's blue spell or black spell — a red one isn't enough", () => {
    const after = (hand, id, pick) => drain(cast(drain(cast(aiTurn(hand), "ai", id, pick)), "user", "veil"));
    const drawn = (s) => 2 - s.players.user.library.length;
    const row = {
      red: drawn(after([["bolt", BOLT]], "bolt", (a) => a.targets[0].id === "user")),
      blue: drawn(after([["uns", UNSUMMON]], "uns", (a) => a.targets[0].id === "giant")),
      black: drawn(after([["rot", MIND_ROT]], "rot", (a) => a.targets[0].id === "ai")),
    };
    expect(row).toEqual({ red: 0, blue: 1, black: 1 });
  });
  it("⭐ hexproof from blue and black: their Unsummon, Mind Rot and Fraying Sanity can't aim at you or your Giant; their Bolt still can", () => {
    const s = drain(cast(aiTurn([["uns", UNSUMMON], ["rot", MIND_ROT], ["bolt", BOLT], ["fs", FRAYING]], { U: 3, R: 1, B: 3 }), "user", "veil"));
    const row = { unsummon: targetsOf(s, "ai", "uns"), mindRot: targetsOf(s, "ai", "rot"), bolt: targetsOf(s, "ai", "bolt"), frayingSanity: targetsOf(s, "ai", "fs") };
    console.log(`WITNESS veilShields ${JSON.stringify(row)}`);
    expect(row).toEqual({ unsummon: [], mindRot: ["ai"], bolt: ["ai", "giant", "user"], frayingSanity: ["ai"] });
  });
  it("abilities too: a trigger threads no source colours, so their Man-o'-War can't take your Giant and their Ravenous Rats has no one to target (CR 603.3d)", () => {
    const mow = drain(cast(drain(cast(aiTurn([["mow", MANOWAR]], { U: 3 }), "user", "veil")), "ai", "mow"));
    const rats = drain(cast(drain(cast(aiTurn([["rats", RATS]], { B: 2 }, [["bear", BEAR]]), "user", "veil")), "ai", "rats"));
    expect({ giantStays: mow.players.user.battlefield.some((p) => p.id === "giant"), bearKept: rats.players.user.hand.map((c) => c.name), ratsTrigger: rats.log.some((e) => e.kind === "trigger-removed-no-target") })
      .toEqual({ giantStays: true, bearKept: ["Grizzly Bears"], ratsTrigger: true });
  });
  it("the shield is the set as it resolved (CR 611.2c): a creature that enters afterwards can be Unsummoned", () => {
    let s = drain(cast(board({ active: "user", user: { hand: [["veil", VEIL], ["bear", BEAR]], bf: [perm("giant", GIANT, "user")], mana: { G: 3 } }, ai: { hand: [["uns", UNSUMMON]], mana: { U: 1 } } }), "user", "veil"));
    s = drain(cast(s, "user", "bear"));
    const bear = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears")?.id;
    expect(targetsOf(s, "ai", "uns")).toEqual([bear]);
  });
  it("⭐ the shield's \"opponents\" follow the Giant's controller (CR 109.5): after their Act of Treason takes it, your Unsummon can't aim at it and theirs can", () => {
    let s = drain(cast(aiTurn([["aot", TREASON], ["uns", UNSUMMON]], { R: 3 }, [["myuns", UNSUMMON]]), "user", "veil"));
    s = topUp(drain(cast(s, "ai", "aot", (a) => a.targets[0].id === "giant")), "ai", { U: 1 });
    const row = { stolen: s.players.ai.battlefield.some((p) => p.id === "giant"), yours: targetsOf(s, "user", "myuns"), theirs: targetsOf(s, "ai", "uns") };
    console.log(`WITNESS veilStolen ${JSON.stringify(row)}`);
    expect(row).toEqual({ stolen: true, yours: [], theirs: ["giant"] });
  });
  it("⭐ your spells can't be countered this turn — one already on the stack, and one cast afterwards; next turn they can", () => {
    // Your Giant Growth is on the stack; you respond with Veil; after it resolves, their Counterspell has nothing to target.
    let s = board({ active: "user", user: { hand: [["gg", GIANT_GROWTH], ["veil", VEIL], ["gg2", GIANT_GROWTH]], bf: [perm("giant", GIANT, "user")], mana: { G: 3 } }, ai: { hand: [["cs", COUNTERSPELL]], mana: { U: 2 } } });
    s = cast(s, "user", "gg", (a) => a.targets[0].id === "giant");
    s = resolveTopOfStack(cast(s, "user", "veil"));
    const onStack = castsOf(s, "ai", "cs").length;
    s = cast(drain(s), "user", "gg2", (a) => a.targets[0].id === "giant");
    const castLater = castsOf(s, "ai", "cs").length;
    const row = { onStack, castLater, nextTurn: castsOf(nextTurn(s), "ai", "cs").length };
    console.log(`WITNESS veilUncounterable ${JSON.stringify(row)}`);
    expect(row).toEqual({ onStack: 0, castLater: 0, nextTurn: 1 });
  });
  it("only OPPONENTS are refused, and only this turn: your own blue spells still aim at you and your Giant; after cleanup theirs do too", () => {
    let s = board({ active: "user", user: { hand: [["veil", VEIL], ["myuns", UNSUMMON], ["insp", INSPIRATION]], bf: [perm("giant", GIANT, "user")], mana: { G: 1, U: 5 } }, ai: { hand: [["uns", UNSUMMON], ["rot", MIND_ROT]], mana: { U: 1, B: 3 } } });
    s = drain(cast(s, "user", "veil"));
    const later = nextTurn(s);
    expect({ myUnsummon: targetsOf(s, "user", "myuns"), myInspiration: targetsOf(s, "user", "insp"), theirsNow: targetsOf(s, "ai", "uns"), unsummonNextTurn: targetsOf(later, "ai", "uns"), mindRotNextTurn: targetsOf({ ...later, activePlayer: "ai" }, "ai", "rot") })
      .toEqual({ myUnsummon: ["giant"], myInspiration: ["ai", "user"], theirsNow: [], unsummonNextTurn: ["giant"], mindRotNextTurn: ["ai", "user"] });
  });
});
