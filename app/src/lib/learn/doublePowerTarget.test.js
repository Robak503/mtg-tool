/**
 * "DOUBLE TARGET CREATURE'S POWER UNTIL END OF TURN" — a chosen creature (any controller, CR 115.1) gets +X/+0, X its power as the
 * effect resolves (CR 701.10b; Unleash Fury's ruling: "that creature gets +X/+0, where X is its power as that effect begins to
 * apply … The value of X won't change if another effect alters the creature's power later in the turn"):
 *   · Bulk Up (EDHREC #1442) — "Double target creature's power until end of turn." with flashback {4}{R}{R};
 *   · Unleash Fury (#1635) — "Double the power of target creature until end of turn.";
 *   · Mr. Orfeo, the Boulder (#7868) — "Whenever you attack, double target creature's power until end of turn." (Mr. Orfeo's
 *     ruling: X is the power "as Mr. Orfeo's triggered ability resolves").
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { resolveTopOfStack, passPriority } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { expireContinuousEffects } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const BULK_UP = {"name":"Bulk Up","type":"Instant","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":["Flashback","Double"],"colors":["R"],"oracle":"Double target creature's power until end of turn.\nFlashback {4}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // arbiter-spell on 0fbdec14
const UNLEASH_FURY = {"name":"Unleash Fury","type":"Instant","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":["Double"],"colors":["R"],"oracle":"Double the power of target creature until end of turn."}; // arbiter-spell on 0fbdec14
const MR_ORFEO = {"name":"Mr. Orfeo, the Boulder","type":"Legendary Creature — Rhino Warrior","mana":"{1}{B}{R}{G}","cmc":4,"power":"2","toughness":"4","keywords":["Double"],"colors":["B","G","R"],"oracle":"Whenever you attack, double target creature's power until end of turn."}; // body-only on 0fbdec14
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const GLORIOUS_ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."};

const P = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), counters: {} });
function table({ hand = [], graveyard = [], user = [], ai = [], mana = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, graveyard, battlefield: user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai: { ...s0.players.ai, battlefield: ai } } };
}
const casts = (s, cardId, zone = "hand") => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.fromZone ?? "hand") === zone);
const offered = (acts) => [...new Set(acts.flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
function castAt(s, acts, id) {
  const action = acts.find((a) => a.targets?.[0]?.id === id);
  expect(action, `a cast aimed at ${id}`).toBeDefined();
  return resolveTopOfStack(dispatchAction(s, action));
}
const pt = (s, id) => { const p = findPermanent(s, id)?.permanent; return p ? [creaturePower(p, s), creatureToughness(p, s)] : null; };

describe("the reader", () => {
  it("⭐ the three cards play their whole text", () => {
    expect({ bulk: classifyCard(BULK_UP), fury: classifyCard(UNLEASH_FURY), orfeo: classifyCard(MR_ORFEO) })
      .toEqual({ bulk: "native-spell", fury: "native-spell", orfeo: "native-trigger" });
  });
  it("⭐ one atom: the per-target doubling on a chosen creature; \"X times\" and a \"you control\" scope stay unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Instant", oracle })?.atoms || [];
    expect({
      fury: atoms("Double the power of target creature until end of turn."),
      bulk: atoms("Double target creature's power until end of turn."),
      times: atoms("Until end of turn, double target creature's power X times."),
      scoped: atoms("Double the power of target creature you control until end of turn."),
    }).toEqual({
      fury: [{ op: "pump", targetType: "creature", doublePt: "p" }],
      bulk: [{ op: "pump", targetType: "creature", doublePt: "p" }],
      times: [],
      scoped: [],
    });
  });
});

describe("Unleash Fury", () => {
  it("⭐ offered on every creature, either side; the Wurm becomes 12/4, its power as it resolves (the Anthem counted), and it ends at cleanup", () => {
    const s0 = table({ hand: [{ ...UNLEASH_FURY, id: "h-fury" }], user: [P("wurm", CRAW_WURM, "user"), P("anthem", GLORIOUS_ANTHEM, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")], mana: { R: 1, C: 1 } });
    const acts = casts(s0, "h-fury");
    const s = castAt(s0, acts, "wurm");
    expect({ offered: offered(acts), wurm: pt(s, "wurm"), bears: pt(s, "bears"), cleanup: pt(expireContinuousEffects(s, { atCleanupOfTurn: 4 }), "wurm") })
      .toEqual({ offered: ["bears", "wurm"], wurm: [14, 5], bears: [2, 2], cleanup: [7, 5] });
  });
});

describe("Bulk Up", () => {
  it("⭐ from the hand on the opponent's Bears: a 4/2", () => {
    const s0 = table({ hand: [{ ...BULK_UP, id: "h-bulk" }], ai: [P("bears", GRIZZLY_BEARS, "ai")], mana: { R: 1, C: 1 } });
    expect(pt(castAt(s0, casts(s0, "h-bulk"), "bears"), "bears")).toEqual([4, 2]);
  });
  it("⭐ flashback: cast from the graveyard for {4}{R}{R}, it doubles the Wurm and is exiled", () => {
    const s0 = table({ graveyard: [{ ...BULK_UP, id: "g-bulk" }], user: [P("wurm", CRAW_WURM, "user")], mana: { R: 2, C: 4 } });
    const s = castAt(s0, casts(s0, "g-bulk", "graveyard"), "wurm");
    expect({ wurm: pt(s, "wurm"), exiled: s.players.user.exile.some((c) => c.id === "g-bulk"), graveyard: s.players.user.graveyard.length }).toEqual({ wurm: [12, 4], exiled: true, graveyard: 0 });
  });
});

describe("Mr. Orfeo, the Boulder", () => {
  it("⭐ the attack trigger doubles a creature of its controller's — never the opponent's: the default chooser's first own creature, the attacking Wurm, 12/4", () => {
    // The default trigger chooser takes the first creature of the right side (gameEngine.chooseTriggerTargets — which one is play
    // quality, never legality); the Wurm is first on this battlefield.
    const s0 = { ...table({ user: [P("wurm", CRAW_WURM, "user"), P("orfeo", MR_ORFEO, "user")], ai: [P("bears", GRIZZLY_BEARS, "ai")] }), phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    const declare = legalActionsForPlayer(s0, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "wurm");
    expect(declare, "the Wurm may attack").toBeDefined();
    let s = passPriority(dispatchAction(s0, declare));
    const fired = s.stack.map((o) => o.source?.name);
    let g = 0;
    while (s.stack.length && g++ < 20) s = passPriority(s);
    expect({ fired, wurm: pt(s, "wurm"), orfeo: pt(s, "orfeo"), bears: pt(s, "bears") }).toEqual({ fired: ["Mr. Orfeo, the Boulder"], wurm: [12, 4], orfeo: [2, 4], bears: [2, 2] });
  });
});
