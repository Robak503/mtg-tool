/**
 * landColour.js — THE COLOUR A PLAYER'S LANDS ARE FOR: the one colour-need reader the AI's land drop, its land searches (fetchLand.js)
 * and the house pick of a land that enters as a copy of another land (landEntryCopy.js — Vesuva) share, so the three can never
 * disagree (ENGINE-SCAFFOLD §6: a judgement implemented in one place). Lifted out of fetchLand.js unchanged (2026-11-03) because
 * fetchLand reaches the zone atoms (through the tutor filter's module) and the land entry the zone atoms run cannot import it back.
 *
 * A leaf over gameState-free readers: the mana model's production gate and the layers' ability view (neither reaches an atom module).
 */
import { withAbilityLoss, boardHasAbilityLoss } from "./layers.js"; // the ability view (CR 613.1f) — a source that lost its abilities makes no mana
import { manaProduction } from "./manaModel.js";

const COLOURS = ["W", "U", "B", "R", "G"];

/**
 * Colored pips in a mana cost string ({W}{U}{B}{R}{G}; each half of a hybrid pip counts as needing that color — a
 * payable-either-way pip is a soft need).
 */
function coloredPips(mana) {
  const out = [];
  for (const m of String(mana || "").matchAll(/\{([^}]+)\}/g)) {
    for (const ch of m[1].toUpperCase()) if ("WUBRG".includes(ch)) out.push(ch);
  }
  return out;
}

/**
 * THE COLOUR NEED of a player's lands: `producible` — every colour a permanent on its battlefield makes (tapped or not; the
 * question is "do I own a source of this colour at all", read through `manaProduction`, the shared mana gate); `pips` — the
 * coloured pips of the cards in its hand and command zone, per colour; `needed` — the colours among those pips no battlefield
 * source makes. The land drop ranks by `needed`; the fetch's search by `pips` behind it.
 */
export function colourNeed(state, playerId) {
  const player = state?.players?.[playerId];
  const producible = new Set();
  const lossy = boardHasAbilityLoss(state);
  for (const perm of player?.battlefield || []) {
    for (const c of manaProduction(perm ? (lossy ? withAbilityLoss(state, perm) : perm.card) : null)?.colors || []) producible.add(c);
  }
  const needed = new Set();
  const pips = Object.fromEntries(COLOURS.map((c) => [c, 0]));
  for (const card of [...(player?.hand || []), ...(player?.command || [])]) {
    for (const pip of coloredPips(card?.mana || card?.mana_cost)) {
      pips[pip] += 1;
      if (!producible.has(pip)) needed.add(pip);
    }
  }
  return { producible, needed, pips };
}

/**
 * THE COLOUR A LAND IS FOR. A score per land card (higher = take it first): the pips of the hand and command zone in the colours
 * it makes that no battlefield source makes, then all their pips in those colours — a dual that makes both unmet colours
 * outranks either basic, and with every colour already made it takes the colour the hand asks for most. `makesMana` is 1 when the
 * card makes any mana at all (manaProduction), for a reader that ranks a land that makes something above one that makes nothing.
 */
export function landColourScore(state, playerId) {
  const need = colourNeed(state, playerId);
  return (card) => {
    const prod = manaProduction(card);
    let unmet = 0;
    let asked = 0;
    for (const c of new Set(prod?.colors || [])) {
      if (!(c in need.pips)) continue;
      asked += need.pips[c];
      if (need.needed.has(c)) unmet += need.pips[c];
    }
    return { score: unmet * 1000 + asked, makesMana: prod ? 1 : 0 };
  };
}
