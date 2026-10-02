/**
 * classLevels.js — CLASS CARDS (CR 716): the class level bar, the per-permanent level designation, and the
 * level-scoped view of a Class card's text.
 *
 * The rules (knowledge/mtg-judge/data/cr/cr_current.json):
 *   716.2a  "[Cost]: Level N — [Abilities]" means "[Cost]: This Class's level becomes N. Activate only if this
 *           Class is level N-1 and only as a sorcery" and "As long as this Class is level N or greater, it has
 *           [abilities]." (restated as 107.16a)
 *   716.2b  A level is a designation any permanent can have; it is not a copiable characteristic.
 *   716.2d  A permanent with no level is treated as level 1.
 *   716.3   An ability that isn't preceded by a class level bar (the top section) works at all times.
 *   716.4   Leveler cards (level counters, leveler.js) are a different mechanic; the two never interact.
 *
 * THE MODEL. The printed card is never altered: `perm.card` stays the whole printed Class, so copies (716.2b — a
 * copy starts at level 1 because the level is not copied), zone moves (CR 400.7 — a new object, no level) and the
 * UI all see the real text. The level lives on the PERMANENT as `perm.classLevel` (absent = 1, CR 716.2d). What a
 * reader sees is decided per permanent:
 *   - classTopView(card)   — the text with every level section removed. A raw Class card handed to the trigger
 *                            detector with no permanent in hand reads THIS: below its bar a section is not an ability
 *                            yet, so the safe default is the top section only. (parseStaticAbilities already reads
 *                            nothing off a raw Class, and the activated lane reads only its bars.)
 *   - classLevelView(card, n) — the top section plus every section whose bar level is <= n, bar lines dropped.
 *   - classLiveCard(perm)  — the card the runtime's per-permanent readers parse: the level view at the
 *                            permanent's own level, but ONLY for a Class whose whole card is modeled (the injected
 *                            validator — coverage.js's modeledClassCard). A parked Class returns the raw card, so
 *                            its readers keep the top-only default and no level-gated text is ever read.
 *
 * THE CREED. Nothing here widens what a raw Class card means: a malformed frame (a bar the parser can't place)
 * still hides every line from the first bar down. A Class reaches its level sections only through the validator,
 * which is the same whole-card gate the metric uses.
 *
 * LEAF MODULE: imports nothing. The validator is injected (registerClassCardValidator) by coverage.js, which owns
 * the whole-card judgement; until it is registered every Class reads as parked.
 */

// A class level bar line: "{1}{G}: Level 2". Brace costs only, anchored on the whole line, so a sentence that merely
// mentions a level ("When this Class becomes level 2, …") is never a bar.
const CLASS_LEVEL_BAR_RE = /^((?:\{[^}]+\})+): Level (\d+)$/;
// A whole-line reminder ("(Gain the next level as a sorcery to add its ability.)") carries no rules meaning (CR 207.2).
const WHOLE_LINE_REMINDER_RE = /^\([^)]*\)$/;

function oracleOf(card) {
  return String(card?.oracle ?? card?.oracle_text ?? "");
}

function lineIsBar(line) {
  return CLASS_LEVEL_BAR_RE.test(String(line || "").trim());
}

const _barMemo = new WeakMap(); // card -> boolean (card objects are immutable, house convention)

/** Does this card's text carry a class level bar line at all (well-formed or not)? False for a non-object. */
export function hasClassLevelBar(card) {
  if (!card || typeof card !== "object") return false;
  if (_barMemo.has(card)) return _barMemo.get(card);
  const has = oracleOf(card).split("\n").some(lineIsBar);
  _barMemo.set(card, has);
  return has;
}

const _frameMemo = new WeakMap(); // card -> frame | null

/**
 * Parse a Class card into its striated frame (CR 716.1 / 716.2):
 *   { top: [line…], bars: [{ level, costPips, lines: [line…] }…] }
 * or null when the card is not a well-formed Class: no "Class" subtype, a bar whose level is not the next one in
 * sequence (bars run 2, 3, … — CR 716.2a's "level N-1" makes each bar the successor of the previous), or a bar with
 * no ability under it (a truncated text box — never guessed at). Whole-line reminder text is dropped; every other
 * line is kept verbatim. Called on objects only (every caller has already held a card).
 */
export function parseClassFrame(card) {
  if (_frameMemo.has(card)) return _frameMemo.get(card);
  const frame = computeClassFrame(card);
  _frameMemo.set(card, frame);
  return frame;
}

function computeClassFrame(card) {
  if (!/\bClass\b/.test(String(card?.type ?? card?.type_line ?? ""))) return null;
  const top = [];
  const bars = [];
  for (const raw of oracleOf(card).split("\n")) {
    const line = raw.trim();
    if (!line || WHOLE_LINE_REMINDER_RE.test(line)) continue;
    const bar = line.match(CLASS_LEVEL_BAR_RE);
    if (bar) {
      const level = parseInt(bar[2], 10);
      if (level !== bars.length + 2) return null; // 2, 3, … in order — anything else is not a frame this reads
      bars.push({ level, costPips: bar[1], lines: [] });
      continue;
    }
    if (bars.length) bars[bars.length - 1].lines.push(line);
    else top.push(line);
  }
  if (bars.some((b) => !b.lines.length)) return null;
  return { top, bars };
}

/** The level a permanent is at (CR 716.2d — a permanent with no level is treated as level 1). */
export function classLevelOf(perm) {
  return perm?.classLevel ?? 1;
}

const _viewMemo = new WeakMap(); // card -> Map(level -> view card)

function viewOf(card, level, text) {
  let byLevel = _viewMemo.get(card);
  if (!byLevel) { byLevel = new Map(); _viewMemo.set(card, byLevel); }
  if (byLevel.has(level)) return byLevel.get(level);
  // The view carries ONE text field: a reader that prefers `oracle_text` must not find the printed text there.
  const { oracle_text: _printed, ...rest } = card;
  const view = { ...rest, oracle: text, classLevelView: level };
  byLevel.set(level, view);
  return view;
}

/**
 * The card a reader should parse for a Class at `level` (CR 716.2a: the abilities under bar N exist at level N or
 * greater; CR 716.3: the top section always). A card with no bar line is returned unchanged. A card whose bars do
 * not form a valid frame hides everything from its first bar line down at EVERY level — fail closed, never a guess
 * at which section a line belongs to. The view is memoized per (card, level), so parse caches keyed by the card
 * object stay warm.
 */
export function classLevelView(card, level) {
  if (!hasClassLevelBar(card)) return card;
  const frame = parseClassFrame(card);
  if (!frame) {
    const lines = oracleOf(card).split("\n");
    return viewOf(card, 1, lines.slice(0, lines.findIndex(lineIsBar)).join("\n").trim());
  }
  const lines = [...frame.top];
  for (const b of frame.bars) if (b.level <= level) lines.push(...b.lines);
  return viewOf(card, level, lines.join("\n"));
}

/** The top-section view (the level-1 view) — what a raw Class card means to a parser with no permanent in hand. */
export function classTopView(card) {
  return classLevelView(card, 1);
}

let _classCardValidator = null;
/**
 * Inject the whole-card gate (coverage.js's modeledClassCard). The leaf cannot import it: the gate needs the
 * classifier, and the classifier's modules import this leaf. `null` unregisters (every Class then reads as parked).
 */
export function registerClassCardValidator(fn) {
  _classCardValidator = fn;
}

/** Is this Class card wholly modeled (the injected gate)? False when no gate is registered. */
export function classCardModeled(card) {
  return _classCardValidator ? _classCardValidator(card) : false;
}

/**
 * The card the runtime's per-permanent readers (trigger scans, the static-effect collector, the play-from-top
 * permission) parse for `perm`: a modeled Class's level view at the permanent's own level; for everything else the
 * permanent's card itself — including a parked Class, whose parsers then fall back to the top-only default.
 */
export function classLiveCard(perm) {
  const card = perm?.card;
  if (!hasClassLevelBar(card) || !classCardModeled(card)) return card;
  return classLevelView(card, classLevelOf(perm));
}

export { CLASS_LEVEL_BAR_RE };
