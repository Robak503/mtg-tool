/**
 * auraReentry.test.js — an Aura put onto the battlefield WITHOUT being cast (CR 303.4f, 303.4g), and an Aura attached to nothing
 * (CR 704.5m). Found 2026-09-30 building shelf slice D21 (Brago, King Eternal): a blinked Aura came back attached to nothing and
 * stayed on the battlefield doing nothing — the shared non-cast entry (effects/atoms/zones.enterCardFromZone) had no Aura handling
 * and the state-based sweep read only attached Auras.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — entering by any means other than resolving as an Aura spell, with no object named by the effect, "that player
 *     chooses what it will enchant as the Aura enters the battlefield. The player must choose a legal object or player according
 *     to the Aura's enchant ability and any other applicable effects."
 *   · CR 303.4g — "If an Aura is entering the battlefield and there is no legal object or player for it to enchant, the Aura
 *     remains in its current zone".
 *   · CR 704.5m — "If an Aura is attached to an illegal object or player, or is not attached to an object or player, that Aura is
 *     put into its owner's graveyard."
 *   · CR 702.16c — protection: "can't be enchanted by Auras that have the stated quality" (Black Knight's own reminder text).
 * The bundled Brago, King Eternal ruling (scryfall.rulings.local.json, 2020-11-10): the Aura "doesn't target anything (so it could
 * be attached to an opponent's permanent with hexproof, for example), but the Aura's enchant ability restricts what it can be
 * attached to. The Aura can't enter the battlefield enchanting a permanent that enters the battlefield at the same time. If the
 * Aura can't legally be attached to anything, it remains exiled."
 *
 * Every board is built so the rule under test decides its outcome; the engine paths are the real ones (the blink resolver, Brago's
 * combat-damage trigger, Displacer Kitten's cast trigger, Sun Titan's enters trigger, the dig settler, the state-based sweep, the
 * AI's cast pick). Real oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { checkAllStateBasedActions } from "./sba.js";
import { checkCastTriggers, checkCombatDamageTriggers, checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction } from "./opponentAI.js";
import { setPendingImpulseDigChoice } from "./pendingChoice.js";
import { resolveImpulseDigChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { auraCastIntent } from "./auraEntry.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"colors":["W"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"colors":["G"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."};
const ARREST = {"name":"Arrest","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"colors":["W"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated."};
const LEADEN_FISTS = {"name":"Leaden Fists","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"colors":["U"],"keywords":["Enchant","Flash"],"oracle":"Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature gets +3/+3 and doesn't untap during its controller's untap step."}; // bundled oracle-index, 2026-10-17
const CLAUSTROPHOBIA = {"name":"Claustrophobia","type":"Enchantment — Aura","mana":"{1}{U}{U}","cmc":3,"colors":["U"],"keywords":["Enchant"],"oracle":"Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step."};
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"colors":["R"],"keywords":["Enchant"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"};
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"colors":["G"],"keywords":["Enchant"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."};
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"colors":["B"],"keywords":["First strike","Protection"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)","power":"2","toughness":"2"};
const SCOUT = {"name":"Gladecover Scout","type":"Creature — Elf Scout","mana":"{G}","cmc":1,"colors":["G"],"keywords":["Hexproof"],"oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","power":"1","toughness":"1"};
const PROGENITUS = {"name":"Progenitus","type":"Legendary Creature — Hydra Avatar","mana":"{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}","cmc":10,"colors":["B","G","R","U","W"],"keywords":["Protection"],"oracle":"Protection from everything\nIf Progenitus would be put into a graveyard from anywhere, reveal Progenitus and shuffle it into its owner's library instead.","power":"10","toughness":"10"};
const ANTI_MAGIC = {"name":"Anti-Magic Aura","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"colors":["U"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature can't be the target of spells and can't be enchanted by other Auras."};
const SUN_TITAN = {"name":"Sun Titan","type":"Creature — Giant","mana":"{4}{W}{W}","cmc":6,"colors":["W"],"keywords":["Vigilance"],"oracle":"Vigilance\nWhenever this creature enters or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield.","power":"6","toughness":"6"};
const UNDYING_RAGE = {"name":"Undying Rage","type":"Enchantment — Aura","mana":"{2}{R}","cmc":3,"colors":["R"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and can't block.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."};
const BLIGHT = {"name":"Crippling Blight","type":"Enchantment — Aura","mana":"{B}","cmc":1,"colors":["B"],"keywords":["Enchant"],"oracle":"Enchant creature\nEnchanted creature gets -1/-1 and can't block."};
const BEAR = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"colors":["G"],"keywords":[],"oracle":"","power":"2","toughness":"2"};
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"colors":["G"],"keywords":[],"oracle":"","power":"6","toughness":"4"};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"colors":["R"],"keywords":[],"oracle":"","power":"3","toughness":"3"};
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"colors":["G"],"keywords":[],"oracle":"When this creature enters, draw a card.","power":"1","toughness":"1"};
const BRAGO = {"name":"Brago, King Eternal","type":"Legendary Creature — Spirit Noble","mana":"{2}{W}{U}","cmc":4,"colors":["U","W"],"keywords":["Flying"],"oracle":"Flying\nWhenever Brago deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner's control.","power":"2","toughness":"4"};
const KITTEN = {"name":"Displacer Kitten","type":"Creature — Cat Beast","mana":"{3}{U}","cmc":4,"colors":["U"],"keywords":["Avoidance"],"oracle":"Avoidance — Whenever you cast a noncreature spell, exile up to one target nonland permanent you control, then return that card to the battlefield under its owner's control.","power":"2","toughness":"2"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"colors":[],"keywords":[],"oracle":"({T}: Add {G}.)"};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"colors":["U"],"keywords":["Scry"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const CARTOUCHE = {"name":"Cartouche of Knowledge","type":"Enchantment — Aura Cartouche","mana":"{1}{U}","cmc":2,"colors":["U"],"keywords":["Enchant"],"oracle":"Enchant creature you control\nWhen this Aura enters, draw a card.\nEnchanted creature gets +1/+1 and has flying."};
const ANIMATE_DEAD = {"name":"Animate Dead","type":"Enchantment — Aura","mana":"{1}{B}","cmc":2,"colors":["B"],"keywords":["Enchant"],"oracle":"Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0."};

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** An Aura (or anything attached) and its host, linked both ways, as the engine keeps them. */
const on = (aura, host) => [{ ...aura, attachedTo: host.id }, { ...host, attachments: [...(host.attachments || []), aura.id] }];
function board({ user = [], ai = [], userGy = [], userLibrary = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = userLibrary || [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, graveyard: userGy, library: lib }, ai: { ...g.players.ai, battlefield: ai } } };
}
const blink = (s, ids, returnTo = "owner") => ATOM_RESOLVERS.blink(s, { op: "blink", returnTo }, { controller: "user", targets: ids.map((id) => ({ id })) });
const resolveAll = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
const named = (s, name) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === name);
/** The name of what the (single) permanent called `name` is attached to — null when it is attached to nothing or gone. */
const hostOf = (s, name) => { const p = named(s, name)[0]; return p?.attachedTo ? findPermanent(s, p.attachedTo)?.permanent.card?.name ?? null : null; };
const zoneNames = (s, pid, zone) => (s.players[pid][zone] || []).map((c) => c.name);
const events = (s, kind) => (s.log || []).filter((e) => e.kind === kind);
function chooser() {
  const seen = [];
  return { seen, chooseTargets: (cands, info) => { seen.push(...cands); return chooseTriggerTargets(cands, info); } };
}
const bragoHits = (s, ch = chooser()) => flushTriggers(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "brago", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: ch.chooseTargets });
const kittenSees = (s, ch = chooser()) => flushTriggers(checkCastTriggers(s, { spellCard: { ...OPT, id: "c-opt" }, casterId: "user" }), { chooseTargets: ch.chooseTargets });
const chosen = (s) => (s.stack.at(-1)?.targets || []).map((t) => findPermanent(s, t.id)?.permanent.card?.name).sort();

describe("CR 303.4f — an Aura that returns without being cast chooses what it enchants", () => {
  it("⭐ the report's board: Pacifism blinked off the Bear comes back ON the Bear, and stays there through the state-based actions", () => {
    const [pac, bear] = on(perm("aura", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const after = blink(board({ user: [pac], ai: [bear] }), ["aura"]);
    const swept = checkAllStateBasedActions(after);
    const back = named(swept, "Pacifism")[0];
    const row = { host: hostOf(swept, "Pacifism"), newObject: back?.id !== "aura", bearLinks: findPermanent(swept, "bear").permanent.attachments, graveyard: zoneNames(swept, "user", "graveyard"),
      logged: events(after, "enters-attached").map((e) => [e.cardName, e.hostName, e.chosenBy]) };
    console.log(`  WITNESS reentry ${JSON.stringify(row)}`);
    expect(row).toEqual({ host: "Grizzly Bears", newObject: true, bearLinks: [back.id], graveyard: [], logged: [["Pacifism", "Grizzly Bears", "controller"]] });
  });

  it("⭐ the re-aim: beside the Bear the opponent has a Craw Wurm — Pacifism comes back on the Wurm, which can no longer attack; the Bear can", () => {
    const [pac, bear] = on(perm("aura", PACIFISM, "user"), perm("bear", BEAR, "ai"));
    const after = blink(board({ user: [pac], ai: [bear, perm("wurm", WURM, "ai")] }), ["aura"]);
    expect({ host: hostOf(after, "Pacifism"), wurmLocked: permanentHasKeyword(after, "wurm", "cantAttack"), bearLocked: permanentHasKeyword(after, "bear", "cantAttack") })
      .toEqual({ host: "Craw Wurm", wurmLocked: true, bearLocked: false });
  });

  it("a buff goes to its controller's best creature: Rancor blinked off your Bear lands on your Craw Wurm (8 power), never the opponent's Hill Giant", () => {
    const [rancor, bear] = on(perm("rancor", RANCOR, "user"), perm("bear", BEAR, "user"));
    const after = blink(board({ user: [rancor, bear, perm("wurm", WURM, "user")], ai: [perm("giant", GIANT, "ai")] }), ["rancor"]);
    expect({ host: hostOf(after, "Rancor"), wurmPower: permanentPower(after, "wurm"), bearPower: permanentPower(after, "bear") }).toEqual({ host: "Craw Wurm", wurmPower: 8, bearPower: 2 });
  });

  // An Aura returned from your graveyard by the reanimate resolver (Sun Titan's, below).
  const reanimate = (card, { user = [], ai = [] } = {}) => ATOM_RESOLVERS.reanimate(board({ user, ai, userGy: [{ ...card, id: "gy-aura" }] }), { op: "reanimate", targetType: "graveyardCard" },
    { controller: "user", targets: [{ type: "graveyardCard", id: "gy-aura" }] });
  const reanimatePacifism = (ai) => reanimate(PACIFISM, { ai });

  it("nothing is targeted (the Brago ruling): the opponent's hexproof Gladecover Scout is a legal host", () => {
    expect(hostOf(reanimatePacifism([perm("scout", SCOUT, "ai")]), "Pacifism")).toBe("Gladecover Scout");
  });

  it("protection is not (CR 702.16c): white Pacifism never lands on Black Knight, even the bigger one — the Bear takes it; with only the Knight (and a Forest), it stays in the graveyard (CR 303.4g)", () => {
    const withBear = reanimatePacifism([perm("bear", BEAR, "ai"), perm("knight", BLACK_KNIGHT, "ai", { counters: { "+1/+1": 3 } })]);
    const alone = reanimatePacifism([perm("knight", BLACK_KNIGHT, "ai"), perm("forest", FOREST, "ai")]);
    expect({ withBear: hostOf(withBear, "Pacifism"), aloneOnBattlefield: named(alone, "Pacifism").length, aloneGraveyard: zoneNames(alone, "user", "graveyard"),
      why: events(alone, "aura-stays").map((e) => e.reason) })
      .toEqual({ withBear: "Grizzly Bears", aloneOnBattlefield: 0, aloneGraveyard: ["Pacifism"], why: ["nothing it can enchant (CR 303.4g)"] });
  });

  it("a protection the engine doesn't read keeps the permanent out: Progenitus (protection from everything) alone — Pacifism stays in the graveyard", () => {
    const after = reanimatePacifism([perm("prog", PROGENITUS, "ai")]);
    expect({ onBattlefield: named(after, "Pacifism").length, graveyard: zoneNames(after, "user", "graveyard") }).toEqual({ onBattlefield: 0, graveyard: ["Pacifism"] });
  });

  it("\"can't be enchanted by other Auras\" (Anti-Magic Aura on the Wurm): the Bear takes Pacifism", () => {
    const [anti, wurm] = on(perm("anti", ANTI_MAGIC, "ai"), perm("wurm", WURM, "ai"));
    expect(hostOf(reanimatePacifism([perm("bear", BEAR, "ai"), wurm, anti]), "Pacifism")).toBe("Grizzly Bears");
  });

  it("the Enchant line's own restriction: Cartouche of Knowledge (\"Enchant creature you control\") takes your Bear; with no creature of yours it stays — never the opponent's Wurm", () => {
    const yours = reanimate(CARTOUCHE, { user: [perm("bear", BEAR, "user")], ai: [perm("wurm", WURM, "ai")] });
    const none = reanimate(CARTOUCHE, { ai: [perm("wurm", WURM, "ai")] });
    expect({ yours: hostOf(yours, "Cartouche of Knowledge"), none: named(none, "Cartouche of Knowledge").length, graveyard: zoneNames(none, "user", "graveyard") })
      .toEqual({ yours: "Grizzly Bears", none: 0, graveyard: ["Cartouche of Knowledge"] });
  });

  it("an Enchant line the return can't list stays where it is: Curse of Opulence (enchant player) stays in exile, logged — never attached to a guess", () => {
    const after = blink(board({ user: [perm("curse", CURSE, "user", { enchantedPlayerId: "ai" })] }), ["curse"]);
    expect({ onBattlefield: named(after, "Curse of Opulence").length, exile: zoneNames(after, "user", "exile"), why: events(after, "aura-stays").map((e) => e.reason) })
      .toEqual({ onBattlefield: 0, exile: ["Curse of Opulence"], why: ["its enchant ability is not modeled"] });
  });

  it("a mana Aura stacks: Wild Growth comes back on the Forest already carrying the other Wild Growth", () => {
    const [wg1, f1] = on(perm("wg1", WILD_GROWTH, "user"), perm("f1", FOREST, "user"));
    const [wg2, f2] = on(perm("wg2", WILD_GROWTH, "user"), perm("f2", FOREST, "user"));
    const after = blink(board({ user: [f1, wg1, f2, wg2] }), ["wg1"]);
    expect(findPermanent(after, "f2").permanent.attachments).toHaveLength(2);
  });

  it("its own enters ability finds its creature: Claustrophobia comes back on the opponent's side (a curse — the untap lock, read since 2026-10-17) and taps the Wurm", () => {
    const [claus, wurm] = on(perm("claus", CLAUSTROPHOBIA, "user"), perm("wurm", WURM, "ai"));
    const after = resolveAll(flushTriggers(blink(board({ user: [claus, perm("bear", BEAR, "user")], ai: [wurm] }), ["claus"]), { chooseTargets: chooseTriggerTargets }));
    expect({ host: hostOf(after, "Claustrophobia"), wurmTapped: !!findPermanent(after, "wurm").permanent.tapped, bearTapped: !!findPermanent(after, "bear").permanent.tapped })
      .toEqual({ host: "Craw Wurm", wurmTapped: true, bearTapped: false });
  });
});

describe("one event — \"The Aura can't enter the battlefield enchanting a permanent that enters the battlefield at the same time\"", () => {
  it("⭐ Rancor and the Craw Wurm it enchants, blinked together: the Wurm comes back, Rancor goes on your Hill Giant — never the bigger Wurm returning with it, in either target order, never to the graveyard", () => {
    const run = (order) => {
      const [rancor, wurm] = on(perm("rancor", RANCOR, "user"), perm("wurm", WURM, "user"));
      const after = blink(board({ user: [rancor, wurm, perm("giant", GIANT, "user")] }), order);
      return { host: hostOf(after, "Rancor"), wurmBack: named(after, "Craw Wurm").length, wurmLinks: named(after, "Craw Wurm")[0]?.attachments || [],
        graveyard: zoneNames(after, "user", "graveyard"), hand: zoneNames(after, "user", "hand") };
    };
    const want = { host: "Hill Giant", wurmBack: 1, wurmLinks: [], graveyard: [], hand: [] };
    expect({ auraFirst: run(["rancor", "wurm"]), wurmFirst: run(["wurm", "rancor"]) }).toEqual({ auraFirst: want, wurmFirst: want });
  });

  it("with nothing else to enchant, Rancor stays exiled (\"it remains exiled\") and the Bear returns", () => {
    const [rancor, bear] = on(perm("rancor", RANCOR, "user"), perm("bear", BEAR, "user"));
    const after = blink(board({ user: [rancor, bear] }), ["bear", "rancor"]);
    expect({ bear: named(after, "Grizzly Bears").length, rancor: named(after, "Rancor").length, exile: zoneNames(after, "user", "exile") })
      .toEqual({ bear: 1, rancor: 0, exile: ["Rancor"] });
  });
});

describe("every non-cast entry runs through the one helper", () => {
  // Sun Titan's enters trigger ("you MAY return …") pauses on the optional-effect choice for the user's seat; the user says yes.
  const titanEnters = (s) => {
    const paused = resolveAll(flushTriggers(checkEnterTriggers(s, findPermanent(s, "titan").permanent), { chooseTargets: chooseTriggerTargets }));
    expect(paused.pendingChoice?.kind).toBe("optional-effect");
    return resolveAll(resolveOptionalChoice(paused, true));
  };

  it("⭐ Sun Titan returns Pacifism from your graveyard onto the opponent's biggest creature", () => {
    const s = board({ user: [perm("titan", SUN_TITAN, "user")], ai: [perm("bear", BEAR, "ai"), perm("wurm", WURM, "ai")], userGy: [{ ...PACIFISM, id: "gy-pac" }] });
    const after = titanEnters(s);
    expect({ host: hostOf(after, "Pacifism"), graveyard: zoneNames(after, "user", "graveyard") }).toEqual({ host: "Craw Wurm", graveyard: [] });
  });

  it("…and with no opposing creature, onto your own weakest — the choice is not optional (CR 303.4f)", () => {
    const s = board({ user: [perm("titan", SUN_TITAN, "user"), perm("bear", BEAR, "user")], userGy: [{ ...PACIFISM, id: "gy-pac" }] });
    expect(hostOf(titanEnters(s), "Pacifism")).toBe("Grizzly Bears");
  });

  it("a dig that picks an Aura with nothing to enchant: it stays in the library and is bottomed with the rest; the unlooked cards come up", () => {
    const library = [{ ...PACIFISM, id: "d-pac" }, { ...BEAR, id: "d-x1" }, { ...BEAR, id: "d-x2" }, { ...GIANT, id: "d-y1" }, { ...GIANT, id: "d-y2" }];
    const s = setPendingImpulseDigChoice(board({ userLibrary: library }), { controller: "user", candidates: [{ id: "d-pac", name: "Pacifism", type: PACIFISM.type }],
      restTo: "bottom", keep: 1, lookedAt: 3, chosenTo: "battlefield", restOrder: "random" });
    const after = resolveImpulseDigChoice(s, "d-pac");
    const lib = after.players.user.library.map((c) => c.id);
    expect({ battlefield: named(after, "Pacifism").length, top: lib.slice(0, 2), bottom: lib.slice(2).sort() })
      .toEqual({ battlefield: 0, top: ["d-y1", "d-y2"], bottom: ["d-pac", "d-x1", "d-x2"] });
  });
});

describe("CR 704.5m — an Aura attached to nothing is put into its owner's graveyard", () => {
  it("⭐ the report's leftover: an unattached Pacifism goes to the graveyard at the next check (it stayed before)", () => {
    const after = checkAllStateBasedActions(board({ user: [perm("aura", PACIFISM, "user")], ai: [perm("bear", BEAR, "ai")] }));
    expect({ battlefield: named(after, "Pacifism").length, graveyard: zoneNames(after, "user", "graveyard"), why: events(after, "aura-falls-off").map((e) => e.reason) })
      .toEqual({ battlefield: 0, graveyard: ["Pacifism"], why: ["attached to nothing"] });
  });

  it("an Aura attached to a player, to a card in a graveyard, or a bestowed creature, is attached to something — each stays", () => {
    const s = board({ user: [perm("curse", CURSE, "user", { enchantedPlayerId: "ai" }), perm("animate", ANIMATE_DEAD, "user", { enchantedGraveyardCard: { cardId: "gy-wurm", ownerId: "user" } }),
      perm("bestowed", { ...PACIFISM, name: "Bestowed Stand-in" }, "user", { bestowed: true })], userGy: [{ ...WURM, id: "gy-wurm" }] });
    const after = checkAllStateBasedActions(s);
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["curse", "animate", "bestowed"]);
  });
});

describe("the AI", () => {
  it("⭐ reads a restriction grant as a curse: Pacifism, Arrest, Crippling Blight → enemy; Undying Rage's +2/+2 decides its side, as Rancor's does → own", () => {
    expect([PACIFISM, ARREST, BLIGHT, UNDYING_RAGE, RANCOR].map(auraCastIntent)).toEqual(["enemy", "enemy", "enemy", "own", "own"]);
  });

  it("⭐ casts Pacifism on the opponent's Craw Wurm — it used to pacify its own", () => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...b, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: { ...b.players, ai: { ...b.players.ai, hand: [{ ...PACIFISM, id: "pac" }], battlefield: [perm("aiWurm", WURM, "ai")], manaPool: { ...b.players.ai.manaPool, W: 2 } },
        user: { ...b.players.user, battlefield: [perm("uBear", BEAR, "user"), perm("uWurm", WURM, "user")] } } };
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
    expect({ kind: pick?.kind, card: pick?.cardId, target: pick?.targets?.[0]?.id }).toEqual({ kind: "cast-spell", card: "pac", target: "uWurm" });
  });

  it("⭐ Brago re-aims your Pacifism from the Bear onto the Wurm; already on the Wurm, it still goes — nothing to lose", () => {
    const run = (hostId) => {
      const [pac, host] = on(perm("aura", PACIFISM, "user"), perm(hostId, hostId === "bear" ? BEAR : WURM, "ai"));
      const others = hostId === "bear" ? [perm("wurm", WURM, "ai")] : [perm("bear", BEAR, "ai")];
      const s1 = bragoHits(board({ user: [perm("brago", BRAGO, "user", { tapped: true }), pac], ai: [host, ...others] }));
      return { chosen: chosen(s1), host: hostOf(resolveAll(s1), "Pacifism") };
    };
    expect({ fromBear: run("bear"), fromWurm: run("wurm") }).toEqual({
      fromBear: { chosen: ["Brago, King Eternal", "Pacifism"], host: "Craw Wurm" },
      fromWurm: { chosen: ["Brago, King Eternal", "Pacifism"], host: "Craw Wurm" },
    });
  });

  it("Brago: Rancor on a Visionary that goes moves to the Giant that stays (+1/+1 counter); with nowhere to go it stays home and is never exiled for nothing", () => {
    const run = (withGiant) => {
      const [rancor, vis] = on(perm("rancor", RANCOR, "user"), perm("vis", VISIONARY, "user"));
      const giant = withGiant ? [perm("giant", GIANT, "user", { counters: { "+1/+1": 1 } })] : [];
      const s1 = bragoHits(board({ user: [perm("brago", BRAGO, "user", { tapped: true }), rancor, vis, ...giant] }));
      const s2 = resolveAll(s1);
      return { chosen: chosen(s1), host: hostOf(s2, "Rancor"), exile: zoneNames(s2, "user", "exile") };
    };
    expect({ withGiant: run(true), alone: run(false) }).toEqual({
      withGiant: { chosen: ["Brago, King Eternal", "Elvish Visionary", "Rancor"], host: "Hill Giant", exile: [] },
      alone: { chosen: ["Brago, King Eternal", "Elvish Visionary"], host: null, exile: [] },
    });
  });

  it("the AI never flickers an Aura whose side it can't read: Brago leaves Leaden Fists (+3/+3 and doesn't untap, on one line) where it is", () => {
    const [fists, wurm] = on(perm("fists", LEADEN_FISTS, "user"), perm("wurm", WURM, "ai"));
    expect({ side: auraCastIntent(LEADEN_FISTS), chosen: chosen(bragoHits(board({ user: [perm("brago", BRAGO, "user", { tapped: true }), fists], ai: [wurm, perm("bear", BEAR, "ai")] }))) })
      .toEqual({ side: null, chosen: ["Brago, King Eternal"] });
  });

  it("Claustrophobia's side is read (the untap lock is a curse, 2026-10-17): Brago flickers it, and it comes back on the same Craw Wurm — the opponent's biggest creature", () => {
    const [claus, wurm] = on(perm("claus", CLAUSTROPHOBIA, "user"), perm("wurm", WURM, "ai"));
    const s1 = bragoHits(board({ user: [perm("brago", BRAGO, "user", { tapped: true }), claus], ai: [wurm, perm("bear", BEAR, "ai")] }));
    const s2 = resolveAll(flushTriggers(resolveAll(s1), { chooseTargets: chooseTriggerTargets }));
    expect({ side: auraCastIntent(CLAUSTROPHOBIA), chosen: chosen(s1), host: hostOf(s2, "Claustrophobia"), wurmTapped: !!findPermanent(s2, "wurm").permanent.tapped })
      .toEqual({ side: "enemy", chosen: ["Brago, King Eternal", "Claustrophobia"], host: "Craw Wurm", wurmTapped: true });
  });

  it("nor anything that would go home to its owner (\"under their owner's control\"): a Pacifism and an Elvish Visionary the opponent owns stay where they are", () => {
    const [pac, bear] = on(perm("aura", PACIFISM, "user", { owner: "ai" }), perm("bear", BEAR, "ai"));
    const stolen = perm("vis", VISIONARY, "user", { owner: "ai" }); // its enters ability would count +3 — for the opponent
    expect(chosen(bragoHits(board({ user: [perm("brago", BRAGO, "user", { tapped: true }), pac, stolen], ai: [bear, perm("wurm", WURM, "ai")] })))).toEqual(["Brago, King Eternal"]);
  });

  it("⭐ Displacer Kitten takes the re-aim (+4) over the Visionary's draw (+3); with Pacifism already on the Wurm, the draw", () => {
    const run = (hostId) => {
      const [pac, host] = on(perm("aura", PACIFISM, "user"), perm(hostId, hostId === "bear" ? BEAR : WURM, "ai"));
      const others = hostId === "bear" ? [perm("wurm", WURM, "ai")] : [perm("bear", BEAR, "ai")];
      const s1 = kittenSees(board({ user: [perm("kitten", KITTEN, "user"), perm("vis", VISIONARY, "user"), pac], ai: [host, ...others] }));
      return { chosen: chosen(s1), host: hostOf(resolveAll(s1), "Pacifism") };
    };
    expect({ fromBear: run("bear"), fromWurm: run("wurm") }).toEqual({
      fromBear: { chosen: ["Pacifism"], host: "Craw Wurm" },
      fromWurm: { chosen: ["Elvish Visionary"], host: "Craw Wurm" },
    });
  });
});
