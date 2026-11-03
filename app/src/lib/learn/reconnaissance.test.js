/**
 * reconnaissance.test.js — RECONNAISSANCE (the play-weighted program, EDHREC #897):
 *
 *   "{0}: Remove target attacking creature you control from combat and untap it. (If you activate during end of combat, the creature
 *    will untap after it deals combat damage.)"
 *
 * The Gustcloak escape's resolver (atoms/combat.applyUntapRemoveFromCombat — CR 506.4) on a CHOSEN target: an attacking creature its
 * controller controls, re-checked as the ability resolves (CR 608.2b). Removed before damage it deals none and is dealt none by the
 * creature blocking it (CR 510.1c, 510.1d); used once combat damage is dealt, it untaps having dealt it (the reminder's point — offered
 * in the combat damage step, where priority comes after the damage, CR 510.3). The bundled ruling: what triggered on the declaration
 * is not undone. The default AI's one use (opponentAI.pickUntapAfterDamage): its own tapped attackers, once combat damage is dealt.
 * Real activations, stack and combat damage (gameEngine.nextStep). Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RECON = {"name":"Reconnaissance","type":"Enchantment","mana":"{W}","oracle":"{0}: Remove target attacking creature you control from combat and untap it. (If you activate during end of combat, the creature will untap after it deals combat damage.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #897
const ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #9445
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/**
 * `seat` attacks the other player with `attackers` (tapped unless vigilant), blocked as `blocks` ([blockerId, attackerId]), in `step`
 * with `seat`'s priority; Reconnaissance on `seat`'s battlefield.
 */
function combatAt({ seat = "user", step = "declare-blockers", attackers = [], blockers = [], blocks = [], extra = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const atk = attackers.map(([id, card]) => on(seat, id, card, { tapped: !(card.keywords || []).includes("Vigilance") }));
  const players = {
    ...g.players,
    [seat]: { ...g.players[seat], battlefield: [on(seat, "recon", RECON), ...atk, ...extra.filter((p) => p.controller === seat)], hand: [] },
    [opp]: { ...g.players[opp], battlefield: [...blockers.map(([id, card]) => on(opp, id, card)), ...extra.filter((p) => p.controller === opp)], hand: [] },
  };
  const combat = { attackers: attackers.map(([id]) => ({ permanentId: id, attackingPlayer: seat, defender: opp })), blockers: blocks.map(([b, a]) => ({ blockerId: b, blockingPlayer: opp, attackerId: a })), _blockTriggersFired: true };
  return { ...g, turn: 6, phase: "combat", step, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, combat };
}
const reconAt = (s, targetId, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "recon" && (a.targets || []).some((t) => t.id === targetId));
const reconTargets = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "recon").map((a) => a.targets[0].id).sort();
const perm = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id);
function activateAndResolve(s, targetId, seat = "user") {
  const a = reconAt(s, targetId, seat);
  expect(a, `Reconnaissance at ${targetId} is not offered`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}

describe("the card", () => {
  it("⭐ native: the removal and the untap read as one instruction on the chosen attacking creature you control", () => {
    const ab = parseActivatedAbilities(RECON)[0];
    expect({ tier: classifyCard(RECON), modeled: ab.modeled, cost: ab.manaPips, atoms: ab.program.atoms }).toEqual({
      tier: "native-activated", modeled: true, cost: "{0}",
      atoms: [{ op: "untap-remove-from-combat", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "combat", value: "attacking" }] }],
    });
  });
});

describe("a person's use", () => {
  it("⭐ after blocks: the blocked Giant is removed from combat and untapped — the Wurm blocking it deals it nothing, it deals nothing; the unblocked Bears still hit", () => {
    let s = combatAt({ attackers: [["hg", GIANT], ["gb", BEARS]], blockers: [["cw", WURM]], blocks: [["cw", "hg"]] });
    s = activateAndResolve(s, "hg");
    expect({ attacking: s.combat.attackers.map((a) => a.permanentId), tapped: perm(s, "hg").tapped }).toEqual({ attacking: ["gb"], tapped: false });
    s = nextStep(s); // combat damage
    expect({ step: s.step, aiLife: s.players.ai.life, giantDamage: perm(s, "hg")?.damageMarked ?? 0, giantAlive: !!perm(s, "hg"), wurmDamage: perm(s, "cw").damageMarked })
      .toEqual({ step: "combat-damage", aiLife: 38, giantDamage: 0, giantAlive: true, wurmDamage: 0 });
  });
  it("⭐ after combat damage (the combat damage step's priority): the unblocked Giant has dealt its 3 and untaps", () => {
    let s = combatAt({ attackers: [["hg", GIANT]] });
    s = nextStep(s);
    expect({ step: s.step, aiLife: s.players.ai.life, tapped: perm(s, "hg").tapped, holder: s.priorityHolder }).toEqual({ step: "combat-damage", aiLife: 37, tapped: true, holder: "user" });
    s = activateAndResolve(s, "hg");
    expect({ aiLife: s.players.ai.life, tapped: perm(s, "hg").tapped, attacking: s.combat.attackers.length }).toEqual({ aiLife: 37, tapped: false, attacking: 0 });
  });
  it("the targets: your attacking creatures only — not your creature at home, not an opponent's creature", () => {
    const s = combatAt({ attackers: [["hg", GIANT]], blockers: [["cw", WURM]], extra: [on("user", "home", BEARS)] });
    expect(reconTargets(s)).toEqual(["hg"]);
  });
  it("⛔ outside combat there is no attacking creature: nothing is offered in the main phase", () => {
    const s0 = combatAt({ attackers: [] });
    const s = { ...s0, phase: "precombat-main", step: "main", combat: null, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, on("user", "hg", GIANT)] } } };
    expect(reconTargets(s)).toEqual([]);
  });
  it("CR 608.2b: activated twice at the same Giant, the second finds it no longer attacking and does nothing", () => {
    let s = combatAt({ attackers: [["hg", GIANT]] });
    for (let i = 0; i < 2; i++) {
      const a = reconAt(s, "hg");
      expect(a, "Reconnaissance at the Giant is not offered").toBeTruthy();
      s = dispatchAction(s, a);
    }
    expect(s.stack.length).toBe(2);
    s = resolveTopOfStack(s);
    expect(perm(s, "hg").tapped).toBe(false);
    const logLen = s.log.length;
    s = resolveTopOfStack(s);
    expect({ stack: s.stack.length, fizzled: s.log.slice(logLen).some((e) => e.kind === "spell-fizzle") }).toEqual({ stack: 0, fizzled: true });
  });
});

describe("the default AI", () => {
  const aiPick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
  it("⭐ its own combat damage step, damage dealt: the biggest tapped attacker first — the Giant, then the Bears; never the vigilant Angel", () => {
    let s = combatAt({ seat: "ai", step: "declare-blockers", attackers: [["hg", GIANT], ["gb", BEARS], ["sa", ANGEL]] });
    s = nextStep(s);
    expect({ step: s.step, userLife: s.players.user.life }).toEqual({ step: "combat-damage", userLife: 31 });
    const first = aiPick(s);
    expect({ kind: first?.kind, perm: first?.permanentId, target: first?.targets?.[0]?.id }).toEqual({ kind: "activate-ability", perm: "recon", target: "hg" });
    s = resolveTopOfStack(dispatchAction(s, first));
    const second = aiPick(s);
    expect(second?.targets?.[0]?.id).toBe("gb");
    s = resolveTopOfStack(dispatchAction(s, second));
    expect({ third: aiPick(s)?.kind, giant: perm(s, "hg").tapped, bears: perm(s, "gb").tapped, angel: perm(s, "sa").tapped, userLife: s.players.user.life })
      .toEqual({ third: "pass-priority", giant: false, bears: false, angel: false, userLife: 31 });
  });
  it("⛔ before damage it holds: the declare blockers step, its Giant blocked by the Wurm", () => {
    const s = combatAt({ seat: "ai", attackers: [["hg", GIANT]], blockers: [["cw", WURM]], blocks: [["cw", "hg"]] });
    expect(reconTargets(s, "ai")).toEqual(["hg"]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });
  it("⛔ the policy seam: `ability: \"v1\"` holds after damage too", () => {
    const s = nextStep(combatAt({ seat: "ai", attackers: [["hg", GIANT]] }));
    expect(pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { policy: { ability: "v1" } })?.kind).toBe("pass-priority");
  });
});
