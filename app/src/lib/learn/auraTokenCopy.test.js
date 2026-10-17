/**
 * auraTokenCopy.test.js — a TOKEN that's a copy of an Aura (Flash Photography: "Create a token that's a copy of target permanent.";
 * Caretaker's Talent, level 2: "create a token that's a copy of target token you control."). Until 2026-10-16 neither offered an
 * Aura: a token is created, not put onto the battlefield from a zone, so it never reached the non-cast entry's Aura choice
 * (effects/atoms/zones.enterCardFromZone → auraEntry.chooseAuraEntryHost). The choice is now made at creation
 * (effects/atoms/tokens.applyCreateTokenCopy), on the board as the token is created.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — an Aura entering by any means other than resolving as an Aura spell: "that player chooses what it will enchant
 *     as the Aura enters the battlefield" — a legal object, by its enchant ability and any other applicable effects.
 *   · CR 303.4g — "If an Aura is entering the battlefield and there is no legal object or player for it to enchant, the Aura
 *     remains in its current zone … If the Aura is a token, it isn't created."
 *   · CR 707.2 — the copy takes the copiable values (an Aura's Enchant line among them), never the original's attachment.
 *   · CR 704.5y — "If a permanent has more than one Role controlled by the same player attached to it, each of those Roles except
 *     the one with the most recent timestamp is put into its owner's graveyard." sba.js runs it (roleUniqueness.test.js); a copied
 *     Role still never chooses a permanent that already carries a Role of its controller's — the check would discard one of them.
 * A Saga copy stays unoffered: the token path does not give it its lore counter (CR 714.3a).
 *
 * Flash Photography is cast for real (legal action → dispatch → resolve); the Role is minted by the engine's own Role resolver.
 * Real oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16; the trailing comment is the generator's tier read).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { checkAllStateBasedActions } from "./sba.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FLASH_PHOTOGRAPHY = {"name":"Flash Photography","type":"Sorcery","mana":"{2}{U}{U}","cmc":4,"keywords":["Flashback"],"colors":["U"],"oracle":"You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U}"}; // native-spell
const CARETAKERS_TALENT = {"name":"Caretaker's Talent","type":"Enchantment — Class","mana":"{2}{W}","cmc":3,"keywords":[],"layout":"class","colors":["W"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nWhenever one or more tokens you control enter, draw a card. This ability triggers only once each turn.\n{W}: Level 2\nWhen this Class becomes level 2, create a token that's a copy of target token you control.\n{3}{W}: Level 3\nCreature tokens you control get +2/+2."}; // native-mixed
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const CARTOUCHE = {"name":"Cartouche of Knowledge","type":"Enchantment — Aura Cartouche","mana":"{1}{U}","cmc":2,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature you control\nWhen this Aura enters, draw a card.\nEnchanted creature gets +1/+1 and has flying."}; // native-aura
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const HISTORY = {"name":"History of Benalia","type":"Enchantment — Saga","mana":"{1}{W}{W}","cmc":3,"keywords":[],"layout":"saga","colors":["W"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn."}; // native-trigger
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."}; // native-static
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
/** An Aura and its host, linked both ways, as the engine keeps them. */
const on = (aura, host) => [{ ...aura, attachedTo: host.id }, { ...host, attachments: [...(host.attachments || []), aura.id] }];
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: [{ ...FLASH_PHOTOGRAPHY, id: "flash" }], manaPool: { ...s.players.user.manaPool, U: 2, C: 2 }, library: [1, 2, 3].map((i) => ({ ...ISLAND, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...ISLAND, id: `al${i}` })) } } };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "flash");
function photograph(s, targetId) {
  const action = offers(s).find((a) => a.targets?.[0]?.id === targetId);
  expect(action, `a legal Flash Photography on ${targetId}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, action));
}
const tokensNamed = (s, name) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === name && p.card?.token);
const hostName = (s, perm) => {
  const h = perm?.attachedTo ? findPermanent(s, perm.attachedTo) : null;
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
};

describe("parse + classify", () => {
  it("both copy targets now admit an Aura whose Enchant line the engine can list (never a Saga); both cards stay native", () => {
    const flash = parseEffectClause("Create a token that's a copy of target permanent.", "Sorcery").atoms[0];
    const talent = parseEffectClause("create a token that's a copy of target token you control", "Enchantment").atoms[0];
    const row = { flash: flash.restrictions, talent: talent.restrictions, flashTier: classifyCard(FLASH_PHOTOGRAPHY), talentTier: classifyCard(CARETAKERS_TALENT) };
    console.log("  WITNESS auraTokenCopyParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      flash: [{ kind: "auraEntryModeled" }, { kind: "typeNeg", type: "saga" }],
      talent: [{ kind: "controller", who: "you" }, { kind: "token" }, { kind: "auraEntryModeled" }, { kind: "typeNeg", type: "saga" }],
      flashTier: "native-spell",
      talentTier: "native-mixed",
    });
  });
});

describe("⭐ Flash Photography copies an Aura — the token chooses what it enchants as it is created (CR 303.4f)", () => {
  it("⭐ the offer: the opponent's Pacifism and your Rancor are legal targets; their Curse (Enchant player) and your Saga are not", () => {
    const [pac, wurm] = on(P("pac", "ai", PACIFISM), P("wurm", "user", WURM));
    const s = board({ user: [wurm, P("history", "user", HISTORY, { counters: { lore: 1 } })], ai: [pac, P("curse", "ai", CURSE, { enchantedPlayerId: "user" }), P("giant", "ai", GIANT)] });
    const targets = offers(s).map((a) => findPermanent(s, a.targets[0].id)?.permanent.card?.name).sort();
    expect(targets).toEqual(["Craw Wurm", "Hill Giant", "Pacifism"]);
  });

  it("⭐ copying the opponent's Pacifism (on your Craw Wurm) gives YOU a Pacifism — it goes on their Hill Giant, and stays through the state-based actions", () => {
    const [pac, wurm] = on(P("pac", "ai", PACIFISM), P("wurm", "user", WURM));
    let s = photograph(board({ user: [wurm], ai: [pac, P("giant", "ai", GIANT)] }), "pac");
    s = checkAllStateBasedActions(s);
    const copy = tokensNamed(s, "Pacifism")[0];
    const row = { copyController: copy?.controller, host: hostName(s, copy), original: hostName(s, findPermanent(s, "pac")?.permanent) };
    console.log("  WITNESS auraTokenCopyPacifism", JSON.stringify(row));
    expect(row).toEqual({ copyController: "user", host: "Hill Giant (ai)", original: "Craw Wurm (user)" });
  });

  it("copying your own Rancor puts the token on your best creature", () => {
    const [rancor, bears] = on(P("rancor", "user", RANCOR), P("bears", "user", BEARS));
    const s = photograph(board({ user: [rancor, bears, P("wurm", "user", WURM)] }), "rancor");
    expect(hostName(s, tokensNamed(s, "Rancor")[0])).toBe("Craw Wurm (user)");
  });

  it("⭐ CR 303.4g — \"If the Aura is a token, it isn't created\": a copy of the opponent's Cartouche of Knowledge (Enchant creature YOU control) with no creature of yours is never created, so its draw never triggers", () => {
    const [cart, giant] = on(P("cart", "ai", CARTOUCHE), P("giant", "ai", GIANT));
    const s = photograph(board({ ai: [cart, giant] }), "cart");
    const cartoucheTriggers = [...(s.stack || []), ...(s.pendingTriggers || [])].filter((o) => (o.source?.name || o.sourceName) === "Cartouche of Knowledge").length;
    const row = { tokens: tokensNamed(s, "Cartouche of Knowledge").length, cartoucheTriggers, why: (s.log || []).filter((e) => e.kind === "aura-token-not-created").map((e) => e.reason) };
    console.log("  WITNESS auraTokenCopyNotCreated", JSON.stringify(row));
    expect(row).toEqual({ tokens: 0, cartoucheTriggers: 0, why: ["nothing it can enchant (CR 303.4g)"] });
  });

  it("the control: with a creature of yours, the same copy IS created, on your creature, and its enters-draw triggers", () => {
    const [cart, giant] = on(P("cart", "ai", CARTOUCHE), P("giant", "ai", GIANT));
    const s = photograph(board({ user: [P("bears", "user", BEARS)], ai: [cart, giant] }), "cart");
    const copy = tokensNamed(s, "Cartouche of Knowledge")[0];
    const cartoucheTriggers = [...(s.stack || []), ...(s.pendingTriggers || [])].filter((o) => (o.source?.name || o.sourceName) === "Cartouche of Knowledge").length;
    expect({ host: hostName(s, copy), cartoucheTriggers }).toEqual({ host: "Grizzly Bears (user)", cartoucheTriggers: 1 });
  });
});

describe("⭐ Caretaker's Talent copies a Role — never onto a permanent that already has one of yours (CR 704.5y would discard one)", () => {
  const COPY = parseEffectClause("create a token that's a copy of target token you control", "Enchantment");
  /**
   * A Monster Role minted by the engine's own Role resolver onto your Craw Wurm, THEN the rest of your permanents arrive (a
   * Doubling Season already out would double that first Role too — two on the Wurm until the CR 704.5y check, which
   * roleUniqueness.test.js covers; not the copy under test), then the level-2 copy aimed at the Role.
   */
  function copyRole(extraUser = []) {
    let s = board({ user: [P("wurm", "user", WURM), P("bears", "user", BEARS)] });
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "monster", count: 1, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "wurm" }] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...extraUser] } } };
    const role = tokensNamed(s, "Monster")[0];
    return runEffectProgram(s, { source: { name: "Caretaker's Talent" }, payload: { params: { program: COPY, controller: "user", targets: [{ type: "permanent", id: role.id }], context: {} } } });
  }

  it("⭐ the copy goes on your Grizzly Bears — the Wurm already carries your Monster Role", () => {
    const s = copyRole();
    const hosts = tokensNamed(s, "Monster").map((p) => hostName(s, p)).sort();
    expect(hosts).toEqual(["Craw Wurm (user)", "Grizzly Bears (user)"]);
  });

  it("with Doubling Season, two copies — each on its own creature (the Bears and the Hill Giant), never two Roles on one", () => {
    const s = copyRole([P("giant", "user", GIANT), P("season", "user", DOUBLING_SEASON)]);
    const hosts = tokensNamed(s, "Monster").map((p) => hostName(s, p)).sort();
    expect(hosts).toEqual(["Craw Wurm (user)", "Grizzly Bears (user)", "Hill Giant (user)"]);
  });

  it("with Doubling Season and only one free creature, the second copy isn't created rather than doubling a Role", () => {
    const s = copyRole([P("season", "user", DOUBLING_SEASON)]);
    const hosts = tokensNamed(s, "Monster").map((p) => hostName(s, p)).sort();
    expect(hosts).toEqual(["Craw Wurm (user)", "Grizzly Bears (user)"]);
  });
});
