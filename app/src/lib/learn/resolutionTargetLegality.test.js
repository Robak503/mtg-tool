/**
 * resolutionTargetLegality.test.js — a spell or ability re-checks its targets' LEGALITY as it resolves (CR 608.2b):
 * "If the spell or ability specifies targets, it checks whether the targets are still legal. A target that's no longer in
 * the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be
 * legal; for example, its characteristics may have changed … If all its targets, for every instance of the word 'target,'
 * are now illegal, the spell or ability doesn't resolve … Illegal targets, if any, won't be affected by parts of a
 * resolving spell's effect for which they're illegal … If part of the effect requires information about an illegal
 * target, it fails to determine any such information."
 *
 * THE BUG. runProgram's B4 gate asked only whether each target still EXISTED. A target that was still there but no longer
 * legal — protection from the source's colour, hexproof or shroud gained in response, a control change against "an
 * opponent controls", a creature that stopped being one — was affected anyway: Swords to Plowshares exiled a creature that
 * had just gained protection from white, in every game.
 *
 * THE FIX. targeting.resolutionTargetVerdicts re-asks, for every recorded target, the predicate that OFFERED it — the same
 * spellEffects.enumerateTargets pool, rebuilt from the payload (the atom's slot, or the single-effect cast path's
 * legacyTargetingEffect for an untagged target; the cast-time context; the source's colours as they are now). The
 * EFFECT_PROGRAM resolver drops an illegal target from the list every atom reads and fizzles a spell or ability whose
 * every target is illegal. Under ctx.recheck the offer-side refusals of what the engine can't judge are off (an empty
 * colour list, a spell that can't be countered, a lesser-power comparison against a departed source), and "target
 * creature" reads creature-ness through layers only, so a creature that stopped being one is no longer a legal target.
 * The Aura spell resolver (CR 608.3b) and the Equip / Aura-attach resolver re-ask the same canBeTargetedBy /
 * playerTargetableBy their offers read; a bestowed Aura spell whose target is illegal resolves as a creature (CR 702.103e).
 *
 * Every cast, activation and response below goes through the engine's real entry points (legal action → dispatch →
 * resolve). Real oracle fixtures, generated from the bundled Scryfall data (2026-10-02); the trailing comment on each is
 * its tier. The few hand-built stack objects are labelled SYNTHETIC — each pins a guard no real card reaches today.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { checkAttackTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolverKeys.js";
import { permanentIsCreature, permanentPower, permanentProtectionColors } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ─────────────────────────────────────────────────────────────────────────────
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature. Its controller gains life equal to its power."}; // native-spell
const LIGHTNING_HELIX = {"name":"Lightning Helix","type":"Instant","mana":"{R}{W}","cmc":2,"keywords":[],"colors":["R","W"],"oracle":"Lightning Helix deals 3 damage to any target and you gain 3 life."}; // native-spell
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const BLOSSOMING_DEFENSE = {"name":"Blossoming Defense","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature you control gets +2/+2 and gains hexproof until end of turn. (It can't be the target of spells or abilities your opponents control.)"}; // native-spell
const SNAKESKIN_VEIL = {"name":"Snakeskin Veil","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn. (It can't be the target of spells or abilities your opponents control.)"}; // native-spell
const RANGERS_GUILE = {"name":"Ranger's Guile","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature you control gets +1/+1 and gains hexproof until end of turn. (It can't be the target of spells or abilities your opponents control.)"}; // native-spell
const MAGES_GUILE = {"name":"Mage's Guile","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":["Cycling"],"colors":["U"],"oracle":"Target creature gains shroud until end of turn. (It can't be the target of spells or abilities.)\nCycling {U} ({U}, Discard this card: Draw a card.)"}; // native-spell
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."}; // native-trigger
const TURN_AGAINST = {"name":"Turn Against","type":"Instant","mana":"{4}{R}","cmc":5,"keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nGain control of target creature until end of turn. Untap that creature. It gains haste until end of turn."}; // native-spell
const FEED_THE_SWARM = {"name":"Feed the Swarm","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent's mana value."}; // native-spell
const THASSA = {"name":"Thassa, God of the Sea","type":"Legendary Enchantment Creature — God","mana":"{2}{U}","cmc":3,"power":"5","toughness":"5","keywords":["Indestructible","Scry"],"colors":["U"],"oracle":"Indestructible\nAs long as your devotion to blue is less than five, Thassa isn't a creature. (Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)\nAt the beginning of your upkeep, scry 1.\n{1}{U}: Target creature you control can't be blocked this turn."}; // native-mixed
const PHANTOM_WARRIOR = {"name":"Phantom Warrior","type":"Creature — Illusion Warrior","mana":"{1}{U}{U}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["U"],"oracle":"This creature can't be blocked."}; // native-body
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Return target creature to its owner's hand."}; // native-spell
const KOLAGHANS_COMMAND = {"name":"Kolaghan's Command","type":"Instant","mana":"{1}{B}{R}","cmc":3,"keywords":[],"colors":["B","R"],"oracle":"Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n• Kolaghan's Command deals 2 damage to any target."}; // native-spell
const PRODIGAL_SORCERER = {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: This creature deals 1 damage to any target."}; // native-activated
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."}; // native-activated
const SHELTER = {"name":"Shelter","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Target creature you control gains protection from the color of your choice until end of turn.\nDraw a card."}; // native-spell
const ROD_OF_RUIN = {"name":"Rod of Ruin","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"{3}, {T}: This artifact deals 1 damage to any target."}; // native-activated
const VEIL_OF_SUMMER = {"name":"Veil of Summer","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)"}; // native-spell
const DISMISS = {"name":"Dismiss","type":"Instant","mana":"{2}{U}{U}","cmc":4,"keywords":[],"colors":["U"],"oracle":"Counter target spell.\nDraw a card."}; // native-spell
const VEXING_SHUSHER = {"name":"Vexing Shusher","type":"Creature — Goblin Shaman","mana":"{R/G}{R/G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G","R"],"oracle":"This spell can't be countered.\n{R/G}: Target spell can't be countered."}; // native-mixed
const SUNHOME_STALWART = {"name":"Sunhome Stalwart","type":"Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Mentor","First strike"],"colors":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)"}; // native-body
const SUNTAIL_HAWK = {"name":"Suntail Hawk","type":"Creature — Bird","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["Flying"],"colors":["W"],"oracle":"Flying"}; // native-body
const SEEKER_OF_SKYBREAK = {"name":"Seeker of Skybreak","type":"Creature — Elf","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Untap target creature."}; // native-activated
const GAEAS_REVENGE = {"name":"Gaea's Revenge","type":"Creature — Elemental","mana":"{5}{G}{G}","cmc":7,"power":"8","toughness":"5","keywords":["Haste"],"colors":["G"],"oracle":"This spell can't be countered.\nHaste\nThis creature can't be the target of nongreen spells or abilities from nongreen sources."}; // native-static
const DWELL_ON_THE_PAST = {"name":"Dwell on the Past","type":"Sorcery","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target player shuffles up to four target cards from their graveyard into their library."}; // native-spell
const RAM_THROUGH = {"name":"Ram Through","type":"Instant","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead."}; // native-spell
const HERE_COMES_A_NEW_HERO = {"name":"Here Comes a New Hero!","type":"Sorcery","mana":"{X}{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Target player draws X cards. Create a token that's a copy of up to one target creature with mana value X or less."}; // native-spell
const ASSASSINATE = {"name":"Assassinate","type":"Sorcery","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target tapped creature."}; // native-spell
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const SAVANNAH_LIONS = {"name":"Savannah Lions","type":"Creature — Cat","mana":"{W}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["W"],"oracle":""}; // native-body
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const FRAYING_SANITY = {"name":"Fraying Sanity","type":"Enchantment — Aura Curse","mana":"{2}{U}","cmc":3,"keywords":["Enchant","Mill"],"colors":["U"],"oracle":"Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn."}; // native-aura
const CURSE_OF_OPULENCE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const DETAINMENT_SPELL = {"name":"Detainment Spell","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature's activated abilities can't be activated.\n{1}{W}: Attach this Aura to target creature."}; // native-aura
const NYXBORN_ROLLICKER = {"name":"Nyxborn Rollicker","type":"Enchantment Creature — Satyr","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Bestow"],"colors":["R"],"oracle":"Bestow {1}{R} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +1/+1."}; // native-aura

// ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, controller, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const H = (id, card) => ({ id, ...card });
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const library = (tag, n = 6) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${tag}${i}` }));

/** A two-seat board in `active`'s precombat main phase, both seats holding plenty of mana. */
function board({ user = [], ai = [], hand = [], aiHand = [], userGy = [], aiGy = [], active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, graveyard: userGy, manaPool: { ...s.players.user.manaPool, ...POOL }, library: library("ul") },
      ai: { ...s.players.ai, battlefield: ai, hand: aiHand, graveyard: aiGy, manaPool: { ...s.players.ai.manaPool, ...POOL }, library: library("al") } } };
}
const withPriority = (s, pid) => ({ ...s, priorityHolder: pid });
/** The first action `pid` is OFFERED matching `pred` — dispatched, nothing resolved. Throws when nothing matches. */
const take = (s, pid, pred, label) => {
  const st = withPriority(s, pid);
  const a = legalActionsForPlayer(st, pid).find(pred);
  if (!a) throw new Error(`no legal action: ${label}`);
  return dispatchAction(st, a);
};
const aimsAt = (a, ids) => ids.length === (a.targets || []).length && ids.every((id) => (a.targets || []).some((t) => t.id === id));
const cast = (s, pid, cardId, ids, extra = () => true) =>
  take(s, pid, (a) => a.kind === "cast-spell" && a.cardId === cardId && aimsAt(a, ids) && extra(a), `${pid} casts ${cardId} at ${ids}`);
const activate = (s, pid, permId, ids) =>
  take(s, pid, (a) => a.kind === "activate-ability" && a.permanentId === permId && aimsAt(a, ids), `${pid} activates ${permId} at ${ids}`);
const offered = (s, pid, cardId, id) => legalActionsForPlayer(withPriority(s, pid), pid)
  .some((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets || []).some((t) => t.id === id));
const resolveTop = (s) => resolveTopOfStack(s);
const perm = (s, id) => findPermanent(s, id)?.permanent || null;
const fizzled = (s, name) => (s.log || []).some((e) => e.kind === "spell-fizzle" && e.source === name && /608\.2b/.test(e.reason || ""));
const inZone = (s, pid, zone, cardId) => (s.players[pid][zone] || []).some((c) => c.id === cardId);
const counter = (s, id) => perm(s, id)?.counters?.["+1/+1"] || 0;

// ── the classification and parse the witnesses lean on ─────────────────────────────────────────────────────────────────────
describe("the witness cards: native, and parsed as the runtime plays them", () => {
  it("every card the witnesses cast or activate classifies native", () => {
    const tiers = Object.fromEntries([SWORDS, LIGHTNING_HELIX, MURDER, BLOSSOMING_DEFENSE, SNAKESKIN_VEIL, RANGERS_GUILE, MAGES_GUILE,
      RAVENOUS_CHUPACABRA, TURN_AGAINST, FEED_THE_SWARM, THASSA, UNSUMMON, KOLAGHANS_COMMAND, PRODIGAL_SORCERER, MOTHER_OF_RUNES,
      SHELTER, ROD_OF_RUIN, VEIL_OF_SUMMER, DISMISS, VEXING_SHUSHER, SUNHOME_STALWART, SEEKER_OF_SKYBREAK, GAEAS_REVENGE,
      DWELL_ON_THE_PAST, RAM_THROUGH, HERE_COMES_A_NEW_HERO, ASSASSINATE, CONTROL_MAGIC, PACIFISM, FRAYING_SANITY, BONESPLITTER,
      DETAINMENT_SPELL, NYXBORN_ROLLICKER].map((c) => [c.name, classifyCard(c)]));
    expect(tiers).toEqual({
      "Swords to Plowshares": "native-spell", "Lightning Helix": "native-spell", "Murder": "native-spell",
      "Blossoming Defense": "native-spell", "Snakeskin Veil": "native-spell", "Ranger's Guile": "native-spell", "Mage's Guile": "native-spell",
      "Ravenous Chupacabra": "native-trigger", "Turn Against": "native-spell", "Feed the Swarm": "native-spell",
      "Thassa, God of the Sea": "native-mixed", "Unsummon": "native-spell", "Kolaghan's Command": "native-spell",
      "Prodigal Sorcerer": "native-activated", "Mother of Runes": "native-activated", "Shelter": "native-spell",
      "Rod of Ruin": "native-activated", "Veil of Summer": "native-spell", "Dismiss": "native-spell", "Vexing Shusher": "native-mixed",
      "Sunhome Stalwart": "native-body", "Seeker of Skybreak": "native-activated", "Gaea's Revenge": "native-static",
      "Dwell on the Past": "native-spell", "Ram Through": "native-spell", "Here Comes a New Hero!": "native-spell", "Assassinate": "native-spell",
      "Control Magic": "native-aura", "Pacifism": "native-aura", "Fraying Sanity": "native-aura", "Bonesplitter": "native-equipment",
      "Detainment Spell": "native-aura", "Nyxborn Rollicker": "native-aura",
    });
  });

  it("the parse: the targeted atoms whose targets are re-checked", () => {
    expect(parseEffectProgram(SWORDS).atoms).toEqual([{ op: "exile", targetType: "creature", controllerRider: { kind: "gainLifePower" } }]);
    const helix = parseEffectProgram(LIGHTNING_HELIX);
    expect(programConfidence(helix)).toBe("high");
    expect(helix.atoms).toEqual([{ op: "deal-damage", amount: 3, targetType: "any" }, { op: "gain-life", amount: 3, targetType: null }]);
    expect(parseEffectProgram(FEED_THE_SWARM).atoms[0]).toMatchObject({ op: "destroy", targetType: "creatureOrEnchantment", restrictions: [{ kind: "controller", who: "opponent" }] });
    expect(parseEffectProgram(RAM_THROUGH).atoms[0]).toMatchObject({ op: "damage-target-power", role: "target", secondaryRole: "fighter",
      restrictions: [{ kind: "controller", who: "opponent" }], secondaryRestrictions: [{ kind: "controller", who: "you" }] });
    const [prodigal] = parseActivatedAbilities(PRODIGAL_SORCERER);
    expect(prodigal.program.atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "any" }]);
    const [mother] = parseActivatedAbilities(MOTHER_OF_RUNES);
    expect(mother.program.atoms).toEqual([{ op: "grant-protection", targetType: "creatureYouControl", colorChoice: true }]);
    expect(parseEffectClause("destroy target creature an opponent controls", "Instant").atoms)
      .toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

// ── protection from the source's colour, gained in response ────────────────────────────────────────────────────────────────
describe("protection from the source's colour gained in response (CR 702.16b) — the spell doesn't resolve", () => {
  // The user's Grizzly Bears; the AI's Savannah Lions makes white the colour Mother of Runes / Shelter choose (the shared
  // choicePolicy tally of the opponent's permanents' colours).
  const swordsBoard = (aiExtra = []) => board({
    user: [P("bears", "user", GRIZZLY_BEARS), P("mother", "user", MOTHER_OF_RUNES)],
    ai: [P("lions", "ai", SAVANNAH_LIONS), ...aiExtra],
    aiHand: [H("swords", SWORDS)],
  });

  it("control: unanswered, Swords exiles the Bears and their controller gains 2", () => {
    let s = cast(swordsBoard(), "ai", "swords", ["bears"]);
    const life = s.players.user.life;
    s = resolveTop(s);
    expect(perm(s, "bears")).toBe(null);
    expect(inZone(s, "user", "exile", "c-bears")).toBe(true);
    expect(s.players.user.life).toBe(life + 2);
    expect(fizzled(s, "Swords to Plowshares")).toBe(false);
  });

  it("Mother of Runes answers with protection from white: Swords does nothing — no exile, no life — and goes to the graveyard", () => {
    let s = cast(swordsBoard(), "ai", "swords", ["bears"]);
    s = activate(s, "user", "mother", ["bears"]);
    const life = s.players.user.life;
    s = resolveTop(s); // Mother's ability: protection from white (the tally's colour)
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["W"]);
    s = resolveTop(s); // Swords: its only target is illegal
    expect(perm(s, "bears")).not.toBe(null);
    expect(s.players.user.life).toBe(life);
    expect(fizzled(s, "Swords to Plowshares")).toBe(true);
    expect(inZone(s, "ai", "graveyard", "swords")).toBe(true);
  });

  it("protection from a colour the spell is NOT (green) leaves Swords' target legal — it resolves", () => {
    // Two green creatures on the AI's side outvote the Lions, so Mother of Runes picks green.
    let s = cast(swordsBoard([P("elf1", "ai", LLANOWAR_ELVES), P("elf2", "ai", LLANOWAR_ELVES)]), "ai", "swords", ["bears"]);
    s = activate(s, "user", "mother", ["bears"]);
    s = resolveTop(s);
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["G"]);
    s = resolveTop(s);
    expect(perm(s, "bears")).toBe(null);
    expect(fizzled(s, "Swords to Plowshares")).toBe(false);
  });

  it("Lightning Helix: its target protected from white, the whole spell fizzles — the untargeted 'you gain 3 life' does not happen", () => {
    let s = board({
      user: [P("bears", "user", GRIZZLY_BEARS), P("mother", "user", MOTHER_OF_RUNES)],
      ai: [P("lions", "ai", SAVANNAH_LIONS)],
      aiHand: [H("helix", LIGHTNING_HELIX)],
    });
    s = cast(s, "ai", "helix", ["bears"]);
    s = activate(s, "user", "mother", ["bears"]);
    const aiLife = s.players.ai.life;
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(perm(s, "bears")).not.toBe(null);
    expect(s.players.ai.life).toBe(aiLife);
    expect(fizzled(s, "Lightning Helix")).toBe(true);
    expect(inZone(s, "ai", "graveyard", "helix")).toBe(true);
  });

  it("control: unanswered, Lightning Helix kills the Bears and its caster gains 3", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], ai: [P("lions", "ai", SAVANNAH_LIONS)], aiHand: [H("helix", LIGHTNING_HELIX)] });
    s = cast(s, "ai", "helix", ["bears"]);
    const aiLife = s.players.ai.life;
    s = resolveTop(s);
    expect(perm(s, "bears")).toBe(null);
    expect(s.players.ai.life).toBe(aiLife + 3);
  });
});

// ── hexproof and shroud gained in response ─────────────────────────────────────────────────────────────────────────────────
describe("hexproof and shroud gained in response (CR 702.11b, 702.18a)", () => {
  it("hexproof stops an OPPONENT's spell: Murder (the single-effect cast path — an untagged target) fizzles", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("blossom", BLOSSOMING_DEFENSE)], aiHand: [H("murder", MURDER)] });
    s = cast(s, "ai", "murder", ["bears"]);
    // The legacy single-effect lane records the target without an atom index; the re-check judges it by legacyTargetingEffect.
    expect(s.stack[0].payload.params.targets).toEqual([{ type: "creature", id: "bears", controller: "user", owner: "user", name: "Grizzly Bears" }]);
    s = cast(s, "user", "blossom", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")).not.toBe(null);
    expect(permanentPower(s, "bears")).toBe(4);
    expect(fizzled(s, "Murder")).toBe(true);
    expect(inZone(s, "ai", "graveyard", "murder")).toBe(true);
  });

  it("control: unanswered, Murder destroys the Bears", () => {
    let s = cast(board({ user: [P("bears", "user", GRIZZLY_BEARS)], aiHand: [H("murder", MURDER)] }), "ai", "murder", ["bears"]);
    s = resolveTop(s);
    expect(perm(s, "bears")).toBe(null);
  });

  it("hexproof does NOT stop its controller's own spell: Snakeskin Veil still resolves on a creature that gained hexproof", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("veil", SNAKESKIN_VEIL), H("blossom", BLOSSOMING_DEFENSE)] });
    s = cast(s, "user", "veil", ["bears"]);
    s = cast(s, "user", "blossom", ["bears"]); // held priority; resolves first — hexproof
    s = resolveTop(resolveTop(s));
    expect(counter(s, "bears")).toBe(1);
    expect(permanentPower(s, "bears")).toBe(5); // 2 + the +1/+1 counter + Blossoming Defense's +2
    expect(fizzled(s, "Snakeskin Veil")).toBe(false);
  });

  it("shroud stops its controller's own spell too: Ranger's Guile fizzles once Mage's Guile resolves", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("rguile", RANGERS_GUILE), H("mguile", MAGES_GUILE)] });
    s = cast(s, "user", "rguile", ["bears"]);
    s = cast(s, "user", "mguile", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(permanentPower(s, "bears")).toBe(2); // no +1/+1 from Ranger's Guile
    expect(fizzled(s, "Ranger's Guile")).toBe(true);
    expect(inZone(s, "user", "graveyard", "rguile")).toBe(true);
  });
});

// ── the target's characteristics changed ───────────────────────────────────────────────────────────────────────────────────
describe("a target whose characteristics changed (CR 608.2b) — control, creature-ness, tapped", () => {
  it("a creature that came under its caster's control is no longer 'a creature an opponent controls': Ravenous Chupacabra's trigger fizzles", () => {
    let s = board({ ai: [P("giant", "ai", HILL_GIANT)], hand: [H("chupa", RAVENOUS_CHUPACABRA), H("turn", TURN_AGAINST)] });
    s = cast(s, "user", "chupa", []);
    s = resolveTop(s); // Chupacabra enters; its trigger goes on the stack aimed at the Giant
    expect(s.stack.map((o) => [o.kind, (o.targets || []).map((t) => t.id)])).toEqual([["triggered-ability", ["giant"]]]);
    s = cast(s, "user", "turn", ["giant"]);
    s = resolveTop(s); // Turn Against: the user controls the Giant
    expect(findPermanent(s, "giant")?.controller).toBe("user");
    s = resolveTop(s);
    expect(perm(s, "giant")).not.toBe(null);
    expect(fizzled(s, "Ravenous Chupacabra")).toBe(true);
  });

  it("control: unanswered, the Chupacabra trigger destroys the Giant", () => {
    let s = cast(board({ ai: [P("giant", "ai", HILL_GIANT)], hand: [H("chupa", RAVENOUS_CHUPACABRA)] }), "user", "chupa", []);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "giant")).toBe(null);
  });

  it("Feed the Swarm fizzles on a creature its caster took in response — and its caster loses no life", () => {
    let s = board({ ai: [P("giant", "ai", HILL_GIANT)], hand: [H("feed", FEED_THE_SWARM), H("turn", TURN_AGAINST)] });
    s = cast(s, "user", "feed", ["giant"]);
    s = cast(s, "user", "turn", ["giant"]);
    const life = s.players.user.life;
    s = resolveTop(resolveTop(s));
    expect(perm(s, "giant")).not.toBe(null);
    expect(s.players.user.life).toBe(life); // "You lose life equal to that permanent's mana value" needs the illegal target
    expect(fizzled(s, "Feed the Swarm")).toBe(true);
  });

  it("a creature that stopped being one: Thassa below devotion five is no 'target creature' — Swords fizzles", () => {
    // Thassa {2}{U} + two Phantom Warriors {1}{U}{U}: devotion to blue 5, so Thassa is a creature.
    let s = board({
      ai: [P("thassa", "ai", THASSA), P("pw1", "ai", PHANTOM_WARRIOR), P("pw2", "ai", PHANTOM_WARRIOR)],
      hand: [H("swords", SWORDS)], aiHand: [H("unsummon", UNSUMMON)],
    });
    expect(permanentIsCreature(s, "thassa")).toBe(true);
    s = cast(s, "user", "swords", ["thassa"]);
    s = cast(s, "ai", "unsummon", ["pw1"]); // the AI bounces its own Warrior: devotion 3
    const aiLife = s.players.ai.life;
    s = resolveTop(s);
    expect(permanentIsCreature(s, "thassa")).toBe(false);
    s = resolveTop(s);
    expect(perm(s, "thassa")).not.toBe(null);
    expect(s.players.ai.life).toBe(aiLife);
    expect(fizzled(s, "Swords to Plowshares")).toBe(true);
  });

  it("the offer reads creature-ness the same way: Thassa below devotion is not offered to Swords at all", () => {
    const s = board({ ai: [P("thassa", "ai", THASSA), P("pw1", "ai", PHANTOM_WARRIOR)], hand: [H("swords", SWORDS)] });
    expect(permanentIsCreature(s, "thassa")).toBe(false);
    expect(offered(s, "user", "swords", "thassa")).toBe(false);
    expect(offered(s, "user", "swords", "pw1")).toBe(true);
  });

  it("control: Thassa at devotion five, unanswered, is exiled by Swords", () => {
    let s = board({ ai: [P("thassa", "ai", THASSA), P("pw1", "ai", PHANTOM_WARRIOR), P("pw2", "ai", PHANTOM_WARRIOR)], hand: [H("swords", SWORDS)] });
    s = resolveTop(cast(s, "user", "swords", ["thassa"]));
    expect(perm(s, "thassa")).toBe(null);
  });

  it("a creature that untapped is no 'target tapped creature': Assassinate (an untagged target) fizzles", () => {
    let s = board({ user: [P("seeker", "user", SEEKER_OF_SKYBREAK)], ai: [P("bears", "ai", GRIZZLY_BEARS, { tapped: true })], hand: [H("assassinate", ASSASSINATE)] });
    s = cast(s, "user", "assassinate", ["bears"]);
    s = activate(s, "user", "seeker", ["bears"]); // untap it in response
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")?.tapped).toBe(false);
    expect(fizzled(s, "Assassinate")).toBe(true);
  });

  it("control: Assassinate destroys the tapped Bears", () => {
    let s = board({ ai: [P("bears", "ai", GRIZZLY_BEARS, { tapped: true })], hand: [H("assassinate", ASSASSINATE)] });
    s = resolveTop(cast(s, "user", "assassinate", ["bears"]));
    expect(perm(s, "bears")).toBe(null);
  });
});

// ── more than one target ───────────────────────────────────────────────────────────────────────────────────────────────────
describe("more than one target: an illegal target is not affected, the legal ones still are (CR 608.2b)", () => {
  it("Kolaghan's Command (return + 2 damage): the creature gains hexproof — the graveyard card still returns, the creature takes no damage", () => {
    let s = board({
      user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("blossom", BLOSSOMING_DEFENSE)],
      aiHand: [H("kcommand", KOLAGHANS_COMMAND)], aiGy: [H("gyGiant", HILL_GIANT)],
    });
    s = cast(s, "ai", "kcommand", ["gyGiant", "bears"], (a) => JSON.stringify(a.chosenMode) === "[0,3]");
    s = cast(s, "user", "blossom", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(inZone(s, "ai", "hand", "gyGiant")).toBe(true);
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(fizzled(s, "Kolaghan's Command")).toBe(false);
    expect(s.log.some((e) => e.kind === "targets-illegal" && e.source === "Kolaghan's Command" && JSON.stringify(e.targetIds) === '["bears"]')).toBe(true);
  });

  it("Ram Through: its 'creature you don't control' gains hexproof — the spell still resolves (its own creature is legal) and deals no damage", () => {
    let s = board({
      user: [P("giant", "user", HILL_GIANT)], hand: [H("ram", RAM_THROUGH)],
      ai: [P("bears", "ai", GRIZZLY_BEARS)], aiHand: [H("blossom", BLOSSOMING_DEFENSE)],
    });
    s = cast(s, "user", "ram", ["giant", "bears"]);
    s = cast(s, "ai", "blossom", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(fizzled(s, "Ram Through")).toBe(false);
    expect(inZone(s, "user", "graveyard", "ram")).toBe(true);
  });

  it("control: Ram Through's two legal targets — the Giant deals 3 to the Bears", () => {
    let s = board({ user: [P("giant", "user", HILL_GIANT)], hand: [H("ram", RAM_THROUGH)], ai: [P("bears", "ai", GRIZZLY_BEARS)] });
    s = resolveTop(cast(s, "user", "ram", ["giant", "bears"]));
    expect(perm(s, "bears")).toBe(null);
  });
});

// ── abilities re-check too ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("activated and triggered abilities re-check their targets, against their source's colours", () => {
  it("Prodigal Sorcerer's ability fizzles on a creature that gained protection from blue (Shelter) in response", () => {
    let s = board({ active: "ai", ai: [P("sorc", "ai", PRODIGAL_SORCERER)], user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("shelter", SHELTER)] });
    s = activate(s, "ai", "sorc", ["bears"]);
    s = cast(s, "user", "shelter", ["bears"]);
    s = resolveTop(s);
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["U"]);
    s = resolveTop(s);
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(fizzled(s, "Prodigal Sorcerer")).toBe(true);
  });

  it("control: unanswered, Prodigal Sorcerer deals 1 damage to the Bears", () => {
    let s = board({ active: "ai", ai: [P("sorc", "ai", PRODIGAL_SORCERER)], user: [P("bears", "user", GRIZZLY_BEARS)] });
    s = resolveTop(activate(s, "ai", "sorc", ["bears"]));
    expect(perm(s, "bears")?.damageMarked).toBe(1);
  });

  it("Ravenous Chupacabra's trigger (its target chosen with no colour read) fizzles on a creature that gained protection from black", () => {
    let s = board({ active: "ai", aiHand: [H("chupa", RAVENOUS_CHUPACABRA)], user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("shelter", SHELTER)] });
    s = cast(s, "ai", "chupa", []);
    s = resolveTop(s);
    expect(s.stack.map((o) => [o.kind, (o.targets || []).map((t) => t.id)])).toEqual([["triggered-ability", ["bears"]]]);
    s = cast(s, "user", "shelter", ["bears"]);
    s = resolveTop(s);
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["B"]);
    s = resolveTop(s);
    expect(perm(s, "bears")).not.toBe(null);
    expect(fizzled(s, "Ravenous Chupacabra")).toBe(true);
  });
});

// ── never fizzle what the predicate can't judge (each guard here would otherwise fizzle a LEGAL spell or ability) ──────────
describe("FP guards: a target stays legal unless a rule definitely refuses it now", () => {
  it("hexproof from blue and black (Veil of Summer) does not refuse a COLOURLESS source: Rod of Ruin still hits the creature", () => {
    let s = board({ active: "ai", ai: [P("rod", "ai", ROD_OF_RUIN)], user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("veil", VEIL_OF_SUMMER)] });
    s = activate(s, "ai", "rod", ["bears"]);
    s = cast(s, "user", "veil", []);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")?.damageMarked).toBe(1);
    expect(fizzled(s, "Rod of Ruin")).toBe(false);
  });

  it("… nor the player Veil of Summer shields: Rod of Ruin still hits its controller", () => {
    let s = board({ active: "ai", ai: [P("rod", "ai", ROD_OF_RUIN)], hand: [H("veil", VEIL_OF_SUMMER)] });
    s = activate(s, "ai", "rod", ["user"]);
    s = cast(s, "user", "veil", []);
    const life = s.players.user.life;
    s = resolveTop(resolveTop(s));
    expect(s.players.user.life).toBe(life - 1);
  });

  it("… while a BLUE source is refused, at the creature and at the player: Prodigal Sorcerer fizzles both times", () => {
    let s = board({ active: "ai", ai: [P("sorc", "ai", PRODIGAL_SORCERER)], user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("veil", VEIL_OF_SUMMER)] });
    s = activate(s, "ai", "sorc", ["bears"]);
    s = cast(s, "user", "veil", []);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(fizzled(s, "Prodigal Sorcerer")).toBe(true);
    let p = board({ active: "ai", ai: [P("sorc", "ai", PRODIGAL_SORCERER)], hand: [H("veil", VEIL_OF_SUMMER)] });
    p = activate(p, "ai", "sorc", ["user"]);
    p = cast(p, "user", "veil", []);
    const life = p.players.user.life;
    p = resolveTop(resolveTop(p));
    expect(p.players.user.life).toBe(life);
    expect(fizzled(p, "Prodigal Sorcerer")).toBe(true);
  });

  it("a spell that became uncounterable is still a legal target: Dismiss resolves — counters nothing, and its caster draws", () => {
    let s = board({ user: [P("shusher", "user", VEXING_SHUSHER)], hand: [H("divination", DIVINATION)], aiHand: [H("dismiss", DISMISS)] });
    s = cast(s, "user", "divination", []);
    const divinationId = s.stack[0].id;
    s = cast(s, "ai", "dismiss", [divinationId]);
    s = activate(s, "user", "shusher", [divinationId]); // "{R/G}: Target spell can't be countered."
    const aiHand = s.players.ai.hand.length;
    s = resolveTop(s); // the Shusher's grant
    s = resolveTop(s); // Dismiss
    expect(fizzled(s, "Dismiss")).toBe(false);
    expect(s.players.ai.hand.length).toBe(aiHand + 1);
    expect(s.stack.map((o) => o.id)).toEqual([divinationId]);
    const userHand = s.players.user.hand.length;
    s = resolveTop(s);
    expect(s.players.user.hand.length).toBe(userHand + 2);
  });

  // MENTOR — "target attacking creature with lesser power": the comparison reads the source's power.
  const mentorAttack = (extra = {}) => {
    let s = board({
      user: [P("stalwart", "user", SUNHOME_STALWART), P("hawk", "user", SUNTAIL_HAWK)], hand: [H("blossom", BLOSSOMING_DEFENSE)], aiHand: [H("swords", SWORDS)], ...extra,
    });
    s = { ...s, phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "stalwart", attackingPlayer: "user", defender: "ai" }, { permanentId: "hawk", attackingPlayer: "user", defender: "ai" }] } };
    s = flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets });
    expect(s.stack.map((o) => [o.kind, (o.targets || []).map((t) => t.id)])).toEqual([["triggered-ability", ["hawk"]]]);
    return s;
  };

  it("mentor whose source left the battlefield in response: its last known power is not kept, so the target stays legal — the Hawk gets the counter", () => {
    let s = cast(mentorAttack(), "ai", "swords", ["stalwart"]);
    s = resolveTop(s);
    expect(perm(s, "stalwart")).toBe(null);
    s = resolveTop(s);
    expect(counter(s, "hawk")).toBe(1);
    expect(fizzled(s, "Sunhome Stalwart")).toBe(false);
  });

  it("… while a target that is no longer of lesser power (pumped to 3 in response) is illegal: the mentor trigger fizzles", () => {
    let s = cast(mentorAttack(), "user", "blossom", ["hawk"]);
    s = resolveTop(s);
    expect(permanentPower(s, "hawk")).toBe(3);
    s = resolveTop(s);
    expect(counter(s, "hawk")).toBe(0);
    expect(fizzled(s, "Sunhome Stalwart")).toBe(true);
  });

  it("an ability whose source left (its colours unknown) is not refused by a 'nongreen' shield: Seeker of Skybreak still untaps Gaea's Revenge", () => {
    let s = board({ user: [P("seeker", "user", SEEKER_OF_SKYBREAK), P("gaea", "user", GAEAS_REVENGE, { tapped: true })], aiHand: [H("swords", SWORDS)] });
    s = activate(s, "user", "seeker", ["gaea"]); // offered: the Seeker is green
    s = cast(s, "ai", "swords", ["seeker"]);
    s = resolveTop(s);
    expect(perm(s, "seeker")).toBe(null);
    s = resolveTop(s);
    expect(perm(s, "gaea")?.tapped).toBe(false);
    expect(fizzled(s, "Seeker of Skybreak")).toBe(false);
  });

  it("the cast-time X rides into the re-check: Here Comes a New Hero! (X=2) still copies the mana-value-2 creature", () => {
    let s = board({ ai: [P("bears", "ai", GRIZZLY_BEARS)], hand: [H("hero", HERE_COMES_A_NEW_HERO)] });
    s = cast(s, "user", "hero", ["user", "bears"], (a) => a.xValue === 2);
    const hand = s.players.user.hand.length;
    s = resolveTop(s);
    expect(s.players.user.hand.length).toBe(hand + 2);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Grizzly Bears")).toHaveLength(1);
  });

  it("each slot is judged by its own spec: Dwell on the Past's graveyard cards (the player-and-cards slot) are still legal", () => {
    let s = board({ hand: [H("dwell", DWELL_ON_THE_PAST)], aiGy: [H("g1", HILL_GIANT), H("g2", GRIZZLY_BEARS)] });
    s = cast(s, "user", "dwell", ["ai", "g1", "g2"]);
    s = resolveTop(s);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual([]);
    expect(["g1", "g2"].every((id) => inZone(s, "ai", "library", id))).toBe(true);
  });
});

// ── Aura spells (CR 608.3b) and the attach abilities re-check their target the same way ─────────────────────────────────────
describe("Aura spells (CR 608.3b) and Equip / Aura-attach abilities re-check their target's targetability", () => {
  it("Control Magic on a creature that gained hexproof in response doesn't resolve: no steal, the Aura to its owner's graveyard", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("blossom", BLOSSOMING_DEFENSE)], aiHand: [H("cmagic", CONTROL_MAGIC)], active: "ai" });
    s = cast(s, "ai", "cmagic", ["bears"]);
    s = cast(s, "user", "blossom", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(findPermanent(s, "bears")?.controller).toBe("user");
    expect(inZone(s, "ai", "graveyard", "cmagic")).toBe(true);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Control Magic")).toBe(false);
  });

  it("control: unanswered, Control Magic takes the Bears", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], aiHand: [H("cmagic", CONTROL_MAGIC)], active: "ai" });
    s = resolveTop(cast(s, "ai", "cmagic", ["bears"]));
    expect(findPermanent(s, "bears")?.controller).toBe("ai");
  });

  it("Pacifism (white) on a creature that gained protection from white (Shelter) doesn't resolve", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("shelter", SHELTER)], ai: [P("lions", "ai", SAVANNAH_LIONS)], aiHand: [H("pacifism", PACIFISM)], active: "ai" });
    s = cast(s, "ai", "pacifism", ["bears"]);
    s = cast(s, "user", "shelter", ["bears"]);
    s = resolveTop(s);
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["W"]);
    s = resolveTop(s);
    expect(perm(s, "bears")?.attachments || []).toEqual([]);
    expect(inZone(s, "ai", "graveyard", "pacifism")).toBe(true);
  });

  it("Fraying Sanity (blue) on a player who gained hexproof from blue (Veil of Summer) doesn't resolve", () => {
    let s = board({ hand: [H("veil", VEIL_OF_SUMMER)], aiHand: [H("fraying", FRAYING_SANITY)], active: "ai" });
    s = cast(s, "ai", "fraying", ["user"]);
    s = cast(s, "user", "veil", []);
    s = resolveTop(resolveTop(s));
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Fraying Sanity")).toBe(false);
    expect(inZone(s, "ai", "graveyard", "fraying")).toBe(true);
  });

  it("a BESTOWED Aura spell whose target gained shroud doesn't fizzle: it resolves as a creature (CR 702.103e)", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("rollicker", NYXBORN_ROLLICKER), H("mguile", MAGES_GUILE)] });
    s = cast(s, "user", "rollicker", ["bears"], (a) => a.bestow === true);
    s = cast(s, "user", "mguile", ["bears"]);
    s = resolveTop(resolveTop(s));
    const rollicker = s.players.user.battlefield.find((p) => p.card?.name === "Nyxborn Rollicker");
    expect(rollicker?.attachedTo ?? null).toBe(null);
    expect(permanentIsCreature(s, rollicker.id)).toBe(true);
    expect(permanentPower(s, "bears")).toBe(2); // no +1/+1 — it enchants nothing
    expect(fizzled(s, "Nyxborn Rollicker")).toBe(false);
  });

  it("an Equip ability fizzles on its controller's own creature that gained shroud (Mage's Guile) in response", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS), P("splitter", "user", BONESPLITTER)], hand: [H("mguile", MAGES_GUILE)] });
    s = activate(s, "user", "splitter", ["bears"]);
    s = cast(s, "user", "mguile", ["bears"]);
    s = resolveTop(resolveTop(s));
    expect(perm(s, "splitter")?.attachedTo ?? null).toBe(null);
    expect(permanentPower(s, "bears")).toBe(2);
    expect(fizzled(s, "Bonesplitter")).toBe(true);
  });

  it("control: unanswered, the Equip attaches Bonesplitter (+2/+0)", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS), P("splitter", "user", BONESPLITTER)] });
    s = resolveTop(activate(s, "user", "splitter", ["bears"]));
    expect(perm(s, "splitter")?.attachedTo).toBe("bears");
    expect(permanentPower(s, "bears")).toBe(4);
  });

  // Detainment Spell (the user's, on the AI's Hill Giant) moves to the AI's Grizzly Bears — "{1}{W}: Attach this Aura to target creature."
  const detainBoard = () => {
    const s = board({
      user: [P("detain", "user", DETAINMENT_SPELL, { attachedTo: "giant" })],
      ai: [P("giant", "ai", HILL_GIANT, { attachments: ["detain"] }), P("bears", "ai", GRIZZLY_BEARS)],
      aiHand: [H("shelter", SHELTER), H("veil", VEIL_OF_SUMMER), H("blossom", BLOSSOMING_DEFENSE)],
    });
    return activate(s, "user", "detain", ["bears"]);
  };

  it("Detainment Spell's attach fizzles on a creature that gained protection from white (Shelter) — the Aura stays put", () => {
    let s = cast(detainBoard(), "ai", "shelter", ["bears"]);
    s = resolveTop(s);
    expect([...permanentProtectionColors(s, "bears")]).toEqual(["W"]);
    s = resolveTop(s);
    expect(perm(s, "detain")?.attachedTo).toBe("giant");
    expect(fizzled(s, "Detainment Spell")).toBe(true);
  });

  it("… and on a creature that gained hexproof against it (Blossoming Defense)", () => {
    let s = resolveTop(cast(detainBoard(), "ai", "blossom", ["bears"]));
    s = resolveTop(s);
    expect(perm(s, "detain")?.attachedTo).toBe("giant");
  });

  it("… but hexproof from BLUE and BLACK (Veil of Summer) does not stop a WHITE source: the Aura moves", () => {
    let s = resolveTop(cast(detainBoard(), "ai", "veil", []));
    s = resolveTop(s);
    expect(perm(s, "detain")?.attachedTo).toBe("bears");
  });
});

// ── SYNTHETIC witnesses — hand-built stack objects for guards no real card reaches today ──────────────────────────────────
describe("SYNTHETIC: the re-check's own guards", () => {
  const pushed = (s, obj) => ({ ...s, stack: [...s.stack, obj] });

  it("SYNTHETIC (FP guard): an ability whose context names its source (context.sourceId — no producer sets it today) is judged against that source's colours", () => {
    // The flush enumeration reads `context.sourceId ?? source.permanentId`; the re-check mirrors it.
    let s = board({ active: "ai", ai: [P("sorc", "ai", PRODIGAL_SORCERER)], user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("shelter", SHELTER)] });
    s = resolveTop(cast(s, "user", "shelter", ["bears"])); // protection from blue (the AI's only permanent is blue)
    const program = parseEffectClause("this creature deals 1 damage to any target", "Instant");
    expect(program.atoms).toEqual([{ op: "deal-damage", amount: 1, targetType: "any" }]);
    s = pushed(s, { id: "stk-syn", kind: "triggered-ability", source: { name: "Prodigal Sorcerer" }, controller: "ai",
      targets: [{ type: "creature", id: "bears", controller: "user", atomIndex: 0 }],
      payload: { resolver: "effect-program", params: { program, controller: "ai", context: { sourceId: "sorc" }, targets: [{ type: "creature", id: "bears", controller: "user", atomIndex: 0 }] } } });
    s = resolveTop(s);
    expect(perm(s, "bears")?.damageMarked || 0).toBe(0);
    expect(fizzled(s, "Prodigal Sorcerer")).toBe(true);
  });

  it("SYNTHETIC (FP guard): an untagged target the source's spell effect never offered (Divination targets nothing) can't be judged — the spell resolves", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)] });
    const t = { type: "creature", id: "bears", controller: "user" };
    s = pushed(s, { id: "stk-syn", kind: "spell", source: H("div", DIVINATION), controller: "user", targets: [t],
      payload: { resolver: "effect-program", params: { program: parseEffectProgram(DIVINATION), controller: "user", targets: [t] } } });
    const hand = s.players.user.hand.length;
    s = resolveTop(s);
    expect(s.players.user.hand.length).toBe(hand + 2);
    expect(fizzled(s, "Divination")).toBe(false);
  });

  it("SYNTHETIC (FP guard): a malformed target (no type) is never grounds to fizzle", () => {
    let s = board();
    s = pushed(s, { id: "stk-syn", kind: "spell", source: H("div", DIVINATION), controller: "user", targets: [{ id: "x" }],
      payload: { resolver: "effect-program", params: { program: parseEffectProgram(DIVINATION), controller: "user", targets: [{ id: "x" }] } } });
    const hand = s.players.user.hand.length;
    s = resolveTop(s);
    expect(s.players.user.hand.length).toBe(hand + 2);
  });

  it("SYNTHETIC: an entry that is not the resolver's (a direct call / a settler's sub-program) keeps the zone-only gate and the FULL target list", () => {
    // Two targets on one destroy; the second's controller-projection reads every target of the atom. A gone target is not
    // stripped here, so its recorded controller still gains — the pre-existing behaviour every non-resolver entry keeps.
    const s = board({ user: [P("bears", "user", GRIZZLY_BEARS)] });
    const targets = [{ type: "creature", id: "ghost", controller: "ai", atomIndex: 0 }, { type: "creature", id: "bears", controller: "user", atomIndex: 0 }];
    const program = { atoms: [{ op: "destroy", targetType: "creature" }, { op: "gain-life", amount: 3, who: "target", bindPreviousTargets: true, playerFrom: "controller" }] };
    const lifeAi = s.players.ai.life;
    const out = runEffectProgram(s, { source: { name: "Test Removal" }, payload: { params: { program, controller: "user", targets } } });
    expect(out.players.ai.life).toBe(lifeAi + 3);
    expect(out.log.some((e) => e.kind === "targets-illegal")).toBe(false);
  });

  it("SYNTHETIC (FP guard): a player Aura is judged against its OWN colours — a red curse (no native red curse exists) still enchants a player with hexproof from blue and black", () => {
    let s = board({ hand: [H("veil", VEIL_OF_SUMMER)], active: "ai" });
    s = resolveTop(cast(s, "user", "veil", [])); // the user: hexproof from blue and from black, this turn
    s = pushed(s, { id: "stk-syn", kind: "spell", source: H("curse", CURSE_OF_OPULENCE), controller: "ai", targets: [{ type: "player", id: "user" }],
      payload: { resolver: RESOLVER_KEYS.AURA_ETB, params: { card: H("curse", CURSE_OF_OPULENCE), controller: "ai", targetId: "user", enchantsPlayer: true } } });
    s = resolveTop(s);
    expect(s.players.ai.battlefield.find((p) => p.card?.name === "Curse of Opulence")?.enchantedPlayerId).toBe("user");
  });

  it("SYNTHETIC: … and judges no legality there — a target that is present but shrouded is still affected by a direct call", () => {
    let s = board({ user: [P("bears", "user", GRIZZLY_BEARS)], hand: [H("mguile", MAGES_GUILE)] });
    s = resolveTop(cast(s, "user", "mguile", ["bears"])); // shroud
    const targets = [{ type: "creature", id: "bears", controller: "user", atomIndex: 0 }];
    const out = runEffectProgram(s, { source: { name: "Test Removal" }, payload: { params: { program: { atoms: [{ op: "destroy", targetType: "creature" }] }, controller: "ai", targets } } });
    expect(perm(out, "bears")).toBe(null);
    expect(fizzled(out, "Test Removal")).toBe(false);
  });
});
