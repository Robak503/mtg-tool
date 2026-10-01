/**
 * SEVINNE'S RECLAMATION — the play-weighted program, P·23 (EDHREC #339).
 *   "Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If this spell was cast
 *    from a graveyard, you may copy this spell and may choose a new target for the copy.
 *    Flashback {4}{W}"
 *
 * THE SEAM: "if this spell was cast from a graveyard" (a 14-card family) is a cast-time fact. applyCastSpell stamps
 * params.context.castFromGraveyard on a graveyard cast; the resolving spell reads it through the condition reader; and a
 * copy, which is never cast (CR 707.10), never inherits it — every copy site clones through stack.spellCopyPayload.
 * THE COPY: one copy of the resolving spell, its body the reanimate, its target re-picked off the live board (CR 707.10c).
 * IN PASSING: the instant/sorcery copy (Reverberate) kept the original's graveyard disposition, so a resolved copy put a
 * second object with the original card's id into the graveyard. spellCopyPayload strips it at every copy site.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createStackObject, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { stackResolvers, spellCopyPayload } from "./effects/atoms/stack.js";
import { evaluateInterveningIf, spellConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SEVINNE = { id: "sev", name: "Sevinne's Reclamation", type: "Sorcery", mana: "{2}{W}", cmc: 3, keywords: ["Flashback"], oracle: "Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.\nFlashback {4}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const ring = { id: "g-ring", name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, oracle: "{T}: Add {C}{C}." };
const bears = { id: "g-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" };
const wurm = { id: "g-wurm", name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: 6, toughness: 4, oracle: "" };

function board({ hand = [], graveyard = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, hand, graveyard, manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
}
const castAt = (s, { flashback, target }) => {
  const a = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
    .find((x) => x.cardId === "sev" && !!x.flashbackCast === flashback && (x.targets || []).some((t) => t.id === target));
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
};
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 10) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const names = (cards) => cards.map((c) => c.name).sort();
const bf = (s) => names(s.players.user.battlefield.map((p) => p.card));

describe("parse + classify", () => {
  it("the reanimate, then an optional self-copy gated on the cast-from-a-graveyard read; the card classifies native-spell", () => {
    const p = parseEffectProgram(SEVINNE);
    const reanimate = { op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter: "permanent", mvMax: 3 } };
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([reanimate, { op: "copy-self-spell", optional: true, condition: "this spell was cast from a graveyard", body: [reanimate], spellType: "Sorcery", targetType: null }]);
    expect(classifyCard(SEVINNE)).toBe("native-spell");
  });
  it("the condition is a definite spell-side read: true only with the cast-time stamp", () => {
    const s = board();
    expect(spellConditionParseable("this spell was cast from a graveyard")).toBe(true);
    expect(evaluateInterveningIf(s, "this spell was cast from a graveyard", "user", { castFromGraveyard: true })).toBe(true);
    expect(evaluateInterveningIf(s, "this spell was cast from a graveyard", "user", {})).toBe(false);
  });
  it("a copy needs ONE chosen target to re-pick: an untargeted body stays unparsed", () => {
    const high = (oracle) => parseEffectProgram({ ...SEVINNE, oracle }).confidence === "high";
    expect(high("Draw a card. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.")).toBe(false);
  });
});

describe("runtime", () => {
  it("cast from hand: the target returns and no copy is offered", () => {
    const s = settle(resolveTopOfStack(castAt(board({ hand: [SEVINNE], graveyard: [ring, bears], pool: { W: 1, C: 2 } }), { flashback: false, target: "g-ring" })));
    const row = { pc: s.pendingChoice?.kind ?? null, bf: bf(s), gy: names(s.players.user.graveyard), stack: s.stack.length };
    console.log("  WITNESS sevinneHand", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pc: null, bf: ["Sol Ring"], gy: ["Grizzly Bears", "Sevinne's Reclamation"], stack: 0 });
  });

  it("flashback: the target returns, the copy is offered, and taken it returns ANOTHER card; the spell is exiled and the copy leaves nothing behind", () => {
    const paused = resolveTopOfStack(castAt(board({ graveyard: [SEVINNE, ring, bears, wurm], pool: { W: 1, C: 4 } }), { flashback: true, target: "g-ring" }));
    const offer = { kind: paused.pendingChoice?.kind, effectOp: paused.pendingChoice?.effectOp, bf: bf(paused) };
    const copied = resolveOptionalChoice(paused, true);
    const copyOnStack = copied.stack.find((o) => o.isCopy);
    const done = settle(copied);
    const row = { offer, copyTarget: copyOnStack?.targets?.map((t) => t.id), bf: bf(done), gy: names(done.players.user.graveyard), exile: names(done.players.user.exile), stack: done.stack.length };
    console.log("  WITNESS sevinneFlashback", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      offer: { kind: "optional-effect", effectOp: "copy-self-spell", bf: ["Sol Ring"] },
      copyTarget: ["g-bears"],           // the original's target already returned — the copy picked the other legal card
      bf: ["Grizzly Bears", "Sol Ring"],
      gy: ["Craw Wurm"],                 // MV 6 was never a legal target; nothing else is left
      exile: ["Sevinne's Reclamation"],  // flashback exiles it (CR 702.34a); the copy is no card at all
      stack: 0,
    });
  });

  it("flashback, copy declined: only the one target returns", () => {
    const paused = resolveTopOfStack(castAt(board({ graveyard: [SEVINNE, ring, bears], pool: { W: 1, C: 4 } }), { flashback: true, target: "g-ring" }));
    const done = settle(resolveOptionalChoice(paused, false));
    expect({ bf: bf(done), gy: names(done.players.user.graveyard), stack: done.stack.length }).toEqual({ bf: ["Sol Ring"], gy: ["Grizzly Bears"], stack: 0 });
  });

  it("flashback with no other legal card: the copy keeps the original's target, which is gone — it fizzles (CR 608.2b), nothing returns twice", () => {
    const paused = resolveTopOfStack(castAt(board({ graveyard: [SEVINNE, ring, wurm], pool: { W: 1, C: 4 } }), { flashback: true, target: "g-ring" }));
    const done = settle(resolveOptionalChoice(paused, true));
    expect({ bf: bf(done), gy: names(done.players.user.graveyard), stack: done.stack.length }).toEqual({ bf: ["Sol Ring"], gy: ["Craw Wurm"], stack: 0 });
  });
});

describe("the copy is a copy", () => {
  it("magecraft sees it: Archmage Emeritus's 'cast or copy an instant or sorcery spell' triggers once for the self-copy (CR 707.10)", () => {
    const archmage = { id: "c-arch", name: "Archmage Emeritus", type: "Creature — Human Wizard", mana: "{2}{U}{U}", cmc: 4, power: 2, toughness: 2, keywords: ["Magecraft"], oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, draw a card." };
    const s0 = board({ graveyard: [bears] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [{ id: "arch", card: archmage, controller: "user", tapped: false, summoningSick: false, counters: {} }] } } };
    const atom = parseEffectProgram(SEVINNE).atoms[1];
    const next = stackResolvers["copy-self-spell"](s, atom, { controller: "user", cardName: SEVINNE.name, targets: [] });
    const row = { copies: next.stack.filter((o) => o.isCopy).map((o) => ({ type: o.source.type, targets: o.targets.map((t) => t.id) })), triggers: (next.pendingTriggers || []).map((t) => t.sourceName ?? t.source?.name ?? null) };
    console.log("  WITNESS sevinneMagecraft", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.copies).toEqual([{ type: "Sorcery", targets: ["g-bears"] }]);
    expect(row.triggers).toHaveLength(1);
  });
});

describe("copies are never cast", () => {
  it("spellCopyPayload strips the cast-time facts — the graveyard disposition and the cast-from-a-graveyard stamp — and nothing else", () => {
    const original = { resolver: "effect-program", params: { program: { atoms: [] }, controller: "user", targets: [{ type: "player", id: "ai" }], context: { castFromGraveyard: true, other: 1 }, spellToGraveyard: { playerId: "user", card: { id: "x" } } } };
    const copy = spellCopyPayload(original);
    expect(copy.params).toEqual({ program: { atoms: [] }, controller: "user", targets: [{ type: "player", id: "ai" }], context: { other: 1 } });
    expect(original.params.context.castFromGraveyard).toBe(true); // deep: the original is untouched
  });

  it("FIXED — a Reverberate-style copy of a cast Lightning Bolt no longer puts a second Bolt into its owner's graveyard", () => {
    let s = board({ hand: [BOLT], pool: { R: 1 } });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "bolt" && (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    s = dispatchAction(s, cast);
    const boltObj = s.stack.find((o) => o.source?.name === "Lightning Bolt");
    s = stackResolvers["copy-instant-or-sorcery"](s, { op: "copy-instant-or-sorcery" }, { controller: "user", targets: [{ type: "spell", id: boltObj.id }] });
    s = settle(s);
    expect(names(s.players.user.graveyard)).toEqual(["Lightning Bolt"]);
    expect(s.players.ai.life).toBe(34); // both resolved: 3 + 3
  });

  it("a stack object carrying the stamp is copied without it (the Fork family copying a flashback spell)", () => {
    const obj = createStackObject({ id: "s1", kind: "spell", source: { name: "Sevinne's Reclamation" }, controller: "user", targets: [], payload: { resolver: "effect-program", params: { program: { atoms: [] }, controller: "user", targets: [], context: { castFromGraveyard: true } } } });
    const s = { ...board(), stack: [obj] };
    const next = stackResolvers["copy-instant-or-sorcery"](s, { op: "copy-instant-or-sorcery" }, { controller: "user", targets: [{ type: "spell", id: "s1" }] });
    const copy = next.stack.find((o) => o.isCopy);
    expect(copy.payload.params.context).toEqual({});
    expect(evaluateInterveningIf(next, "this spell was cast from a graveyard", "user", copy.payload.params.context)).toBe(false);
  });
});
