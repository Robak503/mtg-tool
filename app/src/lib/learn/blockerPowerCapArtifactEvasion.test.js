/**
 * blockerPowerCapArtifactEvasion.test.js — ④-AV (2026-09-04 night): three ≤6-card census families, each on machinery that
 * already existed.
 *   1. "This creature can't be blocked by artifact creatures" — a new kind:"artifact" restriction in the EVASION-QUALIFIER
 *      grammar (parseAttackerRestrictions → canBlockAttacker; the classifier mirror reEvasionQualifier flips with it).
 *      Argothian Sprite, Fen Hauler, Audacious Infiltrator (Clockwork Steed / Basalt Golem / Argothian Pixies park on
 *      their other lines).
 *   2. "This creature can't block creatures with power N or greater" — a BLOCKER-side cap (blockerCantBlockPowerAtLeast),
 *      enforced against the attacker's LIVE power in canBlockAttacker. Ironclaw Orcs / Ironclaw Buzzardiers / Brassclaw
 *      Orcs (Goblin Mutant / Orgg park on their can't-attack line).
 *   3. "When this creature enters, tap all other creatures" — the eachCreature mass tap with excludeSource (CR 109.5),
 *      honored by massCreatureTargets against ctx.sourceId. Shrieking Mogg / Thundermare / Timbermare.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { blockerCantBlockPowerAtLeast, canBlockAttacker, isEnforcedEvasionClause } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const INFILTRATOR = { id: "c-ai", name: "Audacious Infiltrator", type: "Creature — Human Rogue", mana: "{1}{W}", cmc: 2, power: 3, toughness: 1, keywords: [], oracle: "This creature can't be blocked by artifact creatures." };
const SPRITE = { id: "c-as", name: "Argothian Sprite", type: "Creature — Faerie", mana: "{1}{G}", cmc: 2, power: 1, toughness: 1, keywords: [], oracle: "This creature can't be blocked by artifact creatures.\n{7}: Put two +1/+1 counters on this creature." };
const HAULER = { id: "c-fh", name: "Fen Hauler", type: "Creature — Insect", mana: "{6}{B}", cmc: 7, power: 5, toughness: 5, keywords: ["Improvise"], oracle: "Improvise (Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)\nThis creature can't be blocked by artifact creatures." };
const ORCS = { id: "c-io", name: "Ironclaw Orcs", type: "Creature — Orc", mana: "{1}{R}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "This creature can't block creatures with power 2 or greater." };
const BRASS = { ...ORCS, id: "c-bo", name: "Brassclaw Orcs", mana: "{3}{R}", cmc: 4, power: 4, toughness: 4 };
const BUZZ = { id: "c-ib", name: "Ironclaw Buzzardiers", type: "Creature — Orc Scout", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [], oracle: "This creature can't block creatures with power 2 or greater.\n{R}: This creature gains flying until end of turn." };
const MOGG = { id: "c-sm", name: "Shrieking Mogg", type: "Creature — Goblin", mana: "{1}{R}", cmc: 2, power: 1, toughness: 1, keywords: ["Haste"], oracle: "Haste\nWhen this creature enters, tap all other creatures." };
const THUNDER = { id: "c-tm", name: "Thundermare", type: "Creature — Elemental Horse", mana: "{5}{R}", cmc: 6, power: 5, toughness: 5, keywords: ["Haste"], oracle: "Haste (This creature can attack and {T} as soon as it comes under your control.)\nWhen this creature enters, tap all other creatures." };
const TIMBER = { id: "c-tb", name: "Timbermare", type: "Creature — Elemental Horse", mana: "{3}{G}", cmc: 4, power: 5, toughness: 5, keywords: ["Haste", "Echo"], oracle: "Haste\nEcho {5}{G} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nWhen this creature enters, tap all other creatures." };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `card-${id}`, keywords: [], oracle: "", ...card }, controller }), summoningSick: false, ...extra });
const bear = (id, controller, power = 2, toughness = 2, type = "Creature — Bear") => perm(id, { name: `Bear ${id}`, type, mana: "{1}{G}", cmc: 2, power, toughness }, controller);
function board(userPerms, aiPerms, extra = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, ...extra, players: { ...s0.players, user: { ...s0.players.user, hand: extra.userHand || [], battlefield: userPerms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(extra.pool || {}) } }, ai: { ...s0.players.ai, battlefield: aiPerms } } };
}

describe("the classifier", () => {
  it("⭐ the two evasion statics are credited only because canBlockAttacker enforces them", () => {
    expect(isEnforcedEvasionClause("this creature can't be blocked by artifact creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't block creatures with power 2 or greater")).toBe(true);
    // the relative and team forms stay uncredited
    expect(isEnforcedEvasionClause("this creature can't block creatures with power greater than its power")).toBe(false);
    expect(isEnforcedEvasionClause("creatures you control can't block creatures with power 2 or greater")).toBe(false);
  });
  it("the tiers", () => {
    expect(classifyCard(INFILTRATOR)).toBe("native-body");
    expect(classifyCard(HAULER)).toBe("native-body");
    expect(classifyCard(SPRITE)).toBe("native-activated");
    expect(classifyCard(ORCS)).toBe("native-body");
    expect(classifyCard(BRASS)).toBe("native-body");
    expect(classifyCard(BUZZ)).toBe("native-activated");
    for (const c of [MOGG, THUNDER, TIMBER]) expect(classifyCard(c), c.name).toBe("native-trigger");
  });
  it("'tap all other creatures' parses to the each-creature mass tap minus the source", () => {
    const p = parseEffectClause("tap all other creatures", "Instant", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "tap", targetType: "eachCreature", excludeSource: true }]);
    expect(parseEffectClause("tap all creatures", "Instant", { sourceScoped: true }).confidence).toBe("low");
  });
});

describe("runtime — can't be blocked by artifact creatures", () => {
  it("⭐ an artifact creature may not block the Infiltrator; a plain creature may; an artifact creature may still block another attacker", () => {
    const s = board(
      [perm("inf", INFILTRATOR, "user"), bear("plain-atk", "user")],
      [bear("golem", "ai", 3, 3, "Artifact Creature — Golem"), bear("plain", "ai")],
      { activePlayer: "user", step: "declare-blockers", combat: { attackers: [{ permanentId: "inf", defender: "ai" }, { permanentId: "plain-atk", defender: "ai" }], blockers: [] } },
    );
    expect(canBlockAttacker(s, "golem", "inf", "ai")).toBe(false);
    expect(canBlockAttacker(s, "plain", "inf", "ai")).toBe(true);
    expect(canBlockAttacker(s, "golem", "plain-atk", "ai")).toBe(true);
  });
});

describe("runtime — can't block creatures with power N or greater", () => {
  it("⭐ Ironclaw Orcs refuse a 2-power attacker, accept a 1-power one, and refuse a 1/1 wearing a +1/+1 counter (live power)", () => {
    expect(blockerCantBlockPowerAtLeast(ORCS)).toBe(2);
    expect(blockerCantBlockPowerAtLeast(INFILTRATOR)).toBeNull();
    const s = board(
      [bear("two", "user", 2, 2), bear("one", "user", 1, 1), { ...bear("pumped", "user", 1, 1), counters: { "+1/+1": 1 } }],
      [perm("orcs", ORCS, "ai")],
      { activePlayer: "user", step: "declare-blockers", combat: { attackers: [{ permanentId: "two", defender: "ai" }, { permanentId: "one", defender: "ai" }, { permanentId: "pumped", defender: "ai" }], blockers: [] } },
    );
    expect(canBlockAttacker(s, "orcs", "two", "ai")).toBe(false);
    expect(canBlockAttacker(s, "orcs", "one", "ai")).toBe(true);
    expect(canBlockAttacker(s, "orcs", "pumped", "ai")).toBe(false);
  });
});

describe("runtime — tap all other creatures", () => {
  it("⭐ Shrieking Mogg enters and taps every other creature on both boards, never itself", () => {
    let s = board([bear("mine", "user")], [bear("theirs", "ai"), bear("theirs2", "ai")], {
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, userHand: [MOGG], pool: { R: 1, C: 1 },
    });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-sm");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    if (!s.stack.length) s = flushTriggers(s);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    const mogg = s.players.user.battlefield.find((p) => p.card?.name === "Shrieking Mogg");
    expect(mogg.tapped).toBe(false);
    expect(findPermanent(s, "mine").permanent.tapped).toBe(true);
    expect(findPermanent(s, "theirs").permanent.tapped).toBe(true);
    expect(findPermanent(s, "theirs2").permanent.tapped).toBe(true);
  });
});
