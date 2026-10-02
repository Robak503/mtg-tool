/**
 * DERIVED COLOR READERS — a permanent is the color it is NOW: layer 5 applies color-changing effects (CR 613.1e; a new color
 * replaces the old ones, CR 105.3), and a double-faced permanent with its front face up has only its front face's
 * characteristics (CR 712.8d).
 *
 * THE BUG. Several battlefield readers asked the PRINTED card for a permanent's colors (card.colors, or colorsOf's mana-cost
 * fallback) instead of layers.permanentColors, so a color-changing effect was invisible to them. Measured on the unfixed engine
 * with the fixtures below, every witness through the engine's own entry points (legal action → dispatch → resolve):
 *   · the non<color> target restriction (creatureRestrictions colorNeg) offered Doom Blade a Grizzly Bears Singe had turned black
 *     and an animated Hissing Quagmire ("a 2/2 black and green Elemental creature") — illegal targets — and refused a Black Knight
 *     Cerulean Wisps had turned blue;
 *   · an activated ability's source colors (legalChoices, both the plain and the X lane) were printed: a Prodigal Sorcerer
 *     Crimson Wisps turned red could still ping Kor Firewalker (protection from red, CR 702.16b), a Wyluli Wolf turned blue could
 *     still target Thrun, Breaker of Silence (no abilities from nongreen sources), a red Cackling Witch could pump Kor Firewalker;
 *   · Natural Order's "sacrifice a green creature" (the offer AND the dispatcher's charge-time re-check) and Flare of Cultivation's
 *     alternative cost were paid by a green creature turned blue;
 *   · Faeburrow Elder counted, and tapped for, the colors its permanents PRINT (a blue Elder stayed 2/2 and made {G}{W}; an
 *     Impossible Man that had become a copy of Grizzly Bears still counted blue); Plaza of Heroes made the printed color of a
 *     legendary permanent that had changed color;
 *   · "as long as you control a blue creature" (Gearsmith Guardian, Briarberry Cohort) ignored a creature turned blue, and kept a
 *     buff after the only other blue creature turned red;
 *   · the protection-color pick (Mother of Runes) tallied the opponents' printed colors.
 * And the derive itself started a transform or modal double-faced permanent from the bundled data's EMPTY top-level colors, so
 * permanentColors read a black Graveyard Trespasser as colorless: Ascendant Evincar shrank it as "nonblack", Deathgazer destroyed
 * it at end of combat as a "nonblack" blocker, and a white Brutal Cathar could block Black Knight (protection from white).
 *
 * THE FIX. Every one of those readers reads layers.permanentColors (the board counts inside the layer system read the same seed,
 * the same copy pick and the same layer-5 applier through a recursion-free twin), and the derive's color seed is
 * permanentPrintedColors: the front face's colors for a combined transform or modal double-faced card (an Adventure card's
 * top-level colors stay its own — Lindblum is the control). The non<color> restriction keeps failing closed on a card with no
 * colors array.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01 by the fixture template; the trailing
 * comment is the generator's tier read). BRUTAL_CATHAR also carries its bundled per-face data (name / mana cost / type line /
 * colors) — the publicCard shape; the other double-faced fixtures are the enriched-deck shape, which has none.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, resolveTopOfStack } from "./gameEngine.js";
import { permanentColors, permanentIsCreature, permanentProtectionColors } from "./layers.js";
import { manaSources } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const DOOM_BLADE = {"name":"Doom Blade","type":"Instant","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Destroy target nonblack creature."}; // native-spell
const CERULEAN_WISPS = {"name":"Cerulean Wisps","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Target creature becomes blue until end of turn. Untap that creature.\nDraw a card."}; // native-spell
const CRIMSON_WISPS = {"name":"Crimson Wisps","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Target creature becomes red and gains haste until end of turn. (It can attack and {T} this turn.)\nDraw a card."}; // native-spell
const SINGE = {"name":"Singe","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Singe deals 1 damage to target creature. That creature becomes black until end of turn."}; // native-spell
const HISSING_QUAGMIRE = {"name":"Hissing Quagmire","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"This land enters tapped.\n{T}: Add {B} or {G}.\n{1}{B}{G}: Until end of turn, this land becomes a 2/2 black and green Elemental creature with deathtouch. It's still a land."}; // land
const GRAVEYARD_TRESPASSER = {"name":"Graveyard Trespasser // Graveyard Glutton","type":"Creature — Human Werewolf // Creature — Werewolf","mana":"{2}{B}","cmc":3,"power":"3","toughness":"3","keywords":["Transform","Daybound","Ward","Nightbound"],"layout":"transform","colors":[],"oracle":"Graveyard Trespasser - Creature — Human Werewolf {2}{B}\nWard—Discard a card.\nWhenever this creature enters or attacks, exile up to one target card from a graveyard. If a creature card was exiled this way, each opponent loses 1 life and you gain 1 life.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)\n//\nGraveyard Glutton - Creature — Werewolf \nWard—Discard a card.\nWhenever this creature enters or attacks, exile up to two target cards from graveyards. For each creature card exiled this way, each opponent loses 1 life and you gain 1 life.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)"}; // body-only
const DELVER = {"name":"Delver of Secrets // Insectile Aberration","type":"Creature — Human Wizard // Creature — Human Insect","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Transform"],"layout":"transform","colors":[],"oracle":"Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.\n//\nInsectile Aberration - Creature — Human Insect \nFlying"}; // body-only
const BRUTAL_CATHAR = {"name":"Brutal Cathar // Moonrage Brute","type":"Creature — Human Soldier Werewolf // Creature — Werewolf","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":["Transform","Daybound","First strike","Ward","Nightbound"],"layout":"transform","colors":[],"oracle":"Brutal Cathar - Creature — Human Soldier Werewolf {2}{W}\nWhenever this creature enters or transforms into Brutal Cathar, exile target creature an opponent controls until this creature leaves the battlefield.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)\n//\nMoonrage Brute - Creature — Werewolf \nFirst strike\nWard—Pay 3 life.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)","card_faces":[{"name":"Brutal Cathar","mana_cost":"{2}{W}","type_line":"Creature — Human Soldier Werewolf","colors":["W"]},{"name":"Moonrage Brute","mana_cost":"","type_line":"Creature — Werewolf","colors":["R"]}]}; // body-only
const KESSIG_PROWLER = {"name":"Kessig Prowler // Sinuous Predator","type":"Creature — Werewolf Horror // Creature — Eldrazi Werewolf","mana":"{G}","cmc":1,"power":"2","toughness":"1","keywords":["Transform"],"layout":"transform","colors":[],"oracle":"Kessig Prowler - Creature — Werewolf Horror {G}\n{4}{G}: Transform this creature.\n//\nSinuous Predator - Creature — Eldrazi Werewolf \nThis creature can't be blocked by more than one creature."}; // body-only
const DROWNER_OF_TRUTH = {"name":"Drowner of Truth // Drowned Jungle","type":"Creature — Eldrazi // Land","mana":"{5}{G/U}{G/U}","cmc":7,"power":"7","toughness":"6","keywords":["Devoid"],"layout":"modal_dfc","colors":[],"oracle":"Drowner of Truth - Creature — Eldrazi {5}{G/U}{G/U}\nDevoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"\n//\nDrowned Jungle - Land \nThis land enters tapped.\n{T}: Add {G} or {U}."}; // land-partial
const EVINCAR = {"name":"Ascendant Evincar","type":"Legendary Creature — Phyrexian Vampire Noble","mana":"{4}{B}{B}","cmc":6,"power":"3","toughness":"3","keywords":["Flying"],"colors":["B"],"oracle":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nOther black creatures get +1/+1.\nNonblack creatures get -1/-1."}; // native-static
const NATURAL_ORDER = {"name":"Natural Order","type":"Sorcery","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"As an additional cost to cast this spell, sacrifice a green creature.\nSearch your library for a green creature card, put it onto the battlefield, then shuffle."}; // native-spell
const FLARE_OF_CULTIVATION = {"name":"Flare of Cultivation","type":"Sorcery","mana":"{1}{G}{G}","cmc":3,"keywords":[],"colors":["G"],"oracle":"You may sacrifice a nontoken green creature rather than pay this spell's mana cost.\nSearch your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle."}; // native-spell
const FAEBURROW_ELDER = {"name":"Faeburrow Elder","type":"Creature — Treefolk Druid","mana":"{1}{G}{W}","cmc":3,"power":"0","toughness":"0","keywords":["Vigilance"],"colors":["G","W"],"oracle":"Vigilance\nThis creature gets +1/+1 for each color among permanents you control.\n{T}: For each color among permanents you control, add one mana of that color."}; // native-mana
const PLAZA_OF_HEROES = {"name":"Plaza of Heroes","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell.\n{T}: Add one mana of any color among legendary permanents you control.\n{3}, {T}, Exile this land: Target legendary creature gains hexproof and indestructible until end of turn."}; // land
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const GEARSMITH_GUARDIAN = {"name":"Gearsmith Guardian","type":"Artifact Creature — Construct","mana":"{5}","cmc":5,"power":"3","toughness":"5","keywords":[],"colors":[],"oracle":"This creature gets +2/+0 as long as you control a blue creature."}; // native-static
const BRIARBERRY_COHORT = {"name":"Briarberry Cohort","type":"Creature — Faerie Soldier","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":["Flying"],"colors":["U"],"oracle":"Flying\nThis creature gets +1/+1 as long as you control another blue creature."}; // native-static
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."}; // native-activated
const THRUN = {"name":"Thrun, Breaker of Silence","type":"Legendary Creature — Troll Shaman","mana":"{3}{G}{G}","cmc":5,"power":"5","toughness":"5","keywords":["Trample"],"colors":["G"],"oracle":"This spell can't be countered.\nTrample\nThrun can't be the target of nongreen spells your opponents control or abilities from nongreen sources your opponents control.\nDuring your turn, Thrun has indestructible."}; // native-static
const WYLULI_WOLF = {"name":"Wyluli Wolf","type":"Creature — Wolf","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Target creature gets +1/+1 until end of turn."}; // native-activated
const PRODIGAL_SORCERER = {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: This creature deals 1 damage to any target."}; // native-activated
const CACKLING_WITCH = {"name":"Cackling Witch","type":"Creature — Human Spellshaper","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"{X}{B}, {T}, Discard a card: Target creature gets +X/+0 until end of turn."}; // native-activated
const CINDER_ELEMENTAL = {"name":"Cinder Elemental","type":"Creature — Elemental","mana":"{3}{R}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"{X}{R}, {T}, Sacrifice this creature: It deals X damage to any target."}; // native-activated
const KOR_FIREWALKER = {"name":"Kor Firewalker","type":"Creature — Kor Soldier","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["W"],"oracle":"Protection from red\nWhenever a player casts a red spell, you may gain 1 life."}; // native-trigger
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["B"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)"}; // native-body
const SERRA_ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"colors":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"}; // native-body
const GRIZZLY = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const LINDBLUM = {"name":"Lindblum, Industrial Regency // Mage Siege","type":"Land — Town // Instant — Adventure","mana":"{2}{R}","cmc":0,"keywords":[],"layout":"adventure","colors":[],"oracle":"Lindblum, Industrial Regency - Land — Town \nThis land enters tapped.\n{T}: Add {R}.\n//\nMage Siege - Instant — Adventure {2}{R}\nCreate a 0/1 black Wizard creature token with \"Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.\""}; // land-partial
const DEATHGAZER = {"name":"Deathgazer","type":"Creature — Lizard","mana":"{3}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"Whenever this creature blocks or becomes blocked by a nonblack creature, destroy that creature at end of combat."}; // native-trigger
const IMPOSSIBLE_MAN = {"name":"Impossible Man","type":"Legendary Creature — Alien Shapeshifter","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying\n{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man."}; // native-activated

const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const G = (id, card) => ({ ...card, id }); // a card in a hand / library
const P = (id, ctrl, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false }), ...extra });
/** The user's precombat main phase with priority, an empty stack, a full mana pool; `hand`, `user` and `ai` boards as given. */
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...POOL }, library: [1, 2, 3].map((i) => G(`ul${i}`, GRIZZLY)) },
      ai: { ...s.players.ai, battlefield: ai, hand: [], library: [1, 2, 3].map((i) => G(`al${i}`, GRIZZLY)) } } };
}
const castActions = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const abilityActions = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const targetsOf = (actions) => [...new Set(actions.flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
/** Cast `cardId` from the user's hand through the offered action aimed at `targetId`, then resolve the stack. */
function cast(s, cardId, { targetId = null } = {}) {
  const action = castActions(s, cardId).find((a) => targetId == null || a.targets?.[0]?.id === targetId);
  if (!action) throw new Error(`no cast action offered for ${cardId}${targetId ? ` → ${targetId}` : ""}`);
  return resolveAll(dispatchAction(s, action));
}
/** Activate the user's permanent `permId` through the offered action aimed at `targetId`, then resolve the stack. */
function activate(s, permId, { targetId = null } = {}) {
  const action = abilityActions(s, permId).find((a) => targetId == null || a.targets?.[0]?.id === targetId);
  if (!action) throw new Error(`no activation offered for ${permId}${targetId ? ` → ${targetId}` : ""}`);
  return resolveAll(dispatchAction(s, action));
}
const findPerm = (s, id) => Object.values(s.players).flatMap((pl) => pl.battlefield).find((p) => p.id === id);
const pt = (s, id) => { const p = findPerm(s, id); return `${creaturePower(p, s)}/${creatureToughness(p, s)}`; };
const withPerm = (s, pid, perm) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: [...s.players[pid].battlefield, perm] } } });

describe("the non<color> target restriction reads the color an effect gave the creature (CR 613.1e)", () => {
  it("⭐ Singe turns the opponent's Grizzly Bears black: Doom Blade is offered Serra Angel only", () => {
    const s0 = board({ ai: [P("bears", "ai", GRIZZLY), P("serra", "ai", SERRA_ANGEL)], hand: [G("singe", SINGE), G("doom", DOOM_BLADE)] });
    const before = targetsOf(castActions(s0, "doom"));
    const s = cast(s0, "singe", { targetId: "bears" });
    const row = { before, bears: { colors: permanentColors(s, "bears"), damage: findPerm(s, "bears").damageMarked }, doomBlade: targetsOf(castActions(s, "doom")) };
    console.log("  WITNESS derivedColorsSingeDoomBlade", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ before: ["bears", "serra"], bears: { colors: ["B"], damage: 1 }, doomBlade: ["serra"] });
  });

  it("⭐ an animated Hissing Quagmire is a black and green Elemental creature: Doom Blade is not offered it", () => {
    const s0 = board({ user: [P("quag", "user", HISSING_QUAGMIRE)], ai: [P("bears", "ai", GRIZZLY)], hand: [G("doom", DOOM_BLADE)] });
    const before = targetsOf(castActions(s0, "doom")); // the unanimated land is no creature
    const s = activate(s0, "quag");
    const row = { before, quagmire: { creature: permanentIsCreature(s, "quag"), colors: [...permanentColors(s, "quag")].sort() }, doomBlade: targetsOf(castActions(s, "doom")) };
    console.log("  WITNESS derivedColorsQuagmireDoomBlade", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ before: ["bears"], quagmire: { creature: true, colors: ["B", "G"] }, doomBlade: ["bears"] });
  });

  it("Cerulean Wisps turns Black Knight blue: Doom Blade may now destroy it", () => {
    const s0 = board({ ai: [P("bk", "ai", BLACK_KNIGHT)], hand: [G("wisps", CERULEAN_WISPS), G("doom", DOOM_BLADE)] });
    const before = targetsOf(castActions(s0, "doom"));
    const s = cast(s0, "wisps", { targetId: "bk" });
    expect({ before, colors: permanentColors(s, "bk"), doomBlade: targetsOf(castActions(s, "doom")) }).toEqual({ before: [], colors: ["U"], doomBlade: ["bk"] });
  });
});

describe("a double-faced permanent has its front face's colors (CR 712.8d) — the seed every derived reader starts from", () => {
  it("⭐ Graveyard Trespasser is black, Delver of Secrets blue, Brutal Cathar white (its front face, not its red back), Drowner of Truth colorless (its front face's own Devoid)", () => {
    // Lindblum is the control: an Adventure card's top-level colors are its own (a land's — none), and its `mana` is its
    // Adventure half's {2}{R}, so the front-face fallback must never reach it.
    const s = board({ ai: [P("gt", "ai", GRAVEYARD_TRESPASSER), P("delver", "ai", DELVER), P("cathar", "ai", BRUTAL_CATHAR), P("drowner", "ai", DROWNER_OF_TRUTH), P("lindblum", "ai", LINDBLUM)] });
    const row = Object.fromEntries(["gt", "delver", "cathar", "drowner", "lindblum"].map((id) => [id, permanentColors(s, id)]));
    console.log("  WITNESS derivedColorsFrontFace", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ gt: ["B"], delver: ["U"], cathar: ["W"], drowner: [], lindblum: [] });
  });

  it("Doom Blade is offered Delver of Secrets and Brutal Cathar, never Graveyard Trespasser", () => {
    const s = board({ ai: [P("gt", "ai", GRAVEYARD_TRESPASSER), P("delver", "ai", DELVER), P("cathar", "ai", BRUTAL_CATHAR)], hand: [G("doom", DOOM_BLADE)] });
    expect(targetsOf(castActions(s, "doom"))).toEqual(["cathar", "delver"]);
  });

  it("⭐ Ascendant Evincar pumps the black Graveyard Trespasser and shrinks the white Brutal Cathar; under those effects Doom Blade still reaches only the Cathar", () => {
    // The Trespasser's derive takes the FULL path here (Evincar's anthem applies to it), so this also pins the front-face seed
    // on that path — the selector's own nested color read takes the fast path, which is why the P/T alone can't see it.
    const s = board({ user: [P("evincar", "user", EVINCAR)], ai: [P("gt", "ai", GRAVEYARD_TRESPASSER), P("cathar", "ai", BRUTAL_CATHAR)], hand: [G("doom", DOOM_BLADE)] });
    const row = { trespasser: pt(s, "gt"), cathar: pt(s, "cathar"), doomBlade: targetsOf(castActions(s, "doom")) };
    console.log("  WITNESS derivedColorsEvincar", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ trespasser: "4/4", cathar: "1/1", doomBlade: ["cathar"] });
  });

  it("⭐ Deathgazer (\"blocks or becomes blocked by a nonblack creature\") leaves the black Graveyard Trespasser that blocked it alive at end of combat", () => {
    let s = { ...board({ user: [P("dg", "user", DEATHGAZER)], ai: [P("gt", "ai", GRAVEYARD_TRESPASSER)] }), phase: "combat", step: "declare-attackers" };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "dg"));
    let g = 0;
    while (s.step === "declare-attackers" && g++ < 20) s = passPriority(s);
    s = dispatchAction(s, legalActionsForPlayer(s, "ai").find((a) => a.kind === "declare-blocker" && a.permanentId === "gt" && a.attackerId === "dg"));
    while (s.phase === "combat" && g++ < 120) s = passPriority(s);
    const gt = findPerm(s, "gt");
    const row = { phase: s.phase, trespasser: gt ? { damage: gt.damageMarked } : "destroyed", deathgazer: findPerm(s, "dg") ? "alive" : "dead" };
    console.log("  WITNESS derivedColorsDeathgazer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ phase: "postcombat-main", trespasser: { damage: 2 }, deathgazer: "dead" });
  });

  it("Black Knight (protection from white) attacks: the white Brutal Cathar can't block it, Graveyard Trespasser can (CR 702.16f)", () => {
    const s = board({ user: [P("cathar", "user", BRUTAL_CATHAR), P("gt", "user", GRAVEYARD_TRESPASSER)], ai: [P("bk", "ai", BLACK_KNIGHT)] });
    const c = { ...s, activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: "bk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const blockers = legalActionsForPlayer(c, "user").filter((a) => a.kind === "declare-blocker" && a.attackerId === "bk").map((a) => a.permanentId).sort();
    expect(blockers).toEqual(["gt"]);
  });
});

describe("an activated ability's source is the color it is now (CR 702.16b; Thrun's nongreen-source shield)", () => {
  it("⭐ Crimson Wisps turns Prodigal Sorcerer red: it can no longer ping Kor Firewalker (protection from red)", () => {
    const s0 = board({ user: [P("ps", "user", PRODIGAL_SORCERER)], hand: [G("crimson", CRIMSON_WISPS)] });
    const blue = targetsOf(abilityActions(withPerm(s0, "ai", P("kor", "ai", KOR_FIREWALKER)), "ps"));
    const s = withPerm(cast(s0, "crimson", { targetId: "ps" }), "ai", P("kor", "ai", KOR_FIREWALKER));
    const row = { blue, red: { colors: permanentColors(s, "ps"), targets: targetsOf(abilityActions(s, "ps")) } };
    console.log("  WITNESS derivedColorsSourceProtection", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ blue: ["ai", "kor", "ps", "user"], red: { colors: ["R"], targets: ["ai", "ps", "user"] } });
  });

  it("⭐ Cerulean Wisps turns Wyluli Wolf blue: its ability can no longer target the opponent's Thrun, Breaker of Silence", () => {
    const s0 = board({ user: [P("wolf", "user", WYLULI_WOLF)], ai: [P("thrun", "ai", THRUN), P("bears", "ai", GRIZZLY)], hand: [G("wisps", CERULEAN_WISPS)] });
    const green = targetsOf(abilityActions(s0, "wolf"));
    const s = cast(s0, "wisps", { targetId: "wolf" });
    const row = { green, blue: { colors: permanentColors(s, "wolf"), targets: targetsOf(abilityActions(s, "wolf")) } };
    console.log("  WITNESS derivedColorsThrunShield", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ green: ["bears", "thrun", "wolf"], blue: { colors: ["U"], targets: ["bears", "wolf"] } });
  });

  it("the X lane: a Cackling Witch turned red reaches Kor Firewalker at no X; a Cinder Elemental turned blue may hit it", () => {
    const w0 = board({ user: [P("witch", "user", CACKLING_WITCH)], hand: [G("crimson", CRIMSON_WISPS), G("fodder", GRIZZLY)] });
    const w = withPerm(cast(w0, "crimson", { targetId: "witch" }), "ai", P("kor", "ai", KOR_FIREWALKER));
    const c0 = board({ user: [P("cinder", "user", CINDER_ELEMENTAL)], hand: [G("wisps", CERULEAN_WISPS)] });
    const c = withPerm(cast(c0, "wisps", { targetId: "cinder" }), "ai", P("kor", "ai", KOR_FIREWALKER));
    const reachesKor = (s, id) => abilityActions(s, id).some((a) => a.targets?.[0]?.id === "kor");
    expect({
      witch: { colors: permanentColors(w, "witch"), offered: abilityActions(w, "witch").length > 0, kor: reachesKor(w, "witch") },
      cinder: { colors: permanentColors(c, "cinder"), kor: reachesKor(c, "cinder") },
    }).toEqual({ witch: { colors: ["R"], offered: true, kor: false }, cinder: { colors: ["U"], kor: true } });
  });
});

describe("color-qualified sacrifice costs read the victim's color now", () => {
  const sacVictims = (s) => castActions(s, "no").map((a) => a.sacCreatureId);
  const altVictims = (s) => castActions(s, "flare").filter((a) => a.altCost?.kind === "sacrificeCreature").map((a) => a.altCost.sacId);

  it("⭐ Natural Order: a Grizzly Bears Cerulean Wisps turned blue is not \"a green creature\"; Kessig Prowler (a green front face) is", () => {
    const s0 = board({ user: [P("bears", "user", GRIZZLY)], hand: [G("no", NATURAL_ORDER), G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "bears" });
    const k = board({ user: [P("prowler", "user", KESSIG_PROWLER)], hand: [G("no", NATURAL_ORDER)] });
    const row = { green: sacVictims(s0), blue: sacVictims(s), prowler: sacVictims(k) };
    console.log("  WITNESS derivedColorsNaturalOrder", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ green: ["bears"], blue: [], prowler: ["prowler"] });
  });

  it("the dispatcher re-validates at charge time: the Natural Order action offered while the Bears were green throws once they are blue", () => {
    const s0 = board({ user: [P("bears", "user", GRIZZLY)], hand: [G("no", NATURAL_ORDER), G("wisps", CERULEAN_WISPS)] });
    const stale = castActions(s0, "no").find((a) => a.sacCreatureId === "bears");
    const s = cast(s0, "wisps", { targetId: "bears" });
    expect(() => dispatchAction(s, stale)).toThrow(/is not the printed colour G/);
  });

  it("⭐ Flare of Cultivation's alternative cost: the Bears turned blue can't pay it; Kessig Prowler can", () => {
    const s0 = board({ user: [P("bears", "user", GRIZZLY)], hand: [G("flare", FLARE_OF_CULTIVATION), G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "bears" });
    const k = board({ user: [P("prowler", "user", KESSIG_PROWLER)], hand: [G("flare", FLARE_OF_CULTIVATION)] });
    const row = { green: altVictims(s0), blue: altVictims(s), prowler: altVictims(k) };
    console.log("  WITNESS derivedColorsFlareAltCost", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ green: ["bears"], blue: [], prowler: ["prowler"] });
  });
});

describe("colors among permanents read each permanent's color now (Faeburrow Elder's count and mana, Plaza of Heroes)", () => {
  const elderMana = (s) => manaSources(s, "user").find((src) => src.permanentId === "elder" && src.fixed)?.fixed;

  it("⭐ Cerulean Wisps turns Faeburrow Elder blue: it is 1/1 and taps for {U}, not 2/2 for {G}{W}", () => {
    const s0 = board({ user: [P("elder", "user", FAEBURROW_ELDER)], hand: [G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "elder" });
    const row = { printed: { pt: pt(s0, "elder"), mana: elderMana(s0) }, blue: { colors: permanentColors(s, "elder"), pt: pt(s, "elder"), mana: elderMana(s) } };
    console.log("  WITNESS derivedColorsFaeburrow", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ printed: { pt: "2/2", mana: { G: 1, W: 1 } }, blue: { colors: ["U"], pt: "1/1", mana: { U: 1 } } });
  });

  it("another permanent's color counts too: the Bears turned blue add a third color; a black Graveyard Trespasser adds black", () => {
    const s0 = board({ user: [P("elder", "user", FAEBURROW_ELDER), P("bears", "user", GRIZZLY)], hand: [G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "bears" });
    const t = board({ user: [P("elder", "user", FAEBURROW_ELDER), P("gt", "user", GRAVEYARD_TRESPASSER)] });
    expect({ bearsBlue: { pt: pt(s, "elder"), mana: elderMana(s) }, trespasser: { pt: pt(t, "elder"), mana: elderMana(t) } })
      .toEqual({ bearsBlue: { pt: "3/3", mana: { G: 1, W: 1, U: 1 } }, trespasser: { pt: "3/3", mana: { G: 1, W: 1, B: 1 } } });
  });

  it("a permanent that became a copy counts the copied card's colors (CR 707.2): Impossible Man copying Grizzly Bears is green, so the Elder counts two colors, not three", () => {
    const s0 = board({ user: [P("elder", "user", FAEBURROW_ELDER), P("im", "user", IMPOSSIBLE_MAN)], ai: [P("bears", "ai", GRIZZLY)] });
    const s = activate(s0, "im", { targetId: "bears" });
    expect({ printed: pt(s0, "elder"), copy: { colors: permanentColors(s, "im"), elder: pt(s, "elder"), mana: elderMana(s) } })
      .toEqual({ printed: "3/3", copy: { colors: ["G"], elder: "2/2", mana: { G: 1, W: 1 } } });
  });

  it("⭐ Plaza of Heroes makes a color the legendary permanent has now: Isamaru turned blue → {U}, not {W}", () => {
    const among = (s) => manaSources(s, "user").find((src) => src.permanentId === "plaza" && !src.extraLine)?.colors;
    const s0 = board({ user: [P("plaza", "user", PLAZA_OF_HEROES), P("isa", "user", ISAMARU)], hand: [G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "isa" });
    expect({ white: among(s0), blue: among(s) }).toEqual({ white: ["W"], blue: ["U"] });
  });
});

describe("\"as long as you control a <color> creature\" reads the creature's color now", () => {
  it("⭐ Gearsmith Guardian gets +2/+0 once Cerulean Wisps turns the Grizzly Bears blue", () => {
    const s0 = board({ user: [P("gg", "user", GEARSMITH_GUARDIAN), P("bears", "user", GRIZZLY)], hand: [G("wisps", CERULEAN_WISPS)] });
    const s = cast(s0, "wisps", { targetId: "bears" });
    expect({ green: pt(s0, "gg"), blue: pt(s, "gg") }).toEqual({ green: "3/5", blue: "5/5" });
  });

  it("⭐ two Briarberry Cohorts: Crimson Wisps turns one red — the other loses its +1/+1, the red one keeps it (\"another blue creature\")", () => {
    const s0 = board({ user: [P("c1", "user", BRIARBERRY_COHORT), P("c2", "user", BRIARBERRY_COHORT)], hand: [G("crimson", CRIMSON_WISPS)] });
    const s = cast(s0, "crimson", { targetId: "c1" });
    const row = { blue: [pt(s0, "c1"), pt(s0, "c2")], c1: { colors: permanentColors(s, "c1"), pt: pt(s, "c1") }, c2: pt(s, "c2") };
    console.log("  WITNESS derivedColorsCohorts", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ blue: ["2/2", "2/2"], c1: { colors: ["R"], pt: "2/2" }, c2: "1/1" });
  });
});

describe("the protection-color pick tallies the opponents' colors as they are now", () => {
  it("Mother of Runes: green while the opposing Bears are green; blue once Cerulean Wisps has turned both blue (two blue, one white)", () => {
    const s0 = board({ user: [P("mom", "user", MOTHER_OF_RUNES), P("mine", "user", GRIZZLY)], ai: [P("g1", "ai", GRIZZLY), P("g2", "ai", GRIZZLY), P("w1", "ai", SERRA_ANGEL)],
      hand: [G("wisps1", CERULEAN_WISPS), G("wisps2", CERULEAN_WISPS)] });
    const green = activate(s0, "mom", { targetId: "mine" });
    const s1 = cast(cast(s0, "wisps1", { targetId: "g1" }), "wisps2", { targetId: "g2" });
    const blue = activate(s1, "mom", { targetId: "mine" });
    expect({ green: [...permanentProtectionColors(green, "mine")], blue: [...permanentProtectionColors(blue, "mine")] }).toEqual({ green: ["G"], blue: ["U"] });
  });
});
