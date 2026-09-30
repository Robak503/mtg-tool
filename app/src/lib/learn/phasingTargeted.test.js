/**
 * phasingTargeted.test.js — targeted phasing (CR 702.26 — shelf deck work, D7, 2026-09-30: Clever Concealment in Shalai and
 * Otharri; the "target creature phases out" family behind Galadriel's Dismissal, Talon Gates of Madara and Teferi, Master
 * of Time).
 *
 * gameState.phaseOutPermanents splices each target into its controller's `phasedOut`, and everything attached to it rides
 * along INDIRECTLY (CR 702.26g) — an opponent's Aura on your creature included — to phase in with it during its
 * controller's next untap step, still attached (CR 702.26c: it doesn't enter). Teferi's Protection now routes through the
 * same primitive, which closes two gaps it had: an equipped creature came back with a one-way link (the Equipment read
 * attachedTo:null while the creature still listed it), and an opponent's Aura on a phasing creature stayed behind on a
 * vanished host, where the SBA binned it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { checkAllStateBasedActions } from "./sba.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CLEVER_CONCEALMENT = { name: "Clever Concealment", type: "Instant", mana: "{2}{W}{W}", cmc: 4, colors: ["W"], keywords: ["Convoke"],
  oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nAny number of target nonland permanents you control phase out. (Treat them and anything attached to them as though they don't exist until your next turn.)" };
const GALADRIELS_DISMISSAL = { name: "Galadriel's Dismissal", type: "Instant", mana: "{W}", cmc: 1, colors: ["W"], keywords: ["Kicker"],
  oracle: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nTarget creature phases out. If this spell was kicked, each creature target player controls phases out instead. (Treat phased-out creatures and anything attached to them as though they don't exist until their controller's next turn.)" };
const TEFERIS_PROTECTION = { name: "Teferi's Protection", type: "Instant", mana: "{2}{W}", cmc: 3, colors: ["W"], keywords: [],
  oracle: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const BLADE = { name: "Test Blade", type: "Artifact — Equipment", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "Equipped creature gets +1/+1.\nEquip {1}" };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {W}.)" };

const perm = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** Your Bear wearing your Blade and the opponent's Pacifism; four Plains; `hand` in your hand. */
function board(hand) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const plains = Array.from({ length: 4 }, (_, i) => perm(`p${i}`, PLAINS));
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: hand ? [{ ...hand, id: "h-card" }] : [], battlefield: [perm("b", BEAR, "user", { attachments: ["blade", "pac"] }), perm("blade", BLADE, "user", { attachedTo: "b" }), ...plains] },
      ai: { ...g.players.ai, battlefield: [perm("pac", PACIFISM, "ai", { attachedTo: "b" }), perm("o1", BEAR, "ai")] } } };
}
const ids = (arr) => (arr || []).map((p) => p.id).sort();
const untapFor = (s, who) => runStepActions({ ...s, activePlayer: who, phase: "beginning", step: "untap", turn: s.turn + 1, stack: [] });
const links = (s) => {
  const f = (pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
  return { bear: f("user", "b")?.attachments?.slice().sort() ?? null, blade: f("user", "blade")?.attachedTo ?? null, pac: f("ai", "pac")?.attachedTo ?? null };
};

describe("the cards", () => {
  it("⭐ Clever Concealment reads native; Galadriel's Dismissal (a kicked target swap) and Talon Gates' hand ability still park", () => {
    expect(classifyCard(CLEVER_CONCEALMENT)).toBe("native-spell");
    expect(classifyCard(GALADRIELS_DISMISSAL)).toBe("arbiter-spell");
  });
  it("the four printed forms parse; a phase-out with a rider does not", () => {
    for (const c of ["Target creature phases out", "Up to one target creature phases out", "Target creature you don't control phases out", "Any number of target nonland permanents you control phase out"]) {
      expect(programConfidence(parseEffectClause(c, "Instant")), c).toBe("high");
    }
    expect(programConfidence(parseEffectClause("Target creature phases out until end of turn", "Instant"))).toBe("low");
  });
});

describe("⭐ the real cast", () => {
  it("⭐ Clever Concealment: your permanents phase out with everything attached (the opponent's Pacifism too), and phase in at YOUR untap, still attached", () => {
    const s = board(CLEVER_CONCEALMENT);
    const cast = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-card")
      .sort((a, b) => (b.targets || []).length - (a.targets || []).length)[0];
    const out = resolveTopOfStack(dispatchAction(s, cast));
    const phasedIds = ids(out.players.user.phasedOut);
    const theirUntap = untapFor(out, "ai");
    const back = untapFor(out, "user");
    const row = { targeted: (cast.targets || []).map((t) => t.id).sort(), phasedOut: phasedIds, pacifismGone: !out.players.ai.battlefield.some((p) => p.id === "pac"),
      stillOutOnTheirUntap: ids(theirUntap.players.user.phasedOut), back: links(back) };
    console.log(`WITNESS cleverConcealment ${JSON.stringify(row)}`);
    expect(row).toEqual({ targeted: ["b", "blade"], phasedOut: ["b", "blade"], pacifismGone: true, stillOutOnTheirUntap: ["b", "blade"], back: { bear: ["blade", "pac"], blade: "b", pac: "b" } });
  });
  it("it only offers your own NONLAND permanents", () => {
    const s = board(CLEVER_CONCEALMENT);
    const offered = new Set(legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-card").flatMap((a) => (a.targets || []).map((t) => t.id)));
    expect({ ownCreature: offered.has("b"), ownEquipment: offered.has("blade"), ownLand: offered.has("p0"), theirCreature: offered.has("o1"), theirAura: offered.has("pac") })
      .toEqual({ ownCreature: true, ownEquipment: true, ownLand: false, theirCreature: false, theirAura: false });
  });
  it("a phased-out creature doesn't exist for the rest of the table: a real \"Destroy all creatures.\" misses it", () => {
    const wrath = parseEffectClause("Destroy all creatures", "Sorcery").atoms;
    const wipe = (s) => wrath.reduce((st, a) => resolveAtom(st, a, { controller: "ai", targets: [] }), s);
    const phased = resolveAtom(board(), { op: "phase-out", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "b" }] });
    const out = untapFor(wipe(phased), "user");
    const control = wipe(board());
    expect({ bearBack: out.players.user.battlefield.some((p) => p.id === "b"), theirBearDied: !out.players.ai.battlefield.some((p) => p.id === "o1"), unphasedBearDies: !control.players.user.battlefield.some((p) => p.id === "b") })
      .toEqual({ bearBack: true, theirBearDied: true, unphasedBearDies: true });
  });
});

describe("the other two gains (probed, not predicted — each witnessed)", () => {
  const VODALIAN_ILLUSIONIST = { name: "Vodalian Illusionist", type: "Creature — Merfolk Wizard", mana: "{2}{U}", cmc: 3, colors: ["U"], power: "1", toughness: "1", keywords: [],
    oracle: "{U}{U}, {T}: Target creature phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before its controller untaps during their next untap step.)" };
  const BROKERS_CONFLUENCE = { name: "Brokers Confluence", type: "Instant", mana: "{2}{G}{W}{U}", cmc: 5, colors: ["G", "W", "U"], keywords: [],
    oracle: "Choose three. You may choose the same mode more than once.\n• Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\n• Target creature phases out. (Treat it and anything attached to it as though they don't exist until its controller's next turn.)\n• Counter target activated or triggered ability." };
  const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };
  const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
  it("Vodalian Illusionist's activation phases the chosen creature out", () => {
    const g = board();
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [perm("vi", VODALIAN_ILLUSIONIST), perm("i0", ISLAND), perm("i1", ISLAND)] }, ai: { ...g.players.ai, battlefield: [perm("o1", BEAR, "ai")] } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "vi" && (a.targets || []).some((t) => t.id === "o1"));
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect({ o1Out: out.players.ai.phasedOut.some((p) => p.id === "o1"), viTapped: out.players.user.battlefield.find((p) => p.id === "vi").tapped }).toEqual({ o1Out: true, viTapped: true });
  });
  it("Brokers Confluence: a chosen phase-out mode phases its target out", () => {
    const g = board(BROKERS_CONFLUENCE);
    const lands = [perm("f0", FOREST), perm("i0", ISLAND), ...g.players.user.battlefield.filter((p) => /Plains/.test(p.card.name))];
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: lands }, ai: { ...g.players.ai, battlefield: [perm("o1", BEAR, "ai")] } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-card" && Array.isArray(a.chosenMode) && a.chosenMode.includes(1) && (a.targets || []).some((t) => t.id === "o1"));
    const out = resolveTopOfStack(dispatchAction(s, cast));
    expect(out.players.ai.phasedOut.some((p) => p.id === "o1")).toBe(true);
  });
  it("a rider whose controller has left the game doesn't come back, and the host drops it (CR 800.4a)", () => {
    const s = board(CLEVER_CONCEALMENT);
    const cast = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-card").sort((a, b) => (b.targets || []).length - (a.targets || []).length)[0];
    const out = resolveTopOfStack(dispatchAction(s, cast));
    const { ai: _left, ...rest } = out.players;
    const back = untapFor({ ...out, players: rest }, "user");
    expect({ bear: back.players.user.battlefield.find((p) => p.id === "b")?.attachments, blade: back.players.user.battlefield.find((p) => p.id === "blade")?.attachedTo }).toEqual({ bear: ["blade"], blade: "b" });
  });
});

describe("⭐ Teferi's Protection on the same primitive", () => {
  const protect = (s) => {
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-card");
    return resolveTopOfStack(dispatchAction(s, cast));
  };
  it("⭐ an equipped creature comes back with BOTH links (it used to return one-way: the Equipment read unattached)", () => {
    const back = untapFor(protect(board(TEFERIS_PROTECTION)), "user");
    expect(links(back)).toEqual({ bear: ["blade", "pac"], blade: "b", pac: "b" });
  });
  it("⭐ the opponent's Aura on your creature phases out with it — not left behind for the SBA to bin", () => {
    const out = checkAllStateBasedActions(protect(board(TEFERIS_PROTECTION)));
    expect({ onTheirBattlefield: out.players.ai.battlefield.some((p) => p.id === "pac"), inTheirGraveyard: out.players.ai.graveyard.some((c) => c.id === "c-pac") })
      .toEqual({ onTheirBattlefield: false, inTheirGraveyard: false });
  });
});
