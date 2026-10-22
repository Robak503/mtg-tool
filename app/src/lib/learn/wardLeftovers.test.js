/**
 * wardLeftovers.test.js — WARD, THE LEFTOVERS (CR 702.21a; 115.7a, 115.7d; 707.10, 707.10c; 602.2b; 117.3b, 117.3c, 117.5).
 * Ward: "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter that spell or ability unless
 * that player pays [cost]" (CR 702.21a). The four ward slices of 2026-10-18 → 10-20 left these open:
 *
 *   1. A target CHOSEN AGAIN onto a ward permanent asked nothing outside Misdirection's path: Deflecting Swat ("You may choose new
 *      targets for target spell or ability", CR 115.7d — atoms/stack.applyRetarget) and Hydroelectric Specimen ("you may change the
 *      target of target instant or sorcery spell with a single target to this creature", CR 115.7a — applyRedirectToSource) moved
 *      a spell onto a ward permanent and it resolved free.
 *   2. Two hand and graveyard activations put a TARGETED ability on the stack with no ward: a channel ability ("<mana>, Discard this
 *      card: …", actionDispatcher.applyDiscardAbility) and a graveyard exile-cost ability ("<mana>, Exile this card from your
 *      graveyard: …", applyActivateGyExile). Their targets are chosen as they are activated (CR 602.2b), like any activated ability's.
 *   3. The engine's own pick of a copy's new targets (CR 707.10c — the storm copies' freshCopyTargets and the "you may choose new
 *      targets for the copy" pick, newTargetsForCopy) ignored ward: it aimed a copy at a ward permanent its controller could not
 *      pay for while another target on the same side was free of it, and the copy was countered for nothing.
 *   4. Diffusion Sliver ("Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls,
 *      counter that spell or ability unless its controller pays {2}.") was asked for one targeted Sliver and one Diffusion Sliver
 *      only, never for a triggered ability, a copy or a changed target, and was dropped when a ward on the same spell took the
 *      question. Each targeted Sliver triggers each Diffusion Sliver its controller controls; every one is now part of the one
 *      pay-or-be-countered question the wards on that spell or ability ask.
 *   5. After a ward was settled, priority went to the player who cast the spell or activated the ability. The ward is a triggered
 *      ability and its question is its resolution; after a spell or ability resolves the ACTIVE player receives priority (CR 117.3b).
 *      The caster's own priority (CR 117.3c) comes before that, with the ward on the stack (CR 117.5) — the window the engine's
 *      immediate question skips; a player handed priority after the ward is settled is one the rules never hand it to.
 *
 * Engine paths: the session driver (advanceUntilDecision / applyChoice / applyPendingChoice) for the person's spells, abilities and
 * answers; dispatchAction for an AI seat's spell. Real oracle fixtures (bundled Scryfall, cardIndex.publicCard, read 2026-10-21).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall) ──
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"Destroy target creature."};
const TWINCAST = {"name":"Twincast","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."};
const SCATTERSHOT = {"name":"Scattershot","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":["Storm"],"colors":["R"],"colorIdentity":["R"],"oracle":"Scattershot deals 1 damage to target creature.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const WEAVER_OF_LIGHTNING = {"name":"Weaver of Lightning","type":"Creature — Human Shaman","mana":"{2}{R}","cmc":3,"power":"1","toughness":"4","keywords":["Reach"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach (This creature can block creatures with flying.)\nWhenever you cast an instant or sorcery spell, this creature deals 1 damage to target creature an opponent controls."};
const DIFFUSION_SLIVER = {"name":"Diffusion Sliver","type":"Creature — Sliver","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}."};
const MUSCLE_SLIVER = {"name":"Muscle Sliver","type":"Creature — Sliver","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"All Sliver creatures get +1/+1."};
const PLATE_ARMOR = {"name":"Plate Armor","type":"Artifact — Equipment","mana":"{2}{W}","cmc":3,"keywords":["Equip"],"colors":["W"],"colorIdentity":["W"],"oracle":"Equipped creature gets +3/+3 and has ward {1}. (Whenever equipped creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\nEquip {3}. This ability costs {1} less to activate for each other Equipment you control. ({3}: Attach to target creature you control. Equip only as a sorcery.)"};
const INTO_THE_VOID = {"name":"Into the Void","type":"Sorcery","mana":"{3}{U}","cmc":4,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Return up to two target creatures to their owners' hands."};
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature gets +3/+3 until end of turn."};
const DEFLECTING_SWAT = {"name":"Deflecting Swat","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.","layout":"normal"};
const HEXING_SQUELCHER = {"name":"Hexing Squelcher","type":"Creature — Goblin Sorcerer","mana":"{1}{R}","cmc":2,"power":"2","toughness":"2","keywords":["Ward"],"colors":["R"],"colorIdentity":["R"],"oracle":"This spell can't be countered.\nWard—Pay 2 life.\nSpells you control can't be countered.\nOther creatures you control have \"Ward—Pay 2 life.\"","layout":"normal"};
const HYDROELECTRIC_SPECIMEN = {"name":"Hydroelectric Specimen // Hydroelectric Laboratory","type":"Creature — Weird // Land","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Flash"],"colors":[],"colorIdentity":["U"],"oracle":"Hydroelectric Specimen - Creature — Weird {2}{U}\nFlash\nWhen this creature enters, you may change the target of target instant or sorcery spell with a single target to this creature.\n//\nHydroelectric Laboratory - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.","layout":"modal_dfc"};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal"};
const CRYOTHEORY_ADEPT = {"name":"Cryotheory Adept","type":"Creature — Human Wizard","mana":"{1}{U}","cmc":2,"power":"2","toughness":"1","keywords":["Prowess"],"colors":["U"],"colorIdentity":["U"],"oracle":"Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\n{3}{U}, Exile this card from your graveyard: Tap target creature and put a stun counter on it. Activate only as a sorcery. (If a permanent with a stun counter would become untapped, remove one from it instead.)","layout":"normal"};
const GHOST_LIT_RAIDER = {"name":"Ghost-Lit Raider","type":"Creature — Spirit","mana":"{2}{R}","cmc":3,"power":"2","toughness":"1","keywords":["Channel"],"colors":["R"],"colorIdentity":["R"],"oracle":"{2}{R}, {T}: This creature deals 2 damage to target creature.\nChannel — {3}{R}, Discard this card: It deals 4 damage to target creature.","layout":"normal"};

const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ id, ...card });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat game in a precombat main phase, the stack empty; the user seat is a person (state.humanSeats). */
function board({ user = [], ai = [], hand = [], aiHand = [], userGy = [], userPool = EMPTY, aiPool = EMPTY, active = "user", holder = active, passes = 0, userSpells = 0 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, humanSeats: ["user"], turn: 4, activePlayer: active, priorityHolder: holder, phase: "precombat-main", step: "main", consecutivePasses: passes, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, graveyard: userGy, manaPool: { ...g.players.user.manaPool, ...userPool }, library: LIB("user"), spellsCastThisTurn: userSpells },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, manaPool: { ...g.players.ai.manaPool, ...aiPool }, library: LIB("ai") } } };
}
/** A four-seat Commander pod (user, ai1, ai2, ai3) in a precombat main phase. `seats` gives each seat's battlefield / hand / pool. */
function pod({ seats = {}, active = "user", holder = active } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    const s = seats[pid] || {};
    players[pid] = { ...players[pid], battlefield: s.battlefield || [], hand: s.hand || [], manaPool: { ...players[pid].manaPool, ...(s.pool || EMPTY) }, library: LIB(pid) };
  }
  return { ...g, humanSeats: ["user"], turn: 4, activePlayer: active, priorityHolder: holder, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const session = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });
const targetsOf = (a) => (a.targets || []).map((t) => t.id).sort().join(",");
const option = (r, pred) => {
  const action = (r.decision.options || []).find(pred);
  if (!action) throw new Error(`no such option: ${JSON.stringify((r.decision.options || []).map((a) => [a.kind, a.cardId ?? a.permanentId, targetsOf(a)]))}`);
  return action;
};
/** Pass priority while the stack holds anything and the person is asked to act. */
function passUntilEmpty(r) {
  let cur = r;
  for (let i = 0; i < 16 && cur.decision.kind === "ask" && cur.session.state.stack.length; i++) cur = applyChoice(cur.session, option(cur, (a) => a.kind === "pass-priority"));
  return cur;
}
const answer = (r, pay) => applyPendingChoice(r.session, { kind: "soft-counter", pay });
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.spellName, e.sourceName]);
const MANA = (generic) => ({ kind: "mana", mana: { generic, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
const decisionRow = (d) => ({ kind: d.kind, controller: d.controller ?? null, spellName: d.spellName ?? null, sourceName: d.sourceName ?? null, cost: d.cost ?? null });
const castAt = (r, cardId, targetIds) => applyChoice(r.session, option(r, (a) => a.kind === "cast-spell" && a.cardId === cardId && targetsOf(a) === [...targetIds].sort().join(",")));

describe("1 · a target chosen again onto a ward permanent (CR 115.7a, 115.7d) raises the ward", () => {
  it("⭐ Deflecting Swat: ai1's Murder at your Grizzly Bears, you choose new targets for it — the only other creature is ai2's Leonin Lightbringer, so ai1 is asked the {2}, can't pay, and the Murder is countered (before: it destroyed the Lightbringer free)", () => {
    const start = pod({ active: "user", holder: "ai1", seats: {
      user: { battlefield: [P("ubear", GRIZZLY_BEARS, "user")], hand: [H("swat", DEFLECTING_SWAT), H("opt", OPT)], pool: { ...EMPTY, R: 1, U: 1, C: 2 } },
      ai1: { hand: [H("murder", MURDER)], pool: { ...EMPTY, B: 3 } },
      ai2: { battlefield: [P("light", LEONIN_LIGHTBRINGER, "ai2")] } } });
    const cast = dispatchAction(start, legalActionsForPlayer(start, "ai1").find((a) => a.kind === "cast-spell" && a.cardId === "murder" && targetsOf(a) === "ubear"));
    const asked = advanceUntilDecision(session(cast));
    const murderId = asked.session.state.stack[0].id;
    const swatted = passUntilEmpty(castAt(asked, "swat", [murderId]));
    const may = swatted.decision.kind === "optional-effect" ? applyPendingChoice(swatted.session, { kind: "optional-effect", take: true }) : swatted;
    const end = passUntilEmpty(may).session.state;
    const row = { asks: wardAsks(end), ai2: names(end, "ai2"), user: names(end, "user") };
    console.log(`  WITNESS swat-onto-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ asks: [["ai1", "Murder", "Leonin Lightbringer"]], ai2: ["Leonin Lightbringer"], user: ["Grizzly Bears"] });
  });

  it("⭐ Hydroelectric Specimen: the AI's Lightning Bolt at you moves to the Specimen, which has Hexing Squelcher's \"Ward—Pay 2 life\" — the AI is asked the 2 life and pays it (before: the Bolt moved free)", () => {
    let s = board({ active: "ai", user: [P("squelch", HEXING_SQUELCHER, "user")], hand: [H("spec", HYDROELECTRIC_SPECIMEN), H("opt", OPT)], userPool: { ...EMPTY, U: 4 }, aiHand: [H("bolt", LIGHTNING_BOLT)], aiPool: { ...EMPTY, R: 1 } });
    s = dispatchAction(s, legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && targetsOf(a) === "user"));
    const boltId = s.stack[0].id;
    s = { ...s, priorityHolder: "user" };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "spec"));
    s = resolveTopOfStack(s); // the Specimen enters; its trigger targets the Bolt
    s = resolveTopOfStack(s); // the trigger resolves to its printed "may"
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, true);
    const specId = s.players.user.battlefield.find((p) => /Hydroelectric/.test(p.card?.name || ""))?.id;
    const moved = s.stack.find((o) => o.id === boltId)?.targets.map((t) => t.id);
    const end = passUntilEmpty(advanceUntilDecision(session(s))).session.state;
    const row = { moved: moved?.[0] === specId, asks: wardAsks(end), aiLife: end.players.ai.life, specimenDamage: end.players.user.battlefield.find((p) => p.id === specId)?.damageMarked ?? null };
    console.log(`  WITNESS specimen-onto-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ moved: true, asks: [["ai", "Lightning Bolt", "Hydroelectric Specimen"]], aiLife: 18, specimenDamage: 3 });
  });
});

describe("2 · a targeted channel or graveyard ability is activated with its targets (CR 602.2b) — ward triggers on it", () => {
  it("⭐ your Ghost-Lit Raider's channel ability at the AI's Leonin Lightbringer asks the {2}: declining counters it and the Lightbringer lives (before: 4 damage, free)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("raider", GHOST_LIT_RAIDER), H("opt", OPT)], userPool: { ...EMPTY, R: 1, U: 4 } });
    const first = advanceUntilDecision(session(start));
    const asked = applyChoice(first.session, option(first, (a) => a.kind === "discard-ability" && a.cardId === "raider" && targetsOf(a) === "light"));
    const end = passUntilEmpty(answer(asked, false)).session.state;
    const row = { ask: decisionRow(asked.decision), ai: names(end, "ai") };
    console.log(`  WITNESS channel-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Ghost-Lit Raider", sourceName: "Leonin Lightbringer", cost: MANA(2) }, ai: ["Leonin Lightbringer"] });
  });

  it("⭐ your Cryotheory Adept's graveyard ability at the AI's Leonin Lightbringer asks the {2}: declining counters it and the Lightbringer stays untapped (before: tapped and stunned, free)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("opt", OPT)], userGy: [H("adept", CRYOTHEORY_ADEPT)], userPool: { ...EMPTY, U: 6 } });
    const first = advanceUntilDecision(session(start));
    const asked = applyChoice(first.session, option(first, (a) => a.kind === "activate-gy-exile" && a.cardId === "adept" && targetsOf(a) === "light"));
    const end = passUntilEmpty(answer(asked, false)).session.state;
    const light = end.players.ai.battlefield.find((p) => p.id === "light");
    const row = { ask: decisionRow(asked.decision), tapped: light?.tapped ?? null, stun: light?.counters?.stun ?? 0 };
    console.log(`  WITNESS gy-exile-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Cryotheory Adept", sourceName: "Leonin Lightbringer", cost: MANA(2) }, tapped: false, stun: 0 });
  });

  it("control: the channel ability at a creature without ward asks nothing (both trees)", () => {
    const start = board({ ai: [P("giant", HILL_GIANT, "ai")], hand: [H("raider", GHOST_LIT_RAIDER), H("opt", OPT)], userPool: { ...EMPTY, R: 1, U: 1, C: 3 } });
    const first = advanceUntilDecision(session(start));
    const end = passUntilEmpty(applyChoice(first.session, option(first, (a) => a.kind === "discard-ability" && a.cardId === "raider" && targetsOf(a) === "giant"))).session.state;
    expect({ asks: wardAsks(end), ai: names(end, "ai") }).toEqual({ asks: [], ai: [] });
  });
});

/**
 * The AI casts `card` at the person's Grizzly Bears; the person, holding priority, Twincasts it. The copy is the person's and its
 * target (the person's own Bears, the wrong side for a destroy) is re-aimed (newTargetsForCopy) among the AI's creatures, the
 * Leonin Lightbringer listed first. Returns the driver's first stop after the Twincast resolves.
 */
function twincastTheirs(aiCreatures, userPool) {
  const start = board({ active: "ai", user: [P("ubear", GRIZZLY_BEARS, "user")], ai: aiCreatures, hand: [H("twin", TWINCAST), H("opt", OPT)], userPool, aiHand: [H("aispell", MURDER)], aiPool: { ...EMPTY, B: 3 } });
  const cast = dispatchAction(start, legalActionsForPlayer(start, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "aispell" && targetsOf(a) === "ubear"));
  const asked = advanceUntilDecision(session(cast));
  const spellId = asked.session.state.stack[0].id;
  return passUntilEmpty(castAt(asked, "twin", [spellId]));
}

describe("3 · the engine's pick of a copy's new targets (CR 707.10c) passes over a ward its controller can't pay while another target is free of it", () => {
  it("⭐ Twincast on the AI's Murder with only {U}{U}{U}: the copy goes at the AI's Hill Giant, not its Leonin Lightbringer — no ward asked, the Giant destroyed (before: at the Lightbringer, asked, unpaid, countered)", () => {
    const end = passUntilEmpty(twincastTheirs([P("light", LEONIN_LIGHTBRINGER, "ai"), P("giant", HILL_GIANT, "ai")], { ...EMPTY, U: 3 })).session.state;
    const row = { asks: wardAsks(end), ai: names(end, "ai") };
    console.log(`  WITNESS copy-pick-free ${JSON.stringify(row)}`);
    expect(row).toEqual({ asks: [], ai: ["Leonin Lightbringer"] });
  });

  it("⭐ the storm copy of your Scattershot (the second spell this turn) at the AI's Hill Giant, nothing left for a ward: the copy stays on a target free of ward — the Giant takes 2 (before: the copy went at the Lightbringer, asked, unpaid, countered)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("giant", HILL_GIANT, "ai")], hand: [H("scatter", SCATTERSHOT), H("opt", OPT)], userPool: { ...EMPTY, R: 1, U: 1, C: 2 }, userSpells: 1 });
    const first = advanceUntilDecision(session(start));
    const end = passUntilEmpty(castAt(first, "scatter", ["giant"])).session.state;
    const row = { asks: wardAsks(end), giantDamage: end.players.ai.battlefield.find((p) => p.id === "giant")?.damageMarked ?? null, lightDamage: end.players.ai.battlefield.find((p) => p.id === "light")?.damageMarked ?? null };
    console.log(`  WITNESS storm-pick-free ${JSON.stringify(row)}`);
    expect(row).toEqual({ asks: [], giantDamage: 2, lightDamage: 0 });
  });

  it("control: with the {2} to pay, the copy's pick is unchanged — at the Lightbringer, asked, paid (both trees)", () => {
    const asked = twincastTheirs([P("light", LEONIN_LIGHTBRINGER, "ai"), P("giant", HILL_GIANT, "ai")], { ...EMPTY, U: 3, C: 2 });
    const end = passUntilEmpty(answer(asked, true)).session.state;
    expect({ ask: decisionRow(asked.decision), ai: names(end, "ai") }).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Leonin Lightbringer", cost: MANA(2) }, ai: ["Hill Giant"] });
  });

  it("control: when every target on the wanted side carries a ward the copier can't pay, the copy still goes there — asked, and countered (both trees)", () => {
    const asked = twincastTheirs([P("light", LEONIN_LIGHTBRINGER, "ai")], { ...EMPTY, U: 3 });
    const end = passUntilEmpty(answer(asked, true)).session.state;
    expect({ ask: decisionRow(asked.decision), ai: names(end, "ai"), user: names(end, "user") }).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Leonin Lightbringer", cost: MANA(2) }, ai: ["Leonin Lightbringer"], user: [] });
  });
});

describe("4 · Diffusion Sliver triggers on every path ward does, for every Sliver and every Diffusion Sliver, in the same one question", () => {
  it("⭐ on a TRIGGERED ability: you cast Opt, your Weaver of Lightning's ping aims at the AI's Diffusion Sliver — you are asked its {2}; declining counters the ping and the Sliver lives (before: no question, the 1/1 died)", () => {
    const start = board({ user: [P("weaver", WEAVER_OF_LIGHTNING, "user")], ai: [P("diff", DIFFUSION_SLIVER, "ai")], hand: [H("opt", OPT), H("opt2", OPT)], userPool: { ...EMPTY, U: 2 } });
    const first = advanceUntilDecision(session(start));
    const asked = applyChoice(first.session, option(first, (a) => a.kind === "cast-spell" && a.cardId === "opt"));
    const end = passUntilEmpty(answer(asked, false)).session.state;
    const row = { ask: decisionRow(asked.decision), ai: names(end, "ai") };
    console.log(`  WITNESS diffusion-trigger ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Weaver of Lightning", sourceName: "Diffusion Sliver", cost: MANA(2) }, ai: ["Diffusion Sliver"] });
  });

  it("⭐ on a COPY: your Twincast's copy of the AI's Murder is re-aimed at its Diffusion Sliver — you are asked the {2} (before: the copy destroyed it free)", () => {
    const asked = twincastTheirs([P("diff", DIFFUSION_SLIVER, "ai")], { ...EMPTY, U: 3, C: 2 });
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS diffusion-copy ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Diffusion Sliver", cost: MANA(2) });
  });

  it("⭐ two targeted Slivers trigger it twice: Into the Void at the AI's Diffusion Sliver and Muscle Sliver asks {4} (before: no question — two targets read as none)", () => {
    const start = board({ ai: [P("diff", DIFFUSION_SLIVER, "ai"), P("musc", MUSCLE_SLIVER, "ai")], hand: [H("void", INTO_THE_VOID), H("opt", OPT)], userPool: { ...EMPTY, U: 9 } });
    const asked = castAt(advanceUntilDecision(session(start)), "void", ["diff", "musc"]);
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS diffusion-two-slivers ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Into the Void", sourceName: "Diffusion Sliver", cost: MANA(4) });
  });

  it("⭐ two Diffusion Slivers each trigger: Murder at one of them asks {4} (before: {2})", () => {
    const start = board({ ai: [P("diff", DIFFUSION_SLIVER, "ai"), P("diff2", DIFFUSION_SLIVER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)], userPool: { ...EMPTY, B: 2, U: 1, C: 5 } });
    const asked = castAt(advanceUntilDecision(session(start)), "murder", ["diff"]);
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS diffusion-two-sources ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Diffusion Sliver", cost: MANA(4) });
  });

  it("⭐ a ward and Diffusion Sliver on one spell are one question: Murder at the AI's Muscle Sliver wearing Plate Armor (ward {1}) beside a Diffusion Sliver asks {3} (before: {1} — the Diffusion tax was dropped)", () => {
    const musc = P("musc", MUSCLE_SLIVER, "ai", { attachments: ["armor"] });
    const armor = P("armor", PLATE_ARMOR, "ai", { attachedTo: "musc" });
    const start = board({ ai: [musc, armor, P("diff", DIFFUSION_SLIVER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)], userPool: { ...EMPTY, B: 2, U: 1, C: 4 } });
    const asked = castAt(advanceUntilDecision(session(start)), "murder", ["musc"]);
    const end = passUntilEmpty(answer(asked, true)).session.state;
    const row = { ask: decisionRow(asked.decision), ai: names(end, "ai") };
    console.log(`  WITNESS ward-and-diffusion ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Muscle Sliver and Diffusion Sliver", cost: MANA(3) }, ai: ["Diffusion Sliver", "Plate Armor"] });
  });

  it("control: Murder at the AI's lone Diffusion Sliver asks {2}, as before (both trees)", () => {
    const start = board({ ai: [P("diff", DIFFUSION_SLIVER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)], userPool: { ...EMPTY, B: 2, U: 1, C: 3 } });
    expect(decisionRow(castAt(advanceUntilDecision(session(start)), "murder", ["diff"]).decision)).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Diffusion Sliver", cost: MANA(2) });
  });

  it("control: your Giant Growth on your own Sliver beside your Diffusion Sliver asks nothing (both trees)", () => {
    const start = board({ user: [P("udiff", DIFFUSION_SLIVER, "user"), P("umusc", MUSCLE_SLIVER, "user")], hand: [H("growth", GIANT_GROWTH), H("opt", OPT)], userPool: { ...EMPTY, G: 1, U: 1 } });
    const end = passUntilEmpty(castAt(advanceUntilDecision(session(start)), "growth", ["umusc"])).session.state;
    expect({ asks: wardAsks(end), stack: end.stack.length }).toEqual({ asks: [], stack: 0 });
  });
});

describe("5 · after a ward is settled the active player receives priority (CR 117.3b) — the ward is a triggered ability that has resolved", () => {
  it("⭐ the opponent's turn: you (holding priority) Murder their Lightbringer and pay the {2} — the AI, the active player, receives priority and passes; you are asked with the pass count at 1 (before: you held it, count 0)", () => {
    const start = board({ active: "ai", holder: "user", passes: 1, ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)], userPool: FULL });
    const asked = castAt(advanceUntilDecision(session(start)), "murder", ["light"]);
    const after = answer(asked, true);
    const s = after.session.state;
    const row = { ask: asked.decision.kind, next: after.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses, stack: s.stack.map((o) => o.source?.name) };
    console.log(`  WITNESS priority-after-ward-nap ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: "soft-counter", next: "ask", holder: "user", passes: 1, stack: ["Murder"] });
  });

  it("⭐ your turn: the AI (holding priority) Murders your Lightbringer and pays from its pool — you, the active player, receive priority with the count at 0 (before: the AI kept it and passed, count 1)", () => {
    const start = board({ active: "user", holder: "ai", passes: 1, user: [P("light", LEONIN_LIGHTBRINGER, "user")], aiHand: [H("aimurder", MURDER)], aiPool: { ...EMPTY, B: 3, C: 2 }, hand: [H("opt", OPT)], userPool: { ...EMPTY, U: 1 } });
    const cast = dispatchAction(start, legalActionsForPlayer(start, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "aimurder" && targetsOf(a) === "light"));
    const r = advanceUntilDecision(session(cast));
    const s = r.session.state;
    const row = { asked: wardAsks(s), next: r.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses, stack: s.stack.map((o) => o.source?.name) };
    console.log(`  WITNESS priority-after-ward-ai ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Murder", "Leonin Lightbringer"]], next: "ask", holder: "user", passes: 0, stack: ["Murder"] });
  });

  it("control: on your own turn your Murder at their Lightbringer, paid — you hold priority, count 0 (the active player IS the caster; both trees)", () => {
    const start = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)], userPool: FULL });
    const after = answer(castAt(advanceUntilDecision(session(start)), "murder", ["light"]), true);
    expect({ next: after.decision.kind, holder: after.session.state.priorityHolder, passes: after.session.state.consecutivePasses }).toEqual({ next: "ask", holder: "user", passes: 0 });
  });
});
