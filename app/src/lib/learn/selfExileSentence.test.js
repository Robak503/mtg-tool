/**
 * selfExileSentence.test.js — the trailing "Exile <this>." disposition (Temporal Trespass, Time Reversal,
 * Treasured Find, Flood of Recollection, Game Plan, Rite of Renewal, Rise of the Eldrazi).
 *
 * ⭐ THE MIRROR THAT WAS NEVER WRITTEN, and the codebase already said so. `stripSelfShuffleIntoLibrary`
 * peels a trailing "Shuffle <this> into its owner's library." sentence, and its own comment calls the exile
 * form *"the exact mechanical mirror of Finale of Revelation's 'Exile <this>.' selfExile"*. The DISPOSITION
 * existed the whole time — `selfExile` is a real program flag GY-1 honors, threaded by rebound — but nothing
 * peeled the trailing EXILE sentence, so cards whose bodies were fully modeled parsed LOW on that one tail.
 * One arm of a pair again; the file that names the pair is the file that only implemented half of it.
 *
 * ⛔ THE STAMP IS THE POINT, NOT THE STRIP. These spells genuinely never reach the graveyard. Peeling the
 * sentence WITHOUT setting `selfExile` would flip each card native while silently sending it to the yard,
 * corrupting every graveyard count, recursion target and delve/escape cost downstream — a legal-looking
 * board with a wrong zone. Strip and stamp ship together or neither ships.
 */
import { describe, expect, it } from "vitest";

import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { stripSelfExileSentence } from "./effects/castModifiers.js";

// Bodies verified against the bundled Scryfall snapshot. The cost-keyword lines (delve / miracle) are the
// classifier's to strip, so the fixtures here carry the body the parser actually receives.
const spell = (name, oracle) => ({ name, type: "Sorcery", mana: "{4}{U}{U}", oracle });
const TEMPORAL_TRESPASS = spell("Temporal Trespass", "Take an extra turn after this one. Exile Temporal Trespass.");
const TREASURED_FIND = spell("Treasured Find", "Return target creature or land card from your graveyard to your hand. Exile Treasured Find.");

describe("the strip", () => {
  it("⭐ peels the trailing sentence and reports the disposition", () => {
    const r = stripSelfExileSentence(TEMPORAL_TRESPASS, TEMPORAL_TRESPASS.oracle);
    expect(r.selfExile).toBe(true);
    expect(r.body).toBe("Take an extra turn after this one.");
  });

  it("⭐ accepts the pre-comma SHORT name, which is how a legendary self-refers", () => {
    const c = { name: "Jaya, Fiery Negotiator", type: "Sorcery", oracle: "Draw a card. Exile Jaya." };
    expect(stripSelfExileSentence(c, c.oracle).selfExile).toBe(true);
  });

  it("⛔ a bare 'it' / 'that card' is NOT this card — those are other cards' body clauses", () => {
    const c = spell("Whatever", "Return target card from your graveyard to your hand. Exile it.");
    expect(stripSelfExileSentence(c, c.oracle).selfExile).toBe(false);
  });

  it("⛔ exiling ANOTHER named card is not a self-disposition", () => {
    const c = spell("Whatever", "Destroy target creature. Exile Temporal Trespass.");
    expect(stripSelfExileSentence(c, c.oracle).selfExile).toBe(false);
  });

  it("⛔ it must be TRAILING — a self-exile mid-body is not the disposition", () => {
    const c = spell("Whatever", "Exile Whatever. Draw three cards.");
    expect(stripSelfExileSentence(c, c.oracle).selfExile).toBe(false);
  });

  it("⛔ a card without the sentence is untouched, byte-identical", () => {
    const c = spell("Divination", "Draw two cards.");
    const r = stripSelfExileSentence(c, c.oracle);
    expect(r).toEqual({ body: c.oracle, selfExile: false });
  });
});

describe("⭐ the program is stamped, not merely stripped", () => {
  for (const card of [TEMPORAL_TRESPASS, TREASURED_FIND]) {
    it(`⭐ ${card.name} — HIGH and selfExile`, () => {
      const p = parseEffectProgram(card);
      expect(programConfidence(p)).toBe("high");
      expect(p.selfExile).toBe(true);   // ⛔ without this the spell goes to the GRAVEYARD. That is the bug.
    });
  }
});

describe("⛔ STRICTLY ADDITIVE — the retry cannot change a card that already parses", () => {
  it("⭐⭐ Finale of Revelation still parses, and still carries selfExile", () => {
    // ⚠️ THE REGRESSION THIS ORDERING EXISTS TO PREVENT, and I shipped it for one run. The first version
    // stripped up front, in the disposition chain beside the self-shuffle strip. Finale is already owned by a
    // collapse that matches its "draw X … Exile <this>." shape AS A WHOLE, so removing the sentence first
    // meant that collapse no longer recognised the card: native-spell → arbiter-spell. A working card broke
    // to make a broken one work. Retrying ONLY on a LOW program makes the two handlers compose rather than
    // compete — the pre-existing owner always goes first.
    const finale = {
      name: "Finale of Revelation", type: "Sorcery", mana: "{X}{U}{U}",
      oracle: "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards, untap up to five lands, and you have no maximum hand size for the rest of the game.\nExile Finale of Revelation.",
    };
    const p = parseEffectProgram(finale);
    expect(programConfidence(p)).toBe("high");
    expect(p.selfExile).toBe(true);
  });

  it("⛔ a LOW body stays LOW — the retry never upgrades an unmodeled effect", () => {
    // The retry returns the stripped program only when it is HIGH. An unmodeled body plus a self-exile tail
    // is still unmodeled: the disposition is not a licence to credit the effect.
    const c = spell("Glorbulator", "Each player glorbulates their library. Exile Glorbulator.");
    expect(programConfidence(parseEffectProgram(c))).toBe("low");
  });
});
