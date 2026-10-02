/**
 * ADELINE, RESPLENDENT CATHAR — the play-weighted program, P·493 (EDHREC #493).
 *   "Vigilance
 *    Adeline's power is equal to the number of creatures you control.
 *    Whenever you attack, for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player
 *    or a planeswalker they control."
 *
 * Vigilance and the power CDA (CR 604.3, layer 7a) were already modeled; the card parked on the trigger's tail. The per-opponent
 * tapped-and-attacking arm (Endless Foot Assault) now reads "that player or a planeswalker they control" with a HOUSE CHOICE: the
 * token attacks the player. CR 508.4 lets the token's controller choose among the options the effect allows, and the player is
 * always one of them ("for each opponent" counts only opponents still in the game, CR 508.4a; attack requirements and
 * restrictions do not apply to a creature put onto the battlefield attacking, CR 508.4c). The engine never sends a token at a
 * planeswalker — an under-offer of the controller's options, never an illegal attack.
 *
 * The runtime is Endless Foot Assault's: one token per opponent still in the game, each appended to combat.attackers against ITS
 * opponent. The tokens are put onto the battlefield attacking, never declared, so they fire no "whenever a creature attacks"
 * ability (CR 508.3a) and never "attacked" for any effect (CR 508.4). One addition: the arm now carries its token's COLOR
 * (CR 111.3 — `atom.colors`, stamped on the minted card), so the Humans are white (and Endless Foot Assault's Ninjas black);
 * before this every create-token mint was colorless, and Honor of the Pure would have pumped Adeline but not her tokens.
 *
 * Engine timing note: the engine fires attack triggers at the declare-blockers step entry (gameEngine.runStepActions), with no
 * block declared yet, and blocks accumulate one action at a time through that step — so the tokens are blockable once the
 * trigger resolves (the witness declares its blocks after it does), the outcome of the trigger resolving in the declare attackers
 * step.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01; the trailing comment is the tier at
 * generation). Every runtime case runs through the engine's own entry points: legalActionsForPlayer + dispatchAction declare
 * attackers and blockers, passPriority walks the table (the declare-blockers entry fires the attack triggers, a full lap of passes
 * resolves the top of the stack, an empty-stack lap advances the step), and the combat damage step deals the damage.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { permanentColors } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ADELINE = {"name":"Adeline, Resplendent Cathar","type":"Legendary Creature — Human Knight","mana":"{1}{W}{W}","cmc":3,"power":"*","toughness":"4","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nAdeline's power is equal to the number of creatures you control.\nWhenever you attack, for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control."}; // native-mixed
const EFA = {"name":"Endless Foot Assault","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":["Squad"],"colors":["W"],"oracle":"Squad {1}{W} (As an additional cost to cast this spell, you may pay {1}{W} any number of times. When this enchantment enters, create that many tokens that are copies of it.)\nWhenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player."}; // native-trigger
const GLEAM = {"name":"Gleam of Battle","type":"Enchantment","mana":"{4}{R}{W}","cmc":6,"keywords":[],"colors":["R","W"],"oracle":"Whenever a creature you control attacks, put a +1/+1 counter on it."}; // native-trigger
const RIGHTEOUS = {"name":"Righteous Cause","type":"Enchantment","mana":"{3}{W}{W}","cmc":5,"keywords":[],"colors":["W"],"oracle":"Whenever a creature attacks, you gain 1 life."}; // native-trigger
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const PROCESSION = {"name":"Anointed Procession","type":"Enchantment","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."}; // native-static
const HONOR = {"name":"Honor of the Pure","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"White creatures you control get +1/+1."}; // native-static

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

/**
 * A table at the declare-attackers step of `active` (the user by default), Adeline on the user's battlefield. Four seats (user →
 * ai1 → ai2 → ai3) by default; `seats: 2` is a standard game (user, ai). `boards` adds permanents per seat. `gone` removes a seat
 * the way the session's elimination does (CR 800.4a — learnSession.removePlayerFromGame drops the player record and the
 * turn-order slot).
 */
function table({ seats = 4, boards = {}, gone = null, active = "user" } = {}) {
  const s0 = seats === 2 ? createGameState({ userDeck: [], aiDeck: [] }) : createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  let players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    const own = [...(pid === "user" ? [P("adeline", ADELINE, "user")] : []), ...(boards[pid] || [])];
    players[pid] = { ...players[pid], battlefield: own };
  }
  let turnOrder = s0.turnOrder;
  if (gone) {
    const { [gone]: _left, ...rest } = players;
    players = rest;
    turnOrder = turnOrder.filter((id) => id !== gone);
  }
  return { ...s0, players, turnOrder, turn: 5, phase: "combat", step: "declare-attackers", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}

/**
 * Declare each [attackerId, defenderId, planeswalkerId?] through the offered actions, then pass priority around the table to the
 * declare-blockers step entry (where the engine fires the attack triggers and puts them on the stack — `fired` lists their
 * sources), and keep passing until the stack is empty. Returns the state still inside the declare-blockers step. A two-seat
 * game offers the attack without a defenderId (the dispatcher fills the lone opponent).
 */
function attack(s, picks) {
  const attacker = s.activePlayer;
  for (const [id, def, pw = null] of picks) {
    const action = legalActionsForPlayer(s, attacker).find((a) => a.kind === "declare-attacker" && a.permanentId === id
      && (a.defenderId ?? def) === def && (a.defenderPlaneswalkerId ?? null) === pw);
    if (!action) throw new Error(`no declare-attacker action offered for ${id} → ${def}${pw ? `/${pw}` : ""}`);
    s = dispatchAction(s, action);
  }
  let g = 0;
  while (s.step === "declare-attackers" && g++ < 20) s = passPriority(s);
  const fired = s.stack.map((o) => o.source?.name);
  while (s.stack.length && g++ < 80) s = passPriority(s);
  return { s, fired };
}
/** Pass priority to the end of combat (combat damage is dealt on the way); combat.attackers is cleared there. */
function toEndOfCombat(s) {
  let g = 0;
  while (s.step !== "end-of-combat" && g++ < 80) s = passPriority(s);
  return s;
}
const humans = (s) => s.players.user.battlefield.filter((p) => p.card?.token);
const entryOf = (s, id) => (s.combat?.attackers || []).find((a) => a.permanentId === id) || null;
const defendersOf = (s) => humans(s).map((t) => entryOf(s, t.id)?.defender ?? null).sort();
const lives = (s) => Object.fromEntries(Object.entries(s.players).map(([pid, pl]) => [pid, pl.life]));
const lost = (a, b) => Object.fromEntries(Object.keys(b).map((pid) => [pid, a[pid] - b[pid]]));

const CLAUSE = "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control";

describe("parse + classify — every line of the card", () => {
  it("⭐ the trigger: one youAttack trigger, routes natively; its clause is ONE per-opponent tapped-and-attacking WHITE token atom (the Endless Foot Assault shape); the card classifies native-mixed", () => {
    const trig = detectTriggers(ADELINE);
    const p = parseEffectClause(trig[0]?.effectClause, ADELINE.type);
    const row = { triggers: trig.map((t) => ({ event: t.event, interveningIf: t.interveningIf, optional: t.optional })), routes: trig.map(triggerRoutesNatively),
      conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(ADELINE) };
    console.log("  WITNESS adelineParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      triggers: [{ event: "youAttack", interveningIf: null, optional: false }], routes: [true], conf: "high",
      atoms: [{ op: "create-token", power: 1, toughness: 1, descriptor: "white human", colors: ["W"], perOpponent: true, tapped: true, entersAttacking: true, targetType: null }],
      tier: "native-mixed",
    });
  });

  it("the power CDA is the layer-7a set from a live creature count (printed toughness 4 stands); Vigilance is a printed keyword", () => {
    expect(parseStaticAbilities(ADELINE)).toEqual([{ layer: 7, sublayer: "7a", isCDA: true,
      op: { layerOp: "ptSetDynamicCount", countSpec: { kind: "permanentsYouControl", cardType: "Creature" }, setPower: true, setToughness: false },
      affects: { mode: "self" }, duration: { kind: "permanent" } }]);
    expect(ADELINE.keywords).toEqual(["Vigilance"]);
  });

  it("Endless Foot Assault's \"…attacking that player\" form still reads to the same arm, now carrying its BLACK color", () => {
    const p = parseEffectClause(detectTriggers(EFA)[0].effectClause, EFA.type);
    expect({ conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(EFA) }).toEqual({ conf: "high",
      atoms: [{ op: "create-token", power: 1, toughness: 1, descriptor: "black ninja", colors: ["B"], perOpponent: true, tapped: true, entersAttacking: true, targetType: null }],
      tier: "native-trigger" });
  });

  it("CREED — the tail is anchored to the printed wording: SYNTHETIC unprinted alternatives (not card text) stay LOW", () => {
    const low = (tail) => programConfidence(parseEffectClause(CLAUSE.replace(/that player or a planeswalker they control$/, tail), "Creature"));
    expect({
      thatPlayerControls: low("that player or a planeswalker that player controls"),
      battle: low("that player or a battle they protect"),
      planeswalkerOnly: low("a planeswalker they control"),
    }).toEqual({ thatPlayerControls: "low", battle: "low", planeswalkerOnly: "low" });
  });
});

describe("RUNTIME — one tapped Human per opponent, each attacking THAT player", () => {
  it("⭐ four seats, Adeline attacks ai1 alone: ONE trigger; three tapped 1/1 Humans, one attacking each opponent; vigilance keeps Adeline untapped; her power counts the tokens (1 → 4); damage ai1 5, ai2 1, ai3 1", () => {
    const s0 = table();
    const powerBefore = creaturePower(s0.players.user.battlefield.find((p) => p.id === "adeline"), s0);
    const { s, fired } = attack(s0, [["adeline", "ai1"]]);
    const adeline = s.players.user.battlefield.find((p) => p.id === "adeline");
    const toks = humans(s);
    const row = {
      fired, step: s.step,
      tokens: toks.map((t) => ({ type: t.card.type, pt: `${t.card.power}/${t.card.toughness}`, tapped: t.tapped, entry: entryOf(s, t.id) && { ...entryOf(s, t.id), permanentId: "tok" } })),
      adelineTapped: adeline.tapped, power: [powerBefore, creaturePower(adeline, s)],
    };
    const before = lives(s);
    const damage = lost(before, lives(toEndOfCombat(s)));
    console.log("  WITNESS adelineFourSeats", JSON.stringify({ ...row, damage })); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      fired: ["Adeline, Resplendent Cathar"], step: "declare-blockers",
      tokens: [
        { type: "Token Creature — Human", pt: "1/1", tapped: true, entry: { permanentId: "tok", attackingPlayer: "user", defender: "ai1" } },
        { type: "Token Creature — Human", pt: "1/1", tapped: true, entry: { permanentId: "tok", attackingPlayer: "user", defender: "ai2" } },
        { type: "Token Creature — Human", pt: "1/1", tapped: true, entry: { permanentId: "tok", attackingPlayer: "user", defender: "ai3" } },
      ],
      adelineTapped: false, power: [1, 4],
    });
    expect(damage).toEqual({ user: 0, ai1: 5, ai2: 1, ai3: 1 });
  });

  it("two seats: one Human, attacking the lone opponent", () => {
    const { s, fired } = attack(table({ seats: 2 }), [["adeline", "ai"]]);
    expect({ fired, defenders: defendersOf(s), damage: lost(lives(s), lives(toEndOfCombat(s))) })
      .toEqual({ fired: ["Adeline, Resplendent Cathar"], defenders: ["ai"], damage: { user: 0, ai: 3 } });
  });

  it("an ELIMINATED opponent gets no token: with ai2 out of the game, two Humans — ai1 and ai3 — and nothing names ai2", () => {
    const { s } = attack(table({ gone: "ai2" }), [["adeline", "ai3"]]);
    const named = JSON.stringify(s.combat.attackers).includes("ai2");
    expect({ defenders: defendersOf(s), named }).toEqual({ defenders: ["ai1", "ai3"], named: false });
  });

  it("each defending player may block ONLY the token attacking them (CR 509.1a); ai2 blocks its Human, so ai2 takes nothing and the Human dies", () => {
    const { s } = attack(table({ boards: { ai1: [P("b1", BEARS, "ai1")], ai2: [P("b2", BEARS, "ai2")], ai3: [P("b3", BEARS, "ai3")] } }), [["adeline", "ai1"]]);
    const tokFor = Object.fromEntries(humans(s).map((t) => [entryOf(s, t.id).defender, t.id]));
    const offered = (pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "declare-blocker").map((a) => a.attackerId).sort();
    const row = { ai1: offered("ai1"), ai2: offered("ai2"), ai3: offered("ai3") };
    expect(row).toEqual({ ai1: ["adeline", tokFor.ai1].sort(), ai2: [tokFor.ai2], ai3: [tokFor.ai3] });
    const blocked = dispatchAction(s, legalActionsForPlayer(s, "ai2").find((a) => a.kind === "declare-blocker" && a.attackerId === tokFor.ai2));
    const end = toEndOfCombat(blocked);
    expect({ damage: lost(lives(blocked), lives(end)), humansLeft: humans(end).length, bearsDamage: end.players.ai2.battlefield.find((p) => p.id === "b2").damageMarked })
      .toEqual({ damage: { user: 0, ai1: 5, ai2: 0, ai3: 1 }, humansLeft: 2, bearsDamage: 1 });
  });

  it("⭐ the HOUSE CHOICE is the player: Adeline attacks ai1's Jace Beleren, yet ai1's Human attacks ai1 — no token entry names a planeswalker, and Jace takes only Adeline's damage", () => {
    const st = table({ boards: { ai1: [P("jace", JACE, "ai1", { counters: { loyalty: 3 } })] } });
    const { s } = attack(st, [["adeline", "ai1", "jace"]]);
    const tokenEntries = humans(s).map((t) => entryOf(s, t.id));
    const row = { adelineEntry: entryOf(s, "adeline"), tokenDefenders: tokenEntries.map((e) => e.defender).sort(), tokenPw: tokenEntries.map((e) => e.defenderPlaneswalkerId ?? null) };
    expect(row).toEqual({ adelineEntry: { permanentId: "adeline", attackingPlayer: "user", defender: "ai1", defenderPlaneswalkerId: "jace" },
      tokenDefenders: ["ai1", "ai2", "ai3"], tokenPw: [null, null, null] });
    const end = toEndOfCombat(s);
    expect({ damage: lost(lives(s), lives(end)), jaceInGraveyard: end.players.ai1.graveyard.some((c) => c.name === JACE.name) })
      .toEqual({ damage: { user: 0, ai1: 1, ai2: 1, ai3: 1 }, jaceInGraveyard: true }); // Adeline's 4 (herself + three Humans) exceeds Jace's 3 loyalty
  });

  it("under a token doubler (Anointed Procession) each opponent gets TWO Humans, each pair attacking its own opponent", () => {
    const { s } = attack(table({ boards: { user: [P("proc", PROCESSION, "user")] } }), [["adeline", "ai2"]]);
    expect(defendersOf(s)).toEqual(["ai1", "ai1", "ai2", "ai2", "ai3", "ai3"]);
  });

  it("⭐ the Humans are WHITE (CR 111.3): Honor of the Pure makes each a 2/2 beside a 5-power Adeline — ai1 takes 7, ai2 and ai3 take 2", () => {
    const { s } = attack(table({ boards: { user: [P("honor", HONOR, "user")] } }), [["adeline", "ai1"]]);
    const row = { colors: humans(s).map((t) => permanentColors(s, t.id)), powers: humans(s).map((t) => creaturePower(t, s)),
      adeline: creaturePower(s.players.user.battlefield.find((p) => p.id === "adeline"), s) };
    const damage = lost(lives(s), lives(toEndOfCombat(s)));
    console.log("  WITNESS adelineWhiteHumans", JSON.stringify({ ...row, damage })); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ colors: [["W"], ["W"], ["W"]], powers: [2, 2, 2], adeline: 5 });
    expect(damage).toEqual({ user: 0, ai1: 7, ai2: 2, ai3: 2 });
  });

  it("beside Endless Foot Assault each trigger makes its own tokens: a white Human and a black Ninja per opponent", () => {
    const { s, fired } = attack(table({ boards: { user: [P("efa", EFA, "user")] } }), [["adeline", "ai1"]]);
    const kind = (sub) => humans(s).filter((t) => t.card.type === `Token Creature — ${sub}`);
    const read = (sub) => ({ colors: kind(sub).map((t) => permanentColors(s, t.id)), defenders: kind(sub).map((t) => entryOf(s, t.id)?.defender).sort() });
    expect({ fired: [...fired].sort(), human: read("Human"), ninja: read("Ninja") }).toEqual({
      fired: ["Adeline, Resplendent Cathar", "Endless Foot Assault"],
      human: { colors: [["W"], ["W"], ["W"]], defenders: ["ai1", "ai2", "ai3"] },
      ninja: { colors: [["B"], ["B"], ["B"]], defenders: ["ai1", "ai2", "ai3"] },
    });
  });
});

describe("CREED — the Humans were never declared, so they never \"attacked\" (CR 508.3a, 508.4)", () => {
  it("⭐ Gleam of Battle (yours) and Righteous Cause (ai2's) each trigger ONCE — for Adeline only; no Human gets a counter, ai2 gains 1", () => {
    const { s, fired } = attack(table({ boards: { user: [P("gleam", GLEAM, "user")], ai2: [P("rc", RIGHTEOUS, "ai2")] } }), [["adeline", "ai1"]]);
    const row = { fired: [...fired].sort(), humans: humans(s).length, humanCounters: humans(s).map((t) => t.counters?.["+1/+1"] ?? 0),
      adelineCounters: s.players.user.battlefield.find((p) => p.id === "adeline").counters?.["+1/+1"] ?? 0, ai2Life: s.players.ai2.life };
    console.log("  WITNESS adelineNoAttackTriggers", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fired: ["Adeline, Resplendent Cathar", "Gleam of Battle", "Righteous Cause"], humans: 3, humanCounters: [0, 0, 0], adelineCounters: 1, ai2Life: 41 });
  });

  it("an opponent attacked only by a Human is not an opponent you attacked; no Human is stamped as having attacked", () => {
    const { s } = attack(table(), [["adeline", "ai1"]]);
    expect({ attackedPlayers: s.players.user.attackedPlayersThisTurn, humansAttacked: humans(s).map((t) => !!t.attackedThisTurn) })
      .toEqual({ attackedPlayers: ["ai1"], humansAttacked: [false, false, false] });
  });
});

describe("CREED — \"whenever YOU attack\": once per combat, and only for Adeline's controller", () => {
  it("Adeline stays home while a Bears attacks: the trigger still fires, and Adeline stays untapped", () => {
    const { s, fired } = attack(table({ boards: { user: [P("ubear", BEARS, "user")] } }), [["ubear", "ai2"]]);
    expect({ fired, defenders: defendersOf(s), adelineTapped: s.players.user.battlefield.find((p) => p.id === "adeline").tapped })
      .toEqual({ fired: ["Adeline, Resplendent Cathar"], defenders: ["ai1", "ai2", "ai3"], adelineTapped: false });
  });

  it("two attackers are still ONE trigger: three Humans, not six", () => {
    const { s, fired } = attack(table({ boards: { user: [P("ubear", BEARS, "user")] } }), [["adeline", "ai1"], ["ubear", "ai3"]]);
    expect({ fired, defenders: defendersOf(s) }).toEqual({ fired: ["Adeline, Resplendent Cathar"], defenders: ["ai1", "ai2", "ai3"] });
  });

  it("no attackers declared: combat skips to its end, nothing triggers, no Human", () => {
    let s = table();
    let g = 0;
    while (s.step === "declare-attackers" && g++ < 20) s = passPriority(s);
    expect({ step: s.step, stack: s.stack.length, humans: humans(s).length }).toEqual({ step: "end-of-combat", stack: 0, humans: 0 });
  });

  it("an OPPONENT attacks you: your Adeline does not trigger", () => {
    const st = table({ active: "ai1", boards: { ai1: [P("ob", BEARS, "ai1")] } });
    const { s, fired } = attack(st, [["ob", "user"]]);
    const tokens = Object.values(s.players).flatMap((pl) => pl.battlefield).filter((p) => p.card?.token).length;
    expect({ step: s.step, fired, tokens }).toEqual({ step: "declare-blockers", fired: [], tokens: 0 });
  });
});
