/**
 * RITUAL PER COUNT — the play-weighted program, P·22 (Mana Geyser, EDHREC #304).
 *   "Add {R} for each tapped land your opponents control."
 *
 * One colour × any count the shared count-source parser reads, counted at resolution (CR 608.2h) through the manaPerCount
 * path Rite of Flame already used. The family: Mana Geyser (a new count — tapped AND opponent-scoped, the opponents sum now
 * honouring the tapped qualifier), Battle Hymn, Songs of the Damned, Brightstone Ritual, Inner Fire, Dragon's Desire; and
 * the same clause as a first-main-phase trigger (Black Market, Altar of Shadows, Giant-Man, Gargantuan Genius). A count
 * keyed on a player the atom never targets is refused. Real oracle fixtures (bundled Scryfall snapshot).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GEYSER = { id: "geyser", name: "Mana Geyser", type: "Sorcery", mana: "{3}{R}{R}", keywords: [], oracle: "Add {R} for each tapped land your opponents control." };
const HYMN = { id: "hymn", name: "Battle Hymn", type: "Instant", mana: "{1}{R}", keywords: [], oracle: "Add {R} for each creature you control." };
const SONGS = { id: "songs", name: "Songs of the Damned", type: "Instant", mana: "{B}", keywords: [], oracle: "Add {B} for each creature card in your graveyard." };
const BRIGHTSTONE = { id: "bright", name: "Brightstone Ritual", type: "Instant", mana: "{R}", keywords: [], oracle: "Add {R} for each Goblin on the battlefield." };
const INNER_FIRE = { id: "inner", name: "Inner Fire", type: "Sorcery", mana: "{3}{R}", keywords: [], oracle: "Add {R} for each card in your hand." };
const DESIRE = { id: "desire", name: "Dragon's Desire", type: "Sorcery", mana: "{2}{R}{R}", keywords: [], oracle: "Add {R} for each artifact your opponents control." };
const BLACK_MARKET = { name: "Black Market", type: "Enchantment", mana: "{3}{B}{B}", keywords: [], oracle: "Whenever a creature dies, put a charge counter on this enchantment.\nAt the beginning of your first main phase, add {B} for each charge counter on this enchantment." };
const GIANT_MAN = { name: "Giant-Man, Gargantuan Genius", type: "Legendary Creature — Human Scientist Hero", mana: "{3}{G}{G}", power: 6, toughness: 6, keywords: ["Reach"], oracle: "Reach\nAt the beginning of your first main phase, add {G} for each creature you control with power 4 or greater." };

const perm = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, oracle: "", keywords: [], ...card }, controller: ctrl, summoningSick: false }), ...over });
const land = (id, ctrl, tapped = false) => perm(id, ctrl, { name: "Mountain", type: "Basic Land — Mountain" }, { tapped });
const bear = (id, ctrl, p = 2) => perm(id, ctrl, { name: "Grizzly Bears", type: "Creature — Bear", power: p, toughness: p });
const goblin = (id, ctrl) => perm(id, ctrl, { name: "Goblin Piker", type: "Creature — Goblin Warrior", power: 2, toughness: 1 });
const relic = (id, ctrl) => perm(id, ctrl, { name: "Mind Stone", type: "Artifact" });
const handCard = (id) => ({ id, name: "Hand Card", type: "Sorcery", oracle: "" });

function duel({ hand = [], pool = {}, user = [], ai = [], graveyard = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: user, graveyard, manaPool: { ...s.players.user.manaPool, ...pool } }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
function pod({ hand = [], pool = {}, ai1 = [], ai2 = [], ai3 = [], user = [] } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: user, manaPool: { ...s.players.user.manaPool, ...pool } }, ai1: { ...s.players.ai1, battlefield: ai1 }, ai2: { ...s.players.ai2, battlefield: ai2 }, ai3: { ...s.players.ai3, battlefield: ai3 } },
  };
}
const cast = (s, card) => {
  const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((c) => c.cardId === card.id);
  expect(a).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
};
const red = (s) => s.players.user.manaPool.R;

describe("parse + classify", () => {
  it("each spell is one add-mana per count; the six classify native-spell", () => {
    const row = Object.fromEntries([GEYSER, HYMN, SONGS, BRIGHTSTONE, INNER_FIRE, DESIRE].map((c) => [c.name, { atoms: parseEffectProgram(c).atoms, tier: classifyCard(c) }]));
    console.log("  WITNESS ritualParse", JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.atoms[0].countSpec])))); // vitest 4 needs --disable-console-intercept
    expect(row["Mana Geyser"].atoms).toEqual([{ op: "add-mana", manaPerCount: "R", countSpec: { kind: "permanentsYouControl", cardType: "land", who: "opponents", tappedOnly: true }, targetType: null }]);
    expect(row["Battle Hymn"].atoms[0].countSpec).toEqual({ kind: "permanentsYouControl", cardType: "creature" });
    expect(row["Songs of the Damned"].atoms[0]).toMatchObject({ manaPerCount: "B", countSpec: { kind: "cardsInGraveyard", cardType: "creature" } });
    expect(row["Brightstone Ritual"].atoms[0].countSpec).toEqual({ kind: "subtypeOnBattlefield", subtype: "Goblin" });
    expect(row["Inner Fire"].atoms[0].countSpec).toEqual({ kind: "cardsInHand" });
    expect(row["Dragon's Desire"].atoms[0].countSpec).toEqual({ kind: "permanentsYouControl", cardType: "artifact", who: "opponents" });
    for (const v of Object.values(row)) expect(v.tier).toBe("native-spell");
  });
  it("the first-main-phase triggers read the same clause; a count on a player the atom never targets, or an unread count, stays unparsed", () => {
    expect(classifyCard(BLACK_MARKET)).toBe("native-trigger");
    expect(classifyCard(GIANT_MAN)).toBe("native-trigger");
    expect(parseEffectClause("add {B} for each charge counter on this enchantment", "trigger").atoms).toEqual([{ op: "add-mana", manaPerCount: "B", countSpec: { kind: "namedCountersOnSource", counterType: "charge" }, targetType: null }]);
    const high = (t) => parseEffectClause(t, "trigger").confidence === "high";
    expect(high("Add {R} for each creature that player controls.")).toBe(false);
    expect(high("Add {R} for each attacking creature you control.")).toBe(false);
  });
});

describe("runtime — counted at resolution", () => {
  it("Mana Geyser counts only the opponents' TAPPED lands — not untapped ones, not your own", () => {
    const s = cast(duel({ hand: [GEYSER], pool: { R: 5 }, user: [land("u1", "user", true)], ai: [land("a1", "ai", true), land("a2", "ai", true), land("a3", "ai", true), land("a4", "ai"), land("a5", "ai")] }), GEYSER);
    expect(red(s)).toBe(3);
  });
  it("Mana Geyser sums every opponent in a pod", () => {
    const s = cast(pod({ hand: [GEYSER], pool: { R: 5 }, ai1: [land("a1", "ai1", true), land("a2", "ai1", true)], ai2: [land("b1", "ai2", true), land("b2", "ai2")], ai3: [land("c1", "ai3")] }), GEYSER);
    expect(red(s)).toBe(3);
  });
  it("the rest of the family: creatures you control, creature cards in your graveyard, Goblins on the battlefield (both sides), cards in hand, artifacts your opponents control", () => {
    const row = {
      hymn: red(cast(duel({ hand: [HYMN], pool: { R: 2 }, user: [bear("b1", "user"), bear("b2", "user"), bear("b3", "user")], ai: [bear("x1", "ai")] }), HYMN)),
      songs: cast(duel({ hand: [SONGS], pool: { B: 1 }, graveyard: [{ id: "g1", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }, { id: "g2", name: "Hill Giant", type: "Creature — Giant", oracle: "" }, { id: "g3", name: "Shock", type: "Instant", oracle: "" }] }), SONGS).players.user.manaPool.B,
      brightstone: red(cast(duel({ hand: [BRIGHTSTONE], pool: { R: 1 }, user: [goblin("gb1", "user")], ai: [goblin("gb2", "ai"), goblin("gb3", "ai"), bear("x1", "ai")] }), BRIGHTSTONE)),
      inner: red(cast(duel({ hand: [INNER_FIRE, handCard("h1"), handCard("h2"), handCard("h3"), handCard("h4")], pool: { R: 4 } }), INNER_FIRE)),
      desire: red(cast(duel({ hand: [DESIRE], pool: { R: 4 }, user: [relic("r0", "user")], ai: [relic("r1", "ai"), relic("r2", "ai")] }), DESIRE)),
    };
    console.log("  WITNESS ritualFamily", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ hymn: 3, songs: 2, brightstone: 3, inner: 4, desire: 2 });
  });
  it("the triggers: Black Market adds {B} per charge counter on itself; Giant-Man adds {G} per creature you control with power 4 or greater", () => {
    const addMana = (s, clause, sourceId) => ATOM_RESOLVERS["add-mana"](s, parseEffectClause(clause, "trigger").atoms[0], { controller: "user", targets: [], sourceId, cardName: "Test" });
    const market = duel({ user: [perm("bm", "user", BLACK_MARKET, { counters: { charge: 3 } })] });
    const giant = duel({ user: [perm("gm", "user", GIANT_MAN), bear("big", "user", 4), bear("small", "user", 2)] });
    const row = {
      market: addMana(market, "add {B} for each charge counter on this enchantment", "bm").players.user.manaPool.B,
      giant: addMana(giant, "add {G} for each creature you control with power 4 or greater", "gm").players.user.manaPool.G,
    };
    expect(row).toEqual({ market: 3, giant: 2 });
  });
});
