/**
 * THE INCARNATIONS — the play-weighted program, P·24 (Anger #349, Wonder #821, Brawn #1876, Filth, Valor).
 *   "As long as this card is in your graveyard and you control a Mountain, creatures you control have haste."
 *
 * A static that functions only from a graveyard (CR 113.6b). The clause reader peels "as long as this card is in your
 * graveyard and", parses the rest as the ordinary gated anthem it already read ("as long as you control a Mountain,
 * creatures you control have haste"), and tags it `zone:"graveyard"`. The layer engine drops it on the battlefield and
 * collects it from each graveyard, scoped to the card's OWNER (a card in a graveyard has no controller — CR 109.5): the
 * selector's "you control" and the "you control a Mountain" gate both read the owner's board.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const inc = (name, keyword, land, kwLine) => ({ id: `c-${name.toLowerCase()}`, name, type: "Creature — Incarnation", mana: "{3}{R}", cmc: 4, power: 2, toughness: 2, keywords: [keyword], oracle: `${kwLine}\nAs long as this card is in your graveyard and you control a${/^[AEIOU]/.test(land) ? "n" : ""} ${land}, creatures you control have ${keyword.toLowerCase()}.` });
const ANGER = inc("Anger", "Haste", "Mountain", "Haste");
const WONDER = inc("Wonder", "Flying", "Island", "Flying");
const BRAWN = inc("Brawn", "Trample", "Forest", "Trample");
const FILTH = { ...inc("Filth", "Swampwalk", "Swamp", "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)"), keywords: ["Landwalk", "Swampwalk"] };
const VALOR = inc("Valor", "First strike", "Plains", "First strike");

const perm = (id, ctrl, card, over = {}) => ({ id, card: { oracle: "", ...card }, controller: ctrl, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 0, ...over });
const land = (id, ctrl, sub) => perm(id, ctrl, { name: sub, type: `Basic Land — ${sub}` });
const bear = (id, ctrl, over = {}) => perm(id, ctrl, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2 }, over);

function board({ user = [], ai = [], userGy = [], aiGy = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, players: { ...s.players, user: { ...s.players.user, battlefield: user, graveyard: userGy }, ai: { ...s.players.ai, battlefield: ai, graveyard: aiGy } } };
}

describe("parse + classify", () => {
  it("each line is one gated layer-6 grant tagged for the graveyard; all five classify native-static", () => {
    const row = Object.fromEntries([ANGER, WONDER, BRAWN, FILTH, VALOR].map((c) => {
      const d = parseStaticAbilities(c);
      return [c.name, { n: d.length, zone: d[0]?.zone, keyword: d[0]?.op?.keyword, gate: d[0]?.op?.gate?.countSpec?.subtype, scope: d[0]?.affects?.selector?.controllerScope, tier: classifyCard(c) }];
    }));
    console.log("  WITNESS incarnationParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.Anger).toEqual({ n: 1, zone: "graveyard", keyword: "Haste", gate: "Mountain", scope: "you", tier: "native-static" });
    expect(row.Wonder).toEqual({ n: 1, zone: "graveyard", keyword: "Flying", gate: "Island", scope: "you", tier: "native-static" });
    expect(row.Brawn).toEqual({ n: 1, zone: "graveyard", keyword: "Trample", gate: "Forest", scope: "you", tier: "native-static" });
    expect(row.Filth).toEqual({ n: 1, zone: "graveyard", keyword: "swampwalk", gate: "Swamp", scope: "you", tier: "native-static" });
    expect(row.Valor).toEqual({ n: 1, zone: "graveyard", keyword: "First strike", gate: "Plains", scope: "you", tier: "native-static" });
  });
});

describe("runtime", () => {
  it("Anger in your graveyard + a Mountain: your creatures have haste; no Mountain, no haste", () => {
    const withMountain = board({ user: [land("m1", "user", "Mountain"), bear("b1", "user", { summoningSick: true })], userGy: [ANGER] });
    const without = board({ user: [land("f1", "user", "Forest"), bear("b1", "user", { summoningSick: true })], userGy: [ANGER] });
    expect(permanentHasKeyword(withMountain, "b1", "Haste")).toBe(true);
    expect(permanentHasKeyword(without, "b1", "Haste")).toBe(false);
  });

  it("only from the graveyard: Anger on the battlefield gives the others nothing (it keeps its own printed haste)", () => {
    const s = board({ user: [land("m1", "user", "Mountain"), perm("anger", "user", ANGER), bear("b1", "user")] });
    expect(permanentHasKeyword(s, "b1", "Haste")).toBe(false);
    expect(permanentHasKeyword(s, "anger", "Haste")).toBe(true);
  });

  it("only the graveyard statics: an ordinary anthem in a graveyard (Glorious Anthem) does nothing", () => {
    const anthem = { id: "c-anthem", name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}", cmc: 3, keywords: [], oracle: "Creatures you control get +1/+1." };
    const s = board({ user: [bear("b1", "user")], userGy: [anthem] });
    expect(permanentPower(s, "b1")).toBe(2);
  });

  it("scoped to the OWNER: Anger in the opponent's graveyard hastes their creatures (with their Mountain), never yours", () => {
    const s = board({ user: [land("m1", "user", "Mountain"), bear("b1", "user")], ai: [land("m2", "ai", "Mountain"), bear("x1", "ai")], aiGy: [ANGER] });
    const noTheirMountain = board({ user: [land("m1", "user", "Mountain"), bear("b1", "user")], ai: [bear("x1", "ai")], aiGy: [ANGER] });
    expect({ mine: permanentHasKeyword(s, "b1", "Haste"), theirs: permanentHasKeyword(s, "x1", "Haste"), theirsNoMountain: permanentHasKeyword(noTheirMountain, "x1", "Haste") })
      .toEqual({ mine: false, theirs: true, theirsNoMountain: false });
  });

  it("the rest of the cycle grant their keywords off their own land type", () => {
    const grants = (card, sub, kw) => permanentHasKeyword(board({ user: [land("l1", "user", sub), bear("b1", "user")], userGy: [card] }), "b1", kw);
    const row = { wonder: grants(WONDER, "Island", "Flying"), brawn: grants(BRAWN, "Forest", "Trample"), filth: grants(FILTH, "Swamp", "swampwalk"), valor: grants(VALOR, "Plains", "First strike"), wrongLand: grants(WONDER, "Forest", "Flying") };
    console.log("  WITNESS incarnationCycle", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ wonder: true, brawn: true, filth: true, valor: true, wrongLand: false });
  });

  it("end to end: with Anger in the graveyard a creature that came in this turn may attack", () => {
    const atk = (s) => filterActions(legalActionsForPlayer({ ...s, step: "declare-attackers", phase: "combat", activePlayer: "user", priorityHolder: "user" }, "user"), "declare-attacker").map((a) => a.attackerId ?? a.permanentId);
    const sick = () => [land("m1", "user", "Mountain"), bear("b1", "user", { summoningSick: true })];
    expect(atk(board({ user: sick() }))).not.toContain("b1");
    expect(atk(board({ user: sick(), userGy: [ANGER] }))).toContain("b1");
  });
});
