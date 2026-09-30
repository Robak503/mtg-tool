/**
 * auraKeywordLineResidue.test.js — AURA SELF-KEYWORD / cost-only keyword residue lines (BLITZ TS-1).
 *
 * Three keyword lines printed on an AURA itself were counted as residue and parked otherwise fully-modeled
 * cards; each is admitted only where the runtime already enforces (or safely never needs) it:
 *   • "Flash" on a GRANT aura (Oblivion Crown / Talons of Falkenrath) — the FA-1 admit auraResidueClauses
 *     already made for the pump lane, mirrored into isNativeActivatedGrantAura: a cast-TIMING keyword; the
 *     engine hard-casts at sorcery speed (a strictly-legal timing subset, never a wrong resolution).
 *   • "Cycling {cost}" (CR 702.29a — Savage Hunger / Sicken / Improvised Armor / Sigil of the Nayan Gods
 *     in the pump lane; Footfall Crater in the grant lane): a HAND-zone alternative action the runtime
 *     already offers for ANY card type (actionsCycleFromHand is type-agnostic); vacuous on the battlefield.
 *   • "Cumulative upkeep {cost}" (CR 702.24 — Mystic Might): the keyword's SYNTHESIZED upkeep trigger fires
 *     through checkStepTriggers on any battlefield permanent (an Aura included) and the pay-or-sacrifice
 *     atom sacrifices the Aura (the grant lifts with the attachment). Admitted ONLY when the synthesized
 *     descriptor routes natively — the same shared gate the runtime flush uses.
 *   • "Shroud" on the Aura itself (Diplomatic Immunity): enforced at the canBeTargetedBy chokepoint
 *     (permanentHasKeyword reads printed keywords of any permanent type) — the equipment gate's
 *     SELF-KEYWORD precedent (Mithril Coat).
 *
 * CREED: every admit is line-anchored; a rider, a typecycling line, a "when you cycle" trigger, or a
 * {X}/hybrid cumulative-upkeep cost stays residue → the card parks (safe FN, never a partial model).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram, resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real oracle texts (bundled Scryfall, probed 2026-07-17).
const OBLIVION_CROWN = { name: "Oblivion Crown", type: "Enchantment — Aura", mana: "{1}{B}", oracle: 'Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature has "Discard a card: This creature gets +1/+1 until end of turn."' };
const TALONS_OF_FALKENRATH = { name: "Talons of Falkenrath", type: "Enchantment — Aura", mana: "{1}{R}", oracle: 'Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature has "{1}{R}: This creature gets +2/+0 until end of turn."' };
const FOOTFALL_CRATER = { name: "Footfall Crater", type: "Enchantment — Aura", mana: "{R}", oracle: 'Enchant land\nEnchanted land has "{T}: Target creature gains trample and haste until end of turn."\nCycling {1} ({1}, Discard this card: Draw a card.)' };
const MYSTIC_MIGHT = { name: "Mystic Might", type: "Enchantment — Aura", mana: "{2}{U}", oracle: 'Enchant land you control\nCumulative upkeep {1}{U} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nEnchanted land has "{T}: Target creature gets +2/+2 until end of turn."' };
const SAVAGE_HUNGER = { name: "Savage Hunger", type: "Enchantment — Aura", mana: "{1}{G}", oracle: "Enchant creature\nEnchanted creature gets +1/+0 and has trample.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const SICKEN = { name: "Sicken", type: "Enchantment — Aura", mana: "{B}", oracle: "Enchant creature\nEnchanted creature gets -1/-1.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const IMPROVISED_ARMOR = { name: "Improvised Armor", type: "Enchantment — Aura", mana: "{3}{W}", oracle: "Enchant creature\nEnchanted creature gets +2/+5.\nCycling {3} ({3}, Discard this card: Draw a card.)" };
const SIGIL_OF_THE_NAYAN_GODS = { name: "Sigil of the Nayan Gods", type: "Enchantment — Aura", mana: "{1}{G}{W}", oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each creature you control.\nCycling {G/W} ({G/W}, Discard this card: Draw a card.)" };
const DIPLOMATIC_IMMUNITY = { name: "Diplomatic Immunity", type: "Enchantment — Aura", mana: "{1}{U}", oracle: "Enchant creature\nShroud (A permanent with shroud can't be the target of spells or abilities.)\nEnchanted creature has shroud." };
// FN guards — real cards that must stay parked.
const LINGERING_MIRAGE = { name: "Lingering Mirage", type: "Enchantment — Aura", mana: "{1}{U}", oracle: "Enchant land\nEnchanted land is an Island.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const OBLIVION_CROWN_TRIGGER_TWIST = { name: "Cycle Watcher", type: "Enchantment — Aura", mana: "{1}{R}", oracle: 'Enchant creature\nEnchanted creature gets +1/+0 and has trample.\nCycling {2}\nWhen you cycle this card, draw a card.' };

describe("recognition — the nine flips (audited GAINED set, tier-fingerprint 2026-07-17)", () => {
  it("Flash grant auras → native-activated (FA-1 mirrored into the grant gate)", () => {
    expect(classifyCard(OBLIVION_CROWN)).toBe("native-activated");
    expect(classifyCard(TALONS_OF_FALKENRATH)).toBe("native-activated");
  });
  it("Cycling grant aura (enchant land) → native-activated: Footfall Crater", () => {
    expect(classifyCard(FOOTFALL_CRATER)).toBe("native-activated");
  });
  it("Cumulative upkeep {1}{U} grant aura → native-activated: Mystic Might", () => {
    expect(classifyCard(MYSTIC_MIGHT)).toBe("native-activated");
  });
  it("Cycling pump auras → native-aura: Savage Hunger / Sicken / Improvised Armor / Sigil of the Nayan Gods", () => {
    expect(classifyCard(SAVAGE_HUNGER)).toBe("native-aura");
    expect(classifyCard(SICKEN)).toBe("native-aura");
    expect(classifyCard(IMPROVISED_ARMOR)).toBe("native-aura");
    expect(classifyCard(SIGIL_OF_THE_NAYAN_GODS)).toBe("native-aura");
  });
  it("Self-shroud aura → native-aura: Diplomatic Immunity", () => {
    expect(classifyCard(DIPLOMATIC_IMMUNITY)).toBe("native-aura");
  });
});

describe("recognition — FN guards (CREED: the admits are line-anchored and never widen)", () => {
  it("Lingering Mirage (cycling + an unmodeled type-change) stays body-only — the cycling admit lifts only its own line", () => {
    expect(classifyCard(LINGERING_MIRAGE)).toBe("body-only");
  });
  // GRADUATED (shelf D6, 2026-09-30): "When you cycle this card, draw a card." is a MODELED trigger now (cycleSelf — fired by
  // applyCycle, cycling offered only when it routes), so the plain twist is honestly native; the residue guard moves to a
  // cycle trigger that is still unmodeled ("cycle OR DISCARD" is not the cycleSelf event).
  it("a 'when you cycle or discard' TRIGGER is its own residue line → the card stays body-only", () => {
    expect(classifyCard({ ...OBLIVION_CROWN_TRIGGER_TWIST, oracle: OBLIVION_CROWN_TRIGGER_TWIST.oracle.replace("When you cycle this card,", "When you cycle or discard this card,") })).toBe("body-only");
    expect(classifyCard(OBLIVION_CROWN_TRIGGER_TWIST)).toMatch(/^native/);
  });
  it("typecycling is NOT the plain form → residue → body-only", () => {
    expect(classifyCard({ ...SAVAGE_HUNGER, name: "Typecycler", oracle: SAVAGE_HUNGER.oracle.replace(/Cycling \{2\}[^\n]*/, "Islandcycling {2}") })).toBe("body-only");
  });
  it("a {X} cumulative upkeep routes LOW → residue → body-only", () => {
    expect(classifyCard({ ...MYSTIC_MIGHT, name: "X Upkeep", oracle: MYSTIC_MIGHT.oracle.replace("Cumulative upkeep {1}{U}", "Cumulative upkeep {X}") })).toBe("body-only");
  });
  it("a bare unmodeled self-keyword line is still residue (the allowlist is flash/cycling/cum-upkeep/shroud only)", () => {
    expect(classifyCard({ ...DIPLOMATIC_IMMUNITY, name: "Phasing Crown", oracle: DIPLOMATIC_IMMUNITY.oracle.replace(/Shroud \([^)]*\)/, "Phasing") })).toBe("body-only");
  });
});

describe("runtime — each admitted line is enforced (or safely vacuous) where it lives", () => {
  function mainPhase(mut) {
    const filler = Array.from({ length: 10 }, (_, i) => ({ name: `Filler ${i}`, type: "Instant", oracle: "" }));
    const base = createGameState({ userDeck: filler, aiDeck: [] });
    const s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
    return mut ? mut(s) : s;
  }

  it("Cycling an AURA from hand: actionsCycleFromHand offers it; the cycle discards + draws", () => {
    const s = mainPhase((st) => ({
      ...st,
      players: { ...st.players, user: { ...st.players.user, hand: [{ id: "au", ...FOOTFALL_CRATER }], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } },
    }));
    const cyc = legalActionsForPlayer(s, "user").find((a) => a.kind === "cycle" && a.cardId === "au");
    expect(cyc).toBeTruthy();
    let d = dispatchAction(s, cyc);
    expect(d.players.user.hand.map((c) => c.id)).not.toContain("au"); // the discard is paid at activation (CR 602.2b)
    expect(d.players.user.graveyard.map((c) => c.id)).toContain("au");
    d = resolveTopOfStack(d); // the "Draw a card" resolves off the stack
    expect(d.players.user.hand).toHaveLength(1); // drew
  });

  it("Cumulative upkeep on an ATTACHED aura: decline → the Aura sacrifices itself and the grant lifts", () => {
    const land = createPermanent({ id: "land", card: { name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }, controller: "user" });
    const aura = createPermanent({ id: "aura", card: { id: "c-aura", ...MYSTIC_MIGHT }, controller: "user" });
    aura.attachedTo = "land"; land.attachments = ["aura"];
    const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const s = mainPhase((st) => ({
      ...st,
      players: { ...st.players, user: { ...st.players.user, battlefield: [land, aura, bear], manaPool: { W: 0, U: 9, B: 0, R: 0, G: 0, C: 9 } } },
    }));
    // The granted targeted pump enumerates on the LAND while the Aura sits there.
    const before = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "land");
    expect(before.length).toBeGreaterThan(0);
    // Fire the synthesized cumulative-upkeep atom on the AURA (the checkStepTriggers → flush path's payload).
    const atom = parseEffectClause("cumulative upkeep {1}{U}", "Enchantment", { hasX: false }).atoms[0];
    const paused = runEffectProgram(s, { source: { name: "Mystic Might" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [], sourceId: "aura" } } });
    expect(paused.pendingChoice?.kind).toBe("sac-unless-pay");
    const sacked = resolveSacUnlessPayChoice(paused, false); // decline → sacrifice the Aura
    expect(sacked.players.user.battlefield.map((p) => p.id)).not.toContain("aura");
    expect(sacked.players.user.graveyard.map((c) => c.id)).toContain("c-aura");
    const after = legalActionsForPlayer(sacked, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "land");
    expect(after).toHaveLength(0); // the grant lifted with the attachment
  });

  it("Shroud printed on the Aura itself: the canBeTargetedBy chokepoint refuses to target it", () => {
    const crea = createPermanent({ id: "crea", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: DIPLOMATIC_IMMUNITY, controller: "user" });
    aura.attachedTo = "crea"; crea.attachments = ["aura"];
    const s = mainPhase((st) => ({
      ...st,
      players: { ...st.players, user: { ...st.players.user, battlefield: [crea, aura] } },
    }));
    expect(canBeTargetedBy(s, aura, "user", "ai")).toBe(false);   // the Aura's own printed Shroud
    expect(canBeTargetedBy(s, crea, "user", "ai")).toBe(false);   // the granted shroud on the host (layer 6)
  });
});
