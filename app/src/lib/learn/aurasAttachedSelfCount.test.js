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

});

/**
 * ⛔ THE SIBLINGS, AND THE FALSE POSITIVE THEY EXPOSED.
 *
 * Extending the same scan to "for each Equipment attached to it" and the combined "Aura and Equipment"
 * gained five more carriers — and TWO CARDS THAT MUST NOT HAVE FLIPPED. The phrase regex accepted
 * "attached to this creature" alongside "attached to it", and the card name is normalized to "this creature"
 * upstream, so a GROUP ANTHEM that names its own source arrived looking self-referential.
 *
 * The evaluator counts against the AFFECTED permanent — which is precisely what makes the Equipment lane
 * read the host correctly. In a self-buff the affected IS the source, so "it" is exact. In a group anthem
 * the source and the affected are DIFFERENT permanents, and counting the affected inverts the card. Measured
 * on Armament Master, both directions wrong:
 *     two Equipment on the MASTER, none on the Kor  -> Kor read 2/2, correct is 6/6
 *     none on the MASTER, two on the KOR            -> Kor read 6/6, correct is 2/2
 *
 * A CLEAN FLIP-DIFF DID NOT MEAN A SAFE CHANGE: the diff was GAINED 7 / LOST 0 / RETIERED 0. Two of those
 * seven were wrong, and nothing in the diff said so — only reading each gained row's whole card did. The
 * fix costs nothing, because every genuine carrier of this lane prints "attached to it".
 *
 * The Aura arm shipped one commit earlier carrying the same latent phrasing. It admitted no group anthem in
 * practice (re-measuring with "this creature" removed showed LOST 0 against that build, which is the proof),
 * so nothing wrong reached master — but the hazard was live and is closed here before it could fire.
 */
describe("the Equipment siblings", () => {
  const MYR_ADAPTER = { id: "c-ma", name: "Myr Adapter", type: "Artifact Creature — Myr", mana: "{3}",
    power: 1, toughness: 1, oracle: "This creature gets +1/+1 for each Equipment attached to it." };
  const GOBLIN_GAVELEER = { id: "c-gv", name: "Goblin Gaveleer", type: "Creature — Goblin Warrior", mana: "{2}{R}",
    power: 1, toughness: 1, oracle: "Trample\nThis creature gets +2/+0 for each Equipment attached to it." };
  const CHAMPION = { id: "c-cf", name: "Champion of the Flame", type: "Creature — Human Warrior", mana: "{1}{R}",
    power: 1, toughness: 1, oracle: "Trample\nThis creature gets +2/+2 for each Aura and Equipment attached to it." };
  const GAUNTLETS = { id: "c-gg2", name: "Golem-Skin Gauntlets", type: "Artifact — Equipment", mana: "{2}",
    oracle: "Equipped creature gets +1/+0 for each Equipment attached to it.\nEquip {2}" };

  const bear = perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear");
  const gear = (id, attachedTo) => perm({ name: "Leather Armor", type: "Artifact — Equipment", oracle: "Equip {1}" }, id, { attachedTo });

  it("all four carriers flip", () => {
    expect(classifyCard(MYR_ADAPTER)).toBe("native-static");
    expect(classifyCard(GOBLIN_GAVELEER)).toBe("native-static");
    expect(classifyCard(CHAMPION)).toBe("native-static");
    expect(classifyCard(GAUNTLETS)).toBe("native-equipment");
  });

  it("the Equipment count is exact on a real board", () => {
    const gv = perm(GOBLIN_GAVELEER, "gv");
    expect(pt(boardWith([gv]), "gv")).toBe("1/1");
    expect(pt(boardWith([gv, gear("e1", "gv")]), "gv")).toBe("3/1");
    expect(pt(boardWith([gv, gear("e1", "gv"), gear("e2", "gv")]), "gv")).toBe("5/1");
    expect(pt(boardWith([gv, gear("e1", "other")]), "gv")).toBe("1/1");
  });

  it("the combined count is ONE widened scan, not two counts summed", () => {
    const ch = perm(CHAMPION, "ch");
    expect(pt(boardWith([ch]), "ch")).toBe("1/1");
    expect(pt(boardWith([ch, aura("a1", "ch")]), "ch")).toBe("3/3");
    expect(pt(boardWith([ch, gear("e1", "ch")]), "ch")).toBe("3/3");
    expect(pt(boardWith([ch, aura("a1", "ch"), gear("e1", "ch")]), "ch")).toBe("5/5");
  });

  it("⭐ on an EQUIPMENT, 'it' is the HOST — the count follows the affected permanent, not the source", () => {
    // Golem-Skin Gauntlets counts ITSELF, because it is an Equipment attached to the host (correct per the
    // printed card). Counting against the SOURCE would tally Equipment attached to the Gauntlets: always 0.
    const g = perm(GAUNTLETS, "g1", { attachedTo: "bear" });
    expect(pt(boardWith([bear, g]), "bear")).toBe("3/2");
    expect(pt(boardWith([bear, g, gear("p1", "bear")]), "bear")).toBe("4/2");
    expect(pt(boardWith([bear, g, gear("p1", "other")]), "bear")).toBe("3/2");
    expect(pt(boardWith([bear, perm(GAUNTLETS, "g1", { attachedTo: null })]), "bear")).toBe("2/2");
  });
});

describe("⛔ THE MEASURED FALSE POSITIVE — a group anthem naming its own source must NOT be admitted", () => {
  const ARMAMENT_MASTER = { id: "c-am", name: "Armament Master", type: "Creature — Kor Soldier", mana: "{1}{W}{W}",
    power: 2, toughness: 2, oracle: "Other Kor creatures you control get +2/+2 for each Equipment attached to this creature." };
  const KELLAN = { id: "c-ke", name: "Kellan, the Fae-Blooded", type: "Legendary Creature — Human Faerie", mana: "{2}{R}",
    power: 2, toughness: 2, oracle: "Double strike\nOther creatures you control get +1/+0 for each Aura and Equipment attached to this creature." };

  it("both park — 'this creature' names the SOURCE, and the evaluator reads the AFFECTED", () => {
    expect(classifyCard(ARMAMENT_MASTER)).toBe("body-only");
    expect(classifyCard(KELLAN)).toBe("body-only");
  });

  it("the buffed creature keeps its PRINTED P/T — no inverted count reaches the board", () => {
    // The exact board that measured 2/2-where-6/6 and 6/6-where-2/2 while the phrase was admitted.
    const master = perm(ARMAMENT_MASTER, "master");
    const kor = perm({ name: "Kor Hookmaster", type: "Creature — Kor Soldier", power: 2, toughness: 2, oracle: "" }, "kor");
    const gear = (id, attachedTo) => perm({ name: "Leather Armor", type: "Artifact — Equipment", oracle: "Equip {1}" }, id, { attachedTo });
    expect(pt(boardWith([master, kor, gear("e1", "master"), gear("e2", "master")]), "kor")).toBe("2/2");
    expect(pt(boardWith([master, kor, gear("e1", "kor"), gear("e2", "kor")]), "kor")).toBe("2/2");
  });

  it("the SELF phrasing of the very same count source still works (the fix is narrow)", () => {
    expect(classifyCard({ ...ARMAMENT_MASTER, id: "c-am2", name: "Lone Master",
      oracle: "This creature gets +2/+2 for each Equipment attached to it." })).toBe("native-static");
  });
});
