/**
 * Combat-damage-to-a-player trigger event (CR 510.2 / 510.3a) — "Whenever <self / a creature you control>
 * deals combat damage to a player, <effect>". detectTriggers recognizes the bare shape; combatResolution
 * fires it off the real per-attacker player-damage, BEFORE the lethal SBA (a trading attacker still
 * triggers). The effect rides the existing flush → EffectProgram compiler. Engine-first: the trigger
 * must actually fire + resolve, or the card is a false positive.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const cdEvents = (oracle) => detectTriggers({ name: "X", type: "Creature — Pirate", oracle }).filter((d) => d.event === "combatDamageToPlayer");
const TREASURE_ORACLE = "Whenever this creature deals combat damage to a player, create a Treasure token.";
const pirate = (id, oracle) => createPermanent({ id, card: { id: `c-${id}`, name: "Treasure Pirate", type: "Creature — Pirate", power: 2, toughness: 2, oracle }, controller: "user", summoningSick: false });

function st(userBf, aiBf = [], attackers = [], blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; }
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((pm) => /treasure/i.test(pm.card?.type || pm.card?.name || "")).length;

describe("combat-damage-to-a-player — detection", () => {
  it("detects the bare self + creature-you-control shapes", () => {
    expect(cdEvents(TREASURE_ORACLE)[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "self" });
    expect(cdEvents("Whenever a creature you control deals combat damage to a player, draw a card.")[0]).toMatchObject({ scope: "creatureYouControl" });
  });
  it("does NOT detect batch / wrong-object variants (safe false-negative); the SELF union is modeled since CAP5", () => {
    expect(cdEvents("Whenever this creature deals combat damage to a creature, draw a card.")).toHaveLength(0);
    // ⭐ CAP5 (The Reaver Cleaver): the self "player or planeswalker" UNION detects now, carrying the
    // alsoPlaneswalker marker (the pw fire-pass gates on it). A WATCHER-form union still parks.
    expect(cdEvents("Whenever this creature deals combat damage to a player or planeswalker, draw a card.")[0]).toMatchObject({ scope: "self", alsoPlaneswalker: true });
    expect(cdEvents("Whenever a creature you control deals combat damage to a player or planeswalker, draw a card.")).toHaveLength(0);
    expect(cdEvents("Whenever one or more creatures you control deal combat damage to a player, create a Treasure token.")).toHaveLength(0);
  });
  it("detects the SUBTYPE shape ('a Dinosaur you control deals combat damage to a player') → subtypeYouControl", () => {
    // Tribal payoffs (Curious Altisaur, Seafloor Oracle, Zeriam) — a single-word subtype filter reusing
    // the subtypeYouControl scope. The captured subtype rides as subtypeFilter.
    expect(cdEvents("Whenever a Dinosaur you control deals combat damage to a player, draw a card.")[0])
      .toMatchObject({ event: "combatDamageToPlayer", scope: "subtypeYouControl", subtypeFilter: "Dinosaur" });
    expect(cdEvents("Whenever a Merfolk you control deals combat damage to a player, draw a card.")[0])
      .toMatchObject({ scope: "subtypeYouControl", subtypeFilter: "Merfolk" });
  });
});

describe("combat-damage-to-a-player — SUBTYPE tribal payoffs flip native-trigger", () => {
  const C = (type, oracle) => ({ type, oracle, mana: "{5}{G}", name: "X", power: "5", toughness: "5" });
  it("Curious Altisaur (Dinosaur → draw) and a Merfolk-draw both classify native-trigger", () => {
    expect(classifyCard(C("Creature — Dinosaur", "Vigilance, reach\nWhenever a Dinosaur you control deals combat damage to a player, draw a card."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Merfolk Wizard", "Whenever a Merfolk you control deals combat damage to a player, draw a card."))).toBe("native-trigger");
  });
  it("a SUBTYPE combat-damage trigger fires + resolves end-to-end for a matching attacker", () => {
    const altisaur = pirate("alt", "Whenever a Dinosaur you control deals combat damage to a player, draw a card.");
    altisaur.card.type = "Creature — Dinosaur"; // the watcher is itself a Dinosaur (self + subtype both match)
    let s = st([altisaur], [], [{ permanentId: "alt", attackingPlayer: "user", defender: "ai" }], []);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [altisaur], library: [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }] } } };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                  // 2 combat damage landed → the trigger condition met
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true); // the subtype trigger's draw resolved
  });
});

describe("combat-damage-to-a-player — classification flips body-only -> native-trigger", () => {
  it("a bare combat-damage->Treasure creature is native-trigger", () => {
    expect(classifyCard({ type: "Creature — Pirate", name: "Treasure Pirate", oracle: TREASURE_ORACLE })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Pirate", name: "Menace Pirate", oracle: `Menace\n${TREASURE_ORACLE}` })).toBe("native-trigger");
  });
});

describe("combat-damage-to-a-player — engine-first: the trigger fires + resolves", () => {
  it("an unblocked attacker dealing player damage creates a Treasure", () => {
    let s = st([pirate("p", TREASURE_ORACLE)], [], [{ permanentId: "p", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                 // 2 combat damage landed on the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(1);           // the trigger made a Treasure for the attacker's controller
  });

  it("a BLOCKED attacker (no player damage) does NOT trigger", () => {
    const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai", summoningSick: false });
    let s = st([pirate("p", TREASURE_ORACLE)], [wall], [{ permanentId: "p", attackingPlayer: "user", defender: "ai" }], [{ blockerId: "w", blockingPlayer: "ai", attackerId: "p" }]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(40);                 // blocked → no player damage
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // no player damage → no trigger
  });
});

// BATCH combat-damage (CR 510.4) — "Whenever one or more creatures you control deal combat damage to a
// player, <effect>" fires ONCE per combat, not per attacker. Runtime value (the trigger FIRES in-game for
// the ~31 treasure/Food/investigate payoffs — Grim Hireling, Professional Face-Breaker in Colton's Vihaan
// deck); most carry other unmodeled abilities so classifyCard stays body-only (metric ≠ playability).
describe("BATCH combat-damage trigger (one or more creatures …)", () => {
  const GRIM = "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.";
  const batchPerm = (id, oracle) => createPermanent({ id, card: { id: `c-${id}`, name: "Grim", type: "Creature — Human", power: 1, toughness: 1, oracle }, controller: "user", summoningSick: false });
  const beast = (id, p = 3) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: p, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });

  it("detects the batch shape as the combatDamageBatch event (distinct from per-attacker)", () => {
    expect(detectTriggers({ name: "Grim", type: "Creature — Human", oracle: GRIM })[0]).toMatchObject({ event: "combatDamageBatch", scope: "you" });
    // a qualified variant stays undetected (safe false-negative)
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Whenever one or more creatures you control deal combat damage to a player or planeswalker, draw a card." })).toHaveLength(0);
  });

  it("fires ONCE for the whole batch — two attackers connecting make 2 Treasures, not 4", () => {
    let s = st([batchPerm("gh", GRIM), beast("a1"), beast("a2")], [],
      [{ permanentId: "a1", attackingPlayer: "user", defender: "ai" }, { permanentId: "a2", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(34);                 // 6 damage from 2 attackers
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(2);           // "create TWO Treasures" fired ONCE (not 2× per attacker = 4)
  });

  it("does NOT fire when no creature you control connects (all blocked)", () => {
    const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai", summoningSick: false });
    let s = st([batchPerm("gh", GRIM), beast("a1")], [wall],
      [{ permanentId: "a1", attackingPlayer: "user", defender: "ai" }], [{ blockerId: "w", blockingPlayer: "ai", attackerId: "a1" }]);
    s = resolveCombatDamage(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // no player damage → no batch trigger
  });
});

// SUBTYPE/PROPERTY-FILTERED BATCH combat-damage (CR 510.4 + a creature-SUBTYPE / artifact / nontoken filter) —
// "Whenever one or more <FILTER> you control deal combat damage to a player, <effect>". PRIMARY TARGET: Olivia,
// Opulent Outlaw (Vihaan deck — "outlaws" = the {Assassin, Mercenary, Pirate, Rogue, Warlock} meta-type, CR
// 203.4c). Fires ONCE per combat per controller, but ONLY when at least one CONNECTING creature matches the
// filter — a non-matching attacker connecting alone must NOT fire it (CREED: no over-fire). The "outlaw" word
// is NOT a type-line subtype, so it's expanded to its five constituents and matched via type-line containment.
describe("SUBTYPE/PROPERTY-filtered BATCH combat-damage (Olivia + corpus)", () => {
  const cdBatch = (oracle, type = "Creature") => detectTriggers({ name: "X", type, oracle }).filter((d) => d.event === "combatDamageBatch");
  const OLIVIA = "Whenever one or more outlaws you control deal combat damage to a player, create a Treasure token. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)";
  const THOPTER = "Whenever one or more artifact creatures you control deal combat damage to a player, draw a card.";
  const ROOFTOP = "Whenever one or more nontoken creatures you control deal combat damage to a player, create a 1/1 black Assassin creature token with menace.";
  // helpers
  const cp = (id, type, oracle, extra = {}) => createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, oracle, ...extra }, controller: "user", summoningSick: false });
  const assassinTokenCount = (s) => s.players.user.battlefield.filter((pm) => /Assassin/.test(pm.card?.type || "") && pm.card?.token).length;

  describe("detection", () => {
    it("Olivia ('outlaws') → combatDamageBatch with the five outlaw subtypes expanded (CR 203.4c)", () => {
      expect(cdBatch(OLIVIA, "Legendary Creature — Vampire Assassin")[0]).toMatchObject({
        event: "combatDamageBatch", scope: "you",
        subtypeFilter: ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"],
      });
    });
    it("artifact / nontoken creature filters flag their property (Thopter, Rooftop)", () => {
      expect(cdBatch(THOPTER, "Enchantment")[0]).toMatchObject({ event: "combatDamageBatch", batchArtifact: true });
      expect(cdBatch(ROOFTOP, "Enchantment")[0]).toMatchObject({ event: "combatDamageBatch", batchNontoken: true });
      // "to an opponent" is equivalent to "to a player" (you only deal combat damage to opponents)
      expect(cdBatch("Whenever one or more artifact creatures you control deal combat damage to an opponent, draw a card.", "Creature")[0])
        .toMatchObject({ event: "combatDamageBatch", batchArtifact: true });
    });
    it("a bare tribal subtype ('Goblins') expands to that capitalized subtype", () => {
      expect(cdBatch("Whenever one or more Goblins you control deal combat damage to a player, draw a card.", "Creature — Goblin")[0])
        .toMatchObject({ event: "combatDamageBatch", subtypeFilter: "Goblin" });
    });
    it("an UNCHECKABLE / qualified filter stays UNDETECTED → Arbiter (safe false-negative)", () => {
      // colorless — no reliable per-permanent color in the engine (Glitch Interpreter)
      expect(cdBatch("Whenever one or more colorless creatures you control deal combat damage to a player, draw a card.")).toHaveLength(0);
      // creature tokens — not in the checkable batch set
      expect(cdBatch("Whenever one or more creature tokens you control deal combat damage to a player, draw a card.")).toHaveLength(0);
      // qualified object → undetected
      expect(cdBatch("Whenever one or more outlaws you control deal combat damage to a player or planeswalker, draw a card.")).toHaveLength(0);
    });
    it("the BARE 'creatures' batch is unchanged (no filter fields) — no regression", () => {
      const d = cdBatch("Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.")[0];
      expect(d).toMatchObject({ event: "combatDamageBatch", scope: "you" });
      expect(d.subtypeFilter).toBeUndefined();
      expect(d.batchArtifact).toBeUndefined();
      expect(d.batchNontoken).toBeUndefined();
    });
  });

  describe("classification flips whole-card-clean targets to native", () => {
    it("Olivia, Opulent Outlaw → native (the combat-damage trigger was its SOLE remaining blocker)", () => {
      // the activated ability ({3}, Sacrifice two Treasures: …) + Flying/lifelink are already native;
      // this trigger completes the card.
      expect(classifyCard({
        name: "Olivia, Opulent Outlaw", type: "Legendary Creature — Vampire Assassin", mana: "{2}{R}{W}", power: "4", toughness: "4",
        oracle: `Flying, lifelink\n${OLIVIA}\n{3}, Sacrifice two Treasures: Put two +1/+1 counters on each creature you control. Activate only as a sorcery.`,
      })).not.toBe("body-only");
    });
    it("Thopter Spy Network, Rooftop Bypass, Wistful Puppeteer flip native-trigger", () => {
      expect(classifyCard({ name: "Thopter Spy Network", type: "Enchantment", mana: "{3}{U}",
        oracle: `At the beginning of your upkeep, if you control an artifact, create a 1/1 colorless Thopter artifact creature token with flying.\n${THOPTER}` })).toBe("native-trigger");
      expect(classifyCard({ name: "Rooftop Bypass", type: "Enchantment", mana: "{2}{B}",
        oracle: `${ROOFTOP} (It can't be blocked except by two or more creatures.)` })).toBe("native-trigger");
      expect(classifyCard({ name: "Wistful Puppeteer", type: "Creature — Human Artificer", mana: "{2}{U}", power: "2", toughness: "2",
        oracle: "Whenever one or more artifact creatures you control deal combat damage to an opponent, draw a card." })).toBe("native-trigger");
    });
    it("an uncheckable-filter card (Glitch Interpreter — colorless) stays body-only (PARK, CREED FP-safe)", () => {
      expect(classifyCard({ name: "Glitch Interpreter", type: "Creature — Human Wizard", mana: "{1}{U}", power: "1", toughness: "3",
        oracle: "When this creature enters, draw a card, then discard a card.\nWhenever one or more colorless creatures you control deal combat damage to a player, draw a card." })).toBe("body-only");
    });
  });

  describe("runtime: fires exactly once when a matching creature connects, never on a non-match", () => {
    const olivia = (id) => cp(id, "Legendary Creature — Vampire Assassin", OLIVIA);

    it("Olivia (an Assassin = outlaw) connecting alone → ONE Treasure", () => {
      let s = st([olivia("ol")], [], [{ permanentId: "ol", attackingPlayer: "user", defender: "ai" }], []);
      s = resolveCombatDamage(s);
      expect(s.players.ai.life).toBe(38);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(treasureCount(s, "user")).toBe(1);
    });

    it("Olivia + a non-outlaw both connect → still ONE Treasure (batch fires once, not per-creature)", () => {
      const beast = cp("bs", "Creature — Beast", "");
      let s = st([olivia("ol"), beast], [],
        [{ permanentId: "ol", attackingPlayer: "user", defender: "ai" }, { permanentId: "bs", attackingPlayer: "user", defender: "ai" }], []);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(treasureCount(s, "user")).toBe(1);
    });

    it("CREED anti-FP: only a NON-outlaw connects (Olivia blocked) → ZERO Treasures", () => {
      const beast = cp("bs", "Creature — Beast", "");
      const wall = createPermanent({ id: "w", card: { id: "cw", name: "Wall", type: "Creature — Wall", power: 0, toughness: 6, oracle: "" }, controller: "ai", summoningSick: false });
      let s = st([olivia("ol"), beast], [wall],
        [{ permanentId: "bs", attackingPlayer: "user", defender: "ai" }, { permanentId: "ol", attackingPlayer: "user", defender: "ai" }],
        [{ blockerId: "w", blockingPlayer: "ai", attackerId: "ol" }]);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(treasureCount(s, "user")).toBe(0);    // a non-outlaw dealt the damage → the outlaw batch must NOT fire
    });

    it("a DIFFERENT outlaw subtype (a Pirate) fires Olivia's watcher — the meta-type expansion is OR over all five", () => {
      const pirateOutlaw = cp("pi", "Creature — Human Pirate", "");
      let s = st([olivia("ol"), pirateOutlaw], [], [{ permanentId: "pi", attackingPlayer: "user", defender: "ai" }], []);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(treasureCount(s, "user")).toBe(1);
    });

    it("Thopter (artifact creatures → draw): an artifact creature draws; a non-artifact does NOT", () => {
      const thopter = cp("th", "Enchantment", THOPTER);
      const artCreature = cp("ac", "Artifact Creature — Construct", "");
      let s = st([thopter, artCreature], [], [{ permanentId: "ac", attackingPlayer: "user", defender: "ai" }], []);
      s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L1", name: "Drawn", type: "Instant", oracle: "" }] } } };
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(s.players.user.hand.some((c) => c.id === "L1")).toBe(true);

      // anti-FP: only a plain (non-artifact) creature connects → no draw
      const thopter2 = cp("th2", "Enchantment", THOPTER);
      const bear = cp("br", "Creature — Bear", "");
      let s2 = st([thopter2, bear], [], [{ permanentId: "br", attackingPlayer: "user", defender: "ai" }], []);
      s2 = { ...s2, players: { ...s2.players, user: { ...s2.players.user, library: [{ id: "L2", name: "Nope", type: "Instant", oracle: "" }] } } };
      s2 = resolveCombatDamage(s2);
      s2 = resolveAll(flushTriggers(s2, { chooseTargets: chooseTriggerTargets }));
      expect(s2.players.user.hand.some((c) => c.id === "L2")).toBe(false);
    });

    it("Rooftop Bypass (nontoken creatures): a nontoken makes an Assassin token; a token-only connect does NOT", () => {
      const rooftop = cp("rb", "Enchantment", ROOFTOP);
      const nontoken = cp("nt", "Creature — Human", "");
      let s = st([rooftop, nontoken], [], [{ permanentId: "nt", attackingPlayer: "user", defender: "ai" }], []);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(assassinTokenCount(s)).toBe(1);

      // anti-FP: only a TOKEN creature connects → the nontoken batch must NOT fire
      const rooftop2 = cp("rb2", "Enchantment", ROOFTOP);
      const tokenCreature = createPermanent({ id: "tk", card: { id: "ctk", name: "Soldier", type: "Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true }, controller: "user", summoningSick: false });
      let s2 = st([rooftop2, tokenCreature], [], [{ permanentId: "tk", attackingPlayer: "user", defender: "ai" }], []);
      s2 = resolveCombatDamage(s2);
      s2 = resolveAll(flushTriggers(s2, { chooseTargets: chooseTriggerTargets }));
      expect(assassinTokenCount(s2)).toBe(0);
    });
  });
});

// SHARED-SCOPE SELF-FIRE GUARD (Hans, cycle 42→43): the subtypeYouControl scope is shared across ETB-SELF
// (#330 Pantlaza), combat-damage (#333), and attacks/dies (#335). Its self-inclusion clause must be gated
// on the SOURCE carrying the subtype, else a non-SUBTYPE creature whose trigger watches a SUBTYPE fires on
// its OWN non-matching event. #335 widening to `dies` made this a LIVE P0 (Slimefoot).
describe("subtype combat-damage self-fire guard (Setzer — latent)", () => {
  it("a NON-subtype watcher does NOT self-fire its subtype combat-damage trigger", () => {
    // A Human (not a Vehicle) carrying "Whenever a Vehicle you control deals combat damage…". Its OWN
    // (non-Vehicle) player damage must NOT fire the trigger — no Vehicle dealt damage.
    const setzerish = createPermanent({ id: "sz", card: { id: "csz", name: "Setzerish", type: "Creature — Human Rogue", power: 2, toughness: 2, oracle: "Whenever a Vehicle you control deals combat damage to a player, create a Treasure token." }, controller: "user", summoningSick: false });
    let s = st([setzerish], [], [{ permanentId: "sz", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(38);                 // the Human's own 2 combat damage landed
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(0);           // but it's not a Vehicle → no self-fire
  });
  it("a real Vehicle attacker still fires the same watcher (no regression)", () => {
    const setzerish = createPermanent({ id: "sz2", card: { id: "csz2", name: "Setzerish", type: "Creature — Human Rogue", power: 1, toughness: 1, oracle: "Whenever a Vehicle you control deals combat damage to a player, create a Treasure token." }, controller: "user", summoningSick: false });
    const blackjack = createPermanent({ id: "bj", card: { id: "cbj", name: "The Blackjack", type: "Artifact Creature — Vehicle", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    let s = st([setzerish, blackjack], [], [{ permanentId: "bj", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(37);                 // the Vehicle's 3 damage landed
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(treasureCount(s, "user")).toBe(1);           // a Vehicle dealt damage → fires
  });
});

describe("subtype DIES self-fire guard — Slimefoot (LIVE native P0)", () => {
  // Slimefoot (native Fungus) watches "a Saproling you control dies" — without the source-subtype guard it
  // self-fires its drain when Slimefoot ITSELF (a non-Saproling) dies. #335 made this reachable.
  const slimefoot = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Slimefoot, the Stowaway", type: "Legendary Creature — Fungus", power: 1, toughness: 1, oracle: "Whenever a Saproling you control dies, Slimefoot deals 1 damage to each opponent and you gain 1 life." }, controller: "user", summoningSick: false });
  const dead = (perm) => ({ id: perm.id, controller: perm.controller, card: perm.card });
  const withSlimefoot = (slime) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [slime] } } };
  };
  const diesFired = (s, deadPerm) => (checkDiesTriggers(s, [dead(deadPerm)]).pendingTriggers || []).filter((t) => t.event === "dies");

  it("a Saproling dying FIRES Slimefoot's drain (the real trigger)", () => {
    const slime = slimefoot("sf");
    const sap = createPermanent({ id: "sap", card: { id: "csap", name: "Saproling", type: "Creature — Saproling", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    expect(diesFired(withSlimefoot(slime), sap)).toHaveLength(1);   // a Saproling died → Slimefoot's drain fires
  });
  it("Slimefoot ITSELF dying does NOT self-fire (Fungus is not a Saproling)", () => {
    const slime = slimefoot("sf2");
    expect(diesFired(withSlimefoot(slime), slime)).toHaveLength(0); // Slimefoot (a Fungus) is not a Saproling → no self-fire
  });
});
