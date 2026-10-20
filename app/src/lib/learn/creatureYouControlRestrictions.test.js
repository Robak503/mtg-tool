/**
 * FIX (false positive) — "target <Subtype> creature you control" offers only creatures of that subtype (the play-weighted slice,
 * 2026-10-18; found auditing Mirkwood). The subtype target noun (parser.js) puts the subtype on the plain own-side atom as a
 * restriction — `targetType: "creatureYouControl"` with `{ kind: "subtype", subtypes }` — and every enumerator branch read its
 * restrictions except that one: spellEffects.enumerateTargets' creatureYouControl pool offered every creature its controller had.
 * Measured on the untouched f71c2a49 archive: Advocate of the Beast (native-trigger) put its counter on a Hill Giant. 34 corpus cards
 * carry such an atom (27 credited native before this slice): Advocate of the Beast, Sygg, River Guide, Jade Bearer, Stromkirk
 * Mentor, Elvenking's Halls, Goblin-town, Venerable Knight …; Mirkwood ("target Bear, Spider, or Wolf you control") is new to the list
 * in this slice. Every one carries a subtype restriction only, a kind creatureSatisfiesRestrictions reads.
 *
 * The rules: a target must meet the targeting requirement (CR 115.1, 601.2c — "target Beast creature you control" names creatures
 * that are Beasts); with no legal target, a triggered ability is removed from the stack (CR 603.3d — Advocate of the Beast's ruling:
 * "If you don't control any Beast creatures as your end step begins, the ability will be removed from the stack and will have no
 * effect"). The enumerator is also the resolution re-check (CR 608.2b), so the same read covers a target that stopped qualifying.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { enumerateTargets } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const ADVOCATE_OF_THE_BEAST = {"name":"Advocate of the Beast","type":"Creature — Elf Shaman","mana":"{2}{G}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["G"],"oracle":"At the beginning of your end step, put a +1/+1 counter on target Beast creature you control."}; // native-trigger on f71c2a49
const MIRKWOOD = {"name":"Mirkwood","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"This land enters tapped.\n{T}: Add {B} or {G}.\n{2}{B}{G}, {T}, Sacrifice this land: Put two +1/+1 counters on target Bear, Spider, or Wolf you control. Activate only as a sorcery."}; // land-partial on f71c2a49
const SYGG_RIVER_GUIDE = {"name":"Sygg, River Guide","type":"Legendary Creature — Merfolk Wizard","mana":"{W}{U}","cmc":2,"power":"2","toughness":"2","keywords":["Landwalk","Islandwalk"],"colors":["U","W"],"oracle":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\n{1}{W}: Target Merfolk you control gains protection from the color of your choice until end of turn."}; // native-activated on f71c2a49
const ENORMOUS_BALOTH = {"name":"Enormous Baloth","type":"Creature — Beast","mana":"{6}{G}","cmc":7,"power":"7","toughness":"7","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const MERFOLK_LOOTER = {"name":"Merfolk Looter","type":"Creature — Merfolk Rogue","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: Draw a card, then discard a card."}; // native-activated on f71c2a49
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana on f71c2a49
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body on f71c2a49

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function board({ user = [], ai = [], pool = {}, step = "main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: step === "end" ? "ending" : "precombat-main", step, stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const ids = (targets) => [...new Set(targets.map((t) => t.id))].sort();
const targetsOffered = (s, permId) => ids(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId).flatMap((a) => a.targets || []));
/** The end-step trigger flushed with every candidate recorded; the engine's own chooser picks. */
function endStep(s0) {
  const seen = [];
  let s = flushTriggers(checkStepTriggers(s0, "endStep"), { chooseTargets: (candidates, info) => { seen.push(...candidates); return chooseTriggerTargets(candidates, info); } });
  for (let i = 0; i < 5 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s);
  const offered = ids(seen.flatMap((c) => (Array.isArray(c) ? c : (c?.targets || [c]))).filter((t) => t?.id));
  return { s, offered };
}
const counters = (s, id) => findPermanent(s, id)?.permanent.counters?.["+1/+1"] ?? 0;

describe("⭐ the own-side pool reads the subtype", () => {
  it("⭐ Advocate of the Beast: its end-step trigger is offered only the Beast, and the counter lands there — never the Hill Giant or the Bears", () => {
    const { s, offered } = endStep(board({ step: "end", user: [P("adv", ADVOCATE_OF_THE_BEAST), P("baloth", ENORMOUS_BALOTH), P("giant", HILL_GIANT), P("bears", GRIZZLY_BEARS)], ai: [P("abaloth", ENORMOUS_BALOTH, "ai")] }));
    expect({ offered, baloth: counters(s, "baloth"), giant: counters(s, "giant"), bears: counters(s, "bears"), abaloth: counters(s, "abaloth") }).toEqual({ offered: ["baloth"], baloth: 1, giant: 0, bears: 0, abaloth: 0 });
  });

  it("⭐ Advocate of the Beast with no Beast: no legal target, nothing gets a counter (its ruling, CR 603.3d)", () => {
    const { s, offered } = endStep(board({ step: "end", user: [P("adv", ADVOCATE_OF_THE_BEAST), P("giant", HILL_GIANT)] }));
    expect({ offered, giant: counters(s, "giant"), adv: counters(s, "adv") }).toEqual({ offered: [], giant: 0, adv: 0 });
  });

  it("⭐ Sygg, River Guide: offered on the Merfolk you control (the Looter and Sygg itself), never the Elves", () => {
    const s = board({ user: [P("sygg", SYGG_RIVER_GUIDE), P("looter", MERFOLK_LOOTER), P("elves", LLANOWAR_ELVES)], ai: [P("alooter", MERFOLK_LOOTER, "ai")], pool: { W: 1, C: 1 } });
    expect(targetsOffered(s, "sygg")).toEqual(["looter", "sygg"]);
  });

  it("⭐ Mirkwood: two counters on a Bear you control — the Hill Giant and the opponent's Bears are never offered", () => {
    const s0 = board({ user: [P("mw", MIRKWOOD), P("bears", GRIZZLY_BEARS), P("giant", HILL_GIANT)], ai: [P("abears", GRIZZLY_BEARS, "ai")], pool: { B: 1, G: 1, C: 2 } });
    expect(targetsOffered(s0, "mw")).toEqual(["bears"]);
  });

  it("CONTROL — an unrestricted \"target creature you control\" still offers every creature its controller has, and none of the opponent's", () => {
    const s = board({ user: [P("bears", GRIZZLY_BEARS), P("giant", HILL_GIANT)], ai: [P("abears", GRIZZLY_BEARS, "ai")] });
    expect(ids(enumerateTargets(s, "user", { op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl" }))).toEqual(["bears", "giant"]);
  });
});
