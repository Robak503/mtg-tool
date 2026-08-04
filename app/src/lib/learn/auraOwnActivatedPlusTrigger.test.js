/**
 * auraOwnActivatedPlusTrigger.test.js — AU-ACT+TRIG: the aura-own ACTIVATED + aura-own TRIGGERED
 * composition (Fiery Mantle, Strands of Undeath), the last of the census's four two-flip leads.
 *
 * Fiery Mantle is Firebreathing (native-activated) plus one line — "When this Aura is put into a
 * graveyard from the battlefield, return it to its owner's hand." — and that line parked the whole
 * card. SIBLING ASYMMETRY, the cheapest signal in the runbook: a card penalized for having MORE text
 * whose extra line is independently modeled. The aura-own ACTIVATED lane's residue walk saw the
 * trigger as leftover; the aura-own TRIGGERED composition one lane over pairs a trigger with a STATIC
 * bonus (isNativeAura), which Fiery Mantle has none of. Each gate right alone; neither knew the
 * other's half was covered. A tier COMPOSITION failure, not a missing mechanic.
 *
 * COMPOSED, NOT LOOSENED: the non-trigger half (Enchant + activated lines) must pass
 * isNativeOwnActivatedAura on its own; the trigger half must pass permanentTriggersCovered on its own.
 *
 * ⭐ WHY THE RUNTIME BLOCK IS THE POINT. The sibling AU-GRANT+STATIC lane was once built, credited,
 * and REVERTED because both halves had been verified on text the composition INVENTED and neither on
 * the printed card — the runtime was dropping one half the whole time. So both halves here are driven
 * on the REAL oracle before the tier is claimed: the {R} pump is offered ON the Aura and takes the
 * host 2/2 -> 3/2, and the LTB self-return actually moves the card graveyard -> hand.
 *
 * ⚠️ A PROBE NOTE WORTH KEEPING (it cost time and looked exactly like a bug): a bare
 * `flushTriggers(state)` uses the DEFAULT first-legal target pick, so Strands of Undeath's "target
 * player discards two cards" chose its own controller and appeared to do nothing. The engine's real
 * path passes `{ chooseTargets: chooseTriggerTargets }`, which reads atom INTENT and targets an
 * opponent. Assert through the chooser the engine actually uses, or the test proves the wrong thing.
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read):
 *   • the activated-half revalidation forced true -> 2 red (the unmodeled-activated park + the
 *     static-line fall-through, which the composition would then wrongly claim);
 *   • the trigger-half revalidation forced true -> 1 red (the unrouted-trigger park);
 *   • the both-halves-non-empty guard dropped -> GREEN, across this file and auraOwnTriggered.test.js.
 *     Stated plainly rather than dressed up: that guard is DEFENSIVE AND UNREACHABLE TODAY, because a
 *     pure-activated Aura is already claimed by isNativeOwnActivatedAura and a pure-trigger Aura by
 *     isNativeOwnTriggeredAura, both EARLIER in the tier chain. It is kept as insurance against a lane
 *     reorder (the documented AU-3 tier-stealing hazard), not as a live gate. The tier-priority test
 *     below pins the ORDER those lanes depend on, which is the thing that actually protects them.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { permanentPower } from "./layers.js";
import { checkLeavesTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const FIERY_MANTLE = { id: "c-fm", name: "Fiery Mantle", type: "Enchantment — Aura", mana: "{1}{R}",
  oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
const STRANDS_OF_UNDEATH = { id: "c-su", name: "Strands of Undeath", type: "Enchantment — Aura", mana: "{3}{B}",
  oracle: "Enchant creature\nWhen this Aura enters, target player discards two cards.\n{B}: Regenerate enchanted creature." };
// The pure siblings whose tiers must NOT be stolen by the new composition.
const FIREBREATHING = { id: "c-fb", name: "Firebreathing", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn." };
const CURIOSITY = { id: "c-cu", name: "Curiosity", type: "Enchantment — Aura", mana: "{U}",
  oracle: "Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card." };

describe("AU-ACT+TRIG — recognition", () => {
  it("both carriers flip to native-activated", () => {
    expect(classifyCard(FIERY_MANTLE)).toBe("native-activated");
    expect(classifyCard(STRANDS_OF_UNDEATH)).toBe("native-activated");
  });

  it("TIER PRIORITY — the pure lanes still own their own cards (no tier stolen)", () => {
    expect(classifyCard(FIREBREATHING)).toBe("native-activated");   // pure aura-own activated
    expect(classifyCard(CURIOSITY)).toBe("native-trigger");         // pure aura-own triggered
    // a static-bonus aura with an aura-own activated stays native-AURA (isNativeAura keeps priority)
    expect(classifyCard({ id: "c-se", name: "Shiv's Embrace", type: "Enchantment — Aura", mana: "{3}{R}",
      oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has flying.\n{R}: Enchanted creature gets +1/+0 until end of turn." })).toBe("native-aura");
  });

  it("⛔ an UNMODELED activated half parks the whole card (the activated gate is not loosened)", () => {
    expect(classifyCard({ id: "c-x1", name: "Odd Mantle", type: "Enchantment — Aura", mana: "{1}{R}",
      oracle: "Enchant creature\n{R}: Enchanted creature gains protection from the color of your choice until end of turn.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." })).toBe("body-only");
  });

  it("⛔ an UNROUTED trigger half parks the whole card (the trigger gate is not loosened)", () => {
    expect(classifyCard({ id: "c-x2", name: "Riddle Mantle", type: "Enchantment — Aura", mana: "{1}{R}",
      oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\nWhen this Aura is put into a graveyard from the battlefield, interpret the omens however you like." })).toBe("body-only");
  });

  it("⛔ a third kind of line (a static bonus) is NOT claimed by this lane — isNativeAura still owns it", () => {
    // This gate's non-trigger half must satisfy the aura-own ACTIVATED gate, whose residue walk rejects a
    // bonus line — so the composition declines and the card falls through unchanged to the lane below.
    // ⚠️ The first draft asserted body-only and was WRONG: isNativeAura ALREADY composes static + aura-own
    // activated + a modeled aura-own trigger, and tiers it native-AURA. The assertion that matters is that
    // the tier is NOT this lane's native-activated — i.e. nothing was stolen and nothing newly credited.
    const withStatic = { id: "c-x3", name: "Static Mantle", type: "Enchantment — Aura", mana: "{1}{R}",
      oracle: "Enchant creature\nEnchanted creature gets +0/+1.\n{R}: Enchanted creature gets +1/+0 until end of turn.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
    expect(classifyCard(withStatic)).toBe("native-aura");
  });
});

describe("⭐ RUNTIME (law 6) — both halves deliver on the PRINTED card, not on the split", () => {
  function boardWithMantle() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const mantle = createPermanent({ id: "fm", card: FIERY_MANTLE, controller: "user", summoningSick: false });
    mantle.attachedTo = "bear";
    bear.attachments = ["fm"];
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, mantle], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 } } } };
  }

  it("the ACTIVATED half: the {R} pump is offered ON the Aura and takes the host 2/2 -> 3/2", () => {
    let s = boardWithMantle();
    expect(permanentPower(s, "bear")).toBe(2);
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.permanentId === "fm");
    expect(act).toHaveLength(1);
    s = resolveTopOfStack(dispatchAction(s, act[0]));
    expect(permanentPower(s, "bear")).toBe(3);
  });

  it("the TRIGGER half: the LTB self-return actually moves the Aura graveyard -> hand", () => {
    let s = boardWithMantle();
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "fm" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "ltb")).toHaveLength(1);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Fiery Mantle");
    s = resolveTopOfStack(flushTriggers(s));
    expect(s.players.user.hand.map((c) => c.name)).toContain("Fiery Mantle");   // ⭐ it bounced
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Fiery Mantle");
  });

  it("Strands of Undeath's ETB targets an OPPONENT through the engine's own chooser and engages the discard", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [bear], hand: [{ id: "u1", name: "UserCard", type: "Instant", oracle: "" }] },
        ai1: { ...s.players.ai1, hand: [{ id: "h1", name: "A", type: "Instant", oracle: "" }, { id: "h2", name: "B", type: "Instant", oracle: "" }, { id: "h3", name: "C", type: "Instant", oracle: "" }] } } };
    s = enterPermanent(s, STRANDS_OF_UNDEATH, "user", { attachTo: "bear" });
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb")).toHaveLength(1);
    // ⚠️ through the chooser the ENGINE uses — a bare flushTriggers takes the first legal target and
    // picks the controller, which reads exactly like a broken effect (see the file header).
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack[0].payload.params.targets[0]).toMatchObject({ type: "player", id: "ai1" });
    s = resolveTopOfStack(s);
    const pend = (s.log || []).filter((e) => e.kind === "discard-pending");
    expect(pend).toHaveLength(1);
    expect(pend[0]).toMatchObject({ controller: "ai1", remaining: 2 });   // the opponent owes 2 discards
    expect(s.players.user.hand).toHaveLength(1);                          // and the controller lost nothing
  });
});
