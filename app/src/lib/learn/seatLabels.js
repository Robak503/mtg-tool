/**
 * Human seat labels — a raw engine seat id ("ai2") must never render. The one Academy wording, shared by the board
 * (LearnBoard), the session view (LearnView), the decision panels, the narrator's default, and the tutor / Arbiter board
 * context (boardContext), so the player and the model name a seat the same way. Every Academy mode is free-for-all, so each
 * AI seat is the player's opponent. A zero-import leaf, so any panel or engine-side formatter can use it.
 */
export const SEAT_LABELS = Object.freeze({ user: "You", ai: "Opponent", ai1: "Opponent 1", ai2: "Opponent 2", ai3: "Opponent 3" });

export function seatLabel(id) {
  return SEAT_LABELS[id] || id;
}
