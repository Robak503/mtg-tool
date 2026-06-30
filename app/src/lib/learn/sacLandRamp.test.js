/**
 * SAC-LAND-RAMP (Toph TIER-2) — "Sacrifice a land." as a RESOLUTION EFFECT (the controller self-sacs one of
 * their lands of their choice, CR 701.16), the lead clause of the sac-then-fetch ramp spells:
 *   "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield
 *    tapped, then shuffle."   (Roiling Regrowth, Cycle of Renewal)
 *
 * A dedicated atom (atoms/sacLand.applySacrificeLand): the EDICT sacrifice atom is hard-scoped to CREATURES,
 * so a land-victim needs its own pool. Reuses the existing `sacrifice-choice` pause/resume (resolveSacrificeChoice)
 * + the permanent-safe sacrificeCreatureEffect. The FETCH half is the already-proven RAMP-MULTI tutor.
 *
 * Pins: (1) the two real cards classify native-spell + the CREED anti-FP riders stay arbiter-spell; (2) the
 * sac-land atom resolves 0/1/≥2-land boards correctly (no-op / forced / pause); (3) end-to-end through the real
 * program — the sacrifice + the two-basic fetch both resolve (the land leaves, two basics enter, library shrinks).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveSacrificeChoice, resolveTutorChoice, autoPickSacrificeCandidate, autoPickTutorCandidate } from "./effects/runProgram.js";
import { sacrificeLandClauseParser, applySacrificeLand } from "./effects/atoms/sacLand.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ROILING = { name: "Roiling Regrowth", type: "Instant", mana: "{2}{G}", oracle: "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle." };
const CYCLE = { name: "Cycle of Renewal", type: "Instant — Lesson", mana: "{2}{G}", oracle: "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle." };

const isHigh = (oracle, type = "Instant") => programConfidence(parseEffectProgram({ type, oracle })) === "high";

describe("SAC-LAND-RAMP — classification (CREED whole-card)", () => {
  it("Roiling Regrowth + Cycle of Renewal classify native-spell (sac-land + RAMP-MULTI tutor both modeled)", () => {
    expect(classifyCard(ROILING)).toBe("native-spell");
    expect(classifyCard(CYCLE)).toBe("native-spell");
  });

  it("the sac-land + fetch program is exactly [sacrifice-land, tutor remaining:2 → battlefield tapped]", () => {
    const p = parseEffectProgram(ROILING);
    expect(p.atoms).toEqual([
      { op: "sacrifice-land", targetType: null },
      { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null },
    ]);
  });

  it("the clause parser is mechanism-keyed — matches the bare self-sac, rejects count / each-player / filtered", () => {
    expect(sacrificeLandClauseParser("sacrifice a land")).toEqual({ op: "sacrifice-land", targetType: null });
    expect(sacrificeLandClauseParser("sacrifice a land you control")).toEqual({ op: "sacrifice-land", targetType: null });
    expect(sacrificeLandClauseParser("sacrifice two lands")).toBeNull();
    expect(sacrificeLandClauseParser("sacrifice any number of lands")).toBeNull();
    expect(sacrificeLandClauseParser("each player sacrifices a land")).toBeNull();
    expect(sacrificeLandClauseParser("sacrifice a basic land")).toBeNull();
    expect(sacrificeLandClauseParser("sacrifice a creature")).toBeNull();
  });

  // ── CREED anti-FP pins: a sac-then-fetch with an UNMODELED half stays arbiter-spell ──
  it("CREED — Scapeshift (variable 'any number'/'that many'), Entish Restoration ('instead … three' rider) stay arbiter-spell", () => {
    // Scapeshift — "Sacrifice any number of lands. Search … up to THAT MANY land cards …" is a variable count on
    // BOTH halves (unmodeled) → the whole program parses LOW → Arbiter.
    expect(classifyCard({ name: "Scapeshift", type: "Sorcery", mana: "{2}{G}{G}", oracle: "Sacrifice any number of lands. Search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle." })).toBe("arbiter-spell");
    // Entish Restoration — the "If you control a creature with power 4 or greater, instead search … up to three …"
    // conditional rider is an unmodeled sentence → LOW → Arbiter (a SAFE false-negative, never a partial flip).
    expect(classifyCard({ name: "Entish Restoration", type: "Instant", mana: "{2}{G}", oracle: "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. If you control a creature with power 4 or greater, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle." })).toBe("arbiter-spell");
  });

  it("CREED — a bare 'Sacrifice two lands' / 'each player sacrifices a land' spell never parses HIGH", () => {
    expect(isHigh("Sacrifice two lands. Draw a card.")).toBe(false);
    expect(isHigh("Each player sacrifices a land. Draw a card.")).toBe(false);
  });
});

describe("SAC-LAND-RAMP — the sacrifice-land atom resolver", () => {
  const forest = (id) => createPermanent({ id, card: { id, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
  const bear = (id) => createPermanent({ id, card: { id, name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }, controller: "user" });
  function boardWith(perms) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
  }

  it("ZERO lands → a clean no-op (nothing sacrificed, no pause, no crash)", () => {
    const s = boardWith([bear("b1")]);
    const after = applySacrificeLand(s, { op: "sacrifice-land" }, { controller: "user" });
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield.map((p) => p.id)).toEqual(["b1"]); // the creature stays
  });

  it("exactly ONE land → FORCED sacrifice inline (no pause; the land leaves the battlefield)", () => {
    const s = boardWith([forest("f1"), bear("b1")]);
    const after = applySacrificeLand(s, { op: "sacrifice-land" }, { controller: "user" });
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield.find((p) => p.id === "f1")).toBeFalsy(); // gone
    expect(after.players.user.graveyard.some((c) => c.id === "f1")).toBe(true);    // → graveyard
    expect(after.players.user.battlefield.find((p) => p.id === "b1")).toBeTruthy(); // the creature untouched
  });

  it("≥2 lands → PAUSE for the controller's pick (sacrifice-choice with the LAND candidates, no queue)", () => {
    const s = boardWith([forest("f1"), forest("f2"), bear("b1")]);
    const after = applySacrificeLand(s, { op: "sacrifice-land" }, { controller: "user", cardName: "Roiling Regrowth" });
    expect(after.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    // ONLY lands are offered (never the creature), and no chain queue (a single settle then resume).
    expect(after.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["f1", "f2"]);
    expect(after.pendingChoice.queue == null).toBe(true);
    // the auto-pick (AI/Expert) selects one of the offered lands.
    expect(["f1", "f2"]).toContain(autoPickSacrificeCandidate(after, after.pendingChoice));
  });
});

describe("SAC-LAND-RAMP — end-to-end through the real effect program (CREED — genuine resolution)", () => {
  // Drive the whole spell program: sacrifice-land (pauses on ≥2 lands) → settle the pick → tutor (×2) → fetch.
  function runRoiling() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const onBoard = [
      createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" }),
      createPermanent({ id: "f2", card: { id: "f2", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" }),
    ];
    const library = [
      { id: "lib1", name: "Forest", type: "Basic Land — Forest", oracle: "" },
      { id: "lib2", name: "Forest", type: "Basic Land — Forest", oracle: "" },
      { id: "lib3", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" },
    ];
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: onBoard, library } } };
  }

  it("Roiling Regrowth resolves: one land is sacrificed, then two basics enter tapped (library shrinks by two)", () => {
    let st = runRoiling();
    // 1) the sacrifice-land atom (≥2 lands → pause for the pick).
    st = resolveAtom(st, { op: "sacrifice-land" }, { controller: "user", cardName: "Roiling Regrowth" });
    expect(st.pendingChoice).toMatchObject({ kind: "sacrifice-choice", controller: "user" });
    // 2) settle the sacrifice (auto-pick a land) — the land leaves the battlefield.
    st = resolveSacrificeChoice(st, autoPickSacrificeCandidate(st, st.pendingChoice));
    expect(st.pendingChoice).toBeFalsy();                                   // no chain → no re-pause
    expect(st.players.user.battlefield).toHaveLength(1);                    // 2 lands → 1 (one sacrificed)
    expect(st.players.user.graveyard.filter((c) => /Forest/.test(c.name))).toHaveLength(1);
    // 3) now the RAMP-MULTI tutor (remaining:2): fetch both basics from the library onto the battlefield tapped.
    const TUTOR = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null };
    st = resolveAtom(st, TUTOR, { controller: "user", cardName: "Roiling Regrowth" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", remaining: 2, destination: "battlefield", entersTapped: true });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice)); // fetch 1
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice)); // fetch 2
    expect(st.pendingChoice).toBeFalsy();
    // The board: the surviving original land + the two fetched basics = 3 lands, the two fetched ones tapped.
    const lands = st.players.user.battlefield.filter((p) => /Land/.test(p.card.type));
    expect(lands).toHaveLength(3);
    expect(lands.filter((p) => p.tapped)).toHaveLength(2);                  // the two fetched basics enter tapped
    expect(st.players.user.library.filter((c) => /Forest/.test(c.name))).toHaveLength(0); // both basics fetched
  });

  it("a single-land board: Roiling sacrifices that sole land with NO pause, then still fetches (net +1 land)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    let st = {
      ...s,
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: [createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" })],
          library: [{ id: "lib1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, { id: "lib2", name: "Forest", type: "Basic Land — Forest", oracle: "" }],
        },
      },
    };
    st = resolveAtom(st, { op: "sacrifice-land" }, { controller: "user", cardName: "Roiling Regrowth" });
    expect(st.pendingChoice).toBeFalsy();                                   // sole land → forced, no pause
    expect(st.players.user.battlefield).toHaveLength(0);                    // the only land was sacrificed
    const TUTOR = { op: "tutor", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card", destination: "battlefield", entersTapped: true, remaining: 2, targetType: null };
    st = resolveAtom(st, TUTOR, { controller: "user", cardName: "Roiling Regrowth" });
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    expect(st.players.user.battlefield.filter((p) => /Land/.test(p.card.type))).toHaveLength(2); // 0 → fetched 2
  });
});
