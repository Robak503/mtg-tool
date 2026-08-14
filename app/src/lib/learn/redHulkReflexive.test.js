/**
 * redHulkReflexive.test.js — RED HULK (2026-08-14) and the 12-card family flip. "Enrage — Whenever Red
 * Hulk is dealt damage, put a +1/+1 counter on him. When you do, he deals damage equal to the number of
 * +1/+1 counters on him to any other target."
 *
 * ⭐ FOUR SMALL PIECES, TWELVE CARDS (flip-diff +12/0/0, every oracle audited):
 *   · the GENDERED SELF-REFERENT rewrite (scope-self triggers: "on him/her" → "on this creature") —
 *     Red Hulk, Mockingbird, Scarlet Spider, Zuko. The SUBJECT form ("he deals") deliberately has NO
 *     rewrite: a first mutation SURVIVED its removal — every reachable damage arm takes a wildcard
 *     source phrase, so the pronoun subject already parses (recorded in the triggers.js branch comment).
 *   · parseCountSource accepts "+1/+1 counters on this creature" as plusCountersOnSource — Preyseizer,
 *     Servant of the Scale, Mycoloth, Falkenrath Exterminator, Canopy Crawler.
 *   · the reflexive-lead guard allows "^this creature\b" (the SOURCE referent — never the primary
 *     object the guard exists to reject) — Cornered Crook, Fireblade Artist, Pyroclastic Hellion.
 *   · "any other target" (CR 109.5) joins the DMG-SCALE alternation → the same "any" enumeration with
 *     excludeSource stamped; addCreatures' Support-N exclusion drops ctx.sourceId from the pool.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the pronoun rewrite disabled → Red Hulk parks (the clause keeps "him").
 *   · the excludeSource stamp dropped → Red Hulk stays native but HIS OWN ID enters the target pool
 *     (the self-shot over-fire the exclusion witness pins).
 *   · the count widening reverted → the reflexive's amount goes unreadable → parks.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14 — full texts).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { applyDamageEffect } from "./spellEffects.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RED_HULK = { name: "Red Hulk", type: "Legendary Creature — Gamma Berserker Villain", mana: "{2}{R}{R}",
  keywords: [], power: "4", toughness: "4",
  oracle: "Reach, trample\nEnrage — Whenever Red Hulk is dealt damage, put a +1/+1 counter on him. When you do, he deals damage equal to the number of +1/+1 counters on him to any other target." };
// Only the OBJECT pronoun normalizes; the subject "he deals" survives and parses via the wildcard source phrase.
const NORMALIZED = "put a +1/+1 counter on this creature. When you do, he deals damage equal to the number of +1/+1 counters on this creature to any other target";

describe("the family and the four pieces", () => {
  it("⭐ Red Hulk flips native-trigger; the fold is [self counter, excludeSource count-damage]", () => {
    expect(classifyCard(RED_HULK)).toBe("native-trigger");
    expect(detectTriggers(RED_HULK)[0].effectClause).toBe(NORMALIZED);
    const p = parseEffectClause(NORMALIZED, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([
      { op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" },
      { op: "deal-damage", targetType: "any", amountCount: { kind: "plusCountersOnSource" }, excludeSource: true },
    ]);
  });

  it("⭐ the family carriers flip (each blocked ONLY by these seams — oracles audited)", () => {
    expect(classifyCard({ name: "Mockingbird, Bobbi Morse", type: "Legendary Creature — Human Hero", mana: "{1}{W}", keywords: [], power: "2", toughness: "2",
      oracle: "Whenever Mockingbird is dealt damage, put a +1/+1 counter on her. (She must survive the damage to get the counter.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Cornered Crook", type: "Creature — Lizard Warrior", mana: "{2}{R}", keywords: [], power: "3", toughness: "2",
      oracle: "When this creature enters, you may sacrifice an artifact. When you do, this creature deals 3 damage to any target." })).toBe("native-trigger");
    expect(classifyCard({ name: "Falkenrath Exterminator", type: "Creature — Vampire Archer", mana: "{1}{R}", keywords: [], power: "1", toughness: "1",
      oracle: "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it.\n{2}{R}: This creature deals damage to target creature equal to the number of +1/+1 counters on this creature." })).toBe("native-mixed");
  });

  it("⛔ CREED: a gendered pronoun on a NON-self scope is NOT rewritten (no blanket normalization)", () => {
    // "a creature you control" scope with "on him" — the referent is the TRIGGERING creature, not the
    // source; the rewrite must not touch it (it would bind the counter to the wrong permanent).
    const d = detectTriggers({ name: "P", type: "Enchantment",
      oracle: "Whenever a creature you control attacks, put a +1/+1 counter on him." });
    expect(d.every((t) => !/this creature/.test(t.effectClause || ""))).toBe(true);
  });
});

describe("⭐⭐ LAW 6 — the reflexive fires with the POST-counter amount, never at himself", () => {
  const board = () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const rh = { ...createPermanent({ id: "RH", controller: "user", summoningSick: false,
      card: { id: "c-RH", ...RED_HULK } }), counters: { "+1/+1": 2 } };
    const foe = createPermanent({ id: "FOE", controller: "ai", summoningSick: false,
      card: { id: "c-FOE", name: "Foe", type: "Creature — Bear", power: "3", toughness: "4", oracle: "" } });
    return { ...g, players: { ...g.players,
      user: { ...g.players.user, battlefield: [rh] },
      ai: { ...g.players.ai, battlefield: [foe], life: 40 } } };
  };
  const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };

  it("⭐⭐ dealt 2 with 2 counters: Enrage adds one (→3), the reflexive deals exactly 3 to the foe", () => {
    let s = board();
    s = applyDamageEffect(s, { controller: "ai", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "RH" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const rh = s.players.user.battlefield.find((p) => p.id === "RH");
    const foe = s.players.ai.battlefield.find((p) => p.id === "FOE");
    const row = { counters: rh?.counters?.["+1/+1"], foeDamage: foe?.damageMarked };
    console.log("  WITNESS redHulkReflexive", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ counters: 3, foeDamage: 3 }); // the amount reads AFTER the counter lands (printed sequencing)
  });

  it("⛔ the 'other' binds: RED HULK'S OWN ID is never in the candidate pool (a plain any-target WOULD include him)", () => {
    const s = board();
    const prog = parseEffectClause(NORMALIZED, "Instant", { hasX: false });
    const combos = expandCastChoices(s, "user", prog, [], { sourceId: "RH" });
    const ids = combos.flatMap((c) => (c.targets || []).map((t) => t.id));
    expect(ids).toContain("FOE");
    expect(ids).not.toContain("RH");
    // Seen-to-fail control: the SAME board WITHOUT the exclusion offers Red Hulk to himself.
    const plain = parseEffectClause("put a +1/+1 counter on this creature. When you do, this creature deals damage equal to the number of +1/+1 counters on this creature to any target", "Instant", { hasX: false });
    const plainIds = expandCastChoices(s, "user", plain, [], { sourceId: "RH" }).flatMap((c) => (c.targets || []).map((t) => t.id));
    expect(plainIds).toContain("RH");
  });
});
