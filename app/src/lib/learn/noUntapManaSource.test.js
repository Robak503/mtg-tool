/**
 * noUntapManaSource.test.js — Mana Vault / Basalt Monolith / Grim Monolith produce mana again
 * (shelf slice, 2026-07-27).
 *
 * THIS WAS A REAL GAMEPLAY BUG, not a coverage gap. The engine offered these permanents NO ability at all
 * — they sat on the battlefield doing nothing. In a cEDH deck that is three of the best ramp cards in the
 * format being dead cardboard.
 *
 * WHY IT WAS THERE, AND WHY IT ISN'T ANYMORE. manaProduction deliberately routed any non-land carrying
 * "doesn't untap during your untap step" out of the mana model, on stated grounds: the restriction was
 * UNMODELED — untapAll freed everything each untap step — so a standing source carrying it read as a free
 * 3-mana rock EVERY turn. That refusal was correct when written.
 *
 * The restriction is enforced now (gameState's untap step consults cardSelfPreventsUntap), so the phantom
 * it was guarding against cannot occur. The guard had quietly changed from a safe under-count into the bug.
 *
 * THE ANTI-PHANTOM PROPERTY IS THE LOAD-BEARING TEST HERE. It is not enough that the card produces mana —
 * it must produce it ONCE and then stay tapped. If a future change to the untap step ever breaks that, this
 * file must fail, because at that moment crediting these cards becomes wrong again for the original reason.
 */
import { describe, expect, it } from "vitest";

import { manaProduction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, runStepActions } from "./gameEngine.js";

const MONOLITH = {
  name: "Basalt Monolith", type: "Artifact", mana: "{3}",
  oracle: "This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.",
};
const VAULT_LEGACY = {
  // Older printings self-reference BY NAME rather than "this artifact" — CR 201.4, still a self reference.
  name: "Mana Vault", type: "Artifact", mana: "{1}",
  oracle: "Mana Vault doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.",
};
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." };

describe("the mana model accepts them again", () => {
  it("Basalt Monolith and Mana Vault produce", () => {
    expect(manaProduction(MONOLITH)).toMatchObject({ amount: 3 });
    expect(manaProduction(VAULT_LEGACY)).toMatchObject({ amount: 3 });
  });

  it("and they classify native-mana", () => {
    expect(classifyCard(MONOLITH)).toBe("native-mana");
  });

  it("CREED — the 'your NEXT untap step' one-shot rider still routes OUT", () => {
    // Not a continuous lock — it's a rider inside an activated ability (the slow-dual family), and gameState
    // deliberately does not enforce it. Crediting it would resurrect the exact phantom the old guard caught.
    expect(manaProduction({ name: "Slow Rock", type: "Artifact", oracle: "{T}: Add {C}. This artifact doesn't untap during your next untap step." })).toBeNull();
  });
});

describe("RUNTIME — the card was DEAD before this; prove it plays", () => {
  function board() {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bm = createPermanent({ id: "bm", card: MONOLITH, controller: "user", summoningSick: false });
    const sr = createPermanent({ id: "sr", card: SOL_RING, controller: "user", summoningSick: false });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bm, sr] } },
    };
  }

  it("the mana ability is OFFERED (it was offered nothing at all before)", () => {
    const acts = legalActionsForPlayer(board(), "user").filter((a) => a.permanentId === "bm" && a.kind === "tap-for-mana");
    expect(acts.length).toBeGreaterThan(0);
  });

  it("tapping it actually adds {C}{C}{C} and taps it", () => {
    const st = board();
    const act = legalActionsForPlayer(st, "user").find((a) => a.permanentId === "bm" && a.kind === "tap-for-mana");
    const after = dispatchAction(st, act);
    expect(after.players.user.manaPool.C).toBe(3);
    expect(after.players.user.battlefield.find((p) => p.id === "bm").tapped).toBe(true);
  });

  it("THE ANTI-PHANTOM PROPERTY — it stays tapped through the controller's untap step, while Sol Ring untaps", () => {
    // The whole reason the old guard existed. If this ever fails, these cards are a free repeatable rock
    // again and the credit above becomes a false positive.
    let st = board();
    st = dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.permanentId === "bm" && a.kind === "tap-for-mana"));
    // tap the Sol Ring too, as the control
    st = dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.permanentId === "sr" && a.kind === "tap-for-mana"));
    expect(st.players.user.battlefield.find((p) => p.id === "sr").tapped).toBe(true);

    let guard = 0;
    while (guard++ < 200) {
      st = runStepActions(advanceStep(st));
      if (st.activePlayer === "user" && st.step === "upkeep") break;   // past OUR next untap step
    }
    expect(st.players.user.battlefield.find((p) => p.id === "sr").tapped).toBe(false);  // control untapped
    expect(st.players.user.battlefield.find((p) => p.id === "bm").tapped).toBe(true);   // ours did NOT
  });
});
