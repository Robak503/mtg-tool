/**
 * magecraftCopy.test.js — MAGECRAFT COPY HALF (BLITZ MC-1, CR 707.10).
 *
 * CC-1 wired magecraft's CAST half (checkCastTriggers fires "Whenever you cast or copy an instant or sorcery
 * spell" on a real cast, via the event:"cast" + spellFilter:"instantSorcery" route). Its COPY half was a known
 * false-negative: a copy is put on the stack but NOT cast (CR 707.10 — "a copy of a spell isn't cast"), and the
 * copy-creation sites (storm's copy-spell / Double Major's copy-creature-spell atoms in effects/atoms/stack.js)
 * never fired any cast-watcher. Magecraft ALONE triggers on "cast OR copy", so those sites must fire the magecraft
 * watchers specifically — never a plain "Whenever you cast …" trigger (a copy is not a cast — the forbidden FP).
 *
 * THE FIX:
 *   1. The magecraft descriptor alone carries `firesOnCopy:true` (classifyCondition line ~1445, threaded through
 *      the detectTriggers descriptor builder). A generic cast trigger (Guttersnipe) has NO such flag.
 *   2. checkCopyTriggers(state, { copiedSpellCard, controllerId }) scans the SAME watcher set as checkCastTriggers
 *      but fires ONLY firesOnCopy descriptors, re-applying the instantSorcery filter (so a copied CREATURE spell
 *      never fires magecraft) and the whose:"you" gate (the copy's controller is the beneficiary — CR 707.10).
 *   3. applyCopySpell (storm) fires it ONCE PER COPY created; applyCopyCreatureSpell (Double Major) routes through
 *      it too, where the instantSorcery filter correctly makes it a no-op on the copied creature spell.
 *
 * CR: 207.2c (magecraft is an ability word — no 702 keyword entry), 707.10 (copying a spell puts a copy on the
 * stack; a copy isn't cast — the reason magecraft needs the separate "or copy" clause), 707.10f (a copied
 * permanent spell becomes a token). Real oracle text verified vs the bundled local index (cardIndex.lookupCard).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCopyTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// ── real oracle text (verbatim, cardIndex.lookupCard) ─────────────────────────────
const STORM_KILN_ARTIST = {
  name: "Storm-Kiln Artist", type: "Creature — Dwarf Shaman", power: 1, toughness: 1,
  oracle: "This creature gets +1/+0 for each artifact you control.\nMagecraft — Whenever you cast or copy an instant or sorcery spell, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")",
};
const LEONIN_LIGHTSCRIBE = {
  name: "Leonin Lightscribe", type: "Creature — Cat Cleric", power: 2, toughness: 2,
  oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, creatures you control get +1/+1 until end of turn.",
};
const GUTTERSNIPE = {
  name: "Guttersnipe", type: "Creature — Goblin Shaman", power: 2, toughness: 2,
  oracle: "Whenever you cast an instant or sorcery spell, this creature deals 2 damage to each opponent.",
};
const EMPTY_THE_WARRENS = {
  name: "Empty the Warrens", type: "Sorcery", mana: "{3}{R}",
  oracle: "Create two 1/1 red Goblin creature tokens.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
};

// ── helpers ───────────────────────────────────────────────────────────────────────
function boardWithWatcher(card, controller = "user") {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = createPermanent({ id: "watcher", card, controller });
  return { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [perm] } } };
}
const spell = (name, type) => ({ id: `sp-${name}`, name, type });

// ─── recognition: the firesOnCopy marker ───────────────────────────────────────────
describe("MC-1 recognition — magecraft alone carries firesOnCopy", () => {
  it("magecraft descriptor is event:cast + instantSorcery + whose:you + firesOnCopy", () => {
    const d = detectTriggers(LEONIN_LIGHTSCRIBE);
    expect(d).toHaveLength(1);
    expect(d[0].event).toBe("cast");
    expect(d[0].spellFilter).toBe("instantSorcery");
    expect(d[0].whose).toBe("you");
    expect(d[0].firesOnCopy).toBe(true);
  });

  it("Storm-Kiln Artist (real oracle) carries firesOnCopy", () => {
    const d = detectTriggers(STORM_KILN_ARTIST).find((x) => x.event === "cast");
    expect(d).toBeDefined();
    expect(d.firesOnCopy).toBe(true);
  });

  it("a generic 'Whenever you cast an instant or sorcery spell' (Guttersnipe) has NO firesOnCopy", () => {
    const d = detectTriggers(GUTTERSNIPE).find((x) => x.event === "cast");
    expect(d).toBeDefined();
    expect(d.spellFilter).toBe("instantSorcery");
    expect(d.firesOnCopy).toBeFalsy(); // a copy is NOT a cast — this must never fire on a copy
  });
});

// ─── coverage: the cast half stays native (firesOnCopy is additive, no tier churn) ──
describe("MC-1 coverage — magecraft still flips native (cast half unchanged)", () => {
  it("Leonin Lightscribe stays native", () => {
    expect(classifyCard(LEONIN_LIGHTSCRIBE)).toMatch(/^native/);
  });
  it("Storm-Kiln Artist stays native", () => {
    expect(classifyCard(STORM_KILN_ARTIST)).toMatch(/^native/);
  });
});

// ─── checkCopyTriggers: the copy half fires magecraft, ONLY magecraft ───────────────
describe("MC-1 engine — checkCopyTriggers fires the magecraft copy half", () => {
  it("copying an instant fires magecraft; the copier is the beneficiary", () => {
    const s = boardWithWatcher(STORM_KILN_ARTIST);
    const after = checkCopyTriggers(s, { copiedSpellCard: spell("Grapeshot", "Instant"), controllerId: "user" });
    const t = after.pendingTriggers?.find((x) => x.descriptor?.event === "cast");
    expect(t).toBeDefined();
    expect(t.descriptor.firesOnCopy).toBe(true);
    expect(t.controller).toBe("user"); // CR 707.10 — you copy, so the effect resolves for you
  });

  it("copying a sorcery fires magecraft", () => {
    const s = boardWithWatcher(STORM_KILN_ARTIST);
    const after = checkCopyTriggers(s, { copiedSpellCard: spell("Ponder", "Sorcery"), controllerId: "user" });
    expect(after.pendingTriggers?.some((x) => x.descriptor?.event === "cast")).toBe(true);
  });

  it("copying a CREATURE spell does NOT fire magecraft (instantSorcery filter — the Double Major class)", () => {
    const s = boardWithWatcher(STORM_KILN_ARTIST);
    const after = checkCopyTriggers(s, { copiedSpellCard: spell("Runeclaw Bear", "Creature — Bear"), controllerId: "user" });
    expect(after.pendingTriggers?.some((x) => x.descriptor?.event === "cast")).toBeFalsy();
  });

  it("a generic 'whenever you cast' watcher (Guttersnipe) does NOT fire on a copy — the cardinal FP guard", () => {
    const s = boardWithWatcher(GUTTERSNIPE);
    const after = checkCopyTriggers(s, { copiedSpellCard: spell("Grapeshot", "Instant"), controllerId: "user" });
    expect(after.pendingTriggers?.length ?? 0).toBe(0);
  });

  it("an OPPONENT's copy does NOT fire your magecraft (whose:you — magecraft is 'whenever YOU … copy')", () => {
    const s = boardWithWatcher(STORM_KILN_ARTIST, "user");
    const after = checkCopyTriggers(s, { copiedSpellCard: spell("Grapeshot", "Instant"), controllerId: "ai" });
    expect(after.pendingTriggers?.length ?? 0).toBe(0);
  });
});

// ─── storm integration: magecraft fires on the cast AND on every copy ───────────────
describe("MC-1 integration — storm: magecraft fires on the original cast + each copy", () => {
  // Cast a storm spell as the (prior+1)th spell of the turn with `watchers` on `user`'s battlefield, drain the stack.
  function castStormWith(watchers, { prior }) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const c = { ...EMPTY_THE_WARRENS, id: "storm1" };
    const bf = watchers.map((w, i) => createPermanent({ id: `w${i}`, card: w.card, controller: w.controller }));
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [c], battlefield: bf.filter((p) => p.controller === "user"), manaPool: { ...s.players.user.manaPool, C: 20, R: 20, G: 20, U: 20 }, spellsCastThisTurn: prior },
        ai: { ...s.players.ai, battlefield: bf.filter((p) => p.controller === "ai") },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "storm1");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    let guard = 0;
    while (s.stack.length > 0 && guard++ < 80) s = resolveTopOfStack(s);
    return s;
  }
  const treasuresOf = (s, pid) =>
    (s.players[pid]?.battlefield || []).filter((p) => /Treasure/.test(String(p.card?.name || p.card?.type || p.card?.type_line || "")));
  const goblinsOf = (s, pid) =>
    (s.players[pid]?.battlefield || []).filter((p) => p.card?.token && /Goblin/.test(String(p.card?.type || "")));

  it("Empty the Warrens as the 3rd spell (2 copies) + Storm-Kiln Artist → 3 Treasures (1 cast + 2 copies)", () => {
    const s = castStormWith([{ card: STORM_KILN_ARTIST, controller: "user" }], { prior: 2 });
    expect(goblinsOf(s, "user").length).toBe(6); // storm intact: original 2 + 2 copies × 2
    expect(treasuresOf(s, "user").length).toBe(3); // magecraft: 1 on the cast + 1 per copy
  });

  it("Empty the Warrens as the 1st spell (0 copies) → 1 Treasure (the cast half only)", () => {
    const s = castStormWith([{ card: STORM_KILN_ARTIST, controller: "user" }], { prior: 0 });
    expect(goblinsOf(s, "user").length).toBe(2); // original only, no copies
    expect(treasuresOf(s, "user").length).toBe(1); // just the cast
  });

  it("an OPPONENT's Storm-Kiln Artist gets NOTHING while you storm (whose:you at both the cast and copy sites)", () => {
    const s = castStormWith([{ card: STORM_KILN_ARTIST, controller: "ai" }], { prior: 2 });
    expect(goblinsOf(s, "user").length).toBe(6);
    expect(treasuresOf(s, "ai").length).toBe(0); // magecraft is "whenever YOU cast or copy" — not the opponent's storm
  });
});
