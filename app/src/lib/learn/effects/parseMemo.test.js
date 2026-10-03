/**
 * THE PARSE CACHE — parseMemo.js and its one user, parser.parseEffectClause.
 *
 * WHAT IS PINNED:
 *  - one parse per distinct (clause text, card type, hasX, sourceScoped), and the SAME frozen object back on a repeat;
 *  - every key component separates results (a parse cached for one value is never served for another);
 *  - anything outside the exact key shape is parsed directly, never served from or written to the memo;
 *  - each parser input registry (clause parsers, the two grant-body validators) drops the memo when it changes;
 *  - the memo is bounded and evicts oldest-first;
 *  - the card-level program stamps (additional cost, alternative cost, X from a cost, self-exile, rebound, self-shuffle,
 *    the escalate clamp) land on a copy — the shared clause parse underneath never carries them.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, parseEffectProgram, programConfidence, registerClauseParser } from "./parser.js";
import { memoizedParse, invalidateParseMemo, parseMemoStats, deepFreeze } from "./parseMemo.js";
import { registerGrantTriggeredBodyValidator, registerGrantActivatedBodyValidator } from "./atoms/grantUntilEot.js";
import { isModeledGroupTriggeredBody } from "../triggerRouting.js";
import { isModeledGroupActivatedBody } from "./abilities.js";

beforeEach(() => invalidateParseMemo());

// ---- real card fixtures (generated from the bundled Scryfall data — never typed by hand) ----
const THRILL = {"name":"Thrill of Possibility","type":"Instant","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"As an additional cost to cast this spell, discard a card.\nDraw two cards."};
const TREASURED_FIND = {"name":"Treasured Find","type":"Sorcery","mana":"{B}{G}","cmc":2,"keywords":[],"colors":["B","G"],"oracle":"Return target card from your graveyard to your hand. Exile Treasured Find."};
const CRASH = {"name":"Crash","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"You may sacrifice a Mountain rather than pay this spell's mana cost.\nDestroy target artifact."};
const CLOBBERIN = {"name":"It's Clobberin' Time!","type":"Sorcery","mana":"{2}{G}","cmc":3,"keywords":["Rebound"],"colors":["G"],"oracle":"Choose one —\n• Target creature you control deals damage equal to its power to target creature an opponent controls.\n• Destroy target artifact or enchantment.\nRebound"};
const BLUE_SUN = {"name":"Blue Sun's Zenith","type":"Instant","mana":"{X}{U}{U}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Target player draws X cards. Shuffle Blue Sun's Zenith into its owner's library."};
const TOXIC_DELUGE = {"name":"Toxic Deluge","type":"Sorcery","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn."};
const BORROWED_MALEVOLENCE = {"name":"Borrowed Malevolence","type":"Instant","mana":"{B}","cmc":1,"keywords":["Escalate"],"colors":["B"],"oracle":"Escalate {2} (Pay this cost for each mode chosen beyond the first.)\nChoose one or both —\n• Target creature gets +1/+1 until end of turn.\n• Target creature gets -1/-1 until end of turn."};

/** The same card with the lines / sentence that cause the stamp removed: its body is the stamped card's shared clause parse. */
const withoutLines = (card, test) => ({ ...card, oracle: card.oracle.split("\n").filter((ln) => !test(ln)).join("\n") });

describe("parseMemo — the memo itself", () => {
  it("computes once per key and returns the same object", () => {
    let calls = 0;
    const compute = () => { calls += 1; return { atoms: [{ op: "draw" }] }; };
    const first = memoizedParse("k", compute);
    const second = memoizedParse("k", compute);
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("caches a null result (an unparseable text is as stable as a program)", () => {
    let calls = 0;
    const compute = () => { calls += 1; return null; };
    expect(memoizedParse("nothing", compute)).toBe(null);
    expect(memoizedParse("nothing", compute)).toBe(null);
    expect(calls).toBe(1);
  });

  it("deep-freezes what it stores: a write to a shared result throws", () => {
    const stored = memoizedParse("frozen", () => ({ atoms: [{ op: "draw", nested: { a: 1 } }], modal: { modes: [{ atoms: [] }] } }));
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.atoms)).toBe(true);
    expect(Object.isFrozen(stored.atoms[0])).toBe(true);
    expect(Object.isFrozen(stored.atoms[0].nested)).toBe(true);
    expect(Object.isFrozen(stored.modal.modes[0].atoms)).toBe(true);
    expect(() => { stored.selfExile = true; }).toThrow(TypeError);
    expect(() => { stored.atoms.push({ op: "x" }); }).toThrow(TypeError);
    expect(() => { stored.atoms[0].op = "x"; }).toThrow(TypeError);
  });

  it("deepFreeze passes primitives and null through", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze("text")).toBe("text");
  });

  it("is bounded: at the cap the oldest entry is evicted and the newest kept", () => {
    const { max } = parseMemoStats();
    const calls = new Map();
    const get = (key) => memoizedParse(key, () => { calls.set(key, (calls.get(key) || 0) + 1); return { key }; });
    for (let i = 0; i < max; i++) get(`k${i}`);
    expect(parseMemoStats().size).toBe(max);
    get("one-more");                       // at the cap: evicts k0
    expect(parseMemoStats().size).toBe(max);
    get("one-more");
    expect(calls.get("one-more")).toBe(1); // the newest stayed
    get(`k${max - 1}`);
    expect(calls.get(`k${max - 1}`)).toBe(1); // a recent one stayed
    get("k0");
    expect(calls.get("k0")).toBe(2);       // the oldest was dropped and is recomputed
  });

  it("invalidateParseMemo drops every entry", () => {
    let calls = 0;
    const compute = () => { calls += 1; return { n: calls }; };
    memoizedParse("x", compute);
    invalidateParseMemo();
    expect(parseMemoStats().size).toBe(0);
    memoizedParse("x", compute);
    expect(calls).toBe(2);
  });
});

describe("parseEffectClause — served from the memo", () => {
  it("a repeat parse is the same frozen program, and equals a fresh parse", () => {
    const first = parseEffectClause("Draw two cards.", "Instant", { hasX: false });
    const before = parseMemoStats();
    const second = parseEffectClause("Draw two cards.", "Instant", { hasX: false });
    expect(second).toBe(first);
    expect(parseMemoStats().hits).toBe(before.hits + 1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.atoms[0])).toBe(true);
    const snapshot = JSON.parse(JSON.stringify(first));
    invalidateParseMemo();
    const fresh = parseEffectClause("Draw two cards.", "Instant", { hasX: false });
    expect(fresh).not.toBe(first);
    expect(fresh).toEqual(snapshot);
  });

  it("omitted options and explicit false options are the same parse", () => {
    const bare = parseEffectClause("Draw two cards.", "Instant");
    expect(parseEffectClause("Draw two cards.", "Instant", {})).toBe(bare);
    expect(parseEffectClause("Draw two cards.", "Instant", { hasX: false, sourceScoped: false })).toBe(bare);
  });

  it("hasX is part of the key", () => {
    const plain = parseEffectClause("Draw X cards.", "Instant", { hasX: false });
    const withX = parseEffectClause("Draw X cards.", "Instant", { hasX: true });
    expect(programConfidence(plain)).toBe("low");
    expect(programConfidence(withX)).toBe("high");
    expect(withX.atoms[0]).toMatchObject({ op: "draw", amountX: true });
    // and in the other order, from an empty memo
    invalidateParseMemo();
    expect(programConfidence(parseEffectClause("Draw X cards.", "Instant", { hasX: true }))).toBe("high");
    expect(programConfidence(parseEffectClause("Draw X cards.", "Instant", { hasX: false }))).toBe("low");
  });

  it("sourceScoped is part of the key", () => {
    const clause = "Draw a card if this creature is tapped.";
    const spell = parseEffectClause(clause, "Instant", { hasX: false });
    const trigger = parseEffectClause(clause, "Instant", { hasX: false, sourceScoped: true });
    expect(programConfidence(spell)).toBe("low");
    expect(programConfidence(trigger)).toBe("high");
    expect(trigger.atoms[0]).toMatchObject({ op: "draw", condition: "this creature is tapped" });
    invalidateParseMemo();
    expect(programConfidence(parseEffectClause(clause, "Instant", { hasX: false, sourceScoped: true }))).toBe("high");
    expect(programConfidence(parseEffectClause(clause, "Instant", { hasX: false }))).toBe("low");
  });

  it("the card type is part of the key", () => {
    const asInstant = parseEffectClause("Draw two cards.", "Instant");
    const asCreature = parseEffectClause("Draw two cards.", "Creature");
    expect(asCreature).not.toBe(asInstant);
    expect(JSON.stringify(asCreature)).not.toBe(JSON.stringify(asInstant));
    invalidateParseMemo();
    expect(JSON.stringify(parseEffectClause("Draw two cards.", "Creature"))).toBe(JSON.stringify(asCreature));
    expect(JSON.stringify(parseEffectClause("Draw two cards.", "Instant"))).toBe(JSON.stringify(asInstant));
  });

  it("an option the key does not name is parsed directly", () => {
    const cached = parseEffectClause("Draw two cards.", "Instant", { hasX: false });
    const size = parseMemoStats().size;
    const direct = parseEffectClause("Draw two cards.", "Instant", { hasX: false, somethingNew: true });
    expect(direct).not.toBe(cached);
    expect(direct).toEqual(cached);
    expect(parseMemoStats().size).toBe(size);
  });

  it("a non-boolean option is parsed directly", () => {
    const cached = parseEffectClause("Draw X cards.", "Instant", { hasX: true });
    const size = parseMemoStats().size;
    expect(parseEffectClause("Draw X cards.", "Instant", { hasX: 1 })).not.toBe(cached);
    expect(parseEffectClause("Draw a card if this creature is tapped.", "Instant", { sourceScoped: "yes" }))
      .not.toBe(parseEffectClause("Draw a card if this creature is tapped.", "Instant", { sourceScoped: true }));
    expect(parseMemoStats().size).toBe(size + 1); // only the keyed sourceScoped:true parse was added
  });

  it("a missing text still returns null", () => {
    expect(parseEffectClause("", "Instant")).toBe(null);
    expect(parseEffectClause(null, "Instant")).toBe(null);
    expect(parseEffectClause(undefined, "Instant")).toBe(null);
  });
});

describe("the parser's registries are parse inputs — a registration drops the memo", () => {
  it("registerClauseParser", () => {
    const clause = "Frobnicate the parse memo witness.";
    expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
    registerClauseParser((text) => (/^frobnicate the parse memo witness\.?$/i.test(String(text).trim()) ? { op: "draw", amount: 1, targetType: null } : null));
    const after = parseEffectClause(clause, "Instant");
    expect(programConfidence(after)).toBe("high");
    expect(after.atoms).toEqual([{ op: "draw", amount: 1, targetType: null }]);
  });

  it("registerGrantTriggeredBodyValidator", () => {
    const clause = 'Until end of turn, target creature gains "Whenever this creature deals combat damage to a player, draw a card."';
    registerGrantTriggeredBodyValidator(() => false);
    registerGrantActivatedBodyValidator(() => false);
    expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
    registerGrantTriggeredBodyValidator(isModeledGroupTriggeredBody);
    const after = parseEffectClause(clause, "Instant");
    expect(programConfidence(after)).toBe("high");
    expect(after.atoms[0]).toMatchObject({ op: "grant-until-eot", grantKind: "triggered" });
    registerGrantActivatedBodyValidator(isModeledGroupActivatedBody);
  });

  it("registerGrantActivatedBodyValidator", () => {
    const clause = 'Until end of turn, target creature gains "{T}: Draw a card."';
    registerGrantTriggeredBodyValidator(() => false);
    registerGrantActivatedBodyValidator(() => false);
    expect(programConfidence(parseEffectClause(clause, "Instant"))).toBe("low");
    registerGrantActivatedBodyValidator(isModeledGroupActivatedBody);
    const after = parseEffectClause(clause, "Instant");
    expect(programConfidence(after)).toBe("high");
    expect(after.atoms[0]).toMatchObject({ op: "grant-until-eot", grantKind: "activated" });
    registerGrantTriggeredBodyValidator(isModeledGroupTriggeredBody);
  });

  it("a non-function registration changes nothing and keeps the memo", () => {
    const cached = parseEffectClause("Draw two cards.", "Instant");
    registerGrantTriggeredBodyValidator(null);
    registerGrantActivatedBodyValidator("nope");
    expect(parseEffectClause("Draw two cards.", "Instant")).toBe(cached);
  });
});

describe("card-level stamps go on a copy — the shared clause parse never carries them", () => {
  const stampedTwice = (card) => {
    const first = parseEffectProgram(card);
    const second = parseEffectProgram(card);
    expect(programConfidence(first)).toBe("high");
    expect(second).toEqual(first);
    return first;
  };

  it("an additional cost (Thrill of Possibility)", () => {
    const program = stampedTwice(THRILL);
    expect(program.additionalCosts).toEqual([{ kind: "discard", count: 1 }]);
    const body = parseEffectProgram(withoutLines(THRILL, (ln) => /^as an additional cost/i.test(ln)));
    expect(programConfidence(body)).toBe("high");
    expect(body.atoms).toEqual(program.atoms);
    expect(body.additionalCosts).toBeUndefined();
  });

  it("an alternative cost (Crash)", () => {
    const program = stampedTwice(CRASH);
    expect(program.altCost).toMatchObject({ kind: "sacrificeLands", subtype: "Mountain" });
    const body = parseEffectProgram(withoutLines(CRASH, (ln) => /rather than pay/i.test(ln)));
    expect(programConfidence(body)).toBe("high");
    expect(body.atoms).toEqual(program.atoms);
    expect(body.altCost).toBeUndefined();
  });

  it("X from a pay-X-life cost (Toxic Deluge)", () => {
    const program = stampedTwice(TOXIC_DELUGE);
    expect(program.xSpell).toBe(true);
    expect(program.additionalCosts).toEqual([{ kind: "payLifeX" }]);
    // The body parse the stamps were copied from is the hasX parse of the body line; it does not carry the cost.
    const shared = parseEffectClause("All creatures get -X/-X until end of turn.", "Sorcery", { hasX: true });
    expect(Object.isFrozen(shared)).toBe(true);
    expect(shared.atoms).toEqual(program.atoms);
    expect(shared.additionalCosts).toBeUndefined();
  });

  it("the self-exile retry (Treasured Find)", () => {
    const program = stampedTwice(TREASURED_FIND);
    expect(program.selfExile).toBe(true);
    const body = parseEffectProgram({ ...TREASURED_FIND, oracle: "Return target card from your graveyard to your hand." });
    expect(programConfidence(body)).toBe("high");
    expect(body.atoms).toEqual(program.atoms);
    expect(body.selfExile).toBeUndefined();
  });

  it("rebound (It's Clobberin' Time!)", () => {
    const program = stampedTwice(CLOBBERIN);
    expect(program.selfExile).toBe(true);
    const body = parseEffectProgram(withoutLines(CLOBBERIN, (ln) => /^rebound$/i.test(ln.trim())));
    expect(programConfidence(body)).toBe("high");
    expect(body.modal).toEqual(program.modal);
    expect(body.selfExile).toBeUndefined();
  });

  it("the self-shuffle (Blue Sun's Zenith)", () => {
    const program = stampedTwice(BLUE_SUN);
    expect(program.selfShuffle).toBe(true);
    const body = parseEffectProgram({ ...BLUE_SUN, oracle: "Target player draws X cards." });
    expect(programConfidence(body)).toBe("high");
    expect(body.atoms).toEqual(program.atoms);
    expect(body.selfShuffle).toBeUndefined();
  });

  it("the escalate clamp (Borrowed Malevolence)", () => {
    const program = stampedTwice(BORROWED_MALEVOLENCE);
    expect(program.escalateSingleMode).toBe(true);
    expect(program.modal).toMatchObject({ chooseCount: 1, upTo: false, atLeastOne: false });
    const body = parseEffectProgram(withoutLines(BORROWED_MALEVOLENCE, (ln) => /^escalate/i.test(ln)));
    expect(programConfidence(body)).toBe("high");
    expect(body.escalateSingleMode).toBeUndefined();
    expect(body.modal.modes).toEqual(program.modal.modes);
    expect(body.modal).not.toEqual(program.modal); // "one or both" is not clamped on the unstamped body
  });
});
