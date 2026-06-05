import { describe, expect, it } from "vitest";

import { checkLegal, colorIdentityIssues } from "./deckAnalytics";

// Minimal card-data fixtures shaped like the /api/cards publicCard payload the
// client stores in deckData (colorIdentity is the camelCase field).
const CARDS = {
  "Atraxa, Praetors' Voice": { colorIdentity: ["W", "U", "B", "G"], legalities: { commander: "legal" } },
  "Sol Ring": { colorIdentity: [], legalities: { commander: "legal" } },
  "Cyclonic Rift": { colorIdentity: ["U"], legalities: { commander: "legal" } },
  "Lightning Bolt": { colorIdentity: ["R"], legalities: { commander: "legal" } },
  "Lurrus of the Dream-Den": { colorIdentity: ["W", "B"], legalities: { commander: "legal" } },
  "Black Lotus": { colorIdentity: [], legalities: { commander: "banned" } },
};

describe("colorIdentityIssues", () => {
  it("returns [] when there is no commander", () => {
    const deck = [{ qty: 1, name: "Lightning Bolt", section: "Mainboard" }];
    expect(colorIdentityIssues(deck, CARDS)).toEqual([]);
  });

  it("returns [] when the commander's color identity hasn't resolved yet", () => {
    const deck = [
      { qty: 1, name: "Unknown General", section: "Commander" },
      { qty: 1, name: "Lightning Bolt", section: "Mainboard" },
    ];
    expect(colorIdentityIssues(deck, CARDS)).toEqual([]);
  });

  it("flags a card whose color identity falls outside the commander's", () => {
    const deck = [
      { qty: 1, name: "Atraxa, Praetors' Voice", section: "Commander" },
      { qty: 1, name: "Cyclonic Rift", section: "Mainboard" }, // U — in identity
      { qty: 1, name: "Lightning Bolt", section: "Mainboard" }, // R — off-color
    ];
    const issues = colorIdentityIssues(deck, CARDS);
    expect(issues).toEqual([{ name: "Lightning Bolt", offColors: ["R"] }]);
  });

  it("never flags colorless cards, the commander itself, or tokens", () => {
    const deck = [
      { qty: 1, name: "Lurrus of the Dream-Den", section: "Commander" }, // W/B
      { qty: 1, name: "Sol Ring", section: "Mainboard" },                // colorless — ok
      { qty: 1, name: "Lightning Bolt", section: "Tokens" },             // token — ignored
    ];
    expect(colorIdentityIssues(deck, CARDS)).toEqual([]);
  });

  it("skips cards that aren't resolved in cardData rather than guessing", () => {
    const deck = [
      { qty: 1, name: "Lurrus of the Dream-Den", section: "Commander" },
      { qty: 1, name: "Some Unsynced Card", section: "Mainboard" },
    ];
    expect(colorIdentityIssues(deck, CARDS)).toEqual([]);
  });
});

describe("checkLegal (regression coverage)", () => {
  it("flags banned/not_legal cards and ignores tokens", () => {
    const deck = [
      { qty: 1, name: "Black Lotus", section: "Mainboard" },
      { qty: 1, name: "Sol Ring", section: "Mainboard" },
    ];
    expect(checkLegal(deck, CARDS)).toEqual([{ name: "Black Lotus", status: "banned" }]);
  });
});
