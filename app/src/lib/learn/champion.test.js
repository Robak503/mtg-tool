/**
 * champion.test.js — CHAMPION (CR 702.71a). Six carriers: Thoughtweft Trio, Changeling Berserker,
 * Changeling Titan, Changeling Hero, Lightning Crafter, Boggart Mob.
 *
 * "Champion a Kithkin (When this enters, sacrifice it unless you exile another Kithkin you control. When
 * this leaves the battlefield, that card returns to the battlefield.)"
 *
 * ⭐ THE RETURN HALF IS FREE AND IS DELIBERATELY NOT REBUILT. `applyExileUntilLeaves` stamps
 * `detainedExile` on the SOURCE and checkLeavesTriggers synthesizes the return on ANY exit (CR 610.3a) —
 * which IS champion's second sentence. So exactly ONE descriptor is synthesized (the ENTERS half) and the
 * exile is routed through that shared resolver. ⛔ A second, LTB descriptor would return the card TWICE —
 * the trap the two-trigger detain fold documents. The link count is pinned at 1 for that reason.
 *
 * TWO THINGS ARE GENUINELY NEW, and both are pinned on a real board:
 *  ① The exiled permanent is the controller's OWN and CHOSEN, not targeted (champion never prints
 *     "target"), so it is picked at RESOLUTION — the same shape populate uses. Deterministic and stated:
 *     the WEAKEST eligible body (power+toughness, ties by id), because keeping the champion is the obvious
 *     play and the rules constrain only the creature's TYPE, so any legal pick is faithful.
 *  ② The SACRIFICE FALLBACK is mandatory. "Sacrifice it UNLESS you exile…" means a player with no legal
 *     offering MUST sacrifice the champion; skipping it would leave a creature on the battlefield the card
 *     says should be gone.
 *
 * ⛔ SELF IS EXCLUDED ("ANOTHER Kithkin") — without it the card exiles ITSELF, its own leave-trigger fires
 * off an already-gone source, and the creature never comes back. Pinned via the alone-on-the-battlefield
 * row, which must sacrifice rather than self-exile.
 *
 * ⛔ TOKENS ARE EXCLUDED, and that is CR 111.7 rather than caution: a token that leaves the battlefield
 * ceases to exist, so exiling one destroys it permanently while the card promises a return. Pinned with a
 * 4/4 token Kithkin present — the champion sacrifices rather than making an un-returnable choice.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * self-exclusion removed -> the alone row exiles the source instead of sacrificing it; the token exclusion
 * removed -> the token row exiles the token; the keyword-only credit removed -> every flip pin red while
 * detection still reports one native descriptor.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THOUGHTWEFT_TRIO = { id: "c-tt", name: "Thoughtweft Trio", type: "Creature — Kithkin Soldier", mana: "{4}{W}",
  power: 3, toughness: 3, oracle: "First strike, vigilance\nChampion a Kithkin (When this enters, sacrifice it unless you exile another Kithkin you control. When this leaves the battlefield, that card returns to the battlefield.)" };
const CHANGELING_BERSERKER = { id: "c-cb", name: "Changeling Berserker", type: "Creature — Shapeshifter", mana: "{4}{R}",
  power: 4, toughness: 4, oracle: "Changeling (This card is every creature type.)\nHaste\nChampion a creature (When this enters, sacrifice it unless you exile another creature you control. When this leaves the battlefield, that card returns to the battlefield.)" };

const perm = (card, id, over = {}) => ({ id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
const SRC = { id: "csrc", name: "Thoughtweft Trio", type: "Creature — Kithkin Soldier", power: 3, toughness: 3, oracle: "" };
const kithkin = (id, p, t, token) => perm({ id: `c${id}`, name: `Kithkin ${id}`, type: "Creature — Kithkin", power: p, toughness: t, oracle: "", ...(token ? { token: true } : {}) }, id);
const bear = (id) => perm({ id: `cb${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: 9, toughness: 9, oracle: "" }, id);

/** Resolve champion with `others` also on the controller's battlefield. */
function champion(others) {
  const prog = parseEffectClause("[champion:kithkin] champion a kithkin", "Creature");
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...b, players: { ...b.players, user: { ...b.players.user, battlefield: [perm(SRC, "src"), ...others], graveyard: [], exile: [] } } };
  const st = (() => { const r = runEffectProgram(s, { id: "so", source: { name: "Thoughtweft Trio" },
    payload: { params: { program: prog, controller: "user", targets: [], sourceId: "src" } } }); return r?.state || r; })();
  const pl = st.players.user;
  const src = (pl.battlefield || []).find((x) => x.id === "src");
  return {
    bf: (pl.battlefield || []).map((x) => x.card.name),
    exile: (pl.exile || []).length,
    graveyard: (pl.graveyard || []).length,
    links: (src?.detainedExile || []).length,
  };
}

describe("the keyword synthesizes ONE descriptor, and the sentinel carries the type", () => {
  it("only the ENTERS half is synthesized — the leaves half rides the detain link", () => {
    const d = detectTriggers(THOUGHTWEFT_TRIO);
    expect(d).toHaveLength(1);
    expect(d[0].event).toBe("etb");
    expect(d[0].effectClause).toMatch(/^\[champion:kithkin\]/);
    expect(triggerRoutesNatively(d[0], THOUGHTWEFT_TRIO)).toBe(true);
  });

  it("the sentinel parses to the champion atom with its named type", () => {
    expect(parseEffectClause("[champion:kithkin] champion a kithkin", "Creature").atoms)
      .toEqual([{ op: "champion", subtype: "kithkin", targetType: null }]);
  });

  it("the carriers flip, including the 'champion a creature' form", () => {
    expect(classifyCard(THOUGHTWEFT_TRIO)).toBe("native-body");
    expect(classifyCard(CHANGELING_BERSERKER)).toBe("native-body");
  });
});

describe("⭐ LAW 6 — resolved on a real board", () => {
  it("exiles the WEAKEST eligible creature and stamps exactly ONE link", () => {
    // One link, not two: the return is synthesized off this stamp, so a second would return it twice.
    const r = champion([kithkin("k1", 2, 2), kithkin("k2", 5, 5)]);
    expect(r.bf).toEqual(["Thoughtweft Trio", "Kithkin k2"]);
    expect(r.exile).toBe(1);
    expect(r.links).toBe(1);
    expect(r.graveyard).toBe(0);
  });

  it("⛔ with no eligible creature the champion is SACRIFICED — the printed downside, not a skip", () => {
    const r = champion([bear("b1")]);
    expect(r.bf).toEqual(["Bear b1"]);
    expect(r.graveyard).toBe(1);
    expect(r.exile).toBe(0);
  });

  it("⛔ a TOKEN is not eligible (CR 111.7) — it would cease to exist and never return", () => {
    const r = champion([kithkin("k1", 4, 4, true)]);
    expect(r.bf).toEqual(["Kithkin k1"]);
    expect(r.graveyard).toBe(1);
    expect(r.exile).toBe(0);
  });

  it("⛔ ALONE, it sacrifices itself rather than exiling ITSELF ('another')", () => {
    const r = champion([]);
    expect(r.bf).toEqual([]);
    expect(r.graveyard).toBe(1);
    expect(r.exile).toBe(0);
  });
});
