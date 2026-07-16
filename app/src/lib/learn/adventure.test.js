/**
 * adventure.test.js — ADVENTURE (CR 715). An Adventure card has a CREATURE half and an instant/sorcery
 * "Adventure" half. From hand you may cast EITHER half (CR 715.3). Casting the Adventure half resolves its
 * spell effect, then EXILES the card (CR 715.3d); while the card is exiled you may cast the CREATURE half
 * from exile at its own mana cost (CR 715.3e). The creature then enters the battlefield as normal.
 *
 * THE CREED: a card is credited native (and offered the adventure cast path) ONLY when BOTH halves are
 * modeled — the creature half is a native tier AND the adventure half's spell effect parses HIGH. A card
 * with EITHER half unmodeled stays body-only and is NEVER offered the adventure cast (so the engine can't
 * silently drop the unmodeled half).
 *
 * Infra reuse: the adventure spell cast reuses the SHARED cast builder (castActionsFromZone) on the
 * adventure FACE view, so cost/X/modal/targets/timing are enumerated like any instant/sorcery; the
 * dispatcher (applyCastSpell) resolves it through the EFFECT_PROGRAM interpreter and then exiles the card
 * (applyAdventureExile). The creature-from-exile cast reuses the SAME builder on the creature FACE view
 * (fromZone "exile", at the creature's own cost), so it enters via PERMANENT_ETB identically to a hand-cast.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseAdventureCard, isAdventureCard, adventureFaceCard, creatureFaceCard } from "./adventure.js";

beforeEach(() => _resetIdsForTests());

// ── Real-corpus fixtures (faithful publicCard oracle shape: "<Name> - <type> <mana>\n<text>\n//\n…") ──
// Faerie Guidemother // Gift of the Fae — creature: Flying; adventure {1}{W}: target creature gets +2/+1 + flying.
const FAERIE = {
  id: "fae1", name: "Faerie Guidemother // Gift of the Fae", type: "Creature — Faerie // Sorcery — Adventure", mana: "{W} // {1}{W}",
  oracle: "Faerie Guidemother - Creature — Faerie {W}\nFlying\n//\nGift of the Fae - Sorcery — Adventure {1}{W}\nTarget creature gets +2/+1 and gains flying until end of turn. (Then exile this card. You may cast the creature later from exile.)",
};
// Foulmire Knight // Profane Insight — creature: Deathtouch; adventure {2}{B}: you draw a card and lose 1 life.
const FOULMIRE = {
  id: "foul1", name: "Foulmire Knight // Profane Insight", type: "Creature — Zombie Knight // Instant — Adventure", mana: "{B} // {2}{B}",
  oracle: "Foulmire Knight - Creature — Zombie Knight {B}\nDeathtouch\n//\nProfane Insight - Instant — Adventure {2}{B}\nYou draw a card and you lose 1 life. (Then exile this card. You may cast the creature later from exile.)",
};
// Curious Pair // Treats to Share — creature: vanilla; adventure {G}: create a Food token.
const CURIOUS = {
  id: "cur1", name: "Curious Pair // Treats to Share", type: "Creature — Human Peasant // Sorcery — Adventure", mana: "{1}{G} // {G}",
  oracle: "Curious Pair - Creature — Human Peasant {1}{G}\n//\nTreats to Share - Sorcery — Adventure {G}\nCreate a Food token. (Then exile this card. You may cast the creature later from exile. A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")",
};
// ── Anti-FP fixtures (one half unmodeled → whole card body-only, NEVER offered the adventure cast) ──
// Bonecrusher Giant // Stomp — BOTH halves unmodeled (creature "becomes the target" trigger; adventure
// "Damage can't be prevented").
const BONECRUSHER = {
  id: "bone1", name: "Bonecrusher Giant // Stomp", type: "Creature — Giant // Instant — Adventure", mana: "{2}{R} // {1}{R}",
  oracle: "Bonecrusher Giant - Creature — Giant {2}{R}\nWhenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.\n//\nStomp - Instant — Adventure {1}{R}\nDamage can't be prevented this turn. Stomp deals 2 damage to any target.",
};
// Murderous Rider // Swift End — adventure half is MODELED (destroy + lose life), but the CREATURE half
// carries an unmodeled dies-trigger ("put it on the bottom of its owner's library") → whole card body-only.
const MURDEROUS = {
  id: "mur1", name: "Murderous Rider // Swift End", type: "Creature — Zombie Knight // Instant — Adventure", mana: "{1}{B}{B} // {1}{B}{B}",
  oracle: "Murderous Rider - Creature — Zombie Knight {1}{B}{B}\nLifelink\nWhen this creature dies, put it on the bottom of its owner's library.\n//\nSwift End - Instant — Adventure {1}{B}{B}\nDestroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)",
};
// Picklock Prankster // Free the Fae — CREATURE half is modeled (keyword-only: flying, vigilance), but the
// ADVENTURE half's follow-up ("put an instant, sorcery, or Faerie card from among the milled cards into your
// hand") is unmodeled → whole card body-only (the OTHER-half anti-FP pin). (Merfolk Secretkeeper held this
// pin until BLITZ TM-1 made its fixed-amount targeted mill native.)
const PICKLOCK = {
  id: "pick1", name: "Picklock Prankster // Free the Fae", type: "Creature — Faerie Rogue // Instant — Adventure", mana: "{1}{U} // {1}{U}",
  oracle: "Picklock Prankster - Creature — Faerie Rogue {1}{U}\nFlying, vigilance\n//\nFree the Fae - Instant — Adventure {1}{U}\nMill four cards. Then put an instant, sorcery, or Faerie card from among the milled cards into your hand.",
};

const plains = (id) => createPermanent({ id, card: { name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user", summoningSick: false });
const swamp = (id) => createPermanent({ id, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false });
const forest = (id) => createPermanent({ id, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
const bear = (id) => createPermanent({ id, card: { name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }, controller: "user", summoningSick: false });
const untapAll = (s, who = "user") => ({ ...s, players: { ...s.players, [who]: { ...s.players[who], battlefield: s.players[who].battlefield.map(p => ({ ...p, tapped: false })) } } });

// A user at their precombat main with `hand` + `battlefield` (lands + extras), on `turn`.
function advState({ hand, battlefield, turn = 3, library = [{ id: "lib1", name: "Bear", type: "Creature — Bear" }] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, library } },
  };
}

describe("ADVENTURE — the metric (classifyCard: a clean card flips native-mixed; an unmodeled half parks)", () => {
  it("Faerie Guidemother // Gift of the Fae (Flying + pump) → native-mixed", () => {
    expect(classifyCard(FAERIE)).toBe("native-mixed");
  });
  it("Foulmire Knight // Profane Insight (Deathtouch + draw/lose-life) → native-mixed", () => {
    expect(classifyCard(FOULMIRE)).toBe("native-mixed");
  });
  it("Curious Pair // Treats to Share (vanilla + Food token) → native-mixed", () => {
    expect(classifyCard(CURIOUS)).toBe("native-mixed");
  });

  it("CREED: Bonecrusher (BOTH halves unmodeled) stays body-only", () => {
    expect(classifyCard(BONECRUSHER)).toBe("body-only");
  });
  it("CREED: Murderous Rider (CREATURE half unmodeled, adventure modeled) stays body-only", () => {
    expect(classifyCard(MURDEROUS)).toBe("body-only");
  });
  it("CREED: Picklock Prankster (ADVENTURE half unmodeled, creature modeled) stays body-only", () => {
    expect(classifyCard(PICKLOCK)).toBe("body-only");
  });
  it("an adventure card is NEVER mis-routed to the instant/sorcery tier (arbiter-spell) by its combined type", () => {
    // The combined type line contains 'Sorcery'/'Instant' — without the early adventure interception it would
    // mis-classify as arbiter-spell. A parked adventure card is body-only (a permanent), never *-spell.
    expect(["native-mixed", "body-only"]).toContain(classifyCard(PICKLOCK));
    expect(classifyCard(PICKLOCK)).not.toBe("arbiter-spell");
  });
});

describe("ADVENTURE — the shape parser (split the combined oracle into two faces)", () => {
  it("parseAdventureCard splits creature + adventure halves and strips the reminder", () => {
    const p = parseAdventureCard(FOULMIRE);
    expect(p).toBeTruthy();
    expect(p.creature).toMatchObject({ name: "Foulmire Knight", type: "Creature — Zombie Knight", mana: "{B}" });
    expect(p.creature.oracle).toBe("Deathtouch");
    expect(p.adventure).toMatchObject({ name: "Profane Insight", type: "Instant — Adventure", mana: "{2}{B}" });
    expect(p.adventure.oracle).toBe("You draw a card and you lose 1 life."); // (Then exile…) reminder stripped
  });
  it("handles a Food-token reminder that contains quotes + braces (Curious Pair)", () => {
    const p = parseAdventureCard(CURIOUS);
    expect(p.adventure.oracle).toBe("Create a Food token."); // the whole nested reminder is stripped
    expect(p.creature.oracle).toBe(""); // vanilla creature half
  });
  it("isAdventureCard is true for an adventure card, false for a normal card", () => {
    expect(isAdventureCard(FAERIE)).toBe(true);
    expect(isAdventureCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." })).toBe(false);
    expect(isAdventureCard({ name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "" })).toBe(false);
  });
  it("faceCard projections carry the right face fields (same id)", () => {
    expect(adventureFaceCard(FAERIE)).toMatchObject({ id: "fae1", name: "Gift of the Fae", type: "Sorcery — Adventure", mana: "{1}{W}" });
    expect(creatureFaceCard(FAERIE)).toMatchObject({ id: "fae1", name: "Faerie Guidemother", type: "Creature — Faerie", mana: "{W}" });
  });
});

describe("ADVENTURE step 1 — cast the adventure (instant/sorcery) half from hand", () => {
  it("offers the adventure cast for a native adventure card with an affordable adventure cost", () => {
    const s = advState({ hand: [FAERIE], battlefield: [plains("p1"), plains("p2"), bear("b1")] });
    const adv = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast);
    expect(adv).toHaveLength(1);
    expect(adv[0]).toMatchObject({ kind: "cast-spell", cardId: "fae1", name: "Gift of the Fae", fromZone: "hand" });
  });

  it("does NOT offer the adventure cast for a card with an unmodeled half (CREED — Picklock Prankster)", () => {
    // TWO islands: the {1}{U} adventure half is fully AFFORDABLE, so the CREED gate is the only thing
    // keeping it off the offer list.
    const isl = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
    const s = advState({ hand: [PICKLOCK], battlefield: [isl("i1"), isl("i2")] });
    expect(filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast)).toHaveLength(0);
  });

  it("resolving the adventure spell runs its effect AND exiles the card with _onAdventure (CR 715.3d)", () => {
    let s = advState({ hand: [FOULMIRE], battlefield: [swamp("s1"), swamp("s2"), swamp("s3")] });
    const before = s.players.user.life;
    const adv = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast)[0];
    s = dispatchAction(s, adv);
    expect(s.players.user.hand.some(c => c.id === "foul1")).toBe(false); // left hand
    while (s.stack.length) s = resolveTopOfStack(s);
    // Profane Insight: "You draw a card and you lose 1 life."
    expect(s.players.user.life).toBe(before - 1);
    const exiled = s.players.user.exile.find(c => c.id === "foul1");
    expect(exiled).toBeTruthy();
    expect(exiled._onAdventure).toBe(true); // exiled, NOT in the graveyard
  });

  it("the adventure cast is sorcery-speed for a Sorcery adventure half (not offered on the opponent's turn)", () => {
    let s = advState({ hand: [FAERIE], battlefield: [plains("p1"), plains("p2"), bear("b1")] });
    s = { ...s, activePlayer: "ai", priorityHolder: "user" }; // user has priority but it's the AI's turn
    expect(filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast)).toHaveLength(0);
  });
});

describe("ADVENTURE — the COMBINED card is never offered (CR 715.2b); each half casts separately", () => {
  it("an adventure card in hand yields ONLY adventureCast + creature-half actions — never a combined-card cast", () => {
    // FOULMIRE's combined type contains "Instant" → the old generic hand enumerator offered the COMBINED
    // card (summed {B}+{2}{B} cost, instant timing) alongside the correct per-half actions.
    const s = advState({ hand: [FOULMIRE], battlefield: [swamp("s1"), swamp("s2"), swamp("s3")] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "foul1");
    expect(casts).toHaveLength(2);
    expect(casts.every(a => a.faceCard)).toBe(true);                     // every cast is a projected HALF
    const names = casts.map(a => a.name).sort();
    expect(names).toEqual(["Foulmire Knight", "Profane Insight"]);       // creature half + adventure half
    expect(casts.some(a => String(a.name).includes("//"))).toBe(false);  // the combined card is gone
  });

  it("the creature half casts from hand at ITS OWN cost and enters as the creature (CR 715.2b)", () => {
    let s = advState({ hand: [FOULMIRE], battlefield: [swamp("s1")] }); // ONLY {B} available — combined/summed would be unaffordable
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "foul1");
    expect(casts).toHaveLength(1); // the {2}{B} adventure half is unaffordable; the {B} creature half is castable
    expect(casts[0].name).toBe("Foulmire Knight");
    s = dispatchAction(s, casts[0]);
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find(p => p.card.id === "foul1");
    expect(perm.card.name).toBe("Foulmire Knight");                      // entered as the CREATURE face
    expect(perm.card.type).toBe("Creature — Zombie Knight");
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("at INSTANT speed only the Instant adventure half is offered — the creature half (and combined card) are not", () => {
    // Opponent's turn: the old combined offer leaked an instant-speed CREATURE cast (illegal timing).
    const base = advState({ hand: [FOULMIRE], battlefield: [swamp("s1"), swamp("s2"), swamp("s3")] });
    const s = { ...base, activePlayer: "ai", priorityHolder: "user" };
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "foul1");
    expect(casts.map(a => a.name)).toEqual(["Profane Insight"]);         // the Instant half is legal at instant speed
    expect(casts[0].adventureCast).toBe(true);
  });

  it("a card with an UNMODELED adventure half is still castable as its CREATURE body (trunk posture)", () => {
    // PICKLOCK: adventure half (mill + from-among retrieval) unmodeled → no adventureCast (CREED-gated),
    // but the keyword-only creature half is exactly a body-only trunk creature — offered at {1}{U},
    // entering as the Faerie.
    const isl = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
    let s = advState({ hand: [PICKLOCK], battlefield: [isl("i1"), isl("i2")] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.cardId === "pick1");
    expect(casts.map(a => a.name)).toEqual(["Picklock Prankster"]);    // creature half only, no combined, no adventure
    s = dispatchAction(s, casts[0]);
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some(p => p.card.name === "Picklock Prankster")).toBe(true);
  });
});

describe("ADVENTURE step 2 — cast the creature half from adventure-exile (CR 715.3e)", () => {
  // Cast Gift of the Fae (targeting a bear) so Faerie Guidemother lands in adventure-exile, then untap.
  function onAdventureThenUntap() {
    let s = advState({ hand: [FAERIE], battlefield: [plains("p1"), plains("p2"), bear("b1")] });
    const adv = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast)[0];
    s = dispatchAction(s, adv);
    while (s.stack.length) s = resolveTopOfStack(s);
    return untapAll(s);
  }

  it("offers the creature cast from exile at the creature's OWN mana cost (NOT free)", () => {
    const s = onAdventureThenUntap();
    const fromExile = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(fromExile).toHaveLength(1);
    expect(fromExile[0].name).toBe("Faerie Guidemother");
    expect(fromExile[0].freeCast).toBeUndefined();     // creature is cast at its own cost, never free
    expect(fromExile[0].cost).toMatchObject({ W: 1 }); // {W}
  });

  it("casting the creature from exile pays its cost, leaves exile, and enters the battlefield as the creature", () => {
    let s = onAdventureThenUntap();
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    s = dispatchAction(s, cast);
    expect(s.players.user.exile.some(c => c.id === "fae1")).toBe(false); // left exile
    expect(s.stack).toHaveLength(1);                                     // on the stack as a creature spell
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find(p => p.card?.name === "Faerie Guidemother");
    expect(perm).toBeTruthy();
    expect(perm.card.type).toBe("Creature — Faerie"); // entered as the CREATURE face, not the combined card
    expect(perm.card.oracle).toBe("Flying");          // the creature face's oracle (not the adventure text)
  });

  it("CANNOT be double-cast — once cast the creature has left exile, so no second cast is offered", () => {
    let s = onAdventureThenUntap();
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    s = dispatchAction(s, cast); // first cast — now on the stack, gone from exile
    const second = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(second).toHaveLength(0);
  });

  it("the creature stays castable from exile on a LATER turn (CR 715.3e — no turn restriction)", () => {
    let s = onAdventureThenUntap();
    s = untapAll({ ...s, turn: s.turn + 2 });
    const fromExile = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile");
    expect(fromExile).toHaveLength(1);
    expect(fromExile[0].name).toBe("Faerie Guidemother");
  });
});

describe("ADVENTURE — full lifecycle (Curious Pair: Food token, then the creature from exile)", () => {
  it("cast Treats to Share → Food token created + card exiled; then cast Curious Pair → enters", () => {
    let s = advState({ hand: [CURIOUS], battlefield: [forest("f1"), forest("f2")] });
    // Step 1 — the adventure (Treats to Share, {G}: create a Food token).
    const adv = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.adventureCast)[0];
    expect(adv).toBeTruthy();
    s = dispatchAction(s, adv);
    while (s.stack.length) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some(p => /Food/.test(p.card?.type || p.card?.name || ""))).toBe(true); // Food token minted
    expect(s.players.user.exile.find(c => c.id === "cur1")?._onAdventure).toBe(true);                          // card exiled
    // Step 2 — the creature (Curious Pair, {1}{G}) from exile.
    s = untapAll(s);
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter(a => a.fromZone === "exile")[0];
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    while (s.stack.length) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some(p => p.card?.name === "Curious Pair")).toBe(true);
    expect(s.players.user.exile.some(c => c.id === "cur1")).toBe(false);
  });
});

describe("ADVENTURE commander — each half casts from the COMMAND zone (CR 715.2b + 903.8)", () => {
  // P0-verify repair: castActionsFromZone's combined-card skip (correct) made an adventure COMMANDER
  // (Kellan, the Fae-Blooded / Beluna Grandsquall) entirely uncastable from the command zone — no
  // command-zone half-projection existed. actionsCastCommander now mirrors the two hand generators.
  function cmdState({ count = 0, commander = FAERIE, battlefield } = {}) {
    const s = advState({ hand: [], battlefield: battlefield ?? [plains("p1"), plains("p2"), bear("b1")] });
    return {
      ...s,
      mode: "commander",
      players: {
        ...s.players,
        user: { ...s.players.user, command: [commander], commanderCastCount: { [commander.id]: count } },
      },
    };
  }

  it("offers BOTH projected halves from the command zone — never the combined card", () => {
    const casts = filterActions(legalActionsForPlayer(cmdState(), "user"), "cast-spell")
      .filter(a => a.fromZone === "command");
    expect(casts.map(a => a.name).sort()).toEqual(["Faerie Guidemother", "Gift of the Fae"]);
    expect(casts.every(a => a.faceCard)).toBe(true);                     // every offer is a projected HALF
    expect(casts.some(a => String(a.name).includes("//"))).toBe(false);  // the combined card stays gone
    expect(casts.find(a => a.name === "Gift of the Fae").adventureCast).toBe(true);
  });

  it("commander tax lands on a half cast from the command zone (CR 903.8)", () => {
    const pick = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .filter(a => a.fromZone === "command" && a.name === "Faerie Guidemother")[0];
    const lands = [plains("p1"), plains("p2"), plains("p3"), plains("p4")]; // enough for {W}+{2} tax
    const free = pick(cmdState({ count: 0, battlefield: lands }));
    const taxed = pick(cmdState({ count: 1, battlefield: lands }));
    expect(free).toBeTruthy();
    expect(taxed).toBeTruthy();
    expect(taxed.cost.generic || 0).toBe((free.cost.generic || 0) + 2);
  });

  it("casting the CREATURE half from command enters the creature face and bumps the tax count", () => {
    let s = cmdState();
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .filter(a => a.fromZone === "command" && a.name === "Faerie Guidemother")[0];
    s = dispatchAction(s, cast);
    expect(s.players.user.command).toHaveLength(0);                       // left the command zone
    expect(s.players.user.commanderCastCount.fae1).toBe(1);               // the tax count advanced
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find(p => p.card?.id === "fae1");
    expect(perm).toBeTruthy();
    expect(perm.card.name).toBe("Faerie Guidemother");                    // entered as the CREATURE face
    expect(perm.card.type).toBe("Creature — Faerie");
  });

  it("casting the ADVENTURE half from command counts as a commander cast, exiles _onAdventure, then the creature casts from exile TAX-FREE", () => {
    let s = cmdState();
    const adv = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .filter(a => a.fromZone === "command" && a.adventureCast)[0];
    s = dispatchAction(s, adv);
    expect(s.players.user.commanderCastCount.fae1).toBe(1);               // a command-zone cast IS a commander cast
    while (s.stack.length) s = resolveTopOfStack(s);
    const exiled = s.players.user.exile.find(c => c.id === "fae1");
    expect(exiled?._onAdventure).toBe(true);                              // CR 715.3d — exiled on adventure
    s = untapAll(s);
    const fromExile = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .filter(a => a.fromZone === "exile");
    expect(fromExile).toHaveLength(1);
    expect(fromExile[0].name).toBe("Faerie Guidemother");
    expect(fromExile[0].cost.generic || 0).toBe(0);                       // exile is not the command zone — no tax (CR 903.8)
  });

  it("CREED: an adventure commander with an unmodeled adventure half offers ONLY the creature half from command", () => {
    const isl = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
    const casts = filterActions(legalActionsForPlayer(cmdState({ commander: PICKLOCK, battlefield: [isl("i1"), isl("i2")] }), "user"), "cast-spell")
      .filter(a => a.fromZone === "command");
    expect(casts.map(a => a.name)).toEqual(["Picklock Prankster"]);       // creature body only
    expect(casts[0].adventureCast).toBeUndefined();                       // the unmodeled half is never offered
  });
});
