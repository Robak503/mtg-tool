/**
 * DUELIST'S HERITAGE (EDHREC #1282) — "Whenever one or more creatures attack, you may have target attacking creature gain double
 * strike until end of turn."
 *
 * The batched attack read for ANY player (the bundled ruling: "triggers whenever any player attacks with one or more creatures,
 * not just when you do"): once per attack declaration (CR 508.1, 603.2c — Aurelia's all-players pass with no minimum), never per
 * attacker. The payoff is the causative keyword grant "have target creature gain <keyword> until end of turn" (CR 608.2), its
 * subject "attacking" the combat restriction the satisfier reads (CR 506.3), and "you may" its controller's choice. "You know
 * which players and planeswalkers the creatures are attacking before you choose the target creature" — the target is chosen as
 * the trigger is put on the stack, after the declaration (CR 603.3d).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const HERITAGE = {"name":"Duelist's Heritage","type":"Enchantment","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn."};
const KINSBAILE = {"name":"Kinsbaile Balloonist","type":"Creature — Kithkin Soldier","mana":"{3}{W}","cmc":4,"power":"1","toughness":"1","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever this creature attacks, you may have target creature gain flying until end of turn."};
const LIGHTMINE = {"name":"Lightmine Field","type":"Enchantment","mana":"{2}{W}{W}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Whenever one or more creatures attack, this enchantment deals damage to each of those creatures equal to the number of attacking creatures."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** A pod: the user holds Duelist's Heritage and three Bears; ai1 three Bears. `attacker` declares `ids` at `defender`. */
function attackBy(attacker, ids, defender, { heritageOwner = "user" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], library: [] };
  players.user = { ...players.user, battlefield: [P("ub1", BEARS, "user"), P("ub2", BEARS, "user"), P("ub3", BEARS, "user")] };
  players.ai1 = { ...players.ai1, battlefield: [P("ab1", BEARS, "ai1"), P("ab2", BEARS, "ai1"), P("ab3", BEARS, "ai1")] };
  players[heritageOwner] = { ...players[heritageOwner], battlefield: [...players[heritageOwner].battlefield, P("heritage", HERITAGE, heritageOwner)] };
  const s = { ...s0, players, turn: 4, activePlayer: attacker, priorityHolder: attacker, phase: "combat", step: "declare-attackers", stack: [], pendingTriggers: [],
    combat: { attackers: ids.map((id) => ({ permanentId: id, attackingPlayer: attacker, defender })), blockers: [] } };
  return checkAttackTriggers(s);
}
const heritageTriggers = (s) => (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "heritage");
/** Flush and resolve; the person's "you may" (an optional-effect choice on the user's seat) is answered `yes`. */
const resolve = (s, chooseTargets = chooseTriggerTargets, yes = true) => {
  s = flushTriggers(s, { chooseTargets });
  for (let g = 0; g < 10 && (s.stack.length || s.pendingChoice); g++) {
    s = s.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(s, yes) : resolveTopOfStack(s);
    s = flushTriggers(s, { chooseTargets });
  }
  return s;
};
const doubleStrikers = (s) => ["ub1", "ub2", "ub3", "ab1", "ab2", "ab3"].filter((id) => permanentHasKeyword(s, id, "Double strike"));

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(HERITAGE))).toBe(true);
  });
  it("⭐ the watcher: one attack declaration, any player's", () => {
    const d = detectTriggers(HERITAGE)[0];
    expect(d && { event: d.event, scope: d.scope, optional: d.optional, routes: triggerRoutesNatively(d) }).toEqual({ event: "youAttack", scope: "anyAttack", optional: true, routes: true });
  });
  it("CONTROL — Lightmine Field stays parked (its damage to \"each of those creatures\" is not read)", () => {
    expect(isNativeTier(classifyCard(LIGHTMINE))).toBe(false);
  });
});

describe("the game", () => {
  it("⭐ its controller attacks with three Bears: ONE trigger, and one attacking Bears gains double strike", () => {
    const s = attackBy("user", ["ub1", "ub2", "ub3"], "ai1");
    expect(heritageTriggers(s)).toHaveLength(1);
    expect(doubleStrikers(resolve(s))).toHaveLength(1);
  });
  it("⭐ the ruling — an opponent's attack triggers it too; the target is any attacking creature (here one of theirs, chosen)", () => {
    const s = attackBy("ai1", ["ab1", "ab2"], "user");
    expect(heritageTriggers(s)).toHaveLength(1);
    const pickAb2 = (cands) => cands.find((c) => (c.targets || []).some((t) => t.id === "ab2"));
    expect(doubleStrikers(resolve(s, pickAb2))).toEqual(["ab2"]);
  });
  it("CONTROL — \"you may\": answered no, nothing gains double strike; against an opponent's attack the chooser declines (no attacker of its own)", () => {
    expect({ no: doubleStrikers(resolve(attackBy("user", ["ub1", "ub2"], "ai1"), chooseTriggerTargets, false)),
      theirs: doubleStrikers(resolve(attackBy("ai1", ["ab1", "ab2"], "user"))) }).toEqual({ no: [], theirs: [] });
  });
  it("⭐ an AI seat holding it gives its own attacker double strike", () => {
    expect(doubleStrikers(resolve(attackBy("ai1", ["ab1", "ab2"], "user", { heritageOwner: "ai1" })))).toHaveLength(1);
  });
  it("⭐ the target: only an attacking creature is offered", () => {
    const s = attackBy("user", ["ub1"], "ai1");
    let offered = [];
    resolve(s, (cands) => { offered = cands.flatMap((c) => (c.targets || []).map((t) => t.id)); return cands[0]; });
    expect([...new Set(offered)]).toEqual(["ub1"]);
  });
  it("⭐ twin — Kinsbaile Balloonist's own attack trigger (\"have target creature gain flying\") reads with the same arm", () => {
    expect(isNativeTier(classifyCard(KINSBAILE))).toBe(true);
  });
});
