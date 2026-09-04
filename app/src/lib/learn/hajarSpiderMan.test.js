/**
 * hajarSpiderMan.test.js — SHELF-85 runbook Phase 2 · H10 + H7 (2026-09-04): Hajar, Loyal Bodyguard and Spider-Man,
 * Miles Morales (Shalai and Hallar).
 *
 * Hajar: "Sacrifice Hajar: Legendary creatures you control get +1/+0 and gain indestructible until end of turn." — the
 * team pump with a LEGENDARY-ONLY supertype gate (`legendaryOnly` on the youControl pump, honoured by
 * controllerCreatureTargets), and the splitter's team-pump keep-whole admitting the "legendary" prefix so the
 * "get … and gain …" sentence stays one clause. A non-legendary creature of yours is NOT pumped (pinned).
 *
 * Spider-Man: "Whenever Spider-Man enters or attacks, put a +1/+1 counter on each other creature you control. Those
 * creatures gain trample until end of turn." — the "those creatures" referent over an "each OTHER creature" spray. The
 * mass-antecedent gate admitted only the UNFILTERED spray; the other-set is a fourth antecedent kind whose rewritten
 * group grant carries `excludeSource`, and applyGrantKeywordsGroup drops the source. Spider-Man itself neither grows
 * nor receives the grant (pinned by the effect's fixed permanent set — its printed trample would mask a keyword read).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkEnterTriggers, checkAttackTriggers } from "./triggers.js";
import { parseEffectProgram } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HAJAR = { id: "c-hajar", name: "Hajar, Loyal Bodyguard", type: "Legendary Creature — Human Soldier", mana: "{R}{G}", keywords: [], power: 2, toughness: 2,
  oracle: "Sacrifice Hajar: Legendary creatures you control get +1/+0 and gain indestructible until end of turn." };
const SPIDER = { id: "c-spider", name: "Spider-Man, Miles Morales", type: "Legendary Creature — Spider Human Hero", mana: "{4}{G}{G}", keywords: ["Vigilance", "Trample"], power: 4, toughness: 4,
  oracle: "Vigilance, trample (Attacking doesn't cause this creature to tap. He can deal excess combat damage to the player he's attacking.)\nWhenever Spider-Man enters or attacks, put a +1/+1 counter on each other creature you control. Those creatures gain trample until end of turn." };
const LEG_BEAR = { id: "c-legbear", name: "Legend Bear", type: "Legendary Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const PLAIN_BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const forestCard = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" });

const base = () => {
  let s = createGameState({ userDeck: [forestCard("f1"), forestCard("f2")], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const settle = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };
const withPerms = (s, perms) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...perms] } } });
const enter = (s, perm) => settle(flushTriggers(checkEnterTriggers(withPerms(s, [perm]), perm)));
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
const onField = (s, id) => s.players.user.battlefield.some((p) => p.id === id);
const trampleGrantsTo = (s, id) => (s.continuousEffects || []).filter((e) => e.op?.layerOp === "addKeyword" && e.op?.keyword === "Trample" && (e.affects?.permanentIds || []).includes(id)).length;

describe("classifier + parser — Hajar and Spider-Man", () => {
  it("both cards classify native; the legendary team pump and the other-set referent parse to the intended atoms", () => {
    expect(classifyCard({ name: HAJAR.name, type: HAJAR.type, oracle: HAJAR.oracle, mana: HAJAR.mana, keywords: [] })).toBe("native-activated");
    expect(classifyCard({ name: SPIDER.name, type: SPIDER.type, oracle: SPIDER.oracle, mana: SPIDER.mana, keywords: SPIDER.keywords })).toBe("native-trigger");
    const h = parseEffectProgram({ type: "Instant", oracle: "Legendary creatures you control get +1/+0 and gain indestructible until end of turn.", mana: "{G}", name: "Probe" });
    expect(h.confidence).toBe("high");
    expect(h.atoms).toEqual([{ op: "pump", scope: "youControl", legendaryOnly: true, ptDelta: { p: 1, t: 0 }, grantKeywords: ["indestructible"] }]);
    const sm = detectTriggers(SPIDER);
    expect(sm.length).toBeGreaterThan(0);
    const prog = parseEffectProgram({ type: "Instant", oracle: "Put a +1/+1 counter on each other creature you control. Those creatures gain trample until end of turn.", mana: "{G}", name: "Probe" });
    expect(prog.confidence).toBe("high");
    expect(prog.atoms).toEqual([
      { op: "add-counter", counterType: "+1/+1", amount: 1, scope: "youControl", excludeSource: true },
      { op: "grant-keywords-group", scope: "creaturesYouControl", excludeSource: true, grantKeywords: ["Trample"] },
    ]);
  });

  it("CREED: a FILTERED other-spray does not parse today, so nothing with an extra key can reach the other-set gate (FN-safe)", () => {
    // The gate's key check (`k === "excludeSource" || UNFILTERED…`) has no filtered carrier in the current parser: these
    // forms are UNPARSED, not bound. When a filtered other-spray arm lands, this pin fails and the gate must be re-proven.
    for (const spray of ["Put a +1/+1 counter on each other Goblin you control.", "Put a +1/+1 counter on each other green creature you control.", "Put a +1/+1 counter on each other creature you control with flying."]) {
      expect(parseEffectProgram({ type: "Instant", oracle: spray, mana: "{G}", name: "Probe" }).confidence).toBe("low");
      const prog = parseEffectProgram({ type: "Instant", oracle: spray + " Those creatures gain trample until end of turn.", mana: "{G}", name: "Probe" });
      expect(prog.confidence).not.toBe("high");
    }
  });
});

describe("runtime — Hajar", () => {
  it("sacrificing Hajar pumps and shields ONLY the legendary creatures; a plain bear is untouched; Hajar is gone", () => {
    let s = withPerms(base(), [createPermanent({ id: "H", card: HAJAR, controller: "user" }), createPermanent({ id: "LB", card: LEG_BEAR, controller: "user" }), createPermanent({ id: "PB", card: PLAIN_BEAR, controller: "user" })]);
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "H");
    expect(act).toBeTruthy();
    expect(act.sacSelf).toBe(true);
    s = settle(dispatchAction(s, act));
    expect(onField(s, "H")).toBe(false);
    expect(permanentPower(s, "LB")).toBe(3);
    expect(permanentHasKeyword(s, "LB", "indestructible")).toBe(true);
    expect(permanentPower(s, "PB")).toBe(2);
    expect(permanentHasKeyword(s, "PB", "indestructible")).toBe(false);
  });
});

describe("runtime — Spider-Man", () => {
  it("entering: each OTHER creature gets a counter and the trample grant; Spider-Man gets neither", () => {
    let s = withPerms(base(), [createPermanent({ id: "LB", card: LEG_BEAR, controller: "user" }), createPermanent({ id: "PB", card: PLAIN_BEAR, controller: "user" })]);
    s = enter(s, createPermanent({ id: "SM", card: SPIDER, controller: "user" }));
    expect(counters(s, "LB")).toBe(1);
    expect(counters(s, "PB")).toBe(1);
    expect(counters(s, "SM")).toBe(0);
    expect(permanentHasKeyword(s, "PB", "trample")).toBe(true);
    expect(trampleGrantsTo(s, "PB")).toBe(1);
    expect(trampleGrantsTo(s, "SM")).toBe(0);
  });

  it("attacking fires the same effect; alone on the battlefield it does nothing and grants nothing", () => {
    let s = withPerms(base(), [createPermanent({ id: "SM", card: SPIDER, controller: "user" }), createPermanent({ id: "PB", card: PLAIN_BEAR, controller: "user" })]);
    s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "SM", target: "ai" }] } };
    s = settle(flushTriggers(checkAttackTriggers(s)));
    expect(counters(s, "PB")).toBe(1);
    expect(counters(s, "SM")).toBe(0);
    expect(trampleGrantsTo(s, "PB")).toBe(1);
    let alone = withPerms(base(), [createPermanent({ id: "SM", card: SPIDER, controller: "user" })]);
    alone = { ...alone, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "SM", target: "ai" }] } };
    alone = settle(flushTriggers(checkAttackTriggers(alone)));
    expect(counters(alone, "SM")).toBe(0);
    expect((alone.continuousEffects || []).filter((e) => e.op?.keyword === "Trample").length).toBe(0);
  });
});
