/**
 * THE GREAT HENGE — an ETB enters-watcher whose payoff is a COMPOUND single sentence: "put a +1/+1 counter on
 * it AND draw a card" (the counter is the LEADING conjunct of an "and"-join, NOT a "."-split sentence). The
 * per-sentence rewriteEtbEnteringPronoun only handled a whole-clause counter or a "."-split follow-up, so the
 * compound-leading "on it" stayed verbatim → the program parsed LOW → the whole card fell to body-only. This
 * slice adds the compound-leading counter referent rewrite ("counter on it and …" → "counter on the triggering
 * creature and …"): the "it" is unambiguously the entering creature (CR 608.2c), and the "and <follow-up>" tail
 * is left verbatim for the parser to model all-or-nothing.
 *
 * With that, The Great Henge is FULLY native — the mana ability ({T}: Add {G}{G}. You gain 2 life.) already
 * classifies native-mana, the dynamic self-cost-reduction ("costs {X} less … greatest power you control") is
 * stripped as a modeled cost modifier, and this ETB trigger now routes → the card classifies native-mana with
 * every clause modeled. Engine-first (THE CREED): the counter must LAND on the entering creature AND the draw
 * must fire.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HENGE_ORACLE =
  "This spell costs {X} less to cast, where X is the greatest power among creatures you control.\n" +
  "{T}: Add {G}{G}. You gain 2 life.\n" +
  "Whenever a nontoken creature you control enters, put a +1/+1 counter on it and draw a card.";
const henge = { name: "The Great Henge", type: "Legendary Artifact", oracle: HENGE_ORACLE };

describe("THE GREAT HENGE — detection + classification", () => {
  it("the ETB trigger's 'counter on it and draw' is rewritten to the entering-creature referent + parses HIGH", () => {
    const t = detectTriggers(henge).find((d) => d.event === "etb");
    expect(t).toMatchObject({ event: "etb", scope: "creatureYouControl", nontokenFilter: true });
    expect(t.effectClause).toBe("put a +1/+1 counter on the triggering creature and draw a card");
    const p = parseEffectClause(t.effectClause, "Instant", {});
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["add-counter", "draw"]);
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", target: "thatCreature" });
    expect(triggerRoutesNatively(t)).toBe(true);
  });

  it("classifies native (all three clauses modeled: mana ability + dynamic cost reduction + ETB counter/draw)", () => {
    expect(classifyCard(henge)).toBe("native-mana");
  });
});

describe("THE GREAT HENGE — engine-first: the counter lands on the entering creature and a card is drawn", () => {
  it("a nontoken creature entering gets a +1/+1 counter AND draws a card for the controller", () => {
    const hengePerm = createPermanent({
      id: "henge",
      card: { id: "c-henge", name: "The Great Henge", type: "Legendary Artifact", oracle: HENGE_ORACLE },
      controller: "user",
    });
    const entering = createPermanent({
      id: "beast",
      card: { id: "c-beast", name: "Beast", type: "Creature — Beast", power: 2, toughness: 2, oracle: "" },
      controller: "user",
      summoningSick: true,
    });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      activePlayer: "user",
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: [hengePerm, entering],
          library: [{ id: "lib1", name: "Forest", type: "Land" }, { id: "lib2", name: "Island", type: "Land" }],
          hand: [],
        },
      },
    };
    expect(s.players.user.hand.length).toBe(0);
    s = checkEnterTriggers(s, entering);
    expect((s.pendingTriggers || []).length).toBe(1);
    let g = 0;
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while ((s.stack || []).length && g++ < 25) s = resolveTopOfStack(s);
    const beast = s.players.user.battlefield.find((p) => p.id === "beast");
    expect(beast.counters["+1/+1"]).toBe(1); // the counter landed on the ENTERING creature (not the Henge)
    expect(s.players.user.hand.length).toBe(1); // and a card was drawn
    expect(s.players.user.library.length).toBe(1);
  });
});

describe("THE GREAT HENGE — CREED near-misses (must NOT flip native)", () => {
  it("a SELF-scope compound counter+draw stays body-only (different referent path, unaffected)", () => {
    // "this creature attacks, put a +1/+1 counter on it. Draw a card." — "it" is the SOURCE (self), a distinct
    // path (SELF_COUNTER_IT_RE, whole-clause anchored); the ETB compound-leading rewrite must not touch it.
    expect(classifyCard({ type: "Creature — Beast", name: "Rider", oracle: "Whenever this creature attacks, put a +1/+1 counter on it. Draw a card." })).toBe("body-only");
  });

  it("an ETB counter with an UNMODELED 'and' follow-up stays body-only (parser re-gates the whole clause)", () => {
    expect(classifyCard({ type: "Legendary Artifact", name: "Fake Henge", oracle: "Whenever a nontoken creature you control enters, put a +1/+1 counter on it and each opponent gains control of a random permanent you control." })).toBe("body-only");
  });

  it("a SPELL's anaphoric 'counter on it and draw' is never rewritten (not an ETB enters-watcher) → arbiter-spell", () => {
    expect(classifyCard({ type: "Instant", name: "Anaphor", oracle: "Return target creature card from your graveyard to the battlefield. Put a +1/+1 counter on it and draw a card." })).toBe("arbiter-spell");
  });
});
