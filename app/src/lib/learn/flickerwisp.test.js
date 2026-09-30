/**
 * flickerwisp.test.js — "When this creature enters, exile another target permanent. Return that card to the battlefield under
 * its owner's control at the beginning of the next end step." (Flickerwisp, Glimmerpoint Stag — census rank 60 of the 09-06
 * plan's stage ③, 2026-09-30).
 *
 * The delayed-return blink existed for "exile target creature" (Otherworldly Journey, Turn to Mist — delayedBlink*.test.js):
 * the applier exiles now and schedules a `[blink-return …]` sentinel on the CR 603.7 delayed queue for the next end step.
 * This is the same applier on the PERMANENT pool: any permanent but the source ("another", CR 109.5 — the fail-closed
 * notSource restriction the detain lane uses), and never an Aura — a returning Aura's owner chooses what it enchants
 * (CR 303.4f) and the return path has no attach step, so an Aura is not offered (the detain lane's documented narrow FN).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). The ETB runs through enterPermanent → flushTriggers
 * (chooseTriggerTargets) → the stack; the return fires through advanceStep's end-step drain.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FLICKERWISP = { id: "fw", name: "Flickerwisp", type: "Creature — Elemental", mana: "{1}{W}{W}", power: "3", toughness: "1", keywords: ["Flying"],
  oracle: "Flying\nWhen this creature enters, exile another target permanent. Return that card to the battlefield under its owner's control at the beginning of the next end step." };
const STAG = { id: "stag", name: "Glimmerpoint Stag", type: "Creature — Elk", mana: "{2}{W}{W}", power: "3", toughness: "3", keywords: ["Vigilance"],
  oracle: "Vigilance\nWhen this creature enters, exile another target permanent. Return that card to the battlefield under its owner's control at the beginning of the next end step." };
const CLAUSE = "exile another target permanent. Return that card to the battlefield under its owner's control at the beginning of the next end step";
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", keywords: [], oracle: "({T}: Add {W}.)" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const SOLDIER_TOKEN = { name: "Soldier", type: "Token Creature — Soldier", mana: "", power: "1", toughness: "1", keywords: [], oracle: "", token: true };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
// Advance the turn to its end step the way the game loop does (advanceStep, then the step's actions — where the delayed
// queue drains), then flush and resolve what the drain queued (the delayed return).
function toEndStep(s0) {
  let s = s0;
  for (let i = 0; i < 20 && s.step !== "end"; i++) s = runStepActions(advanceStep(s));
  return settle(s);
}
const names = (list) => (list || []).map((p) => p.card?.name ?? p.name).sort();

describe("the parse + the tiers", () => {
  it("⭐ the clause is the delayed-blink atom on the permanent pool — not its source, never an Aura; both carriers native", () => {
    const p = parseEffectClause(CLAUSE, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "delayed-blink", targetType: "permanent", restrictions: [{ kind: "notSource" }, { kind: "typeNeg", type: "aura" }], withCounter: false }]);
    expect([classifyCard(FLICKERWISP), classifyCard(STAG)]).toEqual(["native-trigger", "native-trigger"]);
  });
  it("⛔ a delayed return under YOUR control is still not modeled (owner return only) — stays low", () => {
    expect(programConfidence(parseEffectClause("exile another target permanent. Return that card to the battlefield under your control at the beginning of the next end step", "Creature"))).toBe("low");
  });
});

describe("RUNTIME — the pool, the exile, the return", () => {
  it("⭐ the pool: every permanent but Flickerwisp itself and the Aura (its host stays in)", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user"), perm("plains", PLAINS, "user")], ai: [perm("stone", MIND_STONE, "ai"), perm("bears", BEARS, "ai"), perm("pac", PACIFISM, "ai")] });
    s = attachPermanent(s, { equipId: "pac", targetId: "bears" });
    const atom = parseEffectClause(CLAUSE, "Creature").atoms[0];
    const pool = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions }, [], { sourceId: "fw" }).map((t) => t.id).sort();
    expect(pool).toEqual(["bears", "plains", "stone"]);
    console.log(`WITNESS flickerwispPool ${JSON.stringify(pool)}`);
  });

  it("⭐ an opponent's Mind Stone chosen as the target: exiled now, back at the end step under its OWNER's control, a new object", () => {
    // The applier with an explicit target (a player may legally choose an opponent's permanent); the return rides the real
    // end-step drain. The flush CHOOSER's side preference is pinned separately below.
    const s0 = board({ user: [perm("fw", FLICKERWISP, "user")], ai: [perm("stone", MIND_STONE, "ai")] });
    const atom = parseEffectClause(CLAUSE, "Creature").atoms[0];
    const afterExile = resolveAtom(s0, atom, { controller: "user", sourceId: "fw", targets: [{ type: "permanent", id: "stone", controller: "ai" }] });
    const exiled = { aiBattlefield: names(afterExile.players.ai.battlefield), aiExile: names(afterExile.players.ai.exile), scheduled: (afterExile.delayedTriggers || []).length };
    expect(exiled).toEqual({ aiBattlefield: [], aiExile: ["Mind Stone"], scheduled: 1 });
    const atEnd = toEndStep(afterExile);
    const back = atEnd.players.ai.battlefield.find((p) => p.card?.name === "Mind Stone");
    const result = { exiled, returned: { onAiBattlefield: !!back, newObject: back ? back.id !== "stone" : null, aiExile: names(atEnd.players.ai.exile) } };
    expect(result.returned).toEqual({ onAiBattlefield: true, newObject: true, aiExile: [] });
    console.log(`WITNESS flickerwispRoundTrip ${JSON.stringify(result)}`);
  });

  it("the flush chooser keeps delayed-blink's OWN-side intent: offered only an opponent's permanent, it declines (a safe no-op)", () => {
    // atomTargetIntent("delayed-blink") is "own" (programQueries) — the chooser never picks an opponent's permanent for a
    // blink, so a board with nothing else of yours routes the trigger to the Arbiter no-op rather than guessing a side.
    const out = settle(enterPermanent(board({ ai: [perm("stone", MIND_STONE, "ai")] }), FLICKERWISP, "user"));
    expect({ ai: names(out.players.ai.battlefield), exile: names(out.players.ai.exile) }).toEqual({ ai: ["Mind Stone"], exile: [] });
  });

  it("the land trick: a TAPPED Plains of your own leaves and returns UNTAPPED at the end step", () => {
    const s0 = board({ user: [perm("plains", PLAINS, "user", { tapped: true })] });
    const atEnd = toEndStep(settle(enterPermanent(s0, STAG, "user")));
    const plains = atEnd.players.user.battlefield.find((p) => p.card?.name === "Plains");
    expect({ back: !!plains, tapped: plains?.tapped ?? null }).toEqual({ back: true, tapped: false });
  });

  it("a token flickered ceases to exist — nothing comes back (CR 111.7)", () => {
    const s0 = board({ user: [perm("tok", SOLDIER_TOKEN, "user")] });
    const atEnd = toEndStep(settle(enterPermanent(s0, FLICKERWISP, "user")));
    expect({ user: names(atEnd.players.user.battlefield), exile: names(atEnd.players.user.exile) }).toEqual({ user: ["Flickerwisp"], exile: [] });
  });
});
