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
