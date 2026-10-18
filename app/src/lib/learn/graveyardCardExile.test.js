/**
 * graveyardCardExile.test.js — the play-weighted program: "exile target card from a graveyard" as a mandatory trigger, and the
 * exiled card's type deciding a payoff.
 *
 *   Soul-Guide Lantern (#1356): "When this artifact enters, exile target card from a graveyard. / {T}, Sacrifice this artifact:
 *                               Exile each opponent's graveyard. / {1}, {T}, Sacrifice this artifact: Draw a card."
 *   Scavenging Ooze (#1607):    "{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this
 *                               creature and you gain 1 life."
 *   Twins: Stonecloaker, Offalsnout, Ashnod's Harvester (the mandatory trigger); Diregraf Scavenger, Raven Eagle ("If a creature
 *   card was / is exiled this way, …" after "exile up to one target card from a graveyard").
 *
 * (1) THE MANDATORY TRIGGER. Its target intent was "ambiguous" — "it could be forced onto its own side", so the trigger was parked.
 * Since the forced-target pick (2026-10-16, CR 603.3d) that IS the rule: a mandatory triggered ability takes a legal target if
 * there is one. The intent is now "enemy" — an opponent's graveyard card when there is one — and with only the controller's own
 * graveyard stocked the forced pick takes the least valuable of them (mana value); with every graveyard empty the ability is
 * removed from the stack (CR 603.3d).
 * (2) THE PAYOFF GATE. "If it was a <type> card, <payoff>" / "If a <type> card is (was) exiled this way, <payoff>" — the payoff
 * atoms carry `ifExiledCardType` and run only when the graveyard exile just before them exiled a card of that type (read off the
 * card in exile — a double-faced card there has its front face's characteristics, CR 712.8a; "permanent card" is CR 110.4a). A
 * target gone at resolution: the whole ability doesn't resolve (CR 608.2b — Scavenging Ooze's bundled ruling); "up to one" with no
 * target chosen exiles nothing, so the payoff doesn't happen.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the tier BEFORE this slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkDiesTriggers, checkAttackTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone, destroyLethalCreatures, tapPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const LANTERN = {"name":"Soul-Guide Lantern","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"When this artifact enters, exile target card from a graveyard.\n{T}, Sacrifice this artifact: Exile each opponent's graveyard.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // body-only #1356
const OOZE = {"name":"Scavenging Ooze","type":"Creature — Ooze","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life."}; // body-only #1607
const STONECLOAKER = {"name":"Stonecloaker","type":"Creature — Gargoyle","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Flying","Flash"],"colors":["W"],"oracle":"Flash\nFlying\nWhen this creature enters, return a creature you control to its owner's hand.\nWhen this creature enters, exile target card from a graveyard."}; // body-only #13541
const OFFALSNOUT = {"name":"Offalsnout","type":"Creature — Elemental","mana":"{2}{B}","cmc":3,"power":"2","toughness":"2","keywords":["Evoke","Flash"],"colors":["B"],"oracle":"Flash\nWhen this creature leaves the battlefield, exile target card from a graveyard.\nEvoke {B} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)"}; // body-only #20440
const HARVESTER = {"name":"Ashnod's Harvester","type":"Artifact Creature — Construct","mana":"{2}","cmc":2,"power":"3","toughness":"1","keywords":["Unearth"],"colors":[],"oracle":"Whenever this creature attacks, exile target card from a graveyard.\nUnearth {1}{B} ({1}{B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)"}; // body-only #20894
const DIREGRAF = {"name":"Diregraf Scavenger","type":"Creature — Zombie Bear","mana":"{3}{B}","cmc":4,"power":"2","toughness":"3","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhen this creature enters, exile up to one target card from a graveyard. If a creature card was exiled this way, each opponent loses 2 life and you gain 2 life."}; // body-only #19874
const RAVEN_EAGLE = {"name":"Raven Eagle","type":"Creature — Bird Assassin","mana":"{2}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nWhenever this creature enters or attacks, exile up to one target card from a graveyard. If a creature card is exiled this way, create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhenever you draw your second card each turn, each opponent loses 1 life and you gain 1 life."}; // body-only #10353
const ENFORCER = {"name":"General's Enforcer","type":"Creature — Human Soldier","mana":"{W}{B}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["B","W"],"oracle":"Legendary Humans you control have indestructible.\n{2}{W}{B}: Exile target card from a graveyard. If it was a creature card, create a 1/1 white Human Soldier creature token."}; // body-only #3439
const LION_SASH = {"name":"Lion Sash","type":"Artifact Creature — Equipment Cat","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Reconfigure"],"colors":["W"],"oracle":"{W}: Exile target card from a graveyard. If it was a permanent card, put a +1/+1 counter on this permanent.\nEquipped creature gets +1/+1 for each +1/+1 counter on this Equipment.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)"}; // body-only #1787
const WRETCH = {"name":"Withered Wretch","type":"Creature — Zombie Cleric","mana":"{B}{B}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"{1}: Exile target card from a graveyard."}; // native-activated #9862
const gyBear = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", oracle: "" });
const gyBolt = (id) => ({ id, name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, oracle: "Lightning Bolt deals 3 damage to any target." });
const gyIsland = (id) => ({ id, name: "Island", type: "Basic Land — Island", cmc: 0, oracle: "({T}: Add {U}.)" });

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function table({ user = {}, ai = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], exile: [], life: 20 };
  players.user = { ...players.user, ...user, manaPool: { ...s0.players.user.manaPool, ...(user.manaPool || {}) } };
  players.ai = { ...players.ai, ...ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function settle(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 40 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** `card` enters the battlefield under the user's control from its hand; its enters triggers settle. */
function enters(card, board) {
  const c = { id: "c-enter", ...card };
  const s0 = table({ ...board, user: { ...(board.user || {}), hand: [c] } });
  return settle(enterCardFromZone(s0, { playerId: "user", cardId: "c-enter", fromZone: "hand" }).state);
}
const names = (cards) => (cards || []).map((c) => c.name);
/** The Ooze's activation aimed at `cardId`, asserted offered. */
function oozeOffer(s, cardId) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "ooze" && (x.targets || []).some((t) => t.id === cardId));
  expect(a).toBeTruthy();
  return a;
}

describe("THE MANDATORY TRIGGER — intent and routing", () => {
  it("⭐ \"exile target card from a graveyard\" aims at an opponent's card (enemy); the up-to-one form is unchanged", () => {
    expect({
      mandatory: atomTargetIntent(parseEffectClause("exile target card from a graveyard").atoms[0]),
      upToOne: atomTargetIntent(parseEffectClause("exile up to one target card from a graveyard").atoms[0]),
    }).toEqual({ mandatory: "enemy", upToOne: "enemy" });
  });

  it("⭐ Soul-Guide Lantern's enters trigger routes natively", () => {
    const d = detectTriggers(LANTERN).find((x) => x.event === "etb");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
});

describe("THE PAYOFF GATE — the parse", () => {
  it("⭐ the exile and its payoff read as one program: the payoff atoms carry the exiled card's type", () => {
    const p = parseEffectClause("Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life.", "Instant", { sourceScoped: true });
    expect({ conf: programConfidence(p), atoms: p.atoms }).toEqual({ conf: "high", atoms: [
      { op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" },
      { op: "add-counter", counterType: "+1/+1", amount: 1, target: "self", ifExiledCardType: "creature" },
      { op: "gain-life", amount: 1, targetType: null, ifExiledCardType: "creature" },
    ] });
  });

  it("⭐ \"If a creature card was exiled this way\" after the up-to-one form reads the same way", () => {
    const p = parseEffectClause("exile up to one target card from a graveyard. If a creature card was exiled this way, each opponent loses 2 life and you gain 2 life", "Instant", { sourceScoped: true });
    expect({ conf: programConfidence(p), gated: p.atoms.slice(1).map((a) => a.ifExiledCardType) }).toEqual({ conf: "high", gated: ["creature", "creature"] });
  });

  it("CREED — an optional exile (\"you may exile …\") followed by the gate stays unread", () => {
    const p = parseEffectClause("you may exile target card from a graveyard. If a creature card is exiled this way, you gain 2 life", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("low");
  });
});

describe("CLASSIFICATION", () => {
  it("⭐ Soul-Guide Lantern, Scavenging Ooze, Stonecloaker, Offalsnout, Ashnod's Harvester, Diregraf Scavenger and Raven Eagle classify native", () => {
    for (const c of [LANTERN, OOZE, STONECLOAKER, OFFALSNOUT, HARVESTER, DIREGRAF, RAVEN_EAGLE]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — General's Enforcer (its static) and Lion Sash (its Equipment lines) stay parked; Withered Wretch stays native", () => {
    expect({ enforcer: isNativeTier(classifyCard(ENFORCER)), sash: isNativeTier(classifyCard(LION_SASH)), wretch: classifyCard(WRETCH) })
      .toEqual({ enforcer: false, sash: false, wretch: "native-activated" });
  });
});

describe("RUNTIME — Soul-Guide Lantern", () => {
  it("⭐ with a card in each graveyard, the opponent's is exiled and yours stays", () => {
    const s = enters(LANTERN, { user: { graveyard: [gyIsland("u-isl")] }, ai: { graveyard: [gyBear("a-bear")] } });
    expect({ aiExile: names(s.players.ai.exile), aiGy: names(s.players.ai.graveyard), userGy: names(s.players.user.graveyard) })
      .toEqual({ aiExile: ["Grizzly Bears"], aiGy: [], userGy: ["Island"] });
  });

  it("⭐ CR 603.3d: only your own graveyard is stocked — the mandatory trigger takes your least valuable card (the Island)", () => {
    const s = enters(LANTERN, { user: { graveyard: [gyBear("u-bear"), gyIsland("u-isl")] } });
    expect({ userExile: names(s.players.user.exile), userGy: names(s.players.user.graveyard), forced: (s.log || []).some((e) => e.kind === "trigger-target-forced") })
      .toEqual({ userExile: ["Island"], userGy: ["Grizzly Bears"], forced: true });
  });

  it("control — every graveyard empty: the trigger has no target and does nothing", () => {
    const s = enters(LANTERN, {});
    expect({ stack: s.stack.length, exiled: names(s.players.user.exile).length + names(s.players.ai.exile).length, lantern: s.players.user.battlefield.length }).toEqual({ stack: 0, exiled: 0, lantern: 1 });
  });
});

describe("RUNTIME — Scavenging Ooze", () => {
  const ooze = (graveyard) => table({ user: { battlefield: [P("ooze", OOZE, "user")], manaPool: { G: 2 } }, ai: { graveyard } });
  const oozeOf = (s) => s.players.user.battlefield.find((p) => p.id === "ooze");

  it("⭐ a creature card: exiled, a +1/+1 counter on the Ooze, and 1 life", () => {
    let s = ooze([gyBear("a-bear"), gyBolt("a-bolt")]);
    s = resolveTopOfStack(dispatchAction(s, oozeOffer(s, "a-bear")));
    expect({ aiExile: names(s.players.ai.exile), counters: oozeOf(s).counters?.["+1/+1"] ?? 0, life: s.players.user.life }).toEqual({ aiExile: ["Grizzly Bears"], counters: 1, life: 21 });
  });

  it("⭐ a noncreature card: exiled, and nothing else", () => {
    let s = ooze([gyBear("a-bear"), gyBolt("a-bolt")]);
    s = resolveTopOfStack(dispatchAction(s, oozeOffer(s, "a-bolt")));
    expect({ aiExile: names(s.players.ai.exile), counters: oozeOf(s).counters?.["+1/+1"] ?? 0, life: s.players.user.life }).toEqual({ aiExile: ["Lightning Bolt"], counters: 0, life: 20 });
  });

  it("⭐ the ruling: the target left the graveyard before resolution — no counter, no life", () => {
    let s = ooze([gyBear("a-bear")]);
    s = dispatchAction(s, oozeOffer(s, "a-bear"));
    s = moveCardToZone(s, { playerId: "ai", fromZone: "graveyard", toZone: "exile", cardId: "a-bear" });
    s = resolveTopOfStack(s);
    expect({ counters: oozeOf(s).counters?.["+1/+1"] ?? 0, life: s.players.user.life }).toEqual({ counters: 0, life: 20 });
  });

  it("⭐ the ruling: two activations aimed at the same creature card — only the first does anything", () => {
    let s = ooze([gyBear("a-bear")]);
    s = dispatchAction(s, oozeOffer(s, "a-bear"));
    s = dispatchAction(s, oozeOffer(s, "a-bear"));
    s = resolveTopOfStack(resolveTopOfStack(s));
    expect({ counters: oozeOf(s).counters?.["+1/+1"] ?? 0, life: s.players.user.life }).toEqual({ counters: 1, life: 21 });
  });
});

describe("RUNTIME — the twins", () => {
  it("⭐ Diregraf Scavenger: an opponent's creature card exiled — each opponent loses 2, you gain 2; a land exiled — nothing more", () => {
    const creature = enters(DIREGRAF, { ai: { graveyard: [gyBear("a-bear")] } });
    const land = enters(DIREGRAF, { ai: { graveyard: [gyIsland("a-isl")] } });
    expect({
      creature: { aiExile: names(creature.players.ai.exile), ai: creature.players.ai.life, user: creature.players.user.life },
      land: { aiExile: names(land.players.ai.exile), ai: land.players.ai.life, user: land.players.user.life },
    }).toEqual({ creature: { aiExile: ["Grizzly Bears"], ai: 18, user: 22 }, land: { aiExile: ["Island"], ai: 20, user: 20 } });
  });

  it("⭐ Stonecloaker: both enters triggers — it returns itself (no other creature) and exiles the opponent's card", () => {
    const s = enters(STONECLOAKER, { ai: { graveyard: [gyBear("a-bear")] } });
    expect({ aiExile: names(s.players.ai.exile), inHand: names(s.players.user.hand) }).toEqual({ aiExile: ["Grizzly Bears"], inHand: ["Stonecloaker"] });
  });
});

// ── the flip-diff's other gains, each path run ──
const SCRAPGORGER = {"name":"Armored Scrapgorger","type":"Creature — Phyrexian Beast","mana":"{1}{G}","cmc":2,"power":"0","toughness":"3","keywords":[],"colors":["G"],"oracle":"This creature gets +3/+0 as long as it has three or more oil counters on it.\n{T}: Add one mana of any color.\nWhenever this creature becomes tapped, exile target card from a graveyard and put an oil counter on this creature."}; // body-only #4651
const SOJOURNERS = {"name":"Grixis Sojourners","type":"Creature — Zombie Ogre","mana":"{1}{U}{B}{R}","cmc":4,"power":"4","toughness":"3","keywords":["Cycling"],"colors":["B","R","U"],"oracle":"When you cycle this card and when this creature dies, you may exile target card from a graveyard.\nCycling {2}{B} ({2}{B}, Discard this card: Draw a card.)"}; // body-only #30488
const IGNIS = {"name":"Ignis Scientia","type":"Legendary Creature — Human Advisor","mana":"{1}{G}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Food"],"colors":["G","U"],"oracle":"When Ignis Scientia enters, look at the top six cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order.\nI've Come Up with a New Recipe! — {1}{G}{U}, {T}: Exile target card from a graveyard. If a creature card was exiled this way, create a Food token."}; // body-only #10585

function killAll(s, ids) {
  s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (ids.includes(x.id) ? { ...x, damageMarked: 99 } : x)) }])) };
  const r = destroyLethalCreatures(s);
  s = flushTriggers(checkDiesTriggers(r.state, r.dead), { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 40 && ((s.stack || []).length || s.pendingChoice); g++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (s.pendingChoice) break;
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  return s;
}

describe("THE OTHER GAINS — each path run", () => {
  it("⭐ Armored Scrapgorger becomes tapped: the opponent's card is exiled and it gets an oil counter", () => {
    let s = table({ user: { battlefield: [P("scrap", SCRAPGORGER, "user")] }, ai: { graveyard: [gyBear("a-bear")] } });
    s = settle(tapPermanent(s, "scrap"));
    expect({ aiExile: names(s.players.ai.exile), oil: s.players.user.battlefield.find((p) => p.id === "scrap").counters?.oil ?? 0 }).toEqual({ aiExile: ["Grizzly Bears"], oil: 1 });
  });

  it("⭐ Grixis Sojourners dies: you may exile a card — the opponent's is exiled", () => {
    const s = killAll(table({ user: { battlefield: [P("soj", SOJOURNERS, "user")] }, ai: { graveyard: [gyBear("a-bear")] } }), ["soj"]);
    expect(names(s.players.ai.exile)).toEqual(["Grizzly Bears"]);
  });

  it("⭐ Offalsnout leaves the battlefield: the opponent's card is exiled", () => {
    const s = killAll(table({ user: { battlefield: [P("offal", OFFALSNOUT, "user")] }, ai: { graveyard: [gyBear("a-bear")] } }), ["offal"]);
    expect(names(s.players.ai.exile)).toEqual(["Grizzly Bears"]);
  });

  it("⭐ Ashnod's Harvester attacks: the opponent's card is exiled", () => {
    let s = table({ user: { battlefield: [P("harv", HARVESTER, "user")] }, ai: { graveyard: [gyBear("a-bear")] } });
    s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "harv", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    s = settle(checkAttackTriggers(s));
    expect(names(s.players.ai.exile)).toEqual(["Grizzly Bears"]);
  });

  it("⭐ Raven Eagle enters: a creature card exiled — a Clue", () => {
    const s = enters(RAVEN_EAGLE, { ai: { graveyard: [gyBear("a-bear")] } });
    expect({ aiExile: names(s.players.ai.exile), clues: s.players.user.battlefield.filter((p) => /\bClue\b/.test(String(p.card?.type || ""))).length }).toEqual({ aiExile: ["Grizzly Bears"], clues: 1 });
  });

  it("⭐ Ignis Scientia's activation: a creature card exiled — a Food; a land — nothing more", () => {
    const run = (target) => {
      let s = table({ user: { battlefield: [P("ignis", IGNIS, "user")], manaPool: { G: 1, U: 1, C: 1 } }, ai: { graveyard: [gyBear("a-bear"), gyIsland("a-isl")] } });
      const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "ignis" && (x.targets || []).some((t) => t.id === target));
      expect(a).toBeTruthy();
      s = resolveTopOfStack(dispatchAction(s, a));
      return s.players.user.battlefield.filter((p) => /\bFood\b/.test(String(p.card?.type || ""))).length;
    };
    expect({ creature: run("a-bear"), land: run("a-isl") }).toEqual({ creature: 1, land: 0 });
  });
});
