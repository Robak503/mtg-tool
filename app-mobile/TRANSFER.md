# Omnath Android source transfer

This directory contains the reproducible source project for the private,
offline-only Omnath MTG Assistant APK. Generated databases, art downloads,
models, APKs, credentials, signing material, SDK paths, dependencies, and build
caches are deliberately excluded from Git.

## Included source

- Tauri/Rust Android host and checked-in Gradle wrapper/project
- WebView application source and LEYLINE phone styling
- local knowledge, art-index, model lifecycle, receipt, and device scripts
- JavaScript, Rust, Kotlin, security, portability, and pack tests
- app icons, Android resources, capability policy, CSP, model catalog, and lockfiles
- the tracked Comprehensive Rules source at
  `../knowledge/mtg-judge/data/cr/cr_current.json`
- the tracked Scryfall synchronization code under `../app/scripts`

## Destination prerequisites

Install these locally; do not copy their installation directories into Git:

1. Git and GitHub authentication for the private repository.
2. Node.js 22 or newer with npm.
3. Rust through rustup, including the `aarch64-linux-android` target.
4. Android Studio or the Android command-line tools with SDK Platform 36,
   Android build tools, platform-tools/ADB, and NDK `30.0.16138531`.
5. JDK 21. Android Studio's bundled `jbr` is supported.

For PowerShell setup, copy `android-env.example.ps1` to the ignored
`android-env.local.ps1`, edit only local paths, and dot-source it:

```powershell
Copy-Item android-env.example.ps1 android-env.local.ps1
. .\android-env.local.ps1
rustup target add aarch64-linux-android
```

Do not place `HF_TOKEN`, GitHub tokens, passwords, or signing passwords in that
file. Set an optional Hugging Face token only in the current shell when staging
a license-gated model.

## Restore build-time data

The APK is offline at runtime, but the build computer uses the network to
restore Scryfall data and optional card art. From the repository root:

```powershell
Set-Location app
npm ci
npm run sync:oracle

Set-Location ..\app-mobile
npm ci
npm run verify
npm run android:model:test
```

`sync:oracle` recreates these ignored build inputs:

- `app/data/scryfall.oracle.local.json`
- `app/data/scryfall.rulings.local.json`

The committed CR file plus those two snapshots are compiled into
`app-mobile/build/knowledge/omnath-knowledge.sqlite`. Build the core APK with:

```powershell
npm run android:build:debug
```

To restore all card previews and build the full-art APK:

```powershell
npm run android:build:art
```

That command downloads resumable Scryfall preview files, compiles them into one
indexed `omnath-art.sqlite`, and packages it without requiring any model. Build
outputs remain under ignored `app-mobile/build/` and
`app-mobile/src-tauri/gen/android/app/build/` directories.

The local model is optional. The deterministic card/rules path works without
one. If desired, stage a catalog-pinned model after satisfying its upstream
license:

```powershell
$env:HF_TOKEN = Read-Host "Hugging Face token"
npm run models:stage -- -Model base
Remove-Item Env:HF_TOKEN
```

Models are side-loaded to a connected device; they are never packaged into the
APK or committed.

## Deliberately omitted local files

GitHub blocks regular Git files larger than 100 MiB. The current reproducible
outputs below exceed that limit and are also generated artifacts:

| Local file | Bytes | Restore method |
| --- | ---: | --- |
| `build/knowledge/omnath-knowledge.sqlite` | 105,324,544 | `npm run knowledge:build` |
| `build/art/omnath-art.sqlite` | 580,046,848 | `npm run art:build` |
| base model named in `model-catalog.json` | 1,678,542,365 | `npm run models:stage -- -Model base` |
| enhanced model named in `model-catalog.json` | 3,113,545,589 | `npm run models:stage -- -Model enhanced` |
| `build/releases/app-arm64-debug.apk` | 244,966,521 | `npm run android:build:debug` |
| `build/releases/omnath-full-art-arm64-debug.apk` | 749,194,176 | `npm run android:build:art` |

The current ignored Oracle snapshot is 83,425,972 bytes and the rulings snapshot
is 27,644,723 bytes. Although each is below GitHub's hard per-file limit, both
are reproducible upstream data and stay out of repository history. The art image
cache totals 510,273,231 bytes across 36,592 files and is likewise regenerated.

Also omitted: `node_modules`, Rust `target`, Gradle `.gradle`/`build`, WebView
`dist`, generated JNI/assets, Android `local.properties`, environment files,
tokens, credentials, signing keystores, and machine-local configuration.

## Verification before sharing a commit

From the repository root, confirm the repository is private and inspect only
the intended changes:

```powershell
gh repo view Robak503/mtg-tool --json visibility,url
git status --short
git diff --check
```

The transfer branch must contain no tracked file over 100 MiB, no `.apk`,
`.litertlm`, keystore, local SDK properties, or environment file.
