/**
 * effects/splitClauses.js — the oracle → clause[] sentence splitter.
 *
 * Extracted verbatim from parser.js (slice 2 of the parser.js decomposition,
 * 2026-07-18). splitClauses is the pre-parse stage: it breaks an oracle into the
 * atom-sized clauses parseClauseToAtom then recognizes, splitting on sentence
 * boundaries / ";" / top-level " and " while KEEPING modeled multi-sentence shapes
 * whole (the token-ability merges, the intervening-if keep-whole guards, the
 * comma-fold riders). Every "keep whole" / "fold" decision documented inline is a
 * CREED guard — severing a modeled span would silently drop half a card's effect.
 *
 * LEAF — imports only the pure textNormalize strip + the interveningIf shape gate
 * (both leaves; neither imports parser.js), so no cycle. parser.js imports
 * splitClauses back; it stays the sole caller (19 sites, all in parser.js).
 */
import { stripReminder, stripCastKeywordLines } from "./textNormalize.js";
import { spellConditionParseable } from "../interveningIf.js"; // CONDITIONAL SPELL RIDER (BLITZ CD-1) — the board-readable shape gate for the intervening-if keep-whole guards
/**
 * Split an oracle into clauses on sentence boundaries (". "), semicolons, and
 * top-level " and ". Each modeled atom shape ("deals N damage to …", "destroy
 * target creature …", "draw N cards", "target creature gets +X/+Y until end of
 * turn") contains no internal " and ", so splitting on it never severs a modeled
 * clause — but it DOES separate a rider ("… and you gain 3 life") into its own
 * clause, which then either parses to a known atom or forces the whole program low.
 */
export function splitClauses(oracle) {
  const clauses = [];
  // ===== TOKENS ===== T4/T5: normalize the two-sentence "create … token[s][ named N]. It has|They have
  // \"<ability>\"" shape (Eldrazi Scion/Spawn, Llanowar Mentor — singular "It has"; the PLURAL "They have"
  // form of the same, Dread Drone / Emrakul's Hatcher / a plural Devil-maker) into the single-sentence
  // "…token[s][ named N] with \"<ability>\"" form so the create-token matcher binds the ability to the token
  // (the sentence boundary would otherwise orphan the ability into its own unparsed clause → low). Fires ONLY
  // on a QUOTED ability directly after a token-creation sentence; it's content-agnostic (the clean-mana GATE
  // lives in parseTokenManaAbility, the curated-trigger GATE in parseTokenTriggeredAbility — a non-modeled
  // ability still drops the whole clause to low). The merge can only PROMOTE a card that was already low (the
  // orphan clause), never regress a HIGH one.
  // ⭐ CAST-KEYWORD LINES GO FIRST, AND THE ORDER IS THE WHOLE FIX (2026-08-04). A keyword line
  // ("Spectacle {B}", "Flashback {3}{R}") carries no trailing period, and `stripReminder` deliberately
  // COLLAPSES whitespace — newlines included — so once it runs, that line has no identity left and is
  // welded onto the first body sentence. Drill Bit split to "Spectacle {B} Target player reveals their
  // hand", which matches nothing, and the whole spell parsed LOW. Cards whose body happens to be claimed
  // by a whole-oracle COLLAPSE survived it (Light Up the Stage welds identically and is native anyway),
  // which is why the bug read as card-specific rather than structural.
  //
  // ⛔ STRIPPED FROM THE RAW MULTI-LINE TEXT, BEFORE the collapse — its anchors are `^…$` per line and
  // only work while the lines still exist. Doing it the other way round (stripReminder first) makes the
  // line-anchored pattern match the ENTIRE collapsed oracle and delete the card's whole body; that was
  // measured, not imagined, and is why the order is called out here.
  // These lines are already declared vacuous for the normal cast by the same helper the spell path uses.
  const normalized = stripReminder(stripCastKeywordLines(oracle))
    // FINALE-SHUFFLE-REMINDER — strip the vacuous "If you search your library this way, shuffle." sentence
    // (Finale of Devastation). Its "and/or graveyard" tutor (bfxg) ALWAYS searches the library, so the CR-
    // 701.19e shuffle the tutor's own resolver runs already covers this conditional exactly — stripping it
    // just prevents the sentence from orphaning into an unparsed clause (→ low). Anchored to the exact
    // wording, so it can only PROMOTE this already-low library-and/or-graveyard shape; no other card prints it.
    // ⭐ BOTH TENSES (2026-08-05): the cycle prints "If you SEARCH your library this way" (Finale, Niambi)
    // and "If you SEARCHED your library this way" (Sun-Blessed Mount, Huatli's kin). The past-tense
    // printing was missing, so that sentence orphaned into its own unparsed clause and dropped the whole
    // card — while the tutor clause beside it matched perfectly. Measured: the tutor clause tested TRUE
    // against its matcher and the card still classified body-only, which is the tell that the failure was a
    // SIBLING clause rather than the one being worked on.
    .replace(/\s*If you search(?:ed)? your library this way,?\s+shuffle\.?/gi, "")
    // MANA-DRAIN FOLD (2026-08-14) — "Counter target spell. At the beginning of your next main phase,
    // add an amount of {C} equal to that spell's mana value." The sentence split severs the delayed-mana
    // rider from its "that spell" antecedent — the rider alone is a dead referent (→ low) and the bare
    // counter alone would be a CONFIDENT WRONG PARTIAL (a Mana Drain that never pays out — the
    // forbidden direction: it under-credits the card the caster chose for the payout). Fold the period
    // to a comma so the pair stays ONE clause; the stack.js arm matches the folded form exactly and
    // schedules the payout at counter resolution with the MV rewritten concrete. Anchored to the exact
    // printed pair (Mana Drain is its only carrier), so any variant splits normally, byte-identical.
    .replace(
      /(counter target spell)\.\s+(at the beginning of your next main phase, add an amount of \{c\} equal to that spell's mana value)/gi,
      "$1, $2",
    )
    // ===== WALT-ANIMATE ===== strip the vacuous "it's/that's still a land" reminder. A land that
    // "becomes a creature" is additive BY DEFAULT (it stays a land — that's why it still taps; 0
    // non-additive land-animates in the corpus), so this clause never changes resolution. Stripping it
    // lets a separate-sentence reminder ("…until end of turn. It's still a land. Draw a card.") not orphan
    // into an unparsed clause, and folds the inline "…creature that's still a land" form to the core.
    .replace(/\s*(?:it[’']s|that[’']s|they[’']re)\s+still\s+(?:a\s+land|lands)\.?/gi, "")
    .replace(
      /(\bcreates?\b[^.]*?\btokens?\b[^.]*?)\.\s+(?:it has|they have) (["“'])/gi,
      "$1 with $2",
    )
    // PUMP-UNTAP — fold the separate "Untap it." sentence that follows a combat-trick pump ("Target
    // creature[ you control] gets +N/+N and gains KW until end of turn. Untap it." — Vines of the Recluse,
    // Acrobatic Leap, Octopus Form) into the pump sentence as " and untap it", so the pumpClauseParser binds
    // the untap to the SAME single target ("it" = the pumped creature) rather than orphaning it into a
    // separate, unbindable "untap it" clause. Only a +N/+N-with-keyword pump (the exact combat-trick shape).
    .replace(/(gets [+-]\d+\/[+-]\d+ and gains [^.]*?\buntil end of turn)\.\s+untap it\b\.?/gi, "$1 and untap it")
    // SHELF-85 V9 (2026-09-04 — Valley Floodcaller "Birds, Frogs, Otters, and Rats you control get +1/+1 until end of
    // turn. Untap them."): the TEAM twin of the fold above — a trailing "Untap them." binds to the subtype-listed team
    // pump it follows, so pumpClauseParser's multi-subtype arm stamps untap:true on the same locked set. Only the
    // exact "<Subtypes> you control get ±N/±N until end of turn" shape; anything else keeps its own boundary.
    .replace(/((?:^|[\n.]\s*)[A-Za-z]+(?:, [A-Za-z]+)*,? and [A-Za-z]+ you control get [+-]\d+\/[+-]\d+ until end of turn)\.\s+untap them\b\.?/gi, "$1 and untap them")
    // SHELF-85 V13 (2026-09-04 — Maze of Ith "Untap target attacking creature. Prevent all combat damage that would be
    // dealt to and dealt by that creature this turn."): the prevent sentence's "that creature" is the just-untapped
    // target — folded onto the untap so ONE atom carries both halves (preventCombatDamageTurn), never an orphan.
    .replace(/(untap target attacking creature)\.\s+prevent all combat damage that would be dealt to and dealt by that creature this turn\.?/gi, "$1 and prevent all combat damage that would be dealt to and dealt by that creature this turn")
    // HELD-MANA — fold the printed duration sentence onto the add that made the mana: "Add {R}. This mana
    // lasts until end of combat." → "add {R} lasting until end of combat". Without the fold the period splits
    // it in two and the duration is orphaned into an unbindable clause, which is precisely how a plain,
    // WRONG "add {R}" would end up credited — the mana would evaporate a step earlier than the card promises.
    // Folded to a form carrying NO period, so the top-level sentence split cannot shatter it again (the
    // lesson from the slice-10 fold that measured zero flips because " and " re-split it).
    .replace(/(add (?:\{[wubrgc]\})+)\.\s+this mana lasts until end of combat\.?/gi, "$1 lasting until end of combat")
    // COLOR+KEYWORD compound (Crimson Wisps — "Target creature becomes red and gains haste until end
    // of turn."): the top-level " and " split would shatter it into a duration-less "becomes red" and
    // an orphaned "gains haste …", losing the shared until-EOT that governs BOTH halves. Fold to an
    // and-free spelling ONLY the compound arm in atoms/combat.js reads (the held-mana fold's lesson:
    // a fold must leave nothing the later splits can re-shatter). Anchored to the exact printed shape.
    .replace(/\b(becomes (?:white|blue|black|red|green)) and (gains [a-z ]+? until end of turn)\b/gi, "$1 also-$2")
    // KEYWORD+UNBLOCKABLE compound (Pym Particles — "Target creature gains vigilance until end of
    // turn and can't be blocked this turn."): same shatter, same fold discipline; the arm in
    // atoms/combat.js reads the folded spelling and emits one two-grant atom.
    .replace(/\b(gains [a-z ]+? until end of turn) and (can't be blocked this turn)\b/gi, "$1 also-$2")
    // TAP-PERMANENT-LOCK — fold Koma's separate "Its activated abilities can't be activated this turn."
    // sentence that follows "Tap target permanent." into the tap sentence as " and its activated abilities
    // …", so combatKeywordClauseParser binds the activated-ability LOCK to the SAME single target ("Its" =
    // the tapped permanent) rather than orphaning it into a separate, unbindable clause (the same fold as
    // PUMP-UNTAP above). Anchored to the exact tap-permanent + rider pair, so it can only PROMOTE Koma's
    // already-low mode, never regress another card.
    .replace(/(tap target permanent)\.\s+its activated abilities can't be activated this turn\.?/gi, "$1 and its activated abilities can't be activated this turn")
    // TAP-NONLAND-LOCKDOWN — fold Junk Winder's separate "It doesn't untap during its controller's next untap
    // step." sentence that follows "Tap target nonland permanent an opponent controls." into the tap sentence
    // as " and it doesn't untap …", so combatKeywordClauseParser binds the one-shot no-untap lockdown to the
    // SAME single target ("It" = the tapped permanent) rather than orphaning it into a separate, unbindable
    // clause (the same fold as TAP-PERMANENT-LOCK / PUMP-UNTAP above). Anchored to the exact tap-nonland +
    // rider pair, so it can only PROMOTE this already-low shape, never regress another card.
    .replace(/(tap target nonland permanent an opponent controls)\.\s+it doesn[’']t untap during its controller[’']s next untap step\.?/gi, "$1 and it doesn't untap during its controller's next untap step.")
    // TAP-CREATURE-LOCKDOWN — the SINGLE-TARGET creature sibling of the Junk Winder fold above. Two printed
    // shapes carry it, differing only in the rider's pronoun: the bare spell ("Tap target creature. It doesn't
    // untap …" — Ojutai's Breath / Crippling Chill class) and the opponent-restricted ETB ("… tap target
    // creature an opponent controls. That creature doesn't untap …" — Frost Lynx / Frost Trickster class).
    // Both fold onto the tap sentence with " and it …" so combatKeywordClauseParser binds the one-shot lockdown
    // to the SAME single target rather than orphaning an unbindable clause. The opponent-restricted form is
    // listed FIRST: its object is a strict extension of the bare one, and matching bare-first would leave the
    // " an opponent controls" tail stranded. Both anchored to the exact tap + rider pair, so they can only
    // PROMOTE these already-low shapes. Conditional riders ("If that land is an Island, that creature doesn't
    // untap …" — Guardian of Tazeem; "If you control a creature with a counter on it, …" — Celestial Regulator)
    // do NOT match: the rider must follow the tap sentence directly, so those stay LOW → Arbiter (FN-safe).
    .replace(/(tap target creature an opponent controls)\.\s+that creature doesn[’']t untap during its controller[’']s next untap step\.?/gi, "$1 and it doesn't untap during its controller's next untap step.")
    .replace(/(tap target creature)\.\s+it doesn[’']t untap during its controller[’']s next untap step\.?/gi, "$1 and it doesn't untap during its controller's next untap step.")
    // TAP-FREEZE (BLITZ TP-1 — Frost Breath / Sudden Storm / Decision Paralysis / Snow Day class): fold the
    // separate "Those creatures don't untap during their controller's next untap step[s]." sentence that
    // follows "Tap up to two target creatures." into the tap sentence, normalizing BOTH printed possessives
    // ("their controller's … step" / "their controllers' … steps") to one canonical joined form so the
    // multi-tap anchor binds the one-shot no-untap lockdown to the SAME tapped set ("those creatures" = the
    // up-to-two just-tapped — the Junk Winder fold, plural). Anchored to the exact pair — it can only
    // PROMOTE this already-low shape, never regress another card.
    // (Lookahead keeps the sentence-final period OUT of the match, so a following sentence — Sudden
    // Storm's "Scry 1." — still splits into its own clause instead of gluing onto the folded one.)
    .replace(/(tap up to two target creatures)\.\s+those creatures don[’']t untap during their controllers?[’']s? next untap steps?(?=\.|$)/gi, "$1 and they don't untap during their controllers' next untap step")
    // DRAW-LOSE-SUBJECT — "Target player draws N cards and loses M life" (Sign in Blood, Blood Pact, Painful
    // Lesson, Harrowing Journey) shares ONE subject across the conjunction; the top-level " and " split would
    // orphan "loses M life" (no subject → unmodeled). Inject the subject into the 2nd half so both halves parse
    // with their EXISTING who:"target" atoms (draw + lose-life). A trailing rider (", and gets poison" /
    // ", loses … and gets") doesn't match the contiguous "and loses \d+ life" → stays Arbiter (FN-safe).
    .replace(/(target player draws \w+ cards?) and (loses \d+ life)/gi, "$1. Target player $2")
    // NAME-LOCK BOUNCE (SHELF-85 B4, 2026-09-04 — Reflector Mage): "return target creature an opponent controls to its
    // owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn."
    // The second sentence is a RIDER on the bounce (the owner and the name are the bounced card's), so the sentence
    // split would orphan it as an unmodeled clause and park the whole trigger. Folded to a SENTINEL single clause the
    // bounce parser reads (`nameLockUntilNextTurn`); the sentinel phrase appears on no printed card.
    .replace(/(return target creature an opponent controls to its owner's hand)\. that creature's owner can't cast spells with the same name as that creature until your next turn(?=\.|$)/gi, "$1 with a name lock until your next turn")
    // UPKEEP-PLAYER LOSE-DRAW (BLITZ TR-2 — Seizan, Perverter of Truth: "that player loses 2 life and draws
    // two cards", sentinel-rewritten to "the upkeep player …" by detectTriggers): the same shared-subject
    // conjunction as DRAW-LOSE-SUBJECT above, in the printed loses-then-draws order. Inject the subject into
    // the 2nd half so both halves parse with their who:"upkeepPlayer" atoms (lose-life + draw) in written
    // order (CR 608.2c). The sentinel phrase never appears in printed oracle, so this can only touch the
    // event-gated rewrite's output; a trailing rider fails the contiguous match → stays Arbiter (FN-safe).
    .replace(/(the upkeep player loses \d+ life) and (draws \w+ cards?)/gi, "$1. The upkeep player $2")
    // WHEEL — "Each player discards their hand, then draws N cards" (Wheel of Fortune, Reforge the Soul, Wheel
    // of Fate): the ", then" split orphans "draws N cards" of its "each player" subject. Inject it so the draw
    // half parses with the EXISTING draw who:"eachPlayer" atom (the discard-hand half is a new all-mode atom).
    .replace(/(each player discards their hand), then (draws \w+ cards?)/gi, "$1. Each player $2")
    // PLAY-WHILE-EXILED (SHELF-85 K9, 2026-09-04 — Savvy Trader "Exile target permanent card from your graveyard. You may
    // play that card for as long as it remains exiled."): the permission is its OWN SENTENCE bound to the previous
    // sentence's target, so the sentence split severs it. Fold the pair into one clause the exile-from-graveyard arm
    // reads whole (zones.js — `playableWhileExiled`, stamped as an EXTENDED impulse window on the exiled card).
    .replace(/(exile target [a-z' ]*cards? from your graveyard)\. you may play that card for as long as it remains exiled/gi, "$1 and you may play it for as long as it remains exiled")
    // COPY-RETARGET (CR 707.10c — Reverberate, Narset's Reversal, the Fork family): "You may choose new
    // targets for the copy." is its OWN SENTENCE, so it is severed by the sentence split above the clause
    // loop — a keep-whole guard down there cannot reach it, only a normalize fold up here can.
    //
    // DROPPED rather than joined, because DECLINING the retarget is always a legal choice (CR 707.10c): the
    // card modelled without it is a faithful SUBSET — it can forgo an option, never play a different card.
    // Same discipline the alt-cost recording uses. That makes this a strip, not a rewrite, and it leaves the
    // copy matcher a single clean sentence to match.
    //
    // Anchored to the exact optional-retarget sentence. A rider that CHANGES the copy ("…except that the copy
    // is red" — Fork) is a DIFFERENT clause, is not stripped, and keeps its card LOW → Arbiter (CREED).
    .replace(/\.\s*You may choose new targets for the copy\./gi, ".")
    // SPLIT-DAMAGE PAIR (BLITZ LG-1 — Lunge / Hungry Flames / Shower of Sparks): "<name> deals N damage to
    // target creature and M damage to target player or planeswalker" — the " and " joins TWO independent
    // single-target damage instructions sharing one subject; the top-level split would orphan the second
    // half ("M damage to target …" — no subject/verb → LOW). Inject the canonical spell subject so BOTH
    // halves parse with the EXISTING deal-damage atoms (creature + playerOrPlaneswalker), each with its own
    // chosen target (CR 601.2c — two targets, both required; resolution in written order, CR 608.2c).
    // Anchored to the EXACT fixed-amount pair — an X form, "that creature's controller" (Assembled Alphas),
    // or any other tail is untouched → the compound stays LOW → Arbiter (FN-safe).
    .replace(/(deals? \d+ damage to target creature) and (\d+ damage to target player or planeswalker)/gi, "$1. This spell deals $2")
    // SELF-CAST HALF-X ROUNDING (CR 107.3) — a TRAILING "Round down/up each time." directive governs every
    // "half X" magnitude in the SAME effect (Hydroid Krasis: "you gain half X life and draw half X cards.
    // Round down each time."). The directive is its own sentence, so the sentence split would orphan it into an
    // unparsed clause (→ low) AND leave each "half X" half without its rounding rule. Fold the rounding inline
    // onto each "half X <noun>" occurrence ("half X life" → "half X life rounded down"), then strip the now-
    // redundant directive sentence — so the per-clause half-X parser sees a self-contained "gain half X life
    // rounded down" / "draw half X cards rounded down". Gated to the EXACT "(round down|round up) each time"
    // wording (the only corpus form for the BOTH-halves directive); a per-clause ", rounded up" (Contaminated
    // Drink) is untouched (it's already inline). Anchored + idempotent on its own output; a card without the
    // trailing directive is byte-identical.
    .replace(
      /^(.*?\bhalf x\b.*?)\.\s*round (down|up) each time\.?\s*$/i,
      (_, body, dir) => `${body.replace(/\bhalf x\b(\s+\w+)/gi, `half x$1 rounded ${dir.toLowerCase()}`)}.`,
    )
    // RAMP-MULTI-X TWO-SENTENCE FOLD — Traverse the Outlands prints the X-count clause and the put clause as
    // TWO sentences ("…search your library for up to X basic land cards, where X is the greatest power among
    // creatures you control. Put those cards onto the battlefield tapped, then shuffle."). The sentence split
    // would sever the "Put those cards…" instruction from its "search…where X is…" antecedent — leaving the
    // search clause without a destination AND orphaning a bare, unbindable "Put those cards…" fragment. Fold
    // the period into a comma so the whole thing stays ONE "search your library…" clause (the search anchor
    // below keeps it intact), which the mfx tutor matcher then parses as a single RAMP-MULTI-X atom. Anchored
    // to the EXACT "search…for up to X…cards, where X is…. Put those cards onto the battlefield" pair, so it
    // can only PROMOTE this already-low two-sentence shape — a one-sentence form (Boundless Realms) and any
    // other "Put those cards" usage are byte-identical / untouched.
    .replace(
      /(search your library for up to x [a-z][a-z ,]*? cards,? where x is [^.]+?)\.\s+(put those cards onto the battlefield)/gi,
      "$1, $2",
    )
    // SELF-SAC + MULTI-FETCH SEQUENCE (Defense of the Heart) — the compound upkeep-trigger effect "sacrifice
    // this <noun>, search your library for up to two creature cards, put those cards onto the battlefield, then
    // shuffle" is a comma-joined SEQUENCE, not one instruction: the leading "sacrifice this <noun>" is a
    // self-sac atom, the rest is a self-contained tutor. The top-level " and "/", then " split (below) doesn't
    // sever the comma between the self-sac and the tutor, so the whole head-chunk ("sacrifice this <noun>,
    // search…for…cards, put those cards…") would parse as one unmatched clause → low. Cut the FIRST comma
    // (after the leading imperative "sacrifice this <noun>") to a period so the sentence splitter separates the
    // self-sac clause from the tutor, and the tutor half — now STARTING "search your library" — takes the
    // keep-whole tutor path (its internal "…cards, put those cards…" comma is preserved). Anchored to a
    // CLAUSE-INITIAL imperative "sacrifice this <noun>" IMMEDIATELY followed by ", search your library" (the
    // corpus's only such compound is Defense of the Heart), so it can only PROMOTE this one already-low shape;
    // a "you/may sacrifice…" or any non-clause-initial form is untouched. Each split piece is still judged on
    // its own merits (an unmodeled half → low → Arbiter), so a mis-fold can never yield a confident wrong partial.
    .replace(
      /^(sacrifice this (?:creature|permanent|token|land|artifact|enchantment|aura|equipment|vehicle)), (search your library)/i,
      "$1. $2",
    )
    // TITHE THREE-SENTENCE FOLD (SHELF-85 · Otharri O8, 2026-09-05) — "Search your library for a Plains card. If target
    // opponent controls more lands than you, you may search your library for an additional Plains card. Reveal those
    // cards, put them into your hand, then shuffle." is ONE instruction with a conditional cardinality; split, the middle
    // sentence is a leading-if the peel refuses (a targeted compare) and the last is an unbindable "reveal those cards".
    // Folded to one clause (the search anchor keeps it whole), which the tth tutor arm parses as ONE atom. Anchored
    // to the exact shape, so it can only PROMOTE this already-low pair; every other search sentence is untouched.
    .replace(
      /^(search your library for an? [a-z][a-z ]*? card)\. (if target opponent controls more (?:lands|creatures|artifacts|enchantments) than you, you may search your library for an additional [a-z][a-z ]*? card)\. (reveal those cards, put them into your hand, then shuffle)/i,
      "$1, $2, $3",
    );
  // QUOTE-CLOSING SENTENCE BOUNDARY (2026-08-04) — a sentence whose final period sits INSIDE a quoted
  // ability ("… gains \"When this creature dies, return it to its owner's hand.\"") is followed by `."`,
  // not by `. `, so the `\.\s+` boundary never fired and the NEXT sentence was welded onto it (Verdant
  // Rebirth's "Draw a card." rode along inside the grant clause and the whole spell parsed LOW).
  // Purely ADDITIVE: `."` + whitespace is not a boundary today, so this can only ever ADD a split point.
  for (let sentence of normalized.split(/(?:\.\s+|;\s*|(?<=\.")\s+)/)) {
    sentence = sentence.replace(/\.\s*$/, "").trim();
    // ⭐ TWO-SENTENCE FOLD (2026-08-01) — re-join a sentence pair whose MATCHER spans both sentences.
    //
    // THE BUG THIS FIXES, stated exactly because it is counter-intuitive: matchOptionalDiscardPayment and
    // the impulse-exile template are anchored `^…\. …$` ACROSS a sentence boundary. So the pair parsed fine
    // when it WAS the whole card — the matcher saw the undivided string — and shattered the moment any other
    // line preceded it, because then the splitter ran first and handed each half over separately. Neither
    // half parses alone ("If you do, draw a card" / "Until the end of your next turn, you may play that
    // card"), so the WHOLE program went low and the card parked. Seven corpus spells, every LINE of which
    // parses high on its own — a pure composition failure, not a missing mechanic.
    //
    // ⛔ FOLDS ONLY ONTO A MATCHING LEAD, never on the continuation alone. A bare "If you do, …" with no
    // "You may …" before it is still an orphan and must still drop the card (it means the card printed a
    // conditional whose antecedent this splitter did not model). Both halves are anchored, so this can only
    // reassemble the exact strings the existing matchers already claim — it cannot admit a new shape.
    const prev = clauses.length ? clauses[clauses.length - 1] : null;
    if (prev && (
      (/^if you do,/i.test(sentence) && /^you may (?:discard a card|pay \{|sacrifice (?:a|an) )/i.test(prev))
      // LACCOLITH (④-AU, 2026-09-04) — "You may have it deal damage equal to its power to target creature. If you do,
      // this creature assigns no combat damage this turn." is ONE optional instruction with a rider on the taken
      // choice; split, the rider is an orphan and the damage half would resolve WITHOUT the rider (a creature dealing
      // its power twice — the forbidden direction). Both halves anchored, so only this exact pair reassembles.
      || (/^if you do, this creature assigns no combat damage this turn$/i.test(sentence)
          && /^you may have it deal damage equal to its power to target creature$/i.test(prev))
      || (/^(?:until the end of your next turn, you may play|you may play (?:that card|it|them|those cards|cards exiled this way) until (?:the end of your next turn|your next end step))/i.test(sentence) // + "until your next end step" (Inti, 2026-09-05)
          && /^exile the top (?:card|two cards|three cards|four cards|five cards) of your library$/i.test(prev))
      // CZ-COMMANDER-VISIT (Hellkite Courser, 2026-08-14) — the three-sentence ETB is ONE instruction
      // (fetch + haste + the delayed return); both continuations fold onto their exact leads, so this can
      // only ever reassemble the one shape the cz arm claims (the anchored-fold discipline above).
      || (/^it gains haste$/i.test(sentence) && /put a commander you own from the command zone onto the battlefield$/i.test(prev))
      || (/^return it to the command zone at the beginning of the next end step$/i.test(sentence)
          && /put a commander you own from the command zone onto the battlefield\. it gains haste$/i.test(prev))
      // KLAUTH (QUARTET Phase 4, 2026-08-15) — the three-sentence restricted-mana instruction is ONE
      // atom (the X add + its spend restriction + its until-end-of-turn hold are inseparable: splitting
      // would let the add parse alone and mint UNRESTRICTED mana — the laundering FP). Same anchored-fold
      // discipline: each continuation folds only onto its exact lead.
      // CONTINUE? (SHELF-85 · Bumble F6, 2026-09-05) — "Choose up to four target creature cards in your graveyard that were
      // put there from the battlefield this turn. Return them to the battlefield." is ONE instruction: the choice and the
      // return (Brought Back, Othelm, Niambi, Grim Return, Salvager of Ruin print the same pair). Both halves anchored.
      || (/^return (?:it|them) to (?:the battlefield(?: tapped)?|your hand)$/i.test(sentence)
          && /^choose (?:up to (?:one|two|three|four|five) )?target [a-z][a-z ]*?cards? in your graveyard that (?:was|were) put there from the battlefield this turn$/i.test(prev))
      || (/^spend this mana only to cast spells$/i.test(sentence)
          && /add x mana in any combination of colors, where x is the total power of attacking creatures$/i.test(prev))
      || (/^until end of turn, you don't lose this mana as steps and phases end$/i.test(sentence)
          && /add x mana in any combination of colors.*spend this mana only to cast spells$/i.test(prev))
      // SARKHAN FIREBLOOD's +1 (2026-08-15) — the FIXED-amount two-sentence sibling of the Klauth fold
      // right above, for the same laundering-FP reason: "Add two mana in any combination of colors."
      // split from its "Spend this mana only to cast Dragon spells." would parse alone and mint
      // UNRESTRICTED mana. The continuation folds only onto the exact fixed-amount any-combination lead
      // (the word-set guard on the atom arm keeps unknown type phrases LOW → Arbiter).
      || (/^spend this mana only to cast [a-z][a-z ]*? spells$/i.test(sentence)
          && /^add (?:(?:one|two|three|four|five) mana in any combination of colors|(?:\{[wubrgc]\})+|two mana of any one color and two mana of any other color)$/i.test(prev)) // + the pip-pool lead (Geosurge, KT-4a) + the two-colour lead (Open the Omenpaths, KT-4b)
      // RIVAZ RIDER (2026-08-15) — the quoted dies-exile grant's period sits INSIDE the quotes, so the
      // sentence split strands the closing quote as its own "clause". Fold it back onto the exact lead
      // (anchored-fold discipline: this can only ever reassemble the one quoted grant the arm claims).
      || (/^"$/.test(sentence) && /gains "when this creature dies, exile it$/i.test(prev))
      // COURT OF CUNNING (2026-08-15) — the monarch-conditional mill override is ONE instruction with
      // its lead ("…mills ten cards INSTEAD" rewrites the amount, CR 614; split, the lead would mill 2
      // unconditionally — a wrong amount for the monarch). Exact pair only.
      || (/^if you're the monarch, each of those players mills ten cards instead$/i.test(sentence)
          && /any number of target players each mill two cards$/i.test(prev))
    )) {
      clauses[clauses.length - 1] = `${prev}. ${sentence}`;
      continue;
    }
    // SEQUENCING "Then" (S6/Plan-the-Heist): a sentence-leading "Then " is pure ordering
    // (CR 608.2c — instructions resolve in written sequence), which the program's atom order
    // already encodes — strip it so "Then draw three cards" parses as "Draw three cards".
    // Only the bare sequencer: "Then, if …"/"Then if …" keep their conditional shape (the
    // "if" survives and gates the match exactly as before).
    sentence = sentence.replace(/^then\s+(?!,)(?!if\b)/i, "");
    if (!sentence) continue;
    // TUTOR + INTERPOSED RANDOM DISCARD (Gamble, 2026-07-23) — "search your library for a card, put
    // that card into your hand, discard a card at random, then shuffle" is a real SEQUENCE of two
    // independent instructions (a plain tutor + a random discard), not one instruction — but the
    // tutor keep-whole rule right below (any "search your library" sentence stays glued, since MOST
    // tutors' internal " and "/commas are part of their own grammar — "reveal it, and put it into
    // your hand") would otherwise swallow the interposed discard clause: tm/ttm/bfm/mf are all
    // end-anchored right after "into your hand"/"onto the battlefield", so an interposed clause
    // between the destination and the trailing "then shuffle" fails the WHOLE sentence, not just
    // the extra part (verified live before this fix: atoms: [], unparsedTail = the entire sentence,
    // confidence "low"). Excise the discard clause here so each half takes its OWN already-modeled
    // path: the tutor half (with "then shuffle" reattached) matches `tm` byte-identical to Demonic
    // Tutor's shape (verified: parses to the same {op:"tutor", filter:null, destination:"hand"}
    // atom); "discard a card at random" is already a clean, separately-modeled discard atom
    // (verified: {op:"discard", amount:1, atRandom:true}). Anchored to Gamble's EXACT wording, not
    // generalized to a numeric/plural form — a live corpus check (42 cards print "discard a card at
    // random" somewhere) found exactly one OTHER card with the identical phrase, Night Out in Vegas,
    // but embedded inside a modal bullet ("• Play Games — Search your library...") rather than as a
    // bare top-level sentence, so it never reaches this per-sentence rule at all (a different parse
    // path entirely — untouched, verified not to match this anchor). Two OTHER cards (Reckless
    // Handling, Wild Research) print a related but differently-ordered shape ("...into your hand,
    // shuffle, then discard a card at random" — discard AFTER the shuffle, not interposed before
    // it) that also doesn't match this anchor; a real, separate future lever, not this fix. So this
    // rule can only PROMOTE Gamble; no other tutor's internal grammar is touched.
    {
      const gambleShape = sentence.match(
        /^(search your library for a card, put that card into your hand), discard a card at random, (then shuffle)$/i,
      );
      if (gambleShape) {
        clauses.push(`${gambleShape[1]}, ${gambleShape[2]}`);
        clauses.push("discard a card at random");
        continue;
      }
    }
    // A sentence that STARTS with "search your library" — or a "you may search your library" optional
    // tutor (RAMP-1: Farhaven Elf's "you may search … put it onto the battlefield … then shuffle") — is
    // ONE tutor instruction (P3.2 / α2): its internal " and " ("reveal it, and put it into your hand",
    // "search for X and Y") is never a top-level effect boundary, so don't sever it (the "you may"
    // wrapper would otherwise be split off from its tutor body, dropping the whole thing to low). MUST be
    // anchored to the start — a sentence that merely CONTAINS it after a leading modeled effect ("Draw a
    // card and search your library …") must still split, or the leading atom (e.g. draw) would parse HIGH
    // while the tutor portion is silently dropped (a confident WRONG partial execution — the cardinal-rule
    // failure, P3.2 review catch). The tutor anchor + the α2 "you may" peel still drop anything they can't
    // model in the whole sentence to low.
    if (/^(?:you may )?search your library\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // THE SAME KEEP-WHOLE FOR A TARGETED SEARCHER (CR 702.124j, the partner-with ETB) — "target player may
    // search THEIR library for a card named X, reveal it, put it into their hand, then shuffle". The anchor
    // above is nailed to "search your library", so this sentence fell through and got severed before its
    // trailing shuffle, leaving a head the tutor arm no longer matched. Exactly the failure the comment three
    // rules below describes: the clause parser returned the right atom when called DIRECTLY and nothing at all
    // through parseEffectClause, because the driver — the SPLITTER — had already taken the sentence apart.
    // Anchored to the full leading phrase, so it can only ever hold this one shape together.
    if (/^target player may search their library\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // MASS GRAVEYARD RETURN (CR 608) — "Return all artifact AND enchantment cards from your graveyard to the
    // battlefield" (Brilliant Restoration, Redress Fate). The internal " and " joins two TYPE WORDS inside one
    // filter phrase, not two effects, so severing it leaves "return all artifact" + an orphan fragment and
    // neither half parses. Same keep-whole reasoning as the tutor anchor above — and the third time this
    // splitter has bitten a filter that happened to contain a separator word.
    if (/^return all [a-z][a-z ]*cards? from your graveyard to (?:the battlefield|your hand)\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // A combat trick that pumps AND grants a keyword ("Target creature gets +2/+2 and gains
    // trample until end of turn"), or grants several keywords ("gains flying and vigilance"),
    // joins its parts with " and " — NOT a top-level effect boundary. Keep the whole sentence
    // as one clause so the clause parse binds the pump + grant to the SAME target.
    // ⭐ +X/+X JOINED THE PIP PATTERN 2026-08-14 (Tyvar's Stand "gets +X/+X and gains hexproof and
    // indestructible until end of turn"): the fixed-digit pips excluded the X form, so the X compound
    // SHATTERED on " and " exactly like the permanent-subject case below — and the amountX path never
    // saw it. Keeping it whole is FN-safe as ever: the clause parse still gates the whole shape.
    // ⭐ "ARTIFACT creature" JOINED 2026-08-16 (Baxter Stockman's combat-begin pump, SHELF-TAIL H1): the
    // optional type qualifier let the whole clause shatter before pumpClauseParser's artifact-creature arm
    // saw it. The cardType restriction rides the same keep-whole path (bare "you control" only for the
    // typed form — the printed shape).
    // ⭐ THE COUNTER-BEARING QUALIFIER JOINED 2026-09-03 (④-AD — Steppe Glider "Target creature with a +1/+1 counter
    // on it gains flying and vigilance until end of turn", Sigardian Paladin, Ollenbock Escort): the same shatter
    // again — parseClauseToAtom's ④-AC peel never saw the sentence because " and " had already split it. The
    // qualifier vocabulary here mirrors the peel's exactly (+1/+1, -1/-1, stun, or "a counter"); a type the peel
    // refuses (time) is not kept whole either, so it shatters and parks as before.
    // ⭐ THE COMBAT-ROLE SUBJECT JOINED 2026-09-03 (④-AE — "target attacking creature gets +2/+2 and gains trample until
    // end of turn"): the role word sits BEFORE "creature", and rides the same peel in parseClauseToAtom.
    // ⭐ "ANOTHER" + THE KEYWORD QUALIFIER JOINED 2026-09-03 (④-AF — Scrappy Bruiser's kin "another target attacking
    // creature gets +2/+0 and gains trample until end of turn"; "target creature without flying gets … and gains …").
    // ⭐ THE COUNTED SUBJECTS JOINED 2026-09-04 (④-AS — "any number of target creatures each get +2/+0 and gain trample until
    // end of turn" (Rouse the Mob), "up to two target creatures each get +1/+1 and gain flying"): the count word and the
    // plural "each get / gain" ride the same keep-whole path, so the ④-AR/④-AS peel sees the sentence whole.
    // ⭐ THE SUPERTYPE SUBJECT JOINED 2026-09-04 (SHELF-85 S17 — Plaza of Heroes "target legendary creature gains hexproof and
    // indestructible until end of turn"): "legendary " sits where "artifact " already may.
    if (/^(?:another )?(?:(?:up to (?:one|two|three|four)|any number of) )?target (?:artifact |legendary )?(?:attacking or blocking |attacking |blocking )?creatures? (?:(?:you control|an opponent controls) )?(?:with(?:out)? (?:flying|defender|trample|shadow|first strike|double strike|vigilance|lifelink|deathtouch|menace|reach|haste|hexproof|indestructible) )?(?:with (?:a|an|one or more) (?:(?:[+-]1\/[+-]1|stun) )?counters? on (?:it|them) )?(?:with (?:power|toughness|mana value) \d+ or (?:less|greater|more) )?(?:(?:defending player|that player) controls )?(?:each )?(?:gets? [+-](?:\d+|x)\/[+-](?:\d+|x) and )?gains?\b.*\buntil end of turn(?: and untap it)?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ⭐ THE SAME BINDING FOR A PERMANENT SUBJECT (Tamiyo's Safekeeping — "Target permanent you control gains
    // hexproof and indestructible until end of turn."). The anchor above is nailed to "target creature", so a
    // permanent-subject grant SHATTERED on the internal " and " into "…gains hexproof" + "indestructible until
    // end of turn" and never reached the matcher. Found the hard way: the clause parser returned the right atom
    // when called DIRECTLY and nothing at all through parseEffectClause — when a parser works in isolation but
    // not through its driver, the driver is doing something to the input. Here the driver was the SPLITTER.
    // ⭐ THE BARE PERMANENT SUBJECT JOINED 2026-09-05 (SHELF-85 · Otharri O9 Blacksmith's Skill "Target permanent gains hexproof
    // and indestructible until end of turn."; Renegade's Getaway): the same shatter one qualifier down — "you control" is
    // optional here, and the clause parser's permanent-scoped grant arm (combat.js) owns the reduced shape.
    if (/^target permanent (?:you control )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ⭐ THE ARTIFACT-OR-CREATURE SUBJECT JOINED 2026-09-05 (SHELF-85 · Otharri O10 — Loran's Escape "Target artifact or creature
    // gains hexproof and indestructible until end of turn."; Reroute Systems' single keyword never shattered). Same shatter, same cure.
    if (/^target (?:artifact or creature|creature or artifact) gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ANOTHER-TARGET pump + keyword grant ("another target creature you control gets +2/+2 and gains trample
    // until end of turn" — Gladiolus Amicitia's landfall, Hardened Escort). Same internal-" and " binding as the
    // "target creature …" rule above, but the "^target creature" anchor there doesn't reach the "another …"
    // subject, so the sentence would shatter on " and " and never reach the anotherPt pump matcher. Keep it whole
    // so the pump + grant bind to the SAME excluded-source own target. POSITIVE deltas only (matches the matcher).
    if (/^another target creature you control gets \+\d+\/\+\d+ and gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // BECOMES-A-SUBTYPE-AND-GAINS (SHELF-85 · Light-Paws L5 Enter the Avatar State, 2026-09-05 — "Until end of turn, target
    // creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and
    // hexproof."): the pump parser owns the whole sentence (a keyword pump with a subtype-add rider); its two internal
    // " and "s would otherwise shatter it. Kept whole, like the pump-and-gains guards above.
    if (/^(?:until end of turn, )?target creature(?: you control)? becomes an? [a-z]+ in addition to its other types and gains [a-z ,]+(?: until end of turn)?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // BOUND-REFERENT, ENCHANTED-OR-ENCHANTMENT-CREATURE keyword rider (SHELF-85 · Light-Paws L5 Karametra's Blessing,
    // 2026-09-05 — "If it's an enchanted creature or enchantment creature, it also gains hexproof and indestructible until
    // end of turn."): the SAME internal " and " binding as the rules above, under a leading per-object condition the
    // spell-condition peel steps aside from. Kept whole so the pump parser's rider arm sees the full keyword list.
    if (/^if it's an enchanted creature or enchantment creature, it also gains [a-z ,]+ until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // BOUND-REFERENT keyword grant (CR 608.2) — "They gain flying and double strike until end of turn."
    // (Flying Crane Technique), "They gain hexproof and indestructible …" (Join Shields). Same internal
    // " and " binding as the two rules above, with a PRONOUN subject the "^target creature" anchor cannot
    // reach — so without this the sentence shatters into "they gain flying" + "double strike until end of
    // turn" and neither half parses. A single-keyword referent grant never needed it (no internal " and "),
    // which is why the arm shipped working for one keyword and silently missed two.
    // Widening a keep-whole guard is the SAFE direction: keeping a sentence whole can only fail to match,
    // while SPLITTING is what drops halves on the floor.
    if (/^(?:it|they|them|that creature|those creatures) gains?\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SAME-NAME MASS PUMP (BLITZ BB-1, CR 611.2c — Bile Blight / Echoing Decay / Echoing Courage) — "Target
    // creature and all other creatures with the same name as that creature get ±N/±N until end of turn". The
    // internal " and " (between the ONE chosen target and its same-name fanout set) is NOT a top-level effect
    // boundary — keep the whole sentence so pumpClauseParser binds the single nameFanout pump atom. Anchored on
    // the ±N/±N pump tail so a damage/exile fanout ("…deals 4 damage to target creature and each other creature
    // with the same name…") never captures here (that's a different, un-modeled shape → stays on the Arbiter).
    if (/^target creature and all other creatures with the same name as that creature get [+-]\d+\/[+-]\d+ until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ⭐ SELF-DAMAGE RIDER (2026-08-04 — Orcish Cannonade) — "<source> deals N damage to any target AND M
    // damage to you." The internal " and " joins two RECIPIENTS of one damage instruction, not two
    // effects; severing it leaves the orphan "M damage to you", which parses as nothing and dropped the
    // whole spell. Found by SIBLING ASYMMETRY: 20 corpus carriers and ELEVEN already native — all the
    // ACTIVATED ones, whose sentence reaches the clause parser intact and never meets this splitter. The
    // same words, modeled on one path and not the other, so this was never a missing mechanic.
    //
    // ⛔ "TO YOU" ONLY, and that exclusion is the CREED call. The parser carries the rider as
    // `selfDamage`, which stack.js applies to the CONTROLLER — right for "you", wrong for "itself"
    // (CR 119.3: the creature damages ITSELF). Measured: the "itself" form parses with NO selfDamage
    // field at all, so keeping those sentences whole credited Psionic Entity / Reckless Embermage /
    // Psionic Sliver as native while their self-damage did nothing — strictly BETTER than printed, a
    // forbidden FP. They stay parked until the source-directed form gets a real resolver.
    // ⛔ AND ANCHORED TO "ANY TARGET", which is narrower than the sentence shape and deliberately so: it is
    // exactly what matchSelfHitDamage can consume. Keeping a WIDER sentence whole is not free — the clause
    // then reaches the ordinary damage parser, which matches the leading half and silently drops the
    // rider. Measured on Fire and Brimstone ("…to target player who attacked this turn and 4 damage to
    // you"): kept whole it classified native-spell with NO selfDamage at all, i.e. credited while dealing
    // nothing to its controller. It splits and parks instead, until that target restriction is modeled.
    if (/\bdeals \d+ damage to any target and \d+ damage to you\.?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // GUSTCLOAK ESCAPE (BLITZ GC-1, CR 506.4) — "[you may ]untap (it|this creature) and remove (it|this
    // creature) from combat" (the becomes-blocked escape's effect — Gustcloak Runner/Sentinel/Harrier/
    // Skirmisher/Cavalier). The " and " joins the untap to the combat removal within ONE instruction on the
    // SAME self referent, not a top-level boundary — keep the sentence whole so the α2 "you may" peel + the
    // untap-remove-from-combat clause parser bind it as one optional atom. Anchored ^…$ so the TARGETED
    // spell/ability forms ("Remove target attacking creature … from combat and untap it" — Reconnaissance,
    // reversed order + a chosen target) and any rider never capture here (they shatter and stay LOW → Arbiter).
    if (/^(?:you may )?untap (?:it|this creature) and remove (?:it|this creature) from combat$/i.test(sentence)) { clauses.push(sentence); continue; }
    // CAUSATIVE pump + keyword grant ("have target creature get +2/+0 and gain deathtouch until end of turn" —
    // Painsmith, the inner of "you may have …"): the " and " joins the P/T bump to the grant within ONE causative
    // instruction, not a top-level boundary. Keep it whole so pumpClauseParser binds the pump + grant to the SAME
    // target (mirrors the spell-voice "gets … and gains" rule above). The bare causative pump has no " and " so
    // it never reaches this split path; this rule only protects the +keyword causative shape.
    if (/^(?:you may )?have target creature get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Overrun-style TEAM pump + keyword grant ("Creatures you control get +3/+3 and gain
    // trample until end of turn"): the " and " between the P/T bump and the grant is INTERNAL
    // to one team-pump instruction, not a top-level effect boundary. Keep the whole sentence so
    // the clause parse binds the controller-scoped pump + grant together (plural subject →
    // "gain", no trailing s).
    if (/^(?:legendary )?creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }  // "legendary" = Hajar
    // OPEN THE OMENPATHS (KT-4b): the two-colour lead is ONE add — its " and " is inside the sentence, not a clause boundary;
    // kept whole so the spend-rider fold below sees the full lead as `prev`.
    if (/^add two mana of any one color and two mana of any other color$/i.test(sentence)) { clauses.push(sentence); continue; }
    if (/^target player draws (?:[a-z]+|[0-9]+) cards?, then discards (?:[a-z]+|[0-9]+) cards?$/i.test(sentence)) { clauses.push(sentence); continue; } // CEPHALID COLISEUM (KN-4): one atom, one player — the ", then" is NOT a clause seam here
    if (/^each opponent sacrifices a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control$/i.test(sentence)) { clauses.push(sentence); continue; } // FLARE OF MALICE (BI-4): the "and" inside the selector is not a clause seam
    // COND-X TEAM PUMP (Finale of Devastation) — "If X is N or more, creatures you control get +X/+X and gain
    // KW until end of turn". The "If X is N or more, " prefix conditions the WHOLE team pump on the chosen X;
    // the " and gain …" is INTERNAL to that one pump instruction (same as the unconditional form above), NOT a
    // top-level boundary. Keep the whole sentence so condPumpXClauseParser binds the condition + pump + grant
    // together. All-or-nothing anchored downstream (an un-grantable keyword / non-+X/+X delta fails → low).
    if (/^if x is \d+ or more, creatures you control get \+x\/\+x(?: and gain\b.*)? until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TEAM-PUMP-SCOPE — the "other creatures" (excludes the source) and "<Subtype>s you control [other than
    // this creature]" (subtype-filtered) variants of the Overrun-style team pump + keyword grant ("Other
    // creatures you control get +2/+2 and gain trample until end of turn" — End-Raze Forerunners; "Dinosaurs
    // you control other than this creature get +1/+1 and gain flying until end of turn" — Triceraton Commander).
    // The " and gain …" is INTERNAL to the one team-pump instruction (same as the unfiltered form above), NOT a
    // top-level boundary — keep the whole sentence so the clause parse binds the scoped pump + grant together.
    // ⚠️ THE LEADING "other" HAS TO BE NAMED HERE TOO. The alternation used to read
    // `(?:other creatures|[a-z]+s)`, which admits "other creatures" and "Humans" but NOT the printed
    // "other Humans you control get … and gain …" (Heron's Grace Champion) — so that sentence was SPLIT at
    // the " and ", the grant was severed from its pump, and the card parked no matter what the clause parser
    // could do. The parser arm and this guard must recognize the SAME shapes; teaching only one of them is
    // how a form ends up parsing perfectly in isolation and failing on the actual card.
    if (/^(?:other )?[a-z]+s you control (?:other than this creature )?get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SHELF-85 V9 (2026-09-04 — Valley Floodcaller "Birds, Frogs, Otters, and Rats you control get +1/+1 until end of
    // turn[ and untap them]"): the SUBTYPE LIST is one team-pump subject — its commas and " and " are internal, not
    // clause boundaries — and the folded " and untap them" tail belongs to the same instruction. Keep the whole
    // sentence so pumpClauseParser's multi-subtype arm binds list + pump + untap together (the arm re-gates every
    // listed word against the curated vocabulary; an uncurated word parks the card).
    if (/^[a-z]+(?:, [a-z]+)*,? and [a-z]+ you control get [+-]\d+\/[+-]\d+ until end of turn(?: and untap them)?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SHELF-85 V13 (2026-09-04 — Maze of Ith, after the fold above): "untap target attacking creature and prevent all
    // combat damage that would be dealt to and dealt by that creature this turn" is ONE instruction — both " and "s are
    // internal (the fold's join, and the printed "dealt to and dealt by"). Keep it whole for the untap arm.
    if (/^untap target (?:attacking )?creature and prevent all combat damage that would be dealt to and dealt by that creature this turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TYPE-NEGATED TEAM PUMP + KEYWORD GRANT — the "non-<Subtype> creatures you control get +P/+T and gain KW …"
    // variant (Return of the Wildspeaker's +3/+3 mode has no keyword, so it never reaches this " and " guard;
    // this only protects the keyword-grant sibling form). The " and gain …" is INTERNAL to the one team-pump
    // instruction — keep the whole sentence so pumpClauseParser binds the negated-scope pump + grant together.
    if (/^non-[a-z]+ creatures you control get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // MULTI-COUNT PUMP + KEYWORD GRANT (VERIFY PROTOTYPE) — keep "up to N target creatures each get ±P/±T and gain KW until end of turn" whole.
    if (/^up to (?:two|three|four|five) target creatures(?: you control)? each get [+-]\d+\/[+-]\d+ and gain\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // GROUP-KEYWORD-GRANT — "(Creatures|Permanents) you control gain <kw> and <kw> until end of turn"
    // (Heroic Intervention "hexproof and indestructible"): the " and " joins a KEYWORD LIST, INTERNAL to
    // one group-grant instruction, NOT a top-level effect boundary. Keep the whole sentence so
    // groupGrantClauseParser sees the full keyword list. All-or-nothing anchored downstream (an un-grantable
    // word → null → low → Arbiter), so keeping too much together can only fail to match, never a wrong partial.
    if (/^(?:creatures|permanents) you control gains?\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ⭐ THE OPPONENT-SCOPED MIRROR — "(Creatures|Permanents) your opponents control LOSE <kw> and <kw> until
    // end of turn" (Shadowspear #325, Bonds of Mortality). Identical reasoning to the grant rule directly
    // above: the " and " joins a KEYWORD LIST inside one instruction, not a top-level boundary.
    // ⚠️ SECOND TIME THIS EXACT TRAP HAS BEEN HIT IN THIS RUN. Tamiyo's Safekeeping shattered the same way,
    // because a keep-whole rule was anchored to one subject ("^target creature") and its sibling subject fell
    // through. The tell is identical both times: the clause parser returns the CORRECT atom when called
    // directly and parseEffectClause returns nothing. **When adding a parser whose clause contains an
    // internal " and ", check the splitter FIRST — it is upstream of everything else.**
    if (/^(?:creatures|permanents) your opponents control lose\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SWITCH-PT — "switch <referent> power and toughness until end of turn": the " and " in "power and
    // toughness" is INTERNAL to the one swap instruction, NOT a top-level effect boundary. Keep it whole so
    // combatKeywordClauseParser binds the layer-7d swap (else it shatters into "…power" + "toughness…" → low).
    if (/^switch (?:target creature's|this creature's|the triggering creature's) power and toughness until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // DOUBLE-PT — "double the power and toughness of <referent> until end of turn": the " and " in "power and
    // toughness" is INTERNAL to the one doubling instruction (CR 701.10), NOT a top-level effect boundary. Keep
    // it whole so pumpClauseParser binds the per-target double (else it shatters into "…power" + "toughness…" →
    // low). Two self-normalized referents: "each creature you control" (Unnatural Growth / Zopandrel combat
    // trigger) and "this creature's" (Reckless Amplimancer's activated ability). Power-only doubles have no
    // internal " and " so they never reach this split — no guard needed for them.
    if (/^double (?:the power and toughness of each creature you control|this creature's power and toughness) until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SELF pump + keyword grant ("This creature gets +1/+0 and gains trample until end of turn" / "This
    // creature gains flying and vigilance until end of turn") — the " and " is INTERNAL to the one
    // self-grant instruction (CR 113.7 "this creature" = the source), NOT a top-level effect boundary.
    // Keep the whole sentence so the clause parse binds the self pump + every granted keyword together
    // (ACT-KW-GRANT). All-or-nothing anchored, so an un-grantable keyword just fails to match → low.
    if (/^this creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TRIG-PRONOUN-IT — the NON-SELF triggering-permanent analogue of the self pump+grant above: the
    // detectTriggers sentinel "the triggering creature gets +P/+T and gains KW until end of turn". Same
    // INTERNAL " and " (one pump+grant instruction on the triggering creature), so keep the whole sentence
    // for the clause parse. All-or-nothing anchored; a sentinel-only phrase, never produced by a spell.
    if (/^the triggering creature (?:gets [+-]\d+\/[+-]\d+ and )?gains\b.*\buntil end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== TOKENS ===== a keyword token minted with several keywords ("Create a 4/4 white Angel
    // creature token with flying and vigilance") joins them with " and " — INTERNAL to the one
    // create-token instruction, not a top-level effect boundary. Keep the whole sentence so
    // the clause parse binds every keyword to the same token. The token matcher is all-or-nothing
    // anchored, so keeping too much together can only fail to match (→ low → Arbiter), never a
    // confident wrong partial — e.g. "… with flying and a 1/1 Snake token" / "… with flying and you
    // gain 2 life" both fail the keyword allowlist and drop to low (safe), they don't half-resolve.
    // The same applies to a count-scaled "…creature token FOR EACH <source>" (WALT-FOREACH-TOK) — a
    // MULTI-COLOR descriptor ("black and green Insect") carries an internal " and " that must not be
    // split off, so keep the whole "create … creature token (with|for each) …" sentence together.
    if (/^create .*\bcreature tokens?\b (?:with|for each) .+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== TREASURE-MAKER ===== a DYNAMIC-count named artifact token ("Create X Treasure tokens, where X
    // is the number of artifacts and enchantments your opponents control" — Dockside; "Create a Treasure
    // token for each artifact that player controls" — Cavern-Hoard) carries an internal " and " (the
    // "artifacts and enchantments" union) and a ", where X is …" count tail that are INTERNAL to the one
    // create-token instruction, NOT a top-level effect boundary. Keep the whole sentence so the clause parse
    // binds the count source to the token. All-or-nothing anchored downstream (an unmodeled count source →
    // null → low → Arbiter), so keeping too much together can only fail to match, never a wrong partial.
    if (/^create (?:x|a|an|one) (?:treasure|clue|food|gold) tokens?(?:,? where x is | for each ).+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TOKEN-BARE-MULTICOLOR — "create a 1/1 green and white Citizen creature token" (no "with"/"for each"
    // suffix) and its "you may create …" optional form (upkeep token triggers like Creakwood Liege).
    // The multi-color descriptor ("green and white") carries an INTERNAL " and " that the top-level
    // splitter (line 288) would cut, orphaning "white Citizen creature token" as an unparsed fragment.
    // Keep the whole bare-create sentence so the create-token regex matches the full color+type descriptor;
    // `parseClauseToAtom` then peels the "you may" wrapper before matching. Anchored to $ so
    // "…token and draw a card" (ending "card") still splits at " and " — only the bare form is protected.
    if (/^(?:you may )?create\b.*\bcreature tokens?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ===== WALT-ANIMATE ===== "[Until end of turn,] target land becomes a N/N [subtype] creature [with
    // KW[ and KW]] [until end of turn]" — the " and " inside a multi-keyword rider ("with reach and haste")
    // is INTERNAL to the one animate instruction, not a top-level boundary. Keep the whole sentence so
    // the clause parse binds the P/T-set + every granted keyword to the same animate atom (all-or-nothing
    // anchored — an un-grantable keyword / color-set / permanent duration just fails to match → low → Arbiter).
    if (/^(?:until end of turn, )?(?:target|this) land(?: you control)? becomes a \d+\/\d+\b.*\bcreature\b/i.test(sentence)) { clauses.push(sentence); continue; }
    // OVERRUN-X — a COUNT-SCALED team pump ("[Until end of turn,] creatures you control gain trample and
    // get +X/+X[ until end of turn], where X is the greatest power among / the number of creatures you
    // control" — Overwhelming Stampede, Craterhoof Behemoth's ETB). The " and " between the keyword grant
    // and the +X/+X bump, plus the trailing ", where X is …" count clause, are INTERNAL to one team-pump
    // instruction — keep the whole sentence so the clause parse binds grant + scaled pump + count source
    // together. All-or-nothing anchored downstream (un-grantable keyword / unmodeled count source → low).
    if (/^(?:until end of turn, )?creatures you control gain .+ get \+x\/\+x.* where x is /i.test(sentence)) { clauses.push(sentence); continue; }
    // SYMBURN-1 symmetric burn ("<source> deals N damage to each creature and each player" — Inferno,
    // Fire Tempest, Evincar's Justice): the " and " between "each creature" and "each player" is INTERNAL
    // to one mass-damage target, NOT a top-level effect boundary. Keep the whole sentence so the damage
    // atom binds the combined eachCreatureAndPlayer scope (CR — "each player" is ALL players incl. the
    // caster). Anchored BOTH ends: the tail ($) excludes a qualifier on either half ("…each player that
    // doesn't control a Mountain"); the subject-prefix guard (no top-level " and " before the "deals"
    // verb) excludes a LEADING effect joined by " and " ("You gain 5 life and <name> deals N …") that
    // would otherwise be kept whole and silently DROP the leading effect — the only allowed " and " is
    // the one inside the target. A rejected sentence falls through to the split → low → Arbiter (safe),
    // never a dropped half.
    // ⭐ WIDENED: the creature half may carry a FILTER ("each creature with flying and each player" — Hurricane,
    // Squall Line, Cloudthresher; "each creature without flying and each player" — Earthquake, Fault Line;
    // "each tapped creature and each player" — Blockbuster). The " and " is still INTERNAL to the one recipient.
    //
    // ⭐ WHY WIDENING *THIS* GUARD IS THE SAFE DIRECTION, and it is worth being explicit. Keeping a sentence
    // WHOLE can only cause a failure to match downstream (all-or-nothing → low → Arbiter). SPLITTING is the
    // dangerous operation: it shattered "Earthquake deals X damage to each creature without flying and each
    // player" into a half that parsed HIGH on its own plus an unbindable "each player" — one clause parsing
    // confidently while its sibling is dropped is exactly the shape a dropped-effect FP takes. So a loose
    // keep-whole guard is conservative, and a tight one is not.
    //
    // The filter is left unconstrained here BECAUSE the atom parser is the real gate: massFilteredDamageClauseParser
    // delegates the phrase to parseCreatureTargetRestrictions and refuses on any residue. Both anchors stay:
    // the tail ($) still excludes a qualifier on the PLAYER half ("…each player that doesn't control a Mountain"),
    // and the subject-prefix guard still excludes a LEADING effect joined by " and " ("You gain 5 life and <name>
    // deals N …") that would be kept whole and silently drop the leading effect.
    // The amount may be a literal X — the splitter runs BEFORE parser.js's X→sentinel rewrite, so the
    // sentence still reads "deals X damage" here. Half this family is X spells (Hurricane, Earthquake, Squall
    // Line, Fault Line, Delete), and the \d+-only guard shattered every one of them. The X path itself already
    // carries `restrictions` through rewriteAmountX, so nothing downstream needs to change for X.
    // ⭐ AND THE PLANESWALKER TAIL (SYMBURN-3, 2026-07-30) — "each creature and each planeswalker" (Star of
    // Extinction, Storm's Wrath, Dragonback Assault) and its filtered twin (Magmaquake). Same internal " and ",
    // same reasoning: the tail is part of ONE recipient, and the split was leaving a half that parsed HIGH on
    // its own beside an unbindable "each planeswalker".
    //
    // ⛔ "and each OPPONENT" is deliberately NOT added. There is no combined targetType for an opponents-only
    // sweep, so keeping it whole would only produce a LOW parse — the same outcome as splitting, with less
    // clarity about why. It stays out until its scope exists.
    const symBurn = sentence.match(/^(.*?)\bdeals? (?:\d+|x) damage to each [a-z' -]*creature[a-z' -]* and each (?:player|planeswalker)$/i);
    if (symBurn && !/\band\b/i.test(symBurn[1])) { clauses.push(sentence); continue; }
    // SYMBURN-4 keep-whole — "deals N damage to each opponent and each creature[ and planeswalker] they
    // control". This shape carries TWO internal " and "s, both inside the one recipient, and the split was
    // producing a first half that parses HIGH on its own ("…to each opponent" is a modeled scope!) beside an
    // unbindable "each creature they control". A confident half plus a dropped half is the dropped-effect
    // shape, so keeping it whole is the conservative direction here exactly as it was for SYMBURN-1/3. Same
    // subject-prefix guard: no top-level " and " before the verb, so a leading effect can never be swallowed.
    const oppBurn = sentence.match(/^(.*?)\bdeals? (?:\d+|x) damage to each opponent and each creature(?: and planeswalker)? they control$/i);
    if (oppBurn && !/\band\b/i.test(oppBurn[1])) { clauses.push(sentence); continue; }
    // MASS-NC — "destroy all artifacts and enchantments": the " and " joins two permanent TYPES inside
    // one mass-destroy target, not a top-level effect boundary. Keep the whole sentence so the recognizer
    // binds the combined eachArtifactOrEnchantment scope. Anchored to the exact bare form.
    if (/^destroy all artifacts and enchantments$/i.test(sentence)) { clauses.push(sentence); continue; }
    // MASS-BOUNCE-EXCEPT (Whelming Wave) — "return all creatures to their owners' hands except for Krakens,
    // Leviathans, Octopuses, and Serpents": the trailing " and " joins the LAST creature SUBTYPE in the
    // exclusion list, INTERNAL to one mass-bounce target, NOT a top-level effect boundary. Keep the whole
    // sentence so bounceClauseParser sees the full "except for <Subtype>s … and <Subtype>s" list (else the
    // split below shatters it into a bounce-all + an unbindable "Serpents" fragment). All-or-nothing anchored
    // downstream (a non-curated subtype → null → low → Arbiter), so keeping too much together can only fail to
    // match, never a confident wrong partial. Anchored to the except-for form (the plain unfiltered
    // "return all creatures to their owners' hands" — Evacuation — has no " and ", so it splits cleanly already).
    if (/^return all creatures to their owners['’] hands except for .+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SOURCE-POWER-FANOUT (Chandra's Ignition) — "target creature you control deals damage equal to its power
    // to each other creature and each opponent": the " and " between "each other creature" and "each opponent"
    // is INTERNAL to the one fan-out target, NOT a top-level effect boundary. Keep the whole sentence so
    // parseClauseToAtom binds the combined fan-out (the SOURCE-POWER-FANOUT matcher). Anchored to the exact
    // bare form (a rider/qualifier doesn't match → splits → low → Arbiter, FN-safe).
    if (/^target creature you control deals damage equal to its power to each other creature and each opponent$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SET-BASE-PT-TEAM (Biomass Mutation) — "creatures you control have base power and toughness X/X until end
    // of turn": the " and " inside "base power and toughness" is INTERNAL to the one base-P/T-set instruction,
    // NOT a top-level effect boundary. Keep the whole sentence so setBasePtTeamClauseParser binds it (else it
    // shatters into "…base power" + "toughness X/X…" → low). Anchored to the exact X/X form.
    if (/^creatures you control have base power and toughness x\/x until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // SET-BASE-PT-TARGET (BLITZ SU-1 — Diminish / Square Up) — the single-target twin: the " and " inside
    // "base power and toughness" is internal to the one set instruction. Anchored to the exact literal-N/N
    // form (a rider like Turn to Frog's "and loses all abilities" doesn't match → splits → low → Arbiter).
    if (/^target creature has base power and toughness \d+\/\d+ until end of turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // COMPOUND MANA+LIFE PAYMENT (Ripples of Undeath "you may pay {1} and 3 life", 2026-08-15): the
    // " and " joins the ONE cost, not two effects. Keep the sentence whole (the leading "Then " stripped
    // so the NEXT sentence's "If you do," fold — whose prev anchor is ^you may pay \{ — pairs onto it,
    // and the pair then parses via matchOptionalManaPayment's life-rider grammar). Anchored to the exact
    // pips-and-N-life form; any other "pay X and Y" still splits → low → Arbiter.
    if (/^(?:then )?you may pay (?:\{[^}]+\})+ and \d+ life$/i.test(sentence)) { clauses.push(sentence.replace(/^then\s+/i, "")); continue; }
    // UNTIL-EOT QUOTED GRANT (BLITZ TG-1 — Feign Death / Demonic Gifts / Showstopper): the sentence carries a
    // QUOTED ability body ("…gains \"When this creature dies, …\""), and both the "gets +N/+N AND gains" pump
    // conjunction and any " and " INSIDE the quotes are internal to the one grant instruction, NOT top-level
    // effect boundaries — the split below would shatter the quote. Keep the whole sentence so
    // grantUntilEotClauseParser sees it intact; its body validator + whole-clause anchor keep the CREED gate
    // downstream (an unmodeled body / a rider → null → LOW → Arbiter, never a confident wrong partial).
    // (Shape-D widening 2026-08-14, Strength of Will: an optional " you control" scope and an optional
    // KEYWORD phrase between "gains" and the quote — "…gains indestructible and \"Whenever…\"". The
    // keyword group is bounded by the required ` and "` ahead of the quote, mirroring the arm's regex.
    // Herd Heirloom widening 2026-08-15: the optional " with power N or greater" threshold, mirroring
    // the arm's new power-restriction group exactly — guard and arm must never drift.)
    if (/^until end of turn, (?:target creature(?: you control)?(?: with power \d+ or greater)? (?:gets [+-]\d+\/[+-]\d+ and )?gains(?: [a-z][a-z' ]+ and)?|creatures you control gain) ["“].+["”]\.?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-PERMANENT-LOCK (Koma) — the normalize fold above joined "Tap target permanent. Its activated
    // abilities can't be activated this turn." into one sentence with an internal " and "; that " and " is
    // INTERNAL to the one tap+lock instruction ("Its" = the tapped permanent), NOT a top-level effect
    // boundary. Keep the whole sentence so combatKeywordClauseParser binds the tap + activated-lock to the
    // SAME single target (else the top-level split below shatters it into "tap target permanent" + an
    // unbindable "its activated abilities …" → low). Anchored to the exact folded form.
    if (/^tap target permanent and its activated abilities can't be activated this turn$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-NONLAND-LOCKDOWN (Junk Winder) — the normalize fold above joined "Tap target nonland permanent an
    // opponent controls. It doesn't untap during its controller's next untap step." into one sentence with an
    // internal " and "; that " and " is INTERNAL to the one tap+lockdown instruction ("It" = the tapped
    // permanent), NOT a top-level effect boundary. Keep the whole sentence so combatKeywordClauseParser binds
    // the tap + no-untap lockdown to the SAME single target (else the top-level split below shatters it into
    // "tap target nonland permanent an opponent controls" + an unbindable "it doesn't untap …" → low).
    if (/^tap target nonland permanent an opponent controls and it doesn't untap during its controller's next untap step$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-CREATURE-LOCKDOWN — the same keep-whole guard for the single-target CREATURE sibling the normalize
    // fold above produces (both printed shapes converge on this one joined form). Without it the top-level
    // " and " split shatters the instruction into "tap target creature …" + an unbindable "it doesn't untap …",
    // which is exactly what the lockdown rider needs to avoid — the " and " here is INTERNAL to one tap
    // instruction ("it" = the just-tapped creature), not an effect boundary.
    if (/^tap target creature(?: an opponent controls| you don't control| defending player controls)? and it doesn't untap during its controller's next untap step$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ⭐ The SENTINEL sibling of the guard directly above (the Kashi-Tribe combat-damage family): triggers.js
    // rewrites "tap THAT CREATURE and it doesn't untap…" to "tap THE TRIGGERING CREATURE and it doesn't
    // untap…" so the referent binds to ctx.triggeringPermanentId. That " and " is INTERNAL to one tap
    // instruction, exactly as in the chosen-target form, so it needs the same keep-whole exemption.
    // ⛔ THIS GUARD IS THE WHOLE SLICE. Without it the split shatters the sentinel into "tap the triggering
    // creature" + an unbindable "it doesn't untap…" and the program drops to LOW — the detector, the rewrite
    // and the atom matcher ALL looked correct while every carrier stayed parked. Measured, not assumed.
    if (/^tap the triggering creature and it doesn't untap during its controller's next untap step$/i.test(sentence)) { clauses.push(sentence); continue; }
    // ATTACH-TO-CREATED-TOKEN (Ancestral Blade / Hook Swords / Foot Chopper class) — "create a <token>, then
    // attach this Equipment to it." The ", then" is INTERNAL to a single instruction ("it" = the token this
    // very clause mints), not a top-level effect boundary, so the split would strand "attach this Equipment
    // to it" as an unbindable clause → low. createTokenClauseParser peels the rider off the whole sentence
    // and stamps attachSourceToCreated on the create-token atom.
    if (/^(?:you )?create .*, then attach this equipment to it\.?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TAP-FREEZE (BLITZ TP-1 — Frost Breath class) — the normalize fold above joined "Tap up to two target
    // creatures. Those creatures don't untap during their controller('s|s') next untap step(s)." into one
    // sentence with an internal " and "; that " and " is INTERNAL to the one tap+lockdown instruction
    // ("they" = the just-tapped set), NOT a top-level effect boundary. Keep it whole so the multi-tap anchor
    // binds tap + noUntapNext to the SAME up-to-two targets (else the split strands "they don't untap …" → low).
    if (/^tap up to two target creatures and they don't untap during their controllers' next untap step$/i.test(sentence)) { clauses.push(sentence); continue; }
    // STUN (CR 122.1c) — keep "tap <target-creature-form> and put a stun counter on it/them" WHOLE: the internal
    // " and " joins the stun rider to the SAME tap instruction ("it/them" = the just-tapped creature), NOT a
    // top-level boundary. combat.tapClauseParser folds stunCounter onto the tap atom; a split would strand the
    // unbindable "put a stun counter on it" → low. Anchored to the tap-and-stun forms (Gilded Scuttler family).
    // ⚠️ THE COUNT IS PART OF THE ANCHOR, and it must move together with the matcher's. This rule and
    // combat.tapClauseParser's stun arm both used to hardcode "a stun counter": widening only the matcher
    // changed nothing, because the splitter had already torn "put three stun counters on it" off into its
    // own clause, where the pronoun has nothing to bind to and the card parks. Same two-places shape as the
    // tutor destination's whitelists — a stun count added here without the matcher (or vice versa) is a
    // silent no-op.
    if (/^tap (?:up to (?:one|two|three|four|five) target creatures?|target creature(?: an opponent controls| you don't control| defending player controls)?) and put (?:a|one|two|three) stun counters? on (?:it|them)$/i.test(sentence)) { clauses.push(sentence); continue; }
    // TOKEN-COPY-KEYWORD (Irenicus's Vile Duplication) — "create a token that's a copy of target creature you
    // control, except the token has flying and it isn't legendary": the " and " joins the granted-keyword rider
    // to the "it isn't legendary" no-op, INTERNAL to the one copy instruction, NOT a top-level effect boundary.
    // Keep the whole sentence so tokenCopyParser sees the full "except the token has <kw…> and it isn't legendary"
    // rider (else the top-level split severs it into a plain copy + an unbindable "it isn't legendary" fragment,
    // OR drops a multi-keyword grant). All-or-nothing anchored downstream (an un-grantable keyword → null → low →
    // Arbiter), so keeping too much together can only fail to match, never a confident wrong partial.
    if (/^create a token that(?:'s| is) a copy of target creature you control, except the token has .+$/i.test(sentence)) { clauses.push(sentence); continue; }
    // CONDITIONAL SPELL RIDER (BLITZ CD-1, CR 608.2) — a leading "If <board-condition>, <effect>" sentence
    // ("If you control a Wizard, draw a card"): keep the WHOLE sentence as one clause so the top-level " and "
    // split below can't SEVER a multi-instruction gated effect ("If you control a Vampire, each opponent loses
    // 2 life and you gain 2 life") into a conditional head + an orphaned, now-UNconditional tail (a forbidden
    // dropped-condition FP). parseClauseToAtom's conditional peel then models a SINGLE-atom gated effect
    // (attaching `condition`) or returns null for a multi-atom one → the whole card parks (→ low → Arbiter,
    // CREED). Gated on spellConditionParseable so ONLY a board-readable condition triggers keep-whole; a
    // leading "if" with an unreadable condition ("if its power is 3 or less") splits normally, byte-identical.
    {
      const cm = sentence.match(/^if (.+?), .+$/i);
      if (cm && spellConditionParseable(cm[1])) { clauses.push(sentence); continue; }
    }
    // CONDITIONAL SPELL RIDER — TRAILING form (BLITZ CD-2, CR 608.2) — the mirror of the leading keep-whole
    // above: a "<effect> if <board-condition>" sentence (Inga Rune-Eyes's "…draw three cards if three or more
    // creatures died this turn"; Scalestorm Summoner's "…create a 3/1 red Dinosaur creature token if you
    // control a creature with power 4 or greater" — like CD-1 this ONE clause seam lifts a spell, a trigger, or
    // an activated ability). Keep the WHOLE sentence as one clause so the top-level " and "/", then " split below can't SEVER a
    // scope-AMBIGUOUS compound ("<A> and <B> if <cond>") into an unconditional <A> + a gated <B> — a GUESS at
    // whether the if gates B only or A+B (a forbidden dropped/mis-scoped-condition FP). parseClauseToAtom's
    // trailing peel then models a SINGLE-atom gated effect (attaching `condition`) or returns null for a
    // compound one → the whole card parks (→ low → Arbiter, CREED). Gated on spellConditionParseable so ONLY a
    // board-readable trailing condition triggers keep-whole; an unreadable trailing "if" splits normally,
    // byte-identical. A LEADING-if sentence starts with "if" (no internal " if ") so it never matches here — and
    // the leading keep-whole above already `continue`d it. This addition can only PREVENT a split, never change
    // an existing kept-whole clause; and any sentence it keeps whole has a trailing-if half that failed to parse
    // before this slice (so the card wasn't native already — keep-whole can't regress a native, LOST-safe).
    {
      const tm = sentence.match(/^(.+?) if (.+)$/i);
      if (tm && spellConditionParseable(tm[2])) { clauses.push(sentence); continue; }
    }
    // BLINK / FLICKER keep-whole (CR 400.7 — Cloudshift, Ephemerate, Essence Flux, Blur, Splash Portal).
    // The ", then" split severs "Exile target creature you control, then return that card to the battlefield
    // under your control" into a bare exile plus an orphaned return.
    //
    // THIS ONE IS NOT AN ORDINARY MIS-SPLIT. The comment below reasons that a mis-split "just yields an
    // unmodeled clause → low → Arbiter, never a confident wrong partial" — true in general, and NOT true
    // here: the first half, "exile target creature you control", parses HIGH entirely on its own. So the
    // split does not fail safely; it describes a card that EXILES your creature and never returns it. Keeping
    // the sentence whole is what makes the blink atom reachable and closes that hole in the same stroke.
    //
    // Anchored to the exact printed shape (both the "your"/"its owner's" controller forms); any variant
    // splits normally, byte-identical.
    // UP-TO-TWO joined the guard (2026-08-12 — Displace): the same non-fail-safe split, one size up —
    // "exile up to two target creatures you control" also parses HIGH alone, describing a card that
    // exiles two creatures and never returns them.
    // UP-TO-ONE NONLAND joined 2026-08-14 (Displacer Kitten's cast-trigger blink) — same guard, one
    // size down: the severed first half would exile the permanent and never return it.
    // OPTIONAL "you may" joined 2026-08-16 (Conjurer's Closet — SH13): an end-step "you may exile … you
    // control, then return …" is the SAME non-fail-safe split — the severed "you may exile target creature
    // you control" parses HIGH as an optional exile, describing a card that MAY exile your creature and never
    // return it. The leading "you may" is peeled + stamped optional by the α2 wrapper AFTER keep-whole, so the
    // guard only has to admit the prefix; the inner blink parses exactly as the mandatory form does.
    // HAND-TO-BOTTOM-THEN-DRAW-THAT-MANY keep-whole (SHELF-85 N12, 2026-09-04 — Teferi's Puzzle Box "At the beginning of
    // each player's draw step, that player puts the cards in their hand on the bottom of their library in any order,
    // then draws that many cards" — detectTriggers has already rewritten "that player" to the upkeep-player sentinel):
    // "that many" is the hand count read BEFORE the tuck, so the ", then" split would sever the draw from its count.
    if (/^the upkeep player puts the cards in their hand on the bottom of their library in any order, then draws that many cards\.?$/i.test(sentence)) {
      clauses.push(sentence);
      continue;
    }
    // EACH-PLAYER DISCARD-THEN-DRAW-THAT-MANY keep-whole (SHELF-85 N10, 2026-09-04 — Dark Deal "Each player discards all
    // the cards in their hand, then draws that many cards minus one"; Incendiary Command's fourth mode without the
    // "minus one"): "that many" is each player's OWN discarded count, so the ", then" split would sever the draw from
    // its referent (the orphan "draws that many cards" has no count). Kept whole for the per-player composite arm in
    // hand.js (discard-hand-draw-same, who:"eachPlayer" — Tolarian Winds' atom, every seat).
    if (/^each player discards all the cards in their hand, then draws that many cards(?: minus one)?\.?$/i.test(sentence)) {
      clauses.push(sentence);
      continue;
    }
    // TWO-SEAT DRAW keep-whole (SHELF-85 B8, 2026-09-04 — Loran of the Third Path / Secret Rendezvous / Flumph: "You
    // and target opponent each draw N cards"): the " and " here joins two SUBJECTS of one verb, not two effects; the
    // split would orphan "You" and hand the whole draw to the opponent (the second half parses as "target opponent
    // each draw …" only by accident of the who:"target" arm — a wrong-seat FP). Kept whole for the
    // who:"controllerAndTarget" arm in misc.drawEachPlayerClauseParser.
    if (/^you and target (?:player|opponent) each draw \w+ cards?\.?$/i.test(sentence)) {
      clauses.push(sentence);
      continue;
    }
    // ARTIFACT-OR-CREATURE (SHELF-85 B6, Teleportation Circle "up to one target artifact or creature you control"; the
    // mandatory single form on Escape Protocol / Against All Odds) joined 2026-09-04 — the same severed-exile hazard.
    if (/^(?:you may )?exile (?:target creature|(?:up to one )?target artifact or creature|up to one target nonland permanent|up to two target creatures|two target artifacts, creatures, and\/or lands) you control, then return (?:that card|it|those cards) to the battlefield under (?:your|its owner's|their owner's) control\.?$/i.test(sentence)) {
      clauses.push(sentence);
      continue;
    }
    // TAPPED-AND-ATTACKING TOKEN keep-whole (Otharri, Suns' Glory — O1). The token disposition
    // "…creature token that's tapped and attacking …" carries an INTERNAL " and " (tapped ∧ attacking)
    // that the split below would sever into "…token that's tapped" + "attacking for each …" — a bare
    // token clause plus an orphan. Anchored to the exact create-token disposition shape (the tokens.js
    // parser arm re-gates it); any variant splits normally, byte-identical. Same non-fail-safe class as
    // the blink guard above: the severed "…token that's tapped" half parses HIGH alone, describing a
    // token that enters tapped but never attacks — a silent drop of the whole combat-cheat.
    if (/creature tokens? that's tapped and attacking\b/i.test(sentence)) {
      clauses.push(sentence);
      continue;
    }
    // ⭐ "INSTANT AND SORCERY" IS A TYPE PAIR, NOT A CONJUNCTION (SHELF-85 K9, 2026-09-04 — Lock and Load "Draw a card,
    // then draw a card for each other instant and sorcery spell you've cast this turn"): the split below would sever the
    // count clause at its internal " and ". Hand the two ", then" halves over whole; each is its own atom.
    const llM = sentence.match(/^(draw a card), then (draw a card for each other instant and sorcery spell you[’']ve cast this turn)\.?$/i);
    if (llM) { clauses.push(llM[1], llM[2]); continue; }
    // PLAY-WHILE-EXILED (K9 — Savvy Trader): the normalize fold above joined the exile and its permission with " and "; keep
    // the joined clause whole so the zones.js arm reads both halves as ONE atom.
    if (/^exile target [a-z' ]*cards? from your graveyard and you may play it for as long as it remains exiled\.?$/i.test(sentence)) { clauses.push(sentence); continue; }
    // Split on a top-level " and " OR a ", then " sequence ("Scry 2, then draw a card" — Preordain;
    // "Draw a card, then discard a card" — loot). The comma is required so an in-effect "then" (a
    // rarity) isn't severed; each split piece is still re-parsed on its own merits, so a mis-split
    // just yields an unmodeled clause → low → Arbiter, never a confident wrong partial.
    for (const c of sentence.split(/\s+\band\b\s+|,\s+then\s+/i)) {
      const t = c.trim();
      if (t) clauses.push(t);
    }
  }
  return clauses;
}
