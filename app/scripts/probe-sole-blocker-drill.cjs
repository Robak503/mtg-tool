const fs = require("fs");
(async () => {
  const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
  const base = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/";
  const { classifyCard, NATIVE_TIERS } = await import(base + "coverage.js");
  const { detectTriggers } = await import(base + "triggers.js");
  const { parseEffectClause } = await import(base + "effects/parser.js");
  const tierOf = (c, oracle) => String(classifyCard({
    name: c.name, type: c.type_line, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle,
  }));
  const PREFIX = process.argv[2] || "whenever this creature deals combat damage to a player, yo";
  const byEffect = new Map();
  for (const c of cards) {
    const tl = String(c.type_line || "");
    if (/^Token\b/.test(tl)) continue;
    const o = String(c.oracle_text || "");
    if (!o) continue;
    if (NATIVE_TIERS.has(tierOf(c, o))) continue;
    const lines = o.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2 || lines.length > 6) continue;
    for (let i = 0; i < lines.length; i++) {
      const without = lines.filter((_, j) => j !== i).join("\n");
      if (!NATIVE_TIERS.has(tierOf(c, without))) continue;
      const norm = lines[i].toLowerCase().replace(/\([^)]*\)/g, "").replace(/\{[^}]+\}/g, "{M}").replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
      if (!norm.startsWith(PREFIX)) break;
      // what does the TRIGGER parse to, and does its effect clause parse?
      let ev = "?", eff = "?", atoms = "?";
      try {
        const tr = detectTriggers({ name: c.name, type: tl, oracle: lines[i] });
        if (tr && tr.length) {
          ev = tr[0].event;
          eff = String(tr[0].effectClause || "");
          const a = parseEffectClause(eff, "Instant", { hasX: !!tr[0].effectHasX, sourceScoped: true })?.atoms;
          atoms = a && a.length ? "PARSES" : "EMPTY";
        } else { ev = "NO-TRIGGER"; }
      } catch { ev = "THREW"; }
      const key = ev + " | " + atoms + " | " + eff.toLowerCase().replace(/\d+/g, "N").replace(/\{[^}]+\}/g, "{M}").slice(0, 56);
      if (!byEffect.has(key)) byEffect.set(key, { n: 0, ex: [] });
      const e = byEffect.get(key); e.n++; if (e.ex.length < 3) e.ex.push(c.name);
      break;
    }
  }
  console.log("PREFIX:", JSON.stringify(PREFIX));
  console.log("\ncount  EVENT | EFFECT-PARSES? | EFFECT CLAUSE");
  for (const [k, v] of [...byEffect].sort((a, b) => b[1].n - a[1].n).slice(0, 16)) {
    console.log(String(v.n).padStart(5) + "  " + k.padEnd(78) + v.ex.join(" | "));
  }
})();
