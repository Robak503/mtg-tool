/**
 * swordHearthAndHome.test.js — SHELF CAP15: Sword of Hearth and Home.
 *
 *   "Whenever equipped creature deals combat damage to a player, exile up to one target creature you own,
 *    then search your library for a basic land card. Put both cards onto the battlefield under your
 *    control, then shuffle."
 *
 * ⛔ WHY IT IS COLLAPSED WHOLE rather than split into clauses. The instruction that RETURNS the exiled
 * creature lives in the THIRD sentence — "Put BOTH cards onto the battlefield" — shared with the tutored
 * land. Under the clause splitter the lead half reads "exile your own creature", full stop, which is a card
 * that permanently eats your best creature. That is the same keep-whole hazard the plain blink arm already
 * documents, one sentence further along.
 *
 * ⭐ "YOU OWN", NOT "YOU CONTROL" — the load-bearing distinction, and the reason the card is templated this
 * way. A creature of yours an OPPONENT HAS STOLEN is still one you own, and the Sword is how you get it
 * back (it returns under YOUR control). Reading the scope as controller-based would refuse exactly the
 * target the card exists to hit. Modeled as a new `kind:"owner"` restriction; on a board where nothing has
 * been stolen it is byte-identical to the controller check, because a permanent's `owner` is only stamped
 * when it diverges from its controller.
 *
 * Two EXISTING atoms, no new resolver: the up-to-one blink (Displacer Kitten's maxTargets 1 / minTargets 0
 * shape) plus the basic-land tutor onto the battlefield UNTAPPED — the latter byte-identical to what the
 * standalone tutor clause parses to, verified against the real parser rather than hand-written.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, attachPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { matchSwordHearthAndHome } from "./effects/templateMatchers.js";
import { creatureSatisfiesRestrictions } from "./creatureRestrictions.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SWORD = {
  id: "c-shh", name: "Sword of Hearth and Home", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature gets +2/+2 and has protection from green and from white.\nWhenever equipped creature deals combat damage to a player, exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle.\nEquip {2}",
};
const CLAUSE = "exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle";

describe("parse — the collapse, and what it refuses", () => {
  it("collapses to blink + basic-land tutor, HIGH", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "blink", targetType: "creature", restrictions: [{ kind: "owner", who: "you" }], returnTo: "controller", maxTargets: 1, minTargets: 0 },
      { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: false, targetType: null },
    ]);
  });

  it("the tutor half is BYTE-IDENTICAL to the standalone basic-land tutor clause", () => {
    // Guards against this collapse drifting from the shape the tutor resolver is already proven on — the
    // atom was taken from the real parser's output, not hand-written, and this pins that.
    const standalone = parseEffectClause("search your library for a basic land card, put it onto the battlefield, then shuffle", "Instant").atoms[0];
    expect(parseEffectClause(CLAUSE, "Instant").atoms[1]).toEqual(standalone);
  });

  it("⛔ a rider or a changed subject fails the whole-oracle anchor → null → Arbiter", () => {
    expect(matchSwordHearthAndHome("exile up to one target creature you control, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle")).toBe(null);
    expect(matchSwordHearthAndHome(CLAUSE + ". You gain 2 life")).toBe(null);
    expect(matchSwordHearthAndHome("exile up to two target creatures you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle")).toBe(null);
  });

  it("Sword of Hearth and Home classifies native", () => {
    expect(classifyCard(SWORD)).toBe("native-mixed");
  });
});

describe("⭐ the OWNER restriction — the distinction the card is built on", () => {
  const R = [{ kind: "owner", who: "you" }];
  const perm = (id, owner) => ({ id, card: { name: id, type_line: "Creature" }, ...(owner ? { owner } : {}) });

  it("your own creature qualifies (owner unstamped → controller IS the owner)", () => {
    expect(creatureSatisfiesRestrictions({}, perm("mine"), "user", "user", R)).toBe(true);
  });

  it("⭐ a creature an OPPONENT CONTROLS but YOU OWN qualifies — this is the whole point", () => {
    // Stolen by an opponent: controller "ai", owner "user". A controller-scoped read would refuse it, and
    // refusing it means the Sword can never bring your own creature home — the card's marquee line.
    expect(creatureSatisfiesRestrictions({}, perm("stolen", "user"), "ai", "user", R)).toBe(true);
  });

  it("⛔ an opponent's OWN creature does NOT qualify (never a fabricated target)", () => {
    expect(creatureSatisfiesRestrictions({}, perm("theirs"), "ai", "user", R)).toBe(false);
    // …nor one they own that YOU currently control (you stole it — you don't own it). This is the mirror
    // case of the stolen-creature test above, and it is what keeps the owner read from collapsing back
    // into a controller read in the other direction.
    expect(creatureSatisfiesRestrictions({}, perm("borrowed", "ai"), "user", "user", R)).toBe(false);
  });

  it("NEGATIVE CONTROL — the controller restriction still behaves as it always did", () => {
    const C = [{ kind: "controller", who: "you" }];
    expect(creatureSatisfiesRestrictions({}, perm("mine"), "user", "user", C)).toBe(true);
    expect(creatureSatisfiesRestrictions({}, perm("stolen", "user"), "ai", "user", C)).toBe(false); // controller ≠ you
  });
});

// ─── Runtime ────────────────────────────────────────────────────────────────────────────────────────

/** The wielder wearing the Sword, attacking an undefended opponent, plus `extra` permanents. */
function board({ extraUser = [], extraAi = [], library = [] } = {}) {
  const wielder = createPermanent({ id: "w", card: { id: "cw", name: "Wielder", type: "Creature — Human", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const sword = createPermanent({ id: "sw", card: SWORD, controller: "user", summoningSick: false });
  const s = createGameState({ userDeck: [], aiDeck: [] });
  let out = {
    ...s, step: "combat-damage", phase: "combat",
    combat: { attackers: [{ permanentId: "w", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [wielder, sword, ...extraUser], library, life: 40 },
      ai: { ...s.players.ai, battlefield: extraAi, life: 40 },
    },
  };
  return attachPermanent(out, { equipId: "sw", targetId: "w" });
}
const connect = (s) => {
  let out = flushTriggers(resolveCombatDamage(s), { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((out.stack || []).length && g++ < 20) out = resolveTopOfStack(out);
  return out;
};

describe("runtime — the trigger fires and BOTH halves resolve", () => {
  const myBear = () => createPermanent({ id: "mine", card: { id: "cm", name: "My Bear", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
  const forest = { id: "L1", name: "Forest", type: "Basic Land — Forest", oracle: "" };

  it("the equipped creature connects for its buffed power, and the blinked creature comes back", () => {
    const out = connect(board({ extraUser: [myBear()], library: [forest] }));
    expect(out.players.ai.life).toBe(36);                                       // 2 base + the Sword's +2/+2
    // The bear was exiled and RETURNED — it is on the battlefield, not in exile.
    expect(out.players.user.battlefield.some((p) => p.card.name === "My Bear")).toBe(true);
    expect((out.players.user.exile || []).some((c) => c.name === "My Bear")).toBe(false);
  });

  it("the tutor half runs — it pauses for the library search (the player picks the land)", () => {
    const out = connect(board({ extraUser: [myBear()], library: [forest] }));
    expect(out.pendingChoice?.kind).toBe("tutor-search");
  });

  it("a BLOCKED attacker deals no player damage → the trigger never fires", () => {
    const wall = createPermanent({ id: "wall", card: { id: "cwall", name: "Wall", type: "Creature — Wall", power: 0, toughness: 9, oracle: "" }, controller: "ai", summoningSick: false });
    let s = board({ extraUser: [myBear()], extraAi: [wall], library: [forest] });
    s = { ...s, combat: { attackers: s.combat.attackers, blockers: [{ blockerId: "wall", blockingPlayer: "ai", attackerId: "w" }] } };
    const out = connect(s);
    expect(out.players.ai.life).toBe(40);
    expect(out.pendingChoice).toBeFalsy();
  });

  it("'up to one' — with NO legal creature to blink, the trigger still resolves and tutors", () => {
    // minTargets 0 means the exile half is optional; the land half must still happen.
    const out = connect(board({ library: [forest] }));
    expect(out.players.ai.life).toBe(36);
    expect(out.pendingChoice?.kind).toBe("tutor-search");
  });
});
