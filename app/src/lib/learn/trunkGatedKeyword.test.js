/**
 * GATED-KEYWORD — "this creature has <keyword> as long as you control a/another/N <type>" (Markov Crusader
 * haste, Snapsail Glider flying, Expedition Skulker deathtouch…) now grants the keyword LIVE only while the
 * gate holds, in BOTH templating orders (suffix "… has X as long as Y" and prefix "As long as Y, … has X").
 * The same fix adds the prefix form to #301's P/T gate. Reuses parseControlGateSource + the shared
 * layers.gateMet. Only GRANTABLE keywords (the engine-enforced static set — menace is excluded) flip; a
 * non-keyword segment or a color/compound gate stays LOW (Arbiter).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function board(selfCard, others = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "self", card: selfCard, controller: "user" });
  const perms = [self, ...others.map((c, i) => createPermanent({ id: `o${i}`, card: c, controller: "user" }))];
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const cr = (oracle, type = "Creature — Beast", p = 2, t = 2) => ({ name: "Gated", type, power: p, toughness: t, oracle });

describe("GATED-KEYWORD — coverage flips (both forms)", () => {
  it("suffix + prefix grantable-keyword grants classify native", () => {
    expect(classifyCard({ type: "Creature — Vampire", name: "Markov Crusader", mana: "{3}{R}", oracle: "This creature has haste as long as you control another Vampire." })).toMatch(/^native/);
    expect(classifyCard({ type: "Creature — Thopter", name: "Snapsail Glider", mana: "{3}", oracle: "As long as you control an artifact, this creature has flying." })).toMatch(/^native/);
  });
  it("the prefix P/T form (which #301's suffix matcher missed) now also flips native", () => {
    expect(classifyCard({ type: "Creature — Construct", name: "Aerial Engineer", mana: "{4}", oracle: "As long as you control an artifact, this creature gets +2/+2." })).toMatch(/^native/);
  });
  it("a color / compound gate, a non-keyword segment, or a NON-grantable keyword (menace) stays body-only (CREED)", () => {
    expect(classifyCard({ type: "Creature — Soldier", name: "Color Gate", mana: "{2}{W}", oracle: "This creature has first strike as long as you control a white creature." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Beast", name: "Mixed Effect", mana: "{2}{G}", oracle: "This creature has trample and gets +1/+1 as long as you control a Forest." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Ape", name: "Summit Apes", mana: "{3}{R}", oracle: "As long as you control a Mountain, this creature has menace." })).toBe("body-only");
  });
});

describe("GATED-KEYWORD — layer: the keyword is live + gated", () => {
  it("grants the keyword only while the gating type is on the battlefield", () => {
    const oracle = "This creature has flying as long as you control a Mountain.";
    expect(permanentHasKeyword(board(cr(oracle, "Creature — Ape"), [{ name: "Mountain", type: "Basic Land — Mountain" }]), "self", "flying")).toBe(true);
    expect(permanentHasKeyword(board(cr(oracle, "Creature — Ape"), []), "self", "flying")).toBe(false);
  });
  it("prefix form grants identically", () => {
    const s = board(cr("As long as you control an artifact, this creature has flying.", "Creature — Construct"), [{ name: "Bauble", type: "Artifact" }]);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(true);
  });
  it("'another <type>' EXCLUDES the source: a lone Vampire gets no haste, a second turns it on", () => {
    const vamp = cr("This creature has haste as long as you control another Vampire.", "Creature — Vampire");
    expect(permanentHasKeyword(board(vamp, []), "self", "haste")).toBe(false);
    expect(permanentHasKeyword(board(vamp, [{ name: "Bat", type: "Creature — Vampire" }]), "self", "haste")).toBe(true);
  });
  it("the shared gate still drives the #301 P/T path via the prefix form", () => {
    const c = cr("As long as you control an artifact, this creature gets +2/+2.", "Creature — Beast", 2, 2);
    expect(permanentPower(board(c, [{ name: "Bauble", type: "Artifact" }]), "self")).toBe(4);
    expect(permanentPower(board(c, []), "self")).toBe(2);
  });
});
