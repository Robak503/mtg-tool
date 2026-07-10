/**
 * Tests for triggers.js + the N-seat APNAP flushTriggers (Phase-7 PR-5).
 *
 * PR-5 ships detection + matching + the APNAP ordering
 * generalization. Nothing is enqueued by a real game yet (PR-6..8 wire the
 * hooks), so these exercise the pieces in isolation.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  detectTriggers,
  hasTriggerFor,
  triggersForEvent,
  checkInterveningIf,
} from "./triggers.js";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function perm(card, controller = "user", id = "perm-x") {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {} };
}

describe("detectTriggers", () => {
  it("detects a self ETB draw trigger", () => {
    const t = detectTriggers(creature("Elvish Visionary", "When Elvish Visionary enters, draw a card."));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "etb", scope: "self" });
    expect(t[0].effectClause).toMatch(/draw a card/i); // W4: descriptors carry the clause; the flush stage parses it
  });

  it("detects an 'another creature enters' watcher (Soul Warden style)", () => {
    const t = detectTriggers(creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life."));
    expect(t[0]).toMatchObject({ event: "etb", scope: "eachOtherCreature" });
    expect(t[0].effectClause).toMatch(/you gain 1 life/i);
  });

  it("detects a dies drain (Blood Artist style)", () => {
    const t = detectTriggers(creature("Bummer", "Whenever a creature dies, each opponent loses 1 life."));
    expect(t[0]).toMatchObject({ event: "dies", scope: "eachCreature" });
    expect(t[0].effectClause).toMatch(/each opponent loses 1 life/i);
  });

  it("detects an upkeep draw gated to 'your' upkeep", () => {
    const t = detectTriggers(creature("Howler", "At the beginning of your upkeep, draw a card."));
    expect(t[0]).toMatchObject({ event: "upkeep", scope: "you", whose: "yours" });
    expect(t[0].effectClause).toMatch(/draw a card/i);
    expect(hasTriggerFor(t[0] && creature("Howler", "At the beginning of your upkeep, draw a card."), "upkeep")).toBe(true);
  });

  it("does NOT treat 'enters tapped' as a trigger (CR 603.6d static guard)", () => {
    expect(detectTriggers(creature("Tapland", "Tapland enters tapped."))).toHaveLength(0);
  });

  it("extracts an intervening-if clause", () => {
    const t = detectTriggers(creature("Felidar", "At the beginning of your upkeep, if you have 40 or more life, draw a card."));
    expect(t[0].interveningIf).toMatch(/40 or more life/);
    expect(t[0].effectClause).toMatch(/draw a card/i);
  });

  it("carries the raw clause for an out-of-vocabulary effect (fail-safe: unmodeled parses LOW at flush → manual/Arbiter, never fabricated)", () => {
    const t = detectTriggers(creature("Weird", "When Weird enters, surveil 2 then proliferate."));
    expect(t).toHaveLength(1);
    expect(t[0].effectClause).toMatch(/surveil 2 then proliferate/i);
    expect(t[0].payload?.resolver ?? "manual").toBe("manual");
  });

  it("ignores a mid-sentence 'when' (anchored matching)", () => {
    expect(detectTriggers(creature("Vanilla", "This creature gets +1/+0 when it would matter."))).toHaveLength(0);
  });
});

describe("classifyCondition — block-trigger compound/restricted guard (CREED: only a BARE self-block is modeled)", () => {
  const blocks = (oracle) => detectTriggers(creature("X", oracle)).some((t) => t.event === "blocks");
  it("detects a BARE self-block trigger (the one modeled form stays native)", () => {
    expect(blocks("Whenever this creature blocks, it gets +1/+1 until end of turn.")).toBe(true);
  });
  it("does NOT detect a 'blocks or becomes blocked …' compound (Serra Inquisitors / Raging Gorilla) — 2nd event + restriction dropped would mis-fire", () => {
    expect(blocks("Whenever this creature blocks or becomes blocked by one or more black creatures, it gets +2/+2 until end of turn.")).toBe(false);
    expect(blocks("Whenever this creature blocks or becomes blocked, it gets +2/-2 until end of turn.")).toBe(false);
  });
  it("does NOT detect a RESTRICTED block (Snarespinner / Skystinger — 'blocks a creature with flying') — the engine can't enforce the restriction", () => {
    expect(blocks("Whenever this creature blocks a creature with flying, this creature gets +1/+1 until end of turn.")).toBe(false);
    expect(blocks("Whenever this creature blocks a Dragon, draw a card.")).toBe(false);
  });
});

// ===== COMPOUND self-event + LTB guard (CREED) ===== Surfaced by the TOK-2 named-token slice: once
// "create a Food/Treasure token" became a modeled trigger EFFECT, compound conditions ("enters or
// leaves", "enters or dies", "dies and when you discard this card") and "leaves the battlefield"
// (which the engine never fires) would have flipped cards to native while DROPPING half the trigger.
describe("classifyCondition — compound self-event + LTB guard (CREED)", () => {
  const events = (oracle) => detectTriggers(creature("X", oracle)).map((t) => t.event);
  it("detects each SINGLE self event (the modeled forms stay native)", () => {
    expect(events("When this creature enters, create a Food token.")).toEqual(["etb"]);
    expect(events("When this creature dies, create a Food token.")).toEqual(["dies"]);
  });
  it("does NOT detect 'enters or leaves the battlefield' (Brandywine Farmer) — the LTB half would be dropped", () => {
    expect(detectTriggers(creature("Brandywine Farmer", "When this creature enters or leaves the battlefield, create a Food token."))).toHaveLength(0);
  });
  it("'enters or dies' (Vinereap Mentor) SPLITS into both halves (SHELF C2 — the disjunction is modeled)", () => {
    const ds = detectTriggers(creature("Vinereap Mentor", "When this creature enters or dies, create a Food token."));
    expect(ds.map((d) => d.event).sort()).toEqual(["dies", "etb"]);
  });
  // FIX-TRIG-COMPOUND (Rod QA #1) — the original eventVerbs tally counted only enters/dies/leaves, so an
  // "enters or attacks" (Grave Titan) and the artifact "enters or is put into a graveyard" family slipped
  // through (eventVerbs==1) and fired on ETB only. attacks/blocks/put-into-graveyard are now counted too.
  it("'enters or attacks' (Grave Titan) SPLITS into both halves (SHELF C1 — the disjunction is modeled)", () => {
    const ds = detectTriggers(creature("Grave Titan", "Whenever Grave Titan enters or attacks, create two 2/2 black Zombie creature tokens."));
    expect(ds.map((d) => d.event).sort()).toEqual(["attacks", "etb"]);
  });
  it("does NOT detect 'enters or is put into a graveyard' (Ichor Wellspring / Servo Schematic) — the death half would be dropped", () => {
    expect(detectTriggers(creature("Ichor Wellspring", "When Ichor Wellspring enters or is put into a graveyard from the battlefield, draw a card.", { type: "Artifact" }))).toHaveLength(0);
    expect(detectTriggers(creature("Servo Schematic", "When this artifact enters or is put into a graveyard from the battlefield, create a 1/1 colorless Servo artifact creature token.", { type: "Artifact" }))).toHaveLength(0);
  });
  it("does NOT detect 'a creature dies or a creature card is put into a graveyard from a library' (Dreadhound) — the second event would be dropped", () => {
    expect(detectTriggers(creature("Dreadhound", "Whenever a creature dies or a creature card is put into a graveyard from a library, each opponent loses 1 life."))).toHaveLength(0);
  });
  // A single-event "attacks" / "blocks" condition is still ONE event and resolves normally (the tally
  // change must not break the single-event forms).
  it("still detects a single self 'attacks' / 'blocks' (eventVerbs==1 — unaffected)", () => {
    expect(detectTriggers(creature("Hellrider", "Whenever this creature attacks, it gets +1/+0 until end of turn.")).map((t) => t.event)).toEqual(["attacks"]);
    expect(detectTriggers(creature("Wall", "Whenever this creature blocks, it gets +0/+2 until end of turn.")).map((t) => t.event)).toEqual(["blocks"]);
  });
  it("SPLITS a 'dies and when you discard this card' compound (Bartered Cow) — the dies half detects; the unmodeled discard half keeps the card non-native", () => {
    // COMPOUND TRIGGER (CR 603.1): "When A and when B, E" is TWO INDEPENDENT abilities sharing an effect line — NOT a
    // single multi-event condition ("enters or dies" above). detectTriggers splits it: the dies half (create Food) is
    // modeled and now detects + fires FAITHFULLY on its own event; the "you discard this card" half is unmodeled, so
    // only the dies half returns and coverage's count reconciliation keeps the whole card non-native (the discard half
    // is never silently claimed native — CREED). Contrast the "or" compounds above, which stay wholly undetected.
    expect(detectTriggers(creature("Bartered Cow", "When this creature dies and when you discard this card, create a Food token.")).map((t) => t.event)).toEqual(["dies"]);
  });
  it("does NOT detect a 'leaves the battlefield' trigger (City Pigeon) — the engine never fires LTB", () => {
    expect(detectTriggers(creature("City Pigeon", "When this creature leaves the battlefield, create a Food token."))).toHaveLength(0);
  });
  // ATTACKS-OR-BECOMES-TARGET compound event (CR 603.2 / CR 115.1) — the UNRESTRICTED bare self form is now
  // MODELED as a single event that fires on BOTH the attack declaration AND becoming the target of ANY spell
  // (checkAttackTriggers + checkCastTriggers). Goldspan Dragon flips: one descriptor, event
  // "attacksOrBecomesTarget", effect "create a Treasure token".
  it("detects 'attacks or becomes the target of a spell' (Goldspan Dragon) as one compound event", () => {
    const dets = detectTriggers(creature("Goldspan Dragon", "Whenever this creature attacks or becomes the target of a spell, create a Treasure token."));
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ event: "attacksOrBecomesTarget", scope: "self", effectClause: "create a Treasure token" });
  });
  // The RESTRICTED form ("…of a spell AN OPPONENT CONTROLS" — the REAL Tectonic Giant) stays UNDETECTED: the
  // cast site can't gate on the caster per-target, so detecting it would over-fire on the controller's own
  // spells (THE CREED). A modal effect compounds the reason it parks.
  it("does NOT detect the opponent-restricted 'becomes the target of a spell an opponent controls' (Tectonic Giant)", () => {
    expect(detectTriggers(creature("Tectonic Giant", "Whenever this creature attacks or becomes the target of a spell an opponent controls, choose one —\n• Tectonic Giant deals 3 damage to each opponent.\n• Exile the top two cards of your library."))).toHaveLength(0);
  });
  // COMBAT-EVENT-LIST guard — a comma-list "attacks, blocks, or becomes the target of a spell" truncates at
  // the FIRST comma (after "attacks") so the split leaks "blocks, or becomes the target…" into the effect;
  // the list guard now folds the whole list back into the condition, where the compound guards reject it.
  it("does NOT detect 'attacks, blocks, or becomes the target of a spell' (Giggling Skitterspike) — the block+target halves would be dropped", () => {
    expect(detectTriggers(creature("Giggling Skitterspike", "Whenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent."))).toHaveLength(0);
  });
  // CREED near-miss #1 — a BARE self "attacks, <effect>" (a single event; the comma is the real split, NOT a
  // list continuation) must still detect normally. The list guard only advances when a combat-event token
  // ("blocks"/"becomes the target") FOLLOWS the comma — an ordinary effect after the comma is untouched.
  it("still detects a bare self 'attacks, <effect>' — the list guard does not swallow a plain effect", () => {
    expect(detectTriggers(creature("Hellrider", "Whenever this creature attacks, it deals 1 damage to each opponent.")).map((t) => t.event)).toEqual(["attacks"]);
  });
  // CREED near-miss #2 — the bare "becomes the target of a spell" alone (no "attacks") was already undetected
  // (no runtime); it must STAY undetected (the guard change never accidentally starts modeling it).
  it("does NOT detect a bare 'becomes the target of a spell' trigger — no general runtime models it", () => {
    expect(detectTriggers(creature("Hypothetical", "Whenever this creature becomes the target of a spell, create a Treasure token."))).toHaveLength(0);
  });
});

// ===== TRIG-DMG-TO-OPPONENT — non-combat damage-to-player/opponent trigger =====
describe("classifyCondition — TRIG-DMG-TO-OPPONENT (Vedalken Heretic / Thieving Magpie family)", () => {
  it("detects 'deals damage to an opponent' (self-ref) as combatDamageToPlayer", () => {
    const t = detectTriggers(creature("Vedalken Heretic", "Whenever this creature deals damage to an opponent, you may draw a card."));
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("combatDamageToPlayer");
    expect(t[0].scope).toBe("self");
  });
  it("detects 'deals damage to a player' (self-ref by name) as combatDamageToPlayer", () => {
    const t = detectTriggers(creature("Clambassadors", "Whenever Clambassadors deals damage to a player, choose an artifact, creature, or land you control."));
    expect(t).toHaveLength(1);
    expect(t[0].event).toBe("combatDamageToPlayer");
  });
  it("does NOT detect when a trailing qualifier is present ('to a player or planeswalker')", () => {
    expect(detectTriggers(creature("Complex", "Whenever this creature deals damage to a player or planeswalker, draw a card."))).toHaveLength(0);
  });
  it("does NOT detect without a self-reference (controller-scoped, not self)", () => {
    expect(detectTriggers(creature("Wide", "Whenever a creature deals damage to an opponent, draw a card."))).toHaveLength(0);
  });
});

// ===== FIX-TRIG-CONDITION (Rod QA #1, CREED) ===== classifyCondition over-detected restricted /
// alternate-subject triggers: a broad selfRef (`/\bthis\b/` anywhere, or the card name) + dropped
// scope-inexpressible restrictions made aristocrats / tribal / Sengir payoffs fire at the wrong time or
// only on self-death. A "dealt damage by", with / while / during / named / "the player with" restriction, or
// a TYPE/PLANESWALKER-filtered "or another" union is left UNDETECTED → Arbiter (safe). The legit bare forms (a
// self/controller bare event) MUST stay detected — and DEATH-DRAIN now also detects the CLEAN creature-only
// "X or another creature [you control] dies" union (it's exactly "a creature [you control] dies"; see
// deathDrainTriggers.test.js) — no over-correction in either direction.
describe("classifyCondition — restricted / alternate-subject guard (FIX-TRIG-CONDITION)", () => {
  const zero = (name, oracle) => expect(detectTriggers(creature(name, oracle))).toHaveLength(0);
  it("does NOT detect a SUBTYPE-filtered 'or another' union (Rotlung Cleric) — only the clean creature union is modeled (DEATH-DRAIN)", () => {
    zero("Rotlung Reanimator", "Whenever Rotlung Reanimator or another Cleric dies, create a 2/2 black Zombie creature token.");
  });
  it("NOW detects the creature-OR-PLANESWALKER union (Cruel Celebrant) → creatureOrPwYouControl (DEATH-DRAIN PW carve-out)", () => {
    const det = detectTriggers(creature("Cruel Celebrant", "Whenever Cruel Celebrant or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life."));
    expect(det.map((t) => t.event)).toEqual(["dies"]);
    expect(det[0].scope).toBe("creatureOrPwYouControl");
    // CREED — the union must be scoped "you control"; an UNSCOPED "or planeswalker" stays UNDETECTED (no each-PW scope modeled).
    zero("X", "Whenever this creature or another creature or planeswalker dies, each opponent loses 1 life.");
    // CREED — a FURTHER extra type ("or artifact") beyond creature+planeswalker stays UNDETECTED.
    zero("Y", "Whenever this creature or another creature or planeswalker or artifact you control dies, each opponent loses 1 life.");
  });
  it("does NOT detect a 'dealt damage by this' restriction (Sengir Vampire) — broad selfRef mis-read it as a bare self-dies", () => {
    zero("Sengir Vampire", "Whenever a creature dealt damage by Sengir Vampire this turn dies, put a +1/+1 counter on Sengir Vampire.");
  });
  it("does NOT detect a scope-inexpressible restriction (with / while / during / the player with)", () => {
    zero("Tenured Inkcaster", "Whenever a creature you control with a +1/+1 counter on it attacks, each opponent loses 1 life.");
    zero("Seasoned Warrenguard", "Whenever a creature you control attacks while you control a token, put a +1/+1 counter on this creature.");
    zero("Mongrel Pack", "When Mongrel Pack dies during combat, create four 1/1 green Hound creature tokens.");
    zero("Preacher of the Schism", "Whenever this creature attacks the player with the most life, draw a card.");
  });
  it("STILL detects the legit bare forms (no over-correction)", () => {
    // "another creature you control dies" — no 'or another', no restriction — is the modeled
    // otherCreatureYouControl death-watcher and must stay native.
    expect(detectTriggers(creature("Z", "Whenever another creature you control dies, draw a card.")).map((t) => t.event)).toEqual(["dies"]);
    expect(detectTriggers(creature("Z", "When this creature dies, draw a card.")).map((t) => t.event)).toEqual(["dies"]);
  });
});

describe("triggersForEvent", () => {
  const visionary = creature("Elvish Visionary", "When Elvish Visionary enters, draw a card.");
  const warden = creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life.");
  const state = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };

  it("fires a self trigger for the source's own event", () => {
    const src = perm(visionary, "user", "perm-1");
    const fired = triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: src });
    expect(fired).toHaveLength(1);
    // W4: the default payload is the Arbiter-safe manual no-op; the flush stage
    // (buildTriggerStack) parses the effectClause into a rich EffectProgram and
    // upgrades every faithfully-resolvable trigger.
    expect(fired[0].payload.resolver).toBe("manual");
    expect(fired[0].descriptor.effectClause).toMatch(/draw a card/i);
  });

  it("does NOT fire a self trigger for another permanent's event", () => {
    const src = perm(visionary, "user", "perm-1");
    const other = perm(creature("Bear", ""), "user", "perm-2");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: other })).toHaveLength(0);
  });

  it("fires an other-creature watcher when a DIFFERENT creature enters, not itself", () => {
    const src = perm(warden, "user", "perm-1");
    const other = perm(creature("Bear", ""), "ai", "perm-2");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: other })).toHaveLength(1);
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: src, triggeringPermanent: src })).toHaveLength(0);
  });

  it("gates a 'your upkeep' trigger to the active player", () => {
    const howler = creature("Howler", "At the beginning of your upkeep, draw a card.");
    const mine = perm(howler, "user", "perm-1");
    const theirs = perm(howler, "ai", "perm-2");
    expect(triggersForEvent(state, { event: "upkeep", sourcePermanent: mine })).toHaveLength(1); // user is active
    expect(triggersForEvent(state, { event: "upkeep", sourcePermanent: theirs })).toHaveLength(0); // ai not active
  });
});

describe("checkInterveningIf", () => {
  const state = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };
  const trig = (cond) => ({ controller: "user", descriptor: { interveningIf: cond } });

  it("passes when no condition", () => {
    expect(checkInterveningIf(state, trig(null))).toBe(true);
  });
  it("evaluates a life threshold", () => {
    expect(checkInterveningIf(state, trig("you have 40 or more life"))).toBe(true);  // user at 40
    expect(checkInterveningIf(state, trig("you have 50 or more life"))).toBe(false);
  });
  it("fails open on an unknown condition (never fabricates a 'doesn't fire')", () => {
    expect(checkInterveningIf(state, trig("the planar die shows chaos"))).toBe(true);
  });
});

// W4: the applyTriggerEffect describe was deleted with the naive Phase-1 lane — live trigger
// resolution goes through the EFFECT_PROGRAM interpreter (covered by the trigger wiring suites).

describe("flushTriggers — N-seat APNAP (CR 603.3b)", () => {
  it("orders triggers active-player-first across a 4-seat pod, FIFO within a seat", () => {
    const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const state = {
      ...base,
      activePlayer: "ai1",
      pendingTriggers: [
        { id: "t-ai2", controller: "ai2", source: { name: "x" }, payload: {} },
        { id: "t-user", controller: "user", source: { name: "y" }, payload: {} },
        { id: "t-ai1", controller: "ai1", source: { name: "z" }, payload: {} },
      ],
    };
    const out = flushTriggers(state);
    // turnOrder [user,ai1,ai2,ai3]; rotate to active ai1 -> [ai1,ai2,ai3,user]
    expect(out.stack.map(s => s.id)).toEqual(["t-ai1", "t-ai2", "t-user"]);
    expect(out.pendingTriggers).toEqual([]);
  });

  it("mints a deterministic stack id for a trigger without one and carries its payload", () => {
    const state = {
      ...createGameState({ userDeck: [], aiDeck: [] }),
      activePlayer: "user",
      pendingTriggers: [
        { controller: "user", source: { name: "x" }, payload: { resolver: "manual", params: { controller: "user", targets: [] } } },
      ],
    };
    const out = flushTriggers(state);
    expect(out.stack[0].id).toBe("stk-1");
    expect(out.idSeq).toBe(1);
    expect(out.stack[0].payload.resolver).toBe("manual");
  });
});

// ===== ANOTHER-SUBTYPE ETB — PR TRIG-COND (otherSubtypeYouControl / otherSubtypeAnywhere) =====
describe("detectTriggers — ANOTHER-SUBTYPE ETB", () => {
  it("detects 'another <Subtype> you control enters' as otherSubtypeYouControl", () => {
    const t = detectTriggers(creature("Youthful Valkyrie", "Whenever another Angel you control enters, put a +1/+1 counter on this creature."));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "etb", scope: "otherSubtypeYouControl", subtypeFilter: "Angel" });
  });

  it("detects 'another <Subtype> enters' (no you-control) as otherSubtypeAnywhere", () => {
    const t = detectTriggers(creature("Elvish Vanguard", "Whenever another Elf enters, put a +1/+1 counter on this creature."));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "etb", scope: "otherSubtypeAnywhere", subtypeFilter: "Elf" });
  });

  it("detects 'another Artifact you control enters' (card type via typeStr)", () => {
    const t = detectTriggers(creature("Glaze Fiend", "Whenever another artifact you control enters, this creature gets +2/+2 until end of turn."));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "etb", scope: "otherSubtypeYouControl", subtypeFilter: "Artifact" });
  });

  it("leaves NON_SUBTYPE_ETB_WORDS (outlaw/creature/permanent) UNDETECTED", () => {
    // "outlaw" is a CR-defined umbrella term, not a type-line token → FP if claimed native
    expect(detectTriggers(creature("Vial Smasher", "Whenever another outlaw you control enters, deal 1 damage to target opponent."))).toHaveLength(0);
    // "creature" routes via creatureSubjectScope — still detected but as a DIFFERENT scope (eachOtherCreature / otherCreatureYouControl)
    const cr = detectTriggers(creature("Soul Warden", "Whenever another creature enters the battlefield, you gain 1 life."));
    expect(cr[0].scope).toBe("eachOtherCreature");
    expect(cr[0].scope).not.toBe("otherSubtypeAnywhere");
  });
});

describe("triggersForEvent — ANOTHER-SUBTYPE ETB scope matching", () => {
  const state = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user" };

  it("otherSubtypeYouControl fires for your non-self creature with the subtype", () => {
    const valkyrie = perm(creature("Youthful Valkyrie", "Whenever another Angel you control enters, put a +1/+1 counter on this creature."), "user", "valk");
    const angel = perm(creature("Other Angel", "", { type: "Creature — Angel" }), "user", "angel");
    const fired = triggersForEvent(state, { event: "etb", sourcePermanent: valkyrie, triggeringPermanent: angel });
    expect(fired).toHaveLength(1);
  });

  it("otherSubtypeYouControl does NOT fire for opponent's creature of the subtype", () => {
    const valkyrie = perm(creature("Youthful Valkyrie", "Whenever another Angel you control enters, put a +1/+1 counter on this creature."), "user", "valk");
    const enemyAngel = perm(creature("Enemy Angel", "", { type: "Creature — Angel" }), "ai", "eangel");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: valkyrie, triggeringPermanent: enemyAngel })).toHaveLength(0);
  });

  it("otherSubtypeYouControl does NOT self-trigger even if source has the subtype", () => {
    const valk = perm(creature("Youthful Valkyrie", "Whenever another Angel you control enters, put a +1/+1 counter on this creature.", { type: "Creature — Angel Warrior" }), "user", "valk");
    // Valkyrie IS an Angel — but "another" means self-entry should NOT fire
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: valk, triggeringPermanent: valk })).toHaveLength(0);
  });

  it("otherSubtypeAnywhere fires for any player's creature with the subtype (not self)", () => {
    const vanguard = perm(creature("Elvish Vanguard", "Whenever another Elf enters, put a +1/+1 counter on this creature."), "user", "van");
    const elf = perm(creature("AI Elf", "", { type: "Creature — Elf Druid" }), "ai", "aelf");
    const myElf = perm(creature("My Elf", "", { type: "Creature — Elf Warrior" }), "user", "melf");
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: vanguard, triggeringPermanent: elf })).toHaveLength(1);
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: vanguard, triggeringPermanent: myElf })).toHaveLength(1);
    // Self-entry: Elvish Vanguard IS an Elf — but "another" excludes self
    expect(triggersForEvent(state, { event: "etb", sourcePermanent: vanguard, triggeringPermanent: vanguard })).toHaveLength(0);
  });
});
