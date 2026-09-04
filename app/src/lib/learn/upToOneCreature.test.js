/**
 * upToOneCreature.test.js — ④-AQ (2026-09-04 night): "UP TO ONE target creature …" on the creature lane — Plunge into Winter
 * "Tap up to one target creature", War Machine / Baseball Bat (attack triggers), Nebelgast Intruder "up to one target
 * creature an opponent controls gets -2/-0", Moonsnare Specialist / Spider-Man 2099 "return up to one target creature to
 * its owner's hand", Key to the City "up to one target creature can't be blocked" — 21 flipped. CR 601.2c: the caster may
 * choose zero. The permanent lane already stamped minTargets:0 / maxTargets:1 and the expanders honor it for any target
 * type; the creature arms never learned the count word. The peel in parseClauseToAtom reads it off, parses the reduced
 * clause, and stamps the same marker on a plain single-target creature atom. Real oracle fixtures (bundled Scryfall
 * snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PLUNGE = { id: "h-pw", name: "Plunge into Winter", type: "Instant", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Tap up to one target creature. Scry 1, then draw a card." };
const NEBELGAST = { id: "c-ni", name: "Nebelgast Intruder", type: "Creature — Spirit", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, power: 2, toughness: 1, keywords: ["Flash", "Flying"],
  oracle: "Flash\nFlying\nWhen this creature enters, up to one target creature an opponent controls gets -2/-0 until end of turn." };
const WAR_MACHINE = { id: "c-wm", name: "War Machine, James Rhodes", type: "Legendary Artifact Creature — Human Hero", mana: "{3}{W/U}", cmc: 4, power: 3, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nWhenever War Machine attacks, tap up to one target creature." };
const MOONSNARE = { id: "c-ms", name: "Moonsnare Specialist", type: "Creature — Human Ninja", mana: "{3}{U}", cmc: 4, power: 3, toughness: 2, keywords: ["Ninjutsu"],
  oracle: "Ninjutsu {2}{U}\nWhen this creature enters, return up to one target creature to its owner's hand." };

const bear = (id, name, controller) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
function mainPhase(hand, userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: userPerms, library: [{ id: "lib1", name: "Lib1", type: "Instant", cmc: 1, keywords: [], oracle: "" }, { id: "lib2", name: "Lib2", type: "Instant", cmc: 1, keywords: [], oracle: "" }], manaPool: { W: 1, U: 3, B: 0, R: 0, G: 0, C: 1 } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}

describe("the parse", () => {
  it("⭐ 'up to one target creature' peels off and stamps the zero-or-one marker on the creature arms; 'up to two' keeps its own count", () => {
    expect(parseEffectClause("Tap up to one target creature.", "Instant").atoms[0]).toMatchObject({ op: "tap", targetType: "creature", minTargets: 0, maxTargets: 1 });
    expect(parseEffectClause("Exile up to one target creature.", "Instant").atoms[0]).toMatchObject({ op: "exile", targetType: "creature", minTargets: 0, maxTargets: 1 });
    expect(parseEffectClause("Return up to one target creature to its owner's hand.", "Instant").atoms[0]).toMatchObject({ op: "bounce", minTargets: 0, maxTargets: 1 });
    expect(parseEffectClause("Up to one target creature gets -2/-2 until end of turn.", "Instant").atoms[0]).toMatchObject({ op: "pump", minTargets: 0, maxTargets: 1 });
    expect(parseEffectClause("Tap up to one target creature defending player controls.", "Instant").atoms[0])
      .toMatchObject({ op: "tap", restrictions: [{ kind: "controller", who: "defendingPlayer" }], minTargets: 0, maxTargets: 1 });
    expect(parseEffectClause("Tap up to two target creatures.", "Instant").atoms[0]).toMatchObject({ op: "tap", minTargets: 0, maxTargets: 2 });
    // ⛔ the marker lands ONLY on a creature-targeting atom: "up to one target creature CARD from a graveyard" matches the
    // same words but reduces to a graveyardCard atom — that lane's zero-or-one is its own slice (its expander unverified
    // here), so it stays parked rather than credited on a guess
    expect(parseEffectClause("Exile up to one target creature card from a graveyard.", "Instant")?.atoms || []).toEqual([]);
  });

  it("the tiers", () => {
    expect(classifyCard(PLUNGE)).toBe("native-spell");
    expect(classifyCard(NEBELGAST)).toBe("native-trigger");
    expect(classifyCard(WAR_MACHINE)).toBe("native-trigger");
    expect(classifyCard(MOONSNARE)).toBe("native-trigger");
  });
});

describe("runtime — zero or one", () => {
  it("⭐ Plunge into Winter offers the zero-target cast AND one cast per creature; the one-target cast taps it, the zero-target cast taps nothing", () => {
    const s = mainPhase([PLUNGE], [bear("mine", "Mine", "user")], [bear("theirs", "Theirs", "ai")]);
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-pw");
    expect(casts.map((a) => (a.targets || []).map((t) => t.id).join("+") || "(none)").sort()).toEqual(["(none)", "mine", "theirs"]);
    // (the "Scry 1, then draw a card" tail pauses on the scry choice — a separate, shipped mechanism; the pin here is the tap)
    const resolved = resolveTopOfStack(dispatchAction(s, casts.find((a) => a.targets?.[0]?.id === "theirs")));
    expect(resolved.players.ai.battlefield.find((p) => p.id === "theirs").tapped).toBe(true);
    const none = resolveTopOfStack(dispatchAction(s, casts.find((a) => !(a.targets || []).length)));
    expect(none.players.ai.battlefield.find((p) => p.id === "theirs").tapped).toBe(false);
    expect(none.players.user.battlefield.find((p) => p.id === "mine").tapped).toBe(false);
  });

  it("⭐ an ETB 'up to one' with NOTHING to target still resolves cleanly (Nebelgast Intruder into an empty board)", () => {
    const s = mainPhase([NEBELGAST], [], []);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-ni");
    expect(cast).toBeTruthy();
    let st = resolveTopOfStack(dispatchAction(s, cast));
    for (let i = 0; i < 6 && st.stack?.length; i++) st = resolveTopOfStack(st);
    expect(st.players.user.battlefield.some((p) => p.card?.name === "Nebelgast Intruder")).toBe(true);
    expect(st.stack?.length || 0).toBe(0);
  });
});
