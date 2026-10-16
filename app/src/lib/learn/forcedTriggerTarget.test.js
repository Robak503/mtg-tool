/**
 * forcedTriggerTarget.test.js — a MANDATORY triggered ability whose only legal targets sit on the wrong side still goes on
 * the stack and takes one. CR 603.3d: "If a choice is required when the triggered ability goes on the stack but no legal
 * choices can be made for it … the ability is simply removed from the stack" — removal needs NO legal choice, and a
 * creature that has just entered is a legal target for its own "target creature" (it is a permanent, not the ability).
 *
 * Found on shelf D18 (2026-09-30): Man-o'-War with no other creature on the battlefield never bounced itself. The α1
 * chooser (gameEngine.chooseTriggerTargets) found no opponent's creature and answered NO_SAFE_TARGET; the flush put the
 * trigger on the stack as the Arbiter no-op, which resolves as nothing and logs only a bare `stack-resolve` — so the game
 * log read "cast-spell, permanent-enters, stack-resolve" and the card, classified native, lost its whole ability.
 *
 * Now (pickForcedTriggerCandidate): the chooser takes the LEAST HARMFUL legal candidate — the lowest mana value (then
 * power) among the wrong-side permanents, a player only when the fixed damage is not lethal — and the flush logs
 * `trigger-target-forced`. An OPTIONAL ability ("you may", CR 603.5 — the choice is made as it resolves) is declined
 * instead: the Arbiter no-op stays, and `trigger-no-safe-target` says why.
 *
 * Every game below runs through the real engine: cast with legalActionsForPlayer + dispatchAction, the enters trigger
 * flushed by the creature's resolution, resolved with resolveTopOfStack (a resolver crash fails the test — the engine
 * logs `stack-resolve-error` instead of throwing). Both seats: a triggered ability has no separate human target prompt —
 * the same chooser targets it for either seat, and the session driver test shows the human path end to end.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, NO_SAFE_TARGET, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceUntilDecision, applyChoice } from "./learnSession.js";
import { optionalAutoTakeValue, resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const MANOWAR = card("Man-o'-War", "Creature — Jellyfish", "{2}{U}", 3, "When this creature enters, return target creature to its owner's hand.", { power: "2", toughness: "2", colors: ["U"] });
const FTK = card("Flametongue Kavu", "Creature — Kavu", "{3}{R}", 4, "When this creature enters, it deals 4 damage to target creature.", { power: "4", toughness: "2", colors: ["R"] });
const NEKRATAAL = card("Nekrataal", "Creature — Human Assassin", "{2}{B}{B}", 4, "First strike\nWhen this creature enters, destroy target nonartifact, nonblack creature. That creature can't be regenerated.", { power: "2", toughness: "1", colors: ["B"], keywords: ["First strike"] });
const SPARKMAGE = card("Sparkmage Apprentice", "Creature — Human Wizard", "{1}{R}", 2, "When this creature enters, it deals 1 damage to any target.", { power: "1", toughness: "1", colors: ["R"] });
const VOIDMAGE = card("Separatist Voidmage", "Creature — Human Wizard", "{3}{U}", 4, "When this creature enters, you may return target creature to its owner's hand.", { power: "2", toughness: "2", colors: ["U"] });
const REDCAP = card("Murderous Redcap", "Creature — Goblin Assassin", "{2}{B/R}{B/R}", 4, "When this creature enters, it deals damage equal to its power to any target.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)", { power: "2", toughness: "2", colors: ["B", "R"], keywords: ["Persist"] });
const LEYLINE = card("Leyline of Sanctity", "Enchantment", "{2}{W}{W}", 4, "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)", { colors: ["W"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3", colors: ["R"] });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const COURSER = card("Centaur Courser", "Creature — Centaur Warrior", "{2}{G}", 3, "", { power: "3", toughness: "3", colors: ["G"] });
const OGRE = card("Gray Ogre", "Creature — Ogre", "{2}{R}", 3, "", { power: "2", toughness: "2", colors: ["R"] });
const SNAKE = card("Mystic Snake", "Creature — Snake", "{1}{G}{U}{U}", 4, "Flash\nWhen this creature enters, counter target spell.", { power: "2", toughness: "2", colors: ["G", "U"], keywords: ["Flash"] });
const OPT = card("Opt", "Instant", "{U}", 1, "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", { colors: ["U"], keywords: ["Scry"] });
const DIVINATION = card("Divination", "Sorcery", "{2}{U}", 3, "Draw two cards.", { colors: ["U"] });
const PRIEST = card("Bloodhall Priest", "Creature — Vampire Cleric", "{2}{B}{R}", 4, "Whenever this creature enters or attacks, if you have no cards in hand, this creature deals 2 damage to any target.\nMadness {1}{B}{R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)", { power: "4", toughness: "4", colors: ["B", "R"], keywords: ["Madness"] });
const HEDGE_MAGE = card("Duergar Hedge-Mage", "Creature — Dwarf Shaman", "{2}{R/W}", 3, "When this creature enters, if you control two or more Mountains, you may destroy target artifact.\nWhen this creature enters, if you control two or more Plains, you may destroy target enchantment.", { power: "2", toughness: "2", colors: ["R", "W"] });
const EQUILIBRIUM = card("Equilibrium", "Enchantment", "{1}{U}{U}", 3, "Whenever you cast a creature spell, you may pay {1}. If you do, return target creature to its owner's hand.", { colors: ["U"] });
const RETURN_TO_NATURE = card("Return to Nature", "Instant", "{1}{G}", 2, "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard.", { colors: ["G"] });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.", { colors: [] });
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", 2, "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.", { colors: [] });
const ISLAND = card("Island", "Basic Land — Island", "", 0, "({T}: Add {U}.)", { colors: [] });
const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", 0, "({T}: Add {R}.)", { colors: [] });
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)", { colors: [] });

const other = (who) => (who === "ai" ? "user" : "ai");
const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** Turn 6, the active seat's precombat main with an empty stack; `mine` / `theirs` are the active seat's and its opponent's. */
function board(who, { hand = [], mana = {}, mine = [], theirs = [], life = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], ...o });
  return {
    ...g, turn: 6, activePlayer: who, priorityHolder: who, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...g.players,
      [who]: seat(who, { hand: hand.map(([cid, c]) => ({ ...c, id: cid })), battlefield: mine, manaPool: { ...g.players[who].manaPool, ...mana }, ...(life != null ? { life } : {}) }),
      [other(who)]: seat(other(who), { battlefield: theirs }),
    },
  };
}
function cast(s, who, id) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: who }, who).find((x) => x.kind === "cast-spell" && x.cardId === id);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
function settle(s) {
  let n = s;
  for (let guard = 0; (n.stack.length || n.pendingTriggers.length) && !n.pendingChoice; guard++) {
    if (guard > 20) throw new Error("the stack did not settle");
    n = resolveTopOfStack(n);
  }
  const crash = n.log.find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const castAndSettle = (s, who, id) => settle(cast(s, who, id));
/** Cast, resolve ONLY the creature spell (its enters trigger is now on the stack), and name the permanent that entered. */
function castAndEnter(s, who, id, name) {
  const entered = resolveTopOfStack(cast(s, who, id));
  const permanent = entered.players[who].battlefield.find((p) => p.card?.name === name);
  if (!permanent) throw new Error(`${name} did not enter`);
  return { entered, permanentId: permanent.id };
}
const names = (zone) => zone.map((c) => c.card?.name ?? c.name);
const kinds = (s) => s.log.map((e) => e.kind + (e.manual ? "(manual)" : ""));
const forcedLog = (s) => s.log.filter((e) => e.kind === "trigger-target-forced").map((e) => ({ source: e.source, controller: e.controller, targets: e.targets }));

describe("the cards", () => {
  it("are classified native — so the engine must play their trigger on every board", () => {
    expect([MANOWAR, FTK, NEKRATAAL, SPARKMAGE, REDCAP, SNAKE, PRIEST, VOIDMAGE, HEDGE_MAGE, EQUILIBRIUM].map((c) => [c.name, classifyCard(c)])).toEqual([
      ["Man-o'-War", "native-trigger"], ["Flametongue Kavu", "native-trigger"], ["Nekrataal", "native-trigger"],
      ["Sparkmage Apprentice", "native-trigger"], ["Murderous Redcap", "native-trigger"], ["Mystic Snake", "native-trigger"],
      ["Bloodhall Priest", "native-trigger"], ["Separatist Voidmage", "native-trigger"], ["Duergar Hedge-Mage", "native-trigger"],
      ["Equilibrium", "native-trigger"],
    ]);
  });
});

describe("⭐ a mandatory trigger with only wrong-side targets takes one (CR 603.3d)", () => {
  for (const who of ["ai", "user"]) {
    it(`⭐ Man-o'-War alone returns itself to its owner's hand — ${who} seat`, () => {
      const { entered, permanentId: mow } = castAndEnter(board(who, { hand: [["mow", MANOWAR]], mana: { U: 3 } }), who, "mow", "Man-o'-War");
      const top = entered.stack[entered.stack.length - 1];
      const s = settle(entered);
      const row = { onStack: [top.kind, top.payload.resolver, top.targets.map((t) => t.id)], battlefield: names(s.players[who].battlefield), hand: names(s.players[who].hand),
        forced: forcedLog(s), manual: kinds(s).includes("stack-resolve(manual)") };
      console.log(`  WITNESS manowarAlone.${who}`, JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
      expect(row).toEqual({ onStack: ["triggered-ability", "effect-program", [mow]], battlefield: [], hand: ["Man-o'-War"],
        forced: [{ source: "Man-o'-War", controller: who, targets: [mow] }], manual: false });
    });
  }

  it("control: beside an opponent's Hill Giant it bounces the Giant, and nothing is forced", () => {
    const s = castAndSettle(board("ai", { hand: [["mow", MANOWAR]], mana: { U: 3 }, theirs: [perm("giant", GIANT, "user")] }), "ai", "mow");
    expect({ ai: names(s.players.ai.battlefield), userHand: names(s.players.user.hand), forced: forcedLog(s) })
      .toEqual({ ai: ["Man-o'-War"], userHand: ["Hill Giant"], forced: [] });
  });

  it("⭐ beside your own Grizzly Bears it takes the least valuable: the Bears (mana value 2) go back, not Man-o'-War (3)", () => {
    const s = castAndSettle(board("user", { hand: [["mow", MANOWAR]], mana: { U: 3 }, mine: [perm("bears", BEARS, "user")] }), "user", "mow");
    expect({ battlefield: names(s.players.user.battlefield), hand: names(s.players.user.hand), forced: forcedLog(s).map((e) => e.targets) })
      .toEqual({ battlefield: ["Man-o'-War"], hand: ["Grizzly Bears"], forced: [["bears"]] });
  });

  it("a mana-value tie goes to the lower power: beside your own Centaur Courser (3, power 3) Man-o'-War (3, power 2) returns itself", () => {
    const s = castAndSettle(board("user", { hand: [["mow", MANOWAR]], mana: { U: 3 }, mine: [perm("courser", COURSER, "user")] }), "user", "mow");
    expect({ battlefield: names(s.players.user.battlefield), hand: names(s.players.user.hand) }).toEqual({ battlefield: ["Centaur Courser"], hand: ["Man-o'-War"] });
  });

  it("a full tie keeps enumeration order: beside your own Gray Ogre (3, power 2) it is the Ogre, the first legal target, that goes back", () => {
    const s = castAndSettle(board("user", { hand: [["mow", MANOWAR]], mana: { U: 3 }, mine: [perm("ogre", OGRE, "user")] }), "user", "mow");
    expect({ battlefield: names(s.players.user.battlefield), hand: names(s.players.user.hand) }).toEqual({ battlefield: ["Man-o'-War"], hand: ["Gray Ogre"] });
  });

  it("⭐ a spell is priced by its mana value: Mystic Snake with only your own Divination and Opt on the stack counters Opt", () => {
    let s = board("user", { hand: [["div", DIVINATION], ["opt", OPT], ["snake", SNAKE]], mana: { U: 7, G: 1 } });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [ISLAND, ISLAND, ISLAND, ISLAND].map((c, i) => ({ ...c, id: `lib${i}` })) } } };
    s = cast(cast(cast(s, "user", "div"), "user", "opt"), "user", "snake");
    const optOnStack = s.stack.find((o) => o.source?.name === "Opt").id;
    s = settle(s);
    expect({ forced: forcedLog(s).map((e) => e.targets), graveyard: names(s.players.user.graveyard).sort(), drewForDivination: s.players.user.library.length })
      .toEqual({ forced: [[optOnStack]], graveyard: ["Divination", "Opt"], drewForDivination: 2 });
  });

  it("⭐ Flametongue Kavu alone deals its 4 damage to itself, and it dies", () => {
    const s = castAndSettle(board("ai", { hand: [["ftk", FTK]], mana: { R: 4 } }), "ai", "ftk");
    expect({ battlefield: names(s.players.ai.battlefield), graveyard: names(s.players.ai.graveyard), forced: forcedLog(s).length })
      .toEqual({ battlefield: [], graveyard: ["Flametongue Kavu"], forced: 1 });
  });

  it("⭐ Nekrataal can't target itself (it is black); beside only your own Grizzly Bears it destroys them", () => {
    const s = castAndSettle(board("ai", { hand: [["nek", NEKRATAAL]], mana: { B: 4 }, mine: [perm("bears", BEARS, "ai")] }), "ai", "nek");
    expect({ battlefield: names(s.players.ai.battlefield), graveyard: names(s.players.ai.graveyard), forced: forcedLog(s).map((e) => e.targets) })
      .toEqual({ battlefield: ["Nekrataal"], graveyard: ["Grizzly Bears"], forced: [["bears"]] });
  });

  it("⭐ never the lethal pick: Sparkmage Apprentice facing an opponent behind Leyline of Sanctity pings its controller at 20 life, itself at 1", () => {
    const at = (life) => castAndEnter(board("user", { hand: [["spark", SPARKMAGE]], mana: { R: 2 }, theirs: [perm("leyline", LEYLINE, "ai")], life }), "user", "spark", "Sparkmage Apprentice");
    const row = (s) => ({ life: s.players.user.life, battlefield: names(s.players.user.battlefield), graveyard: names(s.players.user.graveyard), targets: forcedLog(s).map((e) => e.targets) });
    const twenty = settle(at(20).entered);
    const { entered: atOne, permanentId: spark } = at(1);
    expect({ twenty: row(twenty), one: row(settle(atOne)) }).toEqual({
      twenty: { life: 19, battlefield: ["Sparkmage Apprentice"], graveyard: [], targets: [["user"]] },
      one: { life: 1, battlefield: [], graveyard: ["Sparkmage Apprentice"], targets: [[spark]] },
    });
  });

  // An amount that isn't printed ("damage equal to its power") is read as possibly lethal: the forced pick won't aim it at
  // its controller while another legal target exists. Murderous Redcap behind the same Leyline hits itself, persists back
  // with a -1/-1 counter, and its second enters trigger hits itself again — its controller's life is never at risk.
  it("an amount that isn't fixed is never aimed at its own controller while another target is legal (Murderous Redcap, twice)", () => {
    const { entered, permanentId: first } = castAndEnter(board("user", { hand: [["cap", REDCAP]], mana: { B: 4 }, theirs: [perm("leyline", LEYLINE, "ai")], life: 20 }), "user", "cap", "Murderous Redcap");
    const s = settle(entered);
    const targets = forcedLog(s).map((e) => e.targets);
    expect({ life: s.players.user.life, graveyard: names(s.players.user.graveyard), firstHitItself: targets[0]?.[0] === first, forced: targets.length, hitPlayer: targets.flat().includes("user") })
      .toEqual({ life: 20, graveyard: ["Murderous Redcap"], firstHitItself: true, forced: 2, hitPlayer: false });
  });
});

describe("the intervening-if path (CR 603.4) takes the same pick", () => {
  it("⭐ Bloodhall Priest, cast as your last card, facing an opponent behind Leyline of Sanctity: its 2 damage goes to its controller (20 → 18), not to itself", () => {
    const s = castAndSettle(board("user", { hand: [["priest", PRIEST]], mana: { B: 2, R: 2 }, theirs: [perm("leyline", LEYLINE, "ai")], life: 20 }), "user", "priest");
    expect({ life: s.players.user.life, battlefield: names(s.players.user.battlefield), forced: forcedLog(s).map((e) => e.targets) })
      .toEqual({ life: 18, battlefield: ["Bloodhall Priest"], forced: [["user"]] });
  });

  it("⭐ Duergar Hedge-Mage with two Mountains beside only your own Mind Stone: the optional destroy declines, and says why", () => {
    const s = castAndSettle(board("user", { hand: [["hm", HEDGE_MAGE]], mana: { R: 3 }, mine: [perm("m1", MOUNTAIN, "user"), perm("m2", MOUNTAIN, "user"), perm("stone", MIND_STONE, "user")] }), "user", "hm");
    expect({ stone: names(s.players.user.battlefield).includes("Mind Stone"), noSafe: s.log.filter((e) => e.kind === "trigger-no-safe-target").map((e) => e.source), forced: forcedLog(s) })
      .toEqual({ stone: true, noSafe: ["Duergar Hedge-Mage"], forced: [] });
  });

  it("control: beside an opponent's Mind Stone the same \"may\" is asked and taken, and their Mind Stone is destroyed", () => {
    const paused = castAndSettle(board("user", { hand: [["hm", HEDGE_MAGE]], mana: { R: 3 }, mine: [perm("m1", MOUNTAIN, "user"), perm("m2", MOUNTAIN, "user")], theirs: [perm("stone", MIND_STONE, "ai")] }), "user", "hm");
    const s = settle(resolveOptionalChoice(paused, optionalAutoTakeValue(paused, paused.pendingChoice)));
    expect({ asked: paused.pendingChoice?.kind, theirs: names(s.players.ai.battlefield), graveyard: names(s.players.ai.graveyard) })
      .toEqual({ asked: "optional-effect", theirs: [], graveyard: ["Mind Stone"] });
  });
});

describe("a modal trigger (CR 700.2) — Return to Nature's three modes as an enters trigger", () => {
  // No native modal trigger in the corpus reaches the forced pick today: each has a correct-side mode whenever anything is
  // legal. The flush is driven directly with a pending trigger carrying Return to Nature's real modes, the shape a modal
  // trigger takes (detectTriggers' "choose one —" clause). Its third mode is "ambiguous" (any graveyard: no side to prove),
  // so the choose-one partial gate routes it, and the forced pick must never fall back onto that mode.
  const clause = RETURN_TO_NATURE.oracle.replace(/^Choose one —/, "choose one —");
  const flushWith = (s) => flushTriggers({ ...s, pendingTriggers: [{ event: "etb", source: { name: "Nature's Herald", permanentId: "src" }, controller: "user",
    descriptor: { event: "etb", scope: "self", whose: "any", effectClause: clause, interveningIf: null }, context: {}, targets: [], payload: { resolver: "manual" } }] },
  { chooseTargets: chooseTriggerTargets });
  const withGraveyard = (s, cards) => ({ ...s, players: { ...s.players, user: { ...s.players.user, graveyard: cards.map(([id, c]) => ({ ...c, id })) } } });

  it("⭐ only your own artifacts, and a Forest in your graveyard: the artifact mode is forced onto Sol Ring (mana value 1, not Mind Stone's 2) — never the Forest", () => {
    const s0 = withGraveyard(board("user", { mine: [perm("stone", MIND_STONE, "user"), perm("ring", SOL_RING, "user")] }), [["gyf", FOREST]]);
    const flushed = flushWith(s0);
    const top = flushed.stack[flushed.stack.length - 1];
    const s = settle(flushed);
    expect({ mode: top.payload.params.chosenMode, targets: top.targets.map((t) => t.id), forced: forcedLog(s).map((e) => e.targets), battlefield: names(s.players.user.battlefield), graveyard: names(s.players.user.graveyard) })
      .toEqual({ mode: 0, targets: ["ring"], forced: [["ring"]], battlefield: ["Mind Stone"], graveyard: ["Forest", "Sol Ring"] });
  });

  it("only the graveyard mode has a target (its side can't be read): the Arbiter no-op, logged `trigger-no-safe-target` — the Forest stays", () => {
    const s = settle(flushWith(withGraveyard(board("user"), [["gyf", FOREST]])));
    expect({ graveyard: names(s.players.user.graveyard), noSafe: kinds(s).filter((k) => k === "trigger-no-safe-target").length, manual: kinds(s).includes("stack-resolve(manual)"), forced: forcedLog(s) })
      .toEqual({ graveyard: ["Forest"], noSafe: 1, manual: true, forced: [] });
  });
});

describe("an optional trigger is declined instead (CR 603.5), and the log says why", () => {
  it("⭐ an optional PAYMENT is optional too: Equilibrium, with only your own Grizzly Bears out when you cast Hill Giant, offers no payment and says why", () => {
    const s = castAndSettle(board("user", { hand: [["giant", GIANT]], mana: { R: 4, U: 1 }, mine: [perm("eq", EQUILIBRIUM, "user"), perm("bears", BEARS, "user")] }), "user", "giant");
    expect({ battlefield: names(s.players.user.battlefield), pending: s.pendingChoice?.kind ?? null, noSafe: s.log.filter((e) => e.kind === "trigger-no-safe-target").map((e) => e.source), forced: forcedLog(s) })
      .toEqual({ battlefield: ["Equilibrium", "Grizzly Bears", "Hill Giant"], pending: null, noSafe: ["Equilibrium"], forced: [] });
  });

  it("⭐ Separatist Voidmage alone stays: the Arbiter no-op resolves, after `trigger-no-safe-target`", () => {
    const s = castAndSettle(board("user", { hand: [["vm", VOIDMAGE]], mana: { U: 4 } }), "user", "vm");
    const k = kinds(s);
    expect({ battlefield: names(s.players.user.battlefield), noSafe: k.indexOf("trigger-no-safe-target") > -1 && k.indexOf("trigger-no-safe-target") < k.indexOf("stack-resolve(manual)"), forced: forcedLog(s) })
      .toEqual({ battlefield: ["Separatist Voidmage"], noSafe: true, forced: [] });
  });

  it("control: with an opponent's Hill Giant to take, the same \"may\" goes on the stack aimed at the Giant, is asked, and is taken", () => {
    const paused = castAndSettle(board("ai", { hand: [["vm", VOIDMAGE]], mana: { U: 4 }, theirs: [perm("giant", GIANT, "user")] }), "ai", "vm");
    const pc = paused.pendingChoice;
    const take = optionalAutoTakeValue(paused, pc); // the autopilot's own answer to the "may"
    const s = settle(resolveOptionalChoice(paused, take));
    expect({ asked: [pc?.kind, pc?.controller, pc?.resume?.targets?.map((t) => t.id)], take, userHand: names(s.players.user.hand), noSafe: kinds(s).includes("trigger-no-safe-target") })
      .toEqual({ asked: ["optional-effect", "ai", ["giant"]], take: true, userHand: ["Hill Giant"], noSafe: false });
  });
});

describe("the human seat, through the session driver", () => {
  // The human casts Man-o'-War holding an Island too, so the driver hands the decision back once the stack is empty again
  // (an Island can't be played while the spell or its trigger is on the stack, so those windows are pass-only and the
  // driver passes them for the human — no other decision exists there, and none is raised for the trigger's target).
  it("⭐ the human casts Man-o'-War with no other creature out: the trigger takes it, no target prompt is raised, and it returns to the human's hand", () => {
    let { session, decision } = advanceUntilDecision({ status: "active", state: board("user", { hand: [["mow", MANOWAR], ["isl", ISLAND]], mana: { U: 3 } }), difficulty: "beginner", decisionLog: [] });
    const before = session.decisionLog.length;
    ({ session, decision } = applyChoice(session, decision.options.find((a) => a.kind === "cast-spell" && a.cardId === "mow")));
    const s = session.state;
    const humanAfterCast = session.decisionLog.slice(before + 1).filter((d) => d.actor === "user").map((d) => `${d.action?.kind}:${d.reasoning}`);
    expect({ decision: decision.kind, step: s.step, stack: s.stack.length, hand: names(s.players.user.hand), battlefield: names(s.players.user.battlefield),
      forced: forcedLog(s).map((e) => e.controller), humanAfterCast: [...new Set(humanAfterCast)], crash: kinds(s).includes("stack-resolve-error") })
      .toEqual({ decision: "ask", step: "main", stack: 0, hand: ["Island", "Man-o'-War"], battlefield: [], forced: ["user"],
        humanAfterCast: ["pass-priority:only-pass-available"], crash: false });
  });
});

describe("the forced pick's prices, at the chooser (candidates no card in the corpus reaches today)", () => {
  // Chooser-level: the candidates are written by hand over real cards placed in the state, for the target kinds no native
  // trigger can put on the wrong side yet. Each pins one rule of the price, so the rule can't drift unwatched.
  const pick = (s, program, candidates) => chooseTriggerTargets(candidates, { state: s, trigger: { controller: "user" }, program });

  it("a graveyard card is priced by its mana value (Sol Ring's 1 under Hill Giant's 4)", () => {
    const s0 = board("user");
    const s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, graveyard: [{ ...GIANT, id: "g-giant" }, { ...SOL_RING, id: "g-ring" }] } } };
    const program = { atoms: [{ op: "return-from-graveyard", targetType: "graveyardCard" }] }; // own-side: an opponent's card is the wrong side
    const p = pick(s, program, [
      { targets: [{ type: "graveyardCard", id: "g-giant", controller: "ai", atomIndex: 0 }] },
      { targets: [{ type: "graveyardCard", id: "g-ring", controller: "ai", atomIndex: 0 }] },
    ]);
    expect({ targets: p?.targets?.map((t) => t.id), forced: p?.forced }).toEqual({ targets: ["g-ring"], forced: true });
  });

  it("an ability on the stack costs nothing and is never looked up as a permanent", () => {
    const s0 = board("user");
    const s = { ...s0, stack: [{ id: "their-ability", kind: "triggered-ability", controller: "ai", source: { name: "Man-o'-War" }, targets: [], payload: { resolver: "manual" } }] };
    const program = { atoms: [{ op: "copy-ability", targetType: "stackAbility" }] }; // own-side: an opponent's ability is the wrong side
    const p = pick(s, program, [{ targets: [{ type: "stackAbility", id: "their-ability", controller: "ai", atomIndex: 0 }] }]);
    expect({ targets: p?.targets?.map((t) => t.id), forced: p?.forced }).toEqual({ targets: ["their-ability"], forced: true });
  });

  it("only an optional CHOSEN-target atom makes the choice optional — an optional atom with no chosen target leaves it forced", () => {
    const s = board("user", { mine: [perm("mine", BEARS, "user")] });
    const candidates = [{ targets: [{ type: "creature", id: "mine", controller: "user", atomIndex: 0 }] }];
    const withEachOpponent = { atoms: [{ op: "bounce", targetType: "creature" }, { op: "deal-damage", amount: 1, targetType: "eachOpponent", optional: true }] };
    const optionalBounce = { atoms: [{ op: "bounce", targetType: "creature", optional: true }] };
    expect({ forced: pick(s, withEachOpponent, candidates)?.forced, optional: pick(s, optionalBounce, candidates) === NO_SAFE_TARGET }).toEqual({ forced: true, optional: true });
  });
});
