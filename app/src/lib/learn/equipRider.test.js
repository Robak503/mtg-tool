/**
 * EQUIP-ATTACH-TRIGGER-RIDER + EQUIP-AUTO-ATTACH (WAVE 4) — the equipped-creature trigger scope and the
 * reverse auto-attach atom.
 *
 * GAP-1: triggers.js classifyCondition gained an "equipped creature" subject for the `attacks` and
 *        `combatDamageToPlayer` events, plus a scopeMatches "equippedCreature" case that fires ONLY when
 *        the attacker/connecting permanent IS the creature THIS equipment is attached to. The combat
 *        firing loops (checkAttackTriggers / checkCombatDamageTriggers) already source the equipment as a
 *        watcher and thread the attacker as triggeringPermanent, so no firing-loop change was needed.
 * GAP-2: the attach-to-self atom — a creature's "attach up to one target Equipment you control to <self>"
 *        (Captain America's combat-begin "Catch" trigger). Reverse of self-attach: source = the creature,
 *        target = an Equipment you control, attached onto the source.
 * GAP-3: stripTriggerAbilityLabel widened for the crossover-set flavor labels ("... Catch —", "Genius
 *        Industrialist —", "Treasure Hunter —") so the boundary-anchored trigger regex detects them.
 *
 * Pins (CREED-faithful):
 *   - clean flips: Goldvein Pick (combat-damage → Treasure), Argentum Armor / Ultima Weapon (attacks →
 *     destroy) become native-equipment;
 *   - the equippedCreature scope fires ONLY for the equipment's attached creature (not another equipped
 *     attacker, not when unattached);
 *   - the auto-attach atom attaches a chosen own-equipment onto the source AND lights up its bonus;
 *   - CREED negatives: a multi-clause Sword rider stays body-only; "…to a player or planeswalker" stays
 *     undetected; "to that creature" / "to target creature" are NOT attach-to-self; Captain America stays
 *     NON-native (his "Throw" activated ability is unmodeled).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, attachPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, triggersForEvent, checkAttackTriggers, checkCombatDamageTriggers, stripTriggerAbilityLabel } from "./triggers.js";
import { chooseTriggerTargets } from "./gameEngine.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EQ = (name, oracle, type = "Artifact — Equipment") => ({ name, type, oracle });
const high = (txt) => programConfidence(parseEffectClause(txt, "Instant")) === "high";

// ─── GAP-1 detection ────────────────────────────────────────────────────────
describe("GAP-1 — equipped-creature trigger scope detection", () => {
  it("detects 'equipped creature deals combat damage to a player' (Goldvein Pick)", () => {
    const t = detectTriggers(EQ("Goldvein Pick", "Equipped creature gets +1/+1.\nWhenever equipped creature deals combat damage to a player, create a Treasure token.\nEquip {1}"));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "equippedCreature", effectClause: "create a Treasure token" });
  });
  it("detects 'equipped creature attacks' (Argentum Armor)", () => {
    const t = detectTriggers(EQ("Argentum Armor", "Equipped creature gets +6/+6.\nWhenever equipped creature attacks, destroy target permanent.\nEquip {6}"));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "attacks", scope: "equippedCreature", effectClause: "destroy target permanent" });
  });
  it("CREED: a qualified combat-damage variant ('…to a player or planeswalker') stays UNDETECTED", () => {
    expect(detectTriggers(EQ("X", "Whenever equipped creature deals combat damage to a player or planeswalker, create a Treasure token."))).toHaveLength(0);
  });
  it("CREED: an attack rider ('attacks alone' / '…the player with the most life') stays UNDETECTED", () => {
    expect(detectTriggers(EQ("X", "Whenever equipped creature attacks alone, create a Treasure token."))).toHaveLength(0);
    expect(detectTriggers(EQ("X", "Whenever equipped creature attacks the player with the most life, create a Treasure token."))).toHaveLength(0);
  });
});

// ─── GAP-1 scope firing (the per-equipped-creature correctness gate) ──────────
describe("GAP-1 — equippedCreature scope fires only for the attached creature", () => {
  function boardWithEquip(attachedTo) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "other", card: { name: "Other", type: "Creature — Human", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const armor = createPermanent({ id: "armor", card: EQ("Argentum Armor", "Equipped creature gets +6/+6.\nWhenever equipped creature attacks, destroy target permanent.\nEquip {6}"), controller: "user" });
    s = { ...s, activePlayer: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [hero, other, armor] } } };
    if (attachedTo) s = attachPermanent(s, { equipId: "armor", targetId: attachedTo });
    return s;
  }
  const equipPerm = (s) => s.players.user.battlefield.find((p) => p.id === "armor");
  const attackerPerm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);

  it("fires when the attacker IS the equipped creature", () => {
    const s = boardWithEquip("hero");
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: equipPerm(s), triggeringPermanent: attackerPerm(s, "hero") });
    expect(fired).toHaveLength(1);
  });
  it("does NOT fire when a DIFFERENT (non-equipped) creature attacks", () => {
    const s = boardWithEquip("hero");
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: equipPerm(s), triggeringPermanent: attackerPerm(s, "other") });
    expect(fired).toHaveLength(0);
  });
  it("does NOT fire when the equipment is UNATTACHED (attachedTo null)", () => {
    const s = boardWithEquip(null);
    const fired = triggersForEvent(s, { event: "attacks", sourcePermanent: equipPerm(s), triggeringPermanent: attackerPerm(s, "hero") });
    expect(fired).toHaveLength(0);
  });
});

// ─── GAP-1 end-to-end: Goldvein Pick combat-damage → Treasure ────────────────
describe("GAP-1 end-to-end — Goldvein Pick equipped creature combat damage creates a Treasure", () => {
  it("fires via checkCombatDamageTriggers and makes a Treasure for the controller", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 3, toughness: 3 }, controller: "user", summoningSick: false });
    const pick = createPermanent({ id: "pick", card: EQ("Goldvein Pick", "Equipped creature gets +1/+1.\nWhenever equipped creature deals combat damage to a player, create a Treasure token.\nEquip {1}"), controller: "user" });
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [hero, pick] } } };
    s = attachPermanent(s, { equipId: "pick", targetId: "hero" });

    // the per-attacker player-damage event the combat resolver emits
    const playerEvents = [{ kind: "combat-damage-player", attackerId: "hero", attackingPlayer: "user", defender: "ai", amount: 4 }];
    s = checkCombatDamageTriggers(s, playerEvents);
    expect((s.pendingTriggers || []).length).toBeGreaterThan(0);
    s = resolveTopOfStack(flushTriggers(s));

    const treasures = s.players.user.battlefield.filter((p) => /Treasure/.test(String(p.card?.type || p.card?.type_line || "")) || /Treasure/.test(String(p.card?.name || "")));
    expect(treasures.length).toBe(1);
  });
});

// ─── GAP-1 end-to-end: Argentum Armor attacks → destroy (target side correct) ─
describe("GAP-1 end-to-end — Argentum Armor equipped creature attacks destroys an OPPONENT's permanent", () => {
  it("fires via checkAttackTriggers and the destroy targets the enemy side (not a friendly)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 3, toughness: 3 }, controller: "user", summoningSick: false });
    const armor = createPermanent({ id: "armor", card: EQ("Argentum Armor", "Equipped creature gets +6/+6.\nWhenever equipped creature attacks, destroy target permanent.\nEquip {6}"), controller: "user" });
    const myRelic = createPermanent({ id: "myrelic", card: { name: "My Relic", type: "Artifact" }, controller: "user" });
    const oppRelic = createPermanent({ id: "opprelic", card: { name: "Opp Relic", type: "Artifact" }, controller: "ai" });
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", consecutivePasses: 0,
      combat: { attackers: [{ permanentId: "hero", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [hero, armor, myRelic] }, ai: { ...s.players.ai, battlefield: [oppRelic] } } };
    s = attachPermanent(s, { equipId: "armor", targetId: "hero" });

    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    // flush with the enemy/own chooser so the unrestricted "destroy target permanent" picks the opponent's.
    s = resolveTopOfStack(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));

    expect(findPermanent(s, "opprelic")).toBeNull();         // opponent's permanent destroyed
    expect(findPermanent(s, "myrelic")?.permanent?.id).toBe("myrelic"); // the controller's own untouched
  });
});

// ─── GAP-2 attach-to-self atom ───────────────────────────────────────────────
describe("GAP-2 — attach-to-self atom", () => {
  it("parses Captain America's 'attach up to one target Equipment you control to Captain America' (own intent, HIGH)", () => {
    const atoms = parseEffectClause("attach up to one target Equipment you control to Captain America", "Instant").atoms;
    expect(atoms).toEqual([{ op: "attach-to-self", targetType: "equipmentYouControl", optionalTarget: true }]);
    expect(high("attach up to one target Equipment you control to Captain America")).toBe(true);
    expect(atomTargetIntent(atoms[0])).toBe("own");
  });
  it("parses the 'to it' (Cloud) and 'to <name>' (Sokka) self forms", () => {
    expect(high("attach up to one target Equipment you control to it")).toBe(true);
    expect(high("attach up to one target Equipment you control to Sokka")).toBe(true);
  });
  it("CREED: NON-self destinations are NOT attach-to-self (stay LOW → Arbiter)", () => {
    // "to that creature" (Kemba — the entering Cat, not the source) and "to target creature you control"
    // (Brass Squire — a chosen creature) must NOT model as attach-to-self.
    expect(high("attach up to one target Equipment you control to that creature")).toBe(false);
    expect(high("attach target Equipment you control to target creature you control")).toBe(false);
  });
  it("enumerateTargets(equipmentYouControl) offers only the controller's own Equipment", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const myEq = createPermanent({ id: "myeq", card: EQ("Bonesplitter", "Equipped creature gets +2/+0.\nEquip {1}"), controller: "user" });
    const oppEq = createPermanent({ id: "oppeq", card: EQ("Bonesplitter", "Equipped creature gets +2/+0.\nEquip {1}"), controller: "ai" });
    const myCreature = createPermanent({ id: "c", card: { name: "Hero", type: "Creature — Human", power: 1, toughness: 1 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [myEq, myCreature] }, ai: { ...s.players.ai, battlefield: [oppEq] } } };
    const cands = enumerateTargets(s, "user", { targetType: "equipmentYouControl" });
    expect(cands.map((c) => c.id)).toEqual(["myeq"]);
  });
});

// ─── GAP-2 end-to-end: Captain America "Catch" auto-attach ───────────────────
describe("GAP-2 end-to-end — Captain America 'Catch' combat-begin auto-attach", () => {
  const CAP = "Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America.";

  it("GAP-3: the '... Catch —' label is stripped and the combat-begin trigger is detected", () => {
    expect(stripTriggerAbilityLabel(CAP)).toMatch(/\nAt the beginning of combat on your turn, attach/);
    const t = detectTriggers({ name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero", oracle: CAP });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event: "combatBegin", effectClause: "attach up to one target Equipment you control to Captain America" });
  });

  it("attaches an unattached Equipment onto Captain America and the equipped bonus lights up", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const cap = createPermanent({ id: "cap", card: { name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero", power: 4, toughness: 5, oracle: CAP }, controller: "user", summoningSick: false });
    const armor = createPermanent({ id: "armor", card: EQ("Argentum Armor", "Equipped creature gets +6/+6.\nWhenever equipped creature attacks, destroy target permanent.\nEquip {6}"), controller: "user" });
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "beginning-of-combat", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [cap, armor] } } };
    expect([permanentPower(s, "cap"), permanentToughness(s, "cap")]).toEqual([4, 5]);

    const fired = triggersForEvent(s, { event: "combatBegin", sourcePermanent: s.players.user.battlefield[0] });
    expect(fired).toHaveLength(1);
    s = resolveTopOfStack(flushTriggers({ ...s, pendingTriggers: fired }));

    expect(findPermanent(s, "armor").permanent.attachedTo).toBe("cap"); // equipment attached to Cap
    expect([permanentPower(s, "cap"), permanentToughness(s, "cap")]).toEqual([10, 11]); // +6/+6
  });

  it("CREED: with NO equipment on the board the trigger is a clean no-op (no fizzle, no crash)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const cap = createPermanent({ id: "cap", card: { name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero", power: 4, toughness: 5, oracle: CAP }, controller: "user", summoningSick: false });
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "beginning-of-combat", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [cap] } } };
    const fired = triggersForEvent(s, { event: "combatBegin", sourcePermanent: s.players.user.battlefield[0] });
    expect(fired).toHaveLength(1);
    s = resolveTopOfStack(flushTriggers({ ...s, pendingTriggers: fired }));
    expect([permanentPower(s, "cap"), permanentToughness(s, "cap")]).toEqual([4, 5]); // unchanged
  });
});

// ─── Coverage: clean flips + CREED negatives ─────────────────────────────────
describe("coverage — clean equipment flips and CREED negatives", () => {
  it("Goldvein Pick / Argentum Armor / Ultima Weapon flip to native-equipment", () => {
    expect(classifyCard(EQ("Goldvein Pick", "Equipped creature gets +1/+1.\nWhenever equipped creature deals combat damage to a player, create a Treasure token.\nEquip {1}"))).toBe("native-equipment");
    expect(classifyCard(EQ("Argentum Armor", "Equipped creature gets +6/+6.\nWhenever equipped creature attacks, destroy target permanent.\nEquip {6}"))).toBe("native-equipment");
    expect(classifyCard(EQ("Ultima Weapon", "Whenever equipped creature attacks, destroy target creature an opponent controls.\nEquipped creature gets +7/+7.\nEquip {7}", "Legendary Artifact — Equipment"))).toBe("native-equipment");
  });
  it("GRADUATED (CAP5, 2026-08-30): The Reaver Cleaver's granted quoted ability is native now", () => {
    // The player-or-planeswalker union rides combatDamageToPlayer with the alsoPlaneswalker marker and a
    // pw fire-pass; capReaverCleaver.test.js owns both halves' fire witnesses. Asserted AS native so this
    // pin can never silently re-park it.
    expect(classifyCard(EQ("The Reaver Cleaver", "Equipped creature gets +1/+1 and has trample and \"Whenever this creature deals combat damage to a player or planeswalker, create that many Treasure tokens.\"\nEquip {3}", "Legendary Artifact — Equipment"))).toBe("native-trigger");
  });
  it("GRADUATED (CAP11, 2026-08-30): Buster Sword's free-cast payload is modeled now", () => {
    // The FOURTH specimen to graduate out of this seat (Feast and Famine → War and Peace → Reaver Cleaver
    // → Buster Sword), each as its payload became modeled. Here: the combat-damage-capped free cast
    // (capFromCombatDamage reading ctx.combatDamageAmount, the relational shape Kellan's capFromCastMv
    // established). busterSwordFreeCast.test.js owns the runtime witness — including the guard that a
    // MISSING referent casts nothing rather than casting UNCAPPED. Asserted AS native so this pin can
    // never silently re-park it.
    expect(classifyCard(EQ("Buster Sword", "Equipped creature gets +3/+2.\nWhenever equipped creature deals combat damage to a player, draw a card, then you may cast a spell from your hand with mana value less than or equal to that damage without paying its mana cost.\nEquip {2}", "Legendary Artifact — Equipment"))).toBe("native-equipment");
  });
  it("CREED: a Sword rider with an UNMODELED payload clause still stays body-only", () => {
    // ⭐ THE SURVIVING GUARD OF THE CLASS the graduation above vacated. The rule under test is "an
    // unmodeled payload half parks the WHOLE equipment — never a partial flip", and retiring its last
    // specimen alongside the graduated card would quietly retire the rule too.
    // Sword of Wealth and Power (real oracle, bundled snapshot) is the live specimen: its Treasure arm IS
    // modeled, but the same trigger's second sentence — the delayed "when you next cast an instant or
    // sorcery spell this turn, copy that spell" — is not. A partial flip would credit the card while
    // silently dropping the half people actually play it for.
    expect(classifyCard(EQ("Sword of Wealth and Power", "Equipped creature gets +2/+2 and has protection from instants and from sorceries.\nWhenever equipped creature deals combat damage to a player, create a Treasure token. When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.\nEquip {2}", "Artifact — Equipment"))).toBe("body-only");
  });
  it("GRADUATED (CAP14, 2026-08-30): Captain America's 'Throw' is modeled — he is native now", () => {
    // His "Catch" trigger always parsed; "Throw" was the sole blocker, and it needed three things that
    // now exist: the ellipsis-carrying flavor label strips, the "Unattach an Equipment from <self>"
    // activation COST parses and is actually paid, and the divide-damage amount is read from the mana
    // value of the Equipment unattached to pay for it. capThrowUnattachCost.test.js owns the runtime
    // witness — including that the Equipment STAYS on the battlefield and that a MISSING referent deals
    // zero. Asserted AS native so this pin can never silently re-park him.
    const CAP = "Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America.";
    expect(classifyCard({ name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero", oracle: CAP })).toBe("native-mixed");
    // GRADUATED (CAP-BRACERS, 2026-09-03): Illusionist's Bracers' ability-COPY is modeled (the ability-activated
    // trigger + the copy-activated-ability atom; illusionistsBracers.test.js owns the runtime witness). Asserted AS
    // native so this pin can never silently re-park it.
    expect(classifyCard(EQ("Illusionist's Bracers", "Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {3}", "Artifact — Equipment"))).toBe("native-mixed");
    // ⭐ THE SURVIVING GUARD of the class this vacated — an UNMODELED equipped-creature payload must still park the
    // whole card. Deathrender's "put a creature card from your hand onto the battlefield and attach this Equipment
    // to it" is genuinely unmodeled (real oracle, bundled snapshot 2026-09-03), so it holds the seat.
    expect(classifyCard(EQ("Deathrender", "Equipped creature gets +2/+2.\nWhenever equipped creature dies, you may put a creature card from your hand onto the battlefield and attach this Equipment to it.\nEquip {2}", "Artifact — Equipment"))).toBe("body-only");
  });
});
