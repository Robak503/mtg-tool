# PLAY-API CONTRACT — the engine↔Omnath seams (v1, locked 2026-07-01)

> The written contract for every seam the Omnath brain consumes from the engine. Owned by
> Clyde (engine side); consumed by omnath-tools (pilots, engine.mjs gate, the case store).
> **Change discipline:** breaking any surface below bumps the relevant MAJOR version and is
> posted to `memory/COMMS.md` BEFORE it ships in a release. Additive fields/exports are MINOR
> and safe for consumers to ignore. §5 codifies exactly what bumps what. The engine-side
> tripwire is `app/src/lib/learn/omnathSeam.test.js` — it runs in every full gate, so churn
> that would break Omnath's tools fails Clyde's build first.

---

## 1. The play-API (`app/src/lib/learn/gameApi.js`) — `PLAY_API_VERSION = "1.22.0"`

> **v1.22.0 (additive MINOR, 2026-11-04 — a new decision kind; the copy-targets fix, numbered after pw28's 1.20.0 and pw29's 1.21.0):**
> - **`copy-targets`** (CR 707.10c, 115.7d, 702.40a, 707.10): the person playing a seat keeps a copy's targets or chooses new ones as the
>   copy is put on the stack — every copy whose effect lets its controller choose new targets: each storm copy (its own question, the first
>   put on the stack first — `copyNumber` of `copyCount`), the self-copy ("you may copy this spell and may choose a new target for the copy"
>   — Sevinne's Reclamation, Chain of Vapor), a copy of another spell ("Copy target instant or sorcery spell. You may choose new targets for
>   the copy." — Reverberate, Twincast, Dualcaster Mage, Narset's Reversal …) and a copied ability ("You may choose new targets for the
>   copy." — Strionic Resonator, Illusionist's Bracers, Rings of Brighthearth …); and Deflecting Swat's "choose new targets for target spell
>   or ability" (`retarget: true` — the object is the spell or ability itself, not a copy; `controller` is the Swat's caster).
> - **One target per question** (`slotNumber` of `slotCount`, in the order the targets were chosen). `candidates` are `{ id, keep?,
>   targets: [one target { id, type, name, controller }] }`: the first is `keep: true` — the target as it stands, offered even when no longer
>   legal (CR 707.10c, 115.7d) — when it may still be kept, then every other legal object for that target, enumerated for the copy's
>   controller (Deflecting Swat: the object's controller) with its colours, X and context, an opponent-bound target (Grasp of Fate) among
>   that opponent's objects only. A value is offered only when the later targets can still be completed legally: one instance of "target"
>   never names an object twice (CR 115.3), the number of targets is fixed (CR 601.2c), and a change never makes an unchanged target
>   illegal (CR 115.7d — a pair's two objects, a joint total mana value, a single graveyard, a shared creature type, cards from the chosen
>   player's graveyard), each checked as a target is placed, so the offer is whole on full graveyards. So every legal final set is
>   reachable, the mixed "keep this one, change that one" sets included, and nothing illegal is. (The search has a backstop bound; were it
>   ever reached, the value it could not complete is left out, the log records `copy-targets-search-budget`, and that target is asked,
>   never filled unasked.) The decision names `spellName` (the copied spell or ability), `sourceName` (what made the copy) and `objectKind`
>   (`"spell"` | `"ability"`); `suggestedId` is the house pick's value (the automatic answer). Answer `{ kind, candidateId }` (row in
>   §1.1a). Asked only of a `state.humanSeats` seat and only when there is a real choice: a target with one legal value is filled unasked,
>   a copy with no other legal value anywhere keeps its targets, and one with no legal target at all is removed, as for every seat. While
>   it is asked the object sits on the stack (engine-internal stack-object field `awaitingCopyTargets`); its wards are asked after the last
>   answer — a copy's on every target (it is a new object), Deflecting Swat's object's only on the targets that changed. Asked before the
>   trigger-order and trigger-target questions. While it is asked, the abilities the copying resolution triggered (magecraft, "whenever you
>   copy") wait; with the last answer they go on the stack together with what the new targets triggered, as one batch — APNAP order (CR
>   603.3b, 101.4), and one trigger-order question for the person's own. Every AI seat's copies and Swats take the house pick; a pilot is offered one action per
>   candidate.
> - For every seat (state, not shape): a copy's targets become its targets as it is put on the stack — becomes-the-target triggers
>   (Phantasmal Bear, valiant, the Glasskites) and Kira, Great Glass-Spinner's counter see copies (CR 601.2c), and Deflecting Swat's new
>   targets (CR 115.7d — the ones it did not already have, the person's answer and the house deflection alike); a self-copy carries the
>   copied spell's colours (CR 707.2 — protection from them refuses its target); a copied activated ability (Illusionist's and Battlemage's
>   Bracers) is controlled by the copy trigger's controller, the Equipment's (CR 707.10).
> - `"copy-activated-ability"` and `"copy-ability"` atoms carry `newTargets: true` where the printed text gives the permission; a
>   `"copy-self-spell"` atom may carry `copiedTargets` (Chain of Vapor's copy, for a person) and `copyColors` (Chain of Vapor's copy).
> - Save format **v18** (stamp-only, CONTRACT-MIG — `learnSaveSchema.MIGRATIONS[17]`, after pw28's v16 → v17).

> **v1.21.0 (additive MINOR, 2026-11-04 — new offers and a new alternative-cost value on existing kinds; the play-weighted slice pw29,
> after pw28's 1.20.0):** each rides a kind a driver already handles (§5: "new additive fields on decisions/actions/answers/state").
> - `"activate-ability"` for a seat a person plays (`state.humanSeats`): a counted sacrifice ("Sacrifice two other creatures", "Sacrifice
>   N <subtype>s" — CR 602.2b, 601.2h) is offered once per set of permanents that pay differently (`sacCountIds`): two permanents are one
>   offer only when nothing tells them apart (`legalChoices.interchangeablePayerKey`, the counted tap's — a blocker, a copy, a pumped or
>   exerted creature, a chosen type, a per-turn ledger key keep each its own). Each such offer carries `sacCountNames` (each payer's
>   printed name plus what tells it apart — `payerLabels`: "Zombie (blocking Hill Giant)", "Treasure (tapped)") and its `abilityText` names
>   them. Bounded like the counted discard: the first 64 sets, then one covering set per payer in none; beside a list of targets the rows ×
>   sets product while it stays within 64. Every other seat is offered the one least-valuable set, as before (no `sacCountNames`).
> - `"cast-spell"`: the alternative cost `altCost.kind: "payManaTapCreatures"` with `tapCreatureIds` / `tapCreatureNames` (Sephara, Sky's
>   Blade — "pay {W} and tap four untapped creatures you control with flying"). The cast's `cost` is the alternative cost's own pips after
>   the cost increases (CR 118.9d); `altName` names the creatures tapped (`payerLabels`), the pips named by the cost. It is offered from the
>   hand and — this kind only — from the command zone (`fromZone: "command"`, the commander tax in the cost, CR 903.8). A person's seat sees
>   one variant per set of creatures that pay differently (the same key).
> - No kind, decision or answer shape changed. The save format is unchanged (**v17**; no new persisted state).

> **v1.20.0 (additive MINOR, 2026-11-03 — new fields on existing kinds; the play-weighted slice pw28, after pw27's
> 1.19.0):** each rides a kind a driver already handles (§5: "new additive fields on decisions/actions/answers/state").
> - `"soft-counter"` may carry `counterer` — the player whose spell or ability counters the object if it isn't paid for (the soft counter's
>   controller; a ward's or Diffusion Sliver's controller), so "Whenever a spell or ability you control counters a spell" (Baral, Chief of
>   Compliance; Lullmage Mentor) hears the counter. The answer is the same.
> - `"activate-ability"` with a counted tap cost ("Tap seven untapped Merfolk you control" — Lullmage Mentor; Kirol, Clock of Omens,
>   Cryptbreaker, Lathril) is offered to a person's seat once per distinct set of permanents that can pay it (CR 601.2h — each action's
>   `tapCountIds`, named in `tapCountNames` — each payer's printed name plus what tells it apart, "Merfolk (blocking Hill Giant)"); two
>   permanents are one offer only when nothing tells them apart (`legalChoices.interchangeablePayerKey`); every other seat's one action is
>   unchanged.
> - state: `pendingCounteredSpells` (the spells a counter removed since the last flush, each with its `counterer`), `pendingLibraryExiles` (the
>   cards put into exile from a library since the last flush, with their owner and an optional `batch` — Laelia, the Blade Reforged) and a
>   stack object's `wardOwed.counterer`.
> - An `endOfCombatEffects` entry carries `controller` and `sourceId`; the entries go on the stack as delayed triggered abilities as the end
>   of combat step begins (CR 511.2 — a decayed or basilisk creature is still on the battlefield when the active player gets priority after
>   combat damage). A stack object of the existing triggered-ability kind; nothing new for a driver to answer.
> - Save format **v17** (stamp-only, CONTRACT-MIG — `learnSaveSchema.MIGRATIONS[16]`; a v16 entry without a `controller` takes its
>   permanent's controller as it drains).

> **v1.19.0 (additive MINOR, 2026-11-03 — new fields on existing kinds; the play-weighted slice pw27, after pw26's 1.18.0):** each rides a
> kind a driver already handles (§5: "new additive fields on decisions/actions/answers/state").
> - `"activate-ability"` with an {X} cost may be offered at `xValue: 0` — only for an effect that reads X = 0 as a value of its own (Steel
>   Hellkite: "Destroy each nonland permanent with mana value X …" — X = 0 destroys the mana-value-0 permanents, its ruling); every other
>   {X} activation is still offered from X = 1.
> - `"tutor-search"` may carry `searchTopIds` (Aven Mindcensor — the top four cards of the library as the search began, the same four
>   for every pick, CR 614.1a); its `candidates` are already limited to them.
> - state: `combatDamageToPlayersThisTurn` `{ turn, bySource }` (Steel Hellkite) and `departedLifeLostThisTurn` (Neheb, the Eternal).
> - Save format **v16** (stamp-only, CONTRACT-MIG — `learnSaveSchema.MIGRATIONS[15]`).

> **v1.18.0 (additive MINOR, 2026-11-03 — new fields on existing kinds; the play-weighted slice pw26, after pw25's 1.17.0):** each rides a kind a driver already handles (§5: "new additive fields on
> decisions/actions/answers/state").
> - `"protection-color"` may carry `grantText` — the colour of a grant that is not protection (Skrelv, Defector Mite: "gains toxic 1 and
>   hexproof from the color you choose until end of turn, and can't be blocked by creatures of that color this turn"); its `candidates`
>   are the five colours and their `threats` only what targets the creature (CR 702.11d). The answer is the same `{ kind, color }`.
> - `"discard"` may carry `conniveN` (Spymaster's Vault — the nonland cards a connive N has discarded so far, CR 701.50e).
> - A recorded target may carry `slotPlayer` (Grasp of Fate — the opponent whose "target" it fills, CR 601.2c). For a triggered ability
>   whose only targets are one per opponent (Grasp of Fate, Bronzebeak Foragers, Celebrate the Mountain-king), `"trigger-target"` is raised
>   once per opponent with a real choice, in turn order — each time that player's legal targets and "No target" — answered as before; the
>   waiting stack object carries `awaitingTargets.perOpponent` `{ slots, at, chosen }` between the answers.
> - state: a layer-6 addKeyword `"toxic"` with `toxicAmount`, a `cantBeBlockedByColor` effect with `color` (Skrelv); an ability-source
>   record's `attachedTo` (Tarrian's Soulcleaver, Ghost Lantern — CR 608.2h).
> - Save format **v15** (stamp-only, CONTRACT-MIG — `learnSaveSchema.MIGRATIONS[14]`).

> **v1.17.0 (additive MINOR, 2026-11-03 — a new field on two existing action kinds; the play-weighted slice pw25, after pw24's
> 1.16.0):** `"cast-spell"` and `"play-land"`: `muldrothaSlot: { sourceId, type }` — Muldrotha, the Gravetide's permission from the
> graveyard for one permanent type (`"Artifact"`, `"Battle"`, `"Creature"`, `"Enchantment"`, `"Planeswalker"`, `"Land"`); a card of several
> types is offered once per open type, and the offer taken spends that type — those offers differ only in that field, so a driver that
> picks among them without reading it still picks which permission it spends. `"activate-ability"` for a seat a person plays
> (`state.humanSeats`): a counted discard or counted exile from the graveyard is offered once per choice of cards (CR 602.2b, 601.2h;
> bounded — the first 64 sets, then one per card in none; beside a list of targets, the full sets × targets product only while it stays
> within 64, past that every set beside the first target that pays and every other target beside its least valuable set, per X), naming
> them (`discardIds`; `exileGyIds` with `exileGyNames`); two graveyard cards of one name that another lane tells apart (a flashback
> granted this turn, milled or put there from the battlefield this turn) are two choices; every other seat keeps the one least-valuable
> set. No kind, decision or answer shape changed.

> **v1.16.0 (additive MINOR, 2026-11-03 — new fields on existing kinds; the play-weighted slice pw24):** each rides a kind a driver
> already handles (§5: "new additive fields on decisions/actions/answers/state").
> - `"declare-attacker"`: `exert: true` — exert it as it attacks (Combat Celebrant and the exert template, CR 701.43d), offered beside
>   the same attack without it, only for a creature whose linked "When you do" ability the engine plays; one dispatched for a creature that
>   can't be exerted is a `"dispatch-error"` with code `EXERT_ILLEGAL`. The exerted attack is a distinct action of the same kind,
>   permanent and defender, so a driver choosing among the offered actions without reading `exert` may choose it (as with pw22's extra
>   Vesuva `play-land` actions).
> - The `"discard"` decision may carry `perDiscardDraw` (Syphon Mind); a `"tutor-search"` decision may carry `pickFilters` (Krosan Verge —
>   the next pick is raised whether or not this one found a card) and `entrySourceId` (Kodama of the East Tree).
> - state: a permanent's `exertedTurn`, `enteredViaAbilityOf`, `becameAura`; an attacker entry's `exerted`; a delayed-trigger record's
>   `watchCombatDamage`; a removeKeyword's `cantHave` and a targetShield's `hexproof`.
> - A value, not a field: a modal DFC's land face — a permanent's `card`, and the `faceCard` a `"play-land"` action carries — now has
>   that face's own mana value, 0 (CR 712.8f, 202.3a), where it had the combined card's (its front face's). On the 80-game bench this
>   recorded value is the only difference in 29 games; every played action is the same.

> **v1.15.0 (additive MINOR, 2026-11-03 — new state fields and a decision for another seat; the play-weighted slice pw23, after
> pw21's 1.13.0 and pw22's 1.14.0):** each rides a kind a driver already handles (§5: "new additive fields on
> decisions/actions/answers/state").
> - state: a player's `castNamesThisGame` (Approach of the Second Sun's tally of its name's casts); a permanent's `vow` counter with
>   `vowAgainst` (Promise of Loyalty — its `"declare-attacker"` offers leave out the promised player and their planeswalkers; one
>   dispatched anyway is a `"dispatch-error"` with code `ATTACK_VOW`); `state.vowPoolsThisWay` while Promise's sacrifice choices pend.
> - `"optional-sac-payment"` may be raised for a seat that isn't the spell's controller (Chain of Vapor — the bounced permanent's
>   controller, its lands as `candidates`); `"sacrifice-choice"` on the N-count chain may ask one seat several times running (Promise).
> - No kind, decision or answer shape changed.

> **v1.14.0 (additive MINOR, 2026-11-03 — new fields on an existing action kind; the play-weighted slice pw22):** `"play-land"`: `copyOfPermanentId` and `copyOfName` — Vesuva's
> land drop entering tapped as a copy of that land (one action per land it may copy; the plain play carries neither). An
> `"optional-effect"` decision may name `effectOp: "myriad"` (the myriad trigger's yes/no), and a `"tutor-search"` decision may be a
> seat's own search inside another player's ability (Field of Ruin's each-player search). No kind, decision or answer shape changed.

> **v1.13.0 (additive MINOR, 2026-11-02 — the play-weighted slice pw21):**
> - The impulse-dig decision carries `chosenTo` and `thenExilePlay` on the wire: Expressive Iteration asks twice — a hand pick
>   (`thenExilePlay: true`), then an exile pick among the rest (`chosenTo: "impulseExile"` — exiled, playable this turn; the last card goes
>   to the bottom). Answers unchanged (a card id).
> - The milled-pick decision gains `toZone: "battlefieldYours"` (Breach the Multiverse — one creature or planeswalker card per graveyard,
>   every pick entering together under the chooser's control after the last); a pilot's label reads "Put <card> onto the battlefield under
>   your control". Answers unchanged (a card id).
> - A cast from your own exile may carry `freeCast: true` (Urza, Lord High Artificer; Mind's Desire), offered at a paid cast's timing.

> **v1.12.0 (additive MINOR, 2026-11-02 — new fields on existing action kinds; the play-weighted slice pw20):** each rides a kind a
> driver already handles, so a driver that ignores them plays exactly as before (§3: "Additive fields on actions are MINOR"; §5).
> - `"cast-spell"`: `retraceCast: { discardId }` and `retraceName` — a nonland permanent card cast from the graveyard with retrace
>   (Six), the named land card discarded as the additional cost; `resolutionCast: true` — Conduit of Worlds' paid cast of the
>   graveyard card as its ability resolves, offered at the free-cast window.
> - `"tap-for-mana"`: `manualOnly: true` — an explicit-only mana ability, never part of an automatic payment (Lion's Eye Diamond,
>   Arena of Glory's exert line); `discardsHand: true` — its cost discards the hand; `exertHaste: true` with `bundle: "exert"` — the
>   exert line, its mana tagged with the haste rider.
> - `"free-cast-decline"`: `paid: true` — the window offers a paid cast (Conduit of Worlds), so the decline reads "Don't cast it".
> - No kind, decision or answer shape changed. (`escapeCast`, 2026-10, rode the same rule without a bump; this one follows the letter.)

> **v1.11.0 (MINOR, 2026-11-01 — every throw in the driver is the same crash; a CLASSIFICATION change for two decisions):**
> - v1.9.0's two engine faults — a step that throws (`guard` `"engine-error"`) and a seat with no legal action whose pass throws
>   (`"no-legal-action"`) — were an `"engine-stuck"` with no stack: a crash folded into a stall. They are now the `"dispatch-error"`
>   v1.10.0 gives every other throw: `error: { name, message, code, stack }`, turn, phase, step, ticks, maxTurnTicks, the same
>   `guard` and the same `reason`. A consumer that counted them as engine-stuck counts them as dispatch-error now (the self-play
>   record too, with `error` / `errorStack`); `guard.type` tells them apart. `endEngineStoppedGame` ends them as before, with the same
>   words. The remaining `"engine-stuck"` decisions are the stalls (turn stall, runaway, safety cap) and the pending-choice failsafe.
> - A throw v1.10.0's outer guard catches carries `guard.at: "loop"` (additive); the Academy's line for it says the engine hit an
>   error, not that moving to the next step failed.
> - Narrowed (v1.10.0 read wider than it was): under `MTG_AUDIT=1` the OUTER guard rethrows; the loop's own catches convert in every
>   mode — the step's, the no-legal-action pass's, and an auto-decided dispatch's (an `AUDIT_VIOLATION` inside an AI's dispatch is
>   that catch's dispatch-error, not a red test); `applyAction` answers a refused dispatch with the state unchanged.

> **v1.10.0 (additive MINOR, 2026-11-01 — the driver never throws on an engine bug, and never hides one):**
> - A throw anywhere inside the driver's loop — the legal-actions call, a pending-choice settler, the SBA pass, which until now
>   threw out of `nextDecision` / `act` — is a `"dispatch-error"` decision carrying the error itself: `{ kind: "dispatch-error",
>   reason, code, error: { name, message, code, stack }, turn, phase, step, ticks, maxTurnTicks, guard: { type: "engine-error",
>   message } }`, on the session as that tick began (still `"active"`). A crash stays a crash: the self-play record is
>   `result: "dispatch-error"` with `error`, `errorCode`, `errorStack` and the turn it happened on (it used to escape to the
>   runner, which recorded turn 1). `endEngineStoppedGame` ends it (`"engine-stopped"`), so an Academy game is never left to
>   re-throw on every resume. A dispatch-error with no `guard` (a refused answer, an auto-decided dispatch that throws) is
>   unchanged. Under the test-time auditor (`MTG_AUDIT=1`, every vitest run) nothing is converted — the throw escapes, as before.
> - Unchanged, stated because the engine underneath changed: `legalActions` / `isLegalAction`, a pilot's `legalActions` (§1.3)
>   and the Academy's options list EVERY legal play — a cast per alternative-cost payment (Force of Will's pitch card, Flare of
>   Denial's creature …), in the order they always came — and a trajectory row's `legal.n`, `legal.kinds`, `rank` and `forced`
>   count and rank among them; a logged or dispatched action is the cast as paid. Inside the engine,
>   `legalChoices.legalActionsForPlayer` now lists such a cast once per target with its payments on `altCostChoices`
>   (`costChoices.js` — the AI ranks the short list; a late self-play game had offered 4,827,648 Force of Will casts); a direct
>   caller of that internal list expands it with `costChoices.expandAllCostChoices`.

> **v1.9.0 (additive MINOR, 2026-10-22 — the engine faults' stop):**
> - The driver's two engine-fault exits name themselves in `guard` like the three guards: a step that throws —
>   `{ type: "engine-error", message }` — and a seat holding priority with no legal action whose fallback pass (or
>   decline) throws — `{ type: "no-legal-action", seat, message }`; `message` is the error's. The `reason` text
>   (the error's message / "no legal action and no pass available") and the `"active"` session are unchanged, so
>   `nextDecision` / `act` answer as before plus the field, and the self-play result stays `"engine-stuck"`. Each
>   error is now logged with its stack (`console.error`; the second used to be dropped). The pending-choice failsafe's
>   engine-stuck is the only one left with no `guard` (it clears the choice, so the game can go on). MINOR: an
>   additive field on an existing decision (§5); a consumer that read "has `guard`" as "one of the three guards" now
>   also sees these two — switch on `guard.type`.
> - `learnSession.abandon` also ends a session still at its opening-hand mulligans (status `"mulligan"`, the Academy's
>   human London mulligan); it was a no-op there. The status it sets and the fields it adds are unchanged.

> **v1.8.0 (additive MINOR, 2026-10-22 — the guards' stop):**
> - An `"engine-stuck"` decision raised by one of the driver's three guards names it in `guard`:
>   `{ type: "turn-stall", turn, count, limit }` (the per-turn tick budget — `count` / `limit` are the empty-stack
>   ticks against the budget, or the raw ticks against its ten-budget ceiling), `{ type: "runaway", zone, count, limit,
>   seat? }` (`zone` `"stack"` | `"battlefield"`, `seat` for a battlefield) or `{ type: "safety-cap", limit }`. The
>   `reason` text is unchanged and the session is still `"active"` — `nextDecision` / `act` answer exactly as before,
>   and the self-play result stays `"engine-stuck"`. An engine-stuck from anything else (the pending-choice failsafe,
>   a step that throws, no legal action) has no `guard`.
> - `nextDecision` / `act` thread the optional driver option `safetyCap` (default 50,000, `SAFETY_CAP_TICKS` — the
>   shipped cap), injectable for tests like `turnTickBudget` and `runawayLimits`.
> - `session.status` gains `"engine-stopped"` (§1.1c), set only by `learnSession.endEngineStoppedGame` — the Academy's
>   HTTP routes end a guard-stopped game with it. Like `"abandoned"`, the driver never sets it, so no `createGame` /
>   `nextDecision` / `act` caller sees it unless it hands such a session back in (then: `{ kind: "game-over", reason:
>   "engine-stopped" }`). Hence MINOR, not the §5 MAJOR for a changed status vocabulary: nothing a driver could
>   observe before is renamed, removed or re-meant.

> **v1.7.0 (additive MINOR, 2026-10-20 — a new decision kind):**
> - **`protection-color`** (CR 608.2d, 702.16): the person playing a seat announces the colour of a "protection from the color
>   of your choice" grant as it resolves (Mother of Runes, Giver of Runes, Benevolent Bodyguard, Gods Willing, Shelter …),
>   knowing what is on the stack. Asked only of a seat in `state.humanSeats`; every AI seat takes the automatic pick (the colour
>   of the opponents' spells and abilities on the stack that target or damage the protected permanent, else the board read) —
>   which changes AI play where such a threat is on the stack. Answer `{ kind, color }` (row in §1.1a); a pilot is offered one
>   action per colour.

> **v1.6.0 (additive MINOR, 2026-10-20 — a new decision kind):**
> - **`trigger-order`** (CR 603.3b, 405.3): the person playing a seat chooses the order in which two or more of
>   their own simultaneous triggered abilities go on the stack. Asked only of a seat in `state.humanSeats`, and not
>   when the abilities are all identical copies (the same ability of the same source for the same trigger event —
>   Panharmonicon's extra instance); every AI seat keeps the order its abilities triggered in, byte-identical. It is
>   asked before the batch's `trigger-target` questions, which then follow in the order chosen (each ability's targets
>   are chosen as it is put on the stack, CR 603.3d). While it is asked, the abilities sit on the stack in their APNAP
>   place, in the order they triggered (engine-internal stack-object field `awaitingOrder`; the board snapshot never
>   shows it). Answer `{ kind, resolveOrder }` (row in §1.1a); a pilot is offered one order per ability resolving
>   first, the rest as they stand.

> **v1.5.0 (additive MINOR, 2026-10-20 — the ward costs):**
> - **`soft-counter`** decisions carry `objectKind` (`"spell"` | `"ability"` — what is threatened) and, for a ward with
>   alternatives, `optionsAffordable` (one boolean per `cost.options`). New `cost` kinds: `all` (`parts` — every one is paid:
>   "Ward—{2}, Pay 2 life", or two ward permanents targeted at once), `any` (`options` — one is paid: "Ward—Discard a card or
>   pay {2}"), `discard-random` (`count`), `unpayable` (`text` — a ward cost the engine can't take, a sacrifice or poison
>   counters: paying is impossible, so the spell or ability is countered, as declining does). The answer grew the optional
>   `option` — the index in `cost.options` of the alternative paid; absent, the house pick (an affordable alternative that
>   discards nothing first). A driver that ignores the new fields answers exactly as before. The question is also asked for a
>   loyalty ability and for a spell whose target is changed onto a ward permanent.

> **v1.4.0 (additive MINOR, 2026-10-18 — a new decision kind):**
> - **`trigger-target`** (CR 603.3d, 601.2c; CR 603.3c for a mode): the person playing a seat chooses the
>   targets — or the mode — of their own triggered ability as it goes on the stack. Asked only of a seat in
>   `state.humanSeats` and only when there is a real choice (two or more legal choices, or a modal "choose up
>   to one"); a single legal choice is taken unasked and every AI seat keeps the automatic chooser,
>   byte-identical. While it is asked, the ability sits on the stack in its APNAP place with no target yet
>   (engine-internal stack-object field `awaitingTargets`; the board snapshot never shows it). Answer
>   `{ kind, candidateId }` (row in §1.1a); a pilot is offered one action per choice.

> **v1.3.0 (additive MINOR, 2026-10-16 — a new decision kind):**
> - **`aura-entry-host`** (CR 303.4f): the person playing a seat picks what their Aura enchants as
>   it enters the battlefield without being cast (a blink's return, a reanimation, a put from library
>   or hand). Asked only of a seat in `state.humanSeats` — `createLearnSession` stamps `["user"]` below
>   Expert, so an Expert or self-play driver never meets it and every AI seat keeps the house pick,
>   byte-identical. A driver that does meet it answers `{ kind, hostId }` (row in §1.1a); a pilot is
>   offered one action per legal host. A table with a person at it also carries the additive state
>   field `state.humanSeats` (save schema v6 backfills it on a pre-v6 save from the session's difficulty).

> **v1.2.x doc wave (2026-07-03 — lane E, PS-1/PS-5/PS-6/PS-7):** no runtime change. The doc
> now enumerates the REAL 20-kind decision vocabulary (§1.1a — the old "13" was doc drift),
> documents `metadata.suggestion`, the answering-seat derivation, and the `session.status`
> vocabulary (§1.1b/§1.1c), adds `lookupCard`/`lookupRulingsForCard` to the §2 table, and
> writes the §5 versioning discipline.

> **v1.2.0 (additive MINOR, 2026-07-03 — SD-5/PS-4, the session-layer policy A/B seam):**
> - `createGame` gained the optional **`policy`** option — the opponentAI A/B knob
>   (`null | "v1" | { land|block|attack|xSizing|counter: "v1" }`; see
>   `opponentAI.normalizePolicy`). It rides `session.playOpts.policy`, is merged into every
>   `nextDecision`/`act` advance (explicit per-call `opts.policy` wins, mirroring `decide`),
>   and reaches `pickAction`/`pickAttackPlan`/`pickBlockPlan` on every AI-auto-picked
>   decision — so pilots can drive old-vs-new policy probes through THIS seam
>   (`lab.mjs cmdVsDefault`-style old-policy baselines are now session-drivable).
>   `runSelfPlayGame`/`runSelfPlayBatch` grew the same `policy` passthrough. Single knob,
>   whole game — per-seat policy is out of v1.x scope (a v1.2+ additive if pods need mixing).
>   GUARD (THE CREED): policy only ever RE-RANKS actions already offered by legalChoices —
>   it never gates legality. Default `null` ⇒ byte-identical play (trajectory-hash-stable).

> **v1.1.0 (additive MINOR, 2026-07-03 — the instrumentation-threading wave):**
> - `act(session, decision, answer, opts = {})` grew an optional trailing `opts` bag — the
>   same `{ decide, pilot, recordDecision, timePressure, onTurnStart }` seam `nextDecision`
>   takes. It is threaded through every settler's internal re-advance, so a caller-driven
>   drive loop stays instrumented PAST the first `act()` (previously: engine-auto segments
>   initiated by `act()` ran default policy, unrecorded, clockless). Omitted ⇒ byte-identical
>   to v1.0.0.
> - `createGame` now HONORS the `pilots:` option documented below (previously it was silently
>   dropped — only `runSelfPlayBatch` honored it). Pilots are compiled into a per-seat router
>   stored as `session.playOpts.decide`, merged into every `nextDecision`/`act` advance;
>   **explicit per-call `opts.decide` wins** (nextDecision-opts drivers are unaffected). A
>   `decideMulligan` on any seat auto-builds the mulligan config unless the caller passed
>   `mulligan` themselves. **Malformed `pilots` THROW** (never silently default-AI). A pilots
>   session holds live closures → it is driver-memory-only (rejected by `isSerializable`).
> - Instrumented advances (timePressure and/or onTurnStart active) stamp `state.observedTurn`
>   (additive state field; save-schema v5, stamp-only migration) so a re-entrant advance never
>   re-fires the turn-boundary clock/observer within the same turn. Uninstrumented advances
>   write no such field.

### 1.1 The session layer (v1 — drives a COMPLETE game, pendings included)

```js
import { createGame, nextDecision, act, gameStatus, PLAY_API_VERSION }
  from "<app>/src/lib/learn/gameApi.js";

let { session, decision } = nextDecision(createGame({
  userDeck, opponentDeck /* 1v1 */ , // or opponentDecks: [d1,d2,d3] + mode:"commander"
  mode: "standard" | "commander",
  difficulty: "beginner" | "intermediate" | "expert",
  userCommanders, opponentCommanders,        // commander mode
  pilots: { [seat]: { decide, decideMulligan?, playbook?, temperament? } }, // the locked decide contract
  policy: null | "v1" | { /* per-subsystem */ },  // v1.2.0 — the opponentAI old-vs-new A/B seam
}));
while (decision.kind !== "game-over") {
  const answer = myPilot(decision);          // ∈ decision.options (ask) / per-kind shape (§1.1a)
  ({ session, decision } = act(session, decision, answer));
}
const verdict = gameStatus(session.state);   // { over, result, winnerSeat, reason }
```

- `nextDecision(session, opts)` — advances through SBAs, eliminations, AI seats, trigger
  flushes, and pending-settlement to the next decision (or game over). `opts` passes through
  to the driver: `{ decide, pilot, recordDecision, timePressure }` — the self-play
  instrumentation seam.
- `act(session, decision, answer, opts?)` routes by `decision.kind` and ALWAYS returns
  `{ session, decision }`. `opts` (v1.1.0) is the same instrumentation bag `nextDecision`
  takes, threaded through the settlers' internal re-advances; omit it for the v1.0.0
  behavior:

| decision.kind | answer | routing |
|---|---|---|
| `"ask"` | one of `decision.options` | validated priority dispatch — an out-of-set answer returns `dispatch-error` (`INVALID_CHOICE`) + an **unchanged session**, never a fabricated move |
| one of `PENDING_CHOICE_KINDS` (20 in v1.2 — enumerated in §1.1a) | per-kind shape; echo `answer.kind` (the wire validates it) | the kind-echo-validated settler |
| `"unresolved"` | ignored | Arbiter-ruling acknowledgement (v1 does NOT auto-settle arbiter content — the ruling is the caller's to apply) |
| `"game-over"` / `"dispatch-error"` / `"engine-stuck"` | — | returned unchanged (terminal / honest error) |
| anything else | — | `dispatch-error` `UNKNOWN_DECISION_KIND` (the contract failsafe) |

**The runtime-read rule.** The canonical kind list is the RUNTIME export
`PENDING_CHOICE_KINDS` from `app/src/lib/learn/pendingChoice.js` — consumers read it at
runtime (lab.mjs does) and treat the §1.1a table as informative documentation. A kind present
at runtime but missing from this doc is a doc bug, not a contract break; an unknown kind AT
runtime is handled by the §3 stop-and-report rule. (History: this doc said "13" until
2026-07-03 while the runtime exported 20 — the runtime was always the contract.)

### 1.1a Pending-answer shapes (one row per `PENDING_CHOICE_KINDS` entry)

General rules, all kinds:

- Every pending-kind decision is the live `state.pendingChoice` spread onto `{ kind }` — so
  `controller` (the ANSWERING seat), `candidates`, `sourceName`, and the kind's own fields
  listed below ride on the decision object itself.
- **Kind echo:** stamp `answer.kind` with the decision's kind. A mismatched echo (a stale
  double-submit racing a settled choice) is DROPPED — the session re-derives and returns the
  live decision, never misreads the payload (WI-5). A kind-LESS payload is legacy-accepted
  in v1.x (see §5 MAJOR list).
- **Illegal picks never fabricate:** an out-of-candidates id, an illegal decline, or an
  under-assigned division re-surfaces the SAME decision (or re-derives) — the engine never
  guesses an answer. Settler-level failures surface as `dispatch-error`, session unchanged.
- Yes/no settlers also accept a bare boolean `true` on the wire (legacy), but the canonical,
  kind-echoed object form below is what drivers must send.

| kind | answer shape (echo `kind`) | notes (chooser · decline · validation) |
|---|---|---|
| `tutor-search` | `{ kind, cardId }` | `cardId` ∈ `candidates[].id`; `null` = decline / fail to find — legal iff `mayFailToFind !== false` (CR 701.23b; a mandatory quantity-only search rejects null per CR 701.23d and re-surfaces). Multi-fetch tutors (`remaining > 1`) re-surface once per fetch; `destination`/`entersTapped` describe the CURRENT fetch. |
| `clone-search` | `{ kind, permId }` | `permId` ∈ `candidates[].id`; `null` declines a "you may" copy (enters as itself). A MANDATORY clone (`optional: false`, CR 707.9) rejects null and re-surfaces. |
| `scry-surveil` | `{ kind, keep: [cardId, …] }` | ordered ids to KEEP on top (subset of `cards`); the rest bottom (`mode:"scry"`) / graveyard (`mode:"surveil"`). A `reorder:true` pending (Ponder) keeps EVERYTHING on top in the submitted order. Unknown/duplicate ids are dropped defensively. |
| `optional-effect` | `{ kind, take: boolean }` | "you may &lt;effect&gt;" yes/no; the paused atom runs on `take:true`. |
| `commander-return` | `{ kind, return: boolean }` | CR 903.9a — return the commander to the command zone, or leave it in `zone`. |
| `hand-discard` | `{ kind, cardId }` | the CASTER picks from the victim's revealed, filtered hand (`victim` on the decision); no decline — null/illegal re-surfaces. |
| `impulse-dig` | `{ kind, cardId }` | keep one looked-at card to HAND; the rest go to `restTo`; no decline. |
| `look-top-take` | `{ kind, cardId }` | BLITZ LK-2 top-card take-or-leave-on-top (Dryad Greenseeker / Herald's Horn, Domri +1): `cardId` = the single matched top card (`candidates[0]`) → TAKE to HAND; `null` = LEAVE it on top (a legal, non-dominated decline — no disposal). Only ever raised when the top card matched the quality (a non-match resolves inline, unrevealed). AI policy: always take. |
| `dig-land-to-battlefield` | `{ kind, cardId }` | which offered LAND enters the battlefield (ETB fires; rest bottoms random); no decline. |
| `sacrifice-choice` | `{ kind, cardId }` | `cardId` = the chosen creature's PERMANENT id (edicts — the SACRIFICER chooses, CR 701.16); chains via `queue`; no decline. |
| `discard` | `{ kind, cardId }` | the DISCARDER picks from their own hand (CR 701.8); chains via `remaining` + `queue`; no decline. |
| `divide-damage` | `{ kind, distribution: [{ id, type: "creature"\|"player", amount }] }` | FULL assignment required (CR 601.2d): when candidates exist and the capped sum < `amount`, the same decision re-surfaces (WI-5 guard). |
| `distribute-counters` | `{ kind, distribution: [{ id, amount }] }` | same full-assignment guard; applied via the add-counter atom so counter doublers compose (CR 616). |
| `soft-counter` | `{ kind, pay: boolean, option?: number }` | the threatened spell's or ability's controller pays `amount` / structured `cost` to save it — a soft counterspell, or a ward on a spell, an activated ability, a loyalty ability (since 2026-10-20), a triggered ability (since 2026-10-18), a channel-style hand ability or a graveyard exile-cost ability (since 2026-10-21) or a spell or ability whose target was changed or chosen again onto a ward permanent (CR 702.21a; `spellName` names the ability's source; `objectKind` says spell or ability); every ward the targets carry, and every Diffusion Sliver trigger (since 2026-10-21; `sourceName` names them all), is one cost (`all` / `any` — v1.5.0); `option` picks an `any` cost's alternative; decline / unaffordable / `unpayable` ⇒ countered. Decision carries `affordable` (and `optionsAffordable` for `any`). After a ward is settled the active player receives priority, as after any resolution (CR 117.3b — since 2026-10-21; 2026-10-20 → 10-21 it went back to the player who held it when the ward was raised). No shape change. |
| `optional-mana-payment` | `{ kind, pay: boolean }` | CR 603.7c "you may pay {cost}. If you do, …"; pay runs `effectAtoms`. Decision carries `affordable`. |
| `optional-sac-payment` | `{ kind, sac: boolean }` | sacrifice a `subtype` permanent to run the payoff; `available:false` ⇒ only decline has effect. |
| `optional-draw-discard` | `{ kind, draw: boolean }` | loot yes/no; yes chains into a `discard` which-card pick. |
| `optional-discard-payment` | `{ kind, discard: boolean }` | discard-as-cost; yes chains the which-card pick, then the payoff (`available` on the decision). |
| `sac-unless-pay` | `{ kind, pay: boolean }` | pay `cost` keeps the permanent (`sourceId`); decline / unaffordable sacrifices it. |
| `taxed-payment` | `{ kind, pay: boolean }` | the answering seat is the PAYER (`controller === payer`, Rhystic-style); decline / can't-pay gives `beneficiary` the `declinePayoff` (`"draw"` \| `"treasure"`). |
| `edict-mode` | `{ kind, mode: "life"\|"sacrifice"\|"discard", permId?, cardId? }` | `mode` must be ∈ the decision's `modes` (anything else coerces to `"life"`); `permId` picks from the `sac` pool, `cardId` from the `disc` pool; chains via `queue`. |
| `trigger-order` | `{ kind, resolveOrder: string[] }` | v1.6.0, CR 603.3b / 405.3 — the controller of two or more simultaneous triggered abilities chooses the order they go on the stack; `resolveOrder` is every `candidates[].id` exactly once, the one that resolves FIRST first (it is put on the stack last). `candidates` (`{ id, sourceName, abilityText, targets: [{ id, type, name, controller }], targetsNext? }`) list the abilities as they stand, the topmost first — so answering them in the order given keeps the order they triggered in; `id` is the ability's stack id, `targetsNext` marks one whose targets are asked after the order. The abilities are permuted among their own stack positions, so other players' abilities keep their APNAP places. Anything else — not a list, an id missing, twice or not of the batch — decides nothing (the question is asked again). Asked only of a `state.humanSeats` seat, and not when every ability is an identical copy of the same ability from the same source for the same event. |
| `protection-color` | `{ kind, color }` | v1.7.0, CR 608.2d / 702.16 — the controller of a "protection from the color of your choice" grant announces the colour as it resolves; `color` ∈ `candidates[].id` — a WUBRG letter, or `"C"` (colorless) where the grant offers it (Giver of Runes). `candidates` are `{ id, name, threats?, suggested? }`: `threats` the names of the opponents' spells and abilities of that colour on the stack that target or damage the protected permanent (only where protection from that colour stops it in this engine — never a colourless one, nor an ability whose source has left unless all it does is deal damage), `suggested` (`"threat"` | `"board"`) the automatic chooser's pick; `cardName` the protected permanent, `sourceName` the card granting it. No decline; a colour not on offer decides nothing (the question is asked again). Asked only of a `state.humanSeats` seat. |
| `trigger-target` | `{ kind, candidateId }` | v1.4.0, CR 603.3d / 601.2c / 603.3c — the controller of a triggered ability chooses its targets (or mode) as it goes on the stack; `candidateId` ∈ `candidates[].id` (`{ id, label?, targets: [{ id, type, name, controller }] }` — `label` is a mode's text; an empty `targets` is the "up to" decline), or `"none"` when `allowNone` (a modal "choose up to one" — the ability is removed, CR 603.3c). `abilityText` is the printed sentence. An id that is no candidate decides nothing (the question is asked again). Asked only of a `state.humanSeats` seat, one ability at a time in stack order (the first put on the stack first). |
| `copy-targets` | `{ kind, candidateId }` | v1.22.0, CR 707.10c / 115.7d / 702.40a / 707.10 — the controller of a copy whose effect lets them choose new targets (or the caster of Deflecting Swat, `retarget: true`) keeps or changes ONE target per question (`slotNumber` of `slotCount`); `candidateId` ∈ `candidates[].id` (`{ id, keep?, targets: [one target { id, type, name, controller }] }` — `keep: true` the target as it stands, when it may still be kept; then every other legal object for it whose choice leaves the later targets completable). `spellName` / `sourceName` / `objectKind` name the object; a storm copy carries `copyNumber` / `copyCount`; `suggestedId` is the house pick. An id that is no candidate decides nothing (the question is asked again). Asked only of a `state.humanSeats` seat, one object at a time in stack order (the first put on the stack first), its targets in the order they were chosen. |
| `aura-entry-host` | `{ kind, hostId }` | v1.3.0, CR 303.4f — the Aura's controller picks what it enchants as it enters without being cast; `hostId` ∈ `candidates[].id` (`{ id, name, controller }` — the legal hosts on the board it enters; nothing is targeted, so hexproof doesn't exclude one, protection does). No decline: an id that isn't a candidate takes the house pick. Asked only of a `state.humanSeats` seat; another of that seat's Auras entering in the same event asks again. |

(Shape source of truth: the `apply*Choice` settlers in `app/src/lib/learn/learnSession.js` —
the dispatch table in `applyPendingChoice` names all 21 (20 original + BLITZ LK-2 `look-top-take`).
The LearnView client stamps the same kind-echoed payloads, so this table matches both clients.)

### 1.1b `ask` decisions — metadata + the answering seat

An `ask` decision is `{ kind: "ask", prompt, options, metadata }` with
`metadata = { reasoning, difficulty, defaultIndex, suggestion, traps? }`:

- **`metadata.suggestion`** (stable, documented as of the v1.2.x doc wave): the engine's OWN
  pick for this window — always deep-equal to a member of `options`, so it is the
  guaranteed-legal fallback answer for a driver with no opinion (lab.mjs answers out-of-set
  asks with exactly this field).
- `metadata.defaultIndex` = `suggestion`'s index in `options` (UI convenience).
- `metadata.traps` appears only on the intermediate attack-trap ask.
- Additive metadata fields are MINOR (§5); drivers ignore unknown ones.

**The answering seat.** v1.2.x decisions carry NO first-class `seat` field:

- pending-kind decisions carry `controller` — that IS the answering seat (the wire validates
  the answer against it);
- `ask` decisions are answered by the same derivation the wire itself uses (`applyChoice`,
  SD-3 — CR 702.85a/601.2b: a mid-resolution window belongs to its controller, who may not
  hold priority):
  `state.pendingDiscover?.controller ?? state.pendingFreeCast?.controller ?? state.pendingCascade?.controller ?? state.priorityHolder`.
  With no mid-resolution window pending, that is simply the priority holder.
- A first-class `decision.seat` on every decision is a RESERVED additive change (MINOR when
  it ships); v1.x drivers must not assume its presence.

### 1.1c `session.status` vocabulary

`"active" | "user-wins" | "ai-wins" | "draw" | "timeout" | "abandoned" | "engine-stopped"`

- W/L/draw are set by the driver's SBA outcome recorder (the same rules `gameStatus` reads).
- The turn-limit stalemate exit sets `"draw"` with the clock OFF (legacy, byte-identical) and
  `"timeout"` ONLY when `timePressure` was on — the honest, label-free fourth outcome
  (`trainingWeight: 0` downstream; never relabeled as a W/L).
- `"abandoned"` is set only by `abandon(session)` (the person's "Abandon game" — `POST /api/learn/abandon`,
  2026-10-22 — on a game being played or still at its mulligans; the driver never sets it). `abandonReason`
  rides the session.
- `"engine-stopped"` (v1.8.0) is set only by `endEngineStoppedGame({ session, decision })` — the
  Academy routes' end for a game one of the driver's guards — or, v1.9.0, one of its two engine faults —
  stopped (an `"engine-stuck"` decision with `guard`); the driver never sets it. `engineStop` `{ guard, reason, turn, detail, message }`
  rides the session, and the routes answer `{ kind: "game-over", reason: "engine-stopped", guard,
  message, detail }`.
- **status↔gameStatus:** on `"user-wins"`/`"ai-wins"`/`"draw"` the two agree; `"timeout"`,
  `"abandoned"` and `"engine-stopped"` exist ONLY on `session.status` — `gameStatus(state)` (§1.2)
  never returns them (the turn cap is the loop's concern, and a timed-out game's `state` still reads
  not-over).

### 1.2 The pure layer (v0 — unchanged)

`legalActions(state, seat)` · `isLegalAction(state, action)` · `applyAction(state, action)`
(no-op on illegal/garbage — the security boundary) · `gameStatus(state)` · `observe(state, seat)`
(v1 = full state, perfect information; seat-scoped redaction is reserved as an OPT-IN
`createGame` flag — see §5: shipping the flag is MINOR, flipping the observe() DEFAULT is
MAJOR). **The pure layer cannot settle `pendingChoice`/`pendingArbiter`** — use the session
layer to drive full games.

### 1.3 The pilot decide contract (unchanged from the 2026-06-28 lock)

`decide({ state, legalActions, seat, pilot, features, previewFeatures }) -> action ∈ legalActions`
— fires at every auto-decided window; out-of-set/throwing returns fall back to the default pick
(never illegal, never a crash). `decideMulligan` same shape at keep/ship. Injected via `pilots` at
createGame / `runSelfPlayBatch` — the engine never imports omnath-tools. `features` is the
engine-computed feature vector (`featurizeState`); `previewFeatures(action)` is the one-dispatch
lookahead closure (null/fail-closed on any dispatch failure).

**ROUTER CONVENTION (load-bearing — four historical breaks cost a bench each):** a per-seat decide
**router forwards the WHOLE bag, never destructures-and-rebuilds.** `resolveDecideAction`
(`learnSession.js`) constructs the bag; every router hop between it and the pilot
(`selfPlayRunner.routedDecide`, `gameApi`'s pilots router) MUST spread it through
(`(bag) => pilot.decide({ ...bag, pilot: identity }))`), so any key added to the bag later reaches
the pilot automatically. Destructuring `({ state, legalActions, seat })` silently drops new keys
(`features`/`previewFeatures` were dropped four times this way). Pinned by
`selfPlayRunner.test.js` "routedDecide forwards the whole decide bag" — a sentinel that fails if any
router hop rebuilds instead of spreading.

---

## 2. The consultation surface (what omnath-tools/engine.mjs may import)

Supported, canary-pinned imports (via `MTG_APP_ROOT` + dynamic ESM):

| Module | Exports Omnath may rely on |
|---|---|
| `src/lib/learn/coverage.js` | `classifyCard(card) -> tier`, `isNativeTier(tier)` |
| `src/lib/learn/effects/parser.js` | `parseEffectProgram(card)`, `programConfidence(program) -> "high"\|"low"` |
| `src/lib/server/cardIndex.js` | `allCards()`, `publicCard(c)`, `lookupCard(name) -> card\|null`, `lookupRulingsForCard(card) -> rulings[]` |
| `src/lib/learn/gameApi.js` | everything in §1 |
| `src/lib/server/rulesRetrieval.js` | the rules-retrieval entry the `/api/rules-retrieval` route uses |

`lookupCard(name)` — exact normalized-name match, then substring fallback; a MISS returns
`null`, never a throw. It REQUIRES the bundled oracle snapshot at runtime: with no snapshot on
disk the underlying index load throws an honest `ENOENT` (it never fabricates a card), so
consumers running outside a data root guard the first call (the omnathSeam canary pins exactly
this tolerance). `lookupRulingsForCard(card)` — always an array; `[]` when the card has no
`oracle_id` or no rulings snapshot exists (the rulings index degrades to empty on ENOENT).

Anything NOT in this table is engine-internal and may churn without notice — if Omnath needs
another export, ask on COMMS and it gets added to the table + the canary. Golden-card pins
(Lightning Bolt → `native-spell`, Sol Ring → `native-mana`, Cyclonic Rift → non-vanishing tier)
are shared between `omnathSeam.test.js` (engine side) and `engine.mjs selftest` (brain side) so
both canaries fire on the same drift.

---

## 3. Decision + action vocabulary stability

- `decision.kind` values: `"ask"`, `"game-over"`, `"dispatch-error"`, `"engine-stuck"`,
  `"unresolved"`, + `PENDING_CHOICE_KINDS` (the canonical exported list — 20 in v1.2, §1.1a).
  NEW kinds are MINOR: drivers MUST treat an unknown kind as "stop and report" (never guess an
  answer shape), which `act()` itself mirrors via the `UNKNOWN_DECISION_KIND` failsafe.
- Action objects are plain JSON (`kind` + scalar payload + occasional small arrays); matching
  is canonical-key deep-compare (`actionInOfferedSet`). Additive fields on actions are MINOR
  (e.g. `defenderName` on declare-attacker, added in the overhaul pass).
- `decision.metadata.suggestion` is a stable documented field (§1.1b); additive metadata
  fields are MINOR.
- **RESERVED (ENG-FLAG-2 — documented, NOT built in v1.2.x):** a decision-metadata plumbing
  tag — `metadata.plumbingKinds: ["tap-for-mana", …]` (or a per-option `isPlumbing` flag)
  marking offered actions that are pure mana plumbing, so machine callers/recorders can skip
  them without re-deriving. When it ships it is an additive MINOR; drivers must tolerate its
  absence (and must not invent it meanwhile).

---

## 4. The engine→brain data hook (`omnath-trajectory-v1`)

`node app/scripts/self-play.mjs --export-trajectories=<path> [...]` writes one JSONL line per
game:

```jsonc
{
  "schema": "omnath-trajectory-v1",
  "generatedAt": "<ISO>",
  "mode": "commander",
  "result": "user-wins" | "ai-wins" | "draw" | "timeout" | "<error kind>",
  "winnerSeat": "<seat>" | null,
  "onThePlay": "<seat>" | null,
  "turns": <n> | null,
  "trainingWeight": 1 | 0,        // the runner's HONEST trust gate: 0 = timeout/non-completion —
                                  // hard-filter these; the engine never fabricates a label
  "meta": { seatNames, deckNames, ... },
  "rows": [ { turn, seat, pilot: {playbook, temperament} | null, features, action }, ... ]
}
```

- **Tagged:** `pilot` identity rides every row (null = the default AI).
- **Trust-gated:** `trainingWeight` is computed by the runner, not the exporter — a
  non-completion can never masquerade as a learnable game.
- Changes within v1 are additive-only; an incompatible row shape becomes
  `omnath-trajectory-v2` under a new schema string (old readers skip unknown schemas).

---

## 5. Versioning discipline (what bumps what)

`PLAY_API_VERSION` (`gameApi.js`) is semver over the contract surface: the §1 exports, the
decision/answer vocabulary (§1.1/§1.1a/§3), the §2 consultation table, and the §4 schema
strings.

**MINOR (1.x → 1.y) — additive, consumers may ignore:**

- new exports; new §2 consultation-table rows (`lookupCard`/`lookupRulingsForCard`, this pass);
- new decision kinds (drivers stop-and-report unknowns — §3; `act()` mirrors it);
- new OPTIONAL `createGame`/`nextDecision`/`act` options defaulting to current behavior (the
  v1.1.0 `opts` bag + `pilots` honoring; the v1.2.0 `policy` knob; a future opt-in
  observe-redaction flag);
- new additive fields on decisions/actions/answers/state (`state.observedTurn`; a future
  `decision.seat`; the reserved §3 plumbing tag);
- doc corrections of doc-vs-runtime drift (the 13→20 kind-count fix): the RUNTIME was always
  the contract (§1.1a runtime-read rule), so correcting the doc changes no consumer-visible
  surface — no version bump required, but it posts to COMMS like any contract edit.

**MAJOR (→ 2.0) — breaking, posted to COMMS BEFORE it ships:**

- removing or renaming any §1 export or any `PENDING_CHOICE_KINDS` entry;
- changing an existing kind's answer shape or required fields (§1.1a);
- changing `act()`/`nextDecision`'s `{ session, decision }` return shape;
- making the kind-echo check REJECT legacy kind-less payloads (§1.1a general rules);
- changing the `session.status` vocabulary (§1.1c);
- flipping `observe()` to redacted-by-DEFAULT — redaction ships as an opt-in `createGame`
  flag to stay MINOR (this supersedes the older §1.2 "reserved non-breaking change" wording:
  the reservation is for the OPT-IN flag; the default flip is MAJOR because pilots trained on
  full state would silently lose information);
- changing `trainingWeight` / trajectory-row semantics (§4's schema-string rule already
  covers rows: an incompatible shape becomes `omnath-trajectory-v2`).

**PATCH:** pure doc clarifications that change no list, shape, or behavior.

**Process (not contract):** every MINOR and MAJOR bump posts its delta to `memory/COMMS.md`
(MAJOR before it ships in a release; MINOR may post with the ship — same channel, lighter
ceremony), so lab.mjs's runtime reads (`PENDING_CHOICE_KINDS`, the `PLAY_API_VERSION` 1.x
assertion) stay coordinated. Trajectory / fingerprint hash-anchor RE-BASING after an
intentional behavior change is release-engineering process, recorded in the work log
(`docs/orchestration/play-harness-overhaul-log.md`) — it is NOT part of this contract.

---

*Locked during the Fable 5 overhaul pass (P3). Companion prompt:
`memory/orders/omnath-fable5-overhaul.md`. Questions → memory/COMMS.md.*
