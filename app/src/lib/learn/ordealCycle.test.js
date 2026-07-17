/**
 * ordealCycle.test.js — BLITZ OC-1: the Theros ORDEAL cycle (Ordeal of Thassa / Nylea / Purphoros /
 * Heliod / Erebos), modeled whole-card:
 *
 *   "Enchant creature
 *    Whenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1
 *    counters on it, sacrifice this Aura.
 *    When you sacrifice this Aura, [payoff]."
 *
 * The three new seams, each pinned here:
 *   - "enchanted creature attacks" → the attacks/equippedCreature attached-linkage descriptor (CR 508.3a),
 *     with the whole two-sentence effect rewritten to the triggering-creature counter sentinel + the
 *     [ordeal-threshold-sac] marker (CR 608.2c — instructions in the order written: counter FIRST, then
 *     the threshold check counts ALL the host's +1/+1 counters, the just-placed one included);
 *   - the ordeal-threshold-sac atom (atoms/removal.js) — host at 3+ +1/+1 counters → the SOURCE Aura
 *     sacrifices itself through the shared sacrificeCreatureEffect chokepoint (CR 701.21a);
 *   - "When you sacrifice this Aura, <payoff>" → the youSacrificeThis descriptor, fired ONLY from the
 *     sacrifice chokepoint's look-back (CR 603.10a — sacrifice triggers look back in time) — NEVER on a
 *     non-sacrifice exit (destroyed, or the host-died falls-off SBA, CR 704.5m).
 *
 * Cast lane: isNativeOrdealAura gates the SAME native aura cast (legalChoices offer + actionDispatcher
 * AURA_ETB) the metric awards, so the offer and the native-trigger claim can't drift.
 *
 * Real oracle fixtures (bundled Scryfall, 2026-07-16); all five carriers audited by name in the OC-1
 * flip-diff. CREED boundaries pinned: a different threshold, an unroutable payoff, an LTB-worded exit
 * line, and the real near-family card (Disturbing Mirth) all stay body-only / parked.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { sacrificeCreatureEffect, ordealThresholdSacClauseParser } from "./effects/atoms/removal.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard, isNativeOrdealAura } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// REAL current Oracle wording (verified against the bundled corpus, 2026-07-16).
const ORDEAL_MIDDLE = "Whenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has three or more +1/+1 counters on it, sacrifice this Aura.";
const ordeal = (name, payoff, id = "aura") => ({
  id, name, type: "Enchantment — Aura", mana: "{W}", cmc: 1,
  oracle: `Enchant creature\n${ORDEAL_MIDDLE}\nWhen you sacrifice this Aura, ${payoff}`,
});
const HELIOD = ordeal("Ordeal of Heliod", "you gain 10 life.");
const THASSA = ordeal("Ordeal of Thassa", "draw two cards.");
const NYLEA = ordeal("Ordeal of Nylea", "search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.");
const PURPHOROS = ordeal("Ordeal of Purphoros", "it deals 3 damage to any target.");
const EREBOS = ordeal("Ordeal of Erebos", "target player discards two cards.");
const DISTURBING_MIRTH = { name: "Disturbing Mirth", type: "Enchantment",
  oracle: "When this enchantment enters, you may sacrifice another enchantment or creature. If you do, draw two cards.\nWhen you sacrifice this enchantment, manifest dread." };

const bearCard = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
function board({ user = [], ai = [], hand = [], userLib = [], activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer, priorityHolder: activePlayer, consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, library: userLib, manaPool: { ...s.players.user.manaPool, W: 3 } },
      ai: { ...s.players.ai, battlefield: ai } } };
}
// A host + attached Ordeal, linked both ways, with `n` pre-placed +1/+1 counters on the host.
function enchantedHost(card, { n = 0, hostController = "user", auraController = "user" } = {}) {
  const host = createPermanent({ id: "host", card: { id: "host", ...bearCard }, controller: hostController });
  host.summoningSick = false;
  host.attachments = ["aura"];
  if (n) host.counters = { "+1/+1": n };
  const aura = createPermanent({ id: "aura", card: { id: "aura", ...card }, controller: auraController });
  aura.attachedTo = "host";
  return { host, aura };
}
const settle = (s) => {
  let guard = 0;
  while ((s.stack?.length || s.pendingTriggers?.length) && !s.pendingChoice && guard++ < 30) {
    if (s.stack?.length) s = resolveTopOfStack(s);
    else s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  }
  return s;
};
const attack = (s, permanentId, attackingPlayer = "user", defender = "ai") =>
  checkAttackTriggers({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId, attackingPlayer, defender }], blockers: [] } });

describe("OC-1 recognition — the five Ordeals flip native-trigger; both descriptors route", () => {
  it("all five carriers (real oracles) classify native-trigger", () => {
    for (const c of [HELIOD, THASSA, NYLEA, PURPHOROS, EREBOS]) {
      expect(isNativeOrdealAura(c)).toBe(true);
      expect(classifyCard(c)).toBe("native-trigger");
    }
  });
  it("detectTriggers yields the attacks/equippedCreature pair + youSacrificeThis, both native", () => {
    const d = detectTriggers(HELIOD);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "equippedCreature" });
    expect(d[0].effectClause).toBe("put a +1/+1 counter on the triggering creature. [ordeal-threshold-sac] sacrifice this aura if the triggering creature has three or more +1/+1 counters on it");
    expect(d[1]).toMatchObject({ event: "youSacrificeThis", scope: "self", effectClause: "you gain 10 life" });
    expect(d.every((x) => !!triggerRoutesNatively(x))).toBe(true);
  });
  it("the [ordeal-threshold-sac] sentinel parses to the atom; raw printed text never does", () => {
    expect(ordealThresholdSacClauseParser("[ordeal-threshold-sac] sacrifice this aura if the triggering creature has three or more +1/+1 counters on it"))
      .toEqual({ op: "ordeal-threshold-sac", counterType: "+1/+1", threshold: 3 });
    // The raw printed second sentence (no sentinel) parses nothing — a spell can never reach the atom.
    expect(ordealThresholdSacClauseParser("Then if it has three or more +1/+1 counters on it, sacrifice this Aura.")).toBeNull();
    expect(programConfidence(parseEffectClause("Then if it has three or more +1/+1 counters on it, sacrifice this Aura.", "Instant", {}))).toBe("low");
  });
});

describe("OC-1 CREED — near-miss variants and the near-family card stay parked", () => {
  it("a different threshold ('two or more') is NOT the Ordeal pair → whole card body-only", () => {
    const variant = { name: "Faux Ordeal", type: "Enchantment — Aura",
      oracle: "Enchant creature\nWhenever enchanted creature attacks, put a +1/+1 counter on it. Then if it has two or more +1/+1 counters on it, sacrifice this Aura.\nWhen you sacrifice this Aura, you gain 10 life." };
    expect(isNativeOrdealAura(variant)).toBe(false);
    expect(classifyCard(variant)).toBe("body-only");
    // And the attack descriptor keeps its RAW pronouns → LOW → the runtime flush routes it to the Arbiter.
    const d = detectTriggers(variant).find((x) => x.event === "attacks");
    expect(!!triggerRoutesNatively(d)).toBe(false);
  });
  it("an unroutable payoff parks the whole card (the payoff line SHAPE alone is not enough)", () => {
    // The bare "each opponent discards a card at random" now ROUTES (RD-1 seeded random discard), so the
    // still-unroutable example carries an unmodeled "unless they pay {2}" rider (the `$` anchor rejects it).
    const variant = { name: "Faux Payoff", type: "Enchantment — Aura",
      oracle: `Enchant creature\n${ORDEAL_MIDDLE}\nWhen you sacrifice this Aura, each opponent discards a card at random unless they pay {2}.` };
    expect(isNativeOrdealAura(variant)).toBe(false);
    expect(classifyCard(variant)).toBe("body-only");
  });
  it("an LTB-worded exit line is NOT the sacrifice payoff shape → body-only (never fires on non-sac exits)", () => {
    const variant = { name: "Faux Exit", type: "Enchantment — Aura",
      oracle: `Enchant creature\n${ORDEAL_MIDDLE}\nWhen this Aura leaves the battlefield, you gain 10 life.` };
    expect(isNativeOrdealAura(variant)).toBe(false);
    expect(classifyCard(variant)).toBe("body-only");
  });
  it("a rider line beyond the template leaves residue → body-only", () => {
    const variant = { name: "Faux Rider", type: "Enchantment — Aura",
      oracle: `Enchant creature\nEnchanted creature gets +1/+1.\n${ORDEAL_MIDDLE}\nWhen you sacrifice this Aura, you gain 10 life.` };
    expect(isNativeOrdealAura(variant)).toBe(false);
  });
  it("Disturbing Mirth (real near-family card) stays body-only — its ETB optional-sac doesn't route", () => {
    expect(classifyCard(DISTURBING_MIRTH)).toBe("body-only");
    // Its youSacrificeThis payoff (manifest dread) DOES route — a faithful runtime fire if it is ever
    // sacrificed on the battlefield — but the METRIC stays parked on the unroutable ETB (all-or-nothing).
    const d = detectTriggers(DISTURBING_MIRTH);
    expect(d.some((x) => x.event === "youSacrificeThis" && !!triggerRoutesNatively(x))).toBe(true);
    expect(d.every((x) => !!triggerRoutesNatively(x))).toBe(false);
  });
});

describe("OC-1 cast lane — the Ordeal is offered and resolves as a native Aura spell (CR 303.4f)", () => {
  it("legalChoices offers the targeted aura cast; AURA_ETB enters it attached", () => {
    const bear = createPermanent({ id: "bear", card: { id: "bear", ...bearCard }, controller: "user" });
    bear.summoningSick = false;
    let s = board({ user: [bear], hand: [HELIOD] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell);
    expect(cast).toMatchObject({ cardId: "aura", targets: [{ id: "bear" }], needsTargets: true });
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Ordeal of Heliod");
    expect(aura.attachedTo).toBe("bear");
    expect(findPermanent(s, "bear").permanent.attachments).toEqual([aura.id]);
  });
});

describe("OC-1 runtime — attacks → counter; the third counter sacrifices the Aura and pays off", () => {
  it("first attack: one +1/+1 counter on the HOST; the Aura stays (below threshold)", () => {
    const { host, aura } = enchantedHost(HELIOD);
    let s = attack(board({ user: [host, aura] }), "host");
    expect((s.pendingTriggers || [])).toHaveLength(1);
    s = settle(s);
    expect(findPermanent(s, "host").permanent.counters["+1/+1"]).toBe(1);
    expect(findPermanent(s, "aura")).not.toBeNull();
    expect(s.players.user.life).toBe(40); // no payoff below the threshold (Commander start, CR 903.7)
  });
  it("third counter (2 pre-placed): the Aura is sacrificed and the payoff fires (+10 life, Heliod)", () => {
    const { host, aura } = enchantedHost(HELIOD, { n: 2 });
    let s = settle(attack(board({ user: [host, aura] }), "host"));
    expect(findPermanent(s, "host").permanent.counters["+1/+1"]).toBe(3);
    expect(findPermanent(s, "aura")).toBeNull();                                   // sacrificed (CR 701.21a)
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Ordeal of Heliod");
    expect(findPermanent(s, "host").permanent.attachments).toEqual([]);            // detached from the host
    expect(s.players.user.life).toBe(50);                                          // 40 + 10: the payoff resolved
  });
  it("an OTHER attacker never fires the Ordeal (attached-linkage scope)", () => {
    const { host, aura } = enchantedHost(HELIOD, { n: 2 });
    const other = createPermanent({ id: "other", card: { id: "other", ...bearCard }, controller: "user" });
    other.summoningSick = false;
    const s = attack(board({ user: [host, aura, other] }), "other");
    expect((s.pendingTriggers || [])).toHaveLength(0);
  });
  it("cross-controller (Ordeal on an OPPONENT's creature): their attack still fires it, payoff to the AURA's controller", () => {
    const { host, aura } = enchantedHost(HELIOD, { n: 2, hostController: "ai", auraController: "user" });
    let s = board({ user: [aura], ai: [host], activePlayer: "ai" });
    s = settle(attack(s, "host", "ai", "user"));
    expect(findPermanent(s, "aura")).toBeNull();                                   // threshold met → sacrificed
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Ordeal of Heliod"); // the USER sacrificed it
    expect(s.players.user.life).toBe(50);                                          // 40 + 10: "you" = the Aura's controller
  });
});

describe("OC-1 runtime — the youSacrificeThis payoff fires on EVERY sacrifice, and ONLY on sacrifice", () => {
  it("a direct effect-sacrifice of the Aura (an edict pick) fires the payoff (Thassa: draw two)", () => {
    const { host, aura } = enchantedHost(THASSA);
    let s = board({ user: [host, aura], userLib: [{ id: "L1", name: "Top", type: "Sorcery", oracle: "" }, { id: "L2", name: "Next", type: "Sorcery", oracle: "" }] });
    s = settle(sacrificeCreatureEffect(s, "user", "aura"));
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["L1", "L2"]);
  });
  it("Purphoros: the sacrifice payoff damages an ENEMY target chosen at flush (CR 603.3d)", () => {
    const { host, aura } = enchantedHost(PURPHOROS);
    let s = settle(sacrificeCreatureEffect(board({ user: [host, aura] }), "user", "aura"));
    expect(s.players.ai.life).toBe(37); // 40 - 3 damage, enemy-side pick (no AI creature on board)
    expect(s.players.user.life).toBe(40);
  });
  it("DESTROYING the Aura does NOT fire the payoff (destroyed ≠ sacrificed)", () => {
    const { host, aura } = enchantedHost(HELIOD);
    let s = board({ user: [host, aura] });
    s = settle(applyDestroyEffect(s, { controller: "ai", targets: [{ type: "permanent", id: "aura" }] }));
    expect(findPermanent(s, "aura")).toBeNull();
    expect(s.players.user.life).toBe(40);                                          // no payoff
  });
  it("the host DYING (falls-off SBA path, CR 704.5m) does NOT fire the payoff", () => {
    const { host, aura } = enchantedHost(HELIOD);
    let s = board({ user: [host, aura] });
    s = settle(applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "host" }] }));
    expect(findPermanent(s, "host")).toBeNull();
    expect(s.players.user.life).toBe(40);                                          // the Aura fell off — not a sacrifice
  });
});
