/**
 * triggerScopesR2.test.js — BLITZ TR-3: TRIGGER-SCOPE round 2 (CEN-3 census vein #2, remainder).
 *
 * Four trigger forms the census probe-verified as UNDETECTED, extending TR-2's scope machinery:
 *   1. "At the beginning of THE end step, <effect>" (CR 513.1/513.2 + 603.2b) — the OLD unqualified
 *      end-step wording (Ball Lightning, Glitterfang, Impetuous Devils). CR 513.2 quotes this exact
 *      phrasing; per the printed ruling ("triggers at the beginning of each end step, no matter whose
 *      turn it is") "the end step" = EVERY turn's end step → whose:"any" (identical firing to "each end
 *      step"), NOT whose:"yours". Reuses the existing endStep event (checkStepTriggers).
 *   2. SELF "this <artifact|creature|enchantment> is put into a graveyard from the battlefield, <effect>"
 *      (CR 700.4 + 603.6c) — Nutrient Block / Chromatic Star / Terrarion / Hatching Plans "draw a card".
 *      Rides the SELF "ltb" event checkLeavesTriggers already enqueues (toGraveyard-gated). "this aura" is
 *      excluded so the Aura self-PiG-return (Rancor) still reaches the selfReturn.js registry detector.
 *   3. BROAD "an artifact is put into a graveyard from the battlefield, <effect>" (CR 700.4) — Molder
 *      Beast, Fangren Marauder, Moriok Rigger. ANY player's artifact (the sole NON-controller PiG scope,
 *      artifactAnyPiG), the typed sibling of "a creature dies".
 *   4. Cast-QUALITY filters — "you cast a HISTORIC spell" (CR 700.6 — legendary ∨ artifact ∨ Saga) and
 *      "a MULTICOLORED spell" (CR 105.2b — two or more colors). castSpellFilter + spellMatchesFilter only;
 *      the cast event + firing (checkCastTriggers) already exist.
 *
 * CREED pins: "the end step" fires on EVERY player's end step exactly once (whose:"any"); the delayed
 * "your NEXT end step" (Puppeteer Clique) and the Aura "end step of enchanted creature's controller"
 * stay UNDETECTED; a broad artifact-PiG fires on an ARTIFACT dying not a creature; the historic filter
 * admits artifact/legendary/Saga and rejects a vanilla spell; the multicolored filter admits ≥2 colors
 * and rejects mono/colorless. FN guards: Spine of Ish Sah's bare self-return parks, Disciple of the
 * Vault's targeted-optional drain parks, "commit a crime" parks (no crime event — CR 700.13 is a
 * cross-cutting cast/activate marker, out of a trigger-scope slice). Whole-card law throughout.
 *
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-17); every flip audited by name in the TR-3
 * flip-diff (44 GAINED, LOST=0). CR cites verified against knowledge/mtg-judge/data/cr/cr_current.json.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, creaturePower, findPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkStepTriggers, checkLeavesTriggers, checkCastTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { resolveSacrificeChoice, autoPickSacrificeCandidate } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── REAL current Oracle wordings (verified against the bundled corpus, 2026-07-17) ──
// Form 4 — cast-quality filters
const CABAL_PALADIN = { name: "Cabal Paladin", type: "Creature — Human Knight", mana: "{3}{B}", power: 4, toughness: 2,
  oracle: "Whenever you cast a historic spell, this creature deals 2 damage to each opponent. (Artifacts, legendaries, and Sagas are historic.)" };
const SERRA_DISCIPLE = { name: "Serra Disciple", type: "Creature — Bird Cleric", mana: "{1}{W}", power: 1, toughness: 1,
  oracle: "Flying, first strike\nWhenever you cast a historic spell, this creature gets +1/+1 until end of turn. (Artifacts, legendaries, and Sagas are historic.)" };
const ARTIFICERS_ASSISTANT = { name: "Artificer's Assistant", type: "Creature — Bird", mana: "{U}", power: 1, toughness: 1,
  oracle: "Flying\nWhenever you cast a historic spell, scry 1. (Artifacts, legendaries, and Sagas are historic.)" };
const HERO_PRECINCT = { name: "Hero of Precinct One", type: "Creature — Human Warrior", mana: "{1}{W}", power: 2, toughness: 2,
  oracle: "Whenever you cast a multicolored spell, create a 1/1 white Human creature token." };
const RAMPAGING_MONUMENT = { name: "Rampaging Monument", type: "Artifact Creature — Cleric", mana: "{4}", power: 0, toughness: 0,
  oracle: "Trample\nThis creature enters with three +1/+1 counters on it.\nWhenever you cast a multicolored spell, put a +1/+1 counter on this creature." };
const SOLDIER_PANTHEON = { name: "Soldier of the Pantheon", type: "Creature — Human Soldier", mana: "{W}", power: 2, toughness: 1,
  oracle: "Protection from multicolored\nWhenever an opponent casts a multicolored spell, you gain 1 life." };

// Form 1 — "the end step"
const BALL_LIGHTNING = { name: "Ball Lightning", type: "Creature — Elemental", mana: "{R}{R}{R}", power: 6, toughness: 1,
  oracle: "Trample\nHaste\nAt the beginning of the end step, sacrifice this creature." };
const GLITTERFANG = { name: "Glitterfang", type: "Creature — Spirit", mana: "{R}", power: 1, toughness: 1,
  oracle: "Haste\nAt the beginning of the end step, return this creature to its owner's hand." };
const STENCHSKIPPER = { name: "Stenchskipper", type: "Creature — Elemental", mana: "{3}{B}", power: 6, toughness: 5,
  oracle: "Flying\nAt the beginning of the end step, if you control no Goblins, sacrifice this creature." };

// Form 2 — self-PiG + broad artifact-PiG
const CHROMATIC_STAR = { name: "Chromatic Star", type: "Artifact", mana: "{1}",
  oracle: "{1}, {T}, Sacrifice this artifact: Add one mana of any color.\nWhen this artifact is put into a graveyard from the battlefield, draw a card." };
const HATCHING_PLANS = { name: "Hatching Plans", type: "Enchantment", mana: "{1}{U}",
  oracle: "When this enchantment is put into a graveyard from the battlefield, draw three cards." };
const MOLDER_BEAST = { name: "Molder Beast", type: "Creature — Beast", mana: "{4}{G}", power: 5, toughness: 3,
  oracle: "Trample\nWhenever an artifact is put into a graveyard from the battlefield, this creature gets +2/+0 until end of turn." };
const FANGREN_MARAUDER = { name: "Fangren Marauder", type: "Creature — Beast", mana: "{5}{G}", power: 5, toughness: 5,
  oracle: "Whenever an artifact is put into a graveyard from the battlefield, you may gain 5 life." };

// FN-guard fixtures (real oracles that must stay parked)
const SPINE_OF_ISH_SAH = { name: "Spine of Ish Sah", type: "Artifact", mana: "{7}",
  oracle: "When this artifact enters, destroy target permanent.\nWhen this artifact is put into a graveyard from the battlefield, return it to its owner's hand." };
const DISCIPLE_OF_THE_VAULT = { name: "Disciple of the Vault", type: "Creature — Human Cleric", mana: "{B}", power: 1, toughness: 1,
  oracle: "Whenever an artifact is put into a graveyard from the battlefield, you may have target opponent lose 1 life." };
const MAGDA = { name: "Magda, the Hoardmaster", type: "Legendary Creature — Dwarf Berserker", mana: "{1}{R}", power: 2, toughness: 2,
  oracle: "Whenever you commit a crime, create a tapped Treasure token. This ability triggers only once each turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)\nSacrifice three Treasures: Create a 4/4 red Scorpion Dragon creature token with flying and haste. Activate only as a sorcery." };
const PUPPETEER_CLIQUE = { name: "Puppeteer Clique", type: "Creature — Faerie Wizard", mana: "{3}{B}{B}", power: 3, toughness: 2,
  oracle: "Flying\nWhen this creature enters, put target creature card from an opponent's graveyard onto the battlefield under your control. It gains haste. At the beginning of your next end step, exile it.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)" };

// ── helpers (mirror triggerScopes.test.js) ──────────────────────────────────────────
const crea = (id, name, controller, power = 2, toughness = 2, oracle = "") =>
  createPermanent({ id, card: { id, name, type: "Creature — Bear", mana: "{2}", cmc: 2, power, toughness, oracle }, controller, summoningSick: false });
const artifact = (id, name, controller) =>
  createPermanent({ id, card: { id, name, type: "Artifact", mana: "{1}", cmc: 1, oracle: "" }, controller });
const perm = (id, card, controller) => createPermanent({ id, card: { id, ...card }, controller, summoningSick: false });
const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-l${i}`, name: `${prefix}Card${i}`, type: "Sorcery", mana: "{1}", cmc: 1, oracle: "" }));

function state({ userBf = [], aiBf = [], userHand = [], aiHand = [], userLib = [], aiLib = [], activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "ending", step: "end", activePlayer, priorityHolder: activePlayer, consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: userBf, hand: userHand, library: userLib, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, hand: aiHand, library: aiLib, life: 40 } } };
}
const settle = (s) => {
  let guard = 0;
  while ((s.pendingChoice || s.stack?.length || s.pendingTriggers?.length) && guard++ < 40) {
    if (s.pendingChoice?.kind === "sacrifice-choice") s = resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, s.pendingChoice));
    else if (s.pendingChoice) break;
    else if (s.stack?.length) s = resolveTopOfStack(s);
    else s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  }
  return s;
};

// ─── 1. Form 4 — cast-quality filters (historic / multicolored) ───────────────────
describe("TR-3 cast-quality filters — detection + coverage", () => {
  const castDescriptors = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle }).filter((d) => d.event === "cast");
  it("detects historic / multicolored spell filters (whose:you and whose:opponent)", () => {
    expect(castDescriptors("Whenever you cast a historic spell, scry 1.")[0]).toMatchObject({ whose: "you", spellFilter: "historic" });
    expect(castDescriptors("Whenever you cast a multicolored spell, draw a card.")[0]).toMatchObject({ whose: "you", spellFilter: "multicolored" });
    expect(castDescriptors("Whenever an opponent casts a multicolored spell, you gain 1 life.")[0]).toMatchObject({ whose: "opponent", spellFilter: "multicolored" });
  });
  it("the six audited cast-filter carriers classify native", () => {
    for (const c of [CABAL_PALADIN, SERRA_DISCIPLE, ARTIFICERS_ASSISTANT, HERO_PRECINCT, RAMPAGING_MONUMENT, SOLDIER_PANTHEON]) {
      expect(classifyCard(c), c.name).toBe("native-trigger");
    }
  });
});

describe("TR-3 cast-quality filters — engine: fires only on the matching quality", () => {
  const fires = (watcherOracle, spellCard, casterId = "user") => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const w = createPermanent({ id: "w", card: { id: "cw", name: "Watcher", type: "Creature — Wizard", power: 1, toughness: 1, oracle: watcherOracle }, controller: "user" });
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [w] } } };
    return (checkCastTriggers(s2, { spellCard, casterId }).pendingTriggers || []).length;
  };
  it("HISTORIC admits legendary / artifact / Saga, rejects a vanilla spell (CR 700.6)", () => {
    const o = "Whenever you cast a historic spell, scry 1.";
    expect(fires(o, { name: "Leg", type: "Legendary Creature — Elf" })).toBe(1);
    expect(fires(o, { name: "Art", type: "Artifact" })).toBe(1);
    expect(fires(o, { name: "ArtCrea", type: "Artifact Creature — Golem" })).toBe(1);
    expect(fires(o, { name: "Saga", type: "Enchantment — Saga" })).toBe(1);
    expect(fires(o, { name: "Vanilla", type: "Creature — Bear" })).toBe(0);      // FN guard
    expect(fires(o, { name: "PlainSorc", type: "Sorcery" })).toBe(0);            // FN guard
  });
  it("MULTICOLORED admits ≥2 colors, rejects mono / colorless (CR 105.2b)", () => {
    const o = "Whenever you cast a multicolored spell, draw a card.";
    expect(fires(o, { name: "RW", type: "Instant", colors: ["R", "W"] })).toBe(1);
    expect(fires(o, { name: "WUBRG", type: "Sorcery", colors: ["W", "U", "B", "R", "G"] })).toBe(1);
    expect(fires(o, { name: "Mono", type: "Instant", colors: ["R"] })).toBe(0);  // FN guard
    expect(fires(o, { name: "Colorless", type: "Artifact", colors: [] })).toBe(0); // FN guard
    // colors derived from the mana cost when no colors array is present (colorsOf fallback)
    expect(fires(o, { name: "RWcost", type: "Instant", mana: "{R}{W}" })).toBe(1);
    expect(fires(o, { name: "Rcost", type: "Instant", mana: "{1}{R}" })).toBe(0);
  });
  it("whose:opponent — an opponent's multicolored cast fires; the controller's own does not", () => {
    const o = "Whenever an opponent casts a multicolored spell, you gain 1 life.";
    expect(fires(o, { name: "RW", type: "Instant", colors: ["R", "W"] }, "ai")).toBe(1);
    expect(fires(o, { name: "RW", type: "Instant", colors: ["R", "W"] }, "user")).toBe(0);
  });
});

// ─── 2. Form 1 — "the end step" fires on EVERY end step exactly once (whose:any) ───
describe("TR-3 the-end-step — detection + coverage", () => {
  it("the three audited carriers classify native-trigger; the descriptor is endStep/whose:any", () => {
    for (const c of [BALL_LIGHTNING, GLITTERFANG, STENCHSKIPPER]) expect(classifyCard(c), c.name).toBe("native-trigger");
    const d = detectTriggers(BALL_LIGHTNING).find((t) => t.event === "endStep");
    expect(d).toMatchObject({ event: "endStep", scope: "you", whose: "any" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("FN guard — the delayed 'your NEXT end step' (Puppeteer Clique) is NOT a recurring endStep", () => {
    expect(detectTriggers(PUPPETEER_CLIQUE).filter((t) => t.event === "endStep")).toHaveLength(0);
    expect(classifyCard(PUPPETEER_CLIQUE)).toBe("body-only");
  });
});

describe("TR-3 the-end-step — runtime: fires on both players' end steps, once each (CR 513.2)", () => {
  const endPendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.event === "endStep");
  it("Ball Lightning (user's) sacrifices itself at the end step — on the CONTROLLER's turn", () => {
    let s = state({ userBf: [perm("bl", BALL_LIGHTNING, "user")], activePlayer: "user" });
    const fired = checkStepTriggers(s, "endStep");
    expect(endPendings(fired)).toHaveLength(1);           // exactly once per end-step entry
    const after = settle(fired);
    expect(after.players.user.battlefield.filter((p) => p.card?.name === "Ball Lightning")).toHaveLength(0);
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Ball Lightning");
  });
  it("…and ALSO fires on the OPPONENT's end step (whose:any — the 'the end step' distinction)", () => {
    let s = state({ userBf: [perm("bl", BALL_LIGHTNING, "user")], activePlayer: "ai" });
    const fired = checkStepTriggers(s, "endStep");
    expect(endPendings(fired)).toHaveLength(1);           // fires off-turn too, unlike a 'your end step' card
    const after = settle(fired);
    expect(after.players.user.battlefield.filter((p) => p.card?.name === "Ball Lightning")).toHaveLength(0);
  });
  it("Glitterfang returns itself to hand at the end step", () => {
    let s = state({ userBf: [perm("gf", GLITTERFANG, "user")], activePlayer: "user" });
    const after = settle(checkStepTriggers(s, "endStep"));
    expect(after.players.user.battlefield.filter((p) => p.card?.name === "Glitterfang")).toHaveLength(0);
    expect(after.players.user.hand.map((c) => c.name)).toContain("Glitterfang");
  });
});

// ─── 3. Form 2 — self-PiG + broad artifact-PiG ────────────────────────────────────
describe("TR-3 self-PiG — 'this <permanent> is put into a graveyard from the battlefield'", () => {
  it("Chromatic Star / Terrarion-class artifact + Hatching Plans enchantment classify native", () => {
    expect(classifyCard(CHROMATIC_STAR)).toBe("native-mana");   // draw-on-PiG + a mana ability
    expect(classifyCard(HATCHING_PLANS)).toBe("native-trigger");
    const d = detectTriggers(HATCHING_PLANS).find((t) => t.event === "ltb");
    expect(d).toMatchObject({ event: "ltb", scope: "self", whose: "any" });
  });
  it("runtime — a self-PiG draw fires when the source itself dies", () => {
    let s = state({ userBf: [perm("hp", HATCHING_PLANS, "user")], userLib: lib("u", 5), activePlayer: "user" });
    const left = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "hp" }));
    expect((left.pendingTriggers || []).filter((t) => t.descriptor?.event === "ltb")).toHaveLength(1);
    const after = settle(left);
    expect(after.players.user.hand).toHaveLength(3);   // drew three cards
  });
  it("FN guard — Spine of Ish Sah's bare self-return-to-hand is unmodeled → parks (whole-card law)", () => {
    // the "ltb" trigger IS detected, but the bare "return it to its owner's hand" isn't a modeled atom on
    // this event (only the selfReturn.js marker rewrite is, for Auras) → triggerRoutesNatively false → parks.
    const d = detectTriggers(SPINE_OF_ISH_SAH).find((t) => t.event === "ltb");
    expect(d).toBeTruthy();
    expect(triggerRoutesNatively(d)).toBe(false);
    expect(classifyCard(SPINE_OF_ISH_SAH)).toBe("body-only");
  });
});

describe("TR-3 broad artifact-PiG — 'an artifact is put into a graveyard from the battlefield'", () => {
  const pigPendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.scope === "artifactAnyPiG");
  it("Molder Beast / Fangren Marauder / Moriok Rigger classify native-trigger", () => {
    for (const c of [MOLDER_BEAST, FANGREN_MARAUDER]) expect(classifyCard(c), c.name).toBe("native-trigger");
    const d = detectTriggers(MOLDER_BEAST).find((t) => t.event === "permanentLeaves");
    expect(d).toMatchObject({ event: "permanentLeaves", scope: "artifactAnyPiG", whose: "any" });
  });
  it("fires on ANY player's artifact dying (no controller gate), NOT on a creature dying", () => {
    // Molder Beast (user's) watches an OPPONENT's artifact hitting the graveyard.
    let s = state({ userBf: [perm("mb", MOLDER_BEAST, "user")], aiBf: [artifact("stone", "Mind Stone", "ai"), crea("bear", "Bear", "ai")] });
    const artDies = checkLeavesTriggers(moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "stone" }));
    expect(pigPendings(artDies)).toHaveLength(1);
    const after = settle(artDies);
    expect(creaturePower(findPermanent(after, "mb").permanent, after)).toBe(7); // 5 + 2 (self-pump)
    // a CREATURE dying does NOT fire the artifact-only watcher (FN guard)
    let s2 = state({ userBf: [perm("mb", MOLDER_BEAST, "user")], aiBf: [crea("bear2", "Bear2", "ai")] });
    const creatureDies = checkLeavesTriggers(moveCardToZone(s2, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "bear2" }));
    expect(pigPendings(creatureDies)).toHaveLength(0);
  });
  it("FN guard — Disciple of the Vault's targeted OPTIONAL drain is unmodeled → parks", () => {
    expect(classifyCard(DISCIPLE_OF_THE_VAULT)).toBe("body-only");
  });
});

// ─── 4. Form 4 PARK — 'commit a crime' has no engine event (CR 700.13) ────────────
describe("TR-3 crime PARK — 'whenever you commit a crime' stays UNDETECTED → Arbiter", () => {
  it("Magda, the Hoardmaster parks (no crime marker exists; CR 700.13 is a cross-cutting cast/activate event)", () => {
    expect(detectTriggers(MAGDA).filter((t) => /crime/i.test(String(t.event)))).toHaveLength(0);
    expect(classifyCard(MAGDA)).toBe("body-only");
  });
});
