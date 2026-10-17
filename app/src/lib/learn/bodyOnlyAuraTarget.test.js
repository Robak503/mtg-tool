/**
 * bodyOnlyAuraTarget.test.js — EVERY AURA SPELL TARGETS A HOST ITS ENCHANT ABILITY ALLOWS, MODELED OR NOT (2026-10-17).
 *
 * "An Aura spell requires a target, which is defined by its enchant ability." (CR 303.4a) "Aura spells are always targeted. …
 * The target is chosen as the spell is cast" (CR 115.1b, 601.2c), and the enchant ability restricts what an Aura spell can
 * target (CR 702.5a). The modeled Aura lanes (Animate Dead, the native and Ordeal Auras, the mana-boost and granted-ability
 * Auras, every Aura that enchants a player) offered one cast per legal host. Every other Aura — 600-odd cards whose text the
 * engine doesn't fully model, 420-odd of them "Enchant creature" — fell through to the plain no-target permanent cast: offered
 * with NO target, cast that way by the AI, routed to the Arbiter no-op, and gone from every zone when it resolved.
 *
 * Now such an Aura is offered once per legal host (auraSpellHost.bodyOnlyAuraHosts — the cast enumeration over the Enchant
 * line's host spec, narrowed to the permanents it may enchant at all) and resolves through AURA_ETB onto that host, where its
 * unmodeled text stays inert (the body-only posture). No legal host, no cast; an Enchant line the engine can't read, no cast; a
 * cost the lane doesn't pay ({X}, an additional cost), no cast. The dispatcher refuses a cast that names no legal host. A
 * transform card is judged by its front face (CR 712.8a): a creature front with an Aura back (Accursed Witch, Binding Geist)
 * is cast as the creature and enters as one — it used to vanish too.
 *
 * The house AI places one by auraCastIntent (harmful → the biggest enemy creature, helpful → its own best), and holds one whose
 * side that reading can't tell.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier, unchanged by
 * this slice). Every case runs through the engine's own entry points: legalActionsForPlayer, dispatchAction, passPriority,
 * pickAction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const SPECTRAL_STEEL = {"name":"Spectral Steel","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2.\n{1}{W}, Exile this card from your graveyard: Return another target Aura or Equipment card from your graveyard to your hand."}; // body-only
const WORLD_WEARY = {"name":"World-Weary","type":"Enchantment — Aura","mana":"{3}{B}{B}","cmc":5,"keywords":["Landcycling","Enchant","Basic landcycling","Typecycling","Cycling"],"colors":["B"],"oracle":"Enchant creature\nEnchanted creature gets -4/-4.\nBasic landcycling {1}{B} ({1}{B}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)"}; // body-only
const ANGELIC_DESTINY = {"name":"Angelic Destiny","type":"Enchantment — Aura","mana":"{2}{W}{W}","cmc":4,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.\nWhen enchanted creature dies, return this card to its owner's hand."}; // body-only
const CURSED_LAND = {"name":"Cursed Land","type":"Enchantment — Aura","mana":"{2}{B}{B}","cmc":4,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant land\nAt the beginning of the upkeep of enchanted land's controller, this Aura deals 1 damage to that player."}; // body-only
const DYING_WISH = {"name":"Dying Wish","type":"Enchantment — Aura","mana":"{1}{B}","cmc":2,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature you control\nWhen enchanted creature dies, target player loses X life and you gain X life, where X is its power."}; // body-only
const REALITY_ACID = {"name":"Reality Acid","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Vanishing","Enchant"],"colors":["U"],"oracle":"Enchant permanent\nVanishing 3 (This Aura enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this Aura leaves the battlefield, enchanted permanent's controller sacrifices it."}; // body-only
const BORN_TO_DRIVE = {"name":"Born to Drive","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"keywords":["Enchant","Channel"],"colors":["W"],"oracle":"Enchant artifact or creature\nAs long as enchanted permanent is a creature, it gets +1/+1 for each creature and/or Vehicle you control.\nChannel — {2}{W}, Discard this card: Create two 1/1 colorless Pilot creature tokens with \"This token crews Vehicles as though its power were 2 greater.\""}; // body-only
const ON_THIN_ICE = {"name":"On Thin Ice","type":"Snow Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant snow land you control\nWhen this Aura enters, exile target creature an opponent controls until this Aura leaves the battlefield."}; // native-trigger
const MECHANIZED_PRODUCTION = {"name":"Mechanized Production","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant artifact you control\nAt the beginning of your upkeep, create a token that's a copy of enchanted artifact. Then if you control eight or more artifacts with the same name as one another, you win the game."}; // body-only
const BETRAYAL = {"name":"Betrayal","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature an opponent controls\nWhenever enchanted creature becomes tapped, you draw a card."}; // body-only
const CHAINED_TO_THE_ROCKS = {"name":"Chained to the Rocks","type":"Enchantment — Aura","mana":"{W}","cmc":1,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant Mountain you control\nWhen this Aura enters, exile target creature an opponent controls until this Aura leaves the battlefield. (That creature returns under its owner's control.)"}; // native-trigger
const ROWANS_TALENT = {"name":"Rowan's Talent","type":"Enchantment — Aura","mana":"{2}{R}{R}","cmc":4,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant planeswalker\nEnchanted planeswalker has \"[+1]: Up to one target creature gets +2/+0 and gains first strike and trample until end of turn.\"\nWhenever you activate a loyalty ability of enchanted planeswalker, copy that ability. You may choose new targets for the copy."}; // body-only
const TAUGHT_BY_SERRA = {"name":"Taught by Serra","type":"Enchantment — Aura","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Commander enchantment (This aura enchants a commander creature, and remains attached to the creature as it moves between any face-up zones. You can cast it on a Commander in your command zone.)\nWhen you cast Taught by Serra, draw a card.\nEnchanted creature has flying and vigilance."}; // body-only
const SOULMATES = {"name":"Soulmates","type":"Enchantment — Aura","mana":"{2}{G}","cmc":3,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant two creatures\nEnchanted creatures each get +1/+1 and have hexproof.\nWhen one of the enchanted creatures dies, destroy the other."}; // body-only
const ENTHRALLING_HOLD = {"name":"Enthralling Hold","type":"Enchantment — Aura","mana":"{3}{U}{U}","cmc":5,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou can't choose an untapped creature as this spell's target as you cast it.\nYou control enchanted creature."}; // body-only
const ENDLESS_SCREAM = {"name":"Endless Scream","type":"Enchantment — Aura","mana":"{X}{B}","cmc":1,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature\nThis Aura enters with X scream counters on it.\nEnchanted creature gets +1/+0 for each scream counter on this Aura."}; // body-only
const GRAFTED_IDENTITY = {"name":"Grafted Identity","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"As an additional cost to cast this spell, sacrifice a creature.\nEnchant creature\nYou control enchanted creature.\nEnchanted creature gets +1/+1."}; // body-only
const ACCURSED_WITCH = {"name":"Accursed Witch // Infectious Curse","type":"Creature — Human Shaman // Enchantment — Aura Curse","mana":"{3}{B}","cmc":4,"power":"4","toughness":"2","keywords":["Transform","Enchant"],"colors":[],"layout":"transform","oracle":"Accursed Witch - Creature — Human Shaman {3}{B}\nSpells your opponents cast that target this creature cost {1} less to cast.\nWhen this creature dies, return it to the battlefield transformed under your control attached to target opponent.\n//\nInfectious Curse - Enchantment — Aura Curse \nEnchant player\nSpells you cast that target enchanted player cost {1} less to cast.\nAt the beginning of enchanted player's upkeep, that player loses 1 life and you gain 1 life."}; // body-only
const BINDING_GEIST = {"name":"Binding Geist // Spectral Binding","type":"Creature — Spirit // Enchantment — Aura","mana":"{2}{U}","cmc":3,"power":"3","toughness":"1","keywords":["Transform","Enchant","Disturb"],"colors":[],"layout":"transform","oracle":"Binding Geist - Creature — Spirit {2}{U}\nWhenever this creature attacks, target creature an opponent controls gets -2/-0 until end of turn.\nDisturb {1}{U} (You may cast this card from your graveyard transformed for its disturb cost.)\n//\nSpectral Binding - Enchantment — Aura \nEnchant creature\nEnchanted creature gets -2/-0.\nIf Spectral Binding would be put into a graveyard from anywhere, exile it instead."}; // body-only
const RADIANT_GRACE = {"name":"Radiant Grace // Radiant Restraints","type":"Enchantment — Aura // Enchantment — Aura Curse","mana":"{W}","cmc":1,"keywords":["Transform","Enchant"],"colors":[],"layout":"transform","oracle":"Radiant Grace - Enchantment — Aura {W}\nEnchant creature\nEnchanted creature gets +1/+0 and has vigilance.\nWhen enchanted creature dies, return this card to the battlefield transformed under your control attached to target opponent.\n//\nRadiant Restraints - Enchantment — Aura Curse \nEnchant player\nCreatures enchanted player controls enter tapped."}; // body-only
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const PARADOX_HAZE = {"name":"Paradox Haze","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant player\nAt the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step."}; // body-only
const WHITE_KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"}; // native-body
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["B"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)"}; // native-body
const GLADECOVER_SCOUT = {"name":"Gladecover Scout","type":"Creature — Elf Scout","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":["Hexproof"],"colors":["G"],"oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)"}; // native-body
const AZORIUS_FIRST_WING = {"name":"Azorius First-Wing","type":"Creature — Griffin","mana":"{W}{U}","cmc":2,"power":"2","toughness":"2","keywords":["Flying","Protection"],"colors":["U","W"],"oracle":"Flying, protection from enchantments"}; // native-body
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const SNOW_COVERED_PLAINS = {"name":"Snow-Covered Plains","type":"Basic Snow Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const FULL_POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** The everyday board: ai1 (the caster) a Bears; ai2 a Bears and a Forest; ai3 a Hill Giant and Sol Ring; nobody else anything. */
const BOARD = () => ({ ai1: [P("b1", GRIZZLY_BEARS, "ai1")], ai2: [P("b2", GRIZZLY_BEARS, "ai2"), P("f2", FOREST, "ai2")], ai3: [P("g3", HILL_GIANT, "ai3"), P("r3", SOL_RING, "ai3")] });

/** A four-seat pod (user → ai1 → ai2 → ai3) in ai1's precombat main phase; ai1 holds `aura` (id "aura1") and a full pool. */
function pod({ aura, boards = BOARD(), hand = null, pool = FULL_POOL } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: [], library: library(pid) };
  }
  players.ai1 = { ...players.ai1, hand: hand || (aura ? [{ ...aura, id: "aura1" }] : []), manaPool: { ...players.ai1.manaPool, ...pool } };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "ai1", priorityHolder: "ai1", consecutivePasses: 0 };
}

const auraOffers = (s, pid = "ai1") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === "aura1");
/** Each offer as what it targets: "<target type> <id>", or "NO TARGET". */
const offerShape = (a) => ((a.targets || []).length ? a.targets.map((t) => `${t.type} ${t.id}`).join(" + ") : "NO TARGET");
const shapes = (s) => auraOffers(s).map(offerShape).sort();
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
/** Where a card is after the stack settles: "<seat>.<zone>", with the host for an attached permanent. */
function whereIs(s, name) {
  const out = [];
  for (const [pid, p] of Object.entries(s.players)) {
    for (const zone of ["hand", "battlefield", "graveyard", "exile", "library"]) {
      for (const o of p[zone] || []) {
        const n = o.card?.name ?? o.name;
        if (n === name) out.push(`${pid}.${zone}${o.attachedTo ? ` on ${o.attachedTo}` : ""}`);
      }
    }
  }
  return out;
}
/** The offered cast targeting `id` — asserted present, so a missing offer fails as an assertion. */
function offerOn(s, id) {
  const offer = auraOffers(s).find((a) => a.targets?.[0]?.id === id);
  expect(offer, `a cast targeting ${id}`).toBeDefined();
  return offer;
}
const castOn = (s, id) => resolveStack(dispatchAction(s, offerOn(s, id)));
/** The AI's pick for ai1, as what it did with the Aura: "<target type> <id>", "NO TARGET", or "held". */
function aiPick(s) {
  const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
  if (pick?.kind !== "cast-spell" || pick.cardId !== "aura1") return "held";
  return offerShape(pick);
}
function codeOf(fn) {
  try { fn(); } catch (e) { return e.code || e.message; }
  return "no throw";
}

describe("the offer — every cast of an Aura names exactly one host its enchant ability allows (CR 303.4a, 115.1b, 702.5a)", () => {
  it("⭐ Spectral Steel (body-only \"Enchant creature\"): one cast per creature on any battlefield — never a land, never targetless", () => {
    const offers = auraOffers(pod({ aura: SPECTRAL_STEEL }));
    expect(offers.map(offerShape).sort()).toEqual(["creature b1", "creature b2", "creature g3"]);
    expect(offers.every((a) => a.isAuraSpell && a.needsTargets && a.targets.length === 1)).toBe(true);
  });

  it("⭐ Cursed Land (body-only \"Enchant land\"): one cast per land on any battlefield, whoever controls it — never a creature", () => {
    const boards = { ...BOARD(), ai1: [P("b1", GRIZZLY_BEARS, "ai1"), P("m1", MOUNTAIN, "ai1")] };
    expect(shapes(pod({ aura: CURSED_LAND, boards }))).toEqual(["permanent f2", "permanent m1"]);
  });

  it("the other subjects the host readers list: \"creature you control\" (Dying Wish) the caster's own; \"permanent\" (Reality Acid) every permanent; \"artifact or creature\" (Born to Drive) no land", () => {
    expect({
      dyingWish: shapes(pod({ aura: DYING_WISH })),
      realityAcid: shapes(pod({ aura: REALITY_ACID })),
      bornToDrive: shapes(pod({ aura: BORN_TO_DRIVE })),
    }).toEqual({
      dyingWish: ["creature b1"],
      realityAcid: ["permanent b1", "permanent b2", "permanent f2", "permanent g3", "permanent r3"],
      bornToDrive: ["permanent b1", "permanent b2", "permanent g3", "permanent r3"],
    });
  });

  it("⭐ typed hosts the cast side reads exactly: On Thin Ice its controller's snow lands; Mechanized Production its controller's artifacts; Betrayal an opponent's creatures; Chained to the Rocks its controller's Mountains", () => {
    const boards = {
      ai1: [P("b1", GRIZZLY_BEARS, "ai1"), P("s1", SNOW_COVERED_PLAINS, "ai1"), P("f1", FOREST, "ai1"), P("m1", MOUNTAIN, "ai1"), P("r1", SOL_RING, "ai1")],
      ai2: [P("b2", GRIZZLY_BEARS, "ai2"), P("s2", SNOW_COVERED_PLAINS, "ai2"), P("m2", MOUNTAIN, "ai2"), P("r2", SOL_RING, "ai2")],
    };
    expect({
      onThinIce: shapes(pod({ aura: ON_THIN_ICE, boards })),
      mechanized: shapes(pod({ aura: MECHANIZED_PRODUCTION, boards })),
      betrayal: shapes(pod({ aura: BETRAYAL, boards })),
      chained: shapes(pod({ aura: CHAINED_TO_THE_ROCKS, boards })),
    }).toEqual({ onThinIce: ["permanent s1"], mechanized: ["permanent r1"], betrayal: ["creature b2"], chained: ["permanent m1"] });
  });

  it("⭐ no legal host, no cast (CR 303.4a): Spectral Steel with no creature anywhere; Cursed Land with no land; Mechanized Production when only an opponent has an artifact", () => {
    const noCreature = { ai2: [P("f2", FOREST, "ai2")], ai3: [P("r3", SOL_RING, "ai3")] };
    const noLand = { ai2: [P("b2", GRIZZLY_BEARS, "ai2")] };
    expect({
      steel: shapes(pod({ aura: SPECTRAL_STEEL, boards: noCreature })),
      cursedLand: shapes(pod({ aura: CURSED_LAND, boards: noLand })),
      mechanized: shapes(pod({ aura: MECHANIZED_PRODUCTION })),
    }).toEqual({ steel: [], cursedLand: [], mechanized: [] });
  });

  it("⭐ an Enchant line the engine can't read is never offered: Rowan's Talent (planeswalker), Taught by Serra (none), Soulmates (two creatures), Enthralling Hold (a target rule past its Enchant line)", () => {
    const rows = [ROWANS_TALENT, TAUGHT_BY_SERRA, SOULMATES, ENTHRALLING_HOLD].map((aura) => [aura.name, shapes(pod({ aura }))]);
    expect(Object.fromEntries(rows)).toEqual(Object.fromEntries(rows.map(([n]) => [n, []])));
  });

  it("an additional cost the lane doesn't pay is not offered: Grafted Identity (sacrifice a creature) — never cast for less than printed", () => {
    expect(shapes(pod({ aura: GRAFTED_IDENTITY }))).toEqual([]);
  });

  it("⭐ an {X} Aura is offered once per affordable X ≥ 1 per host (CR 107.3a): Endless Scream with {B} + 3 spare mana, X = 1–3 on each creature, X counted in the mana value on the stack (CR 202.3e)", () => {
    const s = pod({ aura: ENDLESS_SCREAM, pool: { B: 1, C: 3 } });
    const offers = auraOffers(s);
    expect(offers.map((a) => `X=${a.xValue} ${offerShape(a)} mv${a.cmc}`).sort()).toEqual([1, 2, 3].flatMap((x) => ["b1", "b2", "g3"].map((id) => `X=${x} creature ${id} mv${1 + x}`)).sort());
    const cast = dispatchAction(s, offers.find((a) => a.xValue === 3 && a.targets[0].id === "b1"));
    expect({ x: cast.stack[cast.stack.length - 1]?.xValue, pool: cast.players.ai1.manaPool.B + cast.players.ai1.manaPool.C })
      .toEqual({ x: 3, pool: 0 });
    expect(whereIs(resolveStack(cast), "Endless Scream")).toEqual(["ai1.battlefield on b1"]);
  });

  it("a free cast runs the same lane: Spectral Steel and Endless Scream found by discover are offered free on each creature — Endless Scream at X = 0, the only legal X for a free cast (CR 107.3b)", () => {
    const found = (aura) => {
      const base = pod({ hand: [] });
      return auraOffers({ ...base, players: { ...base.players, ai1: { ...base.players.ai1, exile: [{ ...aura, id: "aura1" }] } }, pendingDiscover: { controller: "ai1", cardId: "aura1" } });
    };
    const steel = found(SPECTRAL_STEEL);
    const scream = found(ENDLESS_SCREAM);
    expect({ steel: steel.map(offerShape).sort(), scream: scream.map(offerShape).sort(), free: [...steel, ...scream].every((a) => a.freeCast), screamX: scream.map((a) => a.xValue ?? 0) })
      .toEqual({ steel: ["creature b1", "creature b2", "creature g3"], scream: ["creature b1", "creature b2", "creature g3"], free: true, screamX: [0, 0, 0] });
  });

  it("targeting narrows the hosts: black World-Weary skips White Knight (protection from black), ai2's hexproof Gladecover Scout and Azorius First-Wing (protection from enchantments); its caster's own Scout stays", () => {
    const boards = {
      ai1: [P("own", GLADECOVER_SCOUT, "ai1")],
      ai2: [P("wk", WHITE_KNIGHT, "ai2"), P("hx", GLADECOVER_SCOUT, "ai2"), P("fw", AZORIUS_FIRST_WING, "ai2"), P("b2", GRIZZLY_BEARS, "ai2")],
    };
    expect(shapes(pod({ aura: WORLD_WEARY, boards }))).toEqual(["creature b2", "creature own"]);
  });

  it("⭐ a transform Aura is read by its front face (CR 712.8a): Radiant Grace is offered once per creature — and is white there, so never on Black Knight (protection from white)", () => {
    // The bundled data gives a transform card empty top-level colours; the spell's are its front face's ({W}).
    const boards = { ...BOARD(), ai2: [P("b2", GRIZZLY_BEARS, "ai2"), P("bk", BLACK_KNIGHT, "ai2")] };
    expect(shapes(pod({ aura: RADIANT_GRACE, boards }))).toEqual(["creature b1", "creature b2", "creature g3"]);
  });
});

describe("resolution — the Aura enters attached to the host chosen as it was cast (CR 303.4b)", () => {
  it("⭐ Spectral Steel cast on ai1's Bears enters attached to it — on the battlefield, not gone, no Arbiter flag — and its modeled bonus applies", () => {
    const s = castOn(pod({ aura: SPECTRAL_STEEL }), "b1");
    const aura = s.players.ai1.battlefield.find((p) => p.card?.name === "Spectral Steel");
    expect({
      where: whereIs(s, "Spectral Steel"),
      hostAttachments: s.players.ai1.battlefield.find((p) => p.id === "b1").attachments,
      arbiter: s.pendingArbiter ?? null,
      pt: [permanentPower(s, "b1"), permanentToughness(s, "b1")],
    }).toEqual({ where: ["ai1.battlefield on b1"], hostAttachments: [aura?.id], arbiter: null, pt: [4, 4] });
  });

  it("⭐ Cursed Land cast on ai2's Forest enters under ai1's control attached to that land", () => {
    const s = castOn(pod({ aura: CURSED_LAND }), "f2");
    expect({ where: whereIs(s, "Cursed Land"), arbiter: s.pendingArbiter ?? null }).toEqual({ where: ["ai1.battlefield on f2"], arbiter: null });
  });

  it("Angelic Destiny (a line the engine doesn't model) and Born to Drive on an artifact attach and stay; Radiant Grace by its front face", () => {
    expect({
      destiny: whereIs(castOn(pod({ aura: ANGELIC_DESTINY }), "b1"), "Angelic Destiny"),
      drive: whereIs(castOn(pod({ aura: BORN_TO_DRIVE }), "r3"), "Born to Drive"),
      grace: whereIs(castOn(pod({ aura: RADIANT_GRACE }), "b2"), RADIANT_GRACE.name),
    }).toEqual({ destiny: ["ai1.battlefield on b1"], drive: ["ai1.battlefield on r3"], grace: ["ai1.battlefield on b2"] });
  });

  it("On Thin Ice attaches to its controller's snow land, and its modeled enters trigger exiles the opponent's creature", () => {
    const boards = { ai1: [P("s1", SNOW_COVERED_PLAINS, "ai1")], ai2: [P("b2", GRIZZLY_BEARS, "ai2")] };
    const s = castOn(pod({ aura: ON_THIN_ICE, boards }), "s1");
    expect({ ice: whereIs(s, "On Thin Ice"), bears: whereIs(s, "Grizzly Bears") }).toEqual({ ice: ["ai1.battlefield on s1"], bears: ["ai2.exile"] });
  });

  it("the chosen host leaves before it resolves: the spell doesn't resolve and goes to its owner's graveyard (CR 608.3b)", () => {
    const s0 = pod({ aura: SPECTRAL_STEEL });
    const cast = dispatchAction(s0, offerOn(s0, "b2"));
    const gone = { ...cast, players: { ...cast.players, ai2: { ...cast.players.ai2, battlefield: cast.players.ai2.battlefield.filter((p) => p.id !== "b2") } } };
    expect(whereIs(resolveStack(gone), "Spectral Steel")).toEqual(["ai1.graveyard"]);
  });

  it("the chosen host gains hexproof before it resolves: the target is illegal, the spell goes to its owner's graveyard and the host is untouched (CR 608.2b, 608.3b)", () => {
    const s0 = pod({ aura: WORLD_WEARY });
    const cast = dispatchAction(s0, offerOn(s0, "b2"));
    // b2 becomes a hexproof 1/1 in response (state surgery — the re-check is what's under test); attached, -4/-4 would kill it.
    const shielded = { ...cast, players: { ...cast.players, ai2: { ...cast.players.ai2, battlefield: cast.players.ai2.battlefield.map((p) => (p.id === "b2" ? { ...p, card: { ...p.card, ...GLADECOVER_SCOUT } } : p)) } } };
    const s = resolveStack(shielded);
    expect({ aura: whereIs(s, "World-Weary"), host: whereIs(s, "Gladecover Scout") }).toEqual({ aura: ["ai1.graveyard"], host: ["ai2.battlefield"] });
  });

  it("⭐ a creature front with an Aura back is cast as the creature (CR 712.8c): Accursed Witch and Binding Geist enter as creatures — they used to vanish", () => {
    const run = (card) => {
      const s0 = pod({ aura: card });
      const offers = auraOffers(s0);
      if (offers.length !== 1) return { offers: offers.map(offerShape) }; // one creature cast, or the shape below fails as an assertion
      const s = resolveStack(dispatchAction(s0, offers[0]));
      const perm = s.players.ai1.battlefield.find((p) => p.card?.name === card.name);
      return { offers: offers.map(offerShape), onBattlefield: !!perm, power: perm ? permanentPower(s, perm.id) : null, arbiter: s.pendingArbiter ?? null };
    };
    expect({ witch: run(ACCURSED_WITCH), geist: run(BINDING_GEIST) }).toEqual({
      witch: { offers: ["NO TARGET"], onBattlefield: true, power: 4, arbiter: null },
      geist: { offers: ["NO TARGET"], onBattlefield: true, power: 3, arbiter: null },
    });
  });
});

describe("the dispatcher refuses an Aura cast that names no legal host", () => {
  it("⭐ a hand-built Spectral Steel cast with no target, or aimed at a land, throws AURA_TARGET_REQUIRED (CR 303.4a)", () => {
    const s = pod({ aura: SPECTRAL_STEEL });
    const offer = offerOn(s, "b1");
    const bare = { ...offer, targets: [], needsTargets: false, targetName: undefined };
    const land = { ...offer, targets: [{ type: "permanent", id: "f2", controller: "ai2", name: "Forest" }], targetName: "Forest" };
    expect({ bare: codeOf(() => dispatchAction(s, bare)), land: codeOf(() => dispatchAction(s, land)) })
      .toEqual({ bare: "AURA_TARGET_REQUIRED", land: "AURA_TARGET_REQUIRED" });
  });

  it("World-Weary aimed at an opponent's hexproof creature throws too", () => {
    const s = pod({ aura: WORLD_WEARY, boards: { ...BOARD(), ai2: [P("hx", GLADECOVER_SCOUT, "ai2"), P("b2", GRIZZLY_BEARS, "ai2")] } });
    const offer = offerOn(s, "b2");
    const hexproof = { ...offer, targets: [{ type: "creature", id: "hx", controller: "ai2", name: "Gladecover Scout" }], targetName: "Gladecover Scout" };
    expect(codeOf(() => dispatchAction(s, hexproof))).toBe("AURA_TARGET_REQUIRED");
  });
});

describe("the AI places an Aura by what its bonus does, and holds one it can't read", () => {
  it("⭐ World-Weary (-4/-4) — the biggest enemy creature, never its own", () => {
    expect(aiPick(pod({ aura: WORLD_WEARY }))).toBe("creature g3");
  });

  it("⭐ Spectral Steel (+2/+2) — its own best creature", () => {
    const boards = { ...BOARD(), ai1: [P("b1", GRIZZLY_BEARS, "ai1"), P("g1", HILL_GIANT, "ai1")] };
    expect(aiPick(pod({ aura: SPECTRAL_STEEL, boards }))).toBe("creature g1");
  });

  it("⭐ held where the reading can't tell a side: Angelic Destiny (its bonus doesn't parse as a whole), Cursed Land", () => {
    expect({ destiny: aiPick(pod({ aura: ANGELIC_DESTINY })), cursedLand: aiPick(pod({ aura: CURSED_LAND })) }).toEqual({ destiny: "held", cursedLand: "held" });
  });

  it("the AI's cast resolves: World-Weary goes on ai3's Hill Giant and the Giant dies", () => {
    const s = pod({ aura: WORLD_WEARY });
    const pick = pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"), { archetype: "midrange" });
    expect(whereIs(resolveStack(dispatchAction(s, pick)), "Hill Giant")).toEqual(["ai3.graveyard"]);
  });
});

describe("controls — what was already right stays right", () => {
  it("Pacifism (native-aura) is offered once per creature and attaches; Paradox Haze (a player Aura) once per player and resolves onto it — this lane never claims either", () => {
    const outcome = (fn) => { try { return fn(); } catch (e) { return e.code || e.message; } }; // a refusal fails as an assertion, never a throw
    expect({
      pacifism: shapes(pod({ aura: PACIFISM })),
      pacifismResolved: outcome(() => whereIs(castOn(pod({ aura: PACIFISM }), "g3"), "Pacifism")),
      haze: shapes(pod({ aura: PARADOX_HAZE })),
      hazeResolved: outcome(() => castOn(pod({ aura: PARADOX_HAZE }), "ai2").players.ai1.battlefield.find((p) => p.card?.name === "Paradox Haze")?.enchantedPlayerId),
    }).toEqual({
      pacifism: ["creature b1", "creature b2", "creature g3"],
      pacifismResolved: ["ai1.battlefield on g3"],
      haze: ["player ai1", "player ai2", "player ai3", "player user"],
      hazeResolved: "ai2",
    });
  });

  it("the tiers don't move: an Aura attached with its text inert is not a modeled one", () => {
    expect([SPECTRAL_STEEL, CURSED_LAND, ANGELIC_DESTINY, MECHANIZED_PRODUCTION, ACCURSED_WITCH, BINDING_GEIST, ON_THIN_ICE, PACIFISM].map((c) => classifyCard(c)))
      .toEqual(["body-only", "body-only", "body-only", "body-only", "body-only", "body-only", "native-trigger", "native-aura"]);
  });
});
