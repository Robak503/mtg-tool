/**
 * becomesTarget.test.js — the "becomes the target of a spell or ability" event (CR 603.2; the Phantasmal
 * Illusion family). detectTriggers now recognizes the SELF becomesTarget/self-sac trigger, and
 * checkBecomesTargetTriggers fires it at EVERY target-choice site — spell cast, activated ability, loyalty
 * ability, and triggered-ability target selection — so a permanent carrying "When this creature becomes the
 * target of a spell or ability, sacrifice it." is sacrificed the instant it is chosen as a target, by ANY
 * controller (CR 603.2 makes no controller distinction, unlike Ward/Heroic). Also covers Phantasmal Image
 * itself (a clone that GRANTS the sac trigger to whatever it copies) and the CREED near-misses.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseCloneSpec, isCloneCard, snapshotCopiedCard } from "./cloneCopy.js";

beforeEach(() => _resetIdsForTests());

const SAC_TRIGGER = "When this creature becomes the target of a spell or ability, sacrifice it.";
const bearCard = (oracle = SAC_TRIGGER) => ({ id: "bear-c", name: "Phantasmal Bear", power: 2, toughness: 2, type_line: "Creature — Bear Illusion", oracle });
const pub = (c) => ({ name: c.name, type: c.type_line || c.type, type_line: c.type_line || c.type, oracle: c.oracle, oracle_text: c.oracle, mana: c.mana_cost || c.mana, power: c.power, toughness: c.toughness });

function mainState({ user = {}, ai = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } },
      ai: { ...s.players.ai, ...ai, manaPool: { ...s.players.ai.manaPool, ...(ai.manaPool || {}) } },
    },
  };
}

// ─── detection + classification ──────────────────────────────────────────────────────────────────────────
describe("detectTriggers — the becomesTarget self-sac event", () => {
  it("detects the bare printed self-sac trigger and rewrites 'sacrifice it' → 'sacrifice this creature'", () => {
    const dets = detectTriggers(pub(bearCard()));
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ event: "becomesTarget", scope: "self", effectClause: "sacrifice this creature" });
  });

  it("classifies a keyword-body Illusion (Flying + the sac trigger) as native-trigger", () => {
    expect(classifyCard(pub(bearCard()))).toBe("native-trigger");
    expect(classifyCard(pub(bearCard("Flying\n" + SAC_TRIGGER)))).toBe("native-trigger");
    expect(classifyCard(pub(bearCard("Trample\n" + SAC_TRIGGER)))).toBe("native-trigger");
  });

  it("CREED near-miss: a RIDER on the sac ('sacrifice it unless you discard a land card') stays body-only", () => {
    // Cursed Monstrosity — the trigger IS detected (the condition still ends on 'a spell or ability'), but its
    // effect isn't a plain self-sac, so it does NOT route natively → the card stays body-only. The runtime never
    // fires a partial (checkBecomesTargetTriggers routes it to the Arbiter no-op via the unmodeled effect).
    const cursed = bearCard("Flying\nWhenever this creature becomes the target of a spell or ability, sacrifice it unless you discard a land card.");
    const dets = detectTriggers(pub(cursed));
    expect(dets).toHaveLength(1);
    expect(dets[0].effectClause).toBe("sacrifice it unless you discard a land card"); // NOT rewritten to the self-sac
    expect(classifyCard(pub(cursed))).toBe("body-only");
  });

  // GRADUATED 2026-09-04 (SHELF-85 K9 — Fblthp): the spell-only form now has its OWN event, becomesTargetOfSpell, fired at
  // the checkBecomesTargetTriggers chokepoint under the isSpell gate (an ability targeting it never fires). The pin flips
  // from "stays undetected" to "detected as the spell-only event".
  it("'becomes the target of a spell' (spell-only, no ability) is its OWN event, never the spell-or-ability one", () => {
    const spellOnly = bearCard("When this creature becomes the target of a spell, sacrifice it.");
    const dets = detectTriggers(pub(spellOnly));
    expect(dets).toHaveLength(1);
    expect(dets[0].event).toBe("becomesTargetOfSpell");
  });

  it("CREED near-miss: the compound 'attacks or becomes the target of a spell' is NOT the bare becomesTarget self-event", () => {
    // The bare becomesTarget self-sac event must never over-fire on the compound. The compound IS handled by
    // its OWN lane (Goldspan Dragon's `attacksOrBecomesTarget` compound trigger, shipped separately), so it's
    // detected as that event — never as the bare `becomesTarget` self event this module added.
    const compound = bearCard("Whenever this creature attacks or becomes the target of a spell, it gets +1/+1 until end of turn.");
    expect(detectTriggers(pub(compound)).some((d) => d.event === "becomesTarget")).toBe(false);
  });

  it("CREED near-miss: the group-ward 'an opponent controls' variant stays UNDETECTED (a different lane)", () => {
    const gw = bearCard("Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.");
    // Not a self becomesTarget/self-sac — must not be mis-detected as one.
    expect(detectTriggers(pub(gw)).some((d) => d.event === "becomesTarget")).toBe(false);
  });
});

// ─── SITE 1: a spell targeting the permanent ─────────────────────────────────────────────────────────────
describe("SITE 1 — a spell targeting a becomes-target permanent sacrifices it (CR 603.2 / 603.3b)", () => {
  it("an opponent's removal targeting the creature fires the sac ABOVE the spell → it is sacrificed", () => {
    const bear = createPermanent({ card: bearCard(), controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = mainState({ user: { hand: [removal], manaPool: { B: 1 } }, ai: { battlefield: [bear] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === bear.id));
    expect(cast).toBeTruthy();
    let out = dispatchAction(s, cast);
    // The sac trigger sits ABOVE Doom Blade on the stack.
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    expect(out.players.ai.battlefield).toHaveLength(1); // still there until the trigger resolves
    out = resolveTopOfStack(out); // the sac trigger resolves first
    expect(out.players.ai.battlefield).toHaveLength(0);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Phantasmal Bear");
  });

  it("CR 603.2 — the OWNER targeting its OWN creature ALSO sacrifices it (no controller distinction)", () => {
    const bear = createPermanent({ card: bearCard(), controller: "user" });
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = mainState({ user: { hand: [buff], battlefield: [bear], manaPool: { G: 1 } } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === bear.id));
    expect(cast).toBeTruthy();
    let out = dispatchAction(s, cast);
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    out = resolveTopOfStack(out);
    expect(out.players.user.battlefield).toHaveLength(0);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Phantasmal Bear");
  });

  it("a non-becomes-target creature is NOT sacrificed (no false fire)", () => {
    const vanilla = createPermanent({ card: { id: "gb-c", name: "Grizzly Bears", power: 2, toughness: 2, type_line: "Creature — Bear", oracle: "" }, controller: "ai" });
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = mainState({ user: { hand: [buff], manaPool: { G: 1 } }, ai: { battlefield: [vanilla] } });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === vanilla.id));
    const out = dispatchAction(s, cast);
    expect(out.stack.some((o) => o.kind === "triggered-ability")).toBe(false); // no sac trigger raised
    expect(out.players.ai.battlefield).toHaveLength(1);
  });
});

// ─── SITE 2: an activated ability targeting the permanent ────────────────────────────────────────────────
describe("SITE 2 — an activated ability targeting a becomes-target permanent sacrifices it (CR 603.2)", () => {
  it("a pinger's targeted ability fires the sac trigger → the creature is sacrificed", () => {
    const pinger = createPermanent({ id: "perm-p", card: { id: "pinger-c", name: "Prodigal Sorcerer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{T}: This creature deals 1 damage to target creature." }, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "perm-b", card: bearCard(), controller: "ai" });
    let s = mainState({ user: { battlefield: [pinger], manaPool: { C: 2 } }, ai: { battlefield: [bear] } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-p" && (a.targets || []).some((t) => t.id === "perm-b"));
    expect(act).toBeTruthy();
    let out = dispatchAction(s, act);
    expect(out.stack.map((o) => o.kind)).toEqual(["activated-ability", "triggered-ability"]);
    out = resolveTopOfStack(out); // sac trigger resolves first
    expect(out.players.ai.battlefield).toHaveLength(0);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Phantasmal Bear");
  });
});

// ─── SITE 4: a triggered ability's target selection ──────────────────────────────────────────────────────
describe("SITE 4 — a triggered ability targeting a becomes-target permanent sacrifices it (CR 603.2 / flush)", () => {
  it("an ETB 'deal damage to target creature' trigger firing at a Phantasmal creature sacrifices it", () => {
    // A creature whose ETB damages a target creature; the only legal target is the opponent's Phantasmal Bear.
    const bear = createPermanent({ id: "perm-b", card: bearCard(), controller: "user" });
    const zap = { id: "zap", name: "Zap Elemental", type: "Creature — Elemental", power: 2, toughness: 2, oracle: "When this creature enters, it deals 2 damage to target creature an opponent controls.", mana: "{2}{R}" };
    // ai casts the ETB creature; its only opponent creature is the user's Phantasmal Bear.
    let s = mainState({ user: { battlefield: [bear] }, ai: { hand: [zap], manaPool: { R: 1, C: 2 } } });
    s = { ...s, activePlayer: "ai", priorityHolder: "ai" };
    const cast = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "zap");
    expect(cast).toBeTruthy();
    let out = dispatchAction(s, cast);
    out = resolveTopOfStack(out); // Zap Elemental enters → its ETB trigger goes on the stack targeting the Bear...
    // ...and the flush-site becomes-target hook put the sac trigger ABOVE the ETB damage trigger.
    const kinds = out.stack.map((o) => o.kind);
    expect(kinds).toContain("triggered-ability");
    // The sac trigger (targeting nothing) is on top; resolve it → the Bear is sacrificed before the damage lands.
    out = resolveTopOfStack(out);
    expect(out.players.user.battlefield.some((p) => p.card.name === "Phantasmal Bear")).toBe(false);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Phantasmal Bear");
  });
});

// ─── Phantasmal Image (the clone that GRANTS the sac trigger) ────────────────────────────────────────────
describe("Phantasmal Image — a clone that grants the becomes-target sac trigger to its copy (CR 707.9a)", () => {
  const IMAGE = { id: "image", name: "Phantasmal Image", type: "Creature — Illusion", type_line: "Creature — Illusion", mana: "{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any creature on the battlefield, except it's an Illusion in addition to its other types and it has \"When this creature becomes the target of a spell or ability, sacrifice it.\"" };

  it("parseCloneSpec recognizes the Illusion add-type + granted sac-trigger rider", () => {
    const spec = parseCloneSpec(pub(IMAGE));
    expect(spec).toBeTruthy();
    expect(spec.riders).toEqual([
      { kind: "addType", subtype: "Illusion" },
      { kind: "grantTrigger", oracle: SAC_TRIGGER },
    ]);
    expect(isCloneCard(pub(IMAGE))).toBe(true);
    expect(classifyCard(pub(IMAGE))).toBe("native-clone");
  });

  it("the copy carries BOTH the Illusion type and the sac trigger on its oracle", () => {
    const spec = parseCloneSpec(pub(IMAGE));
    const source = { card: { name: "Grizzly Bears", type: "Creature — Bear", type_line: "Creature — Bear", oracle: "", power: 2, toughness: 2 } };
    const copy = snapshotCopiedCard(source, { id: "clone-1" }, spec.riders);
    expect(copy.type).toBe("Creature — Bear Illusion");
    expect(copy.oracle).toContain(SAC_TRIGGER);
  });

  it("end-to-end: Phantasmal Image copies a creature, then targeting the copy sacrifices it", () => {
    const bears = createPermanent({ id: "perm-gb", card: { id: "gb-c", name: "Grizzly Bears", type_line: "Creature — Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = mainState({ user: { hand: [{ ...IMAGE }, removal], manaPool: { U: 1, B: 1 } }, ai: { battlefield: [bears] } });
    const castImage = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "image");
    let out = dispatchAction(s, castImage);
    out = resolveTopOfStack(out); // → clone-search pendingChoice
    expect(out.pendingChoice?.kind).toBe("clone-search");
    out = resolveCloneChoice(out, out.pendingChoice.candidates[0].id);
    const copy = out.players.user.battlefield.find((p) => /Illusion/.test(p.card.type_line || p.card.type || ""));
    expect(copy).toBeTruthy();
    expect(copy.card.oracle).toContain(SAC_TRIGGER);
    // Target the copy → the granted sac trigger fires and sacrifices it.
    out = { ...out, priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", activePlayer: "user" };
    const castRemoval = legalActionsForPlayer(out, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === copy.id));
    expect(castRemoval).toBeTruthy();
    out = dispatchAction(out, castRemoval);
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    out = resolveTopOfStack(out); // sac trigger resolves
    expect(out.players.user.battlefield.some((p) => /Illusion/.test(p.card.type_line || p.card.type || ""))).toBe(false);
    // CR 707.2 — in the graveyard the copy reverts to its printed card (Phantasmal Image).
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Phantasmal Image");
  });
});
