const fs = require("fs");
(async () => {
  const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
  const base = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/";
  const { classifyCard, NATIVE_TIERS } = await import(base + "coverage.js");

  const tierOf = (c, oracle) => String(classifyCard({
    name: c.name, type: c.type_line, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle,
  }));

  // SANITY GATE: a card with one known-unmodelled line must become native once that line is removed.
  const probe = { name: "P", type_line: "Creature — Bear", mana_cost: "{G}", power: "2", toughness: "2",
    oracle_text: "Flying\nWhenever this creature attacks, venture into the dungeon." };
  if (NATIVE_TIERS.has(tierOf(probe, probe.oracle_text)) || !NATIVE_TIERS.has(tierOf(probe, "Flying"))) {
    console.error("SANITY GATE FAILED — the drop-a-line technique does not discriminate on a known case");
    process.exit(1);
  }
  console.log("sanity gate OK — a known unmodelled line is detectable by removal");

  const tally = new Map();
  let scanned = 0, soleBlockerFound = 0;
  for (const c of cards) {
    const tl = String(c.type_line || "");
    if (/^Token\b/.test(tl)) continue;
    const o = String(c.oracle_text || "");
    if (!o) continue;
    if (NATIVE_TIERS.has(tierOf(c, o))) continue;
    const lines = o.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2 || lines.length > 6) continue;   // 1-line cards give no signal; huge cards are noise
    scanned++;
    for (let i = 0; i < lines.length; i++) {
      const without = lines.filter((_, j) => j !== i).join("\n");
      if (!NATIVE_TIERS.has(tierOf(c, without))) continue;
      // removing exactly this line makes the card native → it is THE sole blocker
      soleBlockerFound++;
      const shape = lines[i].toLowerCase()
        .replace(/\([^)]*\)/g, "")            // drop reminder text — it is not an ability
        .replace(/\{[^}]+\}/g, "{M}")
        .replace(/\d+/g, "N")
        .replace(/\s+/g, " ").trim().slice(0, 58);
      if (!shape) continue;
      if (!tally.has(shape)) tally.set(shape, { n: 0, ex: [] });
      const e = tally.get(shape); e.n++; if (e.ex.length < 3) e.ex.push(c.name);
      break;                                   // one sole-blocker per card
    }
  }
  console.log(`\nscanned ${scanned} multi-line parked cards; ${soleBlockerFound} have a SINGLE blocking line`);
  console.log("\ncount  SOLE-BLOCKER LINE (normalized, reminder text stripped)");
  for (const [k, v] of [...tally].sort((a, b) => b[1].n - a[1].n).slice(0, 24)) {
    console.log(String(v.n).padStart(5) + "  " + k.padEnd(60) + v.ex.join(" | "));
  }
})();
