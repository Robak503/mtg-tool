/**
 * korvoldSelfName.test.js — KORVOLD, FAE-CURSED KING (2026-08-14) and the trigger-payload SELF-NAME pass.
 * "Whenever Korvold enters or attacks, sacrifice another permanent. / Whenever you sacrifice a
 * permanent, put a +1/+1 counter on Korvold and draw a card."
 *
 * ⭐ TWO PIECES, EIGHT CARDS (flip-diff +8/0/0, every oracle audited — Kraum, Shabraz, General Traag,
 * Neva, Trelasarra, Black Widow, Abomination Irradiated Brute; each blocked ONLY by its self-name or
 * the 'another' pool):
 *   · the MID-CLAUSE counter-on-name arm on rewriteSelfNameToThisCreature (the EXISTING pure-promotion
 *     machinery): 'put a/that many +1/+1 counter(s) on <Name>[ and …|, then …]' — whole-clause anchored.
 *     ⛔ A BLANKET selfNormalizeOracle pass was tried FIRST and REMOVED at the gate: it corrupted token
 *     NAMES ('Koma's Coil'), tutor filters ('a card named Screaming Seahawk'), a dotted name severed by
 *     the sentence splitter ('Black Waltz No. 3' — a live LOST regression), and seven witness files
 *     failed. Self-names ride ANCHORED grammars only; the dotted-name pin stays below as the guard.
 *   · "sacrifice ANOTHER permanent" (CR 109.5): excludeSource on the controller-sac arm → the queue
 *     head's excludeId → the chain's candidate filter. The source is never its own victim.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the counter-on-name arm dropped → Korvold parks (the named payload goes unreadable).
 *   · the excludeId filter dropped from the chain → Korvold ALONE sacrifices HIMSELF (the self-victim
 *     FP the seen-to-fail control proves the plain pool WOULD produce).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14 — full texts).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KORVOLD = { name: "Korvold, Fae-Cursed King", type: "Legendary Creature — Dragon Noble", mana: "{2}{B}{R}{G}",
  keywords: [], power: "4", toughness: "4",
  oracle: "Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card." };
const BLACK_WALTZ = { name: "Black Waltz No. 3", type: "Legendary Creature — Wizard", mana: "{1}{B}{B}",
  keywords: [], power: "2", toughness: "2",
  oracle: "Flying, deathtouch\nWhenever you cast a noncreature spell, Black Waltz No. 3 deals 2 damage to each opponent." };

const board = (perms) => {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: perms } } };
};
const korvoldPerm = () => createPermanent({ id: "KOR", controller: "user", summoningSick: false, card: { id: "c-KOR", ...KORVOLD } });
const food = (id) => createPermanent({ id, controller: "user", summoningSick: false,
  card: { id: "c-" + id, name: "Food", type: "Artifact — Food", oracle: "", token: true } });
const runSac = (s, clause) => {
  const prog = parseEffectClause(clause, "Instant", { hasX: false });
  return runEffectProgram(s, { source: { name: "Korvold" }, payload: { params: { program: prog, controller: "user", targets: [], sourceId: "KOR" } } });
};
const bf = (s) => s.players.user.battlefield.map((p) => p.id).sort();

describe("the carriers and the two payload triggers", () => {
  it("⭐ Korvold flips native-trigger; both payloads normalize to the pronoun forms", () => {
    expect(classifyCard(KORVOLD)).toBe("native-trigger");
    const trigs = detectTriggers(KORVOLD);
    expect(trigs.map((t) => t.effectClause)).toEqual([
      "sacrifice another permanent",       // the enters half of the batch
      "sacrifice another permanent",       // the attacks half
      "put a +1/+1 counter on this creature and draw a card",
    ]);
  });

  it("⛔ REGRESSION PIN — the DOTTED name survives (Black Waltz No. 3 stays native)", () => {
    expect(classifyCard(BLACK_WALTZ)).toBe("native-trigger");
    const t = detectTriggers(BLACK_WALTZ)[0];
    // The full name won longest-first on the ASSEMBLED clause — never the first-word "Black" bite.
    expect(t.effectClause).toBe("this creature deals 2 damage to each opponent");
  });

  it("⭐ family spot-checks (each was blocked only by its self-name)", () => {
    expect(classifyCard({ name: "Trelasarra, Moon Dancer", type: "Legendary Creature — Elf Cleric", mana: "{G}{W}", keywords: [], power: "2", toughness: "2",
      oracle: "Whenever you gain life, put a +1/+1 counter on Trelasarra and scry 1." })).toBe("native-trigger");
    expect(classifyCard({ name: "Shabraz, the Skyshark", type: "Legendary Creature — Shark Bird", mana: "{2}{W}{U}", keywords: [], power: "3", toughness: "3",
      oracle: "Partner with Brallin, Skyshark Rider\nFlying\nWhenever you draw a card, put a +1/+1 counter on Shabraz and you gain 1 life.\n{W/U}: Target Human gains flying until end of turn." })).toBe("native-mixed");
    // Thraximundar stays PARKED under the anchored build (its other trigger's "of their choice" wording
    // is outside this slice) — the blanket pass had flipped it, and dropping that over-reach is the point.
    expect(classifyCard({ name: "Thraximundar", type: "Legendary Creature — Zombie Assassin", mana: "{4}{U}{B}{R}", keywords: [], power: "6", toughness: "6",
      oracle: "Haste\nWhenever Thraximundar attacks, defending player sacrifices a creature of their choice.\nWhenever a player sacrifices a creature, you may put a +1/+1 counter on Thraximundar." })).toBe("body-only");
  });
});

describe("⭐⭐ LAW 6 — 'another' binds: Korvold is never his own victim", () => {
  it("⭐⭐ with one other permanent, the OTHER is sacrificed (forced sole pick); Korvold survives", () => {
    const s = runSac(board([korvoldPerm(), food("F1")]), "sacrifice another permanent");
    const row = { battlefield: bf(s) };
    console.log("  WITNESS korvoldAnother", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ battlefield: ["KOR"] }); // the Food died, Korvold did not
  });

  it("⭐⭐ ALONE, nothing is sacrificed (an empty pool is a clean skip — never a self-victim)", () => {
    const s = runSac(board([korvoldPerm()]), "sacrifice another permanent");
    expect(bf(s)).toEqual(["KOR"]);
  });

  it("⛔ SEEN-TO-FAIL control: the PLAIN pool ('sacrifice a permanent') sacrifices Korvold when alone", () => {
    const s = runSac(board([korvoldPerm()]), "sacrifice a permanent");
    expect(bf(s)).toEqual([]); // without the exclusion the source IS the sole legal victim — the fate 'another' prevents
  });
});
