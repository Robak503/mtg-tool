# Omnath: phone audit and local companion roadmap

Review date: 2026-09-05. Starting commit: `5aa66e724325abb4c62c5bf2f8421126abaa3ac4`.
Review branch: `codex/omnath-local-companion-review`.

Colton asked for an app improvement pass, a review of existing ideas, and new
ideas for making Omnath feel like a local AI. This record distinguishes the
changes implemented in this pass from the larger proposed feature program.

## Recommendation

Build a Magic companion with a local conversation model and bounded local
tools. The useful leap is a companion that understands the current card, deck,
game, and player's preferences, can ask a relevant clarification, and remembers
only what the player chooses. Keep the quick card/rule library as an immediate
tool within that conversation.

The standing decision remains one Omnath, entirely offline. Whether to extend
that companion into a general personal assistant is an open question sent to
Colton during this review; the working scope is Magic.

## What the code actually does

The original phone build had a working local Oracle/rulings/CR/art library and
a portable engine smoke test. Its answer planner does **not** invoke that engine
to adjudicate arbitrary questions. A passed runtime smoke test establishes a
known subset of runtime behavior, not a verified answer to the next question.

The local model bridge offered bounded question classification. Its narration
prompt only permitted `{{RESULT}}` and `{{FOLLOW_UP}}`, with all literal words
rejected. Even a successfully installed model could not produce a natural
explanation under that contract. The UI then replaced every previous answer.
Those three implementation choices explain the rules-bot experience.

This pass adds the conversation foundation and removes unnecessary generation
from exact lookups. It does not claim a complete generative companion or a
general rules judge has shipped.

## Implemented in this pass

| Finding | Result |
| --- | --- |
| A new question erased the previous answer | Up to eight visible answer turns remain in the current session; New chat clears them and the local subject context |
| Follow-ups had no subject | Explicit requests such as “its rulings” and “show it again” can use the last verified card or rule, visibly labeled; ambiguous interaction pronouns are not guessed |
| Greeting/help requests fell into rule search | Short greetings, thanks, and help have friendly local responses and no verified-ruling badge |
| Exact answers could wait for model status and placeholder narration | Direct card and rule results bypass the model; unresolved requests may still use bounded local intent assistance |
| Stop waited on native cancellation and pending retrieval | UI cancellation releases the caller immediately; retrieval/model waits have deadlines; stale results and errors cannot replace a newer outcome |
| Token listener failure could disable generation | Optional progress listeners may fail or time out; late listeners are cleaned up and generation still has a deadline |
| Native intent calls shared an indefinitely growing conversation | Each classification call now owns and closes a fresh native conversation; cancellation retains exclusive generation ownership until cleanup |
| Mentioning a CR number could turn an interaction into a grounded rule answer | Only direct rule lookup is grounded; an interaction stays related evidence even when a model proposes a lookup |
| Bare card names did not reliably enter card lookup | An exact bare name works; common “what is,” “show,” and “tell me about” forms resolve exact names |
| Art query errors could discard useful text | Missing, rejected, or slow art queries fall back to text; available multi-face previews have face buttons and stale-image protection |
| Card rulings were cut to four and every long answer opened fully | All stored official rulings are available in an expander; sources collapse separately; rule examples are no longer labeled official card rulings |
| Reading layout was fixed | Local settings control larger text, card art visibility, and expanded rulings; reset is provided and failed persistence is disclosed |
| Multiple answer cards shared feedback state | Each answer owns its rating, original question for revision, and model-outcome attribution |
| Startup screen covered controls but did not remove background keyboard focus | Background app and composer are inert until startup finishes; startup exceptions reveal recovery |
| Small composer widths and sticky safe-area handling were fragile | Narrow layouts have a shrinkable input and safe-area-aware header; 320px and 430px browser cases are checked |
| Clipboard failure in recovery showed no diagnostic text | The receipt becomes selectable text in the recovery card |
| Runtime diagnostics omitted real engine witnesses | Export accepts the real named check-map shape and includes a build identifier |
| Users could not see card-snapshot age | The status panel reads the Oracle snapshot date from local metadata; diagnostics include available Oracle/rulings dates |

Reading settings are the only new persistent data. Chat text and inferred facts
are not written to local storage. This is session context, not long-term memory.
Native intent processing is isolated per call; future conversational context
must be assembled explicitly and bounded by the phone controller.

## Existing ideas recovered from the earlier plans

The previous short next-PC ledger was a subset of the July phone playbook. The
following ideas already existed; they should not be presented as newly invented.
This table reconciles them with the later offline-only ruling.

| Existing idea | Where it was recorded | Current treatment |
| --- | --- | --- |
| Full deck library, add/cut/swap, quantities, categories, paste import | `docs/phone-playbook/03-feat-decks.md`, D8 | Strong next feature; offline paste/file import first |
| Deck-bound conversations using a fixed deck snapshot | `03-feat-decks.md`, `04-feat-agents.md` | Keep; changing a deck must not silently change an existing conversation's assumptions |
| Deck architecture, synergy discussion, and a humorous critique | `04-feat-agents.md` | Skills of one Omnath, with one voice; no restored persona roster |
| Pod balance, deck comparison, player profiles, post-game ratings | `05-feat-pod.md` | Later local feature; disclose unresolved cards and dated calibration rather than presenting ratings as objective truth |
| Life, per-commander damage, poison, undo, and resume after a crash | `06-feat-life-tracker.md`, D9 | Keep as the table companion milestone |
| Planechase cards, planar die, plane history, one-tap counter/plane swap | `06-feat-life-tracker.md` | Keep; verify plane data and local art completeness before building |
| Collection binder, grails, showpieces, artist/signature provenance | `07-feat-vault.md` | Keep local collection and booth workflows; start every friend's profile empty |
| Live prices, grail scanning, daily news, background hub jobs and push | `07-feat-vault.md`, D10 | Requires a new connected-product decision; manually imported, dated snapshots can remain offline |
| Local rule/card inspector, recent lookups, glossary, surrounding rules | `08-feat-rules.md` | Continue the local library; persistent recent searches should be opt-in |
| Camera card identification and actions after recognition | `09-feat-card-scanner.md`, D11 | Already designed, deferred; require local recognition and user confirmation of uncertain matches |
| Local preferences, limited memory, signed alpha, 3–5-player pilot | `NEXT-PC.md`, orchestration stages 5–6 | Keep; preferences foundation is now implemented, memory and pilot are not |
| Cross-device continuity and owner/friend separation | `02-data-and-sync.md`, D12 | Retain privacy separation and consider explicit file backup/import; hub/API/multiple-persona requirements remain superseded |
| Tokens-needed kit, combo details, deck debrief and matchup history | `docs/orchestration/UPGRADE-BACKLOG.md` | Reuse phone-safe data/interfaces when the deck milestone opens |
| Judge quiz, Academy, self-play, and phone simulation | D-P7/D-P8, desktop backlog | Previously deferred or desktop-only; do not quietly reactivate them in this pass |

The old extra counters (energy, experience, monarch, day/night) were explicitly
trimmed by Colton. They remain parked unless he reopens them. D7 and D12's
multiple agents, remote primary inference, and hiding Omnath in friend builds
remain superseded.

## Proposed companion architecture

The session controller owns context: confirmed card IDs, an optional deck
snapshot ID, a small set of user-supplied game facts, recent turns, and explicit
preferences. A model receives only the context needed for the current question.

1. Route a direct lookup immediately. Otherwise, a local model may propose a
   small structured intent or tool request.
2. Resolve names and arguments against the local database. Ask the player to
   choose when there are multiple plausible cards or missing game facts.
3. Execute only an allowlist of phone-owned tools. Initial tools should be
   card/rule lookup, compare cards, inspect deck, calculate deck counts, and
   retrieve explicitly saved notes. No arbitrary SQL, paths, shell, or network.
4. Use deterministic engines for supported calculations and supported game
   verdicts. Include their input assumptions, engine version, and witness.
5. Construct an answer with separate evidence, conclusion, explanation, and
   suggested next question. Retrieve quoted Oracle/CR text by record identity.
6. Render a short answer first and expandable evidence beneath it. The model
   may choose a relevant follow-up or explanation structure; it cannot upgrade
   an unresolved interaction to a verified conclusion.
7. Propose mutations such as saving a preference or editing a deck as visible
   changes the player can accept or undo. Memory writes are explicit.

Start explanations with reviewed templates backed by local rule records and
tested examples. A second model or a check that citation numbers exist does
**not** prove a generated explanation follows from the evidence. Freely
generated coaching needs separate evaluation and a clear distinction from a
verified ruling; it must not replace quoted card facts or deterministic results.

Google's current LiteRT-LM Android documentation exposes conversation management
and tool use, with tool support dependent on the chosen model. That supports
this proposed architecture, but does not prove the catalog's current candidates
can perform it well. Keep the project's pinned runtime and benchmark before any
upgrade. [Official Android runtime documentation](https://developers.google.com/edge/litert-lm/android).

## New and extended feature proposals

These are proposals, not promises that every feature is implemented. S/M/L are
relative engineering scope, not time estimates. “First” means a candidate for
the next milestone after device verification.

| ID | Idea and player benefit | Priority / scope |
| --- | --- | --- |
| N01 | Guided first-use model setup: installed/missing/loading states, local file import, free-space check, progress, unload, and a test question | First / M |
| N02 | A visible context strip: “Talking about this card / this deck / this game,” with clear/remove controls | First / M |
| N03 | Ask one useful clarification at a time: cards, controller, zone, timing, targets; let the player correct assumptions | First / M |
| N04 | “Quick answer / walk me through it” explanation depth using a common evidence plan | First / M |
| N05 | Nickname and typo resolution with candidate card pictures and a confirmation step | First / M |
| N06 | Memory cards: “Remember that I prefer…,” review/edit/forget, provenance and date; no automatic private-history ingestion | First / M |
| N07 | Pin a card/rule to the current game and build a short personal reference shelf | First / S–M |
| N08 | Two-card comparison: exact text differences, costs, types, deck roles, and an explicit list of assumptions | Next / M |
| N09 | Board-state worksheet from chat: present the inferred state for correction before computing an interaction | Next / L |
| N10 | Stack/timing walkthrough with reversible steps and a local citation for each supported transition | Next / L |
| N11 | Deck-aware “why this card?” discussion with owned-card replacements and visible add/cut proposals | Next / L |
| N12 | Deck changelog with the reason for each edit and undo; “did that change help?” after games | Next / M |
| N13 | Personal game-night recap from explicit notes and tracked events, separating observed events from suggestions | Next / M |
| N14 | An explanation of uncertainty: name the missing fact or unsupported mechanic and offer the smallest useful next action | First / M |
| N15 | Local voice questions and optional spoken answers, push-to-talk with visible recording state | Later / L |
| N16 | Camera-to-card-to-conversation: extend the existing scanner plan with a confirmed card-context handoff | Later / L |
| N17 | Borrow/loan and trade checklist at the table; quantities and manual notes, dated price snapshots only | Later / M |
| N18 | Table kit: token checklist, reminder cards, and dice/counters needed for a selected deck | Next / M |
| N19 | Semantic search over local cards, rules, and approved notes for concepts that exact search misses | Next / L |
| N20 | User-controlled backup/import of decks and memories with preview, version checks, and duplicate handling | Next / M |
| N21 | Model performance page: time to first output, total time, cancellations, memory/thermal observations, and battery-saving behavior | First / M |
| N22 | Knowledge update preview: pack date, changed cards/rules, validation, available storage, rollback after failed import | Next / L |
| N23 | “Explain that term” links within a response, using a local glossary without losing the current conversation | Next / M |
| N24 | A game-night mode with big controls, quick access to pinned rules, and a reversible handoff to the life tracker | Next / M |
| N25 | A friend-onboarding flow that asks experience level and preferred detail, then creates an empty local profile | Before alpha / M |
| N26 | Reproducible support reports: exact app/pack/model IDs, timings and failure stage, with opt-in reproduction text | First / M |

Voice remains conditional on offline recognition support being available on the
actual device; generic system speech recognition is not sufficient evidence of
offline operation. Android exposes a specific on-device recognizer and an
availability check. Minimum supported Android versions without it keep text
input. [Official SpeechRecognizer documentation](https://developer.android.com/reference/android/speech/SpeechRecognizer.html).

## Recommended build order and exit gates

**A. Validate the foundation.** Install this branch's full-art debug APK as an
update, preserve app data, verify startup, exact lookup, all rulings, art faces,
Stop/retry, New chat, settings, and diagnostic witnesses on the Pixel. Run the
same checks in airplane mode. A real fresh-install test is separate and requires
an intentional data reset; do not silently uninstall the player's app.

**B. Make the model useful.** Add the local model setup/status surface and a
fixed offline benchmark prompt set. Test the base and enhanced candidates
independently for intent accuracy, invented names, latency, memory, thermals,
cancel/restart, and native cleanup. Models remain optional for quick lookup.

**C. Build the conversational layer.** Context strip, clarification flow,
reviewed plain-language explanations, nickname confirmation, and explicit
memory cards. Every unsupported interaction must preserve its uncertainty.

**D. Make it know the player's decks.** Offline paste/file import, exact name
resolution, deck snapshot binding, useful counts, compare cards, and reversible
edit proposals. Coordinate new engine interfaces with Cindy; do not import the
Node-only server routes or the full desktop simulator into the phone.

**E. Make it useful at the table.** Pinned references, the previously approved
counter suite, undo/resume, Planechase, post-game notes and debrief. Add voice
and scanning after local feasibility is measured.

**F. Friend alpha.** Signed private distribution, empty profiles, memory
controls, tested backup/import, device matrix, and 3–5 beginner players. Keep
correctness, usefulness, responsiveness, and privacy as separate measured gates.

## Outstanding engineering work and known limits

- Physical-device results for this review must be recorded separately from
  browser fixtures and unit tests. Browser tests cannot prove native model
  cancellation, GPU compatibility, keyboard insets, or airplane-mode behavior.
- JavaScript deadlines keep the caller responsive but cannot terminate a
  blocked native or GPU operation. Stress-test native teardown and avoid
  overlapping loads/unloads before offering model switching in the UI.
- The current model catalog is duplicated in Kotlin and JSON. Generate the
  native catalog from the canonical file before adding model choices.
- The current catalog filenames target Tensor G5, while the native adapter
  selects the GPU backend. That combination requires a real-device model
  load/benchmark; no compatibility claim follows from the filename alone.
- The pack has 38,254 cards, 77,999 rulings, and 3,138 CR records. Oracle and
  rulings snapshots are dated 2026-07-17. This review did not refresh upstream
  data or change Cindy's corpus. Display the source date and regenerate a pack
  at a deliberate update milestone.
- The art pack contains small card previews. Larger storage capacity does not
  turn those into high-resolution scans. A future high-resolution art option
  needs a new source/download/build policy and its own size/device checks.
- Optional art still participates in native startup provisioning. Opening the
  text library before art finishes is a worthwhile later change with separate
  readiness states; it is not part of this patch.
- Long-term conversation storage, semantic memory, general-purpose personal
  assistance, arbitrary gameplay verdicts, local voice, camera recognition,
  and full deck editing are not implemented by this review.
- Old narration template helpers remain as a tested, unused contract. A new
  conversational protocol should replace them deliberately rather than widening
  their literal-content filter and calling that validation.

## Verification and transfer

**2026-09-05 completion receipt:** source commit `8123292b` passed 48 JavaScript
tests, six browser smoke scenario groups, Android model-plugin tests, 17
engine/WebView tests, and three Rust provisioning tests. The full-art Android
debug APK built successfully (749,199,168 bytes; SHA-256
`9eaf2ce73bb0ac1970c68a7f12944d6a9c1acce2a4581a7d13582c2710492422`).
The Pixel is now ADB-authorized; this new APK still needs physical-device
installation and validation. See `HANDOFF-PRO.md` for the exact existing local
folder/artifact and same-computer continuation steps.

Automated regression coverage includes request cancellation/stale completions,
lookup/model deadlines, model listener failure, direct-lookup bypass, grounded
versus related intent, full rulings, art failure fallback, contextual follow-up,
preference privacy, and diagnostic witnesses. The browser smoke runner checks
startup blocking, multi-turn UI, per-turn feedback, reset/reload, stuck-lookup
Stop, a 320px layout, and clipboard recovery.

Run the normal mobile verification with `npm run verify`, Android plugin checks
with `npm run android:model:test`, and the browser checks with
`npm run browser:test` while the local development server runs on port 5175.
The optional browser runner needs Playwright through normal module resolution or
`PLAYWRIGHT_MODULE`; it uses installed Chrome by default. Browser dependencies
are development-only and never part of the phone APK.

Use `TRANSFER.md` for SDK/data prerequisites. Use the review branch for these
changes; the older transfer branch and draft APK are distinct checkpoints.
Keep source and documents in Git, and generated databases, images, model files,
APKs, credentials, and signing keys outside repository history.
