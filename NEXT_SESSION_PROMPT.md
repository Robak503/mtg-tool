# Resume prompt — paste this into a fresh Claude Code session

Copy everything between the lines below into your next session's first message.

---

I'm Colton, vibe-coder owner of MTG Tool. Read these in order before doing anything else:

1. `CLAUDE.md` — your operating manual for this project
2. `SPRINT_HANDOFF.md` — current state of the Phase 1 sprint (TL;DR is at the top)
3. `TODOS.md` — deferred items, do NOT pick these up unless I ask

The Phase 1 sprint is code-complete across 7 commits (`git log --oneline 42bba63..HEAD`). All 13 tasks (T1-T13) shipped. `npm run build` passes clean. Only T12 — the manual smoke test against a live Ollama instance — remains.

## What I need from you, in order:

### Step 1: Verify the environment is ready
- Confirm Ollama is running: `curl http://localhost:11434/api/tags` (or `ollama list`)
- Confirm `qwen2.5:32b` is pulled (if not, tell me to run `ollama pull qwen2.5:32b`)
- Confirm `.next/` is fresh: kill any running node processes, delete `app/.next/`, start fresh `npm run dev` from `app/`
- Wait for the dev server to print "Ready"

### Step 2: Run the smoke test (T12 in SPRINT_HANDOFF.md)

There are **4 critical paths** and **3 Codex acceptance cases** plus **12 risk points** listed near the bottom of SPRINT_HANDOFF.md ("Known Risks / Smoke Test Notes"). Walk through them in order. After each one, tell me what you observed and whether it matched the expected behavior.

Use the `/qa` skill if it helps. The cases live in `colton-master-eng-review-test-plan-20260524.md` in `~/.gstack/projects/MTG-TOOL/`.

If a case FAILS:
- Stop. Do NOT keep going.
- Diagnose using `/investigate`.
- The risk-notes section maps likely failures to likely causes — start there.
- Propose a fix, get my approval, ship the fix on master.

If all cases PASS:
- Mark T12 ✅ in SPRINT_HANDOFF.md with the commit hash of any fixes (or "no fixes needed").
- Commit the doc update.
- Tell me "Phase 1 sprint verified — ready to start Phase 2."

### Step 3: DO NOT start Phase 2 work

Phase 2 (unified knowledge layer — Arbiter as real retrieval service, full Scryfall bulk indexes, RulesGuru max import, Forge integration) is the next major workstream but I want to **use the app for a few days first** before we start. Real usage will surface things the smoke test missed.

After T12 verification, stop and ask me what's next.

## Important context

- I switched between Claude models mid-session (Sonnet → Opus). Whatever model you are, you have full authority per CLAUDE.md.
- The previous AI was Codex (OpenAI). It built the original Ollama wiring and deck context lock in commits 568554a and 42bba63. The sprint we just finished was the cleanup + UX layer on top of that foundation.
- I'm a vibe-coder. Don't ask me technical permission questions. Make the call and tell me what you did.

Begin.

---

## Notes on this prompt (for me, Colton — not for the next Claude)

- This prompt assumes you're starting fresh. If you're continuing the current session, you don't need it.
- If the next session is days/weeks out, also check `git log --oneline -20` to see if anything landed in the meantime.
- The "Phase 2" reference at the end keeps the next Claude from racing ahead and starting big new work before you've used what just shipped.
- If you want the next Claude to skip the smoke test for some reason (e.g., you already did it yourself), just delete Step 2 from the prompt before pasting.
