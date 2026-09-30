/**
 * changeTarget.test.js — "change the target of target spell [or ability] with a single target" (CR 115.7a — shelf decks D14,
 * 2026-09-30: Misdirection in Kinnan and Believe it!; Bolt Bend, Redirect Lightning and Untimely Malfunction in Killer Turts).
 *
 * The target can be changed only to ANOTHER legal target, and stays when there is none (CR 115.7a); unlike "choose new
 * targets" (Deflecting Swat, CR 115.7d) the change is not optional. The alternatives are the redirected object's own — its
 * controller's side, its slot, its kick and mode (CR 115.8) — never its current target and never itself (CR 115.5). One
 * alternative: it moves. Several: the redirector chooses (a human's panel, a pilot's offered actions, the autopilot by the
 * slot's intent). The AI casts one only to pull an opponent's harmful spell off its own stuff.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveChangeTargetChoice, autoPickChangeTarget, resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { changeTargetAlternatives } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { pickAction } from "./opponentAI.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { decisionViewForWire } from "./decisionWire.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const MISDIRECTION = card("Misdirection", "Instant", "{3}{U}{U}", 5, "You may exile a blue card from your hand rather than pay this spell's mana cost.\nChange the target of target spell with a single target.");
const DEFLECTION = card("Deflection", "Instant", "{3}{U}", 4, "Change the target of target spell with a single target.");
const SHUNT = card("Shunt", "Instant", "{1}{R}{R}", 3, "Change the target of target spell with a single target.");
const BOLT_BEND = card("Bolt Bend", "Instant", "{3}{R}", 4, "This spell costs {3} less to cast if you control a creature with power 4 or greater.\nChange the target of target spell or ability with a single target.");
const REDIRECT_LIGHTNING = card("Redirect Lightning", "Instant — Lesson", "{R}", 1, "As an additional cost to cast this spell, pay 5 life or pay {2}.\nChange the target of target spell or ability with a single target.");
const UNTIMELY = card("Untimely Malfunction", "Instant", "{1}{R}", 2, "Choose one —\n• Destroy target artifact.\n• Change the target of target spell or ability with a single target.\n• One or two target creatures can't block this turn.");
const SWAT = card("Deflecting Swat", "Instant", "{2}{R}", 3, "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.");
const LIGHTNING_BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.");
const SHATTER = card("Shatter", "Instant", "{1}{R}", 2, "Destroy target artifact.");
const ABRADE = card("Abrade", "Instant", "{1}{R}", 2, "Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.");
const COUNTERSPELL = card("Counterspell", "Instant", "{U}{U}", 2, "Counter target spell.");
const VOID_REND = card("Void Rend", "Instant", "{W}{U}{B}", 3, "This spell can't be countered.\nDestroy target nonland permanent.");
const DISMISSAL = card("Galadriel's Dismissal", "Instant", "{W}", 1, "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature phases out. If this spell was kicked, each creature target player controls phases out instead. (Treat phased-out creatures and anything attached to them as though they don't exist until their controller's next turn.)", { keywords: ["Kicker"] });
const GIANT_GROWTH = card("Giant Growth", "Instant", "{G}", 1, "Target creature gets +3/+3 until end of turn.");
const OPT = card("Opt", "Instant", "{U}", 1, "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.", { keywords: ["Scry"] });
const FTK = card("Flametongue Kavu", "Creature — Kavu", "{3}{R}", 4, "When this creature enters, it deals 4 damage to target creature.", { power: "4", toughness: "2" });
const VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", 2, "When this creature enters, draw a card.", { power: "1", toughness: "1" });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** A board mid-turn: each seat's hand ([id, card] pairs), battlefield and floating mana. */
function board({ active = "ai", user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: (o.library || []).map((c, i) => ({ ...c, id: `${id}-lib${i}` })), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) } };
}
const castsOf = (s, who, id) => legalActionsForPlayer({ ...s, priorityHolder: who }, who).filter((a) => a.kind === "cast-spell" && a.cardId === id && !a.altCost);
function cast(s, who, id, pick = () => true) {
  const a = castsOf(s, who, id).find(pick);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const named = (s, name) => s.stack.find((o) => o.source?.name === name);
const targetOf = (s, name) => named(s, name)?.payload?.params?.targets?.map((t) => t.id);
const lastLog = (s, effect) => [...(s.log || [])].reverse().find((e) => e.effect === effect);
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };

describe("the clause", () => {
  it("parses in both forms — a spell, or a spell or ability — single-target; changing a target is not countering", () => {
    const atoms = (o) => parseEffectProgram({ type: "Instant", oracle: o }).atoms;
    expect(atoms("Change the target of target spell with a single target.")).toEqual([{ op: "change-target", targetType: "spell", singleTargetOnly: true, notCounter: true }]);
    expect(atoms("Change the target of target spell or ability with a single target.")).toEqual([{ op: "change-target", targetType: "spellOrStackAbility", singleTargetOnly: true }]);
  });
  it("the carriers read native; the riders and the player-only form stay refused", () => {
    expect([MISDIRECTION, DEFLECTION, SHUNT, BOLT_BEND, REDIRECT_LIGHTNING, UNTIMELY].map((x) => classifyCard(x))).toEqual(Array(6).fill("native-spell"));
    const conf = (o) => programConfidence(parseEffectProgram({ type: "Instant", oracle: o }));
    expect({
      rebound: conf("Change the target of target spell that targets only a player. The new target must be a player."),
      divert: conf("Change the target of target spell with a single target unless that spell's controller pays {2}."),
      imps: conf("Change the target of target spell with a single target. You lose life equal to that spell's mana value."),
    }).toEqual({ rebound: "low", divert: "low", imps: "low" });
  });
});

describe("what it can target", () => {
  it("only an object with exactly one target: a Lightning Bolt, never a targetless Opt; abilities only for 'or ability'", () => {
    let s = board({ active: "ai", user: { hand: [["mis", MISDIRECTION], ["bend", BOLT_BEND]], bf: [perm("giant", GIANT, "user")], mana: { U: 5, R: 4 } },
      ai: { hand: [["ftk", FTK], ["opt", OPT], ["bolt", LIGHTNING_BOLT]], mana: { R: 5 }, library: [BEAR, BEAR] } });
    s = cast(s, "ai", "ftk");
    s = resolveTopOfStack(s);                                     // Flametongue enters; its trigger (one target: your Giant) is put on the stack
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, manaPool: { ...s.players.ai.manaPool, U: 1 } } } };
    s = cast(s, "ai", "opt");                                     // an instant with no targets
    s = cast(s, "ai", "bolt", (a) => a.targets[0].id === "user");
    const ftkTrigger = s.stack.find((o) => o.kind === "triggered-ability");
    const offered = (id) => castsOf(s, "user", id).map((a) => a.targets[0].id).sort();
    const row = { ftkTargets: ftkTrigger?.targets?.map((t) => t.id), misdirection: offered("mis"), boltBend: offered("bend") };
    expect(row).toEqual({ ftkTargets: ["giant"], misdirection: [named(s, "Lightning Bolt").id], boltBend: [named(s, "Lightning Bolt").id, ftkTrigger.id].sort() });
  });
  it("an uncounterable spell is still a legal target: changing a target is not countering it", () => {
    let s = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("myring", SOL_RING, "user")], mana: { U: 5 } }, ai: { hand: [["rend", VOID_REND]], mana: { W: 1, U: 1, B: 1 } } });
    s = cast(s, "ai", "rend", (a) => a.targets[0].id === "myring");
    expect(castsOf(s, "user", "mis").map((a) => a.targets[0].id)).toEqual([named(s, "Void Rend").id]);
  });
  it("Untimely Malfunction's third mode takes one or two creatures, never three — and each chosen one can't block", () => {
    let s = board({ active: "user", user: { hand: [["um", UNTIMELY]], mana: { R: 2 } }, ai: { bf: [perm("b1", BEAR, "ai"), perm("b2", BEAR, "ai"), perm("b3", BEAR, "ai")] } });
    const counts = [...new Set(castsOf(s, "user", "um").filter((a) => a.chosenMode === 2).map((a) => a.targets.length))].sort();
    s = cast(s, "user", "um", (a) => a.chosenMode === 2 && a.targets.map((t) => t.id).join() === "b1,b2");
    s = drain(s);
    expect({ counts, cantBlock: ["b1", "b2", "b3"].map((id) => permanentHasKeyword(s, id, "cantBlock")) }).toEqual({ counts: [1, 2], cantBlock: [true, true, false] });
  });
  it("a zero-target ability is not 'with a single target' (CR 115.9a) — Bolt Bend never offers it", () => {
    let s = board({ active: "ai", user: { hand: [["bend", BOLT_BEND]], mana: { R: 4 } }, ai: { hand: [["vis", VISIONARY]], mana: { G: 2 }, library: [BEAR] } });
    s = cast(s, "ai", "vis");
    s = resolveTopOfStack(s);                                     // the draw trigger — no targets — is on the stack
    expect({ trigger: s.stack.map((o) => o.kind), boltBend: castsOf(s, "user", "bend").length }).toEqual({ trigger: ["triggered-ability"], boltBend: 0 });
  });
});

describe("⭐ the change", () => {
  it("⭐ several other legal targets → the redirector chooses: the AI's Bolt at your Giant goes to its own Bear", () => {
    let s = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "user")], mana: { U: 5 } },
      ai: { hand: [["bolt", LIGHTNING_BOLT]], bf: [perm("bear", BEAR, "ai")], mana: { R: 1 } } });
    s = cast(s, "ai", "bolt", (a) => a.targets[0].id === "giant");
    const bolt = named(s, "Lightning Bolt").id;
    s = cast(s, "user", "mis", (a) => a.targets[0].id === bolt);
    s = resolveTopOfStack(s);                                     // Misdirection resolves: several alternatives → the pause
    const pc = s.pendingChoice;
    const offered = (pc?.candidates || []).map((c) => c.id).sort();
    s = resolveChangeTargetChoice(s, "bear");
    const moved = targetOf(s, "Lightning Bolt");
    const movedOnObject = named(s, "Lightning Bolt").targets.map((t) => t.id); // the object's own list — the fizzle check reads it
    s = drain(s);
    const row = { kind: pc?.kind, controller: pc?.controller, from: pc?.from?.id, offered, moved, movedOnObject, bearDead: !onBf(s, "ai", "bear"), giantAlive: onBf(s, "user", "giant"), misdirectionInGraveyard: s.players.user.graveyard.some((c) => c.name === "Misdirection") };
    console.log(`WITNESS misdirectionChoice ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "change-target", controller: "user", from: "giant", offered: ["ai", "bear", "user"], moved: ["bear"], movedOnObject: ["bear"], bearDead: true, giantAlive: true, misdirectionInGraveyard: true });
  });
  it("an object already gone from the stack changes nothing, logged", () => {
    const out = resolveAtom(board(), { op: "change-target", targetType: "spell", singleTargetOnly: true, notCounter: true }, { controller: "user", targets: [{ type: "spell", id: "gone" }] });
    expect(lastLog(out, "change-target-unchanged")?.reason).toBe("gone");
  });
  it("one other legal target → it moves there with no pause: Shatter at your Sol Ring destroys theirs", () => {
    let s = board({ active: "ai", user: { hand: [["def", DEFLECTION]], bf: [perm("myring", SOL_RING, "user")], mana: { U: 4 } },
      ai: { hand: [["shat", SHATTER]], bf: [perm("theirring", SOL_RING, "ai")], mana: { R: 2 } } });
    s = cast(s, "ai", "shat", (a) => a.targets[0].id === "myring");
    s = cast(s, "user", "def", (a) => a.targets[0].id === named(s, "Shatter").id);
    s = resolveTopOfStack(s);
    const row = { paused: !!s.pendingChoice, moved: targetOf(s, "Shatter") };
    s = drain(s);
    expect({ ...row, mine: onBf(s, "user", "myring"), theirs: onBf(s, "ai", "theirring") }).toEqual({ paused: false, moved: ["theirring"], mine: true, theirs: false });
  });
  it("no other legal target → it stays, logged (CR 115.7a), and the Shatter still destroys your ring", () => {
    let s = board({ active: "ai", user: { hand: [["def", DEFLECTION]], bf: [perm("myring", SOL_RING, "user")], mana: { U: 4 } }, ai: { hand: [["shat", SHATTER]], mana: { R: 2 } } });
    s = cast(s, "ai", "shat", (a) => a.targets[0].id === "myring");
    s = cast(s, "user", "def", (a) => a.targets[0].id === named(s, "Shatter").id);
    s = resolveTopOfStack(s);
    const row = { paused: !!s.pendingChoice, reason: lastLog(s, "change-target-unchanged")?.reason, target: targetOf(s, "Shatter") };
    s = drain(s);
    expect({ ...row, mine: onBf(s, "user", "myring") }).toEqual({ paused: false, reason: "no-other-legal-target", target: ["myring"], mine: false });
  });
  it("the spell keeps its MODE (CR 115.8): Untimely Malfunction moves Abrade's creature damage, never onto an artifact", () => {
    let s = board({ active: "ai", user: { hand: [["um", UNTIMELY]], bf: [perm("giant", GIANT, "user"), perm("myring", SOL_RING, "user")], mana: { R: 2 } },
      ai: { hand: [["abr", ABRADE]], bf: [perm("bear", BEAR, "ai")], mana: { R: 2 } } });
    s = cast(s, "ai", "abr", (a) => a.chosenMode === 0 && a.targets[0].id === "giant");
    const abrade = named(s, "Abrade");
    const alternatives = changeTargetAlternatives(s, abrade).map((t) => t.id);
    s = cast(s, "user", "um", (a) => a.chosenMode === 1 && a.targets[0].id === abrade.id);
    s = drain(resolveTopOfStack(s));
    expect({ alternatives, bearDead: !onBf(s, "ai", "bear"), giantAlive: onBf(s, "user", "giant"), ringAlive: onBf(s, "user", "myring") })
      .toEqual({ alternatives: ["bear"], bearDead: true, giantAlive: true, ringAlive: true });
  });
  it("the target stays in its SLOT: a Twin Tides shrinking your Giant moves to their Bear and still shrinks it", () => {
    // Synthetic (as in redirectToSource.test.js): no corpus spell has two optional target slots of one kind, but the
    // parser admits it, so the same-slot rule is witnessed here. One target chosen, in the SECOND (-2/-2) slot; the Bear
    // is legal in both slots, and only the second is a change of THAT target.
    const TWIN = card("Twin Tides", "Instant", "{1}{B}", 2, "Up to one target creature gets +2/+2 until end of turn. Up to one target creature gets -2/-2 until end of turn.");
    let s = board({ active: "ai", user: { hand: [["def", DEFLECTION]], bf: [perm("giant", GIANT, "user")], mana: { U: 4 } }, ai: { hand: [["twin", TWIN]], bf: [perm("bear", BEAR, "ai")], mana: { B: 2 } } });
    s = cast(s, "ai", "twin", (a) => a.targets.length === 1 && a.targets[0].atomIndex === 1 && a.targets[0].id === "giant");
    const twin = named(s, "Twin Tides");
    const alternatives = changeTargetAlternatives(s, twin).map((t) => [t.atomIndex, t.id]);
    s = drain(resolveTopOfStack(cast(s, "user", "def", (a) => a.targets[0].id === twin.id)));
    expect({ alternatives, bearDead: !onBf(s, "ai", "bear"), giantAlive: onBf(s, "user", "giant") }).toEqual({ alternatives: [[1, "bear"]], bearDead: true, giantAlive: true });
  });
  it("the spell keeps its KICK: a kicked Galadriel's Dismissal at you moves to the other player — never back to a creature", () => {
    let s = board({ active: "ai", user: { hand: [["def", DEFLECTION]], bf: [perm("giant", GIANT, "user")], mana: { U: 4 } },
      ai: { hand: [["gd", DISMISSAL]], bf: [perm("bear", BEAR, "ai")], mana: { W: 2, C: 2 } } });
    s = cast(s, "ai", "gd", (a) => a.kicked === true && a.targets[0].id === "user");
    const dismissal = named(s, "Galadriel's Dismissal");
    const alternatives = changeTargetAlternatives(s, dismissal).map((t) => t.id);
    s = drain(resolveTopOfStack(cast(s, "user", "def", (a) => a.targets[0].id === dismissal.id)));
    const ids = (zone) => (zone || []).map((p) => p.id);
    expect({ alternatives, yoursOut: ids(s.players.user.phasedOut), theirsOut: ids(s.players.ai.phasedOut) }).toEqual({ alternatives: ["ai"], yoursOut: [], theirsOut: ["bear"] });
  });
  it("⭐ never onto itself (CR 115.5): a Counterspell on your Giant Growth moves to their Bolt — and with no Bolt, it stays", () => {
    const setup = (withBolt) => {
      let s = board({ active: "user", user: { hand: [["gg", GIANT_GROWTH], ["mis", MISDIRECTION]], bf: [perm("mybear", BEAR, "user")], mana: { G: 1, U: 5 } },
        ai: { hand: [["cs", COUNTERSPELL], ["bolt", LIGHTNING_BOLT]], mana: { U: 2, R: 1 } } });
      s = cast(s, "user", "gg", (a) => a.targets[0].id === "mybear");
      if (withBolt) s = cast(s, "ai", "bolt", (a) => a.targets[0].id === "mybear");
      s = cast(s, "ai", "cs", (a) => a.targets[0].id === named(s, "Giant Growth").id);
      s = cast(s, "user", "mis", (a) => a.targets[0].id === named(s, "Counterspell").id);
      return resolveTopOfStack(s);
    };
    const bolted = setup(true);
    const alone = setup(false);
    const row = {
      withBolt: { paused: !!bolted.pendingChoice, counterspellTargets: targetOf(bolted, "Counterspell")?.map((id) => bolted.stack.find((o) => o.id === id)?.source?.name) },
      alone: { paused: !!alone.pendingChoice, reason: lastLog(alone, "change-target-unchanged")?.reason, counterspellTargets: targetOf(alone, "Counterspell")?.map((id) => alone.stack.find((o) => o.id === id)?.source?.name) },
    };
    console.log(`WITNESS counterspellNeverItself ${JSON.stringify(row)}`);
    expect(row).toEqual({
      withBolt: { paused: false, counterspellTargets: ["Lightning Bolt"] },
      alone: { paused: false, reason: "no-other-legal-target", counterspellTargets: ["Giant Growth"] },
    });
  });
  it("⭐ the same fix for Deflecting Swat: it never deflects a Counterspell onto the Counterspell", () => {
    let s = board({ active: "user", user: { hand: [["gg", GIANT_GROWTH], ["swat", SWAT]], bf: [perm("mybear", BEAR, "user")], mana: { G: 1, R: 3 } },
      ai: { hand: [["cs", COUNTERSPELL]], mana: { U: 2 } } });
    s = cast(s, "user", "gg", (a) => a.targets[0].id === "mybear");
    s = cast(s, "ai", "cs", (a) => a.targets[0].id === named(s, "Giant Growth").id);
    s = cast(s, "user", "swat", (a) => a.targets[0].id === named(s, "Counterspell").id);
    s = resolveTopOfStack(s);
    const asked = s.pendingChoice?.kind;
    s = resolveOptionalChoice(s, true);                           // the printed "may" — yes, choose new targets
    const row = { asked, reason: lastLog(s, "retarget-decline")?.reason, counterspellTargets: targetOf(s, "Counterspell")?.map((id) => s.stack.find((o) => o.id === id)?.source?.name) };
    console.log(`WITNESS swatNeverItself ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: "optional-effect", reason: "no-safe-combo", counterspellTargets: ["Giant Growth"] });
  });
  it("Bolt Bend moves a TRIGGERED ability's target: Flametongue's 4 damage lands on its own body", () => {
    let s = board({ active: "ai", user: { hand: [["bend", BOLT_BEND]], bf: [perm("giant", GIANT, "user")], mana: { R: 4 } }, ai: { hand: [["ftk", FTK]], mana: { R: 4 } } });
    s = cast(s, "ai", "ftk");
    s = resolveTopOfStack(s);
    const trigger = s.stack.find((o) => o.kind === "triggered-ability");
    s = cast(s, "user", "bend", (a) => a.targets[0].id === trigger.id);
    s = drain(resolveTopOfStack(s));
    const ftk = s.players.ai.battlefield.find((p) => p.card?.name === "Flametongue Kavu");
    expect({ giantAlive: onBf(s, "user", "giant"), kavuAlive: !!ftk }).toEqual({ giantAlive: true, kavuAlive: false });
  });
});

describe("the settle honours only what was shown, and only while it is still legal", () => {
  /** The AI's Bolt at your Giant; your Misdirection has paused on where it goes. */
  const paused = () => {
    let s = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "user")], mana: { U: 5 } },
      ai: { hand: [["bolt", LIGHTNING_BOLT]], bf: [perm("bear", BEAR, "ai")], mana: { R: 1 } } });
    s = cast(s, "ai", "bolt", (a) => a.targets[0].id === "giant");
    return resolveTopOfStack(cast(s, "user", "mis", (a) => a.targets[0].id === named(s, "Lightning Bolt").id));
  };
  const withAiBoard = (s, f) => ({ ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: f(s.players.ai.battlefield) } } });
  it("a pick that was never offered moves nothing — even a creature that is a legal target now", () => {
    const s = resolveChangeTargetChoice(withAiBoard(paused(), (bf) => [...bf, perm("late", BEAR, "ai")]), "late");
    expect({ reason: lastLog(s, "change-target-unchanged")?.reason, target: targetOf(s, "Lightning Bolt") }).toEqual({ reason: "no-valid-pick", target: ["giant"] });
  });
  it("an offered pick that is no longer legal moves nothing — the Bear left while the choice was open", () => {
    const s = resolveChangeTargetChoice(withAiBoard(paused(), (bf) => bf.filter((p) => p.id !== "bear")), "bear");
    expect({ reason: lastLog(s, "change-target-unchanged")?.reason, target: targetOf(s, "Lightning Bolt") }).toEqual({ reason: "no-valid-pick", target: ["giant"] });
  });
});

describe("who picks: the autopilot reads the redirected slot's side", () => {
  it("a harmful spell goes to a candidate that isn't yours; a pump goes to one that is", () => {
    // Harmful: the AI's Bolt at your Giant — you (the redirector) send it to their side.
    let bolt = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "user"), perm("mybear", BEAR, "user")], mana: { U: 5 } },
      ai: { hand: [["bolt", LIGHTNING_BOLT]], bf: [perm("bear", BEAR, "ai")], mana: { R: 1 } } });
    bolt = cast(bolt, "ai", "bolt", (a) => a.targets[0].id === "giant");
    bolt = resolveTopOfStack(cast(bolt, "user", "mis", (a) => a.targets[0].id === named(bolt, "Lightning Bolt").id));
    // Beneficial: the AI's Giant Growth on its Bear — you steal it for one of yours.
    let pump = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "user"), perm("mybear", BEAR, "user")], mana: { U: 5 } },
      ai: { hand: [["gg", GIANT_GROWTH]], bf: [perm("bear", BEAR, "ai"), perm("theirgiant", GIANT, "ai")], mana: { G: 1 } } });
    pump = cast(pump, "ai", "gg", (a) => a.targets[0].id === "bear");
    pump = resolveTopOfStack(cast(pump, "user", "mis", (a) => a.targets[0].id === named(pump, "Giant Growth").id));
    const mine = new Set(["user", "giant", "mybear"]);
    const row = {
      boltOffered: bolt.pendingChoice.candidates.map((c) => c.id).sort(), boltPickIsTheirs: !mine.has(autoPickChangeTarget(bolt, bolt.pendingChoice)),
      pumpOffered: pump.pendingChoice.candidates.map((c) => c.id).sort(), pumpPickIsMine: mine.has(autoPickChangeTarget(pump, pump.pendingChoice)),
    };
    expect(row).toEqual({ boltOffered: ["ai", "bear", "mybear", "user"], boltPickIsTheirs: true, pumpOffered: ["giant", "mybear", "theirgiant"], pumpPickIsMine: true });
  });
});

describe("the session", () => {
  /** The user's Bolt at the AI's Giant; the AI's Misdirection resolves into the pause (redirector: the AI seat). */
  const aiRedirects = () => {
    let s = board({ active: "user", user: { hand: [["bolt", LIGHTNING_BOLT]], bf: [perm("mybear", BEAR, "user")], mana: { R: 1 } },
      ai: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "ai")], mana: { U: 5 } } });
    s = cast(s, "user", "bolt", (a) => a.targets[0].id === "giant");
    s = cast(s, "ai", "mis", (a) => a.targets[0].id === named(s, "Lightning Bolt").id);
    return resolveTopOfStack(s);
  };
  /** The AI's Bolt at your Giant; your Misdirection resolves into the pause (redirector: you). */
  const youRedirect = () => {
    let s = board({ active: "ai", user: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "user")], mana: { U: 5 } },
      ai: { hand: [["bolt", LIGHTNING_BOLT]], bf: [perm("bear", BEAR, "ai")], mana: { R: 1 } } });
    s = cast(s, "ai", "bolt", (a) => a.targets[0].id === "giant");
    s = cast(s, "user", "mis", (a) => a.targets[0].id === named(s, "Lightning Bolt").id);
    return { ...resolveTopOfStack(s), priorityHolder: "user", consecutivePasses: 0 };
  };
  const sessionOf = (state) => ({ status: "active", state, difficulty: "beginner", decisionLog: [] });
  it("a human sees the candidates and where it points now; the picked id is where it goes, and the log records it", () => {
    const pending = sessionOf(youRedirect());
    const { decision } = advanceUntilDecision(pending);
    const { session } = applyPendingChoice(pending, { kind: "change-target", targetId: "bear" });
    const wire = decisionViewForWire(decision);                   // what the API actually sends the panel
    expect({
      kind: decision.kind, spellName: wire.spellName, from: wire.from && { id: wire.from.id, name: wire.from.name, controller: wire.from.controller },
      offered: (wire.candidates || []).map((c) => c.id).sort(),
      moved: lastLog(session.state, "change-target")?.to, logged: session.decisionLog.find((e) => e.action?.kind === "change-target-choice")?.action,
    }).toEqual({
      kind: "change-target", spellName: "Lightning Bolt", from: { id: "giant", name: "Hill Giant", controller: "user" }, offered: ["ai", "bear", "user"],
      moved: "Grizzly Bears", logged: { kind: "change-target-choice", stackObjectId: pending.state.pendingChoice.stackObjectId, targetId: "bear" },
    });
  });
  it("a pilot is offered one action per candidate and no decline — and its pick is where the Bolt goes", () => {
    let offered = null;
    const decide = ({ legalActions }) => {
      if (legalActions.some((a) => a.choiceKind === "change-target")) offered = legalActions.map((a) => a.value).sort();
      return legalActions.find((a) => a.value === "user") ?? legalActions[0];
    };
    const { session } = advanceUntilDecision(sessionOf(aiRedirects()), { decide });
    expect({ offered, moved: lastLog(session.state, "change-target")?.to }).toEqual({ offered: ["ai", "mybear", "user"], moved: "user" });
  });
  it("the AI seat's autopilot sends your Bolt back to your side", () => {
    const { session } = advanceUntilDecision(sessionOf(aiRedirects()));
    const moved = lastLog(session.state, "change-target");
    expect(["user", "Grizzly Bears"]).toContain(moved?.to);
  });
});

describe("the AI casts it only to save its own stuff", () => {
  /** The user casts `spell` at `targetId`; the AI holds Misdirection with the mana for it. */
  const facing = (spell, mana, targetId, { aiBf = [perm("giant", GIANT, "ai")], userBf = [perm("mybear", BEAR, "user")] } = {}) => {
    let s = board({ active: "user", user: { hand: [["x", spell]], bf: userBf, mana }, ai: { hand: [["mis", MISDIRECTION]], bf: aiBf, mana: { U: 5 } } });
    s = cast(s, "user", "x", (a) => a.targets[0].id === targetId);
    return { ...s, priorityHolder: "ai" };
  };
  const aiPlays = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
  it("⭐ your Bolt at its Giant → it casts Misdirection at the Bolt", () => {
    const s = facing(LIGHTNING_BOLT, { R: 1 }, "giant");
    const play = aiPlays(s);
    console.log(`WITNESS aiRedirects ${JSON.stringify({ kind: play?.kind, card: play?.name, target: play?.targets?.[0]?.name })}`);
    expect({ kind: play?.kind, card: play?.name, target: play?.targets?.[0]?.id }).toEqual({ kind: "cast-spell", card: "Misdirection", target: named(s, "Lightning Bolt").id });
  });
  it("holds when your spell isn't aimed at its stuff, or helps what it targets", () => {
    const atYours = aiPlays(facing(LIGHTNING_BOLT, { R: 1 }, "mybear"));
    const pumpYours = aiPlays(facing(GIANT_GROWTH, { G: 1 }, "mybear"));
    const pumpItsGiant = aiPlays(facing(GIANT_GROWTH, { G: 1 }, "giant"));
    expect({ atYours: atYours?.name ?? atYours?.kind, pumpYours: pumpYours?.name ?? pumpYours?.kind, pumpItsGiant: pumpItsGiant?.name ?? pumpItsGiant?.kind })
      .toEqual({ atYours: "pass-priority", pumpYours: "pass-priority", pumpItsGiant: "pass-priority" });
  });
  it("holds when there is nowhere on your side to send it: your Shatter at its Sol Ring, with only its own other ring to go to", () => {
    const s = facing(SHATTER, { R: 2 }, "airing", { aiBf: [perm("airing", SOL_RING, "ai"), perm("airing2", SOL_RING, "ai")], userBf: [] });
    const play = aiPlays(s);
    expect(play?.name ?? play?.kind).toBe("pass-priority");
  });
  it("never redirects its own spell", () => {
    let s = board({ active: "ai", user: { bf: [perm("mybear", BEAR, "user")] }, ai: { hand: [["bolt", LIGHTNING_BOLT], ["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "ai")], mana: { R: 1, U: 5 } } });
    s = { ...cast(s, "ai", "bolt", (a) => a.targets[0].id === "giant"), priorityHolder: "ai" };
    const play = aiPlays(s);
    expect(play?.name ?? play?.kind).not.toBe("Misdirection");
  });
  it("with two threats on the stack, it redirects the costlier one", () => {
    let s = board({ active: "user", user: { hand: [["bolt", LIGHTNING_BOLT], ["shat", SHATTER]], bf: [perm("myring", SOL_RING, "user")], mana: { R: 3 } },
      ai: { hand: [["mis", MISDIRECTION]], bf: [perm("giant", GIANT, "ai"), perm("airing", SOL_RING, "ai")], mana: { U: 5 } } });
    s = cast(s, "user", "bolt", (a) => a.targets[0].id === "giant");
    s = cast(s, "user", "shat", (a) => a.targets[0].id === "airing");
    const play = aiPlays({ ...s, priorityHolder: "ai" });
    expect({ card: play?.name, target: play?.targets?.[0]?.id }).toEqual({ card: "Misdirection", target: named(s, "Shatter").id });
  });
});
