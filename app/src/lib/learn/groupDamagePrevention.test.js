/**
 * groupDamagePrevention.test.js — the play-weighted program: the prevention walls over a GROUP of creatures.
 *
 *   Dolmen Gate (#1348):        "Prevent all combat damage that would be dealt to attacking creatures you control."
 *   Iroas, God of Victory (#1456): "… Prevent all damage that would be dealt to attacking creatures you control."
 *   Crystal Barricade (#2001):  "… Prevent all noncombat damage that would be dealt to other creatures you control."
 *   + Tajic, Legion's Edge (the Barricade's sentence), Mark of Asylum ("noncombat … to creatures you control"), Inner Sanctum
 *     ("all damage … to creatures you control"), Bubble Matrix ("… to creatures"), Light of Sanction ("… to creatures you
 *     control by sources you control").
 *
 * A prevention effect (CR 615.1a) of a permanent's static ability, read where every damage replacement is read
 * (damageReplacements.js — synthesized on read off the battlefield, consulted at the combat funnel and the shared noncombat
 * deal path, ordered by the affected player under CR 616.1). The recipient is a creature on the battlefield: "you control"
 * is the replacement's controller's, "attacking" reads the combat's declared attackers, "other" excludes the carrier. A fully
 * prevented hit deals nothing (CR 120.8): no mark, no lifelink gain, no deathtouch kill. "Combat damage can't be prevented"
 * switches the combat half off (CR 615.12).
 *
 * The bundled rulings: Iroas's last ability "prevents all damage dealt to attacking creatures you control, not just combat
 * damage"; Crystal Barricade's (and Tajic's) prevents the damage to the other creatures "even if the damage being dealt to
 * Crystal Barricade is lethal damage" in the same event.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseDamageReplacements, applyDamageReplacements } from "./damageReplacements.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const GATE = {"name":"Dolmen Gate","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"Prevent all combat damage that would be dealt to attacking creatures you control."}; // body-only #1348
const IROAS = {"name":"Iroas, God of Victory","type":"Legendary Enchantment Creature — God","mana":"{2}{R}{W}","cmc":4,"power":"7","toughness":"4","keywords":["Indestructible"],"colors":["R","W"],"oracle":"Indestructible\nAs long as your devotion to red and white is less than seven, Iroas isn't a creature.\nCreatures you control have menace.\nPrevent all damage that would be dealt to attacking creatures you control."}; // body-only #1456
const BARRICADE = {"name":"Crystal Barricade","type":"Artifact Creature — Wall","mana":"{1}{W}","cmc":2,"power":"0","toughness":"4","keywords":["Defender"],"colors":["W"],"oracle":"Defender (This creature can't attack.)\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)\nPrevent all noncombat damage that would be dealt to other creatures you control."}; // body-only #2001
const TAJIC = {"name":"Tajic, Legion's Edge","type":"Legendary Creature — Human Soldier","mana":"{1}{R}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Mentor","Haste"],"colors":["R","W"],"oracle":"Haste\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nPrevent all noncombat damage that would be dealt to other creatures you control.\n{R}{W}: Tajic gains first strike until end of turn."}; // body-only #7984
const ASYLUM = {"name":"Mark of Asylum","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Prevent all noncombat damage that would be dealt to creatures you control."}; // body-only #16795
const SANCTUM = {"name":"Inner Sanctum","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":["Cumulative upkeep"],"colors":["W"],"oracle":"Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nPrevent all damage that would be dealt to creatures you control."}; // body-only #23804
const MATRIX = {"name":"Bubble Matrix","type":"Artifact","mana":"{4}","cmc":4,"keywords":[],"colors":[],"oracle":"Prevent all damage that would be dealt to creatures."}; // body-only #18869
const SANCTION = {"name":"Light of Sanction","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Prevent all damage that would be dealt to creatures you control by sources you control."}; // body-only #23574
const TORBRAN = {"name":"Torbran, Thane of Red Fell","type":"Legendary Creature — Dwarf Noble","mana":"{1}{R}{R}{R}","cmc":4,"power":"2","toughness":"4","keywords":[],"colors":["R"],"oracle":"If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead."}; // native-static #1004
const BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"power":"3","toughness":"2","keywords":["Haste","Trample"],"colors":["G"],"oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented."}; // native-static #2334
const NIGHTHAWK = {"name":"Vampire Nighthawk","type":"Creature — Vampire Shaman","mana":"{1}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Deathtouch","Flying","Lifelink"],"colors":["B"],"oracle":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)"}; // native-body #1752
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

/** Two seats. `combat` = { attackers, blockers } puts the game in the combat-damage step; without it, the main phase. */
function table({ user = [], ai = [], combat = null, active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, activePlayer: active, priorityHolder: active, consecutivePasses: 0,
    ...(combat ? { phase: "combat", step: "combat-damage", combat } : { phase: "precombat-main", step: "main", combat: { attackers: [], blockers: [] } }) };
}
const attack = (id, by = "user", at = "ai") => ({ permanentId: id, attackingPlayer: by, defender: at });
const block = (blockerId, attackerId, by = "ai") => ({ blockerId, blockingPlayer: by, attackerId });
const perm = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id);
/** The damage marked on a creature — "gone" once it has left the battlefield (so a creature that died never reads as 0). */
const marked = (s, id) => { const p = perm(s, id); return p ? (p.damageMarked ?? 0) : "gone"; };
const alive = (s, id) => !!perm(s, id);
/** `controller`'s spell (no permanent source) deals `amount` to each listed creature (one event) — or to each creature. */
const zap = (s, controller, amount, ids) => applyDamageEffect(s, ids === "each"
  ? { controller, amount, targetType: "eachCreature", source: null }
  : { controller, amount, targetType: "creature", targets: ids.map((id) => ({ type: "creature", id })), source: null });

describe("THE READ — each sentence is one prevention entry; the carriers classify native", () => {
  it("⭐ the entries: the recipient creature (its controller, attacking, other), the damage kind, the source's controller", () => {
    const prevent = { op: "prevent" };
    expect({
      gate: parseDamageReplacements(GATE),
      iroas: parseDamageReplacements(IROAS),
      barricade: parseDamageReplacements(BARRICADE),
      asylum: parseDamageReplacements(ASYLUM),
      matrix: parseDamageReplacements(MATRIX),
      sanction: parseDamageReplacements(SANCTION),
    }).toEqual({
      gate: [{ op: prevent, scope: { side: "any", targetCreature: "you", targetAttacking: true, combatOnly: true } }],
      iroas: [{ op: prevent, scope: { side: "any", targetCreature: "you", targetAttacking: true } }],
      barricade: [{ op: prevent, scope: { side: "any", targetCreature: "you", targetOther: true, noncombatOnly: true } }],
      asylum: [{ op: prevent, scope: { side: "any", targetCreature: "you", noncombatOnly: true } }],
      matrix: [{ op: prevent, scope: { side: "any", targetCreature: "any" } }],
      sanction: [{ op: prevent, scope: { side: "source", controller: "you", targetCreature: "you" } }],
    });
  });

  it("⭐ Dolmen Gate, Iroas, Crystal Barricade, Tajic, Mark of Asylum, Inner Sanctum, Bubble Matrix and Light of Sanction classify native", () => {
    for (const c of [GATE, IROAS, BARRICADE, TAJIC, ASYLUM, SANCTUM, MATRIX, SANCTION]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — a duration, a qualifier the reader doesn't know or a player recipient stays unread", () => {
    for (const oracle of [
      "Prevent all damage that would be dealt to creatures this turn.",
      "Prevent all combat damage that would be dealt to blocking creatures you control.",
      "Prevent all damage that would be dealt to creatures you control with flying.",
      "Prevent all damage that would be dealt to you and creatures you control.",
      "Prevent all combat damage that would be dealt to attacking creatures you control during your turn.",
    ]) expect([oracle, parseDamageReplacements({ name: "Probe", type: "Enchantment", oracle })]).toEqual([oracle, []]);
  });
});

describe("RUNTIME — Dolmen Gate (combat damage to attacking creatures you control)", () => {
  it("⭐ the user's attacking Hill Giant blocked by a Craw Wurm takes nothing and survives; the Wurm takes its 3", () => {
    const s = resolveCombatDamage(table({ user: [P("gate", GATE, "user"), P("atk", GIANT, "user")], ai: [P("blk", WURM, "ai")],
      combat: { attackers: [attack("atk")], blockers: [block("blk", "atk")] } }));
    expect({ giant: alive(s, "atk"), giantMarked: marked(s, "atk"), wurmMarked: marked(s, "blk") }).toEqual({ giant: true, giantMarked: 0, wurmMarked: 3 });
  });

  it("⭐ a deathtouch + lifelink blocker (Vampire Nighthawk): no kill, no life gained", () => {
    const s = resolveCombatDamage(table({ user: [P("gate", GATE, "user"), P("atk", GIANT, "user")], ai: [P("blk", NIGHTHAWK, "ai")],
      combat: { attackers: [attack("atk")], blockers: [block("blk", "atk")] } }));
    expect({ giant: alive(s, "atk"), aiLife: s.players.ai.life, nighthawk: alive(s, "blk") }).toEqual({ giant: true, aiLife: 20, nighthawk: false });
  });

  it("⭐ CR 616.1 — beside an opposing Torbran, the user orders the prevention first: the red blocker's 3 + 2 is all prevented", () => {
    const s = resolveCombatDamage(table({ user: [P("gate", GATE, "user"), P("atk", WURM, "user")], ai: [P("torbran", TORBRAN, "ai"), P("blk", GIANT, "ai")],
      combat: { attackers: [attack("atk")], blockers: [block("blk", "atk")] } }));
    expect({ wurm: alive(s, "atk"), wurmMarked: marked(s, "atk") }).toEqual({ wurm: true, wurmMarked: 0 });
  });

  it("control — noncombat damage to the attacking creature is not prevented (the combat qualifier)", () => {
    const s = zap(table({ user: [P("gate", GATE, "user"), P("atk", GIANT, "user")], combat: { attackers: [attack("atk")], blockers: [] } }), "ai", 2, ["atk"]);
    expect(marked(s, "atk")).toBe(2);
  });

  it("control — the user's BLOCKING creature takes combat damage; the opponent's attacker is not protected", () => {
    const s = resolveCombatDamage(table({ user: [P("gate", GATE, "user"), P("blk", BEARS, "user")], ai: [P("atk", GIANT, "ai")], active: "ai",
      combat: { attackers: [attack("atk", "ai", "user")], blockers: [block("blk", "atk", "user")] } }));
    expect({ bears: alive(s, "blk"), giantMarked: marked(s, "atk") }).toEqual({ bears: false, giantMarked: 2 });
  });

  it("control — under Frenzied Baloth (combat damage can't be prevented, CR 615.12) the Giant dies as before", () => {
    const s = resolveCombatDamage(table({ user: [P("gate", GATE, "user"), P("atk", GIANT, "user")], ai: [P("blk", WURM, "ai"), P("baloth", BALOTH, "ai")],
      combat: { attackers: [attack("atk")], blockers: [block("blk", "atk")] } }));
    expect(alive(s, "atk")).toBe(false);
  });
});

describe("RUNTIME — Iroas, God of Victory (ALL damage to attacking creatures you control)", () => {
  it("⭐ the ruling: noncombat damage to an attacking creature is prevented too", () => {
    const s = zap(table({ user: [P("iroas", IROAS, "user"), P("atk", GIANT, "user")], combat: { attackers: [attack("atk")], blockers: [] } }), "ai", 2, ["atk"]);
    expect(marked(s, "atk")).toBe(0);
  });

  it("⭐ combat damage from a deathtouch + lifelink blocker and a second blocker (Iroas grants menace): the attacker lives, no life gained", () => {
    const s = resolveCombatDamage(table({ user: [P("iroas", IROAS, "user"), P("atk", GIANT, "user")], ai: [P("blk", NIGHTHAWK, "ai"), P("blk2", BEARS, "ai")],
      combat: { attackers: [attack("atk")], blockers: [block("blk", "atk"), block("blk2", "atk")] } }));
    expect({ giant: alive(s, "atk"), giantMarked: marked(s, "atk"), aiLife: s.players.ai.life }).toEqual({ giant: true, giantMarked: 0, aiLife: 20 });
  });

  it("control — outside combat nothing is attacking: the same 2 damage is marked", () => {
    const s = zap(table({ user: [P("iroas", IROAS, "user"), P("bears", GIANT, "user")] }), "ai", 2, ["bears"]);
    expect(marked(s, "bears")).toBe(2);
  });

  it("control — a non-attacking creature of the user's during combat takes the damage", () => {
    const s = zap(table({ user: [P("iroas", IROAS, "user"), P("atk", GIANT, "user"), P("home", BEARS, "user")], combat: { attackers: [attack("atk")], blockers: [] } }), "ai", 1, ["home"]);
    expect(marked(s, "home")).toBe(1);
  });
});

describe("RUNTIME — Crystal Barricade / Tajic (noncombat damage to OTHER creatures you control)", () => {
  it("⭐ the ruling: a 4-damage sweep kills the Barricade and still spares the user's other creature; the opponent's dies", () => {
    const s = zap(table({ user: [P("wall", BARRICADE, "user"), P("bears", BEARS, "user")], ai: [P("their", BEARS, "ai")] }), "ai", 4, "each");
    expect({ wall: alive(s, "wall"), bears: alive(s, "bears"), bearsMarked: marked(s, "bears"), theirs: alive(s, "their") }).toEqual({ wall: false, bears: true, bearsMarked: 0, theirs: false });
  });

  it("⭐ Tajic: a targeted 2 at another creature of Tajic's controller is prevented; Tajic itself takes it", () => {
    const t = table({ user: [P("tajic", TAJIC, "user"), P("bears", BEARS, "user")] });
    expect([marked(zap(t, "ai", 1, ["bears"]), "bears"), marked(zap(t, "ai", 1, ["tajic"]), "tajic")]).toEqual([0, 1]);
  });

  it("control — combat damage to another creature the user controls is not prevented (the noncombat qualifier)", () => {
    const s = resolveCombatDamage(table({ user: [P("wall", BARRICADE, "user"), P("blk", BEARS, "user")], ai: [P("atk", GIANT, "ai")], active: "ai",
      combat: { attackers: [attack("atk", "ai", "user")], blockers: [block("blk", "atk", "user")] } }));
    expect(alive(s, "blk")).toBe(false);
  });
});

describe("RUNTIME — the twins", () => {
  it("⭐ Mark of Asylum: noncombat damage to every creature its controller controls is prevented; the opponent's is not", () => {
    const s = zap(table({ user: [P("mark", ASYLUM, "user"), P("bears", GIANT, "user")], ai: [P("their", GIANT, "ai")] }), "user", 2, "each");
    expect([marked(s, "bears"), marked(s, "their")]).toEqual([0, 2]);
  });

  it("⭐ Inner Sanctum: combat damage to a creature its controller controls is prevented too", () => {
    const s = resolveCombatDamage(table({ user: [P("sanctum", SANCTUM, "user"), P("blk", BEARS, "user")], ai: [P("atk", GIANT, "ai")], active: "ai",
      combat: { attackers: [attack("atk", "ai", "user")], blockers: [block("blk", "atk", "user")] } }));
    expect({ bears: alive(s, "blk"), bearsMarked: marked(s, "blk") }).toEqual({ bears: true, bearsMarked: 0 });
  });

  it("⭐ Bubble Matrix: every player's creatures — a sweep marks nothing on either side", () => {
    const s = zap(table({ user: [P("matrix", MATRIX, "user"), P("bears", GIANT, "user")], ai: [P("their", GIANT, "ai")] }), "ai", 2, "each");
    expect([marked(s, "bears"), marked(s, "their")]).toEqual([0, 0]);
  });

  it("⭐ Light of Sanction: the user's own source is prevented on the user's creature; the opponent's source is not", () => {
    const t = table({ user: [P("light", SANCTION, "user"), P("bears", GIANT, "user")] });
    expect([marked(zap(t, "user", 2, ["bears"]), "bears"), marked(zap(t, "ai", 2, ["bears"]), "bears")]).toEqual([0, 2]);
  });

  it("control — a player is not a creature: a prevention wall never touches damage to a player", () => {
    const t = table({ user: [P("matrix", MATRIX, "user"), P("mark", ASYLUM, "user")] });
    expect(applyDamageReplacements(t, { sourceId: null, sourceController: "ai", amount: 3, targetKind: "player", targetId: "user", isCombat: false })).toEqual({ amount: 3, prevented: false });
  });
});
