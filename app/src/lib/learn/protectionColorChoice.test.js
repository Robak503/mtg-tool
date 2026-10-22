/**
 * protectionColorChoice.test.js — "protection from the color of your choice" (Mother of Runes, Giver of Runes, Gods Willing, Benevolent
 * Bodyguard …): the colour is chosen by the controller as the spell or ability resolves, knowing what is on the stack.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 608.2d — "If an effect of a spell or ability offers any choices other than choices already made as part of casting the spell,
 *     activating the ability, or otherwise putting the spell or ability on the stack, the player announces these while applying the
 *     effect." The bundled Gods Willing ruling (2013-09-15): "You choose the color as Gods Willing resolves."
 *   · CR 702.16b — a permanent with protection can't be targeted by spells with the stated quality or by abilities from a source with
 *     it; as the spell or ability resolves, its target is illegal (CR 608.2b).
 *   · CR 702.16e — damage that sources with the stated quality would deal to it is prevented.
 *
 * THE GAP (b780b241, choicePolicy.js:216): autoPickProtectionColor read only the opponents' board, never the stack, for the AI and for
 * the person alike — in response to a red Lightning Bolt, Mother of Runes could give protection from green and the creature died; and a
 * person was never asked.
 *
 * FALSE-NEGATIVE SAFE: a threat is read only where the picked colour really stops it in this engine. Since 2026-10-21 that includes a
 * colourless one (protection from colorless is enforced — CR 105.2c) and an ability whose source has left the battlefield (the CR 608.2b
 * re-check reads its last known colours: Executioner's Capsule, sacrificed, is black); a source whose colours the engine can't tell
 * is still never read (protectionLastKnownColorless.test.js).
 *
 * Engine paths: the activation, cast and resolution through legalChoices + actionDispatcher; the session driver (advanceUntilDecision /
 * applyChoice / applyPendingChoice) for a person's question. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, read
 * 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentProtectionColors } from "./layers.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { isSerializable } from "../server/learnSaveSchema.js";
import { autoPickProtectionColor } from "./choicePolicy.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim, cardIndex.publicCard) ─────────────────────────────────────────────────────────────────────
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."};
const GIVER_OF_RUNES = {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn."};
const BENEVOLENT_BODYGUARD = {"name":"Benevolent Bodyguard","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"Sacrifice this creature: Target creature you control gains protection from the color of your choice until end of turn."};
const GODS_WILLING = {"name":"Gods Willing","type":"Instant","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["W"],"colorIdentity":["W"],"oracle":"Target creature you control gains protection from the color of your choice until end of turn. (It can't be blocked, targeted, dealt damage, enchanted, or equipped by anything of that color.)\nScry 1."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Pyroclasm deals 2 damage to each creature."};
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
const MOGG_FANATIC = {"name":"Mogg Fanatic","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Sacrifice this creature: It deals 1 damage to any target."};
const EXECUTIONERS_CAPSULE = {"name":"Executioner's Capsule","type":"Artifact","mana":"{B}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"{1}{B}, {T}, Sacrifice this artifact: Destroy target nonblack creature."};
const ROD_OF_RUIN = {"name":"Rod of Ruin","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{3}, {T}: This artifact deals 1 damage to any target."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"{T}: Add {G}."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["R"],"oracle":"({T}: Add {R}.)"};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["B"],"oracle":"({T}: Add {B}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["W"],"oracle":"({T}: Add {W}.)"};

// ── boards ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1 });
const C = (id, card) => ({ id, ...card });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));
const LIB = (pid) => Array.from({ length: 6 }, (_, i) => C(`${pid}-lib${i}`, GRIZZLY_BEARS));

/** A two-seat game in `active`'s precombat main phase, the stack empty, `active` holding priority; `humans` is state.humanSeats. */
function duel({ user = [], ai = [], userHand = [], aiHand = [], humans = null, active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, ...(humans ? { humanSeats: humans } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active,
    consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] },
    players: {
      ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand: userHand, graveyard: [], library: LIB("user") },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, graveyard: [], library: LIB("ai") },
    },
  };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
const targetsIt = (id) => (a) => (a.targets || []).some((t) => t.id === id);
const activateAt = (s, pid, sourceId, targetId) => act(s, pid, "activate-ability", (a) => a.permanentId === sourceId && targetsIt(targetId)(a));
/** Both seats pass until the stack is empty (no AI choice involved). */
function resolveAll(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.stack.length; g++) cur = pass(cur);
  return cur;
}
/** The AI takes its default pick whenever it holds priority, the user passes, until the stack is empty. */
function playOutStack(s) {
  let cur = s;
  const aiActs = [];
  for (let g = 0; g < 40 && cur.stack.length; g++) {
    if (cur.priorityHolder === "ai") {
      const a = pickAction(cur, "ai", legalActionsForPlayer(cur, "ai"));
      if (a?.kind === "activate-ability") aiActs.push(a);
      cur = dispatchAction(cur, a);
    } else cur = pass(cur);
  }
  return { state: cur, aiActs };
}
const alive = (s, id) => !!findPermanent(s, id);
const prot = (s, id) => [...permanentProtectionColors(s, id)].sort();
/** The colours the last grant-protection resolution logged. */
const granted = (s) => [...(s.log || [])].reverse().find((e) => e?.effect === "grant-protection")?.colors ?? null;

describe("the policy: the threats' colour first, then the board (choicePolicy.autoPickProtectionColor)", () => {
  it("the colour the most threats share wins (Terminate is black and red, Lightning Bolt red → red); a tie goes WUBRG; a colourless threat counts only where colorless is offered; no threat keeps the board read", () => {
    const blackBoard = duel({ user: [P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")] });
    const pick = (threats, opts = {}) => autoPickProtectionColor(blackBoard, "ai", { threats, ...opts });
    expect({
      most: pick([{ colors: ["B", "R"] }, { colors: ["R"] }]),
      tie: pick([{ colors: ["R"] }, { colors: ["U"] }]),
      colourlessMother: pick([{ colors: [] }]),
      colourlessGiver: pick([{ colors: [] }], { orColorless: true }),
      colourlessAndRed: pick([{ colors: [] }, { colors: ["R"] }], { orColorless: true }),
      none: pick([]),
    }).toEqual({ most: "R", tie: "U", colourlessMother: "B", colourlessGiver: "C", colourlessAndRed: "R", none: "B" });
  });
});

describe("the AI's pick reads the threats on the stack (CR 608.2d, 702.16b, 702.16e)", () => {
  it("⭐ the AI's Mother of Runes answers the user's red Lightning Bolt at its Grizzly Bears with protection from red — though the user's board is green — and the Bears live", () => {
    const s0 = duel({ user: [...lands("um", MOUNTAIN, 1, "user"), P("ugb", GRIZZLY_BEARS, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const s = pass(act(s0, "user", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("gb")(a)));
    const first = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    const { state: after, aiActs } = playOutStack(s);
    const row = { first: [first?.kind, first?.permanentId ?? null, first?.targets?.[0]?.id ?? null], activations: aiActs.length, granted: granted(after), bearsAlive: alive(after, "gb"), bearsDamage: findPermanent(after, "gb")?.permanent?.damageMarked ?? null };
    console.log(`  WITNESS ai-mother-bolt ${JSON.stringify(row)}`);
    expect(row).toEqual({ first: ["activate-ability", "mor", "gb"], activations: 1, granted: ["R"], bearsAlive: true, bearsDamage: 0 });
  });

  it("⭐ the resolution itself: Mother's ability above a Lightning Bolt grants protection from red over a board of black permanents, and the Bolt does nothing to the creature", () => {
    const s0 = duel({ user: [...lands("um", MOUNTAIN, 1, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user"), P("ub2", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const bolted = pass(act(s0, "user", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("gb")(a)));
    const mother = activateAt(bolted, "ai", "mor", "gb");
    const afterMother = pass(pass(mother)); // both pass: Mother's ability resolves; the Bolt is next
    const done = resolveAll(afterMother);
    const row = { stackAfterMother: afterMother.stack.map((o) => o.source?.name), protection: prot(afterMother, "gb"), bearsAlive: alive(done, "gb") };
    console.log(`  WITNESS resolution-bolt ${JSON.stringify(row)}`);
    expect(row).toEqual({ stackAfterMother: ["Lightning Bolt"], protection: ["R"], bearsAlive: true });
  });

  it("⭐ a threat that does not target: Mother of Runes in response to Pyroclasm (2 damage to each creature) grants protection from red, and the damage to the Bears is prevented", () => {
    const s0 = duel({ user: [...lands("um", MOUNTAIN, 2, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-pyro", PYROCLASM)] });
    const cast = pass(act(s0, "user", "cast-spell", (a) => a.name === "Pyroclasm"));
    const afterMother = pass(pass(activateAt(cast, "ai", "mor", "gb")));
    const done = resolveAll(afterMother);
    const row = { protection: prot(afterMother, "gb"), bearsAlive: alive(done, "gb"), motherAlive: alive(done, "mor"), userBearAlive: alive(done, "ub1") };
    console.log(`  WITNESS resolution-pyroclasm ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["R"], bearsAlive: true, motherAlive: false, userBearAlive: false });
  });

  it("⭐ an ability's colour is its source's: the user's Prodigal Pyromancer aimed at the Elves makes Giver of Runes grant protection from red", () => {
    const s0 = duel({ user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user"), P("ub2", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const pinged = pass(activateAt(s0, "user", "pyro", "le"));
    const afterGiver = pass(pass(activateAt(pinged, "ai", "gor", "le")));
    const done = resolveAll(afterGiver);
    const row = { protection: prot(afterGiver, "le"), elvesAlive: alive(done, "le") };
    console.log(`  WITNESS resolution-pyromancer ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["R"], elvesAlive: true });
  });

  it("⭐ a source sacrificed to pay for its ability keeps its colour: Mogg Fanatic's ping (red, as it last existed) makes Mother of Runes grant protection from red, and the damage is prevented", () => {
    const s0 = duel({ user: [P("mogg", MOGG_FANATIC, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const pinged = pass(activateAt(s0, "user", "mogg", "le"));
    const afterMother = pass(pass(activateAt(pinged, "ai", "mor", "le")));
    const done = resolveAll(afterMother);
    const row = { moggGone: !alive(pinged, "mogg"), protection: prot(afterMother, "le"), elvesAlive: alive(done, "le") };
    console.log(`  WITNESS resolution-mogg ${JSON.stringify(row)}`);
    expect(row).toEqual({ moggGone: true, protection: ["R"], elvesAlive: true });
  });

  it("⭐ a colourless threat is read where colorless is offered: Giver of Runes against Rod of Ruin grants protection from colorless (CR 105.2c — enforced since 2026-10-21); Mother of Runes, with no colorless to offer, keeps the board read", () => {
    const board = (protector) => duel({ user: [P("rod", ROD_OF_RUIN, "user"), ...lands("um", MOUNTAIN, 3, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("prot", protector, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const giver = pass(pass(activateAt(pass(activateAt(board(GIVER_OF_RUNES), "user", "rod", "le")), "ai", "prot", "le")));
    const mother = pass(pass(activateAt(pass(activateAt(board(MOTHER_OF_RUNES), "user", "rod", "le")), "ai", "prot", "le")));
    const row = { giver: granted(giver), mother: granted(mother) };
    console.log(`  WITNESS colourless ${JSON.stringify(row)}`);
    expect(row).toEqual({ giver: ["C"], mother: ["B"] });
  });

  it("⭐ an ability whose source has left is read by its last known colours: the AI answers Executioner's Capsule's destroy with Mother of Runes (protection from black makes its target illegal, CR 608.2b), as it answers Mogg Fanatic's ping", () => {
    const capsuleBoard = duel({ user: [P("cap", EXECUTIONERS_CAPSULE, "user"), ...lands("us", SWAMP, 2, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const capsule = pass(activateAt(capsuleBoard, "user", "cap", "gb"));
    const moggBoard = duel({ user: [P("mogg", MOGG_FANATIC, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const mogg = pass(activateAt(moggBoard, "user", "mogg", "le"));
    const first = (s) => { const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai")); return [a?.kind, a?.permanentId ?? null]; };
    const row = { capsuleGone: !alive(capsule, "cap"), capsule: first(capsule), mogg: first(mogg) };
    console.log(`  WITNESS departed-source ${JSON.stringify(row)}`);
    expect(row).toEqual({ capsuleGone: true, capsule: ["activate-ability", "mor"], mogg: ["activate-ability", "mor"] });
  });

  it("control: with nothing else on the stack the pick is the board read, unchanged — the most common colour among the opponents' nonland permanents", () => {
    const s0 = duel({ user: [...lands("us", SWAMP, 3, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user"), P("ug1", GRIZZLY_BEARS, "user"), P("ub2", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], active: "ai" });
    const after = resolveAll(activateAt(s0, "ai", "mor", "gb"));
    expect(granted(after)).toEqual(["B"]);
  });

  it("control: a spell of its own controller's is no threat, and neither is an opponent's threat aimed at another creature — both keep the board read", () => {
    const board = () => duel({ user: [P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [...lands("am", MOUNTAIN, 1, "ai"), P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai"), P("le", LLANOWAR_ELVES, "ai")], aiHand: [C("h-bolt", LIGHTNING_BOLT)], active: "ai" });
    const own = pass(pass(activateAt(act(board(), "ai", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("gb")(a)), "ai", "mor", "gb")));
    // The user's red Bolt at the AI's Elves, and Mother of Runes on the Bears: the Bolt threatens the Elves, not the Bears.
    const elsewhereBoard = duel({ user: [...lands("um", MOUNTAIN, 1, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai"), P("le", LLANOWAR_ELVES, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const boltAtElves = pass(act(elsewhereBoard, "user", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("le")(a)));
    const elsewhere = pass(pass(activateAt(boltAtElves, "ai", "mor", "gb")));
    expect({ own: granted(own), elsewhere: granted(elsewhere), boltStillWaits: elsewhere.stack.map((o) => o.source?.name) }).toEqual({ own: ["B"], elsewhere: ["B"], boltStillWaits: ["Lightning Bolt"] });
  });
});

// ── a person chooses ────────────────────────────────────────────────────────────────────────────────────────────────────
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
const choose = (r, color) => applyPendingChoice(r.session, { kind: "protection-color", color });
/** The person passes priority until the driver stops on something other than a priority window with a non-empty stack. */
function drain(r) {
  let cur = r;
  for (let i = 0; i < 30 && cur.decision?.kind === "ask" && (cur.session.state.stack || []).length > 0; i++) {
    cur = applyChoice(cur.session, cur.decision.options.find((a) => a.kind === "pass-priority"));
  }
  return cur;
}
/** The person (the user seat, holding priority) takes `pred`'s action through the session driver, then passes until it resolves. */
function personActs(state, pred) {
  const first = advanceUntilDecision(session(state));
  const action = (first.decision.options || []).find(pred);
  if (!action) throw new Error(`not offered: ${JSON.stringify((first.decision.options || []).map((a) => [a.kind, a.name, a.permanentId]))}`);
  return drain(applyChoice(first.session, action));
}
const view = (d) => ({ kind: d.kind, controller: d.controller, sourceName: d.sourceName, cardName: d.cardName, candidates: d.candidates });

/** The AI (active, holding priority) casts Lightning Bolt at the user's Bears and passes: the person holds priority with it on the stack. */
function boltedPersonBoard({ protector = MOTHER_OF_RUNES, humans = ["user"] } = {}) {
  const s0 = duel({ humans, active: "ai", user: [P("prot", protector, "user"), P("gb", GRIZZLY_BEARS, "user")], ai: [...lands("am", MOUNTAIN, 1, "ai"), P("ab1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "ai")], aiHand: [C("h-bolt", LIGHTNING_BOLT)] });
  const s = pass(act(s0, "ai", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("gb")(a)));
  if (s.priorityHolder !== "user") throw new Error("the person should hold priority");
  return s;
}
const motherAtBears = (a) => a.kind === "activate-ability" && a.permanentId === "prot" && targetsIt("gb")(a);
const W = { id: "W", name: "White" }, U = { id: "U", name: "Blue" }, B = { id: "B", name: "Black" }, G = { id: "G", name: "Green" };

describe("CR 608.2d — a person announces the colour as the grant resolves", () => {
  it("⭐ the person's Mother of Runes in response to the AI's Lightning Bolt: asked, red is marked Suggested (the Bolt), and the colour chosen is the one granted — red lives, green dies", () => {
    const asked = personActs(boltedPersonBoard(), motherAtBears);
    const red = drain(choose(asked, "R"));
    const green = drain(choose(personActs(boltedPersonBoard(), motherAtBears), "G"));
    const row = {
      asked: view(asked.decision),
      red: { protection: prot(red.session.state, "gb"), alive: alive(red.session.state, "gb"), next: red.decision.kind },
      green: { granted: granted(green.session.state), alive: alive(green.session.state, "gb") },
    };
    console.log(`  WITNESS person-mother ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: { kind: "protection-color", controller: "user", sourceName: "Mother of Runes", cardName: "Grizzly Bears",
        candidates: [W, U, B, { id: "R", name: "Red", threats: ["Lightning Bolt"], suggested: "threat" }, G] },
      red: { protection: ["R"], alive: true, next: "ask" },
      green: { granted: ["G"], alive: false },
    });
  });

  it("⭐ the person's Giver of Runes with nothing to answer: asked with colorless on offer, the board read marked, and the person's pick — not the suggestion — is granted", () => {
    const s0 = duel({ humans: ["user"], user: [P("gor", GIVER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user")], ai: [P("ab1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "ai")] });
    const asked = personActs(s0, (a) => a.kind === "activate-ability" && a.permanentId === "gor" && targetsIt("gb")(a));
    const answered = choose(asked, "U");
    const row = { asked: view(asked.decision), protection: prot(answered.session.state, "gb"), next: answered.decision.kind, log: answered.session.decisionLog.find((e) => e.action?.kind === "protection-color-choice")?.action };
    console.log(`  WITNESS person-giver ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: { kind: "protection-color", controller: "user", sourceName: "Giver of Runes", cardName: "Grizzly Bears",
        candidates: [W, U, { id: "B", name: "Black", suggested: "board" }, { id: "R", name: "Red" }, G, { id: "C", name: "Colorless" }] },
      protection: ["U"], next: "ask", log: { kind: "protection-color-choice", color: "U", sourceName: "Giver of Runes" },
    });
  });

  it("⭐ the spell form: Gods Willing asks the colour, then its Scry 1 follows (the program resumes after the grant)", () => {
    const s0 = duel({ humans: ["user"], user: [...lands("up", PLAINS, 1, "user"), P("gb", GRIZZLY_BEARS, "user")], userHand: [C("h-gw", GODS_WILLING)], ai: [P("ab1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "ai")] });
    const asked = personActs(s0, (a) => a.kind === "cast-spell" && a.name === "Gods Willing" && targetsIt("gb")(a));
    const answered = choose(asked, "W");
    const row = { asked: [asked.decision.kind, asked.decision.sourceName], protection: prot(answered.session.state, "gb"), next: answered.decision.kind };
    console.log(`  WITNESS person-gods-willing ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: ["protection-color", "Gods Willing"], protection: ["W"], next: "scry-surveil" });
  });

  it("⭐ the sacrifice form: Benevolent Bodyguard asks too", () => {
    const s0 = duel({ humans: ["user"], user: [P("bod", BENEVOLENT_BODYGUARD, "user"), P("gb", GRIZZLY_BEARS, "user")], ai: [P("ab1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "ai")] });
    const asked = personActs(s0, (a) => a.kind === "activate-ability" && a.permanentId === "bod" && targetsIt("gb")(a));
    const answered = choose(asked, "G");
    expect({ asked: [asked.decision.kind, asked.decision.sourceName], protection: prot(answered.session.state, "gb") }).toEqual({ asked: ["protection-color", "Benevolent Bodyguard"], protection: ["G"] });
  });

  it("⭐ a person is told the colour that stops a departed or colourless threat: against the AI's Executioner's Capsule (its source sacrificed — black as it last existed) black is the threat's colour, and against Rod of Ruin (colourless) Giver of Runes' colorless is", () => {
    const blackBear = P("ab1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "ai");
    const capsule = pass(act(duel({ humans: ["user"], active: "ai", user: [P("prot", MOTHER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user")], ai: [P("cap", EXECUTIONERS_CAPSULE, "ai"), ...lands("as", SWAMP, 2, "ai"), blackBear] }),
      "ai", "activate-ability", (a) => a.permanentId === "cap" && targetsIt("gb")(a)));
    const rod = pass(act(duel({ humans: ["user"], active: "ai", user: [P("prot", GIVER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user")], ai: [P("rod", ROD_OF_RUIN, "ai"), ...lands("am", MOUNTAIN, 3, "ai"), blackBear] }),
      "ai", "activate-ability", (a) => a.permanentId === "rod" && targetsIt("gb")(a)));
    const askedCapsule = personActs(capsule, motherAtBears);
    const askedRod = personActs(rod, motherAtBears);
    const row = { capsule: askedCapsule.decision.candidates, rod: askedRod.decision.candidates };
    console.log(`  WITNESS person-departed-colourless ${JSON.stringify(row)}`);
    expect(row).toEqual({
      capsule: [W, U, { id: "B", name: "Black", threats: ["Executioner's Capsule"], suggested: "threat" }, { id: "R", name: "Red" }, G],
      rod: [W, U, B, { id: "R", name: "Red" }, G, { id: "C", name: "Colorless", threats: ["Rod of Ruin"], suggested: "threat" }],
    });
  });

  it("⭐ a colour not on offer decides nothing — the question is asked again, the stack untouched; colorless from Mother of Runes too", () => {
    const asked = personActs(boltedPersonBoard(), motherAtBears);
    const before = JSON.stringify(asked.session.state.stack);
    const answers = { unknown: "X", colorless: "C", lowercase: "r", none: null, number: 3 };
    const row = Object.fromEntries(Object.entries(answers).map(([k, v]) => {
      const r = choose(asked, v);
      return [k, [r.decision.kind, (r.decision.candidates || []).length, JSON.stringify(r.session.state.stack) === before]];
    }));
    console.log(`  WITNESS junk ${JSON.stringify(row)}`);
    const reAsked = ["protection-color", 5, true];
    expect(row).toEqual({ unknown: reAsked, colorless: reAsked, lowercase: reAsked, none: reAsked, number: reAsked });
  });

  it("⭐ a game saved mid-question restores intact: the save guard passes, the resumed driver asks the same question, and the restored answer settles exactly as the live one", () => {
    const asked = personActs(boltedPersonBoard(), motherAtBears);
    const restored = advanceUntilDecision({ ...asked.session, state: JSON.parse(JSON.stringify(asked.session.state)) });
    const live = drain(choose(asked, "R"));
    const again = drain(choose(restored, "R"));
    const row = {
      serializable: isSerializable(asked.session.state).ok,
      sameQuestion: JSON.stringify(view(restored.decision)) === JSON.stringify(view(asked.decision)),
      sameAfter: JSON.stringify(again.session.state) === JSON.stringify(JSON.parse(JSON.stringify(live.session.state))),
      alive: alive(again.session.state, "gb"),
    };
    console.log(`  WITNESS save-resume ${JSON.stringify(row)}`);
    expect(row).toEqual({ serializable: true, sameQuestion: true, sameAfter: true, alive: true });
  });

  it("⭐ at Expert (no person at the table) nobody is asked — the automatic pick is granted, the threat's colour", () => {
    const s = boltedPersonBoard({ humans: null });
    const r = drain(personActs(s, motherAtBears));
    expect({ kind: r.decision.kind, protection: prot(r.session.state, "gb"), alive: alive(r.session.state, "gb") }).toEqual({ kind: "ask", protection: ["R"], alive: true });
  });

  it("control: the AI's own grant at a table with a person is never asked of anyone", () => {
    const s0 = duel({ humans: ["user"], user: [...lands("um", MOUNTAIN, 1, "user"), P("ub1", { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] }, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], active: "ai" });
    const after = resolveAll(activateAt(s0, "ai", "mor", "gb"));
    expect({ pending: after.pendingChoice ?? null, granted: granted(after) }).toEqual({ pending: null, granted: ["B"] });
  });
});
