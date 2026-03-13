import type { StoreAdapter } from "@/lib/search/types";
import {
  cleanOffers,
  extractEmbeddedJsonObject,
  fetchText,
  providerResult,
  withAbsoluteUrl,
} from "@/lib/search/utils";

type BuscapeSearchHit = {
  name?: string;
  shortName?: string;
  price?: number;
  url?: string;
  image?: string;
  storeCount?: number;
  installments?: {
    amount_months?: number;
    price?: number;
    total_value?: number;
  };
  bestOffer?: {
    merchantName?: string;
  };
};

type BuscapeSearchState = {
  hits?: {
    hits?: BuscapeSearchHit[];
  };
};

function formatInstallments(hit: BuscapeSearchHit) {
  const amountMonths = hit.installments?.amount_months;
  const installmentPrice = hit.installments?.price;

  if (!amountMonths || !installmentPrice) {
    return undefined;
  }

  return `${amountMonths}x de R$ ${installmentPrice.toFixed(2).replace(".", ",")}`;
}

export const buscapeAdapter: StoreAdapter = {
  storeKey: "buscape",
  storeName: "Buscape",
  async search(query) {
    const startedAt = Date.now();

    try {
      const url = `https://www.buscape.com.br/search?q=${encodeURIComponent(query)}`;
      const html = await fetchText(url, {
        referer: "https://www.buscape.com.br/",
      });
      const state = extractEmbeddedJsonObject(
        html,
        "initialReduxState",
      ) as BuscapeSearchState;

      const offers = (state.hits?.hits ?? [])
        .map((hit) => {
          const title = hit.name?.trim() || hit.shortName?.trim() || "";
          const price = hit.price ?? 0;
          const productUrl = withAbsoluteUrl(
            hit.url ?? "",
            "https://www.buscape.com.br",
          );

          if (!title || !price || !productUrl) {
            return null;
          }

          return {
            storeKey: "buscape",
            storeName: "Buscape",
            title,
            price,
            url: productUrl,
            image: hit.image || undefined,
            seller: hit.bestOffer?.merchantName || undefined,
            installments: formatInstallments(hit),
            shipping:
              typeof hit.storeCount === "number" && hit.storeCount > 1
                ? `${hit.storeCount} lojas`
                : undefined,
            source: "html" as const,
            currency: "BRL" as const,
          };
        })
        .filter((offer) => offer !== null);

      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        offers: cleanOffers(offers, query),
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        latencyMs: Date.now() - startedAt,
        status: "error",
        note:
          error instanceof Error
            ? error.message
            : "Falha inesperada no coletor.",
      });
    }
  },
};
