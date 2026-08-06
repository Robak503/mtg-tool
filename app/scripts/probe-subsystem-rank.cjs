const fs = require("fs");
(async () => {
  const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
  const base = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/";
  const { classifyCard, NATIVE_TIERS } = await import(base + "coverage.js");
  const tierOf = (c, oracle) => String(classifyCard({
    name: c.name, type: c.type_line, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle,
  }));

  // Each subsystem: a matcher for the LINE that would carry it.
  const SUBSYS = [
    ["venture into the dungeon", /venture into the dungeon/i],
    ["take the initiative", /takes? the initiative/i],
    ["the Ring tempts you", /the ring tempts you/i],
    ["open an Attraction", /open an attraction/i],
    ["incubate N", /\bincubate \d+/i],
    ["Level Up", /^level up /i],
    ["powerstone token", /powerstone token/i],
    ["Dungeon/Initiative combined", /(venture into the dungeon|takes? the initiative)/i],
    ["Class level", /^\{[^}]+\}: level \d+/i],
    ["Saga chapter", /^(i|ii|iii|iv|v)\s*[—-]/i],
    ["day/night", /\b(daybound|nightbound|it becomes night|it becomes day)\b/i],
    ["monarch", /\byou become the monarch\b/i],
    ["explore", /\bexplores?\b/i],
    ["connive", /\bconnives?\b/i],
    ["goad", /\bgoads?\b/i],
    ["Dredge", /^dredge \d+/i],
  ];

  const counts = new Map(SUBSYS.map(([n]) => [n, { sole: 0, ex: [] }]));
  let scanned = 0;
  for (const c of cards) {
    const tl = String(c.type_line || "");
    if (/^Token\b/.test(tl)) continue;
    const o = String(c.oracle_text || "");
    if (!o) continue;
    if (NATIVE_TIERS.has(tierOf(c, o))) continue;
    const lines = o.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2 || lines.length > 6) continue;
    scanned++;
    for (let i = 0; i < lines.length; i++) {
      const without = lines.filter((_, j) => j !== i).join("\n");
      if (!NATIVE_TIERS.has(tierOf(c, without))) continue;
      // strip reminder text before matching — a parenthesised explanation is not the ability
      const bare = lines[i].replace(/\([^)]*\)/g, "").trim();
      for (const [name, re] of SUBSYS) {
        if (re.test(bare)) {
          const e = counts.get(name); e.sole++; if (e.ex.length < 4) e.ex.push(c.name);
        }
      }
      break;
    }
  }
  console.log(`scanned ${scanned} multi-line parked cards\n`);
  console.log("SOLE-BLOCKER count  SUBSYSTEM                      examples");
  for (const [k, v] of [...counts].sort((a, b) => b[1].sole - a[1].sole)) {
    if (!v.sole) continue;
    console.log(String(v.sole).padStart(17) + "  " + k.padEnd(30) + v.ex.join(", "));
  }
})();
