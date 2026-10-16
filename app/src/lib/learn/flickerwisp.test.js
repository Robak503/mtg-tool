/**
 * flickerwisp.test.js — "When this creature enters, exile another target permanent. Return that card to the battlefield under
 * its owner's control at the beginning of the next end step." (Flickerwisp, Glimmerpoint Stag — census rank 60 of the 09-06
 * plan's stage ③, 2026-09-30).
 *
 * The delayed-return blink existed for "exile target creature" (Otherworldly Journey, Turn to Mist — delayedBlink*.test.js):
 * the applier exiles now and schedules a `[blink-return …]` sentinel on the CR 603.7 delayed queue for the next end step.
 * This is the same applier on the PERMANENT pool: any permanent but the source ("another", CR 109.5 — the fail-closed
 * notSource restriction the detain lane uses). An Aura is offered too since 2026-10-16 (it was withheld while the return had
 * no attach step): it comes back choosing what it enchants (CR 303.4f) — the cases are the last describe block.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). The ETB runs through enterPermanent → flushTriggers
 * (chooseTriggerTargets) → the stack; the return fires through advanceStep's end-step drain.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, findPermanent, moveCardToZone } from "./gameState.js";
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
  // GRADUATED 2026-10-16: `typeNeg aura` → `auraEntryModeled` — the returning Aura chooses what it enchants now (CR 303.4f).
  it("⭐ the clause is the delayed-blink atom on the permanent pool — not its source, an Aura only with a listable Enchant line; both carriers native", () => {
    const p = parseEffectClause(CLAUSE, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "delayed-blink", targetType: "permanent", restrictions: [{ kind: "notSource" }, { kind: "auraEntryModeled" }], withCounter: false }]);
    expect([classifyCard(FLICKERWISP), classifyCard(STAG)]).toEqual(["native-trigger", "native-trigger"]);
  });
  it("⛔ a delayed return under YOUR control is still not modeled (owner return only) — stays low", () => {
    expect(programConfidence(parseEffectClause("exile another target permanent. Return that card to the battlefield under your control at the beginning of the next end step", "Creature"))).toBe("low");
  });
});

describe("RUNTIME — the pool, the exile, the return", () => {
  // GRADUATED 2026-10-16: the Aura is in the pool now (the return chooses its host); the Curse case is in the last block.
  it("⭐ the pool: every permanent but Flickerwisp itself — the Aura and its host both", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user"), perm("plains", PLAINS, "user")], ai: [perm("stone", MIND_STONE, "ai"), perm("bears", BEARS, "ai"), perm("pac", PACIFISM, "ai")] });
    s = attachPermanent(s, { equipId: "pac", targetId: "bears" });
    const atom = parseEffectClause(CLAUSE, "Creature").atoms[0];
    const pool = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions }, [], { sourceId: "fw" }).map((t) => t.id).sort();
    expect(pool).toEqual(["bears", "pac", "plains", "stone"]);
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

// ── 2026-10-16: the Aura lift. A returning Aura chooses what it enchants as it comes back (CR 303.4f — the end-step return enters
// through effects/atoms/zones.enterCardFromZone → auraEntry.chooseAuraEntryHost), and with nothing it may enchant it stays exiled
// (CR 303.4g). An Aura whose Enchant line the engine can't list (a Curse) is still kept out of the pool — it would stay in exile
// where the rules return it. Real oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16).
const PACIFISM_REAL = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const CURIOSITY = {"name":"Curiosity","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card."}; // native-trigger
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body

/** What the (single) permanent called `name` is attached to: "<host> (<controller>)", null when attached to nothing or gone. */
function hostOf(s, name) {
  const p = Object.values(s.players).flatMap((pl) => pl.battlefield).find((x) => x.card?.name === name);
  const h = p?.attachedTo ? findPermanent(s, p.attachedTo) : null;
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
}
/** Flickerwisp's applier on an explicit target, then the real end-step drain. */
function flickerTo(s0, targetId) {
  const atom = parseEffectClause(CLAUSE, "Creature").atoms[0];
  const t = findPermanent(s0, targetId);
  const afterExile = resolveAtom(s0, atom, { controller: "user", sourceId: "fw", targets: [{ type: "permanent", id: targetId, controller: t.controller }] });
  return { afterExile, atEnd: toEndStep(afterExile) };
}

describe("⭐ the Aura lift (2026-10-16) — a flickered Aura returns at the end step choosing what it enchants", () => {
  it("⭐ the pool holds the opponent's Pacifism, never their Curse (Enchant player — an Enchant line the engine can't list)", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user"), perm("plains", PLAINS, "user")], ai: [perm("bears", BEARS, "ai"), perm("pac", PACIFISM_REAL, "ai"), perm("curse", CURSE, "ai", { enchantedPlayerId: "user" })] });
    s = attachPermanent(s, { equipId: "pac", targetId: "bears" });
    const atom = parseEffectClause(CLAUSE, "Creature").atoms[0];
    const pool = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions }, [], { sourceId: "fw" }).map((t) => t.id).sort();
    console.log(`WITNESS flickerwispAuraPool ${JSON.stringify(pool)}`);
    expect(pool).toEqual(["bears", "pac", "plains"]);
  });

  it("⭐ the opponent's Pacifism, flickered off their Grizzly Bears, comes back at the end step under its OWNER's control — on YOUR Craw Wurm", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user"), perm("wurm", WURM, "user")], ai: [perm("bears", BEARS, "ai"), perm("pac", PACIFISM_REAL, "ai")] });
    s = attachPermanent(s, { equipId: "pac", targetId: "bears" });
    const { afterExile, atEnd } = flickerTo(s, "pac");
    const back = atEnd.players.ai.battlefield.find((p) => p.card?.name === "Pacifism");
    const row = { exiled: names(afterExile.players.ai.exile), host: hostOf(atEnd, "Pacifism"), newObject: back ? back.id !== "pac" : null, exileAtEnd: names(atEnd.players.ai.exile) };
    console.log(`WITNESS flickerwispAuraReturn ${JSON.stringify(row)}`);
    expect(row).toEqual({ exiled: ["Pacifism"], host: "Craw Wurm (user)", newObject: true, exileAtEnd: [] });
  });

  it("CR 303.4g — with nothing it can enchant at the end step, the Pacifism stays in exile", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user")], ai: [perm("bears", BEARS, "ai"), perm("pac", PACIFISM_REAL, "ai")] });
    s = attachPermanent(s, { equipId: "pac", targetId: "bears" });
    const { afterExile } = flickerTo(s, "pac");
    // Before the end step every creature leaves (the return fires anyway — the bundled Flickerwisp ruling).
    let gone = moveCardToZone(afterExile, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "fw" });
    gone = moveCardToZone(gone, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "bears" });
    const atEnd = toEndStep(gone);
    expect({ onBattlefield: !!atEnd.players.ai.battlefield.find((p) => p.card?.name === "Pacifism"), exile: names(atEnd.players.ai.exile) }).toEqual({ onBattlefield: false, exile: ["Pacifism"] });
  });

  it("an Aura whose side the house policy can't read returns to the side it left: your Curiosity flickered off the opponent's Hill Giant comes back on THEIR Giant, not on one of your creatures", () => {
    let s = board({ user: [perm("fw", FLICKERWISP, "user"), perm("bears", BEARS, "user"), perm("cur", CURIOSITY, "user")], ai: [perm("giant", GIANT, "ai")] });
    s = attachPermanent(s, { equipId: "cur", targetId: "giant" });
    const { afterExile, atEnd } = flickerTo(s, "cur");
    expect({ sentinel: (afterExile.delayedTriggers || []).map((d) => d.effectClause), host: hostOf(atEnd, "Curiosity") })
      .toEqual({ sentinel: ["[blink-return c-cur user plain enemy]"], host: "Hill Giant (ai)" });
  });
});
