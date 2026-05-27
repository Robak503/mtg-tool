# Packaging review — desktop launcher + UI updates + phone

**Question raised:** can we ship this as an `.exe` so it's one-click to launch, easy to update the UI/UX over time, and possibly run as a standalone app on a phone?

**Short answer:** yes to the first two, no to the third (and the "no" is structural, not laziness — explained in §4). Recommendation summary at the end.

---

## 1. Status quo: what launching looks like today

To use the tool right now you:

1. Open a terminal
2. `cd C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app`
3. `npm run dev`
4. Wait ~5 seconds for Next.js + slim oracle index to warm
5. Open browser to http://localhost:3000
6. Make sure `ollama serve` is running (the new health banner catches this, but you still have to start Ollama yourself)

That's six steps and three windows (terminal, browser, Ollama). The pain isn't unbearable, but it absolutely is a "ugh, do I want to bother" tax that you pay every time. An icon on the desktop you double-click would be a real quality-of-life upgrade.

What lives on disk today, sized:

| Thing | Size | Comment |
|---|---|---|
| App source + node_modules | ~600MB | Most of that is node_modules — not bundled into a release |
| `data/scryfall-bulk/oracle_cards.json` | 165MB | Source data |
| `data/scryfall-bulk/oracle-index.json` | 29MB | Pre-built slim index (PR1 of this session) |
| `data/scryfall-bulk/all_cards.json` | 2.5GB | Used? Probably not. Could be dropped from any release. |
| `data/scryfall-bulk/default_cards.json` | 539MB | Used? Maybe by power ranker. Verify. |
| `data/scryfall-bulk/rulings.json` | 25MB | Used by Arbiter |
| Ollama models on disk | ~25GB | qwen2.5:32b alone is ~20GB |
| `data/decks.local.json` | 200KB | The user's actual decks |
| `data/chats.local.json` | 50KB | The user's chats |

The size that matters for "what goes in the .exe" is small: app code + the slim oracle index + rulings + decks/chats. Realistically under 50MB if we exclude the 2.5GB raw bulk and ship only the slim index. Everything else is downloaded or installed separately.

---

## 2. Desktop .exe — the options

Four approaches, in increasing order of "real desktop app":

### A. `.bat`/`.ps1` shortcut

What it is: a one-line script that does `npm run dev` and opens the browser. Pin it to your taskbar, double-click, app opens.

```powershell
# launch-mtg.ps1
Set-Location "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
Start-Process "http://localhost:3000"
npm run dev
```

| Pros | Cons |
|---|---|
| ✅ 5 minutes to set up | ❌ Still uses your default browser tab |
| ✅ No new dependencies | ❌ Console window stays open |
| ✅ Works today | ❌ No auto-update |
| ✅ Updates = pull latest from git | ❌ Doesn't feel like an app |

**Verdict:** good as a starter, terrible as the long-term answer. Worth doing for tonight, but it's not the destination.

### B. Tauri (Rust shell + system WebView)

What it is: a Rust binary wraps Microsoft Edge's WebView2 (Windows) or WKWebView (macOS). The Next.js app runs inside that window. Bundle is ~5-15MB. Built-in updater.

| Pros | Cons |
|---|---|
| ✅ Tiny bundle (~10MB) | ❌ New tech to learn (Rust toolchain) |
| ✅ Built-in auto-updater | ❌ Webview rendering can have quirks |
| ✅ Single executable | ❌ Edge WebView2 required (preinstalled on Win 11) |
| ✅ Native menus, system tray, OS notifications | ❌ Smaller ecosystem than Electron |
| ✅ Same codebase ships to macOS later (Mac mini) | ❌ Mobile support exists but is still 2.0-fresh |
| ✅ Security-by-default architecture |  |

How it works architecturally: the Tauri binary spawns the Next.js Node server on a free port (we'd need to switch to Next.js's standalone output mode), waits for it to be ready, then opens the WebView pointed at that port. From the user's perspective: double-click, window opens with the app.

### C. Electron

What it is: Chromium + Node.js bundled together. The Next.js app runs inside Chromium. Bundle is ~150-200MB.

| Pros | Cons |
|---|---|
| ✅ Mature, huge ecosystem | ❌ Big bundle (~180MB before app code) |
| ✅ Identical rendering across machines | ❌ RAM-hungry (300-500MB baseline) |
| ✅ electron-updater is battle-tested | ❌ Yet-another-Chromium consuming memory |
| ✅ Lots of tutorials, more known patterns | ❌ Slower cold start than Tauri |
| ✅ Same codebase ships to macOS later |  |

Your RTX 5080 box has 32GB RAM, so the bundle/RAM cost doesn't matter for personal use. The bigger question is: do you want the smaller, leaner option or the easier one?

### D. Just `next build && next start` packaged via `pkg`

What it is: compile Node.js + the app into a single executable. Still opens the browser to localhost.

This solves "no Node install needed" but doesn't solve "feels like an app" — you still see a browser tab. **Not recommended** because Tauri/Electron solve this better.

### Comparison: which to pick

| Dimension | .bat shortcut | Tauri | Electron |
|---|---:|---:|---:|
| Setup time | 5 min | 1-2 days | 1 day |
| Bundle size | 0 | ~15MB | ~180MB |
| Cold start | ~5s | ~1s | ~2s |
| Feels like an app | No | Yes | Yes |
| Auto-update | No | Built-in | Built-in (battle-tested) |
| Cross-platform later | No | macOS ready | macOS ready |
| New tech to learn | None | Rust toolchain | Just npm |
| Mobile path | No | Tauri 2.0 (immature) | None |

**My recommendation: Tauri.** Smaller, faster, the macOS handoff later is identical, the security model is better. The Rust toolchain is a one-time install. The mobile bit is moot (see §4) but Tauri 2.0's mobile track is at least *plausible* for a future revisit.

If you want zero-risk and "boring works" — Electron. There's no wrong answer between B and C; A is a stepping stone.

---

## 3. UI/UX updates "for the long haul"

This is the question I think matters most for your day-to-day. You're using Claude Code to ship features — how does the running tool pick them up?

### Current state

When I ship a commit, you have to:
1. Stop the dev server (Ctrl+C)
2. `git pull` (when you have a remote — P0!)
3. Sometimes `npm install` if package.json changed
4. `npm run dev` again

That's friction. And if I push a UI fix at 11pm, you don't get it until you happen to restart.

### What an .exe gets you

Both Tauri and Electron have updaters that:

1. On launch, check a URL (typically GitHub Releases) for a newer version
2. Download the delta in the background
3. Show "restart to update" or auto-restart on quit
4. Apply the update — next launch is the new version

The flow becomes:

```
You: types "/ship" to me
Me:  builds, tags v1.32.0, pushes to GitHub
GitHub: builds the .exe via GitHub Actions on push of the tag, attaches it to the release
You:  next time you open the app, banner says "Update v1.32.0 available — restart now?"
You:  click yes
You:  app restarts with the new UI
```

Zero terminal, zero git commands.

### The dependency on the remote

**This entire update story requires a GitHub remote.** Without one, there's no URL to check for releases, no automation to build the .exe on tag push, no way to ship updates. The P0 TODO for setting up GitHub becomes a hard blocker for the auto-update story.

Order of operations matters:
1. GitHub remote first
2. GitHub Actions workflow that builds the .exe on every tagged release
3. Tauri/Electron updater configured to check that release feed
4. Then the .exe shell

### Updating data, not just code

The other "update" you'll want: refreshing the Scryfall card data when new sets release. That happens monthly-ish. Right now you run `npm run sync:scryfall-bulk && npm run build:oracle-index`. In the .exe world, this could be:

- A "Refresh card data" button in the app that runs the same scripts
- Or automatic: on launch, if Scryfall's `oracle_cards.json` timestamp is more than 30 days old, kick off a background sync

This is independent of code updates — the data is too big to ship in releases (165MB), so it lives in `%APPDATA%/MTGTool/data/` and refreshes itself.

---

## 4. The phone question (be ready for this answer)

You asked if an .exe would help make this a standalone phone app. Honest answer: **no, and these are structurally different problems**. Let me explain why so you can make an informed call.

### Why .exe doesn't translate to phone

`.exe` is a Windows executable format. Phones don't run it. iOS uses .ipa, Android uses .apk. Same idea, three different worlds.

If you're picturing one binary that runs on Windows, macOS, iOS, and Android: that's not a real thing. You'd ship three separate apps (or four if Android tablets count separately) all built from a shared codebase.

### The bigger problem: the model

This is the part most people don't think through up front. The tool's core value is local-first inference with Ollama. Let's check what that needs:

| Resource | Desktop (you today) | Typical phone |
|---|---|---|
| RAM | 32GB | 8-12GB |
| Free RAM for the model | 25GB+ | 4-6GB after the OS takes its share |
| GPU VRAM | 16GB RTX 5080 | 0 (or shared with system memory) |
| Storage | 2TB SSD | 256GB-1TB |
| Ollama support | First-class | iOS: none. Android: Termux hack only. |

The model sizes you're running:
- `qwen2.5:32b` (~20GB) — completely impossible on phone
- `qwen2.5:14b` (~9GB) — impossible
- `qwen2.5:7b` (~5GB) — would crush a 12GB phone, would brick an 8GB phone

Even if you got a phone-sized 3B model running, the quality drops noticeably for the kind of deck analysis Karn does. And iOS doesn't allow apps to ship LLMs of that size anyway (App Store rules around large model files have softened recently but the experience is still rough).

### So what are the actual phone options?

Three realistic paths, in honesty order:

#### Path A — PWA + Tailscale "view-only on the go"

What it is: add a web manifest + service worker to the Next.js app. Your phone can "install" the URL like an app icon. Use Tailscale to reach your desktop's localhost:3000 from anywhere.

Use it for:
- Browsing your saved decks while shopping for cards
- Reading past Jace/Karn/Tibalt chats during a game night
- Checking Garfield history trends
- Sending a new feedback note (it captures locally on the desktop)

Don't use it for:
- Live chat — chat requires Ollama, which requires the desktop to be on

| Pros | Cons |
|---|---|
| ✅ Cheapest path (~1 day work) | ❌ Requires desktop running |
| ✅ No App Store dance | ❌ Tailscale setup (~10 min) |
| ✅ Doesn't break local-first directive | ❌ "App" feels weird if desktop is off |
| ✅ Read-mostly use case is real |  |

#### Path B — Capacitor wrapper around the existing Next.js app

What it is: tooling that wraps the React app into an actual iOS/Android binary. WebView under the hood. Same content as the desktop, but it's now installable through the App Store / Play Store.

Same Ollama-connectivity problem as PWA. Marginal UX upgrade over PWA. App Store review process adds friction. Personal use doesn't need it.

**Probably skip.** PWA gives you 90% of the value at 10% of the cost.

#### Path C — Cloud-Ollama hybrid (breaks the prime directive)

What it is: phone uses the Anthropic API; desktop uses Ollama. The two halves of the same app store data to the same place (via the remote / sync layer that doesn't exist yet).

This is the only path to a phone app that *works without the desktop on*. But it breaks the local-first mandate in your CLAUDE.md. Some thoughts:

- Anthropic API is fast, capable, costs money per chat
- Your privacy story changes — Anthropic sees the queries
- The "agents are local-first" framing becomes a compromise: "they're local-first on the box that has the model"

If you genuinely want phone chat to work, this is the only way. If you don't *need* phone chat, skip this.

#### Path D (theoretical) — On-device small model

Apple's on-device ML or Google's Gemini Nano. Possible in theory, brutal in practice. Months of work, model quality is meaningfully worse than even qwen2.5:7b, has to fit in a few GB. **Not recommended.**

### My honest call on the phone question

You aren't going to enjoy a phone version of this tool. The desktop is where it shines because that's where the model lives. The phone use cases are real but secondary (reference, viewing, light notes). Don't let the phone goal warp the desktop architecture — they're different products.

If phone matters: **PWA + Tailscale is the right call.** Cheap, doesn't break anything, lets you read on the go.

If phone is "maybe someday": **defer it entirely.** Build the desktop .exe properly. Re-evaluate in 6 months.

---

## 5. Recommendation

Given everything above, here's the order I'd ship:

| # | Move | Effort | Unlocks |
|---|---|---|---|
| 1 | **Set up GitHub remote** (existing P0) | 10 min | Everything below |
| 2 | **GitHub Actions: release workflow** that runs on `v*` tags, builds the desktop binary, attaches it to the release | half day | Automated distribution |
| 3 | **Tauri shell** wrapping the Next.js app (or Electron if you'd rather take the boring path) | 1-2 days | One-click launch + auto-update |
| 4 | **First-launch experience**: detect Ollama, walk through pulling missing models, run the Scryfall sync | half day | Onboarding without a terminal |
| 5 | **PWA manifest + Tailscale guidance doc** | half day | Phone read-only access |
| 6 | **Re-evaluate** based on actual usage | 0 | — |

What I'd explicitly **not** do:

- ❌ Build a Capacitor mobile app. PWA covers the same ground for ~5% of the effort.
- ❌ Build a cloud-API phone version. It breaks the local-first directive without solving a problem you've actually expressed.
- ❌ Bundle the 2.5GB `all_cards.json` into anything. Verify nothing reads it; if so, drop it from releases.
- ❌ Try to bundle Ollama. It's a separate install, and the health banner from this session already gates the missing-Ollama case gracefully.

---

## 6. What I'd do tonight if you said "start"

Two paths depending on energy:

**The fast path (15 min):** I can write `launch-mtg.ps1` + an `.lnk` shortcut you put on your desktop. Double-click → terminal opens, Next.js boots, browser opens to localhost. Not pretty, not auto-updating, but step 6 → step 1 with zero new technology. Good for tonight; revisit when you have time for the proper Tauri build.

**The right path (3-4 hours, mostly mine):** Bootstrap Tauri inside the repo. Add a `tauri.conf.json`, a `src-tauri/` directory, wire it to consume the Next.js standalone build. Verify it boots. Set aside auto-update for after the GitHub remote exists.

If you want the right path tonight, I'll need a yes — Tauri's Rust toolchain install takes ~10 minutes by itself.

---

## 7. The "long haul" framing

You said "easy ability to update UI and UX for the long haul." That's the part I want to make sure lands: **the binary alone doesn't get you that.** The binary + auto-updater + release pipeline + remote is what gets you that.

The four pieces, in dependency order:

1. **GitHub remote** — where releases live
2. **GitHub Actions release pipeline** — automation that turns a `git tag v1.x.y` into a downloadable .exe
3. **Auto-updater inside the app** — Tauri's built-in or Electron's
4. **Desktop binary** — the user-facing artifact

Skip any one and the chain breaks. Build them in order. After (1) and (2) are real, (3) and (4) are mechanical.

Once that's wired, your update flow becomes: I commit + tag, GitHub builds, your app picks up the update on next launch, you click yes. No terminal, no git pull. That's the long-haul UI/UX answer.
