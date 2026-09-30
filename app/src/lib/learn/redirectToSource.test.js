/**
 * redirectToSource.test.js — "you may change the target of target instant or sorcery spell with a single target to this
 * creature" (CR 115.7a — shelf decks D10, 2026-09-30: Hydroelectric Specimen in Captain America, Kinnan and Believe it!).
 *
 * The enters trigger targets an instant or sorcery with exactly one chosen target (CR 115.9a counts the targets chosen as
 * it was put on the stack); on resolution the "may" moves that target to the Specimen when the Specimen is a legal target
 * for it — in the same slot, from the spell's controller's side, with the spell's own kick and mode (CR 115.8) — and
 * leaves it unchanged otherwise (CR 115.7a). Changing a target is not countering, so an uncounterable spell stays a legal
 * target.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const SPECIMEN = card("Hydroelectric Specimen // Hydroelectric Laboratory", "Creature — Weird // Land", "{2}{U}", 3,
  "Hydroelectric Specimen - Creature — Weird {2}{U}\nFlash\nWhen this creature enters, you may change the target of target instant or sorcery spell with a single target to this creature.\n//\nHydroelectric Laboratory - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.",
  { power: "1", toughness: "4", keywords: ["Flash"], layout: "modal_dfc" });
const LIGHTNING_BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.");
const SHATTER = card("Shatter", "Instant", "{1}{R}", 2, "Destroy target artifact.");
const ABRADE = card("Abrade", "Instant", "{1}{R}", 2, "Choose one —\n• Abrade deals 3 damage to target creature.\n• Destroy target artifact.");
const PREY_UPON = card("Prey Upon", "Sorcery", "{G}", 1, "Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)", { keywords: ["Fight"] });
const BURST_LIGHTNING = card("Burst Lightning", "Instant", "{R}", 1, "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.", { keywords: ["Kicker"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** The AI's turn: it holds `spell` with `mana`; you control `mine` and hold the Specimen. */
function aiTurn(spell, mana, { mine = [], theirs = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      ai: { ...g.players.ai, hand: [{ ...spell, id: "spell" }], battlefield: theirs, manaPool: { ...g.players.ai.manaPool, ...mana } },
      user: { ...g.players.user, hand: [{ ...SPECIMEN, id: "spec" }], battlefield: mine, manaPool: { ...g.players.user.manaPool, U: 3 } } } };
}
const castOf = (s, who, id, pick = () => true) => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === id).find(pick);
const drain = (s) => { let n = s, g = 0; while (n.stack?.length && g++ < 20) n = n.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(n, true) : resolveTopOfStack(n); return n.pendingChoice?.kind === "optional-effect" ? drain(resolveOptionalChoice(n, true)) : n; };
/** In response to the AI's spell: flash the Specimen in, let it resolve (its trigger goes on the stack), answer "yes". */
function flashIn(s, { beforeTrigger = (x) => x } = {}) {
  let n = { ...s, priorityHolder: "user" };
  n = dispatchAction(n, castOf(n, "user", "spec"));
  n = resolveTopOfStack(n);                             // the Specimen enters; its trigger is put on the stack
  const trigger = n.stack[n.stack.length - 1];
  n = beforeTrigger(n);
  n = resolveTopOfStack(n);                             // the trigger resolves to its printed "may"
  if (n.pendingChoice?.kind === "optional-effect") n = resolveOptionalChoice(n, true);
  return { state: n, trigger };
}
const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const specimenId = (s) => s.players.user.battlefield.find((p) => /Hydroelectric/.test(p.card?.name || ""))?.id;
const lastLog = (s, effect) => [...(s.log || [])].reverse().find((e) => e.effect === effect);

describe("⭐ the redirect", () => {
  it("⭐ a Lightning Bolt at your Hill Giant ends on the Specimen instead — 1/4, it survives", () => {
    let s = aiTurn(LIGHTNING_BOLT, { R: 1 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets[0].id === "giant"));
    const bolt = s.stack[0].id;
    const { state, trigger } = flashIn(s);
    const spec = specimenId(state);
    const retargeted = state.stack.find((o) => o.id === bolt).targets.map((t) => t.id);
    const out = drain(state);
    const row = { triggerTargets: trigger.targets.map((t) => t.id), retargeted: retargeted[0] === spec, giantAlive: onBf(out, "user", "giant"), specimenAlive: onBf(out, "user", spec), specimenDamage: out.players.user.battlefield.find((p) => p.id === spec)?.damageMarked, crime: out.players.user.crimeCommittedThisTurn === true };
    console.log(`WITNESS specimenRedirect ${JSON.stringify(row)}`);
    expect(row).toEqual({ triggerTargets: [bolt], retargeted: true, giantAlive: true, specimenAlive: true, specimenDamage: 3, crime: true });
  });
  it("a kicked Burst Lightning moves in its kicked slot — 4 damage, and the Specimen dies instead of the Giant", () => {
    let s = aiTurn(BURST_LIGHTNING, { R: 5 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.kicked && a.targets[0].id === "giant"));
    const { state } = flashIn(s);
    const spec = specimenId(state);
    const moved = state.stack[0].targets;
    const out = drain(state);
    expect({ moved: moved.map((t) => [t.atomIndex, t.id === spec]), giantAlive: onBf(out, "user", "giant"), specimenAlive: onBf(out, "user", spec) })
      .toEqual({ moved: [[1, true]], giantAlive: true, specimenAlive: false });
  });
  it("an uncounterable spell is still a legal target — changing a target is not countering it", () => {
    let s = aiTurn(LIGHTNING_BOLT, { R: 1 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets[0].id === "giant"));
    s = { ...s, stack: s.stack.map((o) => ({ ...o, uncounterable: true })) };   // e.g. a resolved "can't be countered" grant
    const { state, trigger } = flashIn(s);
    expect({ targeted: trigger.kind === "triggered-ability" && trigger.targets[0]?.id === s.stack[0].id, giantAlive: onBf(drain(state), "user", "giant") })
      .toEqual({ targeted: true, giantAlive: true });
  });
});

describe("⛔ when the target stays (CR 115.7a)", () => {
  it("Shatter at your Sol Ring: the Specimen isn't an artifact, so the target is unchanged", () => {
    let s = aiTurn(SHATTER, { R: 2 }, { mine: [perm("ring", SOL_RING, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell"));
    const { state } = flashIn(s);
    const out = drain(state);
    expect({ reason: lastLog(state, "redirect-unchanged")?.reason, ringDestroyed: !onBf(out, "user", "ring") })
      .toEqual({ reason: "source-not-a-legal-target", ringDestroyed: true });
  });
  it("⭐ Abrade keeps its mode (CR 115.8): 'destroy target artifact' can't become a creature; 'deals 3 damage to target creature' can", () => {
    const run = (mode, targetId, mine) => {
      let s = aiTurn(ABRADE, { R: 2 }, { mine });
      s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.chosenMode === mode && a.targets[0].id === targetId));
      const { state } = flashIn(s);
      return { moved: state.stack[0].targets[0].id === specimenId(state), after: drain(state) };
    };
    const artifactMode = run(1, "ring", [perm("ring", SOL_RING, "user")]);
    const creatureMode = run(0, "giant", [perm("giant", GIANT, "user")]);
    expect({ artifactMoved: artifactMode.moved, ringDestroyed: !onBf(artifactMode.after, "user", "ring"), creatureMoved: creatureMode.moved, giantAlive: onBf(creatureMode.after, "user", "giant") })
      .toEqual({ artifactMoved: false, ringDestroyed: true, creatureMoved: true, giantAlive: true });
  });
  it("the target moves in its OWN slot — the −2/−2 half stays the −2/−2 half (CR 115.7a)", () => {
    // SYNTHETIC SHAPE (no printed card has two unrestricted "up to one target creature" slots with no mandatory one; the
    // parser admits it, so the guard is witnessed here). One target chosen, in the SECOND slot; the Specimen is legal in
    // both, and only the second is a change of THAT target.
    const TWIN = card("Twin Tides", "Instant", "{1}{B}", 2, "Up to one target creature gets +2/+2 until end of turn. Up to one target creature gets -2/-2 until end of turn.");
    let s = aiTurn(TWIN, { B: 2 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets.length === 1 && a.targets[0].atomIndex === 1 && a.targets[0].id === "giant"));
    const { state } = flashIn(s);
    const spec = specimenId(state);
    const out = drain(state);
    expect({ slot: state.stack[0].targets.map((t) => [t.atomIndex, t.id === spec]), specimen: [permanentPower(out, spec), permanentToughness(out, spec)], giant: [permanentPower(out, "giant"), permanentToughness(out, "giant")] })
      .toEqual({ slot: [[1, true]], specimen: [-1, 2], giant: [3, 3] });
  });
  it("the Specimen gone before its trigger resolves: nothing to move the target to", () => {
    let s = aiTurn(LIGHTNING_BOLT, { R: 1 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets[0].id === "giant"));
    const gone = (n) => ({ ...n, players: { ...n.players, user: { ...n.players.user, battlefield: n.players.user.battlefield.filter((p) => !/Hydroelectric/.test(p.card?.name || "")) } } });
    const { state } = flashIn(s, { beforeTrigger: gone });
    expect({ reason: lastLog(state, "redirect-unchanged")?.reason, giantDied: !onBf(drain(state), "user", "giant") }).toEqual({ reason: "source-gone", giantDied: true });
  });
});

describe("what it can target", () => {
  it("a spell with TWO targets is not 'a spell with a single target' (CR 115.9a) — Prey Upon is never offered", () => {
    let s = aiTurn(PREY_UPON, { G: 1 }, { mine: [perm("ub", BEAR, "user")], theirs: [perm("ag", GIANT, "ai")] });
    s = dispatchAction(s, castOf(s, "ai", "spell"));
    let n = { ...s, priorityHolder: "user" };
    n = resolveTopOfStack(dispatchAction(n, castOf(n, "user", "spec")));
    expect({ stack: n.stack.map((o) => o.source?.name), preyTargets: n.stack[0].targets.length }).toEqual({ stack: ["Prey Upon"], preyTargets: 2 });
  });
  it("an Aura spell has a single target but is not an instant or sorcery — Pacifism is never offered", () => {
    const PACIFISM = card("Pacifism", "Enchantment — Aura", "{1}{W}", 2, "Enchant creature\nEnchanted creature can't attack or block.", { keywords: ["Enchant"] });
    let s = aiTurn(PACIFISM, { W: 2 }, { mine: [perm("giant", GIANT, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets?.[0]?.id === "giant"));
    let n = { ...s, priorityHolder: "user" };
    n = resolveTopOfStack(dispatchAction(n, castOf(n, "user", "spec")));
    expect({ stack: n.stack.map((o) => o.source?.name), auraTargets: n.stack[0].targets.length }).toEqual({ stack: ["Pacifism"], auraTargets: 1 });
  });
  it("a targeted spell with no effect program leaves nothing to re-check — logged, unchanged, no throw", () => {
    let s = aiTurn(LIGHTNING_BOLT, { R: 1 }, { mine: [perm("giant", GIANT, "user"), perm("spec", SPECIMEN, "user")] });
    s = dispatchAction(s, castOf(s, "ai", "spell", (a) => a.targets[0].id === "giant"));
    const bare = { ...s, stack: s.stack.map((o) => ({ ...o, payload: { resolver: "manual" } })) };
    let out;
    expect(() => { out = resolveAtom(bare, { op: "redirect-to-source", targetType: "spell" }, { controller: "user", sourceId: "spec", targets: [{ type: "spell", id: bare.stack[0].id }] }); }).not.toThrow();
    expect({ reason: lastLog(out, "redirect-unchanged")?.reason, targets: out.stack[0].targets.map((t) => t.id) }).toEqual({ reason: "no-program", targets: ["giant"] });
  });
  it("reads native: the whole modal double-faced card", () => {
    expect(classifyCard(SPECIMEN)).toBe("native-trigger");
  });
});
