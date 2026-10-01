/**
 * UNDERWORLD BREACH — the play-weighted program, P·29 (EDHREC #388).
 *   "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards
 *    from your graveyard. (You may cast cards from your graveyard for their escape cost.)
 *    At the beginning of the end step, sacrifice this enchantment."
 *
 * A GRANTED escape (CR 702.138a): legalChoices.actionsCastEscapeFromGraveyard offers each covered graveyard card for its mana cost
 * plus three other graveyard cards — frozen at the offer by the least-valuable policy, never a card the spell targets, and named on
 * the action — which the dispatcher exiles as the cost. No mana cost → unpayable (CR 118.6); an "escapes with" rider → not offered;
 * never a second alternative cost (bestow, emerge — CR 601.2b); normal timing. An escaped instant or sorcery goes back to the
 * graveyard; an escaped permanent carries `escaped` (CR 702.138b), so Uro stays. The Master of Keys grants the enchantment form.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); each cast run for real (legal action → dispatch → the stack).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { parseStaticAbilities, escapeGrantsFor } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BREACH = { name: "Underworld Breach", type: "Enchantment", mana: "{1}{R}", cmc: 2, keywords: [], oracle: "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment." };
const KEYS = { name: "The Master of Keys", type: "Legendary Enchantment Creature — Horror", mana: "{X}{W}{U}{B}", cmc: 3, power: "3", toughness: "3", keywords: ["Flying", "Mill"], oracle: "Flying\nWhen The Master of Keys enters, put X +1/+1 counters on it and mill twice X cards.\nEach enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, keywords: [], oracle: "Draw two cards." };
const RAISE_DEAD = { name: "Raise Dead", type: "Sorcery", mana: "{B}", cmc: 1, keywords: [], oracle: "Return target creature card from your graveyard to your hand." };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const URO = { name: "Uro, Titan of Nature's Wrath", type: "Legendary Creature — Elder Giant", mana: "{1}{G}{U}", cmc: 3, power: "6", toughness: "6", keywords: ["Escape"], oracle: "When Uro enters, sacrifice it unless it escaped.\nWhenever Uro enters or attacks, you gain 3 life and draw a card, then you may put a land card from your hand onto the battlefield.\nEscape—{G}{G}{U}{U}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" };
const CLONE = { name: "Clone", type: "Creature — Shapeshifter", mana: "{3}{U}", cmc: 4, power: "0", toughness: "0", keywords: [], oracle: "You may have this creature enter as a copy of any creature on the battlefield." };
const VISION = { name: "Ancestral Vision", type: "Sorcery", mana: "", cmc: 0, keywords: ["Suspend"], oracle: "Suspend 4—{U} (Rather than cast this card from your hand, pay {U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\nTarget player draws three cards." };
const PHOENIX = { name: "Phoenix of Ash", type: "Creature — Phoenix", mana: "{1}{R}{R}", cmc: 3, power: "2", toughness: "2", keywords: ["Flying", "Haste", "Escape"], oracle: "Flying, haste\n{2}{R}: This creature gets +2/+0 until end of turn.\nEscape—{2}{R}{R}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nThis creature escapes with a +1/+1 counter on it." };
const DRYAD = { name: "Leafcrown Dryad", type: "Enchantment Creature — Nymph Dryad", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: ["Reach", "Bestow"], oracle: "Bestow {3}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nReach\nEnchanted creature gets +2/+2 and has reach." };
const GRYFF = { name: "Wretched Gryff", type: "Creature — Eldrazi Hippogriff", mana: "{7}", cmc: 7, power: "3", toughness: "4", keywords: ["Flying", "Emerge"], oracle: "Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, draw a card.\nFlying" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {U}.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {B}.)" };

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
const G = (id, card) => ({ ...card, id });
const LANDS = () => [G("g-forest", FOREST), G("g-island", ISLAND), G("g-swamp", SWAMP)];
function board({ user = [], gy = [], ai = [], pool = {}, active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, graveyard: gy, hand: [], library: [1, 2, 3, 4].map((i) => ({ ...BEARS, id: `ul${i}` })), manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const escapes = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.escapeCast);
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 12 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };

describe("parse + classify", () => {
  it("two markers, paired on one permanent; Breach classifies native-mixed; the grant sentence alone grants nothing", () => {
    expect(parseStaticAbilities(BREACH).filter((d) => d.grantEscape || d.grantEscapeCost)).toEqual([{ grantEscape: { filter: "nonland" } }, { grantEscapeCost: { exileCount: 3 } }]);
    expect(classifyCard(BREACH)).toBe("native-mixed");
    expect(escapeGrantsFor(board({ user: [P("br", "user", BREACH)] }), "user")).toEqual([{ filter: "nonland", exileCount: 3 }]);
    const half = { ...BREACH, name: "Half Breach", oracle: "Each nonland card in your graveyard has escape." }; // synthetic
    expect(escapeGrantsFor(board({ user: [P("hb", "user", half)] }), "user")).toEqual([]);
  });
});

describe("the offer — what may escape, and for which three", () => {
  it("each nonland card, for its mana cost plus the three least valuable OTHER cards, named on the action; never a land", () => {
    const s = board({ user: [P("br", "user", BREACH)], gy: [G("bolt", BOLT), ...LANDS(), G("div", DIVINATION)], pool: { R: 1, U: 1, C: 2 } });
    const offers = escapes(s);
    const byCard = [...new Set(offers.map((a) => a.cardId))].map((id) => {
      const a = offers.find((x) => x.cardId === id);
      return [id, a.escapeCast.exileIds, a.escapeName];
    });
    console.log("  WITNESS breachOffer", JSON.stringify(byCard)); // vitest 4 needs --disable-console-intercept
    expect(byCard).toEqual([
      ["bolt", ["g-forest", "g-island", "g-swamp"], "escape: exile Forest, Island, Swamp"],
      ["div", ["g-forest", "g-island", "g-swamp"], "escape: exile Forest, Island, Swamp"],
    ]);
  });

  it("not offered: fewer than three other cards; no mana cost (CR 118.6); an \"escapes with\" rider; without a grant", () => {
    const pool = { R: 3, U: 1, C: 3 };
    expect(escapes(board({ user: [P("br", "user", BREACH)], gy: [G("bolt", BOLT), G("g-forest", FOREST), G("g-island", ISLAND)], pool }))).toEqual([]);
    expect(escapes(board({ user: [P("br", "user", BREACH)], gy: [G("vision", VISION), G("phoenix", PHOENIX), ...LANDS()], pool }))).toEqual([]);
    expect(escapes(board({ gy: [G("bolt", BOLT), ...LANDS()], pool }))).toEqual([]);
  });

  it("a card the spell targets is never one of the three (Raise Dead's Ornithopter would otherwise rank among them)", () => {
    const s = board({ user: [P("br", "user", BREACH)], gy: [G("raise", RAISE_DEAD), G("thopter", ORNITHOPTER), ...LANDS()], pool: { B: 1 } });
    const raise = escapes(s).filter((a) => a.cardId === "raise");
    expect(raise.map((a) => [a.targets.map((t) => t.id), a.escapeCast.exileIds])).toEqual([[["thopter"], ["g-forest", "g-island", "g-swamp"]]]);
  });

  it("normal timing: on an opponent's turn the instant may escape, the sorcery may not", () => {
    const s = board({ user: [P("br", "user", BREACH)], gy: [G("bolt", BOLT), ...LANDS(), G("div", DIVINATION)], pool: { R: 1, U: 1, C: 2 }, active: "ai" });
    expect([...new Set(escapes(s).map((a) => a.cardId))]).toEqual(["bolt"]);
  });

  it("never a second alternative cost (CR 601.2b): no bestow cast, no emerge cast through escape", () => {
    const withBears = { user: [P("br", "user", BREACH), P("bears", "user", BEARS)] };
    const dryad = escapes(board({ ...withBears, gy: [G("dryad", DRYAD), ...LANDS()], pool: { G: 2, C: 3 } })).filter((a) => a.cardId === "dryad");
    expect(dryad.map((a) => ({ bestow: !!a.bestow, targets: (a.targets || []).length }))).toEqual([{ bestow: false, targets: 0 }]);
    // {3}{U} pays the emerge cost (sacrificing the Bears) but not {7}: the only cast the builder has is emerge, so nothing escapes.
    expect(escapes(board({ ...withBears, gy: [G("gryff", GRYFF), ...LANDS()], pool: { U: 1, C: 3 } }))).toEqual([]);
    const paid = escapes(board({ ...withBears, gy: [G("gryff", GRYFF), ...LANDS()], pool: { U: 1, C: 6 } }));
    expect(paid.map((a) => ({ card: a.cardId, emerge: !!a.emerge }))).toEqual([{ card: "gryff", emerge: false }]);
  });

  it("The Master of Keys grants it to enchantment cards only", () => {
    const s = board({ user: [P("keys", "user", KEYS)], gy: [G("dryad", DRYAD), G("bolt", BOLT), ...LANDS()], pool: { R: 1, G: 1, C: 1 } });
    expect([...new Set(escapes(s).map((a) => a.cardId))]).toEqual(["dryad"]);
  });
});

describe("the cast — pay, resolve, and where it goes", () => {
  it("escaping Bolt exiles the three, the Bolt resolves, and it returns to the graveyard — where it can escape again", () => {
    const gy = [G("bolt", BOLT), ...LANDS(), G("g-forest2", FOREST), G("g-island2", ISLAND), G("g-swamp2", SWAMP)];
    const s0 = board({ user: [P("br", "user", BREACH)], ai: [P("x1", "ai", BEARS)], gy, pool: { R: 2 } });
    const act = escapes(s0).find((a) => a.cardId === "bolt" && a.targets?.[0]?.id === "x1");
    const s = settle(dispatchAction(s0, act));
    const row = { exiled: s.players.user.exile.map((c) => c.id), bearsDead: !findPermanent(s, "x1"), boltHome: s.players.user.graveyard.some((c) => c.id === "bolt"),
      again: [...new Set(escapes(s).filter((a) => a.cardId === "bolt").map((a) => a.escapeCast.exileIds.join(",")))] };
    console.log("  WITNESS breachBolt", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // Least valuable first: mana value, then power, then NAME, then id — so the two Forests go before the first Island.
    expect(row).toEqual({ exiled: ["g-forest", "g-forest2", "g-island"], bearsDead: true, boltHome: true, again: ["g-island2,g-swamp,g-swamp2"] });
  });

  it("a stale offer (one of the three left the graveyard) is refused, never cast for less", () => {
    const s0 = board({ user: [P("br", "user", BREACH)], gy: [G("div", DIVINATION), ...LANDS()], pool: { U: 1, C: 2 } });
    const act = escapes(s0).find((a) => a.cardId === "div");
    const gone = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: s0.players.user.graveyard.filter((c) => c.id !== "g-swamp") } } };
    expect(() => dispatchAction(gone, act)).toThrow(/not in graveyard/);
  });

  it("⭐ an escaped Uro carries `escaped` and stays (CR 702.138b); its enters trigger still gains 3 and draws", () => {
    const s0 = board({ user: [P("br", "user", BREACH)], gy: [G("uro", URO), ...LANDS()], pool: { G: 1, U: 1, C: 1 } });
    const s = settle(dispatchAction(s0, escapes(s0).find((a) => a.cardId === "uro")));
    const uro = s.players.user.battlefield.find((p) => p.card?.name === URO.name);
    expect({ onBattlefield: !!uro, escaped: uro?.escaped ?? null, lifeGained: s.players.user.life - s0.players.user.life, hand: s.players.user.hand.length })
      .toEqual({ onBattlefield: true, escaped: true, lifeGained: 3, hand: 1 });
  });

  it("an escaped Clone that copies Uro escaped too, so the copy stays", () => {
    const s0 = board({ user: [P("br", "user", BREACH), P("uro-perm", "user", URO, { escaped: true })], gy: [G("clone", CLONE), ...LANDS()], pool: { U: 1, C: 3 } });
    const paused = resolveTopOfStack(dispatchAction(s0, escapes(s0).find((a) => a.cardId === "clone")));
    expect(paused.pendingChoice?.kind).toBe("clone-search");
    const s = settle(resolveCloneChoice(paused, "uro-perm"));
    const copy = s.players.user.battlefield.find((p) => p.id !== "uro-perm" && p.card?.name === URO.name);
    expect({ copy: !!copy, escaped: copy?.escaped ?? null }).toEqual({ copy: true, escaped: true });
  });
});
