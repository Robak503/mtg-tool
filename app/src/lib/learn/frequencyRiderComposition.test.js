/**
 * frequencyRiderComposition.test.js — the once-each-turn rider in the COMPOSITE residue chain.
 *
 * `permanentTriggersCovered` and `permanentFullyCovered` each strip the sentences that belong to a modeled
 * trigger's own effect before deciding whether anything unmodeled is left. They are supposed to mirror each
 * other. They had DRIFTED: the frequency riders ("Do this only once each turn." / "This ability triggers only
 * once each turn.") were stripped in the trigger tier and not in the composite one.
 *
 * The consequence is only visible in composition. A card whose trigger carries the rider classified fine when
 * the trigger was its whole body, and PARKED the moment it also had an activated ability — the trigger-sentence
 * strip stops at the first period, so the rider survived as apparent residue and the composite gate read it as
 * unmodeled text. Elvish Warmaster and Dramatic Finale sat there, each half classifying alone.
 *
 * ⛔ STRIPPING A FREQUENCY RIDER IS ONLY HONEST IF THE RUNTIME ENFORCES IT, and that was checked on a board
 * rather than inherited from the sibling strip's comment: two Elves entering in the SAME turn produce exactly
 * ONE token. An unenforced rider stripped here would credit a trigger that fires every time.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";

const WARMASTER_TRIG = "Whenever one or more other Elves you control enter, create a 1/1 green Elf Warrior creature token. This ability triggers only once each turn.";
const WARMASTER_ACT = "{5}{G}{G}: Elves you control get +2/+2 and gain deathtouch until end of turn.";
const wm = (oracle) => ({ name: "Elvish Warmaster", type: "Creature — Elf Warrior", mana: "{2}{G}", power: "2", toughness: "2", oracle });

describe("the rider no longer blocks composition", () => {
  it("trigger-with-rider ALONE was always fine", () => {
    expect(classifyCard(wm(WARMASTER_TRIG))).toMatch(/^native/);
  });

  it("activated ALONE was always fine", () => {
    expect(classifyCard(wm(WARMASTER_ACT))).toMatch(/^native/);
  });

  it("⭐ and now the two COMPOSE — the case that parked", () => {
    expect(classifyCard(wm(`${WARMASTER_TRIG}\n${WARMASTER_ACT}`))).toMatch(/^native/);
  });

  it("the other rider wording composes too", () => {
    const card = wm("Whenever a creature you control dies, draw a card. Do this only once each turn.\n{2}: Elves you control get +1/+1 until end of turn.");
    expect(classifyCard(card)).toMatch(/^native/);
  });
});

describe("⛔ CREED — the strip is earned by the runtime, not assumed", () => {
  it("⭐ THE LOAD-BEARING ONE — two Elves entering the SAME turn make exactly ONE token", () => {
    // If the latch did not hold, stripping the rider would credit a card whose trigger fires every time —
    // strictly stronger than printed. This is the assertion that makes the strip honest.
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const warmaster = createPermanent({ id: "wm", card: { id: "cwm", name: "Elvish Warmaster", type: "Creature — Elf Warrior", power: 2, toughness: 2, oracle: WARMASTER_TRIG }, controller: "user", summoningSick: false });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [warmaster] } },
    };
    const tokenCount = () => (s.players.user.battlefield || []).filter((p) => /Elf Warrior/.test(p.card?.name || "") && p.id !== "wm").length;
    const enterElf = (id) => {
      const elf = createPermanent({ id, card: { id: `c-${id}`, name: "Llanowar Elves", type: "Creature — Elf Druid", power: 1, toughness: 1, oracle: "" }, controller: "user" });
      s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, elf] } } };
      s = flushTriggers(checkEnterTriggers(s, elf), { chooseTargets: chooseTriggerTargets });
      let g = 0;
      while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    };
    enterElf("e1");
    expect(tokenCount()).toBe(1);
    enterElf("e2");
    expect(tokenCount()).toBe(1); // ⭐ still one — the latch dropped the second firing
  });

  it("an UNMODELED sibling clause still parks the card", () => {
    expect(classifyCard(wm(`${WARMASTER_TRIG}\n${WARMASTER_ACT}\nEach opponent glorbulates at dawn.`))).not.toMatch(/^native/);
  });
});
