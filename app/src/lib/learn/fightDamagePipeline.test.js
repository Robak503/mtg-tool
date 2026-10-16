/**
 * fightDamagePipeline.test.js — a fight, a bite and a self-fight deal ORDINARY damage (2026-10-16).
 *
 * THE GAP (found 2026-09-30 scoping Crystal Barricade). The four creature-deals-damage atoms in effects/atoms/combat.js —
 * the source-bound fight (Kogla, the Titan Ape's ETB), the two-target fight (Prey Upon), the one-way bite (Rabid Bite,
 * Ram Through) and the self-fight (Justice Strike) — marked their damage straight onto the creature with
 * gameState.markCombatDamage, skipping every step a spell's damage takes. Each consequence was driven on the old code,
 * cast for real, before the fix, and every one reproduced: Dawn Elemental died to all four; Child of Night's fights and
 * bites gained nothing; Glistener Elf marked damage instead of a -1/-1 counter; Sengir Vampire never grew and Kumano's
 * Pupils' victim went to the graveyard (no damage source was recorded); Ripjaw Raptor's enrage and Zebra Unicorn's dealt-by
 * link never fired; Furnace of Rath did not double and a Samite Healer shield was not consumed; protection from the
 * fighter's color prevented nothing. The 24-game blast-radius batch found one more (the only game it changed): Wolverine,
 * Best There Is fighting skipped its own damage doubler and its "dealt damage to another creature" end-step clause.
 *
 * THE FIX. spellEffects.dealSimultaneousDamage — ONE damage event through the deal path applyDamageEffect's own hits take
 * (dealDamageToCreature / dealDamageToPlayer / settleDamageEvent, extracted from applyDamageEffect — not a second copy),
 * each creature the source of its own damage with its own keywords read, every hit dealt before the single lethal pass
 * (CR 701.14a — fight is 701.14 in the bundled rules; the old comments cited 701.12, which is now "Exchange"). Fixed with it,
 * each a consequence of the routing:
 *   · The Last Agni Kai's mana is the excess damage actually DEALT (CR 120.10) — prevented damage was never dealt.
 *   · The lethal pass honors deathtouch damage dealt as -1/-1 counters (CR 704.5h): a granted deathtouch on an infect
 *     creature kills, in a fight and in combat alike (no printed card carries both — the corpus has 0).
 *   · A bite's trample excess (Ram Through) is dealt by the biting creature in the same event (Blightsteel's is poison).
 *   · A bite aimed at a planeswalker (Bite Down) was dropped by the pair reader and resolved as nothing; it now removes
 *     loyalty, the biting creature its source.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-16). Every case is played through the
 * engine: legalActionsForPlayer offers the cast (or the activation), dispatchAction pays and stacks it, resolveTopOfStack
 * resolves it and the flush resolves what it triggered; the combat case runs resolveCombatDamage. Each witness has a
 * CONTROL that differs from it in one card, so a pass cannot come from a harness that never dealt the damage.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { permanentHasKeyword } from "./layers.js";
import { applyWolverineEndStep } from "./wolverine.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DAWN_ELEMENTAL = {"name":"Dawn Elemental","type":"Creature — Elemental","mana":"{W}{W}{W}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"colorIdentity":["W"],"oracle":"Flying\nPrevent all damage that would be dealt to this creature."};
const PREY_UPON = {"name":"Prey Upon","type":"Sorcery","mana":"{G}","cmc":1,"keywords":["Fight"],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)"};
const RABID_BITE = {"name":"Rabid Bite","type":"Sorcery","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature you control deals damage equal to its power to target creature you don't control."};
const BITE_DOWN = {"name":"Bite Down","type":"Instant","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature you control deals damage equal to its power to target creature or planeswalker you don't control."};
const JUSTICE_STRIKE = {"name":"Justice Strike","type":"Instant","mana":"{R}{W}","cmc":2,"keywords":[],"colors":["R","W"],"colorIdentity":["R","W"],"oracle":"Target creature deals damage to itself equal to its power."};
const RAM_THROUGH = {"name":"Ram Through","type":"Instant","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead."};
const THE_LAST_AGNI_KAI = {"name":"The Last Agni Kai","type":"Instant","mana":"{1}{R}","cmc":2,"keywords":["Fight"],"colors":["R"],"colorIdentity":["R"],"oracle":"Target creature you control fights target creature an opponent controls. If the creature the opponent controls is dealt excess damage this way, add that much {R}.\nUntil end of turn, you don't lose unspent red mana as steps and phases end."};
const KOGLA = {"name":"Kogla, the Titan Ape","type":"Legendary Creature — Ape","mana":"{3}{G}{G}{G}","cmc":6,"power":"7","toughness":"6","keywords":["Fight"],"colors":["G"],"colorIdentity":["G"],"oracle":"When Kogla enters, it fights up to one target creature you don't control.\nWhenever Kogla attacks, destroy target artifact or enchantment defending player controls.\n{1}{G}: Return target Human you control to its owner's hand. Kogla gains indestructible until end of turn."};
const SENGIR_VAMPIRE = {"name":"Sengir Vampire","type":"Creature — Vampire","mana":"{3}{B}{B}","cmc":5,"power":"4","toughness":"4","keywords":["Flying"],"colors":["B"],"colorIdentity":["B"],"oracle":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature."};
const KUMANOS_PUPILS = {"name":"Kumano's Pupils","type":"Creature — Human Shaman","mana":"{4}{R}","cmc":5,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"If a creature dealt damage by this creature this turn would die, exile it instead."};
const GLISTENER_ELF = {"name":"Glistener Elf","type":"Creature — Phyrexian Elf Warrior","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Infect"],"colors":["G"],"colorIdentity":["G"],"oracle":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"{T}: Add {G}."};
const BOGGART_RAM_GANG = {"name":"Boggart Ram-Gang","type":"Creature — Goblin Warrior","mana":"{R/G}{R/G}{R/G}","cmc":3,"power":"3","toughness":"3","keywords":["Haste","Wither"],"colors":["G","R"],"colorIdentity":["G","R"],"oracle":"Haste\nWither (This deals damage to creatures in the form of -1/-1 counters.)"};
const CHILD_OF_NIGHT = {"name":"Child of Night","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":["Lifelink"],"colors":["B"],"colorIdentity":["B"],"oracle":"Lifelink"};
const VAMPIRE_NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"colorIdentity":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const BASILISK_COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"};
const SAMITE_HEALER = {"name":"Samite Healer","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Prevent the next 1 damage that would be dealt to any target this turn."};
const FURNACE_OF_RATH = {"name":"Furnace of Rath","type":"Enchantment","mana":"{1}{R}{R}{R}","cmc":4,"keywords":["Double"],"colors":["R"],"colorIdentity":["R"],"oracle":"If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead."};
const RIPJAW_RAPTOR = {"name":"Ripjaw Raptor","type":"Creature — Dinosaur","mana":"{2}{G}{G}","cmc":4,"power":"4","toughness":"5","keywords":["Enrage"],"colors":["G"],"colorIdentity":["G"],"oracle":"Enrage — Whenever this creature is dealt damage, draw a card."};
const ZEBRA_UNICORN = {"name":"Zebra Unicorn","type":"Creature — Unicorn","mana":"{2}{G}{W}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["G","W"],"colorIdentity":["G","W"],"oracle":"Whenever this creature deals damage, you gain that much life."};
const WHITE_KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"};
const WALL_OF_STONE = {"name":"Wall of Stone","type":"Creature — Wall","mana":"{1}{R}{R}","cmc":3,"power":"0","toughness":"8","keywords":["Defender"],"colors":["R"],"colorIdentity":["R"],"oracle":"Defender (This creature can't attack.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const COLOSSAL_DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"colorIdentity":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const BLIGHTSTEEL_COLOSSUS = {"name":"Blightsteel Colossus","type":"Artifact Creature — Phyrexian Golem","mana":"{12}","cmc":12,"power":"11","toughness":"11","keywords":["Indestructible","Trample","Infect"],"colors":[],"colorIdentity":[],"oracle":"Trample, infect, indestructible\nIf Blightsteel Colossus would be put into a graveyard from anywhere, reveal Blightsteel Colossus and shuffle it into its owner's library instead."};
const WOLVERINE = {"name":"Wolverine, Best There Is","type":"Legendary Creature — Mutant Berserker Hero","mana":"{1}{R}{G}","cmc":3,"power":"2","toughness":"2","keywords":["Heal","Regenerate","Unrivaled Lethality","Double"],"colors":["G","R"],"colorIdentity":["G","R"],"oracle":"Unrivaled Lethality — Double all damage Wolverine would deal.\nAt the beginning of each end step, if Wolverine dealt damage to another creature this turn, put a +1/+1 counter on him.\n{1}{G}: Regenerate Wolverine. (The next time he would be destroyed this turn, instead tap him, remove him from combat, and heal all damage on him.)"};
const AJANI_GOLDMANE ={"name":"Ajani Goldmane","type":"Legendary Planeswalker — Ajani","mana":"{2}{W}{W}","cmc":4,"loyalty":"4","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\""};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));

/** A two-seat game in the user's precombat main phase, the stack empty, the user's pool full, both libraries stocked. */
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 20, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, life: 20, battlefield: ai, hand: [], library: LIB("ai") } } };
}

/** Resolve the stack, flushing what each resolution triggers (the engine's own chooser picks a trigger's targets). */
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const noResolveErrors = (s) => expect((s.log || []).filter((l) => l.kind === "stack-resolve-error")).toEqual([]);
const role = (a, r, id) => (a.targets || []).some((t) => t.role === r && t.id === id);
const aimsAt = (a, id) => (a.targets || []).some((t) => t.id === id);

/** Cast `spell` from the user's hand: the offered cast whose targets satisfy `pick`, paid, resolved and settled. */
function cast(s, spell, pick) {
  const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === spell.id).find(pick);
  expect(act, `${spell.name} is offered with the intended targets`).toBeTruthy();
  const out = settle(resolveTopOfStack(dispatchAction(s, act)));
  noResolveErrors(out);
  return out;
}

const IN_HAND = {
  prey: { id: "h-prey", ...PREY_UPON },
  bite: { id: "h-bite", ...RABID_BITE },
  biteDown: { id: "h-bitedown", ...BITE_DOWN },
  justice: { id: "h-justice", ...JUSTICE_STRIKE },
  ram: { id: "h-ram", ...RAM_THROUGH },
  agni: { id: "h-agni", ...THE_LAST_AGNI_KAI },
  kogla: { id: "h-kogla", ...KOGLA },
};
const pairPick = (fighter, target) => (a) => role(a, "fighter", fighter) && role(a, "target", target);
/** Prey Upon: the user's `fighter` fights the AI's `target`. `setup` edits the board before the cast. */
const preyUpon = ({ user, ai, fighter, target, setup = (s) => s }) =>
  cast(setup(board({ user, ai, hand: [IN_HAND.prey] })), IN_HAND.prey, pairPick(fighter, target));
/** A one-way bite (Rabid Bite, Bite Down, Ram Through): the user's `fighter` deals damage equal to its power to `target`. */
const bite = (spell, { user, ai, fighter, target }) => cast(board({ user, ai, hand: [spell] }), spell, pairPick(fighter, target));
/** Justice Strike on `on`: that creature deals damage to itself equal to its power. */
const justiceStrike = ({ user = [], ai = [], on }) => cast(board({ user, ai, hand: [IN_HAND.justice] }), IN_HAND.justice, (a) => aimsAt(a, on));
/** Kogla enters (cast for real) and its "it fights up to one target creature you don't control" resolves. */
function koglaEnters({ ai }) {
  const s = board({ ai, hand: [IN_HAND.kogla] });
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === IN_HAND.kogla.id);
  expect(act, "Kogla is offered").toBeTruthy();
  const out = settle(resolveTopOfStack(dispatchAction(s, act)));
  noResolveErrors(out);
  const kogla = out.players.user.battlefield.find((p) => p.card?.name === KOGLA.name);
  expect(kogla, "Kogla is on the battlefield").toBeTruthy();
  return { s: out, koglaId: kogla.id };
}

const perm = (s, id) => findPermanent(s, id)?.permanent ?? null;
const alive = (s, id) => perm(s, id) !== null;
const damage = (s, id) => perm(s, id)?.damageMarked || 0;
const counters = (s, id, type) => perm(s, id)?.counters?.[type] || 0;
const handSize = (s, pid) => s.players[pid].hand.length;
const inZone = (s, pid, zone, name) => s.players[pid][zone].some((c) => c.name === name);

describe("① a prevention wall stops fight damage — Dawn Elemental, through every one of the four paths (CR 615)", () => {
  it("⭐ the two-target fight (Prey Upon): Craw Wurm's 6 is prevented; Dawn Elemental still deals its 3", () => {
    const s = preyUpon({ user: [P("wurm", CRAW_WURM, "user")], ai: [P("dawn", DAWN_ELEMENTAL, "ai")], fighter: "wurm", target: "dawn" });
    expect(alive(s, "dawn")).toBe(true);
    expect(damage(s, "dawn")).toBe(0);
    expect(damage(s, "wurm")).toBe(3);
  });
  it("CONTROL — the same fight with a Hill Giant (3/3, no wall): it dies", () => {
    const s = preyUpon({ user: [P("wurm", CRAW_WURM, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "wurm", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
    expect(inZone(s, "ai", "graveyard", HILL_GIANT.name)).toBe(true);
  });

  it("⭐ the source-bound fight (Kogla's ETB): Dawn Elemental takes none of Kogla's 7; Kogla takes its 3", () => {
    const { s, koglaId } = koglaEnters({ ai: [P("dawn", DAWN_ELEMENTAL, "ai")] });
    expect(alive(s, "dawn")).toBe(true);
    expect(damage(s, "dawn")).toBe(0);
    expect(damage(s, koglaId)).toBe(3); // the fight happened
  });
  it("CONTROL — Kogla's ETB against a Hill Giant: it dies", () => {
    const { s, koglaId } = koglaEnters({ ai: [P("giant", HILL_GIANT, "ai")] });
    expect(alive(s, "giant")).toBe(false);
    expect(damage(s, koglaId)).toBe(3);
  });

  it("⭐ the bite (Rabid Bite): Craw Wurm's 6 is prevented", () => {
    const s = bite(IN_HAND.bite, { user: [P("wurm", CRAW_WURM, "user")], ai: [P("dawn", DAWN_ELEMENTAL, "ai")], fighter: "wurm", target: "dawn" });
    expect(alive(s, "dawn")).toBe(true);
    expect(damage(s, "dawn")).toBe(0);
  });
  it("CONTROL — Rabid Bite on a Hill Giant: it dies", () => {
    const s = bite(IN_HAND.bite, { user: [P("wurm", CRAW_WURM, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "wurm", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
  });

  it("⭐ the self-fight (Justice Strike): Dawn Elemental's 3 to itself is prevented", () => {
    const s = justiceStrike({ ai: [P("dawn", DAWN_ELEMENTAL, "ai")], on: "dawn" });
    expect(alive(s, "dawn")).toBe(true);
    expect(damage(s, "dawn")).toBe(0);
  });
  it("CONTROL — Justice Strike on a Hill Giant: it dies", () => {
    const s = justiceStrike({ ai: [P("giant", HILL_GIANT, "ai")], on: "giant" });
    expect(alive(s, "giant")).toBe(false);
  });

  it("⭐ deathtouch needs damage DEALT: Vampire Nighthawk's prevented 2 neither kills Dawn Elemental nor gains life", () => {
    const s = preyUpon({ user: [P("hawk", VAMPIRE_NIGHTHAWK, "user")], ai: [P("dawn", DAWN_ELEMENTAL, "ai")], fighter: "hawk", target: "dawn" });
    expect(alive(s, "dawn")).toBe(true);
    expect(s.players.user.life).toBe(20);
  });
  it("CONTROL — the Nighthawk against a Hill Giant: 2 deathtouch damage kills the 3/3 and the user gains 2", () => {
    const s = preyUpon({ user: [P("hawk", VAMPIRE_NIGHTHAWK, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "hawk", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
    expect(s.players.user.life).toBe(22);
  });
});

describe("② lifelink — the fighter's controller gains the damage it dealt (CR 120.3f)", () => {
  it("⭐ Prey Upon: Child of Night deals 2 → the user gains 2", () => {
    const s = preyUpon({ user: [P("child", CHILD_OF_NIGHT, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "child", target: "bears" });
    expect(s.players.user.life).toBe(22);
  });
  it("CONTROL — the same fight with Grizzly Bears (2 power, no lifelink): no gain", () => {
    const s = preyUpon({ user: [P("mine", GRIZZLY_BEARS, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "mine", target: "bears" });
    expect(s.players.user.life).toBe(20);
    expect(alive(s, "bears")).toBe(false); // the fight happened
  });

  it("⭐ Rabid Bite: Child of Night's 2 → the user gains 2", () => {
    const s = bite(IN_HAND.bite, { user: [P("child", CHILD_OF_NIGHT, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "child", target: "bears" });
    expect(s.players.user.life).toBe(22);
    expect(damage(s, "child")).toBe(0); // one-way: the Bears do not bite back
  });
  it("CONTROL — Rabid Bite with Grizzly Bears: no gain", () => {
    const s = bite(IN_HAND.bite, { user: [P("mine", GRIZZLY_BEARS, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "mine", target: "bears" });
    expect(s.players.user.life).toBe(20);
    expect(alive(s, "bears")).toBe(false);
  });

  it("⭐ Justice Strike on Child of Night: the 2 it deals to itself gains its controller 2", () => {
    const s = justiceStrike({ user: [P("child", CHILD_OF_NIGHT, "user")], on: "child" });
    expect(s.players.user.life).toBe(22);
    expect(alive(s, "child")).toBe(false);
  });
  it("CONTROL — Justice Strike on Grizzly Bears: no gain", () => {
    const s = justiceStrike({ user: [P("mine", GRIZZLY_BEARS, "user")], on: "mine" });
    expect(s.players.user.life).toBe(20);
    expect(alive(s, "mine")).toBe(false);
  });

  it("⭐ Bite Down at a planeswalker: Ajani Goldmane loses 2 loyalty and Child of Night's controller gains 2", () => {
    const s = bite(IN_HAND.biteDown, { user: [P("child", CHILD_OF_NIGHT, "user")], ai: [P("ajani", AJANI_GOLDMANE, "ai", { counters: { loyalty: 4 } })], fighter: "child", target: "ajani" });
    expect(counters(s, "ajani", "loyalty")).toBe(2);
    expect(s.players.user.life).toBe(22);
  });
  it("CONTROL — Bite Down with Grizzly Bears: the same 2 loyalty, no gain", () => {
    const s = bite(IN_HAND.biteDown, { user: [P("mine", GRIZZLY_BEARS, "user")], ai: [P("ajani", AJANI_GOLDMANE, "ai", { counters: { loyalty: 4 } })], fighter: "mine", target: "ajani" });
    expect(counters(s, "ajani", "loyalty")).toBe(2);
    expect(s.players.user.life).toBe(20);
  });

  it("⭐ a fighter the fight kills still deals its damage with its keywords: Vampire Nighthawk kills Craw Wurm and gains 2", () => {
    // Both hits are one event: the Nighthawk's deathtouch and lifelink are read before either hit, so its death to the
    // Wurm's 6 does not take them away (the two are simultaneous — CR 701.14a).
    const s = preyUpon({ user: [P("wurm", CRAW_WURM, "user")], ai: [P("hawk", VAMPIRE_NIGHTHAWK, "ai")], fighter: "wurm", target: "hawk" });
    expect(alive(s, "hawk")).toBe(false);
    expect(alive(s, "wurm")).toBe(false); // 2 damage on a 4-toughness Wurm: only deathtouch kills it
    expect(s.players.ai.life).toBe(22);
  });
});

describe("③ infect and wither — damage to a creature as -1/-1 counters (CR 120.3d); infect's to a player as poison (CR 120.3b)", () => {
  it("⭐ Glistener Elf fights a Hill Giant: one -1/-1 counter, no damage marked", () => {
    const s = preyUpon({ user: [P("elf", GLISTENER_ELF, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "elf", target: "giant" });
    expect(counters(s, "giant", "-1/-1")).toBe(1);
    expect(damage(s, "giant")).toBe(0);
  });
  it("CONTROL — Llanowar Elves (1 power, no infect): 1 damage marked, no counter", () => {
    const s = preyUpon({ user: [P("elves", LLANOWAR_ELVES, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "elves", target: "giant" });
    expect(counters(s, "giant", "-1/-1")).toBe(0);
    expect(damage(s, "giant")).toBe(1);
  });

  it("⭐ SIMULTANEITY — Boggart Ram-Gang withers a Ripjaw Raptor to 1/2, and the Raptor still deals its locked 4: the Ram-Gang dies", () => {
    // Read after the -1/-1 counters, the Raptor's power would be 1 and the 3/3 Ram-Gang would live.
    const s = preyUpon({ user: [P("ram", BOGGART_RAM_GANG, "user")], ai: [P("raptor", RIPJAW_RAPTOR, "ai")], fighter: "ram", target: "raptor" });
    expect(counters(s, "raptor", "-1/-1")).toBe(3);
    expect(damage(s, "raptor")).toBe(0);
    expect(alive(s, "raptor")).toBe(true);
    expect(alive(s, "ram")).toBe(false);
  });
  it("CONTROL — a Hill Giant (no wither) against the Raptor: 3 damage marked, no counters", () => {
    const s = preyUpon({ user: [P("giant", HILL_GIANT, "user")], ai: [P("raptor", RIPJAW_RAPTOR, "ai")], fighter: "giant", target: "raptor" });
    expect(counters(s, "raptor", "-1/-1")).toBe(0);
    expect(damage(s, "raptor")).toBe(3);
  });

  it("⭐ Ram Through with Blightsteel Colossus: lethal 2 to the Bears as counters, the trample excess 9 to the AI as poison", () => {
    const s = bite(IN_HAND.ram, { user: [P("big", BLIGHTSTEEL_COLOSSUS, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "big", target: "bears" });
    expect(alive(s, "bears")).toBe(false);
    expect(s.players.ai.poison).toBe(9);
    expect(s.players.ai.life).toBe(20);
  });
  it("CONTROL — Ram Through with Colossal Dreadmaw (trample, no infect): the excess 4 is life", () => {
    const s = bite(IN_HAND.ram, { user: [P("big", COLOSSAL_DREADMAW, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "big", target: "bears" });
    expect(alive(s, "bears")).toBe(false);
    expect(s.players.ai.poison).toBe(0);
    expect(s.players.ai.life).toBe(16);
  });
});

describe("④ deathtouch dealt as -1/-1 counters still destroys (CR 704.5h) — Basilisk Collar on Glistener Elf", () => {
  const equipped = (s) => attachPermanent(s, { equipId: "collar", targetId: "elf" });

  it("the Collar grants deathtouch and lifelink to the infect Elf (the fixture the cases below need)", () => {
    const s = equipped(board({ user: [P("elf", GLISTENER_ELF, "user"), P("collar", BASILISK_COLLAR, "user")] }));
    expect([permanentHasKeyword(s, "elf", "Infect"), permanentHasKeyword(s, "elf", "Deathtouch"), permanentHasKeyword(s, "elf", "Lifelink")]).toEqual([true, true, true]);
  });

  it("⭐ in a fight: the Hill Giant gets one counter and is destroyed; the user gains 1", () => {
    const s = preyUpon({ user: [P("elf", GLISTENER_ELF, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "elf", target: "giant", setup: equipped });
    expect(alive(s, "giant")).toBe(false);
    expect(inZone(s, "ai", "graveyard", HILL_GIANT.name)).toBe(true);
    expect(s.players.user.life).toBe(21);
  });
  it("CONTROL — the Elf without the Collar: the Giant lives with its one counter", () => {
    const s = preyUpon({ user: [P("elf", GLISTENER_ELF, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "elf", target: "giant" });
    expect(alive(s, "giant")).toBe(true);
    expect(counters(s, "giant", "-1/-1")).toBe(1);
  });

  /** The equipped (or not) Elf attacks; the Hill Giant blocks it; the regular combat damage step resolves. */
  function blockedElf({ collar }) {
    let s = board({ user: [P("elf", GLISTENER_ELF, "user"), P("collar", BASILISK_COLLAR, "user")], ai: [P("giant", HILL_GIANT, "ai")] });
    if (collar) s = equipped(s);
    s = { ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "elf", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "giant", attackerId: "elf" }] } };
    return resolveCombatDamage(s, { firstStrikeStep: false });
  }
  it("⭐ in combat (the same lethal pass): the blocking Hill Giant is destroyed", () => {
    const s = blockedElf({ collar: true });
    expect(alive(s, "giant")).toBe(false);
    expect(s.players.user.life).toBe(21);
  });
  it("CONTROL — in combat without the Collar: the Giant lives with its one counter", () => {
    const s = blockedElf({ collar: false });
    expect(alive(s, "giant")).toBe(true);
    expect(counters(s, "giant", "-1/-1")).toBe(1);
  });
});

describe("⑤ the damage source is recorded — Sengir Vampire's watcher and Kumano's Pupils' exile", () => {
  it("⭐ Sengir Vampire fights a Hill Giant to death and gets its +1/+1 counter", () => {
    const s = preyUpon({ user: [P("sengir", SENGIR_VAMPIRE, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "sengir", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
    expect(counters(s, "sengir", "+1/+1")).toBe(1);
  });
  it("⛔ CONTROL — Sengir on the battlefield while Craw Wurm kills the Giant: no counter (the record names the Wurm)", () => {
    const s = preyUpon({ user: [P("sengir", SENGIR_VAMPIRE, "user"), P("wurm", CRAW_WURM, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "wurm", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
    expect(counters(s, "sengir", "+1/+1")).toBe(0);
  });
  it("the record itself, read off a creature that lives: Colossal Dreadmaw, fought by Sengir, carries Sengir's id", () => {
    const s = preyUpon({ user: [P("sengir", SENGIR_VAMPIRE, "user")], ai: [P("maw", COLOSSAL_DREADMAW, "ai")], fighter: "sengir", target: "maw" });
    expect(damage(s, "maw")).toBe(4);
    expect(perm(s, "maw").damagedBy).toEqual(["sengir"]);
  });

  it("⭐ Kumano's Pupils fights a Hill Giant: the Giant is exiled instead of dying", () => {
    const s = preyUpon({ user: [P("pupils", KUMANOS_PUPILS, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "pupils", target: "giant" });
    expect(inZone(s, "ai", "exile", HILL_GIANT.name)).toBe(true);
    expect(inZone(s, "ai", "graveyard", HILL_GIANT.name)).toBe(false);
  });
  it("CONTROL — a Hill Giant fights the Hill Giant: the AI's goes to the graveyard", () => {
    const s = preyUpon({ user: [P("mine", HILL_GIANT, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "mine", target: "giant" });
    expect(inZone(s, "ai", "graveyard", HILL_GIANT.name)).toBe(true);
    expect(inZone(s, "ai", "exile", HILL_GIANT.name)).toBe(false);
  });
});

describe("⑥ prevention shields, damage replacement and protection (CR 615, 614, 702.16e)", () => {
  /** Samite Healer's "{T}: Prevent the next 1 damage that would be dealt to any target this turn", activated on `on`. */
  function samiteShield(s, on) {
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "samite" && aimsAt(a, on));
    expect(act, "Samite Healer's activation is offered on the target").toBeTruthy();
    return settle(resolveTopOfStack(dispatchAction(s, act)));
  }
  const giants = () => ({ user: [P("samite", SAMITE_HEALER, "user"), P("mine", HILL_GIANT, "user")], ai: [P("theirs", HILL_GIANT, "ai")] });

  it("⭐ a Samite Healer shield on the user's Hill Giant takes 1 of the 3: it lives with 2; the shield is spent", () => {
    const s = preyUpon({ ...giants(), fighter: "mine", target: "theirs", setup: (b) => samiteShield(b, "mine") });
    expect(alive(s, "mine")).toBe(true);
    expect(damage(s, "mine")).toBe(2);
    expect(alive(s, "theirs")).toBe(false);
    expect(s.preventionShields || []).toEqual([]);
  });
  it("CONTROL — no shield: both Giants die", () => {
    const s = preyUpon({ ...giants(), fighter: "mine", target: "theirs" });
    expect(alive(s, "mine")).toBe(false);
    expect(alive(s, "theirs")).toBe(false);
  });

  it("⭐ Furnace of Rath doubles both hits: Grizzly Bears deals 4 and kills the Hill Giant", () => {
    const s = preyUpon({ user: [P("bears", GRIZZLY_BEARS, "user"), P("furnace", FURNACE_OF_RATH, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "bears", target: "giant" });
    expect(alive(s, "giant")).toBe(false);
  });
  it("CONTROL — no Furnace: the Giant lives with 2", () => {
    const s = preyUpon({ user: [P("bears", GRIZZLY_BEARS, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "bears", target: "giant" });
    expect(alive(s, "giant")).toBe(true);
    expect(damage(s, "giant")).toBe(2);
  });

  it("⭐ White Knight's protection from black prevents Sengir Vampire's 4; the Knight's 2 still lands", () => {
    const s = preyUpon({ user: [P("sengir", SENGIR_VAMPIRE, "user")], ai: [P("knight", WHITE_KNIGHT, "ai")], fighter: "sengir", target: "knight" });
    expect(alive(s, "knight")).toBe(true);
    expect(damage(s, "knight")).toBe(0);
    expect(damage(s, "sengir")).toBe(2);
  });
  it("CONTROL — Sengir against Grizzly Bears (no protection): they die", () => {
    const s = preyUpon({ user: [P("sengir", SENGIR_VAMPIRE, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "sengir", target: "bears" });
    expect(alive(s, "bears")).toBe(false);
  });

  // A doubler scoped to ITS OWN damage reads the fighter as the source (Furnace of Rath above doubles every source, so it
  // cannot tell), and the fighter's card reaches Wolverine's "dealt damage to another creature this turn" clause — the one
  // game of the 24-game blast-radius batch that changed was exactly this (Wolverine fought through Ancient Animus).
  it("⭐ Wolverine, Best There Is doubles its own fight damage (the Wall of Stone takes 4) and gets its end-step counter", () => {
    const s = preyUpon({ user: [P("wolv", WOLVERINE, "user")], ai: [P("wall", WALL_OF_STONE, "ai")], fighter: "wolv", target: "wall" });
    expect(damage(s, "wall")).toBe(4);
    expect(counters(applyWolverineEndStep(s), "wolv", "+1/+1")).toBe(1);
  });
  it("CONTROL — Grizzly Bears fights the Wall beside an idle Wolverine: 2 damage, and no counter at the end step", () => {
    const s = preyUpon({ user: [P("wolv", WOLVERINE, "user"), P("bears", GRIZZLY_BEARS, "user")], ai: [P("wall", WALL_OF_STONE, "ai")], fighter: "bears", target: "wall" });
    expect(damage(s, "wall")).toBe(2);
    expect(counters(applyWolverineEndStep(s), "wolv", "+1/+1")).toBe(0);
  });
});

describe("⑦ what dealt damage triggers fires off a fight (CR 603.2) — and prevented damage triggers nothing (CR 603.2g)", () => {
  it("⭐ enrage: Ripjaw Raptor is dealt the Hill Giant's 3 and draws a card", () => {
    const s = preyUpon({ user: [P("raptor", RIPJAW_RAPTOR, "user")], ai: [P("giant", HILL_GIANT, "ai")], fighter: "raptor", target: "giant" });
    expect(damage(s, "raptor")).toBe(3);
    expect(handSize(s, "user")).toBe(1);
  });
  it("CONTROL — the Raptor fights a Wall of Stone (0 power): dealt nothing, draws nothing", () => {
    const s = preyUpon({ user: [P("raptor", RIPJAW_RAPTOR, "user")], ai: [P("wall", WALL_OF_STONE, "ai")], fighter: "raptor", target: "wall" });
    expect(damage(s, "wall")).toBe(4); // the fight happened
    expect(handSize(s, "user")).toBe(0);
  });
  it("⭐ enrage through the self-fight: Justice Strike on Ripjaw Raptor — 4 to itself, it lives and draws", () => {
    const s = justiceStrike({ user: [P("raptor", RIPJAW_RAPTOR, "user")], on: "raptor" });
    expect(damage(s, "raptor")).toBe(4);
    expect(handSize(s, "user")).toBe(1);
  });

  it("⭐ dealt-by: Zebra Unicorn deals 2 to the Bears and its controller gains 2", () => {
    const s = preyUpon({ user: [P("unicorn", ZEBRA_UNICORN, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], fighter: "unicorn", target: "bears" });
    expect(s.players.user.life).toBe(22);
  });
  it("CONTROL — the Unicorn fights Dawn Elemental: its damage is prevented, so it dealt none and gains nothing", () => {
    const s = preyUpon({ user: [P("unicorn", ZEBRA_UNICORN, "user")], ai: [P("dawn", DAWN_ELEMENTAL, "ai")], fighter: "unicorn", target: "dawn" });
    expect(alive(s, "unicorn")).toBe(false); // the fight happened: Dawn's 3 killed the 2/2
    expect(s.players.user.life).toBe(20);
  });
});

describe("⑧ The Last Agni Kai's excess is the damage actually dealt (CR 120.10)", () => {
  /** Cast The Last Agni Kai; returns the user's red mana after paying for it and after it resolved. */
  function agniKai(foe) {
    const s = board({ user: [P("wurm", CRAW_WURM, "user")], ai: [P("foe", foe, "ai")], hand: [IN_HAND.agni] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === IN_HAND.agni.id && role(a, "fighter", "wurm") && role(a, "target", "foe"));
    expect(act, "The Last Agni Kai is offered").toBeTruthy();
    const paid = dispatchAction(s, act);
    const out = settle(resolveTopOfStack(paid));
    noResolveErrors(out);
    return { added: out.players.user.manaPool.R - paid.players.user.manaPool.R, foeAlive: alive(out, "foe") };
  }
  it("⛔ Craw Wurm's 6 at Dawn Elemental is prevented — no damage dealt, so no excess and no mana", () => {
    expect(agniKai(DAWN_ELEMENTAL)).toEqual({ added: 0, foeAlive: true });
  });
  it("CONTROL — at a Hill Giant: 6 dealt, 3 of it excess → {R}{R}{R}", () => {
    expect(agniKai(HILL_GIANT)).toEqual({ added: 3, foeAlive: false });
  });
});
