/**
 * aurasAttachedSelfCount.test.js — "This creature gets +2/+2 for each Aura attached to it" (Kor Spiritdancer,
 * Uril the Miststalker, Graceblade Artisan, Rabid Wombat, Gatherer of Graces) parked every carrier at
 * body-only. The layer-7c self-"for each" LANE already existed and worked; only its COUNT VOCABULARY
 * (`parseSelfCountSource`) refused the phrase, so no descriptor was ever emitted.
 *
 * ⭐ THE EVALUATOR IS A COUNT TWIN OF A PREDICATE THAT ALREADY SHIPPED. layers.gateMet's `isEnchanted` gate
 * has always asked "is ANY Aura, on ANY player's battlefield, attached to perm.id?" — a plain `attachedTo`
 * back-pointer read plus an Aura type-line test. countSelfSpecOnBoard's new arm asks the identical question
 * and tallies instead of short-circuiting. No new state, no new inference: an exact read of live
 * back-pointers the runtime already maintains, so a creature wearing nothing counts the printed 0 rather
 * than a fabricated number. That exactness is the whole admission criterion this vocabulary documents.
 *
 * ALL PLAYERS, deliberately: the clause says "attached to IT", not "you control", so an opponent's Aura on
 * my creature counts (CR 303.4 — attachment is independent of who controls the Aura). Pinned below, because
 * scanning only the controller's battlefield is the plausible wrong version.
 *
 * LAW 6 — driven on a REAL BOARD (createGameState + real attachedTo back-pointers + permanentPower/Toughness
 * off the layer engine), not compared parse-to-parse. The first harness attempt read 0/0 on every row
 * INCLUDING the bare printed 2/3, because permanentPower takes a permanent ID and was handed the object; a
 * broken harness reports a uniform answer that looks like a clean negative. The bare row is here as the
 * harness's own witness — if it ever stops reading printed P/T, the harness is lying again.
 *
 * Mutation-checked (2026-08-04, each verified applied by grepping the mutated line first): the vocabulary
 * entry disabled -> every flip pin red; the evaluator's all-players loop narrowed to the controller ->
 * the opponent's-Aura row red; the `\baura\b` type test dropped -> the Equipment row red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseActivatedAbilities } from "./effects/abilities.js";

beforeEach(() => _resetIdsForTests());

const GRACEBLADE = { id: "c-ga", name: "Graceblade Artisan", type: "Creature — Human Monk", mana: "{2}{W}",
  power: 2, toughness: 3, oracle: "This creature gets +2/+2 for each Aura attached to it." };
const URIL = { id: "c-ur", name: "Uril, the Miststalker", type: "Legendary Creature — Beast", mana: "{2}{R}{G}{W}",
  power: 5, toughness: 5, oracle: "Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nUril gets +2/+2 for each Aura attached to it." };
const RABID_WOMBAT = { id: "c-rw", name: "Rabid Wombat", type: "Creature — Wombat", mana: "{3}{G}",
  power: 0, toughness: 1, oracle: "Vigilance\nThis creature gets +2/+2 for each Aura attached to it." };
const KOR_SPIRITDANCER = { id: "c-ks", name: "Kor Spiritdancer", type: "Creature — Kor Wizard", mana: "{1}{W}",
  power: 0, toughness: 2, oracle: "This creature gets +2/+2 for each Aura attached to it.\nWhenever you cast an Aura spell, you may draw a card." };
const GATHERER = { id: "c-gg", name: "Gatherer of Graces", type: "Creature — Human Druid", mana: "{1}{G}",
  power: 1, toughness: 2, oracle: "This creature gets +1/+1 for each Aura attached to it.\nSacrifice an Aura: Regenerate this creature." };

function perm(card, id, over = {}) {
  return { id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function boardWith(userPerms, aiPerms = []) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user",
    players: { ...b.players, user: { ...b.players.user, battlefield: userPerms }, ai: { ...b.players.ai, battlefield: aiPerms } } };
}
const aura = (id, attachedTo) => perm({ name: "Ancestral Mask", type: "Enchantment — Aura", oracle: "Enchant creature" }, id, { attachedTo });
const pt = (state, id) => `${permanentPower(state, id)}/${permanentToughness(state, id)}`;

describe("recognition — every carrier flips", () => {
  it("the single-line carrier is fully native", () => {
    expect(classifyCard(GRACEBLADE)).toBe("native-static");
  });

  it("carriers whose only other line is a modeled keyword flip too", () => {
    expect(classifyCard(URIL)).toBe("native-static");
    expect(classifyCard(RABID_WOMBAT)).toBe("native-static");
  });

  it("the count clause was the ONLY blocker on each", () => {
    // Strip the buff line and each card is already native — so the flip is this clause and nothing else.
    expect(classifyCard({ ...GRACEBLADE, id: "c-a", oracle: "Vigilance" })).toBe("native-body");
    expect(classifyCard({ ...URIL, id: "c-b", oracle: "Hexproof" })).toBe("native-body");
  });
});

describe("⭐ LAW 6 — the count is exact on a real board", () => {
  const hero = perm(GRACEBLADE, "hero");

  it("the harness itself is honest: bare, the creature reads its PRINTED P/T", () => {
    // The witness row. A harness that reads 0/0 here (the first attempt did) makes every other row
    // below a meaningless uniform answer rather than evidence.
    expect(pt(boardWith([hero]), "hero")).toBe("2/3");
  });

  it("each attached Aura adds exactly +2/+2, live", () => {
    expect(pt(boardWith([hero, aura("a1", "hero")]), "hero")).toBe("4/5");
    expect(pt(boardWith([hero, aura("a1", "hero"), aura("a2", "hero")]), "hero")).toBe("6/7");
    expect(pt(boardWith([hero, aura("a1", "hero"), aura("a2", "hero"), aura("a3", "hero")]), "hero")).toBe("8/9");
  });

  it("⭐ an OPPONENT's Aura attached to my creature counts (CR 303.4 — 'attached to it', not 'you control')", () => {
    const oppAura = { ...aura("x1", "hero"), controller: "ai" };
    expect(pt(boardWith([hero, aura("a1", "hero")], [oppAura]), "hero")).toBe("6/7");
  });

  it("⛔ an Aura attached to SOMEONE ELSE does not count", () => {
    expect(pt(boardWith([hero, aura("a1", "other")]), "hero")).toBe("2/3");
  });

  it("⛔ EQUIPMENT is not an Aura — it contributes only its own bonus", () => {
    const sword = perm({ name: "Bonesplitter", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+0." }, "e1", { attachedTo: "hero" });
    expect(pt(boardWith([hero, sword]), "hero")).toBe("4/3"); // +2/+0 from the sword, +0/+0 from the aura count
  });

  it("the buff drops the instant the Aura is gone (re-derived, never cached)", () => {
    const dressed = boardWith([hero, aura("a1", "hero")]);
    expect(pt(dressed, "hero")).toBe("4/5");
    expect(pt(boardWith([hero]), "hero")).toBe("2/3");
  });
});

describe("the two mixed carriers' SECOND halves are real, not along for the ride", () => {
  it("Kor Spiritdancer's Aura-cast trigger is detected and routes natively", () => {
    expect(classifyCard(KOR_SPIRITDANCER)).toBe("native-mixed");
    const [t, ...rest] = detectTriggers(KOR_SPIRITDANCER);
    expect(rest).toHaveLength(0);
    expect(t.event).toBe("cast");
    expect(t.spellFilter).toBe("subtype:Aura");
    expect(t.optional).toBe(true);
    expect(triggerRoutesNatively(t, KOR_SPIRITDANCER)).toBe(true);
  });

  it("Gatherer of Graces' sacrifice-an-Aura regenerate is cost-modeled and program-modeled", () => {
    expect(classifyCard(GATHERER)).toBe("native-mixed");
    const [ab, ...rest] = parseActivatedAbilities(GATHERER);
    expect(rest).toHaveLength(0);
    expect(ab.sacOther).toMatchObject({ type: "permanent", subtype: "aura" });
    expect(ab.costModeled).toBe(true);
    expect(ab.modeled).toBe(true);
    expect(ab.program.atoms.map((a) => a.op)).toEqual(["regenerate"]);
  });
});

describe("⛔ the vocabulary stays narrow — an unmodeled count source still parks", () => {
  it("a count source with no exact evaluator emits nothing and parks the card", () => {
    expect(classifyCard({ ...GRACEBLADE, id: "c-x", name: "Odd Blade",
      oracle: "This creature gets +2/+2 for each Aura attached to target creature an opponent controls." })).toBe("body-only");
    expect(classifyCard({ ...GRACEBLADE, id: "c-y", name: "Odder Blade",
      oracle: "This creature gets +2/+2 for each omen you have interpreted." })).toBe("body-only");
  });

  it("⛔ 'Equipment attached to it' is NOT admitted by this entry", () => {
    // The sibling phrase is a separate vocabulary decision with its own evidence; it has not been made.
    expect(classifyCard({ ...GRACEBLADE, id: "c-z", name: "Steel Blade",
      oracle: "This creature gets +2/+2 for each Equipment attached to it." })).toBe("body-only");
  });
});
