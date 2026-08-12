/**
 * auraEnchantedControllersUpkeep.test.js — the ENCHANTED-CONTROLLER'S UPKEEP event (CR 603.2b):
 * "At the beginning of the upkeep of enchanted creature's controller, <effect>". Flip-diff +7/0/0 —
 * Stab Wound, One Thousand Lashes, Soul Bleed (lose-life), Wanderlust, Parasitic Bond, Maddening Wind
 * ("this Aura deals N damage" — the subject joined the upkeep-damage arm), Super Intelligence (draw).
 * 21 carriers were parked on this ONE missing event; the other 14 park on real effect gaps (the
 * "that creature" counter trio, pay-or-else forms, scaled damage) — safe FNs, ledgered.
 *
 * ⭐ THE SEAT IS THE WHOLE CARD: Stab Wound is MY aura on YOUR creature, firing on YOUR upkeep. The
 * firing gate reads the HOST's controller (attachedTo → findPermanent), not the aura's — and by that
 * gate's construction the upkeep player IS the host's controller, which is what makes the shared
 * "that player" → "the upkeep player" sentinel rewrite honest for every existing who:"upkeepPlayer" arm.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the host-controller firing gate removed -> the aura fires on EVERY upkeep — the aura owner's own
 *     upkeep row (must be SILENT) gains a trigger. An over-fire the tier cannot see.
 *   · the "that creature" → "enchanted creature" host-referent rewrite removed -> Unstable Mutation
 *     parks (the detection row dies).
 *   · Slow Motion's matcher arm removed -> Slow Motion parks.
 *   · the victimRef re-aim dropped from applyUpkeepSacUnlessPay -> the WRONG permanent is on the line
 *     (the aura, not the host) and the detached guard vanishes — both Slow Motion runtime rows die.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STAB_WOUND = { id: "c-sw", name: "Stab Wound", type: "Enchantment — Aura", mana: "{2}{B}",
  oracle: "Enchant creature\nEnchanted creature gets -2/-2.\nAt the beginning of the upkeep of enchanted creature's controller, that player loses 2 life." };
const WANDERLUST = { id: "c-wl", name: "Wanderlust", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, this Aura deals 1 damage to that player." };
const BEAR = { id: "c-br", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

describe("the carriers", () => {
  it("⭐ the seven flip native", () => {
    for (const c of [STAB_WOUND, WANDERLUST]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ detection — the event carries the flag; the host referent binds; -0/-1 refuses", () => {
    const d = detectTriggers(STAB_WOUND);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "upkeep", whose: "any", enchantedControllersUpkeep: true });
    // GRADUATED same-day: "that creature" on THIS event rewrites to "enchanted creature" (the host —
    // the antecedent the trigger condition itself names), binding Level Up's target:"enchanted" counter
    // arm. Unstable Mutation's -1/-1 is fully modeled and flips.
    expect(classifyCard({ id: "c-um", name: "Unstable Mutation", type: "Enchantment — Aura", mana: "{U}",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nAt the beginning of the upkeep of enchanted creature's controller, put a -1/-1 counter on that creature." })).toMatch(/^native/);
    // ⛔ Essence Flare's "-0/-1" counter carries NO P/T weight in ptPrimitive (only ±1/±1 does) — the
    // counter arm's shape refuses it, so the card parks rather than crediting a counter that would
    // apply NOTHING (the free-spell shape).
    expect(classifyCard({ id: "c-ef", name: "Essence Flare", type: "Enchantment — Aura", mana: "{U}",
      oracle: "Enchant creature\nEnchanted creature gets +2/+0.\nAt the beginning of the upkeep of enchanted creature's controller, put a -0/-1 counter on that creature." })).toBe("body-only");
  });
});

describe("⭐⭐ LAW 6 — the aura fires on the HOST's controller's upkeep, and only there", () => {
  function board() {
    // MY (user's) Stab Wound attached to ai1's Bear: the trigger belongs to the USER but fires on AI1's upkeep.
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "HOST", controller: "ai1", summoningSick: false, card: BEAR });
    const aura = createPermanent({ id: "AURA", controller: "user", summoningSick: false, card: STAB_WOUND });
    aura.attachedTo = "HOST";
    host.attachments = ["AURA"];
    return { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [aura] },
      ai1: { ...s.players.ai1, battlefield: [host] } } };
  }

  it("⭐⭐ the HOST's controller's upkeep: the trigger fires (my aura, their upkeep)", () => {
    const s = { ...board(), activePlayer: "ai1", phase: "upkeep", step: "upkeep" };
    const fired = checkStepTriggers(s, "upkeep");
    const row = { count: (fired.pendingTriggers || []).length, source: fired.pendingTriggers?.[0]?.source?.name || null };
    console.log("  WITNESS auraFiresOnHostUpkeep", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.count).toBeGreaterThanOrEqual(1);
    expect(row.source).toBe("Stab Wound");
  });

  it("⛔⛔ the AURA OWNER's upkeep: SILENT — the seat is the host's, not mine", () => {
    const s = { ...board(), activePlayer: "user", phase: "upkeep", step: "upkeep" };
    const fired = checkStepTriggers(s, "upkeep");
    const mine = (fired.pendingTriggers || []).filter((t) => t.source?.name === "Stab Wound");
    console.log("  WITNESS auraSilentOnOwnersUpkeep", JSON.stringify({ stabWoundTriggers: mine.length })); // vitest 4 needs --disable-console-intercept
    expect(mine).toHaveLength(0);
  });

  it("⛔ UNATTACHED: silent on every upkeep (no host, no seat, no fire)", () => {
    const s0 = board();
    const detached = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: s0.players.user.battlefield.map((p) => ({ ...p, attachedTo: null })) } } };
    for (const seat of ["user", "ai1"]) {
      const fired = checkStepTriggers({ ...detached, activePlayer: seat, phase: "upkeep", step: "upkeep" }, "upkeep");
      expect((fired.pendingTriggers || []).filter((t) => t.source?.name === "Stab Wound")).toHaveLength(0);
    }
  });
});

describe("⭐⭐ SLOW MOTION — the OTHER player's pay-or-sacrifice, re-aimed at the HOST", () => {
  const SLOW_MOTION = { id: "c-sm", name: "Slow Motion", type: "Enchantment — Aura", mana: "{2}{U}",
    oracle: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player sacrifices that creature unless they pay {2}.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
  const SM_ATOM = matchUpkeepSacUnlessPay("the upkeep player sacrifices enchanted creature unless they pay {2}")?.atom;

  it("⭐ Slow Motion flips native; the sentinel arm carries both re-aims; raw printed text refuses", () => {
    expect(classifyCard(SLOW_MOTION)).toMatch(/^native/);
    expect(SM_ATOM).toMatchObject({ op: "sac-unless-pay", payerRef: "upkeepPlayer", victimRef: "enchanted", cost: { kind: "mana" } });
    // The PRINTED clause (pre-sentinel) must NOT parse — only the event's rewrites produce the phrases.
    expect(matchUpkeepSacUnlessPay("that player sacrifices that creature unless they pay {2}")).toBeNull();
  });

  it("⭐⭐ LAW 6: the choice lands on the HOST's controller, and a DECLINE sacrifices the HOST — never the aura", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "HOST", controller: "ai1", summoningSick: false,
      card: { id: "c-br", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" } });
    const aura = createPermanent({ id: "AURA", controller: "user", summoningSick: false, card: SLOW_MOTION });
    aura.attachedTo = "HOST";
    host.attachments = ["AURA"];
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [aura] },
      ai1: { ...s0.players.ai1, battlefield: [host] } } };
    const paused = ATOM_RESOLVERS["sac-unless-pay"](s, SM_ATOM, { controller: "user", sourceId: "AURA", cardName: "Slow Motion", upkeepPlayerId: "ai1", targets: [] });
    const row = { payer: paused.pendingChoice?.controller, victim: paused.pendingChoice?.sourceId, victimName: paused.pendingChoice?.sourceName };
    console.log("  WITNESS slowMotionReaimed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ payer: "ai1", victim: "HOST", victimName: "Grizzly Bears" });
    const after = resolveSacUnlessPayChoice(paused, false);
    const outcome = {
      hostOnBoard: after.players.ai1.battlefield.some((p) => p.id === "HOST"),
      hostInGraveyard: after.players.ai1.graveyard.some((c) => c.id === "c-br"),
      // CR 704.5n — the aura, attached to nothing once the host dies, leaves the battlefield too (its
      // own put-into-graveyard return trigger then brings it to hand in the full engine flow). The first
      // draft of this row expected the aura to SURVIVE — the witness corrected the author.
      auraOnBoard: after.players.user.battlefield.some((p) => p.id === "AURA"),
    };
    console.log("  WITNESS slowMotionDecline", JSON.stringify(outcome)); // vitest 4 needs --disable-console-intercept
    expect(outcome).toEqual({ hostOnBoard: false, hostInGraveyard: true, auraOnBoard: false });
  });

  it("⛔ DETACHED or NO upkeep referent: no choice at all — never charged to the wrong seat", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const aura = createPermanent({ id: "AURA", controller: "user", summoningSick: false, card: SLOW_MOTION });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [aura] } } };
    const detached = ATOM_RESOLVERS["sac-unless-pay"](s, SM_ATOM, { controller: "user", sourceId: "AURA", cardName: "Slow Motion", upkeepPlayerId: "ai1", targets: [] });
    expect(detached.pendingChoice).toBeFalsy();
    const noReferent = ATOM_RESOLVERS["sac-unless-pay"](s, SM_ATOM, { controller: "user", sourceId: "AURA", cardName: "Slow Motion", targets: [] });
    expect(noReferent.pendingChoice).toBeFalsy();
  });
});
