/**
 * graveyardExileUpToOne.test.js — "When this creature enters, exile up to one target card from a graveyard." (Soul-Guide
 * Gryff, Ambush Wolf, Crossroads Candleguide; and — unplanned, pinned below — Mechanical Mobster, whose ETB adds "Target
 * creature you control connives."). The 09-06 plan's stage ③, 2026-09-30.
 *
 * TWO pieces, and the census could only see the first. The clause "exile up to one target card from a graveyard" parsed
 * LOW (the graveyard-exile arm had no "up to one"), so it read as the sole blocker. But the MANDATORY form ("exile target
 * card from a graveyard") on an ETB was already parked too: exile-from-graveyard over "a graveyard" reports an AMBIGUOUS
 * target intent, so the trigger flush could not promise a side and routed it to the Arbiter. The up-to-one form IS
 * side-provable, on the Endurance rationale already in atomTargetIntent: graveyard hate aimed at an OPPONENT never harms
 * the controller, and "up to one" hands the chooser the empty pick when no opponent's graveyard holds a card — so it is
 * never forced onto its own graveyard. The mandatory form stays ambiguous (pinned).
 *
 * The expansion was machinery: this op already carries the up-to-N subset marker ("up to three … from a single
 * graveyard", "up to two … from that player's graveyard"), and targeting.expandAtoms offers [t] or [].
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { checkStepTriggers, checkAttackTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";

beforeEach(() => _resetIdsForTests());

const GRYFF = { id: "gryff-c", name: "Soul-Guide Gryff", type: "Creature — Hippogriff Spirit", mana: "{4}{W}", power: 3, toughness: 4,
  oracle: "Flying\nWhen this creature enters, exile up to one target card from a graveyard." };
const AMBUSH_WOLF = { name: "Ambush Wolf", type: "Creature — Wolf", mana: "{2}{G}", power: 4, toughness: 2,
  oracle: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, exile up to one target card from a graveyard." };
const CANDLEGUIDE = { name: "Crossroads Candleguide", type: "Artifact Creature — Scarecrow", mana: "{4}", power: 3, toughness: 4,
  oracle: "When this creature enters, exile up to one target card from a graveyard.\n{2}: Add one mana of any color." };
const MOBSTER = { id: "mob-c", name: "Mechanical Mobster", type: "Artifact Creature — Human Robot Villain", mana: "{3}", power: 2, toughness: 1,
  oracle: "When this creature enters, exile up to one target card from a graveyard. Target creature you control connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)" };
const DIREGRAF = { name: "Diregraf Scavenger", type: "Creature — Zombie Bear", mana: "{3}{B}", power: 2, toughness: 3,
  oracle: "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhen this creature enters, exile up to one target card from a graveyard. If a creature card was exiled this way, each opponent loses 2 life and you gain 2 life." };
// The seven UNPLANNED gains — the same clause in other contexts (bundled Scryfall, probed 2026-09-30).
const HERITAGE = { id: "herit-c", name: "Heritage Reclamation", type: "Instant", mana: "{1}{G}",
  oracle: "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile up to one target card from a graveyard. Draw a card." };
const JACK = { id: "jack-c", name: "Jack-o'-Lantern", type: "Artifact", mana: "{1}",
  oracle: "{1}, {T}, Sacrifice this artifact: Exile up to one target card from a graveyard. Draw a card.\n{1}, Exile this card from your graveyard: Add one mana of any color." };
const SLOTH = { id: "sloth-c", name: "Startled Relic Sloth", type: "Creature — Sloth Beast", mana: "{2}{R}{W}", power: 4, toughness: 4,
  oracle: "Trample, lifelink\nAt the beginning of combat on your turn, exile up to one target card from a graveyard." };
const COTTAGE = { id: "cottage-c", name: "Restless Cottage", type: "Land", mana: "",
  oracle: "This land enters tapped.\n{T}: Add {B} or {G}.\n{2}{B}{G}: This land becomes a 4/4 black and green Horror creature until end of turn. It's still a land.\nWhenever this land attacks, create a Food token and exile up to one target card from a graveyard." };
const RISE_OF_EXTUS = { id: "rise-c", name: "Rise of Extus", type: "Sorcery", mana: "{4}{W/B}{W/B}",
  oracle: "Exile target creature. Exile up to one target instant or sorcery card from a graveyard.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)" };
const WRECK_REMOVER = { id: "wreck-c", name: "Wreck Remover", type: "Artifact Creature — Construct", mana: "{4}", power: 3, toughness: 4,
  oracle: "Whenever this creature enters or attacks, exile up to one target card from a graveyard. You gain 1 life.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const DUSTSPEAKER = { name: "Ascendant Dustspeaker", type: "Creature — Orc Cleric", mana: "{4}{W}", power: 3, toughness: 4,
  oracle: "Flying\nWhen this creature enters, put a +1/+1 counter on another target creature you control.\nAt the beginning of combat on your turn, exile up to one target card from a graveyard." };
const gyBear = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });
const gyShock = (id) => ({ id, name: "Shock", type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." });
const gyIsland = (id) => ({ id, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" });
const SHOCK = { id: "lib-shock", name: "Shock", type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." };

function mainState({ user = {}, ai = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } },
      ai: { ...s.players.ai, ...ai },
    },
  };
}
// Cast `card`, let it enter, resolve its ETB.
function entersAndResolves(card, board) {
  let s = mainState(board);
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === card.id);
  expect(cast).toBeTruthy();
  s = resolveTopOfStack(dispatchAction(s, cast)); // it enters; the ETB goes on the stack
  expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
  return resolveTopOfStack(s);
}
const gyExileLog = (s) => (s.log || []).filter((e) => e.effect === "exile-from-graveyard");

describe("classification — the up-to-one form is native, the mandatory form stays with the Arbiter", () => {
  it("Soul-Guide Gryff, Ambush Wolf → native-trigger; Crossroads Candleguide → native-mana; Mechanical Mobster → native-trigger", () => {
    expect(classifyCard(GRYFF)).toBe("native-trigger");
    expect(classifyCard(AMBUSH_WOLF)).toBe("native-trigger");
    expect(classifyCard(CANDLEGUIDE)).toBe("native-mana");
    expect(classifyCard(MOBSTER)).toBe("native-trigger");
  });

  it("⛔ Diregraf Scavenger still parks on its 'if a creature card was exiled this way' drain", () => {
    expect(classifyCard(DIREGRAF)).toBe("body-only");
  });

  it("⛔ the MANDATORY 'exile target card from a graveyard' ETB stays with the Arbiter (it could be forced onto its own side)", () => {
    const mandatory = { name: "Mandatory Probe", type: "Creature — Spirit", power: 1, toughness: 1,
      oracle: "When this creature enters, exile target card from a graveyard." };
    expect(classifyCard(mandatory)).toBe("body-only");
  });

  it("the parse and the intent: up to one → enemy; the mandatory form → ambiguous", () => {
    const upTo = parseEffectClause("exile up to one target card from a graveyard").atoms[0];
    expect(upTo).toMatchObject({ op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, minTargets: 0, maxTargets: 1 });
    expect(atomTargetIntent(upTo)).toBe("enemy");
    expect(atomTargetIntent(parseEffectClause("exile target card from a graveyard").atoms[0])).toBe("ambiguous");
  });
});

describe("RUNTIME — the pick is the opponent's card, or nothing", () => {
  it("⭐ with a card in each graveyard, the Gryff exiles the OPPONENT's and leaves yours", () => {
    const out = entersAndResolves(GRYFF, { user: { hand: [GRYFF], graveyard: [gyIsland("u-isl")], manaPool: { W: 1, C: 4 } }, ai: { graveyard: [gyBear("a-bear")] } });
    expect(out.players.ai.graveyard).toHaveLength(0);
    expect((out.players.ai.exile || []).map((c) => c.name)).toContain("Grizzly Bears");
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Island"]);
    console.log(`WITNESS gyExileEnemy ${JSON.stringify({ aiExile: (out.players.ai.exile || []).map((c) => c.name), userGraveyard: out.players.user.graveyard.map((c) => c.name) })}`);
  });

  it("⭐ with only YOUR graveyard stocked, the native resolver runs on the empty pick — your card stays", () => {
    const out = entersAndResolves(GRYFF, { user: { hand: [GRYFF], graveyard: [gyIsland("u-isl")], manaPool: { W: 1, C: 4 } }, ai: { graveyard: [] } });
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Island"]);
    const logs = gyExileLog(out);
    expect(logs).toHaveLength(1); // the native resolver ran (not an Arbiter no-op)
    expect(logs[0].targets).toEqual([]);
    console.log(`WITNESS gyExileEmptyPick ${JSON.stringify({ userGraveyard: out.players.user.graveyard.map((c) => c.name), resolverTargets: logs[0].targets })}`);
  });

  it("⭐ UNPLANNED GAIN — Mechanical Mobster: the opponent's card is exiled AND your creature connives (the forced discard of a nonland → +1/+1)", () => {
    const out = entersAndResolves(MOBSTER, { user: { hand: [MOBSTER], library: [SHOCK], manaPool: { C: 3 } }, ai: { graveyard: [gyBear("a-bear")] } });
    expect(out.players.ai.graveyard).toHaveLength(0);
    expect((out.players.ai.exile || []).map((c) => c.name)).toContain("Grizzly Bears");
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Shock"); // drew it, discarded it
    const mob = out.players.user.battlefield.find((p) => p.card.name === "Mechanical Mobster");
    expect(mob.counters?.["+1/+1"]).toBe(1);
    console.log(`WITNESS mobsterConnive ${JSON.stringify({ aiExile: (out.players.ai.exile || []).map((c) => c.name), discarded: out.players.user.graveyard.map((c) => c.name), mobsterCounters: mob.counters?.["+1/+1"] })}`);
  });
});

// The flip-diff gained SEVEN cards beyond the four planned: the same clause on other trigger events, an activated ability
// and two spells. Every unplanned gain's runtime is audited here, one real run per distinct path (Ascendant Dustspeaker
// rides the Sloth's beginning-of-combat path; its ETB counter was already native).
describe("UNPLANNED GAINS — the same clause in other contexts, each path run for real", () => {
  const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 10 && st.stack?.length && !st.pendingChoice; i++) st = resolveTopOfStack(st); return st; };
  const exiledFrom = (s, pid) => (s.players[pid].exile || []).map((c) => c.name);

  it("six classify native; Jack-o'-Lantern stays parked on its graveyard MANA line", () => {
    expect(classifyCard(HERITAGE)).toBe("native-spell");
    expect(classifyCard(RISE_OF_EXTUS)).toBe("native-spell");
    expect(classifyCard(SLOTH)).toBe("native-trigger");
    expect(classifyCard(DUSTSPEAKER)).toBe("native-trigger");
    expect(classifyCard(WRECK_REMOVER)).toBe("native-trigger");
    expect(classifyCard(COTTAGE)).toBe("land");
    // ⛔ The first flip-diff read Jack native-mixed — and exposed a false positive that predates this slice: the GY-2 lane
    // credited and OFFERED its "{1}, Exile this card from your graveyard: Add one mana of any color." and resolved it into
    // an empty pool. The lane refuses mana programs now (CR 605.1a / 605.3b), so Jack parks on that line, as its own pin in
    // manaGraveyardComposition.test.js always claimed. Its exile activation still works — run below.
    expect(classifyCard(JACK)).toBe("body-only");
  });

  it("⛔ the broken graveyard activation is gone: Jack-o'-Lantern in your graveyard, {1} open — nothing offered for it", () => {
    const s = mainState({ user: { graveyard: [JACK], manaPool: { C: 1 } } });
    expect(legalActionsForPlayer(s, "user").filter((a) => a.cardId === "jack-c")).toEqual([]);
  });

  it("BEGINNING OF COMBAT — Startled Relic Sloth exiles the opponent's card, never yours", () => {
    const s0 = mainState({ user: { battlefield: [createPermanent({ id: "p-sloth", card: SLOTH, controller: "user", summoningSick: false })], graveyard: [gyIsland("u-isl")] }, ai: { graveyard: [gyBear("a-bear")] } });
    const out = settle(checkStepTriggers({ ...s0, phase: "combat", step: "beginning-of-combat" }, "combatBegin"));
    expect(exiledFrom(out, "ai")).toEqual(["Grizzly Bears"]);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Island"]);
  });

  it("ETB + a second instruction — Wreck Remover exiles the opponent's card and you gain 1 life", () => {
    const s0 = mainState({ user: { hand: [WRECK_REMOVER], manaPool: { C: 4 } }, ai: { graveyard: [gyBear("a-bear")] } });
    const lifeBefore = s0.players.user.life;
    const out = entersAndResolves(WRECK_REMOVER, { user: { hand: [WRECK_REMOVER], manaPool: { C: 4 } }, ai: { graveyard: [gyBear("a-bear")] } });
    expect(exiledFrom(out, "ai")).toEqual(["Grizzly Bears"]);
    expect(out.players.user.life).toBe(lifeBefore + 1);
  });

  it("ATTACKS — Restless Cottage makes a Food and exiles the opponent's card", () => {
    const s0 = mainState({ user: { battlefield: [createPermanent({ id: "p-cot", card: COTTAGE, controller: "user", summoningSick: false })] }, ai: { graveyard: [gyBear("a-bear")] } });
    const attacking = { ...s0, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "p-cot", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const out = settle(checkAttackTriggers(attacking));
    expect(exiledFrom(out, "ai")).toEqual(["Grizzly Bears"]);
    expect(out.players.user.battlefield.some((p) => /food/i.test(p.card?.name || ""))).toBe(true);
    console.log(`WITNESS cottageAttack ${JSON.stringify({ aiExile: exiledFrom(out, "ai"), food: out.players.user.battlefield.filter((p) => /food/i.test(p.card?.name || "")).length })}`);
  });

  it("ACTIVATED — Jack-o'-Lantern: the activation is offered with AND without a graveyard target; the targeted one exiles + draws", () => {
    const s = mainState({ user: { battlefield: [createPermanent({ id: "p-jack", card: JACK, controller: "user", summoningSick: false })], library: [SHOCK], manaPool: { C: 1 } }, ai: { graveyard: [gyBear("a-bear")] } });
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p-jack");
    expect(acts.some((a) => (a.targets || []).some((t) => t.id === "a-bear"))).toBe(true);
    expect(acts.some((a) => !(a.targets || []).some((t) => t.type === "graveyardCard"))).toBe(true); // the zero-target choice
    let out = dispatchAction(s, acts.find((a) => (a.targets || []).some((t) => t.id === "a-bear")));
    out = resolveTopOfStack(out);
    expect(exiledFrom(out, "ai")).toEqual(["Grizzly Bears"]);
    expect(out.players.user.hand.map((c) => c.name)).toContain("Shock");
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Jack-o'-Lantern");
  });

  it("MODAL SPELL — Heritage Reclamation's third mode exiles the chosen card and draws", () => {
    const s = mainState({ user: { hand: [HERITAGE], library: [SHOCK], manaPool: { G: 1, C: 1 } }, ai: { graveyard: [gyBear("a-bear")] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "herit-c" && (a.targets || []).some((t) => t.id === "a-bear"));
    expect(cast).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, cast));
    expect(exiledFrom(out, "ai")).toEqual(["Grizzly Bears"]);
    expect(out.players.user.hand.map((c) => c.name)).toContain("Shock");
  });

  it("TWO-TARGET SPELL — Rise of Extus exiles the creature AND the chosen instant; the second target may be declined", () => {
    const board = { user: { hand: [RISE_OF_EXTUS], manaPool: { W: 2, C: 4 } },
      ai: { battlefield: [createPermanent({ id: "p-bear", card: gyBear("b-card"), controller: "ai" })], graveyard: [gyShock("a-shock")] } };
    const s = mainState(board);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "rise-c");
    expect(casts.some((a) => (a.targets || []).some((t) => t.id === "p-bear") && !(a.targets || []).some((t) => t.type === "graveyardCard"))).toBe(true); // up to one: zero is legal
    const both = casts.find((a) => (a.targets || []).some((t) => t.id === "p-bear") && (a.targets || []).some((t) => t.id === "a-shock"));
    expect(both).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, both));
    expect(exiledFrom(out, "ai").sort()).toEqual(["Grizzly Bears", "Shock"]);
    console.log(`WITNESS riseOfExtus ${JSON.stringify({ aiExile: exiledFrom(out, "ai").sort(), learnPause: out.pendingChoice?.kind || null })}`);
  });
});
