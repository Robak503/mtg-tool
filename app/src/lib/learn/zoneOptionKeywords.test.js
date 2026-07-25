/**
 * zoneOptionKeywords.test.js — the ZONE-OPTION / OPTIONAL-COST keyword family (census slice,
 * 2026-07-24): evoke · unearth · disturb · embalm · scavenge · mayhem · dredge N · kicker /
 * multikicker / offspring · improvise · typecycling. All credited on the blessed
 * ninjutsu/flashback/madness test — an OPTIONAL entry/payment/zone-option with no engine lane;
 * the hard-cast resolves the card byte-identically to its printed self (safe FN, never an FP).
 *
 * Slice evidence: 144 flips, zero down, whole-corpus fingerprint audited mechanically (every
 * flipped card carries a family line — 72 gy-zone / 41 typecycling / 12 addl-cost / 10 improvise /
 * 4 dredge / 5 comma-joined double-typecycling). Oracle text below pulled live from the bundled
 * index before hardcoding (CLAUDE.md §1.2), fixtures hardcoded per CI convention.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const C = (name, type, oracle, mana = "{2}{G}") => ({ name, type, oracle, mana, keywords: [] });

describe("zone-option / optional-cost keywords — real carriers flip (one per family branch)", () => {
  const CASES = [
    ["Walker of the Grove", "Creature — Elemental",
      "When this creature leaves the battlefield, create a 4/4 green Elemental creature token.\nEvoke {4}{G}",
      "evoke — alt cost; the sac applies only to an evoked cast; LTB token trigger already modeled"],
    ["Dregscape Zombie", "Creature — Zombie",
      "Unearth {B} ({B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)",
      "unearth — the census's #1 sole-blocker shape; GY-activated option, inert on the battlefield"],
    ["Aven Initiate", "Creature — Bird Warrior",
      "Flying\nEmbalm {6}{U} ({6}{U}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Bird Warrior with no mana cost. Embalm only as a sorcery.)",
      "embalm — GY token-cast option"],
    ["Deadbridge Goliath", "Creature — Insect",
      "Scavenge {4}{G}{G} ({4}{G}{G}, Exile this card from your graveyard: Put a number of +1/+1 counters equal to this card's power on target creature. Scavenge only as a sorcery.)",
      "scavenge — GY counters option"],
    ["Drudge Beetle", "Creature — Insect",
      "Dredge 2 (If you would draw a card, you may mill two cards instead. If you do, return this card from your graveyard to your hand.)",
      "dredge — a draw-replacement OPTION from the GY; never offered → every draw stays normal"],
    ["Skarrgan Pit-Skulk", "Creature — Human Warrior",
      "Bloodthirst 1 (If an opponent was dealt damage this turn, this creature enters with a +1/+1 counter on it.)\nCreatures with power less than this creature's power can't block it.",
      "NEGATIVE CONTROL — bloodthirst is deliberately NOT in this family (a real ETB state change, not an option); stays parked",
      "body-only"],
    ["Enraged Giant", "Creature — Giant",
      "Improvise (Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)\nHaste",
      "improvise — convoke's artifact twin, pure cost-reduction"],
    ["Hill Gigas", "Creature — Giant",
      "Mountaincycling {2} ({2}, Discard this card: Search your library for a Mountain card, reveal it, put it into your hand, then shuffle.)",
      "typecycling — the hand-only discard option, cycling's own precedent"],
    ["Igneous Pouncer", "Creature — Elemental",
      "Haste\nSwampcycling {2}, mountaincycling {2} ({2}, Discard this card: Search your library for a Swamp or Mountain card, reveal it, put it into your hand, then shuffle.)",
      "comma-joined DOUBLE typecycling — the clause split credits each half independently"],
    ["Rust-Shield Rampager", "Creature — Crocodile",
      "Offspring {1} (You may pay an additional {1} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)",
      "offspring — optional additional cost; unpaid = the printed base creature"],
    ["Proven Combatant", "Creature — Human Warrior",
      "Eternalize {4}{U}{U} ({4}{U}{U}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a 4/4 black Zombie Human Warrior with no mana cost. Eternalize only as a sorcery.)",
      "eternalize — embalm's twin (added 2026-07-25 with the castability audit the first pass deferred)"],
    ["Burrenton Bombardier", "Creature — Kithkin Soldier",
      "Flying\nReinforce 1—{1}{W} ({1}{W}, Discard this card: Put a +1/+1 counter on target creature.)",
      "reinforce — a hand-only discard-activated option, the cycling class"],
  ];
  for (const [name, type, oracle, why, expected] of CASES) {
    it(`${name} — ${why}`, () => {
      const tier = classifyCard(C(name, type, oracle));
      if (expected) expect(tier).toBe(expected);
      else expect(tier).toMatch(/^native/);
    });
  }
});

/**
 * SPELL-SIDE SIBLINGS (census slice 2, 2026-07-24/25) — the same class on instants/sorceries, credited
 * through the parser's strip families instead of isKeywordOnly: CAST_KEYWORD_LINE gains buyback /
 * entwine / conspire / mayhem (joining spectacle/prowl/surge/overload — each changes resolution ONLY
 * when its optional cost was paid, and the engine never pays it), COST_ONLY_KEYWORD_LINE gains
 * improvise (convoke's twin). 37 flips, zero down, all 37 mechanically attributed to a family line
 * (13 buyback · 12 entwine · 6 conspire · 4 improvise · 2 mayhem).
 */
describe("spell-side siblings — real carriers flip", () => {
  const S = (name, oracle, mana = "{1}{U}") => ({ name, type: "Instant", oracle, mana, keywords: [] });
  it("buyback — Capsize (the printed bounce is the whole normal cast)", () => {
    expect(classifyCard(S("Capsize", "Buyback {3} (You may pay an additional {3} as you cast this spell. If you do, put this card into your hand as it resolves.)\nReturn target permanent to its owner's hand.", "{1}{U}{U}"))).toBe("native-spell");
  });
  it("entwine — Rain of Rust (normal cast is the printed choose-one; the modal engine already owns it)", () => {
    expect(classifyCard(S("Rain of Rust", "Choose one —\n• Destroy target artifact.\n• Destroy target land.\nEntwine {2} (Choose both if you pay the entwine cost.)", "{3}{R}"))).toBe("native-spell");
  });
  it("conspire — Ghastly Discovery (bare keyword after reminder-strip; copy only if the cost was paid)", () => {
    expect(classifyCard(S("Ghastly Discovery", "Draw a card, then discard a card.\nConspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it.)", "{1}{B}"))).toBe("native-spell");
  });
  it("improvise on a SPELL — Reverse Engineer (cost-reduction only, convoke's basis)", () => {
    expect(classifyCard(S("Reverse Engineer", "Improvise (Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)\nDraw three cards.", "{3}{U}{U}"))).toBe("native-spell");
  });
  it("CREED: a spell whose OTHER clause is unmodeled still parks (the cost credit can't carry it)", () => {
    // Spell Burst's X-scaled counter + Whir of Invention's X-tutor: real unmodeled bodies, both stay Arbiter.
    expect(classifyCard(S("Spell Burst", "Counter target spell with mana value X.\nBuyback {3}", "{X}{U}"))).not.toMatch(/^native/);
  });
});

describe("CREED guards — what this family deliberately does NOT credit", () => {
  it("a kicked-CONDITIONAL body clause still parks the whole card (the cost line credit can't force-flip it)", () => {
    // Skizzik: the kicker COST line is credited, but "sacrifice it unless it was kicked" is a separate,
    // unmodeled end-step conditional — whole-card law holds.
    const skizzik = C("Skizzik", "Creature — Elemental",
      "Trample, haste\nKicker {R} (You may pay an additional {R} as you cast this spell.)\nAt the beginning of the end step, sacrifice this creature unless it was kicked.", "{3}{R}");
    expect(classifyCard(skizzik)).toBe("body-only");
  });
  it("the castability audit that separates eternalize/reinforce from suspend (the rule, pinned)", () => {
    // Both eternalize and reinforce have exactly one no-mana-cost carrier, and BOTH are LANDS — played,
    // not cast, so fully playable; the keyword is a pure extra option. That is why they are credited and
    // suspend is not: suspend's no-cost carriers (Lotus Bloom) cannot be PLAYED at all without it.
    expect(classifyCard(C("Lazotep Archway", "Land",
      "Lazotep Archway enters the battlefield tapped.\n{T}: Add {W} or {B}.\nEternalize {3}{W}{B}", ""))).toMatch(/^(native|land)/);
  });
  it("SUSPEND is deliberately EXCLUDED — a no-mana-cost suspend card cannot be hard-cast at all", () => {
    // Lotus Bloom: crediting suspend would mark a card native that the engine literally cannot play.
    const bloom = C("Lotus Bloom", "Artifact",
      "Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color.", "");
    expect(classifyCard(bloom)).not.toMatch(/^native/);
  });
  it("a keyword-REFERENCING static never matches the anchored cost shapes", () => {
    // "kicker" mid-sentence / a cost-reducer static — the ^…$ anchors reject anything past the bare cost line.
    const reducer = C("Hypothetical Reducer", "Enchantment",
      "Kicker costs you pay cost {1} less.");
    expect(classifyCard(reducer)).toBe("body-only");
  });
});

/**
 * SELF-BOUNCE NOUN WIDENING (census slice 5, 2026-07-25) — "return this <noun> to its owner's hand".
 * The self-target bounce atom bounces the SOURCE, so the noun is pure templating; the alternation just
 * said creature|permanent. Widening it to aura/enchantment/artifact/equipment/land flipped 22 cards
 * (Shackles & the Aura cycle, the Trials cycle, the Dragonstorm cycle, Batterskull) with zero new
 * runtime code — the atom, resolver and bounce path already handled every one.
 */
describe("self-bounce noun widening — the source bounces regardless of its printed noun", () => {
  const B = (name, type, oracle, mana) => ({ name, type, oracle, mana, keywords: [] });
  it("Aura wording flips (Shackles / Cage of Hands / Mourning)", () => {
    expect(classifyCard(B("Shackles", "Enchantment — Aura",
      "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\n{W}: Return this Aura to its owner's hand.", "{W}"))).toMatch(/^native/);
  });
  it("Equipment wording flips (Batterskull's living-weapon body)", () => {
    expect(classifyCard(B("Batterskull", "Artifact — Equipment",
      "Living weapon\nEquipped creature gets +4/+4 and has vigilance and lifelink.\nEquip {5}\n{3}: Return this Equipment to its owner's hand.", "{5}"))).toMatch(/^native/);
  });
  it("the pre-existing creature/permanent wordings still parse identically (no regression)", () => {
    expect(classifyCard(B("SelfBouncer", "Creature — Spirit",
      "Flying\n{2}: Return this creature to its owner's hand.", "{1}{U}"))).toMatch(/^native/);
  });
});
