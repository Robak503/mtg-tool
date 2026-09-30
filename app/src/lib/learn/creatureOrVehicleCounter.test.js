/**
 * creatureOrVehicleCounter.test.js — CV-2: "put a +1/+1 counter on target creature or Vehicle".
 * Seven-Tail Mentor, Grafted Growth, Light the Way, Perilous Snare.
 *
 * ⭐ THE COUNTER LANE'S IGNITION for a predicate CV-1 already lit on the removal lane. `creatureOrVehicle`
 * and its whole enumeration path exist; the counter matchers simply never emitted the targetType. CR 301.7
 * is why the union is not redundant phrasing: an UNCREWED Vehicle is not a creature, so this reaches a
 * permanent the plain `creature` targetType cannot — which is the entire reason the cards print it.
 *
 * ⛔⛔ THE YOU-CONTROL FORM IS THE DANGEROUS ONE, AND IT CARRIES A RESTRICTION RATHER THAN A DEDICATED
 * targetType. `creatureOrVehicle` routes through `addPermanents`, which enforces the full restriction set
 * via creatureSatisfiesRestrictions — so a `controller: you` restriction is honoured there. Without it the
 * card would offer an OPPONENT's Vehicle: an illegal target, the forbidden direction. The pool row below
 * names the opponent's Vehicle as the excluded permanent for exactly that reason, and a board with nothing
 * wrong to offer would have proved nothing.
 *
 * ⛔ ADDED AS SEPARATE ANCHORED MATCHERS rather than by widening the noun group in the two incumbents.
 * Those are `$`-anchored and feed DIFFERENT targetTypes ("creature" and "creatureYouControl"); folding a
 * third noun into either would route the union through a branch that enumerates creatures ONLY — the
 * silent do-nothing this project has shipped before. The incumbent rows below are asserted byte-identical.
 *
 * ⚠️ PERILOUS SNARE WAS NOT IN THE CEILING PROBE'S PREDICTED SET and flipped anyway — its Max-speed
 * activated ability carries the clause. Audited whole-card like the rest: the "Max speed —" gate is real
 * and enforced (legalChoices withholds the ability below speed 4), and the ETB exile-until is modeled. A
 * gained row nobody predicted is exactly the kind that must not be waved through on the strength of the
 * three that were.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the you-control matcher's `restrictions` dropped -> Seven-Tail Mentor STILL classifies native while
 *     the pool gains the OPPONENT's Vehicle and creature. The tier cannot see this one; only the pool row can.
 *   · both new matchers removed -> all four park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";

beforeEach(() => _resetIdsForTests());

const SEVEN_TAIL_MENTOR = { id: "c-stm", name: "Seven-Tail Mentor", type: "Creature — Fox Samurai", mana: "{3}{W}", power: "2", toughness: "3",
  oracle: "When this creature enters or dies, put a +1/+1 counter on target creature or Vehicle you control." };
const GRAFTED_GROWTH = { id: "c-gg", name: "Grafted Growth", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant land\nWhen this Aura enters, put a +1/+1 counter on target creature or Vehicle you control.\nEnchanted land has \"{T}: Add two mana of any one color.\"" };
const LIGHT_THE_WAY = { id: "c-ltw", name: "Light the Way", type: "Instant", mana: "{W}",
  oracle: "Choose one —\n• Put a +1/+1 counter on target creature or Vehicle. Untap it.\n• Return target permanent you control to its owner's hand." };

describe("the carriers", () => {
  it("⭐ all three flip native", () => {
    for (const c of [SEVEN_TAIL_MENTOR, GRAFTED_GROWTH, LIGHT_THE_WAY]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  // ⛔ THE PRIOR TESTS PROVED THE POOL AND NEVER RESOLVED — and the resolver dropped every pick: the union enumerates through
  // addPermanents, which tags a pick type:"permanent", and applyAddCounter placed counters only on type:"creature". These
  // cards classified native and put no counter anywhere until shelf D6 (2026-09-30). This row resolves.
  it("⭐⭐ the counter LANDS — Seven-Tail Mentor enters and a +1/+1 counter is placed on a creature or Vehicle you control", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const vehicle = createPermanent({ id: "veh", controller: "user", summoningSick: false, card: { id: "c-veh", name: "Test Vehicle", type: "Artifact — Vehicle", power: 3, toughness: 3, oracle: "", colors: [] } });
    const st = { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [vehicle], graveyard: [{ ...SEVEN_TAIL_MENTOR, id: "stm" }] } } };
    let { state } = enterCardFromZone(st, { playerId: "user", cardId: "stm", fromZone: "graveyard" });
    state = flushTriggers(state, { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 5 && state.stack.length; i++) state = resolveTopOfStack(state);
    const placed = state.players.user.battlefield.reduce((n, p) => n + (p.counters?.["+1/+1"] || 0), 0);
    expect(placed).toBe(1);
  });

  it("⭐⭐ the parsed atoms — the union, its scope, the rider, and the UNCHANGED incumbents", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      bare: p("put a +1/+1 counter on target creature or vehicle"),
      youControl: p("put a +1/+1 counter on target creature or vehicle you control"),
      // Light the Way's mode carries a trailing "Untap it." — the rider must SURVIVE, bound to the same
      // chosen target. A counter atom alone here would be the card reading native with half its text dead.
      withUntapRider: p("put a +1/+1 counter on target creature or vehicle. untap it"),
      // ⛔ REGRESSION GUARD — two anchored matchers already ran on these strings.
      incumbentBare: p("put a +1/+1 counter on target creature"),
      incumbentYouControl: p("put a +1/+1 counter on target creature you control"),
    };
    console.log("  WITNESS creatureOrVehicleCounter", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.bare).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureOrVehicle" }]);
    expect(row.youControl).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureOrVehicle",
      restrictions: [{ kind: "controller", who: "you" }] }]);
    expect(row.withUntapRider).toEqual([
      { op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureOrVehicle" },
      { op: "untap", bindPreviousTargets: true },
    ]);
    expect(row.incumbentBare).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature" }]);
    expect(row.incumbentYouControl).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl" }]);
  });
});

describe("⭐⭐ LAW 6 — the enumerated pools, with the opponent's Vehicle named", () => {
  it("⭐⭐ 'you control' excludes the OPPONENT's Vehicle, and the bare form reaches both sides", () => {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, type, ctl) => createPermanent({ id, controller: ctl, summoningSick: false,
      card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle: "", colors: ["W"] } });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [
          mk("MY_CRE", "Creature — Bear", "user"),
          mk("MY_VEHICLE", "Artifact — Vehicle", "user"),
          mk("MY_ARTIFACT", "Artifact", "user"),
        ] },
        ai1: { ...s.players.ai1, battlefield: [
          mk("OPP_CRE", "Creature — Bear", "ai1"),
          mk("OPP_VEHICLE", "Artifact — Vehicle", "ai1"),
        ] } } };
    const pool = (restrictions) => enumerateTargets(st, "user", { targetType: "creatureOrVehicle", restrictions }, []).map((t) => t.id).sort();
    const row = { youControl: pool([{ kind: "controller", who: "you" }]), bare: pool([]) };
    console.log("  WITNESS creatureOrVehicleCounterPools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // ⛔ OPP_VEHICLE and OPP_CRE absent — that exclusion IS the restriction doing its job.
      // ⛔ MY_ARTIFACT absent too: the union widens to Vehicles, never to artifacts generally.
      youControl: ["MY_CRE", "MY_VEHICLE"],
      // The control: unrestricted, both sides appear — so the row above is a filter, not an empty board.
      bare: ["MY_CRE", "MY_VEHICLE", "OPP_CRE", "OPP_VEHICLE"],
    });
  });
});
