/**
 * playerReferent.test.js — "Destroy target creature. ITS CONTROLLER discards a card." (Nature's Claim,
 * Assassin's Strike, Vapor Snag, Last Breath, Clutch of the Undercity …).
 *
 * The permanent-referent family binds to the previous atom's target; this one PROJECTS off it — the
 * recipient is the target's CONTROLLER. The projection happens once at the bind site, so every player
 * payload resolver keeps seeing an ordinary {type:"player"} target and needed no change.
 *
 * ⚠️ "THAT PLAYER" IS DELIBERATELY NOT HANDLED HERE. atoms/cdmgDiscard.js already owns it as the
 * combat-damage referent. The first cut of this arm matched it too and the flip-diff read GAINED 15 /
 * LOST 17 — every "deals combat damage to a player, that player discards a card" specter went body-only.
 * The overlapping alternative was removed outright rather than reordered, so no ordering can bring it back.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const sorcery = (o) => ({ name: "C", type: "Sorcery", mana: "{1}{B}", oracle: o });

describe("player referent — parse", () => {
  it("emits the payload atom with a controller projection and no targetType", () => {
    const atoms = parseEffectClause("Destroy target creature. Its controller discards a card.", "Sorcery")?.atoms;
    expect(atoms).toHaveLength(2);
    expect(atoms[1]).toEqual({ op: "discard", amount: 1, who: "target", bindPreviousTargets: true, playerFrom: "controller" });
    expect(atoms[1].targetType).toBeUndefined();   // it must never enumerate a target of its own
  });

  it("covers the four player payloads, whichever parser gets there first", () => {
    // ⚠️ Asserts the OUTCOME, not the owner. After a DESTROY, "its controller loses N life" and
    // "… draws a card" are folded onto the destroy atom by the pre-existing controllerRider path, so this
    // arm never sees them; after a BOUNCE (Vapor Snag) there is no such rider and this arm does the work.
    // An earlier draft asserted atoms[1].op for all four and failed on exactly that difference — the
    // engine was right and the test was over-specified.
    for (const clause of [
      "Its controller discards a card.",
      "Its controller loses 2 life.",
      "Its controller gains 2 life.",
      "Its controller draws a card.",
    ]) {
      expect(classifyCard(sorcery(`Destroy target creature. ${clause}`))).toBe("native-spell");
    }
    // The bounce family, where this arm is the only path.
    expect(classifyCard(sorcery("Return target creature to its owner's hand. Its controller loses 1 life."))).toBe("native-spell");
  });

  it("⛔ a payload unmodeled for an EXPLICIT target player is refused here too", () => {
    // "Target player investigates." does not parse either, so inventing it for the referent would credit
    // a card for an effect nothing resolves.
    expect(classifyCard(sorcery("Destroy target creature. Its controller investigates."))).toBe("arbiter-spell");
  });

  it("⛔ refuses a referent with no antecedent", () => {
    expect(classifyCard(sorcery("Draw a card. Its controller discards a card."))).toBe("arbiter-spell");
  });

  it("⭐ REGRESSION GUARD: 'that player' still belongs to the combat-damage parser", () => {
    // This is the assertion that would have caught the LOST 17. If this arm ever widens to "that player"
    // again, every specter in the corpus goes body-only.
    expect(classifyCard({
      name: "Specter", type: "Creature — Specter", mana: "{2}{B}",
      oracle: "Flying\nWhenever this creature deals combat damage to a player, that player discards a card.",
    })).toBe("native-trigger");
  });
});

describe("⭐ ENFORCEMENT — the projection survives its own antecedent", () => {
  it("the DESTROYED creature's controller is the one who discards", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const victim = createPermanent({ id: "vic", card: { name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "", id: "cvic" }, controller: "ai" });
    const st = {
      ...s,
      players: {
        ...s.players,
        ai: { ...s.players.ai, battlefield: [victim], hand: [{ name: "A", type: "Instant", id: "h1" }, { name: "B", type: "Instant", id: "h2" }] },
      },
    };
    const program = parseEffectClause("Destroy target creature. Its controller discards a card.", "Sorcery");
    const out = runEffectProgram(st, {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        // The enumerator tags the chosen target with its controller; that is what the projection reads.
        targets: [{ type: "creature", id: "vic", controller: "ai", atomIndex: 0 }] } },
    });
    const after = out?.state ?? out;
    // The permanent is gone by the time the second atom runs — a board lookup would have found nothing,
    // which is exactly why the controller is read off the TARGET OBJECT.
    expect(after.players.ai.battlefield).toHaveLength(0);
    // A discard raises a CHOICE (the player picks the card), so the hand is not reduced synchronously.
    // The discriminating assertion is who the choice is addressed to: without the projection it would be
    // the spell's controller. An earlier draft asserted hand length and failed for that reason.
    expect(after.pendingChoice?.kind).toBe("discard");
    expect(after.pendingChoice?.controller).toBe("ai");
    expect(after.pendingChoice?.controller).not.toBe("user");
  });
});

describe("the real cards", () => {
  it("Nature's Claim and Vapor Snag are native", () => {
    // Oracle text from the bundled snapshot.
    expect(classifyCard({ name: "Nature's Claim", type: "Instant", mana: "{G}",
      oracle: "Destroy target artifact or enchantment. Its controller gains 4 life." })).toBe("native-spell");
    expect(classifyCard({ name: "Vapor Snag", type: "Instant", mana: "{U}",
      oracle: "Return target creature to its owner's hand. Its controller loses 1 life." })).toBe("native-spell");
  });
});
