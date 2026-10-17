/**
 * auraPrintedSide.js — WHICH SIDE AN AURA BELONGS ON, READ OFF ITS PRINTED TEXT CLAUSE BY CLAUSE (2026-10-17).
 *
 * auraEntry.auraCastIntent reads an Aura's side off parseAuraBonus — the parse the layer engine applies once the Aura attaches —
 * and that parse is all-or-nothing: one line about the enchanted permanent it can't model ("When enchanted creature dies, return
 * this card to its owner's hand", "has protection from the chosen color", "loses all other abilities") empties it, and the AI
 * held the card. Since every Aura spell is cast targeting a host (auraSpellHost.js, CR 303.4a), that held 574 of the 623 Auras no
 * modeled lane casts — most of an Aura deck's body-only Auras (Light-Paws Voltron: Angelic Destiny, Spectra Ward …).
 *
 * This reader decides the side the printed text intends, never what the engine models: an Aura cast on its host keeps its
 * unmodeled text inert (the body-only posture). auraCastIntent reads it only where the bonus parse reads no side, and only the
 * AI's cast pick and the non-cast entry choice read auraCastIntent. No tier, offer or resolution does.
 *
 * Each sentence (reminder text dropped, the card's own name read as "this aura", ability-word labels stripped) is ONE of:
 *   · OWN — it helps the enchanted permanent or its controller: +N/+N, a keyword or protection, "can't be blocked", an
 *     activated ability granted to it (optional for its controller), its controller's extra mana or card, untapping it, a
 *     +1/+1 counter on it, umbra armor, its card coming back when it dies;
 *   · ENEMY — it hurts the enchanted permanent or its controller: −N/−N, "can't attack / block", its activated abilities
 *     locked, "doesn't untap", losing abilities or card types, goad, a forced attack, its controller losing life, being dealt
 *     damage or sacrificing it, it being destroyed or exiled, tapping it as the Aura enters, control of it changing hands;
 *   · NEUTRAL — the Aura's own business, the same whichever side it is on: the Enchant line, Flash, cycling, a colour chosen as
 *     it enters, an enters draw, an exile of a permanent an opponent controls, an upkeep cost, the Aura returning to its
 *     owner's hand;
 *   · UNKNOWN — anything else.
 * The side is the clauses' consensus: any UNKNOWN sentence, or OWN beside ENEMY, holds (null) — never a guess, the discipline the
 * bonus reading keeps (CREED: a buff on an enemy fatty, or a curse on the AI's own creature, is a live false positive). With only
 * NEUTRAL sentences the Enchant line decides when it names one side ("creature you control" → own, "creature an opponent
 * controls" → enemy); otherwise the reading holds.
 *
 * Two rules sit above single clauses:
 *   · A RESTRICTION beside a buff is MIXED here ("+2/+2 and can't block" holds), though the bonus reading counts it as that
 *     buff's drawback — this reader runs only where that reading couldn't, and it never trades a hold for a guess.
 *   · A TRANSFORMATION — a sentence that takes away all of the host's abilities, or all its other card types — is ENEMY as a
 *     whole: the abilities, base power and toughness and types the same sentence gives describe what the host is turned into,
 *     not a gift (Darksteel Mutation's indestructible 0/1 Insect, Kenrith's Transformation's 3/3 Elk, Swift Reconfiguration's
 *     crew-5 Vehicle). A power/toughness change in that sentence still counts on its own.
 * A condition on the enchanted permanent itself ("as long as enchanted creature is white", "as long as it's a Human") is
 * UNKNOWN: on the wrong host the bonus does nothing, or flips. "As long as enchanted permanent is a creature" is read (the pick
 * already prefers creatures), and so is a condition on the game rather than the host (threshold, hellbent, an opponent's
 * permanent).
 *
 * LEAF: faceUp and staticAbilityParser.auraEnchantSubject only.
 */
import { faceUpView } from "./faceUp.js";
import { auraEnchantSubject } from "./staticAbilityParser.js";

const OWN = "own";
const ENEMY = "enemy";
const NEUTRAL = "neutral";
const UNKNOWN = "unknown";
const MIXED = "mixed";

const HOST_NOUN = "(?:creature|permanent|artifact|land|enchantment|planeswalker|plains|island|swamp|mountain|forest|vehicle)";
const HOST = `enchanted ${HOST_NOUN}`;
const PT = "([+-])(\\d+|x)\\/([+-])(\\d+|x|y)";

/** The face being cast (CR 712.8a), its own name read as "this aura", reminder text gone (CR 207.2), lowercased. */
function normalizedText(card) {
  const face = faceUpView(card) || card;
  let text = String(face?.oracle ?? face?.oracle_text ?? "");
  const name = String(face?.name || "").split(" // ")[0].trim();
  if (name) text = text.split(name).join("this aura");
  text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  let out = "";
  let depth = 0;
  let inQuote = false;
  for (const ch of text) {
    if (depth > 0) { // inside reminder text, quotes included ("(It's an artifact with \"{2}, Sacrifice this token: …\")")
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      continue;
    }
    if (ch === '"') { inQuote = !inQuote; out += ch; continue; }
    if (!inQuote && ch === "(") { depth++; continue; }
    out += ch;
  }
  return out.toLowerCase();
}

// A CR 207.2c ability word labels a line and has no rules meaning; the condition it introduces is in the text after it. Channel
// and forecast label abilities used from the hand (Born to Drive, Plumes of Peace) — read as neutral lines, never stripped.
const ABILITY_WORD_RE = /^(?:threshold|hellbent|delirium|corrupted|fathomless descent|addendum|metalcraft|morbid|ferocious|revolt|domain|kinship|radiance|landfall|constellation|heroic|valiant|celebration|coven|adamant|chroma|imprint|raid|undergrowth|formidable|battalion|eminence|strive|inspired|enrage|alliance|pack tactics|survival)\s*[—–-]\s*/;

/** The text's sentences, quote-aware: a period inside a quoted granted ability never splits it. */
function sentencesOf(text) {
  const out = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(ABILITY_WORD_RE, "");
    if (!line) continue;
    let buf = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      if (!inQuote && ch === "." && (i === line.length - 1 || /\s/.test(line[i + 1]))) {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

/** "+2/+2" → OWN, "-1/-1" / "-2/-0" → ENEMY, "+2/-1" → MIXED, "+0/+0" → NEUTRAL. */
function ptSide(sp, p, st, t) {
  const pZero = p === "0";
  const tZero = t === "0";
  if (pZero && tZero) return NEUTRAL;
  const pUp = sp === "+" && !pZero;
  const tUp = st === "+" && !tZero;
  const pDown = sp === "-" && !pZero;
  const tDown = st === "-" && !tZero;
  if ((pUp || tUp) && !pDown && !tDown) return OWN;
  if ((pDown || tDown) && !pUp && !tUp) return ENEMY;
  return MIXED;
}

/** Fold one clause's side into a running side (NEUTRAL is the identity; OWN beside ENEMY is MIXED; UNKNOWN wins). */
function fold(side, s) {
  if (side === UNKNOWN || s === UNKNOWN) return UNKNOWN;
  if (side === MIXED || s === MIXED) return MIXED;
  if (s === NEUTRAL) return side;
  if (side === NEUTRAL) return s;
  return side === s ? s : MIXED;
}

// Keywords that only ever help the permanent that has them.
const GOOD_KEYWORDS = [
  "flying", "first strike", "double strike", "deathtouch", "haste", "hexproof(?: from [a-z ]+)?", "indestructible", "lifelink",
  "menace", "reach", "trample", "vigilance", "shroud", "intimidate", "fear", "banding", "flanking", "horsemanship", "shadow",
  "infect", "wither", "prowess", "exalted", "undying", "persist", "[a-z]+walk", "nonbasic landwalk", "landwalk of the chosen type",
  "protection from [a-z ,]+", "ward \\{[^}]+\\}", "annihilator \\d+", "bushido \\d+", "rampage \\d+", "toxic \\d+", "afflict \\d+",
  "battle cry", "myriad", "melee", "training", "skulk",
];
const GOOD_KEYWORD_RE = new RegExp(`^(?:${GOOD_KEYWORDS.join("|")})$`);
const keywordList = (text) => text.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);

/** A granted quoted ability ("Enchanted creature has \"…\""): the host gains it, so "you" there is the host's controller. */
function quotedSide(q) {
  const s = q.trim().replace(/\.$/, "");
  if (/^cumulative upkeep\b/.test(s)) return ENEMY; // a cost its controller must pay every upkeep (Mana Chains, Decomposition)
  if (/^you have no maximum hand size$/.test(s)) return OWN;
  if (/^untap this (?:land|creature|permanent|artifact) during each other player's untap step$/.test(s)) return OWN;
  if (/^equipped creature (?:gets \+\d+\/\+\d+ and has [a-z ,]+|gets \+\d+\/\+\d+|has [a-z ,]+)$/.test(s)) {
    const kws = (s.match(/has ([a-z ,]+)$/) || [])[1];
    if (!kws || keywordList(kws).every((k) => GOOD_KEYWORD_RE.test(k))) return OWN;
    return UNKNOWN;
  }
  // An activated ability is optional for the player who controls what has it (CR 602.1). "Any player may activate" is not.
  const act = s.match(/^([^:"]+):\s*(.+)$/);
  if (act && !/^(?:when|whenever|at)\b/.test(act[1]) && !/any player may activate/.test(s)) return OWN;
  // A triggered ability: only an effect that is plainly its controller's gain is read.
  const trig = s.match(/^(?:when|whenever|at) ([^,]+), (.+)$/);
  if (trig) {
    const GOOD_EFFECT = [
      "(?:you )?draw a card", "investigate", "you may tap or untap target permanent", "put a \\+1\\/\\+1 counter on this creature",
      "it gets \\+(?:\\d+|x)\\/\\+(?:\\d+|x) until end of turn(?:, where x is [a-z ]+)?", "add that much \\{[a-z]\\}(?:\\. until end of turn, you don't lose this mana as steps and phases end)?",
      "you (?:may )?(?:gain|scry) \\d+(?: life)?", "create (?:a|an|x|\\w+) [^.]*tokens?", "(?:that player|defending player) discards a card",
      "it deals x damage to defending player, where x is the number of cards in their hand",
    ];
    return new RegExp(`^(?:if [^,]+, )?(?:${GOOD_EFFECT.join("|")})$`).test(trig[2]) ? OWN : UNKNOWN;
  }
  return UNKNOWN;
}

/**
 * One predicate the enchanted permanent is given ("gets +4/+4", "has flying and first strike", "is an Angel in addition to its
 * other types", "loses all other abilities"); `noun` is the host noun, `quotes` the sentence's quoted abilities by index. A
 * side, or a marker the sentence-level transformation rule reads: { strips } (all abilities / other card types taken away),
 * { body } (a base power and toughness or a type set — what a transformation turns the host into; alone, unknown).
 */
function predicateSide(pred, noun, quotes) {
  const p = pred.trim().replace(/^it\s+/, "");
  let m;
  if ((m = p.match(new RegExp(`^gets (?:an additional )?${PT}(.*)$`)))) {
    const tail = m[5].trim();
    // A count or a game condition keeps the sign's side; a condition on the host itself ("as long as it's a Human") doesn't.
    if (tail && !/^(?:for each [^,]+|, where [xy] is .+|where [xy] is .+|as long as (?!it\b|it's|enchanted\b).+)$/.test(tail)) return UNKNOWN;
    return ptSide(m[1], m[2], m[3], m[4]);
  }
  if (/^has base power and toughness \d+\/\d+$/.test(p)) return { body: true };
  if ((m = p.match(/^has (.+)$/))) {
    let side = NEUTRAL;
    for (const item of keywordList(m[1])) {
      const q = item.match(/^@q(\d+)@$/);
      let s;
      if (q) s = quotedSide(quotes[Number(q[1])]);
      else if (GOOD_KEYWORD_RE.test(item)) s = OWN;
      else if (item === "defender") s = ENEMY;
      else if (/^base power and toughness \d+\/\d+$/.test(item)) return { body: true };
      else s = UNKNOWN;
      side = fold(side, s);
    }
    return side;
  }
  if (/^loses all (?:other )?abilities$/.test(p) || /^loses all other (?:card types(?: and abilities)?|abilities, card types, and creature types)$/.test(p)) return { strips: true };
  if ((m = p.match(/^loses ([a-z ,]+)$/)) && keywordList(m[1]).every((k) => GOOD_KEYWORD_RE.test(k))) return ENEMY;
  if (/^is goaded$/.test(p)) return ENEMY;
  if (/^attacks each combat if able$/.test(p)) return ENEMY;
  if (/^doesn't untap during its controller's untap step(?: if [a-z' ]+)?$/.test(p)) return ENEMY;
  if (/^can't become untapped(?: and can't have counters put on it)?$/.test(p)) return ENEMY;
  if (/^can't attack you or planeswalkers you control$/.test(p) || /^can't block creatures you control$/.test(p)) return NEUTRAL;
  if (/^can't (?:attack|block|attack or block|attack, block, or (?:crew vehicles|transform))(?: unless its controller pays [^,]+)?$/.test(p)) return ENEMY;
  if (/^can block only creatures with flying$/.test(p)) return ENEMY;
  if (/^can't be blocked(?: except by [a-z ]+| by [a-z0-9 ]+)?$/.test(p)) return OWN;
  if (/^can't be the target of spells(?: or abilities your opponents control)?$/.test(p)) return OWN;
  if (/^can't be enchanted by other auras$/.test(p)) return NEUTRAL;
  if (/^can block (?:any number of creatures|an additional creature(?: each combat)?)$/.test(p)) return OWN;
  if (/^can attack as though it (?:had haste|didn't have defender)$/.test(p)) return OWN;
  if (/^its activated abilities can't be activated(?: unless they're mana abilities)?$/.test(p)) return ENEMY;
  // Type and colour words: "is an Angel in addition to its other types", "is black", "is legendary".
  if (/^is (?:an? )?[a-z' -]+ in addition to its other (?:colors and )?types$/.test(p)) return NEUTRAL;
  if (/^is (?:every creature type|legendary|white|blue|black|red|green)$/.test(p)) return NEUTRAL;
  // A creature type set ("is a Spirit") — never a card type, which would replace "creature" (CR 205.1a).
  if (noun === "creature" && /^is an? [a-z]+$/.test(p) && !/^is an? (?:land|artifact|enchantment|planeswalker|creature|battle|instant|sorcery)$/.test(p)) return NEUTRAL;
  // A land animated (a Zendikon's "is a 4/4 Elemental creature with reach and haste"; Awaken the Ancient's 7/7 Giant), an
  // artifact made a creature in addition to its types (Ensoul Artifact): its controller gains a creature.
  if (/^(?:land|plains|island|swamp|mountain|forest)$/.test(noun) && /^is an? \d+\/\d+ [a-z ]*creature(?: with [a-z ,]+)?$/.test(p)) return OWN;
  if (noun === "artifact" && /^is an? [a-z ]*creature with base power and toughness \d+\/\d+ in addition to its other types$/.test(p)) return OWN;
  if (/^is .*with base power and toughness \d+\/\d+$/.test(p)) return { body: true };
  // A type set that replaces every other card type on a nonland host (Song of the Dryads' "colorless Forest land").
  if (noun !== "land" && /^is an? (?:colorless )?[a-z ]*land$/.test(p)) return ENEMY;
  if (/^is an? [a-z ]*(?:artifact|enchantment)(?: with @q\d+@)?$/.test(p)) return { body: true };
  return UNKNOWN;
}

/** Split "gets +4/+4, has flying and first strike, and is an Angel …" into its verb phrases (quotes already masked). */
function predicatesOf(rest) {
  return rest
    .replace(/,? and its activated abilities can't be activated/, ", its-activated-lock")
    .split(/,?\s*(?:and\s+)?(?:it\s+)?(?=(?:gets|has|is|loses|can't|can|doesn't|attacks|must|assigns|its-activated-lock)\b)/)
    .map((x) => x.replace(/^and\s+/, "").replace(/,$/, "").trim())
    .filter(Boolean)
    .map((x) => (x.startsWith("its-activated-lock") ? `its activated abilities can't be activated${x.slice("its-activated-lock".length)}` : x));
}

/** A sentence whose subject is the enchanted permanent ("Enchanted creature gets +2/+2 and has flying"); null if it isn't one. */
function hostStaticSide(sentence, quotes) {
  let noun;
  let rest;
  let m = sentence.match(/^as long as (.+?), (it|enchanted [a-z]+) (.+)$/);
  if (m) {
    const cond = m[1];
    const creatureCond = new RegExp(`^enchanted (${HOST_NOUN}) is a creature$`).exec(cond);
    if (/\benchanted\b|\bit\b|\bit's\b/.test(cond) && !creatureCond) return UNKNOWN; // a condition on the host itself
    noun = creatureCond ? "creature" : m[2] === "it" ? null : m[2].replace(/^enchanted /, "");
    if (!noun) return UNKNOWN;
    rest = m[3];
  } else {
    m = sentence.match(new RegExp(`^enchanted (${HOST_NOUN}) (.+)$`));
    if (!m) return null;
    noun = m[1];
    rest = m[2];
  }
  const preds = predicatesOf(rest);
  if (!preds.length) return UNKNOWN;
  const sides = preds.map((p) => predicateSide(p, noun, quotes));
  const isGets = (i) => /^gets /.test(preds[i].replace(/^it\s+/, ""));
  if (sides.some((x) => x?.strips)) {
    // THE TRANSFORMATION (header): what the sentence gives describes the new body; only a P/T change still counts.
    let side = ENEMY;
    for (let i = 0; i < sides.length; i++) {
      if (sides[i]?.strips || sides[i]?.body) continue;
      if (isGets(i)) side = fold(side, sides[i]);
      else if (/^(?:is |has )/.test(preds[i].replace(/^it\s+/, ""))) continue;
      else side = fold(side, sides[i]);
    }
    return side;
  }
  let side = NEUTRAL;
  for (const x of sides) side = fold(side, typeof x === "string" ? x : UNKNOWN);
  return side;
}

// Sentences that are the Aura's own business — the same whichever side it is on.
const NEUTRAL_SENTENCES = [
  /^enchant [a-z ,'-]+$/,
  /^(?:flash|split second|devoid|cumulative upkeep [^ ]+|vanishing \d+|fading \d+|teamwork \d+)$/,
  /^(?:basic )?(?:land)?cycling (?:\{[^}]+\})+$/,
  /^(?:channel|forecast) — .+$/,
  /^you may cast this spell as though it had flash(?: if [a-z' ]+)?$/,
  /^if you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step$/,
  /^as this aura enters, choose (?:a color|a creature type|a basic land type|a land type)$/,
  /^this effect doesn't remove (?:this aura|auras|auras and equipment you control that are already attached to it)$/,
  /^activate only (?:as a sorcery|during your turn)(?: and only once each turn)?$/,
  /^when this aura is put into (?:a|your) graveyard from the battlefield, (?:return it to (?:its owner's|your) hand|each opponent loses \d+ life|discover \d+)$/,
  /^at the beginning of your upkeep, sacrifice this aura unless you pay (?:\{[^}]+\})+$/,
  /^at the beginning of (?:your|each) upkeep, (?:you may )?put an? [a-z]+ counter on this aura$/,
];

// What an enters trigger does that is the caster's own gain, whatever the Aura enchants.
const NEUTRAL_EFFECT_RE = new RegExp(`^(?:${[
  "(?:you )?draw (?:a card|two cards|three cards)(?: at the beginning of the next turn's upkeep)?",
  "you gain \\d+ life", "scry \\d+", "investigate", "venture into the dungeon", "incubate \\d+", "(?:you may )?mill two cards",
  "(?:exile|destroy) target (?:creature|nonland permanent|creature or planeswalker|artifact or enchantment) an opponent controls(?: until this aura leaves the battlefield)?",
  "you may pay \\{\\d+\\}", // the payment a following "If you do, …" sentence spends (read there)
].join("|")})$`);

/** "When this Aura enters, …": each effect read and folded. */
function entersSide(effect) {
  const parts = effect.split(/,? and (?=(?:you |investigate|remove))|, then /).map((x) => x.trim());
  let side = NEUTRAL;
  for (const e of parts) {
    let s = UNKNOWN;
    if (NEUTRAL_EFFECT_RE.test(e)) s = NEUTRAL;
    else if (new RegExp(`^tap ${HOST}$`).test(e) || e === "remove all counters from it") s = ENEMY;
    else if (new RegExp(`^untap ${HOST}$`).test(e)) s = OWN;
    else if (new RegExp(`^put (?:a|an|one|two|three|six|x) \\+1\\/\\+1 counters? on ${HOST}$`).test(e)) s = OWN;
    else if (new RegExp(`^put (?:a|an|one|two|x) -1\\/-1 counters? on ${HOST}$`).test(e)) s = ENEMY;
    else if (new RegExp(`^it deals \\d+ damage to ${HOST}$`).test(e)) s = ENEMY;
    else {
      const g = e.match(new RegExp(`^${HOST} gains ([a-z ,]+) until end of turn$`));
      if (g && keywordList(g[1]).every((k) => GOOD_KEYWORD_RE.test(k))) s = OWN;
    }
    side = fold(side, s);
  }
  return side;
}

/** A trigger of the Aura (CR 603.1 — "When / Whenever / At …"): its condition and effect, read together. */
function triggerSide(sentence) {
  let m;
  if ((m = sentence.match(/^when this aura enters, (.+)$/))) return entersSide(m[1]);
  // The enchanted permanent dies / is put into a graveyard.
  if ((m = sentence.match(new RegExp(`^when(?:ever)? ${HOST} (?:dies|is put into a graveyard(?: from the battlefield)?), (.+)$`)))) {
    const e = m[1];
    if (/^return that card to (?:its owner's hand|the battlefield(?: tapped)? under its owner's control)$/.test(e)) return OWN;
    if (/^that creature's controller may search their library for a creature card, put that card onto the battlefield, then shuffle$/.test(e)) return OWN;
    if (/^(?:return this card to (?:its owner's hand|the battlefield at the beginning of the next end step)|you may return this card from your graveyard to your hand)$/.test(e)) return NEUTRAL;
    if (/^(?:draw (?:a card|three cards, then discard one of them)|you gain \d+ life)$/.test(e)) return NEUTRAL;
    if (/^target player loses x life and you gain x life, where x is its power$/.test(e)) return NEUTRAL;
    if (/^(?:its|that creature's) controller loses (?:\d+ life|life equal to its power(?: and you gain life equal to its toughness)?)$/.test(e)) return ENEMY;
    if (/^this aura deals damage equal to that creature's toughness to the creature's controller$/.test(e)) return ENEMY;
    return UNKNOWN;
  }
  if ((m = sentence.match(new RegExp(`^when ${HOST} leaves the battlefield, (.+)$`)))) {
    if (/^create a 1\/1 [a-z ]+ creature token(?: with [a-z]+)?$/.test(m[1])) return NEUTRAL;
    if (/^its controller sacrifices a creature of their choice$/.test(m[1])) return ENEMY;
    return UNKNOWN;
  }
  if ((m = sentence.match(/^when this aura leaves the battlefield, (.+)$/))) {
    return new RegExp(`^(?:${HOST}'s controller sacrifices it|destroy ${HOST})$`).test(m[1]) ? ENEMY : UNKNOWN;
  }
  if (/^that creature can't be regenerated$/.test(sentence)) return ENEMY; // the rider of a destroy read ENEMY just before it
  // The enchanted permanent is dealt damage, targeted, blocks, becomes tapped …: destroyed or exiled for it.
  if ((m = sentence.match(new RegExp(`^when ${HOST} (?:is dealt damage|becomes the target of a spell or ability|blocks|becomes tapped|becomes tapped or is dealt damage|attacks or blocks), (.+)$`)))) {
    const e = m[1];
    if (/^sacrifice this aura$/.test(e)) return NEUTRAL;
    if (/^(?:destroy|exile) (?:it|that creature)$/.test(e)) return ENEMY;
    if (/^destroy it and this aura deals \d+ damage to that land's controller$/.test(e)) return ENEMY;
    return UNKNOWN;
  }
  if ((m = sentence.match(new RegExp(`^whenever ${HOST} (attacks|blocks|attacks or blocks|becomes tapped|deals damage|deals combat damage to a player|blocks or becomes blocked|is tapped for mana), (.+)$`)))) {
    const [, when, e] = m;
    if (/^(?:its|that creature's) controller loses (?:\d+|that much) life$/.test(e)) return ENEMY;
    if (/^this aura deals \d+ damage to (?:that creature's|that artifact's) controller(?: unless that player pays \{\d+\})?$/.test(e)) return ENEMY;
    if (/^its controller (?:loses \d+ life|mills \w+ cards|gets a poison counter)$/.test(e)) return ENEMY;
    if (when === "is tapped for mana" && /^its controller adds an additional [a-z{} ]+$/.test(e)) return OWN;
    if (/^you may put a \+1\/\+1 counter on it$/.test(e) || /^it gets \+\d+\/\+\d+ until end of turn and you gain \d+ life$/.test(e)) return OWN;
    if (/^(?:you (?:scry \d+|gain \d+ life)|you draw a card|create that many 1\/1 [a-z ]+ creature tokens|attach any number of target equipment you control to it)$/.test(e)) return NEUTRAL;
    return UNKNOWN;
  }
  // Upkeep and end-step triggers about the enchanted permanent's controller.
  if ((m = sentence.match(new RegExp(`^at the beginning of the upkeep of ${HOST}'s controller, (.+)$`)))) {
    return /^(?:this aura deals \d+ damage to that player|that player loses \d+ life(?: unless they pay \{\d+\})?|put a -\d+\/-\d+ counter on that creature|destroy that land unless that player pays \{\d+\} or \d+ life|that player sacrifices it unless they pay \{x\}, where x is its mana value)$/.test(m[1]) ? ENEMY : UNKNOWN;
  }
  if ((m = sentence.match(new RegExp(`^at the beginning of the end step of ${HOST}'s controller, (.+)$`)))) {
    return /^(?:that player sacrifices that creature|this aura deals \d+ damage to that player unless that creature attacked this turn)$/.test(m[1]) ? ENEMY : UNKNOWN;
  }
  if ((m = sentence.match(new RegExp(`^at the beginning of the draw step of ${HOST}'s controller, (.+)$`)))) {
    return /^that player draws an additional card$/.test(m[1]) ? OWN : UNKNOWN;
  }
  if ((m = sentence.match(/^at the beginning of your upkeep, (.+)$/))) {
    const e = m[1];
    if (new RegExp(`^(?:put a \\+1\\/\\+1 counter on ${HOST}|double the number of \\+1\\/\\+1 counters on ${HOST})$`).test(e)) return OWN;
    if (new RegExp(`^create a token that's a copy of ${HOST}$`).test(e)) return NEUTRAL;
    if (new RegExp(`^${HOST}'s controller sacrifices it and you create a [^.]+ token$`).test(e)) return ENEMY;
    return UNKNOWN;
  }
  if (/^at the beginning of each upkeep, if enchanted creature is untapped, tap it$/.test(sentence)) return ENEMY;
  return UNKNOWN;
}

/** An activated ability of the Aura itself ("{1}{W}: Put a +1/+1 counter on enchanted creature."). */
function auraActivatedSide(cost, effect) {
  if (new RegExp(`\\b(?:tap|sacrifice) ${HOST}\\b`).test(cost)) return UNKNOWN; // the host pays: whose gain depends on the side
  const e = effect.trim();
  if (/^(?:return this aura to its owner's hand|return this card from your graveyard to your hand|attach this aura to target creature(?: other than enchanted creature)?|target creature gains protection from the chosen color until end of turn)$/.test(e)) return NEUTRAL;
  if (new RegExp(`^(?:put a \\+1\\/\\+1 counter on ${HOST}|untap ${HOST}|regenerate ${HOST}|${HOST} gets \\+\\d+\\/\\+\\d+ until end of turn|destroy all non-wall creatures blocking ${HOST}|the next \\d+ damage that would be dealt to ${HOST} this turn is dealt to any target instead)$`).test(e)) return OWN;
  const m = e.match(new RegExp(`^${HOST} and other creatures that share a creature type with it (?:get ${PT}|gain ([a-z ,]+)) until end of turn$`));
  if (m) {
    if (m[5]) return keywordList(m[5]).every((k) => GOOD_KEYWORD_RE.test(k)) ? OWN : UNKNOWN;
    return ptSide(m[1], m[2], m[3], m[4]);
  }
  if (new RegExp(`^(?:put a -1\\/-1 counter on ${HOST}|${HOST} gets -\\d+\\/-\\d+ until end of turn|exile ${HOST}|destroy ${HOST}|shuffle ${HOST} into its owner's library|put ${HOST} into its owner's library third from the top|${HOST}'s owner shuffles it into their library|${HOST} can't block this turn)$`).test(e)) return ENEMY;
  return UNKNOWN;
}

/** One sentence → OWN / ENEMY / NEUTRAL / MIXED / UNKNOWN. */
function sentenceSide(raw) {
  // Mask quoted granted abilities so their punctuation and verbs never split the sentence they sit in.
  const quotes = [];
  const sentence = raw.replace(/"([^"]*)"/g, (_, q) => `@q${quotes.push(q) - 1}@`).trim();
  if (NEUTRAL_SENTENCES.some((re) => re.test(sentence))) return NEUTRAL;
  if (/^(?:umbra|totem) armor$/.test(sentence)) return OWN; // the host survives destruction instead (CR 702.89a)
  if (/^it's still a land$/.test(sentence)) return NEUTRAL;
  if (/^otherwise, it /.test(sentence)) {
    const s = predicateSide(sentence.replace(/^otherwise, it /, ""), "creature", quotes);
    return typeof s === "string" ? s : UNKNOWN;
  }
  // Control of the host changes hands (Take Possession, Annex, Steal Enchantment): its controller loses it.
  if (new RegExp(`^you control ${HOST}$`).test(sentence)) return ENEMY;
  if (new RegExp(`^${HOST}'s activated abilities can't be activated$`).test(sentence)) return ENEMY;
  if (new RegExp(`^activated abilities of ${HOST} cost \\{\\d+\\} more to activate$`).test(sentence)) return ENEMY;
  if (new RegExp(`^(?:equip abilities you activate|aura spells you cast) that target ${HOST} cost \\{\\d+\\} less to (?:activate|cast)$`).test(sentence)) return OWN;
  // "Creatures you control that are enchanted get +1/+1 and have first strike" — the Aura makes its host one of them only on its
  // controller's side (Fencer's Magemark).
  const enchantedYours = sentence.match(new RegExp(`^creatures you control that are enchanted get ${PT}(?: and have ([a-z ,]+))?$`));
  if (enchantedYours) {
    const pt = ptSide(enchantedYours[1], enchantedYours[2], enchantedYours[3], enchantedYours[4]);
    const kws = enchantedYours[5] ? keywordList(enchantedYours[5]).every((k) => GOOD_KEYWORD_RE.test(k)) : true;
    return pt === OWN && kws ? OWN : UNKNOWN;
  }
  if (new RegExp(`^prevent all damage that would be dealt to ${HOST} by sources of the last chosen color$`).test(sentence)) return OWN;
  if (new RegExp(`^prevent all (?:combat )?damage that would be dealt by ${HOST}$`).test(sentence)) return ENEMY;
  if (new RegExp(`^if ${HOST} would be destroyed, instead (?:sacrifice this aura and that land gains indestructible until end of turn|remove all damage from it and destroy this aura)$`).test(sentence)) return OWN;
  if (/^(?:when|whenever|at)\b/.test(sentence)) return triggerSide(sentence);
  if (/^if you do, tap enchanted (?:creature|permanent)$/.test(sentence)) return ENEMY;
  const act = sentence.match(/^([^:]+):\s*(.+)$/);
  if (act && /\{[^}]+\}|sacrifice|tap|pay|discard|exile|return/.test(act[1])) return auraActivatedSide(act[1], act[2]);
  return hostStaticSide(sentence, quotes) ?? UNKNOWN;
}

/**
 * The printed side reading of `card` (the face being cast): `{ side, sentences: [{ text, side }] }` — `side` "own" | "enemy" |
 * null is what printedAuraSide returns; `sentences` (each one's own reading) is for the census and the tests.
 */
export function printedAuraReading(card) {
  // A pure function of the face's name and text, so it is read once per printed card (the AI asks on every decision).
  const face = faceUpView(card) || card;
  const key = `${face?.name ?? ""}\n${face?.oracle ?? face?.oracle_text ?? ""}`;
  if (!READINGS.has(key)) READINGS.set(key, Object.freeze(readPrinted(card)));
  return READINGS.get(key);
}
const READINGS = new Map();

function readPrinted(card) {
  const sentences = sentencesOf(normalizedText(card)).map((text) => ({ text, side: sentenceSide(text) }));
  let side = NEUTRAL;
  for (const s of sentences) side = fold(side, s.side);
  if (side === OWN || side === ENEMY) return { side, sentences };
  if (side === NEUTRAL && sentences.length) {
    // Only the Aura's own business: the Enchant line decides when it names one side.
    const subject = auraEnchantSubject(faceUpView(card) || card) || "";
    if (/ you control$/.test(subject)) return { side: OWN, sentences };
    if (/ (?:an opponent controls|you don't control)$/.test(subject)) return { side: ENEMY, sentences };
  }
  return { side: null, sentences };
}

/** "own" | "enemy" | null — the side `card`'s printed text puts it on, by its clauses' consensus (see the header). */
export function printedAuraSide(card) {
  return printedAuraReading(card).side;
}
