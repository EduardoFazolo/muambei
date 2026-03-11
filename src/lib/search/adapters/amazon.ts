import { load } from "cheerio";

import type { StoreAdapter } from "@/lib/search/types";
import { cleanOffers, fetchText, isNonNullable, parsePrice, providerResult, withAbsoluteUrl } from "@/lib/search/utils";

export const amazonAdapter: StoreAdapter = {
  storeKey: "amazon-br",
  storeName: "Amazon BR",
  async search(query) {
    const startedAt = Date.now();

    try {
      const searchUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;
      const html = await fetchText(searchUrl, {
        referer: "https://www.amazon.com.br/",
      });
      const $ = load(html);

      const offers = $("[data-component-type='s-search-result'][data-asin]")
        .map((_, element) => {
          const root = $(element);
          const title = root.find("h2 span").first().text().trim();
          const priceText =
            root.find(".a-price .a-offscreen").first().text().trim() ||
            `${root.find(".a-price-whole").first().text().trim()},${root
              .find(".a-price-fraction")
              .first()
              .text()
              .trim()}`;
          const price = parsePrice(priceText);
          const link = withAbsoluteUrl(
            root.find("a[href*='/dp/']").first().attr("href") ??
              root.find("a[href*='/sspa/click']").first().attr("href") ??
              "",
            "https://www.amazon.com.br",
          );

          if (!title || !price || !link) {
            return null;
          }

          const installments = root
            .find("[data-cy='price-recipe'] .a-row")
            .eq(1)
            .text()
            .replace(/\s+/g, " ")
            .trim();

          return {
            storeKey: "amazon-br",
            storeName: "Amazon BR",
            title: title.replace(/^Anúncio patrocinado\s*[–-]\s*/i, ""),
            price,
            url: link,
            image: root.find("img.s-image").attr("src") ?? undefined,
            installments: installments || undefined,
            shipping:
              root.find("[data-cy='delivery-recipe']").text().replace(/\s+/g, " ").trim() ||
              undefined,
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
