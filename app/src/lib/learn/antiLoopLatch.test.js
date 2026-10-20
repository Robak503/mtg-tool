/**
 * antiLoopLatch.test.js — the session driver's anti-loop latch keeps every auto-decided action that changes the game, and
 * still passes priority on one that changes nothing (learnSession.advanceUntilDecision → antiLoopLatch.actionChangedGame).
 *
 * The latch used to read only `progressSignature` (turn, step, distinct attackers / blockers, stack depth, the active
 * player's hand and pool, the battlefield count, the free-cast / cascade / discover windows) and passed FROM THE STATE BEFORE
 * any non-pass action that moved none of those. Real actions that move none of them were thrown away every time an AI seat
 * took them:
 *   · crew (CR 702.122a) on a tree where crew takes effect at once — the crew taps, the Vehicle becomes an artifact creature
 *     until end of turn: 22 AI crews in the 80-game A/B on 660c7639, 0 applied (crew uses the stack since 39b8a81a);
 *   · turning a manifest face up (CR 701.40b) paid by tapping lands — the permanent flips, the lands tap, the pool stays 0;
 *   · a second block by a creature that can block more than one (CR 509.1a — Palace Guard): the blocker was already counted;
 *   · "done" in Etali, Primal Storm's cast-from-among window (CR 608.2g) — its flag is not one the signature reads, so the
 *     window never closed: the AI kept answering "done", the driver kept passing from the open window, and no other player
 *     was offered anything until the game ran out of turns.
 * The loop the latch was built for (PR 10.3: a Vigilance attacker re-declared for ever, each declaration appending another
 * copy of the same attacker entry) must still end, and so must any action that changes nothing at all.
 *
 * The two control loops are reconstructed with module mocks (off unless a test switches them on): the pre-PR-10.3 attacker
 * offer (a declared attacker offered again) and a dispatcher that answers one action kind with a no-op. Real oracle text
 * (bundled Scryfall) for every card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({ reofferDeclaredAttackers: false, noopKind: null }));

vi.mock("./legalChoices.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    // The pre-PR-10.3 offer: a creature already declared as an attacker is offered again (a Vigilance attacker stays
    // untapped, so nothing else removes it).
    legalActionsForPlayer: (state, playerId, ...rest) => {
      const actions = real.legalActionsForPlayer(state, playerId, ...rest);
      if (!ctl.reofferDeclaredAttackers || state.step !== "declare-attackers" || state.combat?.declaredAttackerCount != null) return actions;
      const again = (state.combat?.attackers || [])
        .filter((a) => a.attackingPlayer === playerId)
        .map((a) => ({ kind: "declare-attacker", playerId, permanentId: a.permanentId, defenderId: a.defender }));
      return again.length ? [...again, ...actions] : actions;
    },
  };
});

vi.mock("./actionDispatcher.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    // A no-op: the state comes back rebuilt (fresh objects, equal content) with a log line and the priority restated.
    dispatchAction: (state, action) =>
      ctl.noopKind && action?.kind === ctl.noopKind
        ? { ...state, players: { ...state.players }, priorityHolder: action.playerId, consecutivePasses: 0, log: [...state.log, { kind: "no-op", action: action.kind }] }
        : real.dispatchAction(state, action),
  };
});

import { _resetIdsForTests, createPermanent } from "./gameState.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";
import { manifestCard } from "./effects/atoms/manifest.js";

beforeEach(() => {
  _resetIdsForTests();
  ctl.reofferDeclaredAttackers = false;
  ctl.noopKind = null;
});

// Bundled Scryfall oracle text.
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };
const SLEEK_SCHOONER = { name: "Sleek Schooner", type: "Artifact — Vehicle", mana: "{3}", cmc: 3, colors: [], power: "4", toughness: "3", keywords: [],
  oracle: "Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const PALACE_GUARD = { name: "Palace Guard", type: "Creature — Human Soldier", mana: "{2}{W}", cmc: 3, colors: ["W"], power: "1", toughness: "4", keywords: [],
  oracle: "This creature can block any number of creatures." };
const LLANOWAR_ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };
const ETALI = { name: "Etali, Primal Storm", type: "Legendary Creature — Elder Dinosaur", mana: "{4}{R}{R}", cmc: 6, colors: ["R"], power: "6", toughness: "6", keywords: [],
  oracle: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs." };
const DAY_OF_JUDGMENT = { name: "Day of Judgment", type: "Sorcery", mana: "{2}{W}{W}", cmc: 4, colors: ["W"], keywords: [], oracle: "Destroy all creatures." };
const SERRA_ANGEL = { name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", cmc: 5, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying", "Vigilance"],
  oracle: "Flying\nVigilance (Attacking doesn't cause this creature to tap.)" };

const forests = (prefix, n) => Array.from({ length: n }, (_, i) => ({ ...FOREST, id: `${prefix}-${i}` }));
const onField = (card, id, { sick = false, entered = 2, controller = "ai" } = {}) =>
  ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller, summoningSick: sick }), enteredOnTurn: entered });

/**
 * A two-player session in the AI's precombat main phase, the AI holding priority with an empty stack. The user (Beginner:
 * asked every non-pass decision; 40 life) holds one Forest and controls nothing, so every window before their next main
 * phase is pass-only and the driver returns there — with whatever the AI did on its turn still on the board.
 */
function aiMainPhase(aiBattlefield, { aiHand = [], edit = (s) => s } = {}) {
  const session = createLearnSession({ userDeck: forests("ud", 30), opponentDeck: forests("ad", 30), difficulty: "beginner" });
  const s = session.state;
  const state = {
    ...s, turn: 6, activePlayer: "ai", phase: "precombat-main", step: "main", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [{ ...FOREST, id: "u-hand" }], battlefield: [], library: forests("ul", 20) },
      ai: { ...s.players.ai, hand: aiHand, battlefield: aiBattlefield, library: forests("al", 20) },
    },
  };
  return { ...session, state: edit(state) };
}

const aiForests = (n) => Array.from({ length: n }, (_, i) => onField(FOREST, `ai-forest-${i}`));
const logged = (state, kind) => state.log.filter((e) => e.kind === kind);

describe("an AI seat's action that changes the game is kept by the session driver", () => {
  it("turning a manifested Craw Wurm face up, paid by tapping six Forests, takes effect (CR 701.40b) (WITNESS)", () => {
    const session = aiMainPhase(aiForests(6), {
      edit: (s) => {
        const withTop = { ...s, players: { ...s.players, ai: { ...s.players.ai, library: [{ ...CRAW_WURM, id: "wurm-card" }, ...s.players.ai.library] } } };
        const m = manifestCard(withTop, "ai", withTop.players.ai.library[0]);
        // Manifested on an earlier turn: no longer summoning sick.
        return { ...m, players: { ...m.players, ai: { ...m.players.ai, battlefield: m.players.ai.battlefield.map((p) => (p.faceDown ? { ...p, summoningSick: false, enteredOnTurn: 4 } : p)) } } };
      },
    });
    const faceDownId = session.state.players.ai.battlefield.find((p) => p.faceDown).id;
    // The signature cannot see this action: no stack object, nothing enters or leaves, the pool stays empty.
    const { session: after, decision } = advanceUntilDecision(session);
    const wurm = after.state.players.ai.battlefield.find((p) => p.id === faceDownId);
    const witness = {
      decision: decision.kind,
      faceDown: Boolean(wurm?.faceDown),
      name: wurm?.card?.name,
      forestsTapped: after.state.players.ai.battlefield.filter((p) => p.card?.name === "Forest" && p.tapped).length,
      turnedUp: logged(after.state, "turn-face-up").map((e) => e.cardName),
    };
    console.log(`WITNESS latchTurnFaceUp ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ decision: "ask", faceDown: false, name: "Craw Wurm", forestsTapped: 6, turnedUp: ["Craw Wurm"] });
  });

  it("crewing Sleek Schooner with a summoning-sick Grizzly Bears takes effect, and the crewed Schooner attacks (CR 702.122a) (WITNESS)", () => {
    const session = aiMainPhase([onField(SLEEK_SCHOONER, "schooner"), onField(GRIZZLY_BEARS, "bears", { sick: true, entered: 6 })]);
    const { session: after, decision } = advanceUntilDecision(session);
    const bears = after.state.players.ai.battlefield.find((p) => p.id === "bears");
    const witness = {
      decision: decision.kind,
      crewed: logged(after.state, "crew-vehicle").length,
      bearsTapped: Boolean(bears?.tapped),
      schoonerAttacked: logged(after.state, "attack-declared").some((e) => e.attackerId === "schooner"),
      userLife: after.state.players.user.life,
    };
    console.log(`WITNESS latchCrew ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ decision: "ask", crewed: 1, bearsTapped: true, schoonerAttacked: true, userLife: 36 });
  });

  it("Palace Guard blocks both of the user's attacking Llanowar Elves — its second block is kept (CR 509.1a) (WITNESS)", () => {
    // The user attacked with two Elves; the AI holds priority in the declare blockers step with the declaration open.
    const session = aiMainPhase([onField(PALACE_GUARD, "guard")], {
      edit: (s) => {
        const elves = ["elf-1", "elf-2"].map((id) => ({ ...onField(LLANOWAR_ELVES, id, { controller: "user" }), tapped: true }));
        return { ...s, activePlayer: "user", phase: "combat", step: "declare-blockers", priorityHolder: "ai",
          combat: { attackers: elves.map((e) => ({ permanentId: e.id, attackingPlayer: "user", defender: "ai" })), blockers: [], declaredAttackerCount: 2 },
          players: { ...s.players, user: { ...s.players.user, battlefield: elves } } };
      },
    });
    const { session: after, decision } = advanceUntilDecision(session);
    const witness = {
      decision: decision.kind,
      blocks: logged(after.state, "block-declared").map((e) => `${e.blockerId}->${e.attackerId}`),
      aiLife: after.state.players.ai.life,
    };
    console.log(`WITNESS latchMultiBlock ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ decision: "ask", blocks: ["guard->elf-1", "guard->elf-2"], aiLife: 40 });
  });

  it("Etali, Primal Storm attacks and its window holds only a Day of Judgment the AI won't cast: its \"done\" closes the window and the game goes on (CR 608.2g) (WITNESS)", () => {
    const session = aiMainPhase([onField(ETALI, "etali")], {
      edit: (s) => ({ ...s, players: { ...s.players, ai: { ...s.players.ai, library: [{ ...DAY_OF_JUDGMENT, id: "doj" }, ...s.players.ai.library] } } }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session: after, decision } = advanceUntilDecision(session);
    warn.mockRestore();
    const witness = {
      decision: decision.kind,
      turn: after.state.turn,
      windowOpen: Boolean(after.state.pendingCastFromAmong),
      done: logged(after.state, "cast-from-among-done").length,
      userLife: after.state.players.user.life,
    };
    console.log(`WITNESS latchCastFromAmongDone ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ decision: "ask", turn: 7, windowOpen: false, done: 1, userLife: 34 });
  });
});

describe("the loops the latch exists for still end (CONTROLS — they pass on the tree before this fix too)", () => {
  it("PR 10.3's loop: a declared Vigilance attacker offered again is re-declared once at most — the driver passes and combat deals its damage once", () => {
    ctl.reofferDeclaredAttackers = true;
    const session = aiMainPhase([onField(SERRA_ANGEL, "angel")]);
    const { session: after, decision } = advanceUntilDecision(session);
    expect({
      decision: decision.kind,
      status: after.status,
      declared: logged(after.state, "attack-declared").filter((e) => e.attackerId === "angel").length,
      userLife: after.state.players.user.life,
    }).toEqual({ decision: "ask", status: "active", declared: 1, userLife: 36 });
  });

  it("an action that changes nothing (the dispatcher answers the AI's land drop with a no-op) is passed on, every time — the game goes on", () => {
    ctl.noopKind = "play-land";
    const session = aiMainPhase([], { aiHand: [{ ...FOREST, id: "ai-hand-forest" }] });
    const { session: after, decision } = advanceUntilDecision(session);
    expect({
      decision: decision.kind,
      status: after.status,
      turn: after.state.turn,
      activePlayer: after.state.activePlayer,
      aiHand: after.state.players.ai.hand.map((c) => c.id),
      noOpsKept: logged(after.state, "no-op").length,
    }).toEqual({ decision: "ask", status: "active", turn: 7, activePlayer: "user", aiHand: ["ai-hand-forest"], noOpsKept: 0 });
  });
});
