/**
 * countedTokensKeyword.test.js — the play-weighted program: Chasm Skulker (#705) and Hangarback Walker (#1522).
 *
 *   Chasm Skulker:     "When this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number
 *                       of +1/+1 counters on this creature."
 *   Hangarback Walker: "When this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each
 *                       +1/+1 counter on this creature."
 *
 * Both counted token forms were read already ("create X … tokens, where X is …" and "create a … token for each …"), and a
 * keyword rider was read already on a FIXED count ("create a 1/1 blue Squid creature token with islandwalk"); the two were
 * never read together, so both cards parked on their dies line. The counted arms now take the same keyword rider
 * (parseHelpers.parseTokenKeywords — only keywords the engine enforces; anything else keeps the clause unread). The count is
 * the dying creature's +1/+1 counters as it last existed (CR 603.10a — checkDiesTriggers' look-back, the count Hooded Hydra's
 * Snakes already read).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The deaths run through the engine's own entry points: Lightning Bolt is the offered cast, dispatched; passPriority
 * resolves it, the lethal-damage check kills the creature and its dies trigger resolves.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, nextStep } from "./gameEngine.js";
import { permanentHasKeyword, permanentColors } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const SKULKER = {"name":"Chasm Skulker","type":"Creature — Squid Horror","mana":"{2}{U}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"Whenever you draw a card, put a +1/+1 counter on this creature.\nWhen this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature. (They can't be blocked as long as defending player controls an Island.)"}; // body-only #705
const HANGARBACK = {"name":"Hangarback Walker","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature.\n{1}, {T}: Put a +1/+1 counter on this creature."}; // body-only #1522
// The twins the same reader unlocked (flip-diff, 2026-10-17):
const OWL_KEEPER = {"name":"Jötun Owl Keeper","type":"Creature — Giant","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":["Cumulative upkeep"],"colors":["W"],"oracle":"Cumulative upkeep {W} or {U} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this creature dies, create a 1/1 white Bird creature token with flying for each age counter on it."}; // body-only #26840
const SPIRITKEEPER = {"name":"Hallowed Spiritkeeper","type":"Creature — Avatar","mana":"{1}{W}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nWhen this creature dies, create X 1/1 white Spirit creature tokens with flying, where X is the number of creature cards in your graveyard."}; // body-only #8133
const LEGION = {"name":"Assemble the Legion","type":"Enchantment","mana":"{3}{R}{W}","cmc":5,"keywords":[],"colors":["R","W"],"oracle":"At the beginning of your upkeep, put a muster counter on this enchantment. Then create a 1/1 red and white Soldier creature token with haste for each muster counter on this enchantment."}; // body-only #2258
const SPAWNING = {"name":"Spider Spawning","type":"Sorcery","mana":"{4}{G}","cmc":5,"keywords":["Flashback"],"colors":["G"],"oracle":"Create a 1/2 green Spider creature token with reach for each creature card in your graveyard.\nFlashback {6}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // arbiter-spell #7925
const SWEEP = {"name":"Sweep the Skies","type":"Sorcery","mana":"{X}{U}{U}","cmc":2,"keywords":["Converge"],"colors":["U"],"oracle":"Converge — Create a 1/1 colorless Thopter artifact creature token with flying for each color of mana spent to cast this spell."}; // arbiter-spell #21799
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

function table({ board = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: library(pid) };
  players.user = { ...players.user, battlefield: board, hand };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
const boltAt = (s, targetId) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "bolt" && (x.targets || []).some((t) => t.id === targetId));
  if (!a) throw new Error("Lightning Bolt at the target was not offered");
  return resolveStack(dispatchAction(s, a));
};
const named = (s, name) => s.players.user.battlefield.filter((p) => p.card?.name === name);
const atomOf = (clause) => parseEffectClause(clause, "Instant", { hasX: false, sourceScoped: true });

describe("parse — the counted token arms take a keyword rider", () => {
  it("Chasm Skulker's \"create X … with islandwalk, where X is …\" → one create-token atom: count from the source's +1/+1 counters, islandwalk", () => {
    const p = atomOf("create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    // ("islandwalk" in the keyword reader's own spelling — the fixed-count arm emits the same; hasKeyword reads it case-blind.)
    expect(p.atoms[0]).toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "blue squid", countFor: { kind: "plusCountersOnSource" }, keywords: ["islandwalk"] });
    expect(atomOf("create a 1/1 blue Squid creature token with islandwalk").atoms[0].keywords).toEqual(p.atoms[0].keywords);
  });

  it("Hangarback Walker's \"… with flying for each +1/+1 counter …\" → the same atom with flying", () => {
    const p = atomOf("create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on this creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-token", power: 1, toughness: 1, descriptor: "colorless thopter artifact", countFor: { kind: "plusCountersOnSource" }, keywords: ["Flying"] });
  });

  it("CREED — a rider the engine doesn't enforce keeps the counted clause unread", () => {
    expect(atomOf("create a 1/1 colorless Thopter artifact creature token with protection from black for each +1/+1 counter on this creature").confidence).toBe("low");
    expect(atomOf("create X 1/1 blue Squid creature tokens with banding, where X is the number of +1/+1 counters on this creature").confidence).toBe("low");
  });

  it("control — the counted forms without a rider parse exactly as before", () => {
    expect(atomOf("create a 1/1 green Snake creature token for each +1/+1 counter on it").atoms[0]).toEqual({ op: "create-token", power: 1, toughness: 1, descriptor: "green snake", countFor: { kind: "plusCountersOnSource" }, targetType: null });
  });
});

describe("classification", () => {
  it("the dies trigger routes natively and both cards classify native", () => {
    for (const c of [SKULKER, HANGARBACK]) {
      const dies = detectTriggers(c).find((d) => d.event === "dies");
      expect(triggerRoutesNatively(dies)).toBe(true);
      expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
    }
  });
});

describe("RUNTIME — the dying creature's counters, as it last existed, count the tokens", () => {
  it("⭐ Chasm Skulker with two +1/+1 counters (3/3) dies to Lightning Bolt → two 1/1 blue Squids with islandwalk", () => {
    let s = table({ board: [P("sk", SKULKER, "user", { counters: { "+1/+1": 2 } }), P("m0", MOUNTAIN, "user")], hand: [{ ...BOLT, id: "bolt" }] });
    s = boltAt(s, "sk");
    expect(named(s, "Chasm Skulker")).toHaveLength(0);
    const squids = named(s, "Squid");
    expect(squids).toHaveLength(2);
    for (const q of squids) {
      expect(q.card.token).toBe(true);
      expect([Number(q.card.power), Number(q.card.toughness)]).toEqual([1, 1]);
      expect(permanentColors(s, q.id)).toEqual(["U"]);
      expect(permanentHasKeyword(s, q.id, "Islandwalk")).toBe(true);
    }
  });

  it("Hangarback Walker with three counters (3/3) dies → three 1/1 colorless Thopter artifact creatures with flying", () => {
    let s = table({ board: [P("hw", HANGARBACK, "user", { counters: { "+1/+1": 3 } }), P("m0", MOUNTAIN, "user")], hand: [{ ...BOLT, id: "bolt" }] });
    s = boltAt(s, "hw");
    expect(named(s, "Hangarback Walker")).toHaveLength(0);
    const thopters = named(s, "Thopter");
    expect(thopters).toHaveLength(3);
    for (const t of thopters) {
      expect(String(t.card.type)).toMatch(/Artifact Creature/);
      expect(permanentColors(s, t.id)).toEqual([]);
      expect(permanentHasKeyword(s, t.id, "Flying")).toBe(true);
    }
  });

  it("twin — Jötun Owl Keeper with two age counters dies → two 1/1 white Birds with flying (the age counters as it last existed)", () => {
    let s = table({ board: [P("owl", OWL_KEEPER, "user", { counters: { age: 2 } }), P("m0", MOUNTAIN, "user")], hand: [{ ...BOLT, id: "bolt" }] });
    s = boltAt(s, "owl");
    const birds = named(s, "Bird");
    expect(birds).toHaveLength(2);
    for (const b of birds) {
      expect(permanentColors(s, b.id)).toEqual(["W"]);
      expect(permanentHasKeyword(s, b.id, "Flying")).toBe(true);
    }
  });

  it("twin — Hallowed Spiritkeeper dies beside one creature card in the graveyard → two Spirits (it counts itself: it is in the graveyard as the trigger resolves)", () => {
    let s = table({ board: [P("hs", SPIRITKEEPER, "user"), P("m0", MOUNTAIN, "user")], hand: [{ ...BOLT, id: "bolt" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ ...BEARS, id: "gy-bear" }] } } };
    s = boltAt(s, "hs");
    const spirits = named(s, "Spirit");
    expect(spirits).toHaveLength(2);
    for (const sp of spirits) expect(permanentHasKeyword(s, sp.id, "Flying")).toBe(true);
  });

  it("twin — Assemble the Legion at two muster counters: the user's upkeep puts the third on and makes three red-and-white Soldiers with haste", () => {
    let s = table({ board: [P("legion", LEGION, "user", { counters: { muster: 2 } })] });
    s = { ...s, phase: "ending", step: "end", activePlayer: "ai", priorityHolder: "ai" };
    let g = 0;
    while (!(s.activePlayer === "user" && s.step === "upkeep" && !s.stack.length && !(s.pendingTriggers || []).length && named(s, "Soldier").length) && g++ < 100) {
      s = s.priorityHolder ? passPriority(s) : nextStep(s);
    }
    expect(s.players.user.battlefield.find((p) => p.id === "legion").counters.muster).toBe(3);
    const soldiers = named(s, "Soldier");
    expect(soldiers).toHaveLength(3);
    for (const so of soldiers) {
      expect(permanentColors(s, so.id).sort()).toEqual(["R", "W"]);
      expect(permanentHasKeyword(s, so.id, "Haste")).toBe(true);
    }
  });

  it("twin — Spider Spawning with two creature cards in the graveyard → two 1/2 green Spiders with reach", () => {
    let s = table({ board: Array.from({ length: 5 }, (_, i) => P(`f${i}`, FOREST, "user")), hand: [{ ...SPAWNING, id: "spawn" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ ...BEARS, id: "gy-1" }, { ...BEARS, id: "gy-2" }] } } };
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "spawn");
    s = resolveStack(dispatchAction(s, a));
    const spiders = named(s, "Spider");
    expect(spiders).toHaveLength(2);
    for (const sp of spiders) {
      expect([Number(sp.card.power), Number(sp.card.toughness)]).toEqual([1, 2]);
      expect(permanentHasKeyword(s, sp.id, "Reach")).toBe(true);
    }
  });

  it("CREED — Sweep the Skies reads its clause now, but stays parked: its {X} is never offered (no X in its text, so the cast is offered at X = 0 only)", () => {
    expect(atomOf("create a 1/1 colorless Thopter artifact creature token with flying for each color of mana spent to cast this spell").confidence).toBe("high");
    expect(isNativeTier(classifyCard(SWEEP))).toBe(false);
    const s = table({ board: [P("i0", ISLAND, "user"), P("i1", ISLAND, "user"), P("m0", MOUNTAIN, "user")], hand: [{ ...SWEEP, id: "sweep" }] });
    const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "sweep");
    expect(casts.every((x) => x.xValue == null)).toBe(true);
  });

  it("control — a Skulker that dies with no counters makes no Squid", () => {
    let s = table({ board: [P("sk", SKULKER, "user"), P("m0", MOUNTAIN, "user")], hand: [{ ...BOLT, id: "bolt" }] });
    s = boltAt(s, "sk");
    expect(named(s, "Chasm Skulker")).toHaveLength(0);
    expect(named(s, "Squid")).toHaveLength(0);
  });
});
