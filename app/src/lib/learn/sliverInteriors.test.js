/**
 * sliverInteriors.test.js — SLIVER INTERIORS (BLITZ SP-1): group keyword grants for the four
 * newly-grantable keywords — defender / shadow / flanking / exalted (GRANTABLE_STATIC_KEYWORDS).
 *
 * Why these four are honest (the whole-keyword-or-park audit):
 *   - defender  (CR 702.3b "A creature with defender can't attack"): attack declaration is the keyword's
 *     ENTIRE effect, enforced layer-aware at both enumeration sites (legalChoices actionsDeclareAttacker
 *     + opponentAI's scan read permanentHasKeyword).
 *   - shadow    (CR 702.28b): a pure SYMMETRIC block exclusion — combatEvasion.canBlockAttacker requires
 *     the two sides to MATCH on shadow, layer-aware on both.
 *   - flanking  (CR 702.25a, multiples 702.25b): the checkBlockTriggers fire site now counts printed
 *     (structural) + layer-6 granted instances via layers.keywordInstanceCount; blocker immunity was
 *     already layer-aware.
 *   - exalted   (CR 702.83a-b): the checkAttackTriggers attacks-alone site now sums per-permanent
 *     printed (structural exaltedKeywordCount — a grant line "…have exalted" is NOT an own instance,
 *     fixing the old loose \bexalted\b scan) + layer-6 granted instances.
 *
 * Recognition tests use REAL bundled oracle text (verified via cardIndex 2026-07-17). Scope law: an
 * "All Sliver(s)" grant reaches EVERY battlefield (opponents' Slivers included); a "…you control" grant
 * reaches only the controller's — pinned both ways. A changeling is a Sliver (CR 702.73a). The grant
 * lifts the moment the granter leaves. FN guards: the unmodeled Sliver keywords (provoke / banding /
 * absorb / frenzy / poisonous / hope) and the rider-carrying granters stay body-only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { keywordInstanceCount, permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { checkAttackTriggers, checkBlockTriggers, exaltedKeywordCount, flankingKeywordCount } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

// ─── Real bundled oracle (probed via cardIndex.lookupCard, 2026-07-17) ─────────────────────────────
const DORMANT_SLIVER = { name: "Dormant Sliver", type: "Creature — Sliver", mana: "{2}{G}{U}", power: "2", toughness: "2",
  oracle: "All Sliver creatures have defender.\nAll Slivers have \"When this permanent enters, draw a card.\"" };
const SHADOW_SLIVER = { name: "Shadow Sliver", type: "Creature — Sliver", mana: "{2}{U}", power: "1", toughness: "1",
  oracle: "All Sliver creatures have shadow. (They can block or be blocked by only creatures with shadow.)" };
const SIDEWINDER_SLIVER = { name: "Sidewinder Sliver", type: "Creature — Sliver", mana: "{W}", power: "1", toughness: "1",
  oracle: "All Sliver creatures have flanking. (Whenever a creature without flanking blocks a Sliver, the blocking creature gets -1/-1 until end of turn.)" };
const FIRST_SLIVERS_CHOSEN = { name: "First Sliver's Chosen", type: "Creature — Sliver", mana: "{4}{W}", power: "3", toughness: "3",
  oracle: "Sliver creatures you control have exalted. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)" };
const SUBLIME_ARCHANGEL = { name: "Sublime Archangel", type: "Creature — Angel", mana: "{2}{W}{W}", power: "4", toughness: "3",
  oracle: "Flying\nExalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nOther creatures you control have exalted. (If a creature has multiple instances of exalted, each triggers separately.)" };
const AGILITY = { name: "Agility", type: "Enchantment — Aura", mana: "{1}{R}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has flanking. (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)" };

// ─── Board helpers ──────────────────────────────────────────────────────────────────────────────────
const sliver = (id, controller = "user") => createPermanent({
  id, card: { id, name: "Metallic Sliver", type: "Artifact Creature — Sliver", power: "1", toughness: "1", oracle: "" },
  controller, summoningSick: false,
});
const bear = (id, controller = "user") => createPermanent({
  id, card: { id, name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" },
  controller, summoningSick: false,
});
const onBoard = (name, card, id, controller = "user") =>
  createPermanent({ id, card: { id, ...card }, controller, summoningSick: false });

function board({ user = [], ai = [], combat, phase, step, activePlayer = "user" } = {}) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
  if (combat) s = { ...s, combat };
  if (phase) s = { ...s, phase, step, activePlayer, priorityHolder: activePlayer };
  return s;
}

// ─── 1. Classification — the four grants flip on REAL oracle ────────────────────────────────────────
describe("SP-1 — classification flips (real oracle)", () => {
  it("Dormant / Shadow / Sidewinder Slivers + First Sliver's Chosen → native-static", () => {
    expect(classifyCard(DORMANT_SLIVER)).toBe("native-static");
    expect(classifyCard(SHADOW_SLIVER)).toBe("native-static");
    expect(classifyCard(SIDEWINDER_SLIVER)).toBe("native-static");
    expect(classifyCard(FIRST_SLIVERS_CHOSEN)).toBe("native-static");
  });
  it("Sublime Archangel (printed exalted + you-control exalted anthem) → native-static", () => {
    expect(classifyCard(SUBLIME_ARCHANGEL)).toBe("native-static");
  });
  it("Agility (Aura '+1/+1 and has flanking') → native aura tier", () => {
    expect(classifyCard(AGILITY)).toBe("native-aura");
  });
});

// ─── 2. CREED FN guards — unmodeled Sliver group grants stay parked (real oracle) ───────────────────
describe("SP-1 — CREED: the unmodeled keyword grants + rider carriers stay body-only", () => {
  const mk = (name, oracle) => ({ name, type: "Creature — Sliver", power: "1", toughness: "1", oracle });
  it.each([
    ["Hunter Sliver (provoke — untap/must-block unmodeled)", "All Sliver creatures have provoke. (Whenever a Sliver attacks, its controller may have target creature defending player controls untap and block it if able.)"],
    ["Banding Sliver (banding unmodeled)", "All Slivers have banding. (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"],
    ["Lymph Sliver (absorb 1 — prevention shield unmodeled)", "All Sliver creatures have absorb 1. (If a source would deal damage to a Sliver, prevent 1 of that damage.)"],
    ["Frenzy Sliver (frenzy 1 — unblocked-pump keyword unmodeled)", "All Sliver creatures have frenzy 1. (Whenever a Sliver attacks and isn't blocked, it gets +1/+0 until end of turn.)"],
    ["Virulent Sliver (poisonous 1 — poison-on-damage keyword unmodeled)", "All Sliver creatures have poisonous 1. (Whenever a Sliver deals combat damage to a player, that player gets a poison counter. A player with ten or more poison counters loses the game.)"],
    ["Sliver of Hope (hope unmodeled)", "Slivers you control have hope. (Prevent all damage that would be dealt to attacking creatures with hope.)"],
  ])("%s", (_label, oracle) => {
    expect(classifyCard(mk("Parked Sliver", oracle))).toBe("body-only");
  });
  it("Pulmonic Sliver: the flying grant is modeled but the graveyard-replacement grant is not → whole card parked", () => {
    expect(classifyCard(mk("Pulmonic Sliver",
      "All Sliver creatures have flying.\nAll Slivers have \"If this permanent would be put into a graveyard, you may put it on top of its owner's library instead.\""))).toBe("body-only");
  });
  it("Cavalry Master ('Other creatures you control WITH FLANKING have flanking' — property-filtered selector, curated to flying) stays body-only", () => {
    expect(classifyCard({ name: "Cavalry Master", type: "Creature — Human Knight", power: "2", toughness: "2",
      oracle: "Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nOther creatures you control with flanking have flanking. (Each instance of flanking triggers separately.)" })).toBe("body-only");
  });
});

// ─── 3. DEFENDER — grant honored at attack declaration, all-battlefields scope, lifts on death ──────
describe("SP-1 — defender runtime (Dormant Sliver)", () => {
  const attackIds = (s, player) => legalActionsForPlayer(s, player).filter(a => a.kind === "declare-attacker").map(a => a.permanentId).sort();

  it("your Slivers (including Dormant itself) can't attack; a non-Sliver still can", () => {
    const s = board({
      user: [onBoard("Dormant Sliver", DORMANT_SLIVER, "dorm"), sliver("s1"), bear("b1")],
      phase: "combat", step: "declare-attackers", activePlayer: "user",
    });
    expect(permanentHasKeyword(s, "s1", "Defender")).toBe(true);
    expect(permanentHasKeyword(s, "dorm", "Defender")).toBe(true); // "All Sliver creatures" includes the granter
    expect(permanentHasKeyword(s, "b1", "Defender")).toBe(false);
    expect(attackIds(s, "user")).toEqual(["b1"]);
  });

  it("ALL-scope: an OPPONENT'S Sliver is granted defender by YOUR Dormant Sliver (CR 702.3b enforced on their attack)", () => {
    const s = board({
      user: [onBoard("Dormant Sliver", DORMANT_SLIVER, "dorm")],
      ai: [sliver("as1", "ai"), bear("ab1", "ai")],
      phase: "combat", step: "declare-attackers", activePlayer: "ai",
    });
    expect(permanentHasKeyword(s, "as1", "Defender")).toBe(true);
    expect(attackIds(s, "ai")).toEqual(["ab1"]);
  });

  it("the grant LIFTS when the granter leaves — the same Sliver attacks freely", () => {
    const s = board({
      user: [sliver("s1"), bear("b1")],
      phase: "combat", step: "declare-attackers", activePlayer: "user",
    });
    expect(permanentHasKeyword(s, "s1", "Defender")).toBe(false);
    expect(attackIds(s, "user")).toEqual(["b1", "s1"]);
  });
});

// ─── 4. SHADOW — symmetric block matching (CR 702.28b), granted == printed ──────────────────────────
describe("SP-1 — shadow runtime (Shadow Sliver)", () => {
  it("a shadow-granted Sliver attacker can be blocked ONLY by a shadow creature — the opponent's own Sliver (granted by YOUR Shadow Sliver) qualifies", () => {
    const s = board({
      user: [onBoard("Shadow Sliver", SHADOW_SLIVER, "shs"), sliver("s1")],
      ai: [bear("ab1", "ai"), sliver("as1", "ai")],
    });
    expect(permanentHasKeyword(s, "s1", "Shadow")).toBe(true);
    expect(permanentHasKeyword(s, "as1", "Shadow")).toBe(true); // ALL-scope: reaches the opponent's Sliver
    expect(canBlockAttacker(s, "ab1", "s1", "ai")).toBe(false);  // non-shadow can't block shadow
    expect(canBlockAttacker(s, "as1", "s1", "ai")).toBe(true);   // shadow blocks shadow
  });
  it("SYMMETRIC: a non-shadow attacker can't be blocked by a shadow-granted creature", () => {
    const s = board({
      user: [onBoard("Shadow Sliver", SHADOW_SLIVER, "shs"), bear("b1")],
      ai: [sliver("as1", "ai")],
    });
    expect(canBlockAttacker(s, "as1", "b1", "ai")).toBe(false); // shadow blocker vs plain attacker
  });
});

// ─── 5. FLANKING — granted instances fire; a granted blocker is immune; grant lifts ─────────────────
describe("SP-1 — flanking runtime (Sidewinder Sliver)", () => {
  const combatOf = (attackerId, blockerId) => ({
    attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }],
    blockers: [{ blockerId, attackerId }],
  });
  const flankFires = (s) => (s.pendingTriggers || []).filter(t => t.descriptor?.event === "flanking");

  it("a granted-flanking Sliver blocked by a plain creature → ONE -1/-1 fire on the blocker", () => {
    const s = board({
      user: [onBoard("Sidewinder Sliver", SIDEWINDER_SLIVER, "sw"), sliver("s1")],
      ai: [bear("ab1", "ai")],
      combat: combatOf("s1", "ab1"),
    });
    const out = checkBlockTriggers(s);
    const fires = flankFires(out);
    expect(fires).toHaveLength(1);
    expect(fires[0].descriptor.effectClause).toBe("the triggering creature gets -1/-1 until end of turn");
    expect(fires[0].context?.triggeringPermanentId).toBe("ab1"); // the debuff lands on the BLOCKER
  });

  it("CR 702.25a: a blocker that ITSELF has (granted) flanking is immune — the opponent's Sliver is granted by the ALL-scope anthem", () => {
    const s = board({
      user: [onBoard("Sidewinder Sliver", SIDEWINDER_SLIVER, "sw"), sliver("s1")],
      ai: [sliver("as1", "ai")],
      combat: combatOf("s1", "as1"),
    });
    expect(flankFires(checkBlockTriggers(s))).toHaveLength(0);
  });

  it("CR 702.25b: printed + granted instances STACK — a printed-flanking Sliver under Sidewinder fires twice", () => {
    const knight = createPermanent({ id: "k1", card: { id: "k1", name: "Test Sliver Knight", type: "Creature — Sliver Knight", power: "2", toughness: "2",
      oracle: "Flanking" }, controller: "user", summoningSick: false });
    const s = board({
      user: [onBoard("Sidewinder Sliver", SIDEWINDER_SLIVER, "sw"), knight],
      ai: [bear("ab1", "ai")],
      combat: combatOf("k1", "ab1"),
    });
    expect(keywordInstanceCount(s, "k1", "Flanking", flankingKeywordCount(knight.card.oracle))).toBe(2);
    expect(flankFires(checkBlockTriggers(s))).toHaveLength(2);
  });

  it("the grant LIFTS with the granter: no Sidewinder → a plain Sliver attacker fires nothing", () => {
    const s = board({
      user: [sliver("s1")],
      ai: [bear("ab1", "ai")],
      combat: combatOf("s1", "ab1"),
    });
    expect(flankFires(checkBlockTriggers(s))).toHaveLength(0);
  });
});

// ─── 6. EXALTED — granted instances counted per permanent; you-control scope; structural own-count ──
describe("SP-1 — exalted runtime (First Sliver's Chosen / Sublime Archangel)", () => {
  const lone = (attackerId) => ({ attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [] });
  const exFires = (s) => (s.pendingTriggers || []).filter(t => t.descriptor?.event === "exalted");

  it("a lone Sliver attacker under First Sliver's Chosen → +2/+2 (the Chosen and the attacker EACH carry one granted instance)", () => {
    const s = board({
      user: [onBoard("First Sliver's Chosen", FIRST_SLIVERS_CHOSEN, "fsc"), sliver("s1")],
      combat: lone("s1"),
    });
    const fires = exFires(checkAttackTriggers(s));
    expect(fires).toHaveLength(1);
    expect(fires[0].descriptor.effectClause).toBe("this creature gets +2/+2 until end of turn");
  });

  it("YOU-CONTROL scope: the opponent's lone Sliver attacker gets NOTHING from your First Sliver's Chosen", () => {
    let s = board({
      user: [onBoard("First Sliver's Chosen", FIRST_SLIVERS_CHOSEN, "fsc")],
      ai: [sliver("as1", "ai")],
    });
    s = { ...s, combat: { attackers: [{ permanentId: "as1", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    expect(exFires(checkAttackTriggers(s))).toHaveLength(0);
  });

  it("CR 702.73a: a CHANGELING is a Sliver — the you-control grant reaches it", () => {
    const shapeshifter = createPermanent({ id: "ch1", card: { id: "ch1", name: "Woodland Changeling", type: "Creature — Shapeshifter", power: "1", toughness: "1",
      oracle: "Changeling (This card is every creature type.)", keywords: ["Changeling"] }, controller: "user", summoningSick: false });
    const s = board({
      user: [onBoard("First Sliver's Chosen", FIRST_SLIVERS_CHOSEN, "fsc"), shapeshifter],
      combat: lone("ch1"),
    });
    const fires = exFires(checkAttackTriggers(s));
    expect(fires).toHaveLength(1);
    expect(fires[0].descriptor.effectClause).toBe("this creature gets +2/+2 until end of turn"); // Chosen's own + the changeling's
  });

  it("STRUCTURAL COUNT FIX: Sublime Archangel's grant line is NOT an own printed instance — Archangel + two bears, lone bear attacks → +3/+3 (1 printed + 2 granted to the others)", () => {
    expect(exaltedKeywordCount(SUBLIME_ARCHANGEL.oracle)).toBe(1); // the old loose \bexalted\b scan said 2
    const s = board({
      user: [onBoard("Sublime Archangel", SUBLIME_ARCHANGEL, "arch"), bear("b1"), bear("b2")],
      combat: lone("b1"),
    });
    const fires = exFires(checkAttackTriggers(s));
    expect(fires).toHaveLength(1);
    expect(fires[0].descriptor.effectClause).toBe("this creature gets +3/+3 until end of turn");
  });

  it("no granter, no printed exalted → no fire (the grant lifts with the granter)", () => {
    const s = board({ user: [sliver("s1"), bear("b1")], combat: lone("s1") });
    expect(exFires(checkAttackTriggers(s))).toHaveLength(0);
  });
});
