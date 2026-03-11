import { load } from "cheerio";

import type { StoreAdapter } from "@/lib/search/types";
import { cleanOffers, fetchText, isNonNullable, parsePrice, providerResult, queryToSlug, withAbsoluteUrl } from "@/lib/search/utils";

export const mercadoLivreAdapter: StoreAdapter = {
  storeKey: "mercado-livre",
  storeName: "Mercado Livre",
  async search(query) {
    const startedAt = Date.now();

    try {
      const url = `https://lista.mercadolivre.com.br/${queryToSlug(query)}`;
      const html = await fetchText(url);
      const $ = load(html);

      const offers = $("li.ui-search-layout__item")
        .map((_, element) => {
          const root = $(element);
          const title =
            root.find("a.poly-component__title").first().text().trim() ||
            root.find(".ui-search-item__title").first().text().trim();
          const priceText = root.find(".andes-money-amount__fraction").first().text().trim();
          const centsText = root.find(".andes-money-amount__cents").first().text().trim();
          const price = parsePrice(centsText ? `${priceText},${centsText}` : priceText);
          const link = withAbsoluteUrl(
            root.find("a.poly-component__title").first().attr("href") ??
              root.find("a").first().attr("href") ??
              "",
            "https://lista.mercadolivre.com.br",
          );

          if (!title || !price || !link) {
            return null;
          }

          return {
            storeKey: "mercado-livre",
            storeName: "Mercado Livre",
            title,
            price,
            url: link,
            image:
              root.find("img").first().attr("src") ??
              root.find("img").first().attr("data-src") ??
              undefined,
            seller: root.find(".poly-component__seller").first().text().trim() || undefined,
            shipping:
              root.find(".poly-component__shipping").first().text().trim() || undefined,
            source: "html" as const,
            currency: "BRL" as const,
          };
        })
        .get()
        .filter(isNonNullable);

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
        note: error instanceof Error ? error.message : "Falha inesperada no coletor.",
      });
    }
  },
};
