/**
 * KICKED-SPELL-EFFECT (CR 702.33e) — an instant/sorcery whose kicked payoff is an ADDITIVE extra effect:
 * "<base>. If this spell was kicked, <extra>." (Runic Shot "Destroy target tapped creature. If this spell was
 * kicked, scry 2.", Blink of an Eye, Dismantling Blow, Phyrexian Espionage, Hurloon Battle Hymn, Vastwood
 * Surge …). The base atom(s) ALWAYS run; the kicked atom(s) — stamped `kickedOnly` by the parser — run ONLY
 * when the spell was cast kicked.
 *
 * End-to-end the engine GENUINELY runs both casts: legalChoices emits a normal cast + (when the kicker mana is
 * also affordable on top of the base) a kicked cast (kicker pips folded into the cost, same target combo since
 * the kicked atoms are targetless); actionDispatcher threads `kicked` onto the EFFECT_PROGRAM payload;
 * runEffectProgram skips the `kickedOnly` atoms on a normal cast and runs them on a kicked cast — even across a
 * base-atom resolution PAUSE (a scry/tutor), because `kicked` rides the resume.
 *
 * CREED-critical: a NOT-kicked cast fires the BASE ONLY (the kicked atoms are never resolved — no fabricated
 * effect); a kicked cast fires base + the kicked tail exactly once; and every DEFERRED shape (an "instead"
 * replacement that is neither a magnitude swap nor a whole clause / a back-reference scaler / an {X} or "and/or" or
 * non-mana kicker / an "another target" tail) stays a single LOW program → arbiter-spell, never a fabricated native
 * credit. (The kicked-only chosen target graduated in shelf D8 — see kickedTargetVariants.test.js.)
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) whose kicked payoff IS an additive modeled atom ─────
const RUNIC_SHOT = { name: "Runic Shot", type: "Sorcery", mana: "{W}",
  oracle: "Kicker {U} (You may pay an additional {U} as you cast this spell.)\nDestroy target tapped creature. If this spell was kicked, scry 2." };
const BLINK_OF_AN_EYE = { name: "Blink of an Eye", type: "Instant", mana: "{1}{U}",
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." };
const INTO_THE_ROIL = { name: "Into the Roil", type: "Instant", mana: "{1}{U}",
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." };
const WHOOSH = { name: "Whoosh!", type: "Instant", mana: "{1}{U}",
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." };
const DISMANTLING_BLOW = { name: "Dismantling Blow", type: "Instant", mana: "{2}{W}",
  oracle: "Kicker {2}{U} (You may pay an additional {2}{U} as you cast this spell.)\nDestroy target artifact or enchantment. If this spell was kicked, draw two cards." };
const PHYREXIAN_ESPIONAGE = { name: "Phyrexian Espionage", type: "Sorcery", mana: "{2}{U}",
  oracle: "Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nDraw two cards. If this spell was kicked, each opponent discards a card." };
const HURLOON_BATTLE_HYMN = { name: "Hurloon Battle Hymn", type: "Instant", mana: "{2}{R}",
  oracle: "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nHurloon Battle Hymn deals 4 damage to target creature or planeswalker. If this spell was kicked, you gain 4 life." };
const TOLARIAN_GEYSER = { name: "Tolarian Geyser", type: "Sorcery", mana: "{2}{U}",
  oracle: "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nReturn target creature to its owner's hand. Draw a card. If this spell was kicked, you gain 3 life." };
const VASTWOOD_SURGE = { name: "Vastwood Surge", type: "Sorcery", mana: "{3}{G}",
  oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nSearch your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. If this spell was kicked, put two +1/+1 counters on each creature you control." };

const ALL_NATIVE = [RUNIC_SHOT, BLINK_OF_AN_EYE, INTO_THE_ROIL, WHOOSH, DISMANTLING_BLOW, PHYREXIAN_ESPIONAGE, HURLOON_BATTLE_HYMN, TOLARIAN_GEYSER, VASTWOOD_SURGE];

// ── Parser / coverage ───────────────────────────────────────────────────────────────────────────────
describe("KICKED-SPELL-EFFECT coverage — additive kicked spells classify native-spell", () => {
  for (const c of ALL_NATIVE) {
    it(`${c.name} → native-spell`, () => {
      expect(classifyCard(c)).toBe("native-spell");
      expect(isNativeTier(classifyCard(c))).toBe(true);
    });
  }
  it("parses base atoms then a kickedOnly tail (Runic Shot: destroy + kickedOnly scry)", () => {
    const p = parseEffectProgram(RUNIC_SHOT);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["destroy", "scry"]);
    expect(p.atoms.map((a) => !!a.kickedOnly)).toEqual([false, true]); // base runs always; scry only when kicked
    // the kickedOnly atom is TARGETLESS — the cast path's one target set serves both casts
    expect(programNeedsChosenTarget(p)).toBe(true); // the base destroy needs a target
  });
  it("a multi-atom base keeps its order, then the kicked tail (Tolarian Geyser: bounce, draw, kickedOnly gain-life)", () => {
    const p = parseEffectProgram(TOLARIAN_GEYSER);
    expect(p.atoms.map((a) => a.op)).toEqual(["bounce", "draw", "gain-life"]);
    expect(p.atoms.map((a) => !!a.kickedOnly)).toEqual([false, false, true]);
  });
});

describe("KICKED-SPELL-EFFECT CREED anti-FP — deferred shapes stay arbiter-spell", () => {
  it("⭐⭐ RE-POINTED — a MAGNITUDE-only replacement graduated; every other replacement still refuses", () => {
    // This assertion's stated reason was "a conditional-replacement model we don't have" — a CAPABILITY pin,
    // which graduates once the model exists and is then RE-POINTED rather than deleted. The model is
    // `nonKickedOnly`, the exact mirror of `kickedOnly`: base and kicked clause become two MUTUALLY EXCLUSIVE
    // atoms, so precisely one resolves per cast, which is what "instead" means (CR 614).
    //
    // ⭐ Burst Lightning graduated because its tail restates the SAME op with a bigger number, so the kicked
    // atom is a CLONE of the base with one field swapped — op, targetType and restrictions identical by
    // construction, never re-parsed from the elliptical printed phrase ("it deals 4 damage instead" names no
    // target at all, so an independent parse would either fail or invent one).
    const burst = { name: "Burst Lightning", type: "Instant", mana: "{R}", oracle: "Kicker {4}\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." };
    expect(classifyCard(burst)).toBe("native-spell");
    expect(parseEffectProgram(burst).atoms.map((a) => [a.amount, !!a.nonKickedOnly, !!a.kickedOnly]))
      .toEqual([[2, true, false], [4, false, true]]);

    // ⭐ MOVED (shelf D8), as this marker asked. Field Research ("draw two cards … draw three cards instead") was
    // the magnitude shape on an op the clone arm does not cover. It graduated through the WHOLE replacement
    // instead: "draw three cards" is a complete clause, so it is PARSED on its own rather than cloned — the base
    // stamped nonKickedOnly, the clause kickedOnly.
    const fieldResearch = { name: "Field Research", type: "Sorcery", mana: "{2}{U}", oracle: "Kicker {2}{U}\nDraw two cards. If this spell was kicked, draw three cards instead." };
    expect(classifyCard(fieldResearch)).toBe("native-spell");
    expect(parseEffectProgram(fieldResearch).atoms.map((a) => [a.op, a.amount, !!a.nonKickedOnly, !!a.kickedOnly]))
      .toEqual([["draw", 2, true, false], ["draw", 3, false, true]]);
    // ⛔ The marker's new home: a replacement over a TWO-sentence base still refuses — nothing says which sentence
    // "instead" replaces (the clone arm needs one atom; the whole replacement needs one sentence).
    expect(classifyCard({ name: "Fake Two Sentences", type: "Sorcery", mana: "{2}{U}", oracle: "Kicker {2}\nDraw a card. Scry 1. If this spell was kicked, draw two cards instead." })).toBe("arbiter-spell");
  });

  it("⛔ a replacement carrying an EXTRA RIDER still refuses — the lossy-tail direction", () => {
    // Urza's Rage adds "and the damage can't be prevented"; Colossal Growth adds trample and haste. On a
    // REPLACEMENT an unread rider makes the kicked mode UNDER-deliver while the card reads native, so the
    // tail anchor must match the whole clause or not at all.
    expect(classifyCard({ name: "Urza's Rage", type: "Instant", mana: "{2}{R}", oracle: "Kicker {8}{R}\nUrza's Rage deals 3 damage to any target. If this spell was kicked, instead it deals 10 damage to that permanent or player and the damage can't be prevented." })).toBe("arbiter-spell");
  });
  it("a back-reference kicked clause ('that creature'/'it deals') stays arbiter-spell (Jilt)", () => {
    expect(classifyCard({ name: "Jilt", type: "Instant", mana: "{1}{U}", oracle: "Kicker {1}{R}\nReturn target creature to its owner's hand. If this spell was kicked, it deals 2 damage to another target creature." })).toBe("arbiter-spell");
  });
  it("an {X} kicker / cost stays arbiter-spell (Illuminate — also and/or)", () => {
    expect(classifyCard({ name: "Illuminate", type: "Sorcery", mana: "{X}{R}", oracle: "Kicker {2}{R} and/or {3}{U}\nIlluminate deals X damage to target creature. If this spell was kicked with its {2}{R} kicker, it deals X damage to that creature's controller." })).toBe("arbiter-spell");
  });
  it("a non-mana 'Kicker—Sacrifice…' cost stays arbiter-spell (Bog Down)", () => {
    expect(classifyCard({ name: "Bog Down", type: "Sorcery", mana: "{2}{B}", oracle: "Kicker—Sacrifice two lands.\nTarget player discards two cards. If this spell was kicked, that player discards three cards instead." })).toBe("arbiter-spell");
  });
  it("an UNMODELED kicked effect drops the WHOLE card to arbiter-spell (base modeled, kicked tail not)", () => {
    // base "Draw a card" is HIGH, but the kicked tail parses LOW → whole card LOW.
    // RE-POINTED (shelf D8): the old tail, "exile target player's graveyard", has parsed HIGH for a while — this pin
    // was held by the kicked-only-TARGET gate, not by an unmodeled tail. That gate graduated (the kicked cast now
    // chooses its own target), so the pin takes a tail that is genuinely unmodeled.
    expect(classifyCard({ name: "Fake Kicker", type: "Sorcery", mana: "{1}{U}", oracle: "Kicker {2}\nDraw a card. If this spell was kicked, each player shuffles their hand into their library." })).toBe("arbiter-spell");
  });
  it("an UNMODELED base drops the whole card to arbiter-spell even if the kicked tail is modeled", () => {
    expect(classifyCard({ name: "Fake Base", type: "Sorcery", mana: "{1}{U}", oracle: "Kicker {2}\nUntap all Forests you control. If this spell was kicked, draw a card." })).toBe("arbiter-spell");
  });
  it("⭐ GRADUATED (shelf D8) — a kicked clause with its OWN chosen target; 'another target' still defers", () => {
    // This pinned the kicked-only target as deferred: "a kicked-only target the shared enumeration can't bind". Casts
    // are enumerated per kick now (CR 702.33g — the target is chosen only if the spell was kicked), so the capability
    // pin graduates and is RE-POINTED. The runtime split is witnessed on Probe in kickedTargetVariants.test.js.
    expect(classifyCard({ name: "Fake Kicked Target", type: "Sorcery", mana: "{1}{B}", oracle: "Kicker {2}\nDraw a card. If this spell was kicked, destroy target creature." })).toBe("native-spell");
    // ⛔ "another target" must differ from the base's target, and nothing enforces distinctness ACROSS atoms.
    expect(classifyCard({ name: "Fake Another", type: "Sorcery", mana: "{1}{B}", oracle: "Kicker {2}\nReturn target creature to its owner's hand. If this spell was kicked, destroy another target creature." })).toBe("arbiter-spell");
  });
  it("a kicked clause printed FIRST (not a suffix) is deferred — reordering could mis-resolve a count-reading base (Fires of Victory)", () => {
    // base damage "equal to the number of cards in your hand" reads a count the kicked draw mutates; running
    // base-before-kicked would deal pre-draw damage, so the kicked-FIRST shape stays arbiter-spell (SAFE FN, CREED).
    expect(classifyCard({ name: "Fires of Victory", type: "Instant", mana: "{1}{R}", oracle: "Kicker {2}{U}\nIf this spell was kicked, draw a card. Fires of Victory deals damage to target creature or planeswalker equal to the number of cards in your hand." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Protect the Negotiators", type: "Instant", mana: "{1}{U}", oracle: "Kicker {W}\nIf this spell was kicked, create a 1/1 white Soldier creature token.\nCounter target spell unless its controller pays {1} for each creature you control." })).toBe("arbiter-spell");
  });
});

// ── Runtime: cast → resolve ─────────────────────────────────────────────────────────────────────────
function mainState() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
}
function setup({ hand = [], mana = {}, lib = [], board = [], oppBoard = [], oppHand = [] } = {}) {
  const s = mainState();
  return { ...s, players: { ...s.players,
    user: { ...s.players.user, hand, library: lib, battlefield: board, manaPool: { ...s.players.user.manaPool, ...mana } },
    ai: { ...s.players.ai, battlefield: oppBoard, hand: oppHand },
  } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");
function drainStack(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
function driveAll(s) {
  let g = 0;
  while (g++ < 40) {
    if (s.stack && s.stack.length) { s = resolveTopOfStack(s); continue; }
    if (s.pendingChoice?.kind === "tutor-search") { s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice)); continue; }
    break;
  }
  return s;
}
const tappedVictim = () => createPermanent({ id: "v1", card: { name: "Grizzly Bears", id: "vc", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai", tapped: true });

describe("KICKED-SPELL-EFFECT runtime — legalChoices emits both casts; only normal when kicker unaffordable", () => {
  it("offers a normal ({W}) AND a kicked ({W}{U}) cast when the kicker is affordable; same target", () => {
    const s = setup({ hand: [{ ...RUNIC_SHOT, id: "c1" }], mana: { W: 1, U: 1 }, oppBoard: [tappedVictim()] });
    const mine = casts(s).filter((a) => a.cardId === "c1");
    expect(mine.map((a) => a.kicked).sort()).toEqual([false, true]);
    const kicked = mine.find((a) => a.kicked === true);
    const normal = mine.find((a) => a.kicked === false);
    expect(kicked.cmc).toBe(2);            // CR 202.3b — MV counts the kicker paid ({W} + {U})
    expect(normal.cmc).toBe(1);
    expect(kicked.cost.U).toBe(1);         // kicker pip folded into the cost
    expect(kicked.targetName).toBe("Grizzly Bears");
    expect(normal.targetName).toBe("Grizzly Bears");
  });
  it("offers ONLY the normal cast when the kicker is unaffordable", () => {
    const s = setup({ hand: [{ ...RUNIC_SHOT, id: "c1" }], mana: { W: 1 }, oppBoard: [tappedVictim()] });
    expect(casts(s).filter((a) => a.cardId === "c1").map((a) => a.kicked)).toEqual([false]);
  });
});

describe("KICKED-SPELL-EFFECT runtime — Runic Shot destroys always; scrys ONLY when kicked", () => {
  it("KICKED → destroys the creature AND scrys 2", () => {
    let s = setup({ hand: [{ ...RUNIC_SHOT, id: "c1" }], mana: { W: 1, U: 1 },
      lib: [{ id: "L1", name: "Forest", type: "Land" }, { id: "L2", name: "Island", type: "Land" }], oppBoard: [tappedVictim()] });
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Grizzly Bears");
    expect(s.pendingChoice?.kind).toBe("scry-surveil"); // the kicked scry paused for the reorder
    expect(s.pendingChoice?.cards?.length).toBe(2);
  });
  it("NOT kicked → destroys the creature, NO scry pause (the kicked atom never resolves)", () => {
    let s = setup({ hand: [{ ...RUNIC_SHOT, id: "c1" }], mana: { W: 1 },
      lib: [{ id: "L1", name: "Forest", type: "Land" }], oppBoard: [tappedVictim()] });
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Grizzly Bears");
    expect(s.pendingChoice).toBeFalsy();         // CREED — the kickedOnly scry was skipped
    expect(s.players.user.library.length).toBe(1); // library untouched (no scry look)
  });
});

describe("KICKED-SPELL-EFFECT runtime — Blink of an Eye bounces always; draws ONLY when kicked", () => {
  const bounceVictim = () => createPermanent({ id: "v1", card: { name: "Ornithopter", id: "oc", type: "Artifact Creature — Thopter", power: 0, toughness: 2, oracle: "" }, controller: "ai" });
  it("KICKED → bounces the permanent AND draws a card", () => {
    // {1}{U} base + {1}{U} kicker = {2}{U}{U} → 2 generic + 2 U.
    let s = setup({ hand: [{ ...BLINK_OF_AN_EYE, id: "c1" }], mana: { U: 2, C: 2 },
      lib: [{ id: "D1", name: "Card", type: "Instant", oracle: "" }], oppBoard: [bounceVictim()] });
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Ornithopter");
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Ornithopter"); // returned to owner's hand
    expect(s.players.user.hand.length).toBe(1);  // the kicked draw
  });
  it("NOT kicked → bounces the permanent, draws NOTHING", () => {
    let s = setup({ hand: [{ ...BLINK_OF_AN_EYE, id: "c1" }], mana: { U: 1, C: 1 },
      lib: [{ id: "D1", name: "Card", type: "Instant", oracle: "" }], oppBoard: [bounceVictim()] });
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    expect(normal).toBeTruthy();
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Ornithopter");
    expect(s.players.user.hand.length).toBe(0);  // CREED — no kicked draw
    expect(s.players.user.library.length).toBe(1);
  });
});

describe("KICKED-SPELL-EFFECT runtime — Phyrexian Espionage draws always; each-opp discard ONLY when kicked", () => {
  it("KICKED → draws two AND each opponent discards", () => {
    let s = setup({ hand: [{ ...PHYREXIAN_ESPIONAGE, id: "c1" }], mana: { U: 2, B: 1, C: 2 },
      lib: [{ id: "D1", name: "A", type: "Land" }, { id: "D2", name: "B", type: "Land" }],
      oppHand: [{ id: "AH1", name: "AiCard", type: "Instant", oracle: "" }] });
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.user.hand.length).toBe(2);  // drew two
    expect(s.players.ai.hand.length).toBe(0);    // the lone opponent discarded
  });
  it("NOT kicked → draws two, opponent does NOT discard", () => {
    let s = setup({ hand: [{ ...PHYREXIAN_ESPIONAGE, id: "c1" }], mana: { U: 2, C: 1 },
      lib: [{ id: "D1", name: "A", type: "Land" }, { id: "D2", name: "B", type: "Land" }],
      oppHand: [{ id: "AH1", name: "AiCard", type: "Instant", oracle: "" }] });
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.user.hand.length).toBe(2);
    expect(s.players.ai.hand.length).toBe(1);    // CREED — opponent's hand untouched
  });
});

describe("KICKED-SPELL-EFFECT runtime — the kicked tail runs even across a BASE-atom pause (resume threads `kicked`)", () => {
  const myCreature = () => createPermanent({ id: "m1", card: { name: "Bear", id: "bc", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
  it("Vastwood Surge KICKED → tutor (pauses) fetches lands, THEN the kicked +1/+1 counters land on resume", () => {
    let s = setup({ hand: [{ ...VASTWOOD_SURGE, id: "c1" }], mana: { G: 8 },
      lib: [{ id: "F1", name: "Forest", type: "Basic Land — Forest" }, { id: "F2", name: "Forest", type: "Basic Land — Forest" }], board: [myCreature()] });
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    s = driveAll(dispatchAction(s, kicked));
    expect(s.players.user.battlefield.filter((p) => /Forest/.test(p.card.name)).length).toBe(2);
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Bear");
    expect(bear.counters?.["+1/+1"]).toBe(2); // the kickedOnly tail ran AFTER the tutor pause resumed
  });
  it("Vastwood Surge NOT kicked → tutor fetches, NO counters added", () => {
    let s = setup({ hand: [{ ...VASTWOOD_SURGE, id: "c1" }], mana: { G: 4 },
      lib: [{ id: "F1", name: "Forest", type: "Basic Land — Forest" }], board: [myCreature()] });
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    s = driveAll(dispatchAction(s, normal));
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Bear");
    expect(bear.counters?.["+1/+1"] || 0).toBe(0); // CREED — no kicked counters
  });
});

describe("KICKED-SPELL-EFFECT runtime — the AI pays the kicker when affordable (decide-by-value)", () => {
  function aiPick(mana, oppBoard = []) {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...b, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: { ...b.players,
        ai: { ...b.players.ai, hand: [{ ...HURLOON_BATTLE_HYMN, id: "c1" }], manaPool: { ...b.players.ai.manaPool, R: mana, W: mana } },
        user: { ...b.players.user, battlefield: oppBoard } } };
    return pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
  }
  it("picks the KICKED cast (deal 4 + gain 4) when the kicker is affordable", () => {
    const enemy = createPermanent({ id: "e1", card: { name: "Bear", id: "bc", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    expect(aiPick(3, [enemy])).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: true });
  });
});
