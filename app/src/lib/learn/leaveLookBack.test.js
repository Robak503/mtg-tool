/**
 * LEAVES-THE-BATTLEFIELD WATCHERS LOOK BACK (CR 603.10a, 603.6c) — "Whenever [another] <thing> is put into a graveyard from the
 * battlefield" and "Whenever <thing> leaves the battlefield" are leaves-the-battlefield abilities (CR 603.6c), so the game looks
 * back in time to decide whether they trigger (CR 603.10a): a watcher that leaves in the SAME event as the permanents it watches
 * still triggers for each of them. The bundled rulings: Marionette Master (2016-09-20) "If Marionette Master and an artifact you
 * control are put into a graveyard at the same time, Marionette Master's ability triggers."; Disciple of the Vault (2020-08-07)
 * "If an artifact is put into a graveyard at the same time as Disciple of the Vault, its ability triggers for that artifact."
 *
 * Before the fix triggers.checkLeavesTriggers offered a leave event only to the leaving permanent itself and to the battlefield, so
 * Marionette Apprentice wiped together with an Ornithopter drained nothing. The death watchers got this look-back in P·34
 * (deadLookBackSources); this is its twin for the leave watchers (permanentLeaves).
 *
 * The look-back is bounded by what the watcher could have seen: it was on the battlefield as the other permanent left (the leave
 * event's board), or both left in one event (a wipe, a mass bounce, a blink, a death batch). An Aura that falls off a departed
 * host goes to the graveyard AFTER the event (CR 704.5m), when a watcher that left in the event is gone.
 *
 * Real oracle text (bundled Scryfall, probed 2026-10-18); the spells are cast for real (legal action → dispatch → resolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, destroyLethalCreatures, moveCardToZone } from "./gameState.js";
import { checkDiesTriggers, checkLeavesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const APPRENTICE = card("Marionette Apprentice", "Creature — Human Artificer", "{1}{B}", 2, "Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.", { power: "1", toughness: "2", colors: ["B"], keywords: ["Fabricate"] });
const ORNITHOPTER = card("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, "Flying", { power: "0", toughness: "2", colors: [], keywords: ["Flying"] });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.", { colors: [] });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const SERVO = card("Servo", "Token Artifact Creature — Servo", "", 0, "", { power: "1", toughness: "1", colors: [], token: true });
const WICKED_VISITOR = card("Wicked Visitor", "Creature — Nightmare", "{1}{B}", 2, "Whenever an enchantment you control is put into a graveyard from the battlefield, each opponent loses 1 life.", { power: "2", toughness: "2", colors: ["B"] });
const ANTHEM = card("Glorious Anthem", "Enchantment", "{1}{W}{W}", 3, "Creatures you control get +1/+1.", { colors: ["W"] });
const PACIFISM = card("Pacifism", "Enchantment — Aura", "{1}{W}", 2, "Enchant creature\nEnchanted creature can't attack or block.", { colors: ["W"], keywords: ["Enchant"] });
const TITANIA = card("Titania, Protector of Argoth", "Legendary Creature — Elemental", "{3}{G}{G}", 5, "When Titania enters, return target land card from your graveyard to the battlefield.\nWhenever a land you control is put into a graveyard from the battlefield, create a 5/3 green Elemental creature token.", { power: "5", toughness: "3", colors: ["G"] });
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)", { colors: [] });
const DRYAD_ARBOR = card("Dryad Arbor", "Land Creature — Forest Dryad", "", 0, "(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")", { power: "1", toughness: "1", colors: ["G"] });
const FANGREN = card("Fangren Marauder", "Creature — Beast", "{5}{G}", 6, "Whenever an artifact is put into a graveyard from the battlefield, you may gain 5 life.", { power: "5", toughness: "5", colors: ["G"] });
const NIGHTBLADE = card("Nadier's Nightblade", "Creature — Elf Warrior", "{2}{B}", 3, "Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life.", { power: "1", toughness: "3", colors: ["B"] });
const PATROL = card("Ninth Bridge Patrol", "Creature — Dwarf Soldier", "{1}{W}", 2, "Whenever another creature you control leaves the battlefield, put a +1/+1 counter on this creature.", { power: "1", toughness: "1", colors: ["W"] });
const RAT_KING = card("Rat King, Pale Piper", "Legendary Creature — Rat Avatar", "{3}{B}", 4, "Menace\nWhenever Rat King or another nontoken creature you control leaves the battlefield, create a 1/1 black Rat creature token.\n{2}, Sacrifice a token: Draw a card.", { power: "3", toughness: "3", colors: ["B"], keywords: ["Menace"] });

const VENGEANCE = card("Akroma's Vengeance", "Sorcery", "{4}{W}{W}", 6, "Destroy all artifacts, creatures, and enchantments.\nCycling {3} ({3}, Discard this card: Draw a card.)", { colors: ["W"], keywords: ["Cycling"] });
const SHATTERSTORM = card("Shatterstorm", "Sorcery", "{2}{R}{R}", 4, "Destroy all artifacts. They can't be regenerated.", { colors: ["R"] });
const DAY = card("Day of Judgment", "Sorcery", "{2}{W}{W}", 4, "Destroy all creatures.", { colors: ["W"] });
const EVACUATION = card("Evacuation", "Instant", "{3}{U}{U}", 5, "Return all creatures to their owners' hands.", { colors: ["U"] });
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, "Return target creature to its owner's hand.", { colors: ["U"] });
const MURDER = card("Murder", "Instant", "{1}{B}{B}", 3, "Destroy target creature.", { colors: ["B"] });
const MASTER = card("Marionette Master", "Creature — Human Artificer", "{4}{B}{B}", 6, "Fabricate 3 (When this creature enters, put three +1/+1 counters on it or create three 1/1 colorless Servo artifact creature tokens.)\nWhenever an artifact you control is put into a graveyard from the battlefield, target opponent loses life equal to this creature's power.", { power: "1", toughness: "3", colors: ["B"], keywords: ["Fabricate"] });
const DISCIPLE = card("Disciple of the Vault", "Creature — Human Cleric", "{B}", 1, "Whenever an artifact is put into a graveyard from the battlefield, you may have target opponent lose 1 life.", { power: "1", toughness: "1", colors: ["B"] });
const QUILL_SLINGER = card("Quill-Slinger Boggart", "Creature — Goblin Warrior", "{3}{B}", 4, "Whenever a player casts a Kithkin spell, you may have target player lose 1 life.", { power: "3", toughness: "2", colors: ["B"] });
const HARRIER = card("Goldmeadow Harrier", "Creature — Kithkin Soldier", "{W}", 1, "{W}, {T}: Tap target creature.", { power: "1", toughness: "1", colors: ["W"] });
const LIONS = card("Savannah Lions", "Creature — Cat", "{W}", 1, "", { power: "2", toughness: "1", colors: ["W"] });
const FLICKER = card("Ghostly Flicker", "Instant", "{2}{U}", 3, "Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.", { colors: ["U"] });

const P = (id, ctrl, c, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...c }, controller: ctrl, summoningSick: false }), ...over });
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, W: 2, U: 2, R: 2, B: 2, C: 4 }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
/** Resolve the stack to empty; a "you may" the controller is asked (optional-effect) is taken. */
const settle = (s) => {
  let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 40; i++) {
    if (st.pendingChoice?.kind === "optional-effect") { st = flushTriggers(resolveOptionalChoice(st, true), { chooseTargets: chooseTriggerTargets }); continue; }
    if (!(st.stack || []).length || st.pendingChoice) break;
    st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets });
  }
  return st;
};
/** Cast `id` from the user's hand (the first legal cast passing `pick`) and resolve it — the resolution's own triggers on the stack. */
const castAndResolve = (s0, id, pick = () => true) => {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === id && pick(a));
  if (!act) throw new Error(`no cast of ${id}`);
  return resolveTopOfStack(dispatchAction(s0, act));
};
/** The triggered abilities `name` put on the stack, by the permanent whose leaving caused each. */
const stackedFor = (s, name) => (s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === name).map((o) => o.payload?.params?.context?.triggeringPermanentId).sort();
const pendingFor = (s, name) => (s.pendingTriggers || []).filter((t) => t.source?.name === name).map((t) => t.context?.triggeringPermanentId).sort();
const lifeLost = (s0, s, pid) => s0.players[pid].life - s.players[pid].life;
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name);

describe("⭐ CR 603.10a — a graveyard-from-the-battlefield watcher that leaves in the same event still sees the others", () => {
  it("⭐ Akroma's Vengeance with Marionette Apprentice and an Ornithopter: the Apprentice triggers for the Ornithopter (either battlefield order)", () => {
    for (const apprenticeFirst of [true, false]) {
      const a = P("app", "user", APPRENTICE), o = P("orn", "user", ORNITHOPTER);
      const s0 = board({ user: apprenticeFirst ? [a, o] : [o, a], hand: [{ ...VENGEANCE, id: "wrath" }] });
      const resolved = castAndResolve(s0, "wrath");
      const s = settle(resolved);
      const row = { apprenticeFirst, triggers: stackedFor(resolved, "Marionette Apprentice"), aiLife: lifeLost(s0, s, "ai") };
      console.log("  WITNESS apprenticeWipe", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
      expect(row).toEqual({ apprenticeFirst, triggers: ["orn"], aiLife: 1 });
    }
  });

  it("⭐ the same in a state-based death batch (lethal damage), whichever order the battlefield lists them", () => {
    for (const apprenticeFirst of [true, false]) {
      const a = P("app", "user", APPRENTICE, { damageMarked: 2 }), o = P("orn", "user", ORNITHOPTER, { damageMarked: 2 });
      const r = destroyLethalCreatures(board({ user: apprenticeFirst ? [a, o] : [o, a] }));
      expect(pendingFor(checkDiesTriggers(r.state, r.dead), "Marionette Apprentice")).toEqual(["orn"]);
    }
  });

  it("⭐ a NONCREATURE artifact destroyed with it counts too: Akroma's Vengeance with the Apprentice, a Sol Ring and an Ornithopter drains 2", () => {
    for (const order of [["app", "sol", "orn"], ["sol", "orn", "app"], ["orn", "app", "sol"]]) {
      const perms = { app: P("app", "user", APPRENTICE), sol: P("sol", "user", SOL_RING), orn: P("orn", "user", ORNITHOPTER) };
      const s0 = board({ user: order.map((k) => perms[k]), hand: [{ ...VENGEANCE, id: "wrath" }] });
      const resolved = castAndResolve(s0, "wrath");
      expect({ order, triggers: stackedFor(resolved, "Marionette Apprentice"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ order, triggers: ["orn", "sol"], aiLife: 2 });
    }
  });

  it("⭐ an enchantment watcher: Wicked Visitor destroyed with a Glorious Anthem still drains for the Anthem", () => {
    const s0 = board({ user: [P("vis", "user", WICKED_VISITOR), P("anth", "user", ANTHEM)], hand: [{ ...VENGEANCE, id: "wrath" }] });
    const resolved = castAndResolve(s0, "wrath");
    expect({ triggers: stackedFor(resolved, "Wicked Visitor"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: ["anth"], aiLife: 1 });
  });

  it("⭐ a land watcher: Day of Judgment takes Titania and a Dryad Arbor (a land creature) — one 5/3 Elemental; the Forest stays", () => {
    const s0 = board({ user: [P("tit", "user", TITANIA), P("arbor", "user", DRYAD_ARBOR), P("f1", "user", FOREST)], hand: [{ ...DAY, id: "day" }] });
    const resolved = castAndResolve(s0, "day");
    expect({ triggers: stackedFor(resolved, "Titania, Protector of Argoth"), elementals: named(settle(resolved), "user", "Elemental").length }).toEqual({ triggers: ["arbor"], elementals: 1 });
  });

  it("⭐ any player's artifact: Fangren Marauder destroyed with an opponent's Ornithopter triggers for it", () => {
    const s0 = board({ user: [P("fang", "user", FANGREN)], ai: [P("orn", "ai", ORNITHOPTER)], hand: [{ ...VENGEANCE, id: "wrath" }] });
    expect(stackedFor(castAndResolve(s0, "wrath"), "Fangren Marauder")).toEqual(["orn"]);
  });
});

describe("⭐ CR 603.10a — the any-exit leave watchers (\"leaves the battlefield\") look back too", () => {
  it("⭐ Evacuation returns Nadier's Nightblade and two Servos: the Servos leaving drain 2 (each token leaving)", () => {
    const s0 = board({ user: [P("nb", "user", NIGHTBLADE), P("sv1", "user", SERVO), P("sv2", "user", SERVO)], hand: [{ ...EVACUATION, id: "evac" }] });
    const resolved = castAndResolve(s0, "evac");
    const s = settle(resolved);
    expect({ triggers: stackedFor(resolved, "Nadier's Nightblade"), aiLife: lifeLost(s0, s, "ai"), yourLife: s.players.user.life - s0.players.user.life }).toEqual({ triggers: ["sv1", "sv2"], aiLife: 2, yourLife: 2 });
  });

  it("⭐ Rat King or another nontoken creature: Evacuation returns Rat King and a Bears — two Rats, one for each", () => {
    const s0 = board({ user: [P("rk", "user", RAT_KING), P("b1", "user", BEARS)], hand: [{ ...EVACUATION, id: "evac" }] });
    const resolved = castAndResolve(s0, "evac");
    expect({ triggers: stackedFor(resolved, "Rat King, Pale Piper"), rats: named(settle(resolved), "user", "Rat").length }).toEqual({ triggers: ["b1", "rk"], rats: 2 });
  });

  it("⭐ Ghostly Flicker on Ninth Bridge Patrol and a Bears: the departed Patrol triggers once; the returned Patrol is a new object that never saw the Bears leave (CR 400.7) — no counter", () => {
    const s0 = board({ user: [P("pat", "user", PATROL), P("b1", "user", BEARS)], hand: [{ ...FLICKER, id: "fl" }] });
    const resolved = castAndResolve(s0, "fl", (a) => a.targets.map((t) => t.id).sort().join() === "b1,pat");
    const s = settle(resolved);
    const back = named(s, "user", "Ninth Bridge Patrol");
    const row = { triggers: stackedFor(resolved, "Ninth Bridge Patrol"), back: back.length, counters: back[0]?.counters?.["+1/+1"] || 0 };
    console.log("  WITNESS patrolFlicker", JSON.stringify(row));
    expect(row).toEqual({ triggers: ["b1"], back: 1, counters: 0 });
  });
});

describe("the look-back sees only what the watcher could have seen", () => {
  it("⭐ a watcher still on the battlefield after an earlier leave in the same batch sees it (it was there): the Ornithopter goes, then the Apprentice", () => {
    let s = board({ user: [P("app", "user", APPRENTICE), P("orn", "user", ORNITHOPTER)] });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "orn" });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "app" });
    expect(pendingFor(checkLeavesTriggers(s), "Marionette Apprentice")).toEqual(["orn"]);
  });

  it("a watcher that left BEFORE, in a separate event, does not see a later leave: the Apprentice goes, then the Ornithopter", () => {
    let s = board({ user: [P("app", "user", APPRENTICE), P("orn", "user", ORNITHOPTER)] });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "app" });
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "orn" });
    expect(pendingFor(checkLeavesTriggers(s), "Marionette Apprentice")).toEqual([]);
  });

  it("an Aura that falls off a host bounced WITH the watcher goes after the event (CR 704.5m): Evacuation with Wicked Visitor and a Pacified Bears drains nothing (either battlefield order)", () => {
    for (const bearsFirst of [true, false]) {
      const vis = P("vis", "user", WICKED_VISITOR), b2 = P("b2", "user", BEARS, { attachments: ["pac"] }), pac = P("pac", "user", PACIFISM, { attachedTo: "b2" });
      const s0 = board({ user: bearsFirst ? [b2, vis, pac] : [vis, b2, pac], hand: [{ ...EVACUATION, id: "evac" }] });
      const resolved = castAndResolve(s0, "evac");
      expect({ bearsFirst, pacifismInGraveyard: resolved.players.user.graveyard.some((c) => c.name === "Pacifism"), triggers: stackedFor(resolved, "Wicked Visitor"), aiLife: lifeLost(s0, settle(resolved), "ai") })
        .toEqual({ bearsFirst, pacifismInGraveyard: true, triggers: [], aiLife: 0 });
    }
  });

  it("⭐ …but an Aura the same event destroys left WITH it: Akroma's Vengeance with Wicked Visitor and a Pacified Bears drains 1 for Pacifism (either order)", () => {
    for (const bearsFirst of [true, false]) {
      const vis = P("vis", "user", WICKED_VISITOR), b2 = P("b2", "user", BEARS, { attachments: ["pac"] }), pac = P("pac", "user", PACIFISM, { attachedTo: "b2" });
      const s0 = board({ user: bearsFirst ? [b2, vis, pac] : [vis, pac, b2], hand: [{ ...VENGEANCE, id: "wrath" }] });
      const resolved = castAndResolve(s0, "wrath");
      expect({ bearsFirst, triggers: stackedFor(resolved, "Wicked Visitor"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ bearsFirst, triggers: ["pac"], aiLife: 1 });
    }
  });

  it("…while a Wicked Visitor that stays sees it go: Unsummon on the Pacified Bears drains 1", () => {
    const s0 = board({ user: [P("vis", "user", WICKED_VISITOR), P("pac", "user", PACIFISM, { attachedTo: "b2" })], ai: [P("b2", "ai", BEARS, { attachments: ["pac"] })], hand: [{ ...UNSUMMON, id: "uns" }] });
    const resolved = castAndResolve(s0, "uns", (a) => a.targets[0].id === "b2");
    expect({ triggers: stackedFor(resolved, "Wicked Visitor"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: ["pac"], aiLife: 1 });
  });
});

describe("controls — nothing new where the watcher never left, and never twice", () => {
  it("Shatterstorm with the Apprentice out (it is no artifact — it stays): the Ornithopter drains exactly 1", () => {
    const s0 = board({ user: [P("app", "user", APPRENTICE), P("orn", "user", ORNITHOPTER)], hand: [{ ...SHATTERSTORM, id: "storm" }] });
    const resolved = castAndResolve(s0, "storm");
    expect({ triggers: stackedFor(resolved, "Marionette Apprentice"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: ["orn"], aiLife: 1 });
  });

  it("the Apprentice dying alone drains nothing (\"another\")", () => {
    const s0 = board({ user: [P("app", "user", APPRENTICE)], hand: [{ ...MURDER, id: "mur" }] });
    const resolved = castAndResolve(s0, "mur", (a) => a.targets[0].id === "app");
    expect({ triggers: stackedFor(resolved, "Marionette Apprentice"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: [], aiLife: 0 });
  });

  it("a bounce is no graveyard exit: Evacuation with the Apprentice and an Ornithopter drains nothing", () => {
    const s0 = board({ user: [P("app", "user", APPRENTICE), P("orn", "user", ORNITHOPTER)], hand: [{ ...EVACUATION, id: "evac" }] });
    const resolved = castAndResolve(s0, "evac");
    expect({ triggers: stackedFor(resolved, "Marionette Apprentice"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: [], aiLife: 0 });
  });

  it("a watcher that stays is the battlefield sweep's, never offered twice: Unsummon on a Bears with Ninth Bridge Patrol out — one trigger, one counter", () => {
    const s0 = board({ user: [P("pat", "user", PATROL), P("b1", "user", BEARS)], hand: [{ ...UNSUMMON, id: "uns" }] });
    const resolved = castAndResolve(s0, "uns", (a) => a.targets[0].id === "b1");
    const s = settle(resolved);
    expect({ triggers: stackedFor(resolved, "Ninth Bridge Patrol"), counters: named(s, "user", "Ninth Bridge Patrol")[0]?.counters?.["+1/+1"] || 0 }).toEqual({ triggers: ["b1"], counters: 1 });
  });
});

describe("⭐ the two cards this look-back parked — every line plays", () => {
  it("both classify native (Fabricate 3 and the drain; the optional targeted drain)", () => {
    expect([classifyCard(MASTER), classifyCard(DISCIPLE)]).toEqual(["native-trigger", "native-trigger"]);
  });

  it("⭐ Marionette Master (4/6 with three counters) stays while Shatterstorm takes a Servo: the opponent loses 4", () => {
    const s0 = board({ user: [P("mm", "user", MASTER, { counters: { "+1/+1": 3 } }), P("sv", "user", SERVO)], hand: [{ ...SHATTERSTORM, id: "storm" }] });
    const resolved = castAndResolve(s0, "storm");
    expect({ triggers: stackedFor(resolved, "Marionette Master"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: ["sv"], aiLife: 4 });
  });

  it("⭐ its ruling: Marionette Master (3/5 with two counters) and an Ornithopter destroyed together — it triggers, and the loss is the power it last had (3)", () => {
    for (const masterFirst of [true, false]) {
      const mm = P("mm", "user", MASTER, { counters: { "+1/+1": 2 } }), o = P("orn", "user", ORNITHOPTER);
      const s0 = board({ user: masterFirst ? [mm, o] : [o, mm], hand: [{ ...VENGEANCE, id: "wrath" }] });
      const resolved = castAndResolve(s0, "wrath");
      const row = { masterFirst, triggers: stackedFor(resolved, "Marionette Master"), aiLife: lifeLost(s0, settle(resolved), "ai") };
      console.log("  WITNESS masterWipe", JSON.stringify(row));
      expect(row).toEqual({ masterFirst, triggers: ["orn"], aiLife: 3 });
    }
  });

  it("its ruling: the Master killed while its trigger waits on the stack — the loss is still the power it last had (2)", () => {
    const s0 = board({ user: [P("mm", "user", MASTER, { counters: { "+1/+1": 1 } }), P("orn", "user", ORNITHOPTER)], hand: [{ ...SHATTERSTORM, id: "storm" }] });
    const resolved = castAndResolve(s0, "storm");
    expect(stackedFor(resolved, "Marionette Master")).toEqual(["orn"]);
    const killed = moveCardToZone(resolved, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "mm" });
    expect(lifeLost(s0, settle(killed), "ai")).toBe(2);
  });

  it("an opponent's artifact is not \"an artifact you control\": Shatterstorm on their Ornithopter drains nothing", () => {
    const s0 = board({ user: [P("mm", "user", MASTER)], ai: [P("orn", "ai", ORNITHOPTER)], hand: [{ ...SHATTERSTORM, id: "storm" }] });
    const resolved = castAndResolve(s0, "storm");
    expect({ triggers: stackedFor(resolved, "Marionette Master"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: [], aiLife: 0 });
  });

  it("⭐ Disciple of the Vault: any player's artifact — Shatterstorm on your Sol Ring and their Ornithopter drains 2", () => {
    const s0 = board({ user: [P("dv", "user", DISCIPLE), P("sol", "user", SOL_RING)], ai: [P("orn", "ai", ORNITHOPTER)], hand: [{ ...SHATTERSTORM, id: "storm" }] });
    const resolved = castAndResolve(s0, "storm");
    expect({ triggers: stackedFor(resolved, "Disciple of the Vault"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: ["orn", "sol"], aiLife: 2 });
  });

  it("⭐ its ruling: Disciple of the Vault destroyed with an Ornithopter triggers for it — the opponent loses 1", () => {
    for (const discipleFirst of [true, false]) {
      const dv = P("dv", "user", DISCIPLE), o = P("orn", "user", ORNITHOPTER);
      const s0 = board({ user: discipleFirst ? [dv, o] : [o, dv], hand: [{ ...VENGEANCE, id: "wrath" }] });
      const resolved = castAndResolve(s0, "wrath");
      expect({ discipleFirst, triggers: stackedFor(resolved, "Disciple of the Vault"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ discipleFirst, triggers: ["orn"], aiLife: 1 });
    }
  });

  it("⭐ the same causative loss reads on Quill-Slinger Boggart: a Kithkin spell cast — an opponent loses 1; a Savannah Lions cast — nothing", () => {
    const kith = board({ user: [P("qs", "user", QUILL_SLINGER)], hand: [{ ...HARRIER, id: "har" }] });
    const lions = board({ user: [P("qs", "user", QUILL_SLINGER)], hand: [{ ...LIONS, id: "lion" }] });
    const cast = (s0, id) => settle(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === id)));
    expect({ tier: classifyCard(QUILL_SLINGER), kithkin: lifeLost(kith, cast(kith, "har"), "ai"), lions: lifeLost(lions, cast(lions, "lion"), "ai"), yourLife: cast(kith, "har").players.user.life - kith.players.user.life })
      .toEqual({ tier: "native-trigger", kithkin: 1, lions: 0, yourLife: 0 });
  });

  it("Disciple of the Vault dying alone (it is no artifact) drains nothing", () => {
    const s0 = board({ user: [P("dv", "user", DISCIPLE)], hand: [{ ...MURDER, id: "mur" }] });
    const resolved = castAndResolve(s0, "mur", (a) => a.targets[0].id === "dv");
    expect({ triggers: stackedFor(resolved, "Disciple of the Vault"), aiLife: lifeLost(s0, settle(resolved), "ai") }).toEqual({ triggers: [], aiLife: 0 });
  });
});
