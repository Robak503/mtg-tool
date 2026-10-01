/**
 * auraOwnTriggered.test.js — AURA-OWN-TRIGGERED abilities (BLITZ AU-3).
 *
 * An Aura whose whole body (the Enchant keyword line aside) is one-or-more TRIGGERED abilities PRINTED ON
 * THE AURA — the Aura is the trigger SOURCE (CR 603.2), not the granter. This is the sibling of the aura-own
 * ACTIVATED gate (isNativeOwnActivatedAura, Freed from the Real) with a trigger CONDITION in place of an
 * activation cost. classifyCard credits `native-trigger` via isNativeOwnTriggeredAura, which reuses
 * permanentTriggersCovered on the Enchant-stripped oracle — the SAME all-or-nothing gate the player-Aura lane
 * uses, so every printed trigger must (a) be detected, (b) route natively, and (c) leave no non-keyword residue.
 *
 * The runtime already fires these: checkStepTriggers / checkAttackTriggers / checkCombatDamageTriggers /
 * checkEnterTriggers all scan triggerSourcesOf (Auras included), scopeMatches gates the attached-host linkage
 * (scope:"equippedCreature") / the controller step (scope:"you") / the ETB (scope:"eachCreature"), and
 * buildTriggerStack threads sourceId = the Aura so an "enchanted creature" referent resolves to the host via
 * atomTargets → enchantedTargets (CR 303.4a). The combatDamageToPlayer attached-watcher fire is the SB-1
 * hardening saboteurDamagedPlayer.test.js already pins for Sigil of Sleep; this file adds the AU-3 coverage
 * credit + runtime pins for the upkeep / attacks / ETB / combat-damage shapes, and the CREED park guards.
 *
 * Oracle text is the real printed text (transcribed from the bundled Scryfall corpus — CLAUDE.md §1.2).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers, checkEnterTriggers, checkStepTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle text (bundled Scryfall corpus).
const ORACLE = {
  "Curiosity": "Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.",
  "Keen Sense": "Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.",
  "Ophidian Eye": "Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.",
  "Necromantic Thirst": "Enchant creature\nWhenever enchanted creature deals combat damage to a player, you may return target creature card from your graveyard to your hand.",
  "One with Nature": "Enchant creature\nWhenever enchanted creature deals combat damage to a player, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
  "Sigil of Sleep": "Enchant creature\nWhenever enchanted creature deals damage to a player, return target creature that player controls to its owner's hand.",
  "Extra Arms": "Enchant creature\nWhenever enchanted creature attacks, it deals 2 damage to any target.",
  "Mantle of Leadership": "Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nWhenever a creature enters, enchanted creature gets +2/+2 until end of turn.",
  "Curse of Chains": "Enchant creature\nAt the beginning of each upkeep, tap enchanted creature.",
  // CREED parks
  "Demonic Vigor": "Enchant creature\nEnchanted creature gets +1/+1.\nWhen enchanted creature dies, return that card to its owner's hand.",
  "Forced Adaptation": "Enchant creature\nAt the beginning of your upkeep, put a +1/+1 counter on enchanted creature.",
  "Bequeathal": "Enchant creature\nWhen enchanted creature dies, you draw two cards.",
  "Soul Bleed": "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player loses 1 life.",
  "On Thin Ice": "Enchant snow land you control\nWhen this Aura enters, exile target creature an opponent controls until this Aura leaves the battlefield.",
  // no-regression neighbours
  "Fraying Sanity": "Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.",
  "Ordeal of Heliod": "Enchant creature\nWhenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1 counters on it, sacrifice this Aura.\nWhen you sacrifice this Aura, you gain 10 life.",
  "Freed from the Real": "Enchant creature\n{U}: Tap enchanted creature.\n{U}: Untap enchanted creature.",
  "Sixth Sense": "Enchant creature\nEnchanted creature has \"Whenever this creature deals combat damage to a player, you may draw a card.\"",
  "Shiv's Embrace": "Enchant creature\nEnchanted creature gets +2/+2 and has flying.\n{R}: Enchanted creature gets +1/+0 until end of turn.",
};
const TYPE = { "On Thin Ice": "Snow Enchantment — Aura", "Fraying Sanity": "Enchantment — Aura Curse" };
const cardOf = (name) => ({ name, type: TYPE[name] || "Enchantment — Aura", oracle: ORACLE[name] });

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });

function auraPerm(id, name, controller = "user") {
  const c = cardOf(name);
  return createPermanent({ id, card: { id: `c-${id}`, name, type: c.type, oracle: c.oracle }, controller, summoningSick: false });
}
function creaturePerm(id, name, controller, over = {}) {
  return createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false, ...over });
}
function attach(host, aura) { host.attachments = [aura.id]; aura.attachedTo = host.id; }
function baseState(userBf, aiBf, over = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, activePlayer: "user",
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: userBf, life: 40 },
      ai: { ...s0.players.ai, battlefield: aiBf, life: 40 },
    },
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOGNITION — real oracle → native-trigger, descriptors detect + route
// ─────────────────────────────────────────────────────────────────────────────
describe("AU-3 recognition — aura-own triggers classify native-trigger", () => {
  const FLIPS = ["Curiosity", "Keen Sense", "Ophidian Eye", "Necromantic Thirst", "One with Nature",
    "Sigil of Sleep", "Extra Arms", "Mantle of Leadership", "Curse of Chains"];
  for (const name of FLIPS) {
    it(`${name} → native-trigger, every detected trigger routes natively`, () => {
      const c = cardOf(name);
      expect(classifyCard(c)).toBe("native-trigger");
      const d = detectTriggers(c);
      expect(d.length).toBeGreaterThan(0);
      expect(d.every(triggerRoutesNatively)).toBe(true);
    });
  }

  it("the aura-own trigger uses scope:'equippedCreature' (host linkage) or scope:'you' (controller step)", () => {
    expect(detectTriggers(cardOf("Sigil of Sleep"))[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "equippedCreature" });
    expect(detectTriggers(cardOf("Extra Arms"))[0]).toMatchObject({ event: "attacks", scope: "equippedCreature" });
    expect(detectTriggers(cardOf("Curse of Chains"))[0]).toMatchObject({ event: "upkeep", scope: "you" });
    expect(detectTriggers(cardOf("Mantle of Leadership"))[0]).toMatchObject({ event: "etb" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME — the Aura's own trigger FIRES on its event with the right referent
// ─────────────────────────────────────────────────────────────────────────────
describe("AU-3 runtime — combat-damage aura triggers fire off the host connecting", () => {
  function combatSim(name) {
    const host = creaturePerm("host", "Runeclaw Bear", "user");
    const aura = auraPerm("aura", name, "user");
    attach(host, aura);
    const aiCreature = creaturePerm("aic", "Grizzly Bears", "ai");
    let s = baseState([host, aura], [aiCreature], {
      phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    s.players.user.library = [{ id: "lib1", name: "Island", type: "Basic Land — Island", oracle: "" }];
    s = resolveCombatDamage(s);
    return s;
  }

  it("Sigil of Sleep: host connects → the AURA bounces the damaged player's creature (mandatory)", () => {
    let s = combatSim("Sigil of Sleep");
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "combatDamageToPlayer")).toHaveLength(1);
    s = resolveAll(flush(s));
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false); // bounced
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Grizzly Bears");
  });

  it("Curiosity: host connects → the AURA's optional draw fires; accepting draws a card", () => {
    let s = combatSim("Curiosity");
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "combatDamageToPlayer")).toHaveLength(1);
    s = resolveAll(flush(s));
    expect(s.pendingChoice?.kind).toBe("optional-effect"); // the "you may draw a card"
    const handBefore = s.players.user.hand.length;
    s = resolveAll(resolveOptionalChoice(s, true));
    expect(s.players.user.hand.length).toBe(handBefore + 1);
  });

  it("CREED no-leak: an unrelated attacker (not the enchanted host) does NOT fire the aura's cdmg trigger", () => {
    const host = creaturePerm("host", "Runeclaw Bear", "user");
    const sigil = auraPerm("sigil", "Sigil of Sleep", "user");
    attach(host, sigil);
    const other = creaturePerm("other", "Hill Giant", "user"); // a DIFFERENT attacker, unenchanted
    const aiCreature = creaturePerm("aic", "Grizzly Bears", "ai");
    let s = baseState([host, sigil, other], [aiCreature], {
      phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "other", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    s = resolveCombatDamage(s);
    // the aura watches ONLY its host (scope equippedCreature); a non-host attacker connecting must not fire it
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "combatDamageToPlayer")).toHaveLength(0);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true); // never bounced
  });
});

describe("AU-3 runtime — attacks / ETB / upkeep aura triggers", () => {
  it("Extra Arms: host attacks → the AURA deals 2 damage (kills the AI's 2/2 via SBA)", () => {
    const host = creaturePerm("host", "Runeclaw Bear", "user");
    const aura = auraPerm("aura", "Extra Arms", "user");
    attach(host, aura);
    const aiCreature = creaturePerm("aic", "Grizzly Bears", "ai");
    let s = baseState([host, aura], [aiCreature], {
      phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    });
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "attacks")).toHaveLength(1);
    s = resolveAll(flush(s));
    expect(s.players.ai.battlefield.some((p) => p.id === "aic")).toBe(false); // 2 damage on a 2/2 → dead
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
  });

  it("Mantle of Leadership: a creature enters → the AURA pumps its host +2/+2 until EOT", () => {
    const host = creaturePerm("host", "Runeclaw Bear", "user");
    const aura = auraPerm("aura", "Mantle of Leadership", "user");
    attach(host, aura);
    const entering = creaturePerm("ent", "Grizzly Bears", "user");
    let s = baseState([host, aura, entering], []);
    s = checkEnterTriggers(s, entering);
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb")).toHaveLength(1);
    s = resolveAll(flush(s));
    expect(permanentPower(s, "host")).toBe(4);
    expect(permanentToughness(s, "host")).toBe(4);
  });

  it("Curse of Chains: at the beginning of upkeep, the AURA taps its enchanted host", () => {
    const host = creaturePerm("host", "Runeclaw Bear", "user", { tapped: false });
    const aura = auraPerm("aura", "Curse of Chains", "user");
    attach(host, aura);
    let s = baseState([host, aura], [], { phase: "upkeep", step: "upkeep" });
    s = checkStepTriggers(s, "upkeep");
    expect((s.pendingTriggers || []).filter((t) => t.descriptor?.event === "upkeep")).toHaveLength(1);
    s = resolveAll(flush(s));
    expect(findPermanent(s, "host").permanent.tapped).toBe(true);
  });

  it("CREED no-leak: a DETACHED aura's upkeep tap resolves to a clean no-op (no host)", () => {
    const aura = auraPerm("aura", "Curse of Chains", "user"); // no attachedTo → enchantedTargets → []
    let s = baseState([aura], [], { phase: "upkeep", step: "upkeep" });
    s = checkStepTriggers(s, "upkeep");
    s = resolveAll(flush(s)); // must not throw / fabricate a tap
    expect((s.stack || []).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREED park guards — whole-card-or-park; false-positive forbidden
// ─────────────────────────────────────────────────────────────────────────────
describe("AU-3 CREED — false-negative-SAFE parks stay on the Arbiter", () => {
  it("a static bonus alongside the trigger is residue → body-only (Demonic Vigor: +1/+1 + dies-return)", () => {
    // "Enchanted creature gets +1/+1." is non-keyword residue AND the dies trigger isn't detected on an aura;
    // both keep it Arbiter.
    expect(classifyCard(cardOf("Demonic Vigor"))).toBe("body-only");
  });

  it("GRADUATED — 'put a +1/+1 counter on ENCHANTED CREATURE' now routes (Forced Adaptation)", () => {
    // This pin asserted body-only BECAUSE the counter atom parser rejected target:'enchanted'. That was a
    // statement about a missing capability, not a refusal to keep — so it graduates the same way the
    // Bequeathal pin below did, the moment the referent arm landed. Exactly its job.
    //
    // The CREED guarantee it protected is unchanged and is asserted where it actually lives now: the counter
    // must land on the HOST, and a DETACHED aura must fabricate nothing (both pinned in levelUpAura.test.js).
    const c = cardOf("Forced Adaptation");
    expect(detectTriggers(c).every(triggerRoutesNatively)).toBe(true);
    expect(classifyCard(c)).toBe("native-trigger");
  });

  it("an unrouted effect still parks the whole card (Endless Evil: a copy of enchanted creature, except the token is 1/1)", () => {
    // The park guarantee this describes is real and must keep a live fixture. Followed Footsteps held it until P·30 (its plain
    // copy of the enchanted creature routes now — the GRADUATED pin below); Endless Evil's "except the token is 1/1" rider has
    // no route, so its upkeep trigger parks and the whole card stays body-only — a SAFE false-negative.
    const c = { name: "Endless Evil", type: "Enchantment — Aura", mana: "{2}{U}", oracle: "Enchant creature you control\nAt the beginning of your upkeep, create a token that's a copy of enchanted creature, except the token is 1/1.\nWhen enchanted creature dies, if that creature was a Horror, return this card to its owner's hand." };
    expect(triggerRoutesNatively(detectTriggers(c).find((t) => t.event === "upkeep"))).toBe(false);
    expect(classifyCard(c)).toBe("body-only");
  });

  it("GRADUATED — Followed Footsteps' copy of the enchanted creature routes (P·30: the attached referent)", () => {
    const c = { name: "Followed Footsteps", type: "Enchantment — Aura", mana: "{3}{U}{U}", oracle: "Enchant creature\nAt the beginning of your upkeep, create a token that's a copy of enchanted creature." };
    expect(detectTriggers(c).every(triggerRoutesNatively)).toBe(true);
    expect(classifyCard(c)).toBe("native-trigger");
  });

  it("GRADUATED — the aura-own DIES trigger IS now detected (Bequeathal)", () => {
    // This pin asserted the opposite and fired the moment the detector arm landed, which is exactly its job.
    // "When enchanted creature dies, you draw two cards." now routes through the SAME equippedCreature
    // attached-linkage scope the "enchanted creature attacks" / "…deals combat damage" arms already use: on
    // the host's death the aura is already detached, so scopeMatches reads the linkage from the dead
    // creature's CR-603.10a look-back `attachments`.
    //
    // The bar this pin enforced — an aura is credited only when its body is DETECTED and ROUTED — is
    // unchanged and still met; the dies condition simply has a detector now. The tests around it still
    // hold the line for the shapes that genuinely have none (Forced Adaptation, On Thin Ice — Soul Bleed
    // graduated 2026-08-12 with the enchanted-controller's-upkeep event).
    const d = detectTriggers(cardOf("Bequeathal"));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "dies", scope: "equippedCreature" });
    expect(classifyCard(cardOf("Bequeathal"))).toMatch(/^native/);
  });

  it("⭐ GRADUATED (2026-08-12): the enchanted-CONTROLLER's-upkeep scope IS modeled now (Soul Bleed)", () => {
    // This pin guarded "a scoped upkeep referent detectTriggers doesn't detect → body-only" until the
    // ENCHANTED-CONTROLLER'S UPKEEP event landed (enchantedControllersUpkeep flag: host-controller firing
    // gate + the shared "that player" → "the upkeep player" sentinel). The bar the park enforced —
    // credited only when detected AND routed — is unchanged and now MET; the runtime pins (host-seat
    // firing, wrong-upkeep silence, unattached silence) live in auraEnchantedControllersUpkeep.test.js.
    const d = detectTriggers(cardOf("Soul Bleed"));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "upkeep", whose: "any", enchantedControllersUpkeep: true });
    expect(classifyCard(cardOf("Soul Bleed"))).toMatch(/^native/);
  });

  it("a linked exile-until-leaves ETB effect on an AURA is modeled since SHELF-85 V15 (2026-09-04) — On Thin Ice is native-trigger; lightPawsAuras.test.js owns the detain-Aura pins", () => {
    // The detain frame's noun alternation learned "aura" ("until this Aura leaves the battlefield"); the link is keyed on
    // the source permanent's id, so the Aura's own exit (its host dying takes it along) returns the card.
    expect(classifyCard(cardOf("On Thin Ice"))).toBe("native-trigger");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NO-REGRESSION — the sibling aura lanes keep their tiers + cast branches
// ─────────────────────────────────────────────────────────────────────────────
describe("AU-3 no-regression — the neighbouring aura lanes are undisturbed", () => {
  it("player-enchant Auras stay native-aura (their own per-player cast lane)", () => {
    expect(classifyCard(cardOf("Fraying Sanity"))).toBe("native-aura");
  });
  it("Ordeal auras stay native-trigger (their own two-descriptor lane)", () => {
    expect(classifyCard(cardOf("Ordeal of Heliod"))).toBe("native-trigger");
  });
  it("aura-own ACTIVATED stays native-activated (Freed from the Real)", () => {
    expect(classifyCard(cardOf("Freed from the Real"))).toBe("native-activated");
  });
  it("granted-triggered auras stay native-trigger (Sixth Sense — grants the host)", () => {
    expect(classifyCard(cardOf("Sixth Sense"))).toBe("native-trigger");
  });
  it("a full static-bonus aura stays native-aura (Shiv's Embrace)", () => {
    expect(classifyCard(cardOf("Shiv's Embrace"))).toBe("native-aura");
  });
});
