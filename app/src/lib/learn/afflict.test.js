/**
 * afflict.test.js — AFFLICT (CR 702.131): a KEYWORD→TRIGGER keyword whose triggered ability lives in reminder
 * text ("Whenever this creature becomes blocked, defending player loses N life."). Mirrors the BUSHIDO
 * subsystem: detectTriggers synthesizes the becomesBlocked descriptor off the printed keyword;
 * checkBlockTriggers fires it, threading the blocked attacker's DECLARED DEFENDER into the context so
 * who:"defendingPlayer" resolves; the shaped-count bump + COVERED_KEYWORDS entry let a pure printed-afflict
 * creature (Khenra Eternal) read native-body.
 *
 * The GROUP-GRANT form ("<selector> have afflict N" — Lazotep Sliver, Cyberman Patrol) is NOT a static
 * keyword grant (afflict is a triggered ability, not a static characteristic): staticAbilityParser emits a
 * layer-6 quoted-triggered grant whose body is the canonical afflict sentence, so grantedTriggersForGroup
 * fires afflict on each RECIPIENT that becomes blocked — reusing the entire Tempered-Sliver granted-triggered
 * pipeline. Lazotep Sliver then flips native-mixed (the dies→amass trigger + the afflict group grant).
 *
 * ENGINE-FIRST: every flip is proven by the trigger actually FIRING + resolving (the defending player really
 * loses life), plus CREED near-misses (an unblocked attacker, a non-recipient, an enemy-controlled recipient,
 * an unmodeled sibling ability) that must NOT flip / must NOT fire.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkBlockTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const cr = (name, oracle, type = "Creature — Zombie") => ({ name, type, power: 2, toughness: 2, oracle });
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };

// A declare-blockers state: `attackers` + `blockers` combat records, both players at 40 life.
function combat(userBf, aiBf, attackers, blockers) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers",
    combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
const perm = (id, name, type, oracle, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, power: 2, toughness: 2, oracle }, controller, summoningSick: false });
const wall = (id = "w", controller = "ai") =>
  createPermanent({ id, card: { id: `c-${id}`, name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller, summoningSick: false });

// ─── PRINTED AFFLICT ───────────────────────────────────────────────────────────────────────────────
describe("AFFLICT (CR 702.131) — printed keyword synthesis + classification", () => {
  it("synthesizes a becomesBlocked → 'defending player loses N life' descriptor off the keyword", () => {
    const d = detectTriggers(cr("Khenra Eternal", "Afflict 1 (Whenever this creature becomes blocked, defending player loses 1 life.)"));
    expect(d).toEqual([expect.objectContaining({ event: "becomesBlocked", effectClause: "defending player loses 1 life", sourceText: "Afflict 1" })]);
  });

  it("a pure printed-afflict creature classifies native-body (Khenra Eternal — Afflict 1)", () => {
    expect(classifyCard(cr("Khenra Eternal", "Afflict 1 (Whenever this creature becomes blocked, defending player loses 1 life.)"))).toBe("native-body");
  });

  it("afflict + another modeled keyword still flips (Prowess + Afflict 2)", () => {
    expect(classifyCard(cr("Spellweaver Eternal", "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nAfflict 2 (Whenever this creature becomes blocked, defending player loses 2 life.)"))).toBe("native-body");
  });

  it("Merciless Eternal flips (DC-1 graduation — γ1h pays its discard); a COUNT-discard sibling still parks", () => {
    expect(classifyCard(cr("Merciless Eternal", "Afflict 2 (Whenever this creature becomes blocked, defending player loses 2 life.)\n{2}{B}, Discard a card: This creature gets +2/+2 until end of turn."))).toBe("native-activated");
    expect(classifyCard(cr("Two-Pitch Eternal", "Afflict 2 (Whenever this creature becomes blocked, defending player loses 2 life.)\n{2}{B}, Discard two cards: This creature gets +2/+2 until end of turn."))).toBe("body-only");
  });
});

describe("AFFLICT — printed keyword FIRES at declare-blockers (engine-first)", () => {
  it("a blocked afflict attacker makes the DEFENDING player lose N life", () => {
    let s = combat([perm("atk", "Khenra Eternal", "Creature — Zombie", "Afflict 1 (Whenever this creature becomes blocked, defending player loses 1 life.)")],
      [wall()], [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "atk", blockerId: "w" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(39);   // the defending player (ai) lost 1 to afflict
  });

  it("CREED near-miss — an UNBLOCKED afflict attacker does NOT fire (no life loss)", () => {
    let s = combat([perm("atk", "Khenra Eternal", "Creature — Zombie", "Afflict 1 (Whenever this creature becomes blocked, defending player loses 1 life.)")],
      [], [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], []); // no blockers
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(40);   // afflict never triggered — the attacker wasn't blocked
  });
});

// ─── GROUP-GRANT AFFLICT (Lazotep Sliver) ────────────────────────────────────────────────────────────
const LAZOTEP_ORACLE =
  "Sliver creatures you control have afflict 2. (Whenever a creature with afflict 2 becomes blocked, defending player loses 2 life.)\n" +
  "Whenever a nontoken Sliver you control dies, amass Slivers 2. (Put two +1/+1 counters on an Army you control. It's also a Sliver. If you don't control an Army, create a 0/0 black Sliver Army creature token first.)";

describe("AFFLICT — group grant classification (Lazotep Sliver + siblings)", () => {
  it("Lazotep Sliver flips native-mixed (afflict group grant + dies→amass trigger)", () => {
    expect(classifyCard({ name: "Lazotep Sliver", type: "Creature — Zombie Sliver", mana: "{3}{B}", power: 4, toughness: 4, oracle: LAZOTEP_ORACLE })).toBe("native-mixed");
  });

  it("Lazotep itself does NOT self-synthesize afflict (the afflict is GRANTED, not printed on it)", () => {
    // Only the dies→amass trigger is detected; the 'have afflict 2' + its reminder must NOT emit a self becomesBlocked.
    const events = detectTriggers({ name: "Lazotep Sliver", type: "Creature — Zombie Sliver", oracle: LAZOTEP_ORACLE }).map((d) => d.event);
    expect(events).toEqual(["dies"]);
  });

  it("a card-type-scoped group afflict flips native-static (Cyberman Patrol — Artifact creatures)", () => {
    expect(classifyCard({ name: "Cyberman Patrol", type: "Artifact Creature — Cyberman", oracle: "Artifact creatures you control have afflict 3. (Whenever a creature with afflict 3 becomes blocked, defending player loses 3 life.)" })).toBe("native-static");
  });

  it("CREED near-miss — a group-afflict card with an UNMODELED extra trigger stays body-only (Lost Monarch's mill trigger)", () => {
    expect(classifyCard({ name: "Lost Monarch of Ifnir", type: "Creature — Zombie Noble", oracle:
      "Afflict 3 (Whenever this creature becomes blocked, defending player loses 3 life.)\nOther Zombies you control have afflict 3.\nAt the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three cards, then you may return a creature card from your graveyard to your hand." })).toBe("body-only");
  });
});

describe("AFFLICT — group grant FIRES on each recipient (engine-first)", () => {
  const lazotep = (id, controller = "user") => perm(id, "Lazotep Sliver", "Creature — Zombie Sliver", LAZOTEP_ORACLE, controller);

  it("a granted (vanilla) Sliver that becomes blocked makes the defender lose 2", () => {
    let s = combat([lazotep("laz"), perm("ms", "Muscle Sliver", "Creature — Sliver", "")],
      [wall()], [{ permanentId: "ms", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "ms", blockerId: "w" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(38);   // the granted afflict 2 fired on the recipient Sliver
  });

  it("CREED near-miss — a NON-Sliver you control is NOT granted afflict (a Bear blocked → no loss)", () => {
    let s = combat([lazotep("laz"), perm("br", "Grizzly Bears", "Creature — Bear", "")],
      [wall()], [{ permanentId: "br", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "br", blockerId: "w" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(40);   // the grant is subtype-scoped — a Bear never gets afflict
  });

  it("CREED near-miss — an ENEMY's Sliver is NOT granted by my Lazotep (you-control scope; I don't lose life)", () => {
    // ai's Sliver attacks user; user blocks. If the grant wrongly reached ai's Sliver, USER would lose life.
    let s = combat([lazotep("laz"), wall("ub", "user")], [perm("es", "Enemy Sliver", "Creature — Sliver", "", "ai")],
      [{ permanentId: "es", attackingPlayer: "ai", defender: "user" }], [{ attackerId: "es", blockerId: "ub" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.life).toBe(40); // the you-control grant never reaches an opponent's Sliver
  });
});

// ─── DEFENDING_PLAYER on becomesBlocked — PRINTED (non-keyword) becomes-blocked triggers ─────────────
// Adding "becomesBlocked" to triggerRouting.DEFENDING_PLAYER_EVENTS (so afflict resolves) ALSO unblocks
// PRINTED becomes-blocked triggers whose effect reads "defending player" — those were fully modeled but
// stayed on the Arbiter only because the referent gate rejected the event. They now route + fire correctly.
describe("becomesBlocked + defendingPlayer — printed (non-afflict) triggers now route + fire", () => {
  it("Vedalken Ghoul — 'defending player loses 4 life' fires when blocked (native-trigger)", () => {
    const card = cr("Vedalken Ghoul", "Whenever this creature becomes blocked, defending player loses 4 life.");
    expect(classifyCard(card)).toBe("native-trigger");
    let s = combat([perm("vg", "Vedalken Ghoul", "Creature — Zombie", card.oracle)],
      [wall()], [{ permanentId: "vg", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "vg", blockerId: "w" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(36); // the defending player lost 4
  });

  it("a becomesBlocked lose-life still does NOT fire on an UNBLOCKED attacker (CREED — no fabricated loss)", () => {
    let s = combat([perm("vg", "Vedalken Ghoul", "Creature — Zombie", "Whenever this creature becomes blocked, defending player loses 4 life.")],
      [], [{ permanentId: "vg", attackingPlayer: "user", defender: "ai" }], []); // no blockers
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.life).toBe(40);
  });
});
