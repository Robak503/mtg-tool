# Omnath — same-computer Pro-account handoff

Prepared 2026-09-05. This is a continuation handoff, not a new project or a
request to repeat the audit. Colton is switching accounts because the previous
account reached its usage limit. Both accounts will work on this computer.

## Open this existing folder

`C:\Users\colto\.codex\worktrees\837d\mtg-tool`

Use the existing working directory directly. Do not create a replacement clone,
delete this worktree, or switch the main `C:\Projects\mtg-tool` checkout. The
ignored data packs, downloaded model, dependencies, and new APK are already here.
Do not assume the other account inherits this conversation; this document is
the durable continuation context.

- Repository: https://github.com/Robak503/mtg-tool
- Branch: `codex/omnath-local-companion-review`
- Implemented/tested source commit: `8123292b349a058f58594ed3e3a315106da18be8`
- Subsequent handoff-only commits do not change the APK's source identity.
- GitHub visibility was verified **PRIVATE** at handoff. It had drifted public
  earlier in this review and was restored under Colton's existing instruction.
  Never change visibility to work around CI or billing. No release was published
  or updated in this review.

## User's active task

Review the MTG phone app, implement useful improvements, recover the existing
feature ideas, propose more, and explain the route from a rules lookup bot to a
useful local AI. The audit and first improvement pass are complete in source.
Finish real-device validation, then present the improvements and prioritized
ideas to Colton. Do not claim all possible bugs or features have been addressed.

Read `LOCAL-AI-REVIEW.md` first: it contains implemented changes, the recovered
July-playbook ideas, **26 feature proposals**, known limits, and the staged plan.
`NEXT-PC.md` is the historical backlog; this handoff and the review supersede its
older branch/install instructions. `TRANSFER.md` explains prerequisites and
omitted files if a different computer is eventually used.

## Non-negotiable scope

- One Omnath, one conversation surface, offline only; this supersedes July D7
  and D12. No remote inference, persona selector, or runtime internet fallback.
- CR data belongs to the citation pack, not the portable engine bundle.
- Canonical card/rule evidence must not be invented or replaced by model prose.
- An absent model or card-art pack must not disable deterministic text lookup.
- Cindy owns `app/src/lib/learn/**` and knowledge corpora; the harness is another
  owner's lane. Import/test their published interfaces, do not rewrite them.
- Do not clear phone app data, uninstall to solve a signing mismatch, overwrite
  unrelated work, expose credentials, publish releases, or commit APKs/models.
- A smalltalk reply, related-evidence match, exact lookup, and actual engine
  adjudication are distinct capabilities; label them honestly.

## Implemented in the new APK

- In-memory conversation transcript (last eight answer cards), safe contextual
  follow-ups, New chat, and per-answer feedback. Chat text is not saved to disk.
- Optional larger text, hide/show art, and collapsed/expanded rulings preferences.
- All official rulings, card statistics, card-face controls, and source dates.
- Exact card/rule lookup bypasses the model. Unknown rule references and
  interaction questions no longer masquerade as trusted rule lookup answers.
- Retrieval/model deadlines, immediate logical Stop, stale-result guards, and
  clean text fallback if optional art/model work fails or hangs.
- Native model requests use fresh conversations, bounded output, and retained
  cancellation ownership until cleanup. Device/GPU behavior still needs testing.
- Startup interaction blocking, narrow-screen layout, clipboard recovery,
  real runtime witness diagnostics, and source-build identification.

## Validation completed

- `npm run verify`: 48 JavaScript tests passed; production WebView build passed.
- Pack parity: 38,254 cards, 77,999 official rulings, 3,138 CR records.
- Browser smoke: six scenario groups passed, including 320px layout, startup
  gate, transcript/reset/preferences, stuck-lookup Stop, and clipboard recovery.
- Android model-plugin tests passed and updated Kotlin compiled.
- Engine/WebView tests: 17 passed across four files.
- Rust provisioning tests: three passed.
- Full-art ARM64 debug Android build completed successfully. The normal Windows
  symlink-permission fallback copied assets/libraries and Gradle finished green.
- Review screenshots: `build/review/companion-430.png` and `companion-320.png`.

These are host/browser/build results, **not physical-device approval**.

## New APK — already built locally

Path:
`C:\Users\colto\.codex\worktrees\837d\mtg-tool\app-mobile\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk`

- Built: 2026-09-05 12:06:30 America/Phoenix.
- Bytes: **749,199,168**.
- SHA-256: `9eaf2ce73bb0ac1970c68a7f12944d6a9c1acce2a4581a7d13582c2710492422`.
- Package: `com.colton.omnath.probe.debug`.
- Contains local knowledge and card-preview art, **not an LLM model**.
- This is newer than `build/releases/` and the historical private draft release.
  Do not install those older APKs when testing this review.

## Phone is now connected and authorized

Latest read-only ADB check returned `device`, not `unauthorized`, for the
**Pixel 10 Pro XL**. Earlier messages about missing authorization are stale.
Recheck before operating because USB state can change. No install or physical
test of the new review APK was done before this handoff.

ADB: `C:\Users\colto\Android\Sdk\platform-tools\adb.exe`.
SDK: `C:\Users\colto\Android\Sdk`; NDK: `30.0.16138531`.
The local Java/Rust/Node/Android toolchain already built this APK successfully.
An account switch alone does not require reinstalling those project dependencies.

## First continuation steps

1. Read this file and `LOCAL-AI-REVIEW.md`; inspect current Git status and branch.
   Preserve any changes made since handoff. Confirm the private remote remains
   private before a push. Do not rerun dependency downloads just to resume.
2. Verify the existing APK's hash above. Check ADB sees one authorized phone.
3. Install it **as an update**, preserving data. Read `scripts/device-verify.ps1`
   before using it. Do not pass `-ResetAppData`. If Android rejects the signer,
   stop and ask Colton rather than uninstalling. That script's process/focus
   check is only a smoke test, not proof of answer correctness.
4. Test startup gate, Omnath Oracle/rulings/art, `Show CR 702.7`, card-face
   selection, safe follow-ups, settings, New chat, repeated questions, and
   Stop/retry. Verify no stale response returns and the keyboard/layout behaves
   correctly. Check unknown CR and ambiguous interaction questions fail safely.
5. Repeat core lookups in airplane mode; restore the original connectivity
   setting afterward. Record app-scoped diagnostics and opt-in screenshots.
   Avoid collecting unrelated phone notifications or whole-device logs.
6. Present the completed improvements and the best ideas from the 26-item
   catalog. Then implement the next agreed slice: useful local-model setup and
   measurement, context/clarification, explicit memory, and deck-aware tools.
   Keep this sequence scoped; do not pretend installing a model alone creates
   the whole companion.

## Local model and AI work still outstanding

`build/models/gemma-4-E2B-it_Google_Tensor_G5.litertlm` is already present
(3,113,545,589 bytes). Verify it against `model-catalog.json` before use; do not
download it again. The base model is not present in that directory. Whether a
model is on the phone or can load successfully has not been established here.
The catalog is pinned to LiteRT-LM 0.16.1. Tensor G5 filenames plus a GPU backend
are **not proof of compatibility**; benchmark the actual phone.

Important architectural findings: the answer planner does not yet call the
engine to adjudicate arbitrary interactions. Old narration only substituted
fixed placeholders; this review removes that unnecessary call from the active
lookup path, not replaces it with unrestricted AI prose. The real next layer is
a bounded local tool-using companion with visible context, clarification, and
user-approved memory. See the review's trust boundaries and exit gates.

One optional product question is still unanswered: stay Magic-focused, extend
to Magic plus personal notes/reminders, or become a general local assistant?
The current roadmap assumes **Magic-focused companion**. No broader personal
data access, reminders, or general assistant features have been authorized.

## Keeping the work banked

Commit/push scoped source and handoff updates to this private branch. Do not
merge to main or update the old draft release without a new request. The shared
COMMS at `C:\Projects\omnath-vault\memory\COMMS.md` received a review/privacy
notice; no vault commit/sync is claimed. Avoid resetting other owners' changes.

Generated APKs, SQLite packs, card-image caches, models, SDK directories,
dependencies, build caches, machine-local config, credentials, and signing
keystores are deliberately outside Git. They remain on this same computer.
`TRANSFER.md` records size limits and restoration for future machine migration.

For browser tests, start Vite on loopback port 5175 and run `npm run browser:test`.
If Playwright is not resolved automatically, this machine has it at
`C:/Users/colto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
set `PLAYWRIGHT_MODULE` to its `file:///` URL in that test shell only.
