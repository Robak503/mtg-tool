/**
 * exileUpToTwoArtifactsEnchantments.test.js — the play-weighted program, #1052 Angel of the Ruins.
 *
 *   "When this creature enters, exile up to two target artifacts and/or enchantments."
 *
 * The destroy form of the same sentence was read (Force of Vigor: "Destroy up to two target artifacts and/or enchantments." —
 * the artifactOrEnchantment pool, zero to N targets, CR 601.2c); the exile form was not, so Angel of the Ruins parked on its
 * only ability. The counted arm now takes either verb; the exile resolves through the same zone move every targeted exile uses.
 * Twin: Sylvan Reclamation (its basic landcycling line was already read).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The casts are the offered legal actions, dispatched; passPriority resolves the spell and the enters trigger, whose
 * targets the trigger chooser picks (the opponent's permanents — an exile is enemy-side).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ANGEL = {"name":"Angel of the Ruins","type":"Artifact Creature — Angel","mana":"{5}{W}{W}","cmc":7,"power":"5","toughness":"7","keywords":["Flying","Plainscycling","Landcycling","Typecycling","Cycling"],"colors":["W"],"oracle":"Flying\nWhen this creature enters, exile up to two target artifacts and/or enchantments.\nPlainscycling {2} ({2}, Discard this card: Search your library for a Plains card, reveal it, put it into your hand, then shuffle.)"}; // body-only #1052
const SYLVAN = {"name":"Sylvan Reclamation","type":"Instant","mana":"{3}{G}{W}","cmc":5,"keywords":["Landcycling","Basic landcycling","Typecycling","Cycling"],"colors":["G","W"],"oracle":"Exile up to two target artifacts and/or enchantments.\nBasic landcycling {2} ({2}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)"}; // arbiter-spell #9412
const FORCE = {"name":"Force of Vigor","type":"Instant","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If it's not your turn, you may exile a green card from your hand rather than pay this spell's mana cost.\nDestroy up to two target artifacts and/or enchantments."}; // native-spell #1018
const PROTECTOR = {"name":"Protector of the Wastes","type":"Creature — Dragon","mana":"{4}{W}{W}","cmc":6,"power":"5","toughness":"5","keywords":["Flying","Monstrosity"],"colors":["W"],"oracle":"Flying\nWhen this creature enters or becomes monstrous, exile up to two target artifacts and/or enchantments controlled by different players.\n{4}{W}: Monstrosity 3. (If this creature isn't monstrous, put three +1/+1 counters on it and it becomes monstrous.)"}; // body-only #10316
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana #1
const MIND = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."}; // native-static #7248
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = (card, n, tag) => Array.from({ length: n }, (_, i) => P(`${tag}${i}`, card, "user"));

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
const ids = (s, pid, zone) => s.players[pid][zone].map((x) => x.card?.name ?? x.name).sort();

describe("PARSE + CLASSIFICATION", () => {
  it("\"exile up to two target artifacts and/or enchantments\" → one exile atom over the artifactOrEnchantment pool, zero to two targets", () => {
    const p = parseEffectClause("exile up to two target artifacts and/or enchantments", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "exile", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: 2 }]);
  });

  it("control — Force of Vigor's destroy form parses exactly as before", () => {
    expect(parseEffectClause("destroy up to two target artifacts and/or enchantments", "Instant", { sourceScoped: true }).atoms)
      .toEqual([{ op: "destroy", targetType: "artifactOrEnchantment", minTargets: 0, maxTargets: 2 }]);
    expect(isNativeTier(classifyCard(FORCE))).toBe(true);
  });

  it("Angel of the Ruins' enters trigger routes natively and the card classifies native; Sylvan Reclamation too", () => {
    const d = detectTriggers(ANGEL).find((x) => x.event === "etb");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect([ANGEL, SYLVAN].map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual([[ANGEL.name, true], [SYLVAN.name, true]]);
  });

  it("CREED — \"controlled by different players\" (Protector of the Wastes) is a restriction the pool doesn't read: parked", () => {
    expect(isNativeTier(classifyCard(PROTECTOR))).toBe(false);
  });
});

describe("RUNTIME", () => {
  const castAngel = (ai, user = []) => {
    let s = table({ user: [...user, ...lands(PLAINS, 7, "pl")], ai, hand: [{ ...ANGEL, id: "angel" }] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "angel");
    return resolveStack(dispatchAction(s, a));
  };

  it("⭐ Angel of the Ruins enters → the opponent's Sol Ring and Glorious Anthem are exiled; the user's own Mind Stone stays", () => {
    const s = castAngel([P("sol", SOL, "ai"), P("anthem", ANTHEM, "ai"), P("bears", BEARS, "ai")], [P("mind", MIND, "user")]);
    expect(ids(s, "ai", "exile")).toEqual(["Glorious Anthem", "Sol Ring"]);
    expect(ids(s, "ai", "battlefield")).toEqual(["Grizzly Bears"]);
    expect(s.players.user.battlefield.some((p) => p.id === "mind")).toBe(true);
  });

  it("with one opposing artifact the trigger takes just that one (\"up to two\") and never the user's own", () => {
    const s = castAngel([P("sol", SOL, "ai")], [P("mind", MIND, "user")]);
    expect(ids(s, "ai", "exile")).toEqual(["Sol Ring"]);
    expect(s.players.user.battlefield.some((p) => p.id === "mind")).toBe(true);
    expect(s.players.user.exile).toEqual([]);
  });

  it("Sylvan Reclamation (cast) exiles the two permanents it targeted", () => {
    let s = table({ user: [...lands(PLAINS, 2, "pl"), ...lands(FOREST, 3, "fo")], ai: [P("sol", SOL, "ai"), P("anthem", ANTHEM, "ai")], hand: [{ ...SYLVAN, id: "sylvan" }] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "sylvan" && (x.targets || []).length === 2);
    expect((a?.targets || []).map((t) => t.id).sort()).toEqual(["anthem", "sol"]);
    s = resolveStack(dispatchAction(s, a));
    expect(ids(s, "ai", "exile")).toEqual(["Glorious Anthem", "Sol Ring"]);
  });
});
