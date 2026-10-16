/**
 * academyRector.test.js — the battlefield tutor's ENCHANTMENT arm: "search your library for an enchantment card, put that card
 * onto the battlefield, then shuffle" (Academy Rector's dies trigger; Lost Auramancers and Enduring Ideal print the same search).
 * Lifted 2026-10-16. The arm had been held back because an Aura put onto the battlefield without being cast must choose what it
 * enchants (CR 303.4f) and the entry had no such choice; it has one now (effects/atoms/zones.enterCardFromZone →
 * auraEntry.chooseAuraEntryHost), so the admission list gains a GUARANTEED-ENCHANTMENT arm beside land, creature, planeswalker
 * and the bare permanent card.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.4f — the player "chooses what it will enchant as the Aura enters the battlefield" — a legal object, by its enchant
 *     ability; nothing is targeted.
 *   · CR 303.4g — with no legal object or player to enchant, "the Aura remains in its current zone" (here, the library).
 *   · CR 701.23b — a search for a card with a stated quality may find nothing.
 * The bundled rulings (scryfall.rulings.local.json): Academy Rector (2005-08-01) "An enchantment card is any Enchantment card,
 * including Auras."; Lost Auramancers (2021-03-19) "If an Aura is put onto the battlefield without being cast, the Aura's
 * controller-to-be chooses what it will enchant as it enters the battlefield. … If the Aura can't legally be attached to
 * anything, it remains in its current zone."
 *
 * THE OFFER: an Aura with nothing it can enchant would enter nothing — choosing it is the same as finding nothing (which the
 * search allows, CR 701.23b) — so it is not offered, and neither is an Aura whose Enchant line the engine can't list (a Curse,
 * Animate Dead). That keeps the AI's highest-mana-value pick off a card that would stay in the library.
 *
 * The Rector dies through the real lethal pipeline; its trigger flushes, pays and searches through the real settlers. Real
 * oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16; the trailing comment is the generator's tier read).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, destroyLethalCreatures, findPermanent, _resetIdsForTests } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickTutorCandidate, resolveOptionalExileSelfChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ACADEMY_RECTOR = {"name":"Academy Rector","type":"Creature — Human Cleric","mana":"{3}{W}","cmc":4,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"When this creature dies, you may exile it. If you do, search your library for an enchantment card, put that card onto the battlefield, then shuffle."}; // body-only
const ENDURING_IDEAL = {"name":"Enduring Ideal","type":"Sorcery","mana":"{5}{W}{W}","cmc":7,"keywords":["Epic"],"colors":["W"],"oracle":"Search your library for an enchantment card, put it onto the battlefield, then shuffle.\nEpic (For the rest of the game, you can't cast spells. At the beginning of each of your upkeeps, copy this spell except for its epic ability.)"}; // arbiter-spell
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const CONTROL_MAGIC = {"name":"Control Magic","type":"Enchantment — Aura","mana":"{2}{U}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nYou control enchanted creature."}; // native-aura
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."}; // native-mana-aura
const CURSE = {"name":"Curse of Opulence","type":"Enchantment — Aura Curse","mana":"{R}","cmc":1,"keywords":["Enchant"],"colors":["R"],"oracle":"Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same. (A Gold token is an artifact with \"Sacrifice this token: Add one mana of any color.\")"}; // body-only
const ANIMATE_DEAD = {"name":"Animate Dead","type":"Enchantment — Aura","mana":"{1}{B}","cmc":2,"keywords":["Enchant"],"colors":["B"],"oracle":"Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0."}; // native-aura
const GHOSTLY_PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // native-static
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body

const L = (id, card) => ({ ...card, id }); // a library card
const P = (id, ctrl, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false });

/** The Rector dies (lethal damage → the state-based check → its dies trigger), the trigger resolves to its pay-or-not pause. */
function dieAndPause({ ai = [], library }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const rector = { ...createPermanent({ id: "rector", card: { ...ACADEMY_RECTOR, id: "c-rector" }, controller: "user" }), damageMarked: 99 };
  let s = { ...s0, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [rector], library }, ai: { ...s0.players.ai, battlefield: ai } } };
  const lethal = destroyLethalCreatures(s);
  s = flushTriggers(checkDiesTriggers(lethal.state, lethal.dead), {});
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
}
/** Pay (exile the Rector) and open the search. */
const search = (opts) => resolveOptionalExileSelfChoice(dieAndPause(opts), true);
const named = (s, name) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => p.card?.name === name);
function hostOf(s, name) {
  const p = named(s, name)[0];
  if (!p?.attachedTo) return null;
  const h = findPermanent(s, p.attachedTo);
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
}
const offered = (s) => (s.pendingChoice?.candidates || []).map((c) => c.name).sort();

describe("parse + classify", () => {
  it("the enchantment search onto the battlefield parses whole; Academy Rector is native; Enduring Ideal still parks on Epic", () => {
    const p = parseEffectClause("search your library for an enchantment card, put that card onto the battlefield, then shuffle", "Creature");
    const row = { conf: programConfidence(p), atoms: p.atoms, rector: classifyCard(ACADEMY_RECTOR), ideal: classifyCard(ENDURING_IDEAL) };
    console.log("  WITNESS academyRectorParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      conf: "high",
      atoms: [{ op: "tutor", filter: { groups: [["enchantment"]] }, filterLabel: "enchantment card", destination: "battlefield", entersTapped: false, targetType: null }],
      rector: "native-trigger",
      ideal: "arbiter-spell",
    });
  });
});

describe("⭐ RUNTIME — the Rector dies, is exiled, and the search puts an enchantment onto the battlefield", () => {
  const LIBRARY = [L("l-pac", PACIFISM), L("l-prison", GHOSTLY_PRISON), L("l-wild", WILD_GROWTH), L("l-curse", CURSE), L("l-animate", ANIMATE_DEAD)];

  it("⭐ the offer: Pacifism and Ghostly Prison — never Wild Growth (no land to enchant, CR 303.4g), the Curse or Animate Dead (an Enchant line the engine can't list)", () => {
    const s = search({ ai: [P("bears", "ai", BEARS), P("wurm", "ai", WURM)], library: LIBRARY });
    expect({ kind: s.pendingChoice?.kind, destination: s.pendingChoice?.destination, offered: offered(s), rectorExiled: s.players.user.exile.some((c) => c.id === "c-rector") })
      .toEqual({ kind: "tutor-search", destination: "battlefield", offered: ["Ghostly Prison", "Pacifism"], rectorExiled: true });
  });

  it("⭐ Pacifism found enters ATTACHED — on the opponent's Craw Wurm, the creature it hurts most — and the library keeps the rest", () => {
    const out = resolveTutorChoice(search({ ai: [P("bears", "ai", BEARS), P("wurm", "ai", WURM)], library: LIBRARY }), "l-pac");
    const row = { pacifism: hostOf(out, "Pacifism"), library: out.players.user.library.map((c) => c.name).sort(), pending: out.pendingChoice?.kind ?? null };
    console.log("  WITNESS academyRectorAura", JSON.stringify(row));
    expect(row).toEqual({ pacifism: "Craw Wurm (ai)", library: ["Animate Dead", "Curse of Opulence", "Ghostly Prison", "Wild Growth"], pending: null });
  });

  it("an enchantment that isn't an Aura enters as itself: Ghostly Prison", () => {
    const out = resolveTutorChoice(search({ ai: [P("bears", "ai", BEARS)], library: LIBRARY }), "l-prison");
    expect({ prison: named(out, "Ghostly Prison").length, attached: named(out, "Ghostly Prison")[0]?.attachedTo ?? null }).toEqual({ prison: 1, attached: null });
  });

  it("⛔ with no creature anywhere, Control Magic (mana value 4) is not offered — the AI's highest-mana-value pick takes Ghostly Prison instead of a card that would stay in the library", () => {
    const s = search({ ai: [], library: [L("l-control", CONTROL_MAGIC), L("l-prison", GHOSTLY_PRISON)] });
    const pick = autoPickTutorCandidate(s, s.pendingChoice);
    expect({ offered: offered(s), pick }).toEqual({ offered: ["Ghostly Prison"], pick: "l-prison" });
  });
});
