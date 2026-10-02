/**
 * RISE OF THE DARK REALMS — the play-weighted program, EDHREC #492; LILIANA VESS's −8 prints the same sentence.
 *   "Put all creature cards from all graveyards onto the battlefield under your control."
 *
 * One non-targeted atom, mass-reanimate-all-graveyards (effects/atoms/zones.js): every player's graveyard is read at
 * resolution and every creature card in it (by its front face, CR 712.8a) enters under the caster's control (CR 110.2a) as
 * ONE event (CR 603.6a — enterCardsTogether places all of them before any enters trigger is checked, so a newcomer's watcher
 * sees the others). The owner is kept (CR 110.2): a stolen card that later dies goes to its owner's graveyard (CR 400.3).
 * A newcomer whose own card left a graveyard in that event sees none of the departures (CR 603.10a — the look-back in
 * triggers.checkGraveyardEventTriggers), while a watcher already on the battlefield sees every one of them.
 *
 * Real oracle fixtures (bundled Scryfall, generated 2026-10-01 by the fixture template); every cast and activation runs for
 * real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseLoyaltyAbilities } from "./effects/loyaltyAbilities.js";
import { resolveDiscardChoice, resolveTutorChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall via cardIndex.publicCard; the trailing comment is the generator's tier read) ──
const RISE = {"name":"Rise of the Dark Realms","type":"Sorcery","mana":"{7}{B}{B}","cmc":9,"keywords":[],"colors":["B"],"oracle":"Put all creature cards from all graveyards onto the battlefield under your control."}; // native-spell
const LILIANA = {"name":"Liliana Vess","type":"Legendary Planeswalker — Liliana","mana":"{3}{B}{B}","cmc":5,"loyalty":"5","keywords":[],"colors":["B"],"oracle":"+1: Target player discards a card.\n−2: Search your library for a card, then shuffle and put that card on top.\n−8: Put all creature cards from all graveyards onto the battlefield under your control."}; // native-planeswalker
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SOUL_WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"Whenever another creature enters, you gain 1 life."}; // native-trigger
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, draw a card."}; // native-trigger
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const COPTER = {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","cmc":2,"power":"3","toughness":"3","keywords":["Flying","Crew"],"colors":[],"oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // native-trigger
const ABBEY = {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","cmc":0,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"layout":"transform","colors":[],"oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste"}; // land-partial
const DELVER = {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Transform"],"layout":"transform","colors":[],"oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying"}; // body-only
const TORMOD = {"name":"Tormod, the Desecrator","type":"Legendary Creature — Zombie Wizard","mana":"{3}{B}","cmc":4,"power":"4","toughness":"2","keywords":["Partner"],"colors":["B"],"oracle":"Whenever one or more cards leave your graveyard, create a tapped 2/2 black Zombie creature token.\nPartner (You can have two commanders if both have partner.)"}; // native-trigger
const KONRAD = {"name":"Syr Konrad, the Grim","type":"Legendary Creature — Human Knight","mana":"{3}{B}{B}","cmc":5,"power":"5","toughness":"4","keywords":["Mill"],"colors":["B"],"oracle":"Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent.\n{1}{B}: Each player mills a card. (They each put the top card of their library into their graveyard.)"}; // native-mixed
const RAISE_ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 white Soldier creature tokens."}; // native-spell
const GRIMOIRE = {"name":"Grimoire of the Dead","type":"Legendary Artifact — Book","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"{1}, {T}, Discard a card: Put a study counter on Grimoire of the Dead.\n{T}, Remove three study counters from Grimoire of the Dead and sacrifice it: Put all creature cards from all graveyards onto the battlefield under your control. They're black Zombies in addition to their other colors and types."}; // body-only
const SKULL_FRACTURE = {"name":"Skull Fracture","type":"Sorcery","mana":"{B}","cmc":1,"keywords":["Flashback"],"colors":["B"],"oracle":"Target player discards a card.\nFlashback {3}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // native-spell
const VAMPIRIC = {"name":"Vampiric Tutor","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Search your library for a card, then shuffle and put that card on top. You lose 2 life."}; // native-spell

const RISE_POOL = { B: 2, C: 7 };
const G = (id, card) => ({ ...card, id }); // a card in a graveyard / hand / library
const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
// The user's precombat main phase, priority held, an empty stack; Rise of the Dark Realms in hand (plus `hand`).
function board({ user = [], ai = [], userGy = [], aiGy = [], hand = [], pool = RISE_POOL } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, graveyard: userGy, hand: [G("rise", RISE), ...hand], manaPool: { ...s.players.user.manaPool, ...pool }, library: [1, 2, 3].map((i) => G(`ul${i}`, FOREST)) },
      ai: { ...s.players.ai, battlefield: ai, graveyard: aiGy, hand: [], library: [1, 2, 3].map((i) => G(`al${i}`, FOREST)) } } };
}
const withPool = (s, pool) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, ...pool } } } });
const castAction = (s, cardId, targetId = null) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || a.targets?.[0]?.id === targetId));
const cast = (s, cardId, targetId = null) => resolveTopOfStack(dispatchAction(s, castAction(s, cardId, targetId)));
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const names = (zone) => (zone || []).map((x) => x.card?.name ?? x.name).sort();
const triggersFrom = (s, sourceName) => (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === sourceName);
const permNamed = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name);

describe("parse + classify", () => {
  it("⭐ Rise of the Dark Realms classifies native-spell; its sentence is one non-targeted atom", () => {
    expect(classifyCard(RISE)).toBe("native-spell");
    const program = parseEffectClause(RISE.oracle, "Sorcery");
    expect({ confidence: program.confidence, atoms: program.atoms, tail: program.unparsedTail })
      .toEqual({ confidence: "high", atoms: [{ op: "mass-reanimate-all-graveyards", cardFilter: "creature", targetType: null }], tail: null });
  });

  it("Liliana Vess classifies native-planeswalker: her −8 is the same atom; her +1 and −2 are the atoms Skull Fracture and Vampiric Tutor already resolve", () => {
    expect(classifyCard(LILIANA)).toBe("native-planeswalker");
    const [plus1, minus2, minus8] = parseLoyaltyAbilities(LILIANA);
    expect([plus1.costDelta, minus2.costDelta, minus8.costDelta]).toEqual([1, -2, -8]);
    expect(minus8.program.atoms).toEqual(parseEffectClause(RISE.oracle, "Sorcery").atoms);
    expect(plus1.program.atoms).toEqual(parseEffectClause(SKULL_FRACTURE.oracle.split("\n")[0], "Sorcery").atoms);
    expect(minus2.program.atoms).toEqual([parseEffectClause(VAMPIRIC.oracle, "Instant").atoms[0]]);
  });

  it("CREED near-misses stay off native: Grimoire of the Dead's rider sentence leaves its ability LOW", () => {
    expect(classifyCard(GRIMOIRE)).not.toMatch(/^native-/);
    const effect = GRIMOIRE.oracle.split("\n")[1].split(": ").slice(1).join(": ");
    expect(effect).toMatch(/^Put all creature cards from all graveyards onto the battlefield under your control\. They're black Zombies/);
    expect(parseEffectClause(effect, "Instant").confidence).toBe("low");
  });

  it("SYNTHETIC anchor witnesses (no printed card reads these): a rider in the clause, another controller, another subject or another card type stays LOW", () => {
    // Each is the printed sentence with one part changed; the exact `^…$` anchor is what keeps them out (CREED: never strip a rider).
    const read = (clause) => {
      const program = parseEffectClause(clause, "Sorcery");
      return { confidence: program.confidence, massAtom: program.atoms.some((a) => a.op === "mass-reanimate-all-graveyards") };
    };
    const parked = { confidence: "low", massAtom: false };
    expect(read("Put all creature cards from all graveyards onto the battlefield under your control tapped.")).toEqual(parked);
    expect(read("Put all creature cards from all graveyards onto the battlefield under their owners' control.")).toEqual(parked);
    expect(read("Target opponent may put all creature cards from all graveyards onto the battlefield under your control.")).toEqual(parked);
    expect(read("Put all artifact cards from all graveyards onto the battlefield under your control.")).toEqual(parked);
  });
});

describe("RUNTIME — Rise cast for real", () => {
  it("⭐ every creature card from every graveyard enters under YOUR control; nothing else moves; each card keeps its owner", () => {
    const s0 = board({
      userGy: [G("g-ubears", BEARS), G("g-bolt", BOLT), G("g-forest", FOREST), G("g-abbey", ABBEY), G("g-copter", COPTER)],
      aiGy: [G("g-abears", BEARS), G("g-delver", DELVER)],
    });
    const s = cast(s0, "rise");
    const mine = s.players.user.battlefield;
    const row = {
      you: names(mine), them: names(s.players.ai.battlefield),
      yourGy: names(s.players.user.graveyard), theirGy: names(s.players.ai.graveyard),
      owners: mine.map((p) => `${p.card.id}:${p.owner ?? "user"}`).sort(),
      fresh: mine.every((p) => p.controller === "user" && p.summoningSick === true && p.enteredOnTurn === 6),
    };
    console.log("  WITNESS riseOfTheDarkRealms", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      you: [DELVER.name, "Grizzly Bears", "Grizzly Bears"], them: [],
      yourGy: [ABBEY.name, "Forest", "Lightning Bolt", "Rise of the Dark Realms", "Smuggler's Copter"].sort(), theirGy: [],
      owners: ["g-abears:ai", "g-delver:ai", "g-ubears:user"],
      fresh: true,
    });
  });

  it("⭐ ONE event (CR 603.6a): Soul Warden, the last card to arrive, still sees each creature that arrived with it", () => {
    // The user's graveyard is read first, so both Bears are on the battlefield before Soul Warden is — a card-by-card entry would
    // have checked their arrival before Soul Warden existed. "Another creature": it never sees itself.
    const s0 = board({ userGy: [G("g-ubears", BEARS)], aiGy: [G("g-abears", BEARS), G("g-warden", SOUL_WARDEN)] });
    const s = cast(s0, "rise");
    const byId = Object.fromEntries(s.players.user.battlefield.map((p) => [p.id, p.card.id]));
    const seen = triggersFrom(s, "Soul Warden").map((o) => byId[o.payload?.params?.context?.triggeringPermanentId]).sort();
    expect(seen).toEqual(["g-abears", "g-ubears"]);
    expect(resolveAll(s).players.user.life).toBe(s0.players.user.life + 2);
  });

  it("a newcomer's own ETB is YOURS: the opponent's Elvish Visionary draws you a card", () => {
    const s0 = board({ aiGy: [G("g-visionary", VISIONARY)] });
    const s = cast(s0, "rise");
    expect(triggersFrom(s, "Elvish Visionary").map((o) => o.controller)).toEqual(["user"]);
    const after = resolveAll(s);
    expect({ yourHand: after.players.user.hand.length, theirHand: after.players.ai.hand.length, yourLibrary: after.players.user.library.length })
      .toEqual({ yourHand: s0.players.user.hand.length, theirHand: 0, yourLibrary: 2 }); // Rise left the hand, the drawn Forest arrived
  });

  it("⭐ ownership is kept (CR 110.2 / 400.3): the opponent's Grizzly Bears, taken by Rise, dies into its OWNER's graveyard", () => {
    const s0 = board({ aiGy: [G("g-abears", BEARS)], hand: [G("bolt", BOLT)] });
    const s1 = cast(s0, "rise");
    const [stolen] = permNamed(s1, "user", "Grizzly Bears");
    expect({ controller: stolen.controller, owner: stolen.owner }).toEqual({ controller: "user", owner: "ai" });
    const s2 = cast(withPool(s1, { R: 1 }), "bolt", stolen.id);
    const row = { you: names(s2.players.user.battlefield), yourGy: names(s2.players.user.graveyard), theirGy: names(s2.players.ai.graveyard) };
    console.log("  WITNESS riseOwnerGraveyard", JSON.stringify(row));
    expect(row).toEqual({ you: [], yourGy: ["Lightning Bolt", "Rise of the Dark Realms"], theirGy: ["Grizzly Bears"] });
  });

  it("tokens are not cards (CR 111.1): a Soldier token that died is gone, and Rise brings back only the cards", () => {
    let s = board({ userGy: [G("g-ubears", BEARS)], hand: [G("alarm", RAISE_ALARM), G("bolt", BOLT)], pool: { W: 1, C: 1 } });
    s = cast(s, "alarm");
    const soldiers = permNamed(s, "user", "Soldier");
    expect(soldiers.length).toBe(2);
    s = cast(withPool(s, { R: 1 }), "bolt", soldiers[0].id);
    expect(names(s.players.user.graveyard)).toEqual(["Grizzly Bears", "Lightning Bolt", "Raise the Alarm"]);
    s = cast(withPool(s, RISE_POOL), "rise");
    expect(names(s.players.user.battlefield)).toEqual(["Grizzly Bears", "Soldier"]);
  });

  it("VACUITY — no creature card in any graveyard: nothing enters, and Rise is a resolved sorcery in your graveyard", () => {
    const s = cast(board({ userGy: [G("g-forest", FOREST)], aiGy: [G("g-bolt", BOLT)] }), "rise");
    expect({ you: names(s.players.user.battlefield), yourGy: names(s.players.user.graveyard), theirGy: names(s.players.ai.graveyard) })
      .toEqual({ you: [], yourGy: ["Forest", "Rise of the Dark Realms"], theirGy: ["Lightning Bolt"] });
  });
});

describe("the look-back (CR 603.10a) — a card returned with the others sees none of their departures", () => {
  it("⭐ Tormod returned WITH the others makes no Zombie; a Tormod already on the battlefield makes exactly one", () => {
    const returned = cast(board({ userGy: [G("g-tormod", TORMOD), G("g-ubears", BEARS)] }), "rise");
    expect({ you: names(returned.players.user.battlefield), tormod: triggersFrom(returned, "Tormod, the Desecrator").length })
      .toEqual({ you: ["Grizzly Bears", "Tormod, the Desecrator"], tormod: 0 });
    const watching = cast(board({ user: [P("tormod", "user", TORMOD)], userGy: [G("g-ubears", BEARS), G("g-visionary", VISIONARY)] }), "rise");
    expect(triggersFrom(watching, "Tormod, the Desecrator").length).toBe(1);
    const zombies = permNamed(resolveAll(watching), "user", "Zombie");
    expect(zombies.map((p) => p.tapped)).toEqual([true]);
  });

  it("⭐ Syr Konrad returned with the others pings nobody; already on the battlefield, he pings once per creature card leaving YOUR graveyard", () => {
    const graveyards = { userGy: [G("g-ubears1", BEARS), G("g-ubears2", BEARS)], aiGy: [G("g-abears", BEARS)] };
    const startingLife = board().players.ai.life;
    const returned = resolveAll(cast(board({ ...graveyards, userGy: [G("g-konrad", KONRAD), ...graveyards.userGy] }), "rise"));
    const watching = resolveAll(cast(board({ ...graveyards, user: [P("konrad", "user", KONRAD)] }), "rise"));
    const row = { returnedPings: startingLife - returned.players.ai.life, watchingPings: startingLife - watching.players.ai.life, you: names(returned.players.user.battlefield) };
    console.log("  WITNESS riseKonradLookBack", JSON.stringify(row));
    expect(row).toEqual({ returnedPings: 0, watchingPings: 2, you: ["Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Syr Konrad, the Grim"] });
  });
});

describe("Liliana Vess's −8 — the same atom through the loyalty path", () => {
  const LILI = (loyalty) => P("lili", "user", LILIANA, { counters: { loyalty } });

  it("⭐ at 8 loyalty the −8 is offered natively; it takes every creature card from every graveyard, and the 0-loyalty walker dies", () => {
    const s0 = board({ user: [LILI(8)], userGy: [G("g-ubears", BEARS), G("g-bolt", BOLT)], aiGy: [G("g-abears", BEARS)] });
    const ult = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-loyalty" && a.costDelta === -8);
    expect({ native: !!ult.program && !ult.routeToArbiter, targets: ult.targets }).toEqual({ native: true, targets: [] });
    const s = resolveTopOfStack(dispatchAction(s0, ult));
    expect({ you: names(s.players.user.battlefield), yourGy: names(s.players.user.graveyard), theirGy: names(s.players.ai.graveyard), aiOwned: permNamed(s, "user", "Grizzly Bears").map((p) => p.owner ?? "user").sort() })
      .toEqual({ you: ["Grizzly Bears", "Grizzly Bears"], yourGy: ["Lightning Bolt", "Liliana Vess"], theirGy: [], aiOwned: ["ai", "user"] });
  });

  it("at 5 loyalty the +1 and −2 are offered natively (no Arbiter route) and the −8 is not (CR 118.3)", () => {
    const acts = legalActionsForPlayer(board({ user: [LILI(5)] }), "user").filter((a) => a.kind === "activate-loyalty");
    expect([...new Set(acts.map((a) => `${a.costDelta}:${!!a.program && !a.routeToArbiter}`))].sort()).toEqual(["-2:true", "1:true"]);
  });

  it("+1 — the targeted opponent chooses the card they discard (CR 701.9b); −2 — the chosen card ends on top of your library", () => {
    const withHands = (s) => ({ ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [G("ah1", BEARS), G("ah2", BOLT)] } } });
    const s0 = withHands(board({ user: [LILI(5)] }));
    const plus = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-loyalty" && a.costDelta === 1 && a.targets?.[0]?.id === "ai");
    const paused = resolveTopOfStack(dispatchAction(s0, plus));
    expect({ kind: paused.pendingChoice?.kind, chooser: paused.pendingChoice?.controller }).toEqual({ kind: "discard", chooser: "ai" });
    const discarded = resolveDiscardChoice(paused, "ah2");
    expect({ theirHand: names(discarded.players.ai.hand), theirGy: names(discarded.players.ai.graveyard), loyalty: discarded.players.user.battlefield[0].counters.loyalty })
      .toEqual({ theirHand: ["Grizzly Bears"], theirGy: ["Lightning Bolt"], loyalty: 6 });

    const s1 = board({ user: [LILI(5)] });
    const minus = legalActionsForPlayer(s1, "user").find((a) => a.kind === "activate-loyalty" && a.costDelta === -2);
    const searching = resolveTopOfStack(dispatchAction(s1, minus));
    expect({ kind: searching.pendingChoice?.kind, chooser: searching.pendingChoice?.controller }).toEqual({ kind: "tutor-search", chooser: "user" });
    const tutored = resolveTutorChoice(searching, "ul3");
    expect({ top: tutored.players.user.library[0].id, size: tutored.players.user.library.length, hand: names(tutored.players.user.hand), loyalty: tutored.players.user.battlefield[0].counters.loyalty })
      .toEqual({ top: "ul3", size: 3, hand: ["Rise of the Dark Realms"], loyalty: 3 });
  });
});
