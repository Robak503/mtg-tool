const fs = require("fs");
(async () => {
  const cards = JSON.parse(fs.readFileSync(process.env.APPDATA + "/com.colton.mtg-tool/data/scryfall-bulk/oracle_cards.json", "utf8"));
  const base = "file:///C:/Projects/mtg-tool/.claude/worktrees/omnath-9be016/app/src/lib/learn/";
  const { classifyCard, NATIVE_TIERS } = await import(base + "coverage.js");
  const { parseActivatedAbilities } = await import(base + "effects/abilities.js");
  const { parseEffectClause } = await import(base + "effects/parser.js");

  // SANITY GATE: a known activated ability must parse into an ability with an effect clause.
  const probe = parseActivatedAbilities({ name: "X", type: "Creature — Bear", oracle: "{T}: Draw a card." });
  if (!probe || !probe.length || !probe[0].effectClause) {
    console.error("SANITY GATE FAILED — parseActivatedAbilities returned nothing for a known ability:", JSON.stringify(probe));
    process.exit(1);
  }
  console.log("sanity gate OK — parsed:", JSON.stringify(probe[0].effectClause));

  const tally = new Map();
  for (const c of cards) {
    const tl = String(c.type_line || "");
    if (/^Token\b/.test(tl)) continue;
    const o = String(c.oracle_text || "");
    if (!o) continue;
    const tier = String(classifyCard({ name: c.name, type: tl, mana: c.mana_cost, power: c.power, toughness: c.toughness, oracle: o }));
    // ⚠️ NATIVE_TIERS, not startsWith("native") — the `land` tier is COVERED but does not carry the prefix,
    // so the first run of this census counted 248 dual lands as parked and put them at the top of the list.
    if (NATIVE_TIERS.has(tier)) continue;
    let abs;
    try { abs = parseActivatedAbilities({ name: c.name, type: tl, oracle: o }); } catch { continue; }
    for (const a of abs || []) {
      const cl = String(a.effectClause || "");
      if (!cl) continue;
      let atoms;
      try { atoms = parseEffectClause(cl, "Instant", { sourceScoped: true })?.atoms; } catch { atoms = null; }
      if (atoms && atoms.length) continue;
      const shape = cl.toLowerCase().replace(/\d+/g, "N").replace(/\{[^}]*\}/g, "{M}").replace(/\s+/g, " ").trim().slice(0, 54);
      if (!tally.has(shape)) tally.set(shape, { n: 0, ex: [] });
      const e = tally.get(shape); e.n++; if (e.ex.length < 2) e.ex.push(c.name);
    }
  }
  console.log("\ncount  UNPARSED ACTIVATED-ABILITY EFFECT SHAPE (normalized)");
  for (const [k, v] of [...tally].sort((a, b) => b[1].n - a[1].n).slice(0, 20)) {
    console.log(String(v.n).padStart(5) + "  " + k.padEnd(56) + v.ex.join(" | "));
  }
})();
