/**
 * saboteurReanimate.test.js — BLITZ SB-2: DAMAGED-PLAYER REANIMATE (CR 510.2 / 608.2c / 506.2a).
 *
 * "Whenever this creature deals combat damage to a player, you may put target creature card from that
 * player's graveyard onto the battlefield under your control" — the saboteur GRAVEYARD THEFT, the
 * fast-follow SB-1 parked as composable. Ink-Eyes, Servant of Oni and Scion of Darkness are the ONLY
 * corpus carriers of this exact anchored shape (enumerated against bundled Scryfall, 2026-07-16).
 *
 * COMPOSITION (no new machinery classes — three existing vehicles joined):
 *   • SB-1's damagedPlayerGraveyard pool — atomTargetSpec carries it; spellEffects.addGraveyardCards
 *     enumerates ONLY ctx.damagedPlayerId's graveyard (absent referent → EMPTY pool, never a wrong
 *     graveyard); the atom-level who:"damagedPlayer" pins the combat referent so the trigger routes
 *     natively ONLY off combatDamageToPlayer (triggerRouting.combatDamageReferentSatisfied) and a SPELL
 *     carrying the clause stays Arbiter (coverage's combat-referent spell guard).
 *   • The REANIMATE-FROM-ANY cross-zone resolver (applyReanimate → enterCardFromZone, the Ashen Powder /
 *     Hymn of Rebirth vehicle) — fromPlayerId routes the removal to the damaged player's graveyard while
 *     the permanent enters under the TRIGGER CONTROLLER's battlefield.
 *   • The α2 "you may" optional wrapper (take/decline at flush, exactly the Mistblade Shinobi flow).
 * Enemy-side intent: the pool holds only the just-combat-damaged player's cards, and a defending player
 * is always one of the attacking player's opponents (CR 506.2a — the SB-1 rationale).
 *
 * NEW (owner discipline, CR 110.2 / 404.1 / 700.4): enterCardFromZone stamps `owner` on a CROSS-PLAYER
 * entry (the card's owner is the graveyard holder — a player's graveyard contains only their own cards,
 * CR 404.1), and gameState.moveCardToZone (the single battlefield-exit chokepoint every death/bounce/tuck
 * funnels through) routes the unwrapped card to its OWNER's destination zone — so a stolen creature that
 * dies again lands in its OWNER's graveyard ("is put on top of its owner's graveyard", CR 404.1), never
 * the thief's. A same-player entry stamps nothing → byte-identical everywhere else.
 *
 * WHOLE-CARD LAW (probed on real oracle): Ink-Eyes' Ninjutsu line is keyword-only residue (KW-NINJUTSU,
 * the SB-1 Skullsnatcher precedent) and its "{1}{B}: Regenerate Ink-Eyes." is a modeled regenerate
 * activated ability (the Kjeldoran Dead class — name self-reference included) → native-mixed. Scion of
 * Darkness' Trample + "Cycling {3}" are modeled residue → native-trigger. GAINED (flip-diff, LOST=0):
 * Ink-Eyes, Servant of Oni; Scion of Darkness. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 *
 * PARKS (real near-miss variants pinned LOW below): Zareth San, the Trickster ("target PERMANENT card" +
 * a nonstandard put-from-hand activated line), Shark Shredder, Killer Clone ("up to one" + "enters tapped
 * and attacking that player" rider), Fire Nation Salvagers (group trigger + "creature or Vehicle card"),
 * Sepulchral Primordial / The Dead Shall Serve / Geth's Summons (for-each-opponent multi-referent, not
 * the combat referent), Grasping Tentacles (non-targeted, artifact, spell).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { enterCardFromZone, applyExileUntilLeaves } from "./effects/atoms/zones.js";
import { enumerateTargets } from "./spellEffects.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const NINJUTSU = "Ninjutsu {3}{B}{B} ({3}{B}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)";
const THEFT = "you may put target creature card from that player's graveyard onto the battlefield under your control";
const INK_EYES_ORACLE = `${NINJUTSU}\nWhenever Ink-Eyes deals combat damage to a player, ${THEFT}.\n{1}{B}: Regenerate Ink-Eyes.`;
const SCION_ORACLE = `Trample\nWhenever this creature deals combat damage to a player, ${THEFT}.\nCycling {3} ({3}, Discard this card: Draw a card.)`;

const INK_EYES = { name: "Ink-Eyes, Servant of Oni", type: "Legendary Creature — Rat Ninja", mana: "{4}{B}{B}", power: 5, toughness: 4, oracle: INK_EYES_ORACLE };
const SCION = { name: "Scion of Darkness", type: "Creature — Avatar", mana: "{5}{B}{B}{B}", power: 6, toughness: 6, oracle: SCION_ORACLE };

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 30) st = resolveTopOfStack(st); return st; };

// A combat-damage-step 2P state: `user` attacking `ai` with the given battlefield + ai graveyard.
function combatState({ user = [], ai = [], aiGraveyard = [], attackers = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, activePlayer: "user", phase: "combat", step: "combat-damage",
    combat: { attackers, blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, life: 40 },
      ai: { ...s0.players.ai, battlefield: ai, graveyard: aiGraveyard, life: 40 },
    },
  };
}
const perm = (id, name, oracle, { controller = "user", power = 5, toughness = 4, type = "Creature — Rat Ninja" } = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, power, toughness, oracle }, controller, summoningSick: false });
const gyCreature = (id, name, { power = 2, toughness = 2 } = {}) => ({ id, name, type: "Creature — Bear", power, toughness, oracle: "" });
const gyInstant = (id, name) => ({ id, name, type: "Instant", oracle: "" });

// ─────────────────────────────────────────────────────────────────────────────
// Parser — the theft atom (composition of SB-1's pool + the reanimate vehicle)
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 parser — damaged-player reanimate atom", () => {
  it("'you may put target creature card from that player's graveyard onto the battlefield under your control' → optional damagedPlayer reanimate", () => {
    const p = parseEffectClause(THEFT, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "reanimate", targetType: "graveyardCard", cardFilter: "creature",
      damagedPlayerGraveyard: true, who: "damagedPlayer", optional: true,
    }]);
  });

  it("the mandatory form parses too (no 'you may' → no optional flag)", () => {
    const p = parseEffectClause("put target creature card from that player's graveyard onto the battlefield under your control", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).not.toHaveProperty("optional");
  });

  it("intent: enemy-side (the pool holds only the damaged opponent's cards — CR 506.2a)", () => {
    const atom = parseEffectClause(THEFT, "Instant").atoms[0];
    expect(atomTargetIntent(atom)).toBe("enemy");
    // The opponent's-graveyard reanimate stays ambiguous (unchanged — the Ashen Powder discipline).
    expect(atomTargetIntent({ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true })).toBe("ambiguous");
    // From ANY graveyard under your control reads "any" since the 09-06 plan's stage ③ · 39 (2026-09-30): every pick helps the
    // controller, so there is no side to prove (anyGraveyardReanimate.test.js).
    expect(atomTargetIntent({ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true })).toBe("any");
  });

  it("FN guards: REAL corpus near-miss variants stay LOW (exact anchors)", () => {
    for (const clause of [
      "put target permanent card from that player's graveyard onto the battlefield under your control",                                  // Zareth San — permanent filter
      "put up to one target creature card from that player's graveyard onto the battlefield under your control",                         // Shark Shredder — un-evidenced count
      "put target creature or vehicle card from that player's graveyard onto the battlefield under your control",                        // Fire Nation Salvagers — union filter
      "put target card from that player's graveyard onto the battlefield under your control",                                            // no creature filter
      "put target creature card from that player's graveyard onto the battlefield under your control tapped",                            // tapped rider
      "put target creature card from that player's graveyard onto the battlefield under its owner's control",                            // wrong controller clause
    ]) {
      expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classification — the GAINED pair by name + the CREED guards
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 classification — Ink-Eyes / Scion of Darkness flip (whole-card law)", () => {
  it("Ink-Eyes, Servant of Oni → native-mixed (ninjutsu = keyword residue; regenerate activated is modeled)", () => {
    expect(classifyCard(INK_EYES)).toBe("native-mixed");
    expect(isNativeTier(classifyCard(INK_EYES))).toBe(true);
  });

  it("Scion of Darkness → native-trigger (trample + cycling are modeled residue)", () => {
    expect(classifyCard(SCION)).toBe("native-trigger");
    expect(isNativeTier(classifyCard(SCION))).toBe(true);
  });

  it("evidence: each carrier's residue lines clear natively WITHOUT the trigger (whole-card audit)", () => {
    expect(classifyCard({ ...INK_EYES, oracle: `${NINJUTSU}\n{1}{B}: Regenerate Ink-Eyes.` })).toBe("native-activated");
    expect(classifyCard({ ...SCION, oracle: "Trample\nCycling {3} ({3}, Discard this card: Draw a card.)" })).toBe("native-body");
  });

  it("both triggers detect on the combatDamageToPlayer event (Ink-Eyes' name self-reference included)", () => {
    for (const card of [INK_EYES, SCION]) {
      const d = detectTriggers(card);
      expect(d).toEqual([expect.objectContaining({ event: "combatDamageToPlayer", scope: "self", optional: true })]);
      expect(d.every(triggerRoutesNatively)).toBe(true);
    }
  });

  it("CREED: a SPELL carrying the theft clause stays arbiter-spell (no combat referent at cast)", () => {
    expect(classifyCard({ name: "Fake Theft", type: "Sorcery", mana: "{3}{B}", oracle: "Put target creature card from that player's graveyard onto the battlefield under your control." })).toBe("arbiter-spell");
  });

  it("CREED: the theft routes native ONLY on combatDamageToPlayer (referent gate)", () => {
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", effectClause: THEFT })).toBe(true);
    expect(triggerRoutesNatively({ event: "attacks", effectClause: THEFT })).toBe(false);
    expect(triggerRoutesNatively({ event: "etb", effectClause: THEFT })).toBe(false);
  });

  it("CREED: the real Zareth San / Sepulchral Primordial park (permanent filter / for-each multi-referent)", () => {
    const zareth = { name: "Zareth San, the Trickster", type: "Legendary Creature — Merfolk Rogue", mana: "{2}{U}{B}", power: 4, toughness: 4, oracle: "Flash\n{2}{U}{B}, Return an unblocked attacking Rogue you control to its owner's hand: Put this card from your hand onto the battlefield tapped and attacking.\nWhenever Zareth San deals combat damage to a player, you may put target permanent card from that player's graveyard onto the battlefield under your control." };
    const sepulchral = { name: "Sepulchral Primordial", type: "Creature — Avatar", mana: "{5}{B}{B}", power: 5, toughness: 4, oracle: "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhen this creature enters, for each opponent, you may put up to one target creature card from that player's graveyard onto the battlefield under your control." };
    expect(isNativeTier(classifyCard(zareth))).toBe(false);
    expect(isNativeTier(classifyCard(sepulchral))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Enumeration — multiplayer isolation (the pool is EXACTLY the damaged player's creature cards)
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 enumeration — damagedPlayer graveyard scoping", () => {
  const threePlayer = () => ({ players: {
    user: { battlefield: [], graveyard: [gyCreature("ug1", "User Bear")] },
    ai1: { battlefield: [], graveyard: [gyCreature("g1a", "AI1 Bear"), gyInstant("g1b", "AI1 Bolt")] },
    ai2: { battlefield: [], graveyard: [gyCreature("g2a", "AI2 Bear")] },
  } });
  const spec = { kind: "return-gy", targetType: "graveyardCard", cardFilter: "creature", damagedPlayerGraveyard: true };

  it("only the damaged player's CREATURE cards are legal (the instant is filtered out)", () => {
    expect(enumerateTargets(threePlayer(), "user", spec, [], { damagedPlayerId: "ai1" }).map((t) => t.name)).toEqual(["AI1 Bear"]);
    expect(enumerateTargets(threePlayer(), "user", spec, [], { damagedPlayerId: "ai2" }).map((t) => t.name)).toEqual(["AI2 Bear"]);
  });

  it("absent referent → EMPTY pool (never the controller's or a bystander's graveyard)", () => {
    expect(enumerateTargets(threePlayer(), "user", spec, [], {})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — end-to-end through the REAL combat-damage chokepoint
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 runtime — Ink-Eyes (optional damaged-player reanimate)", () => {
  const setup = (aiGraveyard) => {
    const ink = perm("ink", "Ink-Eyes, Servant of Oni", INK_EYES_ORACLE, { type: "Legendary Creature — Rat Ninja" });
    let s = combatState({ user: [ink], ai: [], aiGraveyard, attackers: [{ permanentId: "ink", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(35); // 5 combat damage connected
    return resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
  };

  it("take: the 'you may' pauses, then the creature enters under the ATTACKER's control from the damaged player's graveyard", () => {
    let s = setup([gyCreature("gb", "Grizzly Bears"), gyInstant("bolt", "Some Bolt")]);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveAll(resolveOptionalChoice(s, true));
    const stolen = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect(stolen).toBeTruthy();
    expect(stolen.controller).toBe("user");
    expect(stolen.summoningSick).toBe(true);              // a fresh non-cast entry is summoning sick
    expect(stolen.owner).toBe("ai");                      // CR 110.2 — owner ≠ controller, stamped for exit routing
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Some Bolt"]); // only the creature left
    expect(s.players.ai.battlefield).toHaveLength(0);     // it did NOT enter the damaged player's battlefield
  });

  it("decline: nothing moves", () => {
    let s = setup([gyCreature("gb", "Grizzly Bears")]);
    s = resolveAll(resolveOptionalChoice(s, false));
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Grizzly Bears"]);
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false);
  });

  it("no legal target (graveyard holds only non-creatures) → trigger removed, no crash, nothing fabricated", () => {
    const s = setup([gyInstant("bolt", "Some Bolt")]);
    expect(s.pendingChoice).toBeFalsy();
    expect((s.log || []).some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Some Bolt"]);
  });

  it("the CONTROLLER's own graveyard is never pooled", () => {
    const ink = perm("ink", "Ink-Eyes, Servant of Oni", INK_EYES_ORACLE, { type: "Legendary Creature — Rat Ninja" });
    let s = combatState({ user: [ink], ai: [], aiGraveyard: [], attackers: [{ permanentId: "ink", attackingPlayer: "user", defender: "ai" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [gyCreature("mine", "My Bear")] } } };
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice).toBeFalsy(); // no legal target — the controller's own bear is not in the pool
    expect((s.log || []).some((e) => e.kind === "trigger-removed-no-target")).toBe(true);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["My Bear"]); // untouched
  });

  it("Scion of Darkness fires the same flow (the second carrier)", () => {
    const scion = perm("scion", "Scion of Darkness", SCION_ORACLE, { type: "Creature — Avatar", power: 6, toughness: 6 });
    let s = combatState({ user: [scion], ai: [], aiGraveyard: [gyCreature("gb", "Grizzly Bears")], attackers: [{ permanentId: "scion", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(34);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveAll(resolveOptionalChoice(s, true));
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true);
    expect(s.players.ai.graveyard).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Owner discipline — the stolen card's later exits route to its OWNER (CR 404.1 / 700.4)
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 owner routing — dies-again goes to its OWNER's graveyard", () => {
  const steal = () => {
    const ink = perm("ink", "Ink-Eyes, Servant of Oni", INK_EYES_ORACLE, { type: "Legendary Creature — Rat Ninja" });
    let s = combatState({ user: [ink], ai: [], aiGraveyard: [gyCreature("gb", "Grizzly Bears")], attackers: [{ permanentId: "ink", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    return resolveAll(resolveOptionalChoice(s, true));
  };

  it("lethal damage on the stolen creature → the card lands in the DAMAGED PLAYER's graveyard, not the thief's", () => {
    let s = steal();
    const stolen = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === stolen.id ? { ...p, damageMarked: 99 } : p) } } };
    const { state: after, dead } = destroyLethalCreatures(s);
    expect(dead.map((d) => d.name)).toEqual(["Grizzly Bears"]);
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(false);
    expect(after.players.user.graveyard).toHaveLength(0);                       // NOT the thief's graveyard
    expect(after.players.ai.graveyard.map((c) => c.name)).toEqual(["Grizzly Bears"]); // the owner's (CR 404.1)
  });

  it("a same-player entry stamps NO owner field (byte-identical fast path)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: [gyCreature("own", "Own Bear")] } } };
    const { state: after, entered } = enterCardFromZone(s, { playerId: "user", cardId: "own", fromZone: "graveyard" });
    expect(entered).toBe(true);
    const p = after.players.user.battlefield.find((x) => x.card?.name === "Own Bear");
    expect(p).not.toHaveProperty("owner");
  });

  it("a cross-player entry stamps owner = the graveyard holder", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, graveyard: [gyCreature("theirs", "Their Bear")] } } };
    const { state: after, entered } = enterCardFromZone(s, { playerId: "user", cardId: "theirs", fromZone: "graveyard", fromPlayerId: "ai" });
    expect(entered).toBe(true);
    const p = after.players.user.battlefield.find((x) => x.card?.name === "Their Bear");
    expect(p.owner).toBe("ai");
    expect(p.controller).toBe("user");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OWNER-LINK desk completion — a STOLEN permanent detained by an exile-until-
// leaves effect must stay findable: the link records the OWNER (where the
// owner-routed exile card physically lands), so the CR 610.3 return one-shot
// connects instead of stranding the card in exile forever.
// ─────────────────────────────────────────────────────────────────────────────
describe("SB-2 owner-link — detaining a stolen creature keeps the return connected", () => {
  const stealBear = () => {
    const ink = perm("ink2", "Ink-Eyes, Servant of Oni", INK_EYES_ORACLE, { type: "Legendary Creature — Rat Ninja" });
    let s = combatState({ user: [ink], ai: [], aiGraveyard: [gyCreature("gb2", "Grizzly Bears")], attackers: [{ permanentId: "ink2", attackingPlayer: "user", defender: "ai" }] });
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    return resolveAll(resolveOptionalChoice(s, true));
  };

  it("the detain link records the OWNER, the card lands in the OWNER's exile, and the return lookup connects", () => {
    let s = stealBear();
    const stolen = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect(stolen.owner).toBe("ai");
    // Detain the stolen bear with a user-controlled Banishing-Light-class source.
    const src = perm("bl", "Banishing Light", "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.", { type: "Enchantment" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, src] } } };
    s = applyExileUntilLeaves(s, { op: "exile-until-leaves" }, { controller: "user", sourceId: "bl", targets: [{ type: "creature", id: stolen.id }] });
    // The card was OWNER-routed to the AI's exile, and the link records the owner (not the thief).
    expect(s.players.user.exile.some((c) => c.name === "Grizzly Bears")).toBe(false);
    expect(s.players.ai.exile.map((c) => c.name)).toEqual(["Grizzly Bears"]);
    const link = (s.players.user.battlefield.find((p) => p.id === "bl")?.detainedExile || [])[0];
    expect(link).toMatchObject({ ownerId: "ai" });
    // The return path's exact lookup (enterCardFromZone on the link fields) CONNECTS — under the owner.
    const { state: after, entered } = enterCardFromZone(s, { playerId: link.ownerId, cardId: link.cardId, fromZone: "exile" });
    expect(entered).toBe(true);
    expect(after.players.ai.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true); // the owner's board
    expect(after.players.ai.exile).toHaveLength(0);
  });
});
