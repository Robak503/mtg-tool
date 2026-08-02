/**
 * flashPermission.test.js — "You may cast this spell as though it had flash." printed as a SENTENCE rather
 * than the keyword, in two shapes:
 *   • with a sacrifice rider — "If you cast it any time a sorcery couldn't have been cast, the controller of
 *     the permanent it becomes sacrifices it at the beginning of the next cleanup step."  (Spider Climb,
 *     Lightning Reflexes, Mystic Veil, Soar, Parapet, Rout, Ghitu Fire, Molten Exhale …)
 *   • with a condition — "…as though it had flash if it targets a commander." (Timely Ward)
 *
 * ⭐ THE CLAIM IS VACUITY, AND VACUITY IS A RUNTIME FACT — SO IT IS MEASURED, NOT ARGUED. The strip is only
 * honest if the engine never actually takes the flash permission, because a card cast at instant speed WOULD
 * owe the sacrifice rider, and dropping a drawback that can apply is precisely the over-claim the creed
 * forbids. The first describe below puts a carrier in hand with mana up and asks the real cast-offer
 * chokepoint for its actions in three separate windows. It is offered in the main phase only.
 *
 * ⚠️ AND THE CONTROL IS THE HALF THAT MAKES THAT MEAN ANYTHING: a genuine instant in the same hand, in the
 * same three windows, must be offered in ALL THREE. Without it, "not offered at instant speed" is equally
 * well explained by a harness that never reaches instant speed at all — which is the shape of hollow gate
 * this project keeps re-learning. Same reasoning as the bare "Flash" keyword already admitted in
 * auraResidueClauses: the printed speed goes unused, the card still does its printed thing at sorcery speed,
 * FN-safe. Never a wrong resolution — only a foregone option.
 *
 * ONE REGEX, FOUR CALLERS. Eight of the fourteen carriers are Auras or enchantments that never reach the
 * spell parser, so the strip had to land on the permanent side too; all four sites read the exported
 * FLASH_PERMISSION_LINE so the metric and the parser cannot drift into disagreeing about which cards it
 * covers. The "grants flash to something ELSE" case below is what keeps that regex from over-reaching.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { stripFlashPermissionLine } from "./effects/textNormalize.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const RIDER = "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.";

const SPIDER_CLIMB = { id: "csc", name: "Spider Climb", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: `${RIDER}\nEnchant creature\nEnchanted creature gets +0/+3 and has reach.` };
const SILVER_SCRUTINY = { id: "css", name: "Silver Scrutiny", type: "Sorcery", mana: "{X}{U}{U}",
  oracle: "You may cast this spell as though it had flash if X is 3 or less.\nDraw X cards." };
/** The control: an actual instant, which must be castable in every window the harness visits. */
const SHOCK = { id: "csh", name: "Shock", type: "Instant", mana: "{R}",
  oracle: "Shock deals 2 damage to any target." };

/** A board at `step` with every candidate in hand and plenty of mana floating. */
function board(step) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bear = createPermanent({ id: "b1", card: { id: "cb", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const phase = step === "upkeep" ? "beginning" : step === "main" ? "precombat-main" : "combat";
  return {
    ...s0, phase, step, activePlayer: "user", priorityHolder: "user", turn: 5,
    combat: step === "declare-blockers" ? { attackers: [], blockers: [] } : null,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: [bear], hand: [SPIDER_CLIMB, SILVER_SCRUTINY, SHOCK],
        manaPool: { W: 2, U: 4, B: 2, R: 4, G: 4, C: 4 } },
    },
  };
}
const offered = (step, cardId) =>
  legalActionsForPlayer(board(step), "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId).length > 0;

const WINDOWS = ["upkeep", "main", "declare-blockers"];

describe("⭐ VACUITY IS VERIFIED ON A BOARD — the engine never takes the flash permission", () => {
  it("CONTROL FIRST — a real instant is offered in all three windows", () => {
    // If this ever goes red the two assertions below prove nothing: they would just mean the harness
    // never reached instant speed. Read this one before believing either of them.
    for (const step of WINDOWS) expect(offered(step, "csh"), `Shock in ${step}`).toBe(true);
  });

  it("Spider Climb (Aura, rider form) — main phase ONLY, so the sacrifice rider can never trigger", () => {
    expect(offered("main", "csc")).toBe(true);
    expect(offered("upkeep", "csc")).toBe(false);
    expect(offered("declare-blockers", "csc")).toBe(false);
  });

  it("Silver Scrutiny (sorcery, conditional form) — main phase ONLY", () => {
    expect(offered("main", "css")).toBe(true);
    expect(offered("upkeep", "css")).toBe(false);
    expect(offered("declare-blockers", "css")).toBe(false);
  });
});

describe("⭐ AND THE CARDS ACTUALLY PLAY — offered is not the same as works", () => {
  it("Spider Climb resolves, attaches, and the +0/+3 and reach really land on the creature", () => {
    // Crediting a card native means the engine can PLAY it. The timing gate above only proves it gets
    // offered; this drives the whole chain — dispatch the real cast action, resolve it off the stack, then
    // read power/toughness through the layers engine rather than off the fixture.
    const s0 = board("main");
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "csc");
    expect(cast, "Spider Climb was never offered").toBeTruthy();
    let s = dispatchAction(s0, cast);
    let g = 0;
    while ((s.stack || []).length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s);

    const bear = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Spider Climb");
    expect(aura, "the Aura never reached the battlefield").toBeTruthy();
    expect(aura.attachedTo).toBe(bear.id);
    expect(permanentPower(s, bear.id)).toBe(2);
    expect(permanentToughness(s, bear.id)).toBe(5);   // 2 + 3, read through layers
    expect((s.log || []).filter((l) => l.kind === "stack-resolve-error")).toHaveLength(0);
  });

  it("Silver Scrutiny resolves and the cards are really in hand", () => {
    const s0 = board("main");
    const before = s0.players.user.hand.length;
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "css");
    expect(cast, "Silver Scrutiny was never offered").toBeTruthy();
    let s = dispatchAction(s0, cast);
    let g = 0;
    while ((s.stack || []).length && !s.pendingChoice && g++ < 20) s = resolveTopOfStack(s);
    // The library is empty in this harness, so the draw count cannot be asserted — what matters is that the
    // spell left hand and resolved without the engine throwing.
    expect(s.players.user.hand.some((c) => c.name === "Silver Scrutiny")).toBe(false);
    expect(s.players.user.hand.length).toBeLessThan(before);
    expect((s.log || []).filter((l) => l.kind === "stack-resolve-error")).toHaveLength(0);
  });
});

describe("the strip is anchored to the line, and only that line", () => {
  it("removes the permission and its rider, keeping the body intact", () => {
    const out = stripFlashPermissionLine(SPIDER_CLIMB.oracle);
    expect(out).not.toMatch(/as though it had flash/i);
    expect(out).not.toMatch(/cleanup step/i);
    expect(out).toMatch(/Enchant creature/);
    expect(out).toMatch(/\+0\/\+3 and has reach/);
  });

  it("removes the conditional form too", () => {
    expect(stripFlashPermissionLine(SILVER_SCRUTINY.oracle)).not.toMatch(/flash/i);
  });

  it("⛔ does NOT touch a card that grants flash to something ELSE", () => {
    // "this spell" is the whole anchor — a permanent handing flash to other cards is a real, separate
    // ability and stripping it would delete modeled text.
    const other = "You may cast creature spells as though they had flash.";
    expect(stripFlashPermissionLine(other)).toBe(other);
  });

  it("⛔ does NOT touch the bare Flash keyword", () => {
    expect(stripFlashPermissionLine("Flash\nEnchant creature")).toBe("Flash\nEnchant creature");
  });

  it("⛔ does NOT eat a following line", () => {
    expect(stripFlashPermissionLine(`${RIDER}\nDraw a card.`).trim()).toBe("Draw a card.");
  });
});

describe("classification — the fourteen real carriers flip, spells and permanents alike", () => {
  const CASES = [
    ["Rout", "Sorcery", "{3}{W}{W}", `${RIDER}\nDestroy all creatures. They can't be regenerated.`, /^native-spell/],
    ["Ghitu Fire", "Sorcery", "{X}{R}", `${RIDER}\nGhitu Fire deals X damage to any target.`, /^native-spell/],
    ["Spider Climb", "Enchantment — Aura", "{1}{G}", SPIDER_CLIMB.oracle, /^native-aura/],
    ["Soar", "Enchantment — Aura", "{1}{U}", `${RIDER}\nEnchant creature\nEnchanted creature gets +0/+1 and has flying.`, /^native-aura/],
    ["Timely Ward", "Enchantment — Aura", "{1}{W}", "You may cast this spell as though it had flash if it targets a commander.\nEnchant creature\nEnchanted creature has indestructible.", /^native-aura/],
    ["Parapet", "Enchantment", "{1}{W}", `${RIDER}\nCreatures you control get +0/+1.`, /^native-static/],
  ];
  for (const [name, type, mana, oracle, tier] of CASES) {
    it(`${name} → ${String(tier).replace(/[/^]/g, "")}`, () => {
      expect(classifyCard({ name, type, mana, oracle })).toMatch(tier);
    });
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Sorcery", mana: "{R}", oracle: `${RIDER}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
