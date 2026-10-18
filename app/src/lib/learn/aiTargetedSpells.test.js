/**
 * aiTargetedSpells.test.js — the AI casts the targeted spells its generic chooser could not score (2026-10-18).
 *
 * The gap: chooseDisciplinedVariant's generic targeted arm scores only a LEGACY single effect — damage, or destroy of a creature —
 * through spellEffects.chooseAITarget, and holds every other targeted spell. Measured over the 80-game A/B batch on e194ffb9:
 * Swords to Plowshares offered in 2,278 AI decisions, Path to Exile 1,571, Generous Gift 1,020, Tamiyo's Safekeeping 1,273,
 * Tyvar's Stand 1,129, Ephemerate 377, Leap 312 — every one cast 0 times; of the creature-removal kind only the legacy destroys
 * (Pongify, Snuff Out, Damn) were ever cast.
 *
 * The policy, an AI choice among offered casts (the offer and the resolution are unchanged), for a program with ONE targeted atom
 * whose other atoms are gains, same-target riders or a life cost the AI can afford:
 *   · REMOVAL — destroy / exile / tuck of an opponent's nonland permanent, or a -N/-N that kills an opponent's creature: the
 *     biggest threat first (power, then permanentValue — the activation picker's reader), only a target worth a card, never an
 *     indestructible target for destroy, never one a compensating token outweighs;
 *   · PUMP / GRANT on its own creature only — in response to an opponent's removal it defeats (hexproof, indestructible against a
 *     destroy or damage, toughness against damage or a -N/-N); as a blocker's or attacker's trick when it changes the duel (its
 *     creature survives and the enemy dies, or its creature is saved); in its own precombat main, a pump that makes the swing
 *     lethal, flying / "can't be blocked" for a ready attacker the defender could block, haste for a summoning-sick creature;
 *   · TOKEN COPY of the best creature or permanent it may copy (never its own legendary one, never one whose enters trigger would
 *     remove its own permanent), in its own main phase;
 *   · BLINK of its own nontoken permanent — in response to an opponent's removal aimed at it, or in its own main phase for an
 *     enters trigger worth re-buying (postcombat, or precombat when it would not attack anyway).
 * Never a harmful effect on its own side.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, colors, keywords, oracle, extra = {}) => ({ name, type, mana, cmc, colors, keywords, oracle, ...extra });
const creature = (name, type, mana, cmc, power, toughness, colors, keywords, oracle) => card(name, type, mana, cmc, colors, keywords, oracle, { power, toughness });

// ── spells ──
const SWORDS = card("Swords to Plowshares", "Instant", "{W}", 1, ["W"], [], "Exile target creature. Its controller gains life equal to its power.");
const NATURES_CLAIM = card("Nature's Claim", "Instant", "{G}", 1, ["G"], [], "Destroy target artifact or enchantment. Its controller gains 4 life.");
const VINDICATE = card("Vindicate", "Sorcery", "{1}{W}{B}", 3, ["B", "W"], [], "Destroy target permanent.");
const BEAST_WITHIN = card("Beast Within", "Instant", "{2}{G}", 3, ["G"], [], "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.");
const ANGUISHED = card("Anguished Unmaking", "Instant", "{1}{W}{B}", 3, ["B", "W"], [], "Exile target nonland permanent. You lose 3 life.");
const DISMEMBER = card("Dismember", "Instant", "{1}{B/P}{B/P}", 3, ["B"], [], "({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.");
const DOOM_BLADE = card("Doom Blade", "Instant", "{1}{B}", 2, ["B"], [], "Destroy target nonblack creature.");
const BEDEVIL = card("Bedevil", "Instant", "{B}{B}{R}", 3, ["B", "R"], [], "Destroy target artifact, creature, or planeswalker.");
const GIANT_GROWTH = card("Giant Growth", "Instant", "{G}", 1, ["G"], [], "Target creature gets +3/+3 until end of turn.");
const LEAP = card("Leap", "Instant", "{U}", 1, ["U"], [], "Target creature gains flying until end of turn.\nDraw a card.");
const EXPEDITE = card("Expedite", "Instant", "{R}", 1, ["R"], [], "Target creature gains haste until end of turn.\nDraw a card.");
const SAFEKEEPING = card("Tamiyo's Safekeeping", "Instant", "{G}", 1, ["G"], [],
  "Target permanent you control gains hexproof and indestructible until end of turn. You gain 2 life. (A permanent with hexproof and indestructible can't be the target of spells or abilities your opponents control. Damage and effects that say \"destroy\" don't destroy it.)");
const SHIELDS = card("Ephemeral Shields", "Instant", "{1}{W}", 2, ["W"], ["Convoke"],
  "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nTarget creature gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)");
const COUNTERPART = card("Cackling Counterpart", "Instant", "{1}{U}{U}", 3, ["U"], ["Flashback"],
  "Create a token that's a copy of target creature you control.\nFlashback {5}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)");
const PHOTOGRAPHY = card("Flash Photography", "Sorcery", "{2}{U}{U}", 4, ["U"], ["Flashback"],
  "You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U}");
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, ["U"], [], "Return target creature to its owner's hand.");
const CLOUDSHIFT = card("Cloudshift", "Instant", "{W}", 1, ["W"], [], "Exile target creature you control, then return that card to the battlefield under your control.");
const EPHEMERATE = card("Ephemerate", "Instant", "{W}", 1, ["W"], ["Rebound"],
  "Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)");

// ── permanents ──
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, [], [], "{T}: Add {C}{C}.");
const TITHE = card("Smothering Tithe", "Enchantment", "{3}{W}", 4, ["W"], ["Treasure"],
  "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")");
const MIND_STONE = card("Mind Stone", "Artifact", "{2}", 2, [], [], "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.");
const SIGNET = card("Arcane Signet", "Artifact", "{2}", 2, [], [], "{T}: Add one mana of any color in your commander's color identity.");
const INGOT = card("Darksteel Ingot", "Artifact", "{3}", 3, [], ["Indestructible"], "Indestructible (Effects that say \"destroy\" don't destroy this artifact.)\n{T}: Add one mana of any color.");
const BEARS = creature("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "2", "2", ["G"], [], "");
const HILL_GIANT = creature("Hill Giant", "Creature — Giant", "{3}{R}", 4, "3", "3", ["R"], [], "");
const DREADMAW = creature("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", 6, "6", "6", ["G"], ["Trample"], "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)");
const CRAW_WURM = creature("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", 6, "6", "4", ["G"], [], "");
const SPIDER = creature("Giant Spider", "Creature — Spider", "{3}{G}", 4, "2", "4", ["G"], ["Reach"], "Reach (This creature can block creatures with flying.)");
const ELVES = creature("Llanowar Elves", "Creature — Elf Druid", "{G}", 1, "1", "1", ["G"], [], "{T}: Add {G}.");
const GHALTA = creature("Ghalta, Primal Hunger", "Legendary Creature — Elder Dinosaur", "{10}{G}{G}", 12, "12", "12", ["G"], ["Trample"],
  "This spell costs {X} less to cast, where X is the total power of creatures you control.\nTrample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)");
const VISIONARY = creature("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", 2, "1", "1", ["G"], [], "When this creature enters, draw a card.");
const SOLDIER_TOKEN = { ...creature("Soldier", "Token Creature — Soldier", "", 0, "1", "1", ["W"], [], ""), token: true };
const basic = (name, c) => card(name, `Basic Land — ${name}`, "", 0, [], [], `({T}: Add {${c}}.)`);
const FOREST = basic("Forest", "G");
const LANDS = [["Plains", "W"], ["Island", "U"], ["Swamp", "B"], ["Mountain", "R"], ["Forest", "G"]];
const manaBase = (prefix) => LANDS.flatMap(([n, c]) => [0, 1].map((i) => [`${prefix}${n}${i}`, basic(n, c)]));

/**
 * A two-seat board. `ai` / `user` = [[permId, card, opts]] (untapped, not summoning-sick unless opts say so), each seat also gets
 * two of each basic land. `hand` / `userHand` = [[cardId, card]]. The AI's precombat main with priority unless overridden.
 */
function table({ ai = [], user = [], hand = [], userHand = [], phase = "precombat-main", step = "main", active = "ai", priority = null, life = 40, userLife = 40, combat = null } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => {
    const p = createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } });
    return { ...p, counters: { ...(o.counters || {}) }, ...(o.damageMarked ? { damageMarked: o.damageMarked } : {}) };
  };
  const cards = (list) => list.map(([id, c]) => ({ ...c, id }));
  return { ...s0, turn: 6, phase, step, activePlayer: active, priorityHolder: priority || active, consecutivePasses: 0, stack: [],
    combat: combat || { attackers: [], blockers: [] },
    players: { ...s0.players,
      ai: { ...s0.players.ai, life, landsPlayedThisTurn: 1, battlefield: [...manaBase("ai"), ...ai].map(P("ai")), hand: cards(hand) },
      user: { ...s0.players.user, life: userLife, landsPlayedThisTurn: 1, battlefield: [...manaBase("u"), ...user].map(P("user")), hand: cards(userHand) } } };
}
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
const castOf = (a, cardId) => (a?.kind === "cast-spell" && a.cardId === cardId ? a : null);
const targetIds = (a) => (a?.targets || []).map((t) => t.id).sort();
const castOffers = (s, cardId) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
const onBattlefield = (s, pid, name) => (s.players[pid].battlefield || []).filter((p) => p.card?.name === name).length;
/** The user casts `cardId` at the AI's permanent `targetId` and passes; the AI holds priority with the spell on the stack. */
function userCastsAt(s, cardId, targetId) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === targetId);
  expect(cast, `the user's ${cardId} is offered at ${targetId}`).toBeTruthy();
  const after = passPriority(dispatchAction(s, cast));
  expect(after.priorityHolder).toBe("ai");
  expect(after.stack.length).toBe(1);
  return after;
}

describe("removal of an opponent's permanent", () => {
  it("⭐ Nature's Claim destroys the opponent's Smothering Tithe, not their Sol Ring, never the AI's own Arcane Signet", () => {
    const s = table({ ai: [["signet", SIGNET]], user: [["ring", SOL_RING], ["tithe", TITHE]], hand: [["claim", NATURES_CLAIM]] });
    expect(castOffers(s, "claim").map((a) => a.targets[0].id)).toEqual(expect.arrayContaining(["signet", "ring", "tithe"]));
    const a = castOf(aiPick(s), "claim");
    expect(a).toBeTruthy();
    expect(targetIds(a)).toEqual(["tithe"]);
  });

  it("⭐ Swords to Plowshares exiles the opponent's biggest creature (Colossal Dreadmaw), not their Grizzly Bears, never its own Craw Wurm", () => {
    const s = table({ ai: [["wurm", CRAW_WURM]], user: [["bear", BEARS], ["maw", DREADMAW]], hand: [["stp", SWORDS]] });
    const a = castOf(aiPick(s), "stp");
    expect(a).toBeTruthy();
    expect(targetIds(a)).toEqual(["maw"]);
    const after = resolveStack(dispatchAction(s, a));
    expect(onBattlefield(after, "user", "Colossal Dreadmaw")).toBe(0);
    expect(onBattlefield(after, "ai", "Craw Wurm")).toBe(1);
  });

  it("⭐ removal at instant speed on the opponent's turn: Swords to Plowshares at the opponent's Dreadmaw while the AI holds priority", () => {
    const s = table({ user: [["maw", DREADMAW]], hand: [["stp", SWORDS]], active: "user", priority: "ai" });
    expect(targetIds(castOf(aiPick(s), "stp"))).toEqual(["maw"]);
  });

  it("on its own turn removal waits for its main phase: Swords to Plowshares is held in its upkeep", () => {
    const s = table({ user: [["maw", DREADMAW]], hand: [["stp", SWORDS]], phase: "beginning", step: "upkeep" });
    expect(castOffers(s, "stp").map((a) => a.targets[0].id)).toEqual(["maw"]);
    expect(castOf(aiPick(s), "stp")).toBeNull();
  });

  it("Swords to Plowshares is held when the only creatures are the AI's own", () => {
    const s = table({ ai: [["wurm", CRAW_WURM], ["bear", BEARS]], hand: [["stp", SWORDS]] });
    expect(castOffers(s, "stp").length).toBe(2);
    expect(castOf(aiPick(s), "stp")).toBeNull();
  });

  it("⭐ Vindicate destroys the opponent's Sol Ring, never a land", () => {
    const s = table({ user: [["forest", FOREST], ["ring", SOL_RING]], hand: [["vind", VINDICATE]] });
    expect(targetIds(castOf(aiPick(s), "vind"))).toEqual(["ring"]);
  });

  it("Vindicate is held when the opponent has only lands and a 1/1 Soldier token (nothing worth the card)", () => {
    const s = table({ user: [["forest", FOREST], ["tok", SOLDIER_TOKEN]], hand: [["vind", VINDICATE]] });
    expect(castOffers(s, "vind").some((a) => a.targets[0].id === "tok")).toBe(true);
    expect(castOf(aiPick(s), "vind")).toBeNull();
  });

  it("⭐ Beast Within destroys the opponent's Colossal Dreadmaw (a 6/6 for a 3/3)", () => {
    const s = table({ user: [["maw", DREADMAW]], hand: [["bw", BEAST_WITHIN]] });
    expect(targetIds(castOf(aiPick(s), "bw"))).toEqual(["maw"]);
  });

  it("Beast Within is held against a lone Grizzly Bears (a 2/2 traded for their 3/3 token)", () => {
    const s = table({ user: [["bear", BEARS]], hand: [["bw", BEAST_WITHIN]] });
    expect(castOffers(s, "bw").some((a) => a.targets[0].id === "bear")).toBe(true);
    expect(castOf(aiPick(s), "bw")).toBeNull();
  });

  it("⭐ Beast Within destroys the opponent's Smothering Tithe, never their Mind Stone alone (a mana rock is not worth their 3/3)", () => {
    const tithe = table({ user: [["stone", MIND_STONE], ["tithe", TITHE]], hand: [["bw", BEAST_WITHIN]] });
    expect(targetIds(castOf(aiPick(tithe), "bw"))).toEqual(["tithe"]);
    const stone = table({ user: [["stone", MIND_STONE]], hand: [["bw", BEAST_WITHIN]] });
    expect(castOffers(stone, "bw").some((a) => a.targets[0].id === "stone")).toBe(true);
    expect(castOf(aiPick(stone), "bw")).toBeNull();
  });

  it("⭐ Anguished Unmaking exiles the opponent's Smothering Tithe at 40 life", () => {
    const s = table({ user: [["tithe", TITHE]], hand: [["au", ANGUISHED]] });
    expect(targetIds(castOf(aiPick(s), "au"))).toEqual(["tithe"]);
  });

  it("Anguished Unmaking is held at 12 life (its 3 life would leave the AI under the life floor)", () => {
    const s = table({ user: [["tithe", TITHE]], hand: [["au", ANGUISHED]], life: 12 });
    expect(castOffers(s, "au").length).toBeGreaterThan(0);
    expect(castOf(aiPick(s), "au")).toBeNull();
  });

  it("⭐ Dismember (-5/-5) kills the opponent's Hill Giant, never its own Grizzly Bears", () => {
    const s = table({ ai: [["bear", BEARS]], user: [["giant", HILL_GIANT]], hand: [["dis", DISMEMBER]] });
    expect(targetIds(castOf(aiPick(s), "dis"))).toEqual(["giant"]);
  });

  it("Dismember is held when the only opposing creature survives it (a 6/6 Dreadmaw)", () => {
    const s = table({ user: [["maw", DREADMAW]], hand: [["dis", DISMEMBER]] });
    expect(castOf(aiPick(s), "dis")).toBeNull();
  });

  it("⭐ Bedevil skips the opponent's indestructible Darksteel Ingot and destroys their Sol Ring", () => {
    const s = table({ user: [["ingot", INGOT], ["ring", SOL_RING]], hand: [["bed", BEDEVIL]] });
    expect(castOffers(s, "bed").map((a) => a.targets[0].id)).toEqual(expect.arrayContaining(["ingot", "ring"]));
    expect(targetIds(castOf(aiPick(s), "bed"))).toEqual(["ring"]);
  });

  it("Doom Blade (the legacy destroy path) still kills the opponent's creature", () => {
    const s = table({ ai: [["mybear", BEARS]], user: [["giant", HILL_GIANT]], hand: [["db", DOOM_BLADE]] });
    expect(targetIds(castOf(aiPick(s), "db"))).toEqual(["giant"]);
  });
});

describe("pumps and grants on its own creature", () => {
  const blockCombat = (attackerId, blockerId) => ({ attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId, blockingPlayer: "ai", attackerId }] });

  it("⭐ a blocker's trick: its Grizzly Bears blocking the opponent's Hill Giant gets Giant Growth (the Bears live, the Giant dies)", () => {
    const s = table({ ai: [["bear", BEARS]], user: [["giant", HILL_GIANT, { tapped: true }]], hand: [["gg", GIANT_GROWTH]],
      phase: "combat", step: "declare-blockers", active: "user", priority: "ai", combat: blockCombat("giant", "bear") });
    expect(castOffers(s, "gg").map((a) => a.targets[0].id).sort()).toEqual(["bear", "giant"]);
    expect(targetIds(castOf(aiPick(s), "gg"))).toEqual(["bear"]);
  });

  it("no trick when the block already wins (its Bears blocking Llanowar Elves)", () => {
    const s = table({ ai: [["bear", BEARS]], user: [["elf", ELVES, { tapped: true }]], hand: [["gg", GIANT_GROWTH]],
      phase: "combat", step: "declare-blockers", active: "user", priority: "ai", combat: blockCombat("elf", "bear") });
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("no trick for a 1/1 token: its Soldier token blocking their Soldier token (neither is worth a card)", () => {
    const s = table({ ai: [["tok", SOLDIER_TOKEN]], user: [["utok", SOLDIER_TOKEN, { tapped: true }]], hand: [["gg", GIANT_GROWTH]],
      phase: "combat", step: "declare-blockers", active: "user", priority: "ai", combat: blockCombat("utok", "tok") });
    expect(castOffers(s, "gg").map((a) => a.targets[0].id).sort()).toEqual(["tok", "utok"]);
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("no trick that only trades: its Bears blocking a Craw Wurm (6/4) — +3/+3 kills the Wurm, but the Bears still die", () => {
    const s = table({ ai: [["bear", BEARS]], user: [["wurm", CRAW_WURM, { tapped: true }]], hand: [["gg", GIANT_GROWTH]],
      phase: "combat", step: "declare-blockers", active: "user", priority: "ai", combat: blockCombat("wurm", "bear") });
    expect(castOffers(s, "gg").map((a) => a.targets[0].id).sort()).toEqual(["bear", "wurm"]);
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("never pumps the opponent's attacker: its only creature in combat is theirs, unblocked", () => {
    const s = table({ user: [["giant", HILL_GIANT, { tapped: true }]], hand: [["gg", GIANT_GROWTH]],
      phase: "combat", step: "declare-blockers", active: "user", priority: "ai",
      combat: { attackers: [{ permanentId: "giant", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("⭐ Leap gives its ready Craw Wurm flying in the precombat main when the defender's only blocker is on the ground", () => {
    const s = table({ ai: [["wurm", CRAW_WURM]], user: [["bear", BEARS]], hand: [["leap", LEAP]] });
    expect(targetIds(castOf(aiPick(s), "leap"))).toEqual(["wurm"]);
  });

  it("Leap is held when the defender has a reach blocker (Giant Spider) that could still block", () => {
    const s = table({ ai: [["wurm", CRAW_WURM]], user: [["spider", SPIDER]], hand: [["leap", LEAP]] });
    expect(castOf(aiPick(s), "leap")).toBeNull();
  });

  it("⭐ Giant Growth in the precombat main makes the swing lethal: its ready Bears (2) into an empty board at 4 life", () => {
    const s = table({ ai: [["bear", BEARS]], hand: [["gg", GIANT_GROWTH]], userLife: 4 });
    expect(targetIds(castOf(aiPick(s), "gg"))).toEqual(["bear"]);
  });

  it("Giant Growth is held when the swing is lethal already (the opponent at 2)", () => {
    const s = table({ ai: [["bear", BEARS]], hand: [["gg", GIANT_GROWTH]], userLife: 2 });
    expect(castOf(aiPick(s), "gg")).toBeNull();
  });

  it("⭐ Expedite gives its summoning-sick Hill Giant haste in the precombat main", () => {
    const s = table({ ai: [["giant", HILL_GIANT, { sick: true }]], hand: [["exp", EXPEDITE]] });
    expect(targetIds(castOf(aiPick(s), "exp"))).toEqual(["giant"]);
  });

  it("Expedite never hastes the opponent's summoning-sick Hill Giant", () => {
    const s = table({ user: [["giant", HILL_GIANT, { sick: true }]], hand: [["exp", EXPEDITE]] });
    expect(castOffers(s, "exp").map((a) => a.targets[0].id)).toEqual(["giant"]);
    expect(castOf(aiPick(s), "exp")).toBeNull();
  });

  it("⭐ a save: Tamiyo's Safekeeping answers the opponent's Doom Blade on its Dreadmaw, and the Dreadmaw stays", () => {
    let s = table({ ai: [["maw", DREADMAW]], hand: [["safe", SAFEKEEPING]], userHand: [["db", DOOM_BLADE]], active: "user" });
    s = userCastsAt(s, "db", "maw");
    const a = castOf(aiPick(s), "safe");
    expect(targetIds(a)).toEqual(["maw"]);
    const after = resolveStack(dispatchAction(s, a));
    expect(onBattlefield(after, "ai", "Colossal Dreadmaw")).toBe(1);
    expect((after.players.user.graveyard || []).map((c) => c.name)).toContain("Doom Blade");
  });

  it("⭐ a save: Ephemeral Shields (indestructible) answers a Doom Blade", () => {
    let s = table({ ai: [["maw", DREADMAW]], hand: [["sh", SHIELDS]], userHand: [["db", DOOM_BLADE]], active: "user" });
    s = userCastsAt(s, "db", "maw");
    const a = castOf(aiPick(s), "sh");
    expect(targetIds(a)).toEqual(["maw"]);
    expect(onBattlefield(resolveStack(dispatchAction(s, a)), "ai", "Colossal Dreadmaw")).toBe(1);
  });

  it("Ephemeral Shields is held against Swords to Plowshares (indestructible does not stop an exile)", () => {
    let s = table({ ai: [["maw", DREADMAW]], hand: [["sh", SHIELDS]], userHand: [["stp", SWORDS]], active: "user" });
    s = userCastsAt(s, "stp", "maw");
    expect(castOf(aiPick(s), "sh")).toBeNull();
  });
});

describe("token copies", () => {
  it("⭐ Cackling Counterpart copies its Colossal Dreadmaw, not its Grizzly Bears", () => {
    const s = table({ ai: [["bear", BEARS], ["maw", DREADMAW]], hand: [["cc", COUNTERPART]] });
    expect(targetIds(castOf(aiPick(s), "cc"))).toEqual(["maw"]);
  });

  it("⭐ Cackling Counterpart copies its Grizzly Bears, never its own legendary Ghalta (the copy would fall to the legend rule)", () => {
    const s = table({ ai: [["bear", BEARS], ["ghalta", GHALTA]], hand: [["cc", COUNTERPART]] });
    expect(castOffers(s, "cc").map((a) => a.targets[0].id).sort()).toEqual(["bear", "ghalta"]);
    expect(targetIds(castOf(aiPick(s), "cc"))).toEqual(["bear"]);
  });

  it("Cackling Counterpart is held when its only creature is legendary", () => {
    const s = table({ ai: [["ghalta", GHALTA]], hand: [["cc", COUNTERPART]] });
    expect(castOffers(s, "cc").length).toBe(1);
    expect(castOf(aiPick(s), "cc")).toBeNull();
  });

  it("⭐ Flash Photography copies the opponent's Colossal Dreadmaw over its own Grizzly Bears", () => {
    const s = table({ ai: [["bear", BEARS]], user: [["maw", DREADMAW]], hand: [["fp", PHOTOGRAPHY]] });
    expect(targetIds(castOf(aiPick(s), "fp"))).toEqual(["maw"]);
  });
});

describe("blinks", () => {
  it("⭐ Cloudshift saves its Craw Wurm from the opponent's Swords to Plowshares", () => {
    let s = table({ ai: [["wurm", CRAW_WURM]], hand: [["cs", CLOUDSHIFT]], userHand: [["stp", SWORDS]], active: "user" });
    s = userCastsAt(s, "stp", "wurm");
    const a = castOf(aiPick(s), "cs");
    expect(targetIds(a)).toEqual(["wurm"]);
    const after = resolveStack(dispatchAction(s, a));
    expect(onBattlefield(after, "ai", "Craw Wurm")).toBe(1);
  });

  it("⭐ Cloudshift answers the opponent's Unsummon on its Craw Wurm (a bounce is a harm whatever side its atom reads)", () => {
    let s = table({ ai: [["wurm", CRAW_WURM]], hand: [["cs", CLOUDSHIFT]], userHand: [["uns", UNSUMMON]], active: "user" });
    s = userCastsAt(s, "uns", "wurm");
    const a = castOf(aiPick(s), "cs");
    expect(targetIds(a)).toEqual(["wurm"]);
    expect(onBattlefield(resolveStack(dispatchAction(s, a)), "ai", "Craw Wurm")).toBe(1);
  });

  it("⭐ Ephemerate re-buys Elvish Visionary's draw in the postcombat main", () => {
    const s = table({ ai: [["vis", VISIONARY]], hand: [["eph", EPHEMERATE]], phase: "postcombat-main" });
    expect(targetIds(castOf(aiPick(s), "eph"))).toEqual(["vis"]);
  });

  it("no blink of a creature with no enters trigger (Grizzly Bears) in the postcombat main", () => {
    const s = table({ ai: [["bear", BEARS]], hand: [["eph", EPHEMERATE]], phase: "postcombat-main" });
    expect(castOffers(s, "eph").length).toBe(1);
    expect(castOf(aiPick(s), "eph")).toBeNull();
  });

  it("no precombat blink of a ready attacker (it would return summoning-sick)", () => {
    const s = table({ ai: [["vis", VISIONARY]], hand: [["eph", EPHEMERATE]] });
    expect(castOf(aiPick(s), "eph")).toBeNull();
  });
});

describe("the policy seam", () => {
  it("⭐ `spellTarget` is a policy key, and 'v1' recovers the old hold", () => {
    expect(POLICY_KEYS).toContain("spellTarget");
    const s = table({ user: [["maw", DREADMAW]], hand: [["stp", SWORDS]] });
    expect(castOf(aiPick(s, { policy: { spellTarget: "v1" } }), "stp")).toBeNull();
    expect(targetIds(castOf(aiPick(s), "stp"))).toEqual(["maw"]);
  });
});
