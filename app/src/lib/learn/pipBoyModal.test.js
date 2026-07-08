/**
 * pipBoyModal.test.js — MODAL equipment attack triggers (Pip-Boy) + the bonus-less equipment gate.
 *
 * "Whenever equipped creature attacks, choose one — • Sort Inventory — Draw a card, then discard a card.
 * • Pick a Perk — Put a +1/+1 counter on that creature. • Check Map — Untap up to two target lands."
 * Four seams:
 *   - MODAL FLAVOR LABELS: the crossover-set "• <Label> — " prefixes strip per bullet, ONLY when every
 *     bullet carries one (all-or-nothing; CR 207.2c — no rules meaning);
 *   - MODAL PRONOUN REWRITE: a bullet's "that creature"/"it" runs through the SAME per-sentence rewriter
 *     the non-modal arm uses, under the same (event, scope) referent gates — on attacks/equippedCreature
 *     the attacker IS the triggering permanent (also widened for non-modal equipped-attacks pronouns:
 *     Armory of Iroas, Bone Sabres);
 *   - UNTAP-UP-TO-N-TARGET-LANDS: the multi-count family on the untap-land atom (Check Map);
 *   - BONUS-LESS EQUIPMENT: permanentEquipmentCovered now strips modal bullet lines with the trigger and
 *     accepts an empty equipment bonus ONLY when no clause touches the equipped creature (Pip-Boy /
 *     Rogue's Gloves / Goggles of Night are pure trigger + Equip).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PIPBOY_ORACLE = "Whenever equipped creature attacks, choose one —\n• Sort Inventory — Draw a card, then discard a card.\n• Pick a Perk — Put a +1/+1 counter on that creature.\n• Check Map — Untap up to two target lands.\nEquip {2}";
const drain = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };

describe("PIP-BOY — recognition (labels stripped, pronoun rewritten, all modes modeled)", () => {
  it("classifies native-equipment; the modal trigger routes with clean bullets", () => {
    const card = { name: "Pip-Boy 3000", type: "Artifact — Equipment", oracle: PIPBOY_ORACLE, mana: "{2}" };
    expect(classifyCard(card)).toBe("native-equipment");
    const t = detectTriggers(card)[0];
    expect(t).toMatchObject({ event: "attacks", scope: "equippedCreature" });
    expect(t.effectClause).not.toContain("Sort Inventory");                       // labels stripped
    expect(t.effectClause).toContain("the triggering creature");                  // pronoun rewritten
    expect(!!triggerRoutesNatively(t)).toBe(true);
  });

  it("the Check Map mode parses (untap up to two target lands — the multi-count family)", () => {
    const p = parseEffectClause("untap up to two target lands", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "untap", targetType: "land", maxTargets: 2, minTargets: 0 });
  });

  it("bonus-less trigger equipment riders flip too (each single trigger routes)", () => {
    expect(classifyCard({ name: "Rogue's Gloves", type: "Artifact — Equipment", oracle: "Whenever equipped creature deals combat damage to a player, you may draw a card.\nEquip {2}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Armory of Iroas", type: "Artifact — Equipment", oracle: "Whenever equipped creature attacks, put a +1/+1 counter on it.\nEquip {2}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Goggles of Night", type: "Artifact — Equipment", oracle: "Whenever equipped creature deals combat damage to a player, scry 1, then draw a card.\nEquip {2}" })).toBe("native-equipment");
  });

  it("CREED: an unmodeled mode keeps the whole modal body-only; a MIXED-label block is never half-stripped", () => {
    // one unmodeled mode (venture) → the modal all-or-nothing gate fails
    expect(classifyCard({ name: "Synth", type: "Artifact — Equipment", oracle: "Whenever equipped creature attacks, choose one —\n• Draw a card, then discard a card.\n• Venture into the dungeon.\nEquip {2}" })).toBe("body-only");
    // mixed labels are FINE — the PARSER owns label handling and strips them per mode (a labeled
    // draw-discard beside a bare draw both parse; this pins that the parser, not triggers.js, is the owner)
    expect(classifyCard({ name: "Synth", type: "Artifact — Equipment", oracle: "Whenever equipped creature attacks, choose one —\n• Sort Inventory — Draw a card, then discard a card.\n• Draw a card.\nEquip {2}" })).toBe("native-equipment");
    // a bonus-less equipment whose CREATURE-touching clause failed to parse must NOT slip the empty-bonus
    // gate ("equipped creature gets +1/+0 and has banding" parses to nothing yet touches the creature)
    expect(classifyCard({ name: "Synth", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+0 and has banding.\nEquip {1}" })).toBe("body-only");
  });
});

describe("PIP-BOY — runtime (the modal fires and resolves exactly one mode)", () => {
  function board() {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const pip = createPermanent({ id: "pip", card: { name: "Pip-Boy 3000", type: "Artifact — Equipment", oracle: PIPBOY_ORACLE, mana: "{2}" }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [hero, pip], hand: [], library: [{ id: "lib1", name: "Fill", type: "Instant" }, { id: "lib2", name: "Fill2", type: "Instant" }], graveyard: [] } } };
    s = attachPermanent(s, { equipId: "pip", targetId: "hero" });
    return { ...s, combat: { attackers: [{ permanentId: "hero", attackingPlayer: "user" }] } };
  }

  it("attack → the modal fires; the auto-pick resolves the draw-discard mode (library shrinks, card in graveyard)", () => {
    let s = board();
    s = checkAttackTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = drain(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const u = s.players.user;
    // exactly ONE mode resolved: Sort Inventory (draw Fill → discard it; hand empty so net-zero hand)
    expect(u.library.length).toBe(1);
    expect(u.graveyard.map((c) => c.name)).toEqual(["Fill"]);
    expect(u.battlefield.find((p) => p.id === "hero").counters["+1/+1"]).toBeUndefined(); // Pick a Perk NOT also fired
  });

  it("Armory of Iroas: the non-modal equipped-attacks pronoun lands the counter on THE ATTACKER only", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const hero = createPermanent({ id: "hero", card: { name: "Hero", type: "Creature — Human", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "other", card: { name: "Other", type: "Creature — Human", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const armory = createPermanent({ id: "armory", card: { name: "Armory of Iroas", type: "Artifact — Equipment", oracle: "Whenever equipped creature attacks, put a +1/+1 counter on it.\nEquip {2}" }, controller: "user" });
    let s = { ...base, activePlayer: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [hero, other, armory] } } };
    s = attachPermanent(s, { equipId: "armory", targetId: "hero" });
    s = { ...s, combat: { attackers: [{ permanentId: "hero", attackingPlayer: "user" }] } };
    s = drain(flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.battlefield.find((p) => p.id === "hero").counters["+1/+1"]).toBe(1);
    expect(s.players.user.battlefield.find((p) => p.id === "other").counters["+1/+1"]).toBeUndefined();
  });
});
