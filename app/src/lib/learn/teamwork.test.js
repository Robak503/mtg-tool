/**
 * teamwork.test.js — TEAMWORK (shelf decks D16, 2026-09-30: HULK SMASH! for Wolverine, the Marvel teamwork spells). The printed
 * reminder is the definition (the keyword postdates the bundled Comprehensive Rules): "As an additional cost to cast this spell,
 * you may tap any number of creatures you control with total power N or more." — an optional additional cost exactly like
 * kicker, paid by tapping creatures; "If this spell was cast using teamwork, …" is its "if this spell was kicked".
 *
 *   • the kicked-spell grammar carries Crossover Collaboration (additive), Cruel Alliance (whole replacement) and Helicarrier
 *     Strike (magnitude replacement); "Choose one. If this spell was cast using teamwork, choose both instead." is a modal whose
 *     teamwork cast chooses BOTH modes (Go Nuts!, Murdock's Crusade, Widow's Bite, HULK SMASH!).
 *   • the cast offer: the teamwork variant carries its tap set — crew's house policy (summoning-sick first, then the smallest),
 *     pruned of creatures the total doesn't need — and is offered only when the spell's mana is payable WITHOUT them.
 *   • the dispatcher re-checks and taps the set; a short, stale or missing set throws — the upgrade is never free.
 *   • the AI pays teamwork only when every creature it taps is summoning-sick.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseTeamworkCost } from "./kicker.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const TW = (n) => `Teamwork ${n} (As an additional cost to cast this spell, you may tap any number of creatures you control with total power ${n} or more.)`;
const HULK = card("HULK SMASH!", "Instant", "{1}{R}", 2, `${TW(4)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Destroy target noncreature artifact.\n• Target creature you control deals damage equal to its power to target creature an opponent controls.`, { keywords: ["Teamwork"] });
const GO_NUTS = card("Go Nuts!", "Sorcery", "{G}", 1, `${TW(3)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Put a +1/+1 counter on target creature.\n• Target creature you control fights target creature an opponent controls.`, { keywords: ["Fight", "Teamwork"] });
const CROSSOVER = card("Crossover Collaboration", "Instant", "{2}{R}", 3, `${TW(2)}\nExile the top two cards of your library. Until the end of your next turn, you may play those cards. If this spell was cast using teamwork, create a Treasure token. (It's an artifact with "{T}, Sacrifice this token: Add one mana of any color.")`, { keywords: ["Treasure", "Teamwork"] });
const CRUEL = card("Cruel Alliance", "Sorcery", "{2}{B}", 3, `${TW(2)}\nExile target creature with mana value 3 or less. If this spell was cast using teamwork, instead exile target creature and you gain 3 life.`, { keywords: ["Teamwork"] });
const HELICARRIER = card("Helicarrier Strike", "Instant", "{W}", 1, `${TW(2)}\nHelicarrier Strike deals 2 damage to target attacking or blocking creature. If this spell was cast using teamwork, it deals 4 damage to that creature instead.`, { keywords: ["Teamwork"] });
const MURDOCK = card("Murdock's Crusade", "Sorcery", "{1}{W}", 2, `${TW(4)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Street Justice — Exile target creature with toughness 4 or greater.\n• Legal Justice — Exile target enchantment with mana value 4 or greater.`, { keywords: ["Teamwork"] });
const WIDOW = card("Widow's Bite", "Instant", "{1}{B}", 2, `${TW(3)}\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Target creature gains deathtouch until end of turn.\n• Target creature gets -2/-2 until end of turn.`, { keywords: ["Teamwork"] });
const NAY = card("We Say Thee Nay!", "Instant — Arcane", "{1}{U}", 2, `${TW(2)}\nCounter target spell unless its controller pays {2}. Counter that spell unless its controller pays {4} instead if this spell was cast using teamwork.`, { keywords: ["Teamwork"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const ELVES = card("Llanowar Elves", "Creature — Elf Druid", "{G}", 1, "{T}: Add {G}.", { power: "1", toughness: "1" });
const OGRE = card("Gray Ogre", "Creature — Ogre", "{2}{R}", 3, "", { power: "2", toughness: "2" });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");
const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", 0, "({T}: Add {R}.)");
const SWAMP = card("Swamp", "Basic Land — Swamp", "", 0, "({T}: Add {B}.)");

const perm = (id, c, controller, sick = false) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: sick });
function board({ active = "user", user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: (o.library || []).map((c, i) => ({ ...c, id: `${id}-lib${i}` })), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) } };
}
const castsOf = (s, who, id) => legalActionsForPlayer({ ...s, priorityHolder: who }, who).filter((a) => a.kind === "cast-spell" && a.cardId === id);
const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const tapped = (s, pid, id) => !!s.players[pid].battlefield.find((p) => p.id === id)?.tapped;
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };

describe("the keyword", () => {
  it("reads N off the Teamwork line; a card without one has none", () => {
    expect({ hulk: parseTeamworkCost(HULK), goNuts: parseTeamworkCost(GO_NUTS), bear: parseTeamworkCost(BEAR) }).toEqual({ hulk: 4, goNuts: 3, bear: null });
  });
  it("seven carriers read native through the kicked grammar; the forms it doesn't carry stay refused", () => {
    expect([HULK, GO_NUTS, MURDOCK, WIDOW, CROSSOVER, CRUEL, HELICARRIER].map((x) => classifyCard(x))).toEqual(Array(7).fill("native-spell"));
    expect(programConfidence(parseEffectProgram(NAY))).toBe("low"); // "… {4} instead if this spell was cast using teamwork" — a trailing replacement form
    const heli = parseEffectProgram(HELICARRIER);
    expect(heli.atoms.map((a) => [a.op, a.amount, a.kickedOnly ? "K" : a.nonKickedOnly ? "N" : "-"])).toEqual([["deal-damage", 2, "N"], ["deal-damage", 4, "K"]]);
    const hulk = parseEffectProgram(HULK);
    expect({ chooseCount: hulk.modal.chooseCount, upTo: hulk.modal.upTo, kicked: hulk.modal.conditionalBothKicked }).toEqual({ chooseCount: 2, upTo: false, kicked: true });
  });
});

describe("⭐ the offer", () => {
  const hulkBoard = (userBf) => board({ user: { hand: [["hulk", HULK]], bf: userBf, mana: { R: 2 } }, ai: { bf: [perm("tb", BEAR, "ai"), perm("ring", SOL_RING, "ai")] } });
  it("⭐ HULK SMASH!: one mode for the plain cast, BOTH for the teamwork cast — which names the creatures it taps", () => {
    const acts = castsOf(hulkBoard([perm("giant", GIANT, "user"), perm("bear", BEAR, "user")]), "user", "hulk");
    const plain = acts.filter((a) => !a.kicked);
    const team = acts.filter((a) => a.kicked);
    const row = {
      plainModes: [...new Set(plain.map((a) => JSON.stringify(a.chosenMode)))].sort(),
      teamModes: [...new Set(team.map((a) => JSON.stringify(a.chosenMode)))],
      teamTaps: [...new Set(team.map((a) => a.teamworkTapIds.join(",")))],
      teamLabel: team[0]?.kickedName,
      teamTargets: team.map((a) => a.targets.map((t) => t.id).join(",")).sort(),
    };
    console.log(`WITNESS hulkOffer ${JSON.stringify(row)}`);
    expect(row).toEqual({
      plainModes: ["[0]", "[1]"], teamModes: ["[0,1]"], teamTaps: ["bear,giant"], teamLabel: "teamwork: tap Grizzly Bears, Hill Giant",
      teamTargets: ["ring,tb,bear", "ring,tb,giant"],
    });
  });
  it("no teamwork variant when the board can't reach N", () => {
    expect(castsOf(hulkBoard([perm("bear", BEAR, "user")]), "user", "hulk").some((a) => a.kicked)).toBe(false);
  });
  it("the tap set: summoning-sick first, then the smallest — and nothing the total doesn't need", () => {
    const sickFirst = castsOf(hulkBoard([perm("giant", GIANT, "user", true), perm("bear", BEAR, "user"), perm("elves", ELVES, "user")]), "user", "hulk").find((a) => a.kicked);
    const cruel = (bf) => castsOf(board({ user: { hand: [["cruel", CRUEL]], bf, mana: { B: 3 } }, ai: { bf: [perm("tb", BEAR, "ai")] } }), "user", "cruel").find((a) => a.kicked);
    const pruned = cruel([perm("elves", ELVES, "user"), perm("bear", BEAR, "user")]);
    const allSick = cruel([perm("bear", BEAR, "user", true)]);
    expect({ sickFirst: [sickFirst.teamworkTapIds, sickFirst.teamworkFree], pruned: [pruned.teamworkTapIds, pruned.teamworkFree], allSick: [allSick.teamworkTapIds, allSick.teamworkFree] })
      .toEqual({ sickFirst: [["giant", "elves"], false], pruned: [["bear"], false], allSick: [["bear"], true] });
  });
  it("a creature tapped for teamwork can't also tap for mana: no teamwork variant when the spell needs it", () => {
    const s = board({ user: { hand: [["cross", CROSSOVER]], bf: [perm("mtn", MOUNTAIN, "user"), perm("e1", ELVES, "user"), perm("e2", ELVES, "user")] } });
    const acts = castsOf(s, "user", "cross");
    expect({ plain: acts.filter((a) => !a.kicked).length, team: acts.filter((a) => a.kicked).length }).toEqual({ plain: 1, team: 0 });
  });
});

describe("⭐ the payment and the resolution", () => {
  const hulkBoard = () => board({ user: { hand: [["hulk", HULK]], bf: [perm("giant", GIANT, "user"), perm("bear", BEAR, "user")], mana: { R: 2 } }, ai: { bf: [perm("tb", BEAR, "ai"), perm("ring", SOL_RING, "ai")] } });
  const teamCast = (s) => castsOf(s, "user", "hulk").find((a) => a.kicked && a.targets.map((t) => t.id).join(",") === "ring,tb,giant");
  it("⭐ the teamwork cast taps its creatures and resolves BOTH modes: the Sol Ring is destroyed and the Giant's 3 kills their Bear", () => {
    const s0 = hulkBoard();
    const cast = dispatchAction(s0, teamCast(s0));
    const tappedAtCast = { giant: tapped(cast, "user", "giant"), bear: tapped(cast, "user", "bear") };
    const out = drain(cast);
    const row = { tappedAtCast, ringGone: !onBf(out, "ai", "ring"), theirBearDead: !onBf(out, "ai", "tb"), logged: (out.log || []).some((e) => e.kind === "teamwork") };
    console.log(`WITNESS hulkTeamwork ${JSON.stringify(row)}`);
    expect(row).toEqual({ tappedAtCast: { giant: true, bear: true }, ringGone: true, theirBearDead: true, logged: true });
  });
  it("the plain cast taps nobody and runs one mode", () => {
    const s0 = hulkBoard();
    const out = drain(dispatchAction(s0, castsOf(s0, "user", "hulk").find((a) => !a.kicked && JSON.stringify(a.chosenMode) === "[0]")));
    expect({ giant: tapped(out, "user", "giant"), bear: tapped(out, "user", "bear"), ringGone: !onBf(out, "ai", "ring"), theirBear: onBf(out, "ai", "tb") }).toEqual({ giant: false, bear: false, ringGone: true, theirBear: true });
  });
  it("a short, stale or missing tap set is refused — the upgrade is never free", () => {
    const s0 = hulkBoard();
    const a = teamCast(s0);
    const code = (fn) => { try { fn(); return "cast"; } catch (e) { return e.code; } };
    const staleBoard = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: s0.players.user.battlefield.map((p) => (p.id === "bear" ? { ...p, tapped: true } : p)) } } };
    expect({
      short: code(() => dispatchAction(s0, { ...a, teamworkTapIds: ["giant"] })),
      stale: code(() => dispatchAction(staleBoard, a)),
      missing: code(() => dispatchAction(s0, { ...a, teamworkTapIds: undefined })),
      twice: code(() => dispatchAction(s0, { ...a, teamworkTapIds: ["giant", "giant"] })),
    }).toEqual({ short: "TEAMWORK_SHORT", stale: "BAD_TARGET", missing: "TEAMWORK_SHORT", twice: "TEAMWORK_SHORT" });
  });
  it("Go Nuts! with teamwork runs its modes in printed order: the counter lands, THEN the fight — so your Bear survives it", () => {
    const s0 = board({ user: { hand: [["go", GO_NUTS]], bf: [perm("bear", BEAR, "user"), perm("giant", GIANT, "user")], mana: { G: 1 } }, ai: { bf: [perm("tb", BEAR, "ai")] } });
    const team = castsOf(s0, "user", "go").filter((a) => a.kicked);
    const pick = team.find((a) => a.targets.some((t) => t.atomIndex === 0 && t.id === "bear")
      && a.targets.some((t) => t.role === "fighter" && t.id === "bear") && a.targets.some((t) => t.role === "target" && t.id === "tb"));
    const out = drain(dispatchAction(s0, pick));
    const mine = out.players.user.battlefield.find((p) => p.id === "bear");
    expect({ taps: pick.teamworkTapIds, mineAlive: !!mine, counters: mine?.counters?.["+1/+1"] ?? 0, theirsDead: !onBf(out, "ai", "tb") })
      .toEqual({ taps: ["giant"], mineAlive: true, counters: 1, theirsDead: true });
  });
  it("Crossover Collaboration makes a Treasure only when cast with teamwork", () => {
    const s0 = board({ user: { hand: [["cross", CROSSOVER]], bf: [perm("bear", BEAR, "user")], mana: { R: 3 }, library: [BEAR, BEAR, BEAR] } });
    const treasures = (s) => s.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.name || "")).length;
    const plain = drain(dispatchAction(s0, castsOf(s0, "user", "cross").find((a) => !a.kicked)));
    const team = drain(dispatchAction(s0, castsOf(s0, "user", "cross").find((a) => a.kicked)));
    expect({ plain: treasures(plain), team: treasures(team) }).toEqual({ plain: 0, team: 1 });
  });
  it("Cruel Alliance: the plain cast reaches only mana value 3 or less; with teamwork, any creature and 3 life", () => {
    const s0 = board({ user: { hand: [["cruel", CRUEL]], bf: [perm("bear", BEAR, "user"), perm("swamp", SWAMP, "user")], mana: { B: 3 } }, ai: { bf: [perm("tb", BEAR, "ai"), perm("big", { ...GIANT, cmc: 4 }, "ai")] } });
    const acts = castsOf(s0, "user", "cruel");
    const plainTargets = [...new Set(acts.filter((a) => !a.kicked).map((a) => a.targets[0].id))].sort();
    const teamTargets = [...new Set(acts.filter((a) => a.kicked).map((a) => a.targets[0].id))].sort();
    const life = s0.players.user.life;
    const out = drain(dispatchAction(s0, acts.find((a) => a.kicked && a.targets[0].id === "big")));
    expect({ plainTargets, teamTargetsHasBig: teamTargets.includes("big"), bigGone: !onBf(out, "ai", "big"), gained: out.players.user.life - life })
      .toEqual({ plainTargets: ["bear", "tb"], teamTargetsHasBig: true, bigGone: true, gained: 3 });
  });
});

describe("the AI pays teamwork only with creatures that couldn't attack anyway", () => {
  const aiBoard = (sick) => board({ active: "ai", ai: { hand: [["cross", CROSSOVER]], bf: [perm("og", OGRE, "ai", sick)], mana: { R: 3 }, library: [BEAR, BEAR, BEAR] } });
  it("an all-sick set → the teamwork cast; a ready attacker → the plain cast", () => {
    const pick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    const sick = pick(aiBoard(true));
    const ready = pick(aiBoard(false));
    expect({ sick: [sick?.name, !!sick?.kicked], ready: [ready?.name, !!ready?.kicked] }).toEqual({ sick: ["Crossover Collaboration", true], ready: ["Crossover Collaboration", false] });
  });
});
