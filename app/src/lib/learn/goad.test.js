/**
 * goad.test.js — GOAD (CR 701.38): "It attacks each combat if able and attacks a player other than you if
 * able." The Impetus cycle, Bloodthirsty Blade, Redemption Arc and friends — fourteen attached carriers,
 * none native before, and ZERO engine infrastructure: goad appeared nowhere in the codebase.
 *
 * ⓘ MEASURED +2 (Shiny Impetus, Coercive Impetus), and the small number is the honest one. The other
 * twelve are blocked by lines that have nothing to do with goad — Psychic Impetus by its scry trigger,
 * Bloodthirsty Blade by its "{1}: Attach to target creature", Eye of Nidhogg by a type-change. The
 * subsystem is what shipped here; those carriers arrive as their own blockers fall.
 *
 * ⭐ GOAD IS TWO RULES AND THIS SHIPS BOTH, because shipping one would be worse than shipping neither:
 * a creature that is forced to attack but free to choose its victim isn't goaded, it's just angry, and the
 * card would be credited for a political effect it doesn't have.
 *   · "attacks each combat if able" → the `mustAttack` pseudo-keyword, already enforced layer-aware in the
 *     AI attack planner. Reused wholesale; nothing new was built for this half.
 *   · "attacks a player other than YOU if able" → the `goaded` keyword plus layers.goaderControllersOf.
 *
 * ⛔ "YOU" IS THE GOADER, NOT THE CONTROLLER — the asymmetry IS the mechanic, and a plain keyword read
 * cannot express it. You put Bloodthirsty Blade on an OPPONENT's creature; it then has to swing at one of
 * the OTHER opponents. So each live grant is resolved back to the controller of the effect's SOURCE (the
 * Aura/Equipment), through the same gate-aware layer-6 index permanentHasKeyword walks — the two halves
 * can never be live for one and stale for the other. It returns a SET: two opponents can goad the same
 * creature, and it must then avoid both if it can.
 *
 * ⛔⛔ "IF ABLE", NOT "NEVER" — the trap this entire feature turns on, and the reason it was scoped as a
 * subsystem rather than a slice. If the goader is the ONLY player the creature can attack, it MUST STILL
 * ATTACK THEM. An unconditional filter produces a creature carrying a must-attack requirement that attacks
 * nobody: an illegal board state, a FALSE POSITIVE, not a safe miss. The filter therefore applies only when
 * it leaves at least one option. Driven both ways below — the second row is the one that matters.
 *
 * ⓘ Two-player is vacuous (the sole opponent IS the goader, and hasDefenderChoice is false there anyway),
 * so the restriction is multiplayer-only — exactly where goad is printed to matter.
 *
 * ⓘ The parser side is a WRAPPER, not a ninth attached-clause regex: "is goaded" bolts onto nearly every
 * other attached shape ("+2/+2 and is goaded", "has indestructible and is goaded", "+1/+1, has deathtouch,
 * and is goaded"), so the tail is stripped, the HEAD goes through the ordinary reducer unchanged, and the
 * grants are appended. All-or-nothing survives: a head the reducer can't model returns null and the whole
 * bonus drops (Eye of Nidhogg's type-change, The Sound of Drums' damage redirection stay parked).
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * defender filter removed -> the goaded creature attacks its goader while every parser pin stays green
 * (the exact half-credit this file exists to prevent); the `goaded` grant removed from the wrapper ->
 * the carriers park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { pickAttackPlan } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { goaderControllersOf, permanentHasKeyword } from "./layers.js";
import { parseAuraBonus } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ⛔ FIXTURE PROVENANCE MATTERS HERE. The obvious fixture for the bare "gets +2/+2 and is goaded" shape is
// Mark of the Rani — and in this corpus that name resolves to a **token** entry (layout "token", commander
// legality not_legal). It classifies happily, but tier-snapshot's isRealCard correctly excludes it, so
// building the pins on it would have "proven" a flip the measurement instrument refuses to count. These two
// are real, Commander-legal cards, and they are the two the flip-diff actually credited.
const SHINY_IMPETUS = { id: "c-si", name: "Shiny Impetus", type: "Enchantment — Aura", mana: "{2}{R}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" };
const COERCIVE_IMPETUS = { id: "c-ci", name: "Coercive Impetus", type: "Enchantment — Aura", mana: "{2}{B}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you draw a card and lose 1 life." };
const EYE_OF_NIDHOGG = { id: "c-en", name: "Eye of Nidhogg", type: "Enchantment — Aura", mana: "{3}{B}",
  oracle: "Enchant creature\nEnchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded." };

describe("the parser: goad composes onto the shapes already modelled", () => {
  it("⭐ both halves are granted, alongside the pump", () => {
    for (const card of [SHINY_IMPETUS, COERCIVE_IMPETUS]) {
      expect((parseAuraBonus(card) || []).map((e) => e.op?.keyword || e.op?.layerOp))
        .toEqual(["ptModify", "mustAttack", "goaded"]);
      // native-TRIGGER, not native-aura: both carry an attack trigger alongside the bonus.
      expect(classifyCard(card)).toBe("native-trigger");
    }
  });

  it("⛔ all-or-nothing survives the wrapper — an unmodelled head drops the WHOLE bonus", () => {
    // Appending goad to a half-parsed head would be exactly the silent partial this parser refuses
    // everywhere else: the creature would be goaded but not a 4/2 flying deathtouch Dragon.
    expect(parseAuraBonus(EYE_OF_NIDHOGG)).toEqual([]);
    expect(classifyCard(EYE_OF_NIDHOGG)).toBe("body-only");
  });
});

describe("⭐ LAW 6 — a 4-player board, which is the only place goad's asymmetry is visible", () => {
  // ai1 controls the goaded Bear. Each seat in `goaders` owns an Aura on it.
  function board({ goaders }) {
    const goaded = createPermanent({ id: "gd", card: { id: "b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai1", summoningSick: false });
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const players = { ...g.players };
    goaded.attachments = [];
    const auraPerms = [];
    for (const seat of goaders) {
      const id = `aura-${seat}`;
      const a = createPermanent({ id, card: { ...SHINY_IMPETUS, id: `c-si-${seat}` }, controller: seat });
      a.attachedTo = "gd";                 // both sides of the link — createPermanent ignores attachedTo
      goaded.attachments.push(id);
      auraPerms.push([seat, a]);
    }
    for (const seat of ["user", "ai1", "ai2", "ai3"]) {
      players[seat] = { ...g.players[seat], battlefield: seat === "ai1" ? [goaded] : [], life: 20 };
    }
    // ⛔ Each Aura sits on ITS OWN controller's battlefield — that is what makes goaderControllersOf
    // resolve to different players, and it is the whole point: you goad an OPPONENT'S creature.
    for (const [seat, a] of auraPerms) players[seat] = { ...players[seat], battlefield: [...players[seat].battlefield, a] };
    return { ...g, activePlayer: "ai1", priorityHolder: "ai1", phase: "combat", step: "declare-attackers", turn: 5, players };
  }
  const planFor = (s) => pickAttackPlan(s, "ai1", legalActionsForPlayer(s, "ai1").filter((a) => a.kind === "declare-attacker"));

  it("⭐ the goaded creature swings at SOMEONE ELSE, not at the player who goaded it", () => {
    const s = board({ goaders: ["user"] });
    const row = {
      goadedBy: [...goaderControllersOf(s, "gd")],
      mustAttack: permanentHasKeyword(s, "gd", "mustAttack"),
      attacksSeat: planFor(s).map((a) => a.defenderId),
    };
    console.log("  WITNESS", JSON.stringify(row)); // printed — a broken harness reads as a uniform negative
    expect(row.goadedBy).toEqual(["user"]);        // the AURA's controller, NOT the creature's
    expect(row.mustAttack).toBe(true);
    expect(row.attacksSeat).toHaveLength(1);
    expect(row.attacksSeat[0]).not.toBe("user");
    expect(["ai2", "ai3"]).toContain(row.attacksSeat[0]);
  });

  it("⛔⛔ GOADED BY EVERYONE, IT MUST STILL ATTACK SOMEBODY — 'if able', not 'never'", () => {
    // Every opponent of ai1 (user, ai2, ai3) has an Aura on the Bear, so EVERY available defender is a
    // goader and the filtered pool is empty. An unconditional filter would leave a creature carrying a
    // must-attack requirement with nowhere legal to swing — it would attack nobody. That is an illegal
    // board state and a FALSE POSITIVE, not a safe miss. The fallback must hand back the unfiltered list.
    const s = board({ goaders: ["user", "ai2", "ai3"] });
    const goadedBy = [...goaderControllersOf(s, "gd")].sort();
    const seats = planFor(s).map((a) => a.defenderId);
    console.log("  WITNESS", JSON.stringify({ goadedBy, attacksSeat: seats }));
    expect(goadedBy).toEqual(["ai2", "ai3", "user"]);   // a SET — three separate goaders, all live
    expect(seats).toHaveLength(1);
    expect(["user", "ai2", "ai3"]).toContain(seats[0]); // it attacks SOMEONE rather than nobody
  });
});
