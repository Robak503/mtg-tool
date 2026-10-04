/**
 * mandatoryLoop.js — CR 104.4b / 732.4: "If a loop contains only mandatory actions, the game is a draw."
 *
 * Polyraptor beside Marauding Raptor is the textbook case: the Raptor deals 2 damage to each creature that enters,
 * Polyraptor's enrage makes a copy whenever it is dealt damage, the copy enters. No player chooses anything; nobody can
 * stop it. The driver used to play that until a size guard ended the game "engine-stuck" — a non-result. The game has a
 * result: a draw.
 *
 * WHAT IS RECOGNISED — deliberately narrow; anything outside it falls through to the driver's existing guards, exactly as
 * before (a missed draw costs one unlabelled game, a wrong one would write a result the game did not have):
 *   · every tick in the window is a plain priority pass — the driver resets the watch on any other action or choice;
 *   · the object on top of the stack is a triggered ability, and either it has no targets and comes from a permanent
 *     still on the battlefield whose card offers no choice at all (no "may", "up to", "choose", "target", "unless",
 *     "or" in its text) — a LINK of the loop — or its resolution changed nothing on any battlefield, in any zone or in
 *     any mana pool — a BYSTANDER (an opponent's Selvala, Heart of the Wilds sees every Polyraptor enter: "its controller
 *     may draw a card if its power is greatest"; nothing is offered, nothing happens, and the loop does not need it);
 *   · nothing a game could end on moves: the turn, phase and step, and every player's life, poison, library and hand;
 *   · the sequence (priority holder, source, controller) repeats with one period across the whole window, and the stack
 *     is never smaller than it was one period earlier — a long chain of triggers that is DRAINING is not a loop.
 *
 * A leaf module: it reads plain state and imports nothing.
 */

/** `window`: the plain-pass ticks that must repeat (a Polyraptor cycle is 8 ticks in a four-player game — 100 cycles).
 * `maxPeriod`: the longest cycle looked for. `checkEvery`: how often the period search runs once the window is full. */
export const MANDATORY_LOOP = Object.freeze({ window: 800, maxPeriod: 64, checkEvery: 40 });

const REMINDER_TEXT = /[(][^)]*[)]/g;
const CHOICE_WORDS = /\b(?:may|up to|choose|chooses|chosen|target|targets|unless|or|any number|random)\b/i;

/** True when nothing on this card is a choice: every ability it has does one fixed thing. Unknown text is a choice. */
export function cardOffersNoChoice(card) {
  const text = card?.oracle ?? card?.oracle_text;
  if (typeof text !== "string") return false;
  return !CHOICE_WORDS.test(text.replace(REMINDER_TEXT, " ")); // reminder text is not rules text (Trample's "player or planeswalker")
}

function findPermanent(state, permanentId) {
  for (const player of Object.values(state?.players || {})) {
    const hit = (player?.battlefield || []).find((p) => p.id === permanentId);
    if (hit) return hit;
  }
  return null;
}

/** The name of the top object's source when that object is a LINK: a triggered ability with no targets, from a permanent on
 * the battlefield whose card offers no choice. null otherwise (the object may still prove to be a bystander). */
export function mandatoryLinkName(state) {
  const top = (state?.stack || []).at(-1);
  if (!top || top.kind !== "triggered-ability" || (top.targets || []).length) return null;
  const source = findPermanent(state, top.source?.permanentId);
  return source && cardOffersNoChoice(source.card) ? source.card.name : null;
}

/** Everything a resolution can touch outside the stack and the log: each seat's permanents (with what rides on them),
 * zone sizes and mana pool. Two equal digests around an object's resolution mean it did nothing. */
export function boardDigest(state) {
  return Object.keys(state?.players || {}).sort().map((id) => {
    const p = state.players[id];
    const perms = (p.battlefield || []).map((x) => `${x.id}.${x.tapped ? 1 : 0}.${x.damage || 0}.${x.attachedTo || ""}.${x.controller || ""}.${x.counters ? JSON.stringify(x.counters) : ""}`).join(";");
    return `${id}[${perms}]g${(p.graveyard || []).length}x${(p.exile || []).length}c${(p.command || []).length}m${JSON.stringify(p.manaPool || {})}`;
  }).join("|");
}

/** Everything a game can end on, plus where in the turn it is. A loop that moves any of these is on its way somewhere. */
export function frozenSignature(state) {
  const seats = Object.keys(state?.players || {}).sort();
  const each = seats.map((id) => {
    const p = state.players[id];
    return `${id}:${p.life}:${p.poison || 0}:${(p.library || []).length}:${(p.hand || []).length}`;
  });
  return `${state.turn}|${state.phase}|${state.step}|${each.join(",")}`;
}

/** The period (1..maxPeriod) the last `window` entries repeat with, the stack never shrinking across it; 0 when none. */
export function repeatingPeriod(keys, sizes, { window, maxPeriod }) {
  const n = keys.length;
  if (n < window + maxPeriod) return 0;
  const from = n - window;
  for (let p = 1; p <= maxPeriod; p++) {
    let ok = true;
    for (let i = from; i < n; i++) {
      if (keys[i] !== keys[i - p] || sizes[i] < sizes[i - p]) { ok = false; break; }
    }
    if (ok) return p;
  }
  return 0;
}

/**
 * The driver's watch. `reset()` after any tick that was not a plain pass; `observe(state)` at the top of every tick.
 * `observe` answers null, or — once a mandatory loop is established — `{ period, ticks, sources }`.
 */
export function createLoopWatch(limits = MANDATORY_LOOP) {
  let keys = [];
  let sizes = [];
  let signature = null;
  let bystander = null; // { id, digest } — the choice-bearing object now on top, and the board as it waited to resolve
  const reset = () => { keys = []; sizes = []; signature = null; bystander = null; };
  const observe = (state) => {
    const top = (state?.stack || []).at(-1);
    if (!top || top.kind !== "triggered-ability") { reset(); return null; }
    // The object that was on top has resolved: it was a bystander only if it changed nothing.
    if (bystander && bystander.id !== top.id) {
      const unchanged = bystander.digest === boardDigest(state);
      bystander = null;
      if (!unchanged) reset();
    }
    const link = mandatoryLinkName(state);
    if (link == null && !bystander) bystander = { id: top.id, digest: boardDigest(state) };
    const sig = frozenSignature(state);
    if (sig !== signature) { const keep = bystander; reset(); signature = sig; bystander = keep; }
    keys.push(`${state.priorityHolder}|${link ?? `(${top.source?.name ?? "?"})`}|${top.controller}`);
    sizes.push(state.stack.length);
    const need = limits.window + limits.maxPeriod;
    if (keys.length < need || (keys.length - need) % limits.checkEvery !== 0) return null;
    const period = repeatingPeriod(keys, sizes, limits);
    if (keys.length > need * 4) { keys = keys.slice(-need); sizes = sizes.slice(-need); } // bounded memory on a long non-loop
    if (!period) return null;
    const names = [...new Set(keys.slice(-period).map((k) => k.split("|")[1]))];
    const sources = names.filter((name) => !name.startsWith("(")).sort(); // sorted: the same loop reads the same wherever in its cycle it was recognised
    if (!sources.length) return null; // only bystanders: nothing here is a loop of mandatory actions
    return { period, ticks: limits.window, sources };
  };
  return { reset, observe };
}
