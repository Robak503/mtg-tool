# Security Policy

MTG Tool is a local-first desktop app: it runs on your own machine, stores data
locally, and makes no outbound calls in normal operation beyond opt-in data syncs and
a once-daily update check.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead use GitHub's
private vulnerability reporting ("Report a vulnerability" under the Security tab of
[the repository](https://github.com/Robak503/mtg-tool/security)), or contact the
maintainer directly. Include steps to reproduce and the impact you observed. You'll get
an acknowledgement as soon as the maintainer sees it.

## In scope

- The Tauri shell and its process/update handling.
- The local Next.js server and its API routes.
- The build and signed-release pipeline.

## Posture

- **No secrets in the repo.** API keys live only in your local `.env.local`
  (git-ignored). Never commit credentials.
- **Signed auto-updates.** Releases are signed with a minisign key; the app verifies
  the signature before applying an update.
- **Guarded outbound calls.** Card-art and data fetches are restricted to known hosts
  (e.g. Scryfall), and external API calls happen only on explicit user action or
  documented fallbacks.

## Supported versions

This is a single-maintainer personal project; only the latest release is supported.
Please update to the newest version before reporting an issue.
