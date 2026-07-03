/**
 * TOKEN-COPY (Wave 5b) — the reusable "create a token that's a copy of {this creature | it}" primitive
 * (CR 707.1) + the in-deck cards whose triggers are already modeled (Miirym, Sentinel Wyrm).
 *
 * DISTINCT from cloneCopy.js (enters-AS-a-copy / Clone). This MINTS a new token whose card IS the
 * source's copiable card (CR 707.2 — printed values, NO counters, NO auras), stamped token:true (the
 * load-bearing non-recurse guard). count routed through the Wave-3a token doubler.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { tokenCopyParser } from "./effects/atoms/tokenCopy.js";
import { detectTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";
import { hasKeyword } from "./keywords.js";

beforeEach(() => _resetIdsForTests());

function stateWith(battlefield, over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield, life: 40 },
      ai: { ...s.players.ai, battlefield: over.aiBf || [], life: 40 },
    },
  };
}
function resolveAll(s) {
  let g = 0;
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  while ((s.stack || []).length && g++ < 50) s = resolveTopOfStack(s);
  return s;
}
const tokensOf = (s, pid = "user") => s.players[pid].battlefield.filter((p) => p.card.token);

// ─── 1. The clause parser (anchored allowlist) ───────────────────────────────────
describe("tokenCopyParser — exact anchors only", () => {
  it("'this creature' → copySource:self", () => {
    expect(tokenCopyParser("create a token that's a copy of this creature")).toEqual({ op: "create-token-copy", copySource: "self", count: 1, targetType: null });
  });
  it("'it' → copySource:triggering", () => {
    expect(tokenCopyParser("create a token that's a copy of it")).toEqual({ op: "create-token-copy", copySource: "triggering", count: 1, targetType: null });
  });
  it("the 'that is a copy' (non-contracted) form also matches", () => {
    expect(tokenCopyParser("create a token that is a copy of it")?.copySource).toBe("triggering");
  });
  it("the isn't-legendary rider is recognized (no-op) — Miirym", () => {
    expect(tokenCopyParser("create a token that's a copy of it, except the token isn't legendary")?.copySource).toBe("triggering");
  });
  it("FORBIDDEN: a STAT/SUBTYPE-add rider (4/4 Hero) → null (whole card non-native)", () => {
    // A P/T + creature-SUBtype change ("4/4 black hero") is still deferred (it changes copiable P/T + feeds
    // the live subtype scopes). Only the clean CARD-TYPE add ("artifact in addition") is now modeled below.
    expect(tokenCopyParser("create a token that's a copy of it, except it's a 4/4 black hero")).toBeNull();
  });
  // ADD-CARD-TYPE rider (Vaultborn Tyrant / Ochre Jelly, CR 707.9a) — "…except it's an artifact in addition
  // to its other types" is now MODELED: the copy gains the card type (prepended to the type line), a faithful
  // whole-card model (NOT a dropped rider). Distinct from the 4/4-Hero form above, which stays deferred.
  it("ADD-CARD-TYPE: '…except it's an artifact in addition to its other types' → addCardTypes:[Artifact]", () => {
    expect(tokenCopyParser("create a token that's a copy of this creature, except it's an artifact in addition to its other types"))
      .toEqual({ op: "create-token-copy", copySource: "self", count: 1, targetType: null, addCardTypes: ["Artifact"] });
    expect(tokenCopyParser("create a token that's a copy of it, except it's an artifact in addition to its other types"))
      .toEqual({ op: "create-token-copy", copySource: "triggering", count: 1, targetType: null, addCardTypes: ["Artifact"] });
    // enchantment is also allowlisted
    expect(tokenCopyParser("create a token that's a copy of it, except it's an enchantment in addition to its other types")?.addCardTypes).toEqual(["Enchantment"]);
  });
  it("CREED: an un-addable card type / a stat-or-subtype variant stays null (no partial copy)", () => {
    // "vehicle" is not an ADDABLE_CARD_TYPES member (it's a subtype-ish word, not a clean permanent card type here)
    expect(tokenCopyParser("create a token that's a copy of it, except it's a vehicle in addition to its other types")).toBeNull();
    // a creature-SUBtype "in addition" (not a card type) is NOT matched by the card-type anchor → null
    expect(tokenCopyParser("create a token that's a copy of it, except it's a Zombie in addition to its other types")).toBeNull();
  });
  it("FORBIDDEN: a TARGET source (Thousand-Faced Shadow) → null", () => {
    expect(tokenCopyParser("create a token that's a copy of another target attacking creature")).toBeNull();
  });
  it("FORBIDDEN: 'another' / counted / filtered copy → null", () => {
    expect(tokenCopyParser("create two tokens that are copies of it")).toBeNull();
    // a TARGET-source copy with a stat/characteristic-change rider is still deferred (it would change the copy):
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except it has haste")).toBeNull();
    // an UNRESTRICTED target ("target creature", no "you control") is not matched — only the you-control form is:
    expect(tokenCopyParser("create a token that's a copy of target creature")).toBeNull();
  });
});

// ─── 1b. TOKEN-COPY-TARGET — "copy of target creature you control" (Quasiduplicate, Cackling Counterpart,
// Self-Reflection, Multiversal Recruitment). Recognition-only: the resolver's copySource:"target" branch
// (ctx.targets[0]) already existed; the parser now emits it with a you-control-restricted creature target. ──
describe("tokenCopyParser — TARGET source (you control)", () => {
  it("'copy of target creature you control' → copySource:target + you-control restriction", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control"))
      .toEqual({ op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] });
  });
  it("the ', except it isn't legendary' tail is a recognized no-op (Multiversal Recruitment)", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except it isn't legendary")?.copySource).toBe("target");
  });
  it("the program needs a chosen target (the cast path picks the creature)", () => {
    const prog = parseEffectClause("create a token that's a copy of target creature you control", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(programNeedsChosenTarget(prog)).toBe(true);
  });
  it("CREED: enumeration offers ONLY the controller's creatures (the you-control restriction is honored)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const cr = (id, ctrl) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: ctrl, summoningSick: false });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [cr("mine", "user")] }, ai: { ...s0.players.ai, battlefield: [cr("theirs", "ai")] } } };
    const atom = { op: "create-token-copy", copySource: "target", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
    expect(enumerateTargets(s, "user", atom).map((t) => t.id)).toEqual(["mine"]); // never the opponent's "theirs"
  });
});

// ─── TOKEN-COPY-KEYWORD rider (Irenicus's Vile Duplication, CR 707.9a) ────────────────────────────────────
// The target-copy form with a MODELED-KEYWORD grant on the copy ("…except the token has flying and it isn't
// legendary"). The keyword is threaded through snapshotCopiedCard's addKeyword rider (the SAME path a clone's
// "it has flying" rider uses → card.keywords → layers' printedKeywords), so the minted token genuinely flies.
describe("tokenCopyParser — TARGET source + keyword-grant rider (Irenicus's Vile Duplication)", () => {
  it("'…except the token has flying and it isn't legendary' → grantKeywords:[flying]", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except the token has flying and it isn't legendary"))
      .toEqual({ op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", grantKeywords: ["flying"], restrictions: [{ kind: "controller", who: "you" }] });
  });
  it("the ', and it isn't legendary' tail is optional (bare keyword rider still parses)", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except the token has flying")?.grantKeywords).toEqual(["flying"]);
  });
  it("multiple grantable keywords parse as a list", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except the token has flying and trample")?.grantKeywords).toEqual(["flying", "trample"]);
  });
  it("CREED: an UN-grantable keyword keeps the whole card null → low → Arbiter (no partial copy)", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except the token has flying and ninjutsu")).toBeNull(); // ninjutsu not layer-grantable
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except the token has hexproof")).toBeNull();           // hexproof not in the combat set
  });
  it("CREED: the bare 'it has <kw>' subject (paired with stat/type riders we don't model) stays null", () => {
    expect(tokenCopyParser("create a token that's a copy of target creature you control, except it has haste")).toBeNull();
  });
  it("the full card parses HIGH and classifies native-spell", () => {
    const C = { type: "Sorcery", mana: "{3}{U}", name: "Irenicus's Vile Duplication", oracle: "Create a token that's a copy of target creature you control, except the token has flying and it isn't legendary." };
    expect(programConfidence(parseEffectClause(C.oracle, C.type))).toBe("high");
    expect(classifyCard(C)).toBe("native-spell");
  });
  it("RUNTIME: copying a GROUND creature mints a token that genuinely FLIES (CR 707.9a)", () => {
    let s = stateWith([bear("ground", { name: "Grizzly Bears", power: 2, toughness: 2, oracle: "" })]); // no flying on the source
    const atom = { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature", grantKeywords: ["flying"], restrictions: [{ kind: "controller", who: "you" }] };
    s = resolveAll(resolveAtom(s, atom, { controller: "user", targets: [{ type: "creature", id: "ground" }] }));
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Grizzly Bears");        // the copied card
    expect(toks[0].card.power).toBe(2);                      // printed P/T
    expect(hasKeyword(toks[0].card, "flying")).toBe(true);  // …but the COPY gained flying (the rider)
    expect(toks[0].card.token).toBe(true);
  });
});

// ─── 1c. TOKEN-COPY-EACH — "For each token you control, create a token that's a copy of that permanent"
// (Second Harvest, CR 707.1). A per-source for-each: copies EACH of the controller's TOKEN permanents once.
// Distinct op (create-token-copy-each) → its own resolver (applyCreateTokenCopyEach), NOT the single-source one.
describe("tokenCopyParser — TOKEN-COPY-EACH (Second Harvest)", () => {
  it("'for each token you control, create a token that's a copy of that permanent' → create-token-copy-each", () => {
    expect(tokenCopyParser("for each token you control, create a token that's a copy of that permanent"))
      .toEqual({ op: "create-token-copy-each", targetType: null });
  });
  it("the non-contracted 'that is a copy' form also matches", () => {
    expect(tokenCopyParser("for each token you control, create a token that is a copy of that permanent")?.op).toBe("create-token-copy-each");
  });
  it("FORBIDDEN: a rider on the copy → null (whole card non-native, CREED)", () => {
    expect(tokenCopyParser("for each token you control, create a token that's a copy of that permanent, except it has flying")).toBeNull();
    // a "nontoken" / other-permanent source is a different effect — not matched
    expect(tokenCopyParser("for each creature you control, create a token that's a copy of that permanent")).toBeNull();
  });
  it("the full card parses HIGH (non-targeted) and classifies native-spell", () => {
    const C = { type: "Instant", mana: "{2}{G}{G}", name: "Second Harvest", oracle: "For each token you control, create a token that's a copy of that permanent." };
    const prog = parseEffectClause(C.oracle, C.type);
    expect(programConfidence(prog)).toBe("high");
    expect(programNeedsChosenTarget(prog)).toBe(false);
    expect(prog.atoms[0]).toMatchObject({ op: "create-token-copy-each" });
    expect(classifyCard(C)).toBe("native-spell");
  });
});

// ─── 2. The atom resolver ────────────────────────────────────────────────────────
const bear = (id, over = {}) => createPermanent({ id, card: { id: `c-${id}`, name: over.name || id, type: over.type || "Creature — Bear", power: over.power ?? 3, toughness: over.toughness ?? 3, oracle: over.oracle || "", keywords: over.keywords || [] }, controller: over.controller || "user", summoningSick: false });
const tokn = (id, over = {}) => createPermanent({ id, card: { id: `c-${id}`, name: over.name || id, type: over.type || "Creature — Beast", power: over.power ?? 2, toughness: over.toughness ?? 2, oracle: over.oracle || "", keywords: over.keywords || [], token: true }, controller: over.controller || "user", summoningSick: false });

describe("create-token-copy-each atom (Second Harvest, CR 707.1)", () => {
  it("copies EACH token you control once; never a nontoken permanent", () => {
    let s = stateWith([tokn("t1", { name: "Saproling", power: 1, toughness: 1 }), tokn("t2", { name: "Beast", power: 3, toughness: 3 }), bear("real", { name: "Real Bear", power: 2, toughness: 2 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    const toks = tokensOf(s);
    expect(toks).toHaveLength(4);                                          // 2 originals + 2 copies
    expect(toks.map((t) => t.card.name).sort()).toEqual(["Beast", "Beast", "Saproling", "Saproling"]);
    expect(toks.some((t) => t.card.name === "Real Bear")).toBe(false);    // the nontoken was NOT copied
  });

  it("SNAPSHOT-FIRST (CR 608.2): the new copies are not themselves re-copied (no doubling/loop)", () => {
    let s = stateWith([tokn("t1", { name: "Saproling", power: 1, toughness: 1 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    // One source token → exactly ONE copy (2 total), NOT a cascade of copies-of-copies.
    expect(tokensOf(s).filter((t) => t.card.name === "Saproling")).toHaveLength(2);
  });

  it("does NOT copy counters (CR 707.2): a 0/0 token with counters yields a 0/0 copy that dies", () => {
    const hydra = { ...tokn("h", { name: "Hydra", power: 0, toughness: 0 }), counters: { "+1/+1": 5 } };
    let s = stateWith([hydra]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    // The original (5 counters → a live 5/5) survives; the copy (printed 0/0, no counters) dies to the lethal SBA.
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].id).toBe("h");                       // the original
    expect(toks[0].counters["+1/+1"]).toBe(5);          // its counters intact
  });

  it("ZERO source tokens → ZERO copies (a clean no-op, never a fabricated body)", () => {
    let s = stateWith([bear("real", { name: "Real Bear" })]);   // only a nontoken
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    expect(tokensOf(s)).toHaveLength(0);                          // no token copies minted
    expect(s.players.user.battlefield).toHaveLength(1);          // the nontoken Real Bear is untouched
  });

  it("the token doubler (Doubling Season) makes TWO copies of each source token", () => {
    const ds = createPermanent({ id: "ds", card: { id: "c-ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." }, controller: "user", summoningSick: false });
    let s = stateWith([ds, tokn("t1", { name: "Wolf", power: 2, toughness: 2 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    // 1 source Wolf token → doubler → 2 copies; plus the original = 3 Wolves total.
    expect(tokensOf(s).filter((t) => t.card.name === "Wolf")).toHaveLength(3);
  });

  it("each minted copy fires its own ETB trigger on entry (CR 603.6a)", () => {
    let s = stateWith([tokn("w", { name: "Warden", power: 1, toughness: 1, oracle: "Whenever a creature you control enters, you gain 1 life." })]);
    // Copying the Warden token mints a Warden token; both the source watcher AND the copy's own watcher fire.
    s = resolveAll(resolveAtom(s, { op: "create-token-copy-each", targetType: null }, { controller: "user", targets: [] }));
    expect(s.players.user.life).toBeGreaterThan(40);
  });
});

describe("create-token-copy atom (CR 707.1)", () => {
  it("SELF: copies the ability source (ctx.sourceId)", () => {
    let s = stateWith([bear("src", { name: "Scout", power: 2, toughness: 2 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "src", targets: [] }));
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Scout");
    expect(toks[0].card.power).toBe(2);
    expect(toks[0].card.token).toBe(true);
  });

  it("TRIGGERING: copies the triggering permanent (ctx.triggeringPermanentId)", () => {
    let s = stateWith([bear("trg", { name: "Drake", power: 4, toughness: 4 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "triggering", count: 1 }, { controller: "user", triggeringPermanentId: "trg", targets: [] }));
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Drake");
    expect(toks[0].card.token).toBe(true);
  });

  it("TARGET: copies the chosen creature (ctx.targets[0]) — Quasiduplicate / Self-Reflection", () => {
    let s = stateWith([bear("chosen", { name: "Phoenix", power: 5, toughness: 4 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "target", count: 1, targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "chosen" }] }));
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Phoenix");
    expect(toks[0].card.power).toBe(5);
    expect(toks[0].card.token).toBe(true);
  });

  it("no copy source resolvable → ZERO tokens (CR 111.12), never a fabricated body", () => {
    let s = stateWith([]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", targets: [] }));
    expect(tokensOf(s)).toHaveLength(0);
  });

  // FP GUARD 3 — CR 707.2 copiable values exclude counters.
  it("does NOT copy +1/+1 counters (CR 707.2 — copies the card, not the permanent)", () => {
    const src = { ...bear("src", { name: "Hydra", power: 0, toughness: 0 }), counters: { "+1/+1": 5 } };
    let s = stateWith([src]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "src", targets: [] }));
    const toks = tokensOf(s);
    // The copied card is a printed 0/0 — with no counters it dies to the lethal SBA, leaving zero tokens.
    expect(toks).toHaveLength(0);
    // Prove the source still has its counters (only the COPY lacked them) and a 3/3 source copies fine.
    const src2 = { ...bear("s2", { name: "Beast", power: 3, toughness: 3 }), counters: { "+1/+1": 2 } };
    let s2 = stateWith([src2]);
    s2 = resolveAll(resolveAtom(s2, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "s2", targets: [] }));
    const t2 = tokensOf(s2)[0];
    expect(t2.card.power).toBe(3);              // printed P/T copied
    expect(t2.counters?.["+1/+1"] || 0).toBe(0); // NO counters copied
  });

  // FP GUARD 2 — the Wave-3a token doubler composes.
  it("token doubler (Doubling Season) makes 2 copies", () => {
    const ds = createPermanent({ id: "ds", card: { id: "c-ds", name: "Doubling Season", type: "Enchantment", oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." }, controller: "user", summoningSick: false });
    let s = stateWith([ds, bear("src", { name: "Wolf", power: 2, toughness: 2 })]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "src", targets: [] }));
    expect(tokensOf(s).filter((t) => t.card.name === "Wolf")).toHaveLength(2);
  });

  // FP GUARD 4 — the copy ENTERS, firing its own ETB triggers.
  it("the token copy fires its own ETB trigger on entry (CR 603.6a)", () => {
    let s = stateWith([bear("src", { name: "Warden", power: 1, toughness: 1, oracle: "Whenever a creature you control enters, you gain 1 life." })]);
    // Copying the Warden mints a Warden token; both the SOURCE Warden (watcher) AND the copy's own watcher
    // fire on the copy's entry → at least the source's +1.
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "src", targets: [] }));
    expect(s.players.user.life).toBeGreaterThan(40);
  });

  // The copy is never a commander even if the source was (CR 903.3, via snapshotCopiedCard).
  it("a copy of a commander is not a commander", () => {
    const cmd = { ...bear("cmd", { name: "General" }), card: { id: "c-cmd", name: "General", type: "Legendary Creature — Human", power: 3, toughness: 3, isCommander: true } };
    let s = stateWith([cmd]);
    s = resolveAll(resolveAtom(s, { op: "create-token-copy", copySource: "self", count: 1 }, { controller: "user", sourceId: "cmd", targets: [] }));
    expect(tokensOf(s)[0].card.isCommander).toBe(false);
  });
});

// ─── 3. Miirym, Sentinel Wyrm (the flagship in-deck card) ─────────────────────────
const MIIRYM = "Flying, ward {2}\nWhenever another nontoken Dragon you control enters, create a token that's a copy of it, except the token isn't legendary.";
const miirym = (controller = "user") => createPermanent({ id: "miirym", card: { id: "c-miirym", name: "Miirym, Sentinel Wyrm", type: "Legendary Creature — Dragon Spirit", power: 4, toughness: 4, oracle: MIIRYM }, controller, summoningSick: false });
// enterPermanent(state, card, controller) — pass the CARD (it mints the permanent and fires ETB watchers).
const dragonCard = (over = {}) => ({ id: `c-${over.id || "d"}`, name: over.name || "Ancient Dragon", type: "Creature — Dragon", power: over.power ?? 5, toughness: over.toughness ?? 5, oracle: over.oracle || "Flying", keywords: ["flying"] });

describe("Miirym, Sentinel Wyrm — trigger → token copy", () => {
  it("detects the trigger as otherSubtypeYouControl + nontokenFilter", () => {
    const trigs = detectTriggers(miirym().card);
    const t = trigs.find((d) => d.event === "permanentEnters" || d.event === "etb");
    expect(t).toBeTruthy();
    expect(t.scope).toBe("otherSubtypeYouControl");
    expect(t.subtypeFilter).toBe("Dragon");
    expect(t.nontokenFilter).toBe(true);
  });

  it("the trigger effect parses to the token-copy program (HIGH, non-targeted)", () => {
    const prog = parseEffectClause("create a token that's a copy of it, except the token isn't legendary", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(programNeedsChosenTarget(prog)).toBe(false);
    expect(prog.atoms[0]).toMatchObject({ op: "create-token-copy", copySource: "triggering" });
  });

  it("a nontoken Dragon entering makes exactly ONE Miirym copy", () => {
    let s = stateWith([miirym()]);
    s = enterPermanent(s, dragonCard({ id: "d1", name: "Bronze Dragon" }), "user");
    s = resolveAll(s);
    const copies = tokensOf(s).filter((t) => t.card.name === "Bronze Dragon");
    expect(copies).toHaveLength(1);
    expect(copies[0].card.token).toBe(true);
  });

  // FP GUARD 1 — NON-RECURSE: the copy is token:true → the nontoken gate skips it → no infinite loop.
  it("the Miirym copy (a token) does NOT re-trigger Miirym (non-recurse, no loop)", () => {
    let s = stateWith([miirym()]);
    s = enterPermanent(s, dragonCard({ id: "d1", name: "Bronze Dragon" }), "user");
    s = resolveAll(s);
    // One nontoken Dragon entry → exactly ONE copy. The copy is a TOKEN Dragon entering, but Miirym's
    // "another NONTOKEN Dragon" gate excludes it, so it mints zero further copies (no loop).
    expect(tokensOf(s).filter((t) => t.card.name === "Bronze Dragon")).toHaveLength(1);
    // Total tokens: exactly the 1 copy (the real entered Dragon is nontoken, Miirym itself isn't a token).
    expect(tokensOf(s)).toHaveLength(1);
  });

  it("a TOKEN Dragon entering does NOT trigger Miirym (nontoken gate)", () => {
    let s = stateWith([miirym()]);
    s = enterPermanent(s, { id: "c-tokd", name: "Dragon Token", type: "Creature — Dragon", power: 4, toughness: 4, token: true }, "user");
    s = resolveAll(s);
    // Only the manually-entered token exists; Miirym made no copy of it.
    expect(tokensOf(s)).toHaveLength(1);
  });

  it("an OPPONENT's nontoken Dragon does NOT trigger Miirym (controller-gated)", () => {
    let s = stateWith([miirym()]);
    s = enterPermanent(s, dragonCard({ id: "od", name: "Enemy Dragon" }), "ai");
    s = resolveAll(s);
    expect(tokensOf(s, "user")).toHaveLength(0);
  });
});
