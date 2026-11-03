/**
 * THE COUNTED COMBAT PREVENTION — the play-weighted program.
 *   Inkshield (EDHREC #784): "Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way,
 *     create a 2/1 white and black Inkling creature token with flying."
 *   Druid's Deliverance (#3945, twin): "Prevent all combat damage that would be dealt to you this turn. Populate."
 *
 * A combat-only shield on the caster (the PV-1 "you" shield — Riot Control's — consumed only by the combat damage step), and for
 * Inkshield a token per 1 damage it prevents, made as the damage is prevented (CR 615.5: the prevention effect does it — no trigger).
 * Its ruling: "If multiple damage prevention effects would apply to combat damage that would be dealt to you, you get to choose the
 * order the prevention effects are applied in." (CR 616.1) — its controller takes it after every increase and before every other
 * prevention, the order that makes the most tokens; no order deals any damage. "Combat damage can't be prevented" (Frenzied Baloth,
 * CR 615.12) leaves it nothing to prevent.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const INKSHIELD = {"name":"Inkshield","type":"Instant","mana":"{3}{W}{B}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["B","W"],"oracle":"Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying."};
const DELIVERANCE = {"name":"Druid's Deliverance","type":"Instant","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"keywords":["Populate"],"colors":["G"],"oracle":"Prevent all combat damage that would be dealt to you this turn. Populate. (Create a token that's a copy of a creature token you control.)"};
const COMEUPPANCE = {"name":"Comeuppance","type":"Instant","mana":"{3}{W}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Prevent all damage that would be dealt to you and planeswalkers you control this turn by sources you don't control. If damage from a creature source is prevented this way, Comeuppance deals that much damage to that creature. If damage from a noncreature source is prevented this way, Comeuppance deals that much damage to any target."};
const RIOT_CONTROL = {"name":"Riot Control","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt to you this turn."};
const DEFEND = {"name":"Defend the Hearth","type":"Instant","mana":"{1}{G}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Prevent all combat damage that would be dealt to players this turn."};
const EMANCIPATION = {"name":"Fiery Emancipation","type":"Enchantment","mana":"{3}{R}{R}{R}","cmc":6,"power":null,"toughness":null,"keywords":["Triple"],"colors":["R"],"oracle":"If a source you control would deal damage to a permanent or player, it deals triple that damage to that permanent or player instead."};
const BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"power":"3","toughness":"2","keywords":["Haste","Trample"],"colors":["G"],"oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented."};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const ARCHERS = {"name":"Elvish Archers","type":"Creature — Elf Archer","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":["First strike"],"colors":["G"],"oracle":"First strike"};
const DREADMAW = {"name":"Colossal Dreadmaw","type":"Creature — Dinosaur","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample"],"colors":["G"],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"};
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const TORBRAN = {"name":"Torbran, Thane of Red Fell","type":"Legendary Creature — Dwarf Noble","mana":"{1}{R}{R}{R}","cmc":4,"power":"2","toughness":"4","keywords":[],"colors":["R"],"oracle":"If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead."};
const FURNACE = {"name":"Furnace of Rath","type":"Enchantment","mana":"{1}{R}{R}{R}","cmc":4,"power":null,"toughness":null,"keywords":["Double"],"colors":["R"],"oracle":"If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead."};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
/** The AI attacks the user with `attackers` (ids of its battlefield), unblocked unless `blockers`; the user has priority in the declare blockers step. */
function combatAt({ ai = [], user = [], attackers = [], blockers = [], hand = [], aiHand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 7, activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-blockers", consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "ai", defender: "user" })), blockers },
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, manaPool: { ...FULL }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, manaPool: { ...FULL }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
function castAndResolve(s, cardId, seat = "user") {
  const a = legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  expect(a, `${cardId} cast offered`).toBeTruthy();
  s = flushTriggers(dispatchAction({ ...s, priorityHolder: seat }, a));
  for (let g = 0; g < 6 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s));
  return s;
}
const damage = (s, firstStrikeStep = false) => flushTriggers(resolveCombatDamage({ ...s, step: "combat-damage" }, { firstStrikeStep }));
const inklings = (s) => s.players.user.battlefield.filter((p) => p.card?.token && /Inkling/.test(String(p.card.type || "")));

describe("the reader", () => {
  it("⭐ Inkshield and Druid's Deliverance play their whole text", () => {
    expect({ ink: classifyCard(INKSHIELD), druid: classifyCard(DELIVERANCE) }).toEqual({ ink: "native-spell", druid: "native-spell" });
  });
  it("CONTROL — Comeuppance (its damage back to each source) stays parked; Riot Control stays native", () => {
    expect({ come: classifyCard(COMEUPPANCE), riot: classifyCard(RIOT_CONTROL) }).toEqual({ come: expect.not.stringMatching(/^native/), riot: "native-spell" });
  });
});

describe("Inkshield — the game", () => {
  it("⭐ two unblocked attackers (3 + 2): you take none of it, and five 2/1 white and black flying Inklings are made for you", () => {
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai"), P("bears", BEARS, "ai")], attackers: ["giant", "bears"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect(s.players.user.life).toBe(20);
    const tokens = inklings(s);
    expect(tokens.map((p) => ({ p: p.card.power, t: p.card.toughness, colors: [...(p.card.colors || [])].sort(), flying: (p.card.keywords || []).includes("Flying"), ctrl: p.controller })))
      .toEqual(Array.from({ length: 5 }, () => ({ p: 2, t: 1, colors: ["B", "W"], flying: true, ctrl: "user" })));
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Inkshield");
  });
  it("⭐ lifelink and commander damage see nothing: prevented damage is not dealt (Vampire Nighthawk gains no life)", () => {
    let s = castAndResolve(combatAt({ ai: [P("hawk", NIGHTHAWK, "ai")], attackers: ["hawk"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect({ user: s.players.user.life, ai: s.players.ai.life, tokens: inklings(s).length }).toEqual({ user: 20, ai: 20, tokens: 2 });
  });
  it("⭐ noncombat damage is not prevented (combat damage only) — and the shield still stands for the combat after", () => {
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai")], attackers: ["giant"], hand: [{ ...INKSHIELD, id: "ink" }], aiHand: [{ ...BOLT, id: "bolt" }] }), "ink");
    const bolt = legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && (a.targets || []).some((t) => t.type === "player" && t.id === "user"));
    s = flushTriggers(dispatchAction({ ...s, priorityHolder: "ai" }, bolt));
    s = flushTriggers(resolveTopOfStack(s));
    expect(s.players.user.life).toBe(17);
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 17, tokens: 3 });
  });
  it("⭐ a first-strike step and the regular step each make their own tokens (2, then 3)", () => {
    let s = castAndResolve(combatAt({ ai: [P("archers", ARCHERS, "ai"), P("giant", GIANT, "ai")], attackers: ["archers", "giant"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s, true);
    expect(inklings(s)).toHaveLength(2);
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 20, tokens: 5 });
  });
  it("⭐ a trampler's excess over its blocker is prevented and counted (6 power over a 2/2: 4 tokens)", () => {
    let s = castAndResolve(combatAt({ ai: [P("maw", DREADMAW, "ai")], user: [P("myBears", BEARS, "user")], attackers: ["maw"], blockers: [{ blockerId: "myBears", attackerId: "maw" }], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 20, tokens: 4 });
  });
  it("⭐ the order that makes the most (CR 616.1): Fiery Emancipation's triple first — a 3/3 makes nine Inklings", () => {
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai"), P("fiery", EMANCIPATION, "ai")], attackers: ["giant"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 20, tokens: 9 });
  });
  it("⭐ two increases whose order matters (CR 616.1): Torbran (+2) and Furnace of Rath (×2) behind a 3-power red attacker make ten Inklings — (3 + 2) × 2, the most", () => {
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai"), P("torbran", TORBRAN, "ai"), P("furnace", FURNACE, "ai")], attackers: ["giant"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 20, tokens: 10 });
  });
  it("CONTROL — the same attack with no Inkshield: the affected player orders the increases, the least first — 3 × 2 + 2 = 8 (CR 616.1)", () => {
    const s = damage(combatAt({ ai: [P("giant", GIANT, "ai"), P("torbran", TORBRAN, "ai"), P("furnace", FURNACE, "ai")], attackers: ["giant"] }));
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 12, tokens: 0 });
  });
  it("⭐ …and before another prevention: with Riot Control's shield and Defend the Hearth too, Inkshield still prevents it all", () => {
    let s = combatAt({ ai: [P("giant", GIANT, "ai")], attackers: ["giant"], hand: [{ ...RIOT_CONTROL, id: "riot" }, { ...DEFEND, id: "hearth" }, { ...INKSHIELD, id: "ink" }] });
    s = castAndResolve(castAndResolve(castAndResolve(s, "riot"), "hearth"), "ink");
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 21, tokens: 3 }); // Riot Control's +1 life (one creature)
  });
  it("combat damage can't be prevented (Frenzied Baloth — a control, both trees): Inkshield prevents nothing and makes nothing", () => {
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai"), P("baloth", BALOTH, "ai")], attackers: ["giant"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 17, tokens: 0 });
  });
  it("CONTROL — an opponent's Inkshield-free combat: the damage lands", () => {
    const s = damage(combatAt({ ai: [P("giant", GIANT, "ai")], attackers: ["giant"] }));
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 17, tokens: 0 });
  });
});

describe("Druid's Deliverance — the twin", () => {
  it("⭐ the combat damage is prevented, no Inklings; populate copies a creature token you control", () => {
    const token = P("tok", { name: "Soldier", type: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"], keywords: [], oracle: "", token: true }, "user");
    let s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai")], user: [token], attackers: ["giant"], hand: [{ ...DELIVERANCE, id: "dd" }] }), "dd");
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Soldier")).toHaveLength(2);
    s = damage(s);
    expect({ life: s.players.user.life, tokens: inklings(s).length }).toEqual({ life: 20, tokens: 0 });
  });
});

describe("the default AI", () => {
  const aiDefends = (step) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, turn: 8, activePlayer: "user", priorityHolder: "ai", phase: step === "main" ? "precombat-main" : "combat", step, consecutivePasses: 0, stack: [], pendingTriggers: [],
      combat: step === "main" ? null : { attackers: [{ permanentId: "giant", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...g.players,
        user: { ...g.players.user, battlefield: [P("giant", GIANT, "user")], library: [{ ...BEARS, id: "u1" }] },
        ai: { ...g.players.ai, life: 20, hand: [{ ...INKSHIELD, id: "ink" }], manaPool: { ...FULL }, library: [{ ...BEARS, id: "a1" }] } } };
  };
  it("⭐ attacked for 3 (not lethal), the AI casts Inkshield in the declare blockers step", () => {
    const s = aiDefends("declare-blockers");
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect({ kind: pick?.kind, card: pick?.cardId }).toEqual({ kind: "cast-spell", card: "ink" });
  });
  it("…and holds it outside combat, where it would prevent nothing", () => {
    const s = aiDefends("main");
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick?.cardId).not.toBe("ink");
  });
});

describe("the save round trip (v11) — a live Inkshield shield", () => {
  it("⭐ the counted shield survives save → JSON → migrate and still makes its tokens", async () => {
    const { migrate, isResumable, CURRENT_SCHEMA_VERSION } = await import("../server/learnSaveSchema.js");
    const s = castAndResolve(combatAt({ ai: [P("giant", GIANT, "ai")], attackers: ["giant"], hand: [{ ...INKSHIELD, id: "ink" }] }), "ink");
    const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "learn-session-save", savedAt: "2026-11-03T00:00:00.000Z", sessionId: "g", serializable: true, session: { id: "g", status: "active", state: s, difficulty: "beginner", decisionLog: [] } };
    const back = migrate(JSON.parse(JSON.stringify(doc)));
    const shield = (back.session.state.preventionShields || []).find((sh) => sh.perPrevented);
    expect({ resumable: isResumable(back), combatOnly: !!shield?.combatOnly, controller: shield?.controller ?? null }).toEqual({ resumable: true, combatOnly: true, controller: "user" });
    const t = damage(back.session.state);
    expect({ life: t.players.user.life, tokens: inklings(t).length }).toEqual({ life: 20, tokens: 3 });
  });
});
