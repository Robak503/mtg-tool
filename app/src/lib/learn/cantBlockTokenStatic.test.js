/**
 * cantBlockTokenStatic.test.js — the play-weighted program (2026-10-18): a token "with 'This token can't block.'" and the readers
 * around it the most-played still lacked.
 *   Lord Skitter, Sewer King (EDHREC #2379) — "At the beginning of combat on your turn, create a 1/1 black Rat creature token with
 *     "This token can't block.""
 *   Song of Totentanz (#2266) — "Create X 1/1 black Rat creature tokens with "This token can't block." Creatures you control gain
 *     haste until end of turn."
 *   White Sun's Twilight (#2003) — "You gain X life. Create X 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and
 *     "This token can't block." If X is 5 or more, destroy all other creatures."
 *   Skrelv's Hive (#2027) — "At the beginning of your upkeep, you lose 1 life and create a 1/1 colorless Phyrexian Mite artifact
 *     creature token with toxic 1 and "This token can't block."" + "Corrupted — … creatures you control with toxic have lifelink."
 *   Bitterbloom Bearer (#1894) — "At the beginning of your upkeep, you lose 1 life and create a 1/1 blue and black Faerie creature
 *     token with flying." (a leading instruction, then a token whose descriptor carries its own " and ")
 * The token's static is a restriction on its own blocks (CR 509.1b); toxic is CR 702.164a. Card text is the bundled oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { permanentHasKeyword } from "./layers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseTokenStaticAbility } from "./effects/parseHelpers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── bundled oracle fixtures ─────────────────────────────────────────────────────────────────────────────────────────
const LORD_SKITTER = {"name":"Lord Skitter, Sewer King","type":"Legendary Creature — Rat Noble","mana":"{2}{B}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["B"],"oracle":"Whenever another Rat you control enters, exile up to one target card from an opponent's graveyard.\nAt the beginning of combat on your turn, create a 1/1 black Rat creature token with \"This token can't block.\""};
const SONG_OF_TOTENTANZ = {"name":"Song of Totentanz","type":"Sorcery","mana":"{X}{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Create X 1/1 black Rat creature tokens with \"This token can't block.\" Creatures you control gain haste until end of turn."};
const WHITE_SUNS_TWILIGHT = {"name":"White Sun's Twilight","type":"Sorcery","mana":"{X}{W}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"You gain X life. Create X 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and \"This token can't block.\" If X is 5 or more, destroy all other creatures. (Players dealt combat damage by a creature with toxic 1 also get a poison counter.)"};
const SKRELVS_HIVE = {"name":"Skrelv's Hive","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":["Corrupted"],"colors":["W"],"oracle":"At the beginning of your upkeep, you lose 1 life and create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\"\nCorrupted — As long as an opponent has three or more poison counters, creatures you control with toxic have lifelink."};
const BITTERBLOOM_BEARER = {"name":"Bitterbloom Bearer","type":"Creature — Faerie Rogue","mana":"{B}{B}","cmc":2,"power":"1","toughness":"1","keywords":["Flying","Flash"],"colors":["B"],"oracle":"Flash\nFlying\nAt the beginning of your upkeep, you lose 1 life and create a 1/1 blue and black Faerie creature token with flying."};
// the corpus twins the same readers play
const VORACIOUS_VERMIN = {"name":"Voracious Vermin","type":"Creature — Rat","mana":"{2}{B}","cmc":3,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"When this creature enters, create a 1/1 black Rat creature token with \"This token can't block.\"\nWhenever another creature you control dies, put a +1/+1 counter on this creature."};
const HARRIED_SPEARGUARD = {"name":"Harried Spearguard","type":"Creature — Human Soldier","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste\nWhen this creature dies, create a 1/1 black Rat creature token with \"This token can't block.\""};
const SYNAPSE_NECROMAGE = {"name":"Synapse Necromage","type":"Creature — Fungus Wizard","mana":"{2}{B}","cmc":3,"power":"3","toughness":"1","keywords":[],"colors":["B"],"oracle":"When this creature dies, create two 1/1 black Fungus creature tokens with \"This token can't block.\""};
const EDGEWALL_PACK = {"name":"Edgewall Pack","type":"Creature — Dog","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":["Menace"],"colors":["R"],"oracle":"Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, create a 1/1 black Rat creature token with \"This token can't block.\""};
const HEROES_OF_THE_REVEL = {"name":"Heroes of the Revel","type":"Creature — Satyr Soldier","mana":"{4}{R}","cmc":5,"power":"4","toughness":"4","keywords":[],"colors":["R"],"oracle":"When this creature enters, create a 1/1 red Satyr creature token with \"This token can't block.\"\nWhenever you cast a spell that targets this creature, creatures you control get +1/+0 until end of turn."};
const CRAWLING_CHORUS = {"name":"Crawling Chorus","type":"Creature — Phyrexian Horror","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["Toxic"],"colors":["W"],"oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhen this creature dies, create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\""};
const BASILICA_SHEPHERD = {"name":"Basilica Shepherd","type":"Creature — Phyrexian Angel","mana":"{3}{W}{W}","cmc":5,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhen this creature enters, create two 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and \"This token can't block.\" (Players dealt combat damage by them also get a poison counter.)"};
const STINGING_HIVEMASTER = {"name":"Stinging Hivemaster","type":"Creature — Phyrexian Warlock","mana":"{2}{B}","cmc":3,"power":"3","toughness":"2","keywords":["Toxic"],"colors":["B"],"oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nWhen this creature dies, create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\""};
const RAT_OUT = {"name":"Rat Out","type":"Instant","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Up to one target creature gets -1/-1 until end of turn. You create a 1/1 black Rat creature token with \"This token can't block.\""};
const SATYRS_CUNNING = {"name":"Satyr's Cunning","type":"Sorcery","mana":"{R}","cmc":1,"keywords":["Escape"],"colors":["R"],"oracle":"Create a 1/1 red Satyr creature token with \"This token can't block.\"\nEscape—{2}{R}, Exile two other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)"};
const CHARGE_OF_THE_MITES = {"name":"Charge of the Mites","type":"Instant","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Choose one —\n• Charge of the Mites deals damage equal to the number of creatures you control to target creature or planeswalker.\n• Create two 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and \"This token can't block.\" (Players dealt combat damage by them also get a poison counter.)"};
const INFESTED_FLESHCUTTER = {"name":"Infested Fleshcutter","type":"Artifact — Equipment","mana":"{1}{W}","cmc":2,"keywords":["Equip"],"colors":["W"],"oracle":"Equipped creature gets +2/+0.\nWhenever equipped creature attacks, create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\" (Players dealt combat damage by it also get a poison counter.)\nEquip {2}{W}"};
const EXPERIMENTAL_CONFECTIONER = {"name":"Experimental Confectioner","type":"Creature — Human Peasant","mana":"{2}{B}","cmc":3,"power":"2","toughness":"3","keywords":["Food"],"colors":["B"],"oracle":"When this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you sacrifice a Food, create a 1/1 black Rat creature token with \"This token can't block.\""};
const WAREHOUSE_TABBY = {"name":"Warehouse Tabby","type":"Creature — Cat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"Whenever an enchantment you control is put into a graveyard from the battlefield, create a 1/1 black Rat creature token with \"This token can't block.\"\n{1}{B}: This creature gains deathtouch until end of turn."};
const BROODRAGE_MYCOID = {"name":"Broodrage Mycoid","type":"Creature — Fungus","mana":"{3}{B}","cmc":4,"power":"4","toughness":"3","keywords":[],"colors":["B"],"oracle":"At the beginning of your end step, if you descended this turn, create a 1/1 black Fungus creature token with \"This token can't block.\" (You descended if a permanent card was put into your graveyard from anywhere.)"};
const MIRREX = {"name":"Mirrex","type":"Land — Sphere","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Add one mana of any color. Activate only if this land entered this turn.\n{3}, {T}: Create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\" (Players dealt combat damage by it also get a poison counter.)"};
// controls — the same token on a card with another unread line, or a different quoted sentence
const THE_RAVEN_MAN = {"name":"The Raven Man","type":"Legendary Creature — Human Wizard","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"At the beginning of each end step, if a player discarded a card this turn, create a 1/1 black Bird creature token with flying and \"This token can't block.\"\n{3}{B}, {T}: Each opponent discards a card. Activate only as a sorcery."};
const REALM_OF_KOH = {"name":"Realm of Koh","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"This land enters tapped unless you control a basic land.\n{T}: Add {B}.\n{3}{B}, {T}: Create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\""};
const MITE_OVERSEER = {"name":"Mite Overseer","type":"Creature — Phyrexian Soldier","mana":"{3}{W}","cmc":4,"power":"4","toughness":"2","keywords":["First strike"],"colors":["W"],"oracle":"First strike\nDuring your turn, creature tokens you control get +1/+0 and have first strike.\n{3}{W/P}: Create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\" (Players dealt combat damage by it also get a poison counter. {W/P} can be paid with either {W} or 2 life.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};

// ─── harness ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ ...card, id });
const LIB = (n, who) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${who}-lib${i}` }));
function board({ user = [], ai = [], hand = [], pool = {}, active = "user", phase = "precombat-main", step = "main", aiPoison = 0, aiGraveyard = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase, step, stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, hand, library: LIB(10, "u"), manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai, library: LIB(10, "a"), poison: aiPoison, graveyard: aiGraveyard } } };
}
/** Resolve the stack, flushing any triggers onto it, until a choice or quiet — failing loudly on a crashed resolver. */
function settle(s) {
  let n = s;
  for (let i = 0; i < 40 && (n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice; i++) {
    n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const nextStep = (s) => settle(runStepActions(advanceStep(s)));
const cast = (s, cardId, pick = () => true) => {
  const offer = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && pick(a));
  expect(offer).toBeTruthy();
  return settle(dispatchAction(s, offer));
};
const tokens = (s, who) => s.players[who].battlefield.filter((p) => p.card?.token);
const tokenView = (p) => ({ name: p.card.name, type: p.card.type, pt: `${p.card.power}/${p.card.toughness}`, oracle: p.card.oracle, keywords: p.card.keywords, colors: p.card.colors });
const atoms = (text, type = "Instant", opts) => { const p = parseEffectClause(text, type, opts); return programConfidence(p) === "high" ? p.atoms : []; };

// ─── the readers ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the readers", () => {
  it("⭐ the static: \"This token can't block.\" is minted as \"This creature can't block.\" — that sentence only", () => {
    expect({
      cantBlock: parseTokenStaticAbility("\"This token can't block.\""),
      noPeriod: parseTokenStaticAbility("\"This token can't block\""),
      spirit: parseTokenStaticAbility("\"This token can't block or be blocked by non-Spirit creatures.\""),
      cantAttack: parseTokenStaticAbility("\"This token can't attack.\""),
      crewStill: parseTokenStaticAbility("\"This token crews Vehicles as though its power were 2 greater.\""),
    }).toEqual({ cantBlock: "This creature can't block.", noPeriod: "This creature can't block.", spirit: null, cantAttack: null, crewStill: "This creature crews Vehicles as though its power were 2 greater." });
  });

  it("⭐ the token clauses: a fixed count, the spell's X, keywords AND the static (flying; toxic 1)", () => {
    expect({
      rat: atoms("Create a 1/1 black Rat creature token with \"This token can't block.\""),
      fungi: atoms("Create two 1/1 black Fungus creature tokens with \"This token can't block.\""),
      xRats: atoms("Create X 1/1 black Rat creature tokens with \"This token can't block.\"", "Sorcery", { hasX: true }),
      bird: atoms("Create a 1/1 black Bird creature token with flying and \"This token can't block.\""),
      mite: atoms("Create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\""),
    }).toEqual({
      rat: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "black rat", targetType: null, tokenOracle: "This creature can't block." }],
      fungi: [{ op: "create-token", count: 2, power: 1, toughness: 1, descriptor: "black fungus", targetType: null, tokenOracle: "This creature can't block." }],
      xRats: [{ op: "create-token", power: 1, toughness: 1, descriptor: "black rat", targetType: null, tokenOracle: "This creature can't block.", countX: true }],
      bird: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "black bird", targetType: null, keywords: ["Flying"], tokenOracle: "Flying\nThis creature can't block." }],
      mite: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless phyrexian mite artifact", targetType: null, keywords: ["Toxic"], tokenOracle: "Toxic 1\nThis creature can't block." }],
    });
  });

  it("⭐ a leading instruction, then a token whose descriptor or rider has its own \" and \": two instructions, in printed order", () => {
    expect({
      faerie: atoms("you lose 1 life and create a 1/1 blue and black Faerie creature token with flying"),
      mite: atoms("you lose 1 life and create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't block.\""),
    }).toEqual({
      faerie: [{ op: "lose-life", amount: 1, who: "controller", targetType: null }, { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "blue and black faerie", targetType: null, keywords: ["Flying"] }],
      mite: [{ op: "lose-life", amount: 1, who: "controller", targetType: null }, { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "colorless phyrexian mite artifact", targetType: null, keywords: ["Toxic"], tokenOracle: "Toxic 1\nThis creature can't block." }],
    });
  });

  it("CONTROL — near misses stay unread: an unread keyword beside the static, an unread quoted sentence, an unread rider after the token, a lead that is itself a list", () => {
    expect({
      unreadKeyword: atoms("Create a 1/1 black Rat creature token with ward 1 and \"This token can't block.\""),
      spirit: atoms("Create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\""),
      cantAttack: atoms("Create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and \"This token can't attack.\""),
      riderAfter: atoms("you lose 1 life and create a 1/1 blue and black Faerie creature token with flying and you win a prize"),
      listLead: atoms("you lose 1 life, scry 1, and create a 1/1 blue and black Faerie creature token with flying"),
    }).toEqual({ unreadKeyword: [], spirit: [], cantAttack: [], riderAfter: [], listLead: [] });
  });
});

describe("the cards", () => {
  it("⭐ the five top-2,500 cards read native", () => {
    const row = Object.fromEntries([LORD_SKITTER, SONG_OF_TOTENTANZ, WHITE_SUNS_TWILIGHT, SKRELVS_HIVE, BITTERBLOOM_BEARER].map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual({
      "Lord Skitter, Sewer King": "native-trigger", "Song of Totentanz": "native-spell", "White Sun's Twilight": "native-spell",
      "Skrelv's Hive": "native-mixed", "Bitterbloom Bearer": "native-trigger",
    });
  });

  it("the twins whose only unread line was the token read native", () => {
    const twins = [VORACIOUS_VERMIN, HARRIED_SPEARGUARD, SYNAPSE_NECROMAGE, EDGEWALL_PACK, HEROES_OF_THE_REVEL, CRAWLING_CHORUS, BASILICA_SHEPHERD, STINGING_HIVEMASTER,
      RAT_OUT, SATYRS_CUNNING, CHARGE_OF_THE_MITES, INFESTED_FLESHCUTTER, EXPERIMENTAL_CONFECTIONER, WAREHOUSE_TABBY, BROODRAGE_MYCOID, MIRREX];
    const notNative = twins.filter((c) => !/^native-|^land$/.test(classifyCard(c))).map((c) => `${c.name}: ${classifyCard(c)}`);
    expect(notNative).toEqual([]);
  });

  it("CONTROL — a card with another unread line stays parked: The Raven Man (its end-step condition), Realm of Koh (the Spirit sentence), Mite Overseer (its turn-scoped token anthem)", () => {
    const row = Object.fromEntries([THE_RAVEN_MAN, REALM_OF_KOH, MITE_OVERSEER].map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual({ "The Raven Man": "body-only", "Realm of Koh": "land-partial", "Mite Overseer": "body-only" });
  });
});

// ─── in play ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ in play — the Rat that can't block", () => {
  it("⭐ Lord Skitter: at the beginning of combat a 1/1 black Rat enters that can't block, and its entering exiles a card from the opponent's graveyard", () => {
    const s0 = board({ user: [P("lord", LORD_SKITTER)], aiGraveyard: [H("aigy", GRIZZLY_BEARS)] });
    const s = nextStep(s0);
    const rats = tokens(s, "user");
    expect({ step: s.step, rats: rats.map(tokenView), aiGraveyard: s.players.ai.graveyard.length, aiExile: s.players.ai.exile.map((c) => c.id) }).toEqual({
      step: "beginning-of-combat",
      rats: [{ name: "Rat", type: "Token Creature — Rat", pt: "1/1", oracle: "This creature can't block.", keywords: [], colors: ["B"] }],
      aiGraveyard: 0, aiExile: ["aigy"],
    });
  });

  it("⭐ the Rat is never offered as a blocker and can't block; a Bear beside it can", () => {
    const made = nextStep(board({ user: [P("lord", LORD_SKITTER)] }));
    expect(tokens(made, "user").map((p) => p.card.name)).toEqual(["Rat"]);
    const ratId = tokens(made, "user")[0].id;
    const s = { ...made, activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: "giant", attackingPlayer: "ai", defender: "user" }], blockers: [] },
      players: { ...made.players, user: { ...made.players.user, battlefield: [...made.players.user.battlefield, P("bears", GRIZZLY_BEARS)] }, ai: { ...made.players.ai, battlefield: [P("giant", HILL_GIANT, "ai")] } } };
    const offered = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-blocker").map((a) => a.permanentId).sort();
    expect({ offered, ratCanBlock: canBlockAttacker(s, ratId, "giant", "user"), bearsCanBlock: canBlockAttacker(s, "bears", "giant", "user") })
      .toEqual({ offered: ["bears", "lord"], ratCanBlock: false, bearsCanBlock: true });
  });

  it("⭐ Song of Totentanz, X = 3: three Rats that can't block, and every creature its caster controls as it resolves gains haste — a Bear arriving later this turn does not (its ruling)", () => {
    const s0 = board({ hand: [H("song", SONG_OF_TOTENTANZ), H("bears2", GRIZZLY_BEARS)], pool: { R: 4, G: 2 }, user: [P("bears", GRIZZLY_BEARS, "user", { summoningSick: true })] });
    const s1 = cast(s0, "song", (a) => a.xValue === 3);
    const s2 = cast(s1, "bears2");
    const late = s2.players.user.battlefield.find((p) => p.card?.id === "bears2");
    const rats = tokens(s1, "user");
    expect({
      rats: rats.map((p) => p.card.oracle),
      ratsHaste: rats.every((p) => permanentHasKeyword(s1, p.id, "Haste")),
      bearsHaste: permanentHasKeyword(s1, "bears", "Haste"),
      lateBearHaste: permanentHasKeyword(s2, late.id, "Haste"),
    }).toEqual({ rats: ["This creature can't block.", "This creature can't block.", "This creature can't block."], ratsHaste: true, bearsHaste: true, lateBearHaste: false });
  });
});

describe("⭐ in play — the Phyrexian Mite", () => {
  it("⭐ an unblocked Mite deals its 1 damage and gives the player a poison counter (toxic 1); it can't block", () => {
    // a Mite minted by Skrelv's Hive at its controller's upkeep, then sent in unblocked
    const hive = nextStep(board({ user: [P("hive", SKRELVS_HIVE)], phase: "beginning", step: "untap" }));
    expect(tokens(hive, "user").map((p) => p.card.name)).toEqual(["Phyrexian Mite"]);
    const mite = tokens(hive, "user")[0];
    const attack = { ...hive, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: mite.id, attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...hive.players, user: { ...hive.players.user, battlefield: hive.players.user.battlefield.map((p) => (p.id === mite.id ? { ...p, summoningSick: false } : p)) } } };
    const hit = resolveCombatDamage(attack);
    const blockCheck = { ...hive, activePlayer: "ai", step: "declare-blockers", combat: { attackers: [{ permanentId: "giant", attackingPlayer: "ai", defender: "user" }], blockers: [] },
      players: { ...hive.players, ai: { ...hive.players.ai, battlefield: [P("giant", HILL_GIANT, "ai")] } } };
    expect({
      mite: tokenView(mite),
      aiLife: hit.players.ai.life - attack.players.ai.life, aiPoison: hit.players.ai.poison - attack.players.ai.poison,
      miteCanBlock: canBlockAttacker(blockCheck, mite.id, "giant", "user"),
    }).toEqual({
      mite: { name: "Phyrexian Mite", type: "Token Artifact Creature — Phyrexian Mite", pt: "1/1", oracle: "Toxic 1\nThis creature can't block.", keywords: ["Toxic"], colors: [] },
      aiLife: -1, aiPoison: 1, miteCanBlock: false,
    });
  });

  it("⭐ White Sun's Twilight, X = 5: gain 5 life, five Mites, then every OTHER creature is destroyed; X = 4: gain 4, four Mites, nothing destroyed", () => {
    const wst = (x) => cast(board({ hand: [H("wst", WHITE_SUNS_TWILIGHT)], pool: { W: 7 }, user: [P("bears", GRIZZLY_BEARS)], ai: [P("giant", HILL_GIANT, "ai")] }), "wst", (a) => a.xValue === x);
    const row = (s) => ({ life: s.players.user.life - 40, mites: tokens(s, "user").filter((p) => p.card.name === "Phyrexian Mite").length,
      others: [...s.players.user.battlefield, ...s.players.ai.battlefield].filter((p) => !p.card?.token).map((p) => p.id).sort() });
    const s0life = board().players.user.life;
    expect({ start: s0life, five: row(wst(5)), four: row(wst(4)) }).toEqual({ start: 40, five: { life: 5, mites: 5, others: [] }, four: { life: 4, mites: 4, others: ["bears", "giant"] } });
  });

  it("⭐ Skrelv's Hive: at its controller's upkeep, lose 1 life and a Mite enters; with an opponent at three poison counters its creatures with toxic have lifelink — not at two, and never a creature without toxic", () => {
    const at = (aiPoison) => nextStep(board({ user: [P("hive", SKRELVS_HIVE), P("bears", GRIZZLY_BEARS)], phase: "beginning", step: "untap", aiPoison }));
    const three = at(3);
    const two = at(2);
    expect({ three: tokens(three, "user").map((p) => p.card.name), two: tokens(two, "user").map((p) => p.card.name) }).toEqual({ three: ["Phyrexian Mite"], two: ["Phyrexian Mite"] });
    const miteOf = (s) => tokens(s, "user")[0];
    expect({
      step: three.step, life: three.players.user.life - 40, mite: miteOf(three).card.name,
      miteLifelinkAt3: permanentHasKeyword(three, miteOf(three).id, "Lifelink"), bearsLifelinkAt3: permanentHasKeyword(three, "bears", "Lifelink"),
      miteLifelinkAt2: permanentHasKeyword(two, miteOf(two).id, "Lifelink"),
    }).toEqual({ step: "upkeep", life: -1, mite: "Phyrexian Mite", miteLifelinkAt3: true, bearsLifelinkAt3: false, miteLifelinkAt2: false });
  });
});

describe("⭐ in play — Bitterbloom Bearer", () => {
  it("⭐ at its controller's upkeep: lose 1 life, then a 1/1 blue and black Faerie with flying", () => {
    const s = nextStep(board({ user: [P("bearer", BITTERBLOOM_BEARER)], phase: "beginning", step: "untap" }));
    expect({ step: s.step, life: s.players.user.life - 40, faeries: tokens(s, "user").map(tokenView) }).toEqual({
      step: "upkeep", life: -1,
      faeries: [{ name: "Faerie", type: "Token Creature — Faerie", pt: "1/1", oracle: "Flying", keywords: ["Flying"], colors: ["U", "B"] }],
    });
  });
});
