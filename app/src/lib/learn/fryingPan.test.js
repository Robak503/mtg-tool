/**
 * FIELD-TESTED FRYING PAN — a granted lifegain pump scaled by the life just gained. SHELF-85 · Phase 3 (Bumble Flower), 2026-09-05.
 * "When this Equipment enters, create a Food token, then create a 1/1 white Halfling creature token and attach this Equipment
 * to it. / Equipped creature has "Whenever you gain life, this creature gets +X/+X until end of turn, where X is the amount
 * of life you gained." / Equip {2}"
 *
 * The ETB and the equip line were native; the granted body parked on its amount: "where X is the amount of life you gained".
 * The detector's lifegain rewrite turns that phrase into the unprintable "the lifegain amount" sentinel; the self-pump arm
 * maps it to countContext:"lifegainAmount" (the counters / drain discipline — pinned to the lifegain event by the routing
 * gate); applyPumpEffect reads the gained amount into both pips.
 *
 * Mutation-checked: see the run ledger (docs-sk119).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkLifegainTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PAN = { id: "c-pan", name: "Field-Tested Frying Pan", type: "Artifact — Equipment", mana: "{2}", keywords: [],
  oracle: "When this Equipment enters, create a Food token, then create a 1/1 white Halfling creature token and attach this Equipment to it.\nEquipped creature has \"Whenever you gain life, this creature gets +X/+X until end of turn, where X is the amount of life you gained.\"\nEquip {2}" };
const BARE = { id: "c-bare", name: "Bare Carrier", type: "Creature — Halfling", mana: "{1}{W}", power: 1, toughness: 1, keywords: [],
  oracle: "Whenever you gain life, this creature gets +X/+X until end of turn, where X is the amount of life you gained." };

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...createPermanent({ id: "host", card: { id: "c-host", name: "Halfling", type: "Creature — Halfling", mana: "{W}", power: 1, toughness: 1, keywords: [], oracle: "" }, controller: "user", summoningSick: false }), attachments: ["pan"] };
  const pan = { ...createPermanent({ id: "pan", card: PAN, controller: "user" }), attachedTo: "host" };
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, pan] } } };
}
function gainThenResolve(state, gainer, amount) {
  let s = checkLifegainTriggers(state, gainer, amount);
  s = flushTriggers(s);
  let guard = 0;
  while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
  return s;
}

describe("the parser", () => {
  it("the Equipment and the bare body both read native", () => {
    const row = { pan: classifyCard(PAN), bare: classifyCard(BARE) };
    console.log("  WITNESS fryingPan", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pan).toMatch(/^native/);
    expect(row.bare).toMatch(/^native/);
  });
  it("seen-to-fail: an own trigger the engine cannot route keeps the Equipment parked (the composition allowance checks routing)", () => {
    const bad = { ...PAN, id: "c-bad", oracle: "When this Equipment enters, each opponent secretly chooses a number.\nEquipped creature has \"Whenever you gain life, this creature gets +1/+1 until end of turn.\"\nEquip {2}" };
    expect(classifyCard(bad)).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the granted body scales by the life gained", () => {
  it("the controller gains 3: the equipped 1/1 is 4/4 until end of turn; an opponent's gain does nothing", () => {
    const before = board();
    const mine = gainThenResolve(before, "user", 3);
    const theirs = gainThenResolve(before, "ai", 3);
    const row = { p: permanentPower(mine, "host"), t: permanentToughness(mine, "host"), pTheirs: permanentPower(theirs, "host"), tTheirs: permanentToughness(theirs, "host") };
    console.log("  WITNESS fryingPanRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ p: 4, t: 4, pTheirs: 1, tTheirs: 1 });
  });
});
