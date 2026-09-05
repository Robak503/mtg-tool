/**
 * STAFF OF THE STORYTELLER — SHELF-85 · Otharri O10 (2026-09-05). "Whenever you create one or more creature tokens, put a
 * story counter on this artifact." The ETB Spirit and the "{W}, {T}, Remove a story counter: Draw a card" line were
 * already native; the batched creature-token event is the new arm: ONE firing per create event however many tokens
 * (CR 603.2d — a once-per-batch descriptor, deduped across the mint tail's per-token calls), and only for a CREATURE
 * token (the checker now receives the minted token's card; a Treasure fires nothing).
 *
 * Mutation-checked: see the run ledger (docs-sk62).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers } from "./triggers.js";
import { applyCreateToken, applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { parseEffectProgram } from "./effects/parser.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STAFF = { name: "Staff of the Storyteller", type: "Artifact", mana: "{1}{W}", keywords: [], oracle: "When this artifact enters, create a 1/1 white Spirit creature token with flying.\nWhenever you create one or more creature tokens, put a story counter on this artifact.\n{W}, {T}, Remove a story counter from this artifact: Draw a card." };
const staff = () => createPermanent({ id: "staff", card: { id: "c-staff", ...STAFF }, controller: "user", summoningSick: false });
function state() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, battlefield: [staff()], library: [{ id: "L1", name: "L1", type: "Sorcery", cmc: 1 }], manaPool: { ...b.players.user.manaPool, W: 1 } } } };
}
const staffPending = (s) => (s.pendingTriggers || []).filter((t) => (t.sourcePermanentId ?? t.context?.sourcePermanentId) === "staff").length;
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 20) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const story = (s) => s.players.user.battlefield.find((p) => p.id === "staff")?.counters?.story ?? 0;
const treasureAtom = () => parseEffectProgram({ name: "x", type: "Instant", mana: "{1}", keywords: [], oracle: "Create a Treasure token." }).atoms[0];

describe("classify + detect", () => {
  it("the batched creature-token arm carries oncePerBatch + creatureTokensOnly; the card classifies native-mixed", () => {
    const d = detectTriggers(STAFF).map((x) => [x.event, x.onCreate ?? null, x.oncePerBatch ?? null, x.creatureTokensOnly ?? null]);
    const row = { d, tier: classifyCard(STAFF) };
    console.log("  WITNESS staffDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toContainEqual(["tokenChange", true, true, true]);
    expect(row.tier).toBe("native-mixed");
  });
});

describe("one firing per create event, creature tokens only", () => {
  it("two Soldier tokens in one batch → ONE Staff trigger → one story counter; a Treasure token → no trigger", () => {
    const two = applyCreateToken(state(), { op: "create-token", count: 2, power: 1, toughness: 1, descriptor: "white soldier" }, { controller: "user" });
    const afterTwo = settle(two);
    const treasure = applyCreateNamedToken(state(), treasureAtom(), { controller: "user" });
    const row = { pendingAfterTwo: staffPending(two), storyAfterTwo: story(afterTwo), tokensMinted: two.players.user.battlefield.filter((p) => p.card?.token).length, pendingAfterTreasure: staffPending(treasure), treasureMinted: treasure.players.user.battlefield.filter((p) => p.card?.token).length };
    console.log("  WITNESS staffBatch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pendingAfterTwo).toBe(1);
    expect(row.storyAfterTwo).toBe(1);
    expect(row.tokensMinted).toBe(2);
    expect(row.pendingAfterTreasure).toBe(0);
    expect(row.treasureMinted).toBe(1);
  });

  it("with a story counter on it, the draw line is offered (the remove-counter cost was already modelled) and draws", () => {
    const s = settle(applyCreateToken(state(), { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier" }, { controller: "user" }));
    const drawAct = (st) => legalActionsForPlayer(st, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "staff");
    const bare = state(); // no counter yet → the remove-counter cost cannot be paid → not offered
    const row = { story: story(s), offeredWithCounter: !!drawAct(s), offeredWithout: !!drawAct(bare) };
    console.log("  WITNESS staffDraw", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.story).toBe(1);
    expect(row.offeredWithCounter).toBe(true);
    expect(row.offeredWithout).toBe(false);
  });
});
