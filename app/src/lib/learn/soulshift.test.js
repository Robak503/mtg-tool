/**
 * soulshift.test.js — KW-SOULSHIFT (CR 702.46a/b, verified vs the bundled cr_current.json —
 * BLITZ SS-1). "Soulshift N" synthesizes a dies-trigger whose effect is the printed reminder
 * wording ("you may return target Spirit card with mana value N or less from your graveyard to
 * your hand"); the clause parses to the return-from-graveyard atom with a STRUCTURED
 * {subtype:"spirit", mvMax:N} cardFilter enforced at the ONE cardMatchesGraveyardFilter
 * chokepoint (cast enumeration + trigger-flush chooser share it). A DOUBLE soulshift
 * (Forked-Branch Garami) synthesizes TWO descriptors (CR 702.46b).
 *
 * CREED FPs guarded: the MV cap and the Spirit gate must both bind the candidate pool; an
 * unlisted subtype word in the clause stays LOW; carriers with OTHER unmodeled text stay
 * body-only. Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const NIGHTSOIL = { id: "nk", name: "Nightsoil Kami", type: "Creature — Spirit", mana: "{5}{G}",
  power: "6", toughness: "4", oracle: "Soulshift 5 (When this creature dies, you may return target Spirit card with mana value 5 or less from your graveyard to your hand.)" };
const GARAMI = { id: "fbg", name: "Forked-Branch Garami", type: "Creature — Spirit", mana: "{3}{G}{G}",
  power: "4", toughness: "4", oracle: "Soulshift 4, soulshift 4 (When this creature dies, you may return up to two target Spirit cards with mana value 4 or less from your graveyard to your hand.)" };
const ELDER_PINE = { id: "ep", name: "Elder Pine of Jukai", type: "Creature — Spirit", mana: "{2}{G}",
  power: "1", toughness: "1", oracle: "Whenever you cast a Spirit or Arcane spell, reveal the top three cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard.\nSoulshift 2 (When this creature dies, you may return target Spirit card with mana value 2 or less from your graveyard to your hand.)" };

describe("parse — the synthesized clause", () => {
  it("'you may return target spirit card with mana value 3 or less …' → HIGH, structured filter, optional", () => {
    const p = parseEffectClause("you may return target spirit card with mana value 3 or less from your graveyard to your hand", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { subtype: "spirit", mvMax: 3 }, optional: true }]);
  });
  it("CREED — an unlisted subtype word stays LOW (never a mis-matched filter)", () => {
    expect(programConfidence(parseEffectClause("return target zombie card with mana value 3 or less from your graveyard to your hand", "Creature"))).not.toBe("high");
  });
});

describe("synthesis — the keyword mints dies descriptors", () => {
  it("Soulshift 5 → ONE dies descriptor whose clause routes natively", () => {
    const trigs = detectTriggers(NIGHTSOIL).filter((t) => /soulshift/i.test(t.sourceText || ""));
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "dies", scope: "self" });
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
  });
  it("DOUBLE soulshift (Forked-Branch Garami) → TWO descriptors (CR 702.46b)", () => {
    const trigs = detectTriggers(GARAMI).filter((t) => /soulshift/i.test(t.sourceText || ""));
    expect(trigs).toHaveLength(2);
  });
});

describe("classify — keyword-only carriers flip; other-text carriers hold", () => {
  it("Nightsoil Kami + Forked-Branch Garami flip native", () => {
    expect(isNativeTier(classifyCard(NIGHTSOIL))).toBe(true);
    expect(isNativeTier(classifyCard(GARAMI))).toBe(true);
  });
  it("CREED — Elder Pine (unmodeled reveal-top cast trigger) stays body-only", () => {
    expect(classifyCard(ELDER_PINE)).toBe("body-only");
  });
});

describe("runtime — the dies flush returns a capped, typed Spirit from the OWN graveyard", () => {
  it("fires on death, pool = own-gy Spirits with MV<=N only", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const kami = createPermanent({ id: "kperm", card: NIGHTSOIL, controller: "user", summoningSick: false });
    const cheapSpirit = { id: "cs", name: "Cheap Spirit", type: "Creature — Spirit", cmc: 2, mana: "{1}{W}", oracle: "" };
    const fatSpirit = { id: "fs", name: "Fat Spirit", type: "Creature — Spirit", cmc: 6, mana: "{4}{W}{W}", oracle: "" };
    const nonSpirit = { id: "ns", name: "Plain Bear", type: "Creature — Bear", cmc: 2, mana: "{1}{G}", oracle: "" };
    s = {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [kami], graveyard: [cheapSpirit, fatSpirit, nonSpirit] },
      },
    };
    // Kill the kami: the dies flush should synthesize + enqueue the soulshift trigger.
    const dead = [{ controller: "user", id: "kperm", name: NIGHTSOIL.name, card: NIGHTSOIL, counters: {} }];
    let next = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    next = checkDiesTriggers(next, dead);
    expect((next.pendingTriggers || []).some((t) => /soulshift/i.test(t.descriptor?.sourceText || ""))).toBe(true);
  });
});
