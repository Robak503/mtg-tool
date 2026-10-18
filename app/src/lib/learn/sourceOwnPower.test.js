/**
 * sourceOwnPower.test.js — the play-weighted program: a token count that is the trigger's OWN source's power.
 *
 *   Elenda, the Dusk Rose (#1267):  "When Elenda dies, create X 1/1 white Vampire creature tokens with lifelink, where X is Elenda's
 *                                   power."
 *   Threefold Thunderhulk (#1856):  "Whenever this creature enters or attacks, create a number of 1/1 colorless Gnome artifact
 *                                   creature tokens equal to its power."
 *   Elenda's Hierophant (#1857):    "When this creature dies, create X 1/1 white Vampire creature tokens with lifelink, where X is its
 *                                   power."
 *   Nested Shambler (#4135):        "When this creature dies, create X tapped 1/1 green Squirrel creature tokens, where X is this
 *                                   creature's power."
 *
 * On a trigger about the source itself ("When this creature dies / enters / attacks"), "its power" and the source's own name are the
 * source — the count is the sourcePower reader (countForSpec). The source's power is read when the ability resolves (CR 608.2h): on a
 * dies trigger the creature is gone and its last known power is the death look-back (ctx.dyingPower — Elenda's, Nested Shambler's
 * bundled rulings); on an enters or attack trigger it is the live power — and if the source has left while the ability waited, its
 * last known information (CR 608.2h, 113.7a). That last case was missing for every sourcePower count: Krenko, Tin Street Kingpin
 * (native) created no Goblins when Krenko was removed in response, where its bundled ruling says to use the power it last had;
 * Threefold Thunderhulk's ruling says the same. The record now rides the ability (gameState.stampAbilitySourceLki, `power`).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the tier BEFORE this slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkDiesTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, moveCardToZone, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ELENDA = {"name":"Elenda, the Dusk Rose","type":"Legendary Creature — Vampire Knight","mana":"{2}{W}{B}","cmc":4,"power":"1","toughness":"1","keywords":["Lifelink"],"colors":["B","W"],"oracle":"Lifelink\nWhenever another creature dies, put a +1/+1 counter on Elenda.\nWhen Elenda dies, create X 1/1 white Vampire creature tokens with lifelink, where X is Elenda's power."}; // body-only #1267
const HIEROPHANT = {"name":"Elenda's Hierophant","type":"Creature — Vampire Cleric","mana":"{2}{W}","cmc":3,"power":"1","toughness":"1","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever you gain life, put a +1/+1 counter on this creature.\nWhen this creature dies, create X 1/1 white Vampire creature tokens with lifelink, where X is its power."}; // body-only #1857
const THUNDERHULK = {"name":"Threefold Thunderhulk","type":"Artifact Creature — Gnome","mana":"{7}","cmc":7,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with three +1/+1 counters on it.\nWhenever this creature enters or attacks, create a number of 1/1 colorless Gnome artifact creature tokens equal to its power.\n{2}, Sacrifice another artifact: Put a +1/+1 counter on this creature."}; // body-only #1856
const SHAMBLER = {"name":"Nested Shambler","type":"Creature — Zombie","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"When this creature dies, create X tapped 1/1 green Squirrel creature tokens, where X is this creature's power."}; // body-only #4135
const MURDER_INVESTIGATION = {"name":"Murder Investigation","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature you control\nWhen enchanted creature dies, create X 1/1 white Soldier creature tokens, where X is its power."}; // body-only #14238
const KRENKO = {"name":"Krenko, Tin Street Kingpin","type":"Legendary Creature — Goblin","mana":"{2}{R}","cmc":3,"power":"1","toughness":"2","keywords":[],"colors":["R"],"oracle":"Whenever Krenko attacks, put a +1/+1 counter on it, then create a number of 1/1 red Goblin creature tokens equal to Krenko's power."}; // native-trigger #910
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."}; // native-static
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function settle(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 60 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
function kill(s, ids) {
  s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (ids.includes(x.id) ? { ...x, damageMarked: 99 } : x)) }])) };
  const r = destroyLethalCreatures(s);
  return settle(checkDiesTriggers(r.state, r.dead));
}
const tokensOf = (s, subtype, pid = "user") => s.players[pid].battlefield.filter((p) => p.card?.token && new RegExp(`\\b${subtype}\\b`).test(String(p.card?.type || "")));
/** The user attacks the ai with `attackerId`; the attack triggers are put on the stack (not resolved). */
function declareAttack(s, attackerId) {
  s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [] } };
  return flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets });
}

describe("DETECTION — the count is the source's power", () => {
  it("⭐ each self trigger's count reads \"this creature's power\" and routes natively", () => {
    const rows = [ELENDA, HIEROPHANT, THUNDERHULK, SHAMBLER].map((c) => detectTriggers(c)
      .filter((d) => /tokens/.test(String(d.effectClause)))
      .map((d) => ({ card: c.name, event: d.event, readsSource: /this creature's power$/.test(d.effectClause), routes: triggerRoutesNatively(d) })));
    expect(rows).toEqual([
      [{ card: ELENDA.name, event: "dies", readsSource: true, routes: true }],
      [{ card: HIEROPHANT.name, event: "dies", readsSource: true, routes: true }],
      [{ card: THUNDERHULK.name, event: "etb", readsSource: true, routes: true }, { card: THUNDERHULK.name, event: "attacks", readsSource: true, routes: true }],
      [{ card: SHAMBLER.name, event: "dies", readsSource: true, routes: true }],
    ]);
  });

  it("CREED — Murder Investigation's \"its power\" is the ENCHANTED creature's, not the source's: it stays parked", () => {
    expect(isNativeTier(classifyCard(MURDER_INVESTIGATION))).toBe(false);
  });
});

describe("CLASSIFICATION", () => {
  it("⭐ Elenda, the Dusk Rose, Elenda's Hierophant, Threefold Thunderhulk and Nested Shambler classify native", () => {
    for (const c of [ELENDA, HIEROPHANT, THUNDERHULK, SHAMBLER]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("control — Krenko, Tin Street Kingpin stays native", () => {
    expect(classifyCard(KRENKO)).toBe("native-trigger");
  });
});

describe("RUNTIME — a dies trigger reads the power the creature last had", () => {
  it("⭐ Elenda with three +1/+1 counters (a 4/4) dies: four 1/1 Vampires with lifelink (the bundled ruling)", () => {
    const s = kill(table({ user: [P("elenda", ELENDA, "user", { counters: { "+1/+1": 3 } })] }), ["elenda"]);
    const vamps = tokensOf(s, "Vampire");
    expect({ count: vamps.length, lifelink: vamps.every((v) => permanentHasKeyword(s, v.id, "Lifelink")) }).toEqual({ count: 4, lifelink: true });
  });

  it("⭐ Elenda dying under Glorious Anthem counts the anthem (a 2/2 → two Vampires); dying beside another creature it gets no counter", () => {
    const s = kill(table({ user: [P("elenda", ELENDA, "user"), P("anthem", ANTHEM, "user")], ai: [P("bears", BEARS, "ai")] }), ["elenda", "bears"]);
    expect(tokensOf(s, "Vampire").length).toBe(2);
  });

  it("⭐ Elenda's Hierophant with two counters (a 3/3) dies: three Vampires", () => {
    const s = kill(table({ user: [P("hiero", HIEROPHANT, "user", { counters: { "+1/+1": 2 } })] }), ["hiero"]);
    expect(tokensOf(s, "Vampire").length).toBe(3);
  });

  it("⭐ Nested Shambler with two counters dies: three Squirrels, tapped", () => {
    const s = kill(table({ user: [P("shambler", SHAMBLER, "user", { counters: { "+1/+1": 2 } })] }), ["shambler"]);
    const sq = tokensOf(s, "Squirrel");
    expect({ count: sq.length, tapped: sq.every((t) => t.tapped) }).toEqual({ count: 3, tapped: true });
  });
});

describe("RUNTIME — an enters or attack trigger reads the live power, or the last known one if the source has left", () => {
  it("⭐ Threefold Thunderhulk enters with three counters: three Gnome artifact creature tokens", () => {
    const card = { id: "c-hulk", ...THUNDERHULK };
    let { state: s } = enterCardFromZone(table({ hand: [card] }), { playerId: "user", cardId: "c-hulk", fromZone: "hand" });
    s = settle(s);
    const gnomes = tokensOf(s, "Gnome");
    expect({ count: gnomes.length, artifactCreature: gnomes.every((g) => /Artifact Creature/.test(String(g.card.type))) }).toEqual({ count: 3, artifactCreature: true });
  });

  it("⭐ Threefold Thunderhulk (a 4/4) attacks: four Gnomes", () => {
    let s = declareAttack(table({ user: [P("hulk", THUNDERHULK, "user", { counters: { "+1/+1": 4 } })] }), "hulk");
    s = settle(s);
    expect(tokensOf(s, "Gnome").length).toBe(4);
  });

  it("⭐ the ruling: Thunderhulk leaves the battlefield while its attack trigger is on the stack — the Gnomes use its last known power", () => {
    let s = declareAttack(table({ user: [P("hulk", THUNDERHULK, "user", { counters: { "+1/+1": 4 } })] }), "hulk");
    expect(creaturePower(s.players.user.battlefield.find((p) => p.id === "hulk"), s)).toBe(4);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "hulk" });
    s = settle(s);
    expect(tokensOf(s, "Gnome").length).toBe(4);
  });

  it("⭐ the source leaves while its trigger is still WAITING to be put on the stack — the record rides the waiting trigger", () => {
    let s = table({ user: [P("hulk", THUNDERHULK, "user", { counters: { "+1/+1": 4 } })] });
    s = checkAttackTriggers({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "hulk", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect((s.pendingTriggers || []).filter((t) => t.source?.permanentId === "hulk").length).toBe(1);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "hulk" });
    s = settle(s);
    expect(tokensOf(s, "Gnome").length).toBe(4);
  });

  it("⭐ Krenko's ruling: Krenko is removed with its attack trigger on the stack — no counter, one Goblin (its last known power)", () => {
    let s = declareAttack(table({ user: [P("krenko", KRENKO, "user")] }), "krenko");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "krenko" });
    s = settle(s);
    expect(tokensOf(s, "Goblin").length).toBe(1);
  });

  it("control — Krenko on the battlefield: the counter, then two Goblins", () => {
    let s = declareAttack(table({ user: [P("krenko", KRENKO, "user")] }), "krenko");
    s = settle(s);
    expect({ goblins: tokensOf(s, "Goblin").length, counters: s.players.user.battlefield.find((p) => p.id === "krenko").counters?.["+1/+1"] }).toEqual({ goblins: 2, counters: 1 });
  });
});

// ── the flip-diff's other gain: the "tapped" adjective on the X-where token arm (added for Nested Shambler) ──
const WICKERSMITH = {"name":"Wickersmith's Tools","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Whenever one or more -1/-1 counters are put on a creature, put a charge counter on this artifact.\n{T}: Add one mana of any color.\n{5}, {T}, Sacrifice this artifact: Create X tapped 2/2 colorless Scarecrow artifact creature tokens, where X is the number of charge counters on this artifact."}; // body-only #8603

describe("THE OTHER GAIN — Wickersmith's Tools", () => {
  it("⭐ three charge counters, {5}: sacrificed, three tapped 2/2 Scarecrow artifact creature tokens (the counters it last had)", () => {
    let s = table({ user: [P("tools", WICKERSMITH, "user", { counters: { charge: 3 } })] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, C: 5 } } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "tools" && a.abilityIndex === 1);
    expect(act).toBeTruthy();
    s = settle(dispatchAction(s, act));
    const crows = tokensOf(s, "Scarecrow");
    expect({ count: crows.length, tapped: crows.every((t) => t.tapped), artifactCreature: crows.every((t) => /Artifact Creature/.test(String(t.card.type))), tools: s.players.user.battlefield.some((p) => p.id === "tools") })
      .toEqual({ count: 3, tapped: true, artifactCreature: true, tools: false });
  });
});
