# Omnath phone app — next-PC ledger

Last reconciled: 2026-09-04

**Same-computer account handoff, 2026-09-05:** start with `HANDOFF-PRO.md`.
The new full-art review APK has built successfully and the Pixel is now USB
debugging-authorized. Device validation is next; do not repeat the old download
or fresh-install/reset instructions below for this continuation.

**2026-09-05 review:** `LOCAL-AI-REVIEW.md` now contains the complete audit,
recovered July feature ideas, new companion proposals, and revised build order.
Implementation from that pass is on `codex/omnath-local-companion-review`.
The older APK/transfer checkpoint below is preserved for recovery. The new
reading preferences and in-memory conversation foundation are implemented;
long-term memory and a full conversational model remain planned.

This is the short operational backlog for continuing the phone app on another
computer. `TRANSFER.md` is the machine-setup and artifact handoff. The full
decision and implementation record remains in
`../docs/orchestration/OMNATH-PHONE-APP.md`.

## Locked product decisions

- There is one Omnath assistant and one conversation surface.
- The installed app is offline-only. It has no internet permission or runtime
  download path.
- This ruling supersedes the July-playbook D7/D12 persona and inference
  conflict. There is no persona selector and no online fallback.
- The rules engine does not read the Comprehensive Rules corpus at runtime.
  Rule behavior is baked into the portable engine. The CR corpus is a
  build-machine input for the separate citation/knowledge pack.
- Canonical Oracle text, official rulings, CR citations, and card art are local
  evidence. A local language model is optional presentation and bounded intent
  assistance; it may not invent or replace those facts.
- Knowledge, art, and model payloads remain independently replaceable. A
  missing art pack or model must not stop deterministic rules/card answers.
- Phone work must not edit Cindy's protected engine/corpus lane or the Omnath
  harness lane. Re-sync their published interfaces instead.

## Built and banked

- LEYLINE-style phone UI based on the existing desktop application's look,
  without desktop-only agents or deck controls.
- Exact card-name lookup with canonical Oracle text and official rulings.
- Exact CR lookup plus related-evidence results that clearly say when they are
  not a ruling.
- Full offline card-preview pack, including indexed face selection and a clean
  no-art fallback.
- Deterministic answers when no local model is installed.
- Optional bounded local-model integration with cancellation, timeout, output
  validation, and deterministic fallback.
- Privacy-safe diagnostics and aggregate answer feedback; no question or answer
  text is retained in the exported receipt.
- Android asset copying and verification for the knowledge and art databases,
  including recovery for damaged or unavailable packs.
- Full-screen startup gate. It prevents interaction while first-launch data is
  being prepared and unlocks only after startup succeeds. This intentionally
  uses an indeterminate activity display, per the decision to ship a clear load
  screen first rather than a percentage meter.
- Core and full-art ARM64 debug APKs in a private GitHub draft release. Source,
  tests, scripts, configuration templates, and build receipts are on
  `codex/omnath-android-transfer`; generated data, APKs, models, credentials,
  keystores, SDK paths, and caches are excluded from Git.

## First session on the next PC

1. Follow `TRANSFER.md` to clone the private repository, switch to
   `codex/omnath-android-transfer`, and install the prerequisites.
2. Download the banked `omnath-full-art-arm64-debug.apk` from the private draft
   release. Verify its byte count and SHA-256 before installing it.
3. Connect the Pixel 10 XL by USB-C, authorize USB debugging, and confirm that
   ADB lists it as `device`.
4. Install the full-art APK as a fresh app once so the first-launch path is
   exercised. Do not clear app data in later checks unless that destructive
   reset is intentional.
5. Confirm the startup gate covers the app, explains the first-launch delay,
   blocks all prompts/composer input, and eventually reaches **Offline and
   ready** without a freeze.
6. In airplane mode, run this smoke set:
   - `What does Omnath, Locus of Creation do?` — Oracle text, official rulings,
     and the card image must appear.
   - `Show CR 702.7` — the section and lettered subrules must appear.
   - `Explain first strike` — grounded local rule evidence must appear.
   - `Triggered abilities` — related evidence must remain labeled as not a
     ruling.
   - Repeat the Omnath card query — the app must stay responsive and reuse the
     prepared local data.
7. Copy diagnostics after ready and after the smoke set. Confirm runtime and
   knowledge are ready, art is ready, network is never required, and an absent
   model is reported as deterministic fallback rather than failure.
8. Run the repository verification and device script, then bank the Pixel
   receipt and screenshots before changing features.

## Next implementation work

Do these in order after the fresh-install smoke test passes:

1. Exercise double-faced and multi-face card art on the Pixel, plus the missing
   art fallback, so face selection has a physical-device witness.
2. Test cancellation and repeated questions under slow startup/model conditions
   to ensure no stale response or hard freeze can return.
3. Install and benchmark one catalog-pinned local model. Compare answer latency,
   memory pressure, cancellation, thermal behavior, and deterministic fallback.
   The app must remain useful when the model is missing or rejected.
4. Reconcile the phone integration with Cindy's latest card/played-deck work
   only through the published interface after that upstream work lands. The
   standalone assistant is not blocked on unshipped deck controls.
5. Add limited on-device player preferences and useful memory with an obvious
   local reset. Do not retain private conversation text by default.
6. Build a signed private alpha APK and an airplane-mode regression suite.
   Signing keys and passwords stay off Git and out of the draft release assets.
7. Run a three-to-five-person beginner pilot, record a device compatibility
   matrix, and promote builds based on grounded correctness and usefulness.
8. Version the knowledge, art, and optional model packs so every diagnostic and
   test report identifies the exact local payloads used.

## Banked polish ideas, not current blockers

- A real byte/percentage startup meter can be added later if the first-launch
  wait still feels unclear. Native copy progress already exists, but the WebView
  must consume it through an explicitly allowed, fail-safe status surface; loss
  of progress reporting may never block startup again.
- Keep the current full-screen gate even if percentage reporting is added. It is
  the protection against users querying half-initialized data.
- Let the optional model make grounded answers feel more conversational and
  help interpret bounded card/rule intent, while keeping quoted evidence and
  trust labels immutable.
- Preserve the compact phone layout and existing EXE-derived visual language as
  more features arrive; do not import multi-agent desktop chrome.

## Definition of friend-alpha ready

- The smoke set passes with airplane mode enabled on the declared Pixel.
- Fresh launch cannot be interacted with before local data is ready.
- Knowledge failure, missing art, missing model, model timeout, and cancellation
  all have useful non-freezing recovery paths.
- Every displayed Oracle fact and CR citation traces to the packaged local pack.
- The APK is privately signed and distributed, and diagnostics identify its app
  commit and payload versions without exposing conversation content.
- The repository and draft release remain private.
