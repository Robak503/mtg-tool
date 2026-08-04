/**
 * removeCounterCostStays.test.js — the REMOVE-COUNTER arm of the shared γ1 leave fail-safe, narrowed
 * on runtime evidence (Vat of Rebirth + Charforger, from the census's two-flip composition list).
 *
 * THE FAIL-SAFE'S REASON: `sacrificeDropsTrigger` refuses an activated ability whose COST can make the
 * source LEAVE the battlefield while the card prints a trigger shape the leave paths don't fire — the
 * ability would resolve and the trigger would be silently dropped. That reasoning is real for
 * sacrifice-self and exile-self. It is VACUOUS for a remove-counter cost: paying it moves nothing.
 * The source stays on the battlefield and keeps watching, which is what the runtime block below
 * proves rather than asserts — Vat of Rebirth's put-into-a-graveyard watcher still fires AFTER the
 * ability has been activated and resolved.
 *
 * ⛔ THE SCOPE IS THE SAFETY ARGUMENT (method correction 20 — ask what ELSE reads the guard). The
 * narrowing is a SEPARATE predicate (removeCounterCostCannotLeave), applied ONLY to a PURE
 * remove-counter cost, and it excludes the two counter types whose removal genuinely CAN make the
 * source leave:
 *   • a P/T counter — removing +1/+1 counters drops derived toughness, so a lethal removal kills the
 *     source via SBA (CR 704.5f);
 *   • "time" (vanishing, CR 702.63c — the source is sacrificed when the last time counter is removed)
 *     and "fade", kept in the same bucket.
 * The blanket `sacrificeDropsTrigger` and the sac-scoped variant are BYTE-UNCHANGED, so every pin for
 * the sacrifice-self and (still unprobed) exile-self paths holds by construction.
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read):
 *   • the `+`/`-` P/T exclusion dropped → 2 red (the predicate pin + the lethal-removal park);
 *   • the "time"/"fade" exclusion dropped → 2 red (the predicate pin + the vanishing park);
 *   • the whole predicate forced true → 5 red;
 *   • the CALL-SITE purity guard (`!cost.sacSelf && !cost.exileSelf`) dropped → 1 red, and it is the
 *     compound-cost park below. Worth stating plainly: that park survives all three PREDICATE
 *     mutations, because what holds it is the call site, not the predicate. It is pinned here anyway
 *     — a test that only goes red for the mutation it names is the point of naming them.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities, removeCounterCostCannotLeave, sacrificeDropsTrigger } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, moveCardToZone } from "./gameState.js";
import { checkLeavesTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const VAT_OF_REBIRTH = { id: "c-vat", name: "Vat of Rebirth", type: "Artifact", mana: "{B}",
  oracle: "Whenever another artifact or creature you control is put into a graveyard from the battlefield, put an oil counter on this artifact.\n{2}{B}, {T}, Remove four oil counters from this artifact: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery." };
const CHARFORGER = { id: "c-cf", name: "Charforger", type: "Creature — Phyrexian Beast", mana: "{1}{B}{R}", power: "2", toughness: "2",
  oracle: "When this creature enters, create a 1/1 red Phyrexian Goblin creature token.\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, put an oil counter on this creature.\nRemove three oil counters from this creature: Exile the top card of your library. You may play that card this turn." };

describe("the predicate — which remove-counter costs provably cannot move the source", () => {
  it("a NAMED, non-P/T, non-vanishing counter cannot make the source leave", () => {
    expect(removeCounterCostCannotLeave({ type: "oil", count: 4 })).toBe(true);
    expect(removeCounterCostCannotLeave({ type: "charge", count: 1 })).toBe(true);
    expect(removeCounterCostCannotLeave({ type: "spore", count: 3 })).toBe(true);
  });
  it("⛔ a P/T counter CAN (lethal removal drops derived toughness → SBA 704.5f)", () => {
    expect(removeCounterCostCannotLeave({ type: "+1/+1", count: 1 })).toBe(false);
    expect(removeCounterCostCannotLeave({ type: "-1/-1", count: 1 })).toBe(false);
  });
  it("⛔ time/fade CAN (vanishing sacrifices the source on the last counter, CR 702.63c)", () => {
    expect(removeCounterCostCannotLeave({ type: "time", count: 1 })).toBe(false);
    expect(removeCounterCostCannotLeave({ type: "fade", count: 1 })).toBe(false);
  });
  it("no cost at all is not a remove-counter cost", () => {
    expect(removeCounterCostCannotLeave(null)).toBe(false);
  });
  it("the blanket fail-safe itself is UNCHANGED — it still flags both cards' watcher line", () => {
    // The narrowing is a separate predicate applied at one call site; the shared guard every other
    // cost shape reads must keep answering exactly as it did.
    expect(sacrificeDropsTrigger(VAT_OF_REBIRTH.oracle)).toBe(true);
    expect(sacrificeDropsTrigger(CHARFORGER.oracle)).toBe(true);
  });
});

describe("recognition — the two carriers flip, the near-misses park", () => {
  it("Vat of Rebirth and Charforger classify native (whole card: watcher + the activated ability)", () => {
    expect(parseActivatedAbilities(VAT_OF_REBIRTH).every((a) => a.modeled)).toBe(true);
    expect(classifyCard(VAT_OF_REBIRTH)).toBe("native-mixed");
    expect(classifyCard(CHARFORGER)).toBe("native-mixed");
  });
  it("⛔ a +1/+1 removal cost beside the same watcher still parks (the source can die paying it)", () => {
    const lethal = { id: "c-lt", name: "Lethal Vat", type: "Creature — Construct", mana: "{2}", power: "0", toughness: "0",
      oracle: "Whenever another artifact or creature you control is put into a graveyard from the battlefield, put a +1/+1 counter on this creature.\nRemove two +1/+1 counters from this creature: Draw a card." };
    expect(parseActivatedAbilities(lethal).every((a) => a.modeled)).toBe(false);
    expect(classifyCard(lethal)).toBe("body-only");
  });
  it("⛔ a vanishing (time) removal cost beside the same watcher still parks", () => {
    const vanish = { id: "c-vn", name: "Fading Vat", type: "Artifact", mana: "{2}",
      oracle: "Whenever another artifact or creature you control is put into a graveyard from the battlefield, put a time counter on this artifact.\nRemove a time counter from this artifact: Draw a card." };
    expect(parseActivatedAbilities(vanish).every((a) => a.modeled)).toBe(false);
    expect(classifyCard(vanish)).toBe("body-only");
  });
  it("⛔ a COMPOUND cost (sacrifice-self AND remove-counter) keeps the blanket refusal", () => {
    // The narrowing applies to a PURE remove-counter cost only — a cost that also removes the source
    // by sacrifice is exactly the shape the fail-safe was written for.
    const compound = { id: "c-cp", name: "Compound Vat", type: "Artifact", mana: "{2}",
      oracle: "Whenever another artifact or creature you control is put into a graveyard from the battlefield, put an oil counter on this artifact.\nRemove two oil counters from this artifact, Sacrifice this artifact: Draw a card." };
    expect(parseActivatedAbilities(compound).every((a) => a.modeled)).toBe(false);
  });
});

describe("⭐ RUNTIME (law 6) — paying the cost does NOT move the source, and its watcher keeps firing", () => {
  function board() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const vat = createPermanent({ id: "vat", card: VAT_OF_REBIRTH, controller: "user", summoningSick: false });
    vat.counters = { oil: 4 };
    const bauble = createPermanent({ id: "bauble", card: { id: "c-bb", name: "Bauble", type: "Artifact", oracle: "" }, controller: "user", summoningSick: false });
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [vat, bauble],
        graveyard: [{ id: "gy-bear", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }],
        manaPool: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 } }} };
  }

  it("the ability is offered with 4 oil counters, resolves, and the SOURCE IS STILL ON THE BATTLEFIELD", () => {
    let s = board();
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").find((a) => a.permanentId === "vat");
    expect(act).toBeTruthy();
    expect(act.removeCounter).toMatchObject({ type: "oil", count: 4 });
    s = resolveTopOfStack(dispatchAction(s, act));
    const vat = findPermanent(s, "vat");
    expect(vat).toBeTruthy();                                        // ⭐ the source did NOT leave
    expect(vat.permanent.counters.oil || 0).toBe(0);                 // the counters were actually spent
    // (gameState.removeCounter DELETES the key at zero rather than storing 0 — assert the count, not
    // the key's presence; the first draft read `.oil` directly and false-failed on undefined.)
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Grizzly Bears")).toBe(true); // the effect happened
  });

  it("⭐ and its watcher STILL FIRES afterward — the trigger the fail-safe feared was never at risk", () => {
    let s = board();
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability").find((a) => a.permanentId === "vat");
    s = resolveTopOfStack(dispatchAction(s, act));
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bauble" });
    s = checkLeavesTriggers(s);
    const fired = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "vat");
    expect(fired).toHaveLength(1);                                   // the put-into-a-graveyard watcher fired
  });

  it("⛔ the cost is not offered without enough counters (CR 118.3 — no fabricated payment)", () => {
    const s = board();
    const short = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => (p.id === "vat" ? { ...p, counters: { oil: 3 } } : p)) } } };
    expect(filterActions(legalActionsForPlayer(short, "user"), "activate-ability").find((a) => a.permanentId === "vat")).toBeUndefined();
  });
});
