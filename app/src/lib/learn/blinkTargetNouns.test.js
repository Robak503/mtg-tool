/**
 * blinkTargetNouns.test.js — the blink target nouns the most-played still lacked (play-weighted 2026-10-20).
 *
 * The blink atom (effects/atoms/zones.applyBlink — exile, then return as a new object, CR 400.7) read creature / nonland
 * permanent / artifact-or-creature / the Ghostly Flicker triple, all on the controller's own side. Four nouns were missing:
 *   · a creature-type exclusion — Restoration Angel (EDHREC #1390) "exile target non-Angel creature you control";
 *   · "another" on a mandatory single target — Felidar Guardian (#1686) "exile another target permanent you control" (lands
 *     too), Wispweaver Angel, Soulherder's end step, and the activated Distinguished Conjurer, Nephalia Smuggler, Lilysplash
 *     Mentor;
 *   · any controller's permanent, returned under its owner's control — Flicker of Fate (#2091) "target creature or
 *     enchantment", Planar Incision (#2259) and Spaceshift "target artifact or creature", Eldrazi Displacer "another target
 *     creature";
 *   · the return's own riders — "with a +1/+1 counter on it" (an enters-with counter, CR 614.1c and 122.6, so a counter
 *     replacement such as Hardened Scales applies) and "tapped" (CR 110.5b).
 * The clause splitter keeps each of these sentences whole (the ", then" split would orphan the return).
 *
 * Oracle text and rulings copied from the bundled Scryfall snapshot (oracle_cards.json, rulings.json; read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets, passPriority } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, colors, keywords, oracle, extra = {}) => ({ name, type, mana, cmc, colors, keywords, oracle, ...extra });
const creature = (name, type, mana, cmc, power, toughness, colors, keywords, oracle) => card(name, type, mana, cmc, colors, keywords, oracle, { power, toughness });

// ── the carriers (bundled oracle text) ──
const RESTORATION_ANGEL = creature("Restoration Angel", "Creature — Angel", "{3}{W}", 4, "3", "4", ["W"], ["Flying", "Flash"],
  "Flash\nFlying\nWhen this creature enters, you may exile target non-Angel creature you control, then return that card to the battlefield under your control.");
const FELIDAR_GUARDIAN = creature("Felidar Guardian", "Creature — Cat Beast", "{3}{W}", 4, "1", "4", ["W"], [],
  "When this creature enters, you may exile another target permanent you control, then return that card to the battlefield under its owner's control.");
const WISPWEAVER_ANGEL = creature("Wispweaver Angel", "Creature — Angel", "{4}{W}{W}", 6, "4", "4", ["W"], ["Flying"],
  "Flying\nWhen this creature enters, you may exile another target creature you control, then return that card to the battlefield under its owner's control.");
const FLICKER_OF_FATE = card("Flicker of Fate", "Instant", "{1}{W}", 2, ["W"], [],
  "Exile target creature or enchantment, then return it to the battlefield under its owner's control.");
const PLANAR_INCISION = card("Planar Incision", "Instant", "{1}{U}", 2, ["U"], [],
  "Exile target artifact or creature, then return it to the battlefield under its owner's control with a +1/+1 counter on it.");
const SPACESHIFT = card("Spaceshift", "Instant", "{1}{U}", 2, ["U"], [],
  "Exile target artifact or creature, then return that card to the battlefield under its owner's control with a +1/+1 counter on it.");
const ELDRAZI_DISPLACER = creature("Eldrazi Displacer", "Creature — Eldrazi", "{2}{W}", 3, "3", "3", [], ["Devoid"],
  "Devoid (This card has no color.)\n{2}{C}: Exile another target creature, then return it to the battlefield tapped under its owner's control. ({C} represents colorless mana.)");
const DISTINGUISHED_CONJURER = creature("Distinguished Conjurer", "Creature — Human Wizard", "{1}{W}", 2, "1", "2", ["W"], [],
  "Whenever another creature you control enters, you gain 1 life.\n{4}{W}, {T}: Exile another target creature you control, then return it to the battlefield under its owner's control.");
const NEPHALIA_SMUGGLER = creature("Nephalia Smuggler", "Creature — Human Rogue", "{U}", 1, "1", "1", ["U"], [],
  "{3}{U}, {T}: Exile another target creature you control, then return that card to the battlefield under your control.");
const LILYSPLASH_MENTOR = creature("Lilysplash Mentor", "Creature — Frog Druid", "{2}{G}{U}", 4, "4", "4", ["G", "U"], ["Reach"],
  "Reach\n{1}{G}{U}: Exile another target creature you control, then return it to the battlefield under its owner's control with a +1/+1 counter on it. Activate only as a sorcery.");
const EMIEL = creature("Emiel the Blessed", "Legendary Creature — Unicorn", "{2}{W}{W}", 4, "4", "4", ["W"], [],
  "{3}: Exile another target creature you control, then return it to the battlefield under its owner's control.\nWhenever another creature you control enters, you may pay {G/W}. If you do, put a +1/+1 counter on it. If it's a Unicorn, put two +1/+1 counters on it instead. ({G/W} can be paid with either {G} or {W}.)");
const CONJURERS_CLOSET = card("Conjurer's Closet", "Artifact", "{5}", 5, [], [],
  "At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your control.");

// ── the board ──
const WALL_OF_OMENS = creature("Wall of Omens", "Creature — Wall", "{1}{W}", 2, "0", "4", ["W"], ["Defender"], "Defender\nWhen this creature enters, draw a card.");
const SERRA_ANGEL = creature("Serra Angel", "Creature — Angel", "{3}{W}{W}", 5, "4", "4", ["W"], ["Flying", "Vigilance"], "Flying\nVigilance (Attacking doesn't cause this creature to tap.)");
const MIRROR_ENTITY = creature("Mirror Entity", "Creature — Shapeshifter", "{2}{W}", 3, "1", "1", ["W"], ["Changeling"],
  "Changeling (This card is every creature type.)\n{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types.");
const BEARS = creature("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "2", "2", ["G"], [], "");
const HILL_GIANT = creature("Hill Giant", "Creature — Giant", "{3}{R}", 4, "3", "3", ["R"], [], "");
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, [], [], "{T}: Add {C}{C}.");
const PACIFISM = card("Pacifism", "Enchantment — Aura", "{1}{W}", 2, ["W"], ["Enchant"], "Enchant creature\nEnchanted creature can't attack or block.");
const HARDENED_SCALES = card("Hardened Scales", "Enchantment", "{G}", 1, ["G"], [],
  "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.");
const basic = (name, c) => card(name, `Basic Land — ${name}`, "", 0, [], [], `({T}: Add {${c}}.)`);
const LIBRARY = [1, 2, 3, 4, 5].map((i) => ({ ...basic("Island", "U"), id: `lib-${i}` }));

/** A two-seat board. `user` / `ai` = [[permId, card, opts]]; opts: tapped, sick, counters, damage, attachedTo. */
function table({ user = [], ai = [], userHand = [], phase = "precombat-main", step = "main", active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => ({
    ...createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } }),
    counters: { ...(o.counters || {}) }, damageMarked: o.damage || 0,
    ...(o.attachedTo ? { attachedTo: o.attachedTo } : {}), ...(o.attachments ? { attachments: o.attachments } : {}),
  });
  return { ...s0, turn: 6, phase, step, activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [],
    players: { ...s0.players,
      user: { ...s0.players.user, landsPlayedThisTurn: 1, battlefield: user.map(P("user")), hand: userHand.map(([id, c]) => ({ ...c, id })), library: [...LIBRARY] },
      ai: { ...s0.players.ai, landsPlayedThisTurn: 1, battlefield: ai.map(P("ai")), library: [...LIBRARY] } } };
}
const lands = (prefix, name, c, n) => Array.from({ length: n }, (_, i) => [`${prefix}${i}`, basic(name, c)]);
const bf = (s, pid) => s.players[pid].battlefield;
const named = (s, pid, name) => bf(s, pid).filter((p) => p.card?.name === name);
const one = (s, pid, name) => { const list = named(s, pid, name); expect(list, `${name} on ${pid}'s battlefield`).toHaveLength(1); return list[0]; };

/** Resolve the stack, answering every "you may" with `yes`, flushing new triggers as they arrive. */
function resolveAll(s, yes = true) {
  let guard = 0;
  while (guard++ < 60) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, yes); continue; }
    if (s.pendingChoice) break;
    if ((s.pendingTriggers || []).length) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); continue; }
    if (!s.stack.length) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
/** The enters trigger of the permanent `id` (already on the battlefield), put on the stack with the engine's chooser. */
function entersTrigger(s, id) {
  const perm = bf(s, "user").find((p) => p.id === id) || bf(s, "ai").find((p) => p.id === id);
  s = checkEnterTriggers(s, perm);
  return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
}
const triggerOnStack = (s) => s.stack.find((o) => o.kind === "triggered-ability");
const poolIds = (s, controller, clause, sourceId) =>
  enumerateTargets(s, controller, parseEffectClause(clause, "Instant").atoms[0], [], { sourceId }).map((t) => t.id).sort();
const castOffers = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const activations = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
function passToResolution(s) {
  let g = 0;
  while ((s.stack.length || s.pendingChoice || (s.pendingTriggers || []).length) && g++ < 200) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if (s.pendingChoice) break;
    s = passPriority(s);
  }
  return s;
}

const RESTO_CLAUSE = "you may exile target non-Angel creature you control, then return that card to the battlefield under your control";
const FELIDAR_CLAUSE = "you may exile another target permanent you control, then return that card to the battlefield under its owner's control";
const ANOTHER_CREATURE_CLAUSE = "you may exile another target creature you control, then return that card to the battlefield under its owner's control";

describe("parse — each noun is its own anchored arm", () => {
  it("⭐ Restoration Angel: a creature-type exclusion on the own-side creature blink (CR 205.3m — Angel is a creature type)", () => {
    const d = detectTriggers(RESTORATION_ANGEL);
    expect(d.map((x) => x.event)).toEqual(["etb"]);
    const p = parseEffectClause(d[0].effectClause, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "blink", targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }, { kind: "subtype", subtype: "angel", negate: true }], returnTo: "controller", optional: true }]);
  });
  it("⭐ Felidar Guardian: another target PERMANENT you control (lands included), returned under its owner's control", () => {
    const p = parseEffectClause(FELIDAR_CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "blink", targetType: "permanent",
      restrictions: [{ kind: "controller", who: "you" }, { kind: "notSource" }, { kind: "auraEntryModeled" }], returnTo: "owner", optional: true }]);
  });
  it("another target CREATURE you control — Wispweaver Angel's enters trigger, a mandatory single target", () => {
    const p = parseEffectClause(ANOTHER_CREATURE_CLAUSE, "Instant");
    expect(p.atoms).toEqual([{ op: "blink", targetType: "creature",
      restrictions: [{ kind: "controller", who: "you" }, { kind: "notSource" }], returnTo: "owner", optional: true }]);
  });
  it("⭐ Flicker of Fate: any controller's creature or enchantment, home under its owner's control", () => {
    const p = parseEffectClause(FLICKER_OF_FATE.oracle, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "blink", targetType: "creatureOrEnchantment", restrictions: [{ kind: "auraEntryModeled" }], returnTo: "owner" }]);
  });
  it("⭐ Planar Incision / Spaceshift: any controller's artifact or creature, returned with a +1/+1 counter on it", () => {
    for (const c of [PLANAR_INCISION, SPACESHIFT]) {
      const p = parseEffectClause(c.oracle, "Instant");
      expect(programConfidence(p), c.name).toBe("high");
      expect(p.atoms, c.name).toEqual([{ op: "blink", targetType: "creatureOrArtifact", restrictions: [{ kind: "auraEntryModeled" }], returnTo: "owner",
        returnCounter: { type: "+1/+1", n: 1 } }]);
    }
  });
  it("Eldrazi Displacer: another target creature (either side), returned tapped", () => {
    const p = parseEffectClause("Exile another target creature, then return it to the battlefield tapped under its owner's control.", "Instant");
    expect(p.atoms).toEqual([{ op: "blink", targetType: "creature", restrictions: [{ kind: "notSource" }], returnTo: "owner", returnTapped: true }]);
  });
  it("the splitter keeps every new sentence whole (the ', then' split would orphan the return)", () => {
    for (const s of [RESTORATION_ANGEL.oracle.split("\n")[2], FELIDAR_GUARDIAN.oracle, FLICKER_OF_FATE.oracle, PLANAR_INCISION.oracle,
      "Exile another target creature, then return it to the battlefield tapped under its owner's control."]) {
      const sentence = s.replace(/^When this creature enters, /, "");
      expect(splitClauses(sentence), sentence).toHaveLength(1);
    }
  });
  it("intent: an own-side blink is OWN (the trigger chooser places it); one that reaches either side is AMBIGUOUS", () => {
    expect(atomTargetIntent(parseEffectClause(RESTO_CLAUSE, "Instant").atoms[0])).toBe("own");
    expect(atomTargetIntent(parseEffectClause(FELIDAR_CLAUSE, "Instant").atoms[0])).toBe("own");
    expect(atomTargetIntent(parseEffectClause(FLICKER_OF_FATE.oracle, "Instant").atoms[0])).toBe("ambiguous");
  });
});

describe("parse — controls and near misses", () => {
  it("control: the forms read before this slice parse exactly as they did", () => {
    expect(parseEffectClause("exile target creature you control, then return that card to the battlefield under your control", "Instant").atoms)
      .toEqual([{ op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], returnTo: "controller" }]);
    expect(parseEffectClause("exile up to one other target creature you control, then return that card to the battlefield under your control", "Instant").atoms)
      .toEqual([{ op: "blink", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "notSource" }], returnTo: "controller", maxTargets: 1, minTargets: 0 }]);
    expect(classifyCard(CONJURERS_CLOSET)).toBe("native-trigger");
  });
  it("control: an any-controller blink that returns the card under YOUR control (a theft) stays unread", () => {
    expect(parseEffectClause("Exile target creature or enchantment, then return it to the battlefield under your control.", "Instant").atoms).toEqual([]);
    expect(parseEffectClause("Exile target artifact or creature, then return it to the battlefield under your control with a +1/+1 counter on it.", "Instant").atoms).toEqual([]);
  });
  it("control: a 'non-<word>' that is not a creature type stays unread", () => {
    expect(parseEffectClause("exile target non-Food creature you control, then return that card to the battlefield under your control", "Instant").atoms).toEqual([]);
  });
  it("control: Emiel the Blessed's blink reads, but its {G/W} enters payment does not — the card stays parked", () => {
    expect(parseEffectClause("Exile another target creature you control, then return it to the battlefield under its owner's control.", "Instant").atoms[0])
      .toMatchObject({ op: "blink", targetType: "creature", returnTo: "owner" });
    expect(classifyCard(EMIEL)).toBe("body-only");
  });
});

describe("runtime — Restoration Angel", () => {
  it("⭐ the pool is your non-Angel creatures: never Serra Angel, never a changeling (every creature type, CR 702.73a), never itself, never the opponent's", () => {
    const s = table({ user: [["resto", RESTORATION_ANGEL], ["wall", WALL_OF_OMENS], ["serra", SERRA_ANGEL], ["mirror", MIRROR_ENTITY]], ai: [["giant", HILL_GIANT]] });
    expect(poolIds(s, "user", RESTO_CLAUSE, "resto")).toEqual(["wall"]);
  });
  it("⭐ it blinks the Wall of Omens: a new object comes back untapped and draws again", () => {
    let s = table({ user: [["resto", RESTORATION_ANGEL], ["wall", WALL_OF_OMENS, { tapped: true }], ["serra", SERRA_ANGEL]] });
    s = entersTrigger(s, "resto");
    expect(triggerOnStack(s).targets.map((t) => t.id)).toEqual(["wall"]);
    s = resolveAll(s);
    const wall = one(s, "user", "Wall of Omens");
    expect(wall.id).not.toBe("wall");
    expect(wall.tapped).toBeFalsy();
    expect(s.players.user.hand).toHaveLength(1); // the Wall's enters trigger drew
  });
  it("with only Angels beside it, the trigger has no legal target and nothing moves (CR 603.3d)", () => {
    let s = table({ user: [["resto", RESTORATION_ANGEL], ["serra", SERRA_ANGEL]] });
    s = resolveAll(entersTrigger(s, "resto"));
    expect(bf(s, "user").map((p) => p.id).sort()).toEqual(["resto", "serra"]);
  });
});

describe("runtime — Felidar Guardian", () => {
  it("⭐ the pool is every other permanent you control — a land and an artifact too — and none of the opponent's", () => {
    const s = table({ user: [["feli", FELIDAR_GUARDIAN], ["plains", basic("Plains", "W"), { tapped: true }], ["ring", SOL_RING], ["wall", WALL_OF_OMENS]],
      ai: [["giant", HILL_GIANT], ["aring", SOL_RING]] });
    expect(poolIds(s, "user", FELIDAR_CLAUSE, "feli")).toEqual(["plains", "ring", "wall"]);
  });
  it("⭐ a tapped Sol Ring comes back untapped as a new object", () => {
    let s = table({ user: [["feli", FELIDAR_GUARDIAN], ["ring", SOL_RING, { tapped: true }]] });
    s = entersTrigger(s, "feli");
    expect(triggerOnStack(s).targets.map((t) => t.id)).toEqual(["ring"]);
    s = resolveAll(s);
    const ring = one(s, "user", "Sol Ring");
    expect(ring.id).not.toBe("ring");
    expect(ring.tapped).toBeFalsy();
  });
  it("Wispweaver Angel never offers itself", () => {
    const s = table({ user: [["wisp", WISPWEAVER_ANGEL], ["wall", WALL_OF_OMENS], ["ring", SOL_RING]] });
    expect(poolIds(s, "user", ANOTHER_CREATURE_CLAUSE, "wisp")).toEqual(["wall"]);
  });
});

describe("runtime — Flicker of Fate (either side, home to its owner)", () => {
  it("⭐ offered on every creature and enchantment on the battlefield — never an artifact or a land", () => {
    const s = table({ user: [...lands("p", "Plains", "W", 2), ["bears", BEARS], ["ring", SOL_RING]], ai: [["giant", HILL_GIANT], ["paci", PACIFISM, { attachedTo: "bears" }]],
      userHand: [["fof", FLICKER_OF_FATE]] });
    const fixed = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf(s, "user").map((p) => (p.id === "bears" ? { ...p, attachments: ["paci"] } : p)) } } };
    expect([...new Set(castOffers(fixed, "fof").map((a) => a.targets?.[0]?.id))].sort()).toEqual(["bears", "giant", "paci"]);
  });
  it("⭐ the opponent's Hill Giant comes back under the opponent's control, untapped, without its damage, and the user's Pacifism on it falls off (the rulings)", () => {
    let s = table({ user: [...lands("p", "Plains", "W", 2), ["paci", PACIFISM, { attachedTo: "giant" }]], ai: [["giant", HILL_GIANT, { tapped: true, damage: 2, attachments: ["paci"] }]],
      userHand: [["fof", FLICKER_OF_FATE]] });
    const cast = castOffers(s, "fof").find((a) => a.targets?.[0]?.id === "giant");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    const giant = one(s, "ai", "Hill Giant");
    expect(giant.id).not.toBe("giant");
    expect(giant.tapped).toBeFalsy();
    expect(giant.damageMarked || 0).toBe(0);
    expect(named(s, "user", "Hill Giant")).toHaveLength(0);
    expect(named(s, "user", "Pacifism")).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(expect.arrayContaining(["Pacifism", "Flicker of Fate"]));
  });
  it("⭐ an Aura target comes back choosing what it enchants (CR 303.4f — the Aura ruling)", () => {
    let s = table({ user: [...lands("p", "Plains", "W", 2), ["paci", PACIFISM, { attachedTo: "giant" }]], ai: [["giant", HILL_GIANT, { attachments: ["paci"] }]],
      userHand: [["fof", FLICKER_OF_FATE]] });
    const cast = castOffers(s, "fof").find((a) => a.targets?.[0]?.id === "paci");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    const paci = one(s, "user", "Pacifism");
    expect(paci.id).not.toBe("paci");
    expect(paci.attachedTo).toBe(one(s, "ai", "Hill Giant").id);
  });
});

describe("runtime — Planar Incision (the enters-with counter)", () => {
  it("⭐ the opponent's tapped Sol Ring returns untapped under its owner's control with a +1/+1 counter on it", () => {
    let s = table({ user: [...lands("i", "Island", "U", 2)], ai: [["ring", SOL_RING, { tapped: true }]], userHand: [["pi", PLANAR_INCISION]] });
    const cast = castOffers(s, "pi").find((a) => a.targets?.[0]?.id === "ring");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    const ring = one(s, "ai", "Sol Ring");
    expect(ring.id).not.toBe("ring");
    expect(ring.tapped).toBeFalsy();
    expect(ring.counters).toEqual({ "+1/+1": 1 });
  });
  it("⭐ its own damaged Grizzly Bears comes back a fresh 3/3 — the old damage gone, one counter", () => {
    let s = table({ user: [...lands("i", "Island", "U", 2), ["bears", BEARS, { damage: 1, counters: { "-1/-1": 1 } }]], userHand: [["pi", PLANAR_INCISION]] });
    const cast = castOffers(s, "pi").find((a) => a.targets?.[0]?.id === "bears");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    const bears = one(s, "user", "Grizzly Bears");
    expect(bears.counters).toEqual({ "+1/+1": 1 });
    expect(bears.damageMarked || 0).toBe(0);
  });
  it("⭐ the return puts the counter on (CR 614.1c, 122.6), so a counter replacement applies — Hardened Scales adds one more", () => {
    let s = table({ user: [...lands("i", "Island", "U", 2), ["scales", HARDENED_SCALES], ["bears", BEARS]], userHand: [["pi", PLANAR_INCISION]] });
    const cast = castOffers(s, "pi").find((a) => a.targets?.[0]?.id === "bears");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    expect(one(s, "user", "Grizzly Bears").counters).toEqual({ "+1/+1": 2 });
  });
  it("a token target is gone for good — it ceases to exist in exile and gets no counter (the rulings, CR 111.8)", () => {
    const TOKEN = { ...creature("Soldier", "Token Creature — Soldier", "", 0, "1", "1", ["W"], [], ""), token: true };
    let s = table({ user: [...lands("i", "Island", "U", 2), ["tok", TOKEN]], userHand: [["pi", PLANAR_INCISION]] });
    const cast = castOffers(s, "pi").find((a) => a.targets?.[0]?.id === "tok");
    expect(cast).toBeTruthy();
    s = passToResolution(dispatchAction(s, cast));
    expect(named(s, "user", "Soldier")).toHaveLength(0);
  });
});

describe("runtime — the activated carriers", () => {
  it("⭐ Eldrazi Displacer: never itself; the opponent's untapped creature returns TAPPED under its owner's control", () => {
    let s = table({ user: [["disp", ELDRAZI_DISPLACER], ["ring", SOL_RING], ["p0", basic("Plains", "W")], ["bears", BEARS]], ai: [["giant", HILL_GIANT]] });
    const offers = activations(s, "disp");
    expect([...new Set(offers.map((a) => a.targets?.[0]?.id))].sort()).toEqual(["bears", "giant"]);
    s = passToResolution(dispatchAction(s, offers.find((a) => a.targets?.[0]?.id === "giant")));
    const giant = one(s, "ai", "Hill Giant");
    expect(giant.id).not.toBe("giant");
    expect(giant.tapped).toBe(true);
  });
  it("⭐ Distinguished Conjurer: never itself, never the opponent's; the Wall draws again and the Conjurer's own watcher gains 1 life", () => {
    let s = table({ user: [["conj", DISTINGUISHED_CONJURER], ...lands("p", "Plains", "W", 5), ["wall", WALL_OF_OMENS]], ai: [["giant", HILL_GIANT]] });
    const offers = activations(s, "conj");
    expect([...new Set(offers.map((a) => a.targets?.[0]?.id))]).toEqual(["wall"]);
    const life = s.players.user.life;
    s = passToResolution(dispatchAction(s, offers[0]));
    expect(one(s, "user", "Wall of Omens").id).not.toBe("wall");
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.life).toBe(life + 1);
  });
  it("Nephalia Smuggler returns the card under YOUR control; Lilysplash Mentor's comes back with a +1/+1 counter", () => {
    let s = table({ user: [["neph", NEPHALIA_SMUGGLER], ...lands("i", "Island", "U", 4), ["bears", BEARS]] });
    const neph = activations(s, "neph").find((a) => a.targets?.[0]?.id === "bears");
    expect(neph).toBeTruthy();
    s = passToResolution(dispatchAction(s, neph));
    expect(one(s, "user", "Grizzly Bears").id).not.toBe("bears");
    let t = table({ user: [["lily", LILYSPLASH_MENTOR], ["f0", basic("Forest", "G")], ...lands("i", "Island", "U", 2), ["bears", BEARS]] });
    const offers = activations(t, "lily");
    expect([...new Set(offers.map((a) => a.targets?.[0]?.id))]).toEqual(["bears"]);
    t = passToResolution(dispatchAction(t, offers[0]));
    expect(one(t, "user", "Grizzly Bears").counters).toEqual({ "+1/+1": 1 });
  });
});

describe("classifier — the whole cards play", () => {
  it("⭐ the ranked carriers and their twins are native", () => {
    expect(classifyCard(RESTORATION_ANGEL)).toBe("native-trigger");
    expect(classifyCard(FELIDAR_GUARDIAN)).toBe("native-trigger");
    expect(classifyCard(WISPWEAVER_ANGEL)).toBe("native-trigger");
    expect(classifyCard(FLICKER_OF_FATE)).toBe("native-spell");
    expect(classifyCard(PLANAR_INCISION)).toBe("native-spell");
    expect(classifyCard(SPACESHIFT)).toBe("native-spell");
    for (const c of [ELDRAZI_DISPLACER, DISTINGUISHED_CONJURER, NEPHALIA_SMUGGLER, LILYSPLASH_MENTOR]) {
      expect(classifyCard(c), c.name).toMatch(/^native-/);
    }
  });
});
