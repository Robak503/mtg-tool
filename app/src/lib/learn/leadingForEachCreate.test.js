/**
 * THE COUNT LEADS THE TOKEN — "For each <noun> you control, create <token>." is the instruction "Create <token> for each <noun> you
 * control.": one count, read as the effect resolves (CR 608.2h), and that many tokens created at once.
 *   · Brass's Bounty (EDHREC #1352) — "For each land you control, create a Treasure token."
 *   · Moogles' Valor (#4400) — "For each creature you control, create a 1/2 white Moogle creature token with lifelink. Then creatures you
 *     control gain indestructible until end of turn." The second sentence is a later instruction (CR 608.2c): the set it grants is the
 *     creatures as it is applied, the new Moogles among them.
 * A creation that names an object of the count ("a token that's a copy of that permanent" — Second Harvest) is a different
 * instruction, one token per object, and is never reordered.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const BRASS_S_BOUNTY = {"name":"Brass's Bounty","type":"Sorcery","mana":"{6}{R}","cmc":7,"power":null,"toughness":null,"keywords":["Treasure"],"colors":["R"],"oracle":"For each land you control, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // arbiter-spell on 0fbdec14
const MOOGLES_VALOR = {"name":"Moogles' Valor","type":"Instant","mana":"{3}{W}{W}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"For each creature you control, create a 1/2 white Moogle creature token with lifelink. Then creatures you control gain indestructible until end of turn."}; // arbiter-spell on 0fbdec14
const SECOND_HARVEST = {"name":"Second Harvest","type":"Instant","mana":"{2}{G}{G}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"For each token you control, create a token that's a copy of that permanent."};
const EZURIS_PREDATION = {"name":"Ezuri's Predation","type":"Sorcery","mana":"{5}{G}{G}{G}","cmc":8,"power":null,"toughness":null,"keywords":["Fight"],"colors":["G"],"oracle":"For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false, tapped: true }), counters: {} });
function table(spell, mana, own, theirs = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], battlefield: own, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai: { ...s0.players.ai, battlefield: theirs } } };
}
const cast = (s) => resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-spell")));
const tokens = (s, pid) => s.players[pid].battlefield.filter((p) => p.isToken || /Token/.test(p.card?.type || ""));

describe("the reader", () => {
  it("⭐ both cards play their whole text; Ezuri's Predation stays parked", () => {
    expect({ bounty: classifyCard(BRASS_S_BOUNTY), valor: classifyCard(MOOGLES_VALOR), predation: classifyCard(EZURIS_PREDATION) })
      .toEqual({ bounty: "native-spell", valor: "native-spell", predation: "arbiter-spell" });
  });
  it("⭐ the leading count reads as the trailing form; a creation naming an object of the count is not reordered", () => {
    const atoms = (oracle) => (parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || []).map((a) => ({ op: a.op, countFor: a.countFor ?? null }));
    expect({
      lead: atoms("For each land you control, create a Treasure token."),
      trail: atoms("Create a Treasure token for each land you control."),
      harvest: atoms(SECOND_HARVEST.oracle),
    }).toEqual({
      lead: [{ op: "create-named-token", countFor: { kind: "permanentsYouControl", cardType: "land" } }],
      trail: [{ op: "create-named-token", countFor: { kind: "permanentsYouControl", cardType: "land" } }],
      harvest: [{ op: "create-token-copy-each", countFor: null }],
    });
  });
});

describe("Brass's Bounty", () => {
  it("⭐ seven lands (the opponent's not counted): seven Treasures for the caster", () => {
    const lands = Array.from({ length: 7 }, (_, i) => P(`m${i}`, MOUNTAIN, "user"));
    const s = cast(table(BRASS_S_BOUNTY, { R: 1, C: 6 }, lands, [P("am", MOUNTAIN, "ai")]));
    const made = tokens(s, "user");
    expect({ count: made.length, names: [...new Set(made.map((p) => p.card.name))], ai: tokens(s, "ai").length }).toEqual({ count: 7, names: ["Treasure"], ai: 0 });
  });
});

describe("Moogles' Valor", () => {
  it("⭐ two creatures: two 1/2 white Moogles with lifelink, and then every creature the caster controls — the Moogles too — is indestructible; the opponent's is not", () => {
    const s = cast(table(MOOGLES_VALOR, { W: 2, C: 3 }, [P("b1", GRIZZLY_BEARS, "user"), P("b2", GRIZZLY_BEARS, "user")], [P("ab", GRIZZLY_BEARS, "ai")]));
    const moogles = tokens(s, "user");
    const ind = (id) => !!permanentHasKeyword(s, id, "Indestructible");
    expect({
      moogles: moogles.map((p) => ({ type: p.card.type, colors: p.card.colors, pt: [creaturePower(p, s), creatureToughness(p, s)], lifelink: !!permanentHasKeyword(s, p.id, "Lifelink"), indestructible: ind(p.id) })),
      bears: [ind("b1"), ind("b2")],
      theirs: ind("ab"),
    }).toEqual({
      moogles: [
        { type: "Token Creature — Moogle", colors: ["W"], pt: [1, 2], lifelink: true, indestructible: true },
        { type: "Token Creature — Moogle", colors: ["W"], pt: [1, 2], lifelink: true, indestructible: true },
      ],
      bears: [true, true],
      theirs: false,
    });
  });
});
