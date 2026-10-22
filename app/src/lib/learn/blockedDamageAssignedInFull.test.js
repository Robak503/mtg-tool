/**
 * A BLOCKED CREATURE ASSIGNS ALL ITS COMBAT DAMAGE (CR 510.1c — "If exactly one creature is blocking it, it assigns all its
 * combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures
 * divided as its controller chooses among them."). Until now combatResolution's blocked arm gave each blocker exactly its lethal
 * share (remaining toughness, 1 with deathtouch — CR 702.2c) and dropped the rest unless the attacker had trample: a 5/5 lifelinker
 * blocked by a 2/2 gained 2. Vampiric Link's bundled ruling: "If you put this on a 5/5 and it is blocked by a 1/1, you still gain
 * 5 life." Every quantity read off the damage dealt was short — lifelink (CR 702.15b), "that much" dealt-by payoffs, the damage
 * marked on a blocker that survives it or reacts to it.
 *
 * Now the attacker's whole power is assigned among its live blockers: the lethal shares in declaration order as before, then the
 * rest to ONE blocker — the last in that order whose damage would not be prevented (protection, a Maze of Ith stamp, a shield
 * counter, a prevention wall), or the last blocker when every one of them would prevent it. Trample is unchanged (CR 702.19b: once
 * every blocker is assigned lethal damage, the excess goes to the player), and so is a blocker dividing its own damage among the
 * attackers it blocks (CR 510.1d — all of its remainder already went to the last one).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-21).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveCombatDamage } from "./combatResolution.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GARGANTUAN_LEECH = {"name":"Gargantuan Leech","type":"Creature — Leech","mana":"{7}{B}","cmc":8,"power":"5","toughness":"5","keywords":["Lifelink"],"colors":["B"],"oracle":"This spell costs {1} less to cast for each Cave you control and each Cave card in your graveyard.\nLifelink"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const DARKSTEEL_MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"};
const SPITEMARE = {"name":"Spitemare","type":"Creature — Elemental","mana":"{2}{R/W}{R/W}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R","W"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to any target."};
const BOROS_RECKONER = {"name":"Boros Reckoner","type":"Creature — Minotaur Wizard","mana":"{R/W}{R/W}{R/W}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R","W"],"oracle":"Whenever this creature is dealt damage, it deals that much damage to any target.\n{R/W}: This creature gains first strike until end of turn."};
const VALERON_OUTLANDER = {"name":"Valeron Outlander","type":"Creature — Human Scout","mana":"{G}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["G","W"],"oracle":"Protection from black"};
const MUGATO = {"name":"Mugato","type":"Creature — Ape Beast","mana":"{3}{G}{G}","cmc":5,"power":"6","toughness":"6","keywords":["Reach","Vigilance","Deathtouch"],"colors":["G"],"oracle":"Reach, vigilance, deathtouch"};
const VAMPIRIC_LINK = {"name":"Vampiric Link","type":"Enchantment — Aura","mana":"{B}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature\nWhenever enchanted creature deals damage, you gain that much life."};
const GIFTED_AETHERBORN = {"name":"Gifted Aetherborn","type":"Creature — Aetherborn Vampire","mana":"{B}{B}","cmc":2,"power":"2","toughness":"3","keywords":["Lifelink","Deathtouch"],"colors":["B"],"oracle":"Deathtouch, lifelink"};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const FLEETFOOT_DANCER = {"name":"Fleetfoot Dancer","type":"Creature — Elf Druid","mana":"{1}{R}{G}{W}","cmc":4,"power":"4","toughness":"4","keywords":["Lifelink","Haste","Trample"],"colors":["G","R","W"],"oracle":"Trample, lifelink, haste"};
const EXALTED_ANGEL = {"name":"Exalted Angel","type":"Creature — Angel","mana":"{4}{W}{W}","cmc":6,"power":"4","toughness":"5","keywords":["Flying","Morph"],"colors":["W"],"oracle":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"};
const OLIVIAS_ATTENDANTS = {"name":"Olivia's Attendants","type":"Creature — Vampire","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"6","keywords":["Menace"],"colors":["R"],"oracle":"Menace\nWhenever this creature deals damage, create that many Blood tokens. (They're artifacts with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\n{2}{R}: This creature deals 1 damage to any target."};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const PALACE_GUARD = {"name":"Palace Guard","type":"Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"1","toughness":"4","keywords":[],"colors":["W"],"oracle":"This creature can block any number of creatures."};
const FURNACE_OF_RATH = {"name":"Furnace of Rath","type":"Enchantment","mana":"{1}{R}{R}{R}","cmc":4,"power":null,"toughness":null,"keywords":["Double"],"colors":["R"],"oracle":"If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead."};
const SUNBLADE_ANGEL = {"name":"Sunblade Angel","type":"Creature — Angel","mana":"{5}{W}","cmc":6,"power":"3","toughness":"3","keywords":["Flying","Lifelink","Vigilance","First strike"],"colors":["W"],"oracle":"Flying, first strike, vigilance, lifelink"};
const MARISIS_TWINCLAWS = {"name":"Marisi's Twinclaws","type":"Creature — Cat Warrior","mana":"{2}{R/W}{G}","cmc":4,"power":"2","toughness":"4","keywords":["Double strike"],"colors":["G","R","W"],"oracle":"Double strike"};
const KOR_FIREWALKER = {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["W"],"oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life."};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));

/** A two-seat game on the user's turn: the user's battlefield, the AI's battlefield, both at 20 life, both libraries stocked. */
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}
const withCombat = (s, attackers, blocks) => ({ ...s,
  combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })),
    blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, blockingPlayer: "ai", attackerId })) } });
/** The user's `attackers` attack the AI; `blocks` pairs [blocker, attacker] in declaration order. The regular damage step. */
const combat = (s, attackers, blocks = []) => resolveCombatDamage(withCombat(s, attackers, blocks));
/** Both damage steps — the first-strike step, then the regular step — on the same declared combat. */
const bothSteps = (s, attackers, blocks = []) => resolveCombatDamage(resolveCombatDamage(withCombat(s, attackers, blocks), { firstStrikeStep: true }));
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const perm = (s, id) => s.players.user.battlefield.concat(s.players.ai.battlefield).find((p) => p.id === id) ?? null;
const marked = (s, id) => perm(s, id)?.damageMarked || 0;
const alive = (s, id) => perm(s, id) !== null;
const life = (s) => ({ user: s.players.user.life, ai: s.players.ai.life });
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name).length;
const shield = (s, id) => perm(s, id)?.counters?.shield || 0;

describe("one blocker — it is assigned ALL the attacker's damage (CR 510.1c)", () => {
  it("⭐ a 5/5 lifelinker blocked by a 2/2 gains 5, and the 2/2 is dealt 5 (excess damage to the AI's creature, CR 120.4a)", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), ["leech"], [["bears", "leech"]]);
    expect({ life: life(out), bears: alive(out, "bears"), excess: out.excessDamageThisTurn?.controllers ?? [] })
      .toEqual({ life: { user: 25, ai: 20 }, bears: false, excess: ["ai"] });
  });
  it("⭐ an indestructible blocker is marked the whole 5 (Darksteel Myr, toughness 1)", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai")] }), ["leech"], [["myr", "leech"]]);
    expect({ myr: marked(out, "myr"), life: life(out) }).toEqual({ myr: 5, life: { user: 25, ai: 20 } });
  });
  it("⭐ a damage-reactive blocker is dealt the whole 5: Spitemare's and Boros Reckoner's triggers deal 5, not 3", () => {
    const reacts = (card) => {
      const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("blk", card, "ai")] }), ["leech"], [["blk", "leech"]]);
      return (out.pendingTriggers || []).filter((t) => t.event === "dealtDamage" && t.source?.permanentId === "blk").map((t) => t.context?.dealtDamageAmount);
    };
    expect({ spitemare: reacts(SPITEMARE), reckoner: reacts(BOROS_RECKONER) }).toEqual({ spitemare: [5], reckoner: [5] });
  });
  it("⭐ damage doubling: the 5 is assigned un-doubled and dealt doubled — Furnace of Rath, the Leech gains 10", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user"), P("furnace", FURNACE_OF_RATH, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai")] }), ["leech"], [["myr", "leech"]]);
    expect({ myr: marked(out, "myr"), life: life(out) }).toEqual({ myr: 10, life: { user: 30, ai: 20 } });
  });
  it("⭐ first strike: Sunblade Angel deals its whole 3 to a blocking 2/2 in the first-strike step — gains 3", () => {
    const out = bothSteps(board({ user: [P("angel", SUNBLADE_ANGEL, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), ["angel"], [["bears", "angel"]]);
    expect({ life: life(out), bears: alive(out, "bears") }).toEqual({ life: { user: 23, ai: 20 }, bears: false });
  });
  it("⭐ double strike: Marisi's Twinclaws deals its whole 2 in each step — the indestructible blocker is marked 4", () => {
    const out = bothSteps(board({ user: [P("twin", MARISIS_TWINCLAWS, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai")] }), ["twin"], [["myr", "twin"]]);
    expect(marked(out, "myr")).toBe(4);
  });
});

describe("deathtouch — 1 is lethal (CR 702.2c), and the rest is still assigned", () => {
  it("⭐ Gifted Aetherborn (2/3 deathtouch, lifelink) blocked by Craw Wurm deals both its damage — gains 2", () => {
    const out = combat(board({ user: [P("aeth", GIFTED_AETHERBORN, "user")], ai: [P("wurm", CRAW_WURM, "ai")] }), ["aeth"], [["wurm", "aeth"]]);
    expect({ life: life(out), wurm: alive(out, "wurm") }).toEqual({ life: { user: 22, ai: 20 }, wurm: false });
  });
  it("⭐ Mugato (6/6 deathtouch) blocked by a Bears and Darksteel Myr: 1 to the Bears, 1 + the remaining 4 to the Myr", () => {
    const out = combat(board({ user: [P("mugato", MUGATO, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai"), P("myr", DARKSTEEL_MYR, "ai")] }), ["mugato"], [["bears", "mugato"], ["myr", "mugato"]]);
    expect({ bears: alive(out, "bears"), myr: marked(out, "myr") }).toEqual({ bears: false, myr: 5 });
  });
});

describe("two or more blockers — the lethal shares in order, then the rest to one blocker", () => {
  it("⭐ blocked by a Bears, then Darksteel Myr: 2 to the Bears, 1 to the Myr, the remaining 2 to the Myr (the last) — gains 5", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai"), P("myr", DARKSTEEL_MYR, "ai")] }), ["leech"], [["bears", "leech"], ["myr", "leech"]]);
    expect({ bears: alive(out, "bears"), myr: marked(out, "myr"), life: life(out) }).toEqual({ bears: false, myr: 3, life: { user: 25, ai: 20 } });
  });
  it("⭐ blocked by Darksteel Myr, then a Bears: the Myr keeps its lethal 1, the remaining 2 go to the Bears — gains 5", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai"), P("bears", GRIZZLY_BEARS, "ai")] }), ["leech"], [["myr", "leech"], ["bears", "leech"]]);
    expect({ myr: marked(out, "myr"), bears: alive(out, "bears"), life: life(out) }).toEqual({ myr: 1, bears: false, life: { user: 25, ai: 20 } });
  });
  it("⭐ two Bears: 2 + 2 + the remaining 1 — gains 5", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("b1", GRIZZLY_BEARS, "ai"), P("b2", GRIZZLY_BEARS, "ai")] }), ["leech"], [["b1", "leech"], ["b2", "leech"]]);
    expect({ life: life(out), bears: named(out, "ai", "Grizzly Bears") }).toEqual({ life: { user: 25, ai: 20 }, bears: 0 });
  });
});

describe("a blocker whose damage is prevented is still assigned its share; the rest goes to one whose damage is not", () => {
  it("⭐ Darksteel Myr, then a pro-black Valeron Outlander: the Outlander's share is assigned (prevented), the rest goes to the Myr", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai"), P("out", VALERON_OUTLANDER, "ai")] }), ["leech"], [["myr", "leech"], ["out", "leech"]]);
    expect({ myr: marked(out, "myr"), outlander: marked(out, "out"), life: life(out) }).toEqual({ myr: 3, outlander: 0, life: { user: 23, ai: 20 } });
  });
  it("⭐ a Bears, then the Outlander: 2 to the Bears, 2 to the Outlander (prevented), the remaining 1 to the Bears — gains 3", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai"), P("out", VALERON_OUTLANDER, "ai")] }), ["leech"], [["bears", "leech"], ["out", "leech"]]);
    expect({ bears: alive(out, "bears"), outlander: marked(out, "out"), life: life(out) }).toEqual({ bears: false, outlander: 0, life: { user: 23, ai: 20 } });
  });
  it("⭐ a shield counter prevents its share (one counter spent) and the rest goes to the next blocker: shielded Bears, then the Myr", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai", { counters: { shield: 1 } }), P("myr", DARKSTEEL_MYR, "ai")] }), ["leech"], [["bears", "leech"], ["myr", "leech"]]);
    expect({ bears: marked(out, "bears"), shield: shield(out, "bears"), myr: marked(out, "myr"), life: life(out) }).toEqual({ bears: 0, shield: 0, myr: 3, life: { user: 23, ai: 20 } });
  });
  it("⭐ Darksteel Myr, then a shielded Bears: the Bears' share is prevented (its counter spent), the remaining 2 go to the Myr", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("myr", DARKSTEEL_MYR, "ai"), P("bears", GRIZZLY_BEARS, "ai", { counters: { shield: 1 } })] }), ["leech"], [["myr", "leech"], ["bears", "leech"]]);
    expect({ myr: marked(out, "myr"), bears: marked(out, "bears"), shield: shield(out, "bears"), life: life(out) }).toEqual({ myr: 3, bears: 0, shield: 0, life: { user: 23, ai: 20 } });
  });
  it("⭐ a blocker assigned no damage keeps its shield counter (CR 120.8): a Bears blocked by Craw Wurm, then a shielded Myr", () => {
    const out = combat(board({ user: [P("bears", GRIZZLY_BEARS, "user")], ai: [P("wurm", CRAW_WURM, "ai"), P("myr", DARKSTEEL_MYR, "ai", { counters: { shield: 1 } })] }), ["bears"], [["wurm", "bears"], ["myr", "bears"]]);
    expect({ wurm: marked(out, "wurm"), myr: marked(out, "myr"), shield: shield(out, "myr") }).toEqual({ wurm: 2, myr: 0, shield: 1 });
  });
  it("CONTROL — a lone pro-black blocker is assigned all 5 and all of it is prevented: nothing dealt, nothing gained", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("out", VALERON_OUTLANDER, "ai")] }), ["leech"], [["out", "leech"]]);
    expect({ outlander: marked(out, "out"), life: life(out) }).toEqual({ outlander: 0, life: { user: 20, ai: 20 } });
  });
});

describe("what reads the damage dealt reads all of it", () => {
  it("⭐ Exalted Angel blocked by a Bears deals 4 — its link gains 4", () => {
    const out = settle(combat(board({ user: [P("angel", EXALTED_ANGEL, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), ["angel"], [["bears", "angel"]]));
    expect(life(out)).toEqual({ user: 24, ai: 20 });
  });
  it("⭐ Olivia's Attendants blocked by two Bears deals all 6 — six Blood tokens", () => {
    const out = settle(combat(board({ user: [P("olivia", OLIVIAS_ATTENDANTS, "user")], ai: [P("b1", GRIZZLY_BEARS, "ai"), P("b2", GRIZZLY_BEARS, "ai")] }), ["olivia"], [["b1", "olivia"], ["b2", "olivia"]]));
    expect(named(out, "user", "Blood")).toBe(6);
  });
  it("⭐ Vampiric Link on Mugato (6/6 deathtouch) blocked by two Bears: all 6 dealt — its controller gains 6 (the Link's ruling)", () => {
    let s = board({ user: [P("mugato", MUGATO, "user"), P("link", VAMPIRIC_LINK, "user")], ai: [P("b1", GRIZZLY_BEARS, "ai"), P("b2", GRIZZLY_BEARS, "ai")] });
    s = attachPermanent(s, { equipId: "link", targetId: "mugato" });
    const out = settle(combat(s, ["mugato"], [["b1", "mugato"], ["b2", "mugato"]]));
    expect({ life: life(out), bears: named(out, "ai", "Grizzly Bears") }).toEqual({ life: { user: 26, ai: 20 }, bears: 0 });
  });
});

describe("CONTROLS — unchanged by the rule", () => {
  it("CONTROL — unblocked: the Leech deals its 5 to the player and gains 5", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")] }), ["leech"]);
    expect(life(out)).toEqual({ user: 25, ai: 15 });
  });
  it("CONTROL — trample: Fleetfoot Dancer blocked by a Bears assigns it lethal 2 and tramples 2 over — gains 4", () => {
    const out = combat(board({ user: [P("dancer", FLEETFOOT_DANCER, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), ["dancer"], [["bears", "dancer"]]);
    expect({ life: life(out), bears: alive(out, "bears") }).toEqual({ life: { user: 24, ai: 18 }, bears: false });
  });
  it("CONTROL — trample over a pro-red blocker (CR 702.19b example): 2 assigned to Kor Firewalker (prevented), 2 to the player", () => {
    const out = combat(board({ user: [P("dancer", FLEETFOOT_DANCER, "user")], ai: [P("kor", KOR_FIREWALKER, "ai")] }), ["dancer"], [["kor", "dancer"]]);
    expect({ life: life(out), kor: marked(out, "kor") }).toEqual({ life: { user: 22, ai: 18 }, kor: 0 });
  });
  it("CONTROL — an exactly lethal block: the Leech's 5 is the Bears' 2 plus the Hill Giant's 3 — gains 5, both die", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai"), P("giant", HILL_GIANT, "ai")] }), ["leech"], [["bears", "leech"], ["giant", "leech"]]);
    expect({ life: life(out), bears: alive(out, "bears"), giant: alive(out, "giant") }).toEqual({ life: { user: 25, ai: 20 }, bears: false, giant: false });
  });
  it("CONTROL — the multi-block division (CR 510.1d): Palace Guard blocking two Bears deals its 1 to the first; each Bears deals its 2 to it", () => {
    const out = combat(board({ user: [P("b1", GRIZZLY_BEARS, "user"), P("b2", GRIZZLY_BEARS, "user")], ai: [P("guard", PALACE_GUARD, "ai")] }), ["b1", "b2"], [["guard", "b1"], ["guard", "b2"]]);
    expect({ guard: alive(out, "guard"), b1: marked(out, "b1"), b2: marked(out, "b2") }).toEqual({ guard: false, b1: 1, b2: 0 });
  });
  it("CONTROL — a blocker that left combat: the blocked Leech assigns no combat damage (CR 510.1c), nothing gained", () => {
    const out = combat(board({ user: [P("leech", GARGANTUAN_LEECH, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai", { removedFromCombat: true })] }), ["leech"], [["bears", "leech"]]);
    expect({ life: life(out), bears: marked(out, "bears") }).toEqual({ life: { user: 20, ai: 20 }, bears: 0 });
  });
  it("CONTROL — a trampler whose blocker left combat assigns all its damage to the player (CR 702.19d)", () => {
    const out = combat(board({ user: [P("dancer", FLEETFOOT_DANCER, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai", { removedFromCombat: true })] }), ["dancer"], [["bears", "dancer"]]);
    expect(life(out)).toEqual({ user: 24, ai: 16 });
  });
});
