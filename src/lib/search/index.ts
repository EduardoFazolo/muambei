import { amazonAdapter } from "@/lib/search/adapters/amazon";
import { americanasAdapter } from "@/lib/search/adapters/americanas";
import { kabumAdapter } from "@/lib/search/adapters/kabum";
import { mercadoLivreAdapter } from "@/lib/search/adapters/mercado-livre";
import { pitchlabsAdapter } from "@/lib/search/adapters/pitchlabs";
import type { SearchResponse, StoreAdapter } from "@/lib/search/types";

const ADAPTERS: StoreAdapter[] = [
  mercadoLivreAdapter,
  amazonAdapter,
  kabumAdapter,
  americanasAdapter,
  pitchlabsAdapter,
];

export async function searchProducts(query: string): Promise<SearchResponse> {
  const providers = await Promise.all(ADAPTERS.map((adapter) => adapter.search(query)));
  const offers = providers.flatMap((provider) => provider.offers).sort((a, b) => a.price - b.price);

  return {
    query,
    generatedAt: new Date().toISOString(),
    offers,
    providers,
  };
}
