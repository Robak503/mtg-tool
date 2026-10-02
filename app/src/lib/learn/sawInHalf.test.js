/**
 * sawInHalf.test.js — Saw in Half (play-weighted #582): "Destroy target creature. If that creature dies this way, its controller
 * creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is
 * half that creature's toughness. Round up each time."
 *
 * ONE destroy atom carrying a `diesCopyRider` (effects/atoms/destroyDiesCopy.js), resolved by removal.applyDestroyDiesCopy: the
 * shared destroy, then — only if the creature died this way (CR 700.4, 701.8a) — two token copies made by the shared token-copy
 * minter from the creature's last known information (CR 608.2h): its controller, its copiable values (CR 707.2) and its power
 * and toughness, halved and rounded up as part of the copy effect (CR 707.9b), so a P/T characteristic-defining ability is not
 * copied (CR 707.9d).
 *
 * The 2025-09-19 rulings (bundled Scryfall) witnessed here: the power and toughness used are the creature's as it last existed on
 * the battlefield (counters, pumps and anthems included); not destroyed (indestructible) or destroyed into exile by a replacement
 * → no tokens; a creature copying something is copied as what it copied; only the copiable values are copied (no counters, no
 * pump, no tapped status); a token is copied as its creating effect defined it; a P/T characteristic-defining ability is not
 * copied; the copies' enters-the-battlefield abilities trigger.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01). Every spell and ability is cast or
 * activated for real (legal action → dispatch → resolve). Counters and a library are placed on the board directly. The two
 * blocks marked SYNTHETIC say so in their headers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { addContinuousEffect, deriveCharacteristics } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures ──
const SAW = {"name":"Saw in Half","type":"Instant","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time."}; // native-spell (arbiter-spell before this slice)
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const DARKSTEEL_MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // native-body
const DRUDGE = {"name":"Drudge Skeletons","type":"Creature — Skeleton","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":["Heal","Regenerate"],"colors":["B"],"oracle":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)"}; // native-activated
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, draw a card."}; // native-trigger
const TARMOGOYF = {"name":"Tarmogoyf","type":"Creature — Lhurgoyf","mana":"{1}{G}","cmc":2,"power":"*","toughness":"1+*","keywords":[],"colors":["G"],"oracle":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1."}; // native-static
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."}; // native-mixed
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."}; // native-static
const GIANT_GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const BEAST_WITHIN = {"name":"Beast Within","type":"Instant","mana":"{2}{G}","cmc":3,"keywords":[],"colors":["G"],"oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token."}; // native-spell
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const PROCESSION = {"name":"Anointed Procession","type":"Enchantment","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."}; // native-static
const IMPOSSIBLE_MAN = {"name":"Impossible Man","type":"Legendary Creature — Alien Shapeshifter","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying\n{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man."}; // native-activated
const COLOSSUS = {"name":"Darksteel Colossus","type":"Artifact Creature — Golem","mana":"{11}","cmc":11,"power":"11","toughness":"11","keywords":["Indestructible","Trample"],"colors":[],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead."}; // native-body
const QUICKSILVER = {"name":"Quicksilver Gargantuan","type":"Creature — Shapeshifter","mana":"{5}{U}{U}","cmc":7,"power":"7","toughness":"7","keywords":[],"colors":["U"],"oracle":"You may have this creature enter as a copy of any creature on the battlefield, except it's 7/7."}; // native-clone
const TRAVELER = {"name":"Doomed Traveler","type":"Creature — Human Soldier","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"When this creature dies, create a 1/1 white Spirit creature token with flying."}; // native-trigger
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Return target creature to its owner's hand."}; // native-spell
const SHRINK = {"name":"Shrink","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets -5/-0 until end of turn."}; // native-spell
const MARSHAL = {"name":"Benalish Marshal","type":"Creature — Human Knight","mana":"{W}{W}{W}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["W"],"oracle":"Other creatures you control get +1/+1."}; // native-static

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
const library = (prefix) => [1, 2, 3, 4].map((i) => ({ ...BEARS, id: `${prefix}${i}` }));
const MANA = { W: 3, U: 6, B: 6, R: 3, G: 3, C: 12 };
/** A two-player board in the user's precombat main phase; both seats hold mana for anything this file casts. */
function board({ user = [], ai = [], userHand = [], userGy = [], aiGy = [], aiCommand = null, base = null } = {}) {
  const s = base || createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: userHand, graveyard: userGy, manaPool: { ...s.players.user.manaPool, ...MANA }, library: library("ul") },
      ai: { ...s.players.ai, battlefield: ai, graveyard: aiGy, manaPool: { ...s.players.ai.manaPool, ...MANA }, library: library("al"), ...(aiCommand ? { command: aiCommand } : {}) } } };
}
const castAction = (s, pid, cardId, targetId = null) => {
  const act = legalActionsForPlayer(s, pid).find((a) => a.kind === "cast-spell" && a.cardId === cardId && (targetId == null || a.targets?.[0]?.id === targetId));
  expect(act, `${pid} can cast ${cardId}${targetId ? ` at ${targetId}` : ""}`).toBeTruthy();
  return act;
};
/** Cast `cardId` from `pid`'s hand through the real legal-action offer (aimed at `targetId`, when given) and resolve it. */
const cast = (s, pid, cardId, targetId = null) => resolveTopOfStack(dispatchAction(s, castAction(s, pid, cardId, targetId)));
/** Resolve whatever the resolutions left on the stack (the copies' own triggers, a dies trigger). */
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 30 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
const pt = (s, perm) => `${creaturePower(perm, s)}/${creatureToughness(perm, s)}`;
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.token);
/** The board row a witness compares: every token `pid` controls as name + P/T, sorted. */
const tokenRow = (s, pid) => tokensOf(s, pid).map((p) => `${p.card.name} ${pt(s, p)}`).sort();
const sawUser = (extra = {}) => board({ ...extra, userHand: [{ ...SAW, id: "saw" }, ...(extra.userHand || [])] });

describe("classification and parse", () => {
  it("⭐ Saw in Half → native-spell", () => {
    expect(classifyCard(SAW)).toBe("native-spell");
  });

  it("the whole oracle is ONE destroy atom carrying the dies-this-way copy rider", () => {
    const prog = parseEffectProgram(SAW);
    expect({ confidence: prog.confidence, atoms: prog.atoms, tail: prog.unparsedTail }).toEqual({
      confidence: "high",
      atoms: [{ op: "destroy", targetType: "creature", restrictions: [], diesCopyRider: { count: 2 } }],
      tail: null,
    });
  });
});

describe("RUNTIME — the creature dies, its controller gets two half-size copies", () => {
  it("⭐ an opponent's tapped 3/3 Hill Giant: two untapped 2/2 Hill Giant tokens for the OPPONENT, the Giant in its graveyard", () => {
    const s0 = sawUser({ ai: [P("hg", "ai", HILL_GIANT, { tapped: true })] });
    const s = cast(s0, "user", "saw", "hg");
    const toks = tokensOf(s, "ai");
    const row = {
      ai: tokenRow(s, "ai"),
      user: tokenRow(s, "user"),
      base: toks.map((p) => { const c = deriveCharacteristics(s, p.id); return `${c.basePower}/${c.baseToughness}`; }),
      tapped: toks.map((p) => p.tapped),
      type: [...new Set(toks.map((p) => p.card.type))],
      giantInGraveyard: s.players.ai.graveyard.map((c) => c.name),
      sawInGraveyard: s.players.user.graveyard.map((c) => c.name),
    };
    console.log("  WITNESS sawHillGiant", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai: ["Hill Giant 2/2", "Hill Giant 2/2"], user: [], base: ["2/2", "2/2"], tapped: [false, false], type: ["Creature — Giant"], giantInGraveyard: ["Hill Giant"], sawInGraveyard: ["Saw in Half"] });
  });

  it("⭐ the caster's own 2/2 Grizzly Bears: two 1/1 Bears for the caster (half of 2 is 1)", () => {
    const s = cast(sawUser({ user: [P("gb", "user", BEARS)] }), "user", "saw", "gb");
    expect({ user: tokenRow(s, "user"), ai: tokenRow(s, "ai") }).toEqual({ user: ["Grizzly Bears 1/1", "Grizzly Bears 1/1"], ai: [] });
  });

  it("⭐ round up each time: a 1/1 Elvish Visionary halves to 1/1, and each copy's own enters trigger draws its controller a card", () => {
    const s0 = sawUser({ ai: [P("ev", "ai", VISIONARY)] });
    const resolved = cast(s0, "user", "saw", "ev");
    const etbs = (resolved.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Elvish Visionary").length;
    const s = settle(resolved);
    const row = { ai: tokenRow(s, "ai"), etbs, aiDrew: s.players.ai.hand.length - s0.players.ai.hand.length, userDrew: s.players.user.hand.length - (s0.players.user.hand.length - 1) };
    console.log("  WITNESS sawVisionary", JSON.stringify(row));
    expect(row).toEqual({ ai: ["Elvish Visionary 1/1", "Elvish Visionary 1/1"], etbs: 2, aiDrew: 2, userDrew: 0 });
  });

  it("⭐ the death is real: Doomed Traveler's own dies trigger makes its Spirit beside the two Traveler copies", () => {
    const s = settle(cast(sawUser({ ai: [P("dt", "ai", TRAVELER)] }), "user", "saw", "dt"));
    expect(tokenRow(s, "ai")).toEqual(["Doomed Traveler 1/1", "Doomed Traveler 1/1", "Spirit 1/1"]);
  });

  it("⭐ last known P/T includes counters — a Hill Giant with two +1/+1 counters (5/5) makes 3/3s, and the copies carry no counters", () => {
    const s = cast(sawUser({ ai: [P("hg", "ai", HILL_GIANT, { counters: { "+1/+1": 2 } })] }), "user", "saw", "hg");
    expect({ ai: tokenRow(s, "ai"), counters: tokensOf(s, "ai").map((p) => p.counters) }).toEqual({ ai: ["Hill Giant 3/3", "Hill Giant 3/3"], counters: [{}, {}] });
  });

  it("⭐ last known P/T includes a pump — Giant Growth makes the Bears 5/5; the copies are 3/3 and the pump does not follow them", () => {
    const pumped = cast(sawUser({ user: [P("gb", "user", BEARS)], userHand: [{ ...GIANT_GROWTH, id: "gg" }] }), "user", "gg", "gb");
    expect(pt(pumped, findPermanent(pumped, "gb").permanent)).toBe("5/5");
    const s = cast(pumped, "user", "saw", "gb");
    expect(tokenRow(s, "user")).toEqual(["Grizzly Bears 3/3", "Grizzly Bears 3/3"]);
  });

  it("⭐ last known P/T includes an anthem — Glorious Anthem's 3/3 Bears make base-2/2 copies, which the anthem then makes 3/3", () => {
    const s = cast(sawUser({ user: [P("ga", "user", ANTHEM), P("gb", "user", BEARS)] }), "user", "saw", "gb");
    const toks = tokensOf(s, "user");
    expect({ user: tokenRow(s, "user"), base: toks.map((p) => { const c = deriveCharacteristics(s, p.id); return `${c.basePower}/${c.baseToughness}`; }) })
      .toEqual({ user: ["Grizzly Bears 3/3", "Grizzly Bears 3/3"], base: ["2/2", "2/2"] });
  });

  it("a negative last known power halves to a negative power (the copy effect sets it — CR 107.1b): Shrink's -2/3 Hill Giant makes -1/2s", () => {
    const shrunk = cast(sawUser({ ai: [P("hg", "ai", HILL_GIANT)], userHand: [{ ...SHRINK, id: "sh" }] }), "user", "sh", "hg");
    expect(pt(shrunk, findPermanent(shrunk, "hg").permanent)).toBe("-2/3");
    const s = cast(shrunk, "user", "saw", "hg");
    expect(tokenRow(s, "ai")).toEqual(["Hill Giant -1/2", "Hill Giant -1/2"]);
  });

  it("⭐ a TOKEN is copied as its creating effect defined it: Beast Within's 3/3 Beast makes two 2/2 Beasts (CR 111.12 does not apply to last known information)", () => {
    const withBeast = cast(sawUser({ ai: [P("hg", "ai", HILL_GIANT)], userHand: [{ ...BEAST_WITHIN, id: "bw" }] }), "user", "bw", "hg");
    const beast = tokensOf(withBeast, "ai")[0];
    expect(`${beast.card.name} ${pt(withBeast, beast)}`).toBe("Beast 3/3");
    const s = cast(withBeast, "user", "saw", beast.id);
    expect({ ai: tokenRow(s, "ai"), beastGone: !findPermanent(s, beast.id) }).toEqual({ ai: ["Beast 2/2", "Beast 2/2"], beastGone: true });
  });

  it("⭐ a LEGENDARY creature: two legendary 1/1 Isamaru tokens are created, and the legend rule leaves its controller one", () => {
    const s = cast(sawUser({ ai: [P("isa", "ai", ISAMARU)] }), "user", "saw", "isa");
    const minted = (s.log || []).filter((e) => e.effect === "create-token-copy").map((e) => e.count);
    expect({ minted, ai: tokenRow(s, "ai"), legendary: tokensOf(s, "ai").every((p) => /\bLegendary\b/.test(p.card.type)) })
      .toEqual({ minted: [2], ai: ["Isamaru, Hound of Konda 1/1"], legendary: true });
  });

  it("⭐ a COMMANDER dies too (it reaches the graveyard; CR 903.9a's return is a later state-based choice): the copies are not commanders", () => {
    const base = createGameState({ userDeck: [], aiDeck: [], aiCommanders: [{ ...ISAMARU, id: "c-isa" }] });
    const cmdCard = base.players.ai.command[0];
    expect(cmdCard.isCommander).toBe(true);
    const s0 = board({ base, ai: [createPermanent({ id: "isa", card: cmdCard, controller: "ai", summoningSick: false })], aiCommand: [], userHand: [{ ...SAW, id: "saw" }] });
    const s = cast(s0, "user", "saw", "isa");
    const toks = tokensOf(s, "ai");
    expect({ inGraveyard: s.players.ai.graveyard.map((c) => c.id), ai: tokenRow(s, "ai"), commanders: toks.map((p) => !!p.card.isCommander || p.card.commanderInstanceId != null) })
      .toEqual({ inGraveyard: ["c-isa"], ai: ["Isamaru, Hound of Konda 1/1"], commanders: [false] });
  });

  it("⭐ controller, not owner: the AI's Hill Giant, taken by the user's Act of Treason, makes its copies for the USER", () => {
    const taken = cast(sawUser({ ai: [P("hg", "ai", HILL_GIANT)], userHand: [{ ...ACT_OF_TREASON, id: "aot" }] }), "user", "aot", "hg");
    expect(taken.players.user.battlefield.some((p) => p.id === "hg")).toBe(true);
    const s = cast(taken, "user", "saw", "hg");
    expect({ user: tokenRow(s, "user"), ai: tokenRow(s, "ai") }).toEqual({ user: ["Hill Giant 2/2", "Hill Giant 2/2"], ai: [] });
  });

  it("⭐ the token doubler that counts is the CREATING player's: the AI's Anointed Procession makes four; the caster's makes no difference", () => {
    const theirs = cast(sawUser({ ai: [P("ap", "ai", PROCESSION), P("hg", "ai", HILL_GIANT)] }), "user", "saw", "hg");
    const ours = cast(sawUser({ user: [P("ap", "user", PROCESSION)], ai: [P("hg", "ai", HILL_GIANT)] }), "user", "saw", "hg");
    expect({ theirs: tokenRow(theirs, "ai").length, ours: tokenRow(ours, "ai").length, oursUser: tokenRow(ours, "user").length }).toEqual({ theirs: 4, ours: 2, oursUser: 0 });
  });

  it("⭐ a creature that BECAME a copy is copied as that copy (the ruling; layer 1): Impossible Man as a Hill Giant makes two 2/2 non-legendary, non-flying Giants", () => {
    const s0 = sawUser({ user: [P("im", "user", IMPOSSIBLE_MAN)], ai: [P("hg", "ai", HILL_GIANT)] });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "im" && a.targets?.[0]?.id === "hg");
    expect(act, "Impossible Man can copy the Hill Giant").toBeTruthy();
    const copied = resolveTopOfStack(dispatchAction(s0, act));
    const copiedAs = deriveCharacteristics(copied, "im").copiableValues;
    expect({ pt: pt(copied, findPermanent(copied, "im").permanent), type: copiedAs.type }).toEqual({ pt: "3/3", type: "Creature — Giant" });
    const s = cast(copied, "user", "saw", "im");
    const toks = tokensOf(s, "user");
    const row = {
      count: toks.length,
      pt: [...new Set(toks.map((p) => pt(s, p)))],
      types: [...new Set(toks.map((p) => p.card.type))],
      namedAsTheCopy: toks.every((p) => p.card.name === copiedAs.name),
      flying: toks.some((p) => deriveCharacteristics(s, p.id).keywords.has("flying")),
      inGraveyard: s.players.user.graveyard.map((c) => c.name).sort(),
    };
    console.log("  WITNESS sawImpossibleMan", JSON.stringify(row));
    // Not legendary, so the legend rule leaves both; the printed Impossible Man (legendary, 1/4, flying) would have halved to 1/2.
    expect(row).toEqual({ count: 2, pt: ["2/2"], types: ["Creature — Giant"], namedAsTheCopy: true, flying: false, inGraveyard: ["Impossible Man", "Saw in Half"] });
  });
});

describe("RUNTIME — it did not die this way: nothing is created", () => {
  it("⭐ indestructible (CR 702.12b): Darksteel Myr stays, no tokens anywhere", () => {
    const s = cast(sawUser({ ai: [P("dm", "ai", DARKSTEEL_MYR)] }), "user", "saw", "dm");
    expect({ myr: !!findPermanent(s, "dm"), ai: tokenRow(s, "ai"), user: tokenRow(s, "user") }).toEqual({ myr: true, ai: [], user: [] });
  });

  it("⭐ regeneration (CR 701.19a): a shielded Drudge Skeletons is tapped instead of destroyed — no tokens", () => {
    const s0 = sawUser({ user: [P("ds", "user", DRUDGE)] });
    const regen = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "ds");
    expect(regen, "Drudge Skeletons can regenerate").toBeTruthy();
    const shielded = resolveTopOfStack(dispatchAction(s0, regen));
    expect(findPermanent(shielded, "ds").permanent.regenShields).toBe(1);
    const s = cast(shielded, "user", "saw", "ds");
    expect({ drudge: findPermanent(s, "ds")?.permanent?.tapped ?? null, user: tokenRow(s, "user") }).toEqual({ drudge: true, user: [] });
  });

  it("⭐ destroyed but exiled instead (Rest in Peace — the ruling): the Hill Giant is in exile and nobody gets tokens", () => {
    const s = cast(sawUser({ user: [P("rip", "user", RIP)], ai: [P("hg", "ai", HILL_GIANT)] }), "user", "saw", "hg");
    expect({ exiled: s.players.ai.exile.map((c) => c.name), graveyard: s.players.ai.graveyard.map((c) => c.name), ai: tokenRow(s, "ai") })
      .toEqual({ exiled: ["Hill Giant"], graveyard: [], ai: [] });
  });

  it("⭐ a token destroyed under Rest in Peace is exiled, not put into a graveyard — no copies of it", () => {
    const withBeast = cast(sawUser({ user: [P("rip", "user", RIP)], ai: [P("hg", "ai", HILL_GIANT)], userHand: [{ ...BEAST_WITHIN, id: "bw" }] }), "user", "bw", "hg");
    const beast = tokensOf(withBeast, "ai")[0];
    const s = cast(withBeast, "user", "saw", beast.id);
    expect({ beastGone: !findPermanent(s, beast.id), ai: tokenRow(s, "ai") }).toEqual({ beastGone: true, ai: [] });
  });

  it("the creature left before Saw in Half resolved (Unsummon in response): the spell does nothing (CR 608.2b)", () => {
    const s0 = sawUser({ ai: [P("hg", "ai", HILL_GIANT)], userHand: [{ ...UNSUMMON, id: "uns" }] });
    const sawOnStack = dispatchAction(s0, castAction(s0, "user", "saw", "hg"));
    const bounced = resolveTopOfStack(dispatchAction(sawOnStack, castAction(sawOnStack, "user", "uns", "hg")));
    const s = resolveTopOfStack(bounced);
    expect({ inHand: s.players.ai.hand.some((c) => c.id === "c-hg"), ai: tokenRow(s, "ai"), user: tokenRow(s, "user") }).toEqual({ inHand: true, ai: [], user: [] });
  });

  it("the resolver itself: a target already gone from the battlefield is skipped — nothing destroyed, nothing created", () => {
    const s0 = board({ ai: [P("hg", "ai", HILL_GIANT)] });
    const atom = parseEffectProgram(SAW).atoms[0];
    const s = resolveAtom(s0, atom, { controller: "user", targets: [{ type: "creature", id: "gone", controller: "ai" }], cardName: "Saw in Half" });
    expect({ giant: !!findPermanent(s, "hg"), ai: tokenRow(s, "ai") }).toEqual({ giant: true, ai: [] });
  });
});

describe("RUNTIME — a characteristic-defining P/T ability is not copied (CR 707.9d)", () => {
  it("⭐ Tarmogoyf: the 2/3 Goyf's copies are 1/2 and STAY 1/2 as the graveyards grow — while a Goyf on the battlefield keeps counting", () => {
    // Graveyards hold a creature card and a sorcery card: two card types, so a Tarmogoyf is 2/3.
    const s0 = sawUser({ user: [P("tg2", "user", TARMOGOYF)], ai: [P("tg", "ai", TARMOGOYF)], userGy: [{ ...BEARS, id: "gy1" }], aiGy: [{ ...ACT_OF_TREASON, id: "gy2" }] });
    expect(pt(s0, findPermanent(s0, "tg").permanent)).toBe("2/3");
    const s = cast(s0, "user", "saw", "tg");
    // After the resolution Saw in Half (an instant) is in a graveyard too: three types, so the surviving Goyf is 3/4.
    const grown = { ...s, players: { ...s.players, ai: { ...s.players.ai, graveyard: [...s.players.ai.graveyard, { ...DARKSTEEL_MYR, id: "gy3" }] } } }; // + artifact: four types
    const row = { copies: tokenRow(s, "ai"), goyf: pt(s, findPermanent(s, "tg2").permanent), copiesLater: tokenRow(grown, "ai"), goyfLater: pt(grown, findPermanent(grown, "tg2").permanent) };
    console.log("  WITNESS sawTarmogoyf", JSON.stringify(row));
    expect(row).toEqual({ copies: ["Tarmogoyf 1/2", "Tarmogoyf 1/2"], goyf: "3/4", copiesLater: ["Tarmogoyf 1/2", "Tarmogoyf 1/2"], goyfLater: "4/5" });
  });

  it("⭐ only the CDA is left behind: Benalish Marshal's copies keep \"Other creatures you control get +1/+1\" — two 2/2s that pump each other to 3/3 and the Bears to 4/4", () => {
    const s = cast(sawUser({ ai: [P("bm", "ai", MARSHAL), P("gb", "ai", BEARS)] }), "user", "saw", "bm");
    const toks = tokensOf(s, "ai");
    expect({ ai: tokenRow(s, "ai"), base: toks.map((p) => deriveCharacteristics(s, p.id).basePower), bears: pt(s, findPermanent(s, "gb").permanent) })
      .toEqual({ ai: ["Benalish Marshal 3/3", "Benalish Marshal 3/3"], base: [2, 2], bears: "4/4" });
  });

  it("the same rule on the shared copy rider: Quicksilver Gargantuan copying Tarmogoyf is a 7/7, not a counting Goyf", () => {
    const s0 = board({ ai: [P("tg", "ai", TARMOGOYF)], userHand: [{ ...QUICKSILVER, id: "qs" }], userGy: [{ ...BEARS, id: "gy1" }] });
    const atChoice = cast(s0, "user", "qs");
    expect(atChoice.pendingChoice?.kind).toBeTruthy();
    const s = finalizeStackResolution(resolveCloneChoice(atChoice, "tg"));
    const qs = s.players.user.battlefield.find((p) => p.printedCard);
    expect({ name: qs.card.name, pt: pt(s, qs) }).toEqual({ name: "Tarmogoyf", pt: "7/7" });
  });
});

/**
 * ⛔ SYNTHETIC — the shuffle-instead replacement. The only creatures printing "If ~ would be put into a graveyard from anywhere,
 * reveal ~ and shuffle it into its owner's library instead" are Darksteel Colossus and Blightsteel Colossus (indestructible) and
 * Progenitus (protection from everything — never a legal target), and the engine models no effect that removes indestructible.
 * So the real Colossus is given a HAND-BUILT layer-6 "loses indestructible" effect: destroyed, it is shuffled into its owner's
 * library instead and never dies — no copies (the ruling's "a replacement effect moves it elsewhere").
 */
describe("⛔ synthetic — destroyed into a library, not a graveyard", () => {
  it("a Darksteel Colossus that lost indestructible is shuffled into the AI's library: no tokens", () => {
    let s0 = sawUser({ ai: [P("dc", "ai", COLOSSUS)] });
    s0 = addContinuousEffect(s0, { layer: 6, op: { layerOp: "removeKeyword", keyword: "Indestructible" }, affects: { mode: "fixed", permanentIds: ["dc"] },
      duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, cardName: "synthetic" } }).state;
    const s = cast(s0, "user", "saw", "dc");
    expect({ inLibrary: s.players.ai.library.some((c) => c.id === "c-dc"), graveyard: s.players.ai.graveyard.map((c) => c.name), ai: tokenRow(s, "ai") })
      .toEqual({ inLibrary: true, graveyard: [], ai: [] });
  });
});

/** ⛔ SYNTHETIC NEAR-MISSES — no printed card carries these texts. Each changes one word of the anchor and must stay off the native tier. */
describe("⛔ synthetic — the anchor is exact", () => {
  const synth = (oracle) => ({ ...SAW, name: "Synthetic Saw Probe", oracle });
  it.each([
    ["round down", "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round down each time."],
    ["the caster creates them", "Destroy target creature. If that creature dies this way, you create two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time."],
    ["three tokens", "Destroy target creature. If that creature dies this way, its controller creates three tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time."],
    ["a trailing rider", "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time. You gain 2 life."],
  ])("%s → not native", (_label, oracle) => {
    expect(classifyCard(synth(oracle))).toBe("arbiter-spell");
  });
});
