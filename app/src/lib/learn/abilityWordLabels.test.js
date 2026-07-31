/**
 * abilityWordLabels.test.js — ALLIANCE · DELIRIUM · METALCRAFT · THRESHOLD as CR 207.2c ability words.
 *
 * ⭐ ONE REGEX, 21 CARDS. These four join the ability-word strip that landfall/enrage/raid/imprint/valiant
 * already use. The label sits between the line start and "When", so the boundary-anchored trigger regex never
 * matched and the ability was INVISIBLE — the same failure imprint had (all 29 of its cards' ETBs unseen).
 *
 * ⛔ THE RULE WAS READ, NOT REMEMBERED. CR 207.2c in knowledge/mtg-judge/data/cr/cr_current.json names all
 * four explicitly and states ability words "have no special rules meaning". "corrupted" is deliberately NOT
 * added: it does not appear in 207.2c in the bundled CR, so it is not claimed.
 *
 * ⛔⛔ AND THE LOSSLESSNESS WAS CHECKED ON THE CARDS, NOT INFERRED FROM THE RULE. If a label CARRIED its
 * condition, stripping it would make the effect unconditional — a false positive. Every carrier writes the
 * condition out in its own text ("Delirium — IF THERE ARE FOUR OR MORE CARD TYPES among cards in your
 * graveyard, …"), which the conditional tests below pin: the ability must still NOT fire when its condition
 * is unmet, and the strip must not have quietly turned it into an unconditional trigger.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const SQUAD = { name: "EPF Point Squad", type: "Creature — Human Soldier", mana: "{1}{R/W}{R/W}", power: "2", toughness: "1",
  oracle: "Alliance — Whenever another creature you control enters, put a +1/+1 counter on this creature." };
const DRAKE = { name: "Lumengrid Drake", type: "Creature — Drake", mana: "{3}{U}", power: "2", toughness: "2",
  oracle: "Flying\nMetalcraft — When this creature enters, if you control three or more artifacts, return target creature to its owner's hand." };
const FEASTER = { name: "Crypt Feaster", type: "Creature — Zombie", mana: "{3}{B}", power: "3", toughness: "4",
  oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nThreshold — Whenever this creature attacks, if there are seven or more cards in your graveyard, this creature gets +2/+0 until end of turn." };
const WURM = { name: "Soul Swallower", type: "Creature — Wurm", mana: "{2}{G}{G}", power: "3", toughness: "3",
  oracle: "Trample\nDelirium — At the beginning of your upkeep, if there are four or more card types among cards in your graveyard, put three +1/+1 counters on this creature." };

describe("the label no longer hides the ability", () => {
  it("each of the four is DETECTED as a trigger", () => {
    for (const c of [SQUAD, DRAKE, FEASTER, WURM]) expect(detectTriggers(c).length, c.name).toBeGreaterThan(0);
  });

  it("and each classifies native", () => {
    for (const c of [SQUAD, DRAKE, FEASTER, WURM]) expect(classifyCard(c), c.name).toBe("native-trigger");
  });

  it("⛔ a label that is NOT in CR 207.2c is left alone", () => {
    // "corrupted" is not in the bundled 207.2c list, so its ability stays hidden — a safe false negative,
    // and the pin that stops this list growing on vibes.
    expect(detectTriggers({ name: "X", type: "Creature — Phyrexian", oracle: "Corrupted — Whenever this creature attacks, draw a card." })).toHaveLength(0);
  });

  it("a line that merely BEGINS with the word, with no dash, still parses normally", () => {
    // ⚠️ THIS TEST IS WEAKER THAN ITS FIRST DRAFT CLAIMED, AND SAYING SO IS THE POINT. It originally also
    // asserted `expect(c.oracle).toContain("Alliance of Arms")` — which reads the FIXTURE I just wrote, not
    // anything the code did. A vacuous assertion dressed as a safety check.
    //
    // The real state of things: a mutation making the em-dash OPTIONAL survives the suite. No corpus card
    // starts a line with one of these four words and no dash, so nothing distinguishes the two regexes
    // today. The dash requirement is kept because it is the narrower rule — the strip can only ever consume
    // label-then-dash — but it is UNTESTED, not proven. Recorded rather than left looking strong.
    const c = { name: "Y", type: "Creature — Human", oracle: "Alliance of Arms costs {1} less to cast.\nWhenever this creature attacks, draw a card." };
    expect(detectTriggers(c)).toHaveLength(1);
  });
});

describe("⭐⭐ RUNTIME — the trigger fires, and its CONDITION still gates it", () => {
  function board(card, { others = 0, gy = 0 } = {}) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const me = createPermanent({ id: "me", card: { id: "cme", ...card }, controller: "user" });
    me.summoningSick = false;
    const bf = [me];
    for (let i = 0; i < others; i++) bf.push(createPermanent({ id: `o${i}`, card: { id: `co${i}`, name: `Pal${i}`, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" }));
    const graveyard = [];
    const types = ["Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Creature — Bear"];
    for (let i = 0; i < gy; i++) graveyard.push({ id: `g${i}`, name: `Dead${i}`, type: types[i % types.length], oracle: "" });
    return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "me", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, graveyard } } };
  }
  const resolveAll = (s) => { let st = flushTriggers(s); for (let i = 0; i < 10 && st.stack?.length; i++) st = resolveTopOfStack(st); return st; };
  // ⚠️ LAYER-AWARE. Threshold's payoff is "+2/+0 UNTIL END OF TURN" — a layer-7c effect, not counters.
  // Reading card.power + counters (the first cut of this helper) reports 3 either way and the test looked
  // like a broken feature when the feature was fine.
  const pow = (s) => permanentPower(s, "me");

  it("Crypt Feaster's THRESHOLD pump fires with 7 cards in the graveyard", () => {
    const s = resolveAll(checkAttackTriggers(board(FEASTER, { gy: 7 })));
    expect(pow(s)).toBeGreaterThan(3);
  });

  it("⛔⛔ and does NOT fire with only 3 — the condition survived the strip", () => {
    // This is the assertion that would catch a strip which had eaten the "if there are seven or more…" gate
    // and left an unconditional pump. Classification alone cannot see that difference.
    const s = resolveAll(checkAttackTriggers(board(FEASTER, { gy: 3 })));
    expect(pow(s)).toBe(3);
  });
});

// ─── SECOND PASS (same day): the rest of the measured 207.2c list ────────────────────────────────────
const BEAR = { name: "Ulvenwald Bear", type: "Creature — Bear", mana: "{2}{G}", power: "2", toughness: "2",
  oracle: "Morbid — When this creature enters, if a creature died this turn, put two +1/+1 counters on target creature." };
const MAGE = { name: "Firemantle Mage", type: "Creature — Human Shaman Ally", mana: "{2}{R}", power: "2", toughness: "2",
  oracle: "Rally — Whenever this creature or another Ally you control enters, creatures you control gain menace until end of turn. (A creature with menace can't be blocked except by two or more creatures.)" };
const SURVIVOR = { name: "Cautious Survivor", type: "Creature — Elf Survivor", mana: "{3}{G}", power: "4", toughness: "4",
  oracle: "Survival — At the beginning of your second main phase, if this creature is tapped, you gain 2 life." };
const BOUNCER = { name: "Slaughterhouse Bouncer", type: "Creature — Ogre Warrior", mana: "{4}{B}", power: "3", toughness: "3",
  oracle: "Hellbent — When this creature dies, if you have no cards in hand, target creature gets -3/-3 until end of turn." };
const HEIR = { name: "Heir of the Wilds", type: "Creature — Human Warrior", mana: "{1}{G}", power: "2", toughness: "2",
  oracle: "Deathtouch\nFerocious — Whenever this creature attacks, if you control a creature with power 4 or greater, this creature gets +1/+1 until end of turn." };

describe("second pass — rally · morbid · ferocious · survival · hellbent", () => {
  it("each is detected and classifies native", () => {
    for (const c of [BEAR, MAGE, SURVIVOR, BOUNCER, HEIR]) {
      expect(detectTriggers(c).length, c.name).toBeGreaterThan(0);
      expect(classifyCard(c), c.name).toBe("native-trigger");
    }
  });

  it("⛔ each still carries its own gate — the label was decorative, the CONDITION is in the text", () => {
    // The whole risk of this strip is turning a gated ability into an unconditional one. Every carrier's
    // intervening-if must survive: morbid's "if a creature died this turn", hellbent's "if you have no cards
    // in hand", survival's "if this creature is tapped", ferocious's power gate.
    for (const [c, cond] of [[BEAR, /died this turn/i], [BOUNCER, /no cards in hand/i],
      [SURVIVOR, /is tapped/i], [HEIR, /power 4 or greater/i]]) {
      const t = detectTriggers(c)[0];
      expect(String(t.condition || t.interveningIf || ""), c.name).toMatch(cond);
    }
  });

  // ⚠️ THERE IS NO TEST HERE FOR "the zero-flip 207.2c labels stayed out", AND THAT IS DELIBERATE.
  // I wrote one — `detectTriggers("Battalion — Whenever this creature and at least two other creatures
  // attack, …")` expecting 0 — and the mutation that ADDS battalion to the strip SURVIVED it. The reason is
  // that battalion's trigger shape is unmodeled either way, so detection returns 0 whether the label is
  // stripped or not: the assertion cannot distinguish the two worlds and was a safety check that could not
  // fail. Removed rather than left in looking meaningful.
  //
  // The property IS still pinned, by the test in the first describe that uses "corrupted" — a word that is
  // NOT in CR 207.2c at all, sitting in front of a trigger shape the engine DOES model. That one fails the
  // moment the strip list grows to include it (verified by mutation), which is the real guard.
});

describe("⭐ the SPELL path strips the label too — and the 'instead if' family is exempt", () => {
  // The strip lived only in the TRIGGER normalizer, so a spell reading "Morbid — Destroy target creature."
  // never matched an effect matcher and parked on nothing but its label. 17 corpus spells were in that state.
  it("a spell whose label precedes its effect now parses", () => {
    expect(classifyCard({ name: "Spell Snuff", type: "Instant", mana: "{2}{U}",
      oracle: "Counter target spell.\nFateful hour — If you have 5 or less life, draw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Break of Day", type: "Instant", mana: "{1}{W}",
      oracle: "Creatures you control get +1/+1 until end of turn.\nFateful hour — If you have 5 or less life, those creatures gain indestructible until end of turn." })).toBe("native-spell");
  });

  it("⛔⛔ the 'INSTEAD IF' family keeps its label — the ENGINE reads that word as a KEY", () => {
    // ⚠️ THIS IS A REGRESSION I CAUSED AND THEN CAUGHT. Stripping unconditionally took 9 shipped cards from
    // native-spell to arbiter-spell, because matchInsteadAmountUpgrade keys on the ability WORD to look up
    // INSTEAD_ABILITY_WORD_CONDITION and require the printed condition to equal that word's canonical query
    // — a deliberate guard against mis-reading the condition. Remove the word, remove the guard's input.
    //
    // ⭐ THE LESSON: "the card writes its condition out" is NOT "nothing in the engine reads this label".
    // Card-level losslessness does not imply engine-level losslessness, and only the flip-diff's LOST column
    // said so — every test I had written still passed.
    expect(classifyCard({ name: "Brimstone Volley", type: "Instant", mana: "{1}{R}{R}",
      oracle: "Brimstone Volley deals 3 damage to any target.\nMorbid — Brimstone Volley deals 5 damage instead if a creature died this turn." })).toBe("native-spell");
    expect(classifyCard({ name: "Hunger of the Howlpack", type: "Instant", mana: "{G}",
      oracle: "Put a +1/+1 counter on target creature.\nMorbid — Put three +1/+1 counters on that creature instead if a creature died this turn." })).toBe("native-spell");
  });
});

describe("CREED — crediting the label never force-flips the rest of the card", () => {
  it("an unmodeled sibling clause still parks each of the four", () => {
    for (const c of [SQUAD, DRAKE, FEASTER, WURM]) {
      expect(classifyCard({ ...c, name: `${c.name} R`, oracle: `${c.oracle}\nEach opponent glorbulates.` }), c.name).not.toMatch(/^native/);
    }
  });
});
