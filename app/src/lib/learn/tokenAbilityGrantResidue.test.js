/**
 * tokenAbilityGrantResidue.test.js — the RESIDUE half of TK-1: "…create a <token>. It has "<ability>.""
 *
 * HALF THIS FEATURE WAS ALREADY BUILT, which is the whole story. TK-1 (2026-07-18) taught the trigger
 * detector to fold the "It has "…"" sentence into the trigger's effect, and splitClauses normalizes it to
 * the inline `with "…"` form, so the effect program parses HIGH and the trigger ROUTES NATIVELY. All of that
 * worked. What nobody told was `permanentTriggersCovered`'s RESIDUE check, which strips trigger sentences
 * anchored at the first period — so "It has "Sacrifice this token: Add {C}."" survived as apparent leftover
 * text and parked a card whose trigger was already fully modeled.
 *
 * The tell was a card that reported `triggerRoutesNatively === true` and `classifyCard === "body-only"` at
 * the same time. Those two disagreeing is always a whole-card gate, never a mechanic gap.
 *
 * WHY IT MATTERS BEYOND THE COUNT: TK-1's own comment records the bug it was written to fix — Eldrazi Scion
 * and Spawn tokens were being minted VANILLA, so "they could never be sacrificed for mana, and the AI never
 * ramped off them." The fold fixed the runtime; the residue check kept the metric from ever admitting it.
 *
 * +15 corpus. The strip is anchored to a QUOTED grant DIRECTLY following a token-creation clause — the same
 * FN-safe anchoring every sibling strip in that function uses.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

const drone = (oracle, over = {}) => ({
  name: "Drone", type: "Creature — Eldrazi Drone", mana: "{4}", power: "1", toughness: "1", keywords: [], oracle, ...over,
});
const SCION = 'When this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."';

describe("the two halves agreed all along — routing worked, the residue check did not", () => {
  it("the trigger ALWAYS routed natively (this half was never broken)", () => {
    const card = drone(SCION);
    const d = detectTriggers(card)[0];
    expect(d).toBeTruthy();
    expect(triggerRoutesNatively(d, card)).toBe(true);
  });

  it("its effect clause parses HIGH, grant folded in", () => {
    const d = detectTriggers(drone(SCION))[0];
    const p = parseEffectClause(d.effectClause, "Instant");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0].op).toBe("create-token");
    expect(p.atoms[0].tokenOracle).toMatch(/Sacrifice this token: Add \{C\}/);
  });

  it("…and NOW the card classifies native instead of parking on phantom residue", () => {
    expect(classifyCard(drone(SCION))).toMatch(/^native/);
  });
});

describe("both printed numbers of the grant", () => {
  it("singular 'It has'", () => {
    expect(classifyCard(drone(SCION))).toMatch(/^native/);
  });

  it("plural 'They have' (Dread Drone / Emrakul's Hatcher)", () => {
    expect(classifyCard(drone('When this creature enters, create two 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."'))).toMatch(/^native/);
  });

  it("a token carrying a TRIGGERED ability, not a mana one (the Devil family)", () => {
    expect(classifyCard(drone('When this creature enters, create a 1/1 red Devil creature token. It has "When this token dies, it deals 1 damage to any target."'))).toMatch(/^native/);
  });
});

describe("RUNTIME — the token really is minted WITH the ability", () => {
  it("the Scion enters carrying its sac-for-mana oracle, not as a vanilla body", () => {
    // This is the bug TK-1 was written for: a vanilla Scion can never be sacrificed for mana, so the AI
    // never ramps off it. Assert the minted permanent's own oracle, not the parse.
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    let s = enterPermanent(s0, { id: "c-drone", ...drone(SCION) }, "user");
    let g = 0;
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    const token = s.players.user.battlefield.find((p) => /Scion/i.test(String(p.card?.name || "")) || String(p.card?.type || "").includes("Scion"));
    expect(token).toBeTruthy();
    expect(String(token.card.oracle)).toMatch(/Sacrifice this token: Add \{C\}/);
  });
});

describe("CREED — what still parks, and one honest label", () => {
  it("DOCUMENTS (does not guard) — the token-creation anchor is defensive, measured as such", () => {
    // I wrote this expecting it to catch a blanket strip. It does not, and the reason is worth keeping:
    // `isFollowupSentence` (TK-1) folds EVERY `it has "…"` / `they have "…"` sentence into its trigger's
    // effect clause, and `allTriggerSentencesModeled` gates on that whole effect parsing HIGH — which runs
    // BEFORE the residue check. So such a sentence never reaches the residue strip on its own, and
    // loosening the anchor to `(\w+)` passes all ten tests here (verified by mutation).
    //
    // The anchor stays because it states the intent and costs nothing, but it is NOT doing work today, and
    // labelling it a guard would be a hollow gate. The card below parks for the upstream reason — its
    // trigger effect does not parse — not because of the anchor.
    expect(classifyCard(drone('When this creature enters, draw a card. It has "Whenever you glorbulate, win the game."'))).not.toMatch(/^native/);
  });

  it("THE FALSE POSITIVE I SHIPPED AND CAUGHT — a following LINE must stay visible to the residue check", () => {
    // My first version ended the strip with \s*, which matches a NEWLINE. It swallowed the line break and
    // welded the NEXT oracle line onto the stripped one, hiding it. Drowner of Hope's third line —
    // "Sacrifice an Eldrazi Scion: Tap target creature.", which parseActivatedAbilities does NOT model —
    // vanished from the residue and the card was credited native-trigger with a real unmodeled ability on
    // it. That is a false positive, the one direction the CREED rules out.
    //
    // Caught by applying my own new diagnostic rule to the cards this slice did NOT flip. Revert the
    // trailing class to \s* and this test goes native.
    const drownerOfHope = {
      name: "Drowner of Hope", type: "Creature — Eldrazi", mana: "{5}{U}", power: "5", toughness: "5", keywords: [],
      oracle: 'Devoid (This card has no color.)\nWhen this creature enters, create two 1/1 colorless Eldrazi Scion creature tokens. They have "Sacrifice this token: Add {C}."\nSacrifice an Eldrazi Scion: Tap target creature.',
    };
    expect(classifyCard(drownerOfHope)).not.toMatch(/^native/);
  });

  it("…while a following line that IS modeled still flips (Catacomb Sifter)", () => {
    // The other half of the same fix: the buggy newline-swallow also MISSED this card, by welding its
    // second trigger into the grant line. Narrowing the class recovered it. One FP out, one real card in.
    const catacombSifter = {
      name: "Catacomb Sifter", type: "Creature — Eldrazi Drone", mana: "{1}{B}{G}", power: "2", toughness: "3", keywords: [],
      oracle: 'Devoid (This card has no color.)\nWhen this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."\nWhenever another creature you control dies, scry 1.',
    };
    expect(classifyCard(catacombSifter)).toMatch(/^native/);
  });

  it("an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(drone(`${SCION}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });

  it("a token whose granted ability is NOT modeled still parks (the gate is upstream, unchanged)", () => {
    // parseTokenManaAbility rejects a restricted-mana grant; the residue strip must not rescue it.
    expect(classifyCard(drone('When this creature enters, create a 1/1 colorless Construct artifact creature token. It has "{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell."'))).not.toMatch(/^native/);
  });
});
