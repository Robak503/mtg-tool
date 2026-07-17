/**
 * grantAuraCast.test.js — the GRANT-AURA CAST lane (BLITZ TS-1, CR 303.4).
 *
 * The grant-aura families — granted-activated (Squirrel Nest / Tin Street Market / Hermetic Study),
 * granted-mana (Settlement / Gift of Paradise), granted-triggered (Sixth Sense), aura-own-activated
 * (Freed from the Real) — were fully modeled ON the battlefield (grantedActivatedForHost /
 * grantedManaSpecsFor / triggersForEvent all enumerate on the host), but their CAST had no branch:
 * legalChoices' aura branches (isNativeAura = the creature-bonus lane; isNativeManaAura = the Wild
 * Growth boost lane) never claimed them, so the cast fell to the no-target push and the dispatcher
 * routed it to the Arbiter seam — a native-tier card whose cast never attached natively.
 *
 * This slice wires the lane end-to-end on ONE shared gate (coverage.grantAuraCastHostType): legalChoices
 * offers one cast per legal host (creature hosts per the enchant subject; land hosts own-only, the
 * mana-boost lane's useful-subset precedent), the dispatcher routes AURA_ETB with the host type stamped
 * on the serializable payload, and the resolver's CR 608.2b re-check requires that host type.
 *
 * CREED: the gate stands on the SAME classifyCard tier the metric awards (all-or-nothing per card), so a
 * body-only aura's cast still routes to the Arbiter — never a partially-modeled attach.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard, grantAuraCastHostType } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle texts (bundled Scryfall, probed 2026-07-17).
const TIN_STREET_MARKET = { name: "Tin Street Market", type: "Enchantment — Aura", mana: "{2}{R}", oracle: 'Enchant land\nEnchanted land has "{T}, Discard a card: Draw a card."' };
const SQUIRREL_NEST = { name: "Squirrel Nest", type: "Enchantment — Aura", mana: "{1}{G}{G}", oracle: 'Enchant land\nEnchanted land has "{T}: Create a 1/1 green Squirrel creature token."' };
const HERMETIC_STUDY = { name: "Hermetic Study", type: "Enchantment — Aura", mana: "{2}{U}", oracle: 'Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."' };
const GIFT_OF_PARADISE = { name: "Gift of Paradise", type: "Enchantment — Aura", mana: "{2}{G}", oracle: 'Enchant land\nWhen this Aura enters, you gain 3 life.\nEnchanted land has "{T}: Add two mana of any one color."' };
const WILD_GROWTH = { name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };
const CHAMBER_OF_MANIPULATION = { name: "Chamber of Manipulation", type: "Enchantment — Aura", mana: "{2}{U}{U}", oracle: 'Enchant land\nEnchanted land has "{T}, Discard a card: Gain control of target creature until end of turn."' };

/** Main-phase state: the caster holds `handCards`, controls a Forest + a Bear; the opponent a Forest + a Goblin. */
function stateWith(handCards, { userHandExtras = [] } = {}) {
  const land = createPermanent({ id: "land", card: { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "user" });
  const crea = createPermanent({ id: "crea", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const oppLand = createPermanent({ id: "oppland", card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "({T}: Add {R}.)" }, controller: "ai" });
  const oppCrea = createPermanent({ id: "oppcrea", card: { name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
  const base = createGameState({ userDeck: [{ name: "Top", type: "Instant", oracle: "" }], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...base.players,
      user: { ...base.players.user, battlefield: [land, crea], hand: [...handCards.map((c, i) => ({ id: `h${i}`, ...c })), ...userHandExtras], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } },
      ai: { ...base.players.ai, battlefield: [oppLand, oppCrea], life: 20 },
    },
  };
}
const castsOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const landActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "land");

describe("grantAuraCastHostType — the single offer/dispatch gate", () => {
  it("land-host grant auras → { host: 'land', ownOnly: true }", () => {
    expect(grantAuraCastHostType(TIN_STREET_MARKET)).toEqual({ host: "land", ownOnly: true });
    expect(grantAuraCastHostType(SQUIRREL_NEST)).toEqual({ host: "land", ownOnly: true });
    expect(grantAuraCastHostType(GIFT_OF_PARADISE)).toEqual({ host: "land", ownOnly: true });
  });
  it("creature-host grant aura → { host: 'creature', ownOnly: false }; 'you control' subject → ownOnly", () => {
    expect(grantAuraCastHostType(HERMETIC_STUDY)).toEqual({ host: "creature", ownOnly: false });
    expect(grantAuraCastHostType({ name: "OwnOnly", type: "Enchantment — Aura", oracle: 'Enchant creature you control\nEnchanted creature has "{T}: Draw a card."' }))
      .toEqual({ host: "creature", ownOnly: true });
  });
  it("lanes with their OWN cast branch stay out (byte-identity): Wild Growth = the mana-boost lane", () => {
    expect(grantAuraCastHostType(WILD_GROWTH)).toBeNull();
  });
  it("CREED — a body-only aura (unmodeled granted effect) is never offered: Chamber of Manipulation", () => {
    expect(classifyCard(CHAMBER_OF_MANIPULATION)).toBe("body-only");
    expect(grantAuraCastHostType(CHAMBER_OF_MANIPULATION)).toBeNull();
  });
  it("CREED — an unmodeled enchant subject fails closed", () => {
    expect(grantAuraCastHostType({ name: "OppOnly", type: "Enchantment — Aura", oracle: 'Enchant creature an opponent controls\nEnchanted creature has "{T}: Draw a card."' })).toBeNull();
  });
});

describe("cast → attach (the lane end-to-end)", () => {
  it("Squirrel Nest: one cast per OWN land (never the opponent's), attaches to the chosen land", () => {
    const s = stateWith([SQUIRREL_NEST]);
    const offers = castsOf(s, "h0");
    expect(offers).toHaveLength(1);
    expect(offers[0].isAuraSpell).toBe(true);
    expect(offers[0].targets.map((t) => t.id)).toEqual(["land"]); // own Forest only — oppland never offered
    let d = dispatchAction(s, offers[0]);
    d = resolveTopOfStack(d);
    const aura = d.players.user.battlefield.find((p) => p.card?.name === "Squirrel Nest");
    expect(aura?.attachedTo).toBe("land");
    expect(d.players.user.battlefield.find((p) => p.id === "land").attachments).toContain(aura.id);
  });

  it("Hermetic Study (creature host): offers every battlefield creature; attaches", () => {
    const s = stateWith([HERMETIC_STUDY]);
    const offers = castsOf(s, "h0");
    expect(offers.map((a) => a.targets[0].id).sort()).toEqual(["crea", "oppcrea"]); // bare "Enchant creature" — any battlefield creature
    const own = offers.find((a) => a.targets[0].id === "crea");
    let d = dispatchAction(s, own);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.card?.name === "Hermetic Study")?.attachedTo).toBe("crea");
  });

  it("Gift of Paradise: attaches AND its own ETB fires (gain 3 life through the enterPermanent chokepoint)", () => {
    const s = stateWith([GIFT_OF_PARADISE]);
    const offers = castsOf(s, "h0");
    expect(offers).toHaveLength(1);
    let d = dispatchAction(s, offers[0]);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.card?.name === "Gift of Paradise")?.attachedTo).toBe("land");
    // The ETB trigger is pending/flushed through the normal flush — resolve it.
    while (d.stack.length || (d.pendingTriggers || []).length) d = resolveTopOfStack(d);
    expect(d.players.user.life).toBe(s.players.user.life + 3);
  });

  it("CR 608.2b re-check: the chosen LAND gone at resolution → the Aura fizzles to its owner's graveyard", () => {
    const s = stateWith([SQUIRREL_NEST]);
    const offers = castsOf(s, "h0");
    let d = dispatchAction(s, offers[0]);
    // The land leaves in response (state surgery — the re-check is what's under test).
    d = { ...d, players: { ...d.players, user: { ...d.players.user, battlefield: d.players.user.battlefield.filter((p) => p.id !== "land") } } };
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.card?.name === "Squirrel Nest")).toBeUndefined();
    expect(d.players.user.graveyard.map((c) => c.name)).toContain("Squirrel Nest");
  });

  it("CREED — Chamber of Manipulation (body-only) still gets NO targeted aura cast", () => {
    const s = stateWith([CHAMBER_OF_MANIPULATION]);
    const offers = castsOf(s, "h0");
    expect(offers.every((a) => !a.isAuraSpell)).toBe(true); // the Arbiter-seam posture, unchanged
  });
});

describe("TS-1 — Tin Street Market end-to-end (the enchanted-land discard-cost activation)", () => {
  const PITCH_A = { id: "pA", name: "Pitch A", type: "Sorcery", oracle: "" };
  const PITCH_B = { id: "pB", name: "Pitch B", type: "Sorcery", oracle: "" };

  function attached(handExtras) {
    const s = stateWith([TIN_STREET_MARKET], { userHandExtras: handExtras });
    let d = dispatchAction(s, castsOf(s, "h0")[0]);
    return resolveTopOfStack(d);
  }

  it("the granted ability enumerates ON THE LAND — one action per DISTINCT hand card to pitch", () => {
    const d = attached([PITCH_A, PITCH_B]);
    const acts = landActs(d);
    expect(acts.map((a) => a.discardCardName).sort()).toEqual(["Pitch A", "Pitch B"]);
    expect(acts.every((a) => a.tapSelf)).toBe(true); // the LAND taps for the {T}
  });

  it("activating DISCARDS the chosen card from the activator's hand and draws on resolution", () => {
    const d = attached([PITCH_A]);
    const act = landActs(d).find((a) => a.discardCardId === "pA");
    expect(act).toBeTruthy();
    let r = dispatchAction(d, act);
    // CR 601.2h — the cost is paid at activation, BEFORE the ability resolves.
    expect(r.players.user.hand.find((c) => c.id === "pA")).toBeUndefined();
    expect(r.players.user.graveyard.map((c) => c.id)).toContain("pA");
    expect(r.players.user.battlefield.find((p) => p.id === "land").tapped).toBe(true);
    const hand0 = r.players.user.hand.length;
    r = resolveTopOfStack(r);
    expect(r.players.user.hand.length).toBe(hand0 + 1); // drew
  });

  it("REFUSED with an empty hand — the discard cost can't be paid, so nothing is offered", () => {
    const d = attached([]);
    expect(landActs(d)).toHaveLength(0);
  });

  it("the grant LIFTS when the Aura leaves the battlefield", () => {
    const d = attached([PITCH_A]);
    expect(landActs(d).length).toBeGreaterThan(0);
    const aura = d.players.user.battlefield.find((p) => p.card?.name === "Tin Street Market");
    const gone = {
      ...d,
      players: {
        ...d.players,
        user: {
          ...d.players.user,
          battlefield: d.players.user.battlefield
            .filter((p) => p.id !== aura.id)
            .map((p) => (p.id === "land" ? { ...p, attachments: [] } : p)),
        },
      },
    };
    expect(landActs(gone)).toHaveLength(0);
  });
});
