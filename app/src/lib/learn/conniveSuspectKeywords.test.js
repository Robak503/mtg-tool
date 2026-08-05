/**
 * conniveSuspectKeywords.test.js — BLITZ EK-1: two ETB ACTION-KEYWORD atoms, census vein #3.
 *
 *  (A) CONNIVE (CR 701.50 / 701.50a) — "draws a card, then discards a card. If a nonland card is
 *      discarded this way, that player puts a +1/+1 counter on the conniving permanent." The formerly
 *      PARKED keyword (see the old note in bolsterEndureKeywords.test.js): the blocker was the
 *      landness-of-the-discarded-card check across the pending-choice boundary — now carried by a
 *      `connive` rider on the shared "discard" pending-choice, settled in resolveDiscardChoice. The
 *      draw routes through the SHARED applyDrawEffect so card-drawn / second-draw watchers fire
 *      (CR 121.2 — Kang's own "draw your second card" trigger counts connive's draw); the counter
 *      routes through applyAddCounter (doublers CR 616 + counters-placed watchers CR 122.6 compose).
 *      PLAIN connive only — NO printed fixed-N "connive N" exists (corpus-verified 2026-07-17); every
 *      variable "connives X" stays LOW → Arbiter (safe FN).
 *
 *  (B) SUSPECT (CR 701.60 / 701.60a-d) — the SUSPECTED designation: a serializable `suspected` flag on
 *      the permanent; CR 701.60c ("has menace and 'This creature can't block'") enforced through the
 *      REAL reads — layers.permanentHasKeyword seeds menace (→ attackerHasMenace at the declare-blockers
 *      offer gate AND combat resolution) and the "cantBlock" pseudo-keyword (→ the EXACT
 *      combatEvasion.canBlockAttacker read the granted can't-block effects use). Re-suspect is a no-op
 *      (CR 701.60d); only creatures are suspected (CR 701.60a); "all suspected creatures are no longer
 *      suspected" (Absolving Lammasu) is the unsuspect-all mass clear.
 *
 * Pins: recognition on the REAL oracle → the intended native tier; parser HIGH + the deliberately-parked
 * forms LOW; the detectTriggers it/he/she/self-name + leading-"suspect it" rewrites (and the Case-of-the-
 * Stashed-Skeleton token-anaphor NON-rewrite — the FP this slice's anchors forbid); full runtime sequence
 * (draw → chosen discard → BOTH landness branches; forced single-card; empty hand; source-left LKI);
 * suspect enforcement at the real combat reads; whole-card FN guards for the parked families (learn
 * 701.48a — the outside-the-game Lesson branch is unmodelable; incubate 701.53b — the Incubator transform
 * back-face is unmodeled; discover residue — conditional trigger forms, the atom itself landed earlier).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveDiscardChoice } from "./effects/runProgram.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { attackerHasMenace, canBlockAttacker } from "./combatEvasion.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
const atoms = (t) => parseEffectClause(t, "Instant")?.atoms;
const C = (name, oracle, type = "Creature — Human Rogue") => ({ name, oracle, type, keywords: [], mana: "" });

const CONNIVE_R = " (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)";
const SUSPECT_R = " (A suspected creature has menace and can't block.)";

// Build a user-side state with controlled zones.
function stateWith({ hand = [], library = [], battlefield = [], aiBattlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, hand, library, battlefield },
      ai: { ...s.players.ai, battlefield: aiBattlefield },
    },
  };
}
const land = (id) => ({ id, name: `Island-${id}`, type: "Basic Land — Island" });
const spell = (id) => ({ id, name: `Sorcery-${id}`, type: "Sorcery" });
const creaturePerm = (id, ctrl, over = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: 2, toughness: 2, ...over }, controller: ctrl });
const plusCounters = (s, id) => findPermanent(s, id)?.permanent?.counters?.["+1/+1"] || 0;

// ===================================================================================================
describe("CONNIVE — parser (CR 701.50a)", () => {
  it("the three modeled subject forms parse HIGH to the connive atom", () => {
    expect(atoms("this creature connives")).toEqual([{ op: "connive", target: "self", targetType: null }]);
    expect(atoms("the triggering creature connives")).toEqual([{ op: "connive", target: "thatCreature", targetType: null }]);
    expect(atoms("target creature you control connives")).toEqual([{ op: "connive", target: "targetCreature", targetType: "creatureYouControl" }]);
    for (const t of ["this creature connives", "target creature you control connives"]) expect(conf(t)).toBe("high");
  });
  it("CREED: bare pronouns, variable X, subtype targets, and optional forms stay LOW", () => {
    expect(conf("it connives")).toBe("low");                     // un-rewritten spell anaphor (Kamiz mid-program)
    expect(conf("he connives")).toBe("low");
    expect(conf("this creature connives x, where x is the number of attacking creatures")).toBe("low"); // Raffine
    expect(conf("target villain you control connives")).toBe("low"); // Villainous Hideout (subtype pool unmodeled)
    expect(conf("target creature connives")).toBe("low");        // Obscura Confluence bullet (any-side pool)
    expect(conf("you may have it connive")).toBe("low");         // Baron Strucker
    expect(conf("each creature that convoked this spell connives")).toBe("low"); // Lethal Scheme
  });
});

describe("CONNIVE — detectTriggers rewrites (it/he/she + self-name)", () => {
  it("self ETB / attacks: 'it connives' → 'this creature connives'", () => {
    expect(detectTriggers(C("Red Room Recruit", "When this creature enters, it connives."))[0].effectClause).toBe("this creature connives");
    expect(detectTriggers(C("Atlantean Skirmisher", "Whenever this creature attacks, it connives."))[0].effectClause).toBe("this creature connives");
  });
  it("gendered pronouns on legendary sources: 'he/she connives' → 'this creature connives'", () => {
    const shark = detectTriggers(C("Tiger Shark, Abyssal Hunter", "Whenever Tiger Shark enters or attacks, he connives.", "Legendary Creature — Shark Human Villain"));
    expect(shark.map((d) => d.effectClause)).toEqual(["this creature connives", "this creature connives"]);
    expect(detectTriggers(C("Madame Masque", "When Madame Masque enters, she connives.", "Legendary Creature — Human Villain"))[0].effectClause).toBe("this creature connives");
  });
  it("bare NAMED self-connive on a non-self condition: '<Name> connives' → 'this creature connives' (Pharaoh Rama-Tut / Prowler)", () => {
    expect(detectTriggers(C("Pharaoh Rama-Tut", "Whenever you cast a noncreature spell, Pharaoh Rama-Tut connives.", "Legendary Creature — Human Noble Villain"))[0].effectClause).toBe("this creature connives");
    expect(detectTriggers(C("Prowler, Clawed Thief", "Whenever another Villain you control enters, Prowler connives.", "Legendary Creature — Human Rogue Villain"))[0].effectClause).toBe("this creature connives");
  });
  it("CREED: a variable named-connive tail is NOT rewritten (END-anchored 'connives$')", () => {
    const t = detectTriggers(C("Raffine, Scheming Seer", "Whenever you attack, target attacking creature connives X, where X is the number of attacking creatures.", "Legendary Creature — Sphinx Demon"));
    for (const d of t) expect(d.effectClause).not.toContain("this creature connives");
  });
});

describe("CONNIVE — runtime (CR 701.50a sequence)", () => {
  const SRC = () => creaturePerm("conniver", "user", { name: "Conniver" });

  it("draw → chosen discard pause (connive rider + resume) → NONLAND settle places the +1/+1", () => {
    let s = stateWith({ hand: [land("h-l"), spell("h-s")], library: [spell("top")], battlefield: [SRC()] });
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    // The draw happened (library top → hand) BEFORE the discard choice (CR 701.50a order).
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["h-l", "h-s", "top"]);
    expect(s.pendingChoice?.kind).toBe("discard");
    expect(s.pendingChoice?.connive).toEqual({ permanentId: "conniver", controller: "user" });
    // Settle on the NONLAND → it reaches the graveyard and the conniver gets its counter.
    const done = resolveDiscardChoice(s, "h-s");
    expect(done.players.user.graveyard.map((c) => c.id)).toEqual(["h-s"]);
    expect(plusCounters(done, "conniver")).toBe(1);
    expect(done.pendingChoice).toBeUndefined();
  });
  it("a LAND discarded this way places NO counter (the landness branch)", () => {
    let s = stateWith({ hand: [land("h-l"), spell("h-s")], library: [spell("top")], battlefield: [SRC()] });
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    const done = resolveDiscardChoice(s, "h-l");
    expect(done.players.user.graveyard.map((c) => c.id)).toEqual(["h-l"]);
    expect(plusCounters(done, "conniver")).toBe(0);
  });
  it("FORCED single-card hand: no pause, inline discard, landness still checked", () => {
    // Empty hand + a nonland on top: the draw makes a one-card hand → forced pitch → counter.
    let s = stateWith({ hand: [], library: [spell("top")], battlefield: [SRC()] });
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    expect(s.pendingChoice).toBeUndefined();
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["top"]);
    expect(plusCounters(s, "conniver")).toBe(1);
    // …and the land twin: forced pitch of a land → no counter.
    let s2 = stateWith({ hand: [], library: [land("top-l")], battlefield: [SRC()] });
    s2 = resolveAtom(s2, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    expect(s2.players.user.graveyard.map((c) => c.id)).toEqual(["top-l"]);
    expect(plusCounters(s2, "conniver")).toBe(0);
  });
  it("empty hand AND empty library: the connive completes with no discard, no counter, no crash (CR 701.50b)", () => {
    let s = stateWith({ hand: [], library: [], battlefield: [SRC()] });
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    expect(s.pendingChoice).toBeUndefined();
    expect(plusCounters(s, "conniver")).toBe(0);
    expect(s.players.user.graveyard).toHaveLength(0);
  });
  it("source left the battlefield: the draw + discard still happen (CR 701.50c LKI); the counter is a clean no-op", () => {
    let s = stateWith({ hand: [], library: [spell("top")], battlefield: [] }); // conniver gone
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "conniver" });
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["top"]); // forced discard still happened
    expect(s.pendingChoice).toBeUndefined();
  });
  it("chosen-target form: the TARGET creature connives (its controller draws; the counter lands on it)", () => {
    let s = stateWith({ hand: [], library: [spell("top")], battlefield: [creaturePerm("informant", "user")] });
    s = resolveAtom(s, { op: "connive", target: "targetCreature", targetType: "creatureYouControl" },
      { controller: "user", targets: [{ type: "creature", id: "informant", controller: "user" }] });
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["top"]);
    expect(plusCounters(s, "informant")).toBe(1);
  });
  it("INTERLOCK: connive's draw feeds the drawSecond watcher (Kang's own second-draw trigger, CR 121.2)", () => {
    const kang = creaturePerm("kang", "user", {
      name: "Kang, Temporal Tyrant", type: "Legendary Creature — Human Villain",
      oracle: "Whenever Kang attacks, he connives.\nWhenever you draw your second card each turn, each opponent loses 1 life and you gain 1 life.",
    });
    let s = stateWith({ hand: [], library: [spell("top")], battlefield: [kang] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, cardsDrawnThisTurn: 1 } } }; // one draw already this turn
    s = resolveAtom(s, { op: "connive", target: "self" }, { controller: "user", sourceId: "kang" });
    // The connive draw was the SECOND draw of the turn → Kang's drawSecond trigger is pending.
    expect((s.pendingTriggers || []).some((t) => t.descriptor?.event === "drawSecond" || t.event === "drawSecond"
      || /each opponent loses 1 life/i.test(t.effectClause || t.descriptor?.effectClause || ""))).toBe(true);
  });
  it("END-TO-END: ETB → trigger on stack → resolve → pause → settle (the full Red Room Recruit path)", () => {
    const card = { id: "c-rrr", name: "Red Room Recruit", type: "Creature — Human Spy Villain", power: 1, toughness: 3, mana: "{1}{U}", oracle: "When this creature enters, it connives." + CONNIVE_R, keywords: [] };
    let s = stateWith({ hand: [land("h-l"), spell("h-s")], library: [spell("top")] });
    s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: card, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card, controller: "user" } } }] };
    s = resolveTopOfStack(s);                       // enters; ETB trigger flushed onto the stack
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].payload.resolver).toBe("effect-program");
    s = resolveTopOfStack(s);                       // connive runs: draw, then pause
    expect(s.pendingChoice?.kind).toBe("discard");
    expect(s.pendingChoice?.resume).toBeTruthy();   // the program resume rides the pause
    const permId = s.players.user.battlefield[0].id;
    const done = resolveDiscardChoice(s, "h-s");    // pitch the nonland
    expect(plusCounters(done, permId)).toBe(1);
  });
});

// ===================================================================================================
describe("SUSPECT — parser (CR 701.60)", () => {
  it("the modeled forms parse HIGH", () => {
    expect(atoms("suspect this creature")).toEqual([{ op: "suspect", target: "self", targetType: null }]);
    expect(atoms("suspect up to one target creature an opponent controls")).toEqual([
      { op: "suspect", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], maxTargets: 1, minTargets: 0 },
    ]);
    for (const t of [
      "suspect target creature", "suspect target creature you control",
      "suspect target creature an opponent controls", "suspect up to one target creature",
      "suspect up to one target creature you control", "suspect up to one other target creature you control",
      "all suspected creatures are no longer suspected",
    ]) expect(conf(t)).toBe("high");
  });
  it("CREED: anaphors and conditional/perpetual forms stay LOW", () => {
    expect(conf("suspect it")).toBe("low");                       // un-rewritten anaphor (spells; token referents)
    expect(conf("suspect that creature")).toBe("low");            // Snarlfang Vermin's combat form
    expect(conf("create a 2/1 black skeleton creature token and suspect it")).toBe("low"); // Case of the Stashed Skeleton — "it" = the TOKEN
    expect(conf("if it's suspected, exile it. otherwise, suspect it")).toBe("low"); // Agrus Kos
    expect(conf("suspect one of the other creatures")).toBe("low"); // Frantic Scapegoat's chooser
  });
});

describe("SUSPECT — detectTriggers leading-'suspect it' rewrite", () => {
  it("self ETB: 'suspect it' → 'suspect this creature' (follow-up sentences ride along)", () => {
    expect(detectTriggers(C("Frantic Scapegoat", "When this creature enters, suspect it.", "Creature — Goat"))[0].effectClause).toBe("suspect this creature");
    expect(detectTriggers(C("Person of Interest", "When this creature enters, suspect it. Create a 2/2 white and blue Detective creature token."))[0].effectClause)
      .toBe("suspect this creature. Create a 2/2 white and blue Detective creature token");
  });
  it("CREED: the compound token-anaphor '… and suspect it' is NEVER rewritten (the token, not the source)", () => {
    const t = detectTriggers(C("Case of the Stashed Skeleton", "When this Case enters, create a 2/1 black Skeleton creature token and suspect it.", "Enchantment — Case"));
    expect(t[0].effectClause).toBe("create a 2/1 black Skeleton creature token and suspect it");
    expect(conf(t[0].effectClause)).toBe("low"); // whole-card stays parked — never a mis-suspected source
  });
});

describe("SUSPECT — runtime enforcement through the REAL combat reads (CR 701.60c)", () => {
  it("suspected ⇒ menace at attackerHasMenace + layer-aware permanentHasKeyword", () => {
    let s = stateWith({ battlefield: [creaturePerm("sneak", "user")] });
    expect(attackerHasMenace(s, "sneak")).toBe(false);
    s = resolveAtom(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "sneak" });
    expect(findPermanent(s, "sneak").permanent.suspected).toBe(true);
    expect(attackerHasMenace(s, "sneak")).toBe(true);
    expect(permanentHasKeyword(s, "sneak", "menace")).toBe(true);
  });
  it("suspected ⇒ can't block, enforced at canBlockAttacker (the block-legality chokepoint)", () => {
    let s = stateWith({ battlefield: [creaturePerm("att", "user")], aiBattlefield: [creaturePerm("wall", "ai", { power: 0, toughness: 4 })] });
    expect(canBlockAttacker(s, "wall", "att", "ai")).toBe(true);
    s = resolveAtom(s, { op: "suspect", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "wall", controller: "ai" }] });
    expect(canBlockAttacker(s, "wall", "att", "ai")).toBe(false);
  });
  it("CR 701.60d — re-suspect is a no-op; CR 701.60a — a non-creature is never suspected", () => {
    const enchantment = createPermanent({ id: "case", card: { id: "c-case", name: "Case", type: "Enchantment — Case" }, controller: "user" });
    let s = stateWith({ battlefield: [creaturePerm("sneak", "user"), enchantment] });
    s = resolveAtom(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "sneak" });
    s = resolveAtom(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "sneak" }); // again
    expect(findPermanent(s, "sneak").permanent.suspected).toBe(true);
    s = resolveAtom(s, { op: "suspect", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "case", controller: "user" }] });
    expect(!!findPermanent(s, "case").permanent.suspected).toBe(false);
  });
  it("unsuspect-all clears every suspected creature (Absolving Lammasu's ETB)", () => {
    let s = stateWith({ battlefield: [creaturePerm("a", "user")], aiBattlefield: [creaturePerm("b", "ai")] });
    s = resolveAtom(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "a" });
    s = resolveAtom(s, { op: "suspect", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "b", controller: "ai" }] });
    s = resolveAtom(s, { op: "unsuspect-all" }, { controller: "user" });
    expect(!!findPermanent(s, "a").permanent.suspected).toBe(false);
    expect(!!findPermanent(s, "b").permanent.suspected).toBe(false);
  });
  it("the suspected flag serializes (plain JSON survives a round-trip)", () => {
    let s = stateWith({ battlefield: [creaturePerm("sneak", "user")] });
    s = resolveAtom(s, { op: "suspect", target: "self" }, { controller: "user", sourceId: "sneak" });
    const revived = JSON.parse(JSON.stringify(s));
    expect(findPermanent(revived, "sneak").permanent.suspected).toBe(true);
    expect(attackerHasMenace(revived, "sneak")).toBe(true);
  });
});

// ===================================================================================================
describe("EK-1 — coverage flips (real oracle)", () => {
  it("plain ETB connive → native-trigger (Red Room Recruit / Raffine's Informant class)", () => {
    expect(classifyCard(C("Red Room Recruit", "When this creature enters, it connives." + CONNIVE_R, "Creature — Human Spy Villain"))).toBe("native-trigger");
    expect(classifyCard(C("Echo Inspector", "Flying\nWhen this creature enters, it connives." + CONNIVE_R, "Creature — Bird Rogue"))).toBe("native-trigger");
  });
  it("attack / enters-or-attacks / named / gendered forms → native-trigger", () => {
    expect(classifyCard(C("Atlantean Skirmisher", "Whenever this creature attacks, it connives." + CONNIVE_R, "Creature — Merfolk Rogue"))).toBe("native-trigger");
    expect(classifyCard(C("Scurrilous Sentry", "Menace\nWhenever this creature enters or attacks, it connives." + CONNIVE_R, "Creature — Human Knight Rogue"))).toBe("native-trigger");
    expect(classifyCard(C("Madame Masque", "When Madame Masque enters, she connives." + CONNIVE_R + "\nWhenever you draw your second card each turn, create a 2/1 black Villain creature token with menace.", "Legendary Creature — Human Villain"))).toBe("native-trigger");
    expect(classifyCard(C("Pharaoh Rama-Tut", "Ward {2}\nWhenever you cast a noncreature spell, Pharaoh Rama-Tut connives." + CONNIVE_R, "Legendary Creature — Human Noble Villain"))).toBe("native-trigger");
  });
  it("chosen-target ETB connive (Mob Lookout) → native-trigger; activated connive (Hypnotic Grifter) → native-activated", () => {
    expect(classifyCard(C("Mob Lookout", "When this creature enters, target creature you control connives." + CONNIVE_R, "Creature — Human Rogue Villain"))).toBe("native-trigger");
    expect(classifyCard(C("Hypnotic Grifter", "{3}: This creature connives." + CONNIVE_R))).toBe("native-activated");
  });
  it("suspect flips: Person of Interest / Absolving Lammasu → native-trigger; Reasonable Doubt → native-spell", () => {
    expect(classifyCard(C("Person of Interest", "When this creature enters, suspect it. Create a 2/2 white and blue Detective creature token." + SUSPECT_R))).toBe("native-trigger");
    expect(classifyCard(C("Absolving Lammasu", "Flying\nWhen this creature enters, all suspected creatures are no longer suspected.\nWhen this creature dies, you gain 3 life and suspect up to one target creature an opponent controls." + SUSPECT_R, "Creature — Lammasu"))).toBe("native-trigger");
    expect(classifyCard({ name: "Reasonable Doubt", type: "Instant", mana: "{1}{U}", keywords: [], oracle: "Counter target spell unless its controller pays {2}.\nSuspect up to one target creature." + SUSPECT_R })).toBe("native-spell");
  });
});

// ===================================================================================================
describe("EK-1 — CREED whole-card FN guards (parks with evidence)", () => {
  it("connive riders / variable forms stay non-native", () => {
    // Reflexive "When it connives this way …" (Psychic Pickpocket) — unmodeled connive-event window.
    expect(classifyCard(C("Psychic Pickpocket", "When this creature enters, it connives. When it connives this way, return up to one target nonland permanent to its owner's hand.", "Creature — Octopus Rogue"))).not.toMatch(/^native/);
    // Connive-EVENT watcher ("Whenever a creature you control connives") — no connive event scope.
    expect(classifyCard(C("Ultron, Unlimited", "Flying\nWhenever Ultron attacks, he connives.\nWhenever a creature you control connives, you may pay {1}. If you do, create a 2/2 colorless Robot Villain artifact creature token.", "Legendary Artifact Creature — Robot Villain"))).not.toMatch(/^native/);
    // "connives X" (Mask of the Schemer / Raffine) — variable count parked.
    expect(classifyCard(C("Mask of the Schemer", "Whenever equipped creature deals combat damage to a player, it connives X, where X is the amount of damage it dealt to that player.\nEquip {2}", "Artifact — Equipment"))).not.toMatch(/^native/);
  });
  it("suspect conditional / perpetual / cost forms stay non-native", () => {
    // Suspected-sac activated COST (Rune-Brand Juggler line 2).
    expect(classifyCard(C("Rune-Brand Juggler", "When this creature enters, suspect up to one target creature you control.\n{3}{B}{R}, Sacrifice a suspected creature: Target creature gets -5/-5 until end of turn.", "Creature — Human Shaman"))).not.toMatch(/^native/);
    // The suspected-creatures attack watcher (Clandestine Meddler line 2).
    expect(classifyCard(C("Clandestine Meddler", "When this creature enters, suspect up to one other target creature you control.\nWhenever one or more suspected creatures you control attack, surveil 1.", "Creature — Vampire Rogue"))).not.toMatch(/^native/);
    // The token-anaphor Case (create … and suspect it — "it" is the TOKEN).
    expect(classifyCard(C("Case of the Stashed Skeleton", "When this Case enters, create a 2/1 black Skeleton creature token and suspect it.\nTo solve — You control no suspected Skeletons.\nSolved — Sacrifice this Case: Search your library for a card, put it into your hand, then shuffle.", "Enchantment — Case"))).not.toMatch(/^native/);
    // Spell-side "Suspect it." anaphors (Caught Red-Handed / It Doesn't Add Up).
    expect(classifyCard({ name: "It Doesn't Add Up", type: "Instant", mana: "{3}{B}{B}", keywords: [], oracle: "Return target creature card from your graveyard to the battlefield. Suspect it." })).not.toMatch(/^native/);
  });
  it("PARKED families stay non-native: incubate (CR 701.53b), conditional discover", () => {
    // ⭐ LEARN MOVED OUT OF THIS GUARD 2026-08-04, and the note is kept because the reasoning was sound and
    // the correction is instructive. This pin said the rummage half alone "would misrepresent the real
    // choice". Reading CR 701.48a in the bundled rules — rather than the card's reminder text — shows the
    // rule IS the rummage half plus a fallback:
    //   "Learn" means "You may discard a card. If you do, draw a card. If you didn't discard a card, you
    //    may reveal a Lesson card you own from outside the game and put it into your hand."
    // The Lesson branch is a conditional FALLBACK, not a co-equal mode, and it needs an outside-the-game
    // zone this engine does not have. So modeling the primary clause is the rule's own wording, not half of
    // a two-way choice. Learn is now credited; see learnClause.test.js. The pin is re-aimed below.
    expect(classifyCard(C("Professor of Symbology", "When this creature enters, learn.", "Creature — Human Cleric"))).toMatch(/^native/);
    // …and the guard this line performed still performs it, on a family that IS still unmodelable:
    expect(classifyCard(C("Odd Symbology", "When this creature enters, interpret the omens.", "Creature — Human Cleric"))).not.toMatch(/^native/);
    // INCUBATE — the Incubator token is a DFC whose back face transforms ({2}: Transform, CR 701.53b);
    // transform is unmodeled, so minting the front face alone would be a dishonest token → parked.
    expect(classifyCard(C("Phyrexian Awakening", "When this enchantment enters, incubate 4.", "Enchantment"))).not.toMatch(/^native/);
  });

  it("GRADUATED — conditional discover now flips: the \"if you cast it\" vocabulary landed", () => {
    // This sat in the PARKED list above, correctly, while the intervening-if was unanswerable. The
    // cast-vs-put condition is modelled now (castVsPutEtb.test.js — enterPermanent stamps `wasCast` from
    // the two CAST resolvers), so the pin MOVES rather than being deleted: the shape is required to flip,
    // and the reanimation guard that makes it honest is pinned in that file.
    expect(classifyCard(C("Geological Appraiser", "When Geological Appraiser enters, if you cast it, discover 3.", "Creature — Human Artificer"))).toMatch(/^native/);
  });
});
