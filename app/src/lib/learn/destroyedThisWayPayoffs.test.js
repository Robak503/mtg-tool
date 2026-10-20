/**
 * "… FOR EACH <PERMANENT> DESTROYED THIS WAY" beyond "destroy all creatures" (the play-weighted slice, 2026-10-18) — Fumigate's
 * reader (wipeReaders.test.js) took one set and two payoffs; the most-played carrier it missed is a creature's enters trigger:
 *
 *   Bane of Progress (EDHREC #1239) — "When this creature enters, destroy all artifacts and enchantments. Put a +1/+1 counter on
 *                                      this creature for each permanent destroyed this way."
 *   Whiptongue Hydra (#7125)        — "destroy all creatures with flying. Put a +1/+1 counter on this creature for each creature
 *                                      destroyed this way."
 *   Fracturing Gust (#15381)        — "Destroy all artifacts and enchantments. You gain 2 life for each permanent destroyed this way."
 *   Paraselene, Multani's Decree    — "Destroy all enchantments. You gain N life for each enchantment destroyed this way."
 *   Righteous Fury                  — "Destroy all tapped creatures. You gain 2 life for each creature destroyed this way."
 *
 * Bane of Progress's rulings (the same as Fumigate's): "If an artifact or enchantment isn't destroyed (perhaps because it has
 * indestructible or it regenerated), it won't count toward the number of +1/+1 counters …. However, if an artifact or enchantment is
 * destroyed but doesn't go to its owner's graveyard due to a replacement effect (like the one Rest in Peace creates), it will
 * count." and "Bane of Progress's ability destroys all artifacts and enchantments, including those you control." The count is the
 * destroy's own (CR 701.8a; indestructible CR 702.12b); the destroy set is the one the destroy sentence already reads.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (generated from the bundled Scryfall data) ──────────────
const BANE_OF_PROGRESS = {"name":"Bane of Progress","type":"Creature — Elemental","mana":"{4}{G}{G}","cmc":6,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"When this creature enters, destroy all artifacts and enchantments. Put a +1/+1 counter on this creature for each permanent destroyed this way."}; // body-only on f71c2a49
const WHIPTONGUE_HYDRA = {"name":"Whiptongue Hydra","type":"Creature — Lizard Hydra","mana":"{5}{G}","cmc":6,"power":"4","toughness":"4","keywords":["Reach"],"colors":["G"],"oracle":"Reach\nWhen this creature enters, destroy all creatures with flying. Put a +1/+1 counter on this creature for each creature destroyed this way."}; // body-only on f71c2a49
const FRACTURING_GUST = {"name":"Fracturing Gust","type":"Instant","mana":"{2}{G/W}{G/W}{G/W}","cmc":5,"keywords":[],"colors":["G","W"],"oracle":"Destroy all artifacts and enchantments. You gain 2 life for each permanent destroyed this way."}; // arbiter-spell on f71c2a49
const PARASELENE = {"name":"Paraselene","type":"Sorcery","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Destroy all enchantments. You gain 1 life for each enchantment destroyed this way."}; // arbiter-spell on f71c2a49
const MULTANI_S_DECREE = {"name":"Multani's Decree","type":"Sorcery","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"Destroy all enchantments. You gain 2 life for each enchantment destroyed this way."}; // arbiter-spell on f71c2a49
const RIGHTEOUS_FURY = {"name":"Righteous Fury","type":"Sorcery","mana":"{4}{W}{W}","cmc":6,"keywords":[],"colors":["W"],"oracle":"Destroy all tapped creatures. You gain 2 life for each creature destroyed this way."}; // arbiter-spell on f71c2a49
const DEATH_BEGETS_LIFE = {"name":"Death Begets Life","type":"Sorcery","mana":"{5}{B}{G}{U}","cmc":8,"keywords":[],"colors":["B","G","U"],"oracle":"Destroy all creatures and enchantments. Draw a card for each permanent destroyed this way."}; // arbiter-spell on f71c2a49
const ORI_PLATE_STACKER = {"name":"Ori, Plate Stacker","type":"Legendary Creature — Dwarf Bard","mana":"{5}{W}{W}","cmc":7,"power":"3","toughness":"3","keywords":[],"colors":["W"],"oracle":"When Ori enters, destroy all artifacts and enchantments your opponents control. You gain 1 life for each permanent destroyed this way."}; // body-only on f71c2a49
const FUMIGATE = {"name":"Fumigate","type":"Sorcery","mana":"{3}{W}{W}","cmc":5,"keywords":[],"colors":["W"],"oracle":"Destroy all creatures. You gain 1 life for each creature destroyed this way."}; // native-spell on f71c2a49
const DARKSTEEL_INGOT = {"name":"Darksteel Ingot","type":"Artifact","mana":"{3}","cmc":3,"keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Effects that say \"destroy\" don't destroy this artifact.)\n{T}: Add one mana of any color."}; // native-mana on f71c2a49
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana on f71c2a49
const INTANGIBLE_VIRTUE = {"name":"Intangible Virtue","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Creature tokens you control get +1/+1 and have vigilance."}; // native-static on f71c2a49
const DARKSTEEL_MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // native-body on f71c2a49
const SERRA_ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"colors":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"}; // native-body on f71c2a49
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body on f71c2a49

// ─── harness ──────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ ...card, id });
const LIB = (n, who) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${who}-lib${i}` }));
function board({ user = [], ai = [], hand = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, library: LIB(10, "u"), manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: [], library: LIB(10, "a") } } };
}
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
function cast(s, cardId) {
  const offer = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(offer).toBeTruthy();
  return dispatchAction(s, offer);
}
/** Cast the creature, resolve it, then let its enters trigger go on the stack and resolve. */
const castAndSettle = (s, cardId) => settle(resolveTopOfStack(cast(s, cardId)));
const ids = (s, who) => s.players[who].battlefield.map((p) => p.id).sort();
const onBattlefield = (s, name) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.card?.name === name);
const errors = (s) => (s.log || []).filter((e) => e.kind === "stack-resolve-error");

describe("the cards and their parse", () => {
  it("⭐ classify: Bane of Progress and Whiptongue Hydra native-trigger; Fracturing Gust, Paraselene, Multani's Decree and Righteous Fury native-spell; Death Begets Life (creatures and enchantments) and Ori (\"your opponents control\") stay parked; Fumigate unchanged", () => {
    const row = Object.fromEntries(Object.entries({ BANE_OF_PROGRESS, WHIPTONGUE_HYDRA, FRACTURING_GUST, PARASELENE, MULTANI_S_DECREE, RIGHTEOUS_FURY, DEATH_BEGETS_LIFE, ORI_PLATE_STACKER, FUMIGATE }).map(([k, c]) => [k, classifyCard(c)]));
    expect(row).toEqual({
      BANE_OF_PROGRESS: "native-trigger", WHIPTONGUE_HYDRA: "native-trigger", FRACTURING_GUST: "native-spell", PARASELENE: "native-spell", MULTANI_S_DECREE: "native-spell", RIGHTEOUS_FURY: "native-spell",
      DEATH_BEGETS_LIFE: "arbiter-spell", ORI_PLATE_STACKER: "body-only", FUMIGATE: "native-spell",
    });
  });

  it("the programs: the destroy records what it destroyed, the payoff counts it; the destroy is the one the destroy sentence parses to", () => {
    const fg = parseEffectProgram(FRACTURING_GUST);
    const rf = parseEffectProgram(RIGHTEOUS_FURY);
    const bane = parseEffectClause("destroy all artifacts and enchantments. Put a +1/+1 counter on this creature for each permanent destroyed this way", "Instant", { sourceScoped: true });
    expect({ fg: [programConfidence(fg), fg.atoms], rf: rf.atoms[0], bane: [programConfidence(bane), bane.atoms] }).toEqual({
      fg: ["high", [{ op: "destroy", targetType: "eachArtifactOrEnchantment", recordDestroyedThisWay: true }, { op: "gain-life", amountCount: { kind: "destroyedThisWay", per: 2 }, targetType: null }]],
      rf: { op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "tapped", value: true }], recordDestroyedThisWay: true },
      bane: ["high", [{ op: "destroy", targetType: "eachArtifactOrEnchantment", recordDestroyedThisWay: true }, { op: "add-counter", counterType: "+1/+1", target: "self", countFor: { kind: "destroyedThisWay" } }]],
    });
  });

  it("CONTROL — the counted noun must cover the destroyed set; an unread set, another payoff or the payoff alone stays unparsed", () => {
    const atoms = (clause) => parseEffectClause(clause, "Sorcery")?.atoms ?? [];
    expect({
      narrower: atoms("Destroy all artifacts and enchantments. You gain 1 life for each artifact destroyed this way."),
      otherNoun: atoms("Destroy all enchantments. You gain 1 life for each creature destroyed this way."),
      twoTypes: atoms("Destroy all creatures and enchantments. Draw a card for each permanent destroyed this way."),
      loseLife: atoms("Destroy all enchantments. Each opponent loses 1 life for each enchantment destroyed this way."),
      counterOnOther: atoms("Destroy all enchantments. Put a +1/+1 counter on target creature for each enchantment destroyed this way."),
      payoffAlone: atoms("Put a +1/+1 counter on this creature for each permanent destroyed this way."),
    }).toEqual({ narrower: [], otherNoun: [], twoTypes: [], loseLife: [], counterOnOther: [], payoffAlone: [] });
  });
});

describe("⭐ Bane of Progress — cast, enters, its trigger resolved", () => {
  it("⭐ destroys every artifact and enchantment on both sides and grows by the number destroyed — not the indestructible Ingot (the ruling)", () => {
    const s0 = board({ hand: [H("bane", BANE_OF_PROGRESS)], pool: { G: 6 },
      user: [P("ring", SOL_RING), P("virtue", INTANGIBLE_VIRTUE)],
      ai: [P("ingot", DARKSTEEL_INGOT, "ai"), P("aring", SOL_RING, "ai"), P("bears", GRIZZLY_BEARS, "ai")] });
    const s = castAndSettle(s0, "bane");
    const bane = onBattlefield(s, "Bane of Progress");
    expect({ user: ids(s, "user").filter((id) => id !== bane?.id), ai: ids(s, "ai"), counters: bane?.counters?.["+1/+1"] ?? 0, errors: errors(s).length })
      .toEqual({ user: [], ai: ["bears", "ingot"], counters: 3, errors: 0 });
  });

  it("an indestructible artifact creature survives and does not count; nothing to destroy, no counters", () => {
    const myr = castAndSettle(board({ hand: [H("bane", BANE_OF_PROGRESS)], pool: { G: 6 }, ai: [P("myr", DARKSTEEL_MYR, "ai")] }), "bane");
    const none = castAndSettle(board({ hand: [H("bane", BANE_OF_PROGRESS)], pool: { G: 6 }, ai: [P("bears", GRIZZLY_BEARS, "ai")] }), "bane");
    expect({ myr: [ids(myr, "ai"), onBattlefield(myr, "Bane of Progress")?.counters?.["+1/+1"] ?? 0], none: onBattlefield(none, "Bane of Progress")?.counters?.["+1/+1"] ?? 0 })
      .toEqual({ myr: [["myr"], 0], none: 0 });
  });
});

describe("⭐ Whiptongue Hydra — only flyers, and it has reach", () => {
  it("⭐ destroys the Serra Angel, not the Hill Giant; one counter", () => {
    const s0 = board({ hand: [H("hydra", WHIPTONGUE_HYDRA)], pool: { G: 6 }, ai: [P("angel", SERRA_ANGEL, "ai"), P("giant", HILL_GIANT, "ai")] });
    const s = castAndSettle(s0, "hydra");
    expect({ ai: ids(s, "ai"), counters: onBattlefield(s, "Whiptongue Hydra")?.counters?.["+1/+1"] ?? 0 }).toEqual({ ai: ["giant"], counters: 1 });
  });
});

describe("⭐ the spells", () => {
  it("⭐ Fracturing Gust: 2 life for each artifact and enchantment destroyed (four of five — the Ingot stays)", () => {
    const s0 = board({ hand: [H("gust", FRACTURING_GUST)], pool: { G: 3, W: 2 }, user: [P("ring", SOL_RING), P("virtue", INTANGIBLE_VIRTUE)], ai: [P("aring", SOL_RING, "ai"), P("avirtue", INTANGIBLE_VIRTUE, "ai"), P("ingot", DARKSTEEL_INGOT, "ai")] });
    const out = resolveTopOfStack(cast(s0, "gust"));
    expect({ gain: out.players.user.life - 20, ai: ids(out, "ai"), user: ids(out, "user") }).toEqual({ gain: 8, ai: ["ingot"], user: [] });
  });

  it("⭐ Paraselene: 1 life for each enchantment, the artifacts untouched", () => {
    const s0 = board({ hand: [H("para", PARASELENE)], pool: { W: 3 }, user: [P("virtue", INTANGIBLE_VIRTUE), P("ring", SOL_RING)], ai: [P("avirtue", INTANGIBLE_VIRTUE, "ai")] });
    const out = resolveTopOfStack(cast(s0, "para"));
    expect({ gain: out.players.user.life - 20, user: ids(out, "user"), ai: ids(out, "ai") }).toEqual({ gain: 2, user: ["ring"], ai: [] });
  });

  it("⭐ Righteous Fury: only the tapped creatures, 2 life each", () => {
    const s0 = board({ hand: [H("fury", RIGHTEOUS_FURY)], pool: { W: 6 }, user: [P("bears", GRIZZLY_BEARS, "user", { tapped: true })], ai: [P("giant", HILL_GIANT, "ai", { tapped: true }), P("angel", SERRA_ANGEL, "ai")] });
    const out = resolveTopOfStack(cast(s0, "fury"));
    expect({ gain: out.players.user.life - 20, user: ids(out, "user"), ai: ids(out, "ai"), giant: !!findPermanent(out, "giant") }).toEqual({ gain: 4, user: [], ai: ["angel"], giant: false });
  });
});
