/**
 * auraDetainReturn.test.js — an AURA exiled "until this <permanent> leaves the battlefield" (Banishing Light, and Oblivion Ring's
 * two-trigger printing, which detectTriggers folds onto the same frame). Until 2026-10-16 no detainer offered an Aura (removal.js
 * excluded `typeNeg aura` at enumeration): the return had no way to choose what it enchants. The return enters through
 * effects/atoms/zones.enterCardFromZone, which now asks auraEntry.chooseAuraEntryHost (CR 303.4f), so the exclusion is lifted to
 * `auraEntryModeled` — an Aura whose Enchant line the engine can't list (a Curse) still is not offered.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 610.3 — a one-shot effect that moves an object "until" a specified event; "A second one-shot effect is created
 *     immediately after the specified event. This second one-shot effect returns the object to its previous zone."
 *   · CR 610.3c — "An object returned to the battlefield this way returns under its owner's control unless otherwise specified."
 *   · CR 610.3d — "If multiple one-shot effects are created this way immediately after one or more simultaneous events, those
 *     one-shot effects are also simultaneous." (its example: two Banisher Priests destroyed at once return their cards together)
 *   · CR 303.4f — the Aura's controller-to-be chooses what it enchants as it enters; CR 303.4g — with nothing legal it stays in
 *     its current zone (here, exile).
 * The bundled Oblivion Ring ruling (2008-10-01): "If the exiled card is an Aura, that card's owner chooses what it will enchant as
 * it comes back onto the battlefield. An Aura put onto the battlefield this way doesn't target anything, but the Aura's enchant
 * ability restricts what it can be attached to. If the Aura can't legally be attached to anything, it remains exiled forever."
 *
 * THE SIMULTANEITY GUARD. The engine returns each detainer's cards with its own [detain-return] trigger, one at a time, so a card
 * another detainer returned "at the same time" (CR 610.3d) is already on the battlefield when a later return runs. A returning
 * Aura may not enchant it (an Aura can't enter attached to a permanent entering at the same time — the same rule the bundled
 * Brago, King Eternal ruling states). The detainer's leave event records the permanents on the battlefield as it left
 * (gameState.recordLeaveEvent → the trigger context's `detainBoardIds`), and the returning Aura chooses only among those. For the
 * folded two-trigger printing the returns are really separate triggers, so this can miss a legal host there — never add one.
 *
 * Every detainer enters through resolvers.enterPermanent, its trigger flushes and resolves through the real stack, and it leaves
 * through the battlefield-exit chokepoint. Real oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkLeavesTriggers } from "./triggers.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BANISHING_LIGHT = {"name":"Banishing Light","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield."}; // native-trigger
const OBLIVION_RING = {"name":"Oblivion Ring","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control."}; // native-trigger
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const CURIOSITY = {"name":"Curiosity","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card."}; // native-trigger
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body

const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
const on = (aura, host) => [{ ...aura, attachedTo: host.id }, { ...host, attachments: [...(host.attachments || []), aura.id] }];
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
/** Flush and resolve everything queued (the detainer's enters trigger, a return), choosing targets the way the engine does. */
function settle(s0) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** The detainer called `name` leaves (to its owner's graveyard) — one leave event per call. */
function leave(s, name) {
  const p = s.players.user.battlefield.find((x) => x.card?.name === name);
  return moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: p.id });
}
const afterLeaving = (s) => settle(checkLeavesTriggers(s));
function hostOf(s, name) {
  const p = Object.values(s.players).flatMap((pl) => pl.battlefield).find((x) => x.card?.name === name);
  if (!p?.attachedTo) return null;
  const h = findPermanent(s, p.attachedTo);
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
}
const exiled = (s, pid) => (s.players[pid].exile || []).map((c) => c.name).sort();

describe("parse + classify", () => {
  it("the detain frame offers an Aura the engine can enchant with (auraEntryModeled), no longer every Aura excluded; the carriers stay native", () => {
    const p = parseEffectClause("exile target nonland permanent an opponent controls until this enchantment leaves the battlefield");
    const row = { restrictions: p.atoms[0].restrictions, banishing: classifyCard(BANISHING_LIGHT), ring: classifyCard(OBLIVION_RING) };
    console.log("  WITNESS auraDetainParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ restrictions: [{ kind: "controller", who: "opponent" }, { kind: "auraEntryModeled" }], banishing: "native-trigger", ring: "native-trigger" });
  });

  it("the pool: the opponent's Pacifism is a legal target; their Curse is not", () => {
    const [pac, bears] = on(P("pac", "ai", PACIFISM), P("bears", "user", BEARS));
    const s = board({ user: [bears], ai: [pac, P("curse", "ai", CURSE, { enchantedPlayerId: "user" })] });
    const atom = parseEffectClause("exile target nonland permanent an opponent controls until this enchantment leaves the battlefield").atoms[0];
    const pool = enumerateTargets(s, "user", { targetType: atom.targetType, restrictions: atom.restrictions }, [], { sourceId: "bl" }).map((t) => t.id).sort();
    expect(pool).toEqual(["pac"]);
  });
});

describe("⭐ the return — the Aura's owner chooses what it enchants (CR 610.3c, 303.4f)", () => {
  it("⭐ Banishing Light takes the opponent's Pacifism off your Bears; when it leaves, Pacifism returns under its owner's control — onto your Craw Wurm", () => {
    const [pac, bears] = on(P("pac", "ai", PACIFISM), P("bears", "user", BEARS));
    let s = settle(enterPermanent(board({ user: [bears, P("wurm", "user", WURM)], ai: [pac] }), BANISHING_LIGHT, "user"));
    const held = { aiExile: exiled(s, "ai"), bearsFree: !findPermanent(s, "bears").permanent.attachments.length };
    s = afterLeaving(leave(s, "Banishing Light"));
    const back = s.players.ai.battlefield.find((p) => p.card?.name === "Pacifism");
    const row = { held, host: hostOf(s, "Pacifism"), controller: back?.controller ?? null, aiExile: exiled(s, "ai") };
    console.log("  WITNESS auraDetainReturn", JSON.stringify(row));
    expect(row).toEqual({ held: { aiExile: ["Pacifism"], bearsFree: true }, host: "Craw Wurm (user)", controller: "ai", aiExile: [] });
  });

  it("an Aura whose side the house policy can't read returns to the side it left: your Curiosity, taken off the opponent's Hill Giant by your own Oblivion Ring, comes back on THEIR Giant, not your Bears", () => {
    const RING_EXILE = parseEffectClause("exile another target nonland permanent until this enchantment leaves the battlefield").atoms[0];
    const [cur, giant] = on(P("cur", "user", CURIOSITY), P("giant", "ai", GIANT));
    let s = board({ user: [P("ring", "user", OBLIVION_RING), P("bears", "user", BEARS), cur], ai: [giant] });
    s = resolveAtom(s, RING_EXILE, { controller: "user", sourceId: "ring", targets: [{ type: "permanent", id: "cur", controller: "user" }] });
    const link = s.players.user.battlefield.find((p) => p.id === "ring").detainedExile;
    s = afterLeaving(leave(s, "Oblivion Ring"));
    expect({ link, host: hostOf(s, "Curiosity") }).toEqual({ link: [{ cardId: "c-cur", ownerId: "user", auraSideHint: "enemy" }], host: "Hill Giant (ai)" });
  });

  it("the Oblivion Ring ruling: with nothing it can enchant when the Ring leaves, the Aura remains exiled", () => {
    const [pac, bears] = on(P("pac", "ai", PACIFISM), P("bears", "user", BEARS));
    let s = settle(enterPermanent(board({ user: [bears], ai: [pac] }), OBLIVION_RING, "user"));
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bears" }); // the only creature dies
    s = afterLeaving(leave(s, "Oblivion Ring"));
    expect({ onBattlefield: !!s.players.ai.battlefield.find((p) => p.card?.name === "Pacifism"), aiExile: exiled(s, "ai") }).toEqual({ onBattlefield: false, aiExile: ["Pacifism"] });
  });
});

describe("⭐ CR 610.3d — two detainers leaving together return their cards together", () => {
  const DETAIN = parseEffectClause("exile target nonland permanent an opponent controls until this enchantment leaves the battlefield").atoms[0];
  /**
   * Two Banishing Lights on your side. The first holds the opponent's Craw Wurm (6 power), the second the Rancor that was on their
   * Hill Giant (3 power) — each exiled by the detain applier with its own Light as the source, the link the real trigger makes.
   */
  function twoLights() {
    const [rancor, giant] = on(P("rancor", "ai", RANCOR), P("giant", "ai", GIANT));
    let s = board({ user: [P("bl1", "user", BANISHING_LIGHT), P("bl2", "user", BANISHING_LIGHT)], ai: [P("wurm", "ai", WURM), rancor, giant] });
    s = resolveAtom(s, DETAIN, { controller: "user", sourceId: "bl1", targets: [{ type: "permanent", id: "wurm", controller: "ai" }] });
    s = resolveAtom(s, DETAIN, { controller: "user", sourceId: "bl2", targets: [{ type: "permanent", id: "rancor", controller: "ai" }] });
    return s;
  }
  const lightLeaves = (s, id) => moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: id });

  it("the set-up: the Lights hold the Wurm and the Rancor; the Hill Giant stays", () => {
    const s = twoLights();
    expect({ exile: exiled(s, "ai"), battlefield: s.players.ai.battlefield.map((p) => p.card?.name) }).toEqual({ exile: ["Craw Wurm", "Rancor"], battlefield: ["Hill Giant"] });
  });

  it("⭐ both Lights leave in one event (in either order): the Rancor can't enchant the Wurm returning with it — it takes the Hill Giant", () => {
    const rows = [["bl1", "bl2"], ["bl2", "bl1"]].map((order) => {
      let s = twoLights();
      for (const id of order) s = lightLeaves(s, id);
      s = afterLeaving(s);
      return { order: order.join(">"), wurmBack: !!s.players.ai.battlefield.find((p) => p.card?.name === "Craw Wurm"), rancor: hostOf(s, "Rancor") };
    });
    console.log("  WITNESS auraDetainSimultaneous", JSON.stringify(rows));
    expect(rows).toEqual([
      { order: "bl1>bl2", wurmBack: true, rancor: "Hill Giant (ai)" },
      { order: "bl2>bl1", wurmBack: true, rancor: "Hill Giant (ai)" },
    ]);
  });

  it("the positive control: the second Light leaving LATER, on its own, lets the Rancor take the Wurm the first Light already returned", () => {
    let s = afterLeaving(lightLeaves(twoLights(), "bl1"));
    s = afterLeaving(lightLeaves(s, "bl2"));
    expect(hostOf(s, "Rancor")).toBe("Craw Wurm (ai)");
  });
});
