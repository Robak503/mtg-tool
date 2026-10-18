/**
 * tappedAttackingTokens.test.js — the play-weighted program: a fixed number of creature tokens "that are tapped and attacking" /
 * a single one "that's tapped and attacking", made by an attack trigger.
 *
 *   Hero of Bladehold (#1976):  "Battle cry … / Whenever this creature attacks, create two 1/1 white Soldier creature tokens that are
 *                               tapped and attacking."
 *   Skyknight Vanguard (#3922), Hanweir Garrison (#4303), Mardu Ascendancy (#7032), Suki, Kyoshi Warrior (#7253), Captain's Claws
 *   (#10389) — the same disposition, singular or plural.
 *
 * The attacking join already existed (Leonin Warleader's "… with lifelink that are tapped and attacking", Parhelion II): the minted
 * tokens are registered in state.combat.attackers against the attack trigger's defender (ctx.defenderId). Two readings were
 * missing: the plural disposition with no "with …" list was split at its internal " and " (a token clause plus an orphan
 * "attacking"), and the singular "that's tapped and attacking" was never read on the fixed-count arm. CR 508.4: a creature put
 * onto the battlefield attacking was never declared as an attacker, so nothing that triggers on attacking fires for it (the
 * bundled rulings of Hero of Bladehold, Skyknight Vanguard, Mardu Ascendancy and Captain's Claws say so). Only an attack event
 * supplies the defender, so the disposition routes natively only there (the referent gate — a "whenever you attack" batch has no
 * defender and stays parked: Gut, True Soul Zealot).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the tier BEFORE this slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const HERO = {"name":"Hero of Bladehold","type":"Creature — Human Knight","mana":"{2}{W}{W}","cmc":4,"power":"3","toughness":"4","keywords":["Battle Cry"],"colors":["W"],"oracle":"Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nWhenever this creature attacks, create two 1/1 white Soldier creature tokens that are tapped and attacking."}; // body-only #1976
const SKYKNIGHT = {"name":"Skyknight Vanguard","type":"Creature — Human Knight","mana":"{R}{W}","cmc":2,"power":"1","toughness":"2","keywords":["Flying"],"colors":["R","W"],"oracle":"Flying\nWhenever this creature attacks, create a 1/1 white Soldier creature token that's tapped and attacking."}; // body-only #3922
const GARRISON = {"name":"Hanweir Garrison","type":"Creature — Human Soldier","mana":"{2}{R}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["R"],"oracle":"Whenever this creature attacks, create two 1/1 red Human creature tokens that are tapped and attacking.\n(Melds with Hanweir Battlements.)"}; // body-only #4303
const MARDU = {"name":"Mardu Ascendancy","type":"Enchantment","mana":"{R}{W}{B}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["B","R","W"],"oracle":"Whenever a nontoken creature you control attacks, create a 1/1 red Goblin creature token that's tapped and attacking.\nSacrifice this enchantment: Creatures you control get +0/+3 until end of turn."}; // body-only #7032
const SUKI = {"name":"Suki, Kyoshi Warrior","type":"Legendary Creature — Human Warrior Ally","mana":"{2}{G/W}{G/W}","cmc":4,"power":"*","toughness":"4","keywords":[],"colors":["G","W"],"oracle":"Suki's power is equal to the number of creatures you control.\nWhenever Suki attacks, create a 1/1 white Ally creature token that's tapped and attacking."}; // body-only #7253
const CLAWS = {"name":"Captain's Claws","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+0.\nWhenever equipped creature attacks, create a 1/1 white Kor Ally creature token that's tapped and attacking.\nEquip {1}"}; // body-only #10389
const WARLEADER = {"name":"Leonin Warleader","type":"Creature — Cat Soldier","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","keywords":[],"colors":["W"],"oracle":"Whenever this creature attacks, create two 1/1 white Cat creature tokens with lifelink that are tapped and attacking."}; // native-trigger #3286
const GUT = {"name":"Gut, True Soul Zealot","type":"Legendary Creature — Goblin Shaman","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":["Choose a background"],"colors":["R"],"oracle":"Whenever you attack, you may sacrifice another creature or an artifact. If you do, create a 4/1 black Skeleton creature token with menace that's tapped and attacking. (It can't be blocked except by two or more creatures.)\nChoose a Background (You can have a Background as a second commander.)"}; // body-only #7004
const CAMPAIGN = {"name":"Campaign of Vengeance","type":"Enchantment","mana":"{3}{W}{B}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["B","W"],"oracle":"Whenever a creature you control attacks, defending player loses 1 life and you gain 1 life."}; // native-trigger #12756
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

/** The user's declared attackers (`attackers`: [permanentId, defender]) with `extra` on its battlefield; attack triggers fire and resolve. */
function attack({ user = [], attackers = [], seats = 2, attach = null }) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...b.players };
  const order = ["user", "ai"];
  if (seats === 3) { players.ai2 = { ...b.players.ai }; order.push("ai2"); }
  for (const pid of order) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], life: 20 };
  players.user = { ...players.user, battlefield: user };
  let s = { ...b, players, turnOrder: order, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
    combat: { attackers: attackers.map(([permanentId, defender]) => ({ permanentId, attackingPlayer: "user", defender })), blockers: [] } };
  if (attach) s = attachPermanent(s, attach);
  s = checkAttackTriggers(s);
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 40 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** The user's tokens of `subtype`: how many, all tapped, and the defender each is attacking (null = not in combat). */
function tokens(s, subtype) {
  const toks = s.players.user.battlefield.filter((p) => p.card?.token && new RegExp(`\\b${subtype}\\b`).test(String(p.card?.type || "")));
  return { count: toks.length, tapped: toks.every((t) => t.tapped), defenders: toks.map((t) => (s.combat?.attackers || []).find((a) => a.permanentId === t.id)?.defender ?? null) };
}

describe("THE PARSE", () => {
  it("⭐ the plural disposition with no keyword list and the singular one each read to ONE tapped, attacking create-token atom", () => {
    const plural = parseEffectClause("create two 1/1 white Soldier creature tokens that are tapped and attacking", "Instant", { sourceScoped: true });
    const singular = parseEffectClause("create a 1/1 white Soldier creature token that's tapped and attacking", "Instant", { sourceScoped: true });
    expect({ conf: programConfidence(plural), atoms: plural.atoms }).toEqual({ conf: "high", atoms: [{ op: "create-token", count: 2, power: 1, toughness: 1, descriptor: "white soldier", tapped: true, entersAttacking: true, targetType: null }] });
    expect({ conf: programConfidence(singular), atoms: singular.atoms }).toEqual({ conf: "high", atoms: [{ op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier", tapped: true, entersAttacking: true, targetType: null }] });
  });

  it("control — Leonin Warleader's keyword-list form reads as before", () => {
    const p = parseEffectClause("create two 1/1 white Cat creature tokens with lifelink that are tapped and attacking", "Instant", { sourceScoped: true });
    expect(p.atoms).toEqual([{ op: "create-token", count: 2, power: 1, toughness: 1, descriptor: "white cat", tapped: true, entersAttacking: true, targetType: null, keywords: ["Lifelink"] }]);
  });
});

describe("THE REFERENT GATE — the defender comes from an attack", () => {
  it("⭐ the disposition routes natively on an attacks event and not on a \"whenever you attack\" batch (no defender there)", () => {
    const effectClause = "create a 1/1 red Goblin creature token that's tapped and attacking";
    const onAttack = triggerRoutesNatively({ event: "attacks", scope: "self", whose: "any", optional: false, interveningIf: null, effectClause });
    const onYouAttack = triggerRoutesNatively({ event: "youAttack", scope: "you", whose: "any", optional: false, interveningIf: null, effectClause });
    expect({ onAttack, onYouAttack }).toEqual({ onAttack: true, onYouAttack: false });
  });

  it("CREED — Gut, True Soul Zealot (\"Whenever you attack, …\") stays parked", () => {
    expect(isNativeTier(classifyCard(GUT))).toBe(false);
  });
});

describe("CLASSIFICATION", () => {
  it("⭐ Hero of Bladehold, Skyknight Vanguard, Hanweir Garrison, Mardu Ascendancy, Suki and Captain's Claws classify native", () => {
    for (const c of [HERO, SKYKNIGHT, GARRISON, MARDU, SUKI, CLAWS]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("control — Leonin Warleader stays native", () => {
    expect(classifyCard(WARLEADER)).toBe("native-trigger");
  });
});

describe("RUNTIME", () => {
  it("⭐ Hero of Bladehold attacks: two Soldiers enter tapped and attacking the same player, and deal their combat damage", () => {
    const s = attack({ user: [P("hero", HERO, "user")], attackers: [["hero", "ai"]] });
    const row = tokens(s, "Soldier");
    const after = resolveCombatDamage(s);
    // Hero (3) and two 1/1 Soldiers; battle cry gives every OTHER attacking creature +1/+0 only if it resolves after the tokens
    // exist — either order is the controller's (the bundled ruling), so the damage is 5 or 7.
    const dealt = 20 - after.players.ai.life;
    expect({ ...row, dealtIncludesTokens: dealt >= 5 }).toEqual({ count: 2, tapped: true, defenders: ["ai", "ai"], dealtIncludesTokens: true });
  });

  it("⭐ the ruling: the tokens were never declared as attackers — a \"creature you control attacks\" watcher fires once, for Hero", () => {
    const s = attack({ user: [P("hero", HERO, "user"), P("camp", CAMPAIGN, "user")], attackers: [["hero", "ai"]] });
    expect({ soldiers: tokens(s, "Soldier").count, aiLife: s.players.ai.life, userLife: s.players.user.life }).toEqual({ soldiers: 2, aiLife: 19, userLife: 21 });
  });

  it("⭐ Skyknight Vanguard and Suki make one tapped, attacking token each", () => {
    const sky = attack({ user: [P("sky", SKYKNIGHT, "user")], attackers: [["sky", "ai"]] });
    const suki = attack({ user: [P("suki", SUKI, "user")], attackers: [["suki", "ai"]] });
    expect({ sky: tokens(sky, "Soldier"), suki: tokens(suki, "Ally") }).toEqual({ sky: { count: 1, tapped: true, defenders: ["ai"] }, suki: { count: 1, tapped: true, defenders: ["ai"] } });
  });

  it("⭐ Mardu Ascendancy: each nontoken attacker makes a Goblin attacking the player THAT creature attacks (three seats)", () => {
    const s = attack({ seats: 3, user: [P("mardu", MARDU, "user"), P("b1", BEARS, "user"), P("b2", BEARS, "user")], attackers: [["b1", "ai"], ["b2", "ai2"]] });
    const row = tokens(s, "Goblin");
    expect({ ...row, defenders: [...row.defenders].sort() }).toEqual({ count: 2, tapped: true, defenders: ["ai", "ai2"] });
  });

  it("⭐ Captain's Claws: the equipped creature attacks and a Kor Ally joins it", () => {
    const s = attack({ user: [P("claws", CLAWS, "user"), P("b1", BEARS, "user")], attackers: [["b1", "ai"]], attach: { equipId: "claws", targetId: "b1" } });
    expect(tokens(s, "Kor")).toEqual({ count: 1, tapped: true, defenders: ["ai"] });
  });

  it("⭐ Hanweir Garrison makes two Humans; control — a Grizzly Bears attacking alone makes nothing", () => {
    const g = attack({ user: [P("gar", GARRISON, "user")], attackers: [["gar", "ai"]] });
    const bears = attack({ user: [P("b1", BEARS, "user")], attackers: [["b1", "ai"]] });
    expect({ humans: tokens(g, "Human"), bearsTokens: bears.players.user.battlefield.filter((p) => p.card?.token).length })
      .toEqual({ humans: { count: 2, tapped: true, defenders: ["ai", "ai"] }, bearsTokens: 0 });
  });
});

// ── the flip-diff's other gains: the same disposition behind a payment, an intervening "if", a keyword rider, a granted trigger ──
const SWINEMASTER = {"name":"Carefree Swinemaster","type":"Creature — Gnome Ranger","mana":"{2}{G}","cmc":3,"power":"1","toughness":"4","keywords":[],"colors":["G"],"oracle":"Whenever this creature attacks, you may pay {1}{G}. If you do, create a 2/2 green Boar creature token that's tapped and attacking."}; // body-only #23743
const BLOB = {"name":"Inexorable Blob","type":"Creature — Ooze","mana":"{2}{G}","cmc":3,"power":"3","toughness":"3","keywords":["Delirium"],"colors":["G"],"oracle":"Delirium — Whenever this creature attacks, if there are four or more card types among cards in your graveyard, create a 3/3 green Ooze creature token that's tapped and attacking."}; // body-only #15761
const FALCONER = {"name":"Falconer Adept","type":"Creature — Human Soldier","mana":"{3}{W}","cmc":4,"power":"2","toughness":"3","keywords":[],"colors":["W"],"oracle":"Whenever this creature attacks, create a 1/1 white Bird creature token with flying that's tapped and attacking."}; // body-only #20819
const LAUNCH = {"name":"Launch the Fleet","type":"Sorcery","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Strive"],"colors":["W"],"oracle":"Strive — This spell costs {1} more to cast for each target beyond the first.\nUntil end of turn, any number of target creatures each gain \"Whenever this creature attacks, create a 1/1 white Soldier creature token that's tapped and attacking.\""}; // arbiter-spell #8316
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};

/** The user attacks the ai with `attackerId` on a fresh two-seat board; the attack triggers are put on the stack. */
function declared(battlefield, attackerId, { graveyard = [] } = {}) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...b.players, user: { ...b.players.user, battlefield, hand: [], graveyard }, ai: { ...b.players.ai, battlefield: [] } };
  const s = { ...b, players, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
    combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [] } };
  return flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets });
}
const resolveStack = (s) => { for (let g = 0; g < 10 && s.stack.length && !s.pendingChoice; g++) s = resolveTopOfStack(s); return s; };

describe("THE OTHER GAINS — each path run", () => {
  it("⭐ the gate sees inside a payment: \"you may pay {1}{G}. If you do, create … that's tapped and attacking\" routes on an attack, not on \"whenever you attack\"", () => {
    const effectClause = "you may pay {1}{G}. If you do, create a 2/2 green Boar creature token that's tapped and attacking";
    const d = (event, scope) => ({ event, scope, whose: "any", optional: true, interveningIf: null, effectClause });
    expect({ onAttack: triggerRoutesNatively(d("attacks", "self")), onYouAttack: triggerRoutesNatively(d("youAttack", "you")) }).toEqual({ onAttack: true, onYouAttack: false });
  });

  it("⭐ Carefree Swinemaster: paid, a Boar joins the attack; declined, nothing", () => {
    const board = () => resolveStack(declared([P("swine", SWINEMASTER, "user"), P("f1", FOREST, "user"), P("f2", FOREST, "user")], "swine"));
    const paused = board();
    expect(paused.pendingChoice?.kind).toBe("optional-mana-payment");
    const paid = resolveOptionalManaPaymentChoice(paused, true);
    const declined = resolveOptionalManaPaymentChoice(board(), false);
    expect({ paid: tokens(paid, "Boar"), declined: tokens(declined, "Boar").count }).toEqual({ paid: { count: 1, tapped: true, defenders: ["ai"] }, declined: 0 });
  });

  it("⭐ Inexorable Blob: four card types in your graveyard → an Ooze joins the attack; three → none", () => {
    const four = resolveStack(declared([P("blob", BLOB, "user")], "blob", { graveyard: [{ id: "g1", ...BEARS }, { id: "g2", ...BOLT }, { id: "g3", ...ISLAND }, { id: "g4", ...ORNITHOPTER }] }));
    const three = resolveStack(declared([P("blob", BLOB, "user")], "blob", { graveyard: [{ id: "g1", ...BEARS }, { id: "g2", ...BOLT }, { id: "g3", ...ISLAND }] }));
    expect({ four: tokens(four, "Ooze"), three: tokens(three, "Ooze").count }).toEqual({ four: { count: 1, tapped: true, defenders: ["ai"] }, three: 0 });
  });

  it("⭐ Falconer Adept: a 1/1 Bird with flying joins the attack", () => {
    const s = attack({ user: [P("fal", FALCONER, "user")], attackers: [["fal", "ai"]] });
    const birds = s.players.user.battlefield.filter((p) => p.card?.token && /Bird/.test(String(p.card?.type || "")));
    expect({ ...tokens(s, "Bird"), flying: birds.length > 0 && birds.every((b) => permanentHasKeyword(s, b.id, "Flying")) }).toEqual({ count: 1, tapped: true, defenders: ["ai"], flying: true });
  });

  it("⭐ Launch the Fleet: the creature gains the trigger until end of turn; it attacks and a Soldier joins it", () => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const spell = { id: "c-launch", ...LAUNCH };
    const players = { ...b.players, user: { ...b.players.user, battlefield: [P("b1", BEARS, "user")], hand: [spell], graveyard: [], manaPool: { ...b.players.user.manaPool, W: 1 } }, ai: { ...b.players.ai, battlefield: [] } };
    let s = { ...b, players, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0 };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-launch" && (a.targets || []).length === 1 && a.targets[0].id === "b1");
    expect(cast).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, cast));
    s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "b1", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    s = resolveStack(flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(tokens(s, "Soldier")).toEqual({ count: 1, tapped: true, defenders: ["ai"] });
  });

  it("control — Mardu Ascendancy: a TOKEN declared as an attacker makes no Goblin (the nontoken gate)", () => {
    const TOKEN = { name: "Soldier", type: "Token Creature — Soldier", power: "1", toughness: "1", colors: ["W"], oracle: "", token: true };
    const s = attack({ user: [P("mardu", MARDU, "user"), P("tok", TOKEN, "user")], attackers: [["tok", "ai"]] });
    expect(tokens(s, "Goblin").count).toBe(0);
  });
});
