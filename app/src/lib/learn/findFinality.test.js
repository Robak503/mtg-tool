/**
 * findFinality.test.js — "put N +1/+1 counters on a creature you control", the NON-targeted own-creature placement
 * (Mothman Cometh shelf, 2026-10-17).
 *
 *   Find // Finality — Find: "Return up to two target creature cards from your graveyard to your hand." (already native)
 *                      Finality: "You may put two +1/+1 counters on a creature you control. Then all creatures get -4/-4
 *                      until end of turn."
 *
 * THE SEAM: the counter parser read "… on target creature you control" (a chosen target) but not the untargeted "… on a
 * creature you control", so Finality's first sentence parked the half and the split card stayed on the Arbiter (CR 709: a
 * split card is native only when both halves are). The untargeted form is now the existing add-counter atom on the
 * `oneYouControl` scope — the creature is chosen as the spell resolves, not targeted (bundled ruling 2018-10-05: "Finality
 * doesn't target the creature … You can cast it even if you control no creatures."), by the house pick the shield-counter
 * mode already uses (the controller's highest-power creature). +1/+1 only: a -1/-1 placement is a different choice. "You
 * may" is the ordinary optional-effect pause, so the controller can decline. The -4/-4 is the existing mass pump and
 * reaches only creatures on the battlefield as it resolves.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, generated in-session 2026-10-17 — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice, resolveHandDiscardChoice } from "./effects/runProgram.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitFaceCards } from "./splitCard.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIND_FINALITY = {"name":"Find // Finality","type":"Sorcery // Sorcery","mana":"{B/G}{B/G} // {4}{B}{G}","cmc":8,"keywords":[],"colors":["B","G"],"layout":"split","oracle":"Find - Sorcery {B/G}{B/G}\nReturn up to two target creature cards from your graveyard to your hand.\n//\nFinality - Sorcery {4}{B}{G}\nYou may put two +1/+1 counters on a creature you control. Then all creatures get -4/-4 until end of turn."};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"power":"3","toughness":"3","oracle":""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"power":"2","toughness":"2","oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"keywords":[],"colors":["G"],"power":"6","toughness":"4","oracle":""};

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });

function board({ mine = true } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const user = mine ? [perm("giant", HILL_GIANT, "user"), perm("bears", GRIZZLY_BEARS, "user")] : [];
  return {
    ...s, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand: [{ ...FIND_FINALITY, id: "ff" }], manaPool: { W: 0, U: 0, B: 4, R: 0, G: 4, C: 0 } },
      ai1: { ...s.players.ai1, battlefield: [perm("wurm", CRAW_WURM, "ai1")] },
    },
  };
}
/** Cast the Finality half through the real split lane and resolve it, answering the "you may" with `take`. */
function castFinality(s0, take) {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "ff" && (a.faceCard?.name ?? a.name) === "Finality");
  expect(act, "the Finality half is offered").toBeTruthy();
  let s = finalizeStackResolution(dispatchAction(s0, act));
  for (let guard = 0; guard < 8 && (s.stack.length || s.pendingChoice); guard++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, take); continue; }
    if (s.pendingChoice) break;
    s = finalizeStackResolution(resolveTopOfStack(s));
  }
  return s;
}
const names = (s, pid) => s.players[pid].battlefield.map((p) => p.card?.name).sort();
const plus = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;

describe("the parse", () => {
  it("\"put two +1/+1 counters on a creature you control\" is the untargeted own-creature placement", () => {
    expect(parseEffectClause("Put two +1/+1 counters on a creature you control.", "Sorcery").atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 2, scope: "oneYouControl" }]);
  });
  it("a \"you may\" sentence then a bare \"Then\" sentence joins; the conjoined \"you may X and Y\" stays refused (the α2 scope rule)", () => {
    expect(parseEffectClause("You may draw a card. Then each opponent loses 2 life.", "Sorcery").atoms)
      .toEqual([{ op: "draw", amount: 1, targetType: null, optional: true }, { op: "lose-life", amount: 2, who: "eachOpponent", targetType: null }]);
    expect(programConfidence(parseEffectClause("You may draw a card and each opponent loses 2 life.", "Sorcery"))).toBe("low");
    // …and a conjoined "you may X and Y" FIRST sentence is not let through by the join either.
    expect(programConfidence(parseEffectClause("You may draw a card and each opponent loses 2 life. Then you gain 1 life.", "Sorcery"))).toBe("low");
    // …nor a free cast, which must stay the last thing a program does (the joined program is re-asked whole).
    expect(programConfidence(parseEffectClause("You may cast an instant or sorcery spell with mana value 3 or less from your hand without paying its mana cost. Then draw a card.", "Sorcery"))).toBe("low");
  });
  it("⛔ a -1/-1 placement on a creature you control stays unread", () => {
    expect(parseEffectClause("Put a -1/-1 counter on a creature you control.", "Sorcery").confidence).toBe("low");
  });
  it("Finality: the optional placement, then the mass -4/-4; Find // Finality is native", () => {
    const [, finality] = splitFaceCards(FIND_FINALITY);
    const p = parseEffectProgram(finality);
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => ({ op: a.op, scope: a.scope, optional: !!a.optional, targetType: a.targetType ?? null }))).toEqual([
      { op: "add-counter", scope: "oneYouControl", optional: true, targetType: null },
      { op: "pump", scope: undefined, optional: false, targetType: "eachCreature" },
    ]);
    expect(classifyCard(FIND_FINALITY)).toBe("native-spell");
  });
});

// ── The twins the untargeted placement flipped (flip-diff 2026-10-17), each audited whole-card: that sentence was the only
//    unread one. ──
const HUMILIATE = {"name":"Humiliate","type":"Sorcery","mana":"{W}{B}","cmc":2,"keywords":[],"colors":["B","W"],"oracle":"Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. Put a +1/+1 counter on a creature you control."};
const SWORD_OF_TRUTH_AND_JUSTICE = {"name":"Sword of Truth and Justice","type":"Artifact — Equipment","mana":"{3}","cmc":3,"keywords":["Proliferate","Equip"],"colors":[],"oracle":"Equipped creature gets +2/+2 and has protection from white and from blue.\nWhenever equipped creature deals combat damage to a player, put a +1/+1 counter on a creature you control, then proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\nEquip {2}"};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};

describe("the twins", () => {
  it("Sword of Truth and Justice: the combat-damage trigger is the placement then proliferate; native-equipment", () => {
    const d = detectTriggers(SWORD_OF_TRUTH_AND_JUSTICE).find((t) => t.event === "combatDamageToPlayer");
    expect(parseEffectClause(d.effectClause, "Artifact — Equipment").atoms.map((a) => a.op + (a.scope ? `:${a.scope}` : ""))).toEqual(["add-counter:oneYouControl", "proliferate"]);
    expect(classifyCard(SWORD_OF_TRUTH_AND_JUSTICE)).toBe("native-equipment");
  });

  it("⭐ Humiliate: the opponent discards the chosen nonland card, then my highest-power creature gets the counter", () => {
    const s0 = board();
    const s1 = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...HUMILIATE, id: "hum" }], manaPool: { W: 1, U: 0, B: 1, R: 0, G: 0, C: 0 } },
      ai1: { ...s0.players.ai1, hand: [{ ...DIVINATION, id: "a-div" }] } } };
    const act = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hum" && (a.targets || []).some((t) => t.id === "ai1"));
    expect(act).toBeTruthy();
    let s = resolveTopOfStack(dispatchAction(s1, act));
    expect(s.pendingChoice?.kind).toBe("hand-discard");
    s = resolveHandDiscardChoice(s, "a-div");
    for (let g = 0; g < 4 && s.stack.length && !s.pendingChoice; g++) s = resolveTopOfStack(s);
    expect(s.players.ai1.graveyard.map((c) => c.name)).toEqual(["Divination"]);
    expect(plus(s, "user", "giant")).toBe(1);
    expect(plus(s, "user", "bears")).toBe(0);
    expect(classifyCard(HUMILIATE)).toBe("native-spell");
  });
});

describe("runtime — Finality cast from hand", () => {
  it("⭐ taken: the Hill Giant (my highest power) gets two counters and survives the -4/-4 as a 1/1; the Bears and the Wurm die", () => {
    const s = castFinality(board(), true);
    expect(names(s, "user")).toEqual(["Hill Giant"]);
    expect(plus(s, "user", "giant")).toBe(2);
    expect(names(s, "ai1")).toEqual([]);
    expect(s.players.user.graveyard.some((c) => c.name === "Find // Finality")).toBe(true);
  });

  it("⭐ declined: no counters — every creature dies", () => {
    const s = castFinality(board(), false);
    expect(names(s, "user")).toEqual([]);
    expect(names(s, "ai1")).toEqual([]);
  });

  it("with no creature of mine it is still cast and resolves: the Wurm dies, nothing else happens", () => {
    const s = castFinality(board({ mine: false }), true);
    expect(names(s, "ai1")).toEqual([]);
    expect(s.players.user.battlefield).toEqual([]);
  });
});
