/**
 * Human seat labels — a raw engine seat id ("ai2") must never render. The Academy board's wording (LearnBoard's
 * BOARD_SEAT_LABELS, narrator's DEFAULT_SEAT_LABELS). A zero-import leaf, so any panel or engine-side formatter can use it.
 */
export const SEAT_LABELS = Object.freeze({ user: "You", ai: "Opponent", ai1: "Opponent 1", ai2: "Opponent 2", ai3: "Opponent 3" });

export function seatLabel(id) {
  return SEAT_LABELS[id] || id;
}
