/**
 * preventedCombatDamage.test.js — combat damage that is PREVENTED is not dealt, so nothing counts it.
 *
 * Protection from everything on a player (CR 702.16j — "All damage that would be dealt to such a permanent or player is
 * prevented."; Teferi's Protection, The One Ring) prevents an attacker's combat damage to that player. Prevented damage never
 * happens (CR 615.6) and an event that is prevented triggers nothing (CR 603.2g), so none of it is commander damage (CR 903.10a),
 * lifelink (CR 702.15b), infect's or toxic's poison (CR 702.90b, 702.164c), a "deals combat damage to a player" trigger or the
 * monarch's steal (CR 725.2). The combat funnel used to record the hit first and prevent only the life loss; spillToDefender's
 * player arm now prevents it before anything reads it, in both damage steps. The affected player orders it among the other
 * replacement and prevention effects (CR 616.1): before a redirect onto their own creature (CR 614.9 — the redirect would deal
 * that creature the hit and give the attacker its lifelink and deathtouch), after the counted shield (Inkshield's tokens — which
 * also goes before a redirect), before every other shield (none is spent). It is a prevention effect, so while combat damage
 * can't be prevented it prevents nothing (CR 615.12 — Frenzied Baloth); a life-locked player is still dealt that damage.
 * Assignment avoids a player whose damage is all prevented (CR 702.19b, 510.1c): a trampler's excess goes to a blocker, and
 * Thorn Elemental's "may" is declined. A player protected from everything can't be the target of spells or abilities — their own
 * included (CR 702.16j; the rulings: "That player can't be the target of spells or abilities").
 *
 * The audit pins below hold the other prevention paths the same way: a fog, a players-only fog, a "prevent all damage that would
 * be dealt to you" shield, a prevent-next-N shield, a "prevent half" replacement, a dealer's wall, protection from a colour on a
 * blocker or an attacker, a shield counter, and noncombat damage to a protected player — each deals (and counts) only what is left.
 *
 * Real oracle fixtures (the bundled Scryfall snapshot, cardIndex.publicCard's fields), unaltered; every commander is a legendary
 * creature (CR 903.3). Each protected board is made by the real card: Teferi's Protection cast in the declare blockers step, The
 * One Ring cast on the protected player's turn before, or The Stasis Coffin activated.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, playerProtectedFromEverything, playerLifeLocked, preventionShieldsFor, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const TEFERI = {"name":"Teferi's Protection","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection."};
const RING = {"name":"The One Ring","type":"Legendary Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":["Indestructible"],"colors":[],"oracle":"Indestructible\nWhen The One Ring enters, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring."};
const COFFIN = {"name":"The Stasis Coffin","type":"Legendary Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{2}, {T}, Exile The Stasis Coffin: You gain protection from everything until your next turn."};
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""};
const KELLAN = {"name":"Kellan, the Kid","type":"Legendary Creature — Human Faerie Rogue","mana":"{G}{W}{U}","cmc":3,"power":"3","toughness":"3","keywords":["Flying","Lifelink"],"colors":["G","U","W"],"oracle":"Flying, lifelink\nWhenever you cast a spell from anywhere other than your hand, you may cast a permanent spell with equal or lesser mana value from your hand without paying its mana cost. If you don't, you may put a land card from your hand onto the battlefield."};
const CAPTAIN = {"name":"Captain America, First Avenger","type":"Legendary Creature — Human Soldier Hero","mana":"{R}{W}{U}","cmc":3,"power":"4","toughness":"4","keywords":["Throw ...","... Catch"],"colors":["R","U","W"],"oracle":"Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America."};
const KWENDE = {"name":"Kwende, Pride of Femeref","type":"Legendary Creature — Human Knight","mana":"{3}{W}","cmc":4,"power":"2","toughness":"2","keywords":["Double strike"],"colors":["W"],"oracle":"Double strike\nCreatures you control with first strike have double strike."};
const SKIRGE = {"name":"Vault Skirge","type":"Artifact Creature — Phyrexian Imp","mana":"{1}{B/P}","cmc":2,"power":"1","toughness":"1","keywords":["Flying","Lifelink"],"colors":["B"],"oracle":"({B/P} can be paid with either {B} or 2 life.)\nFlying\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const THIEF = {"name":"Scroll Thief","type":"Creature — Merfolk Rogue","mana":"{2}{U}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":["U"],"oracle":"Whenever this creature deals combat damage to a player, draw a card."};
const ELF = {"name":"Glistener Elf","type":"Creature — Phyrexian Elf Warrior","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Infect"],"colors":["G"],"oracle":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"};
const SKULLDWELLER = {"name":"Bilious Skulldweller","type":"Creature — Phyrexian Insect","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Toxic","Deathtouch"],"colors":["B"],"oracle":"Deathtouch\nToxic 1 (Players dealt combat damage by this creature also get a poison counter.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const THORN = {"name":"Thorn Elemental","type":"Creature — Elemental","mana":"{5}{G}{G}","cmc":7,"power":"7","toughness":"7","keywords":[],"colors":["G"],"oracle":"You may have this creature assign its combat damage as though it weren't blocked."};
const VIGOR = {"name":"Vigor","type":"Creature — Elemental Incarnation","mana":"{3}{G}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample\nIf damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter on that creature for each 1 damage prevented this way.\nWhen Vigor is put into a graveyard from anywhere, shuffle it into its owner's library."};
const PANTHER_HABIT = {"name":"Panther Habit","type":"Artifact — Equipment","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on it.\nEquip {2}"};
const CYSTBEARER = {"name":"Cystbearer","type":"Creature — Phyrexian Beast","mana":"{2}{G}","cmc":3,"power":"2","toughness":"3","keywords":["Infect"],"colors":["G"],"oracle":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"};
const COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"};
const SALVE = {"name":"Healing Salve","type":"Instant","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn."};
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Shock deals 2 damage to any target."};
const INKSHIELD = {"name":"Inkshield","type":"Instant","mana":"{3}{W}{B}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["B","W"],"oracle":"Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying."};
const BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"power":"3","toughness":"2","keywords":["Haste","Trample"],"colors":["G"],"oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented."};
const PARIAH = {"name":"Pariah","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead."};
const ARCHANGEL = {"name":"Empyrial Archangel","type":"Creature — Angel","mana":"{4}{G}{W}{W}{U}","cmc":8,"power":"5","toughness":"8","keywords":["Flying","Shroud"],"colors":["G","U","W"],"oracle":"Flying\nShroud (This creature can't be the target of spells or abilities.)\nAll damage that would be dealt to you is dealt to this creature instead."};
const WITH_GREAT_POWER = {"name":"With Great Power . . .","type":"Enchantment — Aura","mana":"{3}{W}","cmc":4,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature you control\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.\nAll damage that would be dealt to you is dealt to enchanted creature instead."};
const PROTECTOR = {"name":"Protector of the Crown","type":"Creature — Giant Soldier","mana":"{5}{W}","cmc":6,"power":"2","toughness":"5","keywords":[],"colors":["W"],"oracle":"When this creature enters, you become the monarch.\nAll damage that would be dealt to you is dealt to this creature instead."};
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."};
const FOG = {"name":"Fog","type":"Instant","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Prevent all combat damage that would be dealt this turn."};
const DEFEND = {"name":"Defend the Hearth","type":"Instant","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Prevent all combat damage that would be dealt to players this turn."};
const RIOT_CONTROL = {"name":"Riot Control","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt to you this turn."};
const GISELA = {"name":"Gisela, Blade of Goldnight","type":"Legendary Creature — Angel","mana":"{4}{R}{W}{W}","cmc":7,"power":"5","toughness":"5","keywords":["Flying","First strike","Double"],"colors":["R","W"],"oracle":"Flying, first strike\nIf a source would deal damage to an opponent or a permanent an opponent controls, that source deals double that damage to that player or permanent instead.\nIf a source would deal damage to you or a permanent you control, prevent half that damage, rounded up."};
const DEFANG = {"name":"Defang","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nPrevent all damage that would be dealt by enchanted creature."};
const CRUSADER = {"name":"Mirran Crusader","type":"Creature — Human Knight","mana":"{1}{W}{W}","cmc":3,"power":"2","toughness":"2","keywords":["Protection","Double strike"],"colors":["W"],"oracle":"Double strike, protection from black and from green"};
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const TOXIN = {"name":"Toxin Sliver","type":"Creature — Sliver","mana":"{3}{B}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["B"],"oracle":"Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated."};
const GUTTERSNIPE = {"name":"Guttersnipe","type":"Creature — Goblin Shaman","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"Whenever you cast an instant or sorcery spell, this creature deals 2 damage to each opponent."};
const PHYRESIS = {"name":"Phyresis","type":"Enchantment — Aura","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature\nEnchanted creature has infect. (It deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"};
const CURIOSITY = {"name":"Curiosity","type":"Enchantment — Aura","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card."};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
/** A commander on the battlefield — a legendary creature (CR 903.3); commander damage is keyed by its per-seat instance id (CR 903.10a). */
const CMD = (id, card, controller, over = {}) => {
  expect(card.type).toMatch(/^Legendary Creature/);
  return P(id, { ...card, isCommander: true, commanderInstanceId: `cmd-${id}` }, controller, over);
};
/** `host` wearing `attachment` (an Aura or Equipment, controlled by `controller`): both permanents. */
const wearing = (hostId, hostCard, hostSeat, attId, attCard, attSeat = hostSeat, hostOver = {}) =>
  [P(hostId, hostCard, hostSeat, { attachments: [attId], ...hostOver }), P(attId, attCard, attSeat, { attachedTo: hostId })];
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const library = (seat) => [1, 2, 3, 4].map((i) => ({ ...BEARS, id: `${seat}-l${i}` }));

/** `active`'s turn 7, the declare blockers step, `priority` holding priority; 40 life each (Commander). */
function board({ ai = [], user = [], hand = [], aiHand = [], monarchId, active = "ai", priority = active === "ai" ? "user" : "ai" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 7, activePlayer: active, priorityHolder: priority, phase: "combat", step: "declare-blockers", consecutivePasses: 0, stack: [], pendingTriggers: [],
    ...(monarchId ? { monarchId } : {}),
    players: { ...g.players,
      user: { ...g.players.user, life: 40, battlefield: user, hand, manaPool: { ...FULL }, library: library("u") },
      ai: { ...g.players.ai, life: 40, battlefield: ai, hand: aiHand, manaPool: { ...FULL }, library: library("a") } } };
}
/** Cast `cardId` from `seat`'s hand (the first offered cast `pick` accepts) and resolve the stack, triggers included. */
function cast(s, cardId, pick = () => true, seat = "user") {
  const a = legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && pick(x));
  expect(a, `${cardId} cast offered`).toBeTruthy();
  s = flushTriggers(dispatchAction({ ...s, priorityHolder: seat }, a));
  for (let g = 0; g < 8 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s));
  return s;
}
const castOffers = (s, cardId, seat = "user") => legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).filter((x) => x.kind === "cast-spell" && x.cardId === cardId);
/**
 * `seat` protected from everything by the real card. "tp": Teferi's Protection cast in the declare blockers step of the other
 * seat's turn 7 (the life lock too; the seat's permanents phase out). "ring": The One Ring cast in the seat's own turn 6 main
 * phase (no life lock; nothing phases out), then the other seat's turn 7 declare blockers step — the shield lasts until the
 * seat's next turn.
 */
function protectedBoard(kind, opts = {}, seat = "user") {
  const other = seat === "user" ? "ai" : "user";
  const handKey = seat === "user" ? "hand" : "aiHand";
  let s;
  if (kind === "tp") {
    s = cast(board({ ...opts, active: other, priority: seat, [handKey]: [...(opts[handKey] || []), { ...TEFERI, id: "h-tp" }] }), "h-tp", () => true, seat);
  } else {
    const b = board({ ...opts, active: seat, priority: seat, [handKey]: [{ ...RING, id: "h-ring" }] });
    s = cast({ ...b, turn: 6, phase: "precombat-main", step: "main" }, "h-ring", () => true, seat);
    s = { ...s, turn: 7, activePlayer: other, priorityHolder: seat, phase: "combat", step: "declare-blockers",
      players: { ...s.players, [seat]: { ...s.players[seat], hand: opts[handKey] || [], manaPool: { ...FULL } } } };
  }
  expect(playerProtectedFromEverything(s, seat)).toBe(true);
  expect(playerLifeLocked(s, seat)).toBe(kind === "tp");
  return s;
}
/** The combat damage step: each id in `attackers` attacks (the AI's attacks the user unless `by` says otherwise). */
const attack = (s, attackers, blockers = [], { by = "ai", defender = by === "ai" ? "user" : "ai", planeswalker = null } = {}) => ({ ...s, phase: "combat", step: "combat-damage", activePlayer: by,
  combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: by, defender, ...(planeswalker ? { defenderPlaneswalkerId: planeswalker } : {}) })), blockers } });
/** Put the pending triggers on the stack and resolve it (the trigger targets chosen as the engine chooses them). */
function settle(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 10 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
const fight = (s, ...args) => settle(resolveCombatDamage(attack(s, ...args)));
/** Both damage steps (a first or double striker in combat), then the triggers. */
const fightBothSteps = (s, ...args) => settle(resolveCombatDamage(resolveCombatDamage(attack(s, ...args), { firstStrikeStep: true })));
/** What prevented combat damage must not have done: no commander damage, no life gained, no card drawn, no poison. */
function nothingCounted(out) {
  expect(out.players.user.commanderDamageFrom).toEqual({});
  expect(out.players.ai.life).toBe(40);
  expect(out.players.ai.hand).toHaveLength(0);
  expect(out.players.user.poison || 0).toBe(0);
  expect(out.players.user.life).toBe(40);
}
const tokens = (s, seat) => s.players[seat].battlefield.filter((p) => /Inkling/.test(p.card?.name || "")).length;
const combatLog = (s) => s.log.filter((e) => e.kind === "combat-damage").at(-1);
const marked = (s, id) => findPermanent(s, id)?.permanent?.damageMarked || 0;

describe("protection from everything prevents an attacker's combat damage before anything counts it (CR 702.16j)", () => {
  for (const [kind, label] of [["tp", "Teferi's Protection"], ["ring", "The One Ring"]]) {
    describe(label, () => {
      it("⭐ a 2-power commander: no commander damage (CR 903.10a), no life lost", () => {
        const out = fight(protectedBoard(kind, { ai: [CMD("isa", ISAMARU, "ai")] }), ["isa"]);
        nothingCounted(out);
        expect(out.log.some((e) => e.kind === "commander-damage")).toBe(false);
        expect(combatLog(out).playerDamage).toEqual({}); // the step's summary names no player damage
      });
      it("⭐ Kellan, the Kid as the commander (lifelink): no commander damage and its controller gains nothing (CR 702.15b)", () => {
        nothingCounted(fight(protectedBoard(kind, { ai: [CMD("kel", KELLAN, "ai")] }), ["kel"]));
      });
      it("⭐ Vault Skirge (lifelink): its controller gains nothing", () => {
        nothingCounted(fight(protectedBoard(kind, { ai: [P("vs", SKIRGE, "ai")] }), ["vs"]));
      });
      it("⭐ Scroll Thief: \"deals combat damage to a player\" does not trigger (CR 603.2g) — no card drawn", () => {
        const s = protectedBoard(kind, { ai: [P("st", THIEF, "ai")] });
        const hit = resolveCombatDamage(attack(s, ["st"]));
        expect((hit.pendingTriggers || []).filter((t) => t.source?.permanentId === "st")).toHaveLength(0);
        nothingCounted(settle(hit));
      });
      it("⭐ Glistener Elf (infect): no poison counter (CR 702.90b)", () => {
        nothingCounted(fight(protectedBoard(kind, { ai: [P("ge", ELF, "ai")] }), ["ge"]));
      });
      it("⭐ Bilious Skulldweller (toxic 1): no poison counter (CR 702.164c)", () => {
        nothingCounted(fight(protectedBoard(kind, { ai: [P("bs", SKULLDWELLER, "ai")] }), ["bs"]));
      });
      it("⭐ a creature hitting the protected monarch doesn't take the crown (CR 725.2)", () => {
        const out = fight(protectedBoard(kind, { ai: [P("gb", BEARS, "ai")], monarchId: "user" }), ["gb"]);
        expect(out.monarchId).toBe("user");
        nothingCounted(out);
      });
      it("control: the life total holds and the prevention is logged for the protected player", () => {
        const out = fight(protectedBoard(kind, { ai: [CMD("isa", ISAMARU, "ai")] }), ["isa"]);
        expect(out.players.user.life).toBe(40);
        expect(out.log.filter((e) => e.kind === "combat-damage-prevented" && e.playerId === "user"))
          .toEqual([expect.objectContaining({ amount: 2, via: "protection from everything" })]);
      });
    });
  }

  it("⭐ the first-strike damage step too: Kwende, Pride of Femeref (double strike) with Basilisk Collar as the commander — nothing in either step", () => {
    const s = protectedBoard("ring", { ai: wearing("kw", { ...KWENDE, isCommander: true, commanderInstanceId: "cmd-kw" }, "ai", "col", COLLAR) });
    const out = fightBothSteps(s, ["kw"]);
    nothingCounted(out);
    expect(out.log.filter((e) => e.kind === "combat-damage-prevented" && e.playerId === "user").map((e) => e.amount)).toEqual([2, 2]);
  });

  it("control — unprotected, the same attackers count: commander damage, lifelink, the draw, poison, toxic, the crown", () => {
    const out = fight(board({ ai: [CMD("kel", KELLAN, "ai"), P("vs", SKIRGE, "ai"), P("st", THIEF, "ai"), P("ge", ELF, "ai"), P("bs", SKULLDWELLER, "ai")], monarchId: "user" }), ["kel", "vs", "st", "ge", "bs"]);
    expect(out.players.user.commanderDamageFrom).toEqual({ "cmd-kel": 3 });
    expect(out.players.ai.life).toBe(44);
    expect(out.players.ai.hand).toHaveLength(1); // Scroll Thief's card
    expect(out.players.user.poison).toBe(2);
    expect(out.players.user.life).toBe(40 - 3 - 1 - 1 - 1);
    expect(out.monarchId).toBe("ai");
  });

  it("⭐ no prevention shield is spent on damage protection already prevents (CR 616.1 — the affected player's order)", () => {
    let s = board({ ai: [CMD("isa", ISAMARU, "ai")], hand: [{ ...SALVE, id: "h-salve" }, { ...TEFERI, id: "h-tp" }] });
    s = cast(s, "h-salve", (a) => a.chosenMode === 1 && a.targets?.[0]?.id === "user"); // the next 3 damage to the user
    s = cast(s, "h-tp");
    const out = resolveCombatDamage(attack(s, ["isa"]));
    expect(preventionShieldsFor(out)).toEqual([expect.objectContaining({ targetKind: "player", targetId: "user", amount: 3 })]);
    expect(out.players.user.commanderDamageFrom).toEqual({});
  });

  it("⭐ combat damage can't be prevented (Frenzied Baloth, CR 615.12): protection prevents none of it — dealt and counted", () => {
    const ring = fight(protectedBoard("ring", { ai: [CMD("isa", ISAMARU, "ai"), P("bal", BALOTH, "ai")] }), ["isa"]);
    expect(ring.players.user.life).toBe(38);
    expect(ring.players.user.commanderDamageFrom).toEqual({ "cmd-isa": 2 });
    expect(ring.log.some((e) => e.kind === "combat-damage-prevented")).toBe(false);
    // control: Teferi's Protection's life lock ("your life total can't change") still holds the total; the damage is dealt.
    const tp = fight(protectedBoard("tp", { ai: [CMD("isa", ISAMARU, "ai"), P("bal", BALOTH, "ai")] }), ["isa"]);
    expect(tp.players.user.life).toBe(40);
    expect(tp.players.user.commanderDamageFrom).toEqual({ "cmd-isa": 2 });
  });

  it("⭐ the life-locked player was still dealt it: damage taken this turn counts it (its ruling — \"triggers and effects can see that damage was dealt\")", () => {
    const out = fight(protectedBoard("tp", { ai: [P("gi", GIANT, "ai"), P("bal", BALOTH, "ai")] }), ["gi"]);
    expect(out.players.user.life).toBe(40);
    expect(out.players.user.damageTakenThisTurn).toBe(3);
  });

  it("control — the counted shield goes first (Inkshield's tokens, its ruling's order), then protection: no damage dealt", () => {
    let s = board({ ai: [P("gi", GIANT, "ai")], hand: [{ ...INKSHIELD, id: "h-ink" }, { ...TEFERI, id: "h-tp" }] });
    s = cast(s, "h-ink");
    s = cast(s, "h-tp");
    const out = resolveCombatDamage(attack(s, ["gi"]));
    expect(tokens(out, "user")).toBe(3);
    expect(out.players.user.life).toBe(40);
  });

  it("control — the protected player's planeswalker is not protected: an attack on it removes loyalty", () => {
    const s = protectedBoard("ring", { ai: [P("gb", BEARS, "ai")], user: [P("jace", JACE, "user", { counters: { loyalty: 3 } })] });
    const out = fight(s, ["gb"], [], { planeswalker: "jace" });
    expect(findPermanent(out, "jace").permanent.counters.loyalty).toBe(1);
  });
});

describe("protection from everything goes before a redirect onto the player's own creature (CR 616.1, 614.9)", () => {
  it("⭐ Empyrial Archangel: two Colossal Dreadmaws into The One Ring — the Archangel is dealt nothing", () => {
    const out = fight(protectedBoard("ring", { ai: [P("dm1", DREADMAW, "ai"), P("dm2", DREADMAW, "ai")], user: [P("ea", ARCHANGEL, "user")] }), ["dm1", "dm2"]);
    expect(findPermanent(out, "ea")).toBeTruthy();
    expect(marked(out, "ea")).toBe(0);
    expect(out.players.user.life).toBe(40);
  });
  it("⭐ With Great Power . . . on Grizzly Bears: Vampire Nighthawk's hit — the Bears live (no deathtouch) and the AI gains nothing (no lifelink)", () => {
    const out = fight(protectedBoard("ring", { ai: [P("nh", NIGHTHAWK, "ai")], user: wearing("ub", BEARS, "user", "wgp", WITH_GREAT_POWER) }), ["nh"]);
    expect(findPermanent(out, "ub")).toBeTruthy();
    expect(marked(out, "ub")).toBe(0);
    expect(out.players.ai.life).toBe(40);
  });
  it("⭐ Protector of the Crown with a shield counter: Hill Giant's hit — the shield counter is kept", () => {
    const out = fight(protectedBoard("ring", { ai: [P("gi", GIANT, "ai")], user: [P("pc", PROTECTOR, "user", { counters: { shield: 1 } })] }), ["gi"]);
    expect(findPermanent(out, "pc").permanent.counters?.shield).toBe(1);
    expect(marked(out, "pc")).toBe(0);
  });
  it("⭐ Pariah on the user's Grizzly Bears: Hill Giant's hit — the Bears are dealt nothing", () => {
    const out = fight(protectedBoard("ring", { ai: [P("gi", GIANT, "ai")], user: wearing("ub", BEARS, "user", "par", PARIAH) }), ["gi"]);
    expect(findPermanent(out, "ub")).toBeTruthy();
    expect(marked(out, "ub")).toBe(0);
    expect(out.players.user.life).toBe(40);
  });
  it("⭐ noncombat: Guttersnipe's 2 to each opponent — the user's Empyrial Archangel is dealt nothing", () => {
    const s = protectedBoard("ring", { ai: [P("gs", GUTTERSNIPE, "ai")], user: [P("ea", ARCHANGEL, "user")] });
    const out = applyDamageEffect(s, { controller: "ai", amount: 2, targetType: "eachOpponent", source: { id: "gs" } });
    expect(marked(out, "ea")).toBe(0);
    expect(out.players.user.life).toBe(40);
  });
  it("⭐ Inkshield goes before a redirect too (its ruling's order): Protector of the Crown is dealt nothing and 3 Inklings are made", () => {
    const s = cast(board({ ai: [P("gi", GIANT, "ai")], user: [P("pc", PROTECTOR, "user")], hand: [{ ...INKSHIELD, id: "h-ink" }] }), "h-ink");
    const out = resolveCombatDamage(attack(s, ["gi"]));
    expect(tokens(out, "user")).toBe(3);
    expect(marked(out, "pc")).toBe(0);
  });
  it("control — unprotected, the redirect applies: the Archangel is dealt the Dreadmaw's 6 and the user's life holds", () => {
    const out = fight(board({ ai: [P("dm1", DREADMAW, "ai")], user: [P("ea", ARCHANGEL, "user")] }), ["dm1"]);
    expect(marked(out, "ea")).toBe(6);
    expect(out.players.user.life).toBe(40);
  });
});

describe("assignment avoids a player whose damage is all prevented (CR 702.19b, 510.1c — the engine assigns for a person too)", () => {
  it("⭐ the user's Colossal Dreadmaw with Basilisk Collar, blocked by Grizzly Bears, into the AI's One Ring: all 6 to the Bears, the user gains 6", () => {
    const s = protectedBoard("ring", { user: wearing("dm", DREADMAW, "user", "col", COLLAR), ai: [P("ab", BEARS, "ai")] }, "ai");
    const out = fight(s, ["dm"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "dm" }], { by: "user" });
    expect(out.players.user.life).toBe(46);
    expect(findPermanent(out, "ab")).toBeNull();
    expect(out.players.ai.life).toBe(40);
    expect(out.log.some((e) => e.kind === "combat-damage-prevented" && e.playerId === "ai")).toBe(false); // none of it assigned to the AI
  });
  it("⭐ Thorn Elemental blocked by two Grizzly Bears into the AI's One Ring: it assigns to the blockers — both Bears die", () => {
    const s = protectedBoard("ring", { user: [P("te", THORN, "user")], ai: [P("ab1", BEARS, "ai"), P("ab2", BEARS, "ai")] }, "ai");
    const out = fight(s, ["te"], [{ blockerId: "ab1", blockingPlayer: "ai", attackerId: "te" }, { blockerId: "ab2", blockingPlayer: "ai", attackerId: "te" }], { by: "user" });
    expect(findPermanent(out, "ab1")).toBeNull();
    expect(findPermanent(out, "ab2")).toBeNull();
  });
  const plusCounters = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;
  it("⭐ no open blocker — the AI's Vigor walls its Grizzly Bears: the Dreadmaw's excess still goes to the protected AI, the Bears get only their 2 (not 6)", () => {
    const s = protectedBoard("ring", { user: [P("dm", DREADMAW, "user")], ai: [P("ab", BEARS, "ai"), P("vig", VIGOR, "ai")] }, "ai");
    const out = fight(s, ["dm"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "dm" }], { by: "user" });
    expect(plusCounters(out, "ab")).toBe(2);
    expect(out.players.ai.life).toBe(40);
  });
  it("⭐ no open blocker — Panther Habit on the AI's Grizzly Bears: the Bears get only their 2 (not 6)", () => {
    const s = protectedBoard("ring", { user: [P("dm", DREADMAW, "user")], ai: wearing("ab", BEARS, "ai", "ph", PANTHER_HABIT) }, "ai");
    const out = fight(s, ["dm"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "dm" }], { by: "user" });
    expect(plusCounters(out, "ab")).toBe(2);
  });
  it("⭐ no open blocker — Thorn Elemental blocked by the Vigor-walled Bears still assigns as though unblocked: the Bears get no counters (not 7)", () => {
    const s = protectedBoard("ring", { user: [P("te", THORN, "user")], ai: [P("ab", BEARS, "ai"), P("vig", VIGOR, "ai")] }, "ai");
    const out = fight(s, ["te"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "te" }], { by: "user" });
    expect(plusCounters(out, "ab")).toBe(0);
  });
  it("⭐ the defender's own Inkshield (its tokens are the defender's): the Dreadmaw with Basilisk Collar puts all 6 on the Bears — no Inklings, the user gains 6", () => {
    const s = cast(protectedBoard("ring", { user: wearing("dm", DREADMAW, "user", "col", COLLAR), ai: [P("ab", BEARS, "ai")], aiHand: [{ ...INKSHIELD, id: "h-ink" }] }, "ai"), "h-ink", () => true, "ai");
    const out = fight(s, ["dm"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "dm" }], { by: "user" });
    expect(tokens(out, "ai")).toBe(0);
    expect(out.players.user.life).toBe(46);
    expect(findPermanent(out, "ab")).toBeNull();
  });
  it("⭐ the defender's own Inkshield: Thorn Elemental blocked by two Grizzly Bears assigns to them — both die, no Inklings", () => {
    const s = cast(protectedBoard("ring", { user: [P("te", THORN, "user")], ai: [P("ab1", BEARS, "ai"), P("ab2", BEARS, "ai")], aiHand: [{ ...INKSHIELD, id: "h-ink" }] }, "ai"), "h-ink", () => true, "ai");
    const out = fight(s, ["te"], [{ blockerId: "ab1", blockingPlayer: "ai", attackerId: "te" }, { blockerId: "ab2", blockingPlayer: "ai", attackerId: "te" }], { by: "user" });
    expect(tokens(out, "ai")).toBe(0);
    expect(findPermanent(out, "ab1")).toBeNull();
    expect(findPermanent(out, "ab2")).toBeNull();
  });
  it("control — unprotected, the trampler's excess goes to the player and Thorn Elemental assigns as though unblocked", () => {
    const tr = fight(board({ user: wearing("dm", DREADMAW, "user", "col", COLLAR), ai: [P("ab", BEARS, "ai")], active: "user" }), ["dm"], [{ blockerId: "ab", blockingPlayer: "ai", attackerId: "dm" }], { by: "user" });
    expect({ ai: tr.players.ai.life, user: tr.players.user.life }).toEqual({ ai: 35, user: 46 });
    const te = fight(board({ user: [P("te", THORN, "user")], ai: [P("ab1", BEARS, "ai"), P("ab2", BEARS, "ai")], active: "user" }), ["te"], [{ blockerId: "ab1", blockingPlayer: "ai", attackerId: "te" }, { blockerId: "ab2", blockingPlayer: "ai", attackerId: "te" }], { by: "user" });
    expect({ ai: te.players.ai.life, ab1: !!findPermanent(te, "ab1"), ab2: !!findPermanent(te, "ab2") }).toEqual({ ai: 33, ab1: true, ab2: true });
  });
});

describe("a player protected from everything can't be the target of spells or abilities — their own included (CR 702.16j)", () => {
  const PLAYER_TARGETS = (acts, pid) => acts.filter((a) => (a.targets || []).some((t) => t.type === "player" && t.id === pid));
  it("⭐ under The One Ring the user isn't offered Healing Salve's or Shock's player target on themselves; the AI still is", () => {
    const b = board({ hand: [{ ...SALVE, id: "h-salve" }, { ...SHOCK, id: "h-shock" }, { ...RING, id: "h-ring" }], active: "user", priority: "user" });
    const s = cast({ ...b, turn: 6, phase: "precombat-main", step: "main" }, "h-ring");
    expect(playerProtectedFromEverything(s, "user")).toBe(true);
    expect(PLAYER_TARGETS(castOffers(s, "h-salve"), "user")).toHaveLength(0);
    expect(PLAYER_TARGETS(castOffers(s, "h-shock"), "user")).toHaveLength(0);
    expect(PLAYER_TARGETS(castOffers(s, "h-salve"), "ai").length).toBeGreaterThan(0);
    expect(PLAYER_TARGETS(castOffers(s, "h-shock"), "ai").length).toBeGreaterThan(0);
  });
  it("⭐ a spell already targeting them has an illegal target once protection arrives (its ruling): Healing Salve on herself, The Stasis Coffin in response — no life gained", () => {
    let s = board({ user: [P("cof", COFFIN, "user")], hand: [{ ...SALVE, id: "h-salve" }], active: "user", priority: "user" });
    s = { ...s, phase: "precombat-main", step: "main" };
    const salve = castOffers(s, "h-salve").find((a) => a.chosenMode === 0 && a.targets?.[0]?.id === "user");
    expect(salve).toBeTruthy();
    s = flushTriggers(dispatchAction(s, salve));
    const coffin = legalActionsForPlayer({ ...s, priorityHolder: "user" }, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cof");
    expect(coffin, "The Stasis Coffin's ability is offered").toBeTruthy();
    s = flushTriggers(dispatchAction({ ...s, priorityHolder: "user" }, coffin));
    for (let g = 0; g < 6 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s));
    expect(playerProtectedFromEverything(s, "user")).toBe(true);
    expect(s.players.user.life).toBe(40);
  });
  it("control — unprotected, the user is offered both on themselves", () => {
    const s = { ...board({ hand: [{ ...SALVE, id: "h-salve" }, { ...SHOCK, id: "h-shock" }], active: "user", priority: "user" }), phase: "precombat-main", step: "main" };
    expect(PLAYER_TARGETS(castOffers(s, "h-salve"), "user").length).toBeGreaterThan(0);
    expect(PLAYER_TARGETS(castOffers(s, "h-shock"), "user").length).toBeGreaterThan(0);
  });
});

describe("the other combat prevention paths deal — and count — only what is left (audit pins)", () => {
  const ATTACKERS = () => [CMD("kel", KELLAN, "ai"), P("st", THIEF, "ai"), P("ge", ELF, "ai")];
  for (const [label, card] of [["Fog — all combat damage this turn", FOG], ["Defend the Hearth — combat damage to players", DEFEND], ["Riot Control — all damage to you this turn", RIOT_CONTROL]]) {
    it(`${label}: no commander damage, lifelink, draw, poison or crown`, () => {
      let s = cast(board({ ai: ATTACKERS(), hand: [{ ...card, id: "h-card" }], monarchId: "user" }), "h-card");
      s = { ...s, players: { ...s.players, user: { ...s.players.user, life: 40 } } }; // Riot Control's own life gain aside
      const out = fight(s, ["kel", "st", "ge"]);
      nothingCounted(out);
      expect(out.monarchId).toBe("user");
    });
  }
  it("Healing Salve's \"prevent the next 3\": Captain America, First Avenger (4) deals — and counts — 1", () => {
    const s = cast(board({ ai: [CMD("cap", CAPTAIN, "ai")], hand: [{ ...SALVE, id: "h-salve" }] }), "h-salve", (a) => a.chosenMode === 1 && a.targets?.[0]?.id === "user");
    const out = fight(s, ["cap"]);
    expect(out.players.user.life).toBe(39);
    expect(out.players.user.commanderDamageFrom).toEqual({ "cmd-cap": 1 });
  });
  it("Gisela's \"prevent half that damage, rounded up\": Kellan, the Kid (3, lifelink) deals — and counts — 1", () => {
    const out = fight(board({ ai: [CMD("kel", KELLAN, "ai")], user: [P("gis", GISELA, "user")] }), ["kel"]);
    expect(out.players.user.life).toBe(39);
    expect(out.players.user.commanderDamageFrom).toEqual({ "cmd-kel": 1 });
    expect(out.players.ai.life).toBe(41);
  });
  it("Defang on the attackers (the dealer's wall): nothing dealt, nothing counted", () => {
    const s = board({ ai: [...wearing("kel", { ...KELLAN, isCommander: true, commanderInstanceId: "cmd-kel" }, "ai", "df1", DEFANG, "user"), ...wearing("st", THIEF, "ai", "df2", DEFANG, "user")], monarchId: "user" });
    const out = fight(s, ["kel", "st"]);
    nothingCounted(out);
    expect(out.monarchId).toBe("user");
  });
  it("protection from black on the blocker (Mirran Crusader vs Vampire Nighthawk): no lifelink, no deathtouch kill (CR 702.16e)", () => {
    const st = fightBothSteps(board({ ai: [P("nh", NIGHTHAWK, "ai")], user: [P("mc", CRUSADER, "user")] }), ["nh"], [{ blockerId: "mc", blockingPlayer: "user", attackerId: "nh" }]);
    expect(findPermanent(st, "mc")).toBeTruthy();
    expect(marked(st, "mc")).toBe(0);
    expect(st.players.ai.life).toBe(40);
  });
  it("protection from black on the attacker (the Crusader blocked by the Nighthawk): the blocker's damage back gains nothing", () => {
    const st = fightBothSteps(board({ ai: [P("nh", NIGHTHAWK, "ai")], user: [P("mc", CRUSADER, "user")], active: "user" }), ["mc"], [{ blockerId: "nh", blockingPlayer: "ai", attackerId: "mc" }], { by: "user" });
    expect(findPermanent(st, "mc")).toBeTruthy();
    expect(st.players.ai.life).toBe(40);
  });
  it("protection from green on the blocker (Cystbearer, infect — it survives the first strike and deals its 2): no -1/-1 counters (CR 702.90c)", () => {
    const st = fightBothSteps(board({ ai: [P("cb", CYSTBEARER, "ai")], user: [P("mc", CRUSADER, "user")] }), ["cb"], [{ blockerId: "mc", blockingPlayer: "user", attackerId: "cb" }]);
    expect(findPermanent(st, "mc")).toBeTruthy();
    expect(findPermanent(st, "mc").permanent.counters?.["-1/-1"] || 0).toBe(0);
  });
  it("protection from black on the blocker (Toxin Sliver): \"deals combat damage to a creature\" does not trigger", () => {
    let st = attack(board({ ai: [P("tx", TOXIN, "ai")], user: [P("mc", CRUSADER, "user")] }), ["tx"], [{ blockerId: "mc", blockingPlayer: "user", attackerId: "tx" }]);
    st = resolveCombatDamage(resolveCombatDamage(st, { firstStrikeStep: true }));
    expect((st.pendingTriggers || []).filter((t) => t.source?.permanentId === "tx")).toHaveLength(0);
    expect(findPermanent(settle(st), "mc")).toBeTruthy();
  });
  it("a shield counter on the blocker (CR 122.1c): no lifelink, no deathtouch kill, the shield spent", () => {
    const out = fight(board({ ai: [P("nh", NIGHTHAWK, "ai")], user: [P("ub", BEARS, "user", { counters: { shield: 1 } })] }), ["nh"], [{ blockerId: "ub", blockingPlayer: "user", attackerId: "nh" }]);
    expect(findPermanent(out, "ub")).toBeTruthy();
    expect(findPermanent(out, "ub").permanent.counters?.shield || 0).toBe(0);
    expect(out.players.ai.life).toBe(40);
  });
});

describe("noncombat damage to a protected player is prevented before the tally (audit pins — dealDamageToPlayer)", () => {
  const snipe = (aura, auraCard, controller = "ai") => wearing("gs", GUTTERSNIPE, "ai", aura, auraCard, controller);
  const burn = (s) => applyDamageEffect(s, { controller: "ai", amount: 2, targetType: "eachOpponent", source: { id: "gs" } });
  for (const kind of ["tp", "ring"]) {
    it(`${kind}: a lifelink source (Basilisk Collar) gains nothing; an infect source (Phyresis) gives no poison; Curiosity doesn't trigger`, () => {
      expect(settle(burn(protectedBoard(kind, { ai: snipe("col", COLLAR) }))).players.ai.life).toBe(40);
      expect(settle(burn(protectedBoard(kind, { ai: snipe("phy", PHYRESIS) }))).players.user.poison || 0).toBe(0);
      expect(burn(protectedBoard(kind, { ai: snipe("cur", CURIOSITY) })).pendingTriggers || []).toHaveLength(0);
    });
  }
  it("control — unprotected, each counts", () => {
    expect(settle(burn(board({ ai: snipe("col", COLLAR) }))).players.ai.life).toBe(42);
    expect(settle(burn(board({ ai: snipe("phy", PHYRESIS) }))).players.user.poison).toBe(2);
    expect(burn(board({ ai: snipe("cur", CURIOSITY) })).pendingTriggers).toHaveLength(1);
  });
});
