/**
 * becomesBlockedPump.test.js — BLITZ CT-1 (the Cave Tiger class): "Whenever this creature becomes
 * blocked by a creature, this creature gets +N/+N until end of turn." (Cave Tiger, Rabid Wolverines,
 * Viashino Weaponsmith +2/+2, Pygmy Troll +regen line; Retaliation GRANTS the same line to your team.)
 *
 * CR 509.3d: the "by a creature" wording triggers ONCE FOR EACH creature that blocks — a double-block
 * is two triggers (+2/+2 total for the +1/+1 carriers) — DISTINCT from the bare "becomes blocked"
 * (CR 509.3c — once per combat, the deduped becomesBlocked event afflict rides). So the descriptor
 * carries its own event ("becomesBlockedByCreature") and checkBlockTriggers fires it per block PAIR
 * (attacker as source — the self-pump binds to it; blocker as the triggering permanent) through
 * triggersForEvent, so PRINTED and GRANTED lines both fire (Retaliation's group grant re-detects on
 * the quoted body). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { detectTriggers, checkBlockTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, createPermanent, creaturePower, findPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Whenever this creature becomes blocked by a creature, this creature gets +1/+1 until end of turn.";
const CAVE_TIGER = { id: "ct", name: "Cave Tiger", type: "Creature — Cat", mana: "{2}{G}", power: "2", toughness: "2", oracle: LINE };

// ─── 1. Detect + classify ─────────────────────────────────────────────────────────
describe("CT-1 — detect + coverage flips", () => {
  it("the printed line emits exactly ONE becomesBlockedByCreature descriptor (no bare-event twin)", () => {
    const ds = detectTriggers(CAVE_TIGER);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "becomesBlockedByCreature", scope: "self", effectClause: "this creature gets +1/+1 until end of turn" });
    // the effect is proven vocabulary (the rampage sentinel self-pump)
    const p = parseEffectClause(ds[0].effectClause, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "pump", target: "self", ptDelta: { p: 1, t: 1 } }]);
  });
  it("all five carriers flip (whole card)", () => {
    expect(classifyCard(CAVE_TIGER)).toBe("native-trigger");
    expect(classifyCard({ name: "Rabid Wolverines", type: "Creature — Wolverine", mana: "{3}{G}{G}", power: "4", toughness: "4", oracle: LINE })).toBe("native-trigger");
    expect(classifyCard({ name: "Viashino Weaponsmith", type: "Creature — Lizard", mana: "{3}{R}", power: "3", toughness: "3",
      oracle: "Whenever this creature becomes blocked by a creature, this creature gets +2/+2 until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ name: "Pygmy Troll", type: "Creature — Troll", mana: "{1}{G}", power: "1", toughness: "1",
      oracle: LINE + "\n{G}: Regenerate this creature." })).toBe("native-mixed");
    expect(classifyCard({ name: "Retaliation", type: "Enchantment", mana: "{2}{G}",
      oracle: `Creatures you control have "${LINE}"` })).toBe("native-static");
  });
  it("FN guards: the per-blocker-scaled / compound / negative / filtered forms never emit this descriptor", () => {
    const mk = (oracle) => ({ name: "Fake Tiger", type: "Creature — Cat", power: "2", toughness: "2", oracle });
    for (const card of [
      mk("Whenever this creature becomes blocked, it gets +1/+1 until end of turn for each creature blocking it."), // perBlockerPump's wording (no "by a creature")
      mk("Whenever this creature becomes blocked by a creature, this creature gets +1/+1 until end of turn for each creature blocking it."), // rider after the anchor
      mk("Whenever this creature becomes blocked by a creature, this creature gets +1/+1 and gains trample until end of turn."), // unevidenced compound
      mk("Whenever this creature becomes blocked by a creature, that creature gets -1/-1 until end of turn."), // debuffs the BLOCKER — a different family
      mk("Whenever this creature becomes blocked by a Wall, this creature gets +1/+1 until end of turn."), // unevidenced partner filter
    ]) {
      expect(detectTriggers(card).filter((t) => t.event === "becomesBlockedByCreature")).toHaveLength(0);
    }
  });
});

// ─── 2. Runtime — CR 509.3d per-blocker multiplicity ─────────────────────────────
describe("CT-1 — fires once PER BLOCKER; the bare becomesBlocked event stays once per combat", () => {
  function board() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const tiger = createPermanent({ id: "ct", card: CAVE_TIGER, controller: "user", summoningSick: false });
    const b1 = createPermanent({ id: "b1", card: { name: "Bear One", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const b2 = createPermanent({ id: "b2", card: { name: "Bear Two", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [tiger] }, ai1: { ...s.players.ai1, battlefield: [b1, b2] } } };
  }
  const pendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.event === "becomesBlockedByCreature");

  it("a single block fires ONE; a double block fires TWO (CR 509.3d)", () => {
    const s = board();
    const single = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "ct", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "ct" }] } });
    expect(pendings(single)).toHaveLength(1);
    // scope:"self" — the attacker is its own triggering permanent (the self-pump binds to it);
    // the per-BLOCKER multiplicity is carried by the fire COUNT, not the context.
    expect(pendings(single)[0].context.triggeringPermanentId).toBe("ct");
    const dbl = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "ct", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "ct" }, { blockerId: "b2", attackerId: "ct" }] } });
    expect(pendings(dbl)).toHaveLength(2);
  });

  it("resolving both pendings lands +2/+2 total on the double-blocked Cave Tiger", () => {
    let s = board();
    s = { ...s, combat: { attackers: [{ permanentId: "ct", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "ct" }, { blockerId: "b2", attackerId: "ct" }] } };
    const fired = checkBlockTriggers(s);
    const ps = pendings(fired);
    expect(ps).toHaveLength(2);
    let next = s;
    for (const t of ps) {
      const program = parseEffectClause(t.descriptor.effectClause, "Creature");
      next = runEffectProgram(next, { source: { name: "Cave Tiger" }, payload: { params: { program, controller: "user", targets: [], sourceId: "ct", context: t.context } } });
    }
    const tiger = findPermanent(next, "ct").permanent;
    expect(creaturePower(tiger, next)).toBe(4); // 2 printed + 1 + 1
  });

  it("the tiger BLOCKING does not fire (it must BECOME blocked); the bare becomesBlocked event still dedupes", () => {
    const s = board();
    // Cave Tiger as the BLOCKER — no becomesBlockedByCreature fire.
    const asBlocker = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "b1", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "ct", attackerId: "b1" }] } });
    expect(pendings(asBlocker)).toHaveLength(0);
    // CONTRAST (CR 509.3c): a bare "becomes blocked" trigger (afflict wording) fires ONCE on a double block.
    let s2 = board();
    const afflicted = createPermanent({ id: "af", card: { name: "Khenra Eternal", type: "Creature — Zombie Jackal", power: "2", toughness: "2",
      oracle: "Afflict 1 (Whenever this creature becomes blocked, defending player loses 1 life.)" }, controller: "user", summoningSick: false });
    s2 = { ...s2, players: { ...s2.players, user: { ...s2.players.user, battlefield: [...s2.players.user.battlefield, afflicted] } } };
    const dbl = checkBlockTriggers({ ...s2, combat: { attackers: [{ permanentId: "af", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "af" }, { blockerId: "b2", attackerId: "af" }] } });
    expect((dbl.pendingTriggers || []).filter((t) => t.descriptor?.event === "becomesBlocked")).toHaveLength(1);
  });
});

// ─── 3. Retaliation — the group-granted line fires on the RECIPIENT ───────────────
describe("CT-1 — Retaliation grants the line; the granted trigger fires and binds to the recipient", () => {
  it("a plain creature under Retaliation fires becomesBlockedByCreature when blocked; without it, nothing", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const ox = createPermanent({ id: "ox", card: { name: "Plain Ox", type: "Creature — Ox", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const ret = createPermanent({ id: "rt", card: { name: "Retaliation", type: "Enchantment",
      oracle: `Creatures you control have "${LINE}"` }, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "br", card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const combat = { attackers: [{ permanentId: "ox", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "br", attackerId: "ox" }] };
    // Without the enchantment: no fire.
    let bare = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [ox] }, ai1: { ...s.players.ai1, battlefield: [bear] } }, combat };
    expect((checkBlockTriggers(bare).pendingTriggers || []).filter((t) => t.descriptor?.event === "becomesBlockedByCreature")).toHaveLength(0);
    // With it: the granted line fires, source = the OX (the recipient — the pump binds to it, never the granter).
    let granted = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [ox, ret] }, ai1: { ...s.players.ai1, battlefield: [bear] } }, combat };
    const ps = (checkBlockTriggers(granted).pendingTriggers || []).filter((t) => t.descriptor?.event === "becomesBlockedByCreature");
    expect(ps).toHaveLength(1);
    expect(ps[0].source.permanentId).toBe("ox");
    expect(ps[0].descriptor.granted).toBe(true);
  });
});
