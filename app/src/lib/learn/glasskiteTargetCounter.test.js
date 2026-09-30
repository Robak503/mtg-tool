/**
 * glasskiteTargetCounter.test.js — "Whenever this creature becomes the target of a spell or ability for the first time
 * each turn, counter that spell or ability." (Shimmering Glasskite, Jetting Glasskite, Glyph Keeper — the 09-06 plan's
 * stage ③, 2026-09-30).
 *
 * The census row read as a bug signature: Kira, Great Glass-Spinner GRANTS this exact trigger and was native, while the
 * three cards that PRINT it parked on it as their sole blocker. The condition was already machinery (the self
 * becomesTarget event, fired at all four target-choice sites, with the once-per-turn latch — Angelic Cub proves it);
 * only the payoff was unparsed, because "counter that spell or ability" names the object whose TARGET CHOICE fired the
 * trigger, and nothing threaded that object to the resolution. Built exactly like the cast referent (SG-13, Vexing
 * Bauble): the splitter rewrites the whole sentence to a phrase no card prints, the stack parser reads it as the op
 * `counter-targeting-object`, and checkBecomesTargetTriggers threads `targetingStackObjectId`.
 *
 * ⛔ CAN'T BE COUNTERED IS HONOURED (CR 701.6a). The counter-TARGET enumeration always excluded uncounterable spells; a
 * counter that names no target never passed through it. The four exclusions now live in ONE predicate
 * (staticAbilityParser.stackSpellIsUncounterable) that both paths read.
 *
 * ⛔ KIRA IS NOT DOUBLE-MODELED. Once the printed trigger parsed, Kira's quoted body did too, and the group-grant gate
 * would have emitted it — a second, stack-based counter beside kiraTargetCounter.js's synchronous one (Kira silently
 * re-tiered native-trigger → native-static in the first probe; its runtime grew a fizzling trigger per targeting). The
 * gate declines that body; Kira keeps its module. Pinned at the runtime, not just the tier.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { isModeledGroupTriggeredBody, triggerRoutesNatively } from "./triggerRouting.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const GLASSKITE_LINE = "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.";
const SHIMMERING = { id: "sg-c", name: "Shimmering Glasskite", type: "Creature — Spirit", mana: "{3}{U}", power: 2, toughness: 3,
  oracle: `Flying\n${GLASSKITE_LINE}` };
const JETTING = { id: "jg-c", name: "Jetting Glasskite", type: "Creature — Spirit", mana: "{4}{U}{U}", power: 4, toughness: 4,
  oracle: `Flying\n${GLASSKITE_LINE}` };
const GLYPH_KEEPER = { id: "gk-c", name: "Glyph Keeper", type: "Creature — Sphinx", mana: "{3}{U}{U}", power: 5, toughness: 3,
  oracle: `Flying\n${GLASSKITE_LINE}\nEmbalm {5}{U}{U} ({5}{U}{U}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Sphinx with no mana cost. Embalm only as a sorcery.)` };
const KIRA = { id: "kira-c", name: "Kira, Great Glass-Spinner", type: "Legendary Creature — Spirit", mana: "{1}{U}{U}", power: 2, toughness: 2,
  oracle: `Flying\nCreatures you control have "${GLASSKITE_LINE}"` };
const FROST_TITAN = { id: "ft-c", name: "Frost Titan", type: "Creature — Giant", mana: "{4}{U}{U}", power: 6, toughness: 6,
  oracle: "Whenever this creature becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}.\nWhenever this creature enters or attacks, tap target permanent. It doesn't untap during its controller's next untap step." };
const CHIMIL = { id: "chimil-c", name: "Chimil, the Inner Sun", type: "Legendary Artifact", mana: "{6}",
  oracle: "Spells you control can't be countered.\nAt the beginning of your end step, discover 5. (Exile cards from the top of your library until you exile a nonland card with mana value 5 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" };
const PRODIGAL = { id: "ps-c", name: "Prodigal Sorcerer", type: "Creature — Human Wizard Sorcerer", mana: "{2}{U}", power: 1, toughness: 1,
  oracle: "{T}: This creature deals 1 damage to any target." };
const shock = (id) => ({ id, name: "Shock", type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." });
const BEAR = { id: "gb-c", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

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
const castAt = (s, cardId, targetId) => legalActionsForPlayer(s, "user")
  .find((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets || []).some((t) => t.id === targetId));
const permOf = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);

describe("the three printed carriers classify native, through the existing becomes-target event", () => {
  it("Shimmering Glasskite, Jetting Glasskite, Glyph Keeper → native-trigger", () => {
    for (const c of [SHIMMERING, JETTING, GLYPH_KEEPER]) expect(classifyCard(c)).toBe("native-trigger");
  });

  it("the line detects as the SELF becomesTarget event with the once-per-turn latch and the targeting-object payoff", () => {
    const dets = detectTriggers(SHIMMERING);
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ event: "becomesTarget", scope: "self", oncePerTurnTrigger: true,
      effectClause: "counter the targeting spell or ability" });
  });

  it("⛔ Frost Titan's pay-rider line is NEVER read as this hard counter (it keeps its own words; the card stays parked)", () => {
    const dets = detectTriggers(FROST_TITAN);
    expect(dets.some((d) => /targeting spell or ability/.test(d.effectClause || ""))).toBe(false);
    expect(classifyCard(FROST_TITAN)).toBe("body-only");
  });

  it("⛔ the rewrite is EXACT on both halves — a rider keeps its words; a narrowed (Valiant-shaped) condition keeps its words", () => {
    // Synthetic lines: no printed card separates the two anchors (every corpus "counter that spell or ability" with a
    // rider ALSO has an opponent-only condition — Frost Titan, Diffusion Sliver, Reidane, Unsettled Mariner, Parnesse),
    // so each anchor is pinned here on its own. Both conditions below DETECT as becomesTarget; neither may be rewritten.
    const rider = detectTriggers({ name: "Rider Probe", type: "Creature — Spirit", power: 1, toughness: 1,
      oracle: "Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability unless its controller pays {2}." });
    expect(rider).toHaveLength(1);
    expect(rider[0].event).toBe("becomesTarget");
    expect(rider[0].effectClause).toMatch(/^counter that spell or ability unless its controller pays \{2\}/);
    const narrowed = detectTriggers({ name: "Narrowed Probe", type: "Creature — Spirit", power: 1, toughness: 1,
      oracle: "Whenever this creature becomes the target of a spell or ability you control for the first time each turn, counter that spell or ability." });
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]).toMatchObject({ event: "becomesTarget", targeterIsController: true });
    expect(narrowed[0].effectClause).toMatch(/^counter that spell or ability\.?$/);
  });

  it("⛔ the op is gated to the becomes-target event: the same phrase on an ETB never routes natively", () => {
    // A synthetic line (no card prints it) — the belt on top of the splitter, which only writes the phrase for the
    // self becomes-target sentence. Anywhere else the referent is unset and the counter would silently do nothing.
    const etb = { name: "Gate Probe", type: "Creature — Spirit", power: 1, toughness: 1,
      oracle: "When this creature enters, counter the targeting spell or ability." };
    const dets = detectTriggers(etb);
    expect(dets).toHaveLength(1);
    expect(dets[0].event).toBe("etb");
    expect(triggerRoutesNatively(dets[0])).toBe(false);
  });
});

describe("RUNTIME — the trigger goes on the stack ABOVE the targeting object and counters it (CR 603.3b)", () => {
  it("SITE 1: an opponent's Shock at a Shimmering Glasskite is countered; a SECOND Shock that turn resolves (the latch)", () => {
    const kite = createPermanent({ id: "perm-sg", card: SHIMMERING, controller: "ai" });
    let s = mainState({ user: { hand: [shock("shock1"), shock("shock2")], manaPool: { R: 2 } }, ai: { battlefield: [kite] } });
    let out = dispatchAction(s, castAt(s, "shock1", "perm-sg"));
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    out = resolveTopOfStack(out); // the Glasskite's trigger resolves first
    expect(out.stack).toHaveLength(0);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Shock"]);
    expect(permOf(out, "ai", "perm-sg").damageMarked || 0).toBe(0);
    const w1 = { countered: out.stack.length === 0 && out.players.user.graveyard.length === 1, damage: permOf(out, "ai", "perm-sg").damageMarked || 0 };

    // The second targeting this turn — not the first time, so no trigger; Shock resolves.
    out = { ...out, priorityHolder: "user", consecutivePasses: 0 };
    const second = castAt(out, "shock2", "perm-sg");
    expect(second).toBeTruthy();
    out = dispatchAction(out, second);
    expect(out.stack.map((o) => o.kind)).toEqual(["spell"]);
    out = resolveTopOfStack(out);
    expect(permOf(out, "ai", "perm-sg").damageMarked).toBe(2);
    console.log(`WITNESS glasskiteSpell ${JSON.stringify({ first: w1, secondDamage: permOf(out, "ai", "perm-sg").damageMarked })}`);
  });

  it("SITE 2: a Prodigal Sorcerer's ping at a Jetting Glasskite is countered — the ability leaves the stack, nothing lands", () => {
    const pinger = createPermanent({ id: "perm-ps", card: PRODIGAL, controller: "user", summoningSick: false });
    const kite = createPermanent({ id: "perm-jg", card: JETTING, controller: "ai" });
    let s = mainState({ user: { battlefield: [pinger] }, ai: { battlefield: [kite] } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-ps" && (a.targets || []).some((t) => t.id === "perm-jg"));
    expect(act).toBeTruthy();
    let out = dispatchAction(s, act);
    expect(out.stack.map((o) => o.kind)).toEqual(["activated-ability", "triggered-ability"]);
    out = resolveTopOfStack(out);
    expect(out.stack).toHaveLength(0); // the ping is gone — an ability goes to no zone (CR 701.6a)
    expect(permOf(out, "ai", "perm-jg").damageMarked || 0).toBe(0);
    expect(permOf(out, "user", "perm-ps").tapped).toBe(true); // its {T} cost was still paid
  });

  it("⛔ a spell that can't be countered stays: Chimil's controller Shocks the Glasskite — the trigger resolves, Shock lands", () => {
    const chimil = createPermanent({ id: "perm-ch", card: CHIMIL, controller: "user" });
    const kite = createPermanent({ id: "perm-sg", card: SHIMMERING, controller: "ai" });
    let s = mainState({ user: { hand: [shock("shock1")], battlefield: [chimil], manaPool: { R: 1 } }, ai: { battlefield: [kite] } });
    let out = dispatchAction(s, castAt(s, "shock1", "perm-sg"));
    expect(out.stack.map((o) => o.kind)).toEqual(["spell", "triggered-ability"]);
    out = resolveTopOfStack(out); // the trigger resolves — and cannot counter Shock (CR 701.6a)
    expect(out.stack.map((o) => o.kind)).toEqual(["spell"]);
    expect((out.log || []).some((e) => e.effect === "counter-uncounterable")).toBe(true);
    const shockStayed = out.stack.some((o) => o.kind === "spell" && o.source?.name === "Shock");
    out = resolveTopOfStack(out);
    expect(permOf(out, "ai", "perm-sg").damageMarked).toBe(2);
    console.log(`WITNESS glasskiteUncounterable ${JSON.stringify({ shockStayed, damage: permOf(out, "ai", "perm-sg").damageMarked })}`);
  });
});

describe("⛔ KIRA KEEPS ITS OWN MODULE — the quoted grant is never emitted as a second, stack-based counter", () => {
  it("the group-grant gate declines Kira's quoted body, so Kira's static emits no triggered grant", () => {
    expect(isModeledGroupTriggeredBody(GLASSKITE_LINE)).toBe(false);
    expect(parseStaticAbilities(KIRA).some((d) => d?.op?.grant?.kind === "triggered")).toBe(false);
    expect(classifyCard(KIRA)).toBe("native-trigger"); // unchanged — its registry classifier, as before this slice
  });

  it("RUNTIME: a Shock at a creature under Kira is countered at the cast, with NO trigger stacked beside it", () => {
    const kira = createPermanent({ id: "perm-k", card: KIRA, controller: "ai" });
    const bear = createPermanent({ id: "perm-b", card: BEAR, controller: "ai" });
    let s = mainState({ user: { hand: [shock("shock1")], manaPool: { R: 1 } }, ai: { battlefield: [kira, bear] } });
    const out = dispatchAction(s, castAt(s, "shock1", "perm-b"));
    expect(out.stack).toHaveLength(0); // Kira's synchronous counter — and nothing else
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Shock"]);
  });

  it("RUNTIME: Kira beside a Glasskite — the Glasskite's own trigger finds Shock already countered and fizzles cleanly", () => {
    const kira = createPermanent({ id: "perm-k", card: KIRA, controller: "ai" });
    const kite = createPermanent({ id: "perm-sg", card: SHIMMERING, controller: "ai" });
    let s = mainState({ user: { hand: [shock("shock1")], manaPool: { R: 1 } }, ai: { battlefield: [kira, kite] } });
    let out = dispatchAction(s, castAt(s, "shock1", "perm-sg"));
    expect(out.stack.map((o) => o.kind)).toEqual(["triggered-ability"]); // Shock already gone (Kira)
    out = resolveTopOfStack(out);
    expect(out.stack).toHaveLength(0);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Shock"]); // once — never double-moved
    expect((out.log || []).some((e) => e.effect === "counter-fizzle")).toBe(true);
  });
});
