import { load } from "cheerio";

import type { StoreAdapter } from "@/lib/search/types";
import {
  cleanOffers,
  fetchText,
  isNonNullable,
  parsePrice,
  providerResult,
  queryToSlug,
  withAbsoluteUrl,
} from "@/lib/search/utils";

/**
 * Brazilian import tax estimate for Mercado Livre Internacional items.
 *
 * ML Internacional products go through Brazil's simplified import regime:
 *   - II (Imposto de Importação): 60% of the product value
 *   - ICMS: ~19% applied on (product + II)  ← blended rate, matches real examples
 *
 * Effective multiplier: 1 + 0.60 + (0.19 × 1.60) = 1.904
 * Verified against real checkout: R$ 5.344 base → R$ 10.177 total ✓
 */
const II_RATE = 0.60;
const ICMS_RATE = 0.19;

function estimateTotalWithImportTax(basePrice: number): number {
  const importTax = basePrice * II_RATE;
  const icms = (basePrice + importTax) * ICMS_RATE;
  return basePrice + importTax + icms;
}

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const root = $(element as any);
          const title =
            root.find("a.poly-component__title").first().text().trim() ||
            root.find(".ui-search-item__title").first().text().trim();
          const priceText = root
            .find(".andes-money-amount__fraction")
            .first()
            .text()
            .trim();
          const centsText = root
            .find(".andes-money-amount__cents")
            .first()
            .text()
            .trim();
          const basePrice = parsePrice(
            centsText ? `${priceText},${centsText}` : priceText,
          );
          const link = withAbsoluteUrl(
            root.find("a.poly-component__title").first().attr("href") ??
              root.find("a").first().attr("href") ??
              "",
            "https://lista.mercadolivre.com.br",
          );

          if (!title || !basePrice || !link) {
            return null;
          }

          // Filter out sold-out or unavailable listings
          const rootText = root.text().toLowerCase();
          const isSoldOut =
            root.find(".poly-component__sold-out").length > 0 ||
            root.find("[class*='sold-out']").length > 0 ||
            rootText.includes("esgotado") ||
            rootText.includes("indisponível") ||
            rootText.includes("sem estoque");
          if (isSoldOut) {
            return null;
          }

          // Detect the "Internacional" (cross-border) badge.
          // ML renders it via .poly-component__cbt (the airplane/globe SVG pill)
          // and adds a visually-hidden <span>Internacional</span> for a11y.
          const isInternacional =
            root.find(".poly-component__cbt").length > 0 ||
            root
              .find(".andes-visually-hidden")
              .filter(
                (_, el) =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  $(el as any)
                    .text()
                    .toLowerCase()
                    .includes("internacional"),
              )
              .length > 0;

          // For internacional items, the displayed price does NOT include
          // Brazilian import taxes (II + ICMS). We apply the standard
          // simplified regime formula to get the real total the buyer pays.
          const price = isInternacional
            ? estimateTotalWithImportTax(basePrice)
            : basePrice;

          const baseShipping =
            root
              .find(".poly-component__shipping")
              .first()
              .text()
              .trim() || undefined;

          const shipping = isInternacional
            ? [
                baseShipping,
                `Internacional · imposto estimado: +${Math.round((estimateTotalWithImportTax(basePrice) / basePrice - 1) * 100)}% (II+ICMS)`,
              ]
                .filter(Boolean)
                .join(" · ")
            : baseShipping;

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
            seller:
              root.find(".poly-component__seller").first().text().trim() ||
              undefined,
            shipping,
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
        note:
          error instanceof Error
            ? error.message
            : "Falha inesperada no coletor.",
      });
    }
  },
};
