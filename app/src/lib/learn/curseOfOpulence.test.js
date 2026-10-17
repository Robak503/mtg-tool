/**
 * curseOfOpulence.test.js — the play-weighted program, #699 Curse of Opulence (and the three Curses printed with the same
 * second sentence: Curse of Verbosity, Curse of Disturbance, Curse of Vitality).
 *
 *   "Enchant player
 *    Whenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold
 *    token is an artifact with "Sacrifice this token: Add one mana of any color.")"
 *
 * What was built:
 *   · the "enchanted player is attacked" event (triggers.checkAttackTriggers): an Aura enchanting a player triggers ONCE when
 *     the attack declaration closes with one or more creatures declared attacking that player (CR 508.3b — "triggers if one or
 *     more creatures are declared as attackers attacking that player"); a planeswalker of theirs being attacked is not the
 *     player being attacked (the bundled ruling), and a creature put onto the battlefield attacking never counts (CR 508.3b);
 *   · "<effect>. Each opponent attacking that player does the same." — ONE atom: the Curse's controller performs the effect,
 *     then each of that controller's opponents who controls a creature still attacking the enchanted player performs it as
 *     it resolves (the bundled rulings: "A player is attacking another player if they control a creature that's attacking that
 *     player. If no creatures are attacking the enchanted player as a Curse's ability resolves …, only the Curse's controller
 *     performs its actions." "Each Curse's ability triggers only once, no matter how many creatures are attacking");
 *   · the house AI casts the Curse on the opponent it swings at (opponentAI's defender order: the lowest life, then the fewest
 *     untapped creatures) — never on itself.
 * The Gold token was already registered (effects/atoms/tokens.NAMED_TOKENS); it is witnessed here sacrificing for one mana of
 * any colour, both by hand and in a cast's payment.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Every runtime case runs through the engine's own entry points: legalActionsForPlayer + dispatchAction declare
 * attackers and cast spells, passPriority walks the table (the first pass of the declare attackers step closes the
 * declaration and fires the attack triggers; a full lap of passes resolves the top of the stack).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { playerAuraEffect } from "./playerAuraEffect.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const OPULENCE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const VERBOSITY = {"name":"Curse of Verbosity","type":"Enchantment — Aura Curse","mana":"{2}{U}","cmc":3,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant player\nWhenever enchanted player is attacked, you draw a card. Each opponent attacking that player does the same."}; // body-only
const DISTURBANCE = {"name":"Curse of Disturbance","type":"Enchantment — Aura Curse","mana":"{2}{B}","cmc":3,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a 2/2 black Zombie creature token. Each opponent attacking that player does the same."}; // body-only
const VITALITY = {"name":"Curse of Vitality","type":"Enchantment — Aura Curse","mana":"{2}{W}","cmc":3,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant player\nWhenever enchanted player is attacked, you gain 2 life. Each opponent attacking that player does the same."}; // body-only
const BOUNTY = {"name":"Curse of Bounty","type":"Enchantment — Aura Curse","mana":"{1}{G}","cmc":2,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant player\nWhenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control."}; // body-only
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const curseOn = (id, card, controller, enchantedPlayerId) => P(id, card, controller, { enchantedPlayerId });
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** A four-seat pod (user → ai1 → ai2 → ai3), every library stocked; the table opens at `phase`/`step` of `active`. */
function table({ active = "ai1", phase = "combat", step = "declare-attackers", boards = {}, hands = {}, life = {}, turn = 5 } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: hands[pid] || [], library: library(pid), ...(life[pid] != null ? { life: life[pid] } : {}) };
  }
  return { ...s0, players, turn, phase, step, activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}

const act = (s, pid, pred) => {
  const a = legalActionsForPlayer(s, pid).find(pred);
  if (!a) throw new Error(`no matching action for ${pid}`);
  return dispatchAction(s, a);
};
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
/** Declare each [attackerId, defenderId, planeswalkerId?] for the active player, then pass once (closes the declaration). */
function declare(s, picks) {
  const attacker = s.activePlayer;
  for (const [id, def, pw = null] of picks) {
    s = act(s, attacker, (a) => a.kind === "declare-attacker" && a.permanentId === id && (a.defenderId ?? def) === def && (a.defenderPlaneswalkerId ?? null) === pw);
  }
  s = passPriority(s);
  return { s, fired: s.stack.filter((o) => o.kind === "triggered-ability").map((o) => o.source?.name ?? null) };
}
const golds = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.name === "Gold").length;
const goldsAll = (s) => Object.fromEntries(Object.keys(s.players).map((pid) => [pid, golds(s, pid)]));
const bears = (pid, n) => Array.from({ length: n }, (_, i) => P(`${pid}-bear${i}`, BEARS, pid));

describe("classification", () => {
  it("the four Curses printed with \"Each opponent attacking that player does the same\" classify native-aura", () => {
    expect([OPULENCE, VERBOSITY, DISTURBANCE, VITALITY].map((c) => classifyCard(c))).toEqual(["native-aura", "native-aura", "native-aura", "native-aura"]);
  });

  it("the trigger is the enchanted-player-attacked event", () => {
    expect(detectTriggers(OPULENCE)[0]).toMatchObject({ event: "enchantedPlayerAttacked", scope: "enchantedPlayer" });
  });

  it("CREED — Curse of Bounty (its second sentence is a different effect) stays body-only", () => {
    expect(classifyCard(BOUNTY)).toBe("body-only");
  });

  it("CREED — \"that player\" is the enchanted, attacked player: off any other event, or on a spell, the sentence is not native", () => {
    // SYNTHETIC wordings: no printed card carries the sentence anywhere but the four Curses. Off the enchanted-player-attacked
    // event nothing names "that player", so the opponents' half would silently never happen.
    const attackTrigger = detectTriggers({ ...BEARS, oracle: "Whenever this creature attacks, create a Gold token. Each opponent attacking that player does the same." })[0];
    expect(attackTrigger?.event).toBe("attacks");
    expect(triggerRoutesNatively(attackTrigger)).toBe(false);
    expect(classifyCard({ name: "Probe Sorcery", type: "Sorcery", mana: "{R}", cmc: 1, keywords: [], colors: ["R"], oracle: "Create a Gold token. Each opponent attacking that player does the same." })).toBe("arbiter-spell");
  });
});

describe("RUNTIME — whenever enchanted player is attacked", () => {
  // The user's Curse of Opulence enchants ai2. ai1 is the active player.
  const pod = (over = {}) => table({ boards: { user: [curseOn("curse", OPULENCE, "user", "ai2")], ai1: bears("ai1", 2), ...(over.boards || {}) }, ...over });

  it("⭐ ai1 attacks ai2 with two creatures: ONE trigger — the Curse's controller and the attacking opponent each create ONE Gold", () => {
    const { s, fired } = declare(pod(), [["ai1-bear0", "ai2"], ["ai1-bear1", "ai2"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 1, ai2: 0, ai3: 0 });
  });

  it("an attack on another player gives none", () => {
    const { s, fired } = declare(pod(), [["ai1-bear0", "ai3"], ["ai1-bear1", "ai3"]]);
    expect(fired).toEqual([]);
    expect(goldsAll(resolveStack(s))).toEqual({ user: 0, ai1: 0, ai2: 0, ai3: 0 });
  });

  it("one creature at ai2 and one at ai3: still exactly one trigger, one Gold each for the controller and the attacker", () => {
    const { s, fired } = declare(pod(), [["ai1-bear0", "ai2"], ["ai1-bear1", "ai3"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 1, ai2: 0, ai3: 0 });
  });

  it("⭐ the Curse's controller attacks the enchanted player with two creatures: ONE Gold, for the controller only (it is no opponent of itself)", () => {
    const s0 = table({ active: "user", boards: { user: [curseOn("curse", OPULENCE, "user", "ai2"), ...bears("user", 2)] } });
    const { s, fired } = declare(s0, [["user-bear0", "ai2"], ["user-bear1", "ai2"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 0, ai2: 0, ai3: 0 });
  });

  it("only a planeswalker of the enchanted player attacked: no trigger (the bundled ruling)", () => {
    const s0 = pod({ boards: { user: [curseOn("curse", OPULENCE, "user", "ai2")], ai1: bears("ai1", 1), ai2: [P("jace", JACE, "ai2", { counters: { loyalty: 3 } })] } });
    const { s, fired } = declare(s0, [["ai1-bear0", "ai2", "jace"]]);
    expect(fired).toEqual([]);
    expect(goldsAll(resolveStack(s))).toEqual({ user: 0, ai1: 0, ai2: 0, ai3: 0 });
  });

  it("no creature still attacking the enchanted player as it resolves: only the Curse's controller creates a Gold (the bundled ruling)", () => {
    let { s, fired } = declare(pod(), [["ai1-bear0", "ai2"], ["ai1-bear1", "ai2"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "ai1-bear0" });
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "ai1-bear1" });
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 0, ai2: 0, ai3: 0 });
  });

  it("ai1's creature attacking ai2 leaves combat, its other one still attacks ai3: ai1 is not attacking THAT player — only the controller", () => {
    let { s, fired } = declare(pod(), [["ai1-bear0", "ai2"], ["ai1-bear1", "ai3"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "ai1-bear0" });
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 0, ai2: 0, ai3: 0 });
  });

  it("ai1's creature attacking ai2 leaves combat, its other one still attacks ai2's planeswalker: attacking a planeswalker is not attacking the player — only the controller", () => {
    const s0 = pod({ boards: { user: [curseOn("curse", OPULENCE, "user", "ai2")], ai1: bears("ai1", 2), ai2: [P("jace", JACE, "ai2", { counters: { loyalty: 3 } })] } });
    let { s, fired } = declare(s0, [["ai1-bear0", "ai2"], ["ai1-bear1", "ai2", "jace"]]);
    expect(fired).toEqual(["Curse of Opulence"]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "ai1-bear0" });
    expect(goldsAll(resolveStack(s))).toEqual({ user: 1, ai1: 0, ai2: 0, ai3: 0 });
  });
});

describe("RUNTIME — the Gold token sacrifices for one mana of any colour", () => {
  const withGold = () => {
    const { s } = declare(table({ boards: { user: [curseOn("curse", OPULENCE, "user", "ai2")], ai1: bears("ai1", 1) } }), [["ai1-bear0", "ai2"]]);
    const after = resolveStack(s);
    return { ...after, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", combat: { attackers: [], blockers: [] } };
  };

  it("by hand: the offered mana action sacrifices the Gold and adds the chosen colour", () => {
    let s = withGold();
    expect(golds(s, "user")).toBe(1);
    const gold = s.players.user.battlefield.find((p) => p.card?.name === "Gold");
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === gold.id);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((a) => a.sacrifices)).toBe(true);
    const red = offers.find((a) => (a.color ?? a.colors?.[0]) === "R" || (a.colors || []).includes("R"));
    expect(red).toBeTruthy();
    s = dispatchAction(s, { ...red, ...(red.colors && red.colors.length > 1 ? { color: "R" } : {}) });
    expect(golds(s, "user")).toBe(0);
    expect(Object.values(s.players.user.manaPool).reduce((n, v) => n + (typeof v === "number" ? v : 0), 0)).toBe(1);
    expect(s.players.user.manaPool.R).toBe(1);
  });

  it("in a payment: with only the Gold, Lightning Bolt is castable and the Gold pays for it", () => {
    let s = withGold();
    expect(golds(s, "user")).toBe(1);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [{ ...BOLT, id: "bolt" }] } } };
    s = act(s, "user", (a) => a.kind === "cast-spell" && a.cardId === "bolt" && (a.targets || []).some((t) => t.id === "ai2"));
    expect(golds(s, "user")).toBe(0);
    s = resolveStack(s);
    expect(s.players.ai2.life).toBe(37);
  });
});

describe("RUNTIME — the three sibling Curses do the same for the attacking opponent", () => {
  const cases = [
    ["Curse of Verbosity — you draw a card", VERBOSITY, (s, pid) => s.players[pid].hand.length, { user: 1, ai1: 1, ai2: 0, ai3: 0 }],
    ["Curse of Disturbance — a 2/2 black Zombie", DISTURBANCE, (s, pid) => s.players[pid].battlefield.filter((p) => /Zombie/.test(p.card?.type || "") && p.card?.token).length, { user: 1, ai1: 1, ai2: 0, ai3: 0 }],
    ["Curse of Vitality — you gain 2 life", VITALITY, (s, pid) => s.players[pid].life - 40, { user: 2, ai1: 2, ai2: 0, ai3: 0 }],
  ];
  for (const [title, curse, read, expected] of cases) {
    it(`${title}: the controller and the attacking opponent, nobody else`, () => {
      const { s, fired } = declare(table({ boards: { user: [curseOn("curse", curse, "user", "ai2")], ai1: bears("ai1", 2) } }), [["ai1-bear0", "ai2"], ["ai1-bear1", "ai2"]]);
      expect(fired).toEqual([curse.name]);
      const after = resolveStack(s);
      expect(Object.fromEntries(Object.keys(after.players).map((pid) => [pid, read(after, pid)]))).toEqual(expected);
    });
  }
});

describe("the house AI casts the Curse on the opponent it swings at", () => {
  const aiPick = (s, seat) => {
    const pick = pickAction(s, seat, legalActionsForPlayer(s, seat), { archetype: "midrange" });
    return pick?.kind === "cast-spell" && pick.cardId === "curse-card" ? (pick.targets?.[0]?.id ?? "untargeted") : "held";
  };
  const aiMain = (life, boards = {}) => {
    const s = table({ active: "ai1", phase: "precombat-main", step: "main", hands: { ai1: [{ ...OPULENCE, id: "curse-card" }] }, life, boards });
    return { ...s, players: { ...s.players, ai1: { ...s.players.ai1, manaPool: { ...s.players.ai1.manaPool, R: 1 } } } };
  };

  it("the curse reading puts it on an opponent", () => {
    expect(playerAuraEffect(OPULENCE)?.side).toBe("enemy");
  });

  it("⭐ the lowest-life opponent — never itself", () => {
    expect(aiPick(aiMain({ user: 40, ai2: 22, ai3: 31 }), "ai1")).toBe("ai2");
  });

  it("at equal life, the opponent with the fewest untapped creatures", () => {
    expect(aiPick(aiMain({ user: 30, ai2: 30, ai3: 30 }, { user: bears("user", 1), ai2: bears("ai2", 3), ai3: [] }), "ai1")).toBe("ai3");
  });
});
