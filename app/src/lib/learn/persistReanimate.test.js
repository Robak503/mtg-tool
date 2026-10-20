/**
 * PERSIST (EDHREC #1355) — "Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it."
 * Unbreakable Bond (#14991) — "Return target creature card from your graveyard to the battlefield with a lifelink counter on it."
 * Two pieces on the targeted reanimate: "nonlegendary" — the Legendary supertype absent from the card (CR 205.4a), so a legendary
 * creature card is never a legal target (CR 601.2c); and the effect's own enters-with counter (CR 614.1c, 122.6) — on the creature as
 * it enters, so a 1/1 returned by Persist is 0/0 and dies to the state-based action (CR 704.5f), and a lifelink counter gives it
 * lifelink (CR 122.1b).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const PERSIST = {"name":"Persist","type":"Sorcery","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it."}; // arbiter-spell on 0fbdec14
const UNBREAKABLE_BOND = {"name":"Unbreakable Bond","type":"Sorcery","mana":"{4}{B}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Return target creature card from your graveyard to the battlefield with a lifelink counter on it."}; // arbiter-spell on 0fbdec14
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

function table(spell, mana, { graveyard = [], aiGraveyard = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], graveyard, battlefield: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai: { ...s0.players.ai, graveyard: aiGraveyard } } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-spell");
const offered = (s) => [...new Set(casts(s).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
function castAt(s, id) {
  const action = casts(s).find((a) => a.targets?.[0]?.id === id);
  expect(action, `a cast aimed at ${id}`).toBeDefined();
  return resolveTopOfStack(dispatchAction(s, action));
}
const entered = (s, cardId) => (s.players.user.battlefield || []).find((p) => p.card?.id === cardId) || null;
const GY = [{ ...CRAW_WURM, id: "g-wurm" }, { ...ISAMARU, id: "g-isamaru" }, { ...MEMNITE, id: "g-memnite" }, { ...SOL_RING, id: "g-ring" }];

describe("the reader", () => {
  it("⭐ both cards play their whole text", () => {
    expect({ persist: classifyCard(PERSIST), bond: classifyCard(UNBREAKABLE_BOND) }).toEqual({ persist: "native-spell", bond: "native-spell" });
  });
  it("⭐ the atoms: the nonlegendary filter and the enters-with counter; a finality counter and two counters stay unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || [];
    expect({
      persist: atoms(PERSIST.oracle),
      bond: atoms(UNBREAKABLE_BOND.oracle),
      bare: atoms("Return target creature card from your graveyard to the battlefield."),
      finality: atoms("Return target creature card from your graveyard to the battlefield with a finality counter on it."),
      two: atoms("Return target permanent card from your graveyard to the battlefield with a hexproof counter and an indestructible counter on it."),
    }).toEqual({
      persist: [{ op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", nonlegendary: true }, entersWithCounter: { type: "-1/-1", n: 1 } }],
      bond: [{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", entersWithCounter: { type: "lifelink", n: 1 } }],
      bare: [{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" }],
      finality: [],
      two: [],
    });
  });
});

describe("Persist", () => {
  it("⭐ offered on the nonlegendary creature cards in the caster's graveyard — never the legendary Isamaru, the Sol Ring or the opponent's Bears", () => {
    expect(offered(table(PERSIST, { B: 1, C: 1 }, { graveyard: GY, aiGraveyard: [{ ...GRIZZLY_BEARS, id: "g-abears" }] }))).toEqual(["g-memnite", "g-wurm"]);
  });
  it("⭐ the Wurm returns with a -1/-1 counter: a 5/3", () => {
    const s = castAt(table(PERSIST, { B: 1, C: 1 }, { graveyard: GY }), "g-wurm");
    const w = entered(s, "g-wurm");
    expect({ counters: w?.counters?.["-1/-1"] ?? 0, pt: w && [creaturePower(w, s), creatureToughness(w, s)] }).toEqual({ counters: 1, pt: [5, 3] });
  });
  it("⭐ a 1/1 returns as a 0/0 and is put into the graveyard by the state-based action", () => {
    const s = castAt(table(PERSIST, { B: 1, C: 1 }, { graveyard: GY }), "g-memnite");
    expect({ onBattlefield: !!entered(s, "g-memnite"), inGraveyard: s.players.user.graveyard.some((c) => c.id === "g-memnite") }).toEqual({ onBattlefield: false, inGraveyard: true });
  });
});

describe("Unbreakable Bond", () => {
  it("⭐ any creature card, the legendary one too; it returns with a lifelink counter and has lifelink", () => {
    const s0 = table(UNBREAKABLE_BOND, { B: 1, C: 4 }, { graveyard: GY });
    const s = castAt(s0, "g-isamaru");
    const isamaru = entered(s, "g-isamaru");
    expect({ offered: offered(s0), counter: isamaru?.counters?.lifelink ?? 0, lifelink: !!(isamaru && permanentHasKeyword(s, isamaru.id, "Lifelink")), pt: isamaru && [creaturePower(isamaru, s), creatureToughness(isamaru, s)] })
      .toEqual({ offered: ["g-isamaru", "g-memnite", "g-wurm"], counter: 1, lifelink: true, pt: [2, 2] });
  });
});
