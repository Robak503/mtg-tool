/**
 * ALT-COST OFFER subsystem (CR 601.2b / 118.9) — the play-quality half of the printed-alternative-cost
 * work: legalChoices twins each alt-carrier cast with `altCost` payment variants, the dispatcher applies
 * the payment atomically before the cast, and the AI pays an alt cost only under a conservative dominance
 * filter. Oracle text below is the REAL bundled Scryfall text (plain vitest has no oracle index on disk).
 *
 * CREED pins in here:
 *   • controlCommander is BATTLEFIELD-only — a command-zone commander is controlled by no one (CR 109.4);
 *     offering Fierce Guardianship free on turn 1 would be the cardinal false positive.
 *   • pitch color reads the card's COLOR (CR 105.2 — colors array incl. indicators, pip fallback), never
 *     color identity (CR 903.4, deck-construction only).
 *   • the 15 LOW altCost carriers (Misdirection / Deflecting Swat / Force of Vigor …) attach metadata but
 *     their bodies are unmodeled — they must NEVER emit an altCost action.
 *   • alt twins carry action.altCost, never action.freeCast (the pendingFreeCast clearing invariant).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { RESOLVER_KEYS } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ── Real cards (bundled Scryfall oracle) ────────────────────────────────────────────────────────────
const FIERCE_GUARDIANSHIP = { id: "fg", name: "Fierce Guardianship", type: "Instant", mana: "{2}{U}", colors: ["U"], cmc: 3,
  oracle: "If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell." };
const FORCE_OF_WILL = { id: "fow", name: "Force of Will", type: "Instant", mana: "{3}{U}{U}", colors: ["U"], cmc: 5,
  oracle: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell." };
const FORCE_OF_NEGATION = { id: "fon", name: "Force of Negation", type: "Instant", mana: "{1}{U}{U}", colors: ["U"], cmc: 3,
  oracle: "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." };
const SNUFF_OUT = { id: "snuff", name: "Snuff Out", type: "Instant", mana: "{3}{B}", colors: ["B"], cmc: 4,
  oracle: "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated." };
const FLARE_OF_DENIAL = { id: "fod", name: "Flare of Denial", type: "Instant", mana: "{1}{U}{U}", colors: ["U"], cmc: 3,
  oracle: "You may sacrifice a nontoken blue creature rather than pay this spell's mana cost.\nCounter target spell." };
const GUSH = { id: "gush", name: "Gush", type: "Instant", mana: "{4}{U}", colors: ["U"], cmc: 5,
  oracle: "You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards." };
const SUBMERGE = { id: "sub", name: "Submerge", type: "Instant", mana: "{4}{U}", colors: ["U"], cmc: 5,
  oracle: "If an opponent controls a Forest and you control an Island, you may cast this spell without paying its mana cost.\nPut target creature on top of its owner's library." };
// MUST-NOT-OFFER canaries — LOW bodies carrying altCost metadata (ALT-6: never offered).
const MISDIRECTION = { id: "misd", name: "Misdirection", type: "Instant", mana: "{3}{U}{U}", colors: ["U"], cmc: 5,
  oracle: "You may exile a blue card from your hand rather than pay this spell's mana cost.\nChange the target of target spell with a single target." };
const DEFLECTING_SWAT = { id: "swat", name: "Deflecting Swat", type: "Instant", mana: "{2}{R}", colors: ["R"], cmc: 3,
  oracle: "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability." };
const FORCE_OF_VIGOR = { id: "fov", name: "Force of Vigor", type: "Instant", mana: "{2}{G}{G}", colors: ["G"], cmc: 4,
  oracle: "If it's not your turn, you may exile a green card from your hand rather than pay this spell's mana cost.\nDestroy up to two target artifacts and/or enchantments." };
// Fodder
const BRAINSTORM = { id: "bs", name: "Brainstorm", type: "Instant", mana: "{U}", colors: ["U"], cmc: 1,
  oracle: "Draw three cards, then put two cards from your hand on top of your library in any order." };
const SOL_RING = { id: "sr", name: "Sol Ring", type: "Artifact", mana: "{1}", colors: [], cmc: 1, oracle: "{T}: Add {C}{C}." };
// Color-indicator canary: BLUE by the colors array with an EMPTY mana cost (Ancestral Vision shape) — IS pitchable.
const SUSPEND_BLUE = { id: "susp", name: "Ancestral Vision", type: "Sorcery", mana: "", colors: ["U"], cmc: 0,
  oracle: "Suspend 4—{U}\nTarget player draws three cards." };
// Colorless card with a {U} pip in its RULES TEXT (color-identity trap) — NOT pitchable (CR 105.2 vs 903.4).
const IDENTITY_TRAP = { id: "trap", name: "Trap Artifact", type: "Artifact", mana: "{2}", colors: [], cmc: 2,
  oracle: "{U}: Scry 1." };

const perm = (card, id, over = {}) => ({ id, card: { id, ...card }, summoningSick: false, tapped: false, ...over });
const ISLAND = { name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" };
const CMDR_PERM = (id = "cmdr") => perm({ name: "Test General", type: "Legendary Creature — Elemental", mana: "{2}{G}{G}", oracle: "", isCommander: true }, id);
const BLUE_BEAR = { name: "Blue Bear", type: "Creature — Bear", mana: "{1}{U}", colors: ["U"], cmc: 2, power: 2, toughness: 2, oracle: "" };
const GREEN_BEAR = { name: "Green Bear", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], cmc: 2, power: 2, toughness: 2, oracle: "" };

function spellOnStack(id, name, type, controller, cost = { generic: 2, U: 1 }) {
  return {
    id, kind: "spell", controller, targets: [], cost,
    source: { id: `card-${id}`, name, type, oracle: "" },
    payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
  };
}

// `who` holds priority; the OTHER seat is the active player (a response window) unless ownTurn.
function altState({ who = "user", ownTurn = false, hand = [], battlefield = [], pool = {}, life, stack = [], other = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const opp = who === "user" ? "ai" : "user";
  return {
    ...s,
    phase: "precombat-main", step: "main",
    activePlayer: ownTurn ? who : opp,
    priorityHolder: who, consecutivePasses: 0, stack,
    players: {
      ...s.players,
      [who]: { ...s.players[who], hand, battlefield, manaPool: { ...s.players[who].manaPool, ...pool }, ...(life != null ? { life } : {}) },
      [opp]: { ...s.players[opp], ...other },
    },
  };
}
const casts = (state, pid = "user") => filterActions(legalActionsForPlayer(state, pid), "cast-spell");
const altsOf = (actions, cardId) => actions.filter((a) => a.cardId === cardId && a.altCost);
const normalsOf = (actions, cardId) => actions.filter((a) => a.cardId === cardId && !a.altCost);

// ── T2: the FREE kind + controlCommander (Wave 1) ───────────────────────────────────────────────────
describe("ALT-COST offer — free kind, controlCommander (Fierce Guardianship class)", () => {
  const stackSpell = spellOnStack("s1", "Divination", "Sorcery", "ai");

  it("commander ON BATTLEFIELD + zero mana → the free alt cast is offered (altCost, never freeCast)", () => {
    const s = altState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [CMDR_PERM()], stack: [stackSpell] });
    const all = casts(s);
    const alt = altsOf(all, "fg");
    expect(alt.length).toBe(1);
    expect(alt[0].altCost).toEqual({ kind: "free" });
    expect(alt[0].freeCast).toBeUndefined(); // the pendingFreeCast clearing invariant keys off freeCast
    expect(alt[0].cost).toEqual({ generic: 0 });
    expect(alt[0].cmc).toBe(3); // mana value stays the printed cost (CR 202.3)
    expect(alt[0].targets[0]).toMatchObject({ type: "spell", id: "s1" });
    expect(normalsOf(all, "fg").length).toBe(0); // {2}{U} unaffordable → the normal cast is NOT offered
  });

  it("CREED (ALT-1): commander in the COMMAND ZONE only → NO free offer (control = battlefield, CR 109.4)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [], userCommanders: [{ id: "cz", name: "Test General", type: "Legendary Creature — Elemental", mana: "{2}{G}{G}", oracle: "" }] });
    const s = {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
      stack: [stackSpell],
      players: { ...base.players, user: { ...base.players.user, hand: [FIERCE_GUARDIANSHIP], battlefield: [] } },
    };
    expect(base.players.user.command[0].isCommander).toBe(true); // the trap this pin guards: the flag exists in the zone
    expect(altsOf(casts(s), "fg").length).toBe(0);
    expect(casts(s).some((a) => a.cardId === "fg")).toBe(false); // no mana either → not castable at all
  });

  it("commander on battlefield + affordable mana → BOTH the normal cast and the free twin are offered", () => {
    const s = altState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [CMDR_PERM()], pool: { U: 1, C: 2 }, stack: [stackSpell] });
    const all = casts(s);
    expect(normalsOf(all, "fg").length).toBe(1);
    expect(altsOf(all, "fg").length).toBe(1);
  });

  it("no commander anywhere → no free offer (the condition gate)", () => {
    const s = altState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [perm(GREEN_BEAR, "gb")], stack: [stackSpell] });
    expect(altsOf(casts(s), "fg").length).toBe(0);
  });

  it("Submerge: opponent Forest + own Island → free offer; no opponent Forest → none", () => {
    const target = perm(GREEN_BEAR, "victim");
    const on = altState({ hand: [SUBMERGE], battlefield: [perm(ISLAND, "i1")], other: { battlefield: [perm(FOREST, "f1"), target] } });
    expect(altsOf(casts(on), "sub").length).toBe(1);
    const off = altState({ hand: [SUBMERGE], battlefield: [perm(ISLAND, "i1")], other: { battlefield: [target] } });
    expect(altsOf(casts(off), "sub").length).toBe(0);
  });

  it("no alt-cost action is ever offered inside a pendingFreeCast window (single-producer invariant)", () => {
    const s = {
      ...altState({ hand: [FIERCE_GUARDIANSHIP, BRAINSTORM], battlefield: [CMDR_PERM()], stack: [stackSpell] }),
      pendingFreeCast: { controller: "user", candidateIds: ["fg", "bs"] },
    };
    const all = filterActions(legalActionsForPlayer(s, "user"), "cast-spell");
    expect(all.every((a) => !a.altCost)).toBe(true);
    expect(all.every((a) => a.freeCast === true)).toBe(true); // the window offers ONLY freeCast casts
  });
});

// ── T2: pay-life + pitch kinds (Wave 2) ─────────────────────────────────────────────────────────────
describe("ALT-COST offer — payLifeExilePitch / exileColorCard / payLife", () => {
  const stackSpell = spellOnStack("s1", "Divination", "Sorcery", "ai");

  it("Force of Will: a blue hand card → one alt per pitch candidate, carrying payLife 1 + the pitch id", () => {
    const s = altState({ hand: [FORCE_OF_WILL, BRAINSTORM, SOL_RING], stack: [stackSpell], life: 20 });
    const alt = altsOf(casts(s), "fow");
    expect(alt.length).toBe(1); // Brainstorm only — Sol Ring is colorless
    expect(alt[0].altCost).toEqual({ kind: "payLifeExilePitch", payLife: 1, exilePitchId: "bs", exilePitchName: "Brainstorm" });
  });

  it("CREED (ALT-3): pitch color is the card's COLOR — an indicator-blue card pitches, a colorless card with a rules-text {U} does not", () => {
    const s = altState({ hand: [FORCE_OF_WILL, SUSPEND_BLUE, IDENTITY_TRAP], stack: [stackSpell], life: 20 });
    const alt = altsOf(casts(s), "fow");
    expect(alt.map((a) => a.altCost.exilePitchId)).toEqual(["susp"]);
  });

  it("Force of Will never pitches ITSELF; no other blue card → no alt offer", () => {
    const s = altState({ hand: [FORCE_OF_WILL, SOL_RING], stack: [stackSpell], life: 20 });
    expect(altsOf(casts(s), "fow").length).toBe(0);
  });

  it("Force of Will at 0 life → no alt offer (CR 119.4 — can't pay life you don't have)", () => {
    const s = altState({ hand: [FORCE_OF_WILL, BRAINSTORM], stack: [stackSpell], life: 0 });
    expect(altsOf(casts(s), "fow").length).toBe(0);
  });

  it("Force of Negation: offered on an OPPONENT'S turn, never on your own (notYourTurn)", () => {
    const offTurn = altState({ hand: [FORCE_OF_NEGATION, BRAINSTORM], stack: [stackSpell] });
    expect(altsOf(casts(offTurn), "fon").length).toBe(1);
    const ownTurn = altState({ ownTurn: true, hand: [FORCE_OF_NEGATION, BRAINSTORM], stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")] });
    expect(altsOf(casts(ownTurn), "fon").length).toBe(0);
  });

  it("Snuff Out: Swamp + life ≥ 4 → payLife 4 alt; no Swamp → none; life 3 → none", () => {
    const victim = perm(GREEN_BEAR, "victim");
    const on = altState({ hand: [SNUFF_OUT], battlefield: [perm(SWAMP, "sw1")], life: 20, other: { battlefield: [victim] } });
    const alt = altsOf(casts(on), "snuff");
    expect(alt.length).toBe(1);
    expect(alt[0].altCost).toEqual({ kind: "payLife", payLife: 4 });
    const noSwamp = altState({ hand: [SNUFF_OUT], battlefield: [perm(ISLAND, "i1")], life: 20, other: { battlefield: [victim] } });
    expect(altsOf(casts(noSwamp), "snuff").length).toBe(0);
    const lowLife = altState({ hand: [SNUFF_OUT], battlefield: [perm(SWAMP, "sw1")], life: 3, other: { battlefield: [victim] } });
    expect(altsOf(casts(lowLife), "snuff").length).toBe(0);
  });
});

// ── T2: sacrifice + return-lands kinds (Wave 3) ─────────────────────────────────────────────────────
describe("ALT-COST offer — sacrificeCreature / returnLandsToHand", () => {
  const stackSpell = spellOnStack("s1", "Divination", "Sorcery", "ai");

  it("Flare of Denial: one alt per legal nontoken blue creature; tokens and off-color creatures never qualify", () => {
    const s = altState({
      hand: [FLARE_OF_DENIAL],
      battlefield: [perm(BLUE_BEAR, "bb"), perm({ ...BLUE_BEAR, name: "Bear Token", token: true }, "tok"), perm(GREEN_BEAR, "gb")],
      stack: [stackSpell],
    });
    const alt = altsOf(casts(s), "fod");
    expect(alt.length).toBe(1);
    expect(alt[0].altCost).toEqual({ kind: "sacrificeCreature", sacId: "bb", sacName: "Blue Bear" });
  });

  it("Gush (ALT-8): ONE canonical payment regardless of Island count — tapped Islands first, id-ascending", () => {
    const s = altState({
      hand: [GUSH],
      battlefield: [perm(ISLAND, "i1"), perm(ISLAND, "i2", { tapped: true }), perm(ISLAND, "i3"), perm(ISLAND, "i4")],
    });
    const alt = altsOf(casts(s), "gush");
    expect(alt.length).toBe(1); // never C(4,2)=6 combinatorial variants
    expect(alt[0].altCost).toEqual({ kind: "returnLandsToHand", returnLandIds: ["i2", "i1"], returnLandNames: ["Island", "Island"] });
  });

  it("Gush with a single Island → unpayable → no offer", () => {
    const s = altState({ hand: [GUSH], battlefield: [perm(ISLAND, "i1"), perm(FOREST, "f1")] });
    expect(altsOf(casts(s), "gush").length).toBe(0);
    expect(casts(s).some((a) => a.cardId === "gush")).toBe(false); // no mana either
  });
});

// ── T2: MUST-NOT-OFFER canaries (ALT-6 — the 15 LOW carriers) ──────────────────────────────────────
describe("ALT-COST CREED — LOW altCost carriers NEVER emit an altCost action", () => {
  const stackSpell = spellOnStack("s1", "Divination", "Sorcery", "ai");
  it("Misdirection (pitch metadata, unmodeled body) → no altCost action even with a blue card in hand", () => {
    const s = altState({ hand: [MISDIRECTION, BRAINSTORM], stack: [stackSpell], pool: { U: 2, C: 3 }, life: 20 });
    expect(casts(s).every((a) => !a.altCost)).toBe(true);
  });
  it("Deflecting Swat (free metadata, unmodeled body) → no altCost action even with a commander on the battlefield", () => {
    const s = altState({ hand: [DEFLECTING_SWAT], battlefield: [CMDR_PERM()], stack: [stackSpell], pool: { R: 1, C: 2 } });
    expect(casts(s).every((a) => !a.altCost)).toBe(true);
  });
  it("GRADUATED 2026-08-14: Force of Vigor — the body is MODELED now, the pitch is OFFERED off-turn", () => {
    // Canaried here while "destroy up to two target artifacts and/or enchantments" parsed LOW. The
    // fixed-count multi-destroy arm (forceOfVigor.test.js) admits the body, so the ALREADY-modeled
    // exileColorCard pitch (Force of Negation's shape, notYourTurn) now rides it — a green hand card
    // pitches on an opponent's turn. The class guard stays: Misdirection/Deflecting Swat above.
    const s = altState({ hand: [FORCE_OF_VIGOR, { ...GREEN_BEAR, id: "gb2" }], stack: [stackSpell], pool: { G: 2, C: 2 } });
    const alt = altsOf(casts(s), "fov");
    expect(alt.length).toBe(1);
    expect(alt[0].altCost).toEqual({ kind: "exileColorCard", exilePitchId: "gb2", exilePitchName: "Green Bear" });
    const ownTurn = altState({ ownTurn: true, hand: [FORCE_OF_VIGOR, { ...GREEN_BEAR, id: "gb2" }], stack: [spellOnStack("s1", "Divination", "Sorcery", "ai")], pool: { G: 2, C: 2 } });
    expect(altsOf(casts(ownTurn), "fov").length).toBe(0); // notYourTurn still binds
  });
});

// ── T4: dispatcher payment application ──────────────────────────────────────────────────────────────
describe("ALT-COST dispatch — the payment is applied atomically, no mana is touched, fail-fast on unpaid", () => {
  const stackSpell = () => spellOnStack("s1", "Divination", "Sorcery", "ai");

  it("Force of Will alt: pitch → exile, life −1, ZERO mana consumed, spell on the stack", () => {
    const s = altState({ hand: [FORCE_OF_WILL, BRAINSTORM], battlefield: [perm(ISLAND, "i1")], stack: [stackSpell()], life: 20 });
    const alt = altsOf(casts(s), "fow")[0];
    const next = dispatchAction(s, alt);
    const u = next.players.user;
    expect(u.hand.map((c) => c.id)).toEqual([]); // FoW → stack, Brainstorm → exile
    expect(u.exile.map((c) => c.id)).toEqual(["bs"]);
    expect(u.life).toBe(19);
    expect(next.players.user.battlefield.find((p) => p.id === "i1").tapped).toBe(false); // no auto-tap
    expect(next.stack.map((o) => o.source.name)).toEqual(["Divination", "Force of Will"]);
  });

  it("Fierce Guardianship free alt: no life, no exile, no mana — just the cast", () => {
    const s = altState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [CMDR_PERM(), perm(ISLAND, "i1")], stack: [stackSpell()], life: 20 });
    const alt = altsOf(casts(s), "fg")[0];
    const next = dispatchAction(s, alt);
    expect(next.players.user.life).toBe(20);
    expect(next.players.user.battlefield.find((p) => p.id === "i1").tapped).toBe(false);
    expect(next.stack.map((o) => o.source.name)).toEqual(["Divination", "Fierce Guardianship"]);
  });

  it("Flare of Denial alt: the chosen creature is sacrificed (battlefield → graveyard) before the cast", () => {
    const s = altState({ hand: [FLARE_OF_DENIAL], battlefield: [perm(BLUE_BEAR, "bb")], stack: [stackSpell()] });
    const alt = altsOf(casts(s), "fod")[0];
    const next = dispatchAction(s, alt);
    expect(next.players.user.battlefield.length).toBe(0);
    expect(next.players.user.graveyard.map((c) => c.name)).toContain("Blue Bear");
    expect(next.stack.map((o) => o.source.name)).toEqual(["Divination", "Flare of Denial"]);
  });

  it("Gush alt: both chosen Islands return battlefield → hand before the cast", () => {
    const s = altState({ hand: [GUSH], battlefield: [perm(ISLAND, "i1"), perm(ISLAND, "i2", { tapped: true })] });
    const alt = altsOf(casts(s), "gush")[0];
    const next = dispatchAction(s, alt);
    expect(next.players.user.battlefield.length).toBe(0);
    expect(next.players.user.hand.map((c) => c.name).sort()).toEqual(["Island", "Island"]);
    expect(next.stack.map((o) => o.source.name)).toEqual(["Gush"]);
  });

  it("Snuff Out alt: life −4 at dispatch", () => {
    const victim = perm(GREEN_BEAR, "victim");
    const s = altState({ hand: [SNUFF_OUT], battlefield: [perm(SWAMP, "sw1")], life: 20, other: { battlefield: [victim] } });
    const alt = altsOf(casts(s), "snuff")[0];
    const next = dispatchAction(s, alt);
    expect(next.players.user.life).toBe(16);
  });

  it("FAIL-FAST: an alt action with a missing payment choice throws ALTCOST_UNPAID (never resolves cost-free)", () => {
    const s = altState({ hand: [FORCE_OF_WILL, BRAINSTORM], stack: [stackSpell()], life: 20 });
    const alt = altsOf(casts(s), "fow")[0];
    const broken = { ...alt, altCost: { kind: "payLifeExilePitch", payLife: 1 } }; // exilePitchId dropped
    expect(() => dispatchAction(s, broken)).toThrowError(DispatcherError);
    expect(() => dispatchAction(s, broken)).toThrowError(/exiled pitch card/);
  });

  it("FAIL-FAST: an unknown alt kind throws ALTCOST_UNSUPPORTED", () => {
    const s = altState({ hand: [FORCE_OF_WILL, BRAINSTORM], stack: [stackSpell()], life: 20 });
    const alt = altsOf(casts(s), "fow")[0];
    expect(() => dispatchAction(s, { ...alt, altCost: { kind: "payAlt0" } })).toThrowError(/Unsupported alt cost kind/);
  });
});

// ── T5: AI dominance filter + thresholds ────────────────────────────────────────────────────────────
describe("ALT-COST AI — conservative dominance (free preferred; paid = interaction of last resort)", () => {
  // The AI seat responds to a USER spell on the stack.
  function aiState({ hand = [], battlefield = [], pool = {}, life = 40, stackCost = { generic: 4, U: 1 } } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "ai", consecutivePasses: 0,
      stack: [spellOnStack("s1", "Big Threat", "Sorcery", "user", stackCost)],
      players: {
        ...s.players,
        ai: { ...s.players.ai, hand, battlefield, life, manaPool: { ...s.players.ai.manaPool, ...pool } },
      },
    };
  }
  const aiPick = (s, policy = null) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange", policy });

  it("free twin dominates: with mana available the AI still counters via the FREE cast, keeping its mana", () => {
    const s = aiState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [CMDR_PERM("aicmdr")], pool: { U: 1, C: 2 } });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("fg");
    expect(pick.altCost).toEqual({ kind: "free" });
  });

  it("paid alt is NEVER taken when the printed cost is affordable (pay mana, keep the card)", () => {
    // The pitch fodder is a creature (not castable at instant speed), so the counter is the only pick.
    const blueFodder = { id: "bf", name: "Blue Fodder", type: "Creature — Bear", mana: "{1}{U}", colors: ["U"], cmc: 2, power: 2, toughness: 2, oracle: "" };
    const s = aiState({ hand: [FORCE_OF_WILL, blueFodder], pool: { U: 2, C: 3 }, stackCost: { generic: 5, U: 1 } });
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("fow");
    expect(pick.altCost).toBeUndefined();
  });

  it("alt-only pitch counter fires at a ≥5-mana threat, pitching the LOWEST-MV blue card", () => {
    const bigBlue = { id: "big", name: "Big Blue", type: "Creature — Leviathan", mana: "{6}{U}{U}", colors: ["U"], cmc: 8, power: 8, toughness: 8, oracle: "" };
    const s = aiState({ hand: [FORCE_OF_WILL, bigBlue, BRAINSTORM], stackCost: { generic: 4, U: 1 } }); // threat = 5 mana
    const pick = aiPick(s);
    expect(pick?.cardId).toBe("fow");
    expect(pick.altCost.exilePitchId).toBe("bs"); // cmc 1 < cmc 8
  });

  it("alt-only pitch counter HOLDS below the ≥5 threat bar (a 2-for-1 needs a real threat)", () => {
    const s = aiState({ hand: [FORCE_OF_WILL, BRAINSTORM], stackCost: { generic: 3, U: 1 } }); // threat = 4 mana
    const pick = aiPick(s);
    expect(pick?.altCost).toBeUndefined();
    expect(pick?.cardId).not.toBe("fow");
  });

  it("non-interaction paid alt (Gush) is human-only: the AI never bounces its lands to draw", () => {
    const s = aiState({ hand: [GUSH], battlefield: [perm(ISLAND, "ai-i1"), perm(ISLAND, "ai-i2")] });
    const pick = aiPick(s);
    expect(pick?.altCost).toBeUndefined();
  });

  it("life prudence: an alt-only Snuff Out at 12 life (12−4 < 10) is held", () => {
    const victim = perm(GREEN_BEAR, "victim");
    const base = aiState({ hand: [SNUFF_OUT], battlefield: [perm(SWAMP, "ai-sw")], life: 12 });
    const s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [victim] } } };
    const pick = aiPick(s);
    expect(pick?.altCost).toBeUndefined();
  });

  it("policy altCost:'v1' recovers the legacy never-pay arm (the A/B probe's old side)", () => {
    const s = aiState({ hand: [FIERCE_GUARDIANSHIP], battlefield: [CMDR_PERM("aicmdr")] }); // unaffordable printed cost
    const pick = aiPick(s, { altCost: "v1" });
    expect(pick?.altCost).toBeUndefined(); // the alt action exists but the v1 arm never takes it
  });
});
