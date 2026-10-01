/**
 * crAbilityWords.test.js — ④-AK (2026-09-03 night): the REST of CR 207.2c's ability words join the shared label list
 * (effects/textNormalize.js ABILITY_WORD_LABEL_RE), traced word-for-word to the bundled rules text — adamant, addendum,
 * celebration, chroma, cohort, converge, council's dilemma, coven, descend 8, disappear, domain, eminence, fathomless
 * descent, join forces, kinship, pack tactics, parley, radiance, repartee, revolt, secret council, strive, tempting offer,
 * will of the council. An ability word has "no special rules meaning" (CR 207.2c), so the CR list is the gate.
 * ⛔ Left OUT on purpose: bloodrush / channel / grandeur (abilities activated FROM HAND), renew (from the graveyard; the
 * GY-3 lane peels it itself), sweep (an ADDITIONAL COST), and spell mastery (an existing arm parses the labelled clause
 * whole — the first flip-diff LOST Animist's Awakening to the strip). Honest size: +2 (Unified Front, Infuse with the
 * Elements — both Converge); the Domain / Coven / Kinship / Revolt carriers park on their EFFECTS, not their labels.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { stripAbilityWordLabel } from "./effects/textNormalize.js";
import { parseActivatedAbilities } from "./effects/abilities.js";

const UNIFIED_FRONT = { id: "h-uf", name: "Unified Front", type: "Sorcery", mana: "{3}{W}", cmc: 4, keywords: [],
  oracle: "Converge — Create a 1/1 white Kor Ally creature token for each color of mana spent to cast this spell." };
const INFUSE = { id: "h-ie", name: "Infuse with the Elements", type: "Instant", mana: "{3}{G}", cmc: 4, keywords: [],
  oracle: "Converge — Put X +1/+1 counters on target creature, where X is the number of colors of mana spent to cast this spell. That creature gains trample until end of turn." };
const ANIMIST = { id: "h-aa", name: "Animist's Awakening", type: "Sorcery", mana: "{X}{G}", cmc: 1, keywords: [],
  oracle: "Reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, untap those lands." };
const MAAKA = { id: "c-rm", name: "Rubblebelt Maaka", type: "Creature — Cat", mana: "{3}{R}", cmc: 4, power: 3, toughness: 3, keywords: ["Bloodrush"],
  oracle: "Bloodrush — {R}, Discard this card: Target attacking creature gets +3/+3 until end of turn." };
const DISMISSAL = { id: "h-cd", name: "Calculated Dismissal", type: "Instant", mana: "{2}{U}", cmc: 3, keywords: [],
  oracle: "Counter target spell unless its controller pays {3}.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, scry 2." };

describe("the shared label strip", () => {
  it("⭐ a CR 207.2c ability word comes off the line; the deliberately excluded labels stay", () => {
    expect(stripAbilityWordLabel("Converge — Create a token.")).toBe("Create a token.");
    expect(stripAbilityWordLabel("Domain — Whenever this creature attacks, it gets +1/+0.")).toBe("Whenever this creature attacks, it gets +1/+0.");
    expect(stripAbilityWordLabel("Will of the council — When this creature enters, starting with you, each player votes.")).toBe("When this creature enters, starting with you, each player votes.");
    // ⛔ from-hand / graveyard / cost labels and spell mastery are NOT stripped — stripped, each would read as something it is not
    expect(stripAbilityWordLabel("Bloodrush — {R}, Discard this card: Target attacking creature gets +3/+3 until end of turn.")).toMatch(/^Bloodrush — /);
    expect(stripAbilityWordLabel("Channel — {2}{G}, Discard this card: Destroy target artifact.")).toMatch(/^Channel — /);
    expect(stripAbilityWordLabel("Sweep — Return any number of Islands you control to their owner's hand.")).toMatch(/^Sweep — /);
    expect(stripAbilityWordLabel("Spell mastery — If there are two or more instant and/or sorcery cards in your graveyard, scry 2.")).toMatch(/^Spell mastery — /);
    // a word NOT in 207.2c (a Doctor Who flavor word) is untouched by this list
    expect(stripAbilityWordLabel("Vicious Mockery — When this creature enters, goad target creature.")).toMatch(/^Vicious Mockery — /);
  });

  it("the tiers — the two Converge spells flip; the excluded labels' cards sit where they sat", () => {
    expect(classifyCard(UNIFIED_FRONT)).toBe("native-spell");
    expect(classifyCard(INFUSE)).toBe("native-spell");
    expect(classifyCard(ANIMIST)).toBe("native-spell");        // unchanged — its own arm reads the spell-mastery label
    // NOTE (2026-10-01, stage ③ · 54): Maaka GRADUATED — the FROM-HAND discard lane reads the bloodrush label like Channel's and
    // offers it in combat (bloodrush.test.js holds the runtime pins). The point of this line still stands: never a battlefield
    // activation — the label stays on the line (pinned above) and the permanent's own ability parse never models it.
    expect(classifyCard(MAAKA)).toBe("native-body");
    expect(parseActivatedAbilities(MAAKA).map((a) => a.modeled)).toEqual([false]);
    expect(classifyCard(DISMISSAL)).not.toMatch(/^native/);    // spell mastery left out → parked as before
  });
});
