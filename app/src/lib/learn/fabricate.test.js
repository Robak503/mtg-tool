/**
 * KW-FABRICATE (CR 702.111a) — "When this creature enters, put N +1/+1 counters on it OR create N 1/1
 * colorless Servo artifact creature tokens." A modal ETB choice, modeled in fabricate.js + wired into
 * enterPermanent (resolvers.js). Both branches are exercised here (correct P/T, real Servo tokens firing
 * their ETB watchers), the CR 616 doublers compose, and the full Marionette Apprentice flips native-trigger
 * — its aristocrat PiG drain fires when a creature/artifact dies under it. CREED near-misses: a card whose
 * OTHER text is unmodeled (Marionette Master) stays body-only; a non-keyword "fabricate" mention never fires.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseFabricate, decideFabricate, applyFabricateServos } from "./fabricate.js";
import * as fabricateMod from "./fabricate.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkLeavesTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const state0 = () => ({ ...createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }), turn: 3 });
const creatureCard = (name, oracle, p = 1, t = 2) => ({ id: `c-${name}`, name, type: "Creature — Human Artificer", power: p, toughness: t, oracle });
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];
const servosOf = (s, pid = "user") => s.players[pid].battlefield.filter((p) => /Servo/.test(String(p.card?.type || "")));

const FAB1 = "Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)";
const FAB3 = "Fabricate 3 (When this creature enters, put three +1/+1 counters on it or create three 1/1 colorless Servo artifact creature tokens.)";
const MAR_APP_ORACLE = `${FAB1}\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.`;

describe("KW-FABRICATE — parser (keyword-position anchored)", () => {
  it("reads N from the keyword line (1 and 3)", () => {
    expect(parseFabricate(creatureCard("A", FAB1))).toEqual({ n: 1 });
    expect(parseFabricate(creatureCard("B", FAB3))).toEqual({ n: 3 });
  });
  it("CREED: a non-keyword 'fabricate' mention mid-sentence never matches (no false-fire)", () => {
    // "Fabricate" only ever prints as its own keyword line; a mid-sentence mention (a hypothetical granting /
    // reference clause) is NOT preceded by a line/list boundary, so the anchor rejects it → null (no ETB effect).
    expect(parseFabricate(creatureCard("C", "You may fabricate a widget as this enters."))).toBeNull();
    expect(parseFabricate(creatureCard("D", "Flying"))).toBeNull();
  });
});

describe("KW-FABRICATE — engine: the COUNTERS branch (default choice) makes the source bigger from turn 1", () => {
  it("Marionette Apprentice (printed 1/2, Fabricate 1) enters as a 2/3 with one +1/+1 counter", () => {
    const s = enterPermanent(state0(), creatureCard("Marionette Apprentice", MAR_APP_ORACLE, 1, 2), "user");
    const perm = enteredPerm(s);
    expect(perm.counters["+1/+1"]).toBe(1);
    expect(permanentPower(s, perm.id)).toBe(2);
    expect(permanentToughness(s, perm.id)).toBe(3);
    // No Servo tokens on the default (counters) choice.
    expect(servosOf(s)).toHaveLength(0);
  });
  it("Fabricate 3 adds three counters (a 2/2 → 5/5)", () => {
    const s = enterPermanent(state0(), creatureCard("Marionette Master", FAB3, 2, 2), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(3);
  });
  it("CR 616: Doubling Season doubles the Fabricate counters (Fabricate 1 → two counters)", () => {
    let s = state0();
    const ds = createPermanent({ id: "ds", card: { id: "ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ds] } } };
    s = enterPermanent(s, creatureCard("Marionette Apprentice", MAR_APP_ORACLE, 1, 2), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(2);
  });
});

describe("KW-FABRICATE — engine: the SERVO branch mints real tokens firing ETB watchers", () => {
  it("applyFabricateServos mints N 1/1 colorless Servo artifact creature tokens", () => {
    let s = state0();
    // Put the source on the battlefield first (Servos are minted after the source enters).
    s = enterPermanent(s, creatureCard("Weaponcraft Enthusiast", FAB3, 1, 1), "user");
    const before = servosOf(s).length;
    s = applyFabricateServos(s, creatureCard("Weaponcraft Enthusiast", FAB3, 1, 1), "user");
    const servos = servosOf(s);
    expect(servos).toHaveLength(before + 3);
    for (const sv of servos) {
      expect(sv.card.power).toBe(1);
      expect(sv.card.toughness).toBe(1);
      expect(sv.card.token).toBe(true);
      expect(/Artifact Creature — Servo/.test(sv.card.type)).toBe(true);
    }
  });
  it("the Servo branch fires the token's ETB watcher (Impact Tremors) — proves the tokens really entered", () => {
    // Impact Tremors: "Whenever a creature you control enters, it deals 1 damage to each opponent." A Servo
    // entering must fire it (3 Servos → the watcher enqueues 3 times), proving the Servo ETB seam runs.
    let s = state0();
    const tremors = createPermanent({ id: "it", card: { id: "it", name: "Impact Tremors", type: "Enchantment", oracle: "Whenever a creature you control enters, it deals 1 damage to each opponent." }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, tremors] } } };
    s = applyFabricateServos(s, creatureCard("Weaponcraft Enthusiast", FAB3, 1, 1), "user");
    const fired = (s.pendingTriggers || []).filter((t) => /1 damage to each opponent/i.test(t.descriptor?.effectClause || ""));
    expect(fired).toHaveLength(3); // one per Servo
  });
  it("when decideFabricate is stubbed to 'servos', enterPermanent mints the Servos instead of counters", () => {
    const spy = vi.spyOn(fabricateMod, "decideFabricate").mockReturnValue("servos");
    try {
      // Re-require the resolver through the same module graph the spy patched. enterPermanent reads
      // decideFabricate at call time; the spy on the shared module object is honored.
      let s = enterPermanent(state0(), creatureCard("Weaponcraft Enthusiast", FAB3, 1, 1), "user");
      // The source itself has NO counters (the servo branch was taken)…
      const source = s.players.user.battlefield.find((p) => p.card?.name === "Weaponcraft Enthusiast");
      expect(source.counters["+1/+1"] || 0).toBe(0);
      // …and three Servos entered.
      expect(servosOf(s)).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("KW-FABRICATE — decision default", () => {
  it("decideFabricate defaults to the counters branch (deterministic, always-legal)", () => {
    expect(decideFabricate(state0(), "user", creatureCard("X", FAB1))).toBe("counters");
  });
});

describe("KW-FABRICATE — coverage: the full card flips native", () => {
  it("Marionette Apprentice (Fabricate 1 + aristocrat PiG drain) → native-trigger", () => {
    const card = { type: "Creature — Human Artificer", name: "Marionette Apprentice", mana: "{1}{B}", power: 1, toughness: 2, oracle: MAR_APP_ORACLE };
    expect(classifyCard(card)).toBe("native-trigger");
  });
  it("a bare Fabricate creature flips native-body; Fabricate + a covered keyword stays native-body", () => {
    expect(classifyCard({ type: "Creature — Aetherborn", name: "Ambitious Aetherborn", mana: "{3}{B}", power: 1, toughness: 4, oracle: FAB1 })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Beast", name: "Iron League Steed", mana: "{3}", power: 3, toughness: 3, oracle: `Haste\n${FAB1}` })).toBe("native-body");
  });
  it("CREED near-miss: Fabricate + an UNMODELED drain (Marionette Master's 'loses life equal to power') stays body-only", () => {
    // Master's PiG effect ("target opponent loses life equal to this creature's power") does NOT route native,
    // so even though Fabricate is now modeled, the card's OTHER text is unmodeled → body-only (a SAFE FN, CREED:
    // no over-claim on a card the engine can't fully resolve).
    const master = { type: "Creature — Construct", name: "Marionette Master", mana: "{5}{B}", power: 0, toughness: 4, oracle: `${FAB3}\nWhenever an artifact you control is put into a graveyard from the battlefield, target opponent loses life equal to this creature's power.` };
    expect(classifyCard(master)).toBe("body-only");
  });
});

describe("KW-FABRICATE — end-to-end: the aristocrat drain fires under Marionette Apprentice (whole card plays)", () => {
  it("a creature/artifact you control put into the graveyard fires 'each opponent loses 1 life'", () => {
    // Apprentice on the battlefield + a Servo it controls; the Servo dies → the PiG watcher fires.
    let s = state0();
    const app = createPermanent({ id: "app", card: { id: "capp", name: "Marionette Apprentice", type: "Creature — Human Artificer", power: 1, toughness: 2, oracle: MAR_APP_ORACLE }, controller: "user" });
    const servo = createPermanent({ id: "srv", card: { id: "csrv", name: "Servo", type: "Token Artifact Creature — Servo", power: 1, toughness: 1, token: true, oracle: "" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, app, servo] } } };
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "srv" });
    s = checkLeavesTriggers(s);
    const fired = (s.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/each opponent loses 1 life/i);
  });
  it("CREED: the detected trigger is the creature-or-artifact PiG watcher (self-excluding 'another')", () => {
    expect(detectTriggers({ name: "Marionette Apprentice", type: "Creature — Human Artificer", oracle: MAR_APP_ORACLE }).map((t) => t.scope)).toEqual(["creatureOrArtifactYouControlPiG"]);
  });
});
