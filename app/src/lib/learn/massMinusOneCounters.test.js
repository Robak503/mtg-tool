/**
 * MASS -1/-1 COUNTERS — "put N -1/-1 counter(s) on each creature [your opponents control | you don't control]" and "… on each other
 * creature": a set read as the effect is applied (CR 608.2h), nothing targeted; the counters stay (CR 122.1), a creature left at
 * toughness 0 or less is put into its owner's graveyard (CR 704.5f), and a +1/+1 and a -1/-1 counter on one permanent cancel
 * (CR 704.5q):
 *   · Archfiend of Ifnir (EDHREC #1287) — "Whenever you cycle or discard another card, put a -1/-1 counter on each creature your
 *     opponents control." (cycling discards the card, CR 702.29a — one cycle, one trigger);
 *   · Black Sun's Zenith (#1933) — "Put X -1/-1 counters on each creature. Shuffle Black Sun's Zenith into its owner's library.";
 *   · Soul Snuffers, Harbinger of Night ("… on each creature" — the source too), Darkness Descends ("two"), Carnifex Demon ("each
 *     other creature"), Liliana's Influence ("each creature you don't control").
 * The symmetric form is a board wipe to the default AI: held like the -X/-X pump wipe, cast only when clearly behind.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { checkStepTriggers, checkDiscardTriggers } from "./triggers.js";
import { resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programContainsMassRemoval, programContainsCreatureMassRemoval } from "./effects/parser.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const ARCHFIEND_OF_IFNIR = {"name":"Archfiend of Ifnir","type":"Creature — Demon","mana":"{3}{B}{B}","cmc":5,"power":"5","toughness":"4","keywords":["Flying","Cycling"],"colors":["B"],"oracle":"Flying\nWhenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control.\nCycling {2} ({2}, Discard this card: Draw a card.)"}; // body-only on 0a65c51c
const BLACK_SUNS_ZENITH = {"name":"Black Sun's Zenith","type":"Sorcery","mana":"{X}{B}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Put X -1/-1 counters on each creature. Shuffle Black Sun's Zenith into its owner's library."}; // arbiter-spell on 0a65c51c
const SOUL_SNUFFERS = {"name":"Soul Snuffers","type":"Creature — Elemental Shaman","mana":"{2}{B}{B}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["B"],"oracle":"When this creature enters, put a -1/-1 counter on each creature."}; // body-only on 0a65c51c
const DARKNESS_DESCENDS = {"name":"Darkness Descends","type":"Sorcery","mana":"{2}{B}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Put two -1/-1 counters on each creature."}; // arbiter-spell on 0a65c51c
const HARBINGER_OF_NIGHT = {"name":"Harbinger of Night","type":"Creature — Spirit","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"3","keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, put a -1/-1 counter on each creature."}; // body-only on 0a65c51c
const CARNIFEX_DEMON = {"name":"Carnifex Demon","type":"Creature — Phyrexian Demon","mana":"{4}{B}{B}","cmc":6,"power":"6","toughness":"6","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nThis creature enters with two -1/-1 counters on it.\n{B}, Remove a -1/-1 counter from this creature: Put a -1/-1 counter on each other creature."}; // body-only on 0a65c51c
const LILIANAS_INFLUENCE = {"name":"Liliana's Influence","type":"Sorcery","mana":"{4}{B}{B}","cmc":6,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Put a -1/-1 counter on each creature you don't control. You may search your library and/or graveyard for a card named Liliana, Death Wielder, reveal it, and put it into your hand. If you search your library this way, shuffle."}; // arbiter-spell on 0a65c51c
const LILIANA_DEATH_WIELDER = {"name":"Liliana, Death Wielder","type":"Legendary Planeswalker — Liliana","mana":"{5}{B}{B}","cmc":7,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"+2: Put a -1/-1 counter on up to one target creature.\n−3: Destroy target creature with a -1/-1 counter on it.\n−10: Return all creature cards from your graveyard to the battlefield."};
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], colors: ["G"], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, power: "1", toughness: "1", keywords: [], colors: ["G"], oracle: "{T}: Add {G}." };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {B}.)" };

const perm = (id, card, controller = "user", counters = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), counters });
const swamps = (n) => Array.from({ length: n }, (_, i) => perm(`sw${i}`, SWAMP));
function board({ hand = [], user = [], ai = [], graveyard = [], library = [{ ...BEARS, id: "lib-top" }, { ...ELVES, id: "lib-2" }], step = "main", phase = "precombat-main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase, step, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield: user, graveyard, library },
      ai: { ...g.players.ai, battlefield: ai } } };
}
// Resolve the whole stack: a printed "you may" is taken; a search pause takes `pick`.
function resolveAll(s, pick = null) {
  let out = flushTriggers(s);
  for (let i = 0; i < 30 && ((out.stack || []).length || out.pendingChoice || (out.pendingTriggers || []).length); i++) {
    if (out.pendingChoice) out = out.pendingChoice.kind === "optional-effect" ? resolveOptionalChoice(out, true) : resolveTutorChoice(out, pick);
    else out = flushTriggers(resolveTopOfStack(out));
  }
  return out;
}
const onBf = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id) || null;
const pt = (s, id) => (onBf(s, id) ? [permanentPower(s, id), permanentToughness(s, id)] : "gone");
const m11 = (s, id) => onBf(s, id)?.counters?.["-1/-1"] ?? 0;
const castOf = (s, cardId, x) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (x == null || a.xValue === x)) || null;

describe("the reader", () => {
  it("⭐ the seven cards play their whole text", () => {
    expect([ARCHFIEND_OF_IFNIR, BLACK_SUNS_ZENITH, SOUL_SNUFFERS, DARKNESS_DESCENDS, HARBINGER_OF_NIGHT, CARNIFEX_DEMON, LILIANAS_INFLUENCE].map((c) => classifyCard(c)))
      .toEqual(["native-trigger", "native-spell", "native-trigger", "native-spell", "native-trigger", "native-activated", "native-spell"]);
  });
  it("⭐ the atoms: an untargeted set, the opponents' or every creature's, the source excluded by \"other\"", () => {
    const atoms = (oracle, mana = "{2}{B}{B}") => parseEffectProgram({ name: "x", type: "Sorcery", mana, oracle })?.atoms || [];
    expect({
      opp: atoms("Put a -1/-1 counter on each creature your opponents control."),
      dont: atoms("Put a -1/-1 counter on each creature you don't control."),
      all: atoms("Put two -1/-1 counters on each creature."),
      other: atoms("Put a -1/-1 counter on each other creature."),
      x: atoms("Put X -1/-1 counters on each creature.", "{X}{B}{B}"),
    }).toEqual({
      opp: [{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "eachOpponentCreature" }],
      dont: [{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "eachOpponentCreature" }],
      all: [{ op: "add-counter", counterType: "-1/-1", amount: 2, targetType: "eachCreature" }],
      other: [{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "eachCreature", excludeSource: true }],
      x: [{ op: "add-counter", counterType: "-1/-1", amountX: true, targetType: "eachCreature" }],
    });
  });
  it("control: the symmetric +1/+1 form, an \"X\" with no {X} in the cost, and the own-side -1/-1 \"other\" stay unread", () => {
    const atoms = (oracle, mana = "{2}{B}") => parseEffectProgram({ name: "x", type: "Sorcery", mana, oracle })?.atoms || [];
    expect({
      plus: atoms("Put a +1/+1 counter on each creature."),
      noX: atoms("Put X -1/-1 counters on each creature."),
      otherOpp: atoms("Put a -1/-1 counter on each other creature your opponents control."),
    }).toEqual({ plus: [], noX: [], otherOpp: [] });
  });
});

describe("Archfiend of Ifnir", () => {
  it("⭐ cycling another card: one trigger, a -1/-1 counter on each creature an opponent controls — the Elves die; the caster's creatures untouched", () => {
    const s0 = board({ hand: [{ ...ARCHFIEND_OF_IFNIR, id: "h-arch" }], user: [perm("arch", ARCHFIEND_OF_IFNIR), perm("wurm", WURM), ...swamps(2)],
      ai: [perm("bears", BEARS, "ai"), perm("elves", ELVES, "ai")] });
    const cycle = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cycle" && a.cardId === "h-arch");
    expect(cycle, "the hand copy may be cycled").toBeDefined();
    const s = resolveAll(dispatchAction(s0, cycle));
    expect({ bears: pt(s, "bears"), counters: m11(s, "bears"), elves: pt(s, "elves"), arch: pt(s, "arch"), wurm: pt(s, "wurm"), drew: s.players.user.hand.map((c) => c.id) })
      .toEqual({ bears: [1, 1], counters: 1, elves: "gone", arch: [5, 4], wurm: [6, 4], drew: ["lib-top"] });
  });
  it("two cards discarded: two triggers, two counters", () => {
    const s0 = board({ user: [perm("arch", ARCHFIEND_OF_IFNIR)], ai: [perm("wurm", WURM, "ai")] });
    const s = resolveAll(checkDiscardTriggers(s0, "user", 2));
    expect({ wurm: pt(s, "wurm"), counters: m11(s, "wurm") }).toEqual({ wurm: [4, 2], counters: 2 });
  });
});

describe("Black Sun's Zenith", () => {
  it("⭐ X=2: two -1/-1 counters on every creature, both sides; the Bears die, a +1/+1 counter cancels one; the card is shuffled into its owner's library", () => {
    const s0 = board({ hand: [{ ...BLACK_SUNS_ZENITH, id: "h-bsz" }], user: [perm("wurm", WURM, "user", { "+1/+1": 1 }), ...swamps(4)], ai: [perm("bears", BEARS, "ai"), perm("ai-wurm", WURM, "ai")] });
    const cast = castOf(s0, "h-bsz", 2);
    expect(cast, "an X=2 cast is offered").toBeTruthy();
    const s = resolveAll(dispatchAction(s0, cast));
    expect({
      wurm: pt(s, "wurm"), wurmCounters: [onBf(s, "wurm")?.counters?.["+1/+1"] ?? 0, m11(s, "wurm")], aiWurm: pt(s, "ai-wurm"), bears: pt(s, "bears"),
      inLibrary: s.players.user.library.some((c) => c.id === "h-bsz"), inGraveyard: s.players.user.graveyard.some((c) => c.id === "h-bsz"),
    }).toEqual({ wurm: [5, 3], wurmCounters: [0, 1], aiWurm: [4, 2], bears: "gone", inLibrary: true, inGraveyard: false });
  });
  it("the default AI holds it as a creature wipe (cast only when clearly behind), like the -X/-X pump wipe", () => {
    const prog = parseEffectProgram(BLACK_SUNS_ZENITH);
    const opp = parseEffectProgram({ ...ARCHFIEND_OF_IFNIR, type: "Sorcery", oracle: "Put a -1/-1 counter on each creature your opponents control." });
    expect({ held: programContainsMassRemoval(prog), creatureWipe: programContainsCreatureMassRemoval(prog), oppHeld: programContainsMassRemoval(opp) })
      .toEqual({ held: true, creatureWipe: true, oppHeld: false });
  });
});

describe("Soul Snuffers, Harbinger of Night, Darkness Descends", () => {
  it("⭐ Soul Snuffers' enters trigger: a counter on each creature, itself included", () => {
    const s0 = board({ hand: [{ ...SOUL_SNUFFERS, id: "h-ss" }], user: [perm("wurm", WURM), ...swamps(4)], ai: [perm("bears", BEARS, "ai"), perm("elves", ELVES, "ai")] });
    const s = resolveAll(dispatchAction(s0, castOf(s0, "h-ss")));
    const snuffer = s.players.user.battlefield.find((p) => p.card?.name === "Soul Snuffers");
    expect({ snuffer: snuffer ? [permanentPower(s, snuffer.id), permanentToughness(s, snuffer.id)] : "gone", wurm: pt(s, "wurm"), bears: pt(s, "bears"), elves: pt(s, "elves") })
      .toEqual({ snuffer: [2, 2], wurm: [5, 3], bears: [1, 1], elves: "gone" });
  });
  it("⭐ Harbinger of Night at its controller's upkeep: itself and every other creature", () => {
    const s0 = board({ user: [perm("harb", HARBINGER_OF_NIGHT), perm("wurm", WURM)], ai: [perm("bears", BEARS, "ai")], phase: "beginning", step: "upkeep" });
    const s = resolveAll(checkStepTriggers(s0, "upkeep"));
    expect({ harb: pt(s, "harb"), wurm: pt(s, "wurm"), bears: pt(s, "bears") }).toEqual({ harb: [1, 2], wurm: [5, 3], bears: [1, 1] });
  });
  it("⭐ Darkness Descends: two counters on each creature", () => {
    const s0 = board({ hand: [{ ...DARKNESS_DESCENDS, id: "h-dd" }], user: [perm("wurm", WURM), ...swamps(4)], ai: [perm("bears", BEARS, "ai")] });
    const s = resolveAll(dispatchAction(s0, castOf(s0, "h-dd")));
    expect({ wurm: pt(s, "wurm"), bears: pt(s, "bears"), gy: s.players.user.graveyard.map((c) => c.id) }).toEqual({ wurm: [4, 2], bears: "gone", gy: ["h-dd"] });
  });
});

describe("Carnifex Demon", () => {
  it("⭐ {B}, remove a -1/-1 counter from it: a counter on each OTHER creature, never itself", () => {
    const s0 = board({ user: [perm("carn", CARNIFEX_DEMON, "user", { "-1/-1": 2 }), perm("wurm", WURM), ...swamps(1)], ai: [perm("bears", BEARS, "ai")] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "carn");
    expect(act, "the ability is offered").toBeDefined();
    const s = resolveAll(dispatchAction(s0, act));
    expect({ carn: pt(s, "carn"), carnCounters: m11(s, "carn"), wurm: pt(s, "wurm"), bears: pt(s, "bears") }).toEqual({ carn: [5, 5], carnCounters: 1, wurm: [5, 3], bears: [1, 1] });
  });
});

describe("Liliana's Influence", () => {
  it("⭐ a counter on each creature the caster doesn't control; Liliana, Death Wielder found in the graveyard goes to the hand", () => {
    const s0 = board({ hand: [{ ...LILIANAS_INFLUENCE, id: "h-li" }], user: [perm("wurm", WURM), ...swamps(6)], ai: [perm("bears", BEARS, "ai")],
      graveyard: [{ ...LILIANA_DEATH_WIELDER, id: "g-lili" }] });
    const s = resolveAll(dispatchAction(s0, castOf(s0, "h-li")), "g-lili");
    expect({ wurm: pt(s, "wurm"), bears: pt(s, "bears"), hand: s.players.user.hand.map((c) => c.id) }).toEqual({ wurm: [6, 4], bears: [1, 1], hand: ["g-lili"] });
  });
});
