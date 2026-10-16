/**
 * turnedFaceUpWatchers.test.js — the "turned face up" WATCHER trigger (the turned-face-up watcher slice, 2026-10-16; CR 701.40b,
 * 701.40g, 708.8, 603.3, 603.4, 603.10, 608.2c, 608.2h).
 *
 * Since the play-weighted P·19 a manifested creature card can be turned face up for its mana cost. That broke the old premise
 * that nothing ever flips, so P·19 narrowed coverage's strip to a card's OWN flip and ten watcher cards went to body-only. The
 * flip is now an EVENT: applyTurnFaceUp fires checkTurnedFaceUpTriggers, every watcher whose subject the flipped permanent
 * matches triggers with that permanent as its referent, and a watcher whose whole text is modeled is native again.
 *
 * Every regained card is witnessed through the REAL turn-up path: the offer (legalActionsForPlayer), the special action
 * (dispatchAction — the triggers are put on the stack before the actor acts again), the stack.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-16 through cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { manifestCard } from "./effects/atoms/manifest.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { resolveOptionalChoice, resolveScryChoice, resolveOptionalDrawDiscardChoice, resolveDiscardChoice } from "./effects/runProgram.js";
import { classifyCard, isNativeTier, hasSelfTurnedFaceUpTrigger } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle (bundled Scryfall) ──────────────────────────────────────────────────────────────────────────────────────
const AVEN_FARSEER = { name: "Aven Farseer", type: "Creature — Bird Soldier", mana: "{1}{W}", cmc: 2, colors: ["W"], power: "1", toughness: "1", keywords: ["Flying"], oracle: "Flying\nWhenever a permanent is turned face up, put a +1/+1 counter on this creature." };
const APHETTO_RUNECASTER = { name: "Aphetto Runecaster", type: "Creature — Human Wizard", mana: "{3}{U}", cmc: 4, colors: ["U"], power: "2", toughness: "3", keywords: [], oracle: "Whenever a permanent is turned face up, you may draw a card." };
const BONETHORN_VALESK = { name: "Bonethorn Valesk", type: "Creature — Beast", mana: "{4}{R}", cmc: 5, colors: ["R"], power: "4", toughness: "2", keywords: [], oracle: "Whenever a permanent is turned face up, this creature deals 1 damage to any target." };
const UNBLINKING_BLEB = { name: "Unblinking Bleb", type: "Creature — Illusion", mana: "{3}{U}", cmc: 4, colors: ["U"], power: "1", toughness: "3", keywords: ["Morph", "Scry"], oracle: "Morph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever this creature or another permanent is turned face up, you may scry 2. (Look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)" };
const PINE_WALKER = { name: "Pine Walker", type: "Creature — Elemental", mana: "{3}{G}{G}", cmc: 5, colors: ["G"], power: "5", toughness: "5", keywords: ["Morph"], oracle: "Morph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever this creature or another creature you control is turned face up, untap that creature." };
const EXPERIMENT_TWELVE = { name: "Experiment Twelve", type: "Creature — Elf Lizard Warrior", mana: "{3}{G}", cmc: 4, colors: ["G"], power: "4", toughness: "4", keywords: ["Trample", "Disguise"], oracle: "Trample\nWhenever this creature or another creature you control is turned face up, put +1/+1 counters on that creature equal to its power.\nDisguise {4}{G} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" };
const SALT_ROAD_AMBUSHERS = { name: "Salt Road Ambushers", type: "Creature — Dog Warrior", mana: "{3}{G}", cmc: 4, colors: ["G"], power: "3", toughness: "3", keywords: ["Megamorph"], oracle: "Whenever another permanent you control is turned face up, if it's a creature, put two +1/+1 counters on it.\nMegamorph {3}{G}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)" };
const SUMALA_SENTRY = { name: "Sumala Sentry", type: "Creature — Elf Archer", mana: "{G}{W}", cmc: 2, colors: ["G", "W"], power: "1", toughness: "3", keywords: ["Reach"], oracle: "Reach\nWhenever a face-down permanent you control is turned face up, put a +1/+1 counter on it and a +1/+1 counter on this creature." };
const PYROTECHNIC_PERFORMER = { name: "Pyrotechnic Performer", type: "Creature — Lizard Assassin", mana: "{1}{R}", cmc: 2, colors: ["R"], power: "3", toughness: "2", keywords: ["Disguise"], oracle: "Disguise {R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhenever this creature or another creature you control is turned face up, that creature deals damage equal to its power to each opponent." };
const DEATHMIST_RAPTOR = { name: "Deathmist Raptor", type: "Creature — Dinosaur Beast", mana: "{1}{G}{G}", cmc: 3, colors: ["G"], power: "3", toughness: "3", keywords: ["Megamorph", "Deathtouch"], oracle: "Deathtouch\nWhenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down.\nMegamorph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)" };
const TRUE_IDENTITY = { name: "True Identity", type: "Enchantment", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Disguise", "Scry"], oracle: "Whenever this enchantment or another permanent you control is turned face up, scry 1, then draw a card. This ability triggers only once each turn.\nDisguise {W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" };
const MASTERY_OF_THE_UNSEEN = { name: "Mastery of the Unseen", type: "Enchantment", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Manifest"], oracle: "Whenever a permanent you control is turned face up, you gain 1 life for each creature you control.\n{3}{W}: Manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)" };
const FATAL_MUTATION = { name: "Fatal Mutation", type: "Enchantment — Aura", mana: "{B}", cmc: 1, colors: ["B"], keywords: ["Enchant"], oracle: "Enchant creature\nWhen enchanted creature is turned face up, destroy it. It can't be regenerated." };
const PROJEKTOR_INSPECTOR = { name: "Projektor Inspector", type: "Creature — Human Detective", mana: "{2}{U}", cmc: 3, colors: ["U"], power: "3", toughness: "2", keywords: [], oracle: "Whenever this creature or another Detective you control enters and whenever a Detective you control is turned face up, you may draw a card. If you do, discard a card." };
const PERIMETER_ENFORCER = { name: "Perimeter Enforcer", type: "Creature — Human Detective", mana: "{1}{W}", cmc: 2, colors: ["W"], power: "1", toughness: "1", keywords: ["Flying", "Lifelink"], oracle: "Flying, lifelink\nWhenever another Detective you control enters and whenever a Detective you control is turned face up, this creature gets +1/+1 until end of turn." };
const CASE_OF_THE_PILFERED_PROOF = { name: "Case of the Pilfered Proof", type: "Enchantment — Case", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Solved"], oracle: "Whenever a Detective you control enters or is turned face up, put a +1/+1 counter on it.\nTo solve — You control three or more Detectives. (If unsolved, solve at the beginning of your end step.)\nSolved — If one or more tokens would be created under your control, those tokens plus a Clue token are created instead. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" };
const TRAIL_OF_MYSTERY = { name: "Trail of Mystery", type: "Enchantment", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], oracle: "Whenever a face-down creature you control enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nWhenever a permanent you control is turned face up, if it's a creature, it gets +2/+2 until end of turn." };
const TEMUR_WAR_SHAMAN = { name: "Temur War Shaman", type: "Creature — Human Shaman", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "4", toughness: "5", keywords: ["Manifest", "Fight"], oracle: "When this creature enters, manifest the top card of your library. (Put that card onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever a permanent you control is turned face up, if it's a creature, you may have it fight target creature you don't control." };
const SECRET_PLANS = { name: "Secret Plans", type: "Enchantment", mana: "{G}{U}", cmc: 2, colors: ["G", "U"], keywords: [], oracle: "Face-down creatures you control get +0/+1.\nWhenever a permanent you control is turned face up, draw a card." };
const KAUST = { name: "Kaust, Eyes of the Glade", type: "Legendary Creature — Dryad Detective", mana: "{R/W}{G}", cmc: 2, colors: ["G", "R", "W"], power: "2", toughness: "2", keywords: [], oracle: "Whenever a creature you control that was turned face up this turn deals combat damage to a player, draw a card.\n{T}: Turn target face-down attacking creature you control face up." };
const MISTWAY_SPY = { name: "Mistway Spy", type: "Creature — Merfolk Detective", mana: "{U}", cmc: 1, colors: ["U"], power: "1", toughness: "1", keywords: ["Flying", "Investigate", "Disguise"], oracle: "Flying\nDisguise {1}{U} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, until end of turn, whenever a creature you control deals combat damage to a player, investigate." };
const GADGET_TECHNICIAN = { name: "Gadget Technician", type: "Creature — Goblin Artificer", mana: "{2}{U}{R}", cmc: 4, colors: ["R", "U"], power: "3", toughness: "2", keywords: ["Disguise"], oracle: "When this creature enters or is turned face up, create a 1/1 colorless Thopter artifact creature token with flying.\nDisguise {U/R}{U/R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" };
const CONCERT_KABOOMIST = { name: "Concert Kaboomist", type: "Creature — Goblin Artificer", mana: "{1}{R}{R}", cmc: 3, colors: ["R"], power: "4", toughness: "2", keywords: ["Trample", "Disguise"], oracle: "Trample\nWhen Concert Kaboomist enters or is turned face up, it deals X damage to target opponent, where X is the number of noncreature spells you've cast since the beginning of your last turn.\nDisguise {R}" };
const FLAVOR_DISASTER = { name: "Flavor Disaster", type: "Enchantment Creature — Elemental Pirate", mana: "{4}{G}", cmc: 5, colors: ["G"], power: "4", toughness: "3", keywords: ["Reach"], oracle: "Reach\nWhen Flavor Disaster enters the battlefield or when it's turned face up, target creature gets +X/+X until end of turn, where X is Flavor Disaster's power.\nNegamorph {1}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its negamorph cost and put a -1/-1 counter on it.)" };
const CROWD_CONTROL_WARDEN = { name: "Crowd-Control Warden", type: "Creature — Centaur Soldier", mana: "{3}{G}{W}", cmc: 5, colors: ["G", "W"], power: "4", toughness: "4", keywords: ["Disguise"], oracle: "As this creature enters or is turned face up, put X +1/+1 counters on it, where X is the number of other creatures you control.\nDisguise {3}{G/W}{G/W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };

// ── The real path ───────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * `pid` holds priority in its main phase with `pool` floating, the `watchers` on its battlefield (or `aiWatchers` on the
 * opponent's), `graveyard` in its graveyard, and `card` manifested face down from the top of its library (`fd` patches the
 * face-down permanent — damage, tapped). Returns the state and the face-down permanent's id.
 */
function board({ pid = "user", card = CRAW_WURM, pool = { G: 6 }, watchers = [], aiWatchers = [], graveyard = [], library = [], fd = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = pid === "user" ? "ai" : "user";
  const players = { ...g.players };
  players[pid] = { ...players[pid], hand: [], graveyard: graveyard.map((c, i) => ({ ...c, id: `gy-${i}` })), library: [{ ...card, id: "m-card" }, ...library.map((c, i) => ({ ...c, id: `lib-${i}` }))],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool },
    battlefield: watchers.map((c, i) => createPermanent({ id: `w${i}`, card: { ...c, id: `wc${i}` }, controller: pid, summoningSick: false })) };
  players[opp] = { ...players[opp], hand: [], graveyard: [], library: [{ ...BEARS, id: "opp-lib" }],
    battlefield: aiWatchers.map((c, i) => createPermanent({ id: `o${i}`, card: { ...c, id: `oc${i}` }, controller: opp, summoningSick: false })) };
  let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: pid, priorityHolder: pid, consecutivePasses: 0, stack: [], players };
  s = manifestCard(s, pid, s.players[pid].library[0]);
  const fdId = s.players[pid].battlefield.find((p) => p.faceDown).id;
  s = { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: s.players[pid].battlefield.map((p) => (p.id === fdId ? { ...p, ...fd } : p)) } } };
  return { s, fdId };
}
const turnUps = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "turn-face-up");
/** The special action as offered — the offer, then the dispatch (which puts the triggers on the stack). */
const flip = (s, pid = "user") => dispatchAction(s, turnUps(s, pid)[0]);
/** Resolve the stack, answering each pause the way the driver's autopilot does: take a "may", keep the scried cards on top. */
function settle(s) {
  for (let n = 0; n < 40; n++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (pc?.kind === "scry-surveil") { s = resolveScryChoice(s, (pc.cards || []).map((c) => c.id)); continue; }
    if (pc?.kind === "optional-draw-discard") { s = resolveOptionalDrawDiscardChoice(s, true); continue; }
    if (pc?.kind === "discard") { s = resolveDiscardChoice(s, s.players[pc.controller].hand[0]?.id); continue; }
    if (pc || !(s.stack || []).length) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const perm = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id);
const size = (s, id) => [permanentPower(s, id), permanentToughness(s, id)];
const plus = (s, id) => perm(s, id)?.counters?.["+1/+1"] || 0;

// ── Classification ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the cards", () => {
  it("⭐ the ten P·19 lost are native again — each one's whole text is modeled", () => {
    const lost = [AVEN_FARSEER, APHETTO_RUNECASTER, BONETHORN_VALESK, UNBLINKING_BLEB, PINE_WALKER, EXPERIMENT_TWELVE, SALT_ROAD_AMBUSHERS, SUMALA_SENTRY, PYROTECHNIC_PERFORMER, DEATHMIST_RAPTOR];
    expect(lost.filter((c) => !isNativeTier(classifyCard(c))).map((c) => c.name)).toEqual([]);
  });

  it("⭐ five more watchers whose whole text is modeled: True Identity, Mastery of the Unseen, Fatal Mutation, and the two Detective compounds", () => {
    expect([TRUE_IDENTITY, MASTERY_OF_THE_UNSEEN, FATAL_MUTATION, PROJEKTOR_INSPECTOR, PERIMETER_ENFORCER].map((c) => [c.name, isNativeTier(classifyCard(c))]))
      .toEqual([["True Identity", true], ["Mastery of the Unseen", true], ["Fatal Mutation", true], ["Projektor Inspector", true], ["Perimeter Enforcer", true]]);
  });

  it("⛔ a watcher beside unmodeled text stays body-only (the face-down enters watcher, the optional fight, the face-down anthem, the Case, Kaust)", () => {
    expect([TRAIL_OF_MYSTERY, TEMUR_WAR_SHAMAN, SECRET_PLANS, CASE_OF_THE_PILFERED_PROOF, KAUST].map(classifyCard))
      .toEqual(["body-only", "body-only", "body-only", "body-only", "body-only"]);
  });

  it("each printed subject maps to the scope that enforces it", () => {
    const tfu = (c) => detectTriggers(c).filter((d) => d.event === "turnedFaceUp").map((d) => [d.scope, d.subtypeFilter || null, d.interveningIf || null]);
    expect({
      permanent: tfu(AVEN_FARSEER), selfOrAnotherPermanent: tfu(UNBLINKING_BLEB), permanentYouControl: tfu(MASTERY_OF_THE_UNSEEN),
      faceDownPermanentYouControl: tfu(SUMALA_SENTRY), anotherPermanentYouControl: tfu(SALT_ROAD_AMBUSHERS),
      selfOrAnotherCreatureYouControl: tfu(PINE_WALKER), selfOrAnotherPermanentYouControl: tfu(TRUE_IDENTITY),
      detectiveYouControl: tfu(PERIMETER_ENFORCER), enchantedCreature: tfu(FATAL_MUTATION),
    }).toEqual({
      permanent: [["anyPermanent", null, null]], selfOrAnotherPermanent: [["anyPermanent", null, null]], permanentYouControl: [["permanentYouControl", null, null]],
      faceDownPermanentYouControl: [["permanentYouControl", null, null]], anotherPermanentYouControl: [["otherPermanentYouControl", null, "it's a creature"]],
      selfOrAnotherCreatureYouControl: [["creatureYouControl", null, null]], selfOrAnotherPermanentYouControl: [["permanentYouControl", null, null]],
      detectiveYouControl: [["subtypeYouControl", "Detective", null]], enchantedCreature: [["equippedCreature", null, null]],
    });
  });

  it("a watcher's \"enters or is turned face up\" splits into its two events (Case of the Pilfered Proof)", () => {
    expect(detectTriggers(CASE_OF_THE_PILFERED_PROOF).map((d) => [d.event, d.scope, d.effectClause]))
      .toEqual([["etb", "subtypeYouControl", "put a +1/+1 counter on the triggering creature"], ["turnedFaceUp", "subtypeYouControl", "put a +1/+1 counter on the triggering creature"]]);
    // …and the shaped-sentence count knows the split (compoundTriggerCount): the line alone, on a body with nothing else, is a
    // fully modeled card — one printed sentence, two triggers.
    expect(classifyCard({ name: "Probe Detective", type: "Creature — Human Detective", mana: "{1}{W}", cmc: 2, colors: ["W"], power: "2", toughness: "2", keywords: [],
      oracle: "Whenever a Detective you control enters or is turned face up, put a +1/+1 counter on it." })).toBe("native-trigger");
  });
});

describe("⛔ the refusals — every other flip condition stays undetected", () => {
  const probe = (oracle, type = "Creature — Elf") => detectTriggers({ name: "Probe", type, mana: "{1}{G}", power: "2", toughness: "2", oracle });
  it("⛔ the card's OWN flip (never offered, so never fired — the strip's vacuity)", () => {
    expect(probe("When this creature is turned face up, draw a card.")).toEqual([]);
  });
  it("⛔ Mistway Spy's delayed-setup wrapper (a comma in the condition — never a permanent combat-damage watcher)", () => {
    expect(detectTriggers(MISTWAY_SPY)).toEqual([]);
  });
  it("⛔ Kaust's \"that was turned face up this turn\" — no longer misread as a SELF combat-damage draw", () => {
    expect(detectTriggers(KAUST)).toEqual([]);
  });
  it("⛔ a compound naming the flip beside another event is refused whole — never read as its other half", () => {
    // Every flip condition is decided in classifyTurnedFaceUp, FIRST. "dies or is turned face up" must not fall through to the
    // dies arm, which tests "dies" anywhere in the condition and would credit the death half with the flip half dropped. (A
    // watcher's "enters or is turned face up" never arrives unsplit — DISJUNCTION_TURNED_FACE_UP_SRC splits it first.)
    expect(probe("Whenever a creature you control dies or is turned face up, draw a card.")).toEqual([]);
  });
  it("⛔ a union whose self is not a creature is not the creatures you control; a subtype that is no creature type builds no filter", () => {
    expect([probe("Whenever this enchantment or another creature you control is turned face up, draw a card.", "Enchantment"),
      probe("Whenever a nontoken you control is turned face up, draw a card.")]).toEqual([[], []]);
  });
});

// ── The runtime, through the real turn-up path ──────────────────────────────────────────────────────────────────────────
describe("the ten regained, played", () => {
  it("Aven Farseer: a counter for every permanent turned face up — its controller's and an opponent's", () => {
    const own = settle(flip(board({ watchers: [AVEN_FARSEER] }).s));
    const theirs = settle(flip(board({ pid: "ai", aiWatchers: [AVEN_FARSEER] }).s, "ai"));
    expect([plus(own, "w0"), plus(theirs, "o0")]).toEqual([1, 1]);
  });

  it("Aphetto Runecaster: you may draw a card", () => {
    const { s } = board({ watchers: [APHETTO_RUNECASTER], library: [BEARS] });
    expect(settle(flip(s)).players.user.hand.map((c) => c.name)).toEqual(["Grizzly Bears"]);
  });

  it("Bonethorn Valesk: 1 damage to any target — the chooser aims it at the opponent", () => {
    const { s } = board({ watchers: [BONETHORN_VALESK] });
    expect(40 - settle(flip(s)).players.ai.life).toBe(1);
  });

  it("Unblinking Bleb: its OWN flip triggers it (CR 603.10 — the board right after the flip) — scry 2", () => {
    const { s } = board({ card: UNBLINKING_BLEB, pool: { U: 1, C: 3 }, library: [BEARS, BEARS] });
    const done = settle(flip(s));
    expect(done.log.filter((e) => e.kind === "spell-effect" && e.effect === "scry").map((e) => e.looked)).toEqual([2]);
  });

  it("Pine Walker: untaps the creature turned face up — another one, and itself", () => {
    const other = board({ watchers: [PINE_WALKER], fd: { tapped: true } });
    const itself = board({ card: PINE_WALKER, pool: { G: 5 }, fd: { tapped: true } });
    expect([perm(settle(flip(other.s)), other.fdId).tapped, perm(settle(flip(itself.s)), itself.fdId).tapped]).toEqual([false, false]);
  });

  it("Experiment Twelve: +1/+1 counters equal to the flipped creature's power — Craw Wurm, 6/4, becomes 12/10", () => {
    const { s, fdId } = board({ watchers: [EXPERIMENT_TWELVE] });
    const done = settle(flip(s));
    expect([plus(done, fdId), ...size(done, fdId)]).toEqual([6, 12, 10]);
  });

  it("Salt Road Ambushers: two counters on ANOTHER creature turned face up, none on its own flip", () => {
    const other = board({ watchers: [SALT_ROAD_AMBUSHERS] });
    const itself = board({ card: SALT_ROAD_AMBUSHERS, pool: { G: 4 } });
    expect([plus(settle(flip(other.s)), other.fdId), plus(settle(flip(itself.s)), itself.fdId)]).toEqual([2, 0]);
  });

  it("Sumala Sentry: a counter on the flipped permanent and one on itself", () => {
    const { s, fdId } = board({ watchers: [SUMALA_SENTRY] });
    const done = settle(flip(s));
    expect([plus(done, fdId), plus(done, "w0")]).toEqual([1, 1]);
  });

  it("Pyrotechnic Performer: the flipped creature deals its power to each opponent — and its last known power when the flip killed it", () => {
    const wurm = settle(flip(board({ watchers: [PYROTECHNIC_PERFORMER] }).s));
    // A manifest carrying 2 damage turned into Grizzly Bears (2/2) dies to the state-based check before its trigger is put on
    // the stack; the card's ruling: it deals damage equal to its power as it last existed on the battlefield.
    const bears = board({ watchers: [PYROTECHNIC_PERFORMER], card: BEARS, pool: { G: 2 }, fd: { damageMarked: 2 } });
    const dead = settle(flip(bears.s));
    expect({ wurm: 40 - wurm.players.ai.life, lki: 40 - dead.players.ai.life, bears: dead.players.user.graveyard.map((c) => c.name) })
      .toEqual({ wurm: 6, lki: 2, bears: ["Grizzly Bears"] });
  });

  it("Deathmist Raptor: from the graveyard, back to the battlefield face up when a permanent its owner controls turns face up", () => {
    const { s } = board({ graveyard: [DEATHMIST_RAPTOR] });
    const done = settle(flip(s));
    expect({ battlefield: done.players.user.battlefield.map((p) => [p.card.name, !!p.faceDown]), graveyard: done.players.user.graveyard.map((c) => c.name) })
      .toEqual({ battlefield: [["Craw Wurm", false], ["Deathmist Raptor", false]], graveyard: [] });
  });

  it("⛔ Deathmist Raptor on the battlefield does nothing for a flip (it functions only from the graveyard)", () => {
    const { s } = board({ watchers: [DEATHMIST_RAPTOR] });
    expect(flip(s).stack).toEqual([]);
  });
});

describe("the five more, played", () => {
  it("True Identity: scry 1, then draw — and it triggers only once each turn", () => {
    const { s } = board({ watchers: [TRUE_IDENTITY], card: BEARS, pool: { G: 4 }, library: [CRAW_WURM, BEARS] });
    const once = settle(flip(s));
    // A second manifest turned up the same turn: no second trigger (the printed limiter, latched at the flush).
    const again = flip(manifestCard(once, "user", once.players.user.library[0]));
    expect({ hand: once.players.user.hand.length, second: again.stack.length, latched: again.log.filter((e) => e.kind === "trigger-once-per-turn-latched").map((e) => e.source) })
      .toEqual({ hand: 1, second: 0, latched: ["True Identity"] });
  });

  it("Mastery of the Unseen: 1 life for each creature its controller controls", () => {
    const { s } = board({ watchers: [MASTERY_OF_THE_UNSEEN, BEARS] });
    expect(settle(flip(s)).players.user.life - 40).toBe(2); // Grizzly Bears and the Craw Wurm just turned up
  });

  it("Fatal Mutation: the enchanted creature turned face up is destroyed", () => {
    const { s, fdId } = board({});
    const aura = { ...createPermanent({ id: "aura", card: { ...FATAL_MUTATION, id: "fm" }, controller: "ai", summoningSick: false }), attachedTo: fdId };
    const enchanted = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [aura] },
      user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === fdId ? { ...p, attachments: ["aura"] } : p)) } } };
    const done = settle(flip(enchanted));
    expect({ battlefield: done.players.user.battlefield.map((p) => p.card.name), graveyard: done.players.user.graveyard.map((c) => c.name) })
      .toEqual({ battlefield: [], graveyard: ["Craw Wurm"] });
  });

  it("Projektor Inspector: a Detective turned face up (itself) — may draw, then discard", () => {
    const { s } = board({ card: PROJEKTOR_INSPECTOR, pool: { U: 1, C: 2 }, library: [BEARS] });
    const done = settle(flip(s));
    expect({ hand: done.players.user.hand.length, graveyard: done.players.user.graveyard.map((c) => c.name) }).toEqual({ hand: 0, graveyard: ["Grizzly Bears"] });
  });

  it("Perimeter Enforcer: +1/+1 until end of turn when a Detective is turned face up; Case of the Pilfered Proof's counter rides the same flip", () => {
    const { s, fdId } = board({ watchers: [PERIMETER_ENFORCER, CASE_OF_THE_PILFERED_PROOF], card: PROJEKTOR_INSPECTOR, pool: { U: 1, C: 2 }, library: [BEARS] });
    const done = settle(flip(s));
    expect({ enforcer: size(done, "w0"), counter: plus(done, fdId) }).toEqual({ enforcer: [2, 2], counter: 1 });
  });
});

describe("\"if it's a creature\" (CR 603.4)", () => {
  it("Trail of Mystery (body-only for its other line) still plays its flip half: the flipped creature gets +2/+2", () => {
    const { s, fdId } = board({ watchers: [TRAIL_OF_MYSTERY] });
    expect(size(settle(flip(s)), fdId)).toEqual([8, 6]);
  });

  it("a flip whose new toughness kills the creature still triggers — the flip-time record answers the condition (Salt Road Ambushers)", () => {
    // A manifest carrying 2 damage turned into Grizzly Bears (2/2) dies in the state-based check before the trigger is put on
    // the stack. The condition was true at the flip (CR 603.4), so the ability goes on the stack as the modeled program — its
    // counters then find nothing to land on — rather than as an unreadable condition handed to the Arbiter.
    const { s } = board({ watchers: [SALT_ROAD_AMBUSHERS], card: BEARS, pool: { G: 2 }, fd: { damageMarked: 2 } });
    const up = flip(s);
    expect({ stack: up.stack.map((o) => [o.source?.name, o.payload?.resolver]), dead: up.players.user.graveyard.map((c) => c.name) })
      .toEqual({ stack: [["Salt Road Ambushers", "effect-program"]], dead: ["Grizzly Bears"] });
  });

  it("the condition reads the triggering permanent: live and layer-aware, then its last known information once it is gone", () => {
    const { s, fdId } = board({ watchers: [TRUE_IDENTITY] }); // w0 — an enchantment, a permanent that is no creature
    const user = (ctx) => evaluateInterveningIf(s, "it's a creature", "user", ctx);
    expect([user({ triggeringPermanentId: fdId }), user({ triggeringPermanentId: "w0" }),
      user({ triggeringPermanentId: "gone", triggeringWasCreature: true }), user({ triggeringPermanentId: "gone" }), user({})])
      .toEqual([true, false, true, null, null]);
    expect([interveningIfParseable("it's a creature"), interveningIfParseable("it's a creature card")]).toEqual([true, false]);
  });
});

describe("the withholding (P·19's own-flip rule), and what it leaves alone", () => {
  it("⛔ a card whose own text carries the compound \"enters or is turned face up\" is never turned up — its flip half would not fire", () => {
    const offered = (card, pool) => turnUps(board({ card, pool }).s).length;
    expect([offered(GADGET_TECHNICIAN, { U: 2, R: 2 }), offered(CONCERT_KABOOMIST, { R: 3 }), offered(FLAVOR_DISASTER, { G: 5 }), offered(CROWD_CONTROL_WARDEN, { G: 3, W: 2 })])
      .toEqual([0, 0, 0, 0]);
    expect([GADGET_TECHNICIAN, CONCERT_KABOOMIST, FLAVOR_DISASTER, CROWD_CONTROL_WARDEN].map(hasSelfTurnedFaceUpTrigger)).toEqual([true, true, true, true]);
  });

  it("…while a WATCHER that includes its own flip is offered, and fires (Pine Walker, Experiment Twelve, Pyrotechnic Performer)", () => {
    expect([PINE_WALKER, EXPERIMENT_TWELVE, PYROTECHNIC_PERFORMER].map(hasSelfTurnedFaceUpTrigger)).toEqual([false, false, false]);
    expect([turnUps(board({ card: PINE_WALKER, pool: { G: 5 } }).s).length, turnUps(board({ card: PYROTECHNIC_PERFORMER, pool: { R: 2 } }).s).length]).toEqual([1, 1]);
  });

  it("⛔ the compound self form keeps its ETB (Gadget Technician is still native for its enters half)", () => {
    expect([classifyCard(GADGET_TECHNICIAN), detectTriggers(GADGET_TECHNICIAN).map((d) => d.event)]).toEqual(["native-trigger", ["etb"]]);
  });

  it("WITNESS — the regained cards through the real turn-up path", () => {
    const farseer = settle(flip(board({ watchers: [AVEN_FARSEER] }).s));
    const twelve = board({ watchers: [EXPERIMENT_TWELVE] });
    const raptor = settle(flip(board({ graveyard: [DEATHMIST_RAPTOR] }).s));
    const pyro = settle(flip(board({ watchers: [PYROTECHNIC_PERFORMER] }).s));
    const witness = { farseer: plus(farseer, "w0"), twelve: size(settle(flip(twelve.s)), twelve.fdId), raptor: raptor.players.user.battlefield.map((p) => p.card.name), pyrotechnic: 40 - pyro.players.ai.life };
    console.log(`WITNESS turnedFaceUpWatchers ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ farseer: 1, twelve: [12, 10], raptor: ["Craw Wurm", "Deathmist Raptor"], pyrotechnic: 6 });
  });
});
