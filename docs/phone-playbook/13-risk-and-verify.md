# 13 — RISK & VERIFY-AT-BUILD REGISTER

> **OMNATH IN POCKET · execution playbook · doc 13 of 17**
> Two registers. **V# = verify-at-build**: facts this playbook could
> not lock in mid-2026 (knowledge cutoff ~Jan 2026; build is fall
> 2026+) — each with what to confirm, why it's uncertain, and the
> fallback. **H# = hazards**: known failure modes with mitigation +
> detection. V/H numbers are cited from the other docs — keep them
> stable.
>
> **The rule (from `reference_knowledge_staleness_boundary`): never
> trust training memory on a V# item. Read the current docs / probe the
> real device FIRST, then build.**

---

## Register V — VERIFY AT BUILD (fall 2026)

| # | Verify | Why uncertain | How to verify | Fallback if bad |
|---|---|---|---|---|
| **V1** | Tauri 2 Android target: current maturity, project setup, webview config, release process | Tauri mobile was young at cutoff; a year of releases will have landed | Read current Tauri docs end-to-end; budget a 1-day spike (M1.1) building a hello-APK before committing the phase plan | If Tauri-Android is unshippable: re-evaluate shell (Capacitor-class wrapper around the same static export + services — the ARCHITECTURE survives any webview shell; only the Rust rim changes). Escalate to Colton before switching |
| **V2** | App update path on Android (desktop updater plugin ≠ Android) | Platform-specific updater story in flux at cutoff | Check Tauri mobile updater status; else design in-app "new APK available → download → invoke installer" against current Android install-source APIs | Manual re-sideload with an in-app "update available" pointer — acceptable for a 1–2 device fleet |
| **V3** | Android background execution + periodic work limits (sync ticks, opportunistic fetch) | Doze/background policies shift per Android version | Test real background behavior on the Pixel 10 with the actual app | Architecture already assumes foreground-only sync is correct (`02 §5.1`); background = bonus |
| **V4** | On-device small-model runtime (llama.cpp-family / MLC / AICore / vendor NPU routes) | The fastest-moving landscape in the whole plan | At M3 start: survey current options, run 2–3 candidates on the Pixel (real tokens/s + RAM + battery) | Ship T0-only offline (retrieval floor — genuinely useful); T2 is an enhancement, never load-bearing (`11 §1`) |
| **V5** | Best ~3–4B model for narration duty (quality/size/licence) | Model releases monthly | Same M3 spike: candidate bake-off on real rules-narration prompts, CREED-constrained | Same as V4 — T0-only |
| **V6** | Android-webview streaming: SSE / fetch-streaming behavior (hub + Anthropic direct) | Webview streaming quirks are version-specific | M3.2 spike on the real device, both sources | Chunked-poll transport (request-id + incremental GET) — wire-compatible swap (`04 §1.4`) |
| **V7** | Ollama embedding model choice + Weaviate bring-your-own-vectors wiring | Embed-model quality moves; Weaviate client APIs drift | At M2.8: pick current best local embed model; confirm ingestion path on the real stack | Any competent local embed model suffices at this corpus size; worst case BM25-only search hubside until swapped |
| **V8** | Card-scanner feasibility: webview/plugin camera access, on-device vision runtime, match-index approach + size | Vision-on-mobile churns fast; Tauri camera plugin status unknown at this distance | M4.7 probe spike (go/no-go), full verify at the scanner's build phase (`09 §2`) | OCR-name-only scanner (still valuable); or defer feature — it's additive, nothing depends on it |
| **V9** | Notification delivery in a closed system: Tauri notification plugin + local pickup vs self-hosted push relay (ntfy-class) over tailnet vs FCM | Android notification + background APIs shift; self-hosted-push landscape shifts | M4.2: prototype the candidates on the real device; pick the one that survives Doze | Preference order LOCKED (D-P13, Colton 2026-07-04): direct/self-hosted first → **FCM pre-approved as fallback (content-free ping only)** → in-app badge inbox ships regardless (`07 §1.5`) |
| **V10** | APK signing + sideload flow (+ install-source permissions on current Android) | Mechanical but version-specific | M1: follow current docs; document the exact flow in the M1 runbook | None needed — this always has *some* path |
| **V11** | Tailscale on Android: battery cost, always-on-VPN slot interaction, MagicDNS from the app, TLS story (`tailscale serve` certs) inside the tailnet | Client behavior + features move | M2.1: measure on the real phone over days of dogfood | Sync is opportunistic by design; worst case = open-app-to-sync. TLS: WireGuard transport encryption already covers the wire; token covers authz |
| **V12** | Mac serving stack: Ollama vs MLX-family for 70B+ chat + embeddings + Arbiter; quant, context length, keep-alive, tok/s on the actual box | Apple-Silicon serving is evolving fast; the box itself isn't chosen yet (C3) | M3.1: bench both stacks on the real Mac with the real models; acceptance = conversational streaming for one user | Ollama is the known-good heritage default; a smaller quant / 32B-class model is the quality fallback if 70B tok/s disappoints |
| **V13** | Webview asset serving for cached art (asset protocol / convertFileSrc / file-URI policy) | Webview file-access policies are version-specific | M1.11 on-device test of the candidates | Blob URLs from adapter reads — always works; cap the in-memory cache (`01 §7.3`) |
| **V14** | Plane cards (Planechase) present + complete in the bundled data tiers | The slim-index builders may filter non-traditional layouts | M0.7: check the tier builders' layout filters; M1: verify a known plane renders | Adjust builders to include planar layout; they're our scripts — this is hours, not risk, IF caught at M0 |
| **V15** | Wake-lock (+ haptics) API from Tauri-Android | Plugin surface unknown at this distance | M1.9: test on device | Wake-lock: instruct-user + max screen timeout (annoying, survivable). Haptics: skip silently |
| **V16** | Atomic-write semantics of the Tauri fs plugin (temp+rename equivalent) | Plugin API detail | M1.3: write the adapter contract test for torn-write behavior; run on device | Implement write-temp→rename manually via plugin primitives; if rename isn't atomic on the target fs, add journal'd writes (write+verify+swap) |
| **V17** | Next.js static export behavior on the fall-2026 Next version (the repo will have upgraded) | Export semantics have churned before | M1.2 against the then-current Next; keep the export surface minimal (no SSR/server-components — already true per recon) | Pin the working Next version for the phone build lane; upgrade deliberately |
| **V18** | Pixel 10 actuals (RAM headroom, Tensor G5 NPU usability, storage) | Device launched Aug 2025 (pre-cutoff) but NPU toolchains post-date | Confirm before M3 model sizing (V4 depends on it) | Model-size down; nothing else in the plan cares |
| **V19** | LEYLINE glass/backdrop-blur performance in the Android webview | Webview compositor perf is device+version specific | M1.5: frame-time check on real screens | Flat translucent fallback (same tokens, no blur — `10 §1`) |
| **V20** | Weaviate arm64 image + API surface at build time | Version drift over ~6 months | M2.1: stand it up, pin the image version, wrap access behind the hub's retrieval endpoint (isolation by design — `02 §7.2`) | The hub endpoint seam means a Weaviate swap (or even an alternative vector store) never touches clients |

---

## Register H — HAZARDS (known failure modes)

| # | Hazard | Mitigation (designed-in) | Detection |
|---|---|---|---|
| **H1** | Silent data clobber via sync (the LWW nightmare: an edit vanishes without a prompt) | Fork detection on `baseRev` (`02 §5.2`); conservative hub (conflicted records freeze until resolved); tombstones (D-P5) | The fork drill at M2 (`03 §6.4`); journal audit — every lost-edit report is reconstructable from journals; dogfood rule: any unexplained data change = stop-the-line investigation |
| **H2** | Battery death at the con (the tool dies at 3pm on the day it exists for) | True-black OLED theme; wake-lock only during life sessions; Tailscale/radio behavior measured (V11); no background polling loops | M4.6 battery pass + the con-day dry run measures real drain; in-app battery-aware nudge if a session starts below 20% |
| **H3** | Thermal throttle during long life-tracker sessions (screen-on hours) | Life screen is static render (no animation loops when idle); frame work only on interaction | Endurance dogfood (`06 §7.5`) |
| **H4** | Clock skew between devices corrupting merge order | Lamport revs are primary ordering; wall clock is display/tiebreak-of-candidates only (`02 §3`) | Journal sanity check: ts-vs-rev inversions logged as warnings |
| **H5** | Journal growth unbounded | Client prune after hub ack; hub compaction after both cursors pass; tombstone reaping (`02 §4`) | Journal size in the sync sheet's debug view; compaction metrics in hub logs |
| **H6** | Replica corruption (bad flash write, interrupted migration) | Atomic writes (V16); payload hashes in ops; canonical hub copy | Hash mismatch on sync → quarantine + re-seed flow (`02 §5.4`, snapshot pull `02 §5.3`) |
| **H7** | Weaviate schema migration pain on upgrade | Weaviate is derived-only (D-P3): drop + `weaviate-reindex` IS the migration path | The reindex command is an M2.8 acceptance item — it must always work |
| **H8** | Hub disk loss = canonical loss | Nightly export job (M2.2) + Time Machine; clients are full replicas anyway (2 extra copies by architecture) | Backup job success in hub health; quarterly restore drill (calendar it) |
| **H9** | Chat append-merge assumption breaks (if turn-editing is ever added) | The carve-out is documented with a guard note (`02 §6.5`); adding turn-edit REQUIRES revisiting merge policy | Grep-level code-review tripwire: PRs touching chat mutation get the 02 §6.5 checklist |
| **H10** | Mac memory contention: 70B serving vs future Academy/batch workloads | Policy: serving wins, batch yields (`11 §5`); keep-alive tuned; Academy stays desktop/cloud until proven coexistent | Hub health reports model-role latency; a slow-first-token regression flags contention |
| **H11** | Tailscale auth/key expiry mid-trip (hub unreachable for a dumb reason) | Offline-first means nothing breaks; enable no-expiry/appropriate key policy for the closed mesh at M2.1 | Chip shows honest offline; hub-status line names auth failure distinctly from network failure (`02 §5.4`) |
| **H12** | Phone storage pressure (0.5GB data + art packs + replica on a shared device) | Tiered art (opt-in full); DownloadsManager shows footprint + purge controls per tier (M1.4) | Storage line in settings; graceful behavior at write-failure (H6 machinery) |
| **H13** | CREED regression via prompt/model drift (an agent starts freestyling citations) | Citation audit hook (`11 §4.3`); T2 template constraints; retrieval-only floors | The planted-fake-citation drill (`11 §8.5`) runs at every model/prompt change, not just once |
| **H14** | Satire (Commander's Herald) leaking into news-styled surfaces untagged | Tag at ingestion AND render (`07 §1.4/§3`) | Digest render test includes a satire item every time |
| **H15** | Giftable build leaks personal data/Omnath (the privacy failure) | Build-time flavor split, not runtime flags (D12); personal hooks live behind build exclusion | M5.1 purity sweep: string-scan the APK + UI walk; repeat on every giftable release |
| **H16** | The two-mount drift (desktop routes vs phone services diverge over time) | One implementation, thin wrappers (M0.5); lint rule against fs-in-domain (M0.4); shared suite runs both mounts | Any behavior diff between desktop and phone on the same data = port-bug triage first (`05 §6.1` parity principle) |

---

## How to work this register (future-Opus)

1. **At each phase boot** (`16-launch-prompts.md`), the prompt names the
   V# items that phase owns. Verify them FIRST — they're spikes, not
   afterthoughts. Write the result INTO this file (`✅ verified <date>:
   <finding>` / `❌ fallback engaged: <which>`).
2. A V# that verifies BAD engages its fallback — that's a normal
   outcome, not a failure. A V# with no viable fallback left = stop,
   `/investigate`, escalate to Colton (`CLAUDE.md §7.2`).
3. H# items are standing: their detections belong in dogfood checklists
   (`15 §dogfood`) and the con-day script. A hazard that fires gets a
   dated incident note here.
4. New uncertainty discovered mid-build → append a V#/H# row, don't
   carry it in your head. This file is the risk memory.

---

*Cross-refs: every ⚠ mark in docs 01–12 resolves to a V# here · gates
`12-phases.md` · drills `15-test-strategy.md`.*
