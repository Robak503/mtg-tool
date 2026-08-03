# Releasing MTG Tool

End-to-end recipe for cutting a new `.exe` release that all running
copies of the app pick up via auto-update.

## TL;DR

```powershell
# Bump version + push tag
$next = "v0.2.0"
git tag $next -a -m "Release $next"
git push origin $next

# Watch the workflow
gh run watch --repo Robak503/mtg-tool
```

That's it. GitHub Actions builds on a Windows runner, signs with the
keys stored as repo secrets, publishes the `.exe` + `.sig` +
`latest.json` to a Release. Running `.exe`s see the new version on
their next "Check for updates" click — or within 24 hours via the
background check.

## What lives where

| Thing | Location | Notes |
|---|---|---|
| Private signing key | `~/.tauri/mtg-tool.key` | Generated once. Loss == can't ship updates. **Back it up.** |
| Key password | `~/.tauri/mtg-tool.password` | Same as above. |
| Public key | `app/src-tauri/tauri.conf.json` -> `plugins.updater.pubkey` | Burned into every `.exe`; can't change once shipped. |
| Workflow | `.github/workflows/release.yml` | Triggered on `v*` tag push. |
| Repo secret: key | `gh secret list --repo Robak503/mtg-tool` -> `TAURI_SIGNING_PRIVATE_KEY` | Set via `gh secret set`. |
| Repo secret: password | same -> `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | |
| Update endpoint | `https://github.com/Robak503/mtg-tool/releases/latest/download/latest.json` | The running app polls this. |

## Local signed build (testing the wrapper, not for shipping)

```powershell
npm run --prefix app tauri:build:release
```

Loads the key + password from `~/.tauri/` and produces the same
artifacts CI does — useful for sanity-checking a build before tagging.
Skipped for normal dev; `npm run tauri:build` gives an unsigned bundle
which is faster.

## Local unsigned build (default)

```powershell
npm run --prefix app tauri:build
```

Produces `mtg-tool.exe` + the NSIS installer but no `.sig`. Updates
won't work against this build (the verifier rejects unsigned blobs)
but everything else does — fine for iterating UI.

## Cutting an actual release

0. Check the bundled-Node pin is still CURRENT LTS (`NODE_VERSION` in
   `app/scripts/download-portable-node.cjs` vs https://nodejs.org/dist/index.json).
   A stale pin is a live user-facing hazard, not hygiene: Cloudflare fingerprints
   the TLS handshake, and the two-year-old pin broke every Moxfield import inside
   the packaged app (2026-08-02, fixed in v0.150.1). Bumping it is a one-line
   change; the script re-downloads and SHA-verifies automatically.
1. Make sure `master` is green and you're on it: `git switch master && git pull`
2. Bump the `version` field in `app/src-tauri/tauri.conf.json` (or
   leave it alone — the tag drives the release name; the embedded
   version only matters for `current.version` comparisons in the
   updater)
3. Tag and push:
   ```powershell
   git tag v0.2.0 -a -m "Release v0.2.0"
   git push origin v0.2.0
   ```
4. Wait for CI (~15 min for the LZMA on the 1.2 GB bundle)
5. Verify the release page lists the `.exe`, `.exe.sig`, and `latest.json`
6. Open MTG Tool, click "⟳ Updates" in the header, click "Check for updates"
7. The "Download & install" button appears; click it; app restarts on
   the new version

## Rotating signing keys

If the private key leaks or you need to rotate:

```powershell
# 1. Generate a new key
npx tauri signer generate -w $env:USERPROFILE\.tauri\mtg-tool.key -f --password (new password)

# 2. Update the secrets — use cmd /c with < redirect, NEVER a PowerShell pipe:
#    Get-Content | gh secret set injects a UTF-8 BOM into the secret (gotcha #12 /
#    CLAUDE.md §3.5) and CI signing then fails with a corrupted key.
cmd /c "gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Robak503/mtg-tool < %USERPROFILE%\.tauri\mtg-tool.key"
# The password secret must rotate WITH the key (a new key has a new password):
cmd /c "gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Robak503/mtg-tool < %USERPROFILE%\.tauri\mtg-tool.password"

# 3. Replace the pubkey in app/src-tauri/tauri.conf.json with the
#    contents of mtg-tool.key.pub

# 4. Commit + push the new pubkey, then tag a new release
```

**Important**: Every `.exe` built with the OLD pubkey will refuse to
auto-update past the rotation point — those users have to manually
install the new build once. So rotate sparingly.

## Rollback

GitHub release pages don't have a one-click "rollback" button. If a
bad version ships:

1. **Delete — or mark as draft/prerelease — the bad release** at
   https://github.com/Robak503/mtg-tool/releases. That alone re-points
   `releases/latest` back to the previous good release, whose
   `latest.json` is still intact.
2. **Do NOT delete `latest.json` (or the `.exe`/`.exe.sig`) from the
   good release** — `releases/latest/download/latest.json` reads that
   asset; removing it 404s the updater for every installed copy. Just
   verify the good release still has all three assets.
3. **Preferred: tag `v0.X.Y+1` with the fix immediately.** Auto-update
   is forward-only (no downgrade), so shipping the fix faster is almost
   always better than rolling back.

Auto-update is forward-only — there's no "downgrade" mechanism. The
right answer to a bad release is always "ship the fix faster," not
roll back.

## What CI is doing under the hood

`.github/workflows/release.yml` on push of `v*`:

1. Checkout · Rust stable · Node 22 · `npm ci` in `app/`
2. **Test gate** — the full vitest suite must pass before anything builds
3. Sync `tauri.conf.json`'s version from the tag
4. Restore the `refdata-` cache (restore-only — releases never save it)
5. Data syncs: Scryfall bulk → oracle index → printings index → price
   seed (best-effort) → rules index → EDHREC salt → Card Kingdom
   (best-effort) → **Spellbook bulk-first sync** (variants.json.gz —
   the full ~95k combo dataset in seconds, paged-crawl fallback;
   continue-on-error with a 12-minute bound)
6. `npm run tauri:build:release` with secrets injected — runs
   `scripts/build-signed-release.cjs` (tempfile `--config` flips
   `createUpdaterArtifacts`) under the **strict bundle guard**
   (`prepare-tauri-resources.cjs --strict` hard-fails on any missing
   REQUIRED data file, incl. the Spellbook combos/index/cards trio)
7. PowerShell step constructs `latest.json` (version, notes, pub_date,
   the signature blob) + a stable-name `MTG-Tool-Setup.exe` copy (the
   never-changing pod link `releases/latest/download/MTG-Tool-Setup.exe`)
8. `softprops/action-gh-release` publishes **five assets**:
   `MTG.Tool_x.y.z_x64-setup.exe` + `.sig`, `MTG-Tool-Setup.exe` +
   `.sig`, and `latest.json`

Total runtime: ~30-40 min (the Scryfall sync dominates when the cache
misses; the Spellbook step is seconds since the bulk switch).

## Known gap: Windows SmartScreen on first install

We sign the **updater artifact** (the `.sig` file) with our private
minisign key so Tauri can verify each update is from us. We DON'T sign
the .exe itself with an Authenticode certificate. That means when a
brand-new user runs `MTG.Tool_x.y.z_x64-setup.exe`:

```
Windows protected your PC
Microsoft Defender SmartScreen prevented an unrecognized app from
starting. Running this app might put your PC at risk.

App: MTG.Tool_0.1.0_x64-setup.exe
Publisher: Unknown publisher
                                          [ Don't run ]  [ More info ]
```

Click `More info` → `Run anyway`. After install, Windows won't bug
them again on that machine.

To eliminate this, you'd need a paid code signing certificate:

| Cert type | Cost/yr | What it does |
|---|---:|---|
| Standard Authenticode | $80-200 | Builds reputation slowly (~3000 installs); SmartScreen eases off |
| EV (Extended Validation) | $300-700 | Instant reputation, no SmartScreen warning at all, requires HSM/USB token |

For a personal tool shared with friends, the SmartScreen prompt once
per install is acceptable. Upgrade to a signed cert if/when
distribution gets serious.

## Known gap: Microsoft Store distribution

We could also distribute via the Microsoft Store, which would
eliminate SmartScreen and add auto-updates via the Store. Trade-off:
- Pro: $19 one-time developer fee, no per-cert annual cost, sandboxed updates
- Con: Store review process (~1-3 days), sandboxed file access rules
  may break Ollama spawning, manual approval for each release

Defer until distribution scales beyond personal use.
