/**
 * SCRAP TRAWLER (EDHREC #870) — "Whenever this creature dies or another artifact you control is put into a graveyard from the
 * battlefield, return to your hand target artifact card in your graveyard with lesser mana value."
 *
 * Two triggers over two disjoint subjects (the disjunction split): its own death (dies/self) and another artifact you control going
 * to a graveyard from the battlefield (artifactYouControlPiG, "another" — never its own trip). The target is an artifact card in
 * your graveyard with mana value strictly below the triggering artifact's as it last existed. Its rulings: "Use the artifact's mana
 * value as it last existed on the battlefield to determine what may be returned." / "If an artifact is a copy of another artifact
 * with greater mana value, such as Sculpting Steel copying an artifact with mana value 4, Scrap Trawler's ability can target that
 * artifact card …" / "While on the battlefield or in a graveyard, {X} in an object's mana cost is 0." / "If Scrap Trawler and another
 * artifact you control are put into a graveyard at the same time, Scrap Trawler's ability triggers for each of them."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, moveCardToZone } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

const TRAWLER = {"name":"Scrap Trawler","type":"Artifact Creature — Construct","mana":"{3}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"oracle":"Whenever this creature dies or another artifact you control is put into a graveyard from the battlefield, return to your hand target artifact card in your graveyard with lesser mana value."};
const RETRIEVER = {"name":"Myr Retriever","type":"Artifact Creature — Myr","mana":"{2}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":"When this creature dies, return another target artifact card from your graveyard to your hand."};
const TRANSRELIQUAT = {"name":"Mizzium Transreliquat","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{3}: This artifact becomes a copy of target artifact until end of turn.\n{1}{U}{R}: This artifact becomes a copy of target artifact, except it has this ability."};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const COAT = {"name":"Coat of Arms","type":"Artifact","mana":"{5}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it. (For example, if two Goblin Warriors and a Goblin Shaman are on the battlefield, each gets +2/+2.)"};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this token: Add one mana of any color.","token":true};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
/** Scrap Trawler and `user` permanents for the user; the graveyard holds Ornithopter (0), Sol Ring (1), Mind Stone (2), Coat of Arms (5), Lightning Bolt (1). */
function table({ user = [], ai = [], graveyard = null, humans = null, pool = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const gy = graveyard ?? [{ ...ORNITHOPTER, id: "g0" }, { ...SOL_RING, id: "g1" }, { ...MIND_STONE, id: "g2" }, { ...COAT, id: "g5" }, { ...BOLT, id: "gb" }];
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [P("trawler", TRAWLER), ...user], graveyard: gy, hand: [], ...(pool ? { manaPool: pool } : {}), library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...g.players.ai, battlefield: ai, graveyard: [{ ...SOL_RING, id: "ai-ring" }], hand: [], library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const trawlerOnStack = (s) => (s.stack || []).filter((o) => o.source?.name === "Scrap Trawler");
/** The legal targets each Scrap Trawler trigger on the stack was offered (the automatic chooser's pool is the enumeration). */
function destroyAndFlush(s, ids) {
  return flushTriggers(applyDestroyEffect(s, { controller: "ai", targets: ids.map((id) => ({ type: "permanent", id })) }));
}
const targetIds = (o) => (o.targets || o.payload?.params?.targets || []).map((t) => t.id);
const resolveAll = (s) => { for (let g = 0; g < 10 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s)); return s; };
const hand = (s) => s.players.user.hand.map((c) => c.name).sort();
/** The graveyard highest mana value first: the automatic chooser takes the first legal card, so a cap one too high picks another card. */
const DESCENDING = () => [{ ...COAT, id: "g5" }, { ...MIND_STONE, id: "g2" }, { ...SOL_RING, id: "g1" }, { ...ORNITHOPTER, id: "g0" }, { ...BOLT, id: "gb" }];

describe("the reader", () => {
  it("⭐ Scrap Trawler plays its whole text", () => {
    expect(classifyCard(TRAWLER)).toBe("native-trigger");
  });
  it("CONTROL — Myr Retriever (another target artifact card) is native on both trees", () => {
    expect(classifyCard(RETRIEVER)).toBe("native-trigger");
  });
});

describe("its own death — one trigger, capped at its own mana value (3)", () => {
  it("⭐ destroyed: exactly one trigger; it returns an artifact card with mana value below 3 — never Coat of Arms (5), the Bolt, or itself (3)", () => {
    const s = destroyAndFlush(table(), ["trawler"]);
    const objs = trawlerOnStack(s);
    expect(objs).toHaveLength(1);
    expect(["g0", "g1", "g2"]).toContain(targetIds(objs[0])[0]);
    const done = resolveAll(s);
    expect(hand(done)).toHaveLength(1);
    expect(["Mind Stone", "Ornithopter", "Sol Ring"]).toContain(hand(done)[0]);
    expect(done.players.user.graveyard.map((c) => c.name)).toContain("Scrap Trawler");
  });
  it("⭐ a person chooses among exactly the artifact cards below 3 (the trigger-target pause)", () => {
    const s = applyDestroyEffect(table({ humans: ["user"] }), { controller: "ai", targets: [{ type: "permanent", id: "trawler" }] }); // the driver flushes
    const asked = advanceUntilDecision({ status: "active", state: s, difficulty: "beginner", decisionLog: [] });
    expect(asked.decision?.kind).toBe("trigger-target");
    const choices = asked.decision.candidates.map((c) => c.targets.map((t) => t.id)); // each legal choice, one target each
    expect(choices.flat().sort()).toEqual(["g0", "g1", "g2"]);
    const pick = asked.decision.candidates.find((c) => c.targets[0].id === "g2").id;
    const r = applyPendingChoice(asked.session, { kind: "trigger-target", candidateId: pick });
    // The driver plays on past the pick (draws come), so read the zones that answer it: the chosen card in hand, the others still in the graveyard.
    const st = r.session.state;
    expect({ inHand: hand(st).includes("Mind Stone"), graveyard: st.players.user.graveyard.map((c) => c.id).filter((id) => /^g/.test(id)).sort() })
      .toEqual({ inHand: true, graveyard: ["g0", "g1", "g5", "gb"] });
  });
});

describe("another artifact you control — capped at THAT artifact's mana value", () => {
  it("⭐ Mind Stone (2) destroyed: the target is below 2 — Ornithopter or Sol Ring, never the Mind Stone itself", () => {
    const s = applyDestroyEffect(table({ user: [P("stone", MIND_STONE)], humans: ["user"] }), { controller: "ai", targets: [{ type: "permanent", id: "stone" }] });
    const asked = advanceUntilDecision({ status: "active", state: s, difficulty: "beginner", decisionLog: [] });
    expect(asked.decision?.kind).toBe("trigger-target");
    expect(asked.decision.candidates.map((c) => c.targets.map((t) => t.id)).flat().sort()).toEqual(["g0", "g1"]);
  });
  it("⭐ Sol Ring (1) sacrificed for its mana-less trip: only Ornithopter (0) — the default AI's pick returns it", () => {
    const s = destroyAndFlush(table({ user: [P("ring", SOL_RING)], graveyard: DESCENDING() }), ["ring"]);
    expect(trawlerOnStack(s).map(targetIds)).toEqual([["g0"]]);
    expect(hand(resolveAll(s))).toEqual(["Ornithopter"]);
  });
  it("the floor (a control, both trees): a Treasure (0) sacrificed for mana finds no card below 0 — nothing returns", () => {
    let s = table({ user: [createPermanent({ id: "tr", card: { ...TREASURE, id: "c-tr" }, controller: "user", summoningSick: false })] });
    const tap = legalActionsForPlayer(s, "user").find((a) => a.permanentId === "tr" && /mana/.test(String(a.kind)));
    s = tap ? flushTriggers(dispatchAction(s, tap)) : destroyAndFlush(s, ["tr"]);
    s = resolveAll(s);
    expect(hand(s)).toEqual([]);
  });
  it("⭐ the ruling's simultaneous case: Scrap Trawler and Mind Stone destroyed together — two triggers, capped 3 and 2", () => {
    // The graveyard holds Mind Stone (2) then Sol Ring (1): the automatic chooser takes the first legal card for each — Scrap
    // Trawler's own trigger (below 3) the Mind Stone card, the Mind Stone's (below 2) the Sol Ring card. Both come back.
    const s = destroyAndFlush(table({ user: [P("stone", MIND_STONE)], graveyard: [{ ...MIND_STONE, id: "g2" }, { ...SOL_RING, id: "g1" }] }), ["trawler", "stone"]);
    const objs = trawlerOnStack(s);
    expect(objs.map(targetIds).flat().sort()).toEqual(["g1", "g2"]);
    expect(hand(resolveAll(s))).toEqual(["Mind Stone", "Sol Ring"]);
  });
  it("CONTROL — a nonartifact creature dying, an opponent's artifact, and an artifact exiled trigger nothing", () => {
    const bears = destroyAndFlush(table({ user: [P("bears", BEARS)] }), ["bears"]);
    expect(trawlerOnStack(bears)).toEqual([]);
    const theirs = destroyAndFlush(table({ ai: [P("their-ring", SOL_RING, "ai")] }), ["their-ring"]);
    expect(trawlerOnStack(theirs)).toEqual([]);
    const exiled = flushTriggers(moveCardToZone(table({ user: [P("stone", MIND_STONE)] }), { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: "stone" }));
    expect(trawlerOnStack(exiled)).toEqual([]);
  });
});

describe("a copy's mana value as it last existed (the Sculpting Steel ruling, through a become-copy)", () => {
  it("⭐ Mizzium Transreliquat (3) as a copy of Sol Ring (1) destroyed: capped at 1 — only Ornithopter", () => {
    let s = table({ user: [P("relic", TRANSRELIQUAT), P("ring", SOL_RING)], graveyard: DESCENDING(), pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "relic" && (a.targets || []).some((t) => t.id === "ring") && a.abilityIndex === 0);
    expect(act, "the {3} copy ability aimed at Sol Ring").toBeTruthy();
    s = resolveAll(flushTriggers(dispatchAction(s, act)));
    expect(s.players.user.battlefield.find((p) => p.id === "relic")).toBeTruthy();
    s = destroyAndFlush({ ...s, priorityHolder: "user" }, ["relic"]);
    expect(trawlerOnStack(s).map(targetIds)).toEqual([["g0"]]);
    expect(hand(resolveAll(s))).toEqual(["Ornithopter"]);
  });
});
