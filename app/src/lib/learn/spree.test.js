/**
 * SPREE (CR 702.172a, 700.2h) — "Spree (Choose one or more additional costs.)" then one "+ {cost} — effect" line per mode.
 *
 * Spree means "Choose one or more modes. As an additional cost to cast this spell, pay the costs associated with those modes"
 * (CR 702.172a). A mode's cost is an additional cost, paid as the spell is cast when that mode is chosen; with several modes
 * chosen, every one of their costs is paid (CR 700.2h). The total cost is the mana cost plus those additional costs (CR 601.2f),
 * a mode whose targets can't be chosen can't be chosen (CR 700.2a), and the chosen modes resolve in printed order.
 *
 * The engine already had the "Choose one or more —" modal (parseModal's atLeastOne, expandCastChoices' every non-empty subset,
 * programAtoms' ascending-order execution). Spree reuses all three: the parser reads the "+" lines as that modal and stamps each
 * mode's cost (`modal.spreeCosts`), and the cast lane charges the base cost plus the chosen modes' costs, offering only a set the
 * caster can pay. A card with any mode the engine can't resolve stays on the Arbiter (THE CREED — the modal is all-or-nothing).
 *
 * Also here: "Target player draws N cards and loses M life" (Sign in Blood, and Insatiable Avarice's second mode) names ONE
 * player — the cast used to offer two independent player targets, one for the draw and one for the loss.
 *
 * Real oracle fixtures (bundled Scryfall, cardIndex.publicCard, 2026-10-17 data) — never typed from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (bundled Scryfall) ──────────────────────────────────────
const REQUISITION = {"name":"Requisition Raid","type":"Sorcery","mana":"{W}","cmc":1,"keywords":["Spree"],"colors":["W"],"oracle":"Spree (Choose one or more additional costs.)\n+ {1} — Destroy target artifact.\n+ {1} — Destroy target enchantment.\n+ {1} — Put a +1/+1 counter on each creature target player controls."};
const AVARICE = {"name":"Insatiable Avarice","type":"Sorcery","mana":"{B}","cmc":1,"keywords":["Spree"],"colors":["B"],"oracle":"Spree (Choose one or more additional costs.)\n+ {2} — Search your library for a card, then shuffle and put that card on top.\n+ {B}{B} — Target player draws three cards and loses 3 life."};
const DERAIL = {"name":"Explosive Derailment","type":"Instant","mana":"{R}","cmc":1,"keywords":["Spree"],"colors":["R"],"oracle":"Spree (Choose one or more additional costs.)\n+ {2} — Explosive Derailment deals 4 damage to target creature.\n+ {2} — Destroy target artifact."};
const PHANTOM = {"name":"Phantom Interference","type":"Instant","mana":"{U}","cmc":1,"keywords":["Spree"],"colors":["U"],"oracle":"Spree (Choose one or more additional costs.)\n+ {3} — Create a 2/2 white Spirit creature token with flying.\n+ {1} — Counter target spell unless its controller pays {2}."};
const TRASH = {"name":"Trash the Town","type":"Instant","mana":"{G}","cmc":1,"keywords":["Spree"],"colors":["G"],"oracle":"Spree (Choose one or more additional costs.)\n+ {2} — Put two +1/+1 counters on target creature.\n+ {1} — Target creature gains trample until end of turn.\n+ {1} — Until end of turn, target creature gains \"Whenever this creature deals combat damage to a player, draw two cards.\""};
const THREE_STEPS = {"name":"Three Steps Ahead","type":"Instant","mana":"{U}","cmc":1,"keywords":["Spree"],"colors":["U"],"oracle":"Spree (Choose one or more additional costs.)\n+ {1}{U} — Counter target spell.\n+ {3} — Create a token that's a copy of target artifact or creature you control.\n+ {2} — Draw two cards, then discard a card."};
// Each of these has a mode the engine does not resolve — they stay on the Arbiter.
const ACCIDENT = {"name":"Unfortunate Accident","type":"Instant","mana":"{B}","cmc":1,"keywords":["Spree"],"colors":["B"],"oracle":"Spree (Choose one or more additional costs.)\n+ {2}{B} — Destroy target creature.\n+ {1} — Create a 1/1 red Mercenary creature token with \"{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.\""};
const HEIST = {"name":"Great Train Heist","type":"Instant","mana":"{R}","cmc":1,"keywords":["Treasure","Spree"],"colors":["R"],"oracle":"Spree (Choose one or more additional costs.)\n+ {2}{R} — Untap all creatures you control. If it's your combat phase, there is an additional combat phase after this phase.\n+ {2} — Creatures you control get +1/+0 and gain first strike until end of turn.\n+ {R} — Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token."};
const RETURN_FAVOR = {"name":"Return the Favor","type":"Instant","mana":"{R}{R}","cmc":2,"keywords":["Spree"],"colors":["R"],"oracle":"Spree (Choose one or more additional costs.)\n+ {1} — Copy target instant spell, sorcery spell, activated ability, or triggered ability. You may choose new targets for the copy.\n+ {1} — Change the target of target spell or ability with a single target."};
const DIRGE = {"name":"Lively Dirge","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":["Spree"],"colors":["B"],"oracle":"Spree (Choose one or more additional costs.)\n+ {1} — Search your library for a card, put it into your graveyard, then shuffle.\n+ {2} — Return up to two creature cards with total mana value 4 or less from your graveyard to the battlefield."};
const SHOWDOWN = {"name":"Final Showdown","type":"Instant","mana":"{W}","cmc":1,"keywords":["Spree"],"colors":["W"],"oracle":"Spree (Choose one or more additional costs.)\n+ {1} — All creatures lose all abilities until end of turn.\n+ {1} — Choose a creature you control. It gains indestructible until end of turn.\n+ {3}{W}{W} — Destroy all creatures."};
const SIGN_IN_BLOOD = {"name":"Sign in Blood","type":"Sorcery","mana":"{B}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target player draws two cards and loses 2 life."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"","power":"3","toughness":"3"};
const THALIA = {"name":"Thalia, Guardian of Thraben","type":"Legendary Creature — Human Soldier","mana":"{1}{W}","cmc":2,"keywords":["First strike"],"colors":["W"],"oracle":"First strike\nNoncreature spells cost {1} more to cast.","power":"2","toughness":"1"};
const ODIN = {"name":"Summon: Primal Odin","type":"Enchantment Creature — Saga Knight","mana":"{4}{B}{B}","cmc":6,"keywords":[],"colors":["B"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Gungnir — Destroy target creature an opponent controls.\nII — Zantetsuken — This creature gains \"Whenever this creature deals combat damage to a player, that player loses the game.\"\nIII — Hall of Sorrow — Draw two cards. Each player loses 2 life.","power":"5","toughness":"3"};
const FIST = {"name":"Fist of Suns","type":"Artifact","mana":"{3}","cmc":3,"keywords":[],"colors":[],"oracle":"You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast."};

// ─── harness ──────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const many = (n, card, controller, prefix) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));
const H = (id, card) => ({ ...card, id });
function board({ user = [], ai = [], hand = [], aiHand = [], active = "user", priority = active, userLibrary = null, aiLibrary = null, exile = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (who) => [1, 2, 3, 4, 5].map((i) => ({ ...BEARS, id: `${who}-lib${i}` }));
  return { ...g, turn: 5, activePlayer: active, priorityHolder: priority, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, hand, library: userLibrary ?? lib("user"), exile },
      ai: { ...g.players.ai, battlefield: ai, hand: aiHand, library: aiLibrary ?? lib("ai") } } };
}
const castsOf = (s, who, cardId) => legalActionsForPlayer({ ...s, priorityHolder: who }, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const modesOf = (a) => (Array.isArray(a.chosenMode) ? a.chosenMode : a.chosenMode == null ? null : [a.chosenMode]);
const manaTotal = (cost) => ["generic", "W", "U", "B", "R", "G", "C"].reduce((n, k) => n + (cost?.[k] || 0), 0);
const row = (a) => ({ modes: modesOf(a), targets: (a.targets || []).map((t) => `${t.atomIndex}:${t.id}`), mana: manaTotal(a.cost) });
const errors = (s) => (s.log || []).filter((e) => e.kind === "stack-resolve-error");
const hasPerm = (s, who, id) => s.players[who].battlefield.some((p) => p.id === id);

describe("the cards and their parse", () => {
  it("⭐ every Spree card whose modes all resolve is native: Requisition Raid, Insatiable Avarice, Explosive Derailment, Phantom Interference, Trash the Town, Three Steps Ahead", () => {
    const tiers = Object.fromEntries([REQUISITION, AVARICE, DERAIL, PHANTOM, TRASH, THREE_STEPS].map((c) => [c.name, classifyCard(c)]));
    expect(tiers).toEqual({ "Requisition Raid": "native-spell", "Insatiable Avarice": "native-spell", "Explosive Derailment": "native-spell",
      "Phantom Interference": "native-spell", "Trash the Town": "native-spell", "Three Steps Ahead": "native-spell" });
  });

  it("CREED — a Spree card with ANY mode the engine can't resolve stays on the Arbiter", () => {
    for (const c of [ACCIDENT, HEIST, RETURN_FAVOR, DIRGE, SHOWDOWN]) expect(classifyCard(c), c.name).not.toMatch(/^native/);
    // A cost the cast lane doesn't price (hybrid) reads nothing, whatever the modes do.
    const hybrid = { ...DERAIL, name: "Hybrid Probe", oracle: DERAIL.oracle.replace("+ {2} — Destroy", "+ {R/G} — Destroy") };
    expect(classifyCard(hybrid)).not.toMatch(/^native/);
    // A missing "+" line is not Spree.
    const broken = { ...DERAIL, name: "Broken Probe", oracle: DERAIL.oracle.replace("+ {2} — Destroy", "{2} — Destroy") };
    expect(classifyCard(broken)).not.toMatch(/^native/);
  });

  it("the program is the 'choose one or more' modal with each mode's additional cost stamped in printed order", () => {
    const p = parseEffectProgram(REQUISITION);
    expect({ conf: programConfidence(p), structure: p?.structure, atLeastOne: p?.modal?.atLeastOne, chooseCount: p?.modal?.chooseCount,
      ops: (p?.modal?.modes || []).map((m) => m.atoms.map((a) => a.op)), costs: p?.modal?.spreeCosts }).toEqual({
      conf: "high", structure: "modal", atLeastOne: true, chooseCount: 3, ops: [["destroy"], ["destroy"], ["add-counter"]], costs: ["{1}", "{1}", "{1}"] });
    expect(parseEffectProgram(AVARICE)?.modal?.spreeCosts).toEqual(["{2}", "{B}{B}"]);
  });
});

describe("⭐ the cast — one or more modes, the base cost plus every chosen mode's cost (CR 601.2f, 700.2h)", () => {
  const derailBoard = (lands) => board({
    user: lands,
    ai: [P("giant", GIANT, "ai"), P("ring", SOL_RING, "ai")],
    hand: [H("derail", DERAIL)],
  });

  it("three mana: each mode alone is offered at {R}+{2}; both modes ({R}+{2}+{2}) are not — the caster can't pay them", () => {
    const s = derailBoard([P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("m3", MOUNTAIN)]);
    const offers = castsOf(s, "user", "derail").map(row);
    console.log("  WITNESS derailThreeMana", JSON.stringify(offers));
    expect(offers).toEqual([
      { modes: [0], targets: ["0:giant"], mana: 3 },
      { modes: [1], targets: ["0:ring"], mana: 3 },
    ]);
  });

  it("five mana: both modes are offered too, costing 5, each mode with its own target (atomIndex in printed order)", () => {
    const s = derailBoard(many(5, MOUNTAIN, "user", "m"));
    const offers = castsOf(s, "user", "derail");
    const both = offers.filter((a) => modesOf(a)?.length === 2).map(row);
    expect(both).toEqual([{ modes: [0, 1], targets: ["0:giant", "1:ring"], mana: 5 }]);
    expect(offers.find((a) => modesOf(a)?.length === 2).cost).toMatchObject({ R: 1, generic: 4 });
    // No cast without a mode: Spree demands at least one.
    expect(offers.every((a) => (modesOf(a) || []).length >= 1)).toBe(true);
  });

  it("CR 700.2a — a mode whose target can't be chosen can't be chosen: no enchantment, no Requisition Raid casting mode 2", () => {
    const s = board({ user: many(4, PLAINS, "user", "p"), ai: [P("ring", SOL_RING, "ai"), P("bear", BEARS, "ai")], hand: [H("raid", REQUISITION)] });
    const offers = castsOf(s, "user", "raid");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.some((a) => (modesOf(a) || []).includes(1))).toBe(false);
    expect(offers.map((a) => JSON.stringify(modesOf(a)))).toEqual(expect.arrayContaining(["[0]", "[2]", "[0,2]"]));
    // Four Plains pay {W} plus three modes' {1}s at most — and here only two modes are choosable.
    expect(Math.max(...offers.map((a) => manaTotal(a.cost)))).toBe(3);
    // An enchantment on the battlefield makes mode 2 choosable, and all three modes cost {W}{1}{1}{1}.
    const withAnthem = board({ user: many(4, PLAINS, "user", "p"), ai: [P("ring", SOL_RING, "ai"), P("bear", BEARS, "ai"), P("anthem", ANTHEM, "ai")], hand: [H("raid", REQUISITION)] });
    const all = castsOf(withAnthem, "user", "raid").filter((a) => (modesOf(a) || []).length === 3).map(row);
    expect(all).toEqual([{ modes: [0, 1, 2], targets: ["0:ring", "1:anthem", "2:user"], mana: 4 }, { modes: [0, 1, 2], targets: ["0:ring", "1:anthem", "2:ai"], mana: 4 }]);
  });

  it("a cost increase applies to the total (CR 601.2f): with Thalia, one mode of Explosive Derailment costs {R}+{1}+{2}", () => {
    const s = board({ user: many(4, MOUNTAIN, "user", "m"), ai: [P("thalia", THALIA, "ai"), P("ring", SOL_RING, "ai")], hand: [H("derail", DERAIL)] });
    const offers = castsOf(s, "user", "derail").map(row);
    expect(offers).toEqual([
      { modes: [0], targets: ["0:thalia"], mana: 4 },
      { modes: [1], targets: ["0:ring"], mana: 4 },
    ]);
  });

  it("a free cast pays no mana, so it can't pay the modes' additional costs: a discovered Spree spell offers only the hand", () => {
    const s0 = board({ user: many(5, MOUNTAIN, "user", "m"), ai: [P("giant", GIANT, "ai")], exile: [H("derail", DERAIL)] });
    const s = { ...s0, pendingDiscover: { controller: "user", cardId: "derail" } };
    const kinds = legalActionsForPlayer(s, "user").map((a) => a.kind);
    expect(kinds).toEqual(["discover-to-hand"]);
  });

  it("Fist of Suns' {W}{U}{B}{R}{G} replaces the mana cost, never the modes' costs: a Spree cast is not given that variant", () => {
    const s = board({ user: [P("fist", FIST), P("pl", PLAINS), P("is", ISLAND), P("sw", SWAMP), P("mo", MOUNTAIN), P("fo", FOREST)],
      ai: [P("giant", GIANT, "ai")], hand: [H("derail", DERAIL)] });
    const offers = castsOf(s, "user", "derail");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.filter((a) => a.altManaCost === "wubrg")).toEqual([]);
  });
});

describe("⭐ the resolution — every chosen mode, in printed order", () => {
  it("Explosive Derailment, both modes: five lands tapped, the Hill Giant dies to 4 damage, the Sol Ring is destroyed", () => {
    const s0 = board({ user: many(5, MOUNTAIN, "user", "m"), ai: [P("giant", GIANT, "ai"), P("ring", SOL_RING, "ai")], hand: [H("derail", DERAIL)] });
    const both = castsOf(s0, "user", "derail").find((a) => modesOf(a)?.length === 2);
    expect(both, "the both-modes cast is offered").toBeTruthy();
    const s1 = dispatchAction(s0, both);
    const tapped = s1.players.user.battlefield.filter((p) => p.tapped).length;
    const s = resolveTopOfStack(s1);
    const result = { tapped, giant: hasPerm(s, "ai", "giant"), ring: hasPerm(s, "ai", "ring"), aiGraveyard: s.players.ai.graveyard.map((c) => c.name).sort(),
      derailInGraveyard: s.players.user.graveyard.some((c) => c.name === "Explosive Derailment"), stack: s.stack.length, errors: errors(s).length };
    console.log("  WITNESS derailBoth", JSON.stringify(result));
    expect(result).toEqual({ tapped: 5, giant: false, ring: false, aiGraveyard: ["Hill Giant", "Sol Ring"], derailInGraveyard: true, stack: 0, errors: 0 });
  });

  it("Insatiable Avarice, both modes, in PRINTED ORDER: the card searched for and put on top is the first of the three drawn", () => {
    const library = [{ ...BEARS, id: "u-lib1" }, { ...BEARS, id: "u-lib2" }, { ...BEARS, id: "u-lib3" }, { ...BEARS, id: "u-lib4" }, { ...SOL_RING, id: "u-ring" }, { ...BEARS, id: "u-lib5" }];
    const s0 = board({ user: many(5, SWAMP, "user", "sw"), hand: [H("avarice", AVARICE)], userLibrary: library });
    const both = castsOf(s0, "user", "avarice").find((a) => modesOf(a)?.length === 2 && a.targets[0]?.id === "user");
    expect(both, "the both-modes cast is offered").toBeTruthy();
    expect(row(both)).toEqual({ modes: [0, 1], targets: ["1:user"], mana: 5 });
    let s = resolveTopOfStack(dispatchAction(s0, both));
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, "u-ring");
    if (!s.pendingChoice) s = finalizeStackResolution(s);
    const result = { ringInHand: s.players.user.hand.some((c) => c.id === "u-ring"), hand: s.players.user.hand.length, life: s.players.user.life,
      library: s.players.user.library.length, stack: s.stack.length, errors: errors(s).length };
    console.log("  WITNESS avaricePrintedOrder", JSON.stringify(result));
    expect(result).toEqual({ ringInHand: true, hand: 3, life: 37, library: 3, stack: 0, errors: 0 });
  });

  it("Requisition Raid, modes 1 and 3: the artifact is destroyed and each creature the target player controls gets a +1/+1 counter", () => {
    const s0 = board({ user: [...many(3, PLAINS, "user", "p"), P("ub1", BEARS), P("ub2", BEARS)], ai: [P("ring", SOL_RING, "ai")], hand: [H("raid", REQUISITION)] });
    const pick = castsOf(s0, "user", "raid").find((a) => JSON.stringify(modesOf(a)) === "[0,2]" && a.targets.some((t) => t.id === "user"));
    expect(pick, "the modes-1-and-3 cast is offered").toBeTruthy();
    expect(row(pick)).toEqual({ modes: [0, 2], targets: ["0:ring", "1:user"], mana: 3 });
    const s = resolveTopOfStack(dispatchAction(s0, pick));
    expect({ ring: hasPerm(s, "ai", "ring"), counters: s.players.user.battlefield.filter((p) => p.id.startsWith("ub")).map((p) => p.counters?.["+1/+1"] ?? 0), errors: errors(s).length })
      .toEqual({ ring: false, counters: [1, 1], errors: 0 });
  });

  it("Three Steps Ahead's copy mode copies an artifact you control — a Sol Ring token — and only your own", () => {
    const s0 = board({ user: [...many(4, ISLAND, "user", "i"), P("myring", SOL_RING)], ai: [P("ring", SOL_RING, "ai")], hand: [H("steps", THREE_STEPS)] });
    const offers = castsOf(s0, "user", "steps");
    const copy = offers.filter((a) => JSON.stringify(modesOf(a)) === "[1]");
    expect(copy.map(row)).toEqual([{ modes: [1], targets: ["0:myring"], mana: 4 }]);
    const s = resolveTopOfStack(dispatchAction(s0, copy[0]));
    const rings = s.players.user.battlefield.filter((p) => p.card?.name === "Sol Ring");
    expect({ rings: rings.length, token: rings.some((p) => p.card?.token || p.token), errors: errors(s).length }).toEqual({ rings: 2, token: true, errors: 0 });
  });

  it("a creature Saga is not a copy target (its token would need the lore counter the token path doesn't give, CR 714.3a)", () => {
    const s0 = board({ user: [...many(4, ISLAND, "user", "i"), P("odin", ODIN), P("bear", BEARS)], hand: [H("steps", THREE_STEPS)] });
    const copyTargets = castsOf(s0, "user", "steps").filter((a) => JSON.stringify(modesOf(a)) === "[1]").map((a) => a.targets[0]?.id);
    expect(copyTargets).not.toContain("odin");
  });
});

describe("⭐ 'Target player draws N cards and loses M life' names ONE player", () => {
  it("Sign in Blood: each cast names one player, and that player both draws and loses the life", () => {
    const s0 = board({ user: many(2, SWAMP, "user", "sw"), hand: [H("sib", SIGN_IN_BLOOD)] });
    const offers = castsOf(s0, "user", "sib");
    expect(offers.map((a) => a.targets.map((t) => t.id))).toEqual([["user"], ["ai"]]);
    const s = resolveTopOfStack(dispatchAction(s0, offers[1]));
    expect({ aiHand: s.players.ai.hand.length, aiLife: s.players.ai.life, userHand: s.players.user.hand.length, userLife: s.players.user.life })
      .toEqual({ aiHand: 2, aiLife: 38, userHand: 0, userLife: 40 });
  });

  it("Insatiable Avarice's second mode alone: one player target per cast", () => {
    const s0 = board({ user: many(3, SWAMP, "user", "sw"), hand: [H("avarice", AVARICE)] });
    const second = castsOf(s0, "user", "avarice").filter((a) => JSON.stringify(modesOf(a)) === "[1]");
    expect(second.map((a) => a.targets.map((t) => `${t.atomIndex}:${t.id}`))).toEqual([["0:user"], ["0:ai"]]);
  });
});

describe("⭐ the AI picks a mode set it can afford, every target on the side its effect wants", () => {
  const aiPick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });

  it("Explosive Derailment: enemy creature and enemy artifact, five mana → both modes, both aimed at the opponent", () => {
    const s = board({ ai: many(5, MOUNTAIN, "ai", "m"), user: [P("giant", GIANT), P("ring", SOL_RING)], aiHand: [H("derail", DERAIL)], active: "ai" });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("derail");
    expect(row(pick)).toEqual({ modes: [0, 1], targets: ["0:giant", "1:ring"], mana: 5 });
  });

  it("only its own creature and an enemy artifact → the artifact mode alone; never 4 damage to its own Hill Giant", () => {
    const s = board({ ai: [...many(5, MOUNTAIN, "ai", "m"), P("mygiant", GIANT, "ai")], user: [P("ring", SOL_RING)], aiHand: [H("derail", DERAIL)], active: "ai" });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("derail");
    expect(row(pick)).toEqual({ modes: [1], targets: ["0:ring"], mana: 3 });
  });

  it("only its own creature and its own artifact → holds the card", () => {
    const s = board({ ai: [...many(5, MOUNTAIN, "ai", "m"), P("mygiant", GIANT, "ai"), P("myring", SOL_RING, "ai")], user: [], aiHand: [H("derail", DERAIL)], active: "ai" });
    expect(castsOf(s, "ai", "derail").length).toBeGreaterThan(0);
    expect(aiPick(s)?.cardId).not.toBe("derail");
  });

  it("Three Steps Ahead, its own Sol Ring, six mana, empty stack → copy the Sol Ring AND draw two (the counter mode has no target)", () => {
    const s = board({ ai: [...many(6, ISLAND, "ai", "i"), P("myring", SOL_RING, "ai")], user: [P("ring", SOL_RING)], aiHand: [H("steps", THREE_STEPS)], active: "ai" });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("steps");
    expect(row(pick)).toEqual({ modes: [1, 2], targets: ["0:myring"], mana: 6 });
  });

  it("Phantom Interference, empty stack, four mana → the Spirit token alone", () => {
    const s = board({ ai: many(4, ISLAND, "ai", "i"), aiHand: [H("phantom", PHANTOM)], active: "ai" });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("phantom");
    expect(row(pick)).toEqual({ modes: [0], targets: [], mana: 4 });
  });

  it("an opponent's Hill Giant on the stack, five mana → the token AND the counter aimed at that spell", () => {
    const s0 = board({ user: many(4, MOUNTAIN, "user", "m"), hand: [H("ugiant", GIANT)], ai: many(5, ISLAND, "ai", "i"), aiHand: [H("phantom", PHANTOM)] });
    const giantCast = castsOf(s0, "user", "ugiant")[0];
    const s1 = dispatchAction(s0, giantCast);
    const spellId = s1.stack[s1.stack.length - 1].id;
    const pick = aiPick({ ...s1, priorityHolder: "ai" });
    expect(pick?.cardId).toBe("phantom");
    expect(row(pick)).toEqual({ modes: [0, 1], targets: [`1:${spellId}`], mana: 5 });
  });

  it("only its own spell on the stack → the token mode alone; it never counters its own spell", () => {
    const s0 = board({ ai: [...many(4, MOUNTAIN, "ai", "m"), ...many(5, ISLAND, "ai", "i")], aiHand: [H("agiant", GIANT), H("phantom", PHANTOM)], active: "ai" });
    const giantCast = castsOf(s0, "ai", "agiant")[0];
    const cast = dispatchAction(s0, giantCast);
    // (its lands untapped again, so the only question is which modes it picks)
    const s1 = { ...cast, players: { ...cast.players, ai: { ...cast.players.ai, battlefield: cast.players.ai.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    const offers = castsOf(s1, "ai", "phantom");
    expect(offers.some((a) => (modesOf(a) || []).includes(1))).toBe(true); // the counter is offered — it is legal
    const pick = aiPick({ ...s1, priorityHolder: "ai" });
    expect(pick?.cardId).toBe("phantom");
    expect(modesOf(pick)).toEqual([0]);
  });
});
