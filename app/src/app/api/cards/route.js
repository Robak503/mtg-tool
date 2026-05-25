export const runtime = "nodejs";

import {
  getCardIndex,
  getRulingsIndex,
  lookupCard,
  lookupRulingsForCard,
  publicCard,
  searchCards,
} from "../../../lib/server/cardIndex";

function missingRepositoryResponse(error) {
  return Response.json(
    {
      error: error?.message || "Local Oracle repository missing. Run npm.cmd run sync:oracle from the app folder.",
    },
    { status: 404 }
  );
}

function loadRepoOrResponse() {
  try {
    return { repo: getCardIndex(), response: null };
  } catch (error) {
    if (error.code === "ENOENT") return { repo: null, response: missingRepositoryResponse(error) };
    return {
      repo: null,
      response: Response.json({ error: error.message || "Could not load local Oracle repository." }, { status: 500 }),
    };
  }
}

export async function GET(request) {
  const { repo, response } = loadRepoOrResponse();
  if (response) return response;

  const url = new URL(request.url);
  if (url.searchParams.get("catalog") === "1") {
    return Response.json({
      generatedAt: repo.generatedAt,
      scryfallUpdatedAt: repo.scryfallUpdatedAt,
      count: repo.names.length,
      names: repo.names,
    });
  }

  const search = url.searchParams.get("search");
  if (search) {
    const cards = searchCards(search, {
      colorIdentity: url.searchParams.get("colorIdentity"),
      legal: url.searchParams.get("legal") || "commander",
      limit: url.searchParams.get("limit"),
    });
    return Response.json({
      query: search,
      count: cards.length,
      cards: cards.map(card => publicCard(card, [], { source: "local", rulingsSource: "not_requested" })),
      source: "local",
      scryfallUpdatedAt: repo.scryfallUpdatedAt,
    });
  }

  const rulingsFor = url.searchParams.get("rulingsFor");
  if (rulingsFor) {
    const card = lookupCard(rulingsFor);
    const oracleId = card?.oracle_id || rulingsFor;
    const rulings = getRulingsIndex();
    return Response.json({
      oracleId,
      cardName: card?.name || null,
      rulings: card ? lookupRulingsForCard(card) : rulings.byOracleId.get(oracleId) || [],
      source: "local",
      scryfallUpdatedAt: rulings.scryfallUpdatedAt,
    });
  }

  const name = url.searchParams.get("name");
  if (!name) return Response.json({ error: "Provide ?name=Card Name or ?catalog=1." }, { status: 400 });

  const card = lookupCard(name);
  if (!card) return Response.json({ error: `Card not found in local Oracle repository: ${name}` }, { status: 404 });

  return Response.json({
    card: publicCard(card, [], { source: "local", rulingsSource: "not_requested" }),
    source: "local",
    scryfallUpdatedAt: repo.scryfallUpdatedAt,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!Array.isArray(body.names)) {
    return Response.json({ error: "Request body must include a names array." }, { status: 400 });
  }

  const { repo, response } = loadRepoOrResponse();
  if (response) return response;

  const includeRulings = Boolean(body.includeRulings);
  const cards = {};

  for (const name of body.names) {
    const card = lookupCard(name);
    if (!card) {
      cards[name] = null;
      continue;
    }

    const cardRulings = includeRulings ? lookupRulingsForCard(card) : [];
    cards[name] = publicCard(card, cardRulings, {
      source: "local",
      rulingsSource: includeRulings ? "local" : "not_requested",
    });
  }

  return Response.json({
    cards,
    source: "local",
    scryfallUpdatedAt: repo.scryfallUpdatedAt,
  });
}
