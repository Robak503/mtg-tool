/**
 * twoSentenceFold.test.js — re-joining a sentence PAIR whose matcher spans both sentences.
 *
 * `matchOptionalDiscardPayment` / the sacrifice- and pay-payment siblings / the impulse-exile template are
 * all anchored `^…\. …$` ACROSS a sentence boundary. So the pair parsed when it WAS the whole text — the
 * matcher saw the undivided string — and shattered the moment anything preceded it, because then splitClauses
 * ran first and handed each half over separately. Neither half parses alone.
 *
 * ⭐ MEASURED HONESTLY: +1, not the 7 the census predicted. The fold makes the CLAUSES parse for all seven
 * two-sentence spells, but six of them still park because their PROGRAM is refused further downstream — an
 * optional/pausing atom composed with another atom is deliberately rejected (the α2 optional-scope
 * invariant). That is a separate, intentional CREED guard and is NOT loosened here. The one card that flips
 * reaches the fold through the TRIGGER path, where the pair is the whole effectClause.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";

describe("the fold re-joins exactly the pairs whose matcher spans two sentences", () => {
  it("you-may-discard + If-you-do", () => {
    expect(splitClauses("Deal 6 damage to target creature. You may discard a card. If you do, draw a card."))
      .toEqual(["Deal 6 damage to target creature", "You may discard a card. If you do, draw a card"]);
  });

  it("you-may-sacrifice + If-you-do (the shape that actually flips a card)", () => {
    expect(splitClauses("You may sacrifice an artifact. If you do, this creature deals 4 damage to any target"))
      .toEqual(["You may sacrifice an artifact. If you do, this creature deals 4 damage to any target"]);
  });

  it("impulse exile + its play window, in BOTH printed word orders", () => {
    expect(splitClauses("Target creature gets +3/+1 until end of turn. Exile the top card of your library. Until the end of your next turn, you may play that card."))
      .toEqual(["Target creature gets +3/+1 until end of turn", "Exile the top card of your library. Until the end of your next turn, you may play that card"]);
    expect(splitClauses("Exile the top two cards of your library. You may play them until the end of your next turn."))
      .toEqual(["Exile the top two cards of your library. You may play them until the end of your next turn"]);
  });
});

describe("⛔ CREED — the fold needs a MATCHING LEAD and cannot invent one", () => {
  it("a bare 'If you do' with no 'you may' before it stays an orphan", () => {
    // It means the card printed a conditional whose antecedent this splitter did not model. Folding it onto
    // an arbitrary predecessor would silently attach a payoff to the wrong action.
    expect(splitClauses("Draw a card. If you do, gain 3 life."))
      .toEqual(["Draw a card", "If you do, gain 3 life"]);
  });

  it("a play-window sentence after a NON-exile lead is not folded", () => {
    expect(splitClauses("Draw a card. Until the end of your next turn, you may play that card."))
      .toEqual(["Draw a card", "Until the end of your next turn, you may play that card"]);
  });

  it("an exile lead with a DIFFERENT count word is not folded (the matcher would reject it anyway)", () => {
    expect(splitClauses("Exile the top six cards of your library. Until the end of your next turn, you may play those cards."))
      .toEqual(["Exile the top six cards of your library", "Until the end of your next turn, you may play those cards"]);
  });
});

describe("the card this actually freed", () => {
  it("Kuldotha Flamefiend — its ETB pair reaches the fold through the trigger path", () => {
    expect(classifyCard({
      name: "Kuldotha Flamefiend", type: "Creature — Elemental", mana: "{4}{R}{R}", power: "4", toughness: "4",
      oracle: "When this creature enters, you may sacrifice an artifact. If you do, this creature deals 4 damage divided as you choose among any number of targets.",
    })).toMatch(/^native/);
  });

  it("⚠️ and the six that still park — the program guard, not the splitter", () => {
    // Their clauses now all parse; the PROGRAM is still refused because an optional/pausing atom composed
    // with another atom is deliberately rejected. Pinned so the distinction survives: if these ever flip,
    // that guard moved and needs its own proof.
    expect(classifyCard({
      name: "Incinerating Blast", type: "Sorcery", mana: "{4}{R}",
      oracle: "Incinerating Blast deals 6 damage to target creature.\nYou may discard a card. If you do, draw a card.",
    })).not.toMatch(/^native/);
  });
});
