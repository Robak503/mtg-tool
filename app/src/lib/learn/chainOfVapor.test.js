/**
 * chainOfVapor.test.js — CHAIN OF VAPOR (the play-weighted program, EDHREC #975):
 *
 *   "Return target nonland permanent to its owner's hand. Then that permanent's controller may sacrifice a land of their choice. If the
 *    player does, they may copy this spell and may choose a new target for that copy."
 *
 * One atom (effects/atoms/stack.applyChainBounce): the bounce (the shared zone move — to the OWNER's hand, a token ceases to exist),
 * then the permanent's controller as it left chooses one of their lands or none (the optional-sac pause's chosen form — a person's panel
 * lists the lands; the AI gives up only a land token). A sacrificed land puts one copy of the spell on the stack under that player's
 * control (stack.applyCopySelfSpell, the shared self-copy — CR 707.10), its body this same atom, so the chain continues; the copy's new
 * target is the copy picker's (an enemy-side nonland permanent of the copier's — the house policy for every seat, CR 707.10c), and with
 * no other legal target no copy is made. The default AI holds the spell, as it holds every bounce spell (opponentAI.pickTargetedSpell
 * has no bounce line).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, closeAttackDeclaration, finalizeStackResolution, flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalSacChoice, autoPickOptionalSac, resolveOptionalChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const CHAIN = {"name":"Chain of Vapor","type":"Instant","mana":"{U}","oracle":"Return target nonland permanent to its owner's hand. Then that permanent's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #975
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126

const CALLER = {"name":"Caller of the Pack","type":"Creature — Beast","mana":"{5}{G}{G}","oracle":"Trample\nMyriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token copy that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat.)","layout":"normal","cmc":7,"power":"8","toughness":"6","loyalty":null,"keywords":["Trample","Myriad"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #11567
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `caster`'s precombat main with Chain of Vapor in hand and {U} floating; `user` / `ai` permanents. */
function table({ caster = "user", user = [], ai = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (pid, bf) => ({ ...g.players[pid], battlefield: bf, hand: pid === caster ? [{ ...CHAIN, id: "h-chain" }] : [], graveyard: [], library: [],
    manaPool: pid === caster ? { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) } };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return n.pendingChoice ? n : finalizeStackResolution(n);
}
function chainAt(s, targetId, caster = "user") {
  const a = legalActionsForPlayer(s, caster).find((x) => x.kind === "cast-spell" && x.cardId === "h-chain" && (x.targets || []).some((t) => t.id === targetId));
  expect(a, `no Chain of Vapor at ${targetId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** Settle the pending land choice: `value` a land id or false; then finish the stack. */
const answer = (s, value) => settle(resolveOptionalSacChoice(s, !!value, typeof value === "string" ? value : null));
const ids = (zone) => (zone || []).map((c) => c.id);

describe("the card", () => {
  it("⭐ native: one atom, the bounce with its rider", () => {
    expect({ tier: classifyCard(CHAIN), atoms: parseEffectProgram(CHAIN)?.atoms })
      .toEqual({ tier: "native-spell", atoms: [{ op: "chain-bounce", targetType: "nonlandPermanent", restrictions: [], spellType: "Instant", copyCost: "sacrificeLand" }] });
  });
  it("⛔ a land can't be its target", () => {
    const s = table({ ai: [on("ai", "isl", ISLAND), on("ai", "giant", GIANT)] });
    expect(legalActionsForPlayer(s, "user").filter((x) => x.cardId === "h-chain").flatMap((x) => x.targets.map((t) => t.id))).toEqual(["giant"]);
  });
});

describe("the bounced permanent's controller decides", () => {
  it("⭐ the default AI, whose Hill Giant is returned: asked with its lands listed, it keeps them (a real land is never given up on autopilot) — no copy", () => {
    let s = chainAt(table({ ai: [on("ai", "giant", GIANT), on("ai", "f1", FOREST), on("ai", "f2", FOREST)], user: [on("user", "ustone", STONE)] }), "giant");
    expect({ ask: s.pendingChoice?.kind, who: s.pendingChoice?.controller, lands: (s.pendingChoice?.candidates || []).map((c) => c.id), giant: ids(s.players.ai.hand) })
      .toEqual({ ask: "optional-sac-payment", who: "ai", lands: ["f1", "f2"], giant: ["c-giant"] });
    const pick = autoPickOptionalSac(s, s.pendingChoice);
    s = answer(s, pick);
    expect({ pick, lands: ids(s.players.ai.battlefield), stack: s.stack.length, gy: ids(s.players.user.graveyard) }).toEqual({ pick: false, lands: ["f1", "f2"], stack: 0, gy: ["h-chain"] });
  });
  it("⭐ the person whose Mind Stone the AI's Chain returns: asked with their lands; one sacrificed makes a copy under their control, aimed at an AI permanent — it returns the Hill Giant, and the AI is asked in turn (the person's Sol Ring is its target)", () => {
    let s = chainAt(table({ caster: "ai", user: [on("user", "stone", STONE), on("user", "sol", SOL), on("user", "i1", ISLAND), on("user", "i2", ISLAND)], ai: [on("ai", "giant", GIANT), on("ai", "f1", FOREST)] }), "stone", "ai");
    expect({ who: s.pendingChoice?.controller, lands: (s.pendingChoice?.candidates || []).map((c) => c.id), stone: ids(s.players.user.hand) }).toEqual({ who: "user", lands: ["i1", "i2"], stone: ["c-stone"] });
    s = resolveOptionalSacChoice(s, true, "i2");
    const copy = s.stack.find((o) => o.isCopy);
    expect({ sacrificed: ids(s.players.user.graveyard), copyController: copy?.controller, copyTarget: copy?.targets?.map((t) => t.id) }).toEqual({ sacrificed: ["c-i2"], copyController: "user", copyTarget: ["giant"] });
    s = settle(s); // the original finishes, the copy resolves: the Giant returns; the AI is asked
    expect({ giant: ids(s.players.ai.hand), ask: s.pendingChoice?.controller, chainInGy: ids(s.players.ai.graveyard) }).toEqual({ giant: ["c-giant"], ask: "ai", chainInGy: ["h-chain"] });
    s = answer(s, autoPickOptionalSac(s, s.pendingChoice));
    expect({ stack: s.stack.length, aiLands: ids(s.players.ai.battlefield), userBf: ids(s.players.user.battlefield) }).toEqual({ stack: 0, aiLands: ["f1"], userBf: ["sol", "i1"] });
  });
  it("⭐ the person declines: nothing is sacrificed and nothing is copied", () => {
    let s = chainAt(table({ caster: "ai", user: [on("user", "stone", STONE), on("user", "i1", ISLAND)], ai: [on("ai", "giant", GIANT)] }), "stone", "ai");
    s = answer(s, false);
    expect({ lands: ids(s.players.user.battlefield), stack: s.stack.length, giant: ids(s.players.ai.battlefield) }).toEqual({ lands: ["i1"], stack: 0, giant: ["giant"] });
  });
  it("⭐ the chain continues: the copy's copy — the person bounces their own Mind Stone, sacrifices an Island, the copy returns the AI's Giant", () => {
    let s = chainAt(table({ user: [on("user", "stone", STONE), on("user", "i1", ISLAND)], ai: [on("ai", "giant", GIANT)] }), "stone");
    expect(s.pendingChoice?.controller).toBe("user"); // the caster is that permanent's controller here
    s = answer(s, "i1");
    expect({ stone: ids(s.players.user.hand), giant: ids(s.players.ai.hand), userLands: ids(s.players.user.battlefield) }).toEqual({ stone: ["c-stone"], giant: ["c-giant"], userLands: [] });
  });
  it("⭐ no land: no question, the chain ends", () => {
    const s = chainAt(table({ ai: [on("ai", "giant", GIANT)] }), "giant");
    expect({ ask: s.pendingChoice ?? null, giant: ids(s.players.ai.hand) }).toEqual({ ask: null, giant: ["c-giant"] });
  });
  it("⭐ a token returned ceases to exist (CR 111.7), and its controller is still asked", () => {
    const s = chainAt(table({ ai: [on("ai", "tok", { ...BEARS, token: true }), on("ai", "f1", FOREST)], user: [on("user", "ustone", STONE)] }), "tok");
    expect({ hand: ids(s.players.ai.hand), bf: ids(s.players.ai.battlefield), ask: s.pendingChoice?.controller }).toEqual({ hand: [], bf: ["f1"], ask: "ai" });
  });
  it("⭐ that permanent's CONTROLLER is asked, and the card goes to its OWNER's hand: the AI controls the person's stolen Hill Giant", () => {
    const s = chainAt(table({ ai: [on("ai", "giant", GIANT, { owner: "user" }), on("ai", "f1", FOREST)], user: [on("user", "i1", ISLAND), on("user", "ustone", STONE)] }), "giant");
    expect({ userHand: ids(s.players.user.hand), aiHand: ids(s.players.ai.hand), ask: s.pendingChoice?.controller }).toEqual({ userHand: ["c-giant"], aiHand: [], ask: "ai" });
  });
  it("⛔ no nonland permanent of another player's to aim a copy at: the person isn't asked, and their Island stays", () => {
    const s = chainAt(table({ caster: "ai", user: [on("user", "stone", STONE), on("user", "i1", ISLAND)], ai: [] }), "stone", "ai");
    expect({ ask: s.pendingChoice ?? null, stack: s.stack.length, bf: ids(s.players.user.battlefield), hand: ids(s.players.user.hand) }).toEqual({ ask: null, stack: 0, bf: ["i1"], hand: ["c-stone"] });
  });
  // These tables carry no state.humanSeats, so the user seat plays the house policy — every AI seat's. A seat a person plays chooses the
  // copy's target among every legal one, their own included, and is asked the land question whenever the copy would have one
  // (copyTargetChoice.test.js — the copy-targets fix, CR 707.10c).
  it("⛔ the review's probe (F2) — only the copier's own nonland permanents left: the AI's Chain returns the person's Mind Stone, the person also has Sol Ring and an Island, the AI only an Island — the person isn't asked, and Sol Ring and the Island stay", () => {
    const s = chainAt(table({ caster: "ai", user: [on("user", "stone", STONE), on("user", "sol", SOL), on("user", "i1", ISLAND)], ai: [on("ai", "ai-i", ISLAND)] }), "stone", "ai");
    expect({ ask: s.pendingChoice ?? null, stack: s.stack.length, bf: ids(s.players.user.battlefield), hand: ids(s.players.user.hand) }).toEqual({ ask: null, stack: 0, bf: ["sol", "i1"], hand: ["c-stone"] });
  });
  it("⛔ the same for the default AI: with a land token to give up but only its own nonland permanents left, it isn't asked and keeps the token", () => {
    const s = chainAt(table({ user: [on("user", "i1", ISLAND)], ai: [on("ai", "giant", GIANT), on("ai", "stone2", STONE), on("ai", "ftok", { ...FOREST, token: true })] }), "giant");
    expect({ ask: s.pendingChoice ?? null, bf: ids(s.players.ai.battlefield), hand: ids(s.players.ai.hand) }).toEqual({ ask: null, bf: ["stone2", "ftok"], hand: ["c-giant"] });
  });
  it("⭐ the control: give the person an opponent's Hill Giant to aim at and the same board asks them", () => {
    const s = chainAt(table({ caster: "ai", user: [on("user", "stone", STONE), on("user", "sol", SOL), on("user", "i1", ISLAND)], ai: [on("ai", "ai-i", ISLAND), on("ai", "giant", GIANT)] }), "stone", "ai");
    expect({ ask: s.pendingChoice?.controller, lands: (s.pendingChoice?.candidates || []).map((c) => c.id) }).toEqual({ ask: "user", lands: ["i1"] });
  });
  it("⛔ the target gone before it resolves: the spell does nothing — no question", () => {
    let s = table({ ai: [on("ai", "giant", GIANT), on("ai", "f1", FOREST)] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-chain");
    s = dispatchAction(s, a);
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.filter((p) => p.id !== "giant") } } };
    s = settle(s);
    expect({ ask: s.pendingChoice ?? null, gy: ids(s.players.user.graveyard) }).toEqual({ ask: null, gy: ["h-chain"] });
  });
});

describe("a Chain at a myriad copy (pw22)", () => {
  it("⭐ the person's Caller of the Pack attacks ai1 and its copies attack ai2 and ai3; ai2's Chain returns the copy attacking it — a token, it ceases to exist — and the person is asked (ai1's Hill Giant to aim at); at end of combat the other copy is exiled and nothing else happens", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    let s = { ...g, turn: 5, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players,
        user: { ...g.players.user, battlefield: [on("user", "caller", CALLER, { enteredOnTurn: 1 }), on("user", "f1", FOREST)], hand: [] },
        ai1: { ...g.players.ai1, battlefield: [on("ai1", "giant", GIANT)], hand: [] },
        ai2: { ...g.players.ai2, battlefield: [], hand: [{ ...CHAIN, id: "h-chain" }], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } } } };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "caller" && a.defenderId === "ai1"));
    s = resolveTopOfStack(closeAttackDeclaration(s).state);
    expect(s.pendingChoice?.effectOp, "the myriad trigger did not ask").toBe("myriad");
    s = resolveOptionalChoice(s, true);
    const atAi2 = (s.combat?.attackers || []).find((a) => a.defender === "ai2")?.permanentId;
    expect(!!atAi2 && !!s.players.user.battlefield.find((p) => p.id === atAi2)?.myriadToken).toBe(true);
    s = chainAt({ ...s, priorityHolder: "ai2" }, atAi2, "ai2");
    const everywhere = Object.values(s.players).flatMap((p) => [...p.battlefield.map((x) => x.id), ...p.hand.map((c) => c.id)]);
    expect({ gone: !everywhere.includes(atAi2), attackers: (s.combat?.attackers || []).map((a) => a.defender).sort(), ask: s.pendingChoice?.controller, lands: (s.pendingChoice?.candidates || []).map((c) => c.id) })
      .toEqual({ gone: true, attackers: ["ai1", "ai3"], ask: "user", lands: ["f1"] });
    s = answer(s, false);
    let guard = 0;
    while (s.step !== "end-of-combat" && guard++ < 6) s = nextStep(s);
    while (s.stack.length && guard++ < 20) s = resolveTopOfStack(s);
    expect({ copies: s.players.user.battlefield.filter((p) => p.myriadToken).length, caller: s.players.user.battlefield.some((p) => p.id === "caller"), crash: (s.log || []).some((e) => e.kind === "stack-resolve-error") })
      .toEqual({ copies: 0, caller: true, crash: false });
  });
});

describe("the default AI holding Chain of Vapor", () => {
  it("⛔ it holds it (as it holds every bounce spell — no bounce line in its targeted-spell picker)", () => {
    const s = table({ caster: "ai", user: [on("user", "giant", GIANT)], ai: [on("ai", "f1", FOREST)] });
    expect(legalActionsForPlayer(s, "ai").some((a) => a.cardId === "h-chain")).toBe(true);
    expect(pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.cardId ?? null).not.toBe("h-chain");
  });
});
