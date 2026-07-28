/**
 * gyExile.test.js — GY-EXILE: "exile target card from a graveyard" (Coffin Purge, Cremate, Beckon
 * Apparition, the modal Return to Nature, and graveyard-hate permanents Withered Wretch / Crypt Creeper /
 * Steamclaw as an activated ability). A new exile-from-graveyard atom over moveCardToZone: the target is a
 * card in ANY player's graveyard (anyGraveyard → enumerate every graveyard, each candidate stamped with its
 * owner), moved graveyard → exile. CREED: "up to N" / a type filter / "your graveyard" / a whole-graveyard
 * exile all fail the exact anchor → Arbiter.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { applyExileFromGraveyard } from "./effects/atoms/zones.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const S = (name, oracle, type = "Instant", mana = "{B}") => ({ name, oracle, type, keywords: [], mana });

describe("gy-exile — recognition + coverage", () => {
  it("'exile target card from a graveyard' parses to the exile-from-graveyard atom (anyGraveyard)", () => {
    expect(parseEffectProgram(S("Coffin Purge", "Exile target card from a graveyard.")).atoms)
      .toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" }]);
  });
  it("flips native across spell / multi-clause / modal / activated contexts", () => {
    expect(classifyCard(S("Coffin Purge", "Exile target card from a graveyard."))).toBe("native-spell");
    expect(classifyCard(S("Cremate", "Exile target card from a graveyard.\nDraw a card."))).toBe("native-spell");
    expect(classifyCard(S("Shadowfeed", "Exile target card from a graveyard. You gain 3 life."))).toBe("native-spell");
    expect(classifyCard(S("Return to Nature", "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard."))).toBe("native-spell");
    expect(classifyCard(S("Withered Wretch", "{1}: Exile target card from a graveyard.", "Creature — Zombie Cleric", "{1}{B}"))).toBe("native-activated");
  });
  it("CREED: an unanchored count / a type filter stay non-native", () => {
    // (Scarab Feast's "up to three … from a single graveyard" graduated in BLITZ GX-1 — the subset
    // machinery + the singleGraveyard constraint, pinned in gyExileUpToThree.test.js. The near-miss
    // intent lives on via the unanchored count and the other variants.)
    //
    // ("Exile target player's graveyard." GRADUATED the same way — the whole-ZONE exile atom
    // (exile-graveyard) now models it, pinned with its runtime moves in exileGraveyardZone.test.js.
    // It was never a safety pin: it marked the single-CARD slice's scope boundary, exactly as the
    // Scarab Feast line above did before its machinery landed. The FILTERED whole-zone wordings
    // ("exile all creature cards from all graveyards") are still refused, and that refusal is pinned
    // in the new file — so the over-apply this line guarded against remains unreachable.)
    expect(programConfidence(parseEffectProgram(S("Two Probe", "Exile up to two target cards from a single graveyard.")))).toBe("low"); // only the printed three-count is anchored
    expect(programConfidence(parseEffectProgram(S("Filtered", "Exile target creature card from a graveyard.")))).toBe("low"); // type filter — not bare "card"
  });
});

describe("gy-exile — enumeration (any graveyard) + resolver", () => {
  function gyState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, graveyard: [{ id: "u1", name: "Mine A", type: "Creature" }, { id: "tok", name: "Token", type: "Creature", token: true }] },
        ai: { ...s.players.ai, graveyard: [{ id: "a1", name: "Theirs B", type: "Sorcery" }] },
      },
    };
  }
  it("anyGraveyard enumerates cards from EVERY graveyard, each stamped with its owner (tokens excluded)", () => {
    const targets = enumerateTargets(gyState(), "user", { op: "exile-from-graveyard", targetType: "graveyardCard", anyGraveyard: true, cardFilter: "any" });
    expect(targets.map((t) => `${t.id}:${t.controller}`).sort()).toEqual(["a1:ai", "u1:user"]); // both GYs; the token is not a card
  });
  it("a plain return-from-graveyard (no anyGraveyard) still enumerates ONLY the caster's graveyard (no regression)", () => {
    const targets = enumerateTargets(gyState(), "user", { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any" });
    expect(targets.map((t) => t.id)).toEqual(["u1"]); // controller-only
  });
  it("resolver moves the chosen card from its OWNER's graveyard to exile (an opponent's card)", () => {
    const s = gyState();
    const out = applyExileFromGraveyard(s, { op: "exile-from-graveyard" }, { controller: "user", targets: [{ type: "graveyardCard", id: "a1", controller: "ai" }] });
    expect(out.players.ai.graveyard.find((c) => c.id === "a1")).toBeUndefined(); // left the AI graveyard
    expect(out.players.ai.exile?.some((c) => c.id === "a1")).toBe(true);          // now in exile
    expect(out.players.user.graveyard.find((c) => c.id === "u1")).toBeDefined();  // caster's own GY untouched
  });
  it("a target that already left its graveyard is a logged no-op (CR 608.2b)", () => {
    const s = gyState();
    const out = applyExileFromGraveyard(s, { op: "exile-from-graveyard" }, { controller: "user", targets: [{ type: "graveyardCard", id: "gone", controller: "ai" }] });
    expect(out.players.ai.graveyard.length).toBe(1); // unchanged
  });
});
