/**
 * SPRINGBLOOM DRUID, LOYAL APPRENTICE, WARSTORM SURGE — play-weighted #778, #753, #731 (EDHREC rank).
 *
 * SPRINGBLOOM DRUID — "When this creature enters, you may sacrifice a land. If you do, search your library for up to two
 *   basic land cards, put them onto the battlefield tapped, then shuffle."
 *   The reflexive chosen sacrifice (parser.matchOptionalChosenSac — "you may sacrifice …. If you do, …") gains the phrase "a land":
 *   the pause lists every land the controller controls (current types — Dryad Arbor is one), the settle sacrifices the
 *   named one and only then runs the payoff — the up-to-two basic-land search to the battlefield tapped. Declining, a yes
 *   that names nothing, and no land to sacrifice search nothing and leave the library untouched. One sacrifice, one search
 *   (the bundled ruling). Excavating Anurid reads the same phrase and flips with it.
 *
 * LOYAL APPRENTICE — "Lieutenant — At the beginning of combat on your turn, if you control your commander, create a 1/1
 *   colorless Thopter artifact creature token with flying. That token gains haste until end of turn."
 *   "That token" / "those tokens" right after a create-token atom are the tokens it made: folded onto the atom as
 *   hasteUntilEot, a layer-6 grant on exactly the minted tokens that ends with the turn (CR 611.2a, CR 702.10b). The
 *   intervening "if" (CR 603.4) is checked as the trigger would go on the stack and again on resolution. "Your commander" is
 *   a commander you OWN: an opponent's commander under your control does not count. Siege-Gang Lieutenant flips with it.
 *
 * WARSTORM SURGE — "Whenever a creature you control enters, it deals damage equal to its power to any target."
 *   The bundled rulings: Warstorm Surge is the source of the ABILITY (it decides what may be targeted, CR 702.16b), the
 *   entering creature is the source of the DAMAGE (CR 608.2h) — its lifelink, deathtouch and infect apply, protection from
 *   creatures prevents it — and its power is read on resolution, or as it last existed on the battlefield once it has left.
 *   The entering-dealer lane: detectTriggers' sentinel → a deal-damage atom with damageSource "triggering" → the damage
 *   funnel reads the dealer's keywords, colors and creature-ness (spellEffects.applyDamageEffect, `source.readsKeywords`),
 *   off the record gameState.stampTriggeringLki writes onto the waiting trigger as the creature leaves. Terror of the Peaks
 *   and Verdant Sun's Avatar read the same record for the entering creature's power / toughness (their bundled ruling).
 *
 * Real card fixtures. The runtime witnesses go through legalActionsForPlayer → dispatchAction → resolveTopOfStack, with the
 * engine's own step advance for the beginning-of-combat trigger (Yuma's attack trigger alone is flushed by hand). A
 * trigger's target is the engine's own pick at the flush: each board holds exactly one opposing target, and the aim is
 * asserted. Two setups use the engine's control move directly (no native card changes control at instant speed) and are
 * labelled; the SYNTHETIC blocks hold the guards no printed card can reach.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, advanceStep, runStepActions, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalSacChoice, resolveTutorChoice, autoPickOptionalSac } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { moveControl } from "./controlMove.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, creaturePower, creatureToughness, attachPermanent, moveCardToZone, stampTriggeringLki } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-03; tier at generation) ──
const SPRINGBLOOM_DRUID = {"name":"Springbloom Druid","type":"Creature — Elf Druid","mana":"{2}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, you may sacrifice a land. If you do, search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle."}; // native-trigger
const LOYAL_APPRENTICE = {"name":"Loyal Apprentice","type":"Creature — Human Artificer","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":["Haste","Lieutenant"],"colors":["R"],"oracle":"Haste\nLieutenant — At the beginning of combat on your turn, if you control your commander, create a 1/1 colorless Thopter artifact creature token with flying. That token gains haste until end of turn."}; // native-trigger
const WARSTORM_SURGE = {"name":"Warstorm Surge","type":"Enchantment","mana":"{5}{R}","cmc":6,"keywords":[],"colors":["R"],"oracle":"Whenever a creature you control enters, it deals damage equal to its power to any target."}; // native-trigger
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const SNOW_FOREST = {"name":"Snow-Covered Forest","type":"Basic Snow Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const COMMAND_TOWER = {"name":"Command Tower","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add one mana of any color in your commander's color identity."}; // land
const DRYAD_ARBOR = {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")"}; // land
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const GOBLIN_PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // native-body
const EXCAVATING_ANURID = {"name":"Excavating Anurid","type":"Creature — Frog Beast","mana":"{4}{G}","cmc":5,"power":"4","toughness":"4","keywords":["Threshold"],"colors":["G"],"oracle":"When this creature enters, you may sacrifice a land. If you do, draw a card.\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has vigilance."}; // native-mixed
const TENURED_TETHERMAGE = {"name":"Tenured Tethermage","type":"Creature — Human Artificer","mana":"{1}{R}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G","R"],"oracle":"When this creature enters, you may sacrifice a land. If you do, create two tapped Heartwood tokens. (They're red and green artifacts with \"{T}: Add {R} or {G}.\")\nTap two untapped artifacts you control: Put two +1/+1 counters on this creature."}; // body-only
const BROOD_ASTRONOMER = {"name":"Brood Astronomer","type":"Creature — Insect Scientist","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Draft from a spellbook"],"colors":["G"],"oracle":"When this creature enters, you may sacrifice a land. If you do, draft a card from the Planets Spellbook and put it onto the battlefield tapped.\n{T}: Add one mana of any color. If you control a Planet with twelve or more charge counters on it, add three mana of any one color instead."}; // body-only
const YUMA = {"name":"Yuma, Proud Protector","type":"Legendary Creature — Human Ranger","mana":"{5}{R}{G}{W}","cmc":8,"power":"6","toughness":"6","keywords":[],"colors":["G","R","W"],"oracle":"This spell costs {1} less to cast for each land card in your graveyard.\nWhenever Yuma enters or attacks, you may sacrifice a land. If you do, draw a card.\nWhenever a Desert card is put into your graveyard from anywhere, create a 4/2 green Plant Warrior creature token with reach."}; // body-only
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const SIEGE_GANG_LIEUTENANT = {"name":"Siege-Gang Lieutenant","type":"Creature — Goblin","mana":"{3}{R}","cmc":4,"power":"2","toughness":"2","keywords":["Lieutenant"],"colors":["R"],"oracle":"Lieutenant — At the beginning of combat on your turn, if you control your commander, create two 1/1 red Goblin creature tokens. Those tokens gain haste until end of turn.\n{2}, Sacrifice a Goblin: This creature deals 1 damage to any target."}; // native-mixed
const LEGION_WARBOSS = {"name":"Legion Warboss","type":"Creature — Goblin Soldier","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":["Mentor"],"colors":["R"],"oracle":"Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token gains haste until end of turn and attacks this combat if able."}; // body-only
const LOYAL_UNICORN = {"name":"Loyal Unicorn","type":"Creature — Unicorn","mana":"{3}{W}","cmc":4,"power":"3","toughness":"4","keywords":["Vigilance","Lieutenant"],"colors":["W"],"oracle":"Vigilance\nLieutenant — At the beginning of combat on your turn, if you control your commander, prevent all combat damage that would be dealt to creatures you control this turn. Other creatures you control gain vigilance until end of turn."}; // body-only
const PARALLEL_LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."}; // native-static
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const ALTARS_REAP = {"name":"Altar's Reap","type":"Instant","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards."}; // native-spell
const HEALERS_HAWK = {"name":"Healer's Hawk","type":"Creature — Bird","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Lifelink"],"colors":["W"],"oracle":"Flying\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"}; // native-body
const TYPHOID_RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // native-body
const GLISTENER_ELF = {"name":"Glistener Elf","type":"Creature — Phyrexian Elf Warrior","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Infect"],"colors":["G"],"oracle":"Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"}; // native-body
const SICKLE_RIPPER = {"name":"Sickle Ripper","type":"Creature — Elemental Warrior","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":["Wither"],"colors":["B"],"oracle":"Wither (This deals damage to creatures in the form of -1/-1 counters.)"}; // native-body
const AJANIS_PRIDEMATE = {"name":"Ajani's Pridemate","type":"Creature — Cat Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever you gain life, put a +1/+1 counter on this creature."}; // native-trigger
const BELOVED_CHAPLAIN = {"name":"Beloved Chaplain","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"colors":["W"],"oracle":"Protection from creatures"}; // native-body
const VODALIAN_ZOMBIE = {"name":"Vodalian Zombie","type":"Creature — Merfolk Zombie","mana":"{U}{B}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["B","U"],"oracle":"Protection from green"}; // native-body
const KOR_FIREWALKER = {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["W"],"oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life."}; // native-trigger
const KONGMING = {"name":"Kongming, \"Sleeping Dragon\"","type":"Legendary Creature — Human Advisor","mana":"{2}{W}{W}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Other creatures you control get +1/+1."}; // native-static
const EVACUATION = {"name":"Evacuation","type":"Instant","mana":"{3}{U}{U}","cmc":5,"keywords":[],"colors":["U"],"oracle":"Return all creatures to their owners' hands."}; // native-spell
const VOLCANIC_FALLOUT = {"name":"Volcanic Fallout","type":"Instant","mana":"{1}{R}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"This spell can't be countered.\nVolcanic Fallout deals 2 damage to each creature and each player."}; // native-spell
const NEVINYRRALS_DISK = {"name":"Nevinyrral's Disk","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"This artifact enters tapped.\n{1}, {T}: Destroy all artifacts, creatures, and enchantments."}; // native-activated
const NIGHT_OF_SOULS_BETRAYAL = {"name":"Night of Souls' Betrayal","type":"Legendary Enchantment","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"All creatures get -1/-1."}; // native-static
const INKLING_SUMMONING = {"name":"Inkling Summoning","type":"Sorcery — Lesson","mana":"{1}{W/B}{W/B}","cmc":3,"keywords":[],"colors":["B","W"],"oracle":"Create a 2/1 white and black Inkling creature token with flying."}; // native-spell
const TERROR_OF_THE_PEAKS = {"name":"Terror of the Peaks","type":"Creature — Dragon","mana":"{3}{R}{R}","cmc":5,"power":"5","toughness":"4","keywords":["Flying"],"colors":["R"],"oracle":"Flying\nSpells your opponents cast that target this creature cost an additional 3 life to cast.\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target."}; // native-mixed
const VERDANT_SUNS_AVATAR = {"name":"Verdant Sun's Avatar","type":"Creature — Dinosaur Avatar","mana":"{5}{G}{G}","cmc":7,"power":"5","toughness":"5","keywords":[],"colors":["G"],"oracle":"Whenever this creature or another creature you control enters, you gain life equal to that creature's toughness."}; // native-trigger
const BASILISK_COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // native-equipment
const MURDEROUS_REDCAP = {"name":"Murderous Redcap","type":"Creature — Goblin Assassin","mana":"{2}{B/R}{B/R}","cmc":4,"power":"2","toughness":"2","keywords":["Persist"],"colors":["B","R"],"oracle":"When this creature enters, it deals damage equal to its power to any target.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)"}; // native-trigger
const EFTEEKAY = {"name":"Efteekay, Flame of the Kav","type":"Legendary Creature — Kavu Soldier","mana":"{4}{R}{G}","cmc":6,"power":"4","toughness":"2","keywords":["Eminence"],"colors":["G","R"],"oracle":"Eminence — As long as Efteekay is in the command zone or on the battlefield, other Kavu spells you cast cost {1} less to cast.\nWhenever Efteekay or another Kavu you control enters, it deals damage equal to its power to target creature."}; // body-only
const STALKING_VENGEANCE = {"name":"Stalking Vengeance","type":"Creature — Avatar","mana":"{5}{R}{R}","cmc":7,"power":"5","toughness":"5","keywords":["Haste"],"colors":["R"],"oracle":"Haste\nWhenever another creature you control dies, it deals damage equal to its power to target player or planeswalker."}; // body-only
const ELECTROPOTENCE = {"name":"Electropotence","type":"Enchantment","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Whenever a creature you control enters, you may pay {2}{R}. If you do, that creature deals damage equal to its power to any target."}; // body-only
const PANDEMONIUM = {"name":"Pandemonium","type":"Enchantment","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"Whenever a creature enters, that creature's controller may have it deal damage equal to its power to any target of their choice."}; // body-only

// ── the board and the real entry points ──
const cardOf = (card, id) => ({ ...card, id });
const perm = (id, card, controller = "user", extra = {}) => createPermanent({ id, card: cardOf(card, `c-${id}`), controller, summoningSick: false, ...extra });
const lands = (prefix, card, n, controller = "user") => Array.from({ length: n }, (_, i) => perm(`${prefix}${i + 1}`, card, controller));
function board({ user = {}, ai = {}, phase = "precombat-main", step = "main", activePlayer = "user", turn = 3 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (base, spec) => ({ ...base, battlefield: spec.bf || [], hand: spec.hand || [], library: spec.library || [], graveyard: spec.graveyard || [] });
  return { ...s0, phase, step, activePlayer, priorityHolder: activePlayer, consecutivePasses: 0, turn, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: seat(s0.players.user, user), ai: seat(s0.players.ai, ai) } };
}
const aimedAt = (id) => (a) => (a.targets || []).some((t) => t.id === id);
/** `pid` takes priority and casts `cardId` through the offered action (`pick` narrows it — a target, a sacrifice). */
const castAs = (s, pid, cardId, pick = () => true) => {
  const withPriority = { ...s, priorityHolder: pid };
  const a = legalActionsForPlayer(withPriority, pid).find((x) => x.kind === "cast-spell" && x.cardId === cardId && pick(x));
  expect(a, `cast of ${cardId} offered`).toBeTruthy();
  return dispatchAction(withPriority, a);
};
const activateAs = (s, pid, permanentId, pick = () => true) => {
  const withPriority = { ...s, priorityHolder: pid };
  const a = legalActionsForPlayer(withPriority, pid).find((x) => x.kind === "activate-ability" && x.permanentId === permanentId && pick(x));
  expect(a, `ability of ${permanentId} offered`).toBeTruthy();
  return dispatchAction(withPriority, a);
};
/** The top of the stack resolves; state-based actions run and the waiting triggers go on the stack (resolveTopOfStack's own
 *  finalize). The engine's chooser aims each new trigger: an opposing creature when there is one, else the opposing player. */
const resolveOne = (s) => resolveTopOfStack(s);
/** Cast `cardId` and resolve it. The trigger it raised must be aimed at `targetId`: each board is shaped so the engine's
 *  chooser has exactly that opposing target, and the aim is asserted here rather than assumed. */
const enterAimed = (s, cardId, targetId) => {
  const triggered = resolveOne(castAs(s, "user", cardId));
  expect((triggered.stack.at(-1)?.targets || []).map((t) => t.id), "the trigger's target").toEqual([targetId]);
  return triggered;
};
const byName = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card.name === name);
const onBattlefield = (s, id) => !!findPermanent(s, id);
const stackNames = (s) => s.stack.map((o) => `${o.kind}:${o.source?.name}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Springbloom Druid — you may sacrifice a land; if you do, two basics tapped", () => {
  const LIBRARY = [cardOf(FOREST, "L1"), cardOf(COMMAND_TOWER, "L2"), cardOf(MOUNTAIN, "L3"), cardOf(BEARS, "L4"), cardOf(SNOW_FOREST, "L5"), cardOf(PLAINS, "L6")];
  const druidBoard = () => board({ user: { bf: [...lands("f", FOREST, 3), perm("ct", COMMAND_TOWER), perm("arbor", DRYAD_ARBOR), perm("bear", BEARS)], hand: [cardOf(SPRINGBLOOM_DRUID, "c-sd")], library: LIBRARY } });
  /** Cast the Druid, resolve the spell (its enters trigger goes on the stack), resolve the trigger into the sacrifice choice. */
  const toChoice = (s) => resolveTopOfStack(resolveOne(castAs(s, "user", "c-sd")));
  const landCount = (s) => s.players.user.battlefield.filter((p) => /\bLand\b/.test(p.card.type)).length;
  const libraryIds = (s) => s.players.user.library.map((c) => c.id);

  it("parse + classify: ONE optional-sac-payment atom over 'a land', its payoff the up-to-two basic-land search to the battlefield tapped; native-trigger", () => {
    const [d] = detectTriggers(SPRINGBLOOM_DRUID);
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    const row = { event: d.event, scope: d.scope, confidence: programConfidence(p), atoms: p.atoms, tier: classifyCard(SPRINGBLOOM_DRUID) };
    console.log("  WITNESS druidParse", JSON.stringify(row));
    expect(row).toEqual({ event: "etb", scope: "self", confidence: "high", tier: "native-trigger",
      atoms: [{ op: "optional-sac-payment", subtype: "land", sacFilter: { types: ["Land"] }, targetType: null,
        effectAtoms: [{ op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null }] }] });
  });

  it("the choice lists every LAND you control (a land creature included) — never a nonland permanent", () => {
    const s = toChoice(druidBoard());
    const row = { kind: s.pendingChoice?.kind, available: s.pendingChoice?.available, candidates: (s.pendingChoice?.candidates || []).map((c) => c.name).sort() };
    console.log("  WITNESS druidChoice", JSON.stringify(row));
    expect(row).toEqual({ kind: "optional-sac-payment", available: true, candidates: ["Command Tower", "Dryad Arbor", "Forest", "Forest", "Forest"] });
  });

  it("a land sacrificed: the search offers only BASIC land cards; two enter tapped; the library is shuffled", () => {
    const paused = toChoice(druidBoard());
    const searching = resolveOptionalSacChoice(paused, true, "ct");
    const offered = (searching.pendingChoice?.candidates || []).map((c) => c.name).sort();
    const one = resolveTutorChoice(searching, "L3");
    const done = resolveTutorChoice(one, "L5");
    const fetched = done.players.user.battlefield.filter((p) => ["L3", "L5"].includes(p.card.id)).map((p) => [p.card.name, p.tapped]);
    const row = { search: searching.pendingChoice?.kind, offered, afterOne: one.pendingChoice?.remaining, pending: done.pendingChoice?.kind ?? null,
      fetched, towerGone: !onBattlefield(done, "ct"), graveyard: done.players.user.graveyard.map((c) => c.name), lands: [landCount(paused), landCount(done)], library: libraryIds(done) };
    console.log("  WITNESS druidSacrificed", JSON.stringify(row));
    expect(row).toEqual({ search: "tutor-search", offered: ["Forest", "Mountain", "Plains", "Snow-Covered Forest"], afterOne: 1, pending: null,
      fetched: [["Mountain", true], ["Snow-Covered Forest", true]], towerGone: true, graveyard: ["Command Tower"], lands: [5, 6], library: row.library });
    // Shuffled: the four cards left are the same four, in another order than the search found them in.
    expect([...row.library].sort()).toEqual(["L1", "L2", "L4", "L6"]);
    expect(row.library).not.toEqual(["L1", "L2", "L4", "L6"]);
  });

  it("'up to two': one basic may be found and the search ended; one sacrifice buys one search (the bundled ruling)", () => {
    const searching = resolveOptionalSacChoice(toChoice(druidBoard()), true, "f1");
    const done = resolveTutorChoice(resolveTutorChoice(searching, "L6"), null);
    expect({ mayFailToFind: searching.pendingChoice.mayFailToFind, pending: done.pendingChoice?.kind ?? null, stack: done.stack.length, plainsTapped: done.players.user.battlefield.find((p) => p.card.id === "L6")?.tapped,
      lands: landCount(done), graveyard: done.players.user.graveyard.map((c) => c.name) })
      .toEqual({ mayFailToFind: true, pending: null, stack: 0, plainsTapped: true, lands: 5, graveyard: ["Forest"] });
  });

  it("declined, a yes that names nothing, and a named nonland: nothing is sacrificed, nothing is searched, the library is untouched", () => {
    const paused = toChoice(druidBoard());
    const outcome = (s) => ({ pending: s.pendingChoice?.kind ?? null, lands: landCount(s), bear: onBattlefield(s, "bear"), library: libraryIds(s), graveyard: s.players.user.graveyard.length });
    const untouched = { pending: null, lands: 5, bear: true, library: ["L1", "L2", "L3", "L4", "L5", "L6"], graveyard: 0 };
    expect({ declined: outcome(resolveOptionalSacChoice(paused, false)), unnamed: outcome(resolveOptionalSacChoice(paused, true, null)), bears: outcome(resolveOptionalSacChoice(paused, true, "bear")) })
      .toEqual({ declined: untouched, unnamed: untouched, bears: untouched });
  });

  it("no land to sacrifice (the Druid was cast off three Llanowar Elves): the choice has no candidate and nothing is searched", () => {
    const s0 = board({ user: { bf: [perm("e1", LLANOWAR_ELVES), perm("e2", LLANOWAR_ELVES), perm("e3", LLANOWAR_ELVES)], hand: [cardOf(SPRINGBLOOM_DRUID, "c-sd")], library: LIBRARY } });
    const paused = toChoice(s0);
    const done = resolveOptionalSacChoice(paused, true, "e1");
    expect({ available: paused.pendingChoice.available, candidates: paused.pendingChoice.candidates, pending: done.pendingChoice?.kind ?? null, elves: byName(done, "user", "Llanowar Elves").length, library: libraryIds(done) })
      .toEqual({ available: false, candidates: [], pending: null, elves: 3, library: ["L1", "L2", "L3", "L4", "L5", "L6"] });
  });

  it("the autopilot keeps its lands (it gives up only a token on this choice): a legal decline, documented", () => {
    const paused = toChoice(druidBoard());
    expect(autoPickOptionalSac(paused, paused.pendingChoice)).toBe(false);
  });

  it("⭐ GAINED WITH IT — Excavating Anurid: a land sacrificed draws a card, a decline draws none; its threshold line is the modeled static", () => {
    const s0 = board({ user: { bf: lands("f", FOREST, 5), hand: [cardOf(EXCAVATING_ANURID, "c-ea")], library: [cardOf(BEARS, "L1"), cardOf(BEARS, "L2")] } });
    const paused = resolveTopOfStack(resolveOne(castAs(s0, "user", "c-ea")));
    const sac = resolveOptionalSacChoice(paused, true, "f2");
    const no = resolveOptionalSacChoice(paused, false);
    const anurid = byName(sac, "user", "Excavating Anurid")[0];
    const fat = { ...sac, players: { ...sac.players, user: { ...sac.players.user, graveyard: Array.from({ length: 7 }, (_, i) => cardOf(BEARS, `g${i}`)) } } };
    expect({ tier: classifyCard(EXCAVATING_ANURID), candidates: paused.pendingChoice.candidates.length,
      sac: [sac.players.user.hand.map((c) => c.id), sac.players.user.battlefield.filter((p) => p.card.name === "Forest").length],
      no: [no.players.user.hand.length, no.players.user.battlefield.filter((p) => p.card.name === "Forest").length],
      power: [creaturePower(anurid, sac), creaturePower(anurid, fat)], vigilance: [permanentHasKeyword(sac, anurid.id, "Vigilance"), permanentHasKeyword(fat, anurid.id, "Vigilance")] })
      .toEqual({ tier: "native-mixed", candidates: 5, sac: [["L1"], 4], no: [0, 5], power: [4, 5], vigilance: [false, true] });
  });

  it("FALSE NEGATIVES, documented: the same sacrifice with an unmodeled payoff keeps the card parked", () => {
    expect([TENURED_TETHERMAGE, BROOD_ASTRONOMER].map((c) => classifyCard(c))).toEqual(["body-only", "body-only"]);
  });

  it("Yuma, Proud Protector stays parked on its other lines, but its 'enters or attacks' land sacrifice now resolves: attacking, a land sacrificed draws a card", () => {
    const s0 = board({ user: { bf: [perm("yuma", YUMA), ...lands("f", FOREST, 2)], library: [cardOf(BEARS, "L1")] }, phase: "combat", step: "declare-attackers" });
    const attacking = { ...s0, combat: { attackers: [{ permanentId: "yuma", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const paused = resolveTopOfStack(flushTriggers(checkAttackTriggers(attacking), { chooseTargets: chooseTriggerTargets }));
    const done = resolveOptionalSacChoice(paused, true, "f1");
    expect({ tier: classifyCard(YUMA), candidates: (paused.pendingChoice?.candidates || []).map((c) => c.id), hand: done.players.user.hand.map((c) => c.id), forests: byName(done, "user", "Forest").length,
      declined: resolveOptionalSacChoice(paused, false).players.user.hand.length })
      .toEqual({ tier: "body-only", candidates: ["f1", "f2"], hand: ["L1"], forests: 1, declined: 0 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Loyal Apprentice — Lieutenant: a Thopter with haste until end of turn", () => {
  const COMMANDER = { ...ISAMARU, isCommander: true }; // the seat-build commander stamp (gameState) on a real legendary creature
  const apprenticeBoard = ({ userBf = [perm("la", LOYAL_APPRENTICE), perm("cmd", COMMANDER)], ai = {} } = {}) => board({ user: { bf: userBf }, ai });
  /** Precombat main → the beginning of combat step: its triggers are put on the stack. */
  const toCombat = (s) => runStepActions(advanceStep(s));
  const thopters = (s) => byName(s, "user", "Thopter");
  const conditionLog = (s) => s.log.filter((e) => e.kind === "trigger-condition-not-met").length;

  it("parse + classify: the create-token atom carries hasteUntilEot; the intervening 'if' is the commander gate; native-trigger", () => {
    const [d] = detectTriggers(LOYAL_APPRENTICE);
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    const row = { event: d.event, interveningIf: d.interveningIf, confidence: programConfidence(p), atoms: p.atoms, tier: classifyCard(LOYAL_APPRENTICE) };
    console.log("  WITNESS apprenticeParse", JSON.stringify(row));
    expect(row).toEqual({ event: "combatBegin", interveningIf: "you control your commander", confidence: "high", tier: "native-trigger",
      atoms: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless thopter artifact", targetType: null, keywords: ["Flying"], hasteUntilEot: true }] });
  });

  it("⭐ with your commander on the battlefield: a 1/1 colorless Thopter artifact creature with flying — and haste: it attacks this turn", () => {
    const triggered = toCombat(apprenticeBoard());
    const made = resolveOne(triggered);
    const [tok] = thopters(made);
    const atAttackers = runStepActions(advanceStep(made));
    const offer = legalActionsForPlayer(atAttackers, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === tok.id);
    const attacking = dispatchAction(atAttackers, offer);
    const row = { step: triggered.step, stack: stackNames(triggered), type: tok.card.type, pt: [creaturePower(tok, made), creatureToughness(tok, made)], colors: tok.card.colors, flying: permanentHasKeyword(made, tok.id, "Flying"),
      summoningSick: tok.summoningSick, haste: permanentHasKeyword(made, tok.id, "Haste"), attackOffered: !!offer, attackers: (attacking.combat?.attackers || []).map((a) => a.permanentId) };
    console.log("  WITNESS apprenticeThopter", JSON.stringify(row));
    expect(row).toEqual({ step: "beginning-of-combat", stack: ["triggered-ability:Loyal Apprentice"], type: "Token Artifact Creature — Thopter", pt: [1, 1], colors: [], flying: true,
      summoningSick: true, haste: true, attackOffered: true, attackers: [tok.id] });
  });

  it("the haste ends with the turn (CR 611.2a)", () => {
    let s = resolveOne(toCombat(apprenticeBoard()));
    const [tok] = thopters(s);
    const startTurn = s.turn;
    for (let guard = 0; s.turn === startTurn && guard < 40; guard++) { s = runStepActions(advanceStep(s)); while (s.stack.length && !s.pendingChoice) s = resolveOne(s); }
    expect({ nextTurn: s.turn > startTurn, stillThere: onBattlefield(s, tok.id), haste: permanentHasKeyword(s, tok.id, "Haste") }).toEqual({ nextTurn: true, stillThere: true, haste: false });
  });

  it("without your commander on the battlefield the ability does not trigger (CR 603.4)", () => {
    const s = toCombat(apprenticeBoard({ userBf: [perm("la", LOYAL_APPRENTICE)] }));
    expect({ stack: s.stack.length, thopters: thopters(s).length, notMet: conditionLog(s) }).toEqual({ stack: 0, thopters: 0, notMet: 1 });
  });

  it("⭐ the commander leaves in response: the condition is checked again on resolution and no Thopter is made (CR 603.4)", () => {
    const triggered = toCombat(apprenticeBoard({ ai: { bf: lands("asw", SWAMP, 3, "ai"), hand: [cardOf(MURDER, "c-mu")] } }));
    const murdered = resolveOne(castAs(triggered, "ai", "c-mu", aimedAt("cmd")));
    const resolved = resolveOne(murdered);
    expect({ onStackFirst: stackNames(triggered), commanderGone: !onBattlefield(murdered, "cmd"), stillOnStack: stackNames(murdered), stack: resolved.stack.length, thopters: thopters(resolved).length })
      .toEqual({ onStackFirst: ["triggered-ability:Loyal Apprentice"], commanderGone: true, stillOnStack: ["triggered-ability:Loyal Apprentice"], stack: 0, thopters: 0 });
  });

  it("⭐ YOUR commander: an opponent's commander under your control does not count; your own commander under theirs is not controlled by you", () => {
    // SETUP: no natively modeled card changes control at instant speed, so control moves by the engine's one control move
    // (controlMove.moveControl — what a resolving Control Magic or threaten effect calls); it stamps the owner.
    const theirs = moveControl(apprenticeBoard({ userBf: [perm("la", LOYAL_APPRENTICE)], ai: { bf: [perm("aicmd", COMMANDER, "ai")] } }), "aicmd", "user");
    const mine = moveControl(apprenticeBoard(), "cmd", "ai");
    const a = toCombat(theirs);
    const b = toCombat(mine);
    expect({ theirsOnMySide: [findPermanent(theirs, "aicmd").controller, findPermanent(theirs, "aicmd").permanent.owner, a.stack.length, conditionLog(a)],
      mineOnTheirSide: [findPermanent(mine, "cmd").controller, b.stack.length, conditionLog(b)] })
      .toEqual({ theirsOnMySide: ["user", "ai", 0, 1], mineOnTheirSide: ["ai", 0, 1] });
  });

  it("a token doubler: every Thopter the effect made gains haste (Parallel Lives)", () => {
    const made = resolveOne(toCombat(apprenticeBoard({ userBf: [perm("la", LOYAL_APPRENTICE), perm("cmd", COMMANDER), perm("pl", PARALLEL_LIVES)] })));
    expect(thopters(made).map((t) => permanentHasKeyword(made, t.id, "Haste"))).toEqual([true, true]);
  });

  it("⭐ GAINED WITH IT — Siege-Gang Lieutenant: two Goblins with haste until end of turn; its sacrifice-a-Goblin ability pings", () => {
    const s0 = apprenticeBoard({ userBf: [perm("sg", SIEGE_GANG_LIEUTENANT), perm("cmd", COMMANDER), ...lands("m", MOUNTAIN, 2)] });
    const made = resolveOne(toCombat(s0));
    const goblins = byName(made, "user", "Goblin");
    // The engine offers activated abilities in their controller's main phase: on to the postcombat main phase.
    let main2 = made;
    for (let guard = 0; main2.phase !== "postcombat-main" && guard < 12; guard++) main2 = runStepActions(advanceStep(main2));
    const offers = legalActionsForPlayer(main2, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "sg");
    console.log("  WITNESS siegeGangOffer", main2.phase, JSON.stringify(offers.slice(0, 4)));
    const pinged = resolveOne(activateAs(main2, "user", "sg", (a) => aimedAt("ai")(a) && JSON.stringify(a).includes(goblins[0].id)));
    const row = { tier: classifyCard(SIEGE_GANG_LIEUTENANT), goblins: goblins.map((g) => [g.card.type, permanentHasKeyword(made, g.id, "Haste")]),
      aiLife: [made.players.ai.life, pinged.players.ai.life], tokenSacrificed: !onBattlefield(pinged, goblins[0].id), lieutenantStays: onBattlefield(pinged, "sg") };
    console.log("  WITNESS siegeGang", JSON.stringify(row));
    expect(row).toEqual({ tier: "native-mixed", goblins: [["Token Creature — Goblin", true], ["Token Creature — Goblin", true]], aiLife: [40, 39], tokenSacrificed: true, lieutenantStays: true });
  });

  it("CREED — a longer token sentence is never half-read: Legion Warboss ('…and attacks this combat if able') and Loyal Unicorn stay parked", () => {
    expect([LEGION_WARBOSS, LOYAL_UNICORN].map((c) => classifyCard(c))).toEqual(["body-only", "body-only"]);
    const [boss] = detectTriggers(LEGION_WARBOSS).filter((d) => d.event === "combatBegin");
    const p = parseEffectClause(boss.effectClause, "Instant", { hasX: false, sourceScoped: true });
    expect({ confidence: programConfidence(p), atoms: p.atoms }).toEqual({ confidence: "low", atoms: [] });
  });

  it("SYNTHETIC (CREED guards with no printed carrier) — 'that token' needs the create-token atom right before it; a plain created token has no haste", () => {
    // The real sentence (Loyal Apprentice's second) after an atom that made no token: no antecedent, so nothing is parsed.
    const second = LOYAL_APPRENTICE.oracle.split(". ").pop();
    const orphan = parseEffectClause(`Draw a card. ${second}`, "Instant");
    expect({ sentence: second, confidence: programConfidence(orphan), atoms: orphan.atoms }).toEqual({ sentence: "That token gains haste until end of turn.", confidence: "low", atoms: [] });
    // The sentence is read whole: the real oracle with one substitution (a rider after "until end of turn") parks the card.
    const ridered = { ...LOYAL_APPRENTICE, name: "Synthetic Apprentice", oracle: LOYAL_APPRENTICE.oracle.replace("until end of turn.", "until end of turn unless an opponent pays {1}.") };
    expect(classifyCard(ridered)).toBe("body-only");
    // Inkling Summoning's token (no haste sentence) is summoning sick and has no haste.
    const s0 = board({ user: { bf: lands("p", PLAINS, 3), hand: [cardOf(INKLING_SUMMONING, "c-is")] } });
    const made = resolveOne(castAs(s0, "user", "c-is"));
    const [inkling] = byName(made, "user", "Inkling");
    expect({ summoningSick: inkling.summoningSick, haste: permanentHasKeyword(made, inkling.id, "Haste"), effects: (made.continuousEffects || []).length }).toEqual({ summoningSick: true, haste: false, effects: 0 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("Warstorm Surge — the entering creature deals damage equal to its power", () => {
  /** Warstorm Surge under your control; `hand` holds what you cast; the opponent's side is `ai`. */
  const surgeBoard = ({ hand = [], userBf = [], userLands = lands("f", FOREST, 6), ai = {} } = {}) =>
    board({ user: { bf: [perm("ws", WARSTORM_SURGE), ...userBf, ...userLands], hand }, ai });
  const entered = (s, name) => byName(s, "user", name)[0]?.id;
  const life = (s) => [s.players.user.life, s.players.ai.life];
  const AI_KILL = { bf: lands("asw", SWAMP, 3, "ai"), hand: [cardOf(MURDER, "c-mu")] };
  /** The opponent answers the trigger: Murder on the creature that entered; Murder resolves, the trigger stays on the stack. */
  const murderInResponse = (s, name) => resolveOne(castAs(s, "ai", "c-mu", aimedAt(entered(s, name))));

  it("parse + classify: a deal-damage atom sized by the entering creature's power, the entering creature its source; native-trigger", () => {
    const [d] = detectTriggers(WARSTORM_SURGE);
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    const row = { event: d.event, scope: d.scope, clause: d.effectClause, confidence: programConfidence(p), atoms: p.atoms, tier: classifyCard(WARSTORM_SURGE) };
    console.log("  WITNESS surgeParse", JSON.stringify(row));
    expect(row).toEqual({ event: "etb", scope: "creatureYouControl", clause: "the entering creature deals damage equal to its own power to any target", confidence: "high", tier: "native-trigger",
      atoms: [{ op: "deal-damage", targetType: "any", amountCount: { kind: "triggeringPower", per: 1 }, damageSource: "triggering" }] });
  });

  it("⭐ a 2/2 enters: 2 damage to the chosen target — a player, or a creature (marked, it survives)", () => {
    const face = resolveOne(enterAimed(surgeBoard({ hand: [cardOf(BEARS, "c-b")] }), "c-b", "ai"));
    const giant = resolveOne(enterAimed(surgeBoard({ hand: [cardOf(BEARS, "c-b")], ai: { bf: [perm("hg", HILL_GIANT, "ai")] } }), "c-b", "hg"));
    expect({ face: life(face), giant: [life(giant), findPermanent(giant, "hg")?.permanent.damageMarked] }).toEqual({ face: [40, 38], giant: [[40, 40], 2] });
  });

  it("⭐ LIFELINK — Healer's Hawk enters: its controller gains the 1 it dealt, and their lifegain watcher sees it (CR 702.15b)", () => {
    const s0 = surgeBoard({ hand: [cardOf(HEALERS_HAWK, "c-hh")], userBf: [perm("pm", AJANIS_PRIDEMATE)], userLands: lands("p", PLAINS, 2) });
    const dealt = resolveOne(enterAimed(s0, "c-hh", "ai"));
    const watcher = resolveOne(dealt);
    expect({ life: life(dealt), pridemateTrigger: stackNames(dealt), counters: findPermanent(watcher, "pm").permanent.counters?.["+1/+1"] })
      .toEqual({ life: [41, 39], pridemateTrigger: ["triggered-ability:Ajani's Pridemate"], counters: 1 });
  });

  it("⭐ DEATHTOUCH — Typhoid Rats enters: 1 damage destroys a 3/3 (CR 702.2b)", () => {
    const s0 = surgeBoard({ hand: [cardOf(TYPHOID_RATS, "c-tr")], userLands: lands("sw", SWAMP, 1), ai: { bf: [perm("hg", HILL_GIANT, "ai")] } });
    const done = resolveOne(enterAimed(s0, "c-tr", "hg"));
    expect({ giant: onBattlefield(done, "hg"), graveyard: done.players.ai.graveyard.map((c) => c.name) }).toEqual({ giant: false, graveyard: ["Hill Giant"] });
  });

  it("INFECT and WITHER — the dealer's own: poison to a player, -1/-1 counters to a creature (Glistener Elf, Sickle Ripper)", () => {
    const face = resolveOne(enterAimed(surgeBoard({ hand: [cardOf(GLISTENER_ELF, "c-ge")] }), "c-ge", "ai"));
    const giant = resolveOne(enterAimed(surgeBoard({ hand: [cardOf(GLISTENER_ELF, "c-ge")], ai: { bf: [perm("hg", HILL_GIANT, "ai")] } }), "c-ge", "hg"));
    const ripper = surgeBoard({ hand: [cardOf(SICKLE_RIPPER, "c-sr")], userLands: lands("sw", SWAMP, 2), ai: { bf: [perm("hg", HILL_GIANT, "ai")] } });
    const withered = resolveOne(enterAimed(ripper, "c-sr", "hg"));
    const marks = (s) => { const g = findPermanent(s, "hg").permanent; return [g.counters?.["-1/-1"] ?? 0, g.damageMarked ?? 0]; };
    expect({ face: [life(face), face.players.ai.poison], infected: marks(giant), withered: marks(withered) }).toEqual({ face: [[40, 40], 1], infected: [1, 0], withered: [2, 0] });
  });

  it("⭐ pumped in response: the power is read on resolution — Giant Growth makes it 5", () => {
    const s0 = surgeBoard({ hand: [cardOf(BEARS, "c-b"), cardOf(GIANT_GROWTH, "c-gg")] });
    const triggered = enterAimed(s0, "c-b", "ai");
    const pumped = resolveOne(castAs(triggered, "user", "c-gg", aimedAt(entered(triggered, "Grizzly Bears"))));
    expect({ unpumped: life(resolveOne(triggered)), pumped: life(resolveOne(pumped)) }).toEqual({ unpumped: [40, 38], pumped: [40, 35] });
  });

  it("⭐ it left before resolution: its power as it last existed on the battlefield — destroyed in response; pumped, then destroyed; sacrificed", () => {
    const s0 = surgeBoard({ hand: [cardOf(BEARS, "c-b"), cardOf(GIANT_GROWTH, "c-gg"), cardOf(ALTARS_REAP, "c-ar")], userLands: [...lands("f", FOREST, 4), ...lands("sw", SWAMP, 2)], ai: AI_KILL });
    const triggered = enterAimed(s0, "c-b", "ai");
    const bears = entered(triggered, "Grizzly Bears");
    const murdered = murderInResponse(triggered, "Grizzly Bears");
    const pumpedThenMurdered = murderInResponse(resolveOne(castAs(triggered, "user", "c-gg", aimedAt(bears))), "Grizzly Bears");
    const sacrificed = resolveOne(castAs(triggered, "user", "c-ar", (a) => JSON.stringify(a).includes(bears)));
    const record = murdered.stack[0].payload.params.context.triggeringLki;
    const row = { gone: [onBattlefield(murdered, bears), onBattlefield(pumpedThenMurdered, bears), onBattlefield(sacrificed, bears)], record,
      murdered: life(resolveOne(murdered)), pumpedThenMurdered: life(resolveOne(pumpedThenMurdered)), sacrificed: life(resolveOne(sacrificed)) };
    console.log("  WITNESS surgeLeft", JSON.stringify(row));
    expect(row).toEqual({ gone: [false, false, false], record: { permanentId: bears, controller: "user", power: 2, toughness: 2, isCreature: true, colors: ["G"], keywords: [] },
      murdered: [40, 38], pumpedThenMurdered: [40, 35], sacrificed: [40, 38] });
  });

  it("⭐ it left before resolution: its lifelink, deathtouch, infect and wither still apply (the bundled ruling; CR 608.2h)", () => {
    const run = (card, cardId, name, landCard, targetId) => {
      const s0 = surgeBoard({ hand: [cardOf(card, cardId)], userLands: lands("l", landCard, 2), ai: targetId === "hg" ? { ...AI_KILL, bf: [...AI_KILL.bf, perm("hg", HILL_GIANT, "ai")] } : AI_KILL });
      const answered = murderInResponse(enterAimed(s0, cardId, targetId), name);
      return { answered, done: resolveOne(answered) };
    };
    const hawk = run(HEALERS_HAWK, "c-hh", "Healer's Hawk", PLAINS, "ai");
    const rats = run(TYPHOID_RATS, "c-tr", "Typhoid Rats", SWAMP, "hg");
    const elf = run(GLISTENER_ELF, "c-ge", "Glistener Elf", FOREST, "ai");
    const ripper = run(SICKLE_RIPPER, "c-sr", "Sickle Ripper", SWAMP, "hg");
    const keywords = (r) => r.answered.stack[0].payload.params.context.triggeringLki.keywords;
    expect({ hawk: [keywords(hawk), life(hawk.done)], rats: [keywords(rats), onBattlefield(rats.done, "hg")], elf: [keywords(elf), life(elf.done), elf.done.players.ai.poison],
      ripper: [keywords(ripper), findPermanent(ripper.done, "hg").permanent.counters?.["-1/-1"]] })
      .toEqual({ hawk: [["Lifelink"], [41, 39]], rats: [["Deathtouch"], false], elf: [["Infect"], [40, 40], 1], ripper: [["Wither"], 2] });
  });

  it("⭐ the lifelink gain is the DEALER's controller's — then or now: a Hawk that changed sides before the trigger resolved gains for its new controller", () => {
    // SETUP: control moves by the engine's one control move (see the Loyal Apprentice note) — no native instant does it.
    const triggered = enterAimed(surgeBoard({ hand: [cardOf(HEALERS_HAWK, "c-hh")], userLands: lands("p", PLAINS, 2) }), "c-hh", "ai");
    const stolen = moveControl(triggered, entered(triggered, "Healer's Hawk"), "ai");
    expect({ kept: life(resolveOne(triggered)), stolen: life(resolveOne(stolen)) }).toEqual({ kept: [41, 39], stolen: [40, 40] });
  });

  it("⭐ PROTECTION FROM CREATURES — Warstorm Surge may target Beloved Chaplain; the creature's damage is prevented, lifelink gains nothing (the bundled ruling)", () => {
    const s0 = surgeBoard({ hand: [cardOf(HEALERS_HAWK, "c-hh")], userLands: lands("p", PLAINS, 2), ai: { ...AI_KILL, bf: [...AI_KILL.bf, perm("bc", BELOVED_CHAPLAIN, "ai")] } });
    const triggered = enterAimed(s0, "c-hh", "bc");
    const live = resolveOne(triggered);
    const left = resolveOne(murderInResponse(triggered, "Healer's Hawk"));
    const row = { targets: triggered.stack[0].targets.map((t) => t.id), live: [onBattlefield(live, "bc"), findPermanent(live, "bc")?.permanent.damageMarked ?? 0, life(live)],
      left: [onBattlefield(left, "bc"), life(left)], prevented: live.log.filter((e) => e.kind === "damage-prevented" && e.via === "protection").length };
    console.log("  WITNESS surgeChaplain", JSON.stringify(row));
    expect(row).toEqual({ targets: ["bc"], live: [true, 0, [40, 40]], left: [true, [40, 40]], prevented: 1 });
  });

  it("⭐ PROTECTION FROM A COLOR is the dealer's color: a green creature's damage to Vodalian Zombie is prevented (on the battlefield or gone), a red creature's is dealt (CR 702.16e)", () => {
    const zombie = { ...AI_KILL, bf: [...AI_KILL.bf, perm("vz", VODALIAN_ZOMBIE, "ai")] };
    const green = enterAimed(surgeBoard({ hand: [cardOf(BEARS, "c-b")], ai: zombie }), "c-b", "vz");
    const red = enterAimed(surgeBoard({ hand: [cardOf(GOBLIN_PIKER, "c-gp")], userLands: lands("m", MOUNTAIN, 2), ai: zombie }), "c-gp", "vz");
    expect({ green: onBattlefield(resolveOne(green), "vz"), greenLeft: onBattlefield(resolveOne(murderInResponse(green, "Grizzly Bears")), "vz"), red: onBattlefield(resolveOne(red), "vz") })
      .toEqual({ green: true, greenLeft: true, red: false });
  });

  it("the ABILITY's source is Warstorm Surge: a creature with protection from red is not a target the ability can affect, whatever color entered (CR 702.16b)", () => {
    const s0 = surgeBoard({ hand: [cardOf(BEARS, "c-b")], ai: { bf: [perm("kf", KOR_FIREWALKER, "ai")] } });
    const triggered = enterAimed(s0, "c-b", "kf");
    const done = resolveOne(triggered);
    const row = { walker: [onBattlefield(done, "kf"), findPermanent(done, "kf")?.permanent.damageMarked ?? 0], fizzled: done.log.filter((e) => e.kind === "spell-fizzle").length };
    console.log("  WITNESS surgeFirewalker", JSON.stringify(row));
    expect(row).toEqual({ walker: [true, 0], fizzled: 1 });
  });

  describe("one event removes the creature AND the lord that was pumping it: it is read with the lord still there", () => {
    const lordBoard = (hand, ai, userLands = lands("f", FOREST, 2), userBf = []) => surgeBoard({ hand, userBf: [perm("km", KONGMING), ...userBf], userLands, ai });

    it("⭐ a destroy event — your own Nevinyrral's Disk, activated with the trigger on the stack: Warstorm Surge is destroyed too and its ability still resolves for 3", () => {
      // The engine offers activated abilities on their controller's own turn, so the sweep is the active player's.
      const s0 = lordBoard([cardOf(BEARS, "c-b")], {}, lands("f", FOREST, 3), [perm("disk", NEVINYRRALS_DISK)]);
      const triggered = enterAimed(s0, "c-b", "ai");
      const swept = resolveOne(activateAs(triggered, "user", "disk"));
      const done = resolveOne(swept);
      expect({ power: creaturePower(findPermanent(triggered, entered(triggered, "Grizzly Bears")).permanent, triggered), surgeGone: !onBattlefield(swept, "ws"), userCreatures: swept.players.user.battlefield.filter((p) => /Creature/.test(p.card.type)).length,
        record: swept.stack[0].payload.params.context.triggeringLki.power, life: life(done) })
        .toEqual({ power: 3, surgeGone: true, userCreatures: 0, record: 3, life: [40, 37] });
    });

    it("⭐ a bounce event — Evacuation in response: 3", () => {
      const s0 = lordBoard([cardOf(BEARS, "c-b")], { bf: lands("aisl", ISLAND, 5, "ai"), hand: [cardOf(EVACUATION, "c-ev")] });
      const triggered = enterAimed(s0, "c-b", "ai");
      const swept = resolveOne(castAs(triggered, "ai", "c-ev"));
      expect({ hand: swept.players.user.hand.map((c) => c.name).sort(), life: life(resolveOne(swept)) }).toEqual({ hand: ["Grizzly Bears", "Kongming, \"Sleeping Dragon\""], life: [40, 37] });
    });

    it("⭐ lethal damage, one state-based pass — Volcanic Fallout in response to a 2/1 that the lord made 3/2: 3", () => {
      const s0 = lordBoard([cardOf(GOBLIN_PIKER, "c-gp")], { bf: lands("am", MOUNTAIN, 3, "ai"), hand: [cardOf(VOLCANIC_FALLOUT, "c-vf")] }, lands("m", MOUNTAIN, 2));
      const triggered = enterAimed(s0, "c-gp", "ai");
      const swept = resolveOne(castAs(triggered, "ai", "c-vf"));
      expect({ graveyard: swept.players.user.graveyard.map((c) => c.name).sort(), afterFallout: life(swept), life: life(resolveOne(swept)) })
        .toEqual({ graveyard: ["Goblin Piker", "Kongming, \"Sleeping Dragon\""], afterFallout: [38, 38], life: [38, 35] });
    });
  });

  it("⭐ a creature that dies in the resolution it entered in (its trigger not yet on the stack): Inkling Summoning's 2/1 under Night of Souls' Betrayal deals the 1 it last had", () => {
    const s0 = surgeBoard({ hand: [cardOf(INKLING_SUMMONING, "c-is")], userLands: lands("p", PLAINS, 3), ai: { bf: [perm("nsb", NIGHT_OF_SOULS_BETRAYAL, "ai")] } });
    const triggered = enterAimed(s0, "c-is", "ai");
    const done = resolveOne(triggered);
    expect({ inklings: byName(triggered, "user", "Inkling").length, stack: stackNames(triggered), record: triggered.stack[0].payload.params.context.triggeringLki.power, life: life(done) })
      .toEqual({ inklings: 0, stack: ["triggered-ability:Warstorm Surge"], record: 1, life: [40, 39] });
  });

  it("two tokens die as they enter (Parallel Lives): each waiting trigger carries its own creature's record — 1 and 1", () => {
    const s0 = surgeBoard({ hand: [cardOf(INKLING_SUMMONING, "c-is")], userBf: [perm("pl", PARALLEL_LIVES)], userLands: lands("p", PLAINS, 3), ai: { bf: [perm("nsb", NIGHT_OF_SOULS_BETRAYAL, "ai")] } });
    const triggered = resolveOne(castAs(s0, "user", "c-is"));
    const records = triggered.stack.map((o) => [o.payload.params.context.triggeringPermanentId === o.payload.params.context.triggeringLki?.permanentId, o.payload.params.context.triggeringLki?.power]);
    expect({ stack: stackNames(triggered), records, life: life(resolveOne(resolveOne(triggered))) })
      .toEqual({ stack: ["triggered-ability:Warstorm Surge", "triggered-ability:Warstorm Surge"], records: [[true, 1], [true, 1]], life: [40, 38] });
  });

  describe("the same record answers for the existing readers of the entering creature (their bundled ruling: last known power)", () => {
    it("⭐ Terror of the Peaks: the creature that entered is destroyed in response — 2 damage, not 0; and the creature that died as it entered — 1", () => {
      const s0 = board({ user: { bf: [perm("tp", TERROR_OF_THE_PEAKS), ...lands("m", MOUNTAIN, 2)], hand: [cardOf(GOBLIN_PIKER, "c-gp")] }, ai: AI_KILL });
      const triggered = enterAimed(s0, "c-gp", "ai");
      const left = resolveOne(resolveOne(castAs(triggered, "ai", "c-mu", aimedAt(byName(triggered, "user", "Goblin Piker")[0].id))));
      const s1 = board({ user: { bf: [perm("tp", TERROR_OF_THE_PEAKS), ...lands("p", PLAINS, 3)], hand: [cardOf(INKLING_SUMMONING, "c-is")] }, ai: { bf: [perm("nsb", NIGHT_OF_SOULS_BETRAYAL, "ai")] } });
      const diedEntering = resolveOne(enterAimed(s1, "c-is", "ai"));
      expect({ atom: triggered.stack[0].payload.params.program.atoms, live: resolveOne(triggered).players.ai.life, left: left.players.ai.life, diedEntering: diedEntering.players.ai.life })
        .toEqual({ atom: [{ op: "deal-damage", targetType: "any", amountCount: { kind: "triggeringPower", per: 1 } }], live: 38, left: 38, diedEntering: 39 });
    });

    it("Verdant Sun's Avatar: the creature that entered is destroyed in response — you still gain its toughness (a 2/1: 1)", () => {
      const s0 = board({ user: { bf: [perm("vsa", VERDANT_SUNS_AVATAR), ...lands("m", MOUNTAIN, 2)], hand: [cardOf(GOBLIN_PIKER, "c-gp")] }, ai: AI_KILL });
      const triggered = resolveOne(castAs(s0, "user", "c-gp"));
      const left = resolveOne(resolveOne(castAs(triggered, "ai", "c-mu", aimedAt(byName(triggered, "user", "Goblin Piker")[0].id))));
      expect({ stack: stackNames(triggered), live: resolveOne(triggered).players.user.life, left: left.players.user.life }).toEqual({ stack: ["triggered-ability:Verdant Sun's Avatar"], live: 41, left: 41 });
    });
  });

  it("the entering-dealer lane on 'target creature' — Efteekay, Flame of the Kav enters (itself a Kavu): its 4 power to target creature; the card stays parked on its Eminence line", () => {
    const s0 = board({ user: { bf: [...lands("m", MOUNTAIN, 3), ...lands("f", FOREST, 3)], hand: [cardOf(EFTEEKAY, "c-ef")] }, ai: { bf: [perm("hg", HILL_GIANT, "ai")] } });
    const [d] = detectTriggers(EFTEEKAY);
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    const done = resolveOne(enterAimed(s0, "c-ef", "hg"));
    expect({ atoms: p.atoms, giant: onBattlefield(done, "hg"), tier: classifyCard(EFTEEKAY) })
      .toEqual({ atoms: [{ op: "deal-damage", targetType: "creature", amountCount: { kind: "triggeringPower", per: 1 }, damageSource: "triggering" }], giant: false, tier: "body-only" });
  });

  it("DOCUMENTED UNDER-READ (pre-existing, unchanged by this slice): an ability's OWN permanent source is still read for infect and wither only — Terror of the Peaks wearing Basilisk Collar deals 2 to a 3/3, which survives, and no life is gained", () => {
    const s0 = board({ user: { bf: [perm("tp", TERROR_OF_THE_PEAKS), perm("col", BASILISK_COLLAR), ...lands("f", FOREST, 2)], hand: [cardOf(BEARS, "c-b")] }, ai: { bf: [perm("hg", HILL_GIANT, "ai")] } });
    const collared = attachPermanent(s0, { equipId: "col", targetId: "tp" });
    const done = resolveOne(enterAimed(collared, "c-b", "hg"));
    expect({ collar: [permanentHasKeyword(collared, "tp", "Deathtouch"), permanentHasKeyword(collared, "tp", "Lifelink")], giant: [onBattlefield(done, "hg"), findPermanent(done, "hg")?.permanent.damageMarked], life: life(done) })
      .toEqual({ collar: [true, true], giant: [true, 2], life: [40, 40] });
  });

  it("CREED — only the leading 'it' of an ENTERS trigger over an entering creature is the dealer: the dies watcher, the self-enter form and the optional forms keep their own reads", () => {
    const clause = (card, event) => detectTriggers(card).find((d) => d.event === event)?.effectClause;
    const redcap = parseEffectClause(clause(MURDEROUS_REDCAP, "etb"), "Instant", { hasX: false, sourceScoped: true });
    const row = { stalking: [clause(STALKING_VENGEANCE, "dies"), classifyCard(STALKING_VENGEANCE)], redcap: [clause(MURDEROUS_REDCAP, "etb"), redcap.atoms.map((a) => [a.amountCount?.kind, a.damageSource ?? null])],
      parked: [ELECTROPOTENCE, PANDEMONIUM].map((c) => classifyCard(c)) };
    console.log("  WITNESS surgeNeighbours", JSON.stringify(row));
    expect(row).toEqual({ stalking: ["the triggering creature deals damage equal to its own power to target player or planeswalker", "body-only"],
      redcap: ["it deals damage equal to its power to any target", [["sourcePower", null]]], parked: ["body-only", "body-only"] });
  });

  describe("SYNTHETIC (CREED guards with no printed carrier) — hand-built inputs, labelled", () => {
    const DEALER_ATOM = { op: "deal-damage", targetType: "any", amountCount: { kind: "triggeringPower", per: 1 }, damageSource: "triggering" };

    it("a mid-clause 'it' (after another instruction) is not the leading dealer: the real oracle with one substitution keeps the unread sentinel and parks", () => {
      const fake = { ...WARSTORM_SURGE, name: "Synthetic Surge", oracle: WARSTORM_SURGE.oracle.replace("enters, it deals", "enters, you gain 1 life, then it deals") };
      const [d] = detectTriggers(fake);
      expect({ clause: d.effectClause, tier: classifyCard(fake) })
        .toEqual({ clause: "you gain 1 life, then the triggering creature deals damage equal to its own power to any target", tier: "body-only" });
    });

    it("the entering-dealer atom routes natively only off an enters event (the routing pin on top of the etb-gated sentinel)", () => {
      const program = { atoms: [DEALER_ATOM], structure: "sequence" };
      expect(["etb", "dies", "attacks"].map((ev) => combatDamageReferentSatisfied(program, ev))).toEqual([true, false, false]);
    });

    it("a last-known record answers only a TRIGGERING read of the permanent it was taken from; another creature, a source read, no record → 0", () => {
      const s = board();
      const record = { permanentId: "x", controller: "user", power: 5, toughness: 4, isCreature: true, colors: [], keywords: [] };
      expect({ itsOwn: countForSpec(s, { controller: "user", triggeringPermanentId: "x", triggeringLki: record }, { kind: "triggeringPower" }),
        itsOwnToughness: countForSpec(s, { controller: "user", triggeringPermanentId: "x", triggeringLki: record }, { kind: "triggeringToughness" }),
        anotherCreature: countForSpec(s, { controller: "user", triggeringPermanentId: "y", triggeringLki: record }, { kind: "triggeringPower" }),
        sourceRead: countForSpec(s, { controller: "user", sourceId: "x", triggeringPermanentId: "x", triggeringLki: record }, { kind: "sourcePower" }),
        noRecord: countForSpec(s, { controller: "user", triggeringPermanentId: "x" }, { kind: "triggeringPower" }) })
        .toEqual({ itsOwn: 5, itsOwnToughness: 4, anotherCreature: 0, sourceRead: 0, noRecord: 0 });
    });

    it("a permanent that moves battlefield → battlefield has not left: no record is written on its waiting trigger", () => {
      const s0 = surgeBoard({ hand: [cardOf(BEARS, "c-b")] });
      const triggered = enterAimed(s0, "c-b", "ai");
      const bears = entered(triggered, "Grizzly Bears");
      const moved = moveCardToZone(triggered, { playerId: "user", fromZone: "battlefield", toZone: "battlefield", cardId: bears });
      const left = moveCardToZone(triggered, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: bears });
      expect({ moved: moved.stack[0].payload.params.context.triggeringLki ?? null, left: left.stack[0].payload.params.context.triggeringLki?.power }).toEqual({ moved: null, left: 2 });
    });

    it("a waiting trigger whose creature is not on the battlefield and was never recorded: the record call is a no-op, never a throw", () => {
      const triggered = enterAimed(surgeBoard({ hand: [cardOf(BEARS, "c-b")] }), "c-b", "ai");
      const bears = entered(triggered, "Grizzly Bears");
      // Hand-built: the Bears removed from the battlefield without the zone move that would have recorded it.
      const vanished = { ...triggered, players: { ...triggered.players, user: { ...triggered.players.user, battlefield: triggered.players.user.battlefield.filter((p) => p.id !== bears) } } };
      expect(stampTriggeringLki(vanished, bears)).toBe(vanished);
      expect(life(resolveOne(vanished))).toEqual([40, 40]); // no creature, no record: nothing is dealt
    });
  });
});
