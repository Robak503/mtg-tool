/**
 * NECROPOTENCE (the play-weighted program, EDHREC #519) — every line of the card, played by the engine:
 *   "Skip your draw step."                                   → the RG-4 static (CR 614.10), read in the turn loop's draw step.
 *   "Whenever you discard a card, exile that card from your graveyard."
 *                                                            → a discard trigger (CR 701.9a) whose effect acts on the object
 *                                                              the discard put into the graveyard (CR 603.6, CR 400.7).
 *   "Pay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next
 *    end step."                                              → a life-cost activation (CR 119.4 / 119.8) exiling face down
 *                                                              (CR 406.3) with a card-bound delayed return (CR 603.7).
 * Plus the two engine seams the card needs on its most common path, the cleanup hand-size discard: that discard fires the
 * discard triggers (CR 514.1 / 701.9a), and a cleanup step whose triggers went on the stack grants priority and is followed
 * by ANOTHER cleanup step (CR 514.3a) — the triggers resolve in this turn's cleanup, never in the next turn.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-01); per-test instance ids only.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectProgram } from "./effects/parser.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { checkDiscardTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, flushTriggers, nextStep, passPriority, resolveTopOfStack, runStepActions, settleCleanupDiscardChoice } from "./gameEngine.js";
import { advanceUntilDecision, applyCleanupDiscardChoice } from "./learnSession.js";
import { pickAction } from "./opponentAI.js";
import { applyScheduleDelayed } from "./effects/atoms/delayedTrigger.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject, grantTeferiShield, millCards, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const NECROPOTENCE = {"name":"Necropotence","type":"Enchantment","mana":"{B}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step."}; // native-mixed
const BAG_OF_HOLDING = {"name":"Bag of Holding","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"Whenever you discard a card, exile that card from your graveyard.\n{2}, {T}: Draw a card, then discard a card.\n{4}, {T}, Sacrifice this artifact: Return all cards exiled with this artifact to their owner's hand."}; // body-only
const CONTAINMENT_CONSTRUCT = {"name":"Containment Construct","type":"Artifact Creature — Construct","mana":"{2}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":[],"oracle":"Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn."}; // body-only
const CURRENCY_CONVERTER = {"name":"Currency Converter","type":"Artifact","mana":"{1}","cmc":1,"keywords":["Treasure"],"colors":[],"oracle":"Whenever you discard a card, you may exile that card from your graveyard.\n{2}, {T}: Draw a card, then discard a card.\n{T}: Put a card exiled with this artifact into its owner's graveyard. If it's a land card, create a Treasure token. If it's a nonland card, create a 2/2 black Rogue creature token."}; // body-only
const MOONSTONE = {"name":"Moonstone, Harsh Mistress","type":"Legendary Creature — Human Doctor Villain","mana":"{3}{B}","cmc":4,"power":"2","toughness":"4","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nWhenever you discard a card, you may exile that card from your graveyard. If you do, until the end of your next turn, you may play that card."}; // body-only
const NECRO_IMPOTENCE = {"name":"Necro-Impotence","type":"Enchantment","mana":"{B}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Skip your untap step.\nAt the beginning of your upkeep, you may pay X life. If you do, untap X permanents.\nPay ½ life: Exile the top card of your library face down. Put that card into your hand at the beginning of the next end step."}; // body-only
const BOMAT_COURIER = {"name":"Bomat Courier","type":"Artifact Creature — Construct","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":[],"oracle":"Haste\nWhenever this creature attacks, exile the top card of your library face down. (You can't look at it.)\n{R}, Discard your hand, Sacrifice this creature: Put all cards exiled with this creature into their owners' hands."}; // body-only
const KNOWLEDGE_VAULT = {"name":"Knowledge Vault","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"{2}, {T}: Exile the top card of your library face down.\n{0}: Sacrifice this artifact. If you do, discard your hand, then put all cards exiled with this artifact into their owner's hand.\nWhen this artifact leaves the battlefield, put all cards exiled with it into their owner's graveyard."}; // body-only
const YAWGMOTHS_BARGAIN = {"name":"Yawgmoth's Bargain","type":"Enchantment","mana":"{4}{B}{B}","cmc":6,"keywords":[],"colors":["B"],"oracle":"Skip your draw step.\nPay 1 life: Draw a card."}; // native-mixed
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."}; // native-mixed
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const LONELY_SANDBAR = {"name":"Lonely Sandbar","type":"Land","mana":"","cmc":0,"keywords":["Cycling"],"colors":[],"oracle":"This land enters tapped.\n{T}: Add {U}.\nCycling {U} ({U}, Discard this card: Draw a card.)"}; // land
const MIND_ROT = {"name":"Mind Rot","type":"Sorcery","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Target player discards two cards."}; // native-spell
const LILIANAS_CARESS = {"name":"Liliana's Caress","type":"Enchantment","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever an opponent discards a card, that player loses 2 life."}; // native-trigger
const MESMERIC_ORB = {"name":"Mesmeric Orb","type":"Artifact","mana":"{2}","cmc":2,"keywords":["Mill"],"colors":[],"oracle":"Whenever a permanent becomes untapped, that permanent's controller mills a card."}; // native-trigger

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const cards = (prefix, n, base = SWAMP) => Array.from({ length: n }, (_, i) => ({ ...base, id: `${prefix}${i}` }));
const necroPerm = (controller = "user") => createPermanent({ id: `necro-${controller}`, card: { ...NECROPOTENCE, id: `c-necro-${controller}` }, controller, summoningSick: false });

/** The user's precombat main phase, holding priority, with Necropotence (unless `necro: false`). */
function mainPhase({ necro = true, life = 20, library = 6, hand = [], graveyard = [], userBf = [], aiBf = [], pool = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life, hand, graveyard, exile: [], library: cards("u-lib-", library),
        battlefield: [...(necro ? [necroPerm("user")] : []), ...userBf], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, hand: [], graveyard: [], exile: [], library: cards("a-lib-", 10), battlefield: aiBf },
    },
  };
}
const necroActivation = (s, playerId = "user") => legalActionsForPlayer(s, playerId).find((a) => a.kind === "activate-ability" && a.permanentId === `necro-${playerId}`);
/** Pass priority around the table until the stack is empty (each lap resolves the top object). */
function drainStack(s) {
  let next = s;
  for (let guard = 0; next.stack.length && guard < 40; guard++) next = next.pendingChoice ? next : passPriority(next);
  return next;
}
/** Step the turn forward (the stack emptied between steps) until `step` is entered; returns the state at that step's entry. */
function advanceTo(s, step) {
  let next = drainStack(s);
  for (let guard = 0; guard < 40; guard++) {
    next = nextStep({ ...next, priorityHolder: null, consecutivePasses: 0 });
    if (next.step === step) return next;
    next = drainStack(next);
  }
  throw new Error(`never reached the ${step} step`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the classifier and the parse of each line", () => {
  it("⭐ Necropotence reads native — and every near-miss of its clause family stays parked", () => {
    const row = {
      necropotence: classifyCard(NECROPOTENCE),
      bagOfHolding: classifyCard(BAG_OF_HOLDING),               // "exiled with this artifact" — a linked return, unmodeled
      containmentConstruct: classifyCard(CONTAINMENT_CONSTRUCT), // "you may exile … If you do, you may play that card"
      currencyConverter: classifyCard(CURRENCY_CONVERTER),
      moonstone: classifyCard(MOONSTONE),
      necroImpotence: classifyCard(NECRO_IMPOTENCE),             // "Pay ½ life", "the next end step", a skipped untap step
      bomatCourier: classifyCard(BOMAT_COURIER),                 // face-down exile without the return — a linked ability
      knowledgeVault: classifyCard(KNOWLEDGE_VAULT),
    };
    console.log("  WITNESS necropotenceTier", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ necropotence: "native-mixed", bagOfHolding: "body-only", containmentConstruct: "body-only",
      currencyConverter: "body-only", moonstone: "body-only", necroImpotence: "body-only", bomatCourier: "body-only", knowledgeVault: "body-only" });
  });

  it("line 1 — the skip-your-draw-step static", () => {
    expect(parseStaticAbilities(NECROPOTENCE)).toEqual([{ skipDrawStep: true }]);
  });

  it("line 2 — a self-discard trigger whose clause is rewritten to the [discarded-card] sentinel, routing only on the discard event", () => {
    const trigs = detectTriggers(NECROPOTENCE);
    expect(trigs.map((t) => ({ event: t.event, scope: t.scope, effectClause: t.effectClause }))).toEqual([
      { event: "discarded", scope: "youDiscard", effectClause: "[discarded-card] exile that card from your graveyard" }]);
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
    // The rewrite is whole-clause anchored: Currency Converter's optional "you may exile that card …" keeps its raw text.
    expect(detectTriggers(CURRENCY_CONVERTER).map((t) => t.effectClause)).toEqual(["you may exile that card from your graveyard"]);
    // The printed words on a SPELL are not the sentinel: they stay unmodeled (no referent outside a discard trigger).
    expect(parseEffectProgram({ type: "Instant", oracle: "Exile that card from your graveyard." }).confidence).toBe("low");
  });

  it("SYNTHETIC (no printed card carries this clause off a discard trigger) — both halves of the event gate hold", () => {
    // The rewrite is event-gated: the same printed clause on a DIES trigger keeps its raw text (and parses LOW → parked).
    const offEvent = detectTriggers({ name: "Synthetic Watcher", type: "Enchantment", oracle: "Whenever a creature dies, exile that card from your graveyard." });
    expect(offEvent.map((t) => ({ event: t.event, effectClause: t.effectClause }))).toEqual([{ event: "dies", effectClause: "exile that card from your graveyard" }]);
    // The referent pin: the sentinel on any other event has no discarded card to name, so it never routes natively.
    expect(triggerRoutesNatively({ ...detectTriggers(NECROPOTENCE)[0], event: "cast" })).toBe(false);
  });

  it("line 3 — a modeled 1-life activation whose effect is ONE face-down-exile atom timed to YOUR next end step", () => {
    const [ab] = parseActivatedAbilities(NECROPOTENCE);
    expect({ payLife: ab.payLife, modeled: ab.modeled, needsTarget: ab.needsTarget, manaPips: ab.manaPips, atoms: ab.program.atoms }).toEqual({
      payLife: 1, modeled: true, needsTarget: false, manaPips: "",
      atoms: [{ op: "face-down-exile-top", fireStep: "end", fireScope: "yours", targetType: null }] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME line 1 — the turn loop skips the controller's draw step", () => {
  it("with Necropotence out the user's draw step draws nothing (logged skipped); an opponent's Necropotence never skips yours", () => {
    const upkeep = (userBf, aiBf) => ({ ...mainPhase({ necro: false, userBf, aiBf }), phase: "beginning", step: "upkeep", priorityHolder: null });
    const mine = nextStep(upkeep([necroPerm("user")], []));
    const theirs = nextStep(upkeep([], [necroPerm("ai")]));
    const row = { step: `${mine.phase}/${mine.step}`, mineHand: mine.players.user.hand.length,
      mineLog: [...mine.log].reverse().find((e) => e.kind === "step" && e.step === "draw")?.skipped ?? null, theirsHand: theirs.players.user.hand.length };
    expect(row).toEqual({ step: "beginning/draw", mineHand: 0, mineLog: "static", theirsHand: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME line 2 — whenever you discard a card, exile THAT card from your graveyard", () => {
  it("⭐ a CYCLED card (the dispatcher's discard cost) is exiled when the trigger resolves; the cycle's own draw still happens", () => {
    const s = mainPhase({ hand: [{ ...LONELY_SANDBAR, id: "h-sandbar" }], graveyard: [{ ...SWAMP, id: "g-old" }], pool: { U: 1 } });
    const cycle = legalActionsForPlayer(s, "user").find((a) => a.kind === "cycle" && a.cardId === "h-sandbar");
    expect(cycle).toBeTruthy();
    const cast = dispatchAction(s, cycle);
    const pending = (cast.pendingTriggers || []).filter((t) => t.event === "discarded");
    expect(pending.map((t) => t.context.discardedCardId)).toEqual(["h-sandbar"]);
    const out = drainStack(flushTriggers(cast));
    const row = { inExile: out.players.user.exile.some((c) => c.id === "h-sandbar"), inGraveyard: out.players.user.graveyard.map((c) => c.id),
      hand: out.players.user.hand.length, watchesLeft: Object.keys(out.discardExileWatches || {}).length };
    console.log("  WITNESS necroCycleExile", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ inExile: true, inGraveyard: ["g-old"], hand: 1, watchesLeft: 0 });
  });

  it("⭐ a FORCED two-card discard (an opponent's Mind Rot vs a two-card hand) fires one trigger per card; each exiles its own card", () => {
    const s0 = mainPhase({ hand: [{ ...SWAMP, id: "h-a" }, { ...SWAMP, id: "h-b" }] });
    const program = parseEffectProgram(MIND_ROT);
    const targets = [{ type: "player", id: "user" }];
    const spell = createStackObject({ id: "stk-mr", kind: "spell", source: { ...MIND_ROT, id: "c-mr" }, controller: "ai", targets,
      payload: { resolver: "effect-program", params: { program, controller: "ai", targets } } });
    const resolved = resolveTopOfStack({ ...s0, stack: [spell] });
    expect(resolved.stack.filter((o) => o.kind === "triggered-ability")).toHaveLength(2);
    const out = drainStack(resolved);
    expect({ exile: out.players.user.exile.map((c) => c.id).sort(), graveyard: out.players.user.graveyard.map((c) => c.id) })
      .toEqual({ exile: ["h-a", "h-b"], graveyard: [] });
  });

  /** One discard through the real discard chain, the trigger left pending (not yet on the stack). */
  function discarded(extra = {}) {
    const s = mainPhase({ hand: [{ ...SWAMP, id: "h-x" }], graveyard: [{ ...SWAMP, id: "g-old" }], ...extra });
    const moved = moveCardToZone(s, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h-x" });
    return checkDiscardTriggers(moved, "user", ["h-x"]);
  }

  it("the watch rides the trigger and names the discarded card; it retires the moment that card moves again", () => {
    const s = discarded();
    const [t] = s.pendingTriggers;
    expect({ card: t.context.discardedCardId, watch: s.discardExileWatches[t.context.discardWatch] }).toEqual({ card: "h-x", watch: { cardId: "h-x" } });
    const back = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "hand", cardId: "h-x" });
    expect(back.discardExileWatches).toEqual({});
  });

  it("⛔ CR 603.6 — the card left the graveyard before the trigger resolved: nothing is exiled (it stays in hand)", () => {
    const s = discarded();
    const flushed = flushTriggers(s);
    const left = moveCardToZone(flushed, { playerId: "user", fromZone: "graveyard", toZone: "hand", cardId: "h-x" });
    const out = drainStack(left);
    expect({ hand: out.players.user.hand.map((c) => c.id), exile: out.players.user.exile.map((c) => c.id),
      resolved: out.log.filter((e) => e.effect === "exile-discarded-card").map((e) => e.exiled) }).toEqual({ hand: ["h-x"], exile: [], resolved: [0] });
  });

  it("⛔ CR 400.7 — the card left and CAME BACK (to the library, then milled): a new object, so it stays in the graveyard", () => {
    const s = discarded();
    const flushed = flushTriggers(s);
    const toLibrary = moveCardToZone(flushed, { playerId: "user", fromZone: "graveyard", toZone: "library", cardId: "h-x", toTop: true });
    const milledBack = millCards(toLibrary, { playerId: "user", count: 1 });
    expect(milledBack.players.user.graveyard.some((c) => c.id === "h-x")).toBe(true);
    const out = drainStack(milledBack);
    expect({ graveyard: out.players.user.graveyard.map((c) => c.id).sort(), exile: out.players.user.exile.map((c) => c.id) })
      .toEqual({ graveyard: ["g-old", "h-x"], exile: [] });
  });

  it("⛔ an exile-instead replacement (Rest in Peace): the discard still triggers, the card never reached the graveyard, nothing else is exiled", () => {
    const s = mainPhase({ hand: [{ ...LONELY_SANDBAR, id: "h-sandbar" }], graveyard: [{ ...SWAMP, id: "g-old" }], pool: { U: 1 },
      aiBf: [createPermanent({ id: "rip", card: { ...REST_IN_PEACE, id: "c-rip" }, controller: "ai", summoningSick: false })] });
    const cycle = legalActionsForPlayer(s, "user").find((a) => a.kind === "cycle" && a.cardId === "h-sandbar");
    const cast = dispatchAction(s, cycle);
    expect((cast.pendingTriggers || []).filter((t) => t.event === "discarded")).toHaveLength(1);
    const out = drainStack(flushTriggers(cast));
    // A clean no-op resolution (the card is not in the graveyard to move) — never an error, never the older card.
    expect({ graveyard: out.players.user.graveyard.map((c) => c.id), exile: out.players.user.exile.map((c) => c.id),
      resolved: out.log.filter((e) => e.effect === "exile-discarded-card").map((e) => e.exiled), errors: out.log.filter((e) => e.kind === "stack-resolve-error").length })
      .toEqual({ graveyard: ["g-old"], exile: ["h-sandbar"], resolved: [0], errors: 0 });
  });

  it("an OPPONENT's discard never triggers your Necropotence; a non-Necropotence discard watcher opens no watch", () => {
    const s = mainPhase({ aiBf: [createPermanent({ id: "caress", card: { ...LILIANAS_CARESS, id: "c-caress" }, controller: "ai", summoningSick: false })] });
    const withAiCard = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...SWAMP, id: "a-h" }] } } };
    const theirDiscard = checkDiscardTriggers(moveCardToZone(withAiCard, { playerId: "ai", fromZone: "hand", toZone: "graveyard", cardId: "a-h" }), "ai", ["a-h"]);
    expect(theirDiscard.pendingTriggers || []).toHaveLength(0);
    const mine = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [{ ...SWAMP, id: "h-y" }] } } };
    const myDiscard = checkDiscardTriggers(moveCardToZone(mine, { playerId: "user", fromZone: "hand", toZone: "graveyard", cardId: "h-y" }), "user", ["h-y"]);
    const watchOf = (name) => myDiscard.pendingTriggers.find((t) => t.source.name === name)?.context.discardWatch ?? null;
    expect({ caress: watchOf("Liliana's Caress"), necro: watchOf("Necropotence") }).toEqual({ caress: null, necro: "dxw-1" });
    expect(Object.values(myDiscard.discardExileWatches)).toEqual([{ cardId: "h-y" }]); // Necropotence's fire only
    // Without Necropotence the ledger never appears; a bare COUNT (no card to name) opens no watch either.
    const noNecro = mainPhase({ necro: false, hand: [{ ...SWAMP, id: "h-z" }], aiBf: s.players.ai.battlefield });
    expect(checkDiscardTriggers(noNecro, "user", ["h-z"]).discardExileWatches).toBeUndefined();
    expect(checkDiscardTriggers(mine, "user", 1).discardExileWatches).toBeUndefined();
  });

  it("STRUCTURAL — every engine discard site hands checkDiscardTriggers the ids of the cards it discarded", () => {
    const root = fileURLToPath(new URL(".", import.meta.url));
    const files = [];
    const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f) && !/\.test\.js$/.test(f)) files.push(p); } };
    walk(root);
    const thirdArgs = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (let at = text.indexOf("checkDiscardTriggers("); at !== -1; at = text.indexOf("checkDiscardTriggers(", at + 1)) {
        if (/function\s+$/.test(text.slice(Math.max(0, at - 9), at))) continue; // the definition
        let depth = 0; const args = [""];
        for (let i = at + "checkDiscardTriggers(".length; i < text.length; i++) {
          const ch = text[i];
          if ("([{".includes(ch)) depth++;
          if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
          if (ch === "," && depth === 0) args.push(""); else args[args.length - 1] += ch;
        }
        thirdArgs.push(args[2]?.trim() ?? "");
      }
    }
    expect(thirdArgs.length).toBeGreaterThanOrEqual(15);
    expect(thirdArgs.filter((a) => !/^\[|\.map\(/.test(a))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME — the cleanup discard (CR 514.1) and the cleanup priority window (CR 514.3a)", () => {
  /** The user's end step with a 9-card hand (two over the maximum). */
  function endStep({ necro = true } = {}) {
    const s = mainPhase({ necro, hand: cards("h-", 9) });
    return { ...s, phase: "ending", step: "end", priorityHolder: null };
  }
  function discardTwoAtCleanup(s0) {
    let s = nextStep(s0);
    expect(s.pendingChoice).toMatchObject({ kind: "cleanup-discard", count: 2 });
    s = settleCleanupDiscardChoice(s, "h-0");
    s = settleCleanupDiscardChoice(s, "h-1");
    return finalizeStackResolution(s); // what the session driver runs once the discard chain completes
  }

  it("⭐ the cleanup discards trigger Necropotence; the triggers resolve INSIDE the cleanup step, then another cleanup step ends the turn", () => {
    const s = discardTwoAtCleanup(endStep());
    const opened = { step: s.step, turn: s.turn, holder: s.priorityHolder, stack: s.stack.filter((o) => o.kind === "triggered-ability").length };
    expect(opened).toEqual({ step: "cleanup", turn: 5, holder: "user", stack: 2 });
    const resolvedOne = passPriority(passPriority(s));        // both pass → the top trigger resolves; the window stays open
    expect({ step: resolvedOne.step, holder: resolvedOne.priorityHolder, stack: resolvedOne.stack.length }).toEqual({ step: "cleanup", holder: "user", stack: 1 });
    const drained = drainStack(resolvedOne);
    // The last resolution empties the stack but not the window: the ACTIVE player gets priority again (CR 117.3b).
    expect({ exile: drained.players.user.exile.map((c) => c.id).sort(), graveyard: drained.players.user.graveyard.length, turn: drained.turn,
      holder: drained.priorityHolder, passes: drained.consecutivePasses })
      .toEqual({ exile: ["h-0", "h-1"], graveyard: 0, turn: 5, holder: "user", passes: 0 });
    // Empty stack, all pass → ANOTHER cleanup step (not the next turn); it triggers nothing, so it grants no priority.
    const again = passPriority(passPriority(drained));
    const cleanupLogs = again.log.filter((e) => e.kind === "step" && e.step === "cleanup" && e.turn === 5).length;
    expect({ step: again.step, turn: again.turn, holder: again.priorityHolder, cleanupLogs }).toEqual({ step: "cleanup", turn: 5, holder: null, cleanupLogs: 2 });
    expect(nextStep(again)).toMatchObject({ turn: 6, activePlayer: "ai", step: "untap" });
  });

  it("without a discard watcher the cleanup discard is byte-for-byte the old flow — no trigger, no priority, straight to the next turn", () => {
    const s = discardTwoAtCleanup(endStep({ necro: false }));
    expect({ step: s.step, holder: s.priorityHolder, stack: s.stack.length, graveyard: s.players.user.graveyard.length }).toEqual({ step: "cleanup", holder: null, stack: 0, graveyard: 2 });
  });

  it("the window is CLEANUP's alone — the untap step grants no priority even with a trigger stacked (Mesmeric Orb; CR 502.4)", () => {
    const s0 = mainPhase({ necro: false, userBf: [
      createPermanent({ id: "orb", card: { ...MESMERIC_ORB, id: "c-orb" }, controller: "user", summoningSick: false }),
      createPermanent({ id: "swamp", card: { ...SWAMP, id: "c-swamp" }, controller: "user", tapped: true, summoningSick: false })] });
    const untap = nextStep({ ...s0, activePlayer: "ai", phase: "ending", step: "cleanup", priorityHolder: null });
    // Precondition: the engine's untap flush stacks the Orb trigger (the upkeep's priority then resolves it) — exactly the
    // shape a cleanup window would open on, so this pins that the window keys on the cleanup step and nothing else.
    expect({ step: untap.step, active: untap.activePlayer, stacked: untap.stack.filter((o) => o.kind === "triggered-ability").length > 0, holder: untap.priorityHolder })
      .toEqual({ step: "untap", active: "user", stacked: true, holder: null });
  });

  it("SYNTHETIC (no printed delayed ability targets the cleanup step) — a trigger the cleanup step ITSELF stacks opens the window too", () => {
    const end = endStep({ necro: false });
    const scheduled = applyScheduleDelayed({ ...end, players: { ...end.players, user: { ...end.players.user, hand: [] } } },
      { delayedClause: "you gain 1 life", fireStep: "cleanup", fireScope: "any" }, { controller: "user" });
    const cleanup = nextStep(scheduled);
    expect({ step: cleanup.step, holder: cleanup.priorityHolder, stack: cleanup.stack.length }).toEqual({ step: "cleanup", holder: "user", stack: 1 });
    const done = passPriority(passPriority(drainStack(cleanup)));
    expect({ step: done.step, turn: done.turn, life: done.players.user.life, holder: done.priorityHolder }).toEqual({ step: "cleanup", turn: 5, life: 21, holder: null });
  });

  it("⭐ END TO END through the session driver: the human picks the cleanup discards and the exiles are logged on the CLEANUP turn", () => {
    let { session, decision } = advanceUntilDecision({ status: "active", state: endStep(), difficulty: "beginner", decisionLog: [] });
    expect(decision).toMatchObject({ kind: "cleanup-discard", count: 2 });
    ({ session, decision } = applyCleanupDiscardChoice(session, { kind: "cleanup-discard", cardId: "h-2" }));
    expect(decision).toMatchObject({ kind: "cleanup-discard", count: 1 });
    ({ session } = applyCleanupDiscardChoice(session, { kind: "cleanup-discard", cardId: "h-3" }));
    const exiles = session.state.log.filter((e) => e.effect === "exile-discarded-card");
    const firstUntapOfTurn6 = session.state.log.findIndex((e) => e.kind === "step" && e.step === "untap" && e.turn === 6);
    const row = { exiled: exiles.map((e) => `${e.turn}:${e.exiled}`), beforeNextTurn: exiles.every((e) => session.state.log.indexOf(e) < firstUntapOfTurn6),
      userExile: session.state.players.user.exile.map((c) => c.id).sort() };
    console.log("  WITNESS necroCleanup", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ exiled: ["5:1", "5:1"], beforeNextTurn: true, userExile: ["h-2", "h-3"] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("RUNTIME line 3 — Pay 1 life: exile the top card face down; it comes back at your next end step", () => {
  it("⭐ offered through legalActionsForPlayer, paid with 1 life; the top card goes to exile FACE DOWN and returns at the end step", () => {
    const s = mainPhase();
    const act = necroActivation(s);
    expect(act).toMatchObject({ payLife: 1, cmc: 0 });
    const paid = dispatchAction(s, act);
    expect({ life: paid.players.user.life, stack: paid.stack.length }).toEqual({ life: 19, stack: 1 });
    const resolved = drainStack(paid);
    const exiled = resolved.players.user.exile;
    expect({ exiled: exiled.map((c) => c.id), faceDown: !!exiled[0]?._faceDownExile, hand: resolved.players.user.hand.length,
      library: resolved.players.user.library.length, delayed: (resolved.delayedTriggers || []).map((r) => `${r.fireStep}/${r.fireScope}/${r.controller}`) })
      .toEqual({ exiled: ["u-lib-0"], faceDown: true, hand: 0, library: 5, delayed: ["end/yours/user"] });
    // The log never names the hidden card.
    expect(resolved.log.filter((e) => e.effect === "face-down-exile-top")).toEqual([{ turn: 5, kind: "spell-effect", effect: "face-down-exile-top", controller: "user", exiled: 1 }]);
    const atEnd = drainStack(advanceTo(resolved, "end"));
    expect({ step: atEnd.step, hand: atEnd.players.user.hand.map((c) => c.id), handStamp: atEnd.players.user.hand[0]?._faceDownExile ?? null, exile: atEnd.players.user.exile.length })
      .toEqual({ step: "end", hand: ["u-lib-0"], handStamp: null, exile: 0 });
  });

  it("repeatable — three activations exile three cards, and each returns at the end step", () => {
    let s = mainPhase();
    for (let i = 0; i < 3; i++) s = drainStack(dispatchAction(s, necroActivation(s)));
    expect({ life: s.players.user.life, exile: s.players.user.exile.map((c) => c.id) }).toEqual({ life: 17, exile: ["u-lib-0", "u-lib-1", "u-lib-2"] });
    const atEnd = drainStack(advanceTo(s, "end"));
    expect({ hand: atEnd.players.user.hand.map((c) => c.id).sort(), exile: atEnd.players.user.exile.length }).toEqual({ hand: ["u-lib-0", "u-lib-1", "u-lib-2"], exile: 0 });
  });

  it("⛔ CR 603.7c — a card that LEFT exile before the end step is not returned; one that left and came back is a new object", () => {
    let s = mainPhase();
    for (let i = 0; i < 2; i++) s = drainStack(dispatchAction(s, necroActivation(s)));
    s = moveCardToZone(s, { playerId: "user", fromZone: "exile", toZone: "graveyard", cardId: "u-lib-0" });           // left
    s = moveCardToZone(s, { playerId: "user", fromZone: "exile", toZone: "graveyard", cardId: "u-lib-1" });           // left …
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId: "u-lib-1" });           // … and came back
    const atEnd = drainStack(advanceTo(s, "end"));
    expect({ hand: atEnd.players.user.hand.length, graveyard: atEnd.players.user.graveyard.map((c) => c.id), exile: atEnd.players.user.exile.map((c) => c.id) })
      .toEqual({ hand: 0, graveyard: ["u-lib-0"], exile: ["u-lib-1"] });
  });

  it("\"YOUR next end step\" — an opponent's end step does not return the card; the controller's own end step does", () => {
    const resolved = drainStack(dispatchAction(mainPhase(), necroActivation(mainPhase())));
    const theirEnd = runStepActions({ ...resolved, activePlayer: "ai", phase: "ending", step: "end", priorityHolder: null });
    expect({ stack: theirEnd.stack.length, exile: theirEnd.players.user.exile.length, pending: (theirEnd.delayedTriggers || []).length }).toEqual({ stack: 0, exile: 1, pending: 1 });
    const myEnd = drainStack(runStepActions({ ...theirEnd, activePlayer: "user", phase: "ending", step: "end", priorityHolder: null }));
    expect({ hand: myEnd.players.user.hand.map((c) => c.id), exile: myEnd.players.user.exile.length }).toEqual({ hand: ["u-lib-0"], exile: 0 });
  });

  it("an empty library exiles nothing and schedules nothing (a clean resolution, the life still paid)", () => {
    const out = drainStack(dispatchAction(mainPhase({ library: 0 }), necroActivation(mainPhase({ library: 0 }))));
    expect({ exile: out.players.user.exile.length, delayed: (out.delayedTriggers || []).length, life: out.players.user.life,
      resolved: out.log.filter((e) => e.effect === "face-down-exile-top").map((e) => e.exiled), errors: out.log.filter((e) => e.kind === "stack-resolve-error").length })
      .toEqual({ exile: 0, delayed: 0, life: 19, resolved: [0], errors: 0 });
  });

  it("CR 119.4 / 119.8 — offered at exactly 1 life (paying to 0 is legal), never at 0, never while the life total can't change", () => {
    const atOne = mainPhase({ life: 1 });
    const paid = dispatchAction(atOne, necroActivation(atOne));
    expect(paid.players.user.life).toBe(0);
    expect(necroActivation(mainPhase({ life: 0 }))).toBeUndefined();
    expect(necroActivation(grantTeferiShield(mainPhase(), "user"))).toBeUndefined();
    // The sibling with the same cost line (Yawgmoth's Bargain) is held to the same lock.
    const bargain = mainPhase({ necro: false, userBf: [createPermanent({ id: "bargain", card: { ...YAWGMOTHS_BARGAIN, id: "c-bargain" }, controller: "user", summoningSick: false })] });
    const offered = (st) => legalActionsForPlayer(st, "user").some((a) => a.kind === "activate-ability" && a.permanentId === "bargain");
    expect({ open: offered(bargain), locked: offered(grantTeferiShield(bargain, "user")) }).toEqual({ open: true, locked: false });
  });

  it("HOUSE POLICY — the default AI never pays life for an activation, so an AI Necropotence can never loop (it is offered; it is declined)", () => {
    const s0 = mainPhase({ necro: false });
    const s = { ...s0, activePlayer: "ai", priorityHolder: "ai", players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [necroPerm("ai")] } } };
    const actions = legalActionsForPlayer(s, "ai");
    expect(actions.some((a) => a.kind === "activate-ability" && a.permanentId === "necro-ai")).toBe(true);
    expect(pickAction(s, "ai", actions)?.kind).toBe("pass-priority");
  });
});
