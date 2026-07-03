/**
 * Tests for manaModel.js — mana production, available sources, and payment
 * planning. This is the module that makes the learn engine castable; before
 * it, manaPool was never filled and nothing was ever castable.
 */

import { describe, expect, it } from "vitest";
import { manaProduction, manaSources, canAfford, planPayment, _internals } from "./manaModel.js";
import { parseManaCost } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

function lib(card) {
  return { id: card.id || `c-${card.name}`, ...card };
}

function bf(perms) {
  return { players: { user: { battlefield: perms } } };
}

function permanent(card, { id, tapped = false, summoningSick = false } = {}) {
  return { id: id || `perm-${card.name}`, card: lib(card), tapped, summoningSick };
}

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

// ─── manaProduction ──────────────────────────────────────────────────────────

describe("manaProduction", () => {
  it("reads basic lands by name", () => {
    expect(manaProduction({ name: "Forest", type: "Basic Land — Forest" })).toEqual({ colors: ["G"], amount: 1 });
    expect(manaProduction({ name: "Island", type: "Basic Land — Island" })).toEqual({ colors: ["U"], amount: 1 });
    expect(manaProduction({ name: "Wastes", type: "Basic Land" })).toEqual({ colors: ["C"], amount: 1 });
  });

  it("strips the Snow-Covered prefix", () => {
    expect(manaProduction({ name: "Snow-Covered Mountain", type: "Basic Snow Land — Mountain" }))
      .toEqual({ colors: ["R"], amount: 1 });
  });

  it("knows iconic rocks that produce more than one mana", () => {
    expect(manaProduction({ name: "Sol Ring", type: "Artifact" })).toEqual({ colors: ["C"], amount: 2 });
    expect(manaProduction({ name: "Mana Crypt", type: "Artifact" })).toEqual({ colors: ["C"], amount: 2 });
  });

  it("parses a single-color Add clause from oracle text", () => {
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }))
      .toEqual({ colors: ["G"], amount: 1, requiresTap: true });
  });

  it("treats 'or' in an Add clause as a color choice (amount 1)", () => {
    expect(manaProduction({ name: "Azorius Guildgate", type: "Land — Gate", oracle: "{T}: Add {W} or {U}." }))
      .toEqual({ colors: ["W", "U"], amount: 1, requiresTap: true });
  });

  it("treats concatenated same-color symbols as amount = count", () => {
    expect(manaProduction({ name: "Worn Powerstone", type: "Artifact", oracle: "{T}: Add {C}{C}." }))
      .toEqual({ colors: ["C"], amount: 2, requiresTap: true });
  });

  it("reads 'any color' as all five colors", () => {
    expect(manaProduction({ name: "Command Tower", type: "Land", oracle: "{T}: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: true });
  });

  // ===== TOKENS ===== T2 — a one-shot sacrifice-for-mana source (Treasure / Gold / Lotus Petal) is
  // flagged `sacrifices:true` so the commit path cracks it instead of tapping it (can't ramp forever).
  // `requiresTap` mirrors whether the COST has {T} (summoning sickness gates a {T} mana ability, not a
  // pure sac-for-mana one — the Eldrazi Spawn / Gold case).
  it("flags a sacrifice-for-mana source (Treasure: {T}, Sac) as one-shot", () => {
    expect(manaProduction({ name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: true });
  });
  it("flags a no-tap sacrifice-for-mana source (Gold: Sac, no {T}) — usable while summoning sick", () => {
    expect(manaProduction({ name: "Gold", type: "Token Artifact — Gold", oracle: "Sacrifice this artifact: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: false });
  });
  it("does NOT flag a repeatable rock/dork as sacrifice-for-mana", () => {
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }))
      .toEqual({ colors: ["G"], amount: 1, requiresTap: true }); // no `sacrifices` key
    expect(manaProduction({ name: "Worn Powerstone", type: "Artifact", oracle: "{T}: Add {C}{C}." }))
      .toEqual({ colors: ["C"], amount: 2, requiresTap: true });
  });

  it("returns null for a non-mana permanent", () => {
    expect(manaProduction({ name: "Grizzly Bears", type: "Creature — Bear", oracle: "" })).toBeNull();
    expect(manaProduction({ name: "Oblivion Ring", type: "Enchantment", oracle: "Add a +1/+1 counter? no." })).toBeNull();
  });

  it("falls back to colorless for an unparseable land", () => {
    expect(manaProduction({ name: "Mysterious Nonbasic", type: "Land", oracle: "" }))
      .toEqual({ colors: ["C"], amount: 1 });
  });

  // Reminder text is read TYPE-AWARELY (CR 207.2). A LAND keeps its reminder-text ability (dual lands
  // print it AS reminder); a NON-LAND's reminder "Add … mana" describes a token/keyword, not its ability.
  it("KEEPS a dual land's reminder-text mana ability (Tundra prints it as reminder)", () => {
    expect(manaProduction({ name: "Tundra", type: "Land — Plains Island", oracle: "({T}: Add {W} or {U}.)" }))
      .toEqual({ colors: ["W", "U"], amount: 1, requiresTap: true });
    expect(manaProduction({ name: "Savai Triome", type: "Land — Mountain Plains Swamp", oracle: "({T}: Add {R}, {W}, or {B}.)\nThis land enters tapped." }))
      .toEqual({ colors: ["R", "W", "B"], amount: 1, requiresTap: true });
  });
  it("does NOT read a NON-LAND's reminder-text 'Add mana' (token-maker / firebending) as its own ability", () => {
    // Brazen Freebooter: the "Add one mana of any color" is the reminder describing the Treasure it makes.
    expect(manaProduction({ name: "Brazen Freebooter", type: "Creature — Human Pirate", oracle: "When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" })).toBeNull();
    // Firebending: combat mana in the keyword's reminder, not a tap ability.
    expect(manaProduction({ name: "Fire Sages", type: "Creature — Human Cleric", oracle: "Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\n{1}{R}{R}: Put a +1/+1 counter on this creature." })).toBeNull();
  });
  it("still reads a real rock/dork whose ability is in MAIN text", () => {
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." })).toEqual({ colors: ["G"], amount: 1, requiresTap: true });
  });
  // ===== PHANTOM-SOURCE GUARD ===== a NON-LAND repeatable source must have an ACTIVATED mana ability
  // ("<cost>: Add …"). A TRIGGERED / ETB / landfall / death / spell-effect "Add …" (no colon) is a one-shot,
  // NOT a standing source — reading it minted a phantom source the sim tapped every turn for free (the
  // Hidden Herbalists P1 FP). Confirmed pre-existing; the gate removed ~129 phantom sources, 0 real ones.
  it("does NOT read a TRIGGERED / ETB / spell 'Add mana' (no activated ability) as a standing source", () => {
    expect(manaProduction({ name: "Hidden Herbalists", type: "Creature — Human Druid", oracle: "Revolt — When this creature enters, if a permanent left the battlefield under your control this turn, add {G}{G}." })).toBeNull();
    expect(manaProduction({ name: "Mardu Warshrieker", type: "Creature — Orc Shaman", oracle: "Raid — When this creature enters, if you attacked this turn, add {R}{W}{B}." })).toBeNull();
    expect(manaProduction({ name: "Lotus Cobra", type: "Creature — Snake", oracle: "Landfall — Whenever a land you control enters, add one mana of any color." })).toBeNull();
    expect(manaProduction({ name: "Dark Ritual", type: "Instant", oracle: "Add {B}{B}{B}." })).toBeNull();
    // …but a real {T}: dork on the SAME shape is still a source, and it never reaches manaSources as phantom.
    const hh = permanent({ name: "Hidden Herbalists", type: "Creature — Human Druid", oracle: "Revolt — When this creature enters, if a permanent left the battlefield under your control this turn, add {G}{G}." }, { id: "hh" });
    expect(manaSources(bf([hh]), "user")).toEqual([]); // not offered as a standing source
  });

  // ===== PHANTOM-SOURCE GUARD 2 (consumable cost) ===== a NON-LAND activated "Add …" whose cost is a
  // CONSUMABLE / non-repeatable resource the sim CAN'T spend — a non-self sacrifice, pay-life, discard,
  // remove-counter, exile, tap-OTHER, return-to-hand — is NOT a free, tapless, repeatable standing source.
  // Reading it minted PHANTOM mana the self-play sim "paid" every turn for free (task_cda672bc, coverage r4).
  // Full-corpus audit: 58 phantom sources removed, 0 genuine {T}: dorks / {mana}: filters dropped, 0 classify
  // change (classifyCard never calls manaProduction — this is the sim's runtime mana only).
  it("does NOT read a SACRIFICE-cost (non-self) 'Add' as a standing source — Utopia Mycon / Ashnod's Altar", () => {
    // Utopia Mycon: "Sacrifice a Saproling: Add …" — sacrifices something ELSE, so it's NOT the self-sac
    // Treasure case (no `sacrifices` flag, requiresTap:false). The sim doesn't sac a Saproling → phantom mana.
    expect(manaProduction({ name: "Utopia Mycon", type: "Creature — Fungus", oracle: "At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.\nSacrifice a Saproling: Add one mana of any color." })).toBeNull();
    expect(manaProduction({ name: "Ashnod's Altar", type: "Artifact", oracle: "Sacrifice a creature: Add {C}{C}." })).toBeNull();
    expect(manaProduction({ name: "Krark-Clan Ironworks", type: "Artifact", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBeNull();
    // …and it isn't offered as a standing tappable source either (the runtime path, not just manaProduction).
    const um = permanent({ name: "Utopia Mycon", type: "Creature — Fungus", oracle: "Sacrifice a Saproling: Add one mana of any color." }, { id: "um" });
    expect(manaSources(bf([um]), "user")).toEqual([]);
  });
  it("does NOT read a PAY-LIFE / DISCARD / REMOVE-COUNTER cost 'Add' as a standing source", () => {
    expect(manaProduction({ name: "Treasonous Ogre", type: "Creature — Ogre Shaman", oracle: "Pay 3 life: Add {R}." })).toBeNull();
    expect(manaProduction({ name: "Skirge Familiar", type: "Creature — Phyrexian Imp", oracle: "Flying\nDiscard a card: Add {B}." })).toBeNull();
    // Remove-counter: a FINITE counter pool the sim would mistreat as infinite free mana.
    expect(manaProduction({ name: "Cryptic Trilobite", type: "Creature — Trilobite", oracle: "This creature enters with X +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: Add {C}{C}. Spend this mana only to activate abilities.\n{1}, {T}: Put a +1/+1 counter on this creature." })).toBeNull();
  });
  it("STILL reads a pure-mana {N}: filter and a real {T}: dork (consumable gate must not touch them)", () => {
    // A mana FILTER (pure mana cost, no {T}) is payable from the pool — kept exactly as before.
    expect(manaProduction({ name: "Prismite", type: "Artifact Creature — Golem", oracle: "{2}: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: false });
    expect(manaProduction({ name: "Bog Initiate", type: "Creature — Human Wizard", oracle: "{1}: Add {B}." }))
      .toEqual({ colors: ["B"], amount: 1, requiresTap: false });
    // A real {T}: dork is untouched (requiresTap:true, no `sacrifices`).
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }))
      .toEqual({ colors: ["G"], amount: 1, requiresTap: true });
    // Self-sac one-shot (Treasure) is unchanged — flagged sacrifices, cracked on use (not gated).
    expect(manaProduction({ name: "Gold", type: "Token Artifact — Gold", oracle: "Sacrifice this artifact: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true, requiresTap: false });
    // "Put a -0/-1 counter" (Wall of Roots) is NOT "remove a counter" — a real once-per-turn dork, kept.
    expect(manaProduction({ name: "Wall of Roots", type: "Creature — Plant Wall", oracle: "Defender\nPut a -0/-1 counter on this creature: Add {G}. Activate only once each turn." }))
      .toEqual({ colors: ["G"], amount: 1, requiresTap: false });
  });
  it("KEEPS the real {T}: line on a card that ALSO has a consumable-cost mana line (FN-safe)", () => {
    // Phyrexian Tower: "{T}: Add {C}" (real) + "{T}, Sacrifice a creature: Add {B}{B}". A modelable line
    // exists, so the source is kept (models the first {T}: {C} line) — the gate only fires when EVERY
    // activated mana line is unpayable. (Land here, but the all-lines-unpayable guard is the point.)
    expect(manaProduction({ name: "Phyrexian Tower", type: "Legendary Land", oracle: "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}." }))
      .toEqual({ colors: ["C"], amount: 1, requiresTap: true });
    // A non-land with a consumable line FIRST but a real {T}: line too keeps the source (no phantom drop).
    expect(manaProduction({ name: "Hybrid Test Dork", type: "Creature — Test", oracle: "Sacrifice a creature: Add {R}.\n{T}: Add {G}." }))
      .not.toBeNull();
  });

  // ===== TOKENS ===== T4 FP fix — a card's OWN mana must not be fabricated from a TOKEN's ability stated
  // in MAIN text ("…token with \"…Add…\"" / "…token. It has \"…Add…\""). Without this, an Eldrazi Spawn-
  // maker reads as a sac-for-{C} source it isn't (the engine would offer "sacrifice Blisterpod for {C}").
  // SCOPED to a create-token context, so a self-granting lord ("All Slivers have \"{T}: Add …\"") — a real
  // source — is preserved (a separate, deferred concern from non-token mana-grant anthems).
  it("does NOT fabricate own-mana from a CREATED TOKEN's ability, but KEEPS a self-granting lord's", () => {
    expect(manaProduction({ name: "Nest Invader", type: "Creature — Eldrazi Drone", oracle: "When this creature enters, create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"" })).toBeNull();
    expect(manaProduction({ name: "Blisterpod", type: "Creature — Eldrazi Drone", oracle: "When this creature dies, create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\"" })).toBeNull();
    // The minted TOKEN's own (unquoted) oracle IS a real one-shot {C} source.
    expect(manaProduction({ name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", oracle: "Sacrifice this token: Add {C}.", token: true })).toEqual({ colors: ["C"], amount: 1, sacrifices: true, requiresTap: false });
    // A self-granting lord (Gemhide IS a Sliver) is NOT a create-token clause → left intact (real source).
    expect(manaProduction({ name: "Gemhide Sliver", type: "Creature — Sliver", oracle: "All Sliver creatures have \"{T}: Add one mana of any color.\"" })).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });

  // ===== AURA BLANKET STRIP ===== an Aura NEVER self-produces via quoted text — its quotes confer to
  // the HOST (grantedManaSpecsFor). The has/have-anchored guard alone missed non-has introducers
  // ("is a Treasure artifact with …") and conjunction-chained quotes ("has \"…\" and \"…\""), minting
  // the Aura itself as a phantom standing source (P0-verify regression class, all 5 pinned; real oracle).
  it("never mints an AURA as its own mana source from any quoted-grant shape", () => {
    expect(manaProduction({ name: "Minimus Containment", type: "Enchantment — Aura", oracle: "Enchant nonland permanent\nEnchanted permanent is a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color,\" and it loses all other abilities. (If it was a creature, it's no longer a creature.)" })).toBeNull();
    expect(manaProduction({ name: "Honest Work", type: "Enchantment — Aura", oracle: "Enchant creature an opponent controls\nWhen this Aura enters, tap enchanted creature and remove all counters from it.\nEnchanted creature loses all abilities and is a Citizen with base power and toughness 1/1 and \"{T}: Add {C}\" named Humble Merchant. (It loses all other creature types and names.)" })).toBeNull();
    expect(manaProduction({ name: "Imprisoned in the Moon", type: "Enchantment — Aura", oracle: "Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with \"{T}: Add {C}\" and loses all other card types and abilities." })).toBeNull();
    expect(manaProduction({ name: "Careful Cultivation", type: "Enchantment — Aura", oracle: "Enchant artifact or creature\nAs long as enchanted permanent is a creature, it gets +1/+3 and has reach and \"{T}: Add {G}{G}.\"\nChannel — {1}{G}, Discard this card: Create a 1/1 green Human Monk creature token with \"{T}: Add {G}.\"" })).toBeNull();
    expect(manaProduction({ name: "Lithoform Blight", type: "Enchantment — Aura", oracle: "Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land loses all land types and abilities and has \"{T}: Add {C}\" and \"{T}, Pay 1 life: Add one mana of any color.\"" })).toBeNull();
    // The classic has-anchored Aura grant stays stripped too (was already covered by the general guard).
    expect(manaProduction({ name: "Multani's Harmony", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has \"{T}: Add one mana of any color.\"" })).toBeNull();
  });
});

// ─── MANA-VARIABLE (wave2a) — count-derived tap-for-mana amount ────────────────
// THE FP this lane closes: parseAddClause used to grab the lone {G}/{C} and DROP "for each creature" /
// "equal to devotion" / "equal to greatest power" — Gaea's Cradle / Karametra's Acolyte / Bighorner et al
// produced ONE mana at runtime while classified native-mana. The variable branch maps the metric to a
// countForSpec spec (amount:0 placeholder), resolved LIVE in manaSources. An UNMODELED metric → null.

describe("parseAddClause — variable amount (MANA-VARIABLE)", () => {
  const { parseAddClause } = _internals;

  it("maps 'Add {G} for each creature you control' to a permanentsYouControl spec (NOT amount 1)", () => {
    expect(parseAddClause("{T}: Add {G} for each creature you control."))
      .toEqual({ colors: ["G"], amount: 0, amountSpec: { kind: "permanentsYouControl", cardType: "creature" } });
  });

  it("maps 'Add an amount of {G} equal to your devotion to green' to a devotion spec", () => {
    expect(parseAddClause("{T}: Add an amount of {G} equal to your devotion to green."))
      .toEqual({ colors: ["G"], amount: 0, amountSpec: { kind: "devotion", color: "G" } });
  });

  it("maps 'greatest power among creatures you control' (NO 'other') WITHOUT excludeSelf", () => {
    expect(parseAddClause("{T}: Add an amount of {G} equal to the greatest power among creatures you control."))
      .toEqual({ colors: ["G"], amount: 0, amountSpec: { kind: "greatestPowerYouControl" } });
  });

  it("maps an 'Add X mana …, where X is the number of enchantments you control' shape (Sanctum Weaver)", () => {
    expect(parseAddClause("{T}: Add X mana of any one color, where X is the number of enchantments you control."))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "permanentsYouControl", cardType: "enchantment" } });
  });

  it("picks the variable line over a fixed any-color line on the SAME card (Arbor Adherent) — excludeSelf", () => {
    expect(parseAddClause("{T}: Add one mana of any color.\n{T}: Add X mana of any one color, where X is the greatest toughness among other creatures you control."))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "greatestToughnessYouControl", excludeSelf: true } });
  });

  it("returns null for an UNRECOGNIZED metric — NEVER a fabricated amount:1 (CREED)", () => {
    expect(parseAddClause("{T}: Add {G} for each zombie an opponent controls.")).toBeNull();
    expect(parseAddClause("{T}: Add X mana, where X is the number of zombies target opponent controls.")).toBeNull();
  });

  it("maps Selvala's 'Add X mana in any combination of colors, where X is …' (any-combination = all-5-colors + metric)", () => {
    // "in any combination of colors" is the strict-superset of "of any one color" — the player distributes
    // X freely across the 5 colors, which the payment planner's per-pip color choice models EXACTLY. So it
    // shares the same all-five-colors amountSpec return. The metric (greatest power among creatures you
    // control) is in parseManaMetric's vocabulary → a runtime-modeled variable-X source (was null before).
    expect(parseAddClause("{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control."))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "greatestPowerYouControl" } });
    // an UNMODELED metric under the same wording still → null (CREED — never a fabricated fallback)
    expect(parseAddClause("{G}, {T}: Add X mana in any combination of colors, where X is the number of zombies target opponent controls.")).toBeNull();
  });

  it("leaves a fixed-amount clause untouched (no connector → no variable branch)", () => {
    expect(parseAddClause("{T}: Add {G}.")).toEqual({ colors: ["G"], amount: 1 });
    expect(parseAddClause("{T}: Add {C}{C}.")).toEqual({ colors: ["C"], amount: 2 });
    expect(parseAddClause("{T}: Add one mana of any color.")).toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1 });
  });
});

// ─── MANA-AMOUNT — "Add <N> mana of any (one) color" parses the QUANTITY word ────
// Was a systemic runtime bug: this branch hardcoded amount:1, so the sim under-produced for every
// multi-mana any-color source (Black Lotus tapped for 1, not 3; Zaxara for 1, not 2). Runtime-only —
// classifyCard never calls manaProduction, so the native-mana tier is unchanged (proven by a full-corpus
// flip-diff = 0 IN / 0 OUT). FN-safe: an unquantified/unrecognized phrasing (or a bare X with no metric)
// stays 1 — never a fabricated over-count.
describe("manaProduction — MANA-AMOUNT (quantity word in 'Add N mana of any color')", () => {
  const { parseAddClause } = _internals;

  it("Zaxara — 'Add two mana of any one color' → amount 2 (the headline self-play bug)", () => {
    expect(manaProduction({ name: "Zaxara, the Exemplary", type: "Legendary Creature — Nightmare Hydra", oracle: "Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 2, requiresTap: true });
    // …and through the parser directly (the unit the fix lives in).
    expect(parseAddClause("{T}: Add two mana of any one color.").amount).toBe(2);
  });

  it("Gilded Lotus — 'Add three mana of any one color' → amount 3", () => {
    expect(manaProduction({ name: "Gilded Lotus", type: "Artifact", oracle: "{T}: Add three mana of any one color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 3, requiresTap: true });
    expect(parseAddClause("{T}: Add three mana of any one color.").amount).toBe(3);
  });

  it("Black Lotus — '{T}, Sacrifice this: Add three mana of any one color' → amount 3, one-shot", () => {
    expect(manaProduction({ name: "Black Lotus", type: "Artifact", oracle: "{T}, Sacrifice this artifact: Add three mana of any one color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 3, sacrifices: true, requiresTap: true });
  });

  it("covers the full corpus number-word range: four (Blacker Lotus) and ten (The Aetherspark)", () => {
    expect(parseAddClause("{T}: Tear this artifact into pieces. Add four mana of any one color. Remove the pieces from the game.").amount).toBe(4);
    expect(parseAddClause("−10: Add ten mana of any one color.").amount).toBe(10);
    // a literal DIGIT works too ("Add 1 mana of any color" — Unknown Event Shores' second ability).
    expect(parseAddClause("{1}, {T}: Add 1 mana of any color.").amount).toBe(1);
  });

  it("an UNQUANTIFIED any-color clause stays amount 1 (FN-safe — 'one' and the no-number form)", () => {
    expect(parseAddClause("{T}: Add one mana of any color.").amount).toBe(1);
    expect(parseAddClause("{T}: Add one mana of any one color.").amount).toBe(1);
    expect(parseAddClause("{T}: Add mana of any color.").amount).toBe(1);
  });

  it("does NOT touch single-color dorks / concatenated symbols / {N}: filters", () => {
    // a {T}: dork is amount 1, untouched.
    expect(parseAddClause("{T}: Add {G}.")).toEqual({ colors: ["G"], amount: 1 });
    // concatenated same-color = count, untouched (not an any-color clause).
    expect(parseAddClause("{T}: Add {C}{C}.")).toEqual({ colors: ["C"], amount: 2 });
    // a pure-mana FILTER ("{2}: Add one mana of any color" — Prismite) stays amount 1, no tap.
    expect(manaProduction({ name: "Prismite", type: "Artifact Creature — Golem", oracle: "{2}: Add one mana of any color." }))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 1, requiresTap: false });
  });

  it("the VARIABLE 'Add X mana …, where X is <metric>' branch still WINS (precedence intact)", () => {
    // Shape B (amountSpec) must take precedence over the fixed number-word branch — the number-word
    // parse must NOT swallow or reorder the dynamic-X case.
    expect(parseAddClause("{T}: Add X mana of any one color, where X is the number of enchantments you control."))
      .toEqual({ colors: ["W", "U", "B", "R", "G"], amount: 0, amountSpec: { kind: "permanentsYouControl", cardType: "enchantment" } });
    // a bare "Add X mana of any one color" with NO metric → 1 (FN-safe, never fabricates the unknown X).
    expect(parseAddClause("{T}: Add X mana of any one color.").amount).toBe(1);
  });

  it("Zaxara taps for 2 as a live source (manaSources runtime, not just the parser)", () => {
    const zax = permanent({ name: "Zaxara, the Exemplary", type: "Legendary Creature — Nightmare Hydra", oracle: "Deathtouch\n{T}: Add two mana of any one color." }, { id: "zax" });
    const [src] = manaSources(bf([zax]), "user");
    expect(src).toMatchObject({ permanentId: "zax", amount: 2 });
    expect(src.colors).toEqual(["W", "U", "B", "R", "G"]);
  });
});

describe("manaProduction — variable amount carries amountSpec (placeholder amount 0)", () => {
  it("Gaea's Cradle (land): {G} + a creature-count spec, amount placeholder 0", () => {
    expect(manaProduction({ name: "Gaea's Cradle", type: "Legendary Land", oracle: "{T}: Add {G} for each creature you control." }))
      .toEqual({ colors: ["G"], amount: 0, amountSpec: { kind: "permanentsYouControl", cardType: "creature" }, requiresTap: true });
  });
  it("an unmodeled-metric NON-LAND mana ability produces NO source (null), never fabricated mana", () => {
    expect(manaProduction({ name: "Fake Dork", type: "Creature — Elf Druid", oracle: "{T}: Add X mana, where X is the number of zombies target opponent controls." })).toBeNull();
  });
});

describe("manaSources — resolves a count-derived amount LIVE (MANA-VARIABLE)", () => {
  const lib = (card) => ({ id: card.id || `c-${card.name}`, ...card });
  const perm = (card, { id, tapped = false, summoningSick = false } = {}) =>
    ({ id: id || `perm-${card.name}`, card: lib(card), tapped, summoningSick });
  const bf = (perms) => ({ players: { user: { battlefield: perms } } });
  const find = (state, id) => manaSources(state, "user").find((s) => s.permanentId === id);

  const cradle = (id) => perm({ name: "Gaea's Cradle", type: "Legendary Land", oracle: "{T}: Add {G} for each creature you control." }, { id });
  const bear = (id) => perm({ name: "Bear", type: "Creature — Bear", oracle: "", power: "2", toughness: "2" }, { id });

  it("Gaea's Cradle on a 3-creature board → amount 3 (NOT 1)", () => {
    const s = bf([cradle("cr"), bear("b1"), bear("b2"), bear("b3")]);
    expect(find(s, "cr")).toMatchObject({ permanentId: "cr", colors: ["G"], amount: 3 });
  });

  it("Gaea's Cradle on an EMPTY board → amount 0 (NOT 1)", () => {
    const s = bf([cradle("cr")]);
    expect(find(s, "cr")).toMatchObject({ permanentId: "cr", colors: ["G"], amount: 0 });
  });

  it("Karametra's Acolyte → devotion to green (count {G} pips you control)", () => {
    // Acolyte's own cost {2}{G} = 1 green pip; two more permanents add {G} and {G}{G} = 3 → total 4.
    const aco = perm({ name: "Karametra's Acolyte", type: "Creature — Human Druid", mana_cost: "{2}{G}", oracle: "{T}: Add an amount of {G} equal to your devotion to green." }, { id: "aco" });
    const g1 = perm({ name: "G1", type: "Creature — Elf", mana_cost: "{G}", oracle: "" }, { id: "g1" });
    const g2 = perm({ name: "G2", type: "Creature — Elf", mana_cost: "{G}{G}", oracle: "" }, { id: "g2" });
    expect(find(bf([aco, g1, g2]), "aco")).toMatchObject({ colors: ["G"], amount: 4 });
  });

  it("Bighorner Rancher → greatest power among creatures, INCLUDING self (no 'other')", () => {
    const big = perm({ name: "Bighorner Rancher", type: "Creature — Human Ranger", mana_cost: "{4}{G}", power: "6", toughness: "6", oracle: "{T}: Add an amount of {G} equal to the greatest power among creatures you control." }, { id: "big" });
    const weak = perm({ name: "Weak", type: "Creature — Bird", power: "3", toughness: "3", oracle: "" }, { id: "w" });
    // Self power 6 is the max → 6 (self counted).
    expect(find(bf([big, weak]), "big")).toMatchObject({ colors: ["G"], amount: 6 });
  });

  it("Arbor Adherent → greatest toughness among OTHER creatures (excludes self)", () => {
    const arbor = perm({ name: "Arbor Adherent", type: "Creature — Dog Druid", power: "1", toughness: "9", oracle: "{T}: Add one mana of any color.\n{T}: Add X mana of any one color, where X is the greatest toughness among other creatures you control." }, { id: "arb" });
    const wall = perm({ name: "Wall", type: "Creature — Wall", power: "0", toughness: "4", oracle: "" }, { id: "wall" });
    // Self toughness 9 is EXCLUDED ('other') → max is the Wall's 4.
    expect(find(bf([arbor, wall]), "arb")).toMatchObject({ amount: 4 });
    // Arbor alone (only self, excluded) → 0.
    expect(find(bf([arbor]), "arb")).toMatchObject({ amount: 0 });
  });

  it("a resolved-0 variable source can't fabricate mana via planPayment (amount ?? 1 floor, not || 1)", () => {
    // Gaea's Cradle on an empty board resolves to 0; it must NOT be able to pay even {G}.
    const sources = manaSources(bf([cradle("cr")]), "user");
    expect(canAfford({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, sources, parseManaCost("{G}"))).toBe(false);
  });
});

describe("classifyCard — an UNMODELED variable-mana metric is NOT native-mana", () => {
  it("an 'Add X mana, where X is <unrecognized>' card stays non-native (not native-mana)", () => {
    // hasManaAbility already rejects the "Add X mana" form; parseAddClause returns null too.
    const tier = classifyCard({ type: "Creature — Elf Druid", oracle: "{T}: Add X mana, where X is the number of zombies target opponent controls.", name: "Fake Dork", mana: "{1}{G}" });
    expect(tier).not.toBe("native-mana");
  });
});

// ─── manaSources ─────────────────────────────────────────────────────────────

describe("manaSources", () => {
  it("lists untapped mana permanents, excluding tapped ones", () => {
    const state = bf([
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f1" }),
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f2", tapped: true }),
    ]);
    const sources = manaSources(state, "user");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ permanentId: "f1", colors: ["G"], amount: 1 });
  });

  it("excludes a summoning-sick mana dork but not a rock", () => {
    const state = bf([
      permanent({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }, { id: "elf", summoningSick: true }),
      permanent({ name: "Mind Stone", type: "Artifact" }, { id: "rock", summoningSick: true }),
    ]);
    const sources = manaSources(state, "user");
    expect(sources.map(s => s.permanentId)).toEqual(["rock"]);
  });

  it("includes a hasty mana dork even while summoning sick", () => {
    const state = bf([
      permanent(
        { name: "Hasty Druid", type: "Creature — Druid", oracle: "Haste\n{T}: Add {G}.", keywords: ["Haste"] },
        { id: "hd", summoningSick: true },
      ),
    ]);
    expect(manaSources(state, "user").map(s => s.permanentId)).toEqual(["hd"]);
  });

  it("does NOT offer a token-maker creature as a mana source (reminder-text 'Add mana' is the token's, not the creature's)", () => {
    const state = bf([
      permanent({ name: "Brazen Freebooter", type: "Creature — Human Pirate", oracle: "When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" }, { id: "bf" }),
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f1" }),
    ]);
    expect(manaSources(state, "user").map(s => s.permanentId)).toEqual(["f1"]); // the creature is NOT a source
  });

  // ===== TOKENS ===== T4 — the same FP guard for a token ability stated in MAIN text ("It has"/"with"),
  // not reminder: an Eldrazi Spawn-maker is never offered as a sac-for-{C} source (a fabricated ability).
  it("does NOT offer a token-maker as a mana source when the token's ability is in MAIN text", () => {
    const state = bf([
      permanent({ name: "Blisterpod", type: "Creature — Eldrazi Drone", oracle: "When this creature dies, create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\"" }, { id: "blis" }),
      permanent({ name: "Nest Invader", type: "Creature — Eldrazi Drone", oracle: "When this creature enters, create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"" }, { id: "nest" }),
      permanent({ name: "Forest", type: "Basic Land — Forest" }, { id: "f1" }),
    ]);
    expect(manaSources(state, "user").map(s => s.permanentId)).toEqual(["f1"]); // only the land is a source
  });

  // ===== TOKENS ===== T4 — a minted Eldrazi Spawn (sac-for-{C}, NO {T}) is usable the turn it enters
  // (CR 302.6: summoning sickness gates {T}/{Q} abilities, not a pure sacrifice cost) so a freshly-made
  // Spawn ramps immediately — the WALT-TOKEN-ABIL token-mana correctness invariant.
  it("offers a summoning-sick sac-for-mana token (Eldrazi Spawn) as a source; still gates a {T} dork", () => {
    const state = bf([
      permanent({ name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", oracle: "Sacrifice this token: Add {C}.", token: true }, { id: "spawn", summoningSick: true }),
      permanent({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }, { id: "elf", summoningSick: true }),
    ]);
    const sources = manaSources(state, "user");
    expect(sources.map(s => s.permanentId)).toEqual(["spawn"]); // sac token usable; {T} dork still sick-gated
    expect(sources[0]).toMatchObject({ permanentId: "spawn", colors: ["C"], amount: 1, sacrifices: true });
  });
});

// ─── planPayment / canAfford ─────────────────────────────────────────────────

const G = (s) => parseManaCost(s);

describe("planPayment / canAfford", () => {
  it("pays from a pre-filled pool with zero taps (pool-first)", () => {
    const plan = planPayment({ ...EMPTY_POOL, G: 1 }, [], G("{G}"));
    expect(plan.taps).toEqual([]);
    expect(plan.spend.G).toBe(1);
    expect(canAfford({ ...EMPTY_POOL, G: 1 }, [], G("{G}"))).toBe(true);
  });

  it("taps a land to pay a colored pip when the pool is empty", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    const plan = planPayment(EMPTY_POOL, sources, G("{G}"));
    expect(plan.taps).toEqual([{ permanentId: "f1", color: "G", amount: 1 }]);
  });

  it("returns null when no source can make the required color", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    expect(planPayment(EMPTY_POOL, sources, G("{U}"))).toBeNull();
    expect(canAfford(EMPTY_POOL, sources, G("{U}"))).toBe(false);
  });

  it("covers generic with any sources", () => {
    const sources = [
      { permanentId: "f1", colors: ["G"], amount: 1 },
      { permanentId: "f2", colors: ["G"], amount: 1 },
    ];
    expect(canAfford(EMPTY_POOL, sources, G("{2}"))).toBe(true);
    expect(canAfford(EMPTY_POOL, [sources[0]], G("{2}"))).toBe(false);
  });

  it("uses a single Sol Ring (amount 2) to pay 2 generic", () => {
    const sources = [{ permanentId: "sol", colors: ["C"], amount: 2 }];
    const plan = planPayment(EMPTY_POOL, sources, G("{2}"));
    expect(plan.taps).toEqual([{ permanentId: "sol", color: "C", amount: 2 }]);
  });

  it("most-constrained-first: reserves a dual for the color only it can make", () => {
    // Need {W}{U}. Plains makes only W; the dual makes W or U. A naive greedy
    // could spend the dual on W and strand U. Most-constrained-first pays W
    // from Plains and U from the dual.
    const sources = [
      { permanentId: "dual", colors: ["W", "U"], amount: 1 },
      { permanentId: "plains", colors: ["W"], amount: 1 },
    ];
    const plan = planPayment(EMPTY_POOL, sources, G("{W}{U}"));
    expect(plan).not.toBeNull();
    const byColor = Object.fromEntries(plan.taps.map(t => [t.color, t.permanentId]));
    expect(byColor.W).toBe("plains");
    expect(byColor.U).toBe("dual");
  });

  it("returns null when a colored requirement outnumbers its sources", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    expect(planPayment(EMPTY_POOL, sources, G("{G}{G}"))).toBeNull();
  });

  it("spends the pool before tapping for generic", () => {
    const sources = [{ permanentId: "f1", colors: ["G"], amount: 1 }];
    // Pool has 2 generic-worth; cost is {1}. Should not need to tap.
    const plan = planPayment({ ...EMPTY_POOL, C: 2 }, sources, G("{1}"));
    expect(plan.taps).toEqual([]);
    expect(plan.spend.C).toBe(1);
  });

  // ===== TOKENS ===== T2 — a cracked Treasure carries `sacrifices:true` on its tap entry so the
  // commit path sacrifices it; tapAny prefers a repeatable source so a Treasure isn't wasted.
  it("a sacrifice-for-mana source carries sacrifices:true on its tap entry", () => {
    const sources = [{ permanentId: "treas", colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true }];
    const plan = planPayment(EMPTY_POOL, sources, G("{G}"));
    expect(plan.taps).toEqual([{ permanentId: "treas", color: "G", amount: 1, sacrifices: true }]);
  });
  it("prefers a repeatable source over a Treasure for a generic pip", () => {
    const sources = [
      { permanentId: "treas", colors: ["W", "U", "B", "R", "G"], amount: 1, sacrifices: true },
      { permanentId: "forest", colors: ["G"], amount: 1 },
    ];
    const plan = planPayment(EMPTY_POOL, sources, G("{1}"));
    expect(plan.taps).toEqual([{ permanentId: "forest", color: "G", amount: 1 }]); // Treasure untouched
  });

  // Regression (review bug #2): scarcest-color-first must not strand the only
  // source of a color. pool {G:1}; sources can make {U,B},{U,R,W},{C,U}; cost
  // {W}{U}{B}. A naive first-fit pays U from the only-B source and fails.
  it("does not strand the sole source of a color (scarcity-first)", () => {
    const sources = [
      { permanentId: "s1", colors: ["U", "B"], amount: 1 },
      { permanentId: "s2", colors: ["U", "R", "W"], amount: 1 },
      { permanentId: "s3", colors: ["C", "U"], amount: 1 },
    ];
    expect(canAfford({ ...EMPTY_POOL, G: 1 }, sources, G("{W}{U}{B}"))).toBe(true);
  });

  // Regression (review bug #1): the plan's spend, applied to the topped-up
  // pool, must always be payable — no divergence from a second heuristic. Two
  // hybrid pips sharing a color is the case that used to throw MANA_SHORT.
  it("returns a self-consistent spend for multi-hybrid costs", () => {
    const pool = { W: 2, U: 2, B: 0, R: 3, G: 2, C: 1 };
    const cost = G("{U}{R}{G}{R/G}{G/B}");
    const plan = planPayment(pool, [], cost);
    expect(plan).not.toBeNull();
    // Topped pool (no taps here) minus spend must be non-negative everywhere.
    for (const c of ["W", "U", "B", "R", "G", "C"]) {
      expect((pool[c] || 0) - plan.spend[c]).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── MANA-MULTIPLIER — tap-for-mana ×N replacement applied LIVE at the tap site (manaSources) ──────
// Mana Reflection (×2) / Nyxbloom Ancient (×3) multiply the mana a TAP source produces, controller-scoped.
// A non-tap source (a {2} filter, a non-tap sac like an Eldrazi Spawn) and an OPPONENT's multiplier are
// never applied (CREED anti-FP). Detection/factor math live in replacementEffects.test.js.
describe("manaSources — MANA-MULTIPLIER (tap-for-mana ×N, controller-scoped)", () => {
  const lib = (card) => ({ id: card.id || `c-${card.name}`, ...card });
  const perm = (card, { id, tapped = false, summoningSick = false } = {}) =>
    ({ id: id || `perm-${card.name}`, card: lib(card), tapped, summoningSick });
  const st = (mine, theirs = []) => ({ players: { user: { battlefield: mine }, opp: { battlefield: theirs } } });
  const find = (state, id, who = "user") => manaSources(state, who).find((s) => s.permanentId === id);

  const REFLECTION = "If you tap a permanent for mana, it produces twice as much of that mana instead.";
  const NYXBLOOM = "Trample\nIf you tap a permanent for mana, it produces three times as much of that mana instead.";
  const forest = (id) => perm({ name: "Forest", type: "Basic Land — Forest" }, { id });
  const solRing = (id) => perm({ name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, { id });
  const ref = (id) => perm({ name: "Mana Reflection", type: "Enchantment", oracle: REFLECTION }, { id });
  const nyx = (id) => perm({ name: "Nyxbloom Ancient", type: "Enchantment Creature — Elemental", oracle: NYXBLOOM, power: "5", toughness: "5" }, { id });

  it("a basic land tapped under Mana Reflection produces 2 (NOT 1)", () => {
    expect(find(st([forest("f"), ref("r")]), "f")).toMatchObject({ permanentId: "f", colors: ["G"], amount: 2 });
  });

  it("a basic land tapped under Nyxbloom Ancient produces 3 (NOT 1)", () => {
    expect(find(st([forest("f"), nyx("n")]), "f")).toMatchObject({ permanentId: "f", colors: ["G"], amount: 3 });
  });

  it("Sol Ring under Mana Reflection produces 4 (its 2, doubled)", () => {
    expect(find(st([solRing("s"), ref("r")]), "s")).toMatchObject({ permanentId: "s", amount: 4 });
  });

  it("two multipliers stack multiplicatively (Forest under Reflection + Nyxbloom → 6)", () => {
    expect(find(st([forest("f"), ref("r"), nyx("n")]), "f")).toMatchObject({ permanentId: "f", amount: 6 });
  });

  it("no multiplier on board → unchanged base amount (no-op)", () => {
    expect(find(st([forest("f")]), "f")).toMatchObject({ permanentId: "f", amount: 1 });
  });

  it("FP guard: an OPPONENT's Mana Reflection never multiplies this player's land", () => {
    const state = st([forest("f")], [ref("ro")]);
    expect(find(state, "f", "user")).toMatchObject({ permanentId: "f", amount: 1 });
    // …but the opponent's OWN land would be multiplied (controller-scoped, not global).
    const state2 = st([ref("ro"), forest("of")].map((p) => p), []);
    expect(manaSources({ players: { opp: { battlefield: [ref("ro"), forest("of")] } } }, "opp").find((s) => s.permanentId === "of"))
      .toMatchObject({ amount: 2 });
    void state2;
  });

  it("FP guard: a NON-TAP sac source (Eldrazi Spawn) is NOT multiplied — it isn't tapped for mana", () => {
    const spawn = perm({ name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", oracle: "Sacrifice this token: Add {C}.", token: true }, { id: "sp", summoningSick: true });
    // requiresTap:false + sacrifices → usable while sick, base amount, NOT tripled by Nyxbloom.
    expect(find(st([spawn, nyx("n")]), "sp")).toMatchObject({ permanentId: "sp", amount: 1, sacrifices: true });
  });

  it("FP guard: a NON-TAP mana filter (Prismite '{2}: Add …') is NOT multiplied", () => {
    const prismite = perm({ name: "Prismite", type: "Artifact Creature — Golem", oracle: "{2}: Add one mana of any color." }, { id: "p" });
    expect(find(st([prismite, nyx("n")]), "p")).toMatchObject({ permanentId: "p", amount: 1 });
  });

  it("a {T}-cost Treasure IS multiplied (it taps for mana — CR 605 ruling)", () => {
    const treasure = perm({ name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this token: Add one mana of any color.", token: true }, { id: "t" });
    expect(find(st([treasure, nyx("n")]), "t")).toMatchObject({ permanentId: "t", amount: 3, sacrifices: true });
  });

  it("end-to-end: multiplied mana actually pays a spell (canAfford / planPayment)", () => {
    const sources = manaSources(st([forest("f"), nyx("n")]), "user"); // 1 Forest ×3 = 3 green
    expect(canAfford(EMPTY_POOL, sources, parseManaCost("{2}{G}"))).toBe(true);  // cost 3 — payable
    expect(canAfford(EMPTY_POOL, sources, parseManaCost("{3}{G}"))).toBe(false); // cost 4 — not payable from 3
    const plan = planPayment(EMPTY_POOL, sources, parseManaCost("{2}{G}"));
    expect(plan.taps).toEqual([{ permanentId: "f", color: "G", amount: 3 }]);
  });

  it("a variable count source (Gaea's Cradle) is multiplied AFTER the live count resolves", () => {
    const cradle = perm({ name: "Gaea's Cradle", type: "Legendary Land", oracle: "{T}: Add {G} for each creature you control." }, { id: "cr" });
    const bear = (id) => perm({ name: "Bear", type: "Creature — Bear", oracle: "", power: "2", toughness: "2" }, { id });
    // 2 creatures → count 2, then ×2 (Mana Reflection) = 4. (Nyxbloom is itself a creature here too.)
    const state = st([cradle, bear("b1"), bear("b2"), ref("r")]);
    expect(find(state, "cr")).toMatchObject({ permanentId: "cr", colors: ["G"], amount: 4 });
  });
});

// ===== P0-RESIDUAL PHANTOM-GRANT WAVE ===== (overhaul pass) — real-oracle pins for the four strip
// classes: attachment blanket (Equipment), conditional subjects (as-long-as / restrictive-with,
// incl. the conjunction-chained form), spend-restricted quotes, and LEVEL-banded oracles. Every
// card here was a LIVE phantom standing mana source before the wave (runtime-fingerprint audited).
describe("manaProduction — phantom-grant FP wave (P0 residuals)", () => {
  it("never credits an EQUIPMENT for its host-conferred quoted mana", () => {
    expect(manaProduction({ name: "Summoning Materia", type: "Artifact — Equipment", oracle: `You may look at the top card of your library any time.
As long as this Equipment is attached to a creature, you may cast creature spells from the top of your library.
Equipped creature gets +2/+2 and has vigilance and "{T}: Add {G}."
Equip {2}` })).toBeNull();
    expect(manaProduction({ name: "Lotus Ring", type: "Artifact — Equipment", oracle: `Indestructible
Equipped creature gets +3/+3 and has vigilance and "{T}, Sacrifice this creature: Add three mana of any one color."
Equip {3}` })).toBeNull();
  });
  it("never credits a CONDITIONAL quoted self-grant the stateless model cannot evaluate", () => {
    expect(manaProduction({ name: "Rishkar, Peema Renegade", type: "Legendary Creature — Elf Druid", oracle: `When Rishkar enters, put a +1/+1 counter on each of up to two target creatures.
Each creature you control with a counter on it has "{T}: Add {G}."` })).toBeNull();
    expect(manaProduction({ name: "Honored Hierarch", type: "Creature — Human Druid", oracle: `Renown 1
As long as this creature is renowned, it has vigilance and "{T}: Add one mana of any color."` })).toBeNull();
    expect(manaProduction({ name: "Mul Daya Channelers", type: "Creature — Elf Druid Shaman", oracle: `Play with the top card of your library revealed.
As long as the top card of your library is a creature card, this creature gets +3/+3.
As long as the top card of your library is a land card, this creature has "{T}: Add two mana of any one color."` })).toBeNull();
  });
  it("never credits a SPEND-RESTRICTED quoted grant as general-purpose mana", () => {
    expect(manaProduction({ name: "Battery Bearer", type: "Creature — Human Artificer", oracle: `Creatures you control have "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell."
Whenever you cast an artifact spell with mana value 6 or greater, draw a card.` })).toBeNull();
    expect(manaProduction({ name: "Inga and Esika", type: "Legendary Creature — Human God", oracle: `Creatures you control have vigilance and "{T}: Add one mana of any color. Spend this mana only to cast a creature spell."
Whenever you cast a creature spell, if three or more mana from creatures was spent to cast it, draw a card.` })).toBeNull();
  });
  it("routes a LEVEL-banded card out of the standing mana model (band-scoped abilities)", () => {
    expect(manaProduction({ name: "Joraga Treespeaker", type: "Creature — Elf Druid", oracle: `Level up {1}{G}
LEVEL 1-4
1/2
{T}: Add {G}{G}.
LEVEL 5+
1/4
Elves you control have "{T}: Add {G}{G}."` })).toBeNull();
  });
});
