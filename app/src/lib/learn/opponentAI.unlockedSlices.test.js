/**
 * Lane B2 — the six unlocked AI slices (AI-F3 equip/activated · AI-F4 wipes · AI-F5 fog ·
 * AI-F6 auras · AI-F7 team pump; AI-F10 tutor decline is pinned in
 * effects/atoms/tutorMandatoryFind.test.js).
 *
 * Every slice consumes actions the offer side (legalChoices) ALREADY emitted — THE CREED:
 * policies re-rank, never gate legality — and every slice keeps a `policy` legacy arm
 * ("v1" = the old hold-always / never-activate) for the A/B probe. All card fixtures are
 * REAL printed cards with exact Scryfall oracle text (verified against the local
 * oracle-index snapshot; plain vitest has no oracle index on disk, so cards are inline).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) ─────────────────────────────
const DAY_OF_JUDGMENT = { name: "Day of Judgment", type: "Sorcery", mana: "{2}{W}{W}",
  oracle: "Destroy all creatures." };
const FOG = { name: "Fog", type: "Instant", mana: "{G}",
  oracle: "Prevent all combat damage that would be dealt this turn." };
const OVERRUN = { name: "Overrun", type: "Sorcery", mana: "{2}{G}{G}{G}",
  oracle: "Creatures you control get +3/+3 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)" };
const UNHOLY_STRENGTH = { name: "Unholy Strength", type: "Enchantment — Aura", mana: "{B}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+1." };
const DEAD_WEIGHT = { name: "Dead Weight", type: "Enchantment — Aura", mana: "{B}",
  oracle: "Enchant creature\nEnchanted creature gets -2/-2." };
const WILD_GROWTH = { name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}",
  oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const LIGHTNING_GREAVES = { name: "Lightning Greaves", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}" };
const AZURE_MAGE = { name: "Azure Mage", type: "Creature — Human Wizard", power: 2, toughness: 1, mana: "{1}{U}",
  oracle: "{3}{U}: Draw a card." };
const PRODIGAL_SORCERER = { name: "Prodigal Sorcerer", type: "Creature — Human Wizard Sorcerer", power: 1, toughness: 1, mana: "{2}{U}",
  oracle: "{T}: This creature deals 1 damage to any target." };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, mana: "{1}{G}", oracle: "" };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", power: 6, toughness: 4, mana: "{4}{G}{G}", oracle: "" };

// ── State scaffolding ────────────────────────────────────────────────────────────
let permSeq = 0;
function perm(card, controller, { id = null, tapped = false, sick = false } = {}) {
  permSeq += 1;
  return createPermanent({
    id: id || `${controller}-p${permSeq}`,
    card: { ...card, id: `${controller}-c${permSeq}` },
    controller, tapped, summoningSick: sick,
  });
}
function aiMainState({ hand = [], mana = {}, board = [], oppBoard = [], aiLife = 40, userLife = 40 } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
    players: { ...b.players,
      ai: { ...b.players.ai, life: aiLife, hand, battlefield: board, manaPool: { ...b.players.ai.manaPool, ...mana } },
      user: { ...b.players.user, life: userLife, battlefield: oppBoard },
    } };
}
const aiPick = (s, opts = {}) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange", ...opts });
const bears = (controller, n) => Array.from({ length: n }, () => perm(GRIZZLY_BEARS, controller));

describe("AI-F4 (W7c) — board wipes cast when clearly behind, held otherwise", () => {
  const withWrath = (board, oppBoard) =>
    aiMainState({ hand: [{ ...DAY_OF_JUDGMENT, id: "wrath1" }], mana: { W: 2, C: 2 }, board, oppBoard });

  it("CAST at 1-vs-5 (3+ creatures behind)", () => {
    const pick = aiPick(withWrath(bears("ai", 1), bears("user", 5)));
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "wrath1" });
  });

  it("HELD at 4-vs-2 (ahead on board)", () => {
    expect(aiPick(withWrath(bears("ai", 4), bears("user", 2)))?.kind).toBe("pass-priority");
  });

  it("HELD on empty boards (a wipe answers nothing)", () => {
    expect(aiPick(withWrath([], []))?.kind).toBe("pass-priority");
  });

  it("CAST on the power axis: empty own board vs one 6/4 + two bears (10 power ≥ 2·0+6)", () => {
    const pick = aiPick(withWrath([], [perm(CRAW_WURM, "user"), ...bears("user", 2)]));
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "wrath1" });
  });

  it("pod-aware: 3 opponents × 2 creatures each vs the AI's 2 → CAST (counts sum across the table)", () => {
    const b = createGameState({ userDeck: [], aiDeck: [], opponentDecks: [[], [], []], mode: "commander" });
    const seats = Object.keys(b.players);
    const me = seats.includes("ai1") ? "ai1" : "ai"; // the deciding AI seat in this pod
    const others = seats.filter((s) => s !== me);
    const players = { ...b.players };
    players[me] = { ...players[me], hand: [{ ...DAY_OF_JUDGMENT, id: "wrath1" }],
      battlefield: bears(me, 2), manaPool: { ...players[me].manaPool, W: 2, C: 2 } };
    for (const s of others) players[s] = { ...players[s], battlefield: bears(s, 2) };
    const st = { ...b, activePlayer: me, priorityHolder: me, phase: "precombat-main", step: "main", players };
    const pick = pickAction(st, me, legalActionsForPlayer(st, me), { archetype: "midrange" });
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "wrath1" }); // 6 enemy vs 2 own = 4 behind
  });

  it('policy wipe:"v1" recovers hold-always for the A/B probe', () => {
    const s = withWrath(bears("ai", 1), bears("user", 5));
    expect(aiPick(s, { policy: { wipe: "v1" } })?.kind).toBe("pass-priority");
  });
});

describe("AI-F5 (W7b) — FOG cast under exactly-lethal incoming attack, held otherwise", () => {
  function underAttack({ aiLife, blocked = false }) {
    const attacker = perm(CRAW_WURM, "user"); // 6 power incoming
    const s = aiMainState({ hand: [{ ...FOG, id: "fog1" }], mana: { G: 1 }, oppBoard: [attacker], aiLife });
    return { ...s, activePlayer: "user", priorityHolder: "ai", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: attacker.id, attackingPlayer: "user", defender: "ai" }],
        blockers: blocked ? [{ attackerId: attacker.id, blockerId: "x" }] : [] } };
  }

  it("CAST when unblocked incoming (6) ≥ life (5)", () => {
    expect(aiPick(underAttack({ aiLife: 5 }))).toMatchObject({ kind: "cast-spell", cardId: "fog1" });
  });

  it("HELD when incoming (6) < life (7)", () => {
    expect(aiPick(underAttack({ aiLife: 7 }))?.kind).toBe("pass-priority");
  });

  it("HELD when the lethal attacker is already blocked", () => {
    expect(aiPick(underAttack({ aiLife: 5, blocked: true }))?.kind).toBe("pass-priority");
  });

  it("HELD on the AI's own turn (main phase, no combat) — never self-fogs", () => {
    const s = aiMainState({ hand: [{ ...FOG, id: "fog1" }], mana: { G: 1 }, board: bears("ai", 2), oppBoard: bears("user", 1) });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it('policy fog:"v1" recovers hold-always for the A/B probe', () => {
    expect(aiPick(underAttack({ aiLife: 5 }), { policy: { fog: "v1" } })?.kind).toBe("pass-priority");
  });
});

describe("AI-F7 (W7d) — team pump cast pre-combat exactly when it flips the swing to lethal", () => {
  const withOverrun = ({ board, oppBoard, userLife }) =>
    aiMainState({ hand: [{ ...OVERRUN, id: "ovr1" }], mana: { G: 3, C: 2 }, board, oppBoard, userLife });

  it("CAST when +3/+3 flips the swing (4 bears × 2 = 8 < 17 life; pumped 4 × 5 = 20 ≥ 17)", () => {
    const pick = aiPick(withOverrun({ board: bears("ai", 4), oppBoard: [], userLife: 17 }));
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "ovr1" });
  });

  it("HELD when already lethal without it (4 bears vs 6 life) — never waste the pump", () => {
    const pick = aiPick(withOverrun({ board: bears("ai", 4), oppBoard: [], userLife: 6 }));
    expect(pick?.cardId).not.toBe("ovr1");
  });

  it("HELD with no attackers", () => {
    expect(aiPick(withOverrun({ board: [], oppBoard: [], userLife: 17 }))?.kind).toBe("pass-priority");
  });

  it("HELD when even the pumped swing is short (2 bears pumped = 10 < 20 life)", () => {
    expect(aiPick(withOverrun({ board: bears("ai", 2), oppBoard: [], userLife: 20 }))?.kind).toBe("pass-priority");
  });

  it('policy pump:"v1" recovers hold-always for the A/B probe', () => {
    const s = withOverrun({ board: bears("ai", 4), oppBoard: [], userLife: 17 });
    expect(aiPick(s, { policy: { pump: "v1" } })?.kind).toBe("pass-priority");
  });
});

describe("AI-F6 (W7e) — auras cast on-intent: buffs on own best body, curses on the biggest threat", () => {
  it("Unholy Strength (+2/+1, own-intent) → the AI's HIGHEST-power creature", () => {
    const wurm = perm(CRAW_WURM, "ai");
    const s = aiMainState({ hand: [{ ...UNHOLY_STRENGTH, id: "aura1" }], mana: { B: 1 },
      board: [perm(GRIZZLY_BEARS, "ai"), wurm], oppBoard: [perm(CRAW_WURM, "user")] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "aura1", isAuraSpell: true });
    expect(pick.targets[0].id).toBe(wurm.id); // own 6/4 over own 2/2; never the enemy
  });

  it("Dead Weight (-2/-2, enemy-intent) → the BIGGEST enemy threat", () => {
    const enemyWurm = perm(CRAW_WURM, "user");
    const s = aiMainState({ hand: [{ ...DEAD_WEIGHT, id: "aura1" }], mana: { B: 1 },
      board: [perm(CRAW_WURM, "ai")], oppBoard: [perm(GRIZZLY_BEARS, "user"), enemyWurm] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "aura1", isAuraSpell: true });
    expect(pick.targets[0].id).toBe(enemyWurm.id); // enemy 6/4 over enemy 2/2; never its own board
  });

  it("enemy-intent aura with only OWN-side legal targets → HELD", () => {
    const s = aiMainState({ hand: [{ ...DEAD_WEIGHT, id: "aura1" }], mana: { B: 1 }, board: bears("ai", 2) });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("own-intent aura with only ENEMY creatures on the table → HELD (never buff the enemy)", () => {
    const s = aiMainState({ hand: [{ ...UNHOLY_STRENGTH, id: "aura1" }], mana: { B: 1 }, oppBoard: bears("user", 2) });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("Wild Growth (land mana aura — own lands only by the offer) → cast as ramp", () => {
    const forest = perm({ name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "({T}: Add {G}.)" }, "ai");
    const s = aiMainState({ hand: [{ ...WILD_GROWTH, id: "aura1" }], mana: { G: 1 }, board: [forest] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "cast-spell", cardId: "aura1", isAuraSpell: true });
    expect(pick.targets[0].id).toBe(forest.id);
  });

  it('policy aura:"v1" recovers hold-always for the A/B probe', () => {
    const s = aiMainState({ hand: [{ ...UNHOLY_STRENGTH, id: "aura1" }], mana: { B: 1 }, board: bears("ai", 1) });
    expect(aiPick(s, { policy: { aura: "v1" } })?.kind).toBe("pass-priority");
  });
});

describe("AI-F3 (W6) slice 1 — equip onto the best own creature, strict improvement only", () => {
  it("unattached Bonesplitter → equips the HIGHEST-power own creature", () => {
    const wurm = perm(CRAW_WURM, "ai");
    const s = aiMainState({ mana: { C: 1 },
      board: [perm(GRIZZLY_BEARS, "ai"), wurm, perm(BONESPLITTER, "ai", { id: "eq1" })] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "activate-ability", permanentId: "eq1", isEquipAbility: true });
    expect(pick.targets[0].id).toBe(wurm.id);
  });

  it("already on the best body → NO re-equip (the no-op guard)", () => {
    const wurm = perm(CRAW_WURM, "ai");
    const eq = perm(BONESPLITTER, "ai", { id: "eq1" });
    eq.attachedTo = wurm.id;
    wurm.attachments = ["eq1"];
    const s = aiMainState({ mana: { C: 1 }, board: [perm(GRIZZLY_BEARS, "ai"), wurm, eq] });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("attached to the (derived) biggest body → never downgraded; free Equip {0} can't oscillate", () => {
    // Greaves on a bear: bear derived power 2 == other bear's 2 → strict improvement fails → hold.
    const a = perm(GRIZZLY_BEARS, "ai");
    const b = perm(GRIZZLY_BEARS, "ai");
    const eq = perm(LIGHTNING_GREAVES, "ai", { id: "eq1" });
    eq.attachedTo = a.id;
    a.attachments = ["eq1"];
    const s = aiMainState({ board: [a, b, eq] });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("MOVES up on strict improvement: Bonesplitter on a bear (2+2=4) moves to a 6/4", () => {
    const bear = perm(GRIZZLY_BEARS, "ai");
    const wurm = perm(CRAW_WURM, "ai");
    const eq = perm(BONESPLITTER, "ai", { id: "eq1" });
    eq.attachedTo = bear.id;
    bear.attachments = ["eq1"];
    const s = aiMainState({ mana: { C: 1 }, board: [bear, wurm, eq] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "activate-ability", permanentId: "eq1" });
    expect(pick.targets[0].id).toBe(wurm.id); // 6 > 4 (the bear's derived power includes the +2/+0)
  });

  it('policy ability:"v1" recovers never-activate for the A/B probe', () => {
    const s = aiMainState({ mana: { C: 1 }, board: [perm(GRIZZLY_BEARS, "ai"), perm(BONESPLITTER, "ai", { id: "eq1" })] });
    expect(aiPick(s, { policy: { ability: "v1" } })?.kind).toBe("pass-priority");
  });
});

describe("AI-F3 (W6) slice 2 — cost-safe generic activated abilities (conservative whitelist)", () => {
  it("Azure Mage ({3}{U}: Draw a card) — activated when mana is spare and nothing casts", () => {
    const s = aiMainState({ mana: { U: 1, C: 3 }, board: [perm(AZURE_MAGE, "ai")] });
    const pick = aiPick(s);
    expect(pick).toMatchObject({ kind: "activate-ability", name: "Azure Mage" });
    expect(pick.isEquipAbility).toBeFalsy();
  });

  it("a TARGETED ability (Prodigal Sorcerer) stays un-activated — no aiming discipline yet", () => {
    const s = aiMainState({ mana: { U: 1, C: 3 }, board: [perm(PRODIGAL_SORCERER, "ai")], oppBoard: bears("user", 1) });
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("casting still outranks ability value: with a castable bear in hand, the cast goes first", () => {
    const s = aiMainState({ hand: [{ ...GRIZZLY_BEARS, id: "bear-hand" }], mana: { U: 1, G: 1, C: 3 },
      board: [perm(AZURE_MAGE, "ai")] });
    expect(aiPick(s)).toMatchObject({ kind: "cast-spell", cardId: "bear-hand" });
  });
});

describe("B2 policy seam — the probe derives every new slice from POLICY_KEYS", () => {
  it("exports the five new keys alongside the existing six", () => {
    expect(POLICY_KEYS).toEqual(
      expect.arrayContaining(["land", "block", "attack", "xSizing", "counter", "unresolvable", "wipe", "fog", "aura", "pump", "ability"]));
  });
});
