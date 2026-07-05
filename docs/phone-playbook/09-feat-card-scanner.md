# 09 — FEATURE: CARD SCANNER (FUTURE SPEC)

> **OMNATH IN POCKET · execution playbook · doc 09 of 17**
> Camera → identify the physical card → act on it. **Design-now,
> build-later (D11).** This doc is the full design; nearly every
> implementation choice is ⚠ VERIFY AT BUILD — the recognition-runtime
> landscape will have moved by the build phase. Build slot: M4+ /
> post-M5 (`12 §ordering`).

---

## 1. Behavior (the designed UX — durable)

### 1.1 Scan loop
- Open scanner (from Vault or a Decks edit session) → live camera view
  with a card-shaped guide frame → hold over a card → **auto-capture on
  stable frame** (no shutter button hunting) → candidate match sheet
  slides up: card name, set/printing guess, confidence, art thumb.
- Confirm / correct (search-fallback field pre-filled with best OCR/name
  guess) / rescan. Correction is one tap into the standard card search —
  the scanner must never be a dead end.
- **Batch mode:** keep scanning; confirmed cards stack into a tray
  (booth box-diving, post-game pickup sorting). Tray reviewed → applied
  in bulk.

### 1.2 Actions per identified card (the hooks — these exist today)
| Action | Lands in | Existing seam |
|---|---|---|
| Add to collection | collection replica | `collectionStorage` SVC (`07 §1.1`) |
| Price / grail check | price snapshot + watchlist | `07 §1.2` con-floor flow |
| Add to a deck | deck record | `03 §1.3` edit flow |
| Add to watchlist | watchlist | `07 §1.2` |
| Just inspect | card inspector | `08 §1.2` |

Default action is context-sensitive: opened from Vault → collection-add;
from a deck edit → deck-add; from nowhere → inspect + action row.

### 1.3 Scan history
Device-local log (thumb, resolved card, action taken, timestamp) —
review/undo recent scans; not synced (derived-ish, low value cross-device).

## 2. Recognition pipeline (design intent — every stage ⚠ V8)

```
camera frame → card detection/crop (edge/quad detect)
            → normalize (perspective, glare handling — sleeves + foils
              are the hard cases)
            → IDENTIFY:
               candidate A: image-embedding / perceptual-hash match
                 against a bundled index built from Scryfall imagery
                 (fully offline — the target posture)
               candidate B: title OCR → name match against oracle index
                 (cheap, robust for sorted-upright cards, weaker on
                 foils/alt-frames)
               (likely: B as fast path + A as confirm/printing-resolver)
            → printing disambiguation (set symbol region / art match;
              fall back to "name matched — pick printing" sheet)
```

- **Offline-first applies here too:** the target is on-device
  recognition against a bundled match index (Scryfall imagery is
  available to build one; datasets exist). An online-API identify step
  is contrary to the mandate — if on-device proves infeasible at build
  time, the fallback is **OCR-name-only offline** (still very useful)
  rather than a cloud recognizer.
- **⚠ VERIFY AT BUILD (V8):** on-device vision runtime + model/hash
  approach + camera API access from a Tauri-Android webview (native
  plugin vs web `getUserMedia` — capability + performance unknown at
  this distance) + match-index size/build pipeline. Study current
  Delver Lens / ManaBox / TCGplayer scanner UX at build time for
  interaction patterns (the UX above is designed from their stable
  patterns as of 2026).

## 3. States

| State | Rendering |
|---|---|
| **Empty** | First-open: one-screen how-to (frame the card, hold steady) + camera permission ask (graceful denial → search-entry mode) |
| **Loading** | Recognition inference: subtle progress on the guide frame (target: sub-second per card; if it's multi-second at build, batch UX absorbs it) |
| **Error** | No match: "couldn't identify" + OCR-guess search fallback — never a silent shrug. Camera unavailable: search-entry mode |
| **Offline** | **Identical** (on-device target). If the build landed OCR-only: identical but printing disambiguation is manual |

## 4. Edge cases (collector-grade reality — the spec bar)

- **Foils/etched/glare** — the classic recognizer killer: normalize
  stage matters; accept lower confidence → confirm sheet rather than
  misfile.
- **Sleeved cards, curved cards, playmat backgrounds** — detection must
  cope with matte + perspective; test set includes sleeved.
- **Alt-art / extended / borderless / secret-lair printings** — name
  match is easy, printing match is the collector-grade requirement;
  when unsure, ASK (printing picker), never guess-file a printing
  (Vault data quality is provenance data — D-P style honesty).
- **Non-English cards**: OCR path fails gracefully → image path or
  manual search.
- **Tokens/proxies/playtest cards**: identify-as-what-it-is or
  no-match honestly; proxies must not pollute collection data
  silently (confirm sheet shows what will be filed).
- **Basic lands** (thousands of printings): name trivial, printing
  picker default rather than false precision.
- **Double-faced cards**: either face identifies the card.

## 5. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Match index (image/hash) | NEW build artifact from Scryfall imagery (CI job at build phase) | ✅ bundled/optional tier |
| Oracle/printing indexes | existing bundled tiers | ✅ |
| Camera | device (⚠ V8 access path) | ✅ |
| Actions | existing SVC hooks (§1.2) | ✅ |

## 6. Box-dependency

**STANDALONE (target).** No Mac in the loop. The match-index build is a
CI/data-pipeline job, not a hub service. (A hub-side "heavy recognizer"
tier is a fallback idea only if on-device fails AND OCR-only
disappoints — logged, not planned.)

## 7. Acceptance criteria (live, observable — for the build phase)

1. **Booth drill:** 20 mixed real cards (incl. ≥3 foils, ≥3 sleeved,
   ≥2 alt-frame) scanned in batch mode: ≥17 correct name-IDs
   first-pass, zero silent misfiles (every uncertain → confirm sheet),
   airplane mode.
2. **Speed:** batch of 10 sorted cards filed to collection in under
   ~90 seconds of handling.
3. **Printing honesty:** an alt-art card either resolves to the exact
   printing or explicitly asks — filed printing matches physical card
   in 100% of filed cases (spot-audit).
4. **Grail hit:** scanning a watchlisted card surfaces the grail badge
   + max price inline in the confirm sheet (the booth magic moment).
5. **Graceful floor:** camera permission denied → feature degrades to
   search-entry, no crash, no nag loop.

---

*Cross-refs: `07-feat-vault.md` (collection/watchlist hooks) ·
`03-feat-decks.md` (deck-add hook) · `13-risk-and-verify.md` V8 ·
`12-phases.md §M4+` (build slot).*
