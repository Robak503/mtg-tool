/**
 * selfNoUntapCreditParity.test.js — the self no-untap static must be credited in EVERY residue path (slice 16).
 *
 * The runtime honors "This <permanent> doesn't untap during your untap step." — gameState.selfPreventsUntap
 * skips the source at its untap step. The metric stripped it in exactly ONE residue path
 * (permanentTriggersCovered's inline chain), so a card whose other text was a modeled TRIGGER flipped while
 * the identical card with a modeled ACTIVATED ability parked, and the static ALONE didn't even read as a
 * native body. That was a path accident, not a rule: nothing about the static depends on what else the card
 * does.
 *
 * The three paths now share stripModeledSelfNoUntap, so they cannot drift apart again — which is the actual
 * fix; the four cards are a side effect.
 *
 * FOUND BY the census's own reading habit: "this creature doesn't untap during your untap step" appeared as a
 * SOLE blocker on cards whose runtime support was already built. An obviously-modeled shape in that column is
 * a defect report.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, stripModeledSelfNoUntap } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, untapAll } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const STATIC = "This creature doesn't untap during your untap step.";
const golem = (oracle, name = "T") => ({ name, type: "Artifact Creature — Golem", mana: "{4}", power: 3, toughness: 3, oracle });

describe("PARITY — the same static, credited the same way, whatever else the card does", () => {
  it("alone → the card is a native body", () => {
    expect(classifyCard(golem(STATIC))).toBe("native-body");
  });
  it("with a modeled ACTIVATED ability → native-activated (this is the path that used to park)", () => {
    expect(classifyCard(golem(`${STATIC}\n{2}: This creature gets +1/+1 until end of turn.`))).toBe("native-activated");
  });
  it("with a modeled TRIGGER → native-trigger (unchanged — this path always worked)", () => {
    expect(classifyCard(golem(`${STATIC}\nWhen this creature enters, draw a card.`))).toBe("native-trigger");
  });
  it("the LEGACY name-templated printing is credited too (CR 201.4 self-reference)", () => {
    expect(classifyCard(golem("Mana Vault doesn't untap during your untap step.\n{2}: This creature gets +1/+1 until end of turn.", "Mana Vault"))).toBe("native-activated");
  });
});

describe("CREED — the helper's anchors mirror selfPreventsUntap, including what it REFUSES", () => {
  it("the ATTACHED form is a different runtime path and is NOT credited here", () => {
    expect(stripModeledSelfNoUntap("Enchanted creature doesn't untap during your untap step.", "Aura"))
      .toContain("Enchanted creature doesn't untap");
    expect(classifyCard({ name: "A", type: "Enchantment — Aura", mana: "{U}",
      oracle: "Enchant creature\nEnchanted creature doesn't untap during your untap step." })).not.toMatch(/^native/);
  });

  it("the 'your NEXT untap step' wording is refused — the runtime never applies it", () => {
    // A one-shot rider on a mana ability (the Cloudcrest Lake slow-dual family) with no runtime lane.
    // Crediting it would claim a drawback the engine silently ignores.
    expect(stripModeledSelfNoUntap("This land doesn't untap during your next untap step.", "Cloudcrest Lake"))
      .toContain("next untap step");
    expect(classifyCard({ name: "Cloudcrest Lake", type: "Land",
      oracle: "{T}: Add {C}.\n{T}: Add {W} or {U}. This land doesn't untap during your next untap step." })).not.toMatch(/^native/);
  });

  it("a DIFFERENT permanent's no-untap static is untouched (only SELF is credited)", () => {
    const other = "Creatures your opponents control don't untap during their untap steps.";
    expect(stripModeledSelfNoUntap(other, "T")).toBe(other);
  });

  it("the helper is a no-op on text that doesn't carry it", () => {
    expect(stripModeledSelfNoUntap("Flying\nWhen this creature enters, draw a card.", "T"))
      .toBe("Flying\nWhen this creature enters, draw a card.");
  });
});

describe("RUNTIME — the flip is EARNED: both halves of the untap-tax card really work", () => {
  /**
   * Crediting the static claims the engine plays these cards faithfully, so both halves are proven here
   * rather than inferred from the parse: the permanent must STAY tapped through its untap step, and its
   * escape ability must actually untap it. (This pin also carries the evidence that graduated Phyrexian
   * Colossus's park in evasionMinBlockers.test.js.)
   */
  const DC = { id: "c-dc", name: "Depth Charge Colossus", type: "Artifact Creature — Construct", mana: "{8}",
    power: 8, toughness: 8, oracle: "This creature doesn't untap during your untap step.\n{3}: Untap this creature." };

  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const dc = createPermanent({ id: "dc", card: DC, controller: "user", summoningSick: false });
    const isl = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...dc, tapped: true }, isl("i1"), isl("i2"), isl("i3")] } } };
  }
  const dcOf = (s) => s.players.user.battlefield.find((p) => p.id === "dc");

  it("the untap step does NOT untap it — the static is really enforced", () => {
    expect(dcOf(untapAll(board(), { playerId: "user" })).tapped).toBe(true);
  });

  it("the escape ability is offered, resolves, and leaves it untapped", () => {
    let s = board();
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "dc");
    expect(offers).toHaveLength(1);
    s = dispatchAction(s, offers[0]);
    expect(s.stack).toHaveLength(1);
    let guard = 0;
    while (s.stack.length && guard++ < 8) s = resolveTopOfStack(s);
    expect(dcOf(s).tapped).toBe(false);
  });

  it("a SACRIFICE-cost escape is gated on having fodder (the cost is charged, not waived)", () => {
    const CB = { id: "c-cb", name: "Chained Brute", type: "Creature — Beast", mana: "{5}", power: 5, toughness: 5,
      oracle: "This creature doesn't untap during your untap step.\n{1}, Sacrifice another creature: Untap this creature. Activate only during your turn." };
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const brute = { ...createPermanent({ id: "cb", card: CB, controller: "user", summoningSick: false }), tapped: true };
    const mtn = (id) => createPermanent({ id, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false });
    const base = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 3 };
    const offers = (st) => legalActionsForPlayer(st, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "cb");

    const alone = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [brute, mtn("m1"), mtn("m2")] } } };
    expect(offers(alone)).toHaveLength(0);   // nothing to sacrifice → not offered

    const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const fed = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [brute, bear, mtn("m1"), mtn("m2")] } } };
    expect(offers(fed)).toHaveLength(1);
  });
});
