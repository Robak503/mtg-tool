/**
 * Tests for narrator.js — the NARRATOR/LOG LEGIBILITY wave (N1, N2, N5).
 *
 * N1: grammar + pod-awareness. Beginner-mode step narration must never
 *     produce "You's"/"You draws"/"You chooses"-class broken English, and
 *     a 3+ seat pod must never collapse every AI seat into "The opponent"
 *     or say "both players" when there are more than two.
 * N2: declare-attacker/declare-blocker narration must name the defender/
 *     attacker so a pod's combat menu isn't N byte-identical lines.
 * N5: narrateAction cases for previously-unhandled action kinds.
 *
 * All CR citations rendered by narrator.js must resolve against the real
 * bundled Comprehensive Rules — the CITE-GUARD test below loads
 * knowledge/mtg-judge/data/cr/cr_current.json and fails if any `rule
 * N.N[a]` string in narrator.js doesn't exist as a key in that file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { narrateStep, narrateAction, narrateDecision } from "./narrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeState({ activePlayer = "user", phase = "precombat-main", step = "main", turn = 1, startingPlayer = "user", turnOrder } = {}) {
  const state = {
    ...createGameState({ userDeck: [], aiDeck: [] }),
    activePlayer,
    phase,
    step,
    turn,
    startingPlayer,
  };
  return turnOrder ? { ...state, turnOrder } : state;
}

// A 4-seat Commander pod: user + ai1 + ai2 + ai3.
function makePodState({ activePlayer = "user", step = "main", phase = "precombat-main", turn = 1, startingPlayer = "user" } = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base,
    turnOrder: ["user", "ai1", "ai2", "ai3"],
    players: {
      user: base.players.user,
      ai1: base.players.ai,
      ai2: { ...base.players.ai },
      ai3: { ...base.players.ai },
    },
    activePlayer,
    step,
    phase,
    turn,
    startingPlayer,
  };
}

const ALL_STEPS = [
  "untap", "upkeep", "draw", "main", "beginning-of-combat",
  "declare-attackers", "declare-blockers", "first-strike-damage",
  "combat-damage", "end-of-combat", "end", "cleanup",
];

beforeEach(() => {
  _resetIdsForTests();
});

describe("N1 — grammar guard: no broken-English constructions", () => {
  const BROKEN = /(You's|You (draws|chooses|discards|untap step|upkeep|cleanup step))/;

  for (const step of ALL_STEPS) {
    for (const activePlayer of ["user", "ai"]) {
      it(`step=${step} activePlayer=${activePlayer} (1v1) never renders broken grammar`, () => {
        const state = makeState({ activePlayer, step, turnOrder: ["user", "ai"] });
        const text = narrateStep(state, { difficulty: "beginner" });
        expect(text).not.toMatch(BROKEN);
      });

      it(`step=${step} activePlayer=${activePlayer} (4P pod) never renders broken grammar`, () => {
        const state = makePodState({ activePlayer, step });
        const text = narrateStep(state, { difficulty: "beginner" });
        expect(text).not.toMatch(BROKEN);
      });
    }
  }

  it("user-active untap step reads naturally (second person)", () => {
    const state = makeState({ activePlayer: "user", step: "untap", turnOrder: ["user", "ai"] });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toContain("your tapped permanents untap");
    expect(text).not.toContain("You's");
  });

  it("user-active draw step reads naturally (second person)", () => {
    const state = makeState({ activePlayer: "user", step: "draw", turn: 2, turnOrder: ["user", "ai"] });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toMatch(/You draw one card/);
    expect(text).not.toMatch(/You draws/);
  });

  it("AI-active step conjugates third person correctly", () => {
    const state = makeState({ activePlayer: "ai", step: "draw", turn: 2, turnOrder: ["user", "ai"] });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toMatch(/draws one card/);
  });
});

describe("N1 — pod-awareness: 4P pods never say 'both players' or 'The opponent'", () => {
  for (const step of ALL_STEPS) {
    it(`step=${step} never says "both players" in a 4P pod`, () => {
      const state = makePodState({ step });
      const text = narrateStep(state, { difficulty: "beginner" });
      expect(text).not.toMatch(/both players/i);
    });

    it(`step=${step} never says "The opponent" in a 4P pod`, () => {
      const state = makePodState({ step });
      const text = narrateStep(state, { difficulty: "beginner" });
      expect(text).not.toMatch(/The opponent/);
    });
  }

  it("a 1v1 game still uses simple priority phrasing on the draw step", () => {
    const state = makeState({ activePlayer: "user", step: "draw", turn: 2, turnOrder: ["user", "ai"] });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toMatch(/each player gets priority/);
  });

  it("an AI seat in a pod is identified by a distinct label, not a generic 'opponent'", () => {
    const state = makePodState({ activePlayer: "ai2", step: "upkeep" });
    const text = narrateStep(state, { difficulty: "beginner" });
    expect(text).toMatch(/Opponent 2/);
  });
});

describe("N2 — declare-attacker names the defender", () => {
  it("two attackers with distinct defenders render distinct lines", () => {
    const state = makePodState({ activePlayer: "user", step: "declare-attackers" });
    const actionA = { kind: "declare-attacker", name: "Grizzly Bears", defenderId: "ai1", defenderName: "Opponent 1" };
    const actionB = { kind: "declare-attacker", name: "Grizzly Bears", defenderId: "ai2", defenderName: "Opponent 2" };
    const lineA = narrateAction(actionA, state, { difficulty: "beginner" });
    const lineB = narrateAction(actionB, state, { difficulty: "beginner" });
    expect(lineA).not.toBe(lineB);
    expect(lineA).toContain("Opponent 1");
    expect(lineB).toContain("Opponent 2");
  });

  it("6 pairwise attacker x defender options are all mutually distinct", () => {
    const state = makePodState({ activePlayer: "user", step: "declare-attackers" });
    const attackers = ["Grizzly Bears", "Runeclaw Bear"];
    const defenders = [
      { defenderId: "ai1", defenderName: "Opponent 1" },
      { defenderId: "ai2", defenderName: "Opponent 2" },
      { defenderId: "ai3", defenderName: "Opponent 3" },
    ];
    const lines = [];
    for (const name of attackers) {
      for (const d of defenders) {
        lines.push(narrateAction({ kind: "declare-attacker", name, ...d }, state, { difficulty: "beginner" }));
      }
    }
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("falls back to a seat label when no defenderName is present", () => {
    const state = makePodState({ activePlayer: "user", step: "declare-attackers" });
    const action = { kind: "declare-attacker", name: "Grizzly Bears", defenderId: "ai3" };
    const text = narrateAction(action, state, { difficulty: "beginner" });
    expect(text).toMatch(/Opponent 3/);
  });

  it("planeswalker-target attacks are unaffected (existing PW branch still wins)", () => {
    const state = makePodState({ activePlayer: "user", step: "declare-attackers" });
    const action = { kind: "declare-attacker", name: "Grizzly Bears", defenderId: "ai1", defenderName: "Opponent 1", defenderPlaneswalkerId: "pw-1", targetName: "Elspeth, Sun's Champion" };
    const text = narrateAction(action, state, { difficulty: "beginner" });
    expect(text).toContain("Elspeth, Sun's Champion");
  });
});

describe("N2 — declare-blocker names the attacker", () => {
  it("two attackers being blocked render distinct lines", () => {
    const state = makePodState({ activePlayer: "ai1", step: "declare-blockers" });
    const lineA = narrateAction({ kind: "declare-blocker", name: "Wall of Omens", attackerId: "p1", attackerName: "Grizzly Bears" }, state, { difficulty: "beginner" });
    const lineB = narrateAction({ kind: "declare-blocker", name: "Wall of Omens", attackerId: "p2", attackerName: "Runeclaw Bear" }, state, { difficulty: "beginner" });
    expect(lineA).not.toBe(lineB);
    expect(lineA).toContain("Grizzly Bears");
    expect(lineB).toContain("Runeclaw Bear");
  });

  it("falls back to the generic phrasing when no attackerName is present", () => {
    const state = makePodState({ activePlayer: "ai1", step: "declare-blockers" });
    const text = narrateAction({ kind: "declare-blocker", name: "Wall of Omens", attackerId: "p1" }, state, { difficulty: "beginner" });
    expect(text).toContain("Block the attacker with");
  });
});

describe("narrateAction default fallback", () => {
  it("an unknown kind still safely falls to the default (never throws)", () => {
    const state = makeState();
    const text = narrateAction({ kind: "totally-unknown-kind", name: "Whatever" }, state, { difficulty: "beginner" });
    expect(text).toBe("Take action: Whatever");
  });
});

describe("CITE-GUARD — every CR citation in narrator.js resolves against the bundled CR", () => {
  it("every `rule N.N[a]` string in narrator.js is a real cr_current.json key", () => {
    const crPath = path.resolve(__dirname, "../../../../knowledge/mtg-judge/data/cr/cr_current.json");
    const cr = JSON.parse(fs.readFileSync(crPath, "utf8"));
    const narratorSrc = fs.readFileSync(path.resolve(__dirname, "./narrator.js"), "utf8");
    const cites = [...narratorSrc.matchAll(/rule (\d+\.\d+[a-z]?)/g)].map((m) => m[1]);
    expect(cites.length).toBeGreaterThan(0); // sanity: the file still cites rules
    for (const rule of cites) {
      expect(cr[rule], `rule ${rule} cited in narrator.js does not exist in cr_current.json`).toBeTruthy();
    }
  });
});

describe("narrateDecision still composes beginner header + numbered options", () => {
  it("produces a header line and one numbered line per action", () => {
    const state = makeState({ activePlayer: "user", step: "main", turnOrder: ["user", "ai"] });
    const actions = [
      { kind: "pass-priority" },
      { kind: "play-land", name: "Forest" },
    ];
    const text = narrateDecision(state, actions, { difficulty: "beginner" });
    expect(text).toContain("Your legal actions right now:");
    expect(text).toContain("1. Pass priority");
    expect(text).toContain("2. Play [[Forest]]");
  });
});
