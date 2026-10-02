/**
 * TOKEN COLORS — a token has exactly the characteristics its creating effect defines, color included (CR 111.3); those
 * defined values are where the layer system starts for a token (CR 613.1).
 *
 * THE BUG. Every create-token mint was COLORLESS at runtime. tokenTypeLine skips a descriptor's color words when it builds
 * the type line, and applyCreateToken built the card without colors; only the per-opponent arm (Adeline, Endless Foot
 * Assault) carried a color, as a separate atom field. The amassed Army was colorless too. Measured on the unfixed engine with
 * the fixtures below: Doom Blade was offered NO token at all (the non<color> restriction reads the printed colors array and
 * fails closed on a missing one); Black Knight (protection from white) could be blocked by the white Soldiers and the
 * red-and-white Spirit; Honor of the Pure pumped none of them; Ascendant Evincar shrank the black Zombies to 1/1 as
 * "nonblack"; Ruination Guide pumped every token as "colorless".
 *
 * THE FIX. applyCreateToken reads the color words of the descriptor it already builds the type line from (tokenColorsOf), so
 * every create-token arm — whichever parser arm, rider or hook built the atom — mints its color, and a colorless token
 * carries an explicit []. The predefined tokens (CR 111.10 — Treasure, Clue, Food, the Roles…) mint through one builder that
 * stamps colors [] (every one is defined colorless); fabricate's Servos are colorless (CR 702.123a) and the amassed Army is
 * black (CR 701.47a). Token copies take the copied object's colors with its copiable values (CR 707.2), which now includes a
 * copied token's color.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-01 by the fixture template; the trailing
 * comment is the generator's tier read). Every spell is cast for real: legal action → dispatch → resolve; combat runs through
 * the declare-attacker / declare-blocker actions and passPriority.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, resolveTopOfStack } from "./gameEngine.js";
import { permanentColors } from "./layers.js";
import { applyCreateToken, tokenTypeLine } from "./effects/atoms/tokens.js";
import { applyFabricateServos } from "./fabricate.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const RAISE_ALARM = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 white Soldier creature tokens."}; // native-spell
const GISAS_BIDDING = {"name":"Gisa's Bidding","type":"Sorcery","mana":"{2}{B}{B}","cmc":4,"keywords":["Madness"],"colors":["B"],"oracle":"Create two 2/2 black Zombie creature tokens.\nMadness {2}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)"}; // native-spell
const SERVO_EXHIBITION = {"name":"Servo Exhibition","type":"Sorcery","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Create two 1/1 colorless Servo artifact creature tokens."}; // native-spell
const SPIRIT_SUMMONING = {"name":"Spirit Summoning","type":"Sorcery — Lesson","mana":"{1}{R/W}{R/W}","cmc":3,"keywords":[],"colors":["R","W"],"oracle":"Create a 3/2 red and white Spirit creature token."}; // native-spell
const INKLING_SUMMONING = {"name":"Inkling Summoning","type":"Sorcery — Lesson","mana":"{1}{W/B}{W/B}","cmc":3,"keywords":[],"colors":["B","W"],"oracle":"Create a 2/1 white and black Inkling creature token with flying."}; // native-spell
const BEAST_WITHIN = {"name":"Beast Within","type":"Instant","mana":"{2}{G}","cmc":3,"keywords":[],"colors":["G"],"oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token."}; // native-spell
const REDUCE_TO_MEMORY = {"name":"Reduce to Memory","type":"Sorcery — Lesson","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Exile target nonland permanent. Its controller creates a 3/2 red and white Spirit creature token."}; // native-spell
const CALLOUS_DISMISSAL = {"name":"Callous Dismissal","type":"Sorcery","mana":"{1}{U}","cmc":2,"keywords":["Amass"],"colors":["U"],"oracle":"Return target nonland permanent to its owner's hand.\nAmass Zombies 1. (Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)"}; // native-spell
const ANGEL_OF_INVENTION = {"name":"Angel of Invention","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"2","toughness":"1","keywords":["Flying","Lifelink","Vigilance","Fabricate"],"colors":["W"],"oracle":"Flying, vigilance, lifelink\nFabricate 2 (When this creature enters, put two +1/+1 counters on it or create two 1/1 colorless Servo artifact creature tokens.)\nOther creatures you control get +1/+1."}; // native-static
const MINISTRANT = {"name":"Ministrant of Obligation","type":"Creature — Human Cleric","mana":"{2}{W}","cmc":3,"power":"2","toughness":"1","keywords":["Afterlife"],"colors":["W"],"oracle":"Afterlife 2 (When this creature dies, create two 1/1 white and black Spirit creature tokens with flying.)"}; // native-body
const ZAXARA = {"name":"Zaxara, the Exemplary","type":"Legendary Creature — Nightmare Hydra","mana":"{1}{B}{G}{U}","cmc":4,"power":"2","toughness":"3","keywords":["Deathtouch"],"colors":["B","G","U"],"oracle":"Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it."}; // native-mixed
const BLAZE = {"name":"Blaze","type":"Sorcery","mana":"{X}{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Blaze deals X damage to any target."}; // native-spell
const STRIKE_IT_RICH = {"name":"Strike It Rich","type":"Sorcery","mana":"{R}","cmc":1,"keywords":["Treasure","Flashback"],"colors":["R"],"oracle":"Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // native-spell
const THRABEN_INSPECTOR = {"name":"Thraben Inspector","type":"Creature — Human Soldier","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":["Investigate"],"colors":["W"],"oracle":"When this creature enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"}; // native-trigger
const PEREGRIN_TOOK = {"name":"Peregrin Took","type":"Legendary Creature — Halfling Citizen","mana":"{2}{G}","cmc":3,"power":"2","toughness":"3","keywords":["Food"],"colors":["G"],"oracle":"If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card."}; // native-mixed
const ACADEMY_MANUFACTOR = {"name":"Academy Manufactor","type":"Artifact Creature — Assembly-Worker","mana":"{3}","cmc":3,"power":"1","toughness":"3","keywords":["Treasure","Food"],"colors":[],"oracle":"If you would create a Clue, Food, or Treasure token, instead create one of each."}; // native-static
const DOOM_BLADE = {"name":"Doom Blade","type":"Instant","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Destroy target nonblack creature."}; // native-spell
const BLACK_KNIGHT = {"name":"Black Knight","type":"Creature — Human Knight","mana":"{B}{B}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["B"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)"}; // native-body
const GOBLIN_OUTLANDER = {"name":"Goblin Outlander","type":"Creature — Goblin Scout","mana":"{B}{R}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["B","R"],"oracle":"Protection from white"}; // native-body
const HONOR = {"name":"Honor of the Pure","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"White creatures you control get +1/+1."}; // native-static
const EVINCAR = {"name":"Ascendant Evincar","type":"Legendary Creature — Phyrexian Vampire Noble","mana":"{4}{B}{B}","cmc":6,"power":"3","toughness":"3","keywords":["Flying"],"colors":["B"],"oracle":"Flying (This creature can't be blocked except by creatures with flying or reach.)\nOther black creatures get +1/+1.\nNonblack creatures get -1/-1."}; // native-static
const RUINATION = {"name":"Ruination Guide","type":"Creature — Eldrazi Drone","mana":"{2}{U}","cmc":3,"power":"3","toughness":"2","keywords":["Devoid","Ingest"],"colors":[],"oracle":"Devoid (This card has no color.)\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)\nOther colorless creatures you control get +1/+0."}; // native-static
const CERULEAN_WISPS = {"name":"Cerulean Wisps","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Target creature becomes blue until end of turn. Untap that creature.\nDraw a card."}; // native-spell
const GRAY_MERCHANT = {"name":"Gray Merchant of Asphodel","type":"Creature — Zombie","mana":"{3}{B}{B}","cmc":5,"power":"2","toughness":"4","keywords":[],"colors":["B"],"oracle":"When this creature enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)"}; // native-trigger
const COURSERS = {"name":"Coursers' Accord","type":"Sorcery","mana":"{4}{G}{W}","cmc":6,"keywords":["Populate"],"colors":["G","W"],"oracle":"Create a 3/3 green Centaur creature token, then populate. (Create a token that's a copy of a creature token you control.)"}; // native-spell
const CACKLING = {"name":"Cackling Counterpart","type":"Instant","mana":"{1}{U}{U}","cmc":3,"keywords":["Flashback"],"colors":["U"],"oracle":"Create a token that's a copy of target creature you control.\nFlashback {5}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // native-spell
const SECOND_HARVEST = {"name":"Second Harvest","type":"Instant","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"For each token you control, create a token that's a copy of that permanent."}; // native-spell
const SERRA_ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"colors":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"}; // native-body
const GRIZZLY = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body

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
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
/** Cast `cardId` from the user's hand through the offered action (the one aimed at `targetId`, or carrying `xValue`), then resolve the stack. */
function cast(s, cardId, { targetId = null, xValue = null } = {}) {
  const action = castActions(s, cardId).find((a) => (targetId == null || a.targets?.[0]?.id === targetId) && (xValue == null || a.xValue === xValue));
  if (!action) throw new Error(`no cast action offered for ${cardId}${targetId ? ` → ${targetId}` : ""}`);
  return resolveAll(dispatchAction(s, action));
}
/** Cast each hand card in order (each resolves before the next is cast). */
const castAll = (s, ids) => ids.reduce((st, id) => cast(st, id), s);
const tokens = (s, pid = "user") => s.players[pid].battlefield.filter((p) => p.card?.token);
const read = (s, p) => ({ name: p.card.name, type: p.card.type, card: p.card.colors, live: permanentColors(s, p.id) });
const pt = (s, p) => `${p.card.name} ${creaturePower(p, s)}/${creatureToughness(p, s)}`;
const withPerm = (s, pid, perm) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: [...s.players[pid].battlefield, perm] } } });
/** The four printed creature-token shapes, minted for real: two white Soldiers, two black Zombies, two colorless Servos, one red-and-white Spirit. */
const minted = () => castAll(board({ hand: [G("raise", RAISE_ALARM), G("gisa", GISAS_BIDDING), G("servo", SERVO_EXHIBITION), G("spirit", SPIRIT_SUMMONING), G("doom", DOOM_BLADE)] }),
  ["raise", "gisa", "servo", "spirit"]);

describe("every token-making path mints the color its effect names (CR 111.3)", () => {
  it("⭐ the parser's create-token arm: white Soldiers, black Zombies, colorless Servos (an explicit []), a red AND white Spirit — the type lines unchanged", () => {
    const s = minted();
    const row = tokens(s).map((p) => read(s, p));
    console.log("  WITNESS tokenColorsMint", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual([
      { name: "Soldier", type: "Token Creature — Soldier", card: ["W"], live: ["W"] },
      { name: "Soldier", type: "Token Creature — Soldier", card: ["W"], live: ["W"] },
      { name: "Zombie", type: "Token Creature — Zombie", card: ["B"], live: ["B"] },
      { name: "Zombie", type: "Token Creature — Zombie", card: ["B"], live: ["B"] },
      { name: "Servo", type: "Token Artifact Creature — Servo", card: [], live: [] },
      { name: "Servo", type: "Token Artifact Creature — Servo", card: [], live: [] },
      { name: "Spirit", type: "Token Creature — Spirit", card: ["R", "W"], live: ["R", "W"] },
    ]);
  });

  it("a two-color token with a keyword: Inkling Summoning's flyer is white and black", () => {
    const s = cast(board({ hand: [G("ink", INKLING_SUMMONING)] }), "ink");
    expect(tokens(s).map((p) => ({ ...read(s, p), keywords: p.card.keywords }))).toEqual([
      { name: "Inkling", type: "Token Creature — Inkling", card: ["W", "B"], live: ["W", "B"], keywords: ["Flying"] },
    ]);
  });

  it("the removal-rider arm: Beast Within's Beast is green and Reduce to Memory's Spirit red and white, each under the target's controller", () => {
    const bw = cast(board({ hand: [G("bw", BEAST_WITHIN)], ai: [P("ab", "ai", GRIZZLY)] }), "bw", { targetId: "ab" });
    const rm = cast(board({ hand: [G("rm", REDUCE_TO_MEMORY)], ai: [P("ab", "ai", GRIZZLY)] }), "rm", { targetId: "ab" });
    expect({ beast: tokens(bw, "ai").map((p) => read(bw, p)), spirit: tokens(rm, "ai").map((p) => read(rm, p)), yours: [...tokens(bw), ...tokens(rm)].length }).toEqual({
      beast: [{ name: "Beast", type: "Token Creature — Beast", card: ["G"], live: ["G"] }],
      spirit: [{ name: "Spirit", type: "Token Creature — Spirit", card: ["R", "W"], live: ["R", "W"] }],
      yours: 0,
    });
  });

  it("a keyword's synthesized trigger: Ministrant of Obligation dies to Doom Blade and its afterlife makes two white and black flying Spirits", () => {
    const s = cast(board({ hand: [G("doom", DOOM_BLADE)], ai: [P("min", "ai", MINISTRANT)] }), "doom", { targetId: "min" });
    expect(tokens(s, "ai").map((p) => ({ ...read(s, p), keywords: p.card.keywords }))).toEqual([
      { name: "Spirit", type: "Token Creature — Spirit", card: ["W", "B"], live: ["W", "B"], keywords: ["Flying"] },
      { name: "Spirit", type: "Token Creature — Spirit", card: ["W", "B"], live: ["W", "B"], keywords: ["Flying"] },
    ]);
  });

  it("the X-cast hook: casting Blaze for X=2 beside Zaxara, the Exemplary makes a green Hydra with two +1/+1 counters", () => {
    const s = cast(board({ hand: [G("blaze", BLAZE)], user: [P("zax", "user", ZAXARA)] }), "blaze", { targetId: "ai", xValue: 2 });
    expect(tokens(s).map((p) => ({ ...read(s, p), pt: pt(s, p) }))).toEqual([
      { name: "Hydra", type: "Token Creature — Hydra", card: ["G"], live: ["G"], pt: "Hydra 2/2" },
    ]);
  });

  it("amass: Callous Dismissal's Zombie Army is black (CR 701.47a — \"a 0/0 black Zombie Army creature token\")", () => {
    const s = cast(board({ hand: [G("cd", CALLOUS_DISMISSAL)], ai: [P("ab", "ai", GRIZZLY)] }), "cd", { targetId: "ab" });
    expect(tokens(s).map((p) => ({ ...read(s, p), pt: pt(s, p) }))).toEqual([
      { name: "Zombie Army", type: "Token Creature — Zombie Army", card: ["B"], live: ["B"], pt: "Zombie Army 1/1" },
    ]);
  });

  it("fabricate: the Servos are colorless (CR 702.123a) — applyFabricateServos, the branch enterPermanent runs when Servos are chosen", () => {
    const s = applyFabricateServos(board({ user: [P("aoi", "user", ANGEL_OF_INVENTION)] }), ANGEL_OF_INVENTION, "user");
    expect(tokens(s).map((p) => read(s, p))).toEqual([
      { name: "Servo", type: "Token Artifact Creature — Servo", card: [], live: [] },
      { name: "Servo", type: "Token Artifact Creature — Servo", card: [], live: [] },
    ]);
  });
});

describe("predefined tokens stay colorless (CR 111.10)", () => {
  it("Strike It Rich's Treasure and Thraben Inspector's investigate Clue carry an explicit colors []", () => {
    const s = castAll(board({ hand: [G("rich", STRIKE_IT_RICH), G("ti", THRABEN_INSPECTOR)] }), ["rich", "ti"]);
    expect(tokens(s).map((p) => read(s, p))).toEqual([
      { name: "Treasure", type: "Token Artifact — Treasure", card: [], live: [] },
      { name: "Clue", type: "Token Artifact — Clue", card: [], live: [] },
    ]);
  });

  it("the replacement extras: Peregrin Took's additional Food beside two white Soldiers, and Academy Manufactor's Clue and Food beside the Treasure, are colorless", () => {
    const took = cast(board({ hand: [G("raise", RAISE_ALARM)], user: [P("took", "user", PEREGRIN_TOOK)] }), "raise");
    const mfr = cast(board({ hand: [G("rich", STRIKE_IT_RICH)], user: [P("mfr", "user", ACADEMY_MANUFACTOR)] }), "rich");
    const colorsBy = (s) => tokens(s).map((p) => `${p.card.name}:${JSON.stringify(p.card.colors)}`).sort();
    expect({ took: colorsBy(took), manufactor: colorsBy(mfr) }).toEqual({
      took: ["Food:[]", "Soldier:[\"W\"]", "Soldier:[\"W\"]"],
      manufactor: ["Clue:[]", "Food:[]", "Treasure:[]"],
    });
  });
});

describe("the rules that read a token's color read the color its effect named", () => {
  it("⭐ Doom Blade (\"nonblack creature\") is offered the white Soldiers, the colorless Servos and the red-and-white Spirit — never the black Zombies", () => {
    const s = minted();
    const offered = [...new Set(castActions(s, "doom").map((a) => a.targets?.[0]?.id))].map((id) => tokens(s).find((p) => p.id === id)?.card.name ?? id).sort();
    console.log("  WITNESS tokenColorsDoomBlade", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["Servo", "Servo", "Soldier", "Soldier", "Spirit"]);
  });

  it("⭐ Black Knight (protection from white) attacks: the white Soldiers and the red-and-white Spirit can't block it, the Zombies and the Servos can (CR 702.16f)", () => {
    const s = minted();
    const c = { ...withPerm(s, "ai", P("bk", "ai", BLACK_KNIGHT)), activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: "bk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const blockers = legalActionsForPlayer(c, "user").filter((a) => a.kind === "declare-blocker" && a.attackerId === "bk").map((a) => a.name).sort();
    console.log("  WITNESS tokenColorsBlackKnight", JSON.stringify(blockers)); // vitest 4 needs --disable-console-intercept
    expect(blockers).toEqual(["Servo", "Servo", "Zombie", "Zombie"]);
  });

  it("⭐ protection prevents a white token's damage (CR 702.16e): Goblin Outlander blocks the attacking red-and-white Spirit, takes none of its 3 and kills it", () => {
    let s = cast(board({ hand: [G("spirit", SPIRIT_SUMMONING)], ai: [P("gob", "ai", GOBLIN_OUTLANDER)] }), "spirit");
    const spiritId = tokens(s)[0].id;
    // The next combat: the Spirit has been under the user's control since the turn began (no summoning sickness).
    s = { ...s, phase: "combat", step: "declare-attackers", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === spiritId ? { ...p, summoningSick: false } : p)) } } };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === spiritId));
    let g = 0;
    while (s.step === "declare-attackers" && g++ < 20) s = passPriority(s);
    s = dispatchAction(s, legalActionsForPlayer(s, "ai").find((a) => a.kind === "declare-blocker" && a.permanentId === "gob" && a.attackerId === spiritId));
    while (s.step !== "end-of-combat" && g++ < 80) s = passPriority(s);
    const gob = s.players.ai.battlefield.find((p) => p.id === "gob");
    const row = { outlander: gob ? { damage: gob.damageMarked } : "dead", spirit: tokens(s).length, aiLife: s.players.ai.life };
    console.log("  WITNESS tokenColorsProtectionDamage", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ outlander: { damage: 0 }, spirit: 0, aiLife: 40 }); // blocked: no damage reaches the player (life 40 at start)
  });

  it("⭐ the color anthems: Honor of the Pure pumps exactly the white tokens; Ascendant Evincar pumps the black Zombies and shrinks every nonblack token; Ruination Guide pumps only the colorless Servos", () => {
    const s = minted();
    const under = (card) => { const t = withPerm(s, "user", P("lord", "user", card)); return tokens(t).map((p) => pt(t, p)); };
    const row = { honor: under(HONOR), evincar: under(EVINCAR), ruination: under(RUINATION) };
    console.log("  WITNESS tokenColorsAnthems", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      honor: ["Soldier 2/2", "Soldier 2/2", "Zombie 2/2", "Zombie 2/2", "Servo 1/1", "Servo 1/1", "Spirit 4/3"],
      evincar: ["Soldier 0/0", "Soldier 0/0", "Zombie 3/3", "Zombie 3/3", "Servo 0/0", "Servo 0/0", "Spirit 2/1"],
      ruination: ["Soldier 1/1", "Soldier 1/1", "Zombie 2/2", "Zombie 2/2", "Servo 2/1", "Servo 2/1", "Spirit 3/2"],
    });
  });

  it("layer 5 applies on top of the token's color: Cerulean Wisps turns a white Soldier blue — Honor of the Pure stops pumping it and it may block Black Knight", () => {
    const s0 = cast(board({ hand: [G("raise", RAISE_ALARM), G("wisps", CERULEAN_WISPS)], user: [P("honor", "user", HONOR)] }), "raise");
    const [blue, white] = tokens(s0).map((p) => p.id);
    const s = cast(s0, "wisps", { targetId: blue });
    const c = { ...withPerm(s, "ai", P("bk", "ai", BLACK_KNIGHT)), activePlayer: "ai", priorityHolder: "user", phase: "combat", step: "declare-blockers",
      combat: { attackers: [{ permanentId: "bk", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const byId = (id) => tokens(s).find((p) => p.id === id);
    const canBlock = legalActionsForPlayer(c, "user").filter((a) => a.kind === "declare-blocker" && a.attackerId === "bk").map((a) => a.permanentId);
    expect({ colors: [permanentColors(s, blue), permanentColors(s, white)], printed: byId(blue).card.colors, pt: [pt(s, byId(blue)), pt(s, byId(white))], canBlock })
      .toEqual({ colors: [["U"], ["W"]], printed: ["W"], pt: ["Soldier 1/1", "Soldier 2/2"], canBlock: [blue] });
  });

  it("devotion counts mana symbols only (CR 700.5): beside two black Zombie tokens, Gray Merchant of Asphodel drains for its own {B}{B} — 2", () => {
    const s0 = cast(board({ hand: [G("gisa", GISAS_BIDDING), G("gary", GRAY_MERCHANT)] }), "gisa");
    const s = cast(s0, "gary");
    expect({ zombies: tokens(s).map((p) => p.card.colors), lives: [s.players.user.life, s.players.ai.life] })
      .toEqual({ zombies: [["B"], ["B"]], lives: [42, 38] }); // from 40 each
  });
});

describe("token copies keep the original's colors (CR 707.2)", () => {
  it("⭐ populate: Coursers' Accord's Centaur and its populated copy are both green", () => {
    const s = cast(board({ hand: [G("ca", COURSERS)] }), "ca");
    expect(tokens(s).map((p) => read(s, p))).toEqual([
      { name: "Centaur", type: "Token Creature — Centaur", card: ["G"], live: ["G"] },
      { name: "Centaur", type: "Token Creature — Centaur", card: ["G"], live: ["G"] },
    ]);
  });

  it("Second Harvest copies a white Soldier and a black Zombie: each copy is its original's color", () => {
    const s = castAll(board({ hand: [G("raise", RAISE_ALARM), G("gisa", GISAS_BIDDING), G("sh", SECOND_HARVEST)] }), ["raise", "gisa", "sh"]);
    const colorsBy = tokens(s).map((p) => `${p.card.name}:${permanentColors(s, p.id).join("")}`).sort();
    expect(colorsBy).toEqual(["Soldier:W", "Soldier:W", "Soldier:W", "Soldier:W", "Zombie:B", "Zombie:B", "Zombie:B", "Zombie:B"]);
  });

  it("Cackling Counterpart on Serra Angel: the token copy is white (a nontoken original's printed colors)", () => {
    const s = cast(board({ hand: [G("cc", CACKLING)], user: [P("serra", "user", SERRA_ANGEL)] }), "cc", { targetId: "serra" });
    expect(tokens(s).map((p) => read(s, p))).toEqual([{ name: "Serra Angel", type: "Creature — Angel", card: ["W"], live: ["W"] }]);
  });
});

describe("the color reader", () => {
  it("SYNTHETIC (no printed descriptor is cased or spaced this way) — it tokenizes as tokenTypeLine does, so a word the type line skips as a color word always colors the token", () => {
    const s = applyCreateToken(board(), { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "White\tSoldier" }, { controller: "user" });
    expect({ typeLine: tokenTypeLine("White\tSoldier").type, colors: tokens(s).map((p) => p.card.colors) })
      .toEqual({ typeLine: "Token Creature — Soldier", colors: [["W"]] });
  });
});
