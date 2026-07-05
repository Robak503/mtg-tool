/**
 * subsetTriggerAutoPick.test.js — the generalized LARGEST-FIRST subset auto-pick + the "up to ONE
 * target" (N=1) member of the multi-count family.
 *
 * ROOT CAUSE (one bug, many faces): targetSubsets enumerates k-ascending — the EMPTY subset first — and
 * the trigger-flush chooser (gameEngine.chooseTriggerTargets) takes the FIRST all-correct-side candidate.
 * The empty subset passes every side-check vacuously, so EVERY "up to N target" trigger resolved as a
 * silent no-op: classified native, fired, chose nothing, did nothing. The one exception was Rampaging
 * Yao Guai, whose totalMvXConstraint branch carried a largest-first sort with a comment documenting
 * exactly this hazard — for that one atom. targeting.expandAtoms now applies the sort to every subset
 * atom, so the trigger runtime DOES what the classifier claims (side-correctness unchanged: the chooser
 * still requires an all-correct-side candidate per atomTargetIntent, falling through to EMPTY only when
 * no correct-side pick exists).
 *
 * Also: the return-from-graveyard anchor accepts "up to ONE target … card" (singular, maxTargets:1,
 * minTargets:0) and targeting admits that shape into the subset path — flipping Cormela, Sword of Light
 * and Shadow, and three single-return sorceries.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { checkEnterTriggers, checkDiesTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
const BASE = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user" });
const drain = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };
const flow = (s) => drain(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));

describe("LARGEST-FIRST subset auto-pick (the generalized ordering)", () => {
  it("cast-choice enumeration surfaces the maximal subset FIRST, the empty subset LAST", () => {
    const s = { ...BASE(), players: { ...BASE().players, user: { ...BASE().players.user, graveyard: [{ id: "g1", name: "Bear", type: "Creature — Bear" }, { id: "g2", name: "Elf", type: "Creature — Elf" }] } } };
    const p = parseEffectProgram({ type: "Sorcery", oracle: "Return up to two target creature cards from your graveyard to your hand." });
    const combos = expandCastChoices(s, "user", p);
    const sizes = combos.map((c) => (c.targets || []).length);
    expect(sizes[0]).toBe(2);                       // maximal first
    expect(sizes[sizes.length - 1]).toBe(0);        // decline last
  });

  it("HONESTY RESTORED — Baloth Null's enters-trigger actually returns BOTH creature cards now", () => {
    const bn = { name: "Baloth Null", type: "Creature — Beast Zombie", oracle: "When this creature enters, return up to two target creature cards from your graveyard to your hand." };
    const baloth = permObj(bn, "user", "baloth");
    const base = BASE();
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [baloth], graveyard: [{ id: "g1", name: "Bear", type: "Creature — Bear" }, { id: "g2", name: "Elf", type: "Creature — Elf" }], hand: [] } } };
    s = flow(checkEnterTriggers(s, baloth));
    expect(s.players.user.hand.map((c) => c.name).sort()).toEqual(["Bear", "Elf"]);
    expect(s.players.user.graveyard).toHaveLength(0);
  });

  it("HONESTY RESTORED — Gavony Silversmith counters land on up to two OWN creatures (never zero)", () => {
    const gs = { name: "Gavony Silversmith", type: "Creature — Human Artificer", oracle: "When this creature enters, put a +1/+1 counter on each of up to two target creatures." };
    const smith = permObj({ ...gs, power: 2, toughness: 3 }, "user", "smith");
    const ally = permObj({ name: "Ally", type: "Creature — Human", power: 1, toughness: 1, oracle: "" }, "user", "ally");
    const base = BASE();
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [smith, ally] } } };
    s = flow(checkEnterTriggers(s, smith));
    expect(s.players.user.battlefield.find((p) => p.id === "ally").counters["+1/+1"]).toBe(1);
    expect(s.players.user.battlefield.find((p) => p.id === "smith").counters["+1/+1"]).toBe(1);
  });
});

describe("up-to-ONE target (N=1) — the new anchor member", () => {
  it("parses to maxTargets:1 / minTargets:0 and the three single-return sorceries flip native-spell", () => {
    const p = parseEffectProgram({ type: "Sorcery", oracle: "Return up to one target creature card from your graveyard to your hand." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "return-from-graveyard", maxTargets: 1, minTargets: 0 });
    expect(classifyCard({ name: "Lethal Protection", type: "Sorcery", oracle: "Destroy target creature. Return up to one target creature card from your graveyard to your hand." })).toBe("native-spell");
    expect(classifyCard({ name: "Walk with the Ancestors", type: "Sorcery", oracle: "Return up to one target permanent card from your graveyard to your hand. Discover 4." })).toBe("native-spell");
  });

  it("Cormela's dies-trigger returns the instant (up-to-one, non-optional)", () => {
    const oracle = "Haste\n{1}, {T}: Add {U}{B}{R}. Spend this mana only to cast instant and/or sorcery spells.\nWhen Cormela dies, return up to one target instant or sorcery card from your graveyard to your hand.";
    const base = BASE();
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [], graveyard: [{ id: "gy1", name: "Old Bolt", type: "Instant" }], hand: [] } } };
    s = flow(checkDiesTriggers(s, [{ id: "cormela", controller: "user", name: "Cormela", card: { name: "Cormela, Glamour Thief", type: "Legendary Creature — Vampire Rogue", oracle, power: 2, toughness: 3 } }]));
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Old Bolt"]);
  });

  it("Sword of Light and Shadow runs its WHOLE line: gain 3, optional YES returns the creature; NO declines cleanly", () => {
    const oracle = "Equipped creature gets +2/+2 and has protection from white and from black.\nWhenever equipped creature deals combat damage to a player, you gain 3 life and you may return up to one target creature card from your graveyard to your hand.\nEquip {2}";
    expect(classifyCard({ name: "Sword of Light and Shadow", type: "Artifact — Equipment", oracle, mana: "{3}" })).toBe("native-equipment");
    const mk = () => {
      const base = BASE();
      const knight = permObj({ name: "Knight", type: "Creature — Human Knight", power: 2, toughness: 2, oracle: "" }, "user", "knight", { attachments: ["sls"] });
      const sword = permObj({ name: "Sword of Light and Shadow", type: "Artifact — Equipment", oracle, mana: "{3}" }, "user", "sls", { attachedTo: "knight" });
      let s = { ...base, phase: "combat", step: "combat-damage", players: { ...base.players, user: { ...base.players.user, battlefield: [knight, sword], graveyard: [{ id: "gy1", name: "Dead Bear", type: "Creature — Bear" }], hand: [], life: 30 } } };
      return flow(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "knight", attackingPlayer: "user", defender: "ai", amount: 2 }]));
    };
    let yes = mk();
    expect(yes.players.user.life).toBe(33);
    expect(yes.pendingChoice?.kind).toBe("optional-effect");
    yes = drain(resolveOptionalChoice(yes, true));
    expect(yes.players.user.hand.map((c) => c.name)).toEqual(["Dead Bear"]);
    let no = mk();
    no = drain(resolveOptionalChoice(no, false));
    expect(no.players.user.hand).toHaveLength(0);
    expect(no.players.user.graveyard).toHaveLength(1);
    expect(no.players.user.life).toBe(33); // the gain half still resolved
  });
});
