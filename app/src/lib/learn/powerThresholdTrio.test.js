/**
 * powerThresholdTrio.test.js — three cards keyed on a creature's power (play-weighted #612, #643, #657).
 *
 * TRIBUTE TO THE WORLD TREE — "Whenever a creature you control enters, draw a card if its power is 3 or greater. Otherwise,
 *   put two +1/+1 counters on it." One instruction with two arms, decided as the ability resolves (CR 608.2h): the creature's
 *   power then, through the layers — or, once it has left the battlefield, its last known power, stamped on the waiting
 *   ability by the battlefield exit (gameState.stampTriggeringLeftPower).
 * GORECLAW, TERROR OF QAL SISMA — a creature-spell reducer with a floor on the SPELL's power (the printed number: not the
 *   counters it enters with, not an anthem — CR 601.2f, generic only per CR 118.7a), and an attack trigger pumping each
 *   creature you control whose power is 4 or greater as it resolves; that set is then fixed (CR 611.2c).
 * MENTOR OF THE MEEK — "Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw
 *   a card." The power is read as the creature enters, through the layers (the card's bundled rulings: enters-with counters
 *   and static effects count); the payment is made on resolution through the existing optional-payment lane (CR 118.12).
 *
 * The singular power-capped enters condition also carries six more cards whose effects were already modeled (Serra Redeemer,
 * Inspiring Commander, Snarling Gorehound, Vicious Clown, Marketwatch Phantom, Neighborhood Guardian) — each is driven here.
 * The etbMaxPower gate now reads the layers for the batched form too (Welcoming Vampire, Enduring Innocence — their rulings
 * say the same), where it used to read the printed number.
 *
 * Every card below is a real oracle fixture generated from the bundled Scryfall data (cardIndex.publicCard); the few
 * synthetic texts are labelled SYNTHETIC and exist only to prove a guard refuses what no printed card carries.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data, generated 2026-10-03) ──────────────────────────────────────────────────────
const TRIBUTE = {"name":"Tribute to the World Tree","type":"Enchantment","mana":"{G}{G}{G}","cmc":3,"keywords":[],"colors":["G"],"oracle":"Whenever a creature you control enters, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it."};
const GORECLAW = {"name":"Goreclaw, Terror of Qal Sisma","type":"Legendary Creature — Bear","mana":"{3}{G}","cmc":4,"power":"4","toughness":"3","keywords":[],"colors":["G"],"oracle":"Creature spells you cast with power 4 or greater cost {2} less to cast.\nWhenever Goreclaw attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn."};
const MENTOR = {"name":"Mentor of the Meek","type":"Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CENTAUR_COURSER = {"name":"Centaur Courser","type":"Creature — Centaur Warrior","mana":"{2}{G}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["G"],"oracle":""};
const COLOSSAL_DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const LEATHERBACK_BALOTH = {"name":"Leatherback Baloth","type":"Creature — Beast","mana":"{G}{G}{G}","cmc":3,"power":"4","toughness":"5","keywords":[],"colors":["G"],"oracle":""};
const BOON_SATYR = {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","cmc":3,"power":"4","toughness":"2","keywords":["Bestow","Flash"],"colors":["G"],"oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2."};
const HUNGERING_HYDRA = {"name":"Hungering Hydra","type":"Creature — Hydra","mana":"{X}{G}","cmc":1,"power":"0","toughness":"0","keywords":[],"colors":["G"],"oracle":"This creature enters with X +1/+1 counters on it.\nThis creature can't be blocked by more than one creature.\nWhenever this creature is dealt damage, put that many +1/+1 counters on it. (It must survive the damage to get the counters.)"};
const ENDLESS_ONE = {"name":"Endless One","type":"Creature — Eldrazi","mana":"{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with X +1/+1 counters on it."};
const MOLIMO = {"name":"Molimo, Maro-Sorcerer","type":"Legendary Creature — Elemental Sorcerer","mana":"{4}{G}{G}{G}","cmc":7,"power":"*","toughness":"*","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nMolimo's power and toughness are each equal to the number of lands you control."};
const GLORIOUS_ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."};
const NIGHT_OF_SOULS_BETRAYAL = {"name":"Night of Souls' Betrayal","type":"Legendary Enchantment","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"All creatures get -1/-1."};
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."};
const LIGHTNING_ELEMENTAL = {"name":"Lightning Elemental","type":"Creature — Elemental","mana":"{3}{R}","cmc":4,"power":"4","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"};
const BALL_LIGHTNING = {"name":"Ball Lightning","type":"Creature — Elemental","mana":"{R}{R}{R}","cmc":3,"power":"6","toughness":"1","keywords":["Haste","Trample"],"colors":["R"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nHaste (This creature can attack and {T} as soon as it comes under your control.)\nAt the beginning of the end step, sacrifice this creature."};
const WELCOMING_VAMPIRE = {"name":"Welcoming Vampire","type":"Creature — Vampire","mana":"{2}{W}","cmc":3,"power":"2","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever one or more other creatures you control with power 2 or less enter, draw a card. This ability triggers only once each turn."};
const SERRA_REDEEMER = {"name":"Serra Redeemer","type":"Creature — Angel Soldier","mana":"{3}{W}{W}","cmc":5,"power":"2","toughness":"4","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever another creature you control with power 2 or less enters, put two +1/+1 counters on that creature."};
const INSPIRING_COMMANDER = {"name":"Inspiring Commander","type":"Creature — Human Soldier","mana":"{4}{W}{W}","cmc":6,"power":"1","toughness":"4","keywords":[],"colors":["W"],"oracle":"Whenever another creature you control with power 2 or less enters, you gain 1 life and draw a card."};
const SNARLING_GOREHOUND = {"name":"Snarling Gorehound","type":"Creature — Dog","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Surveil","Menace"],"colors":["B"],"oracle":"Menace\nWhenever another creature you control with power 2 or less enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)"};
const VICIOUS_CLOWN = {"name":"Vicious Clown","type":"Creature — Human Clown","mana":"{2}{R}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["R"],"oracle":"Whenever another creature you control with power 2 or less enters, this creature gets +2/+0 until end of turn."};
const MARKETWATCH_PHANTOM = {"name":"Marketwatch Phantom","type":"Creature — Spirit Detective","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever another creature you control with power 2 or less enters, this creature gains flying until end of turn."};
const NEIGHBORHOOD_GUARDIAN = {"name":"Neighborhood Guardian","type":"Creature — Unicorn","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever another creature you control with power 2 or less enters, target creature you control gets +1/+1 until end of turn."};
const EZURI = {"name":"Ezuri, Claw of Progress","type":"Legendary Creature — Phyrexian Elf Warrior","mana":"{2}{G}{U}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["G","U"],"oracle":"Whenever a creature you control with power 2 or less enters, you get an experience counter.\nAt the beginning of combat on your turn, put X +1/+1 counters on another target creature you control, where X is the number of experience counters you have."};
const OVERSEER = {"name":"Overseer of Vault 76","type":"Legendary Creature — Human Advisor","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":["First Contact"],"colors":["W"],"oracle":"First Contact — Whenever Overseer of Vault 76 or another creature you control with power 3 or less enters, put a quest counter on Overseer of Vault 76.\nAt the beginning of combat on your turn, you may remove three quest counters from among permanents you control. When you do, put a +1/+1 counter on each creature you control and they gain vigilance until end of turn."};
const IRREVERENT_GREMLIN = {"name":"Irreverent Gremlin","type":"Creature — Gremlin","mana":"{1}{R}","cmc":2,"power":"2","toughness":"2","keywords":["Menace"],"colors":["R"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)\nWhenever another creature you control with power 2 or less enters, you may discard a card. If you do, draw a card. Do this only once each turn."};
const WISPDRINKER = {"name":"Wispdrinker Vampire","type":"Creature — Vampire Rogue","mana":"{2}{W}{B}","cmc":4,"power":"2","toughness":"4","keywords":["Flying"],"colors":["B","W"],"oracle":"Flying\nWhenever another creature you control with power 2 or less enters, each opponent loses 1 life and you gain 1 life.\n{5}{W}{B}: Creatures you control with power 2 or less gain deathtouch and lifelink until end of turn."};
const ELESH_NORN = {"name":"Elesh Norn, Grand Cenobite","type":"Legendary Creature — Phyrexian Praetor","mana":"{5}{W}{W}","cmc":7,"power":"4","toughness":"7","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nOther creatures you control get +2/+2.\nCreatures your opponents control get -2/-2."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const HARDENED_SCALES = {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."};
const RUNECLAW_BEAR = {"name":"Runeclaw Bear","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const OVERRUN = {"name":"Overrun","type":"Sorcery","mana":"{2}{G}{G}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"Creatures you control get +3/+3 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)"};

// ── harness: the engine's own entry points (legalActionsForPlayer → dispatchAction → resolveTopOfStack) ────────────────────
const perm = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...over });
const inHand = (id, card) => ({ ...card, id, mana_cost: card.mana });
function board({ hand = [], aiHand = [], userBf = [], aiBf = [], pool = {}, aiPool = {}, over = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const library = [1, 2, 3].map((i) => ({ ...FOREST, id: `lib${i}` }));
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], ...over,
    players: { ...g.players,
      user: { ...g.players.user, library, hand, battlefield: userBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...aiPool } } } };
}
const castOptions = (s, pid, cardId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
function cast(s, pid, cardId, pick = () => true) {
  const action = castOptions(s, pid, cardId).find(pick);
  if (!action) throw new Error(`no cast offered for ${cardId}`);
  return dispatchAction(s, action);
}
const castAt = (s, pid, cardId, targetId) => cast(s, pid, cardId, (a) => a.targets.some((t) => t.id === targetId));
const pass = (s, pid) => dispatchAction(s, legalActionsForPlayer(s, pid).find((a) => a.kind === "pass-priority"));
/** Resolve the top of the stack; a resolver that threw is logged by the engine, never raised — so it is raised here. */
function resolve(s) {
  const next = resolveTopOfStack(s);
  const errors = next.log.filter((e) => e.kind === "stack-resolve-error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  return next;
}
/** Cast a permanent spell from the user's hand and resolve it: it enters, and what it triggered is put on the stack. */
const enter = (s, cardId, pick) => resolve(cast(s, "user", cardId, pick));
const onBf = (s, name, pid = "user") => s.players[pid].battlefield.find((p) => p.card.name === name);
const pt = (s, name, pid = "user") => { const p = onBf(s, name, pid); return p ? `${creaturePower(p, s)}/${creatureToughness(p, s)}` : null; };
const hand = (s) => s.players.user.hand.map((c) => c.name);
const stackOf = (s) => s.stack.map((o) => o.source?.name);
const topContext = (s) => s.stack[s.stack.length - 1]?.payload?.params?.context;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("classification and parse", () => {
  it("⭐ the three targets read native", () => {
    expect({ tribute: classifyCard(TRIBUTE), goreclaw: classifyCard(GORECLAW), mentor: classifyCard(MENTOR) })
      .toEqual({ tribute: "native-trigger", goreclaw: "native-mixed", mentor: "native-trigger" });
  });
  it("the six other carriers of the singular power-capped enters condition read native — each is driven below", () => {
    expect([SERRA_REDEEMER, INSPIRING_COMMANDER, SNARLING_GOREHOUND, VICIOUS_CLOWN, MARKETWATCH_PHANTOM, NEIGHBORHOOD_GUARDIAN].map(classifyCard))
      .toEqual(Array(6).fill("native-trigger"));
  });
  it("⛔ near misses stay parked: the bare subject (Ezuri), the self-or-another union (Overseer of Vault 76), an unmodeled effect or second ability", () => {
    expect([EZURI, OVERSEER, IRREVERENT_GREMLIN, WISPDRINKER].map(classifyCard)).toEqual(Array(4).fill("body-only"));
    expect(detectTriggers(EZURI).filter((d) => d.event === "etb")).toEqual([]);
    expect(detectTriggers(OVERSEER).filter((d) => d.event === "etb")).toEqual([]);
  });
  it("Mentor: an 'another creature you control' enters trigger capped at power 2, whose effect is the optional {1} payment", () => {
    const [d] = detectTriggers(MENTOR);
    expect(d).toMatchObject({ event: "etb", scope: "otherCreatureYouControl", etbMaxPower: 2, optional: true, oncePerTurnTrigger: false });
    expect(parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true }).atoms).toMatchObject([
      { op: "optional-mana-payment", cost: { kind: "mana", mana: { generic: 1 } }, effectAtoms: [{ op: "draw", amount: 1 }] }]);
  });
  it("Tribute: both sentences are one branch atom on the entering creature", () => {
    const [d] = detectTriggers(TRIBUTE);
    expect(d).toMatchObject({ event: "etb", scope: "creatureYouControl", interveningIf: null });
    expect(parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true })).toMatchObject({
      confidence: "high", atoms: [{ op: "draw-or-counters-by-triggering-power", powerAtLeast: 3, amount: 2, targetType: null }] });
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("Goreclaw: a creature-spell reducer with a power floor, and a team pump with a power floor", () => {
    expect(parseStaticAbilities(GORECLAW)).toEqual([{ costReduction: { subtype: "Creature", minPower: 4, amount: 2 } }]);
    const [d] = detectTriggers(GORECLAW);
    expect(d).toMatchObject({ event: "attacks", scope: "self" });
    expect(parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true }).atoms)
      .toEqual([{ op: "pump", scope: "youControl", powerAtLeast: 4, ptDelta: { p: 1, t: 1 }, grantKeywords: ["Trample"] }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("⭐ Tribute to the World Tree — the branch is decided as the ability resolves", () => {
  const tribute = () => perm("t", TRIBUTE);
  it("⭐ a 3-power creature enters → draw a card, no counters", () => {
    let s = enter(board({ hand: [inHand("cc", CENTAUR_COURSER)], userBf: [tribute()], pool: { G: 3 } }), "cc");
    expect(stackOf(s)).toEqual(["Tribute to the World Tree"]);
    s = resolve(s);
    expect({ hand: hand(s), counters: onBf(s, "Centaur Courser").counters, courser: pt(s, "Centaur Courser") }).toEqual({ hand: ["Forest"], counters: {}, courser: "3/3" });
  });
  it("⭐ a 2-power creature enters → two +1/+1 counters on it, no card", () => {
    let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [tribute()], pool: { G: 2 } }), "gb");
    s = resolve(s);
    expect({ hand: hand(s), counters: onBf(s, "Grizzly Bears").counters, bears: pt(s, "Grizzly Bears") }).toEqual({ hand: [], counters: { "+1/+1": 2 }, bears: "4/4" });
  });
  it("⭐ a 2/2 that an anthem makes 3/3 → draw a card (the power through the layers, not the printed number)", () => {
    let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [tribute(), perm("ga", GLORIOUS_ANTHEM)], pool: { G: 2 } }), "gb");
    s = resolve(s);
    expect({ hand: hand(s), counters: onBf(s, "Grizzly Bears").counters }).toEqual({ hand: ["Forest"], counters: {} });
  });
  it("⭐ on RESOLUTION, not as it triggers: a 2/2 pumped to 5/5 in response draws a card", () => {
    let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS), inHand("gg", GIANT_GROWTH)], userBf: [tribute()], pool: { G: 3 } }), "gb");
    s = resolve(castAt(s, "user", "gg", onBf(s, "Grizzly Bears").id)); // Giant Growth resolves first, the trigger still waiting
    expect({ stack: stackOf(s), bears: pt(s, "Grizzly Bears") }).toEqual({ stack: ["Tribute to the World Tree"], bears: "5/5" });
    s = resolve(s);
    expect({ hand: hand(s), counters: onBf(s, "Grizzly Bears").counters }).toEqual({ hand: ["Forest"], counters: {} });
  });
  it("the counter arm is the ordinary counter placement: Hardened Scales makes it three", () => {
    let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [tribute(), perm("hs", HARDENED_SCALES)], pool: { G: 2 } }), "gb");
    s = resolve(s);
    expect(onBf(s, "Grizzly Bears").counters).toEqual({ "+1/+1": 3 });
  });
  it("it triggers for every creature you control that enters — the power is never part of the trigger condition", () => {
    const s = enter(board({ hand: [inHand("cd", COLOSSAL_DREADMAW)], userBf: [tribute()], pool: { G: 6 } }), "cd");
    expect(stackOf(s)).toEqual(["Tribute to the World Tree"]);
  });

  describe("last known information (CR 608.2h) — the creature has left the battlefield", () => {
    /** Tribute's trigger is on the stack for the Bears; the opponent destroys the Bears in response. */
    function bearsMurderedInResponse(userBf) {
      let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf, pool: { G: 2 }, aiHand: [inHand("mu", MURDER)], aiPool: { B: 3 } }), "gb");
      const bearsId = onBf(s, "Grizzly Bears").id;
      s = resolve(castAt(pass(s, "user"), "ai", "mu", bearsId));
      return s;
    }
    it("⭐ a 2/2 under an anthem, destroyed in response: its last known power was 3 → draw a card", () => {
      let s = bearsMurderedInResponse([tribute(), perm("ga", GLORIOUS_ANTHEM)]);
      expect({ stack: stackOf(s), gone: onBf(s, "Grizzly Bears") ?? null, stamped: topContext(s).triggeringLeftPower }).toEqual({ stack: ["Tribute to the World Tree"], gone: null, stamped: 3 });
      s = resolve(s);
      expect(hand(s)).toEqual(["Forest"]);
    });
    it("⭐ a 2/2 destroyed in response: last known power 2 → no card, and no counters land anywhere", () => {
      let s = bearsMurderedInResponse([tribute()]);
      expect(topContext(s).triggeringLeftPower).toBe(2);
      s = resolve(s);
      expect({ hand: hand(s), counters: s.players.user.battlefield.map((p) => p.counters) }).toEqual({ hand: [], counters: [{}] });
    });
    it("⭐ a creature a state-based action removes before the ability reaches the stack: the last known power is read through the layers", () => {
      // Elesh Norn gives the opponent's creatures -2/-2. Lightning Elemental (printed 4/1) enters as a 2/-1 and dies at once: its
      // last known power is 2 (the printed 4 would draw). Ball Lightning (printed 6/1) enters as a 4/-1: last known power 4.
      const start = board({ hand: [inHand("le", LIGHTNING_ELEMENTAL), inHand("bl", BALL_LIGHTNING)], userBf: [tribute()], aiBf: [perm("en", ELESH_NORN, "ai")], pool: { R: 7 } });
      let s = enter(start, "le");
      expect({ stack: stackOf(s), graveyard: s.players.user.graveyard.map((c) => c.name), stamped: topContext(s).triggeringLeftPower })
        .toEqual({ stack: ["Tribute to the World Tree"], graveyard: ["Lightning Elemental"], stamped: 2 });
      s = resolve(s);
      expect(hand(s)).toEqual(["Ball Lightning"]);
      s = enter(s, "bl");
      expect(topContext(s).triggeringLeftPower).toBe(4);
      s = resolve(s);
      expect(hand(s)).toEqual(["Forest"]);
    });
    it("only the ability that named the leaving creature is stamped; an unrelated exit leaves the stack as it was", () => {
      // The Bears' trigger waits; Boon Satyr (flash) enters in response and its own trigger goes above it. The opponent then
      // destroys the Bears: the Bears' trigger carries the last known power, the Satyr's does not.
      let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS), inHand("bs", BOON_SATYR)], userBf: [tribute(), perm("rb", RUNECLAW_BEAR)], pool: { G: 5 }, aiHand: [inHand("mu", MURDER)], aiPool: { B: 3 } }), "gb");
      const bearsId = onBf(s, "Grizzly Bears").id;
      s = resolve(cast(s, "user", "bs", (a) => !a.bestow));
      expect(stackOf(s)).toEqual(["Tribute to the World Tree", "Tribute to the World Tree"]);
      const waiting = s;
      s = resolve(castAt(pass(s, "user"), "ai", "mu", bearsId));
      expect(s.stack.map((o) => o.payload.params.context.triggeringLeftPower)).toEqual([2, undefined]);
      // The exit itself (the one battlefield exit, moveCardToZone): a permanent no waiting ability names changes nothing on the stack.
      const unrelated = moveCardToZone(waiting, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "rb" });
      expect(unrelated.stack).toBe(waiting.stack);
    });
  });

  describe("⛔ the branch atom exists only on an enters watcher", () => {
    const SENTINEL = "draw a card if the triggering creature's power is 3 or greater. Otherwise, put two +1/+1 counters on the triggering creature";
    it("SYNTHETIC — the same sentences on another event or on a self trigger are not rewritten, and a hand-built descriptor off the enters event does not route", () => {
      const attacks = { name: "Synthetic Attack Watcher", type: "Enchantment", mana: "{G}", oracle: "Whenever a creature you control attacks, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it." };
      const selfEnters = { name: "Synthetic Self Enters", type: "Creature — Bear", mana: "{G}", power: "2", toughness: "2", oracle: "When this creature enters, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it." };
      expect(detectTriggers(attacks).map((d) => /the triggering creature/.test(d.effectClause))).toEqual([false]);
      expect(detectTriggers(selfEnters).map((d) => /the triggering creature/.test(d.effectClause))).toEqual([false]);
      expect([classifyCard(attacks), classifyCard(selfEnters)]).toEqual(["body-only", "body-only"]);
      expect({ etb: triggerRoutesNatively({ event: "etb", effectClause: SENTINEL }), attacks: triggerRoutesNatively({ event: "attacks", effectClause: SENTINEL }) }).toEqual({ etb: true, attacks: false });
    });
    it("SYNTHETIC — a spell printing the sentinel words is not credited (no spell names an entering creature)", () => {
      expect(classifyCard({ name: "Synthetic Sentinel Spell", type: "Sorcery", mana: "{G}", oracle: `${SENTINEL[0].toUpperCase()}${SENTINEL.slice(1)}.` })).toBe("arbiter-spell");
    });
    it("a different count word or bound is not this atom", () => {
      expect(parseEffectClause("draw a card if the triggering creature's power is 3 or less. Otherwise, put two +1/+1 counters on the triggering creature", "Instant", { hasX: false, sourceScoped: true }).confidence).toBe("low");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("⭐ Goreclaw, Terror of Qal Sisma — the cost reduction", () => {
  const HAND = [inHand("cd", COLOSSAL_DREADMAW), inHand("lb", LEATHERBACK_BALOTH), inHand("cc", CENTAUR_COURSER), inHand("hh", HUNGERING_HYDRA),
    inHand("eo", ENDLESS_ONE), inHand("bs", BOON_SATYR), inHand("mo", MOLIMO)];
  /** Every cast offered, as "generic/G" per card (the X spells at X = 4; Boon Satyr's bestowed cast under its own key). */
  function offers(s) {
    const out = {};
    for (const a of legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell")) {
      if (a.xValue != null && a.xValue !== 4) continue;
      out[a.bestow ? `${a.name} (bestowed)` : a.name] = `${a.cost.generic}/${a.cost.G}`;
    }
    return out;
  }
  it("⭐ {2} off the GENERIC part of a creature spell with printed power 4 or more — never a coloured pip, never a smaller spell", () => {
    // (Runeclaw Bear is there so the bestowed cast has a creature to enchant on both boards.)
    const withGoreclaw = offers(board({ hand: HAND, userBf: [perm("gc", GORECLAW), perm("rb", RUNECLAW_BEAR)], pool: { G: 12 } }));
    const without = offers(board({ hand: HAND, userBf: [perm("rb", RUNECLAW_BEAR)], pool: { G: 12 } }));
    console.log(`WITNESS goreclawReducer ${JSON.stringify({ withGoreclaw, without })}`);
    expect(without).toEqual({
      "Colossal Dreadmaw": "4/2", "Leatherback Baloth": "0/3", "Centaur Courser": "2/1", "Hungering Hydra": "4/1", "Endless One": "4/0",
      "Boon Satyr": "1/2", "Boon Satyr (bestowed)": "3/2", "Molimo, Maro-Sorcerer": "4/3" });
    expect(withGoreclaw).toEqual({
      "Colossal Dreadmaw": "2/2",      // power 6: {4}{G}{G} → {2}{G}{G}
      "Leatherback Baloth": "0/3",     // power 4, {G}{G}{G}: no generic to reduce — the pips are never touched (CR 118.7a)
      "Centaur Courser": "2/1",        // power 3: no discount
      "Hungering Hydra": "4/1",        // a 0/0 that enters with X counters is a power-0 spell (Goreclaw's ruling)
      "Endless One": "4/0",
      "Boon Satyr": "0/2",             // power exactly 4: {1}{G}{G} → {G}{G}, the generic floored at {0} (CR 601.2f)
      "Boon Satyr (bestowed)": "3/2",  // cast bestowed it is an Aura spell, not a creature spell (CR 702.103b)
      "Molimo, Maro-Sorcerer": "4/3",  // printed "*": no stack-zone CDA reader — the documented under-read (full cost)
    });
  });
  it("the mana value is untouched and the dispatcher pays exactly the reduced cost", () => {
    const s = board({ hand: [inHand("cd", COLOSSAL_DREADMAW)], userBf: [perm("gc", GORECLAW)], pool: { G: 4 } });
    const [action] = castOptions(s, "user", "cd");
    const out = dispatchAction(s, action);
    expect({ cmc: action.cmc, onStack: stackOf(out), left: out.players.user.manaPool.G }).toEqual({ cmc: 6, onStack: ["Colossal Dreadmaw"], left: 0 });
    expect(castOptions(board({ hand: [inHand("cd", COLOSSAL_DREADMAW)], userBf: [perm("gc", GORECLAW)], pool: { G: 3 } }), "user", "cd")).toEqual([]);
  });
  it("⛔ 'creature spells YOU cast': an opponent's Goreclaw discounts nothing of yours", () => {
    expect(offers(board({ hand: [inHand("cd", COLOSSAL_DREADMAW)], aiBf: [perm("gc", GORECLAW, "ai")], pool: { G: 12 } }))).toEqual({ "Colossal Dreadmaw": "4/2" });
  });
});

describe("⭐ Goreclaw, Terror of Qal Sisma — the attack trigger", () => {
  /** Goreclaw attacks: the declaration closes on the first pass and the trigger is on the stack, the user holding priority. */
  function goreclawAttacks(extra = {}) {
    let s = board({
      userBf: [perm("gc", GORECLAW), perm("cc", CENTAUR_COURSER), perm("gb", GRIZZLY_BEARS, "user", { counters: { "+1/+1": 2 } }), perm("lb", LEATHERBACK_BALOTH), perm("rb", RUNECLAW_BEAR)],
      aiBf: [perm("alb", LEATHERBACK_BALOTH, "ai")], over: { phase: "combat", step: "declare-attackers" }, ...extra });
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "gc"));
    s = pass(s, "user");
    expect(stackOf(s)).toEqual(["Goreclaw, Terror of Qal Sisma"]);
    return s;
  }
  const team = (s) => Object.fromEntries(["gc", "cc", "gb", "lb", "rb"].map((id) => {
    const p = s.players.user.battlefield.find((x) => x.id === id);
    return [id, `${creaturePower(p, s)}/${creatureToughness(p, s)}${permanentHasKeyword(s, id, "Trample") ? " trample" : ""}`];
  }));
  it("⭐ each creature you control with power 4 or more as it resolves gets +1/+1 and trample — counters count, smaller creatures and the opponent's get nothing", () => {
    const s = resolve(goreclawAttacks());
    console.log(`WITNESS goreclawAttack ${JSON.stringify(team(s))}`);
    expect(team(s)).toEqual({
      gc: "5/4 trample",   // Goreclaw itself, power exactly 4
      cc: "3/3",           // power 3
      gb: "5/5 trample",   // a 2/2 with two +1/+1 counters is a 4/4
      lb: "5/6 trample",   // not attacking — "each creature you control"
      rb: "2/2",
    });
    expect({ pt: pt(s, "Leatherback Baloth", "ai"), trample: permanentHasKeyword(s, "alb", "Trample") }).toEqual({ pt: "4/5", trample: false });
  });
  it("⭐ the set is decided on RESOLUTION: a 3/3 pumped to 6/6 in response is in it", () => {
    let s = goreclawAttacks({ hand: [inHand("gg", GIANT_GROWTH)], pool: { G: 1 } });
    s = resolve(castAt(s, "user", "gg", "cc"));
    s = resolve(s);
    expect(team(s).cc).toBe("7/7 trample");
  });
  it("⭐ and then fixed (CR 611.2c): a creature that reaches power 4 afterwards gets neither bonus", () => {
    let s = resolve(goreclawAttacks({ hand: [inHand("gg", GIANT_GROWTH)], pool: { G: 1 } }));
    s = resolve(castAt(s, "user", "gg", "cc"));
    expect(team(s).cc).toBe("6/6");
  });
  it("the unfiltered team pump is untouched: Overrun reaches every creature you control, whatever its power", () => {
    let s = board({ hand: [inHand("ov", OVERRUN)], userBf: [perm("gc", GORECLAW), perm("rb", RUNECLAW_BEAR)], pool: { G: 5 } });
    s = resolve(cast(s, "user", "ov"));
    expect({ goreclaw: pt(s, "Goreclaw, Terror of Qal Sisma"), bear: pt(s, "Runeclaw Bear"), bearTrample: permanentHasKeyword(s, "rb", "Trample") }).toEqual({ goreclaw: "7/6", bear: "5/5", bearTrample: true });
  });
  it("SYNTHETIC — a keyword the engine cannot grant keeps the clause unparsed", () => {
    const parse = (text) => parseEffectClause(text, "Instant", { hasX: false, sourceScoped: true }).confidence;
    expect(parse("each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn")).toBe("high");
    expect(parse("each creature you control with power 4 or greater gets +1/+1 and gains banding until end of turn")).toBe("low");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("⭐ Mentor of the Meek", () => {
  const mentor = () => perm("m", MENTOR);
  /** Grizzly Bears enters beside Mentor with `spare` green mana left; Mentor's trigger has resolved to its payment choice. */
  function bearsEnter(spare) {
    let s = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [mentor()], pool: { G: 2 + spare } }), "gb");
    expect(stackOf(s)).toEqual(["Mentor of the Meek"]);
    s = resolve(s);
    expect(s.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user", cost: { kind: "mana", mana: { generic: 1 } } });
    return s;
  }
  it("⭐ a 2-power creature enters → the trigger; paying {1} on resolution draws a card", () => {
    const s = resolveOptionalManaPaymentChoice(bearsEnter(1), true);
    expect({ hand: hand(s), mana: s.players.user.manaPool.G, pending: s.pendingChoice ?? null }).toEqual({ hand: ["Forest"], mana: 0, pending: null });
  });
  it("⭐ declining draws nothing and spends nothing", () => {
    const s = resolveOptionalManaPaymentChoice(bearsEnter(1), false);
    expect({ hand: hand(s), mana: s.players.user.manaPool.G }).toEqual({ hand: [], mana: 1 });
  });
  it("⭐ unable to pay: choosing to pay with no mana draws nothing", () => {
    const s = resolveOptionalManaPaymentChoice(bearsEnter(0), true);
    expect({ hand: hand(s), mana: s.players.user.manaPool.G }).toEqual({ hand: [], mana: 0 });
  });
  it("⭐ a 3-power creature enters → no trigger", () => {
    const s = enter(board({ hand: [inHand("cc", CENTAUR_COURSER)], userBf: [mentor()], pool: { G: 4 } }), "cc");
    expect({ stack: stackOf(s), pending: s.pendingChoice ?? null }).toEqual({ stack: [], pending: null });
  });
  it("⭐ 'another': Mentor entering does not trigger itself — but it does trigger a Mentor already there", () => {
    const alone = enter(board({ hand: [inHand("m2", MENTOR)], pool: { W: 4 } }), "m2");
    expect({ stack: stackOf(alone), mentors: alone.players.user.battlefield.length }).toEqual({ stack: [], mentors: 1 });
    const second = enter(board({ hand: [inHand("m2", MENTOR)], userBf: [mentor()], pool: { W: 4 } }), "m2");
    expect(second.stack.map((o) => o.payload.params.sourceId)).toEqual(["m"]);
  });
  it("⭐ the power is the creature's power AS IT ENTERS, through the layers (the bundled rulings)", () => {
    const fired = (s) => stackOf(s).length;
    const row = {
      // a 2/2 entering under an anthem is a 3/3
      bearsUnderAnthem: fired(enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [mentor(), perm("ga", GLORIOUS_ANTHEM)], pool: { G: 2 } }), "gb")),
      // a 3/3 entering under "all creatures get -1/-1" is a 2/2
      courserUnderNight: fired(enter(board({ hand: [inHand("cc", CENTAUR_COURSER)], userBf: [mentor()], aiBf: [perm("n", NIGHT_OF_SOULS_BETRAYAL, "ai")], pool: { G: 3 } }), "cc")),
      // a 0/0 entering with three +1/+1 counters is a 3/3; with two, a 2/2
      endlessOneX3: fired(enter(board({ hand: [inHand("eo", ENDLESS_ONE)], userBf: [mentor()], pool: { G: 3 } }), "eo", (a) => a.xValue === 3)),
      endlessOneX2: fired(enter(board({ hand: [inHand("eo", ENDLESS_ONE)], userBf: [mentor()], pool: { G: 3 } }), "eo", (a) => a.xValue === 2)),
    };
    console.log(`WITNESS mentorEntersPower ${JSON.stringify(row)}`);
    expect(row).toEqual({ bearsUnderAnthem: 0, courserUnderNight: 1, endlessOneX3: 0, endlessOneX2: 1 });
  });
  it("the batched form reads the same power (Welcoming Vampire's rulings): a 2/2 under an anthem does not trigger it, a plain 2/2 does", () => {
    const vampire = () => perm("wv", WELCOMING_VAMPIRE);
    const plain = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [vampire()], pool: { G: 2 } }), "gb");
    const anthem = enter(board({ hand: [inHand("gb", GRIZZLY_BEARS)], userBf: [vampire(), perm("ga", GLORIOUS_ANTHEM)], pool: { G: 2 } }), "gb");
    expect({ plain: stackOf(plain), anthem: stackOf(anthem) }).toEqual({ plain: ["Welcoming Vampire"], anthem: [] });
    expect(hand(resolve(plain))).toEqual(["Forest"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the other carriers of 'another creature you control with power 2 or less enters' — each driven on a real board", () => {
  /** `watcher` is on the battlefield; Centaur Courser (power 3) then Grizzly Bears (power 2) enter. Returns the two states. */
  function entries(watcher) {
    const start = board({ hand: [inHand("cc", CENTAUR_COURSER), inHand("gb", GRIZZLY_BEARS)], userBf: [perm("w", watcher)], pool: { G: 5 } });
    const afterCourser = enter(start, "cc");
    const afterBears = enter(afterCourser, "gb");
    return { afterCourser, afterBears };
  }
  it("Serra Redeemer: two +1/+1 counters on the entering 2/2; nothing for the 3/3", () => {
    const { afterCourser, afterBears } = entries(SERRA_REDEEMER);
    expect(stackOf(afterCourser)).toEqual([]);
    const s = resolve(afterBears);
    expect({ bears: pt(s, "Grizzly Bears"), courser: pt(s, "Centaur Courser"), redeemer: pt(s, "Serra Redeemer") }).toEqual({ bears: "4/4", courser: "3/3", redeemer: "2/4" });
  });
  it("Inspiring Commander: gain 1 life and draw a card", () => {
    const { afterCourser, afterBears } = entries(INSPIRING_COMMANDER);
    expect(stackOf(afterCourser)).toEqual([]);
    const s = resolve(afterBears);
    expect({ life: s.players.user.life - afterBears.players.user.life, hand: hand(s) }).toEqual({ life: 1, hand: ["Forest"] });
  });
  it("Snarling Gorehound: surveil 1 (the engine's surveil choice is raised over the top card)", () => {
    const { afterCourser, afterBears } = entries(SNARLING_GOREHOUND);
    expect(stackOf(afterCourser)).toEqual([]);
    expect(resolve(afterBears).pendingChoice).toMatchObject({ kind: "scry-surveil", mode: "surveil", controller: "user", cards: [{ id: "lib1" }] });
  });
  it("Vicious Clown: +2/+0 until end of turn", () => {
    const { afterCourser, afterBears } = entries(VICIOUS_CLOWN);
    expect({ stack: stackOf(afterCourser), before: pt(afterBears, "Vicious Clown"), after: pt(resolve(afterBears), "Vicious Clown") }).toEqual({ stack: [], before: "2/3", after: "4/3" });
  });
  it("Marketwatch Phantom: gains flying until end of turn", () => {
    const { afterCourser, afterBears } = entries(MARKETWATCH_PHANTOM);
    expect({ stack: stackOf(afterCourser), before: permanentHasKeyword(afterBears, "w", "Flying"), after: permanentHasKeyword(resolve(afterBears), "w", "Flying") }).toEqual({ stack: [], before: false, after: true });
  });
  it("Wispdrinker Vampire stays body-only (its activated ability is unmodeled), but its now-detected trigger drains correctly", () => {
    const { afterCourser, afterBears } = entries(WISPDRINKER);
    expect(stackOf(afterCourser)).toEqual([]);
    const s = resolve(afterBears);
    expect({ you: s.players.user.life - afterBears.players.user.life, opponent: s.players.ai.life - afterBears.players.ai.life }).toEqual({ you: 1, opponent: -1 });
  });
  it("Irreverent Gremlin stays body-only: its trigger is detected but its effect is unparsed, so it resolves to the manual no-op", () => {
    const { afterCourser, afterBears } = entries(IRREVERENT_GREMLIN);
    expect({ courser: stackOf(afterCourser), bears: afterBears.stack.map((o) => o.payload.resolver) }).toEqual({ courser: [], bears: ["manual"] });
  });
  it("Neighborhood Guardian: one creature you control gets +1/+1 until end of turn", () => {
    const { afterCourser, afterBears } = entries(NEIGHBORHOOD_GUARDIAN);
    expect(stackOf(afterCourser)).toEqual([]);
    const total = (s) => s.players.user.battlefield.reduce((n, p) => n + creaturePower(p, s) + creatureToughness(p, s), 0);
    expect(total(resolve(afterBears)) - total(afterBears)).toBe(2);
  });
});
