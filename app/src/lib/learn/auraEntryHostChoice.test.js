/**
 * auraEntryHostChoice.test.js — a PERSON chooses what their Aura enchants as it enters the battlefield without being cast, through
 * the aura-entry-host pause; every seat the AI plays keeps the house pick, unchanged (auraReentry.test.js pins that policy).
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — entering by any means other than resolving as an Aura spell, with no object named by the effect, "that player
 *     chooses what it will enchant as the Aura enters the battlefield. The player must choose a legal object or player according to
 *     the Aura's enchant ability and any other applicable effects."
 *   · CR 303.4g — with no legal object or player, the Aura remains in its current zone.
 * The bundled Brago, King Eternal ruling (scryfall.rulings.local.json): the Aura "doesn't target anything", and it "can't enter the
 * battlefield enchanting a permanent that enters the battlefield at the same time".
 *
 * Engine paths: Displacer Kitten's cast trigger, Brago's combat-damage trigger (one event), Sun Titan's enters trigger through its
 * "you may" (the optional-effect pause, then the host), the session driver, the wire view and the hook's payload; and the roads the
 * Aura lifts opened — Academy Rector's search through the session's tutor settle, Replenish's one-event return of two Auras, Flash
 * Photography's token copy doubled by Doubling Season (one question per copy). The dig's settle is still witnessed on a pause built
 * the way its atom builds it (no dig puts an Aura onto the battlefield yet), so there the settle path is what is under test.
 * Every board is built so the choice under test decides the outcome: the person's pick is never the house's. Real oracle fixtures
 * (bundled Scryfall snapshot, app/data/scryfall.oracle.local.json, generated 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, findPermanent } from "./gameState.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { checkCastTriggers, checkCombatDamageTriggers, checkDiesTriggers, checkEnterTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { autoPickTriggerTarget, chooseTriggerTargets, flushTriggers, raiseTriggerTargetChoice, resolveTopOfStack, settleTriggerTargetChoice } from "./gameEngine.js";
import { resolveAuraEntryHostChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { setPendingImpulseDigChoice, setPendingTutorChoice } from "./pendingChoice.js";
import { advanceUntilDecision, applyPendingChoice, createLearnSession } from "./learnSession.js";
import { decisionViewForWire } from "./decisionWire.js";
import { auraEntryHostChoicePayload } from "../../hooks/useLearnSession.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"colors":["W"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"colors":["G"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."};
const KITTEN = {"name":"Displacer Kitten","type":"Creature — Cat Beast","mana":"{3}{U}","cmc":4,"colors":["U"],"keywords":["Avoidance"],"oracle":"Avoidance — Whenever you cast a noncreature spell, exile up to one target nonland permanent you control, then return that card to the battlefield under its owner's control.","power":"2","toughness":"2"};
const BRAGO = {"name":"Brago, King Eternal","type":"Legendary Creature — Spirit Noble","mana":"{2}{W}{U}","cmc":4,"colors":["U","W"],"keywords":["Flying"],"oracle":"Flying\nWhenever Brago deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner's control.","power":"2","toughness":"4"};
const SUN_TITAN = {"name":"Sun Titan","type":"Creature — Giant","mana":"{4}{W}{W}","cmc":6,"colors":["W"],"keywords":["Vigilance"],"oracle":"Vigilance\nWhenever this creature enters or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield.","power":"6","toughness":"6"};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"colors":["U"],"keywords":["Scry"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const BEAR = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"colors":["G"],"keywords":[],"oracle":"","power":"2","toughness":"2"};
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"colors":["G"],"keywords":[],"oracle":"","power":"6","toughness":"4"};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"colors":["R"],"keywords":[],"oracle":"","power":"3","toughness":"3"};
const SCOUT = {"name":"Gladecover Scout","type":"Creature — Elf Scout","mana":"{G}","cmc":1,"colors":["G"],"keywords":["Hexproof"],"oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","power":"1","toughness":"1"};
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"colors":["B"],"keywords":["First strike","Protection"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)","power":"2","toughness":"2"};
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"colors":["G"],"keywords":[],"oracle":"When this creature enters, draw a card.","power":"1","toughness":"1"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"colors":[],"keywords":[],"oracle":"({T}: Add {G}.)"};
const ACADEMY_RECTOR = {"name":"Academy Rector","type":"Creature — Human Cleric","mana":"{3}{W}","cmc":4,"colors":["W"],"keywords":[],"oracle":"When this creature dies, you may exile it. If you do, search your library for an enchantment card, put that card onto the battlefield, then shuffle.","power":"1","toughness":"2"};
const REPLENISH = {"name":"Replenish","type":"Sorcery","mana":"{3}{W}","cmc":4,"colors":["W"],"keywords":[],"oracle":"Return all enchantment cards from your graveyard to the battlefield. (Auras with nothing to enchant remain in your graveyard.)"};
const FLASH_PHOTOGRAPHY = {"name":"Flash Photography","type":"Sorcery","mana":"{2}{U}{U}","cmc":4,"colors":["U"],"keywords":["Flashback"],"oracle":"You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U}"};
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","cmc":5,"colors":["G"],"keywords":[],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."};
const COPY_ENCHANTMENT = {"name":"Copy Enchantment","type":"Enchantment","mana":"{2}{U}","cmc":3,"colors":["U"],"keywords":[],"oracle":"You may have this enchantment enter as a copy of any enchantment on the battlefield."};

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** An Aura and its host, linked both ways, as the engine keeps them. */
const on = (aura, host) => [{ ...aura, attachedTo: host.id }, { ...host, attachments: [...(host.attachments || []), aura.id] }];
/** A main-phase board on the user's turn; `humans` is state.humanSeats (createLearnSession stamps ["user"] below Expert). */
function board({ user = [], ai = [], userGy = [], userLibrary = null, humans = ["user"] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = userLibrary || [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, graveyard: userGy, library: lib }, ai: { ...g.players.ai, battlefield: ai } } };
}
const resolveAll = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
const named = (s, name) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === name);
const hostOf = (s, name) => { const p = named(s, name)[0]; return p?.attachedTo ? findPermanent(s, p.attachedTo)?.permanent.card?.name ?? null : null; };
const events = (s, kind) => (s.log || []).filter((e) => e.kind === kind);
const offered = (pc) => (pc?.candidates || []).map((c) => `${c.name}/${c.controller}`).sort();
/**
 * A person chooses the targets of their own triggered ability as it goes on the stack (the trigger-target pause, CR 603.3d —
 * triggerTargetChoice.test.js): the Kitten's and Brago's are the person's here, so the person answers with the permanents `ids`
 * before the blink resolves. An AI's ability, or one at a table with no person, asks nothing and passes through.
 */
const aimTrigger = (s, ids) => {
  const asked = raiseTriggerTargetChoice(s);
  if (asked.pendingChoice?.kind !== "trigger-target") return s;
  const want = [...ids].sort().join(",");
  const pick = asked.pendingChoice.candidates.find((c) => c.targets.map((x) => x.id).sort().join(",") === want);
  expect(pick, `a legal choice of ${want}`).toBeTruthy();
  return settleTriggerTargetChoice(asked, pick.id);
};
const kittenSees = (s, caster = "user", ids = ["aura"]) => resolveAll(aimTrigger(flushTriggers(checkCastTriggers(s, { spellCard: { ...OPT, id: "c-opt" }, casterId: caster }), { chooseTargets: chooseTriggerTargets }), ids));
const bragoHits = (s, ids) => resolveAll(aimTrigger(flushTriggers(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "brago", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: chooseTriggerTargets }), ids));
const withoutHumanSeats = (s) => { const { humanSeats: _h, ...rest } = s; return rest; };

/** The Kitten board: your Pacifism on the opponent's Bear, the opponent's Craw Wurm beside it. The house would take the Wurm. */
const kittenBoard = (extra = {}) => {
  const [pac, bear] = on(perm("aura", PACIFISM, "user"), perm("bear", BEAR, "ai"));
  return board({ user: [perm("kitten", KITTEN, "user"), pac], ai: [bear, perm("wurm", WURM, "ai")], ...extra });
};

describe("CR 303.4f — a person chooses what their returning Aura enchants", () => {
  it("⭐ Displacer Kitten blinks your Pacifism: you are asked, every legal host is offered (yours too — nothing is targeted), and your pick wins: the Bear, where the house takes the Wurm", () => {
    const paused = kittenSees(kittenBoard());
    const pc = paused.pendingChoice;
    const after = resolveAuraEntryHostChoice(paused, "bear");
    const row = {
      asked: [pc?.kind, pc?.controller, pc?.cardName, pc?.sourceName], offered: offered(pc), houseWouldTake: pc?.suggestedId,
      host: hostOf(after, "Pacifism"), bearLocked: permanentHasKeyword(after, "bear", "cantAttack"), wurmLocked: permanentHasKeyword(after, "wurm", "cantAttack"),
      pacifisms: named(after, "Pacifism").length, exile: after.players.user.exile.length, pending: after.pendingChoice ?? null,
      enteredAttached: events(after, "enters-attached").map((e) => e.hostName),
    };
    console.log(`  WITNESS kitten ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: ["aura-entry-host", "user", "Pacifism", "Displacer Kitten"], offered: ["Craw Wurm/ai", "Displacer Kitten/user", "Grizzly Bears/ai"], houseWouldTake: "wurm",
      host: "Grizzly Bears", bearLocked: true, wurmLocked: false, pacifisms: 1, exile: 0, pending: null, enteredAttached: ["Grizzly Bears"],
    });
  });

  it("the pause holds the step, not its result: the board is the one the blink began on (Pacifism still on the Bear), and the trigger's resume rides it", () => {
    const paused = kittenSees(kittenBoard());
    expect({ host: hostOf(paused, "Pacifism"), exile: paused.players.user.exile.length, stack: paused.stack.length, step: paused.pendingChoice?.step?.atom?.op, resume: !!paused.pendingChoice?.resume })
      .toEqual({ host: "Grizzly Bears", exile: 0, stack: 0, step: "blink", resume: true });
  });

  it("hexproof doesn't keep a creature out (nothing is targeted); protection from white does (CR 702.16c): the Scout is offered, the Black Knight never — even pumped", () => {
    // The Wurm is there so the blink is worth taking (the Kitten's "up to one" flickers only what gains: the re-aim, +4).
    const [pac, bear] = on(perm("aura", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const paused = kittenSees(board({ user: [perm("kitten", KITTEN, "user"), pac],
      ai: [bear, perm("wurm", WURM, "ai"), perm("scout", SCOUT, "ai"), perm("knight", BLACK_KNIGHT, "ai", { counters: { "+1/+1": 3 } })] }));
    expect(offered(paused.pendingChoice)).toEqual(["Craw Wurm/ai", "Displacer Kitten/user", "Gladecover Scout/ai", "Grizzly Bears/ai"]);
  });

  it("a game saved mid-question restores intact (plain JSON — pendingChoice.js): the restored pause settles exactly as the live one", () => {
    const paused = kittenSees(kittenBoard());
    const restored = JSON.parse(JSON.stringify(paused));
    expect(resolveAuraEntryHostChoice(restored, "bear")).toEqual(JSON.parse(JSON.stringify(resolveAuraEntryHostChoice(paused, "bear"))));
    expect(hostOf(resolveAuraEntryHostChoice(restored, "bear"), "Pacifism")).toBe("Grizzly Bears");
  });

  it("an answer that isn't a legal host takes the house pick — the Aura must enter, and no host is made up", () => {
    const paused = kittenSees(kittenBoard());
    expect({ garbage: hostOf(resolveAuraEntryHostChoice(paused, "not-a-permanent"), "Pacifism"), none: hostOf(resolveAuraEntryHostChoice(paused, null), "Pacifism") })
      .toEqual({ garbage: "Craw Wurm", none: "Craw Wurm" });
  });

  // Sun Titan's enters trigger ("you MAY return …") pauses on the optional-effect choice; the person says yes, then picks the host.
  const titanEnters = (s) => {
    const mayPause = resolveAll(flushTriggers(checkEnterTriggers(s, findPermanent(s, "titan").permanent), { chooseTargets: chooseTriggerTargets }));
    expect(mayPause.pendingChoice?.kind).toBe("optional-effect");
    return resolveAll(resolveOptionalChoice(mayPause, true));
  };

  it("⭐ Sun Titan returns Pacifism from your graveyard: \"you may\" first, then where it goes — your pick, the Bear, not the house's Wurm", () => {
    const paused = titanEnters(board({ user: [perm("titan", SUN_TITAN, "user")], ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")], userGy: [{ ...PACIFISM, id: "gy-pac" }] }));
    const after = resolveAuraEntryHostChoice(paused, "bear");
    expect({ asked: paused.pendingChoice?.kind, offered: offered(paused.pendingChoice), host: hostOf(after, "Pacifism"), graveyard: after.players.user.graveyard.length, pending: after.pendingChoice ?? null })
      .toEqual({ asked: "aura-entry-host", offered: ["Craw Wurm/ai", "Grizzly Bears/ai", "Sun Titan/user"], host: "Grizzly Bears", graveyard: 0, pending: null });
  });

  it("one legal host is no choice: Sun Titan returns Pacifism with only itself to enchant — no pause, it goes on the Titan", () => {
    const after = titanEnters(board({ user: [perm("titan", SUN_TITAN, "user")], ai: [perm("forest", FOREST, "ai")], userGy: [{ ...PACIFISM, id: "gy-pac" }] }));
    expect({ pending: after.pendingChoice ?? null, host: hostOf(after, "Pacifism") }).toEqual({ pending: null, host: "Sun Titan" });
  });
});

describe("one event — \"The Aura can't enter the battlefield enchanting a permanent that enters the battlefield at the same time\"", () => {
  // Brago goes (it returns untapped), the Visionary goes (its enters ability fires again), Rancor goes with it; the Giant and your
  // Bear carry +1/+1 counters (a reason to stay). Rancor is last on the battlefield, so it returns after Brago and the Visionary.
  const bragoBoard = () => {
    const [rancor, vis] = on(perm("rancor", RANCOR, "user"), perm("vis", VISIONARY, "user"));
    return board({ user: [perm("brago", BRAGO, "user", { tapped: true }), vis, perm("giant", GIANT, "user", { counters: { "+1/+1": 1 } }), perm("mybear", BEAR, "user", { counters: { "+1/+1": 1 } }), rancor],
      ai: [perm("wurm", WURM, "ai")] });
  };

  it("⭐ Brago returns Rancor with the Visionary and Brago itself: neither is offered, only what stays — and your pick (your Bear) wins over the house's (the Giant)", () => {
    const paused = bragoHits(bragoBoard(), ["brago", "vis", "rancor"]); // the person blinks Brago, the Visionary and Rancor
    const pc = paused.pendingChoice;
    const after = resolveAuraEntryHostChoice(paused, "mybear");
    const row = { asked: pc?.cardName, offered: offered(pc), houseWouldTake: pc?.suggestedId, host: hostOf(after, "Rancor"), myBearPower: permanentPower(after, "mybear"),
      back: ["Brago, King Eternal", "Elvish Visionary"].map((n) => named(after, n).length), exile: after.players.user.exile.length };
    console.log(`  WITNESS brago ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: "Rancor", offered: ["Craw Wurm/ai", "Grizzly Bears/user", "Hill Giant/user"], houseWouldTake: "giant", host: "Grizzly Bears", myBearPower: 5, back: [1, 1], exile: 0 });
  });

  it("⭐ two of your Auras in one event: you are asked for each in turn, the first answer kept, then everything returns ONCE", () => {
    const [pac, bear] = on(perm("pac", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const [rancor, vis] = on(perm("rancor", RANCOR, "user"), perm("vis", VISIONARY, "user"));
    const s = board({ user: [perm("brago", BRAGO, "user", { tapped: true }), vis, perm("giant", GIANT, "user", { counters: { "+1/+1": 1 } }), perm("mybear", BEAR, "user", { counters: { "+1/+1": 1 } }), pac, rancor],
      ai: [bear, perm("wurm", WURM, "ai")] });
    const first = bragoHits(s, ["brago", "vis", "pac", "rancor"]); // the person blinks Brago, the Visionary and both Auras
    const second = resolveAuraEntryHostChoice(first, "bear");
    const after = resolveAuraEntryHostChoice(second, "mybear");
    const row = {
      order: [first.pendingChoice?.cardName, second.pendingChoice?.cardName], house: [first.pendingChoice?.suggestedId, second.pendingChoice?.suggestedId],
      kept: second.pendingChoice?.answers, hosts: [hostOf(after, "Pacifism"), hostOf(after, "Rancor")], pending: after.pendingChoice ?? null,
      enteredAttached: events(after, "enters-attached").map((e) => `${e.cardName}->${e.hostName}`), visionaries: named(after, "Elvish Visionary").length,
    };
    console.log(`  WITNESS two-auras ${JSON.stringify(row)}`);
    expect(row).toEqual({
      order: ["Pacifism", "Rancor"], house: ["wurm", "giant"], kept: { "c-pac": "bear" }, hosts: ["Grizzly Bears", "Grizzly Bears"], pending: null,
      enteredAttached: ["Pacifism->Grizzly Bears", "Rancor->Grizzly Bears"], visionaries: 1,
    });
    // Each Aura on ITS pick: Pacifism on the opponent's Bear, Rancor on yours.
    expect([named(after, "Pacifism")[0].attachedTo, named(after, "Rancor")[0].attachedTo]).toEqual(["bear", "mybear"]);
  });
});

describe("every seat the AI plays keeps the house pick — the same path, byte for byte", () => {
  it("⭐ the AI's own Aura in a game with a person at the table: no pause, and the state is exactly the one a table without a person reaches", () => {
    const aiBoard = (humans) => {
      const [pac, bear] = on(perm("aura", PACIFISM, "ai"), perm("bear", BEAR, "user"));
      return board({ user: [bear, perm("wurm", WURM, "user")], ai: [perm("kitten", KITTEN, "ai"), pac], humans });
    };
    const withPerson = kittenSees(aiBoard(["user"]), "ai");
    const without = kittenSees(aiBoard(null), "ai");
    expect({ pending: withPerson.pendingChoice ?? null, host: hostOf(withPerson, "Pacifism") }).toEqual({ pending: null, host: "Craw Wurm" });
    expect(withoutHumanSeats(withPerson)).toEqual(without);
  });

  it("your own Aura at a table with no person (Expert, every self-play game): the house pick, no pause — the slice's path", () => {
    const after = kittenSees(kittenBoard({ humans: null }));
    expect({ pending: after.pendingChoice ?? null, host: hostOf(after, "Pacifism") }).toEqual({ pending: null, host: "Craw Wurm" });
  });

  it("outside an atom no ask is open: the blink resolver called directly takes the house pick even for a person", () => {
    const after = ATOM_RESOLVERS.blink(kittenBoard(), { op: "blink", returnTo: "owner" }, { controller: "user", targets: [{ id: "aura" }] });
    expect({ pending: after.pendingChoice ?? null, host: hostOf(after, "Pacifism") }).toEqual({ pending: null, host: "Craw Wurm" });
  });

  it("the AI's flicker read is unchanged by a person at the table: a person's Brago waits for its controller, and the automatic answer to that question is the set a table without a person blinks", () => {
    const [rancor, vis] = on(perm("rancor", RANCOR, "user"), perm("vis", VISIONARY, "user"));
    const s = (humans) => board({ user: [perm("brago", BRAGO, "user", { tapped: true }), vis, perm("giant", GIANT, "user", { counters: { "+1/+1": 1 } }), rancor], humans });
    const flushed = (humans) => flushTriggers(checkCombatDamageTriggers(s(humans), [{ kind: "combat-damage-player", attackerId: "brago", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: chooseTriggerTargets });
    const without = (flushed(null).stack.at(-1)?.targets || []).map((t) => t.id).sort();
    const asked = raiseTriggerTargetChoice(flushed(["user"]));
    const auto = asked.pendingChoice.candidates[Number(autoPickTriggerTarget(asked, asked.pendingChoice))].targets.map((t) => t.id).sort();
    expect({ asked: asked.pendingChoice.kind, waiting: asked.stack.at(-1)?.targets, auto }).toEqual({ asked: "trigger-target", waiting: [], auto: without });
    expect(without).toEqual(["brago", "rancor", "vis"]);
  });
});

describe("the session — the driver asks the person, the wire carries what the panel reads, the hook's payload settles it", () => {
  const deck = (p) => Array.from({ length: 40 }, (_, i) => ({ ...FOREST, id: `${p}-f${i}` }));

  it("createLearnSession marks the user seat as a person's below Expert, and no seat at Expert", () => {
    const seats = (difficulty) => createLearnSession({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty, seed: 7 }).state.humanSeats ?? null;
    expect({ beginner: seats("beginner"), intermediate: seats("intermediate"), expert: seats("expert") }).toEqual({ beginner: ["user"], intermediate: ["user"], expert: null });
  });

  it("⭐ advanceUntilDecision surfaces the question at beginner; the wire keeps the panel's fields and drops the step; the hook's exact payload puts Pacifism on the Bear", () => {
    const session = { status: "active", state: kittenSees(kittenBoard()), difficulty: "beginner", decisionLog: [] };
    const { session: asked, decision } = advanceUntilDecision(session);
    const wire = decisionViewForWire(decision);
    const { session: answered } = applyPendingChoice(asked, auraEntryHostChoicePayload("bear"));
    const row = {
      decision: decision.kind, wireKeys: Object.keys(wire).sort(), payload: auraEntryHostChoicePayload("bear"), host: hostOf(answered.state, "Pacifism"),
      logged: answered.decisionLog.map((e) => e.action?.kind).filter((k) => k === "aura-entry-host-choice"),
    };
    console.log(`  WITNESS session ${JSON.stringify(row)}`);
    expect(row).toEqual({
      decision: "aura-entry-host", wireKeys: ["candidates", "cardName", "controller", "kind", "sourceName"], payload: { kind: "aura-entry-host", hostId: "bear" },
      host: "Grizzly Bears", logged: ["aura-entry-host-choice"],
    });
  });

  it("a stale submit for another kind is dropped (the kind echo, WI-5): the question is still pending", () => {
    const session = { status: "active", state: kittenSees(kittenBoard()), difficulty: "beginner", decisionLog: [] };
    const { session: asked } = advanceUntilDecision(session);
    const { decision } = applyPendingChoice(asked, { kind: "change-target", targetId: "bear" });
    expect(decision.kind).toBe("aura-entry-host");
  });

  it("a pilot is offered one action per legal host and its pick wins; with no pilot the auto path takes the house pick", () => {
    const state = kittenSees(kittenBoard());
    let offeredLabels = null;
    const decide = ({ legalActions }) => {
      if (legalActions[0]?.choiceKind !== "aura-entry-host") return undefined;
      offeredLabels = legalActions.map((a) => a.label).sort();
      return legalActions.find((a) => a.value === "bear");
    };
    const piloted = advanceUntilDecision({ status: "active", state, difficulty: "expert", decisionLog: [] }, { decide });
    const auto = advanceUntilDecision({ status: "active", state, difficulty: "expert", decisionLog: [] });
    expect({ offeredLabels, piloted: hostOf(piloted.session.state, "Pacifism"), auto: hostOf(auto.session.state, "Pacifism") })
      .toEqual({ offeredLabels: ["Enchant Craw Wurm", "Enchant Displacer Kitten", "Enchant Grizzly Bears"], piloted: "Grizzly Bears", auto: "Craw Wurm" });
  });
});

describe("the settles that enter a card — the Aura's question comes after the settle's own answer", () => {
  const session = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });
  const library = () => [{ ...PACIFISM, id: "d-pac" }, { ...BEAR, id: "d-x1" }, { ...WURM, id: "d-x2" }, { ...GIANT, id: "d-y1" }, { ...GIANT, id: "d-y2" }];
  const digPause = (humans) => setPendingImpulseDigChoice(board({ ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")], userLibrary: library(), humans }),
    { controller: "user", candidates: [{ id: "d-pac", name: "Pacifism", type: PACIFISM.type }, { id: "d-x1", name: "Grizzly Bears", type: BEAR.type }], restTo: "bottom", keep: 1, lookedAt: 3, chosenTo: "battlefield", restOrder: "random" });

  it("⭐ a dig that puts Pacifism onto the battlefield: you pick the card, then its host; the rest go to the bottom in the same random order the house's run gives", () => {
    const { session: asked, decision } = applyPendingChoice(session(digPause(["user"])), { kind: "impulse-dig", cardId: "d-pac" });
    const { session: answered } = applyPendingChoice(asked, auraEntryHostChoicePayload("bear"));
    const { session: house } = applyPendingChoice({ ...session(digPause(null)), difficulty: "expert" }, { kind: "impulse-dig", cardId: "d-pac" });
    const lib = (s) => s.state.players.user.library.map((c) => c.id);
    expect({ asked: decision.kind, offered: offered(decision), host: hostOf(answered.state, "Pacifism"), houseHost: hostOf(house.state, "Pacifism"), sameLibrary: lib(answered) })
      .toEqual({ asked: "aura-entry-host", offered: ["Craw Wurm/ai", "Grizzly Bears/ai"], host: "Grizzly Bears", houseHost: "Craw Wurm", sameLibrary: lib(house) });
  });

  it("a tutor that puts Pacifism onto the battlefield: the host after the search, the shuffle the house's run gives", () => {
    const tutorPause = (humans) => setPendingTutorChoice(board({ ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")], userLibrary: library(), humans }),
      { controller: "user", candidates: [{ id: "d-pac", name: "Pacifism" }], destination: "battlefield", sourceName: "Test Tutor" });
    const { session: asked, decision } = applyPendingChoice(session(tutorPause(["user"])), { kind: "tutor-search", cardId: "d-pac" });
    const { session: answered } = applyPendingChoice(asked, auraEntryHostChoicePayload("bear"));
    const { session: house } = applyPendingChoice({ ...session(tutorPause(null)), difficulty: "expert" }, { kind: "tutor-search", cardId: "d-pac" });
    const lib = (s) => s.state.players.user.library.map((c) => c.id);
    expect({ asked: decision.kind, source: decision.sourceName, host: hostOf(answered.state, "Pacifism"), houseHost: hostOf(house.state, "Pacifism"), sameLibrary: lib(answered) })
      .toEqual({ asked: "aura-entry-host", source: "Test Tutor", host: "Grizzly Bears", houseHost: "Craw Wurm", sameLibrary: lib(house) });
  });
});

describe("the roads the Aura lifts opened — each asks a person, none of them knows the pause exists", () => {
  /** A beginner session around `state` (a person at the user seat), driven to its first decision. */
  const session = (state) => advanceUntilDecision({ status: "active", state, difficulty: "beginner", decisionLog: [] });

  it("⭐ Academy Rector dies: you exile it, you pick Pacifism from your library, then where it goes — the session's own tutor settle asks", () => {
    const rector = { ...createPermanent({ id: "rector", card: { ...ACADEMY_RECTOR, id: "c-rector" }, controller: "user" }), damageMarked: 99 };
    const library = [{ ...PACIFISM, id: "lib-pac" }, { ...FOREST, id: "lib-f1" }, { ...FOREST, id: "lib-f2" }];
    const s0 = board({ user: [rector], ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")], userLibrary: library });
    const lethal = destroyLethalCreatures(s0);
    const dying = flushTriggers(checkDiesTriggers(lethal.state, lethal.dead), {});
    const steps = [];
    let { session: s, decision } = session(resolveAll(dying));
    steps.push(decision.kind);
    ({ session: s, decision } = applyPendingChoice(s, { kind: "optional-exile-self-payment", exile: true }));
    steps.push(decision.kind);
    ({ session: s, decision } = applyPendingChoice(s, { kind: "tutor-search", cardId: "lib-pac" }));
    steps.push(decision.kind);
    const asked = { offered: offered(decision), source: decision.sourceName, house: s.state.pendingChoice?.suggestedId };
    ({ session: s } = applyPendingChoice(s, auraEntryHostChoicePayload("bear")));
    const row = { steps, ...asked, host: hostOf(s.state, "Pacifism"), library: s.state.players.user.library.map((c) => c.id).sort() };
    console.log(`  WITNESS academyRector ${JSON.stringify(row)}`);
    expect(row).toEqual({ steps: ["optional-exile-self-payment", "tutor-search", "aura-entry-host"], offered: ["Craw Wurm/ai", "Grizzly Bears/ai"],
      source: "Academy Rector", house: "wurm", host: "Grizzly Bears", library: ["lib-f1", "lib-f2"] });
  });

  /** Cast a spell from the user's hand through the real offer, dispatch and stack. */
  const cast = (s, cardId) => {
    const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
    expect(action, `a legal cast of ${cardId}`).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, action));
  };
  const withHand = (s, hand, pool) => ({ ...s, consecutivePasses: 0, players: { ...s.players, user: { ...s.players.user, hand, manaPool: { ...s.players.user.manaPool, ...pool } } } });

  it("⭐ Replenish returns your Pacifism and your Rancor as one event: you are asked for each in turn, then both enter once", () => {
    const s = withHand(board({ user: [perm("mybear", BEAR, "user")], ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")],
      userGy: [{ ...PACIFISM, id: "gy-pac" }, { ...RANCOR, id: "gy-rancor" }] }), [{ ...REPLENISH, id: "replenish" }], { W: 1, C: 3 });
    const first = cast(s, "replenish");
    const second = resolveAuraEntryHostChoice(first, "bear");
    const after = resolveAuraEntryHostChoice(second, "wurm");
    const row = { asked: [first.pendingChoice?.cardName, second.pendingChoice?.cardName], house: [first.pendingChoice?.suggestedId, second.pendingChoice?.suggestedId],
      hosts: [hostOf(after, "Pacifism"), hostOf(after, "Rancor")], entered: events(after, "enters-attached").map((e) => e.cardName), graveyard: after.players.user.graveyard.map((c) => c.name).sort() };
    console.log(`  WITNESS replenish ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: ["Pacifism", "Rancor"], house: ["wurm", "mybear"], hosts: ["Grizzly Bears", "Craw Wurm"], entered: ["Pacifism", "Rancor"],
      graveyard: ["Replenish"] });
  });

  it("⭐ Flash Photography copies your Pacifism twice (Doubling Season): one question per copy, kept apart — each copy on its own pick", () => {
    const [pac, bear] = on(perm("pac", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const s = withHand(board({ user: [pac, perm("season", DOUBLING_SEASON, "user")], ai: [bear, perm("wurm", WURM, "ai"), perm("giant", GIANT, "ai")] }),
      [{ ...FLASH_PHOTOGRAPHY, id: "flash" }], { U: 2, C: 2 });
    const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "flash" && a.targets?.[0]?.id === "pac");
    expect(action, "Flash Photography aimed at your Pacifism").toBeTruthy();
    const first = resolveTopOfStack(dispatchAction(s, action));
    const second = resolveAuraEntryHostChoice(first, "giant");
    const after = resolveAuraEntryHostChoice(second, "bear");
    const copies = Object.values(after.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === "Pacifism" && p.card?.token);
    const row = { asked: [first.pendingChoice?.kind, second.pendingChoice?.kind], keys: [first.pendingChoice?.cardId, second.pendingChoice?.cardId],
      copyHosts: copies.map((p) => findPermanent(after, p.attachedTo)?.permanent.card?.name).sort(), pending: after.pendingChoice ?? null };
    console.log(`  WITNESS flashPhotography ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: ["aura-entry-host", "aura-entry-host"], keys: ["pac#0", "pac#1"], copyHosts: ["Grizzly Bears", "Hill Giant"], pending: null });
  });

  it("⭐ Copy Enchantment copies your Pacifism: you pick what to copy, then what the copy enchants — the session's own clone settle asks", () => {
    const [pac, bear] = on(perm("pac", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const s = withHand(board({ user: [pac], ai: [bear, perm("wurm", WURM, "ai")] }), [{ ...COPY_ENCHANTMENT, id: "copyench" }], { U: 2, C: 2 });
    let { session: sess, decision } = session(cast(s, "copyench"));
    const steps = [decision.kind]; // the driver surfaces the copy choice to the person
    ({ session: sess, decision } = applyPendingChoice(sess, { kind: "clone-search", permId: "pac" }));
    steps.push(decision.kind);
    const asked = { offered: offered(decision), house: sess.state.pendingChoice?.suggestedId };
    ({ session: sess } = applyPendingChoice(sess, auraEntryHostChoicePayload("bear")));
    const copy = Object.values(sess.state.players).flatMap((p) => p.battlefield).find((p) => p.card?.name === "Pacifism" && p.id !== "pac");
    const row = { steps, ...asked, copyOn: copy?.attachedTo ? findPermanent(sess.state, copy.attachedTo)?.permanent.card?.name : null, bearPacifisms: findPermanent(sess.state, "bear")?.permanent.attachments?.length };
    console.log(`  WITNESS copyEnchantment ${JSON.stringify(row)}`);
    expect(row).toEqual({ steps: ["clone-search", "aura-entry-host"], offered: ["Craw Wurm/ai", "Grizzly Bears/ai"], house: "wurm", copyOn: "Grizzly Bears", bearPacifisms: 2 });
  });
});
