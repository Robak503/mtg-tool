/**
 * copyEnchantmentAura.test.js — a permanent that enters AS A COPY of an Aura (Copy Enchantment: "You may have this enchantment enter
 * as a copy of any enchantment on the battlefield."; Clever Impersonator copies any nonland permanent). Until 2026-10-16 the widened
 * clone scopes never offered an Aura (cloneCopy.cloneWidenedCopiable): the copy enters as an Aura, and the clone's settle had no way
 * to choose what it enchants. The copy is not "resolving as an Aura spell", so CR 303.4f applies, and resolvers.resolveCloneChoice
 * now asks auraEntry.chooseAuraEntryHost.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — "If an Aura is entering the battlefield under a player's control by any means other than by resolving as an
 *     Aura spell … that player chooses what it will enchant as the Aura enters the battlefield."
 *   · CR 303.4g — with no legal object, "the Aura remains in its current zone, unless that zone is the stack. In that case, the
 *     Aura is put into its owner's graveyard instead of entering the battlefield."
 *   · CR 707.2 / 707.5 — the copy takes the copiable values (the Enchant line among them) as it enters.
 * The bundled Copy Enchantment ruling (2023-09-01): "If Copy Enchantment copies an Aura this way, you choose what the Aura will
 * enchant just before it enters the battlefield. … This doesn't target the player or permanent it will enchant … If there's
 * nothing legal for the Aura to enchant, Copy Enchantment stays in its current zone (unless it's a spell, in which case it's put
 * into its owner's graveyard)."
 *
 * THE OFFER: an Aura is a copy candidate when its copy would have something to enchant; a Saga still is not (its lore counter on a
 * copy's entry is unmodeled, CR 714.3a), nor an Aura whose Enchant line the engine can't list (a Curse).
 *
 * Every clone is cast for real (legal action → dispatch → resolve → the copy choice → its settle). Real oracle fixtures (bundled
 * Scryfall snapshot, generated 2026-10-16; the trailing comment is the generator's tier read).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { autoPickCloneCandidate } from "./cloneCopy.js";
import { checkAllStateBasedActions } from "./sba.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const COPY_ENCHANTMENT = {"name":"Copy Enchantment","type":"Enchantment","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"You may have this enchantment enter as a copy of any enchantment on the battlefield."}; // native-clone
const CLEVER_IMPERSONATOR = {"name":"Clever Impersonator","type":"Creature — Shapeshifter","mana":"{2}{U}{U}","cmc":4,"power":"0","toughness":"0","keywords":[],"colors":["U"],"oracle":"You may have this creature enter as a copy of any nonland permanent on the battlefield."}; // native-clone
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const CARTOUCHE = {"name":"Cartouche of Knowledge","type":"Enchantment — Aura Cartouche","mana":"{1}{U}","cmc":2,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature you control\nWhen this Aura enters, draw a card.\nEnchanted creature gets +1/+1 and has flying."}; // native-aura
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const HISTORY = {"name":"History of Benalia","type":"Enchantment — Saga","mana":"{1}{W}{W}","cmc":3,"keywords":[],"layout":"saga","colors":["W"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn."}; // native-trigger
const GHOSTLY_PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // native-static
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
/** An Aura and its host, linked both ways, as the engine keeps them. */
const on = (aura, host) => [{ ...aura, attachedTo: host.id }, { ...host, attachments: [...(host.attachments || []), aura.id] }];
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, U: 2, C: 2 }, library: [1, 2, 3].map((i) => ({ ...ISLAND, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...ISLAND, id: `al${i}` })) } } };
}
/** Cast the clone; resolution pauses on its copy choice when there is something to copy. */
function castClone(s, cardId) {
  const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(action, `a legal cast of ${cardId}`).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, action));
}
const offered = (s) => (s.pendingChoice?.candidates || []).map((c) => c.name).sort();
/** The copy a clone became: named after what it copied, its real card (printedCard) the clone's. */
const copyOf = (s, name, clone) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.card?.name === name && p.printedCard?.name === clone) || null;
const hostName = (s, perm) => {
  const h = perm?.attachedTo ? findPermanent(s, perm.attachedTo) : null;
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
};

describe("classify", () => {
  it("both clones stay native", () => {
    expect([classifyCard(COPY_ENCHANTMENT), classifyCard(CLEVER_IMPERSONATOR)]).toEqual(["native-clone", "native-clone"]);
  });
});

describe("⭐ Copy Enchantment copies an Aura — the copy chooses what it enchants just before it enters (CR 303.4f)", () => {
  it("⭐ the offer: Pacifism and Ghostly Prison — never the Saga, never the Curse (Enchant player — an Enchant line the engine can't list)", () => {
    const [pac, bears] = on(P("pac", "ai", PACIFISM), P("bears", "user", BEARS));
    const s = castClone(board({ user: [bears, P("prison", "user", GHOSTLY_PRISON), P("history", "user", HISTORY, { counters: { lore: 1 } })],
      ai: [pac, P("curse", "ai", CURSE, { enchantedPlayerId: "user" }), P("giant", "ai", GIANT)], hand: [{ ...COPY_ENCHANTMENT, id: "copy" }] }), "copy");
    expect({ kind: s.pendingChoice?.kind, offered: offered(s) }).toEqual({ kind: "clone-search", offered: ["Ghostly Prison", "Pacifism"] });
  });

  it("⭐ copying the opponent's Control Magic (holding your Craw Wurm) takes the Wurm back: your copy goes on their best creature and you control it", () => {
    const [cm, wurm] = on(P("cm", "ai", CONTROL_MAGIC), P("wurm", "ai", WURM, { owner: "user" }));
    let s = castClone(board({ ai: [cm, wurm, P("bears", "ai", BEARS)], hand: [{ ...COPY_ENCHANTMENT, id: "copy" }] }), "copy");
    expect(offered(s)).toEqual(["Control Magic"]);
    s = checkAllStateBasedActions(resolveCloneChoice(s, "cm"));
    const copy = copyOf(s, "Control Magic", "Copy Enchantment");
    const host = copy ? findPermanent(s, copy.attachedTo) : null;
    const row = { copyController: copy?.controller ?? null, host: host?.permanent.card?.name ?? null, hostController: host?.controller ?? null };
    console.log("  WITNESS copyEnchantmentControlMagic", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ copyController: "user", host: "Craw Wurm", hostController: "user" });
  });

  it("⭐ CR 303.4g — the copy's last host gone before it enters (a stale pick): Copy Enchantment, a spell, goes to its owner's graveyard instead (the ruling)", () => {
    const [pac, giant] = on(P("pac", "ai", PACIFISM), P("giant", "ai", GIANT));
    const paused = castClone(board({ ai: [pac, giant], hand: [{ ...COPY_ENCHANTMENT, id: "copy" }] }), "copy");
    expect(offered(paused)).toEqual(["Pacifism"]);
    // The Giant leaves between the offer and the settle; the Pacifism stays (attached to nothing until the next state-based check).
    const stale = { ...paused, players: { ...paused.players, ai: { ...paused.players.ai, battlefield: [{ ...paused.players.ai.battlefield.find((p) => p.id === "pac"), attachedTo: null }] } } };
    const out = resolveCloneChoice(stale, "pac");
    const row = { copies: copyOf(out, "Pacifism", "Copy Enchantment") ? 1 : 0, graveyard: out.players.user.graveyard.map((c) => c.name),
      why: (out.log || []).filter((e) => e.kind === "aura-stays").map((e) => [e.zone, e.reason]) };
    console.log("  WITNESS copyEnchantmentNoHost", JSON.stringify(row));
    expect(row).toEqual({ copies: 0, graveyard: ["Copy Enchantment"], why: [["stack", "nothing it can enchant (CR 303.4g)"]] });
  });

  it("⛔ a pick from outside the offer — the Curse (an Enchant line the engine can't list) — is refused at the settle: Copy Enchantment enters as itself, never into the graveyard", () => {
    const [pac, bears] = on(P("pac", "ai", PACIFISM), P("bears", "user", BEARS));
    const paused = castClone(board({ user: [bears], ai: [pac, P("curse", "ai", CURSE, { enchantedPlayerId: "user" })], hand: [{ ...COPY_ENCHANTMENT, id: "copy" }] }), "copy");
    expect(offered(paused)).toEqual(["Pacifism"]);
    const out = resolveCloneChoice(paused, "curse");
    expect({ battlefield: out.players.user.battlefield.map((p) => p.card?.name).sort(), graveyard: out.players.user.graveyard.map((c) => c.name) })
      .toEqual({ battlefield: ["Copy Enchantment", "Grizzly Bears"], graveyard: [] });
  });

  it("⛔ an Aura whose copy would have nothing to enchant is not offered: the opponent's Cartouche of Knowledge (Enchant creature YOU control) with no creature of yours — nothing to copy, Copy Enchantment enters as itself", () => {
    const [cart, giant] = on(P("cart", "ai", CARTOUCHE), P("giant", "ai", GIANT));
    const s = castClone(board({ ai: [cart, giant], hand: [{ ...COPY_ENCHANTMENT, id: "copy" }] }), "copy");
    expect({ pending: s.pendingChoice?.kind ?? null, asItself: s.players.user.battlefield.map((p) => p.card?.name) }).toEqual({ pending: null, asItself: ["Copy Enchantment"] });
  });
});

describe("Clever Impersonator copies your Rancor — the copy is an Aura, not a creature, and goes on your best creature", () => {
  it("the copy enters attached to your Craw Wurm, and the autopilot's pick reads the same candidates", () => {
    const [rancor, bears] = on(P("rancor", "user", RANCOR), P("bears", "user", BEARS));
    const paused = castClone(board({ user: [rancor, bears, P("wurm", "user", WURM)], hand: [{ ...CLEVER_IMPERSONATOR, id: "imp" }] }), "imp");
    expect(offered(paused)).toContain("Rancor");
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toContain(autoPickCloneCandidate(paused, paused.pendingChoice));
    const out = checkAllStateBasedActions(resolveCloneChoice(paused, "rancor"));
    const copy = copyOf(out, "Rancor", "Clever Impersonator");
    expect({ host: hostName(out, copy), isCreature: /Creature/.test(copy?.card?.type || "") }).toEqual({ host: "Craw Wurm (user)", isCreature: false });
  });
});
