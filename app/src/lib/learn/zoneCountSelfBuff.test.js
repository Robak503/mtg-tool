/**
 * zoneCountSelfBuff.test.js — "gets +N/+N for each card in your hand" / "for each creature card in your
 * graveyard" parked every carrier, and the fix exposed a CONTROLLER bug that had already shipped.
 *
 * ── HALF ONE: TWO VOCABULARIES AND TWO EVALUATORS THAT SHOULD HAVE BEEN ONE PAIR ──────────────────────
 * `countForSpec` owns the ZONE kinds (hand / graveyard) and delegates every OTHER kind straight through to
 * `countSelfSpecOnBoard`. The CDA lane has always called the dispatcher; the layer-7c self-buff lane called
 * the delegate DIRECTLY — a strict subset. So an exact evaluator that already shipped was unreachable from
 * the self-buff lane no matter what its vocabulary said. Both halves are needed and neither buys anything
 * alone: the eval site moves up one hop, and the vocabulary gains the entries.
 *
 * The vocabulary entries are admitted on the CDA allowlist's OWN evidence, which is a STRICTLY STRONGER
 * bar: parseCdaCountSource documents its criterion as "admit only what an evaluator computes EXACTLY",
 * because a CDA *sets* base P/T and a count that silently returned 0 there is a fabricated 0/0 on the
 * battlefield. A layer-7c self-buff only ADDS to the printed body, so anything safe for a CDA is safe here
 * a fortiori. Not a new permission — two vocabularies that disagreed.
 * ⛔ ENUMERATED, NOT DELEGATED WHOLESALE, so a future CDA entry cannot be credited here unargued.
 *
 * ── HALF TWO: "YOUR" MEANS THE SOURCE'S CONTROLLER (CR 109.5), AND IT DIDN'T ───────────────────────────
 * The count read `perm.controller` — the BUFFED creature's controller. On a self-buff those are the same
 * permanent, so nothing was ever visibly wrong there. On a GRANTED buff (an Aura or Equipment pumping its
 * host) they diverge the moment the host is not the granter's, and that is not an exotic case:
 * QUAG SICKNESS ("Enchanted creature gets -1/-1 for each Swamp YOU control") is a REMOVAL Aura whose whole
 * purpose is to sit on an OPPONENT'S creature — it was counting the opponent's Swamps and doing nothing.
 *
 * ⚠️ THIS BUG WAS ALREADY ON MASTER, on at least a dozen cards (Blanchwood Armor, Quag Sickness, Sigil of
 * the Nayan Gods, Raised by Wolves, Cranial Plating…). It surfaced only because Empyrial Armor joined them
 * and got measured. The fix was made BEFORE the new cards were allowed to ship, rather than adding a
 * thirteenth carrier of a known-wrong branch and calling it a gain.
 *
 * The SUBJECT of the count stays the affected permanent (that is what makes "for each Equipment attached to
 * it" mean the HOST's Equipment); only the PERSPECTIVE moves to the source. Both are pinned.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied): the eval site reverted to
 * countSelfSpecOnBoard -> every zone pin red; the perspective spread removed -> every cross-controller pin
 * red while the same-controller pins stay green (which is exactly why it hid for so long).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const DREAD_SLAG = { id: "c-ds", name: "Dread Slag", type: "Creature — Horror", mana: "{4}{B}",
  power: 9, toughness: 9, oracle: "Trample\nThis creature gets -4/-4 for each card in your hand." };
const LILIANAS_ELITE = { id: "c-le", name: "Liliana's Elite", type: "Creature — Zombie", mana: "{2}{B}",
  power: 1, toughness: 1, oracle: "This creature gets +1/+1 for each creature card in your graveyard." };
const SALVAGE_SLASHER = { id: "c-ss", name: "Salvage Slasher", type: "Artifact Creature — Human Rogue", mana: "{2}{U}",
  power: 1, toughness: 1, oracle: "This creature gets +1/+0 for each artifact card in your graveyard." };
const EMPYRIAL_PLATE = { id: "c-ep", name: "Empyrial Plate", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature gets +1/+1 for each card in your hand.\nEquip {2}" };
const EMPYRIAL_ARMOR = { id: "c-ea", name: "Empyrial Armor", type: "Enchantment — Aura", mana: "{3}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each card in your hand." };
const QUAG_SICKNESS = { id: "c-qs", name: "Quag Sickness", type: "Enchantment — Aura", mana: "{2}{B}",
  oracle: "Enchant creature\nEnchanted creature gets -1/-1 for each Swamp you control." };
const BLANCHWOOD_ARMOR = { id: "c-ba", name: "Blanchwood Armor", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each Forest you control." };

function perm(card, id, over = {}) {
  return { id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function board({ user = [], ai = [], userHand = [], aiHand = [], userGy = [], aiGy = [] } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user",
    players: { ...b.players,
      user: { ...b.players.user, battlefield: user, hand: userHand, graveyard: userGy },
      ai: { ...b.players.ai, battlefield: ai, hand: aiHand, graveyard: aiGy } } };
}
const pt = (state, id) => `${permanentPower(state, id)}/${permanentToughness(state, id)}`;
const cards = (n, card = { name: "Opt", type: "Instant", oracle: "", mana: "{U}" }) =>
  Array.from({ length: n }, (_, i) => ({ ...card, name: `${card.name}-${i}` }));
const bear = (id, controller = "user") => perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, id, { controller });
const land = (id, name, controller = "user") => perm({ name, type: `Basic Land — ${name}`, oracle: "" }, id, { controller });

describe("recognition — the zone sources flip their carriers", () => {
  it("hand and graveyard counts are admitted", () => {
    expect(classifyCard(DREAD_SLAG)).toBe("native-static");
    expect(classifyCard(LILIANAS_ELITE)).toBe("native-static");
    expect(classifyCard(SALVAGE_SLASHER)).toBe("native-static");
    expect(classifyCard(EMPYRIAL_PLATE)).toBe("native-equipment");
    expect(classifyCard(EMPYRIAL_ARMOR)).toBe("native-aura");
  });

  it("⛔ a zone source with no exact evaluator in EITHER vocabulary still parks", () => {
    expect(classifyCard({ ...LILIANAS_ELITE, id: "c-x", name: "Odd Elite",
      oracle: "This creature gets +1/+1 for each noncreature, nonland card in your graveyard." })).toBe("body-only");
    expect(classifyCard({ ...LILIANAS_ELITE, id: "c-y", name: "Odder Elite",
      oracle: "This creature gets +1/+1 for each card with cycling in your graveyard." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the zone counts are exact on a real board", () => {
  it("the harness itself is honest: bare, each creature reads its PRINTED P/T", () => {
    expect(pt(board({ user: [perm(DREAD_SLAG, "ds")] }), "ds")).toBe("9/9");
    expect(pt(board({ user: [perm(LILIANAS_ELITE, "le")] }), "le")).toBe("1/1");
  });

  it("a NEGATIVE hand count shrinks exactly (under-counting would make the drawback creature too big)", () => {
    const ds = perm(DREAD_SLAG, "ds");
    expect(pt(board({ user: [ds], userHand: cards(1) }), "ds")).toBe("5/5");
    expect(pt(board({ user: [ds], userHand: cards(2) }), "ds")).toBe("1/1");
  });

  it("a graveyard count reads only MATCHING cards, and only the counter's own graveyard", () => {
    const le = perm(LILIANAS_ELITE, "le");
    const creatureCard = { name: "Bear", type: "Creature — Bear", oracle: "", mana: "{1}{G}" };
    expect(pt(board({ user: [le], userGy: cards(3, creatureCard) }), "le")).toBe("4/4");
    expect(pt(board({ user: [le], userGy: cards(3) }), "le")).toBe("1/1"); // instants, not creatures
    expect(pt(board({ user: [le], aiGy: cards(3, creatureCard) }), "le")).toBe("1/1"); // their graveyard
  });
});

describe("⭐ 'YOUR' IS THE SOURCE'S CONTROLLER (CR 109.5) — the bug that had already shipped", () => {
  it("⭐ Quag Sickness on an OPPONENT's creature counts MY Swamps (its entire purpose)", () => {
    const q = perm(QUAG_SICKNESS, "q", { attachedTo: "foe" });
    const state = board({ user: [q, land("s1", "Swamp"), land("s2", "Swamp"), land("s3", "Swamp")], ai: [bear("foe", "ai")] });
    expect(pt(state, "foe")).toBe("-1/-1"); // printed 2/2, three of MY Swamps
  });

  it("⭐ and the inverse: THEIR Swamps do nothing to their own creature", () => {
    const q = perm(QUAG_SICKNESS, "q", { attachedTo: "foe" });
    const state = board({ user: [q], ai: [bear("foe", "ai"), land("s1", "Swamp", "ai"), land("s2", "Swamp", "ai"), land("s3", "Swamp", "ai")] });
    expect(pt(state, "foe")).toBe("2/2");
  });

  it("⭐ Empyrial Armor I control on an opponent's creature reads MY hand", () => {
    const ar = perm(EMPYRIAL_ARMOR, "ar", { attachedTo: "foe" });
    expect(pt(board({ user: [ar], ai: [bear("foe", "ai")], userHand: cards(3), aiHand: [] }), "foe")).toBe("5/5");
  });

  it("⛔ the SAME-controller cases are unchanged — which is exactly why this hid", () => {
    const bl = perm(BLANCHWOOD_ARMOR, "bl", { attachedTo: "mine" });
    expect(pt(board({ user: [bl, bear("mine"), land("f1", "Forest"), land("f2", "Forest"), land("f3", "Forest")] }), "mine")).toBe("5/5");
    const pl = perm(EMPYRIAL_PLATE, "pl", { attachedTo: "mine" });
    expect(pt(board({ user: [pl, bear("mine")], userHand: cards(2) }), "mine")).toBe("4/4");
  });

  it("⛔ a plain self-buff is untouched (source and affected are one permanent)", () => {
    expect(pt(board({ user: [perm(DREAD_SLAG, "ds")], userHand: cards(2) }), "ds")).toBe("1/1");
    expect(pt(board({ user: [perm(SALVAGE_SLASHER, "ss")], userGy: cards(2, { name: "Bauble", type: "Artifact", oracle: "", mana: "{0}" }) }), "ss")).toBe("3/1");
  });
});
