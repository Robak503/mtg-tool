/**
 * evasionMinBlockers.test.js — BLITZ EV-3: the EV-2 parked evasion residue, three buckets.
 *
 *  1. SET-LEVEL ≥N (CR 509.1b — the menace family; CR 702.111b's "except by two or more creatures"
 *     generalized): "This creature can't be blocked except by <N> or more creatures." Read by
 *     minBlockerCountOf, aggregated (with layer-aware menace and the Sonorous Howlbonder team static) by
 *     attackerMinBlockers, and enforced at the SAME two seams menace always used — the legalChoices
 *     declare-blockers offer gate (a block is offered only while a legal ≥N block can still be COMPLETED)
 *     and the combatResolution normalize (an attacker left with 1..N-1 blockers resolves as unblocked).
 *  2. COMPOUND "and/or" except-filters (CR 509.1b — Amrou Seekers / Skirk Shaman / Elven Riders): an
 *     OR-of-vetted-arms, admitted ONLY when every arm maps to an existing gate (artifact / color / flying /
 *     subtype); one unvetted arm rejects the whole clause (safe FN). isKeywordOnly's clause splitter
 *     protects "and/or" so the compound reaches the classifier mirror whole.
 *  3. BLOCKER-SUBTYPE except-gate (CR 509.1b — Deathcult Rogue "Rogues" / Departed Deckhand "Spirits" /
 *     "Walls"): allowlisted subtype words, tested blocker-side via permIsSubtype — the SAME layer-aware
 *     (layer-4 subtypes + changeling, CR 702.73a) reader GROUP-EVASION uses, so a changeling block is legal.
 *
 * CREED — false-neg SAFE, false-pos FORBIDDEN, whole-card-or-park: Guile (counter-replacement + shuffle-back),
 * Underworld Cerberus (graveyard-shroud static + dies trigger), Troll of Khazad-dûm (swampcycling tutor),
 * Relentless X-ATM092 (graveyard recursion), Phyrexian Colossus (no-untap + pay-life untap), Hexmark Destroyer
 * (ability-word prefix + unearth), Departed Deckhand (targeted-sac trigger + activated grant), Deluxe Dragster
 * (a Vehicle subject + cast-from-their-graveyard trigger), Seeker (aura grant — no aura except-by plumbing),
 * and the legendary/defender filters ALL park body-only even where the evasion arm itself is recognized.
 * Real oracle fixtures (bundled Scryfall, verified against the corpus 2026-07-17).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import {
  canBlockAttacker, isEnforcedEvasionClause, minBlockerCountOf, menaceTeamMinBlockersOf,
  attackerMinBlockers, parseExceptBlockerFilters,
} from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── helpers (mirror combatEvasion.test.js) ──
function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear", colors, tapped = false, summoningSick = false } = {}) {
  const card = { name, type, power, toughness, oracle };
  if (colors) card.colors = colors;
  return { id, card, controller, tapped, summoningSick, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function st({ userBf = [], aiBf = [], attackers = [], blockers = [], step = "combat-damage", activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer,
    step,
    phase: "combat",
    combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}

// ── Real oracle fixtures (bundled Scryfall, probed 2026-07-17) ───────────────────────────────────
const CERATOPS = { name: "Rampaging Ceratops", type: "Creature — Dinosaur", mana: "{4}{G}", power: "5", toughness: "4",
  oracle: "This creature can't be blocked except by three or more creatures." };
const PATHRAZER = { name: "Pathrazer of Ulamog", type: "Creature — Eldrazi", mana: "{11}", power: "9", toughness: "9",
  oracle: "Annihilator 3 (Whenever this creature attacks, defending player sacrifices three permanents of their choice.)\nThis creature can't be blocked except by three or more creatures." };
const GORILLA_BERSERKERS = { name: "Gorilla Berserkers", type: "Creature — Ape Berserker", mana: "{3}{G}{G}", power: "2", toughness: "3",
  oracle: "Trample; rampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)\nThis creature can't be blocked except by three or more creatures." };
const HOWLBONDER = { name: "Sonorous Howlbonder", type: "Creature — Human Warrior", mana: "{1}{B}{R}", power: "2", toughness: "2",
  oracle: "Menace\nEach creature you control with menace can't be blocked except by three or more creatures." };
const GUILE = { name: "Guile", type: "Creature — Elemental Incarnation", mana: "{3}{U}{U}{U}", power: "6", toughness: "6",
  oracle: "This creature can't be blocked except by three or more creatures.\nIf a spell or ability you control would counter a spell, instead exile that spell and you may play that card without paying its mana cost.\nWhen Guile is put into a graveyard from anywhere, shuffle it into its owner's library." };
const HEXMARK = { name: "Hexmark Destroyer", type: "Artifact Creature — Necron", mana: "{6}", power: "6", toughness: "6",
  oracle: "Multi-threat Eliminator — This creature can't be blocked except by six or more creatures.\nUnearth {4}{B}{B} ({4}{B}{B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)" };
const TROLL_KHAZAD = { name: "Troll of Khazad-dûm", type: "Creature — Troll", mana: "{5}{B}", power: "6", toughness: "5",
  oracle: "This creature can't be blocked except by three or more creatures.\nSwampcycling {1} ({1}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)" };
const CERBERUS = { name: "Underworld Cerberus", type: "Creature — Dog", mana: "{3}{B}{R}", power: "6", toughness: "6",
  oracle: "This creature can't be blocked except by three or more creatures.\nCards in graveyards can't be the targets of spells or abilities.\nWhen this creature dies, exile it and each player returns all creature cards from their graveyard to their hand." };
const RELENTLESS = { name: "Relentless X-ATM092", type: "Artifact Creature — Robot Spider", mana: "{6}", power: "6", toughness: "5",
  oracle: "This creature can't be blocked except by three or more creatures.\n{8}: Return this card from your graveyard to the battlefield tapped with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)" };
const PHYREXIAN_COLOSSUS = { name: "Phyrexian Colossus", type: "Artifact Creature — Phyrexian Golem", mana: "{7}", power: "8", toughness: "8",
  oracle: "This creature doesn't untap during your untap step.\nPay 8 life: Untap this creature.\nThis creature can't be blocked except by three or more creatures." };
const AMROU = { name: "Amrou Seekers", type: "Creature — Kithkin Rebel", mana: "{2}{W}", power: "2", toughness: "2",
  oracle: "This creature can't be blocked except by artifact creatures and/or white creatures." };
const SKIRK = { name: "Skirk Shaman", type: "Creature — Goblin Shaman", mana: "{1}{R}{R}", power: "2", toughness: "1",
  oracle: "This creature can't be blocked except by artifact creatures and/or red creatures." };
const ELVEN_RIDERS = { name: "Elven Riders", type: "Creature — Elf", mana: "{3}{G}{G}", power: "3", toughness: "3",
  oracle: "This creature can't be blocked except by Walls and/or creatures with flying." };
const SEEKER = { name: "Seeker", type: "Enchantment — Aura", mana: "{2}{W}{W}",
  oracle: "Enchant creature\nEnchanted creature can't be blocked except by artifact creatures and/or white creatures." };
const DEATHCULT = { name: "Deathcult Rogue", type: "Creature — Human Rogue", mana: "{1}{U/B}{U/B}", power: "2", toughness: "2",
  oracle: "This creature can't be blocked except by Rogues." };
const DECKHAND = { name: "Departed Deckhand", type: "Creature — Spirit Pirate", mana: "{1}{U}", power: "2", toughness: "2",
  oracle: "When this creature becomes the target of a spell, sacrifice it.\nThis creature can't be blocked except by Spirits.\n{3}{U}: Another target creature you control can't be blocked this turn except by Spirits." };
const DRAGSTER = { name: "Deluxe Dragster", type: "Artifact — Vehicle", mana: "{2}{U}{B}", power: "4", toughness: "3",
  oracle: "This Vehicle can't be blocked except by Vehicles.\nWhenever this Vehicle deals combat damage to a player, you may cast target instant or sorcery card from that player's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.\nCrew 2" };
const NOGGLE = { name: "Noggle Bandit", type: "Creature — Noggle Rogue", mana: "{2}{U/R}", power: "2", toughness: "2",
  oracle: "This creature can't be blocked except by creatures with defender." };
const BALROG = { name: "The Balrog, Durin's Bane", type: "Legendary Creature — Avatar Demon", mana: "{3}{B}{R}", power: "7", toughness: "5",
  oracle: "This spell costs {1} less to cast for each permanent sacrificed this turn.\nHaste\nThe Balrog can't be blocked except by legendary creatures.\nWhen The Balrog dies, destroy target artifact or creature an opponent controls." };

// ═══ 1. Classification — the flip-diff, pinned (8 GAINED, every park held) ═══════════════════════
describe("EV-3 classification — the audited flips", () => {
  it("SET-LEVEL ≥3: a pure carrier and covered-keyword carriers flip native", () => {
    expect(classifyCard(CERATOPS)).toBe("native-body");            // the ≥3 clause is its ONLY text
    expect(classifyCard(GORILLA_BERSERKERS)).toBe("native-body");  // trample + rampage 2 (both enforced) + ≥3
    expect(classifyCard(PATHRAZER)).toBe("native-trigger");        // annihilator 3 (enforced trigger) + ≥3
    expect(classifyCard(HOWLBONDER)).toBe("native-body");          // menace + the team ≥3 static (enforced)
  });
  it("COMPOUND and/or: every-arm-vetted carriers flip native", () => {
    expect(classifyCard(AMROU)).toBe("native-body");        // artifact ∨ white
    expect(classifyCard(SKIRK)).toBe("native-body");        // artifact ∨ red
    expect(classifyCard(ELVEN_RIDERS)).toBe("native-body"); // Wall ∨ flying
  });
  it("SUBTYPE gate: Deathcult Rogue flips native", () => {
    expect(classifyCard(DEATHCULT)).toBe("native-body");
  });
});

describe("EV-3 CREED — whole-card-or-park (the evasion arm alone can't carry an unmodeled sibling)", () => {
  it("≥3 carriers with unmodeled siblings park body-only; Troll of Khazad-dûm FLIPS once typecycling is credited", () => {
    expect(classifyCard(GUILE)).toBe("body-only");              // counter-replacement + shuffle-back
    expect(classifyCard(CERBERUS)).toBe("body-only");           // graveyard-shroud static + mass-return dies trigger
    // NOTE (zone-option family, 2026-07-24): swampcycling is now credited (coverage.js
    // reTypecyclingCost — hand-only option the engine never offers; parseCyclingCost still nulls it
    // so it can never mis-dispatch as a draw-cycle). The ≥3-blocker evasion arm was already modeled
    // by this file's slice — typecycling was Troll's sole remaining park reason.
    expect(classifyCard(TROLL_KHAZAD)).toMatch(/^native/);
    expect(classifyCard(RELENTLESS)).toBe("body-only");         // {8} graveyard recursion
    // GRADUATED (census slice 16). Both halves of Phyrexian Colossus are modeled and were VERIFIED AT
    // RUNTIME before this pin was flipped, not inferred from the parse: untapAll leaves it tapped (the
    // self no-untap static is honored by selfPreventsUntap), the "Pay 8 life: Untap this creature."
    // ability is offered only when payable, and resolving it really does untap the creature. The static
    // was previously credited in only ONE residue path, so this card parked for a path accident rather
    // than a capability gap — see selfNoUntapCreditParity.test.js.
    expect(classifyCard(PHYREXIAN_COLOSSUS)).toMatch(/^native/);
    // Hexmark Destroyer STILL parks — its unearth half is now credited but the ability-word-prefixed
    // clause remains unrecognized: the whole-card law holding under a mass keyword credit, exactly
    // the composed negative this describe exists for.
    expect(classifyCard(HEXMARK)).toBe("body-only");
  });
  it("compound/subtype carriers with unmodeled siblings or subjects park body-only", () => {
    expect(classifyCard(SEEKER)).toBe("body-only");   // aura grant — no aura except-by plumbing exists
    expect(classifyCard(DECKHAND)).toBe("body-only"); // targeted-sac trigger + activated except-grant
    expect(classifyCard(DRAGSTER)).toBe("body-only"); // "This Vehicle" subject + cast-from-their-GY trigger
  });
  it("unvetted filters (legendary / defender) park body-only", () => {
    expect(classifyCard(NOGGLE)).toBe("body-only");
    expect(classifyCard(BALROG)).toBe("body-only");
  });
});

// ═══ 2. The set-level readers ════════════════════════════════════════════════════════════════════
describe("EV-3 readers — minBlockerCountOf / menaceTeamMinBlockersOf / parseExceptBlockerFilters", () => {
  it("minBlockerCountOf reads the printed ≥N (even on parked cards — enforcement is whole-board correct)", () => {
    expect(minBlockerCountOf(CERATOPS)).toBe(3);
    expect(minBlockerCountOf(GUILE)).toBe(3);   // Guile PARKS as a card, but on the battlefield its ≥3 is enforced
    expect(minBlockerCountOf(PATHRAZER)).toBe(3);
  });
  it("minBlockerCountOf fails closed on the ability-word prefix, the ≤1 cap, and team grants", () => {
    expect(minBlockerCountOf(HEXMARK)).toBe(null); // "Multi-threat Eliminator — " breaks the sentence anchor (safe FN)
    expect(minBlockerCountOf({ name: "Hungering Hydra", oracle: "This creature can't be blocked by more than one creature." })).toBe(null);
    expect(minBlockerCountOf({ name: "X", oracle: "Each creature you control can't be blocked except by three or more creatures." })).toBe(null);
    expect(minBlockerCountOf({ name: "X", oracle: "As long as it's your turn, this creature can't be blocked except by three or more creatures." })).toBe(null);
  });
  it("menaceTeamMinBlockersOf reads ONLY the Howlbonder sentence", () => {
    expect(menaceTeamMinBlockersOf(HOWLBONDER)).toBe(3);
    expect(menaceTeamMinBlockersOf(CERATOPS)).toBe(null);
    expect(menaceTeamMinBlockersOf({ name: "X", oracle: "Each creature you control can't be blocked except by three or more creatures." })).toBe(null); // no "with menace" — NOT the modeled static
  });
  it("parseExceptBlockerFilters — vetted arms only, whole-filter fail-closed", () => {
    expect(parseExceptBlockerFilters("artifact creatures and/or white creatures")).toEqual([{ kind: "artifact" }, { kind: "color", color: "W" }]);
    expect(parseExceptBlockerFilters("walls and/or creatures with flying")).toEqual([{ kind: "subtype", subtype: "Wall" }, { kind: "keyword", keyword: "Flying" }]);
    expect(parseExceptBlockerFilters("rogues")).toEqual([{ kind: "subtype", subtype: "Rogue" }]);
    expect(parseExceptBlockerFilters("spirits")).toEqual([{ kind: "subtype", subtype: "Spirit" }]);
    expect(parseExceptBlockerFilters("artifact creatures")).toEqual([{ kind: "artifact" }]);
    // Unvetted arm anywhere → null (whole clause parks): legendary, defender, flavor text, vehicles, ≥N.
    expect(parseExceptBlockerFilters("legendary creatures")).toBe(null);
    expect(parseExceptBlockerFilters("creatures with defender")).toBe(null);
    expect(parseExceptBlockerFilters("creatures with flavor text")).toBe(null);
    expect(parseExceptBlockerFilters("vehicles")).toBe(null);
    expect(parseExceptBlockerFilters("three or more creatures")).toBe(null);   // set-level — NOT a pairwise filter
    expect(parseExceptBlockerFilters("rogues and/or legendary creatures")).toBe(null); // one bad arm poisons the compound
  });
});

// ═══ 3. attackerMinBlockers aggregation (menace ∨ printed ≥N ∨ Howlbonder static) ════════════════
describe("EV-3 — attackerMinBlockers", () => {
  it("menace → 2; printed ≥3 → 3; unrestricted → 1", () => {
    const s = st({ userBf: [
      cr("Brute", "m", "user", { oracle: "Menace" }),
      { ...cr("Ceratops", "c", "user", { power: 5, toughness: 4 }), card: { ...CERATOPS } },
      cr("Bear", "b", "user"),
    ] });
    expect(attackerMinBlockers(s, "m")).toBe(2);
    expect(attackerMinBlockers(s, "c")).toBe(3);
    expect(attackerMinBlockers(s, "b")).toBe(1);
  });
  it("Howlbonder static: OWN menace creatures get 3; a non-menace sibling and an OPPONENT's menace creature don't", () => {
    const howl = { ...cr("Howlbonder", "h", "user", { power: 2, toughness: 2 }), card: { ...HOWLBONDER } };
    const s = st({
      userBf: [howl, cr("Ogre", "og", "user", { oracle: "Menace" }), cr("Bear", "b", "user")],
      aiBf: [cr("Raider", "r", "ai", { oracle: "Menace" })],
    });
    expect(attackerMinBlockers(s, "og")).toBe(3); // own menace creature — the static applies
    expect(attackerMinBlockers(s, "h")).toBe(3);  // Howlbonder itself has menace — applies to itself too
    expect(attackerMinBlockers(s, "b")).toBe(1);  // no menace → the static does not reach it
    expect(attackerMinBlockers(s, "r")).toBe(2);  // "you control" — an opponent's menace creature keeps plain ≥2
  });
});

// ═══ 4. Declaration gate + resolution normalize (the two menace seams, generalized) ══════════════
describe("EV-3 runtime — the ≥3 declaration gate (legalChoices)", () => {
  const ceratops = () => ({ ...cr("Ceratops", "a", "user", { power: 5, toughness: 4 }), card: { ...CERATOPS } });
  it("with only TWO eligible blockers, no block is offered on a ≥3 attacker", () => {
    const s = st({ userBf: [ceratops()], aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai")], step: "declare-blockers" });
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(0);
  });
  it("with THREE eligible blockers, blocks are offered — and the gang can be COMPLETED as the pool shrinks", () => {
    const three = () => st({
      userBf: [ceratops()], aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai"), cr("B3", "b3", "ai")],
      attackers: [{ permanentId: "a", attackingPlayer: "user", defender: "ai" }], step: "declare-blockers",
    });
    let s = three();
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(3);
    // Declare b1, then b2 — the offer gate counts already-declared blockers, so the 2nd and 3rd
    // declarations stay OFFERED (the pre-EV-3 eligible-only count would have wedged the gang here).
    s = { ...s, combat: { ...s.combat, blockers: [{ blockerId: "b1", blockingPlayer: "ai", attackerId: "a" }] } };
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker").map((a) => a.permanentId).sort()).toEqual(["b2", "b3"]);
    s = { ...s, combat: { ...s.combat, blockers: [...s.combat.blockers, { blockerId: "b2", blockingPlayer: "ai", attackerId: "a" }] } };
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker").map((a) => a.permanentId)).toEqual(["b3"]);
  });
  it("the fixed gate un-wedges MENACE too: with exactly TWO blockers the pair can be completed", () => {
    const brute = () => cr("Brute", "a", "user", { power: 3, toughness: 3, oracle: "Menace" });
    let s = st({
      userBf: [brute()], aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai")],
      attackers: [{ permanentId: "a", attackingPlayer: "user", defender: "ai" }], step: "declare-blockers",
    });
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(2);
    s = { ...s, combat: { ...s.combat, blockers: [{ blockerId: "b1", blockingPlayer: "ai", attackerId: "a" }] } };
    // Pre-fix: eligible shrank to 1 < 2 and B2 was never offered — the legal menace pair could not be finished.
    expect(filterActions(legalActionsForPlayer(s, "ai", { declaredAttackers: ["a"] }), "declare-blocker").map((a) => a.permanentId)).toEqual(["b2"]);
  });
});

describe("EV-3 runtime — resolution normalizes an under-sized ≥3 block (the menace guarantee, generalized)", () => {
  const fixture = (blockerIds) => st({
    userBf: [{ ...cr("Ceratops", "a", "user", { power: 5, toughness: 4 }), card: { ...CERATOPS } }],
    aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai"), cr("B3", "b3", "ai")],
    attackers: [{ permanentId: "a", attackingPlayer: "user", defender: "ai" }],
    blockers: blockerIds.map((b) => ({ blockerId: b, blockingPlayer: "ai", attackerId: "a" })),
  });
  it("TWO blockers on a ≥3 attacker → unblocked: face damage lands, the would-be blockers take none", () => {
    const out = resolveCombatDamage(fixture(["b1", "b2"]));
    expect(out.players.ai.life).toBe(35); // 5 face damage — the under-sized block never legally existed
    expect(out.players.ai.battlefield.map((p) => p.card.name).sort()).toEqual(["B1", "B2", "B3"]); // untouched
    expect(out.players.user.battlefield.map((p) => p.card.name)).toContain("Rampaging Ceratops");  // took none back
  });
  it("THREE blockers → blocked normally: no face damage, 6 back-damage kills the 5/4", () => {
    const out = resolveCombatDamage(fixture(["b1", "b2", "b3"]));
    expect(out.players.ai.life).toBe(40);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Rampaging Ceratops"); // 2+2+2 ≥ 4 toughness
  });
  it("pairwise canBlockAttacker stays PERMISSIVE for ≥N (a SET rule, never a blocker gate)", () => {
    const s = fixture([]);
    expect(canBlockAttacker(s, "b1", "a", "ai")).toBe(true);
  });
});

// ═══ 5. Compound / subtype pairwise runtime (canBlockAttacker) ═══════════════════════════════════
describe("EV-3 runtime — compound 'and/or' admits EACH arm; subtype gate is layer-aware", () => {
  const board = (attCard, blkPerm) => {
    const att = { ...cr(attCard.name, "atk", "user"), card: { ...attCard } };
    return st({ userBf: [att], aiBf: [blkPerm] });
  };
  it("Amrou Seekers (artifact ∨ white): artifact blocks, white blocks, a colorless non-artifact CANNOT", () => {
    expect(canBlockAttacker(board(AMROU, cr("Golem", "b", "ai", { type: "Artifact Creature — Golem" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(AMROU, cr("Knight", "b", "ai", { colors: ["W"] })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(AMROU, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(false);
  });
  it("Elven Riders (Wall ∨ flying): a Wall blocks, a flyer blocks, a ground bear CANNOT", () => {
    expect(canBlockAttacker(board(ELVEN_RIDERS, cr("Wall of Stone", "b", "ai", { type: "Creature — Wall", oracle: "Defender" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(ELVEN_RIDERS, cr("Eagle", "b", "ai", { oracle: "Flying" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(ELVEN_RIDERS, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(false);
  });
  it("Deathcult Rogue (Rogues): a Rogue blocks, a CHANGELING blocks (CR 702.73a), a bear CANNOT", () => {
    expect(canBlockAttacker(board(DEATHCULT, cr("Cutpurse", "b", "ai", { type: "Creature — Human Rogue" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(DEATHCULT, cr("Mimic", "b", "ai", { type: "Creature — Shapeshifter", oracle: "Changeling" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(DEATHCULT, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(false);
  });
  it("Departed Deckhand's SELF clause is enforced at runtime even though the CARD parks (whole-card law)", () => {
    expect(canBlockAttacker(board(DECKHAND, cr("Ghost", "b", "ai", { type: "Creature — Spirit" })), "b", "atk", "ai")).toBe(true);
    expect(canBlockAttacker(board(DECKHAND, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(false);
  });
  it("CREED FN-guard: an UNVETTED filter imposes NO restriction (never a fabricated block-lock)", () => {
    expect(canBlockAttacker(board(NOGGLE, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(true);   // "creatures with defender" unparsed
    expect(canBlockAttacker(board(BALROG, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(true);   // "legendary creatures" unparsed
    expect(canBlockAttacker(board(DRAGSTER, cr("Bear", "b", "ai")), "b", "atk", "ai")).toBe(true); // "This Vehicle" subject unparsed
  });
});

// ═══ 6. Classifier mirror — isEnforcedEvasionClause credits EXACTLY what the runtime enforces ════
describe("EV-3 mirror — isEnforcedEvasionClause lockstep", () => {
  it("credits the enforced EV-3 shapes", () => {
    expect(isEnforcedEvasionClause("this creature can't be blocked except by three or more creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by six or more creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by artifact creatures and/or white creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by walls and/or creatures with flying")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by rogues")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by spirits")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by artifact creatures")).toBe(true);
    expect(isEnforcedEvasionClause("each creature you control with menace can't be blocked except by three or more creatures")).toBe(true);
  });
  it("does NOT credit what the runtime does not enforce", () => {
    expect(isEnforcedEvasionClause("this creature can't be blocked except by legendary creatures")).toBe(false);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by creatures with defender")).toBe(false);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by vehicles")).toBe(false);
    expect(isEnforcedEvasionClause("this creature can't be blocked except by rogues and/or legendary creatures")).toBe(false);
    // The ability-word prefix breaks the runtime anchor, so the mirror must refuse it too (Hexmark parks whole).
    expect(isEnforcedEvasionClause("multi-threat eliminator — this creature can't be blocked except by six or more creatures")).toBe(false);
    // Word-list bound: an out-of-range count word is not enforced, so it is not credited.
    expect(isEnforcedEvasionClause("this creature can't be blocked except by eleven or more creatures")).toBe(false);
    // The plain team grant (no "with menace") is NOT the modeled Howlbonder static.
    expect(isEnforcedEvasionClause("each creature you control can't be blocked except by three or more creatures")).toBe(false);
  });
});
