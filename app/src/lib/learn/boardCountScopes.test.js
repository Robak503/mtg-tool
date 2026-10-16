/**
 * boardCountScopes.test.js — a board count reads a permanent the same way in every scope: "…you control", "…that player
 * controls", "…they control" and "…your opponents control".
 *
 * THE REPORT: countMatches (effects/atoms/shared.js) tests a count's subtype against the printed type line only, so a
 * changeling (CR 702.73a, "This object is every creature type") would never be a Vampire to Malakir Bloodwitch. For the
 * player-scoped counts that has been answered since P·39 (e111439d): countForSpec's permanentsYouControl kind reads each
 * permanent through countMatchesPerm — the face that is up (CR 712.8d), and for a CREATURE type every creature type
 * (layers.permIsEveryCreatureType: the Changeling keyword, never a mention of the word). The first block pins that with the
 * reported cards, through the real cast path.
 *
 * THE FIX: the opponents' sum ("…your opponents control" — Dockside Extortionist, Mana Geyser, Dragon's Desire, Riot
 * Control) was the one scope still calling the printed-line countMatches. It read a double-faced permanent's whole
 * "Front // Back" type line, so a creature whose back face is an artifact, an enchantment or a land was counted as one,
 * and it would have missed a changeling. It now asks countMatchesPerm, like the other three scopes.
 *
 * Real oracle fixtures (bundled Scryfall, the 2026-10-02 snapshot, shaped by cardIndex.publicCard and
 * learnDeckEnrich.mergeCardData as a game deck card is — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { countForSpec } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures ──
const BLOODWITCH = {"name":"Malakir Bloodwitch","type":"Creature — Vampire Shaman","mana":"{3}{B}{B}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Protection"],"colors":["B"],"oracle":"Flying, protection from white\nWhen this creature enters, each opponent loses life equal to the number of Vampires you control. You gain life equal to the life lost this way."};
const WOODLAND = {"name":"Woodland Changeling","type":"Creature — Shapeshifter","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Changeling"],"colors":["G"],"oracle":"Changeling (This card is every creature type.)"};
const FIRDOCH = {"name":"Firdoch Core","type":"Kindred Artifact — Shapeshifter","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)\n{T}: Add one mana of any color.\n{4}: This artifact becomes a 4/4 artifact creature until end of turn."};
const MASKWOOD = {"name":"Maskwood Nexus","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\n{3}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling. (It is every creature type.)"};
const SPRINGLEAF = {"name":"Springleaf Parade","type":"Enchantment","mana":"{X}{G}{G}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"When this enchantment enters, create X 1/1 colorless Shapeshifter creature tokens with changeling. (They're every creature type.)\nCreature tokens you control have \"{T}: Add one mana of any color.\""};
const BELONGING = {"name":"Belonging","type":"Creature — Elemental Incarnation","mana":"{5}{W}","cmc":6,"power":"6","toughness":"6","keywords":["Encore"],"colors":["W"],"oracle":"When this creature enters, create three 1/1 colorless Shapeshifter creature tokens with changeling. (They're every creature type.)\nEncore {6}{W}{W} ({6}{W}{W}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const SPITTING_EARTH = {"name":"Spitting Earth","type":"Sorcery","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Spitting Earth deals damage to target creature equal to the number of Mountains you control."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const SMAUG = {"name":"Smaug the Magnificent","type":"Legendary Creature — Dragon","mana":"{2}{R}{R}","cmc":4,"power":"4","toughness":"3","keywords":["Flying","Treasure","Haste"],"colors":["R"],"oracle":"Flying, haste\nWhenever Smaug attacks, he deals damage equal to the number of Treasures you control to any target.\nAt the beginning of your upkeep, create a Treasure token."};
const DOCKSIDE = {"name":"Dockside Extortionist","type":"Creature — Goblin Pirate","mana":"{1}{R}","cmc":2,"power":"1","toughness":"2","keywords":["Treasure"],"colors":["R"],"oracle":"When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control. (Treasure tokens are artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")"};
const MANA_GEYSER = {"name":"Mana Geyser","type":"Sorcery","mana":"{3}{R}{R}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Add {R} for each tapped land your opponents control."};
const DRAGONS_DESIRE = {"name":"Dragon's Desire","type":"Sorcery","mana":"{2}{R}{R}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Add {R} for each artifact your opponents control."};
const RIOT_CONTROL = {"name":"Riot Control","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt to you this turn."};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const EDGAR = {"name":"Edgar, Charmed Groom // Edgar Markov's Coffin","type":"Legendary Creature — Vampire Noble // Legendary Artifact","mana":"{2}{W}{B}","cmc":4,"power":"4","toughness":"4","keywords":["Transform"],"colors":[],"layout":"transform","oracle":"Edgar, Charmed Groom - Legendary Creature — Vampire Noble {2}{W}{B}\nOther Vampires you control get +1/+1.\nWhen Edgar dies, return it to the battlefield transformed under its owner's control.\n//\nEdgar Markov's Coffin - Legendary Artifact \nAt the beginning of your upkeep, create a 1/1 white and black Vampire creature token with lifelink and put a bloodline counter on Edgar Markov's Coffin. Then if there are three or more bloodline counters on it, remove those counters and transform it."};
const JACOB = {"name":"Jacob Hauken, Inspector // Hauken's Insight","type":"Legendary Creature — Human Advisor // Legendary Enchantment","mana":"{1}{U}","cmc":2,"power":"0","toughness":"2","keywords":["Transform"],"colors":[],"layout":"transform","oracle":"Jacob Hauken, Inspector - Legendary Creature — Human Advisor {1}{U}\n{T}: Draw a card, then exile a card from your hand face down. You may look at that card for as long as it remains exiled. You may pay {4}{U}{U}. If you do, transform Jacob Hauken.\n//\nHauken's Insight - Legendary Enchantment \nAt the beginning of your upkeep, exile the top card of your library face down. You may look at that card for as long as it remains exiled.\nOnce during each of your turns, you may play a land or cast a spell from among the cards exiled with this permanent without paying its mana cost."};
const OJER_TAQ = {"name":"Ojer Taq, Deepest Foundation // Temple of Civilization","type":"Legendary Creature — God // Land","mana":"{4}{W}{W}","cmc":6,"power":"6","toughness":"6","keywords":["Vigilance","Transform"],"colors":[],"layout":"transform","oracle":"Ojer Taq, Deepest Foundation - Legendary Creature — God {4}{W}{W}\nVigilance\nIf one or more creature tokens would be created under your control, three times that many of those tokens are created instead.\nWhen Ojer Taq dies, return it to the battlefield tapped and transformed under its owner's control.\n//\nTemple of Civilization - Land \n(Transforms from Ojer Taq, Deepest Foundation.)\n{T}: Add {W}.\n{2}{W}, {T}: Transform this land. Activate only if you attacked with three or more creatures this turn and only as a sorcery."};
const FABLE = {"name":"Fable of the Mirror-Breaker // Reflection of Kiki-Jiki","type":"Enchantment — Saga // Enchantment Creature — Goblin Shaman","mana":"{2}{R}","cmc":3,"power":null,"toughness":null,"keywords":["Transform","Treasure"],"colors":[],"layout":"transform","oracle":"Fable of the Mirror-Breaker - Enchantment — Saga {2}{R}\n(As this Saga enters and after your draw step, add a lore counter.)\nI — Create a 2/2 red Goblin Shaman creature token with \"Whenever this token attacks, create a Treasure token.\"\nII — You may discard up to two cards. If you do, draw that many cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.\n//\nReflection of Kiki-Jiki - Enchantment Creature — Goblin Shaman \n{1}, {T}: Create a token that's a copy of another target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step."};

// ── harness ──
const OPPS = ["ai1", "ai2", "ai3"];
/** A four-seat Commander pod (40 life), the user in their main phase with `hand` and `mana`; `board` rows are
 *  [id, card, controller = "user", tapped = false]. */
function pod({ hand = [], board = [], mana = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  let s = { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, ...mana } } } };
  for (const [id, c, controller = "user", tapped = false] of board) {
    s = { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [...s.players[controller].battlefield,
      createPermanent({ id: `p-${id}`, card: { ...c, id }, controller, tapped, summoningSick: false })] } } };
  }
  return s;
}
const withMana = (s, mana) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, ...mana } } } });
/** The one cast of `cardId` the user is offered (at `targetId`, when given). */
function cast(s, cardId, targetId = null) {
  const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId
    && (!targetId || (a.targets || []).some((t) => t.id === targetId)));
  if (offers.length !== 1) throw new Error(`expected exactly one cast of ${cardId}, found ${offers.length}`);
  return dispatchAction(s, offers[0]);
}
/** Resolve the stack and any pending triggers to quiet. */
function settle(s) {
  let n = finalizeStackResolution(s), guard = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && guard++ < 30) {
    n = finalizeStackResolution(n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
/** Life each opponent lost from 40. */
const drained = (s) => OPPS.map((p) => 40 - s.players[p].life);
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name);

describe("a changeling in a tribal board count (CR 702.73a) — the reported case, read right since P·39", () => {
  it("⭐ Malakir Bloodwitch counts Woodland Changeling as a Vampire: each opponent loses 2, and you gain 6", () => {
    const s = settle(cast(pod({ hand: [["mb", BLOODWITCH]], board: [["wc", WOODLAND]], mana: { B: 5 } }), "mb"));
    expect({ drained: drained(s), user: s.players.user.life }).toEqual({ drained: [2, 2, 2], user: 46 });
  });

  it("Firdoch Core is a Kindred artifact with changeling, so it is a Vampire too (CR 205.3m, 308.2: kindreds share the creature types)", () => {
    const s = settle(cast(pod({ hand: [["mb", BLOODWITCH]], board: [["fc", FIRDOCH]], mana: { B: 5 } }), "mb"));
    expect(drained(s)).toEqual([2, 2, 2]);
  });

  it("⛔ Maskwood Nexus and Springleaf Parade only MENTION changeling (they make changeling tokens): neither is a Vampire", () => {
    const s = settle(cast(pod({ hand: [["mb", BLOODWITCH]], board: [["mn", MASKWOOD], ["sp", SPRINGLEAF]], mana: { B: 5 } }), "mb"));
    expect(drained(s)).toEqual([1, 1, 1]);
  });

  it("Belonging's three tokens are minted with the Changeling keyword, and each is a Vampire when Bloodwitch counts", () => {
    const made = settle(cast(pod({ hand: [["bel", BELONGING], ["mb", BLOODWITCH]], mana: { W: 6 } }), "bel"));
    const tokens = made.players.user.battlefield.filter((p) => p.card?.token);
    const s = settle(cast(withMana(made, { B: 5 }), "mb"));
    expect({ tokens: tokens.map((t) => [t.card.type, t.card.keywords]), drained: drained(s) }).toEqual({
      tokens: [["Token Creature — Shapeshifter", ["Changeling"]], ["Token Creature — Shapeshifter", ["Changeling"]], ["Token Creature — Shapeshifter", ["Changeling"]]],
      drained: [4, 4, 4],
    });
  });

  it("⛔ every CREATURE type only (CR 205.3d): Spitting Earth counts the Mountain and not the changeling — 1 damage, the Bears live", () => {
    const s = settle(cast(pod({ hand: [["se", SPITTING_EARTH]], board: [["wc", WOODLAND], ["mt", MOUNTAIN], ["gb", BEARS, "ai1"]], mana: { R: 2 } }), "se", "p-gb"));
    expect(named(s, "ai1", "Grizzly Bears").map((p) => p.damageMarked)).toEqual([1]);
  });

  it("⛔ …nor a Treasure: Smaug's \"Treasures you control\" counts the real Treasure, never Woodland Changeling or Firdoch Core", () => {
    const spec = parseCountSource(SMAUG.oracle.match(/the number of (Treasures you control)/)[1].toLowerCase());
    const board = pod({ board: [["wc", WOODLAND], ["fc", FIRDOCH]] });
    const treasure = parseEffectClause("Create a Treasure token", "spell").atoms
      .reduce((st, atom) => ATOM_RESOLVERS[atom.op](st, atom, { controller: "user", targets: [] }), board);
    expect({ spec, none: countForSpec(board, { controller: "user" }, spec), one: countForSpec(treasure, { controller: "user" }, spec) })
      .toEqual({ spec: { kind: "permanentsYouControl", subtype: "Treasure" }, none: 0, one: 1 });
  });
});

describe("\"…your opponents control\" reads a permanent the way the other scopes do (the fix)", () => {
  it("⭐ Dockside Extortionist: Edgar and Jacob Hauken are creatures with their front faces up (CR 712.8d), so their back faces' artifact and enchantment make no Treasure — Sol Ring makes one", () => {
    const s = settle(cast(pod({ hand: [["dx", DOCKSIDE]], board: [["ed", EDGAR, "ai1"], ["jh", JACOB, "ai2"], ["sr", SOL_RING, "ai3"]], mana: { R: 2 } }), "dx"));
    expect(named(s, "user", "Treasure")).toHaveLength(1);
  });

  it("⭐ Mana Geyser: a tapped Ojer Taq is a creature, not a land — {R} for the tapped Mountain only, none for an untapped one", () => {
    const s = settle(cast(pod({ hand: [["mg", MANA_GEYSER]], board: [["mt", MOUNTAIN, "ai1", true], ["oj", OJER_TAQ, "ai1", true], ["m2", MOUNTAIN, "ai2"]], mana: { R: 5 } }), "mg"));
    expect(s.players.user.manaPool.R).toBe(1);
  });

  it("Dragon's Desire: {R} for Sol Ring, none for the artifact on Edgar's back face", () => {
    const s = settle(cast(pod({ hand: [["dd", DRAGONS_DESIRE]], board: [["sr", SOL_RING, "ai1"], ["ed", EDGAR, "ai2"]], mana: { R: 4 } }), "dd"));
    expect(s.players.user.manaPool.R).toBe(1);
  });

  it("Riot Control: Fable of the Mirror-Breaker is a Saga while its front face is up, not the creature on its back — 1 life for the Bears", () => {
    const before = pod({ hand: [["rc", RIOT_CONTROL]], board: [["fb", FABLE, "ai1"], ["gb", BEARS, "ai2"]], mana: { W: 3 } });
    const s = settle(cast(before, "rc"));
    expect(s.players.user.life - before.players.user.life).toBe(1);
  });

  it("an opponent's changeling is every creature type in the opponents' sum too, and never a Mountain (no parser emits a subtype for this scope yet)", () => {
    const s = pod({ board: [["wc", WOODLAND, "ai1"], ["mb", BLOODWITCH, "ai2"], ["fc", FIRDOCH, "ai3"], ["mt", MOUNTAIN, "ai3"]] });
    const opp = (subtype) => countForSpec(s, { controller: "user" }, { kind: "permanentsYouControl", subtype, who: "opponents" });
    expect({ parsed: parseCountSource("vampires your opponents control", { allowScopes: true }), vampires: opp("Vampire"), mountains: opp("Mountain"), treasures: opp("Treasure") })
      .toEqual({ parsed: null, vampires: 3, mountains: 1, treasures: 0 });
  });

  it("one question in every scope: an opponent's board counted as \"that player controls\" and as \"your opponents control\" agrees", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const ai = [["ed", EDGAR], ["jh", JACOB], ["oj", OJER_TAQ], ["fb", FABLE], ["sr", SOL_RING], ["wc", WOODLAND], ["mt", MOUNTAIN]]
      .map(([id, c]) => createPermanent({ id: `p-${id}`, card: { ...c, id }, controller: "ai", summoningSick: false }));
    const s = { ...g, players: { ...g.players, ai: { ...g.players.ai, battlefield: ai } } };
    const specs = { creature: { cardType: "creature" }, land: { cardType: "land" }, artifact: { cardType: "artifact" }, enchantment: { cardType: "enchantment" },
      artifactsAndEnchantments: { cardTypes: ["artifact", "enchantment"] }, vampire: { subtype: "Vampire" }, mountain: { subtype: "Mountain" } };
    const read = (who, ctx) => Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, countForSpec(s, { controller: "user", ...ctx }, { kind: "permanentsYouControl", ...v, who })]));
    const thatPlayer = read("target", { targets: [{ type: "player", id: "ai" }] });
    expect({ thatPlayer, opponents: read("opponents", {}) }).toEqual({
      thatPlayer: { creature: 4, land: 1, artifact: 1, enchantment: 1, artifactsAndEnchantments: 2, vampire: 2, mountain: 1 },
      opponents: { creature: 4, land: 1, artifact: 1, enchantment: 1, artifactsAndEnchantments: 2, vampire: 2, mountain: 1 },
    });
  });
});
