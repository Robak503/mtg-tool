# ALT-COST casting subsystem — build-ready design (2026-07-02, Clyde)

> **STATUS (2026-07-02): the COVERAGE half shipped a simpler way; the OFFER subsystem below is DEFERRED.**
> All 16 alt-cost cards flipped native via a pure **parser strip** (waves 3a/3b/3c on PR #383) — the alt-cost
> sentence is removed like the flashback/jump-start `CAST_KEYWORD_LINE` strips, the effect body parses, and the
> card is native because its effect is modeled + it's castable at its PRINTED mana cost (the alt-cost is recorded
> as `program.altCost` metadata, forward-compatible). That is COVERAGE. Everything below — the legalChoices
> dual-OFFER, the actionDispatcher alt-PAYMENT, the AI decision — is the PLAY-QUALITY layer (so the AI actually
> pays life/exiles/sacs to cast for the alt cost). It is **ON HOLD** per Colton (AI play-quality slices wait on
> the Omnath pass). When built, it consumes the `program.altCost` metadata the strip already attaches.

> The 13-deck ceiling-breaker: 10 cards blocked SOLELY by a printed alternative casting cost, whose
> base effect ALREADY parses `native-spell` HIGH once the alt-cost sentence (always line 0) is stripped.
> Grounded per-card via live `parseEffectProgram`/`classifyCard` probes. Build behind the flip-diff,
> sub-waved. **No owner sign-off needed before 3a** (descriptor + freeCast-reuse mirror proven precedents).

## The 10 target cards (all base bodies probe `native-spell` HIGH; full-oracle `arbiter-spell` LOW solely from the alt-cost residue)
| Card | Cost | KIND | Condition | base atom |
|---|---|---|---|---|
| Fierce Guardianship | {2}{U} | free | controlCommander | counter |
| Deadly Rollick | {3}{B} | free | controlCommander | exile |
| Flawless Maneuver | {2}{W} | free | controlCommander | grant-keywords-group |
| Submerge | {4}{U} | free | submergeGate (opp Forest + you Island) | tuck |
| Force of Will | {3}{U}{U} | payLifeExilePitch(1,blue) | always | counter |
| Force of Negation | {1}{U}{U} | exileColorCard(blue) | notYourTurn | counter |
| Flare of Denial | {1}{U}{U} | sacrificeCreature(nontoken,blue) | always | counter |
| Flare of Cultivation | {1}{G}{G} | sacrificeCreature(nontoken,green) | always | tutor |
| Snuff Out | {3}{B} | payLife(4) | controlLand(Swamp) | destroy |
| Gush | {4}{U} | returnLandsToHand(2,Island) | always | draw |

Deck occurrences (census): Fierce Guardianship ×5 (Rog/Thras, Kinnan, Yuriko, Cap, Kellan), Force of Will/Negation ×3 (Rog/Thras, Kinnan, Yuriko), Flare of Denial ×2, Deadly Rollick ×2, Gush/Submerge/Snuff Out/Flawless (Yuriko), Flare of Cultivation (Omnath).

## Architecture (mirror the `additionalCosts` slice exactly)
- **parser.js** — new private `extractAltCost(oracle)` → `{altCost, rest}` (next to `extractAdditionalCosts` ~1179-1203). Anchored `^...$` regexes per KIND (normalize `’`→`'` per freeCast.js:99). Only a MODELED kind+condition strips the sentence; else `{altCost:null, rest:oracle}` (CONSERVATIVE → stays LOW). Wire into `parseEffectProgram` (~1343-1352) alongside `extractAdditionalCosts`: strip line-0, parse body, `if (altCost && program) program.altCost = altCost`. X-cost+alt-cost compound (Disrupting Shoal) → leave sentence in → LOW.
- **`SUPPORTED_ALT_COST_KINDS` gate in `programConfidence`** (~1982, mirror the additionalCosts gate): `if (program.altCost && !SUPPORTED_ALT_COST_KINDS.has(program.altCost.kind)) return "low"` + force LOW on an unrecognized condition enum. **This is the CREED brake** — a kind flips HIGH only once its cast-path payment exists. (Probe-proven: attaching an unsupported kind → LOW.)
- **coverage.js** — NO edit needed to credit native; `spellIsNative` already ends at "body program HIGH → true". The parser gate is the whole control.
- **legalChoices.js `castActionsFromZone`** — additive alt-cost dual-offer branch (mirror the additionalCosts dual-offer ~698-746 and emerge fall-through ~944-975; alt-cost is an ALTERNATIVE, so DON'T `continue` — normal hard-cast still falls through). Gate on `altCostConditionHolds(state, playerId, condition, card)` + per-KIND resource enumeration; emit a 2nd cast action carrying the payment fields. Helpers to add: `altCostConditionHolds`, `colorMatches` (near counterSpellTargetFilter ~558).
- **actionDispatcher.js `applyCastSpell`** — free KIND reuses the existing `action.freeCast` skip (~208, keyed purely off the flag, independent of pendingFreeCast; wrapper ~895-918 clears pending only if set → untouched). pitch/sac/return KINDS: enforce payment as a COST after the additionalCosts loop (~270), before the card leaves its zone, with FAIL-FAST throws (DispatcherError) so a mis-offered alt-cast NEVER resolves free. Helpers all exist: moveCardToZone, loseLife, sacrificePermanentForCost.
- **opponentAI.js** — v1 rule: `preferAlt = altKind==="free" || !normalAffordable` (free is strictly ≥ paid; pitch/sac/return only when mana-short, so the AI never needlessly pitches/sacs/bounces). Counters route through pickCounterCast (preserves alt fields); add the mana-short tiebreak.

## CREED gates (two-sites: offer AND payment)
| KIND | condition (offer) | resource (offer) | payment (dispatch) |
|---|---|---|---|
| free (commander) | `controlCommander`: scan battlefield+command for `isCommander` FLAG (NOT type-line — interveningIf.js:95) | none | `action.freeCast` skip |
| free (Submerge) | `submergeGate`: opp battlefield has \bForest\b AND you have \bIsland\b | none | freeCast skip |
| payLife (Snuff Out) | `controlLand(Swamp)` | life ≥ amount | loseLife; ≤0→SBA |
| payLifeExilePitch (FoW) | always | ≥1 hand card of color (excl self) AND life ≥ amount | exile card + loseLife; throw if gone |
| exileColorCard (FoN) | `notYourTurn`: state.activePlayer≠playerId | ≥1 hand card of color (excl self) | exile card; throw if gone |
| sacrificeCreature (Flare) | always | ≥1 bf creature {nontoken,color} not sacrificeDropsTrigger | sacrificePermanentForCost; throw if gone |
| returnLandsToHand (Gush) | always | ≥count bf lands of subtype | moveCardToZone bf→hand ×count; throw if gone |
`altCostConditionHolds` default → `false` (unknown condition never offers free). Combined with the parser condition-guard, an unrecognized condition can neither flip HIGH nor be offered.

## Sub-waves (SUPPORTED_ALT_COST_KINDS grows one wave at a time)
- **3a — free (S, flips 3):** `{"free"}` + conditions controlCommander/always. Fierce Guardianship, Deadly Rollick, Flawless Maneuver. Reuses freeCast skip → ZERO dispatcher payment code. (Submerge rides once submergeGate added.)
- **3b — pitch/exile (M, flips 3):** +payLifeExilePitch/exileColorCard/payLife. Force of Will, Force of Negation, Snuff Out. New: dispatcher exile+payLife, `colorMatches`, notYourTurn/controlLand.
- **3c — sac/return (M, flips 3):** +sacrificeCreature/returnLandsToHand. Flare of Denial, Flare of Cultivation, Gush.
- **3d — payAlt{0}/opponentCastNPlus (L, DEFERRED):** needs a per-opponent per-turn spell-cast tally that likely doesn't exist. None of the 10 need it (Mindbreak Trap base is LOW anyway).

## Test plan
- Parser MUST_STAY_HIGH: base body HIGH + `program.altCost.{kind,condition}` correct, all 10. MUST classify native-spell, all 10.
- **MUST_STAY_LOW canaries (CREED):** **Foil** (base "Counter target spell." is HIGH but alt = compound discard — regexes MUST NOT match → stays arbiter; the FP canary), Disrupting Shoal ({X} pitch → hasXCost guard), Commandeer (plural pitch), Misdirection/Mindbreak Trap/Pact of Negation (base LOW). `SUPPORTED_ALT_COST_KINDS` brake: unsupported kind → LOW.
- legalChoices: FoW with blue card → alt action w/ exilePitchId+payLifeCost, NO blue card → no alt offer; Fierce G. with commander → freeCast action, no commander → no free offer; Flare with token/wrong-color only → no offer; Gush with 1 Island → no offer.
- Runtime (dispatchAction): cast FoW alt → blue card hand→exile, life−1, NO mana tapped, spell on stack; unpaid variant (exilePitchId undefined) → throws ALTCOST_UNPAID. Same shape for free/sac/return.

## Proof battery (per the OVERHAUL-PLAYBOOK proof table — this is a CAST-PATH change)
suite (no MTG_APP_ROOT) + lint · tier flip-diff (GAINED = exactly the wave's cards, LOST=0) · program-fp (the flipped cards) · **trajectory hash RE-ANCHORS** (new legal actions → self-play decisions change; expected, record old→new) · **play-quality probe** for 3b/3c (3a is trivially non-negative: free ≤ paid).

## Flagged (verify at build)
- `colorMatches` fidelity — "blue card" is by color IDENTITY/indicator, not just a {U} pip. Scope precisely in 3b (the balloon risk).
- `opponentCastNPlus` state — not found in the cast path; treated absent → 3d deferred.
- alt-cost-on-permanents (Bringer of the Blue Dawn WUBRG) — OUT of scope; parseEffectProgram returns null for non-instant/sorcery. Clean boundary (all 10 are instants/sorceries).
