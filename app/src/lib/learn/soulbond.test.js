/**
 * soulbond.test.js — BLITZ SL-1 (SOULBOND — pairing + bond grant, CR 702.95).
 *
 * Soulbond is two triggered abilities that PAIR the creature with an unpaired creature you control when either
 * enters (CR 702.95a); while paired, the carrier's static bond ability confers a keyword or +N/+N on BOTH the
 * carrier and its partner (702.95b). The pairing ENDS — and the bond lifts — the instant either creature leaves
 * the battlefield, changes control, or stops being a creature (702.95e).
 *
 * WHAT THIS SLICE MODELS (whole-card-or-park, THE CREED):
 *   - Recognition: a soulbond carrier is native ONLY when its bond is a static +N/+N and/or GRANTABLE keyword
 *     (parseSoulbondBond) AND the rest of the card is keyword-only (stripSoulbondText → isKeywordOnly). 13 of
 *     the 26 corpus carriers qualify.
 *   - Runtime: resolvers.enterPermanent AUTO-PAIRS deterministically at ETB (policy: the first eligible unpaired
 *     creature the controller controls, in battlefield order); layers.staticEffectsOf grants the bond to both
 *     paired ids while the pairing is live; gameState.detachPermanentFromAll (leave) and control.applyGainControl
 *     (control-change) tear the pairing down (CR 702.95e).
 *
 * WHAT PARKS (a safe false-negative — the whole carrier stays Arbiter): a bond that is a quoted TRIGGERED or
 * ACTIVATED ability (Tandem Lookout, Deadeye Navigator, Doom Weaver, Breathkeeper Seraph, Galvanic Alchemist,
 * Stern Mentor, …), protection from a SUBTYPE (Diregraf Escort's "protection from Zombies"), or a carrier with
 * other unmodeled text (Donna Noble's damage-redirect + Doctor's companion). The bond-choice interactivity is
 * deferred (deterministic auto-pair), and a paired creature that stops being a creature via a pure layer effect
 * (no such interaction ships with these carriers) is the one bounded corner — see the module comments.
 *
 * Recognition tests use REAL bundled oracle text (verified via cardIndex.lookupCard, 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, moveCardToZone } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { applyGainControl } from "./effects/atoms/control.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { parseSoulbondBond, stripSoulbondText } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Real bundled oracle (probed via cardIndex.lookupCard, 2026-07-17) ─────────────────────────────
const SB_REMINDER = "Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)";
const REAL = {
  // MODELED — grantable-keyword bonds
  Wingcrafter: { name: "Wingcrafter", type_line: "Creature — Human Wizard", power: "1", toughness: "1", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have flying.` },
  "Silverblade Paladin": { name: "Silverblade Paladin", type_line: "Creature — Human Knight", power: "2", toughness: "2", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have double strike.` },
  "Nightshade Peddler": { name: "Nightshade Peddler", type_line: "Creature — Human Druid", power: "1", toughness: "1", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have deathtouch.` },
  "Lightning Mauler": { name: "Lightning Mauler", type_line: "Creature — Human Berserker", power: "2", toughness: "1", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have haste.` },
  // MODELED — hexproof bond with a SAME-LINE reminder (the paren-strip case)
  "Elgaud Shieldmate": { name: "Elgaud Shieldmate", type_line: "Creature — Human Soldier", power: "2", toughness: "3", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have hexproof. (They can't be the targets of spells or abilities your opponents control.)` },
  // MODELED — +N/+N bonds
  "Trusted Forcemage": { name: "Trusted Forcemage", type_line: "Creature — Human Shaman", power: "2", toughness: "2", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, each of those creatures gets +1/+1.` },
  "Wolfir Silverheart": { name: "Wolfir Silverheart", type_line: "Creature — Wolf Warrior", power: "4", toughness: "4", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, each of those creatures gets +4/+4.` },
  // PARKED — quoted TRIGGERED ability bond
  "Tandem Lookout": { name: "Tandem Lookout", type_line: "Creature — Human Scout", power: "2", toughness: "1", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as Tandem Lookout is paired with another creature, each of those creatures has "Whenever this creature deals damage to an opponent, draw a card."` },
  // PARKED — quoted ACTIVATED ability bond
  "Deadeye Navigator": { name: "Deadeye Navigator", type_line: "Creature — Spirit", power: "5", toughness: "5", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as Deadeye Navigator is paired with another creature, each of those creatures has "{1}{U}: Exile this creature, then return it to the battlefield under your control."` },
  // PARKED — protection from a SUBTYPE (not a grantable keyword / color)
  "Diregraf Escort": { name: "Diregraf Escort", type_line: "Creature — Human Cleric", power: "1", toughness: "1", keywords: ["Soulbond"], oracle: `${SB_REMINDER}\nAs long as this creature is paired with another creature, both creatures have protection from Zombies.` },
  // PARKED — printed keyword body + quoted TRIGGERED bond
  "Breathkeeper Seraph": { name: "Breathkeeper Seraph", type_line: "Creature — Angel", power: "4", toughness: "4", keywords: ["Flying", "Soulbond"], oracle: `Flying, soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as Breathkeeper Seraph is paired with another creature, each of those creatures has "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep."` },
};
const MODELED = ["Wingcrafter", "Silverblade Paladin", "Nightshade Peddler", "Lightning Mauler", "Elgaud Shieldmate", "Trusted Forcemage", "Wolfir Silverheart"];
const PARKED = ["Tandem Lookout", "Deadeye Navigator", "Diregraf Escort", "Breathkeeper Seraph"];

const VANILLA = { id: "bear-c", name: "Grizzly Bears", type_line: "Creature — Bear", oracle: "", power: "2", toughness: "2" };
const cardFor = (name) => ({ id: `${name}-c`, ...REAL[name] });

function soloState(turn = 3) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn };
}

// ─── (A) parseSoulbondBond — the bond parse (real oracle) ───────────────────────────────────────────

describe("parseSoulbondBond — the bond ability parse", () => {
  it("grantable-keyword bond → a lone layer-6 addKeyword descriptor", () => {
    expect(parseSoulbondBond(REAL.Wingcrafter)).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" }, duration: { kind: "permanent" } },
    ]);
    expect(parseSoulbondBond(REAL["Silverblade Paladin"])).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "Double strike" }, duration: { kind: "permanent" } },
    ]);
  });
  it("hexproof bond with a same-line reminder → addKeyword(hexproof) (reminder stripped)", () => {
    expect(parseSoulbondBond(REAL["Elgaud Shieldmate"])).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "hexproof" }, duration: { kind: "permanent" } },
    ]);
  });
  it("+N/+N bond → a layer-7c ptModify descriptor", () => {
    expect(parseSoulbondBond(REAL["Wolfir Silverheart"])).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 4, toughness: 4 }, duration: { kind: "permanent" } },
    ]);
    expect(parseSoulbondBond(REAL["Trusted Forcemage"])).toEqual([
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 1, toughness: 1 }, duration: { kind: "permanent" } },
    ]);
  });
  it("FN guard — a quoted triggered/activated bond → null (parks)", () => {
    expect(parseSoulbondBond(REAL["Tandem Lookout"])).toBeNull();
    expect(parseSoulbondBond(REAL["Deadeye Navigator"])).toBeNull();
  });
  it("FN guard — protection from a subtype → null (parks)", () => {
    expect(parseSoulbondBond(REAL["Diregraf Escort"])).toBeNull();
  });
  it("a non-soulbond card → null", () => {
    expect(parseSoulbondBond({ name: "Grizzly Bears", type_line: "Creature — Bear", oracle: "" })).toBeNull();
  });
  it("stripSoulbondText drops the soulbond keyword + the bond sentence, keeping a printed keyword", () => {
    // Breathkeeper Seraph's residual keeps printed Flying (the reminder paren is left for isKeywordOnly).
    const resid = stripSoulbondText(REAL["Breathkeeper Seraph"]);
    expect(resid).toMatch(/^Flying,/);
    expect(resid).not.toMatch(/paired with another creature/);
    expect(resid.toLowerCase()).not.toMatch(/\bsoulbond\b/);
  });
});

// ─── (B) classifyCard — recognition on REAL oracle ──────────────────────────────────────────────────

describe("classifyCard — soulbond recognition", () => {
  it("every modeled-bond carrier → native-static", () => {
    for (const name of MODELED) {
      expect(classifyCard(cardFor(name)), name).toBe("native-static");
      expect(isNativeTier(classifyCard(cardFor(name))), name).toBe(true);
    }
  });
  it("every unmodelable-bond carrier → body-only (parked)", () => {
    for (const name of PARKED) {
      expect(classifyCard(cardFor(name)), name).toBe("body-only");
      expect(isNativeTier(classifyCard(cardFor(name))), name).toBe(false);
    }
  });
});

// ─── (C) runtime — auto-pair, bond grant, teardown ──────────────────────────────────────────────────

describe("soulbond runtime — pairing + bond grant", () => {
  it("a LONE soulbond creature is unpaired and has no bond", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Wingcrafter"), "user");
    const wc = s.players.user.battlefield.find((p) => p.card.name === "Wingcrafter");
    expect(wc.soulbondPartner).toBeFalsy();
    expect(permanentHasKeyword(s, wc.id, "flying")).toBe(false); // no partner → no bond, even on itself
  });

  it("auto-pairs at ETB and grants a KEYWORD bond to BOTH creatures", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Wingcrafter"), "user"); // soulbond enters first, unpaired
    s = enterPermanent(s, { ...VANILLA }, "user");          // vanilla enters → auto-pairs with Wingcrafter
    const wc = s.players.user.battlefield.find((p) => p.card.name === "Wingcrafter");
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect(wc.soulbondPartner).toBe(bear.id);
    expect(bear.soulbondPartner).toBe(wc.id);
    expect(permanentHasKeyword(s, wc.id, "flying")).toBe(true);
    expect(permanentHasKeyword(s, bear.id, "flying")).toBe(true); // the partner gains it too (CR 702.95b)
  });

  it("auto-pairs when the SOULBOND creature enters SECOND (the other trigger direction)", () => {
    let s = soloState();
    s = enterPermanent(s, { ...VANILLA }, "user");          // vanilla enters first, unpaired
    s = enterPermanent(s, cardFor("Wingcrafter"), "user");  // soulbond enters → pairs with the waiting vanilla
    const wc = s.players.user.battlefield.find((p) => p.card.name === "Wingcrafter");
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect(wc.soulbondPartner).toBe(bear.id);
    expect(permanentHasKeyword(s, bear.id, "flying")).toBe(true);
  });

  it("grants a +N/+N bond to BOTH creatures (layer 7c)", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Wolfir Silverheart"), "user");
    s = enterPermanent(s, { ...VANILLA }, "user");
    const wolf = s.players.user.battlefield.find((p) => p.card.name === "Wolfir Silverheart");
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect([permanentPower(s, wolf.id), permanentToughness(s, wolf.id)]).toEqual([8, 8]); // 4/4 +4/+4
    expect([permanentPower(s, bear.id), permanentToughness(s, bear.id)]).toEqual([6, 6]); // 2/2 +4/+4
  });

  it("two MODELED soulbond creatures pair with each other and STACK their bonds", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Trusted Forcemage"), "user"); // +1/+1 bond
    s = enterPermanent(s, cardFor("Wolfir Silverheart"), "user"); // +4/+4 bond → pairs with the Forcemage
    const fm = s.players.user.battlefield.find((p) => p.card.name === "Trusted Forcemage");
    const wolf = s.players.user.battlefield.find((p) => p.card.name === "Wolfir Silverheart");
    expect(fm.soulbondPartner).toBe(wolf.id);
    // Each carrier grants its OWN bonus to BOTH (CR 702.95b): +1/+1 (Forcemage) + +4/+4 (Wolfir) = +5/+5 each.
    expect([permanentPower(s, fm.id), permanentToughness(s, fm.id)]).toEqual([7, 7]);   // 2/2 + 5/+5
    expect([permanentPower(s, wolf.id), permanentToughness(s, wolf.id)]).toEqual([9, 9]); // 4/4 + 5/+5
  });

  it("the bond LIFTS when the partner LEAVES the battlefield (CR 702.95e)", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Wingcrafter"), "user");
    s = enterPermanent(s, { ...VANILLA }, "user");
    let bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: bear.id });
    const wc = s.players.user.battlefield.find((p) => p.card.name === "Wingcrafter");
    expect(wc.soulbondPartner).toBeFalsy();                       // teardown cleared the back-reference
    expect(permanentHasKeyword(s, wc.id, "flying")).toBe(false);  // bond gone
  });

  it("the bond LIFTS when the partner changes CONTROL (CR 702.95e)", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Wingcrafter"), "user");
    s = enterPermanent(s, { ...VANILLA }, "user");
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    // Opponent gains control of the bear (indefinite gain-control).
    s = applyGainControl(s, { op: "gain-control", targetType: "creature" }, { controller: "ai", targets: [{ type: "creature", id: bear.id }] });
    const wc = s.players.user.battlefield.find((p) => p.card.name === "Wingcrafter");
    const stolen = s.players.ai.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect(stolen).toBeTruthy();                                  // the bear moved to the opponent
    expect(wc.soulbondPartner).toBeFalsy();                       // pairing torn down on control change
    expect(stolen.soulbondPartner).toBeFalsy();
    expect(permanentHasKeyword(s, wc.id, "flying")).toBe(false);  // bond gone on both
    expect(permanentHasKeyword(s, stolen.id, "flying")).toBe(false);
  });

  it("FN guard — an unmodelable-bond soulbond creature (Tandem Lookout) NEVER auto-pairs", () => {
    let s = soloState();
    s = enterPermanent(s, cardFor("Tandem Lookout"), "user");
    s = enterPermanent(s, { ...VANILLA }, "user");
    const tl = s.players.user.battlefield.find((p) => p.card.name === "Tandem Lookout");
    const bear = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect(tl.soulbondPartner).toBeFalsy(); // its whole card stays Arbiter's — no half-modeled pairing
    expect(bear.soulbondPartner).toBeFalsy();
  });
});
