# Handoff prompt — MTG Tool, The Academy (learn-to-play engine)

Paste the block below into a new chat to continue the work. It's written to be
self-contained, but the new session should still read `CLAUDE.md` and the two
design docs it points to before touching code.

---

```
ultracode

You are Claude Code continuing work on MTG Tool — a local-first, Tauri-packaged
Windows .exe Magic: The Gathering Commander assistant. Read CLAUDE.md FIRST
(it's the operating manual and overrides defaults). Owner is Colton (vibe-coder;
he directs, you build, you have full architectural authority). Repo:
https://github.com/Robak503/mtg-tool. Be exhaustive and adversarially verify;
use the ultracode process described below.

## Where things stand (just shipped: v0.22.0, live + auto-updating)

The prior session took "The Academy" (the learn-to-play simulator) from broken
("Engine got stuck: safety cap (1000 ticks) hit") to genuinely playable, then
shipped it as signed release v0.22.0. The whole arc — root cause, roadmap,
plan-eng-review + Codex outside-voice review, 6 engine PRs + 2 feature PRs,
adversarial review (3 real bugs caught + fixed), live QA, ship — is done.

Root cause of the original bug: the learn engine was built in unit-tested
pieces (Phase-6 PRs 1–10) but never wired into a playable loop — nothing
produced mana, so no spell was castable, the user was never prompted, and the
driver auto-piloted empty turns into the safety cap.

Branch state: everything is merged to `master` and tagged `v0.22.0`. Start
clean from master. Test suite: **~1184 vitest cases, all green** (`cd app &&
npm test`).

## The learn engine (this is what you'll mostly work on)

Pure, immutable JS. Lives in `app/src/lib/learn/`. Every helper returns a NEW
state; nothing mutates. The play loop:

  createLearnSession({userDeck, opponentDeck|opponentDecks, mode, difficulty})
    → advanceUntilDecision(session)  → {session, decision}
       decision.kind: "ask" (UI renders options) | "game-over" | "engine-stuck"
                      | "dispatch-error"
    → applyChoice(session, choice)   → dispatches + chains advanceUntilDecision

Files and what they own:
- gameState.js      — data layer: zones, permanents, mana pool, life, the
                      shared lethal-SBA `destroyLethalCreatures`, creaturePower/
                      creatureToughness (THE single P/T accessor; takes optional
                      `state` to apply static modifiers).
- gameEngine.js     — turn/phase/step machine, priority, stack resolution
                      (resolveTopOfStack runs payload.onResolve), trigger queue,
                      `emptyManaPools` (CR 500.4, hooked into advanceStep), the
                      two combat-damage sub-steps.
- legalChoices.js   — generates legal actions: pass / play-land / cast-spell
                      (target-expanded) / tap-for-mana / declare-attacker /
                      declare-blocker (flying/reach evasion enforced here).
- decisionGate.js   — ASK (beginner) vs auto-decide (intermediate/expert);
                      resolveChoice matches a user pick to a legal action
                      (by kind+cardId+permanentId+attackerId+color+target).
- opponentAI.js     — pickAction (combat-aware: pickAttackPlan/pickBlockPlan),
                      pickCastAction (best spell + AI target via chooseAITarget).
- actionDispatcher.js — applies one action → new state. cast auto-taps via
                      manaModel.planPayment then subtracts plan.spend exactly.
- manaModel.js      — manaProduction (basics-by-name + KNOWN_ROCKS + oracle
                      "Add" parse), manaSources, canAfford, planPayment
                      (returns {taps, spend}; scarcest-color-first).
- combatResolution.js — resolveCombatDamage(state,{firstStrikeStep}). Keyword
                      math: first/double strike, trample, deathtouch, lifelink.
                      "wasBlocked" (declared) vs "liveBlockers" is load-bearing.
- keywords.js       — hasKeyword(card, kw): oracle-aware printed-keyword
                      detection (anchored at ability-word positions), cached.
- cardEffects.js    — targeted per-card registry (Omnath, Kruphix, Horizon
                      Stone) with two hooks: manaDoesNotEmpty + staticPTModifier.
- spellEffects.js   — parseSpellEffect (damage/destroy/draw), enumerateTargets,
                      chooseAITarget, resolveSpellEffect.
- learnSession.js   — session lifecycle, advanceUntilDecision driver (MAX_TURNS
                      stalemate, SAFETY_CAP backstop, anti-loop progress latch,
                      simultaneous-death draw, elimination).
- narrator.js, trapDetector.js, tableSnapshot.js, boardContext.js,
  formatDetection.js — narration, intermediate trap warnings, UI snapshot,
                      board-context string, 100→commander/60→standard detection.
- HTTP: app/src/app/api/learn/{start,step}/route.js + server/learnSessionStore.js
- UI:  app/src/components/mtg/LearnView.jsx + useLearnSession hook
- Cards in a session carry {id, name, type, mana, oracle} ONLY (from
  LearnView deckToCardArray) — NO Scryfall keywords array, NO produced_mana.
  Detect everything from `type` + `oracle`.

## What WORKS now (don't rebuild it)

- Mana: lands + rocks (Sol Ring/Signets) + dorks; floating mana; auto-tap-on-
  cast; Omnath grows +1/+1 per floated green and keeps green between phases.
- Combat: tap-on-attack (vigilance excepted), AI attacks + blocks, two-step
  first/double strike, trample, deathtouch, lifelink, flying/reach evasion.
- Spells: burn ("deals N damage to ..."), removal ("destroy target creature"),
  draw ("draw N cards"), with per-target action expansion + AI targeting that
  never hits its own stuff. Unknown spells resolve as a safe no-op-with-log.
- Termination: win/loss/elimination/simultaneous-death draw/turn-limit draw +
  an anti-loop progress latch. Plays end-to-end 1v1 and Commander 4P at
  Beginner/Intermediate/Expert.

## What is STUBBED / DEFERRED (do NOT assume these work)

- Keywords: menace, indestructible, protection, hexproof/ward, flash, haste-
  grant — only PRINTED flying/reach/first/double strike/trample/deathtouch/
  lifelink/vigilance/haste are detected. GRANTED keywords (sliver lords,
  anthems) are NOT — keyword detection reads the card's own oracle only.
- Spells: pump (+X/+X until end of turn), counterspells, token-makers, ramp-
  search, ETB triggers, activated (non-mana) abilities, sacrifice/discard
  costs, modal, X-spells — all fall through to no-op. Multi-effect spells
  parse only their FIRST recognized clause (e.g. "deal 2... Draw a card" drops
  the draw). The stack has no real counter interaction.
- Card effects registry covers only Omnath/Kruphix/Horizon Stone. Upwelling
  (symmetric "mana doesn't empty for everyone") is deferred — the hook is
  per-controller. Horizon Stone is approximated (preserves mana; doesn't
  convert to colorless).
- Minor known inaccuracy: keyword detection can false-positive a keyword in an
  anthem's comma-separated grant list ("...gain first strike, vigilance...").
- LearnView UI is "minimal but functional": no zone visuals, no 4P opponent
  strips, no defender picker, no keyboard shortcuts.
- No learn-session persistence (data/learn-sessions/ — Phase-6 PR 13 unbuilt).
- No Expert post-game analysis (Phase-6 PR 12 unbuilt).

## Landmines (these cost real time — see CLAUDE.md §5 too)

- `card.type` vs `card.type_line`: in-session cards use `type`. Always read both
  (`card.type || card.type_line`). The shared lethal SBA is
  gameState.destroyLethalCreatures — use it; don't re-inline a type_line-only check.
- hasKeyword lives in keywords.js (oracle-aware). A local copy once shadowed it
  in legalChoices and silently broke evasion/haste — never reintroduce a local.
- planPayment returns {taps, spend}; the dispatcher applies taps then subtracts
  `spend` verbatim. Don't add a second payment heuristic (they can diverge and
  throw MANA_SHORT after a spell was deemed castable — that was a real bug).
- combat reads creaturePower/creatureToughness with `state` so Omnath's static
  buff flows; passing no state gives printed+counters only.
- Arbiter (/api/arbiter) is Ollama-only — never route it to Anthropic.
- All server file access goes through paths.js helpers — never raw process.cwd().

## The roadmap — pick a track with the owner (each is hours of work)

1. UI / play experience (Phase-6 PR 11): 4-player board layout (3 opponent
   strips: life / commander damage / hand / board), a defender picker in
   Commander combat, zone visuals (hand/battlefield/graveyard), keyboard
   shortcuts (1-9 + Enter). Touches LearnView.jsx + the decision render.
2. More engine depth: keywords (menace, indestructible, protection, hexproof/
   ward), spell effects (pump/+X+X with until-end-of-turn cleanup, tokens,
   counters, ramp), GRANTED keywords (sliver lords/anthems via a continuous-
   effects layer), multi-effect spell parsing. Grows the cardEffects/keywords/
   spellEffects layers.
3. Expert coaching (Phase-6 PR 12): silent autopilot + post-game analysis that
   mines the decisionLog for mistakes, missed lethal, stranded mana.
4. Persistence (Phase-6 PR 13): data/learn-sessions/ + resume + per-format
   insights.

## Process (ultracode)

- For substantial features: write/extend a roadmap doc, run /plan-eng-review,
  get a Codex outside-voice pass, then build in small TDD sub-PRs, then an
  adversarial review subagent before shipping. Lean on the patterns the prior
  session used (docs/phase6-playable-engine.md is the worked example).
- Verify: `cd app && npm test` (full suite). `cd app/src-tauri && cargo check`
  for Rust. Live QA via the preview tools: `preview_start` the "mtg-tool"
  launch config, then drive `/api/learn/start` with `preview_eval` or click
  through LearnView (the real decks — Omnath, Sliver Hivelord, etc. — load).
- Ship: branch → PR to master → CI green (test + rust) → merge →
  `git tag vX.Y.Z -a -m "..." && git push origin vX.Y.Z` → release CI (~15 min,
  signs + publishes installer + latest.json) → installs auto-update. Bump the
  version in app/package.json AND app/src-tauri/tauri.conf.json, update
  CHANGELOG.md. Conventional Commits; end commits with the
  "Co-Authored-By: Claude Opus 4.8 (1M context)" trailer.

## Read these before coding

- CLAUDE.md — operating manual (prime directives, gotchas §5, status §9).
- docs/phase6-playable-engine.md — roadmap + eng-review report for v0.22.0.
- docs/phase6-learn-to-play.md — original design doc + the Phase-6 PR sequence
  (§11 covers the Commander 4P expansion).
- CHANGELOG.md — the [0.22.0] entry.

## Start here

1. Read CLAUDE.md + docs/phase6-playable-engine.md + docs/phase6-learn-to-play.md.
2. `cd app && npm test` — confirm ~1184 green from a clean master.
3. Ask the owner which roadmap track to build (or build the one he names),
   then run the full ultracode process for it.
```

---

*Generated 2026-06-06 after shipping v0.22.0. Keep this current as tracks land.*
