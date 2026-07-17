/**
 * bloodToken.test.js — BLITZ TOK-1: the Blood predefined token (CR 111.10).
 *
 * The just-landed ETB-1 park list's largest bucket was predefined-token ETBs: a card whose only
 * unmodeled residue is "create a <predefined> token" parks until that token's built-in activated
 * ability is genuinely modeled (metric-mirrors-runtime — a token we mint MUST resolve its ability,
 * never a stub). Treasure/Clue/Food/Gold were already wired (tokensT2.test.js). This slice adds BLOOD.
 *
 * The REAL Innistrad Blood token (verified via cardIndex.lookupCard — NOT the "draw then discard" the
 * park note paraphrased) is:
 *     Token Artifact — Blood
 *     {1}, {T}, Discard a card, Sacrifice this token: Draw a card.
 * The discard is an ADDITIONAL COST (CR 601.2h — the γ1h discard-cost path already modeled for
 * Rummaging Goblin et al, discardCost.test.js), and the effect is a plain "Draw a card." NAMED_TOKENS
 * stores it with "Sacrifice this artifact" (a wording parseActivatedAbilities recognizes for self-sac;
 * as of BLITZ EQ-2 the printed "Sacrifice this token" wording models identically — CR 701.21a, the noun
 * is cosmetic — proven below), so the full {1}+{T}+discard-a-card+sac-self cost models and the runtime
 * pays all four before the draw resolves.
 *
 * Map (targeted explore + sorcery-speed — the explore atom has NO chosen-target subject), Powerstone
 * (restricted mana, explicitly unmodeled), and Incubator (transform) stay parked (FN guards below).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLOOD_ORACLE = "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.";

// ─── 1. Recognition on REAL oracle — Blood makers flip native ──────────────────
describe("BLITZ TOK-1 — Blood makers classify native (real oracle fixtures)", () => {
  const C = (name, type, oracle) => ({ name, type, oracle });
  const R = ' (It\'s an artifact with "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.")';

  it("ETB create-a-Blood-token creature → native-trigger (Blood Servitor)", () => {
    expect(classifyCard(C("Blood Servitor", "Artifact Creature — Construct",
      "When this creature enters, create a Blood token." + R))).toBe("native-trigger");
  });
  it("combat-damage → Blood, with a keyword → native-trigger (Belligerent Guest)", () => {
    expect(classifyCard(C("Belligerent Guest", "Creature — Vampire",
      "Trample\nWhenever this creature deals combat damage to a player, create a Blood token." + R))).toBe("native-trigger");
  });
  it("ETB create TWO Blood tokens, with a keyword → native-trigger (Falkenrath Celebrants)", () => {
    expect(classifyCard(C("Falkenrath Celebrants", "Creature — Vampire",
      "Menace\nWhen this creature enters, create two Blood tokens." + R.replace("It's", "They're")))).toBe("native-trigger");
  });
  it("two triggers, one making Blood, one sac-artifact payoff → native-trigger (Moonstone Eulogist)", () => {
    expect(classifyCard(C("Moonstone Eulogist", "Creature — Bat Warlock",
      "Flying\nWhenever a creature an opponent controls dies, you create a Blood token." + R +
      "\nWhenever you sacrifice an artifact, put a +1/+1 counter on this creature and you gain 1 life."))).toBe("native-trigger");
  });
  it("sorcery destroy + create two Blood → native-spell (Grisly Ritual)", () => {
    expect(classifyCard(C("Grisly Ritual", "Sorcery",
      "Destroy target creature or planeswalker. Create two Blood tokens." + R.replace("It's", "They're")))).toBe("native-spell");
  });
  it("sorcery drain + create two Blood → native-spell (Vampire's Kiss)", () => {
    expect(classifyCard(C("Vampire's Kiss", "Sorcery",
      "Target player loses 2 life and you gain 2 life. Create two Blood tokens." + R.replace("It's", "They're")))).toBe("native-spell");
  });
  it("ETB Blood + a modeled sac-artifact activated ability → native-mixed (Blood Fountain)", () => {
    expect(classifyCard(C("Blood Fountain", "Artifact",
      "When this artifact enters, create a Blood token." + R +
      "\n{3}{B}, {T}, Sacrifice this artifact: Return up to two target creature cards from your graveyard to your hand."))).toBe("native-mixed");
  });
});

// ─── 2. FN guards — un-wired predefined tokens stay parked (CREED: park, never a stub) ─────
describe("BLITZ TOK-1 — CREED: Map / Powerstone / Incubator makers stay non-native", () => {
  const C = (name, type, oracle) => ({ name, type, oracle });

  it("Map maker (targeted explore + sorcery-speed unmodeled) stays body-only (Cartographer's Companion)", () => {
    // Identical shape to Blood Servitor but the token is a MAP — proves the park is the token's ability,
    // not the ETB shape. Map's "Target creature you control explores" has no chosen-target explore atom.
    expect(classifyCard(C("Cartographer's Companion", "Artifact Creature — Gnome",
      "When this creature enters, create a Map token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")")))
      .not.toMatch(/^native/);
  });
  it("a Blood ETB PLUS an un-wired token rider still parks (whole-card law)", () => {
    // Blood is wired, but the second line makes a MAP (still unmodeled), so the whole card stays body-only.
    expect(classifyCard(C("Fake Blood Weirdo", "Creature — Vampire",
      "When this creature enters, create a Blood token.\nWhenever this creature attacks, create a Map token.")))
      .not.toMatch(/^native/);
  });
  it("Powerstone / Incubator make no create-named-token atom (restricted mana / transform)", () => {
    expect(classifyCard(C("Fake Powerstone Maker", "Artifact",
      "When this artifact enters, create a Powerstone token."))).not.toMatch(/^native/);
    expect(classifyCard(C("Fake Incubator Maker", "Artifact",
      "When this artifact enters, create an Incubator token with two +1/+1 counters on it."))).not.toMatch(/^native/);
  });
});

// ─── 3. parseActivatedAbilities — the token's own ability models fully ──────────────
describe("BLITZ TOK-1 — the Blood token ability parses (discard-a-card additional cost)", () => {
  it("{1},{T},Discard a card,Sacrifice this artifact: Draw a card → fully modeled", () => {
    const [ab] = parseActivatedAbilities({ name: "Blood", type: "Token Artifact — Blood", oracle: BLOOD_ORACLE });
    expect(ab).toMatchObject({ modeled: true, costModeled: true, sacSelf: true, tapSelf: true, discardCard: 1 });
  });
  it("BLITZ EQ-2: the printed 'Sacrifice this token' wording is ALSO recognized as self-sac (CR 701.21a) — both wordings model identically", () => {
    // The self-sac cost noun now includes "token" (EQ-2), so the AS-PRINTED Blood token line models the same
    // as the NAMED_TOKENS "Sacrifice this artifact" form above — confirming that choice was equivalent, not
    // load-bearing. (The noun after "this" is cosmetic; sacrifice moves the source regardless — CR 701.21a.)
    const [ab] = parseActivatedAbilities({ name: "Blood", type: "Token Artifact — Blood",
      oracle: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card." });
    expect(ab).toMatchObject({ modeled: true, costModeled: true, sacSelf: true, tapSelf: true, discardCard: 1 });
  });
});

// ─── 4. Runtime pins — the Blood token enters, is offered, and resolves ──────────────
describe("BLITZ TOK-1 — Blood token resolves end-to-end", () => {
  function bloodPerm(id) {
    const card = { id: `tok-${id}`, name: "Blood", type: "Token Artifact — Blood", oracle: BLOOD_ORACLE, token: true };
    return createPermanent({ id, card, controller: "user", summoningSick: false });
  }
  function forest(id) {
    return createPermanent({ id, card: { id: `c-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
  }
  function mainState(over = {}) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
  }
  const withUser = (s, patch) => ({ ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } });

  it("offered with sacSelf+tapSelf+a pitch; dispatch pays {1}+tap+discard+sac; resolution draws", () => {
    let s = withUser(mainState(), {
      battlefield: [bloodPerm("blood"), forest("f1")],
      hand: [{ id: "h1", name: "Junk", type: "Instant" }],
      library: [{ id: "lib1", name: "Drawn Card" }],
    });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "blood");
    expect(act).toMatchObject({ sacSelf: true, tapSelf: true, discardCardName: "Junk" });
    const dispatched = dispatchAction(s, act);
    expect(dispatched.players.user.battlefield.find((p) => p.id === "blood")).toBeUndefined(); // sac'd as a cost
    expect(dispatched.players.user.graveyard.some((c) => c.name === "Junk")).toBe(true);       // discard cost paid
    expect(dispatched.players.user.battlefield.find((p) => p.id === "f1").tapped).toBe(true);   // {1} paid via the land
    const resolved = resolveTopOfStack(dispatched);
    expect(resolved.players.user.hand.map((c) => c.name)).toEqual(["Drawn Card"]);              // drew a card
    expect(resolved.players.user.graveyard.some((c) => c.name === "Blood")).toBe(false);        // a TOKEN ceases (CR 111.7)
  });

  it("CREED: an empty hand → the discard cost can't be paid → the ability is not offered", () => {
    const s = withUser(mainState(), { battlefield: [bloodPerm("blood"), forest("f1")], hand: [], library: [{ id: "lib1", name: "Top" }] });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "activate-ability" && a.permanentId === "blood")).toBe(false);
  });

  it("a 'create a Blood token' spell resolves to a real Blood artifact carrying the ability", () => {
    const spell = { id: "mk", name: "Make Blood", type: "Sorcery", mana: "{1}", oracle: "Create a Blood token." };
    const s = withUser(mainState(), { battlefield: [forest("f1")], hand: [spell] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "mk");
    expect(cast).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, cast));
    const blood = resolved.players.user.battlefield.find((p) => p.card?.name === "Blood");
    expect(blood).toBeTruthy();
    expect(blood.card.type).toContain("Artifact");
    expect(blood.card.oracle).toBe(BLOOD_ORACLE);
  });
});
