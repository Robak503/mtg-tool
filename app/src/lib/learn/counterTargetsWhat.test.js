/**
 * counterTargetsWhat.test.js — "counter target spell THAT TARGETS <X>" (CR 601.2c): Turn Aside, Keep Safe,
 * Rebuff the Wicked, Intervene, Confound, Hindering Light, Dawn Charm, Outwit, Cerulean Drake, Hydromorph
 * Gull, Hydromorph Guardian, Vigilant Martyr.
 *
 * ⭐⭐ ONE MISSING CAPABILITY, FOURTEEN CARRIERS, NINE WORDINGS. Every counter filter this engine had reads
 * the target spell's OWN characteristics — type, mana value, color. None could ask what that spell is
 * POINTING AT. The whole family fell out of that single absence.
 *
 * ⭐ GATE 20, SATISFIED SEVERAL TIMES OVER. The filters differ ("a creature" / "a permanent you control" /
 * "an enchantment" / "you" / "a player"), and so do the CARD TYPES — instants and sacrifice-activated
 * creatures alike. Cards well outside any one family share the symptom, which is what makes this one cause
 * rather than a cluster of look-alikes.
 *
 * ⛔ THE TWO HALVES ARE AN **OR**. "Targets you or a permanent you control" (Hindering Light) is one filter
 * with two acceptable answers; an AND would make it uncastable against everything it exists to stop. Pinned.
 *
 * ⛔ `youControl` RIDES THE PERMANENT HALF ONLY. "Targets a creature" (Intervene / Confound) carries no
 * controller scope — narrowing it to your own creatures would make Confound refuse the exact spell it is
 * printed to answer. Pinned in both directions.
 *
 * ⛔ CONTROL IS READ **LIVE**, not off the recorded target entry: a target's controller can change between
 * the spell being cast and the counter being cast (Act of Treason, an Aura, a crewed Vehicle), and CR
 * evaluates the counter's own targeting requirement when the counter is cast. Pinned with a stolen creature.
 *
 * ⛔ ENFORCED AT ENUMERATION, which is where a targeting restriction belongs — a non-matching spell must
 * never be OFFERED, not merely fizzle later. Every runtime pin below drives the enumerator.
 *
 * ⓘ REFUSED, and still parked: "targets this creature" (Mistfolk — a self referent the predicate has no lane
 * for). Fugitive Droid's clause IS admitted; that card parks on its conditional can't-be-blocked line.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * enumeration gate removed -> the witness offers EVERY spell on the stack to Turn Aside; the targetsFilter
 * dropped from the target spec -> identical, via the other end of the same wire; youControl ignored -> an
 * opponent's own creature-targeting spell becomes a legal Turn Aside target.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseSpellTargetsFilter } from "./effects/atoms/stack.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const parse = (s) => parseEffectClause(splitClauses(s)[0], "Instant");

describe("the filter vocabulary", () => {
  it("⭐ every corpus wording parses to its predicate", () => {
    expect(parseSpellTargetsFilter("a permanent you control")).toEqual({ permanent: { types: null, youControl: true } });
    expect(parseSpellTargetsFilter("a creature")).toEqual({ permanent: { types: ["creature"], youControl: false } });
    expect(parseSpellTargetsFilter("a creature you control")).toEqual({ permanent: { types: ["creature"], youControl: true } });
    expect(parseSpellTargetsFilter("an enchantment")).toEqual({ permanent: { types: ["enchantment"], youControl: false } });
    expect(parseSpellTargetsFilter("an artifact or creature you control")).toEqual({ permanent: { types: ["artifact", "creature"], youControl: true } });
    expect(parseSpellTargetsFilter("you")).toEqual({ player: "you" });
    expect(parseSpellTargetsFilter("a player")).toEqual({ player: "any" });
  });

  it("⛔⛔ 'you OR a permanent you control' keeps BOTH halves — an AND would break Hindering Light", () => {
    expect(parseSpellTargetsFilter("you or a permanent you control"))
      .toEqual({ player: "you", permanent: { types: null, youControl: true } });
  });

  it("⛔ an unvetted filter is refused, so the clause parks (CREED)", () => {
    expect(parseSpellTargetsFilter("this creature")).toBeNull();
    expect(parseSpellTargetsFilter("a land you control")).toBeNull();
    expect(parse("counter target spell that targets this creature").atoms).toEqual([]);
  });

  it("⭐ the atom carries the filter; the BARE counter is untouched", () => {
    const p = parse("counter target spell that targets a permanent you control");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell",
      targetsFilter: { permanent: { types: null, youControl: true } } }]);
    expect(parse("counter target spell").atoms).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell" }]);
  });

  it("⭐ whole cards flip, instants AND sacrifice-activated creatures", () => {
    expect(classifyCard({ name: "Turn Aside", type: "Instant", mana: "{U}", oracle: "Counter target spell that targets a permanent you control." })).toBe("native-spell");
    expect(classifyCard({ name: "Outwit", type: "Instant", mana: "{U}", oracle: "Counter target spell that targets a player." })).toBe("native-spell");
    expect(classifyCard({ name: "Hydromorph Guardian", type: "Creature — Elemental", mana: "{2}{U}", power: "2", toughness: "2",
      oracle: "{U}, Sacrifice this creature: Counter target spell that targets a creature you control." })).toBe("native-activated");
  });

  it("⛔ Mistfolk still parks on the refused self referent (an honest FN, not a miss)", () => {
    expect(classifyCard({ name: "Mistfolk", type: "Creature — Illusion", mana: "{U}{U}", power: "1", toughness: "3",
      oracle: "{U}: Counter target spell that targets this creature." })).not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the enumerator only offers spells that are POINTING at a match", () => {
  /**
   * A board where the user controls "mine" and ai controls "theirs", with three spells on the stack:
   *   sMine    → targets the user's creature
   *   sTheirs  → targets the ai's creature
   *   sPlayer  → targets the user (the player)
   */
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, controller, type = "Creature — Bear") => createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: "2", toughness: "2", oracle: "" }, controller });
    const bolt = (id, targets) => createStackObject({ id, kind: "spell", controller: "ai",
      source: { id: `c-${id}`, name: id, type: "Instant", oracle: "" }, targets });
    return { ...g,
      players: { ...g.players,
        user: { ...g.players.user, battlefield: [mk("mine", "user"), mk("myEnch", "user", "Enchantment — Aura")] },
        ai: { ...g.players.ai, battlefield: [mk("theirs", "ai")] } },
      stack: [
        bolt("sMine", [{ type: "creature", id: "mine", controller: "user" }]),
        bolt("sTheirs", [{ type: "creature", id: "theirs", controller: "ai" }]),
        bolt("sPlayer", [{ type: "player", id: "user" }]),
      ] };
  }
  const offered = (state, clause) => expandCastChoices(state, "user", parse(clause), [], {})
    .flatMap((c) => (c.targets || []).map((t) => t.id)).sort();

  it("⭐⭐ each filter offers exactly the spells it should — and no more", () => {
    const s = board();
    const row = {
      bare: offered(s, "counter target spell"),
      permYouControl: offered(s, "counter target spell that targets a permanent you control"),
      creatureAny: offered(s, "counter target spell that targets a creature"),
      creatureYouControl: offered(s, "counter target spell that targets a creature you control"),
      you: offered(s, "counter target spell that targets you"),
      aPlayer: offered(s, "counter target spell that targets a player"),
      youOrPerm: offered(s, "counter target spell that targets you or a permanent you control"),
      enchantment: offered(s, "counter target spell that targets an enchantment"),
    };
    console.log("  WITNESS counterTargetsWhat", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      bare: ["sMine", "sPlayer", "sTheirs"],   // unfiltered — every spell on the stack
      permYouControl: ["sMine"],               // ⭐ NOT sTheirs (wrong controller), NOT sPlayer (not a permanent)
      creatureAny: ["sMine", "sTheirs"],       // ⛔ unscoped — Confound must still answer a spell aimed at THEIRS
      creatureYouControl: ["sMine"],
      you: ["sPlayer"],
      aPlayer: ["sPlayer"],
      youOrPerm: ["sMine", "sPlayer"],         // ⭐⭐ the OR: both halves, which is the whole point of Hindering Light
      enchantment: [],                         // nothing on the stack points at one
    });
  });

  it("⛔⛔ CONTROL IS LIVE — a creature STOLEN since the spell was cast flips legality", () => {
    // sMine's recorded target entry still says controller "user"; the permanent is now the ai's. Turn Aside
    // must no longer see it as "a permanent you control", and the ai's Hydromorph Gull now would.
    const s = board();
    const stolen = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "mine") },
      ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, { ...s.players.user.battlefield.find((p) => p.id === "mine"), controller: "ai" }] } } };
    const row = { beforeSteal: offered(s, "counter target spell that targets a permanent you control"),
      afterSteal: offered(stolen, "counter target spell that targets a permanent you control") };
    console.log("  WITNESS counterTargetsWhat/live", JSON.stringify(row));
    expect(row).toEqual({ beforeSteal: ["sMine"], afterSteal: [] });
  });

  it("⛔ a spell whose target has LEFT the battlefield satisfies nothing (fail-closed)", () => {
    const s = board();
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "mine") } } };
    expect(offered(gone, "counter target spell that targets a permanent you control")).toEqual([]);
  });
});
