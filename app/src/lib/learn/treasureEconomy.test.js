/**
 * TREASURE-ECONOMY — the Treasure-deck (Vihaan / Goldwaker) payoff slice. Three builds, all reusing the
 * existing token + trigger + mana machinery (the combat-damage/attack/ETB → create-Treasure path and the
 * Treasure mana ability already ship):
 *
 *   1. SELF-NAME-REF (CR 201.4) — a trigger that names its OWN source in the effect ("… Captain Lannery
 *      Storm gets +1/+0 …") resolves the self atom against the source, for ANY scope. (triggers.js
 *      rewriteSelfNameToThisCreature)
 *   2. TRIG-SACRIFICE SUBTYPE — "Whenever you sacrifice a Treasure" (Captain Lannery Storm's 2nd ability) —
 *      the sac'd permanent's type line is matched word-bounded against the subtype. (triggers.js sacSubtype)
 *   3. TOKEN-CHANGE — "Whenever you create or sacrifice a token, each opponent loses 1 life" (Mirkwood Bats)
 *      — a token-CREATED event (fired at the mint chokepoint, once per token) and a token-SACRIFICED event
 *      (fired at the sac chokepoints when the sac'd permanent is a token). (triggers.js checkTokenCreated-
 *      Triggers / checkSacrificeTriggers token branch)
 *
 * CREED: a Treasure is sacrificed for ONE mana of any color; each token created/sacrificed is a SEPARATE
 * event (CR 111.1); a token DYING (lethal SBA / destroy) is NOT a sacrifice → must NOT fire Mirkwood Bats.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkSacrificeTriggers, checkTokenCreatedTriggers, checkDiesTriggers } from "./triggers.js";
import { applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const treasureToken = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color.", token: true }, controller: "user", summoningSick: false });
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;

function board(userBf, aiLife = 40) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, life: aiLife } } };
}

// ─── BUILD 1: Captain Lannery Storm (self-name pump + subtype sac) ──────────────────────────────────────

describe("SELF-NAME-REF (CR 201.4) — a trigger that names its own source resolves the self atom", () => {
  it("rewrites a leading full/short self-name + self-effect verb → 'this creature'", () => {
    const cap = { name: "Captain Lannery Storm", type: "Legendary Creature — Human Pirate",
      oracle: "Whenever you sacrifice a Treasure, Captain Lannery Storm gets +1/+0 until end of turn." };
    const d = detectTriggers(cap).find((x) => x.event === "sacrifice");
    expect(d.effectClause).toBe("this creature gets +1/+0 until end of turn"); // name → this creature
  });
  it("rewrites the LEGENDARY SHORT name too (CR 201.4 — text before the first comma)", () => {
    const olivia = { name: "Olivia, Mobilized for War", type: "Legendary Creature — Vampire",
      oracle: "Whenever this creature attacks, Olivia gets +2/+0 until end of turn." };
    const d = detectTriggers(olivia).find((x) => x.event === "attacks");
    expect(d.effectClause).toBe("this creature gets +2/+0 until end of turn");
  });
  it("does NOT rewrite when the name isn't followed by a modeled self-effect verb (pure promotion)", () => {
    // "X draws a card" — "draws" isn't a self-pump/gains/deals verb; leave untouched (the parser decides).
    const c = { name: "Bob", type: "Creature", oracle: "Whenever Bob attacks, Bob draws a card." };
    const d = detectTriggers(c).find((x) => x.event === "attacks");
    expect(d.effectClause).toBe("Bob draws a card"); // NOT rewritten to "this creature …" (verb not modeled here)
  });
});

describe("TRIG-SACRIFICE SUBTYPE — 'Whenever you sacrifice a Treasure'", () => {
  const lannery = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Captain Lannery Storm", type: "Legendary Creature — Human Pirate", power: 2, toughness: 2, oracle: "Haste\nWhenever Captain Lannery Storm attacks, create a Treasure token.\nWhenever you sacrifice a Treasure, Captain Lannery Storm gets +1/+0 until end of turn." }, controller: "user", summoningSick: false });

  it("detects the subtype sac scope (sacSubtype='Treasure'), distinct from the card-TYPE sacScope", () => {
    const d = detectTriggers(lannery("x").card).find((x) => x.event === "sacrifice");
    expect(d).toMatchObject({ event: "sacrifice", sacSubtype: "Treasure" });
    expect(d.sacScope).toBeUndefined();
  });
  it("a Treasure sac FIRES the subtype watcher; a non-Treasure artifact sac does NOT (no over-fire)", () => {
    const s = board([lannery("cap")]);
    const sacTreasure = { id: "tt", controller: "user", card: { name: "Treasure", type: "Token Artifact — Treasure", token: true } };
    const sacTrinket = { id: "tr", controller: "user", card: { name: "Trinket", type: "Artifact" } };
    expect((checkSacrificeTriggers(s, "user", sacTreasure).pendingTriggers || []).filter((t) => t.event === "sacrifice")).toHaveLength(1);
    expect((checkSacrificeTriggers(s, "user", sacTrinket).pendingTriggers || []).filter((t) => t.event === "sacrifice")).toHaveLength(0);
  });
  it("Captain Lannery Storm classifies native-trigger (both triggers modeled)", () => {
    expect(classifyCard(lannery("x").card)).toBe("native-trigger");
  });
  it("end-to-end: cracking a Treasure for mana pumps Captain Lannery Storm +1/+0", () => {
    let s = board([lannery("cap"), treasureToken("t1")]);
    s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "t1", color: "C", amount: 1, sacrifices: true });
    expect(s.players.user.battlefield.some((p) => p.id === "t1")).toBe(false); // sacrificed
    s = flush(s);
    const cap = s.players.user.battlefield.find((p) => p.id === "cap");
    expect(creaturePower(cap, s)).toBe(3); // 2 base +1/+0 from the sac-Treasure trigger
  });
});

// ─── BUILD 2: Mirkwood Bats (token create/sacrifice payoff) ─────────────────────────────────────────────

describe("TOKEN-CHANGE — 'Whenever you create or sacrifice a token' (Mirkwood Bats)", () => {
  const bats = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Mirkwood Bats", type: "Creature — Bat", power: 2, toughness: 2, oracle: "Flying\nWhenever you create or sacrifice a token, each opponent loses 1 life." }, controller: "user", summoningSick: false });

  it("detects the compound form as ONE tokenChange descriptor (onCreate+onSacrifice) — coverage tally stays 1:1", () => {
    const ds = detectTriggers(bats("x").card).filter((d) => d.event === "tokenChange");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "tokenChange", onCreate: true, onSacrifice: true });
  });
  it("detects the single forms ('create a token' / 'sacrifice a token')", () => {
    const cr = detectTriggers({ name: "X", type: "Creature", oracle: "Whenever you create a token, draw a card." }).find((d) => d.event === "tokenChange");
    const sa = detectTriggers({ name: "Y", type: "Creature", oracle: "Whenever you sacrifice a token, you gain 1 life." }).find((d) => d.event === "tokenChange");
    expect(cr).toMatchObject({ onCreate: true, onSacrifice: false });
    expect(sa).toMatchObject({ onCreate: false, onSacrifice: true });
  });
  it("does NOT detect a filtered variant ('a creature token' / 'a Treasure') — safe false-negative", () => {
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Whenever you create a creature token, draw a card." }).some((d) => d.event === "tokenChange")).toBe(false);
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Whenever you create a Treasure token, draw a card." }).some((d) => d.event === "tokenChange")).toBe(false);
  });
  it("Mirkwood Bats classifies native-trigger", () => {
    expect(classifyCard(bats("x").card)).toBe("native-trigger");
  });

  it("CREATE: making two Treasures drains each opponent ONCE PER token (2 life)", () => {
    let s = board([bats("bats")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 2 }, { controller: "user" });
    expect(treasureCount(s, "user")).toBe(2);
    expect((s.pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(2); // one per token
    s = flush(s);
    expect(s.players.ai.life).toBe(38); // 40 - 2 (each token = 1 drain)
  });
  it("SACRIFICE: cracking a Treasure token for mana drains each opponent (1 life)", () => {
    let s = board([bats("bats"), treasureToken("t1")]);
    s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "t1", color: "C", amount: 1, sacrifices: true });
    expect((s.pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(1);
    s = flush(s);
    expect(s.players.ai.life).toBe(39);
  });

  it("CREED: a token DYING (lethal SBA) is NOT a sacrifice → Mirkwood Bats does NOT fire", () => {
    // A 0/0 creature token would die to the SBA; that's a death, not a sacrifice. Mirkwood Bats watches
    // create/sacrifice only — a death must not drain (the cardinal over-fire guard for this slice).
    let s = board([bats("bats")]);
    const deadToken = { id: "dt", controller: "user", name: "Servo", card: { name: "Servo", type: "Token Artifact Creature — Servo", token: true } };
    s = checkDiesTriggers(s, [deadToken]);
    expect((s.pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(0); // death ≠ sacrifice
  });
  it("CREED: a NON-token sacrifice does NOT fire tokenChange-onSacrifice", () => {
    const s = board([bats("bats")]);
    const sacNontoken = { id: "nt", controller: "user", card: { name: "Real Artifact", type: "Artifact" } }; // no token flag
    expect((checkSacrificeTriggers(s, "user", sacNontoken).pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(0);
  });
  it("checkTokenCreatedTriggers scans only the CREATING player's watchers (the 'you create' subject)", () => {
    const s = board([bats("bats")]); // Mirkwood Bats controlled by user
    // ai creates a token → user's Mirkwood Bats (a "you create" watcher) does NOT fire for ai's creation
    expect((checkTokenCreatedTriggers(s, "ai", 1).pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(0);
    expect((checkTokenCreatedTriggers(s, "user", 1).pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(1);
  });
});
