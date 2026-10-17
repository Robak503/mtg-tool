/**
 * roleUniqueness.test.js — one Role per player per permanent (CR 704.5y).
 *
 * The rule, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 303.7a / 704.5y — "If a permanent has more than one Role controlled by the same player attached to it, each of those
 *     Roles except the one with the most recent timestamp is put into its owner's graveyard." A state-based action.
 *   · CR 613.7e — "An Aura, Equipment, or Fortification receives a new timestamp each time it becomes attached to an object or
 *     player." A Role enters attached, so its timestamp is the moment it was last attached; the engine records that order in the
 *     host's `attachments` list (gameState.attachPermanent appends, and every attachment is formed there).
 *   · CR 613.7m — Roles attached simultaneously (a doubled creation) take the order their controller chooses; they are copies of
 *     one Role, so which of them stays changes nothing.
 *   · CR 111.7 / 704.5d — the Role that goes is a token: it ceases to exist, after its leaves-the-battlefield triggers trigger.
 *
 * Before this check, Doubling Season (or any token doubler) with one Role creation left two Roles on one creature, both granting
 * their bonus, and a second Role from the same player never replaced the first.
 *
 * Eriette's Whisper is cast for real (legal action → dispatch → resolve; the resolution's own state-based check settles it); the
 * other Roles are made by the engine's own Role resolver from each card's parsed text. Real oracle fixtures (bundled Scryfall
 * snapshot, read 2026-10-16; the trailing comment is the engine's tier read).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { checkAllStateBasedActions } from "./sba.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const ERIETTES_WHISPER = {"name":"Eriette's Whisper","type":"Sorcery","mana":"{3}{B}","cmc":4,"keywords":["Role token"],"colors":["B"],"oracle":"Target opponent discards two cards. Create a Wicked Role token attached to up to one target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)"}; // native-spell
const SPITEFUL_HEXMAGE = {"name":"Spiteful Hexmage","type":"Creature — Human Warlock","mana":"{B}","cmc":1,"power":"3","toughness":"2","keywords":["Role token"],"colors":["B"],"oracle":"When this creature enters, create a Cursed Role token attached to target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature is 1/1.)"}; // native-trigger
const FEROCIOUS_WEREFOX = {"name":"Ferocious Werefox // Guard Change","type":"Creature — Elf Fox Warrior // Instant — Adventure","mana":"{3}{G} // {1}{G}","cmc":4,"power":"4","toughness":"3","keywords":["Role token","Trample"],"layout":"adventure","colors":["G"],"oracle":"Ferocious Werefox - Creature — Elf Fox Warrior {3}{G}\nTrample\n//\nGuard Change - Instant — Adventure {1}{G}\nCreate a Monster Role token attached to target creature you control. (Enchanted creature gets +1/+1 and has trample.)"}; // native-mixed
const TWISTED_FEALTY = {"name":"Twisted Fealty","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":["Role token"],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.\nCreate a Wicked Role token attached to up to one target creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)"}; // native-spell
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."}; // native-static
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land

/** Each card's own Role sentence, cut from the fixture above (never retyped), parsed by the engine. */
const roleSentence = (card) => card.oracle.split("\n").map((l) => l.split(" (")[0]).find((l) => /Role token/.test(l)).replace(/^When this creature enters, /, "");
const CURSED_CLAUSE = roleSentence(SPITEFUL_HEXMAGE);   // "create a Cursed Role token attached to target creature you control."
const MONSTER_CLAUSE = roleSentence(FEROCIOUS_WEREFOX); // "Create a Monster Role token attached to target creature you control."
const WICKED_ANY_CLAUSE = roleSentence(TWISTED_FEALTY); // "Create a Wicked Role token attached to up to one target creature."

const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
function board({ user = [], ai = [], userHand = [], aiHand = [], userMana = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: userHand, manaPool: { ...s.players.user.manaPool, ...userMana }, library: [1, 2, 3].map((i) => ({ ...SWAMP, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, hand: aiHand, library: [1, 2, 3].map((i) => ({ ...SWAMP, id: `al${i}` })) } } };
}
/** `controller` resolves `clause` (the engine's parse of a real card's Role sentence) with its Role aimed at `hostId`. */
function makeRole(s, clause, controller, hostId, sourceName) {
  const program = parseEffectClause(clause, "Sorcery");
  expect(program.confidence, `the engine parses "${clause}"`).toBe("high");
  return runEffectProgram(s, { source: { name: sourceName }, payload: { params: { program, controller, targets: [{ type: "creature", id: hostId }], context: {} } } });
}
const roles = (s) => Object.values(s.players).flatMap((p) => p.battlefield).filter((p) => /\bRole\b/.test(String(p.card?.type || "")));
/** The Roles on `hostId`, in attachment order, as "<Role> (<controller>)". */
const rolesOn = (s, hostId) => (findPermanent(s, hostId)?.permanent.attachments || []).map((id) => findPermanent(s, id)).filter(Boolean)
  .map((r) => `${r.permanent.card.name} (${r.controller})`);
const pt = (s, id) => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;
const replaced = (s) => (s.log || []).filter((e) => e.kind === "role-replaced").map((e) => `${e.cardName} (${e.controller}) off ${e.hostName}`);

describe("⭐ Doubling Season doubles a Role — the state-based check keeps one (CR 704.5y)", () => {
  /** Eriette's Whisper, cast for real at the opponent and your Grizzly Bears, with Doubling Season out. */
  function whisper() {
    const s = board({ user: [P("bears", "user", BEARS), P("season", "user", DOUBLING_SEASON)], userHand: [{ ...ERIETTES_WHISPER, id: "whisper" }], userMana: { B: 1, C: 3 } });
    const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "whisper" && (a.targets || []).some((t) => t.id === "bears"));
    expect(action, "a legal Eriette's Whisper at the opponent and the Bears").toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, action));
  }

  it("⭐ two Wicked Roles are created and only the newer stays: the Bears are 3/3, not 4/4", () => {
    const s = whisper();
    const row = { wickedOnBattlefield: roles(s).length, onBears: rolesOn(s, "bears"), bears: pt(s, "bears"), replaced: replaced(s) };
    console.log("  WITNESS roleUniquenessDoubled", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ wickedOnBattlefield: 1, onBears: ["Wicked (user)"], bears: "3/3", replaced: ["Wicked (user) off Grizzly Bears"] });
  });

  it("⭐ the newer one is the one that stays — the older Role ceases to exist (a token: no graveyard, no zone at all)", () => {
    const s = whisper();
    const created = (s.log || []).find((e) => e.kind === "spell-effect" && e.effect === "create-named-token");
    expect(created?.count).toBe(2); // the doubling happened
    const [survivor] = roles(s);
    const everywhere = Object.values(s.players).flatMap((p) => [...p.graveyard, ...p.exile, ...p.hand, ...p.library]).filter((c) => c?.name === "Wicked");
    expect({ survivorIsNewest: findPermanent(s, "bears").permanent.attachments.at(-1) === survivor.id, wickedCardsInAnyZone: everywhere.length, bearsLinks: findPermanent(s, "bears").permanent.attachments.length })
      .toEqual({ survivorIsNewest: true, wickedCardsInAnyZone: 0, bearsLinks: 1 });
  });

  it("⭐ the older Wicked Role is PUT INTO A GRAVEYARD, so its own trigger fires: each opponent loses 1 life", () => {
    let s = whisper();
    const aiLifeBefore = s.players.ai.life;
    const wickedTriggers = (s.stack || []).filter((o) => (o.source?.name || o.sourceName) === "Wicked").length;
    while ((s.stack || []).length) s = resolveTopOfStack(s);
    const row = { wickedTriggers, aiLifeLost: aiLifeBefore - s.players.ai.life, wickedStillOnBears: rolesOn(s, "bears") };
    console.log("  WITNESS roleUniquenessWickedDrain", JSON.stringify(row));
    expect(row).toEqual({ wickedTriggers: 1, aiLifeLost: 1, wickedStillOnBears: ["Wicked (user)"] });
  });
});

describe("⭐ the most recent timestamp wins, whatever the Role", () => {
  it("⭐ Cursed, then Monster on the same Craw Wurm: the Cursed Role goes — a 7/5 with trample", () => {
    let s = board({ user: [P("wurm", "user", WURM)] });
    s = makeRole(s, CURSED_CLAUSE, "user", "wurm", "Spiteful Hexmage");
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    const beforeCheck = { onWurm: rolesOn(s, "wurm"), wurm: pt(s, "wurm") };
    s = checkAllStateBasedActions(s);
    const row = { beforeCheck, onWurm: rolesOn(s, "wurm"), wurm: pt(s, "wurm"), trample: permanentHasKeyword(s, "wurm", "Trample"), replaced: replaced(s) };
    console.log("  WITNESS roleUniquenessCursedThenMonster", JSON.stringify(row));
    expect(row).toEqual({
      beforeCheck: { onWurm: ["Cursed (user)", "Monster (user)"], wurm: "2/2" },
      onWurm: ["Monster (user)"], wurm: "7/5", trample: true, replaced: ["Cursed (user) off Craw Wurm"],
    });
  });

  it("⭐ the reverse — Monster, then Cursed: the Monster Role goes, and the Wurm is a 1/1 without trample", () => {
    let s = board({ user: [P("wurm", "user", WURM)] });
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    s = makeRole(s, CURSED_CLAUSE, "user", "wurm", "Spiteful Hexmage");
    s = checkAllStateBasedActions(s);
    expect({ onWurm: rolesOn(s, "wurm"), wurm: pt(s, "wurm"), trample: permanentHasKeyword(s, "wurm", "Trample") })
      .toEqual({ onWurm: ["Cursed (user)"], wurm: "1/1", trample: false });
  });
});

describe("⛔ what the check never touches", () => {
  it("⛔ Roles of DIFFERENT players on one creature all stay — your Monster and the opponent's Wicked", () => {
    let s = board({ user: [P("wurm", "user", WURM)] });
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    s = makeRole(s, WICKED_ANY_CLAUSE, "ai", "wurm", "Twisted Fealty");
    s = checkAllStateBasedActions(s);
    expect({ onWurm: rolesOn(s, "wurm"), wurm: pt(s, "wurm"), replaced: replaced(s) })
      .toEqual({ onWurm: ["Monster (user)", "Wicked (ai)"], wurm: "8/6", replaced: [] });
  });

  it("⭐ grouped per player: your second Role replaces your first, and the opponent's Role between them stays", () => {
    let s = board({ user: [P("wurm", "user", WURM)] });
    s = makeRole(s, CURSED_CLAUSE, "user", "wurm", "Spiteful Hexmage");
    s = makeRole(s, WICKED_ANY_CLAUSE, "ai", "wurm", "Twisted Fealty");
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    s = checkAllStateBasedActions(s);
    expect({ onWurm: rolesOn(s, "wurm"), wurm: pt(s, "wurm"), replaced: replaced(s) })
      .toEqual({ onWurm: ["Wicked (ai)", "Monster (user)"], wurm: "8/6", replaced: ["Cursed (user) off Craw Wurm"] });
  });

  it("⛔ only Roles count: your Rancor beside your Monster Role on one creature — both stay", () => {
    let s = board({ user: [{ ...P("rancor", "user", RANCOR), attachedTo: "wurm" }, { ...P("wurm", "user", WURM), attachments: ["rancor"] }] });
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    expect(rolesOn(s, "wurm")).toEqual(["Rancor (user)", "Monster (user)"]);
    expect(checkAllStateBasedActions(s)).toBe(s);
  });

  it("⛔ a single Role is untouched — the check hands back the very same state", () => {
    const s = makeRole(board({ user: [P("wurm", "user", WURM)] }), MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    expect(checkAllStateBasedActions(s)).toBe(s);
  });

  it("⛔ one Role on each of two creatures: both stay (the check is per permanent)", () => {
    let s = board({ user: [P("wurm", "user", WURM), P("bears", "user", BEARS)] });
    s = makeRole(s, MONSTER_CLAUSE, "user", "wurm", "Guard Change");
    s = makeRole(s, CURSED_CLAUSE, "user", "bears", "Spiteful Hexmage");
    expect(checkAllStateBasedActions(s)).toBe(s);
  });
});
