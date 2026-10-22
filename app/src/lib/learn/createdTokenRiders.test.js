/**
 * CREATED-TOKEN RIDERS — the pronoun forms and "attacks this combat if able" (play-weighted 2026-10-21).
 *
 * Right after a create-token atom, the sentence about "it" / "they" names the tokens that atom made (CR 608.2c):
 *   · Sokenzan, Crucible of Defiance (EDHREC #996) — "Channel — {3}{R}, Discard this card: Create two 1/1 colorless Spirit creature
 *     tokens. They gain haste until end of turn. …";
 *   · Krenko, Baron of Tin Street — "… you may pay {R}. If you do, create a 1/1 red Goblin creature token. It gains haste until end
 *     of turn.";
 *   · Legion Warboss (#1798) — "At the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token gains haste
 *     until end of turn and attacks this combat if able."; Howlsquad Heavy — "That token attacks this combat if able.".
 * "It" only after an atom that made exactly one token, "they" only after one that made several — a pronoun that could name
 * something else stays unread. Haste is a layer-6 grant on exactly those tokens that ends with the turn (CR 611.2a, CR 702.10b).
 * "Attacks this combat if able" is a requirement on those tokens for the combat in progress (CR 508.1d): the declaration can't close
 * while one that is able to attack is undeclared, and an additional combat later in the turn is another combat — no requirement.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard). The runtime witnesses drive legalActionsForPlayer →
 * dispatchAction → resolveTopOfStack and the engine's own step advance.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, advanceStep, runStepActions } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { requiredAttackerIds, mustAttackNow } from "./attackRequirements.js";
import { applyCreateToken } from "./effects/atoms/tokens.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SOKENZAN = {"name":"Sokenzan, Crucible of Defiance","type":"Legendary Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":["Channel"],"colors":[],"oracle":"{T}: Add {R}.\nChannel — {3}{R}, Discard this card: Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn. This ability costs {1} less to activate for each legendary creature you control."}; // land-partial on c2d7f0b0
const KRENKO_BARON = {"name":"Krenko, Baron of Tin Street","type":"Legendary Creature — Goblin","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":["Haste"],"colors":["R"],"oracle":"Haste\n{T}, Sacrifice an artifact: Put a +1/+1 counter on each Goblin you control.\nWhenever an artifact is put into a graveyard from the battlefield, you may pay {R}. If you do, create a 1/1 red Goblin creature token. It gains haste until end of turn."}; // body-only on c2d7f0b0
const LEGION_WARBOSS = {"name":"Legion Warboss","type":"Creature — Goblin Soldier","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":["Mentor"],"colors":["R"],"oracle":"Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token gains haste until end of turn and attacks this combat if able."}; // body-only on c2d7f0b0
const HOWLSQUAD_HEAVY = {"name":"Howlsquad Heavy","type":"Creature — Goblin Mercenary","mana":"{2}{R}","cmc":3,"power":"2","toughness":"3","keywords":["Max speed","Start your engines!"],"colors":["R"],"oracle":"Start your engines!\nOther Goblins you control have haste.\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token attacks this combat if able.\nMax speed — {T}: Add {R} for each Goblin you control."}; // body-only on c2d7f0b0
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};

const cardOf = (card, id) => ({ ...card, id });
const perm = (id, card, controller = "user", extra = {}) => createPermanent({ id, card: cardOf(card, `c-${id}`), controller, summoningSick: false, ...extra });
const lands = (prefix, n) => Array.from({ length: n }, (_, i) => perm(`${prefix}${i + 1}`, MOUNTAIN));
function board({ bf = [], hand = [], turn = 3 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, library: [], graveyard: [] }, ai: { ...s0.players.ai, battlefield: [], library: [] } } };
}
const tokensNamed = (s, name) => s.players.user.battlefield.filter((p) => p.card?.token && p.card.name === name);
const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle })?.atoms || [];

describe("the reader", () => {
  it("⭐ the cards play their whole text", () => {
    expect([SOKENZAN, KRENKO_BARON, LEGION_WARBOSS, HOWLSQUAD_HEAVY].map((c) => classifyCard(c)))
      .toEqual(["land", "native-mixed", "native-trigger", "native-mana"]);
  });
  it("⭐ the atoms: 'They' after several tokens, 'It' after one, the attack requirement with and without the haste", () => {
    expect(atoms("Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn.")).toEqual([
      { op: "create-token", count: 2, power: 1, toughness: 1, descriptor: "colorless spirit", targetType: null, hasteUntilEot: true },
    ]);
    expect(atoms("Create a 1/1 red Goblin creature token. It gains haste until end of turn.")).toEqual([
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "red goblin", targetType: null, hasteUntilEot: true },
    ]);
    const [boss] = detectTriggers(LEGION_WARBOSS).filter((d) => d.event === "combatBegin");
    expect(parseEffectClause(boss.effectClause, "Instant", { hasX: false, sourceScoped: true }).atoms).toEqual([
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "red goblin", targetType: null, hasteUntilEot: true, mustAttackThisCombat: true },
    ]);
    expect(atoms("Create a 1/1 red Goblin creature token. That token attacks this combat if able.")).toEqual([
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "red goblin", targetType: null, mustAttackThisCombat: true },
    ]);
  });
  it("control: the pronoun must agree with the tokens made — 'it' after two, 'they' after one, and a bare pronoun after no token stay unread", () => {
    for (const oracle of [
      "Create two 1/1 colorless Spirit creature tokens. It gains haste until end of turn.",
      "Create a 1/1 red Goblin creature token. They gain haste until end of turn.",
      "Draw a card. It gains haste until end of turn.",
      "Create a 1/1 red Goblin creature token. It gains haste until end of turn and can't block.",
    ]) {
      const p = parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle });
      expect({ oracle, confidence: programConfidence(p) }).toEqual({ oracle, confidence: "low" });
    }
  });
  it("control: Loyal Apprentice's 'That token gains haste until end of turn.' reads as before", () => {
    expect(atoms("Create a 1/1 colorless Thopter artifact creature token with flying. That token gains haste until end of turn.")).toEqual([
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless thopter artifact", targetType: null, keywords: ["Flying"], hasteUntilEot: true },
    ]);
  });
});

describe("Sokenzan, Crucible of Defiance", () => {
  const sokBoard = (extra = []) => ({ ...board({ bf: [...lands("m", 4), ...extra], hand: [cardOf(SOKENZAN, "c-sok")] }) });
  const channel = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "discard-ability" && a.cardId === "c-sok");
  it("⭐ Channel: two 1/1 colorless Spirits, both with haste — they may attack this turn", () => {
    const s0 = sokBoard();
    const act = channel(s0);
    expect(act, "the Channel ability is offered").toBeTruthy();
    const made = resolveTopOfStack(dispatchAction(s0, act));
    const spirits = tokensNamed(made, "Spirit");
    expect({ discarded: made.players.user.graveyard.map((c) => c.id), spirits: spirits.map((t) => [t.card.type, creaturePower(t, made), permanentHasKeyword(made, t.id, "Haste")]) })
      .toEqual({ discarded: ["c-sok"], spirits: [["Token Creature — Spirit", 1, true], ["Token Creature — Spirit", 1, true]] });
    const atAttackers = runStepActions(advanceStep(runStepActions(advanceStep(made))));
    const attackOffers = legalActionsForPlayer(atAttackers, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect(spirits.every((t) => attackOffers.includes(t.id))).toBe(true);
  });
  it("the haste ends with the turn (CR 611.2a)", () => {
    const act = channel(sokBoard());
    expect(act, "the Channel ability is offered").toBeTruthy();
    let s = resolveTopOfStack(dispatchAction(sokBoard(), act));
    const ids = tokensNamed(s, "Spirit").map((t) => t.id);
    const start = s.turn;
    for (let g = 0; s.turn === start && g < 40; g++) { s = runStepActions(advanceStep(s)); while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); }
    expect({ next: s.turn > start, haste: ids.map((id) => !!findPermanent(s, id) && permanentHasKeyword(s, id, "Haste")) }).toEqual({ next: true, haste: [false, false] });
  });
  it("one legendary creature: the Channel costs {2}{R}", () => {
    expect(channel(sokBoard([perm("isa", ISAMARU)]))?.cost?.generic).toBe(2);
  });
});

describe("Krenko, Baron of Tin Street", () => {
  it("⭐ sacrificing an artifact to its own ability: pay {R} → a Goblin with haste until end of turn, then every Goblin (the new one too) gets a counter", () => {
    const s0 = board({ bf: [perm("krenko", KRENKO_BARON), perm("ring", SOL_RING), ...lands("m", 1)] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "krenko");
    expect(act, "the sacrifice ability is offered").toBeTruthy();
    let s = dispatchAction(s0, act);
    expect(s.stack.map((o) => o.source?.name)).toEqual(["Krenko, Baron of Tin Street", "Krenko, Baron of Tin Street"]);
    s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBeTruthy();
    s = resolveOptionalManaPaymentChoice(s, true);
    const [goblin] = tokensNamed(s, "Goblin");
    expect({ goblin: !!goblin, haste: permanentHasKeyword(s, goblin.id, "Haste") }).toEqual({ goblin: true, haste: true });
    s = resolveTopOfStack(s);
    expect({ krenko: findPermanent(s, "krenko").permanent.counters?.["+1/+1"], goblin: findPermanent(s, goblin.id).permanent.counters?.["+1/+1"], ring: !!findPermanent(s, "ring") })
      .toEqual({ krenko: 1, goblin: 1, ring: false });
  });
  it("declined: no Goblin", () => {
    const s0 = board({ bf: [perm("krenko", KRENKO_BARON), perm("ring", SOL_RING), ...lands("m", 1)] });
    let s = dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "krenko"));
    s = resolveOptionalManaPaymentChoice(resolveTopOfStack(s), false);
    expect(tokensNamed(s, "Goblin")).toEqual([]);
  });
});

describe("Legion Warboss, Howlsquad Heavy — attacks this combat if able", () => {
  const toCombat = (s) => runStepActions(advanceStep(s));
  const toAttackers = (s) => runStepActions(advanceStep(s));
  it("⭐ Legion Warboss: the Goblin has haste and must attack — the declaration can't close until it is declared; then it may", () => {
    const made = resolveTopOfStack(toCombat(board({ bf: [perm("boss", LEGION_WARBOSS)] })));
    const [goblin] = tokensNamed(made, "Goblin");
    expect(goblin, "a Goblin was made").toBeTruthy();
    const at = toAttackers(made);
    const offered = legalActionsForPlayer(at, "user");
    const required = [...requiredAttackerIds(at, "user", offered)];
    const declared = dispatchAction(at, offered.find((a) => a.kind === "declare-attacker" && a.permanentId === goblin.id));
    const after = legalActionsForPlayer(declared, "user");
    expect({ haste: permanentHasKeyword(made, goblin.id, "Haste"), required, kinds: [...new Set(offered.map((a) => a.kind))], passAfter: after.some((a) => a.kind === "pass-priority"),
      attackers: (declared.combat?.attackers || []).map((a) => a.permanentId) })
      .toEqual({ haste: true, required: [goblin.id], kinds: ["declare-attacker"], passAfter: true, attackers: [goblin.id] });
  });
  it("⭐ an additional combat this turn is another combat: the first Goblin is not required there; the Goblins made in it are", () => {
    const first = resolveTopOfStack(toCombat(board({ bf: [perm("boss", LEGION_WARBOSS)] })));
    const [goblin1] = tokensNamed(first, "Goblin");
    expect(goblin1, "a Goblin was made").toBeTruthy();
    // SETUP: an additional combat phase after this one (CR 500.8 — what Relentless Assault queues); the first combat passes with no
    // attack declared (the engine's own step advance), so the first Goblin is untapped and able to attack in the second.
    let s = { ...first, extraPhases: [{}] };
    for (let g = 0; g < 12 && !(s.step === "beginning-of-combat" && s.combatsThisTurn?.count > 1); g++) s = runStepActions(advanceStep(s));
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    const newGoblins = tokensNamed(s, "Goblin").filter((t) => t.id !== goblin1.id).map((t) => t.id).sort();
    const at = toAttackers(s);
    const offered = legalActionsForPlayer(at, "user");
    const required = [...requiredAttackerIds(at, "user", offered)].sort();
    expect({ second: s.combatsThisTurn.count > 1, goblin1Untapped: !findPermanent(at, goblin1.id).permanent.tapped,
      offered1: offered.some((a) => a.kind === "declare-attacker" && a.permanentId === goblin1.id), goblin1Required: required.includes(goblin1.id), madeHere: newGoblins.length > 0, required })
      .toEqual({ second: true, goblin1Untapped: true, offered1: true, goblin1Required: false, madeHere: true, required: newGoblins });
  });
  it("Howlsquad Heavy: its Goblin must attack this combat (its haste is the Heavy's own static)", () => {
    const made = resolveTopOfStack(toCombat(board({ bf: [perm("heavy", HOWLSQUAD_HEAVY)] })));
    const [goblin] = tokensNamed(made, "Goblin");
    expect(goblin, "a Goblin was made").toBeTruthy();
    const at = toAttackers(made);
    expect({ haste: permanentHasKeyword(at, goblin.id, "Haste"), required: [...requiredAttackerIds(at, "user", legalActionsForPlayer(at, "user"))] })
      .toEqual({ haste: true, required: [goblin.id] });
  });
  it("control: a token made outside a combat phase carries no requirement (there is no \"this combat\")", () => {
    const atom = { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "red goblin", targetType: null, mustAttackThisCombat: true };
    const s = applyCreateToken(board({}), atom, { controller: "user" });
    const [goblin] = tokensNamed(s, "Goblin");
    expect({ made: !!goblin, stamp: goblin.mustAttackCombat ?? null, must: mustAttackNow(s, "user", goblin) }).toEqual({ made: true, stamp: null, must: false });
  });
});

// ── GAINED WITH IT: three modal spells whose token mode carries the pronoun sentence ──
const ARTISTIC_PROCESS = {"name":"Artistic Process","type":"Sorcery","mana":"{3}{R}{R}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Choose one —\n• Artistic Process deals 6 damage to target creature.\n• Artistic Process deals 2 damage to each creature you don't control.\n• Create a 3/3 blue and red Elemental creature token with flying. It gains haste until end of turn."}; // arbiter-spell on c2d7f0b0
const BURN_DOWN_THE_HOUSE = {"name":"Burn Down the House","type":"Sorcery","mana":"{3}{R}{R}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Choose one —\n• Burn Down the House deals 5 damage to each creature and each planeswalker.\n• Create three 1/1 red Devil creature tokens with \"When this token dies, it deals 1 damage to any target.\" They gain haste until end of turn."}; // arbiter-spell on c2d7f0b0
const STINGERQUILL_CHARM = {"name":"Stingerquill Charm","type":"Instant","mana":"{B}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B","R"],"oracle":"Choose one —\n• Stingerquill Charm deals 3 damage to any target.\n• Target creature gains first strike and deathtouch until end of turn.\n• Create a 2/2 colorless Wizard Soldier creature token named Cadet. It gains haste until end of turn."}; // arbiter-spell on c2d7f0b0
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};

describe("GAINED WITH IT — the token mode of three modal spells", () => {
  const modeCast = (s, cardId, mode) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.chosenMode === mode || a.mode === mode || a.modeIndex === mode));
  it("⭐ the three read native", () => {
    expect([ARTISTIC_PROCESS, BURN_DOWN_THE_HOUSE, STINGERQUILL_CHARM].map((c) => classifyCard(c))).toEqual(["native-spell", "native-spell", "native-spell"]);
  });
  it("⭐ Burn Down the House's second mode: three 1/1 red Devils, each with haste and its dies ping", () => {
    const s0 = board({ bf: lands("m", 5), hand: [cardOf(BURN_DOWN_THE_HOUSE, "c-bdh")] });
    const act = modeCast(s0, "c-bdh", 1);
    expect(act, "the Devils mode is offered").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, act));
    expect(tokensNamed(s, "Devil").map((t) => [permanentHasKeyword(s, t.id, "Haste"), t.card.oracle])).toEqual([
      [true, "When this token dies, it deals 1 damage to any target."], [true, "When this token dies, it deals 1 damage to any target."], [true, "When this token dies, it deals 1 damage to any target."]]);
  });
  it("Artistic Process's third mode: a 3/3 flying Elemental with haste", () => {
    const s0 = board({ bf: lands("m", 5), hand: [cardOf(ARTISTIC_PROCESS, "c-ap")] });
    const act = modeCast(s0, "c-ap", 2);
    expect(act, "the Elemental mode is offered").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, act));
    const [el] = tokensNamed(s, "Elemental");
    expect({ pt: el && creaturePower(el, s), flying: el && permanentHasKeyword(s, el.id, "Flying"), haste: el && permanentHasKeyword(s, el.id, "Haste") }).toEqual({ pt: 3, flying: true, haste: true });
  });
  it("Stingerquill Charm's third mode: a 2/2 Cadet with haste", () => {
    const s0 = board({ bf: [...lands("m", 1), perm("s1", SWAMP)], hand: [cardOf(STINGERQUILL_CHARM, "c-sc")] });
    const act = modeCast(s0, "c-sc", 2);
    expect(act, "the Cadet mode is offered").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0, act));
    const [cadet] = tokensNamed(s, "Cadet");
    expect({ type: cadet?.card.type, haste: !!cadet && permanentHasKeyword(s, cadet.id, "Haste") }).toEqual({ type: "Token Creature — Wizard Soldier", haste: true });
  });
});
