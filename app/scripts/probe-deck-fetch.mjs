/**
 * probe-deck-fetch.mjs — replicate the app's deck-import network request byte-for-byte,
 * outside the app, so a fetch failure can be blamed on the RIGHT layer.
 *
 * Born 2026-08-02: every Moxfield URL 403'd inside the packaged .exe while curl said 200.
 * The cause was the BUNDLED Node's TLS ClientHello (Cloudflare fingerprints it) — provable
 * only by running the same request through different Node binaries. This script is that
 * measurement, kept so the next network ghost-hunt starts at step 3 instead of step 0:
 *
 *   node scripts/probe-deck-fetch.mjs                        # both hosts, this Node
 *   node scripts/probe-deck-fetch.mjs --moxfield=<publicId>  # a specific deck
 *   "<install>\resources\node\node.exe" scripts/probe-deck-fetch.mjs   # the bundled runtime
 *
 * Compare the output of the system Node vs the bundled one: a status that differs between
 * them with identical headers is a RUNTIME fingerprint problem, not a header/link problem.
 *
 * Read-only against the public deck APIs; no app state touched. Not part of any build step.
 */
import https from "node:https";

// Keep these in lockstep with src/lib/server/deckUrlFetch.js — the probe is only honest
// while the request it sends is byte-identical to the one the app sends.
const USER_AGENT =
  "MTG-Tool/0.4.0 (https://github.com/Robak503/mtg-tool; local deck importer)";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

// Known-public decks (the deck-source registry's Kellan + a verified Archidekt id).
const PROBES = [
  { host: "Moxfield", url: `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(args.moxfield || "vkp5_GN6GEqHUMql45PvOw")}` },
  { host: "Archidekt", url: `https://archidekt.com/api/decks/${encodeURIComponent(args.archidekt || "19510972")}/` },
];

function probe({ host, url }) {
  return new Promise((resolve) => {
    const req = https.request(
      new URL(url),
      { method: "GET", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
      (res) => {
        const tls = res.socket?.getProtocol ? res.socket.getProtocol() : null;
        const cipher = res.socket?.getCipher ? res.socket.getCipher()?.name : null;
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ host, node: process.version, status: res.statusCode, tls, cipher,
            server: res.headers.server || null, cfRay: res.headers["cf-ray"] || null,
            looksLikeChallenge: /^\s*<!DOCTYPE html/i.test(body),
            bodyFirst100: body.slice(0, 100) });
        });
      },
    );
    req.on("error", (e) => resolve({ host, node: process.version, error: String(e) }));
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const results = [];
for (const p of PROBES) results.push(await probe(p));
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.error || r.status < 200 || r.status >= 300);
if (bad.length) {
  console.error(`\n${bad.length} probe(s) failed under ${process.version}. If the same probe`);
  console.error("succeeds under a different Node binary with this exact script, the failure is");
  console.error("the runtime's TLS fingerprint (the 2026-08-02 Moxfield class), not the link.");
  process.exit(1);
}
