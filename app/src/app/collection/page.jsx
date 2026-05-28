"use client";

/**
 * /collection — standalone Next.js page route.
 *
 * Renders the CollectionView shell. In production the same component
 * mounts inside MTGAssistant via the centerView switch (Step 7). The
 * standalone route lets us iterate on the grid in isolation during
 * development.
 */

import CollectionView from "../../components/mtg/CollectionView";

export default function CollectionPage() {
  return <CollectionView />;
}
