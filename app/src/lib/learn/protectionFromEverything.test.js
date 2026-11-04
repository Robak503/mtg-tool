/**
 * protectionFromEverything.test.js — "protection from everything" on a PERMANENT (CR 702.16j) was not enforced: protection.js read colour
 * qualities and the "creatures" class only, so Progenitus — credited native-body — could be targeted by a Lightning Bolt (by a person and
 * by the AI), was dealt its 3 damage, was offered as a copy's new target, could be equipped, could be blocked, and kept an Aura or
 * Equipment that reached it. Enforced now through one layer-aware reader beside the colour and class ones,
 * layers.permanentProtectedFromEverything: printed (Progenitus), inside a level band (Hexdrinker at LEVEL 8+), or granted (a layer-6
 * addProtection op with `everything` — no printed grant is parsed yet, so the grant here is written directly, as the colour slice wrote
 * its planeswalker's).
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 702.16j — "A permanent or player with protection from everything has protection from each object regardless of that object's
 *     characteristic values. Such a permanent or player can't be targeted by spells or abilities and can't be enchanted by Auras. Such a
 *     permanent can't be equipped by Equipment, fortified by Fortifications, or blocked by creatures. All damage that would be dealt to
 *     such a permanent or player is prevented."
 *   · CR 702.16c / 702.16d, 704.5m / 704.5n — an attached Aura goes to its owner's graveyard, an Equipment becomes unattached, as a
 *     state-based action. CR 701.3b — an attach to an object it can't be attached to doesn't happen; CR 303.4g — an Aura with nothing
 *     legal to enchant stays where it is.
 *   · CR 608.2b — a target that gained it in response is illegal at resolution. CR 615.12 — "can't be prevented" (combat's form only).
 *   · CR 711.2a — a level band's abilities exist only while the level counters are inside the band.
 *   · The bundled rulings: Progenitus — "can't be blocked, … can't be enchanted or equipped, … can't be the target of spells or
 *     abilities, and all damage that would be dealt to Progenitus is prevented"; "can still be affected by effects that don't target it
 *     or deal damage to it (such as Day of Judgment)". Hexdrinker — "Once it has eight or more level counters, it's 6/6 and has
 *     protection from everything."
 *
 * Non-targeted effects still apply (controls, the same on both trees): a Wrath destroys it, -X/-X shrinks it, an edict sacrifices it. The
 * player's protection from everything (Teferi's Protection) is unchanged (a control).
 *
 * Card text: the bundled Scryfall oracle (scryfall-bulk/oracle_cards.json, read 2026-11-04), never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { createGameState, createPermanent, creaturePower, findPermanent, playerProtectedFromEverything, _resetIdsForTests } from "./gameState.js";
import { addContinuousEffect, expireContinuousEffects } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { checkAllStateBasedActions } from "./sba.js";
import { auraEntryHosts } from "./auraEntry.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle ──
const PROGENITUS = {"name":"Progenitus","type":"Legendary Creature — Hydra Avatar","mana":"{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}","cmc":10,"power":"10","toughness":"10","loyalty":null,"keywords":["Protection"],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"layout":"normal","oracle":"Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead."}; // EDHREC #6631
const HEXDRINKER = {"name":"Hexdrinker","type":"Creature — Snake","mana":"{G}","cmc":1,"power":"2","toughness":"1","loyalty":null,"keywords":["Level Up","Protection"],"colors":["G"],"colorIdentity":["G"],"layout":"leveler","oracle":"Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 3-7\n4/4\nProtection from instants\nLEVEL 8+\n6/6\nProtection from everything"}; // EDHREC #10056
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"Lightning Bolt deals 3 damage to any target."}; // EDHREC #157
const FLAME_SLASH = {"name":"Flame Slash","type":"Sorcery","mana":"{R}","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"Flame Slash deals 4 damage to target creature."}; // EDHREC #7746
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"Pyroclasm deals 2 damage to each creature."}; // EDHREC #7698
const FLAMETONGUE_KAVU = {"name":"Flametongue Kavu","type":"Creature — Kavu","mana":"{3}{R}","cmc":4,"power":"4","toughness":"2","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":"When this creature enters, it deals 4 damage to target creature."}; // EDHREC #13122
const TWINCAST = {"name":"Twincast","type":"Instant","mana":"{U}{U}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"layout":"normal","oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."}; // EDHREC #6265
const CLONE = {"name":"Clone","type":"Creature — Shapeshifter","mana":"{3}{U}","cmc":4,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"layout":"normal","oracle":"You may have this creature enter as a copy of any creature on the battlefield."}; // EDHREC #3711
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // EDHREC #5236
const SHIELDED_BY_FAITH = {"name":"Shielded by Faith","type":"Enchantment — Aura","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Enchant creature\nEnchanted creature has indestructible.\nWhenever a creature enters, you may attach this Aura to that creature."}; // EDHREC #3283
const DRAGON_FANGS = {"name":"Dragon Fangs","type":"Enchantment — Aura","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"],"layout":"normal","oracle":"Enchant creature\nEnchanted creature gets +1/+1 and has trample.\nWhen a creature with mana value 6 or greater enters, you may return this card from your graveyard to the battlefield attached to that creature."}; // EDHREC #18012
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"layout":"normal","oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // EDHREC #11010
const HERO_S_BLADE = {"name":"Hero's Blade","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"layout":"normal","oracle":"Equipped creature gets +3/+2.\nWhenever a legendary creature you control enters, you may attach this Equipment to it.\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)"}; // EDHREC #1865
const WRATH_OF_GOD = {"name":"Wrath of God","type":"Sorcery","mana":"{2}{W}{W}","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Destroy all creatures. They can't be regenerated."}; // EDHREC #677
const MASSACRE_WURM = {"name":"Massacre Wurm","type":"Creature — Phyrexian Wurm","mana":"{3}{B}{B}{B}","cmc":6,"power":"6","toughness":"5","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"],"layout":"normal","oracle":"When this creature enters, creatures your opponents control get -2/-2 until end of turn.\nWhenever a creature an opponent controls dies, that player loses 2 life."}; // EDHREC #512
const DIABOLIC_EDICT = {"name":"Diabolic Edict","type":"Instant","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"],"layout":"normal","oracle":"Target player sacrifices a creature of their choice."}; // EDHREC #11163
const TEFERI_S_PROTECTION = {"name":"Teferi's Protection","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection."}; // EDHREC #109
const MANTLE_OF_THE_ANCIENTS = {"name":"Mantle of the Ancients","type":"Enchantment — Aura","mana":"{3}{W}{W}","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Enchant creature you control\nWhen this Aura enters, return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature.\nEnchanted creature gets +1/+1 for each Aura and Equipment attached to it."}; // EDHREC #1414
const CAPTAIN_AMERICA_FIRST_AVENGER = {"name":"Captain America, First Avenger","type":"Legendary Creature — Human Soldier Hero","mana":"{R}{W}{U}","cmc":3,"power":"4","toughness":"4","loyalty":null,"keywords":["Throw ...","... Catch"],"colors":["R","U","W"],"colorIdentity":["R","U","W"],"layout":"normal","oracle":"Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America."}; // EDHREC #7821
const VEXILUS_PRAETOR = {"name":"Vexilus Praetor","type":"Creature — Custodes Warrior","mana":"{3}{W}","cmc":4,"power":"3","toughness":"4","loyalty":null,"keywords":["Aegis of the Emperor","Vigilance","Flash"],"colors":["W"],"colorIdentity":["W"],"layout":"normal","oracle":"Flash\nVigilance\nAegis of the Emperor — Commanders you control have protection from everything."}; // EDHREC #4317
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"],"layout":"normal","oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // EDHREC #844
const KASMINA_S_TRANSMUTATION = {"name":"Kasmina's Transmutation","type":"Enchantment — Aura","mana":"{1}{U}","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"],"layout":"normal","oracle":"Enchant creature\nEnchanted creature loses all abilities and has base power and toughness 1/1."}; // EDHREC #7513
const BOON_SATYR = {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","cmc":3,"power":"4","toughness":"2","loyalty":null,"keywords":["Bestow","Flash"],"colors":["G"],"colorIdentity":["G"],"layout":"normal","oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2."}; // EDHREC #16813
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"],"layout":"normal","oracle":""}; // EDHREC #8126
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"layout":"normal","oracle":""}; // EDHREC #29123

// ── boards ──
const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...extra });
const C = (id, card) => ({ id, ...card });
const LIB = (pid) => Array.from({ length: 6 }, (_, i) => C(`${pid}-lib${i}`, GRIZZLY_BEARS));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
/** `host` with `attachments` attached — both links, as gameState.attachPermanent forms them. */
function attach(host, ...attachments) {
  return [{ ...host, attachments: [...(host.attachments || []), ...attachments.map((a) => a.id)] }, ...attachments.map((a) => ({ ...a, attachedTo: host.id }))];
}
/** A two-seat game in `active`'s precombat main phase, the stack empty, both pools full; `humans` is state.humanSeats. */
function duel({ user = [], ai = [], userHand = [], aiHand = [], userGy = [], active = "user", humans = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, ...(humans ? { humanSeats: humans } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active,
    consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] },
    players: {
      ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand: userHand, graveyard: userGy, library: LIB("user"), manaPool: { ...g.players.user.manaPool, ...FULL } },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, graveyard: [], library: LIB("ai"), manaPool: { ...g.players.ai.manaPool, ...FULL } },
    },
  };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const targetIdsOf = (s, pid, cardId) => [...new Set(offered(s, pid, "cast-spell").filter((a) => a.cardId === cardId).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
/** Both seats pass until the stack is empty. */
function resolveAll(s) {
  let cur = s;
  for (let g = 0; g < 30 && cur.stack.length; g++) cur = pass(cur);
  return cur;
}
const perm = (s, id) => findPermanent(s, id)?.permanent ?? null;
const ids = (ts) => (ts || []).map((t) => t.id).join("+");
const libraryIds = (s, pid) => s.players[pid].library.map((c) => c.id);
const graveyardIds = (s, pid) => s.players[pid].graveyard.map((c) => c.id);
/** A granted protection from everything on `id` until end of turn — the layer-6 op the reader honours (no printed grant is parsed yet). */
const grantEverything = (s, id) => addContinuousEffect(s, {
  layer: 6, op: { layerOp: "addProtection", everything: true }, affects: { mode: "fixed", permanentIds: [id] },
  duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, cardName: "a grant", controller: "user" },
}).state;
/** The person's driver stop (learnSession). */
const session = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });

describe("TARGET (CR 702.16j — can't be targeted by spells or abilities): every seat, every offer, and the CR 608.2b re-check", () => {
  it("control (the same on both trees): Vexilus Praetor's \"Commanders you control have protection from everything\" is not its OWN protection (and its grant is not modeled — body-only): the person's Bolt is offered the Praetor", () => {
    const s = duel({ ai: [P("vex", VEXILUS_PRAETOR, "ai")], userHand: [C("bolt", LIGHTNING_BOLT)] });
    expect(targetIdsOf(s, "user", "bolt")).toEqual(["ai", "user", "vex"]);
  });

  it("⭐ the person's Lightning Bolt: Progenitus (the AI's) is never offered — the players are", () => {
    const s = duel({ ai: [P("prog", PROGENITUS, "ai")], userHand: [C("bolt", LIGHTNING_BOLT)] });
    const row = targetIdsOf(s, "user", "bolt");
    console.log(`  WITNESS bolt-person ${JSON.stringify(row)}`);
    expect(row).toEqual(["ai", "user"]);
  });

  it("⭐ the AI's Lightning Bolt: the person's Progenitus is never offered — the players and its own Bears are", () => {
    const s = duel({ user: [P("prog", PROGENITUS, "user")], ai: [P("abear", GRIZZLY_BEARS, "ai")], aiHand: [C("aibolt", LIGHTNING_BOLT)], active: "ai" });
    const row = targetIdsOf(s, "ai", "aibolt");
    console.log(`  WITNESS bolt-ai ${JSON.stringify(row)}`);
    expect(row).toEqual(["abear", "ai", "user"]);
  });

  it("⭐ its own controller can't target it either: the person's Flame Slash offers their Bears, not their Progenitus", () => {
    const s = duel({ user: [P("prog", PROGENITUS, "user"), P("ubear", GRIZZLY_BEARS, "user")], userHand: [C("slash", FLAME_SLASH)] });
    expect(targetIdsOf(s, "user", "slash")).toEqual(["ubear"]);
  });

  it("⭐ a triggered ability (the AI's Flametongue Kavu, its only other creature the person's Progenitus): the trigger must target the Kavu itself — Progenitus is dealt nothing", () => {
    const s0 = duel({ user: [P("prog", PROGENITUS, "user")], aiHand: [C("ftk", FLAMETONGUE_KAVU)], active: "ai" });
    const end = resolveAll(act(s0, "ai", "cast-spell", (a) => a.cardId === "ftk"));
    const row = { progDamage: perm(end, "prog")?.damageMarked ?? null, kavuOnBattlefield: end.players.ai.battlefield.some((p) => p.card?.name === "Flametongue Kavu") };
    console.log(`  WITNESS ftk-trigger ${JSON.stringify(row)}`);
    expect(row).toEqual({ progDamage: 0, kavuOnBattlefield: false });
  });

  it("⭐ a copy's new targets (CR 707.10c): the person's Twincast of the AI's Bolt (at the person) offers keep and the players — never the AI's Progenitus", () => {
    const s0 = duel({ humans: ["user"], ai: [P("prog", PROGENITUS, "ai")], userHand: [C("twin", TWINCAST), C("bolt", LIGHTNING_BOLT)], aiHand: [C("aibolt", LIGHTNING_BOLT)], active: "ai" });
    const s1 = { ...act(s0, "ai", "cast-spell", (a) => a.cardId === "aibolt" && ids(a.targets) === "user"), priorityHolder: "user", consecutivePasses: 0 };
    const boltId = s1.stack.find((o) => o.source?.name === "Lightning Bolt").id;
    const first = advanceUntilDecision(session(s1));
    const twin = (first.decision?.options || []).find((a) => a.kind === "cast-spell" && a.cardId === "twin" && ids(a.targets) === boltId);
    let r = applyChoice(first.session, twin);
    for (let k = 0; k < 10 && Array.isArray(r.decision?.options); k++) r = applyChoice(r.session, r.decision.options.find((a) => a.kind === "pass-priority"));
    const rows = (r.decision?.candidates || []).map((c) => (c.keep ? `keep:${ids(c.targets)}` : ids(c.targets)));
    console.log(`  WITNESS twincast-rows ${JSON.stringify({ kind: r.decision?.kind, rows })}`);
    expect({ kind: r.decision?.kind, rows: [...rows].sort() }).toEqual({ kind: "copy-targets", rows: ["ai", "keep:user"] });
  });

  it("⭐ a Clone that entered as a copy of Progenitus has it too (CR 707.2): the person's Bolt offers neither", () => {
    const s0 = duel({ humans: ["user"], user: [P("prog", PROGENITUS, "user")], aiHand: [C("clone", CLONE)], active: "ai" });
    // The AI casts Clone; the driver settles its copy choice (the only creature: Progenitus) and resolves it.
    const s1 = advanceUntilDecision(session(resolveAll(act(s0, "ai", "cast-spell", (a) => a.cardId === "clone")))).session.state;
    const cloneId = s1.players.ai.battlefield.find((p) => p.card?.name === "Progenitus")?.id ?? null;
    const s2 = { ...s1, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingChoice: null,
      players: { ...s1.players, user: { ...s1.players.user, hand: [C("bolt", LIGHTNING_BOLT)], manaPool: { ...s1.players.user.manaPool, ...FULL } } } };
    const row = { cloneIsProgenitus: cloneId != null, offered: targetIdsOf(s2, "user", "bolt") };
    console.log(`  WITNESS clone-of-progenitus ${JSON.stringify(row)}`);
    expect(row).toEqual({ cloneIsProgenitus: true, offered: ["ai", "user"] });
  });

  it("⭐ the CR 608.2b re-check: the person's Bolt at the AI's Hill Giant, which then gains protection from everything — the Bolt does nothing, the Giant is unharmed", () => {
    const s0 = duel({ ai: [P("giant", HILL_GIANT, "ai")], userHand: [C("bolt", LIGHTNING_BOLT)] });
    const cast = act(s0, "user", "cast-spell", (a) => a.cardId === "bolt" && ids(a.targets) === "giant");
    const end = resolveAll(grantEverything(cast, "giant"));
    const row = { giant: !!perm(end, "giant"), damage: perm(end, "giant")?.damageMarked ?? null, fizzled: (end.log || []).some((e) => e.kind === "spell-fizzle" && e.source === "Lightning Bolt") };
    console.log(`  WITNESS recheck ${JSON.stringify(row)}`);
    expect(row).toEqual({ giant: true, damage: 0, fizzled: true });
  });
});

describe("DAMAGE (CR 702.16j — all damage that would be dealt to it is prevented): non-targeted and combat damage", () => {
  it("⭐ Pyroclasm: 2 damage to each creature — the person's Bears die, the AI's Progenitus is dealt none", () => {
    const s0 = duel({ user: [P("ubear", GRIZZLY_BEARS, "user")], ai: [P("prog", PROGENITUS, "ai")], userHand: [C("pyro", PYROCLASM)] });
    const end = resolveAll(act(s0, "user", "cast-spell", (a) => a.cardId === "pyro"));
    const row = { progDamage: perm(end, "prog")?.damageMarked ?? null, bears: !!perm(end, "ubear") };
    console.log(`  WITNESS pyroclasm ${JSON.stringify(row)}`);
    expect(row).toEqual({ progDamage: 0, bears: false });
  });

  it("⭐ combat: the AI's Progenitus blocks the person's attacking Hill Giant — Progenitus is dealt none, the Giant dies", () => {
    const s0 = duel({ user: [P("giant", HILL_GIANT, "user", { tapped: true, attackedThisTurn: true })], ai: [P("prog", PROGENITUS, "ai")] });
    const done = resolveCombatDamage({ ...s0, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "giant", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "prog", blockingPlayer: "ai", attackerId: "giant" }] } });
    const row = { progDamage: perm(done, "prog")?.damageMarked ?? null, giant: !!perm(done, "giant") };
    console.log(`  WITNESS combat-blocker ${JSON.stringify(row)}`);
    expect(row).toEqual({ progDamage: 0, giant: false });
  });
});

describe("ATTACHMENTS — no Aura, no Equipment (CR 702.16j, 702.16c, 702.16d, 704.5m, 704.5n, 701.3b, 303.4g): nothing is attached to it, and what is falls off", () => {
  it("⭐ Equip: the person's Bonesplitter is offered onto their Bears, never onto their Progenitus", () => {
    const s = duel({ user: [P("prog", PROGENITUS, "user"), P("ubear", GRIZZLY_BEARS, "user"), P("bs", BONESPLITTER, "user")] });
    const row = offered(s, "user", "activate-ability").filter((a) => a.permanentId === "bs").map((a) => ids(a.targets)).sort();
    console.log(`  WITNESS equip-offer ${JSON.stringify(row)}`);
    expect(row).toEqual(["ubear"]);
  });

  /** The person casts Progenitus through the session driver, takes every "you may" it is asked (the attach-on-enter triggers), and lets
   *  the stack resolve; returns the final state. */
  function castProgenitusTakingEveryMay(s0) {
    let r = advanceUntilDecision(session(s0));
    r = applyChoice(r.session, (r.decision?.options || []).find((a) => a.kind === "cast-spell" && a.cardId === "prog"));
    for (let k = 0; k < 30; k++) {
      if (r.decision?.kind === "optional-effect") { r = applyPendingChoice(r.session, { kind: "optional-effect", take: true }); continue; }
      const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass || !(r.session.state.stack || []).length) break;
      r = applyChoice(r.session, pass);
    }
    return r.session.state;
  }

  it("⭐ Hero's Blade (\"Whenever a legendary creature you control enters, you may attach this Equipment to it\"), on the person's Bears: their Progenitus enters and they take the attach — the Blade doesn't move, it stays on the Bears (CR 701.3b; not moved and then unattached)", () => {
    const [ubear, blade] = attach(P("ubear", GRIZZLY_BEARS, "user"), P("blade", HERO_S_BLADE, "user"));
    const end = castProgenitusTakingEveryMay(duel({ humans: ["user"], user: [ubear, blade], userHand: [C("prog", PROGENITUS)] }));
    const progId = end.players.user.battlefield.find((x) => x.card?.name === "Progenitus")?.id ?? null; // a new permanent id
    const row = { prog: progId != null, bladeOn: perm(end, "blade")?.attachedTo ?? null, bladeOnProgenitus: perm(end, "blade")?.attachedTo === progId };
    console.log(`  WITNESS heros-blade ${JSON.stringify(row)}`);
    expect(row).toEqual({ prog: true, bladeOn: "ubear", bladeOnProgenitus: false });
  });

  it("⭐ Shielded by Faith (\"Whenever a creature enters, you may attach this Aura to that creature\"), on the person's Bears: their Progenitus enters and they take the attach — the Aura stays on the Bears (CR 701.3b)", () => {
    const [ubear, sbf] = attach(P("ubear", GRIZZLY_BEARS, "user"), P("sbf", SHIELDED_BY_FAITH, "user"));
    const end = castProgenitusTakingEveryMay(duel({ humans: ["user"], user: [ubear, sbf], userHand: [C("prog", PROGENITUS)] }));
    const progId = end.players.user.battlefield.find((x) => x.card?.name === "Progenitus")?.id ?? null; // a new permanent id
    const row = { prog: progId != null, auraOn: perm(end, "sbf")?.attachedTo ?? null, auraOnProgenitus: perm(end, "sbf")?.attachedTo === progId };
    console.log(`  WITNESS shielded-by-faith ${JSON.stringify(row)}`);
    expect(row).toEqual({ prog: true, auraOn: "ubear", auraOnProgenitus: false });
  });

  it("⭐ Dragon Fangs in the person's graveyard (\"When a creature with mana value 6 or greater enters, you may return this card … attached to that creature\"): their Progenitus (mana value 10) enters and they take the return — the Aura never enters, it stays in the graveyard (CR 303.4g; not entered and then put back)", () => {
    const end = castProgenitusTakingEveryMay(duel({ humans: ["user"], userHand: [C("prog", PROGENITUS)], userGy: [C("fangs", DRAGON_FANGS)] }));
    const returnEvent = (end.log || []).find((e) => e.effect === "gy-self-attach-return");
    const row = { graveyard: graveyardIds(end, "user"), fangsOnBattlefield: end.players.user.battlefield.some((p) => p.card?.name === "Dragon Fangs"),
      entered: (end.log || []).some((e) => e.kind === "permanent-enters" && e.cardName === "Dragon Fangs"), returned: returnEvent?.returned ?? null, why: returnEvent?.why ?? null };
    console.log(`  WITNESS dragon-fangs ${JSON.stringify(row)}`);
    expect(row).toEqual({ graveyard: ["fangs"], fangsOnBattlefield: false, entered: false, returned: false, why: "no-legal-host" });
  });

  it("⭐ the state-based action: a Pacifism and a Bonesplitter found attached to Progenitus — the Aura goes to its owner's graveyard, the Equipment becomes unattached and stays", () => {
    const [prog, pac, bs] = attach(P("prog", PROGENITUS, "user"), P("pac", PACIFISM, "ai"), P("bs", BONESPLITTER, "user"));
    const done = checkAllStateBasedActions(duel({ user: [prog, bs], ai: [pac] }));
    const row = { pacifism: !!perm(done, "pac"), aiGraveyard: graveyardIds(done, "ai"), bsOn: perm(done, "bs")?.attachedTo ?? null, bs: !!perm(done, "bs"), progAttachments: perm(done, "prog").attachments };
    console.log(`  WITNESS sba ${JSON.stringify(row)}`);
    expect(row).toEqual({ pacifism: false, aiGraveyard: ["c-pac"], bsOn: null, bs: true, progAttachments: [] });
  });

  it("⭐ an Aura entering without being cast chooses no host with a granted protection from everything (auraEntryHosts — CR 303.4f): the Bears granted it are not a host, the Giant is", () => {
    const s = grantEverything(duel({ user: [P("ubear", GRIZZLY_BEARS, "user"), P("giant", HILL_GIANT, "user")] }), "ubear");
    const row = (auraEntryHosts(s, C("pac", PACIFISM), "user") || []).map((h) => h.id);
    console.log(`  WITNESS aura-entry-hosts ${JSON.stringify(row)}`);
    expect(row).toEqual(["giant"]);
  });
});

describe("the attachments made without a target, on a host GRANTED protection from everything (CR 701.3b, 303.4g)", () => {
  it("⭐ Captain America's Catch (\"attach up to one target Equipment you control to Captain America\"), Captain America granted it: Bonesplitter stays on the Bears", () => {
    const [ubear, bs] = attach(P("ubear", GRIZZLY_BEARS, "user"), P("bs", BONESPLITTER, "user"));
    const s = grantEverything(duel({ user: [P("cap", CAPTAIN_AMERICA_FIRST_AVENGER, "user"), ubear, bs] }), "cap");
    const after = resolveAtom(s, { op: "attach-to-self", targetType: "equipmentYouControl", optionalTarget: true }, { controller: "user", sourceId: "cap", targets: [{ type: "permanent", id: "bs" }] });
    const row = { bsOn: perm(after, "bs")?.attachedTo ?? null, capAttachments: perm(after, "cap").attachments || [] };
    console.log(`  WITNESS catch ${JSON.stringify(row)}`);
    expect(row).toEqual({ bsOn: "ubear", capAttachments: [] });
  });

  it("⭐ Mantle of the Ancients in the legal order (its rulings): the person casts it on their Bears and its enters trigger targets Bonesplitter and Pacifism in their graveyard; the Bears gain protection from everything while it waits, so the state-based action puts Mantle into the graveyard — and the trigger returns nothing: the last creature it enchanted can't have anything attached, so the cards stay (CR 702.16j, 704.5m)", () => {
    const s0 = duel({ humans: ["user"], user: [P("ubear", GRIZZLY_BEARS, "user")], userHand: [C("mantle", MANTLE_OF_THE_ANCIENTS), C("bolt", LIGHTNING_BOLT)], userGy: [C("gbs", BONESPLITTER), C("gpac", PACIFISM)] });
    let r = advanceUntilDecision(session(s0));
    r = applyChoice(r.session, (r.decision?.options || []).find((a) => a.kind === "cast-spell" && a.cardId === "mantle" && ids(a.targets) === "ubear"));
    // Pass until the enters trigger asks its targets; take both cards; stop at the person's priority with the trigger waiting.
    for (let k = 0; k < 10; k++) {
      const d = r.decision;
      if (d?.kind === "trigger-target") { r = applyPendingChoice(r.session, { kind: d.kind, candidateId: d.candidates.find((x) => ids(x.targets) === "gbs+gpac").id }); continue; }
      if (Array.isArray(d?.options) && r.session.state.stack.some((o) => o.kind === "triggered-ability" && o.source?.name === "Mantle of the Ancients")) break;
      r = applyChoice(r.session, (d?.options || []).find((a) => a.kind === "pass-priority"));
    }
    const waiting = r.session.state.stack.map((o) => o.source?.name);
    // In response, the Bears gain protection from everything (the layer-6 grant — no printed grant is parsed yet), then priority passes.
    const after = applyChoice({ ...r.session, state: grantEverything(r.session.state, "ubear") }, r.decision.options.find((a) => a.kind === "pass-priority"));
    const end = after.session.state;
    const log = end.log || [];
    const fellOff = log.findIndex((e) => e.kind === "aura-falls-off" && e.cardName === "Mantle of the Ancients");
    const returned = log.findIndex((e) => e.effect === "return-attached-from-graveyard");
    const row = { waiting, graveyard: graveyardIds(end, "user").sort(), bearsAttachments: perm(end, "ubear").attachments || [], mantleFellOffFirst: fellOff >= 0 && returned > fellOff, returnedCards: log[returned]?.returned ?? null };
    console.log(`  WITNESS mantle ${JSON.stringify(row)}`);
    expect(row).toEqual({ waiting: ["Mantle of the Ancients"], graveyard: ["gbs", "gpac", "mantle"], bearsAttachments: [], mantleFellOffFirst: true, returnedCards: [] });
  });
});

describe("BLOCK (CR 702.16j — can't be blocked by creatures)", () => {
  it("⭐ the person's attacking Progenitus: the AI's Bears can't block it — no block is offered", () => {
    const s = { ...duel({ user: [P("prog", PROGENITUS, "user", { tapped: true, attackedThisTurn: true })], ai: [P("abear", GRIZZLY_BEARS, "ai")] }),
      phase: "combat", step: "declare-blockers", priorityHolder: "ai", combat: { attackers: [{ permanentId: "prog", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const row = { canBlock: canBlockAttacker(s, "abear", "prog", "ai"), offers: offered(s, "ai", "declare-blocker").map((a) => `${a.permanentId}>${a.attackerId}`) };
    console.log(`  WITNESS block ${JSON.stringify(row)}`);
    expect(row).toEqual({ canBlock: false, offers: [] });
  });
});

describe("Hexdrinker — protection from everything inside LEVEL 8+ (CR 711.2a): off at 7 level counters, on at 8", () => {
  const hex = (level) => P("hex", HEXDRINKER, "ai", { counters: { level } });
  it("control (the same on both trees): at level 7 the person's Flame Slash (a sorcery — not an instant) is offered it, and a Bears can block it", () => {
    const s = duel({ ai: [hex(7)], userHand: [C("slash", FLAME_SLASH)] });
    const atk = { ...duel({ user: [P("ubear", GRIZZLY_BEARS, "user")], ai: [hex(7)], active: "ai" }), combat: { attackers: [{ permanentId: "hex", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    expect({ slash: targetIdsOf(s, "user", "slash"), canBlock: canBlockAttacker(atk, "ubear", "hex", "user") }).toEqual({ slash: ["hex"], canBlock: true });
  });

  it("⭐ at level 8: the person's Flame Slash isn't offered it, a Bears can't block it, and Pyroclasm deals it nothing", () => {
    const s = duel({ ai: [hex(8)], userHand: [C("slash", FLAME_SLASH), C("pyro", PYROCLASM)] });
    const atk = { ...duel({ user: [P("ubear", GRIZZLY_BEARS, "user")], ai: [hex(8)], active: "ai" }), combat: { attackers: [{ permanentId: "hex", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const afterPyro = resolveAll(act(s, "user", "cast-spell", (a) => a.cardId === "pyro"));
    const row = { slash: targetIdsOf(s, "user", "slash"), canBlock: canBlockAttacker(atk, "ubear", "hex", "user"), pyroDamage: perm(afterPyro, "hex")?.damageMarked ?? "gone" };
    console.log(`  WITNESS hexdrinker-8 ${JSON.stringify(row)}`);
    expect(row).toEqual({ slash: [], canBlock: false, pyroDamage: 0 });
  });
});

describe("a GRANTED protection from everything turns on and off with its effect (the layer-6 op, until end of turn)", () => {
  it("⭐ the AI's Bears granted it: the person's Bolt isn't offered them; after the turn's cleanup it is again", () => {
    const s0 = duel({ ai: [P("abear", GRIZZLY_BEARS, "ai")], userHand: [C("bolt", LIGHTNING_BOLT)] });
    const granted = grantEverything(s0, "abear");
    const expired = expireContinuousEffects(granted, { atCleanupOfTurn: granted.turn });
    const row = { granted: targetIdsOf(granted, "user", "bolt"), expired: targetIdsOf(expired, "user", "bolt") };
    console.log(`  WITNESS grant-on-off ${JSON.stringify(row)}`);
    expect(row).toEqual({ granted: ["ai", "user"], expired: ["abear", "ai", "user"] });
  });
});

describe("non-targeted effects still apply (controls — the same on both trees; Progenitus's ruling: \"can still be affected by effects that don't target it or deal damage to it\")", () => {
  it("Wrath of God destroys it — its own replacement shuffles it into its owner's library", () => {
    const s0 = duel({ ai: [P("prog", PROGENITUS, "ai")], userHand: [C("wrath", WRATH_OF_GOD)] });
    const end = resolveAll(act(s0, "user", "cast-spell", (a) => a.cardId === "wrath"));
    expect({ onBattlefield: !!perm(end, "prog"), inLibrary: libraryIds(end, "ai").includes("c-prog"), inGraveyard: graveyardIds(end, "ai").includes("c-prog") })
      .toEqual({ onBattlefield: false, inLibrary: true, inGraveyard: false });
  });

  it("Massacre Wurm's -2/-2 to the opponents' creatures shrinks it: an 8/8 until end of turn", () => {
    const s0 = duel({ ai: [P("prog", PROGENITUS, "ai")], userHand: [C("wurm", MASSACRE_WURM)] });
    const end = resolveAll(act(s0, "user", "cast-spell", (a) => a.cardId === "wurm"));
    expect(creaturePower(perm(end, "prog"), end)).toBe(8);
  });

  it("Diabolic Edict targets the player, who sacrifices their only creature — Progenitus (shuffled into the library)", () => {
    const s0 = duel({ ai: [P("prog", PROGENITUS, "ai")], userHand: [C("edict", DIABOLIC_EDICT)] });
    const end = resolveAll(act(s0, "user", "cast-spell", (a) => a.cardId === "edict" && ids(a.targets) === "ai"));
    expect({ onBattlefield: !!perm(end, "prog"), inLibrary: libraryIds(end, "ai").includes("c-prog") }).toEqual({ onBattlefield: false, inLibrary: true });
  });
});

describe("the player's protection from everything is unchanged (a control — the same on both trees)", () => {
  it("Teferi's Protection: the AI's Bolt can't target the person, and the person's permanents phase out", () => {
    const s0 = duel({ user: [P("ubear", GRIZZLY_BEARS, "user")], userHand: [C("tp", TEFERI_S_PROTECTION)], aiHand: [C("aibolt", LIGHTNING_BOLT)] });
    const s1 = resolveAll(act(s0, "user", "cast-spell", (a) => a.cardId === "tp"));
    const s2 = { ...s1, activePlayer: "ai", priorityHolder: "ai" };
    const bearPhased = (s2.players.user.phasedOut || []).some((p) => p.id === "ubear");
    expect({ shielded: playerProtectedFromEverything(s2, "user"), aiBolt: targetIdsOf(s2, "ai", "aibolt"), bearPhased })
      .toEqual({ shielded: true, aiBolt: ["ai"], bearPhased: true });
  });
});

describe("the blind review's F1 — only a permanent WITH protection from everything is refused an Aura (CR 702.16j, 711.2b, 303.4f): Vexilus Praetor and Hexdrinker below LEVEL 8 are legal hosts", () => {
  /** The person's Vexilus Praetor and Hexdrinker at 0, 7 and 8 level counters and Progenitus; the AI's Vexilus Praetor and Progenitus. */
  const hosts = () => duel({ humans: ["user"],
    user: [P("vex", VEXILUS_PRAETOR, "user"), P("hex0", HEXDRINKER, "user"), P("hex7", HEXDRINKER, "user", { counters: { level: 7 } }), P("hex8", HEXDRINKER, "user", { counters: { level: 8 } }), P("prog", PROGENITUS, "user")],
    ai: [P("avex", VEXILUS_PRAETOR, "ai"), P("aprog", PROGENITUS, "ai")],
    userHand: [C("rancor", RANCOR), C("pac", PACIFISM), C("kas", KASMINA_S_TRANSMUTATION), C("satyr", BOON_SATYR), C("bolt", LIGHTNING_BOLT)] });
  /** The hosts the person's driver stop offers `cardId`'s Aura casts (a bestow cast is the Satyr's cast with a target). */
  const auraOffers = (r, cardId) => [...new Set((r.decision?.options || []).filter((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets || []).length).flatMap((a) => a.targets.map((t) => t.id)))].sort();

  it("⭐ the person's Rancor, Pacifism, Kasmina's Transmutation and Boon Satyr's bestow are each offered both Vexilus Praetors and Hexdrinker at 0 and at 7 — never Progenitus (either seat) or Hexdrinker at 8", () => {
    const r = advanceUntilDecision(session(hosts()));
    const row = Object.fromEntries(["rancor", "pac", "kas", "satyr"].map((id) => [id, auraOffers(r, id)]));
    console.log(`  WITNESS f1-aura-offers ${JSON.stringify(row)}`);
    const legal = ["avex", "hex0", "hex7", "vex"];
    expect(row).toEqual({ rancor: legal, pac: legal, kas: legal, satyr: legal });
  });

  it("⭐ an Aura entering uncast (auraEntryHosts — CR 303.4f) may choose either Vexilus Praetor and Hexdrinker at 0 and 7; Progenitus and Hexdrinker at 8 are still refused", () => {
    const row = (auraEntryHosts(hosts(), C("pac2", PACIFISM), "user") || []).map((h) => h.id);
    console.log(`  WITNESS f1-entry-hosts ${JSON.stringify(row)}`);
    expect(row).toEqual(["vex", "hex0", "hex7", "avex"]);
  });
});
