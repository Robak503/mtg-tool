/**
 * A PERMANENT THAT WASN'T CAST STILL ENTERS AS ITS REPLACEMENT EFFECTS SAY (CR 614.1c, 614.1d, 614.12).
 *
 * The bug: zones.enterCardFromZone — the path every non-cast entry takes (reanimation, put-from-hand, put-from-library, blink
 * returns, Living Death, Rise of the Dark Realms) — applied only the imposition (Kismet) and the planeswalker loyalty, while the
 * cast entry (resolvers.enterPermanent) applied every entry replacement. Probed before the fix: a reanimated Diregraf Ghoul
 * ("This creature enters tapped.") entered UNTAPPED — free to block, attack or tap for a cost; a reanimated Spike Feeder ("This
 * creature enters with two +1/+1 counters on it.") entered with none and died to the next state-based check.
 *
 * The fix: the entry replacements live in ONE leaf, enterReplacements.applyEnterReplacements (+ settleEnterReplacements for what
 * lands once the permanent is on the battlefield), and both entry paths call it. Only the cast facts differ: a permanent that
 * wasn't cast has X = 0 (CR 107.3g, 107.3m), so "enters with X +1/+1 counters" adds nothing (Walking Ballista, Hangarback
 * Walker). The counters are on the permanent BEFORE its enters triggers are checked.
 *
 * One event, several permanents (CR 603.6a; CR 614.12): every newcomer reads its entry replacements against the board as the
 * event began — a replacement applies only if its effect already exists — so a creature entering at the same time as Renata,
 * Called to the Hunt gets no counter from her (Renata's bundled ruling). Pinned on every one-event path the fix routes: Rise of
 * the Dark Realms (zones.enterCardsTogether), Living Death, Replenish (the mass return), Genesis Wave, and the multi-pick put
 * (Ghalta, Stampede Tyrant — runProgram.resolveTutorChoice's chain).
 *
 * Real oracle fixtures (bundled Scryfall, generated 2026-10-01 by the fixture template); every cast and activation runs for
 * real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice, resolveOptionalChoice, advanceTemptingOffer } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { applyUrDragonAttackTriggers } from "./urDragonAttack.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall via cardIndex.publicCard; the trailing comment is the generator's tier read) ──
const GHOUL = {"name":"Diregraf Ghoul","type":"Creature — Zombie","mana":"{B}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"This creature enters tapped."}; // native-body
const FEEDER = {"name":"Spike Feeder","type":"Creature — Spike","mana":"{1}{G}{G}","cmc":3,"power":"0","toughness":"0","keywords":[],"colors":["G"],"oracle":"This creature enters with two +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature.\nRemove a +1/+1 counter from this creature: You gain 2 life."}; // native-activated
const WEAVER = {"name":"Spike Weaver","type":"Creature — Spike","mana":"{2}{G}{G}","cmc":4,"power":"0","toughness":"0","keywords":[],"colors":["G"],"oracle":"This creature enters with three +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature.\n{1}, Remove a +1/+1 counter from this creature: Prevent all combat damage that would be dealt this turn."}; // native-activated
const BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target."}; // native-activated
const HANGARBACK = {"name":"Hangarback Walker","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature."}; // body-only
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const RENATA = {"name":"Renata, Called to the Hunt","type":"Legendary Enchantment Creature — Demigod","mana":"{2}{G}{G}","cmc":4,"power":"*","toughness":"3","keywords":[],"colors":["G"],"oracle":"Renata's power is equal to your devotion to green. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nEach other creature you control enters with an additional +1/+1 counter on it."}; // body-only
const EIDOLON = {"name":"Eidolon of Blossoms","type":"Enchantment Creature — Spirit","mana":"{2}{G}{G}","cmc":4,"power":"2","toughness":"2","keywords":["Constellation"],"colors":["G"],"oracle":"Constellation — Whenever this creature or another enchantment you control enters, draw a card."}; // native-trigger
const PACKLEADER = {"name":"Garruk's Packleader","type":"Creature — Beast","mana":"{4}{G}","cmc":5,"power":"4","toughness":"4","keywords":[],"colors":["G"],"oracle":"Whenever another creature you control with power 3 or greater enters, you may draw a card."}; // native-trigger
const BLASTODERM = {"name":"Blastoderm","type":"Creature — Beast","mana":"{2}{G}{G}","cmc":4,"power":"5","toughness":"5","keywords":["Shroud","Fading"],"colors":["G"],"oracle":"Shroud (This creature can't be the target of spells or abilities.)\nFading 3 (This creature enters with three fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)"}; // native-body
const HISTORY = {"name":"History of Benalia","type":"Enchantment — Saga","mana":"{1}{W}{W}","cmc":3,"keywords":[],"layout":"saga","colors":["W"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn."}; // native-trigger
const TEMPLE = {"name":"Temple of Malady","type":"Land","mana":"","cmc":0,"keywords":["Scry"],"colors":[],"oracle":"This land enters tapped.\nWhen this land enters, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{T}: Add {B} or {G}."}; // land
const WOODLAND = {"name":"Woodland Cemetery","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"This land enters tapped unless you control a Swamp or a Forest.\n{T}: Add {B} or {G}."}; // land
const OVERGROWN = {"name":"Overgrown Tomb","type":"Land — Swamp Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B} or {G}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const REANIMATE = {"name":"Reanimate","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value."}; // native-spell
const ZOMBIFY = {"name":"Zombify","type":"Sorcery","mana":"{3}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"Return target creature card from your graveyard to the battlefield."}; // native-spell
const ANIMATE_DEAD = {"name":"Animate Dead","type":"Enchantment — Aura","mana":"{1}{B}","cmc":2,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0."}; // native-aura
const LIVING_DEATH = {"name":"Living Death","type":"Sorcery","mana":"{3}{B}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield."}; // native-spell
const RISE = {"name":"Rise of the Dark Realms","type":"Sorcery","mana":"{7}{B}{B}","cmc":9,"keywords":[],"colors":["B"],"oracle":"Put all creature cards from all graveyards onto the battlefield under your control."}; // native-spell
const REPLENISH = {"name":"Replenish","type":"Sorcery","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Return all enchantment cards from your graveyard to the battlefield. (Auras with nothing to enchant remain in your graveyard.)"}; // native-spell
const GENESIS_WAVE = {"name":"Genesis Wave","type":"Sorcery","mana":"{X}{G}{G}{G}","cmc":3,"keywords":[],"colors":["G"],"oracle":"Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard."}; // native-spell
const GHALTA = {"name":"Ghalta, Stampede Tyrant","type":"Legendary Creature — Elder Dinosaur","mana":"{5}{G}{G}{G}","cmc":8,"power":"12","toughness":"12","keywords":["Trample"],"colors":["G"],"oracle":"Trample\nWhen Ghalta enters, put any number of creature cards from your hand onto the battlefield."}; // native-trigger
const CLOUDSHIFT = {"name":"Cloudshift","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature you control, then return that card to the battlefield under your control."}; // native-spell
const PIPER = {"name":"Elvish Piper","type":"Creature — Elf Shaman","mana":"{3}{G}","cmc":4,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{G}, {T}: You may put a creature card from your hand onto the battlefield."}; // native-activated
const GSZ = {"name":"Green Sun's Zenith","type":"Sorcery","mana":"{X}{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle. Shuffle Green Sun's Zenith into its owner's library."}; // native-spell
const CROP_ROTATION = {"name":"Crop Rotation","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"As an additional cost to cast this spell, sacrifice a land.\nSearch your library for a land card, put that card onto the battlefield, then shuffle."}; // native-spell
const NATURES_LORE = {"name":"Nature's Lore","type":"Sorcery","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Search your library for a Forest card, put that card onto the battlefield, then shuffle."}; // native-spell
const FARSEEK = {"name":"Farseek","type":"Sorcery","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle."}; // native-spell
const RHYTHM = {"name":"Rhythm of the Wild","type":"Enchantment","mana":"{1}{R}{G}","cmc":3,"keywords":[],"colors":["G","R"],"oracle":"Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)"}; // native-static
const SHALAI_HALLAR = {"name":"Shalai and Hallar","type":"Legendary Creature — Angel Elf","mana":"{1}{R}{G}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying","Vigilance"],"colors":["G","R","W"],"oracle":"Flying, vigilance\nWhenever one or more +1/+1 counters are put on a creature you control, Shalai and Hallar deals that much damage to target opponent."}; // native-trigger
const UR_DRAGON = {"name":"The Ur-Dragon","type":"Legendary Creature — Dragon Avatar","mana":"{4}{W}{U}{B}{R}{G}","cmc":9,"power":"10","toughness":"10","keywords":["Flying","Eminence"],"colors":["B","G","R","U","W"],"oracle":"Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield."}; // native-mixed
const SHIVAN = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"power":"5","toughness":"5","keywords":["Flying"],"colors":["R"],"oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn."}; // native-activated
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell

const G = (id, card) => ({ ...card, id }); // a card in a graveyard / hand / library
const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
// The user's precombat main phase, priority held, an empty stack; `hand`, `library`, both graveyards and boards as given.
function board({ user = [], ai = [], userGy = [], aiGy = [], hand = [], library = null, pool = {}, life = 40 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life, battlefield: user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool }, library: library ?? [1, 2, 3].map((i) => G(`ul${i}`, FOREST)) },
      ai: { ...s.players.ai, battlefield: ai, graveyard: aiGy, hand: [], library: [1, 2, 3].map((i) => G(`al${i}`, FOREST)) } } };
}
const castActions = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
function cast(s, cardId, { targetId = null, x = null } = {}) {
  const action = castActions(s, cardId).find((a) => (targetId == null || a.targets?.[0]?.id === targetId) && (x == null || a.xValue === x));
  expect(action, `a legal cast of ${cardId}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, action));
}
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const permsNamed = (s, name, pid = "user") => s.players[pid].battlefield.filter((p) => p.card?.name === name);
const permNamed = (s, name, pid = "user") => permsNamed(s, name, pid)[0] || null;
// What a permanent is as it stands on the battlefield: tapped, its counters, its layer-aware power/toughness.
const entered = (s, name, pid = "user") => {
  const p = permNamed(s, name, pid);
  return p ? { tapped: p.tapped, counters: p.counters, pt: `${creaturePower(p, s)}/${creatureToughness(p, s)}` } : null;
};
const gyNames = (s, pid = "user") => s.players[pid].graveyard.map((c) => c.name).sort();
const triggersFrom = (s, sourceName) => (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === sourceName);

describe("⭐ one card put onto the battlefield without being cast enters as its own replacement effects say", () => {
  it("⭐ Reanimate: Diregraf Ghoul enters TAPPED; Spike Feeder enters with its two +1/+1 counters and survives the state-based check", () => {
    const ghoul = cast(board({ userGy: [G("g-ghoul", GHOUL)], hand: [G("rean", REANIMATE)], pool: { B: 1 } }), "rean", { targetId: "g-ghoul" });
    const feeder = cast(board({ userGy: [G("g-feeder", FEEDER)], hand: [G("rean", REANIMATE)], pool: { B: 1 } }), "rean", { targetId: "g-feeder" });
    // ⛔ THE CONTROL: a creature with no entry replacement enters untapped and bare — an engine that tapped or countered
    // everything it reanimated would fail here.
    const bears = cast(board({ userGy: [G("g-bears", BEARS)], hand: [G("zomb", ZOMBIFY)], pool: { B: 1, C: 3 } }), "zomb", { targetId: "g-bears" });
    const row = { ghoul: entered(ghoul, "Diregraf Ghoul"), feeder: entered(feeder, "Spike Feeder"), feederGy: gyNames(feeder), bears: entered(bears, "Grizzly Bears") };
    console.log("  WITNESS nonCastEntryReanimate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      ghoul: { tapped: true, counters: {}, pt: "2/2" },
      feeder: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" },
      feederGy: ["Reanimate"],
      bears: { tapped: false, counters: {}, pt: "2/2" },
    });
  });

  it("the CAST path is unchanged: a cast Diregraf Ghoul enters tapped, a cast Spike Feeder with two counters, a cast Walking Ballista with X counters", () => {
    const ghoul = cast(board({ hand: [G("h-ghoul", GHOUL)], pool: { B: 1 } }), "h-ghoul");
    const feeder = cast(board({ hand: [G("h-feeder", FEEDER)], pool: { G: 2, C: 1 } }), "h-feeder");
    const ballista = cast(board({ hand: [G("h-ballista", BALLISTA)], pool: { C: 4 } }), "h-ballista", { x: 2 });
    expect({ ghoul: entered(ghoul, "Diregraf Ghoul"), feeder: entered(feeder, "Spike Feeder"), ballista: entered(ballista, "Walking Ballista") }).toEqual({
      ghoul: { tapped: true, counters: {}, pt: "2/2" },
      feeder: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" },
      ballista: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" },
    });
  });

  it("⭐ X = 0 off the stack (CR 107.3g, 107.3m): a reanimated Walking Ballista or Hangarback Walker enters with no counters and dies; Hangarback makes no Thopter", () => {
    const ballista = cast(board({ userGy: [G("g-ballista", BALLISTA)], hand: [G("rean", REANIMATE)], pool: { B: 1 } }), "rean", { targetId: "g-ballista" });
    const hangarback = resolveAll(cast(board({ userGy: [G("g-hangar", HANGARBACK)], hand: [G("rean", REANIMATE)], pool: { B: 1 } }), "rean", { targetId: "g-hangar" }));
    const row = {
      ballista: { battlefield: permsNamed(ballista, "Walking Ballista").length, graveyard: gyNames(ballista) },
      hangarback: { battlefield: hangarback.players.user.battlefield.map((p) => p.card.name), graveyard: gyNames(hangarback) },
    };
    console.log("  WITNESS nonCastEntryXIsZero", JSON.stringify(row));
    expect(row).toEqual({
      ballista: { battlefield: 0, graveyard: ["Reanimate", "Walking Ballista"] },
      hangarback: { battlefield: [], graveyard: ["Hangarback Walker", "Reanimate"] },
    });
  });

  it("⭐ the counters are on the permanent BEFORE its enters triggers are checked: a Zombified Spike Weaver (3/3) triggers Garruk's Packleader; Grizzly Bears (2/2) does not", () => {
    const weaver = cast(board({ user: [P("pack", "user", PACKLEADER)], userGy: [G("g-weaver", WEAVER)], hand: [G("zomb", ZOMBIFY)], pool: { B: 1, C: 3 } }), "zomb", { targetId: "g-weaver" });
    const bears = cast(board({ user: [P("pack", "user", PACKLEADER)], userGy: [G("g-bears", BEARS)], hand: [G("zomb", ZOMBIFY)], pool: { B: 1, C: 3 } }), "zomb", { targetId: "g-bears" });
    expect({ weaver: entered(weaver, "Spike Weaver"), packleader: triggersFrom(weaver, "Garruk's Packleader").length, packleaderOnBears: triggersFrom(bears, "Garruk's Packleader").length })
      .toEqual({ weaver: { tapped: false, counters: { "+1/+1": 3 }, pt: "3/3" }, packleader: 1, packleaderOnBears: 0 });
  });

  it("every non-cast entry point: Animate Dead, Cloudshift (a new object, CR 400.7), Elvish Piper from the hand, Green Sun's Zenith from the library", () => {
    const animated = resolveAll(cast(board({ userGy: [G("g-feeder", FEEDER)], hand: [G("ad", ANIMATE_DEAD)], pool: { B: 1, C: 1 } }), "ad", { targetId: "g-feeder" }));
    let blink = cast(board({ hand: [G("h-feeder", FEEDER), G("cs", CLOUDSHIFT)], pool: { G: 2, C: 1 } }), "h-feeder");
    blink = { ...blink, players: { ...blink.players, user: { ...blink.players.user, manaPool: { ...blink.players.user.manaPool, W: 1 } } } };
    const castFeederId = permNamed(blink, "Spike Feeder").id;
    blink = cast(blink, "cs", { targetId: castFeederId });
    let piper = board({ user: [P("piper", "user", PIPER)], hand: [G("h-ghoul", GHOUL)], pool: { G: 1 } });
    piper = dispatchAction(piper, legalActionsForPlayer(piper, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "piper"));
    piper = resolveTopOfStack(piper);
    if (piper.pendingChoice?.kind === "optional-effect") piper = resolveOptionalChoice(piper, true);
    piper = resolveTutorChoice(piper, "h-ghoul");
    let gsz = cast(board({ hand: [G("gsz", GSZ)], library: [G("l-feeder", FEEDER), G("l-forest", FOREST)], pool: { G: 1, C: 3 } }), "gsz", { x: 3 });
    gsz = resolveTutorChoice(gsz, "l-feeder");
    const row = {
      animateDead: entered(animated, "Spike Feeder"),
      cloudshift: { feeder: entered(blink, "Spike Feeder"), newObject: permNamed(blink, "Spike Feeder")?.id !== castFeederId },
      piper: entered(piper, "Diregraf Ghoul"),
      greenSunsZenith: entered(gsz, "Spike Feeder"),
    };
    console.log("  WITNESS nonCastEntryPoints", JSON.stringify(row));
    expect(row).toEqual({
      animateDead: { tapped: false, counters: { "+1/+1": 2 }, pt: "1/2" }, // Animate Dead's own -1/-0
      cloudshift: { feeder: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" }, newObject: true },
      piper: { tapped: true, counters: {}, pt: "2/2" },
      greenSunsZenith: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" },
    });
  });

  it("the keyword and land replacements ride the same reader: Fading's fade counters, a Temple, a check land, a shock land", () => {
    const blastoderm = cast(board({ userGy: [G("g-blast", BLASTODERM)], hand: [G("rean", REANIMATE)], pool: { B: 1 } }), "rean", { targetId: "g-blast" });
    const rotate = (library, user) => {
      const s = cast(board({ user, hand: [G("crop", CROP_ROTATION)], library, pool: { G: 1 } }), "crop");
      return resolveTutorChoice(s, library[0].id);
    };
    const temple = rotate([G("l-temple", TEMPLE)], [P("f1", "user", FOREST), P("f2", "user", FOREST)]);
    const checkWithForest = rotate([G("l-wood", WOODLAND)], [P("f1", "user", FOREST), P("f2", "user", FOREST)]);
    const checkWithout = rotate([G("l-wood", WOODLAND)], [P("t1", "user", TEMPLE)]); // the only land is sacrificed: no Swamp, no Forest
    const lore = resolveTutorChoice(cast(board({ hand: [G("lore", NATURES_LORE)], library: [G("l-tomb", OVERGROWN)], pool: { G: 1, C: 1 } }), "lore"), "l-tomb");
    const row = {
      blastoderm: permNamed(blastoderm, "Blastoderm")?.counters,
      temple: permNamed(temple, "Temple of Malady")?.tapped,
      checkLandWithForest: permNamed(checkWithForest, "Woodland Cemetery")?.tapped,
      checkLandWithout: permNamed(checkWithout, "Woodland Cemetery")?.tapped,
      shockLand: { tapped: permNamed(lore, "Overgrown Tomb")?.tapped, life: lore.players.user.life },
    };
    console.log("  WITNESS nonCastEntryLands", JSON.stringify(row));
    expect(row).toEqual({
      blastoderm: { fade: 3 },
      temple: true,
      checkLandWithForest: false, // one Forest is sacrificed to Crop Rotation, the other stays: untapped
      checkLandWithout: true,
      shockLand: { tapped: false, life: 38 }, // the written policy pays 2 life at life ≥ 10 (landEntersTapped.autoPickOptionalLifePayment)
    });
  });

  it("⛔ an entry the EFFECT already taps pays nothing for the shock land: Farseek's Overgrown Tomb enters tapped and the life total is untouched", () => {
    const farseek = (pick) => resolveTutorChoice(cast(board({ hand: [G("farseek", FARSEEK)], library: [G("l-tomb", OVERGROWN), G("l-swamp", SWAMP)], pool: { G: 1, C: 1 } }), "farseek"), pick);
    const tomb = farseek("l-tomb");
    const swamp = farseek("l-swamp"); // the effect's own "tapped" still taps a land with no entry replacement of its own
    expect({ tomb: { tapped: permNamed(tomb, "Overgrown Tomb")?.tapped, life: tomb.players.user.life }, swamp: permNamed(swamp, "Swamp")?.tapped })
      .toEqual({ tomb: { tapped: true, life: 40 }, swamp: true });
  });

  it("a Saga returned without being cast enters with its lore counter and its chapter I triggers (CR 714.3a, 714.2b): Replenish → History of Benalia", () => {
    const s = cast(board({ userGy: [G("g-history", HISTORY)], hand: [G("rep", REPLENISH)], pool: { W: 1, C: 3 } }), "rep");
    const history = permNamed(s, "History of Benalia");
    const after = resolveAll(s);
    expect({ lore: history?.counters, sagaFinal: history?.sagaFinal, chapterOnStack: triggersFrom(s, "History of Benalia").length, knights: permsNamed(after, "Knight").length })
      .toEqual({ lore: { lore: 1 }, sagaFinal: 3, chapterOnStack: 1, knights: 1 });
  });

  it("the cast Saga is unchanged: a cast History of Benalia enters with one lore counter and chapter I triggers", () => {
    const s = cast(board({ hand: [G("h-history", HISTORY)], pool: { W: 2, C: 1 } }), "h-history");
    expect({ lore: permNamed(s, "History of Benalia")?.counters, chapterOnStack: triggersFrom(s, "History of Benalia").length }).toEqual({ lore: { lore: 1 }, chapterOnStack: 1 });
  });
});

describe("⭐ one event, several permanents: each reads its entry replacements against the board as the event began (CR 614.12)", () => {
  it("⭐ Rise of the Dark Realms (one event, CR 603.6a) gets the same treatment: Ghoul tapped, Feeder with its counters, Ballista with none", () => {
    const s = cast(board({ userGy: [G("g-ghoul", GHOUL), G("g-feeder", FEEDER)], aiGy: [G("g-ballista", BALLISTA)], hand: [G("rise", RISE)], pool: { B: 2, C: 7 } }), "rise");
    const row = { ghoul: entered(s, "Diregraf Ghoul"), feeder: entered(s, "Spike Feeder"), ballista: permsNamed(s, "Walking Ballista").length, theirGraveyard: gyNames(s, "ai") };
    console.log("  WITNESS nonCastEntryRise", JSON.stringify(row));
    expect(row).toEqual({
      ghoul: { tapped: true, counters: {}, pt: "2/2" },
      feeder: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" },
      ballista: 0,
      theirGraveyard: ["Walking Ballista"], // the opponent's card died into its owner's graveyard
    });
  });

  it("Rise's counters are placed before ANY enters trigger is checked: Garruk's Packleader sees the 3/3 Spike Weaver", () => {
    const s = cast(board({ user: [P("pack", "user", PACKLEADER)], userGy: [G("g-weaver", WEAVER)], hand: [G("rise", RISE)], pool: { B: 2, C: 7 } }), "rise");
    expect({ weaver: entered(s, "Spike Weaver"), packleader: triggersFrom(s, "Garruk's Packleader").length }).toEqual({ weaver: { tapped: false, counters: { "+1/+1": 3 }, pt: "3/3" }, packleader: 1 });
  });

  it("⭐ Renata's ruling — a creature entering at the same time as Renata gets no counter; with Renata already on the battlefield it gets one", () => {
    // Renata is first in the graveyard, so a card-by-card read would see her on the battlefield when the Bears arrive.
    const together = cast(board({ userGy: [G("g-renata", RENATA), G("g-bears", BEARS)], hand: [G("rise", RISE)], pool: { B: 2, C: 7 } }), "rise");
    const already = cast(board({ user: [P("renata", "user", RENATA)], userGy: [G("g-bears", BEARS)], hand: [G("rise", RISE)], pool: { B: 2, C: 7 } }), "rise");
    const row = { together: entered(together, "Grizzly Bears")?.counters, renataOnBattlefield: entered(already, "Grizzly Bears")?.counters };
    console.log("  WITNESS nonCastEntryRenataRuling", JSON.stringify(row));
    expect(row).toEqual({ together: {}, renataOnBattlefield: { "+1/+1": 1 } });
  });

  it("Living Death returns every player's cards in one event: the Bears returning with Renata get no counter", () => {
    const s = cast(board({ userGy: [G("g-renata", RENATA), G("g-bears", BEARS)], hand: [G("ld", LIVING_DEATH)], pool: { B: 2, C: 3 } }), "ld");
    expect({ renata: !!permNamed(s, "Renata, Called to the Hunt"), bears: entered(s, "Grizzly Bears")?.counters }).toEqual({ renata: true, bears: {} });
  });

  it("Replenish (the mass return) returns its enchantments in one event: Eidolon of Blossoms returning with Renata gets no counter", () => {
    const s = cast(board({ userGy: [G("g-renata", RENATA), G("g-eidolon", EIDOLON)], hand: [G("rep", REPLENISH)], pool: { W: 1, C: 3 } }), "rep");
    expect({ renata: !!permNamed(s, "Renata, Called to the Hunt"), eidolon: entered(s, "Eidolon of Blossoms")?.counters }).toEqual({ renata: true, eidolon: {} });
  });

  it("Genesis Wave puts its permanents in one event: the Bears put with Renata get no counter", () => {
    const s = cast(board({ hand: [G("gw", GENESIS_WAVE)], library: [G("l-renata", RENATA), G("l-bears", BEARS), G("l-forest", FOREST), G("l-swamp", SWAMP)], pool: { G: 3, C: 4 } }), "gw", { x: 4 });
    expect({ renata: !!permNamed(s, "Renata, Called to the Hunt"), bears: entered(s, "Grizzly Bears")?.counters }).toEqual({ renata: true, bears: {} });
  });

  it("⭐ a multi-pick put is one event too: Ghalta puts Renata, then the Bears — the Bears get no counter (the chained pick reads the board without Renata)", () => {
    let s = cast(board({ hand: [G("ghalta", GHALTA), G("h-renata", RENATA), G("h-bears", BEARS)], pool: { G: 3, C: 5 } }), "ghalta");
    s = resolveTopOfStack(s); // Ghalta's enters trigger
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, "h-renata");
    s = resolveTutorChoice(s, "h-bears");
    if (s.pendingChoice?.kind === "tutor-search") s = resolveTutorChoice(s, null);
    const row = { renata: !!permNamed(s, "Renata, Called to the Hunt"), bears: entered(s, "Grizzly Bears")?.counters };
    console.log("  WITNESS nonCastEntryMultiPick", JSON.stringify(row));
    expect(row).toEqual({ renata: true, bears: {} });
  });
});

describe("granted riot reaches a reanimated creature too (CR 702.136a, an as-enters replacement)", () => {
  it("Rhythm of the Wild's grant: a creature reanimated in your precombat main phase gains haste (the house riot pick)", () => {
    const s = cast(board({ user: [P("rhythm", "user", RHYTHM)], userGy: [G("g-bears", BEARS)], hand: [G("zomb", ZOMBIFY)], pool: { B: 1, C: 3 } }), "zomb", { targetId: "g-bears" });
    const bears = permNamed(s, "Grizzly Bears");
    expect({ counters: bears?.counters, haste: permanentHasKeyword(s, bears?.id, "Haste") }).toEqual({ counters: {}, haste: true });
  });
});

describe("CR 122.6 — the counters a permanent enters with are counters put on it, however it enters", () => {
  it("Shalai and Hallar sees the two counters a Zombified Spike Feeder enters with — and a cast one's, as before", () => {
    const zomb = cast(board({ user: [P("shalai", "user", SHALAI_HALLAR)], userGy: [G("g-feeder", FEEDER)], hand: [G("zomb", ZOMBIFY)], pool: { B: 1, C: 3 } }), "zomb", { targetId: "g-feeder" });
    const castOne = cast(board({ user: [P("shalai", "user", SHALAI_HALLAR)], hand: [G("h-feeder", FEEDER)], pool: { G: 2, C: 1 } }), "h-feeder");
    const row = {
      reanimated: { triggers: triggersFrom(zomb, "Shalai and Hallar").length, opponentLife: resolveAll(zomb).players.ai.life },
      cast: { triggers: triggersFrom(castOne, "Shalai and Hallar").length, opponentLife: resolveAll(castOne).players.ai.life },
    };
    console.log("  WITNESS nonCastEntryCountersPut", JSON.stringify(row));
    expect(row).toEqual({ reanimated: { triggers: 1, opponentLife: 38 }, cast: { triggers: 1, opponentLife: 38 } });
  });
});

describe("a tempting offer's bonus searches are the effect happening AGAIN (Tempt with Discovery's ruling) — separate events", () => {
  it("two acceptors: the second bonus land, Woodland Cemetery, sees the Forest the first bonus search put onto the battlefield", () => {
    // Driven at the point a pod reaches it (temptWithDiscovery.test.js does the same): the last opponent has answered and two
    // of them searched, so the offerer searches twice more. The only land already in play is a Temple (no Swamp, no Forest).
    const s = board({ user: [P("t1", "user", TEMPLE)], library: [G("l-forest", FOREST), G("l-wood", WOODLAND), G("l-swamp", SWAMP)] });
    let p = advanceTemptingOffer(s, { temptingOffer: { stage: "opponent-search", offerer: "user", opponents: [], accepted: 2 }, resume: null, sourceName: "Tempt with Discovery" });
    expect(p.pendingChoice).toMatchObject({ kind: "tutor-search", remaining: 2, temptingOffer: { stage: "bonus" } });
    p = resolveTutorChoice(p, "l-forest");
    p = resolveTutorChoice(p, "l-wood");
    expect({ forest: permNamed(p, "Forest")?.tapped, woodland: permNamed(p, "Woodland Cemetery")?.tapped }).toEqual({ forest: false, woodland: false });
  });
});

describe("The Ur-Dragon's attack trigger puts its permanent through the same non-cast entry", () => {
  it("a Spike Feeder put from the hand enters with its two +1/+1 counters and survives the state-based check", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, turn: 6, activePlayer: "user", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: "shivan", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s0.players,
        user: { ...s0.players.user, life: 40, battlefield: [P("ur", "user", UR_DRAGON), P("shivan", "user", SHIVAN)], library: [G("l-bolt", BOLT)], hand: [G("h-feeder", FEEDER)] },
        ai: { ...s0.players.ai, life: 40 } } };
    const after = applyUrDragonAttackTriggers(s);
    expect({ feeder: entered(after, "Spike Feeder"), graveyard: gyNames(after), hand: after.players.user.hand.map((c) => c.name) })
      .toEqual({ feeder: { tapped: false, counters: { "+1/+1": 2 }, pt: "2/2" }, graveyard: [], hand: ["Lightning Bolt"] });
  });
});
