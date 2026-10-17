/**
 * playerAuraTarget.test.js — AN AURA THAT ENCHANTS A PLAYER IS CAST TARGETING A PLAYER, EVERY TIME (2026-10-17).
 *
 * "An Aura spell requires a target, which is defined by its enchant ability." (CR 303.4a) "Aura spells are always targeted. …
 * The target is chosen as the spell is cast" (CR 115.1b, 601.2c), and an Aura that can enchant a player can target only players
 * (CR 702.5d). The offer used to list a player target only for a player Aura the metric classifies native (Fraying Sanity, the
 * Curse of Opulence family). Every other "Enchant player" / "Enchant opponent" Aura (Paradox Haze, Curse of Bounty, 41 more)
 * fell through to the plain no-target permanent push: offered with NO target, cast that way by the AI, routed to the Arbiter
 * no-op, and gone from every zone when it resolved.
 *
 * Now every cast of an Aura whose cast face enchants a player names one legal player — any living player the caster may
 * target ("Enchant player"), or one of its opponents ("Enchant opponent") — through every cast lane (they all run the one cast
 * builder). The spell resolves through the player-Aura lane and the Aura enters enchanting that player (CR 303.4b). A player
 * Aura whose text the engine doesn't model sits on its player inert — the body-only posture — and is never a targetless cast;
 * the dispatcher refuses one. A transform card is judged by its front face, the only face it has in the hand (CR 712.8a).
 *
 * The house AI picks a player: the curse reading first (playerAuraEffect — Fraying Sanity, Curse of Opulence), then the printed
 * reading (playerAuraEffect.printedPlayerAuraSide): a Curse goes on the opponent the AI attacks; an Aura whose every line gives
 * the enchanted player an additional step or phase (Paradox Haze, Shadow of the Second Sun) on the AI itself; Grievous Wound on
 * an opponent; anything else is held (Wheel of Sun and Moon, Psychic Possession, Archnemesis).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier, unchanged by
 * this slice). Every case runs through the engine's own entry points: legalActionsForPlayer, dispatchAction, passPriority,
 * pickAction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { printedPlayerAuraSide } from "./playerAuraEffect.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const PARADOX_HAZE = {"name":"Paradox Haze","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant player\nAt the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step."}; // body-only
const CURSE_OF_BOUNTY = {"name":"Curse of Bounty","type":"Enchantment — Aura Curse","mana":"{1}{G}","cmc":2,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant player\nWhenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control."}; // body-only
const CURSE_OF_OPULENCE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // native-aura
const FRAYING_SANITY = {"name":"Fraying Sanity","type":"Enchantment — Aura Curse","mana":"{2}{U}","cmc":3,"keywords":["Enchant","Mill"],"colors":["U"],"oracle":"Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn."}; // native-aura
const SHADOW_OF_THE_SECOND_SUN = {"name":"Shadow of the Second Sun","type":"Enchantment — Aura","mana":"{4}{U}{U}","cmc":6,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant player\nAt the beginning of each of enchanted player's postcombat main phases, there is an additional beginning phase after this phase. (The end step happens after the added untap, upkeep, and draw steps.)"}; // body-only
const WHEEL_OF_SUN_AND_MOON = {"name":"Wheel of Sun and Moon","type":"Enchantment — Aura","mana":"{G/W}{G/W}","cmc":2,"keywords":["Enchant"],"colors":["G","W"],"oracle":"Enchant player\nIf a card would be put into enchanted player's graveyard from anywhere, instead that card is revealed and put on the bottom of that player's library."}; // body-only
const GRIEVOUS_WOUND = {"name":"Grievous Wound","type":"Enchantment — Aura","mana":"{3}{B}{B}","cmc":5,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant player\nEnchanted player can't gain life.\nWhenever enchanted player is dealt damage, they lose half their life, rounded up."}; // body-only
const PSYCHIC_POSSESSION = {"name":"Psychic Possession","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant opponent\nSkip your draw step.\nWhenever enchanted opponent draws a card, you may draw a card."}; // body-only
const ARCHNEMESIS = {"name":"Archnemesis","type":"Enchantment — Aura","mana":"{1}{U}{B}","cmc":3,"keywords":["Enchant"],"colors":["B","U"],"oracle":"Enchant opponent\nWhenever you attack enchanted player, that player loses 2 life. You draw a card and gain 2 life.\nWhenever a player attacks you, you may attach this Aura to that player."}; // body-only
const TENUOUS_TRUCE = {"name":"Tenuous Truce","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant opponent\nAt the beginning of enchanted opponent's end step, you and that player each draw a card.\nWhen you attack enchanted opponent or a planeswalker they control or when they attack you or a planeswalker you control, sacrifice this Aura."}; // body-only
const OVERENCUMBERED = {"name":"Overencumbered","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Food","Enchant"],"colors":["W"],"oracle":"Enchant opponent\nWhen this Aura enters, enchanted opponent creates a Clue token, a Food token, and a Junk token.\nAt the beginning of combat on enchanted opponent's turn, that player may pay {1} for each artifact they control. If they don't, creatures can't attack this combat."}; // body-only
const CURSE_OF_LEECHES = {"name":"Curse of Leeches // Leeching Lurker","type":"Enchantment — Aura Curse // Creature — Leech Horror","mana":"{2}{B}","cmc":3,"keywords":["Lifelink","Transform","Daybound","Enchant","Nightbound"],"colors":[],"layout":"transform","oracle":"Curse of Leeches - Enchantment — Aura Curse {2}{B}\nEnchant player\nAs this permanent transforms into Curse of Leeches, attach it to a player.\nAt the beginning of enchanted player's upkeep, they lose 1 life and you gain 1 life.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)\n//\nLeeching Lurker - Creature — Leech Horror \nLifelink\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)"}; // body-only
const ACCURSED_WITCH = {"name":"Accursed Witch // Infectious Curse","type":"Creature — Human Shaman // Enchantment — Aura Curse","mana":"{3}{B}","cmc":4,"power":"4","toughness":"2","keywords":["Transform","Enchant"],"colors":[],"layout":"transform","oracle":"Accursed Witch - Creature — Human Shaman {3}{B}\nSpells your opponents cast that target this creature cost {1} less to cast.\nWhen this creature dies, return it to the battlefield transformed under your control attached to target opponent.\n//\nInfectious Curse - Enchantment — Aura Curse \nEnchant player\nSpells you cast that target enchanted player cost {1} less to cast.\nAt the beginning of enchanted player's upkeep, that player loses 1 life and you gain 1 life."}; // body-only
const CURSE_OF_DEATHS_HOLD = {"name":"Curse of Death's Hold","type":"Enchantment — Aura Curse","mana":"{3}{B}{B}","cmc":5,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant player\nCreatures enchanted player controls get -1/-1."}; // body-only
const CURSE_OF_EXHAUSTION = {"name":"Curse of Exhaustion","type":"Enchantment — Aura Curse","mana":"{2}{W}{W}","cmc":4,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant player\nEnchanted player can't cast more than one spell each turn."}; // body-only
const CURSE_OF_THE_PIERCED_HEART = {"name":"Curse of the Pierced Heart","type":"Enchantment — Aura Curse","mana":"{1}{R}","cmc":2,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nAt the beginning of enchanted player's upkeep, this Aura deals 1 damage to that player or a planeswalker that player controls."}; // body-only
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const LEYLINE_OF_SANCTITY = {"name":"Leyline of Sanctity","type":"Enchantment","mana":"{2}{W}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)"}; // native-static
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

// Every "Enchant player" / "Enchant opponent" Aura above whose front face is the Aura.
const PLAYER_AURAS = [PARADOX_HAZE, CURSE_OF_BOUNTY, CURSE_OF_OPULENCE, FRAYING_SANITY, SHADOW_OF_THE_SECOND_SUN, WHEEL_OF_SUN_AND_MOON,
  GRIEVOUS_WOUND, PSYCHIC_POSSESSION, ARCHNEMESIS, TENUOUS_TRUCE, OVERENCUMBERED, CURSE_OF_LEECHES, CURSE_OF_DEATHS_HOLD,
  CURSE_OF_EXHAUSTION, CURSE_OF_THE_PIERCED_HEART];
const ENCHANT_OPPONENT = new Set([PSYCHIC_POSSESSION.name, ARCHNEMESIS.name, TENUOUS_TRUCE.name, OVERENCUMBERED.name]);

const FULL_POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** A four-seat pod (user → ai1 → ai2 → ai3) in ai1's precombat main phase; ai1 holds `aura` (id "aura1") and a full pool. */
function pod({ aura, boards = {}, life = {}, hand = null, pool = FULL_POOL } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: [], library: library(pid), ...(life[pid] != null ? { life: life[pid] } : {}) };
  }
  players.ai1 = { ...players.ai1, hand: hand || (aura ? [{ ...aura, id: "aura1" }] : []), manaPool: { ...players.ai1.manaPool, ...pool } };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "ai1", priorityHolder: "ai1", consecutivePasses: 0 };
}

const auraOffers = (s, pid = "ai1") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === "aura1");
/** Each offer as what it targets: "player <id>", or "NO TARGET". */
const offerShape = (a) => ((a.targets || []).length === 1 && a.targets[0].type === "player" ? `player ${a.targets[0].id}` : (a.targets || []).length ? `other ${JSON.stringify(a.targets)}` : "NO TARGET");
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
/** Where the Aura card is after the stack settles: "<seat>.<zone>", with the enchanted player for a battlefield permanent. */
function whereIs(s, name) {
  const out = [];
  for (const [pid, p] of Object.entries(s.players)) {
    for (const zone of ["hand", "battlefield", "graveyard", "exile", "library"]) {
      for (const o of p[zone] || []) {
        const n = o.card?.name ?? o.name;
        if (n === name) out.push(`${pid}.${zone}${o.enchantedPlayerId ? ` enchanting ${o.enchantedPlayerId}` : ""}`);
      }
    }
  }
  return out;
}
/** The offered cast targeting `pid` — asserted present, so a missing offer fails as an assertion. */
function offerOn(s, pid) {
  const offer = auraOffers(s).find((a) => a.targets?.[0]?.id === pid);
  expect(offer, `a cast targeting ${pid}`).toBeDefined();
  return offer;
}
function castOn(s, pid) {
  return resolveStack(dispatchAction(s, offerOn(s, pid)));
}
/** The AI's pick for ai1, as what it did with the Aura: "player <id>" or "held". */
function aiPick(s) {
  const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
  if (pick?.kind !== "cast-spell" || pick.cardId !== "aura1") return "held";
  return offerShape(pick);
}
function codeOf(fn) {
  try { fn(); } catch (e) { return e.code || e.message; }
  return "no throw";
}

describe("the offer — every cast of an Aura that enchants a player names exactly one legal player (CR 303.4a, 115.1b, 702.5d)", () => {
  it("⭐ Paradox Haze (body-only): one cast per living player, each targeting that player — never a targetless cast", () => {
    const offers = auraOffers(pod({ aura: PARADOX_HAZE }));
    expect(offers.map(offerShape)).toEqual(["player user", "player ai1", "player ai2", "player ai3"]);
    expect(offers.every((a) => a.isAuraSpell && a.enchantsPlayer && a.needsTargets)).toBe(true);
  });

  it("⭐ Curse of Bounty (body-only): one cast per living player", () => {
    expect(auraOffers(pod({ aura: CURSE_OF_BOUNTY })).map(offerShape)).toEqual(["player user", "player ai1", "player ai2", "player ai3"]);
  });

  it("⭐ an \"Enchant opponent\" Aura (Psychic Possession, Archnemesis, Tenuous Truce, Overencumbered): one cast per OPPONENT, never its caster", () => {
    const rows = [PSYCHIC_POSSESSION, ARCHNEMESIS, TENUOUS_TRUCE, OVERENCUMBERED].map((aura) => [aura.name, auraOffers(pod({ aura })).map(offerShape)]);
    expect(Object.fromEntries(rows)).toEqual(Object.fromEntries(rows.map(([n]) => [n, ["player user", "player ai2", "player ai3"]])));
  });

  it("⭐ no player Aura is ever offered targetless: every fixture, cast from the hand, offers only one-player casts", () => {
    const rows = PLAYER_AURAS.map((aura) => {
      const offers = auraOffers(pod({ aura }));
      return { name: aura.name, offered: offers.length > 0, allOnePlayer: offers.every((a) => offerShape(a).startsWith("player ")),
        caster: offers.some((a) => a.targets?.[0]?.id === "ai1") };
    });
    expect(rows).toEqual(PLAYER_AURAS.map((aura) => ({ name: aura.name, offered: true, allOnePlayer: true, caster: !ENCHANT_OPPONENT.has(aura.name) })));
  });

  it("⭐ a free cast runs the same builder: Paradox Haze found by discover is offered free on each player, never targetless", () => {
    const base = pod({ hand: [] });
    const s = { ...base, players: { ...base.players, ai1: { ...base.players.ai1, exile: [{ ...PARADOX_HAZE, id: "aura1" }] } },
      pendingDiscover: { controller: "ai1", cardId: "aura1" } };
    const casts = auraOffers(s);
    expect(casts.map(offerShape)).toEqual(["player user", "player ai1", "player ai2", "player ai3"]);
    expect(casts.every((a) => a.freeCast)).toBe(true);
  });

  it("a player the caster may not target is not offered: an opponent with hexproof (Leyline of Sanctity); the caster's own hexproof doesn't stop it", () => {
    const opp = auraOffers(pod({ aura: PARADOX_HAZE, boards: { ai2: [P("ley", LEYLINE_OF_SANCTITY, "ai2")] } })).map(offerShape);
    const own = auraOffers(pod({ aura: PARADOX_HAZE, boards: { ai1: [P("ley", LEYLINE_OF_SANCTITY, "ai1")] } })).map(offerShape);
    expect({ opp, own }).toEqual({ opp: ["player user", "player ai1", "player ai3"], own: ["player user", "player ai1", "player ai2", "player ai3"] });
  });

  it("⭐ no legal player, no cast (CR 303.4a): Psychic Possession with every opponent hexproof is not offered at all", () => {
    const boards = { user: [P("l1", LEYLINE_OF_SANCTITY, "user")], ai2: [P("l2", LEYLINE_OF_SANCTITY, "ai2")], ai3: [P("l3", LEYLINE_OF_SANCTITY, "ai3")] };
    expect(auraOffers(pod({ aura: PSYCHIC_POSSESSION, boards })).map(offerShape)).toEqual([]);
  });

  it("a cost the player-Aura lane doesn't pay is not offered: SYNTHETIC {X} and additional-cost player Auras (no printed one carries either)", () => {
    // SYNTHETIC wordings: no printed "Enchant player" Aura has {X} in its cost or an additional cost. The lane casts for the mana
    // cost alone, so either would be a cast for less than printed.
    const xHaze = { ...PARADOX_HAZE, name: "Probe X Haze", mana: "{X}{U}", cmc: 1 };
    const sacHaze = { ...PARADOX_HAZE, name: "Probe Sac Haze", oracle: `As an additional cost to cast this spell, sacrifice a creature.\n${PARADOX_HAZE.oracle}` };
    const boards = { ai1: [P("b1", GRIZZLY_BEARS, "ai1")] };
    expect({ x: auraOffers(pod({ aura: xHaze, boards })).map(offerShape), sac: auraOffers(pod({ aura: sacHaze, boards })).map(offerShape) })
      .toEqual({ x: [], sac: [] });
  });

  it("⭐ a transform card is judged by its front face (CR 712.8a): Curse of Leeches targets a player; Accursed Witch (a creature front, a Curse back) never does", () => {
    const leeches = auraOffers(pod({ aura: CURSE_OF_LEECHES })).map(offerShape);
    const witch = auraOffers(pod({ aura: ACCURSED_WITCH }));
    expect({ leeches, witchPlayerTargeted: witch.some((a) => a.enchantsPlayer || (a.targets || []).some((t) => t.type === "player")) })
      .toEqual({ leeches: ["player user", "player ai1", "player ai2", "player ai3"], witchPlayerTargeted: false });
  });
});

describe("resolution — the Aura enters enchanting the player chosen as it was cast (CR 303.4b)", () => {
  it("⭐ Paradox Haze cast on its caster enters enchanting ai1 — on the battlefield, not gone, no Arbiter flag", () => {
    const s = castOn(pod({ aura: PARADOX_HAZE }), "ai1");
    expect({ where: whereIs(s, "Paradox Haze"), arbiter: s.pendingArbiter ?? null }).toEqual({ where: ["ai1.battlefield enchanting ai1"], arbiter: null });
  });

  it("⭐ Curse of Bounty cast on ai2 enters under ai1's control enchanting ai2", () => {
    const s = castOn(pod({ aura: CURSE_OF_BOUNTY }), "ai2");
    expect({ where: whereIs(s, "Curse of Bounty"), arbiter: s.pendingArbiter ?? null }).toEqual({ where: ["ai1.battlefield enchanting ai2"], arbiter: null });
  });

  it("Psychic Possession enters enchanting the opponent it targeted; Curse of Leeches (front face) enchanting its player", () => {
    const pp = castOn(pod({ aura: PSYCHIC_POSSESSION }), "ai3");
    const leeches = castOn(pod({ aura: CURSE_OF_LEECHES }), "user");
    expect({ pp: whereIs(pp, "Psychic Possession"), leeches: whereIs(leeches, CURSE_OF_LEECHES.name) })
      .toEqual({ pp: ["ai1.battlefield enchanting ai3"], leeches: ["ai1.battlefield enchanting user"] });
  });

  it("the chosen player gains hexproof before it resolves: the spell doesn't resolve and goes to its owner's graveyard (CR 608.3b)", () => {
    const s0 = pod({ aura: CURSE_OF_BOUNTY });
    const cast = dispatchAction(s0, offerOn(s0, "ai2"));
    const shielded = { ...cast, players: { ...cast.players, ai2: { ...cast.players.ai2, battlefield: [P("ley", LEYLINE_OF_SANCTITY, "ai2")] } } };
    expect(whereIs(resolveStack(shielded), "Curse of Bounty")).toEqual(["ai1.graveyard"]);
  });

  it("inert on its player: Curse of Death's Hold on ai2 changes no creature's power or toughness — nothing reads its unmodeled line as another player's", () => {
    const boards = { ai1: [P("b1", GRIZZLY_BEARS, "ai1")], ai2: [P("b2", GRIZZLY_BEARS, "ai2")], ai3: [P("g3", HILL_GIANT, "ai3")] };
    const s = castOn(pod({ aura: CURSE_OF_DEATHS_HOLD, boards }), "ai2");
    const pt = (id) => [permanentPower(s, id), permanentToughness(s, id)];
    expect({ where: whereIs(s, "Curse of Death's Hold"), b1: pt("b1"), b2: pt("b2"), g3: pt("g3") })
      .toEqual({ where: ["ai1.battlefield enchanting ai2"], b1: [2, 2], b2: [2, 2], g3: [3, 3] });
  });
});

describe("the dispatcher refuses a player-Aura cast that names no legal player", () => {
  it("⭐ a hand-built Paradox Haze cast with no target throws AURA_TARGET_REQUIRED (CR 303.4a)", () => {
    const s = pod({ aura: PARADOX_HAZE });
    const offer = auraOffers(s)[0];
    const bare = { ...offer, targets: [], needsTargets: false, targetName: undefined, enchantsPlayer: undefined };
    expect(codeOf(() => dispatchAction(s, bare))).toBe("AURA_TARGET_REQUIRED");
  });

  it("an \"Enchant opponent\" cast naming its own caster, or a permanent, throws too", () => {
    const s = pod({ aura: PSYCHIC_POSSESSION, boards: { ai2: [P("b2", GRIZZLY_BEARS, "ai2")] } });
    const offer = auraOffers(s)[0];
    const self = { ...offer, targets: [{ type: "player", id: "ai1" }], targetName: "ai1", enchantsPlayer: true };
    const creature = { ...offer, targets: [{ type: "creature", id: "b2", controller: "ai2", name: "Grizzly Bears" }], targetName: "Grizzly Bears" };
    expect({ self: codeOf(() => dispatchAction(s, self)), creature: codeOf(() => dispatchAction(s, creature)) })
      .toEqual({ self: "AURA_TARGET_REQUIRED", creature: "AURA_TARGET_REQUIRED" });
  });
});

describe("the AI picks a player for each Aura it casts", () => {
  // life: ai3 is the lowest — the opponent the AI swings at first (defenderOrder.compareDefenders).
  const life = { user: 40, ai1: 40, ai2: 30, ai3: 20 };

  it("⭐ Paradox Haze (the enchanted player gets an additional upkeep step) — the AI enchants itself", () => {
    expect(aiPick(pod({ aura: PARADOX_HAZE, life }))).toBe("player ai1");
  });

  it("Shadow of the Second Sun (an additional beginning phase for the enchanted player) — itself", () => {
    expect(aiPick(pod({ aura: SHADOW_OF_THE_SECOND_SUN, life }))).toBe("player ai1");
  });

  it("⭐ Curse of Bounty (a Curse) — the opponent the AI attacks, never itself", () => {
    expect(aiPick(pod({ aura: CURSE_OF_BOUNTY, life }))).toBe("player ai3");
  });

  it("Grievous Wound (the enchanted player can't gain life, loses half on damage) — an opponent", () => {
    expect(aiPick(pod({ aura: GRIEVOUS_WOUND, life }))).toBe("player ai3");
  });

  it("held where the printed reading can't tell a side — Wheel of Sun and Moon, Psychic Possession (its own drawback is the line the engine plays), Archnemesis", () => {
    const rows = [WHEEL_OF_SUN_AND_MOON, PSYCHIC_POSSESSION, ARCHNEMESIS].map((aura) => [aura.name, aiPick(pod({ aura, life }))]);
    expect(Object.fromEntries(rows)).toEqual({ "Wheel of Sun and Moon": "held", "Psychic Possession": "held", "Archnemesis": "held" });
  });

  it("the printed reading reads the face that is up: Accursed Witch (a creature front) has no player-Aura side; Curse of Leeches (a Curse front) is an opponent's", () => {
    expect({ witch: printedPlayerAuraSide(ACCURSED_WITCH), leeches: printedPlayerAuraSide(CURSE_OF_LEECHES)?.side ?? null })
      .toEqual({ witch: null, leeches: "enemy" });
  });

  it("the curse reading comes first: Fraying Sanity goes on the opponent with the fewest cards in library, not the lowest life the Curse rule would pick", () => {
    const base = pod({ aura: FRAYING_SANITY, life: { user: 40, ai2: 30, ai3: 20 } });
    const players = { ...base.players, ai2: { ...base.players.ai2, library: base.players.ai2.library.slice(0, 3) } };
    expect(aiPick({ ...base, players })).toBe("player ai2");
  });

  it("⭐ the AI's cast resolves: Curse of Bounty ends up enchanting ai3; Paradox Haze enchanting ai1", () => {
    const run = (aura) => {
      const s = pod({ aura, life });
      const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
      return whereIs(resolveStack(dispatchAction(s, pick)), aura.name);
    };
    expect({ bounty: run(CURSE_OF_BOUNTY), haze: run(PARADOX_HAZE) }).toEqual({ bounty: ["ai1.battlefield enchanting ai3"], haze: ["ai1.battlefield enchanting ai1"] });
  });
});

describe("controls — what was already right stays right", () => {
  it("Curse of Opulence and Fraying Sanity: still native-aura, still one cast per player, still cast on the opponent the curse reading names", () => {
    const life = { user: 40, ai1: 40, ai2: 30, ai3: 20 };
    const opuOffers = auraOffers(pod({ aura: CURSE_OF_OPULENCE })).map(offerShape);
    expect({
      tiers: [classifyCard(CURSE_OF_OPULENCE), classifyCard(FRAYING_SANITY)],
      opuOffers,
      opu: aiPick(pod({ aura: CURSE_OF_OPULENCE, life })),
      opuResolved: whereIs(castOn(pod({ aura: CURSE_OF_OPULENCE }), "ai2"), "Curse of Opulence"),
    }).toEqual({
      tiers: ["native-aura", "native-aura"],
      opuOffers: ["player user", "player ai1", "player ai2", "player ai3"],
      opu: "player ai3",
      opuResolved: ["ai1.battlefield enchanting ai2"],
    });
  });

  it("the tiers don't move: the body-only player Auras stay body-only (an inert Aura on a player is not a modeled one)", () => {
    expect([PARADOX_HAZE, CURSE_OF_BOUNTY, PSYCHIC_POSSESSION, CURSE_OF_LEECHES, ACCURSED_WITCH].map((c) => classifyCard(c)))
      .toEqual(["body-only", "body-only", "body-only", "body-only", "body-only"]);
  });

  it("creature Auras are unchanged: Pacifism is offered once per creature on the battlefield, never on a player", () => {
    const boards = { ai1: [P("b1", GRIZZLY_BEARS, "ai1")], ai2: [P("b2", GRIZZLY_BEARS, "ai2")], ai3: [P("g3", HILL_GIANT, "ai3")] };
    const offers = auraOffers(pod({ aura: PACIFISM, boards }));
    expect(offers.map((a) => `${a.targets[0].type} ${a.targets[0].id}`).sort()).toEqual(["creature b1", "creature b2", "creature g3"]);
    expect(offers.some((a) => a.enchantsPlayer)).toBe(false);
  });
});
