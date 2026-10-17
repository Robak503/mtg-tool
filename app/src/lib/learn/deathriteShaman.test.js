/**
 * deathriteShaman.test.js — the play-weighted program, #611 Deathrite Shaman.
 *
 *   "{T}: Exile target land card from a graveyard. Add one mana of any color. (Activate only as an instant.)
 *    {B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.
 *    {G}, {T}: Exile target creature card from a graveyard. You gain 2 life."
 *
 * An activated ability that adds mana is a mana ability only if it has no target (CR 605.1a). The first line targets, so it is
 * NOT one: it uses the stack and can be responded to (CR 605.3b does not apply; the card's own ruling says so), and if its target
 * is gone when it resolves it does nothing — no mana (CR 608.2b; the card's ruling). The line was routed to the mana model by its
 * "Add" alone (abilities.effectIsManaAbility), which cannot drive a targeted ability, so it parked the card. Now an "Add" ability
 * whose effect parses HIGH with a chosen target is a stack ability: offered with its target, put on the stack, the program
 * (exile the land card, then add one mana — applyAddMana's any-colour choice) run as it resolves. The planner never sees it: it is
 * not a mana source, so it can never pay a cost mid-cast.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Runtime cases run through legalActionsForPlayer + dispatchAction + passPriority.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DRS = {"name":"Deathrite Shaman","type":"Creature — Elf Shaman","mana":"{B/G}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["B","G"],"oracle":"{T}: Exile target land card from a graveyard. Add one mana of any color. (Activate only as an instant.)\n{B}, {T}: Exile target instant or sorcery card from a graveyard. Each opponent loses 2 life.\n{G}, {T}: Exile target creature card from a graveyard. You gain 2 life."}; // body-only #611
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const AUTOMATON = {"name":"Universal Automaton","type":"Artifact Creature — Shapeshifter","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)"}; // native-body
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });

function table({ user = [], ai = [], hand = [], userGy = [], aiGy = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand, graveyard: userGy };
  players.ai = { ...players.ai, battlefield: ai, graveyard: aiGy };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 100) s = passPriority(s);
  return s;
}
/** The first line's offers: activate-ability on Deathrite Shaman with no mana cost (the {T}-only line). */
const lineOneOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "drs" && a.abilityIndex === 0);
/** The first offer of the first line, asserted present (so a missing offer fails on an assertion, not in the dispatcher). */
const firstOffer = (s) => { const a = lineOneOffers(s)[0]; expect(a).toBeTruthy(); return a; };
const poolTotal = (s, pid = "user") => Object.values(s.players[pid].manaPool || {}).reduce((n, v) => n + (Number(v) || 0), 0);

describe("parse + classification", () => {
  it("the first line is a modeled STACK ability (not a mana ability): exile a land card from a graveyard, then add one mana of any colour", () => {
    const line = parseActivatedAbilities(DRS)[0];
    expect(line).toMatchObject({ isManaEffect: false, modeled: true, tapSelf: true, needsTarget: true });
    expect(line.program.atoms.map((a) => a.op)).toEqual(["exile-from-graveyard", "add-mana"]);
    expect(line.program.atoms[0]).toMatchObject({ targetType: "graveyardCard", cardFilter: "land", anyGraveyard: true });
  });

  it("Deathrite Shaman classifies native", () => {
    expect(isNativeTier(classifyCard(DRS))).toBe(true);
  });

  it("it is never a mana SOURCE: manaSources offers nothing for it, with land cards in a graveyard", () => {
    const s = table({ user: [P("drs", DRS, "user")], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    expect(manaSources(s, "user").some((src) => src.permanentId === "drs")).toBe(false);
  });
});

describe("RUNTIME — the offer", () => {
  it("⭐ one offer per land card in ANY graveyard (the opponent's and the user's own); a nonland card is no target", () => {
    const s = table({ user: [P("drs", DRS, "user")], userGy: [{ ...SWAMP, id: "gy-swamp" }, { ...BOLT, id: "gy-bolt" }], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    const targets = lineOneOffers(s).map((a) => (a.targets || []).map((t) => t.id).join(",")).sort();
    expect(targets).toEqual(["gy-forest", "gy-swamp"]);
  });

  it("no land card in any graveyard → no offer of the first line", () => {
    const s = table({ user: [P("drs", DRS, "user")], aiGy: [{ ...BOLT, id: "gy-bolt" }] });
    expect(lineOneOffers(s)).toHaveLength(0);
  });

  it("a tapped or summoning-sick Deathrite Shaman offers nothing ({T})", () => {
    const tapped = table({ user: [P("drs", DRS, "user", { tapped: true })], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    expect(lineOneOffers(tapped)).toHaveLength(0);
    const sick = table({ user: [P("drs", DRS, "user", { summoningSick: true })], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    expect(lineOneOffers(sick)).toHaveLength(0);
  });

});

describe("RUNTIME — the stack and the resolution", () => {
  it("⭐ activating uses the stack: Deathrite taps, nothing is added yet; as it resolves the land card is exiled and one mana of its colours is added", () => {
    let s = table({ user: [P("drs", DRS, "user")], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    s = dispatchAction(s, firstOffer(s));
    expect(s.stack).toHaveLength(1);
    expect(s.players.user.battlefield.find((p) => p.id === "drs").tapped).toBe(true);
    expect(poolTotal(s)).toBe(0);
    s = resolveStack(s);
    expect(s.players.ai.graveyard.some((c) => c.id === "gy-forest")).toBe(false);
    expect(s.players.ai.exile.some((c) => c.id === "gy-forest")).toBe(true);
    expect(poolTotal(s)).toBe(1);
    const color = Object.entries(s.players.user.manaPool).find(([, v]) => v > 0)?.[0];
    expect(["B", "G"]).toContain(color);
  });

  it("its target gone before it resolves → it does nothing: no mana (the card's ruling, CR 608.2b)", () => {
    let s = table({ user: [P("drs", DRS, "user")], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    s = dispatchAction(s, firstOffer(s));
    // the land card leaves the graveyard in response
    const card = s.players.ai.graveyard.find((c) => c.id === "gy-forest");
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, graveyard: s.players.ai.graveyard.filter((c) => c.id !== "gy-forest"), exile: [...(s.players.ai.exile || []), card] } } };
    s = resolveStack(s);
    expect(poolTotal(s)).toBe(0);
  });

  it("the mana it added pays a later cast: Universal Automaton ({1}) is cast off the pool", () => {
    let s = table({ user: [P("drs", DRS, "user")], hand: [{ ...AUTOMATON, id: "h-auto" }], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-auto")).toBe(false);
    s = resolveStack(dispatchAction(s, firstOffer(s)));
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-auto");
    expect(cast).toBeTruthy();
    s = resolveStack(dispatchAction(s, cast));
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Universal Automaton")).toBe(true);
    expect(poolTotal(s)).toBe(0);
  });

  it("CREED — it can't pay a cost mid-cast: Deathrite + one Forest can't cast Grizzly Bears ({1}{G})", () => {
    const s = table({ user: [P("drs", DRS, "user"), P("f1", FOREST, "user")], hand: [{ ...BEARS, id: "h-bear" }], aiGy: [{ ...FOREST, id: "gy-forest" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "h-bear")).toBe(false);
  });

  it("control — the second line still drains each opponent for 2 off an instant in a graveyard", () => {
    let s = table({ user: [P("drs", DRS, "user"), P("sw", SWAMP, "user")], aiGy: [{ ...BOLT, id: "gy-bolt" }] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "drs" && x.abilityIndex === 1);
    expect(a).toBeTruthy();
    s = resolveStack(dispatchAction(s, a));
    expect(s.players.ai.life).toBe(18);
  });
});
