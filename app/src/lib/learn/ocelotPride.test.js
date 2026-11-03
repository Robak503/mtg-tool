/**
 * ocelotPride.test.js — OCELOT PRIDE (the play-weighted program, EDHREC #1101):
 *
 *   "First strike, lifelink
 *    Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)
 *    At the beginning of your end step, if you gained life this turn, create a 1/1 white Cat creature token. Then if you have the
 *    city's blessing, for each token you control that entered this turn, create a token that's a copy of it."
 *
 * The last line's second sentence was the one unread: the copy-each atom with its `enteredThisTurn` filter
 * (effects/atoms/tokenCopy.js → tokens.applyCreateTokenCopyEach), behind the city's-blessing condition. Its rulings, each witnessed:
 *   · the Cat it makes counts — it entered this turn;
 *   · "If the creature token created by Ocelot Pride's last ability is your tenth permanent, you'll get the city's blessing before the
 *     ability would check" — CR 702.131b ("any time"): runProgram grants the blessing once more before the condition is read;
 *   · "Any 'As [this permanent] enters the battlefield' or '[This permanent] enters the battlefield with' abilities of the tokens will
 *     also work" — each copy enters through the entry replacements (CR 707.5, 614.1c), one creation event on the board as it began;
 *   · the copies copy each token's copiable values (CR 707.2) — no counters, no damage, nothing that isn't copiable;
 *   · "Ocelot Pride doesn't need to have been on the battlefield when you gained life" — the per-turn life-gained tally (CR 603.4,
 *     the intervening-if checked as it triggers and as it resolves).
 * A token that entered on an earlier turn is not copied. Token doublers apply to each copy (CR 111.1, 616). Its owner's seat makes no
 * choice: the trigger has no target and no option, so the default AI's seat resolves it the same way.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, gainLife } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const OCELOT = {"name":"Ocelot Pride","type":"Creature — Cat","mana":"{W}","oracle":"First strike, lifelink\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your end step, if you gained life this turn, create a 1/1 white Cat creature token. Then if you have the city's blessing, for each token you control that entered this turn, create a token that's a copy of it.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Lifelink","Ascend","First strike"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1101
const FEEDER = {"name":"Spike Feeder","type":"Creature — Spike","mana":"{1}{G}{G}","oracle":"This creature enters with two +1/+1 counters on it.\n{2}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on target creature.\nRemove a +1/+1 counter from this creature: You gain 2 life.","layout":"normal","cmc":3,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #14640
const SOUL_WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","oracle":"Whenever another creature enters, you gain 1 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1349
const DOUBLING = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #231
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), enteredOnTurn: 1, ...extra });
const plains = (n, seat = "user") => Array.from({ length: n }, (_, i) => on(seat, `pl${i}`, PLAINS));
/** `seat`'s postcombat main on turn 5; `board` for `seat`; `blessing` sets the city's blessing. */
function table({ seat = "user", board = [], blessing = false } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: pid === seat ? board : [], graveyard: [], hand: [], library: [{ ...PLAINS, id: `lib1-${pid}` }, { ...PLAINS, id: `lib2-${pid}` }],
      ...(pid === seat && blessing ? { citysBlessing: true } : {}) };
  }
  return { ...g, turn: 5, phase: "postcombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
/** Create this turn's tokens through the engine's own atoms (the Treasure, a Spike Feeder copy that entered with its counters). */
function withTokensThisTurn(s0, seat = "user") {
  let s = resolveAtom(s0, parseEffectClause("Create a Treasure token.", "Instant").atoms[0], { controller: seat, targets: [] });
  s = resolveAtom(s, { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", withEnterReplacements: true }, { controller: seat, targets: [{ type: "creature", id: "feeder" }] });
  return s;
}
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return s;
}
function toEndStep(s0) {
  let s = s0;
  for (let i = 0; i < 20 && s.step !== "end"; i++) s = runStepActions(advanceStep(s));
  return settle(s);
}
/** The offer `a`, asserted present first — on a board where it is missing the test fails on that assertion, never on a dispatch of nothing. */
const offered = (a, what) => { expect(a, `${what} is not offered`).toBeTruthy(); return a; };
const tokens = (s, seat = "user") => (s.players[seat].battlefield || []).filter((p) => p.card?.token).map((p) => `${p.card.name}${p.counters?.["+1/+1"] ? ` +${p.counters["+1/+1"]}` : ""}`).sort();

describe("the card", () => {
  it("⭐ native: the end-step trigger behind \"if you gained life this turn\", the Cat, then the copy of each token that entered this turn behind the blessing", () => {
    expect(classifyCard(OCELOT)).toBe("native-trigger");
    const d = detectTriggers(OCELOT).find((x) => x.event === "endStep");
    expect({ whose: d.whose, ifClause: d.interveningIf }).toEqual({ whose: "yours", ifClause: "you gained life this turn" });
    expect(parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([
      { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white cat", targetType: null },
      { op: "create-token-copy-each", targetType: null, enteredThisTurn: true, condition: "you have the city's blessing" },
    ]);
  });
  it("control: Second Harvest still copies every token (no entered-this-turn filter)", () => {
    expect(parseEffectClause("For each token you control, create a token that's a copy of that permanent.", "Instant").atoms).toEqual([{ op: "create-token-copy-each", targetType: null }]);
  });
});

describe("the end step", () => {
  const board = () => [on("user", "ocelot", OCELOT), on("user", "feeder", FEEDER, { counters: { "+1/+1": 2 } }), on("user", "food", { name: "Food", type: "Token Artifact — Food", oracle: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", token: true }, { enteredOnTurn: 4 })];
  it("control: no life gained this turn — no Cat (the intervening-if, CR 603.4)", () => {
    const s = toEndStep(table({ board: board() }));
    expect(tokens(s)).toEqual(["Food"]);
  });
  it("⭐ life gained, no blessing: one Cat and no copies", () => {
    const s0 = gainLife(withTokensThisTurn(table({ board: board() })), { playerId: "user", amount: 2 });
    const s = toEndStep(s0);
    expect({ blessing: !!s.players.user.citysBlessing, tokens: tokens(s) }).toEqual({ blessing: false, tokens: ["Cat", "Food", "Spike Feeder +2", "Treasure"] });
  });
  it("⭐ with the blessing: the Cat, then one copy of each token that entered this turn — the Cat, the Treasure and the Spike Feeder copy (entering with its two counters) — and never last turn's Food", () => {
    const s0 = gainLife(withTokensThisTurn(table({ board: board(), blessing: true })), { playerId: "user", amount: 2 });
    const s = toEndStep(s0);
    expect(tokens(s)).toEqual(["Cat", "Cat", "Food", "Spike Feeder +2", "Spike Feeder +2", "Treasure", "Treasure"]);
    const copies = s.players.user.battlefield.filter((p) => p.card?.token && p.enteredOnTurn === s.turn);
    expect(copies.every((p) => !p.tapped)).toBe(true);
  });
  it("⭐ the tenth permanent: nine permanents and no blessing — the Cat is the tenth, the blessing comes before the check, and the Cat is copied", () => {
    const s0 = gainLife(table({ board: [on("user", "ocelot", OCELOT), ...plains(8)] }), { playerId: "user", amount: 1 });
    expect(s0.players.user.battlefield).toHaveLength(9);
    const s = toEndStep(s0);
    expect({ blessing: s.players.user.citysBlessing === true, tokens: tokens(s), permanents: s.players.user.battlefield.length }).toEqual({ blessing: true, tokens: ["Cat", "Cat"], permanents: 11 });
  });
  it("⭐ eight permanents: the Cat is the ninth, no blessing, no copy", () => {
    const s0 = gainLife(table({ board: [on("user", "ocelot", OCELOT), ...plains(7)] }), { playerId: "user", amount: 1 });
    const s = toEndStep(s0);
    expect({ blessing: !!s.players.user.citysBlessing, tokens: tokens(s) }).toEqual({ blessing: false, tokens: ["Cat"] });
  });
  it("⭐ one creation event with every enters trigger: Soul Warden gains 1 for the Cat, then 1 for each creature copy (the Cat's and the Spike Feeder's)", () => {
    const s0 = gainLife(withTokensThisTurn(table({ board: [...board(), on("user", "warden", SOUL_WARDEN)], blessing: true })), { playerId: "user", amount: 2 });
    const before = settle(s0).players.user.life;
    const s = toEndStep(s0);
    expect(s.players.user.life - before).toBe(3);
  });
  it("⭐ Doubling Season: two Cats, then two copies of each of the four tokens that entered this turn (the two Cats, the two Treasures)", () => {
    let s0 = table({ board: [on("user", "ocelot", OCELOT), on("user", "ds", DOUBLING)], blessing: true });
    s0 = resolveAtom(s0, parseEffectClause("Create a Treasure token.", "Instant").atoms[0], { controller: "user", targets: [] }); // two Treasures
    s0 = gainLife(s0, { playerId: "user", amount: 1 });
    const s = toEndStep(s0);
    expect(tokens(s)).toEqual([...Array(6).fill("Cat"), ...Array(6).fill("Treasure")]);
  });
  it("the default AI's seat resolves it the same way (no choice in it)", () => {
    const s0 = gainLife(table({ seat: "ai", board: [on("ai", "ocelot", OCELOT)], blessing: true }), { playerId: "ai", amount: 1 });
    expect(tokens(toEndStep(s0), "ai")).toEqual(["Cat", "Cat"]);
  });
});

describe("found on the way", () => {
  const HARVEST = {"name":"Second Harvest","type":"Instant","mana":"{2}{G}{G}","oracle":"For each token you control, create a token that's a copy of that permanent.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #559
  const ACOLYTE = {"name":"Cathedral Acolyte","type":"Creature — Human Cleric","mana":"{1}{G}","oracle":"Each creature you control with a counter on it has ward {1}. (Whenever it becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\n{T}: Put a +1/+1 counter on target creature that entered this turn.","layout":"normal","cmc":2,"power":"1","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #6496
  it("⭐ Second Harvest's copy of a Spike Feeder token enters with its two counters (CR 707.5) — before, it entered without them and died a 0/0", () => {
    let s = withTokensThisTurn(table({ board: [on("user", "feeder", FEEDER, { counters: { "+1/+1": 2 } })] }));
    s = { ...s, phase: "precombat-main", players: { ...s.players, user: { ...s.players.user, hand: [{ ...HARVEST, id: "h-harvest" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 } } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-harvest");
    const done = settle(dispatchAction(s, offered(cast, "Second Harvest")));
    expect(tokens(done)).toEqual(["Spike Feeder +2", "Spike Feeder +2", "Treasure", "Treasure"]);
  });
  it("⭐ a token created this turn entered this turn: Cathedral Acolyte may put its counter on the Cat made this turn, never on last turn's", () => {
    let s = table({ board: [on("user", "acolyte", ACOLYTE), on("user", "oldcat", { name: "Cat", type: "Token Creature — Cat", oracle: "", power: "1", toughness: "1", colors: ["W"], token: true }, { enteredOnTurn: 4 })] });
    s = resolveAtom(s, parseEffectClause("Create a 1/1 white Cat creature token.", "Instant").atoms[0], { controller: "user", targets: [] });
    const fresh = s.players.user.battlefield.find((p) => p.card.token && p.id !== "oldcat");
    expect(fresh.enteredOnTurn).toBe(s.turn);
    const targets = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "acolyte").flatMap((a) => a.targets.map((t) => t.id));
    expect(targets).toEqual([fresh.id]);
  });
});

describe("the shared copy-each mint (pw25's blind review, F2)", () => {
  const HARVEST = {"name":"Second Harvest","type":"Instant","mana":"{2}{G}{G}","oracle":"For each token you control, create a token that's a copy of that permanent.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #559
  const TRANSRELIQUAT = {"name":"Mizzium Transreliquat","type":"Artifact","mana":"{3}","oracle":"{3}: This artifact becomes a copy of target artifact until end of turn.\n{1}{U}{R}: This artifact becomes a copy of target artifact, except it has this ability.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R","U"]}; // EDHREC #24118
  const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
  const GADWICK = {"name":"Gadwick's First Duel","type":"Enchantment — Saga","mana":"{1}{U}","oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a Cursed Role token attached to up to one target creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature is 1/1.)\nII — Scry 2.\nIII — When you next cast an instant or sorcery spell with mana value 3 or less this turn, copy that spell. You may choose new targets for the copy.","layout":"saga","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Role token","Scry"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #19955
  const EMBERETH = {"name":"Embereth Veteran","type":"Creature — Human Knight","mana":"{R}","oracle":"{1}, Sacrifice this creature: Create a Young Hero Role token attached to another target creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\")","layout":"normal","cmc":1,"power":"2","toughness":"1","loyalty":null,"keywords":["Role token"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #24681
  const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
  const settled = (s0) => { let s = s0; for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets }); return s; };
  const harvest = (s0) => {
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...HARVEST, id: "h-harvest" }], manaPool: { ...s0.players.user.manaPool, G: 4 } } } };
    return settled(dispatchAction(s, offered(legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-harvest"), "Second Harvest")));
  };
  /** A Role sentence cut from the card's own text (never retyped), parsed by the engine and resolved at `hostId` for `controller`. */
  const role = (s, card, controller, hostId) => {
    const clause = card.oracle.split("\n").find((l) => /Role token/.test(l)).replace(/^I — /, "").replace(/^\{1\}, Sacrifice this creature: /, "").split(" (")[0];
    const atom = parseEffectClause(clause, "Sorcery").atoms[0];
    expect(atom?.op, `the engine reads "${clause}"`).toBe("create-named-token");
    return resolveAtom(s, atom, { controller, targets: [{ type: "creature", id: hostId }] });
  };
  it("⭐ a token that became a copy is copied as what it copies (CR 707.2, 707.3): a Mizzium Transreliquat token that became a Sol Ring makes a Sol Ring", () => {
    let s = table({ board: [on("user", "relic", TRANSRELIQUAT), on("user", "ring", SOL_RING)] });
    s = resolveAtom(s, { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature" }, { controller: "user", targets: [{ type: "permanent", id: "relic" }] });
    const tok = s.players.user.battlefield.find((p) => p.card?.token);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, C: 3 } } } };
    const become = offered(legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === tok.id && a.targets?.[0]?.id === "ring" && /until end of turn/.test(a.abilityText || "")), "the token's {3}: becomes a copy of Sol Ring");
    s = settled(dispatchAction(s, become));
    const done = harvest(s);
    const minted = done.players.user.battlefield.filter((p) => p.card?.token && p.id !== tok.id);
    expect(minted.map((p) => p.card.name)).toEqual(["Sol Ring"]);
  });
  it("⭐ an Aura token's copy chooses what it enchants (CR 303.4f): the person's Cursed Role copy goes on the AI's other Bears, which is 1/1; their Young Hero copy, with every creature of theirs already wearing one of their Roles, is not created", () => {
    let s = table({ board: [on("user", "mybears", BEARS)] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [on("ai", "bearsA", BEARS), on("ai", "bearsB", BEARS)] } } };
    s = role(s, GADWICK, "user", "bearsA");
    s = role(s, EMBERETH, "user", "mybears");
    const done = harvest(s);
    const roles = Object.values(done.players).flatMap((p) => p.battlefield).filter((p) => /\bRole\b/.test(String(p.card?.type || "")));
    expect(roles.map((r) => `${r.card.name} on ${r.attachedTo}`).sort()).toEqual(["Cursed on bearsA", "Cursed on bearsB", "Young Hero on mybears"]);
    expect(`${permanentPower(done, "bearsB")}/${permanentToughness(done, "bearsB")}`).toBe("1/1");
    expect(done.log.some((e) => e.kind === "aura-token-not-created" && e.cardName === "Young Hero")).toBe(true);
  });
});
