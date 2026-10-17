/**
 * nonSelfThisCondition.test.js — "this turn" is not "this creature" (CR 700.7, 603.7, 603.7b).
 *
 * classifyCondition's selfRef used to be `/\bthis\b/`, so the word "this" anywhere in a trigger condition made it the
 * SOURCE's own event: "Whenever that creature attacks one of your opponents this turn" (Maeve, Insidious Singer's goad
 * rider) became an attacks/self trigger — Maeve drew a card every time SHE attacked. "this [something]" names the object
 * only when [something] is a quality of that object (CR 700.7); "this turn", "this way", "this mana" and "this combat"
 * name none. selfRef now needs a real self-noun ("this creature", "this Aura", "this spell", "this card", …) or the
 * card's own name, as before.
 *
 * A condition that stops being self-referential must not fall into a wider scope either: a trailing "this turn" with no
 * self is the stated duration of a DELAYED trigger a spell or ability creates (CR 603.7, 603.7b), and no arm models that
 * window — so it is refused, never read as a standing "a creature dies" / "a creature enters" trigger.
 *
 * The 26 cards are every card whose trigger descriptors changed, enumerated against the whole bundled corpus
 * (detectTriggers old vs new, 2026-10-16). Real oracle fixtures (bundled Scryfall, probed through cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { checkAttackTriggers, checkDiesTriggers, checkEnterTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── The misread cards (real oracle) ─────────────────────────────────────────────────────────────────────────────────────
const MAEVE = { name: "Maeve, Insidious Singer", type: "Legendary Creature — Siren", mana: "{2}{U}{U}", cmc: 4, colors: ["U"], keywords: ["Goad"], oracle: "{2}{U}: Goad target creature. Whenever that creature attacks one of your opponents this turn, you draw a card. (A goaded creature attacks each combat if able and attacks a player other than you if able, until your next turn.)", power: "3", toughness: "4" };
const WHIRLWIND = { name: "Whirlwind, Killer Cyclone", type: "Legendary Creature — Mutant Villain", mana: "{2}{R}", cmc: 3, colors: ["R"], keywords: ["Haste"], oracle: "Haste\nWhenever one or more creatures you control that entered this turn attack a player, target creature that player controls can't block this turn.", power: "2", toughness: "3" };
const SHELOB = { name: "Shelob, Child of Ungoliant", type: "Legendary Creature — Spider Demon", mana: "{4}{B}{G}", cmc: 6, colors: ["B", "G"], keywords: ["Food", "Ward", "Deathtouch"], oracle: "Deathtouch, ward {2}\nOther Spiders you control have deathtouch and ward {2}.\nWhenever another creature dealt damage this turn by a Spider you controlled dies, create a token that's a copy of that creature, except it's a Food artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life,\" and it loses all other card types.", power: "8", toughness: "8" };
const WHIPPOORWILL = { name: "Whippoorwill", type: "Creature — Bird", mana: "{G}", cmc: 1, colors: ["G"], keywords: [], oracle: "{G}{G}, {T}: Target creature can't be regenerated this turn. Damage that would be dealt to that creature this turn can't be prevented or dealt instead to another permanent or player. When the creature dies this turn, exile the creature.", power: "1", toughness: "1" };
const PHARIKAS_SPAWN = { name: "Pharika's Spawn", type: "Creature — Gorgon", mana: "{3}{B}", cmc: 4, colors: ["B"], keywords: ["Escape"], oracle: "Escape—{5}{B}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nThis creature escapes with two +1/+1 counters on it. When it enters this way, each opponent sacrifices a non-Gorgon creature of their choice.", power: "3", toughness: "4" };
const PICK_UP_THE_PACE = { name: "Pick Up the Pace", type: "Enchantment", mana: "{1}{R}", cmc: 2, colors: ["R"], keywords: [], oracle: "Whenever a creature you control that entered this turn attacks, exile the top card of your library.\nYou may play cards exiled with this enchantment as long as you attacked this turn." };
const JAYA = { name: "Jaya, Fiery Negotiator", type: "Legendary Planeswalker — Jaya", mana: "{2}{R}{R}", cmc: 4, colors: ["R"], keywords: [], oracle: "+1: Create a 1/1 red Monk creature token with prowess.\n−1: Exile the top two cards of your library. Choose one of them. You may play that card this turn.\n−2: Choose target creature an opponent controls. Whenever you attack this turn, Jaya deals damage equal to the number of attacking creatures to that creature.\n−8: You get an emblem with \"Whenever you cast a red instant or sorcery spell, copy it twice. You may choose new targets for the copies.\"" };
// the three a wider scope would have claimed — a trailing "this turn" window (CR 603.7b), never a standing trigger
const DEATH_FRENZY = { name: "Death Frenzy", type: "Sorcery", mana: "{3}{B}{G}", cmc: 5, colors: ["B", "G"], keywords: [], oracle: "All creatures get -2/-2 until end of turn. Whenever a creature dies this turn, you gain 1 life." };
const BECK_CALL = { name: "Beck // Call", type: "Sorcery // Sorcery", mana: "{G}{U} // {4}{W}{U}", cmc: 8, colors: ["G", "U", "W"], keywords: ["Fuse"], oracle: "Beck - Sorcery {G}{U}\nWhenever a creature enters this turn, you may draw a card.\nFuse (You may cast one or both halves of this card from your hand.)\n//\nCall - Sorcery {4}{W}{U}\nCreate four 1/1 white Bird creature tokens with flying.\nFuse (You may cast one or both halves of this card from your hand.)" };
const FIRST_DAY_OF_CLASS = { name: "First Day of Class", type: "Instant", mana: "{1}{R}", cmc: 2, colors: ["R"], keywords: ["Learn"], oracle: "Whenever a creature you control enters this turn, put a +1/+1 counter on it and it gains haste until end of turn.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)" };
// the delayed triggers printed on instants and sorceries
const ONDU_RISING = { name: "Ondu Rising", type: "Sorcery", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Awaken"], oracle: "Whenever a creature attacks this turn, it gains lifelink until end of turn.\nAwaken 4—{4}{W} (If you cast this spell for {4}{W}, also put four +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)" };
const GNAWING_CRESCENDO = { name: "Gnawing Crescendo", type: "Instant", mana: "{2}{R}", cmc: 3, colors: ["R"], keywords: [], oracle: "Creatures you control get +2/+0 until end of turn. Whenever a nontoken creature you control dies this turn, create a 1/1 black Rat creature token with \"This token can't block.\"" };
const SKELETONIZE = { name: "Skeletonize", type: "Instant", mana: "{4}{R}", cmc: 5, colors: ["R"], keywords: ["Regenerate"], oracle: "Skeletonize deals 3 damage to target creature. When a creature dealt damage this way dies this turn, create a 1/1 black Skeleton creature token with \"{B}: Regenerate this token.\"" };
const FIGHT_FOR_THE_THRONE = { name: "Fight for the Throne", type: "Instant", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: ["Fight"], oracle: "Put a +1/+1 counter on target creature you control. Then it fights target creature an opponent controls. When the creature an opponent controls dies this turn, if you control your commander, you become the monarch." };
const RECKLESS_BLAZE = { name: "Reckless Blaze", type: "Sorcery — Lesson", mana: "{3}{R}{R}", cmc: 5, colors: ["R"], keywords: [], oracle: "Reckless Blaze deals 5 damage to each creature. Whenever a creature you control dealt damage this way dies this turn, add {R}." };
const GRACEFUL_REPRIEVE = { name: "Graceful Reprieve", type: "Instant", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: [], oracle: "When target creature dies this turn, return that card to the battlefield under its owner's control." };
const SONG_OF_BLOOD = { name: "Song of Blood", type: "Sorcery", mana: "{1}{R}", cmc: 2, colors: ["R"], keywords: ["Mill"], oracle: "Mill four cards. Whenever a creature attacks this turn, it gets +1/+0 until end of turn for each creature card put into your graveyard this way." };
const INDULGE_EXCESS = { name: "Indulge // Excess", type: "Sorcery // Sorcery", mana: "{2}{R} // {1}{R}", cmc: 5, colors: ["R"], keywords: ["Treasure", "Aftermath"], oracle: "Indulge - Sorcery {2}{R}\nWhenever a creature you control attacks this turn, create a 1/1 green and white Citizen creature token that's tapped and attacking.\n//\nExcess - Sorcery {1}{R}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nCreate a Treasure token for each creature you controlled that dealt combat damage to a player this turn." };
const TOUCH_OF_THE_HORNED_GOD = { name: "Touch of the Horned God", type: "Sorcery", mana: "", cmc: 0, colors: [], keywords: [], oracle: "Whenever a Minotaur attacks this turn, it gains deathtouch until end of turn." };
const DESCEND_ON_THE_PREY = { name: "Descend on the Prey", type: "Sorcery", mana: "", cmc: 0, colors: [], keywords: [], oracle: "Whenever a Minotaur attacks this turn, it gains first strike until end of turn and must be blocked this turn if able." };
const TURN_INSIDE_OUT = { name: "Turn Inside Out", type: "Instant", mana: "{R}", cmc: 1, colors: ["R"], keywords: ["Manifest", "Manifest dread"], oracle: "Target creature gets +3/+0 until end of turn. When it dies this turn, manifest dread. (Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)" };
const CONSUMING_RAGE = { name: "Consuming Rage", type: "Sorcery", mana: "", cmc: 0, colors: [], keywords: [], oracle: "Whenever a Minotaur attacks this turn, it gets +2/+0 until end of turn. Destroy that creature at end of combat." };
const DEVOURING_TENDRILS = { name: "Devouring Tendrils", type: "Sorcery", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], oracle: "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control. When the permanent you don't control dies this turn, you gain 2 life." };
const GHIREDS_BELLIGERENCE = { name: "Ghired's Belligerence", type: "Sorcery", mana: "{X}{R}{R}", cmc: 2, colors: ["R"], keywords: ["Populate"], oracle: "Ghired's Belligerence deals X damage divided as you choose among any number of target creatures. Whenever a creature dealt damage this way dies this turn, populate. (Create a token that's a copy of a creature token you control.)" };
const THEORETICAL_DUPLICATION = { name: "Theoretical Duplication", type: "Instant", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Whenever a nontoken creature an opponent controls enters this turn, create a token that's a copy of that creature." };
const DESPERATE_MEASURES = { name: "Desperate Measures", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], keywords: [], oracle: "Target creature gets +1/-1 until end of turn. When it dies under your control this turn, draw two cards." };

// ── The genuine self triggers (controls — real oracle) ──────────────────────────────────────────────────────────────────
const LIBRARY_LARCENIST = { name: "Library Larcenist", type: "Creature — Merfolk Rogue", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Whenever this creature attacks, draw a card.", power: "1", toughness: "2" };
const SVYELUN = { name: "Svyelun of Sea and Sky", type: "Legendary Creature — Merfolk God", mana: "{1}{U}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Svyelun has indestructible as long as you control at least two other Merfolk.\nWhenever Svyelun attacks, draw a card.\nOther Merfolk you control have ward {1}. (Whenever another Merfolk you control becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)", power: "3", toughness: "4" };
const BOOMERANG = { name: "Boomerang, Blade Flinger", type: "Legendary Creature — Human Villain", mana: "{1}{B}", cmc: 2, colors: ["B"], keywords: [], oracle: "Whenever Boomerang attacks, he deals 1 damage to each opponent and you gain 1 life.", power: "1", toughness: "3" };
const SENGIR_VAMPIRE = { name: "Sengir Vampire", type: "Creature — Vampire", mana: "{3}{B}{B}", cmc: 5, colors: ["B"], keywords: ["Flying"], oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature.", power: "4", toughness: "4" };
const CHOKING_TETHERS = { name: "Choking Tethers", type: "Instant", mana: "{3}{U}", cmc: 4, colors: ["U"], keywords: ["Cycling"], oracle: "Tap up to four target creatures.\nCycling {1}{U} ({1}{U}, Discard this card: Draw a card.)\nWhen you cycle this card, you may tap target creature." };
const ARTISAN_OF_KOZILEK = { name: "Artisan of Kozilek", type: "Creature — Eldrazi", mana: "{9}", cmc: 9, colors: [], keywords: ["Annihilator"], oracle: "When you cast this spell, you may return target creature card from your graveyard to the battlefield.\nAnnihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)", power: "10", toughness: "9" };
const SPRINKLER = { name: "The Sprinkler of Stardust", type: "Legendary Creature — Human Warrior", mana: "{2}{R}{W}", cmc: 4, colors: ["R", "W"], keywords: [], oracle: "Whenever The Sprinkler of Stardust attacks, look at the top six cards of your library. You may put an instant or sorcery card from among them onto the battlefield tapped and attacking. It becomes a 2/2 creature with \"Whenever this deals combat damage to an opponent, cast a copy of this card.\" (The 2/2 creature stays on the battlefield.) Put the rest of the cards on the bottom of your library in a random order.", power: "4", toughness: "4" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [], oracle: "", power: "2", toughness: "2" };

const MISREAD = [MAEVE, WHIRLWIND, SHELOB, WHIPPOORWILL, PHARIKAS_SPAWN, PICK_UP_THE_PACE, JAYA, DEATH_FRENZY, BECK_CALL, FIRST_DAY_OF_CLASS,
  ONDU_RISING, GNAWING_CRESCENDO, SKELETONIZE, FIGHT_FOR_THE_THRONE, RECKLESS_BLAZE, GRACEFUL_REPRIEVE, SONG_OF_BLOOD, INDULGE_EXCESS,
  TOUCH_OF_THE_HORNED_GOD, DESCEND_ON_THE_PREY, TURN_INSIDE_OUT, CONSUMING_RAGE, DEVOURING_TENDRILS, GHIREDS_BELLIGERENCE, THEORETICAL_DUPLICATION,
  DESPERATE_MEASURES];

// ── Boards ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...over });
function board(userPerms, { aiPerms = [], library = [BEARS, BEARS] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", stack: [],
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [], battlefield: userPerms, library: library.map((c, i) => ({ ...c, id: `lib-${i}` })) },
      ai: { ...s0.players.ai, hand: [], battlefield: aiPerms, library: [{ ...BEARS, id: "ai-lib" }] } } };
}
/** `ids` attack the ai; returns the state with the attack triggers pending. */
const attackWith = (s, ...ids) => checkAttackTriggers({ ...s, combat: { attackers: ids.map((permanentId) => ({ permanentId, attackingPlayer: "user", defender: "ai" })) } });
const pending = (s) => (s.pendingTriggers || []).length;
function settle(s) {
  s = flushTriggers(s, {});
  for (let n = 0; n < 20 && (s.stack || []).length && !s.pendingChoice; n++) s = resolveTopOfStack(s);
  return s;
}

// ── Detection ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("a condition whose only \"this\" is this turn / this way names no self", () => {
  it("⭐ Maeve's goad rider is no trigger of Maeve's (it was attacks/self — a draw each time Maeve attacked)", () => {
    expect(detectTriggers(MAEVE)).toEqual([]);
    expect(isNativeTier(classifyCard(MAEVE))).toBe(false);
  });

  it("⭐ every corpus card the shortcut misread now carries no descriptor for that condition — none credited native", () => {
    expect(MISREAD.map((c) => [c.name, detectTriggers(c).map((d) => `${d.event}/${d.scope}`)]).filter(([, d]) => d.length))
      .toEqual([]);
    expect(MISREAD.filter((c) => isNativeTier(classifyCard(c))).map((c) => c.name)).toEqual([]);
  });

  it("⭐ a trailing \"this turn\" window is refused, never read as a standing trigger of a wider scope (CR 603.7b)", () => {
    // Without the window refusal these three fall through to the plain event arms: dies/eachCreature, etb/eachCreature,
    // etb/creatureYouControl — a permanent trigger on a card that only creates one for a turn.
    expect([DEATH_FRENZY, BECK_CALL, FIRST_DAY_OF_CLASS].map((c) => detectTriggers(c))).toEqual([[], [], []]);
  });

  it("…but an ordinal count bounded by \"this turn\" keeps the cast / draw ordinal reading (the arms read it as \"each turn\")", () => {
    const ordinal = (oracle) => detectTriggers({ name: "Ordinal Probe", type: "Creature — Human", oracle }).map((d) => `${d.event}/${d.whose}`);
    expect([
      ordinal("Whenever you cast your second spell this turn, draw a card."),
      ordinal("Whenever you draw your second card this turn, each opponent loses 1 life."),
      ordinal("Whenever an opponent draws their second card this turn, you gain 1 life."),
    ]).toEqual([["castSecond/any"], ["drawSecond/any"], ["drawSecond/opponent"]]);
  });
});

describe("genuine self-references are untouched (controls)", () => {
  it("\"this creature\", the first-word name, the short name: each is still the source's own attack trigger", () => {
    expect([LIBRARY_LARCENIST, SVYELUN, BOOMERANG].map((c) => detectTriggers(c).map((d) => `${d.event}/${d.scope}`)))
      .toEqual([["attacks/self"], ["attacks/self"], ["attacks/self"]]);
    expect(classifyCard(LIBRARY_LARCENIST)).toBe("native-trigger");
    expect(classifyCard(BOOMERANG)).toBe("native-trigger");
  });

  it("a real self-noun beside \"this turn\" keeps its reading (Sengir Vampire's dealt-damage-by-this-creature watcher)", () => {
    expect(detectTriggers(SENGIR_VAMPIRE).map((d) => [d.event, d.scope, !!d.requiresDamagedBySource])).toEqual([["dies", "eachCreature", true]]);
  });

  it("\"this card\" and \"this spell\" are still self-references (the cycle trigger, the cast trigger)", () => {
    expect(detectTriggers(CHOKING_TETHERS).map((d) => d.event)).toEqual(["cycleSelf"]);
    expect(detectTriggers(ARTISAN_OF_KOZILEK).some((d) => d.scope === "self" && /cast this spell/i.test(d.sourceText || ""))).toBe(true);
  });

  it("the re-worded self form with no noun — \"this\" as the event's subject — is still the source (The Sprinkler of Stardust's quoted grant)", () => {
    const granted = SPRINKLER.oracle.match(/"(Whenever this deals[^"]+)"/)[1];
    expect(detectTriggers({ name: "GroupGranted", type: "Creature", oracle: granted }).map((d) => `${d.event}/${d.scope}`)).toEqual(["combatDamageToPlayer/self"]);
  });
});

// ── Runtime ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("on a board", () => {
  it("⭐ Maeve attacking fires nothing and draws nothing", () => {
    const s = attackWith(board([P("maeve", MAEVE)]), "maeve");
    expect(pending(s)).toBe(0);
    expect(settle(s).players.user.hand.length).toBe(0);
  });

  it("⭐ Whirlwind attacking alone fires nothing (its watcher was an attacks/self trigger of its own)", () => {
    expect(pending(attackWith(board([P("ww", WHIRLWIND)]), "ww"))).toBe(0);
  });

  it("⭐ Shelob dying fires nothing (its watcher was a dies/self trigger)", () => {
    const lethal = destroyLethalCreatures(board([P("shelob", SHELOB, "user", { damageMarked: 99 })]));
    expect(lethal.dead.map((d) => d.card?.name)).toEqual(["Shelob, Child of Ungoliant"]);
    expect(pending(checkDiesTriggers(lethal.state, lethal.dead))).toBe(0);
  });

  it("⭐ Pharika's Spawn hard-cast entering fires nothing (\"when it enters this way\" was an etb/self trigger on every entry)", () => {
    const spawn = P("spawn", PHARIKAS_SPAWN, "user", { summoningSick: true });
    expect(pending(checkEnterTriggers(board([spawn]), spawn))).toBe(0);
  });

  it("CREED: a permanent printing a \"this turn\" window in an ability never gets a standing trigger from it", () => {
    // A probe permanent whose activated ability creates the window (Maeve's shape: an instruction, then the delayed
    // trigger): the creature entering beside it must not fire.
    const probe = { name: "Window Probe", type: "Creature — Human Wizard", mana: "{1}{U}", cmc: 2, colors: ["U"], keywords: [], power: "1", toughness: "1",
      oracle: "{1}{U}: Scry 1. Whenever a creature enters this turn, you draw a card." };
    expect(detectTriggers(probe)).toEqual([]);
    const other = P("bear", BEARS);
    expect(pending(checkEnterTriggers(board([P("probe", probe), other]), other))).toBe(0);
  });

  it("control: Library Larcenist and Svyelun attacking each draw a card", () => {
    const s = attackWith(board([P("larc", LIBRARY_LARCENIST), P("svy", SVYELUN)]), "larc", "svy");
    expect(pending(s)).toBe(2);
    expect(settle(s).players.user.hand.length).toBe(2);
  });

  it("control: Boomerang attacking drains 1 by its short name", () => {
    const s = attackWith(board([P("boom", BOOMERANG)]), "boom");
    expect(pending(s)).toBe(1);
    const after = settle(s);
    expect([after.players.user.life - s.players.user.life, after.players.ai.life - s.players.ai.life]).toEqual([1, -1]);
  });
});
