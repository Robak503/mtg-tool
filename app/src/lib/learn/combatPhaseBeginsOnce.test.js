/**
 * combatPhaseBeginsOnce.test.js — each combat phase begins ONCE, and the first-strike combat damage step exists only when a
 * combatant has first strike or double strike.
 *
 * (1) THE BEGINNING OF COMBAT STEP, ONCE PER COMBAT PHASE (CR 500.8, 506.1, 507.1, 507.2, 603.2b). An additional combat phase
 * has one beginning of combat step like any other, and an "at the beginning of combat" ability triggers once as that step
 * begins. Until 2026-10-22 every additional combat ran the beginning-of-combat entry twice: advanceStep's five extra-combat jumps
 * (the after-combat pop, the after-main pop, the no-main chain, and both owed-normal-combat sites) ran `enterCombatPostProcess`
 * — the combat tally, the "at the beginning of combat" triggers, the Vihaan animate — and then runStepActions ran it again as the
 * step's automatic actions. The tally went up by two, and every beginning-of-combat trigger triggered twice: Lord Skitter made
 * two Rats, Unnatural Growth doubled twice, Legion Warboss's trigger went on the stack twice (its clause is not modelled, so here
 * it is a manual trigger that makes nothing; counted, not its token), and when Relentless Assault's combat came first in the turn
 * the tally already read 2 there, so Karlach's "first combat phase of the turn" was shut. advanceStep now only moves the state
 * (its documented contract); runStepActions is the one entry.
 *
 * (2) THE FIRST-STRIKE COMBAT DAMAGE STEP (CR 510.4, 506.1, 702.7b, 702.4b). The phase gets a second combat damage step only if an
 * attacking or blocking creature has first strike or double strike as the combat damage step begins. Until 2026-10-22 the engine
 * always entered `first-strike-damage` after the declare blockers step — an empty step with its own priority round — whatever
 * the combatants (a creature given first strike in that round dealt no combat damage at all: its first-strike damage had
 * already passed and the regular step skips first strikers). Now the step is entered only when a combatant still in combat has
 * first strike or double strike as the declare blockers step ends; otherwise the declare blockers step goes straight to the
 * combat damage step.
 *
 * Real oracle text (bundled scryfall-bulk/oracle_cards.json, checked 2026-10-22).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LEGION_WARBOSS = { name: "Legion Warboss", type: "Creature — Goblin Soldier", mana: "{2}{R}", power: "2", toughness: "2", keywords: ["Mentor"],
  oracle: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token gains haste until end of turn and attacks this combat if able." };
const UNNATURAL_GROWTH = { name: "Unnatural Growth", type: "Enchantment", mana: "{1}{G}{G}{G}{G}", keywords: ["Double"],
  oracle: "At the beginning of each combat, double the power and toughness of each creature you control until end of turn." };
const RELENTLESS_ASSAULT = { name: "Relentless Assault", type: "Sorcery", mana: "{2}{R}{R}", keywords: [],
  oracle: "Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase." };
const FULL_THROTTLE = { name: "Full Throttle", type: "Sorcery", mana: "{4}{R}{R}", keywords: [],
  oracle: "After this main phase, there are two additional combat phases.\nAt the beginning of each combat this turn, untap all creatures that attacked this turn." };
const AURELIA = { name: "Aurelia, the Warleader", type: "Legendary Creature — Angel", mana: "{2}{R}{R}{W}{W}", power: "3", toughness: "4", keywords: ["Flying", "Vigilance", "Haste"],
  oracle: "Flying, vigilance, haste\nWhenever Aurelia attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase." };
const LORD_SKITTER = { name: "Lord Skitter, Sewer King", type: "Legendary Creature — Rat Noble", mana: "{2}{B}", power: "3", toughness: "3", keywords: [],
  oracle: "Whenever another Rat you control enters, exile up to one target card from an opponent's graveyard.\nAt the beginning of combat on your turn, create a 1/1 black Rat creature token with \"This token can't block.\"" };
const KARLACH = { name: "Karlach, Fury of Avernus", type: "Legendary Creature — Tiefling Barbarian", mana: "{4}{R}", power: "5", toughness: "4", keywords: ["Choose a background"],
  oracle: "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures. They gain first strike until end of turn. After this phase, there is an additional combat phase.\nChoose a Background (You can have a Background as a second commander.)" };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const YOUTHFUL_KNIGHT = { name: "Youthful Knight", type: "Creature — Human Knight", mana: "{1}{W}", power: "2", toughness: "1", keywords: ["First strike"], oracle: "First strike" };
const FENCING_ACE = { name: "Fencing Ace", type: "Creature — Human Soldier", mana: "{1}{W}", power: "1", toughness: "1", keywords: ["Double strike"],
  oracle: "Double strike (This creature deals both first-strike and regular combat damage.)" };
const TURN_AGAINST = { name: "Turn Against", type: "Instant", mana: "{4}{R}", keywords: ["Devoid"],
  oracle: "Devoid (This card has no color.)\nGain control of target creature until end of turn. Untap that creature. It gains haste until end of turn." };
const SURE_STRIKE = { name: "Sure Strike", type: "Instant", mana: "{1}{R}", keywords: [],
  oracle: "Target creature gets +3/+0 and gains first strike until end of turn. (It deals combat damage before creatures without first strike.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", keywords: [], oracle: "({T}: Add {R}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i}`, card, controller));

/** A two-player game on the user's turn 5, in the precombat main phase (or the step given), libraries stocked so nobody decks. */
function table({ user = [], ai = [], userHand = [], phase = "precombat-main", step = "main", combat = { attackers: [], blockers: [] } } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (p) => Array.from({ length: 10 }, (_, i) => ({ id: `${p}-lib-${i}`, ...FOREST }));
  return {
    ...s0, turn: 5, phase, step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], combat,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: userHand, library: lib("u") },
      ai: { ...s0.players.ai, battlefield: ai, hand: [], library: lib("a") },
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
const cast = (s, name) => act(s, "user", "cast-spell", (a) => a.name === name);

const ratTokens = (s) => (s.players.user.battlefield || []).filter((p) => p.card?.type === "Token Creature — Rat").length;

/**
 * Pass priority through the rest of the user's turn (the stack resolves on the way). As each beginning of combat step begins,
 * record the triggered abilities its start put on the stack, by source; once they have resolved and the user holds priority on
 * an empty stack, record the combat tally, the Rat tokens made in the step and probe(state). In every declare attackers step the
 * user declares each of attackers that is offered.
 */
function walkTurn(s0, { attackers = [], probe = () => null } = {}) {
  let s = s0;
  const combats = [];
  let entry = null; // the beginning of combat step just begun and not yet recorded
  let prev = `${s.phase}/${s.step}`;
  let declared = new Set();
  for (let g = 0; g < 400 && s.turn === s0.turn; g++) {
    const here = `${s.phase}/${s.step}`;
    if (s.step === "beginning-of-combat" && here !== prev) {
      const triggered = {};
      for (const o of s.stack) if (o.kind === "triggered-ability") triggered[o.source?.name] = (triggered[o.source?.name] || 0) + 1;
      entry = { rats: ratTokens(s), triggered };
      declared = new Set();
    }
    prev = here;
    if (entry && s.stack.length === 0 && s.priorityHolder === "user") {
      combats.push({ tally: s.combatsThisTurn?.count ?? 0, triggered: entry.triggered, ratsMade: ratTokens(s) - entry.rats, probe: probe(s) });
      entry = null;
    }
    if (s.step === "declare-attackers" && s.priorityHolder === "user") {
      const next = attackers.find((id) => !declared.has(id) && offered(s, "user", "declare-attacker").some((a) => a.permanentId === id));
      if (next) { declared.add(next); s = act(s, "user", "declare-attacker", (a) => a.permanentId === next); continue; }
    }
    s = s.priorityHolder ? passPriority(s) : nextStep(s); // no priority (the cleanup step): the step ends on its own
  }
  return { state: s, combats };
}

const ONCE = { tally: undefined, triggered: { "Legion Warboss": 1, "Lord Skitter, Sewer King": 1 }, ratsMade: 1 };
const row = (combats) => combats.map(({ tally, triggered, ratsMade }) => ({ tally, triggered, ratsMade }));
const expected = (n) => Array.from({ length: n }, (_, i) => ({ ...ONCE, tally: i + 1 }));

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("(1) each combat phase begins once — the tally and the beginning-of-combat triggers", () => {
  const goblinAndRat = () => [P("wb", LEGION_WARBOSS, "user"), P("ls", LORD_SKITTER, "user")];

  it("control: a turn with one combat — Legion Warboss and Lord Skitter each trigger once, one Rat, the tally reads 1", () => {
    const { combats, state } = walkTurn(table({ user: goblinAndRat() }));
    console.log("  WITNESS singleCombat", JSON.stringify(row(combats))); // vitest 4 needs --disable-console-intercept
    expect(row(combats)).toEqual(expected(1));
    expect(state.turn).toBe(6);
  });

  it("⭐ an additional combat after a combat (Aurelia's): each trigger once in each combat phase, one Rat each, the tally 1 then 2", () => {
    const { combats, state } = walkTurn(table({ user: [...goblinAndRat(), P("au", AURELIA, "user")] }), { attackers: ["au"] });
    console.log("  WITNESS afterCombatExtra", JSON.stringify(row(combats))); // vitest 4 needs --disable-console-intercept
    expect(row(combats)).toEqual(expected(2));
    expect(ratTokens(state)).toBe(2);
  });

  it("⭐ Relentless Assault cast in the precombat main: the additional combat, then the turn's own combat — once each, the tally 1 then 2", () => {
    let s = table({ user: [...goblinAndRat(), ...lands("mt", MOUNTAIN, 4, "user")], userHand: [{ id: "h-ra", ...RELENTLESS_ASSAULT }] });
    s = cast(s, "Relentless Assault");
    const { combats, state } = walkTurn(s);
    console.log("  WITNESS afterMainExtra", JSON.stringify(row(combats))); // vitest 4 needs --disable-console-intercept
    expect(row(combats)).toEqual(expected(2));
    expect(ratTokens(state)).toBe(2);
  });

  it("⭐ Full Throttle: two additional combats chained, then the turn's own combat — once each, the tally 1, 2, 3", () => {
    let s = table({ user: [...goblinAndRat(), ...lands("mt", MOUNTAIN, 6, "user")], userHand: [{ id: "h-ft", ...FULL_THROTTLE }] });
    s = cast(s, "Full Throttle");
    const { combats, state } = walkTurn(s);
    console.log("  WITNESS noMainChain", JSON.stringify(row(combats))); // vitest 4 needs --disable-console-intercept
    expect(row(combats)).toEqual(expected(3).map((c) => ({ ...c, triggered: { ...c.triggered, "Full Throttle": 1 } }))); // + its own "at the beginning of each combat this turn" record
    expect(ratTokens(state)).toBe(3);
  });

  it("⭐ Unnatural Growth doubles once per combat phase: a 2/2 has 4 power in the first combat and 8 in the additional one", () => {
    const s = table({ user: [P("ug", UNNATURAL_GROWTH, "user"), P("gb", GRIZZLY_BEARS, "user"), P("au", AURELIA, "user")] });
    const { combats } = walkTurn(s, { attackers: ["au"], probe: (st) => creaturePower(st.players.user.battlefield.find((p) => p.id === "gb"), st) });
    const r = combats.map(({ tally, triggered, probe }) => ({ tally, triggered, bearsPower: probe }));
    console.log("  WITNESS unnaturalGrowth", JSON.stringify(r)); // vitest 4 needs --disable-console-intercept
    expect(r).toEqual([{ tally: 1, triggered: { "Unnatural Growth": 1 }, bearsPower: 4 }, { tally: 2, triggered: { "Unnatural Growth": 1 }, bearsPower: 8 }]);
  });

  it("⭐ the first combat phase of the turn is the additional one Relentless Assault made: Karlach's gate is open there and she adds a combat", () => {
    let s = table({ user: [P("ka", KARLACH, "user"), ...lands("mt", MOUNTAIN, 4, "user")], userHand: [{ id: "h-ra", ...RELENTLESS_ASSAULT }] });
    s = cast(s, "Relentless Assault");
    const { combats } = walkTurn(s, { attackers: ["ka"] });
    const tallies = combats.map((c) => c.tally);
    console.log("  WITNESS karlachFirstCombat", JSON.stringify(tallies)); // vitest 4 needs --disable-console-intercept
    expect(tallies).toEqual([1, 2, 3]); // Relentless Assault's combat, Karlach's, then the turn's own
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("(2) the first-strike combat damage step exists only with a first or double striker in combat (CR 510.4)", () => {
  /**
   * The user attacks with `attackerId` from the declare attackers step; the AI blocks with `blockerId` if given. Once the block
   * declaration has closed and the user holds priority in the declare blockers step on an empty stack, `afterBlocks(state)` acts
   * (once). Every other window is passed. Returns the combat steps entered, the AI's life lost and the final state.
   */
  function combatSteps({ user, ai = [], userHand = [], attackerId, blockerId = null, afterBlocks = null }) {
    let s = table({ user, ai, userHand, phase: "combat", step: "declare-attackers" });
    s = act(s, "user", "declare-attacker", (a) => a.permanentId === attackerId);
    const steps = [];
    const lifeBefore = s.players.ai.life;
    let acted = !afterBlocks;
    for (let g = 0; g < 60 && s.phase === "combat"; g++) {
      if (steps.at(-1) !== s.step) steps.push(s.step);
      if (blockerId && s.step === "declare-blockers" && s.priorityHolder === "ai" && offered(s, "ai", "declare-blocker").some((a) => a.permanentId === blockerId)) {
        s = act(s, "ai", "declare-blocker", (a) => a.permanentId === blockerId);
        continue;
      }
      if (!acted && s.step === "declare-blockers" && s.combat?._blockTriggersFired && !s.combat?.blockDeclarationOpen && s.priorityHolder === "user" && s.stack.length === 0) {
        acted = true;
        s = afterBlocks(s);
        continue;
      }
      s = pass(s);
    }
    return { steps, aiLifeLost: lifeBefore - s.players.ai.life, state: s };
  }

  it("⭐ no first or double strike in combat: the declare blockers step goes straight to the combat damage step", () => {
    const { steps, aiLifeLost } = combatSteps({ user: [P("gb", GRIZZLY_BEARS, "user")], attackerId: "gb" });
    console.log("  WITNESS noFirstStrike", JSON.stringify({ steps, aiLifeLost })); // vitest 4 needs --disable-console-intercept
    expect({ steps, aiLifeLost }).toEqual({ steps: ["declare-attackers", "declare-blockers", "combat-damage", "end-of-combat"], aiLifeLost: 2 });
  });

  it("⭐ a blocked attacker and a blocker, neither with first strike: no first-strike damage step, and they trade in the combat damage step", () => {
    const { steps, state } = combatSteps({ user: [P("gb", GRIZZLY_BEARS, "user")], ai: [P("gba", GRIZZLY_BEARS, "ai")], attackerId: "gb", blockerId: "gba" });
    const dead = [...state.players.user.graveyard, ...state.players.ai.graveyard].map((c) => c.name);
    expect({ steps, dead }).toEqual({ steps: ["declare-attackers", "declare-blockers", "combat-damage", "end-of-combat"], dead: ["Grizzly Bears", "Grizzly Bears"] });
  });

  it("control: a first-strike attacker gets the first-strike damage step", () => {
    const { steps, aiLifeLost } = combatSteps({ user: [P("yk", YOUTHFUL_KNIGHT, "user")], attackerId: "yk" });
    expect({ steps, aiLifeLost }).toEqual({ steps: ["declare-attackers", "declare-blockers", "first-strike-damage", "combat-damage", "end-of-combat"], aiLifeLost: 2 });
  });

  it("control: a first-strike BLOCKER alone gets the step, and kills the attacker before it deals damage", () => {
    const { steps, state } = combatSteps({ user: [P("gb", GRIZZLY_BEARS, "user")], ai: [P("yk", YOUTHFUL_KNIGHT, "ai")], attackerId: "gb", blockerId: "yk" });
    const row = { steps, userGraveyard: state.players.user.graveyard.map((c) => c.name), knight: state.players.ai.battlefield.some((p) => p.id === "yk") };
    expect(row).toEqual({ steps: ["declare-attackers", "declare-blockers", "first-strike-damage", "combat-damage", "end-of-combat"], userGraveyard: ["Grizzly Bears"], knight: true });
  });

  it("⭐ a first-strike blocker removed from combat (its controller changes — CR 506.4) no longer counts: no first-strike damage step, and the attacker stays blocked", () => {
    const { steps, aiLifeLost, state } = combatSteps({
      user: [P("gb", GRIZZLY_BEARS, "user"), ...lands("mt", MOUNTAIN, 5, "user")], ai: [P("yk", YOUTHFUL_KNIGHT, "ai")], userHand: [{ id: "h-turn", ...TURN_AGAINST }],
      attackerId: "gb", blockerId: "yk",
      afterBlocks: (s) => act(s, "user", "cast-spell", (a) => a.name === "Turn Against" && (a.targets || []).some((t) => t.id === "yk")),
    });
    const knight = state.players.user.battlefield.find((p) => p.id === "yk");
    const bears = state.players.user.battlefield.find((p) => p.id === "gb");
    const row = { steps, aiLifeLost, knightNowUsers: !!knight, bearsDamage: bears?.damageMarked ?? "dead", knightDamage: knight?.damageMarked ?? "dead" };
    console.log("  WITNESS removedFirstStriker", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ steps: ["declare-attackers", "declare-blockers", "combat-damage", "end-of-combat"], aiLifeLost: 0, knightNowUsers: true, bearsDamage: 0, knightDamage: 0 });
  });

  it("control: first strike GRANTED after blocks (Sure Strike in the declare blockers step) counts as the combat damage step begins — the attacker kills its blocker first", () => {
    const { steps, state } = combatSteps({
      user: [P("gb", GRIZZLY_BEARS, "user"), ...lands("mt", MOUNTAIN, 2, "user")], ai: [P("gba", GRIZZLY_BEARS, "ai")], userHand: [{ id: "h-sure", ...SURE_STRIKE }],
      attackerId: "gb", blockerId: "gba",
      afterBlocks: (s) => act(s, "user", "cast-spell", (a) => a.name === "Sure Strike" && (a.targets || []).some((t) => t.id === "gb")),
    });
    const row = { steps, aiGraveyard: state.players.ai.graveyard.map((c) => c.name), bearsAlive: state.players.user.battlefield.some((p) => p.id === "gb") };
    expect(row).toEqual({ steps: ["declare-attackers", "declare-blockers", "first-strike-damage", "combat-damage", "end-of-combat"], aiGraveyard: ["Grizzly Bears"], bearsAlive: true });
  });

  it("control: double strike still deals damage in both combat damage steps", () => {
    const { steps, aiLifeLost } = combatSteps({ user: [P("fa", FENCING_ACE, "user")], attackerId: "fa" });
    expect({ steps, aiLifeLost }).toEqual({ steps: ["declare-attackers", "declare-blockers", "first-strike-damage", "combat-damage", "end-of-combat"], aiLifeLost: 2 });
  });

  it("control: no attackers — the declare blockers and combat damage steps are skipped (CR 508.8)", () => {
    let s = table({ user: [P("gb", GRIZZLY_BEARS, "user")], phase: "combat", step: "declare-attackers" });
    const steps = [];
    for (let g = 0; g < 20 && s.phase === "combat"; g++) { if (steps.at(-1) !== s.step) steps.push(s.step); s = pass(s); }
    expect(steps).toEqual(["declare-attackers", "end-of-combat"]);
  });
});
