export function buildCurve(deckCards, cardData) {
  const c = {};
  for (const dc of deckCards.filter(d => d.section !== "Sideboard" && d.section !== "Tokens")) {
    const cd = cardData[dc.name];
    if (!cd || cd.type?.toLowerCase().includes("land")) continue;
    const b = String(Math.min(Math.floor(cd.cmc), 7));
    c[b] = (c[b] || 0) + dc.qty;
  }
  return c;
}

export function buildColors(deckCards, cardData) {
  const c = {W:0,U:0,B:0,R:0,G:0};
  for (const dc of deckCards.filter(d => d.section !== "Sideboard" && d.section !== "Tokens")) {
    const mana = cardData[dc.name]?.mana || "";
    for (const sym of Object.keys(c))
      c[sym] += (mana.match(new RegExp(`\\{${sym}\\}`,"g")) || []).length * dc.qty;
  }
  return c;
}

export function calcPrice(deckCards, cardData) {
  let total = 0;
  const list = [];
  for (const dc of deckCards.filter(d => d.section !== "Tokens")) {
    const p = parseFloat(cardData[dc.name]?.prices?.usd || 0);
    total += p * dc.qty;
    if (p > 0.5) list.push({name: dc.name, price: p});
  }
  return {total: total.toFixed(2), list: list.sort((a,b) => b.price - a.price)};
}

export function checkLegal(deckCards, cardData) {
  return deckCards.filter(dc => dc.section !== "Tokens").filter(dc => {
    const l = cardData[dc.name]?.legalities?.commander;
    return l === "banned" || l === "not_legal";
  }).map(dc => ({name: dc.name, status: cardData[dc.name]?.legalities?.commander}));
}

// Commander color-identity guardrail: flag any card in the 99 whose color
// identity falls outside the commander's combined color identity. Mirrors the
// shape of checkLegal so the Legal tab can render both lists the same way.
//
// Returns [] (no false positives) when there's no Commander card or the
// commander's color identity hasn't resolved yet in cardData — we only flag a
// card when BOTH it and the commander have known color identities. The
// commander card(s) themselves and Tokens/Sideboard are never flagged.
export function colorIdentityIssues(deckCards, cardData) {
  const commanders = deckCards.filter(dc => dc.section === "Commander");
  if (!commanders.length) return [];

  const allowed = new Set();
  let commanderResolved = false;
  for (const dc of commanders) {
    const identity = cardData[dc.name]?.colorIdentity;
    if (Array.isArray(identity)) {
      commanderResolved = true;
      for (const sym of identity) allowed.add(sym);
    }
  }
  if (!commanderResolved) return [];

  const issues = [];
  for (const dc of deckCards) {
    if (dc.section === "Commander" || dc.section === "Tokens" || dc.section === "Sideboard") continue;
    const identity = cardData[dc.name]?.colorIdentity;
    if (!Array.isArray(identity)) continue; // unresolved card — don't guess
    const offColors = identity.filter(sym => !allowed.has(sym));
    if (offColors.length) issues.push({ name: dc.name, offColors });
  }
  return issues;
}
