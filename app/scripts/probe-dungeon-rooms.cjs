const fs = require("fs");
(async () => {
  const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
  const base = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/";
  const { parseEffectClause } = await import(base + "effects/parser.js");

  const DASH = String.fromCharCode(8212);
  const dungeons = cards.filter((c) => /Dungeon/.test(String(c.type_line || "")) && /Leads to:/i.test(String(c.oracle_text || "")));

  // SANITY GATE: at least one dungeon must split into rooms with a leads-to graph.
  if (!dungeons.length) { console.error("SANITY GATE FAILED — no dungeon card carries a 'Leads to:' graph"); process.exit(1); }
  console.log("dungeons with a room graph:", dungeons.map((d) => d.name).join(", "));

  let totalRooms = 0, parsedRooms = 0;
  for (const d of dungeons) {
    const lines = String(d.oracle_text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    console.log("\n== " + d.name + " (" + lines.length + " rooms)");
    for (const line of lines) {
      const m = line.match(new RegExp("^(.+?)\\s*" + DASH + "\\s*(.+?)\\s*(?:\\(Leads to:\\s*(.+?)\\))?$"));
      if (!m) { console.log("   [UNPARSED LINE] " + line.slice(0, 70)); continue; }
      const [, room, effect, leads] = m;
      totalRooms++;
      let atoms = null;
      try { atoms = parseEffectClause(effect.replace(/\.$/, ""), "Instant", { sourceScoped: true })?.atoms; } catch { atoms = null; }
      const ok = atoms && atoms.length;
      if (ok) parsedRooms++;
      console.log("   " + (ok ? "OK  " : "PARK") + " " + room.padEnd(22) + effect.slice(0, 46).padEnd(48)
        + "→ " + (leads ? leads : "(END)"));
    }
  }
  console.log(`\nROOM EFFECTS: ${parsedRooms}/${totalRooms} already parse with existing machinery`);
})();
