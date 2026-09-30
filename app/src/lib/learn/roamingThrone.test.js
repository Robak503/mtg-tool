/**
 * roamingThrone.test.js — Roaming Throne (shelf decks D19, 2026-09-30: Believe it!). "If a triggered ability of another creature
 * you control of the chosen type triggers, it triggers an additional time."
 *
 * The source-scoped trigger multiplier (Katara, Harmonic Prodigy, Annie Joins Up) with two additions: the pronoun wording
 * ("it triggers" for "that ability triggers") and a subject term read off the static's own permanent — the creature type it
 * chose as it entered (perm.chosenType), matched layer-aware with changelings included (CR 702.73a). "another" leaves the
 * Throne's own abilities alone, though it is that type too. Enforced where the family is: the trigger flush.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { sourceTriggerMultiplierCount } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const THRONE = card("Roaming Throne", "Artifact Creature — Golem", "{4}", 4, "Ward {2}\nAs this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nIf a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time.", { power: "4", toughness: "4", keywords: ["Ward"], colors: [] });
const VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", 2, "When this creature enters, draw a card.", { power: "1", toughness: "1", colors: ["G"] });
const OMENS = card("Wall of Omens", "Creature — Wall", "{1}{W}", 2, "Defender\nWhen this creature enters, draw a card.", { power: "0", toughness: "4", keywords: ["Defender"], colors: ["W"] });
const COHORT = card("Irregular Cohort", "Creature — Shapeshifter", "{2}{W}{W}", 4, "Changeling (This card is every creature type.)\nWhen this creature enters, create a 2/2 colorless Shapeshifter creature token with changeling.", { power: "2", toughness: "2", keywords: ["Changeling"], colors: ["W"] });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function board({ active = "user", chosenType = "Elf", user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (id) => [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `${id}-lib${i}` }));
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: lib(id), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  const throne = perm("throne", THRONE, "user", chosenType ? { chosenType } : {});
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", { ...user, bf: [throne, ...(user.bf || [])] }), ai: seat("ai", ai) } };
}
function cast(s, who, id) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: who }, who).find((x) => x.kind === "cast-spell" && x.cardId === id);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
const drain = (s) => { let n = s, g = 0; while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = resolveTopOfStack(n); return n; };
const drawn = (s, who) => 4 - s.players[who].library.length;

describe("the card", () => {
  it("parses the chosen-type subject (and \"it triggers\") and reads native", () => {
    const op = parseStaticAbilities(THRONE).find((d) => d.op?.layerOp === "sourceTriggerMultiplier")?.op;
    expect({ op, tier: classifyCard(THRONE) }).toEqual({
      op: { layerOp: "sourceTriggerMultiplier", sourceFilter: { kind: "typedUnion", terms: [{ cardType: "creature", chosenTypeOfSource: true, excludeSelf: true }] } },
      tier: "native-static",
    });
  });
});

describe("⭐ in play", () => {
  it("⭐ an Elf's enters trigger triggers twice with the Throne on Elf; a Wall's once; a changeling counts (CR 702.73a)", () => {
    const run = (c, mana) => drain(cast(board({ user: { hand: [["x", c]], mana } }), "user", "x"));
    const cohort = run(COHORT, { W: 4 });
    const row = {
      visionary: drawn(run(VISIONARY, { G: 2 }), "user"),
      omens: drawn(run(OMENS, { W: 2 }), "user"),
      cohortTokens: cohort.players.user.battlefield.filter((p) => p.card?.token || p.token).length,
    };
    console.log(`WITNESS roamingThrone ${JSON.stringify(row)}`);
    expect(row).toEqual({ visionary: 2, omens: 1, cohortTokens: 2 });
  });
  it("only creatures YOU control: their Elvish Visionary draws them one", () => {
    const s = drain(cast(board({ active: "ai", ai: { hand: [["v", VISIONARY]], mana: { G: 2 } } }), "ai", "v"));
    expect({ theirs: drawn(s, "ai"), yours: drawn(s, "user") }).toEqual({ theirs: 1, yours: 0 });
  });
  it("no type chosen, nothing doubles", () => {
    expect(drawn(drain(cast(board({ chosenType: null, user: { hand: [["x", VISIONARY]], mana: { G: 2 } } }), "user", "x")), "user")).toBe(1);
  });
  it("\"another\": the Throne's own abilities aren't counted, though it is the chosen type too (naming Golem, its printed type)", () => {
    const s = board({ chosenType: "Golem", user: { bf: [perm("golem", card("Stone Golem", "Artifact Creature — Golem", "{5}", 5, "", { power: "4", toughness: "4" }), "user")] } });
    expect({ throne: sourceTriggerMultiplierCount(s, "throne"), anotherGolem: sourceTriggerMultiplierCount(s, "golem") }).toEqual({ throne: 0, anotherGolem: 1 });
  });
});
