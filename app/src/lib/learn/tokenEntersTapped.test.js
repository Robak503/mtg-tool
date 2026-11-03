/**
 * tokenEntersTapped.test.js — A CREATED TOKEN UNDER AN OPPONENT'S "ENTER TAPPED" (pw25's blind review, found on the way; CR 614.1d,
 * 614.12): "Artifacts and creatures your opponents control enter tapped." and its kin are replacement effects on every permanent that
 * enters under an opponent of their controller, a token included. The token mints never read them (tokens.js create-token,
 * create-named-token and the single copy), so a Wolf or a Treasure entered untapped under Blind Obedience — while the copy-each path,
 * running the entry replacements, entered its copies tapped: one Ocelot Pride resolution made an untapped Cat and a tapped copy of it.
 * Now the enter seam every token mint passes (tokens.fireTokenEnterTriggers) reads staticAbilityParser.impositionEntersTapped for each
 * permanent the event made. Archon of Emeria's "Nonbasic lands your opponents control enter tapped." leaves a nonland token alone; a
 * player's own static never taps their own tokens. The tokens resolvers.enterPermanent makes outside that seam — the living weapon Germ, a
 * resolved copy of a permanent spell (CR 707.10f) — read the same there. The round-2 recheck's R2-F3: the static's source read through
 * its own ability view (a Sovereign turned into a Frog taps nothing), land tokens, a manifest (a face-down card riding the seam) and
 * a token an effect gives an opponent of the static's controller.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, gainLife } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const BLIND_OBEDIENCE = {"name":"Blind Obedience","type":"Enchantment","mana":"{1}{W}","oracle":"Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nArtifacts and creatures your opponents control enter tapped.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Extort"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #503
const AUTHORITY = {"name":"Authority of the Consuls","type":"Enchantment","mana":"{W}","oracle":"Creatures your opponents control enter tapped.\nWhenever a creature an opponent controls enters, you gain 1 life.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #323
const THALIA = {"name":"Thalia, Heretic Cathar","type":"Legendary Creature — Human Soldier","mana":"{2}{W}","oracle":"First strike\nCreatures and nonbasic lands your opponents control enter tapped.","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["First strike"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1476
const KISMET = {"name":"Kismet","type":"Enchantment","mana":"{3}{W}","oracle":"Artifacts, creatures, and lands your opponents control enter tapped.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11991
const FROZEN_AETHER = {"name":"Frozen Aether","type":"Enchantment","mana":"{3}{U}","oracle":"Artifacts, creatures, and lands your opponents control enter tapped.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8646
const SOVEREIGN = {"name":"Imposing Sovereign","type":"Creature — Human Noble","mana":"{1}{W}","oracle":"Creatures your opponents control enter tapped.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #12415
const ARCHON = {"name":"Archon of Emeria","type":"Creature — Archon","mana":"{2}{W}","oracle":"Flying\nEach player can't cast more than one spell each turn.\nNonbasic lands your opponents control enter tapped.","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Flying"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2115
const OCELOT = {"name":"Ocelot Pride","type":"Creature — Cat","mana":"{W}","oracle":"First strike, lifelink\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your end step, if you gained life this turn, create a 1/1 white Cat creature token. Then if you have the city's blessing, for each token you control that entered this turn, create a token that's a copy of it.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Lifelink","Ascend","First strike"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1101
const BATTERSKULL = {"name":"Batterskull","type":"Artifact — Equipment","mana":"{5}","oracle":"Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +4/+4 and has vigilance and lifelink.\n{3}: Return this Equipment to its owner's hand.\nEquip {5}","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip","Living weapon"],"colors":[],"colorIdentity":[]}; // EDHREC #4993
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—
const TURN_TO_FROG = {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8993
const FROGIFY = {"name":"Frogify","type":"Enchantment — Aura","mana":"{1}{U}","oracle":"Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1. (It loses all other card types and creature types.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #4689
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const CRADLE = {"name":"Gaea's Cradle","type":"Legendary Land","mana":"","oracle":"{T}: Add {G} for each creature you control.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #445
const ARBOR = {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","layout":"normal","cmc":0,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #769
const BEAST_WITHIN = {"name":"Beast Within","type":"Instant","mana":"{2}{G}","oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #25
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const on = (seat, id, card) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), enteredOnTurn: 1 });
function table({ ai = [], user = [], blessing = false } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players,
    user: { ...g.players.user, battlefield: user, hand: [], graveyard: [], library: [{ ...PLAINS, id: "lu1" }, { ...PLAINS, id: "lu2" }], ...(blessing ? { citysBlessing: true } : {}) },
    ai: { ...g.players.ai, battlefield: ai, hand: [], graveyard: [], library: [{ ...PLAINS, id: "la1" }] } };
  return { ...g, turn: 5, phase: "postcombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const create = (s, clause, controller = "user") => resolveAtom(s, parseEffectClause(clause, "Instant").atoms[0], { controller, targets: [] });
const tappedOf = (s, name, seat = "user") => s.players[seat].battlefield.filter((p) => p.card?.name === name).map((p) => !!p.tapped);
const WOLF = "Create a 2/2 green Wolf creature token.";
const TREASURE = "Create a Treasure token.";

describe("⭐ each opponent's static × a Wolf token and a Treasure", () => {
  const rows = [
    ["Blind Obedience", BLIND_OBEDIENCE, true, true],
    ["Authority of the Consuls", AUTHORITY, true, false],
    ["Thalia, Heretic Cathar", THALIA, true, false],
    ["Kismet", KISMET, true, true],
    ["Frozen Aether", FROZEN_AETHER, true, true],
    ["Imposing Sovereign", SOVEREIGN, true, false],
    ["Archon of Emeria", ARCHON, false, false],
  ];
  for (const [name, card, wolf, treasure] of rows) {
    it(`⭐ under the AI's ${name}: the person's Wolf enters ${wolf ? "tapped" : "untapped"}, their Treasure ${treasure ? "tapped" : "untapped"}`, () => {
      const s = create(create(table({ ai: [on("ai", "imp", card)] }), WOLF), TREASURE);
      expect({ wolf: tappedOf(s, "Wolf"), treasure: tappedOf(s, "Treasure") }).toEqual({ wolf: [wolf], treasure: [treasure] });
    });
  }
  it("⭐ a player's own Blind Obedience never taps their own tokens", () => {
    const s = create(create(table({ user: [on("user", "imp", BLIND_OBEDIENCE)] }), WOLF), TREASURE);
    expect({ wolf: tappedOf(s, "Wolf"), treasure: tappedOf(s, "Treasure") }).toEqual({ wolf: [false], treasure: [false] });
  });
  it("⭐ the single token copy too: a copy of the person's Wolf token enters tapped under the AI's Authority of the Consuls", () => {
    const s0 = create(table({ ai: [on("ai", "imp", AUTHORITY)] }), WOLF);
    const wolf = s0.players.user.battlefield.find((p) => p.card?.name === "Wolf");
    const s = resolveAtom(s0, { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: wolf.id }] });
    expect(tappedOf(s, "Wolf")).toEqual([true, true]);
  });
});

describe("⭐ the living weapon Germ (minted by resolvers.enterPermanent)", () => {
  it("⭐ Batterskull entering under the AI's Authority of the Consuls makes a tapped Germ; under nothing, an untapped one", () => {
    const germ = (s) => s.players.user.battlefield.filter((p) => p.card?.token).map((p) => ({ name: p.card.name, tapped: !!p.tapped }));
    const under = enterPermanent(table({ ai: [on("ai", "imp", AUTHORITY)] }), { ...BATTERSKULL, id: "c-skull" }, "user");
    const free = enterPermanent(table(), { ...BATTERSKULL, id: "c-skull" }, "user");
    expect({ under: germ(under.state ?? under), free: germ(free.state ?? free) }).toEqual({ under: [{ name: "Germ", tapped: true }], free: [{ name: "Germ", tapped: false }] });
  });
});

describe("⭐ one Ocelot Pride resolution, one rule", () => {
  it("⭐ under the AI's Authority of the Consuls the Cat and its copy both enter tapped (before: an untapped Cat and a tapped copy)", () => {
    let s = gainLife(table({ user: [on("user", "ocelot", OCELOT)], ai: [on("ai", "imp", AUTHORITY)], blessing: true }), { playerId: "user", amount: 1 });
    for (let i = 0; i < 20 && s.step !== "end"; i++) s = runStepActions(advanceStep(s));
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 12 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
    expect(tappedOf(s, "Cat")).toEqual([true, true]);
  });
});

describe("⭐ the round-2 recheck's rows (R2-F3)", () => {
  it("⭐ the static's source loses its abilities: under Turn to Frog the AI's Imposing Sovereign taps no Wolf (tapped before the Frog)", () => {
    const before = create(table({ ai: [on("ai", "imp", SOVEREIGN)] }), WOLF);
    const frog = resolveAtom(table({ ai: [on("ai", "imp", SOVEREIGN)] }), parseEffectClause(TURN_TO_FROG.oracle, "Instant").atoms[0], { controller: "user", targets: [{ type: "creature", id: "imp" }] });
    expect({ before: tappedOf(before, "Wolf"), frog: tappedOf(create(frog, WOLF), "Wolf") }).toEqual({ before: [true], frog: [false] });
  });
  it("⭐ the same under Frogify on the AI's Thalia, Heretic Cathar", () => {
    const frogify = { ...createPermanent({ id: "aura", card: { ...FROGIFY, id: "c-aura" }, controller: "user", summoningSick: false }), attachedTo: "imp", enteredOnTurn: 1 };
    const s = create(table({ ai: [on("ai", "imp", THALIA)], user: [frogify] }), WOLF);
    expect(tappedOf(s, "Wolf")).toEqual([false]);
  });
  describe("land tokens (a token copy of the person's land)", () => {
    const copyOf = (static_, land) => {
      const s0 = table({ ai: [on("ai", "imp", static_)], user: [on("user", "land", land)] });
      const s = resolveAtom(s0, { op: "create-token-copy", copySource: "target", count: 1, targetType: "land" }, { controller: "user", targets: [{ type: "permanent", id: "land" }] });
      return s.players.user.battlefield.filter((p) => p.card?.token).map((p) => ({ name: p.card.name, tapped: !!p.tapped }));
    };
    const rows = [["Forest", FOREST, false, true], ["Gaea's Cradle", CRADLE, true, true], ["Dryad Arbor", ARBOR, true, true]];
    for (const [name, land, thalia, kismet] of rows) {
      it(`⭐ a copy of ${name}: under the AI's Thalia ${thalia ? "tapped" : "untapped"}, under its Kismet ${kismet ? "tapped" : "untapped"}`, () => {
        expect({ thalia: copyOf(THALIA, land), kismet: copyOf(KISMET, land) })
          .toEqual({ thalia: [{ name, tapped: thalia }], kismet: [{ name, tapped: kismet }] });
      });
    }
  });
  it("⭐ a manifest — a face-down 2/2 creature card, not a token, through the same seam — enters tapped under the AI's Blind Obedience (CR 614.1d); untapped under nothing", () => {
    const manifest = parseEffectClause("Manifest the top card of your library.", "Instant").atoms[0];
    const faceDown = (s) => s.players.user.battlefield.filter((p) => p.faceDown).map((p) => !!p.tapped);
    const under = resolveAtom(table({ ai: [on("ai", "imp", BLIND_OBEDIENCE)] }), manifest, { controller: "user", targets: [] });
    const free = resolveAtom(table(), manifest, { controller: "user", targets: [] });
    expect({ under: faceDown(under), free: faceDown(free) }).toEqual({ under: [true], free: [false] });
  });
  it("⭐ a token the person's own effect gives an opponent: Beast Within on the AI's Grizzly Bears under the person's Blind Obedience — the AI's Beast enters tapped", () => {
    const s0 = table({ user: [on("user", "imp", BLIND_OBEDIENCE)], ai: [on("ai", "bears", BEARS)] });
    const withSpell = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...BEAST_WITHIN, id: "bw" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 } } } };
    const cast = legalActionsForPlayer(withSpell, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bw" && a.targets?.[0]?.id === "bears");
    expect(cast, "Beast Within at the Bears is offered").toBeTruthy();
    let s = dispatchAction(withSpell, cast);
    for (let i = 0; i < 6 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
    expect({ bears: tappedOf(s, "Grizzly Bears", "ai"), beast: tappedOf(s, "Beast", "ai") }).toEqual({ bears: [], beast: [true] });
  });
});
