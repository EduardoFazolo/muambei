import type { StoreAdapter } from "@/lib/search/types";
import { cleanOffers, fetchJson, isNonNullable, providerResult } from "@/lib/search/utils";

type AmericanasProduct = {
  productName?: string;
  link?: string;
  items?: Array<{
    images?: Array<{
      imageUrl?: string;
    }>;
    sellers?: Array<{
      sellerName?: string;
      commertialOffer?: {
        Price?: number;
        Installments?: Array<{
          NumberOfInstallments?: number;
          Value?: number;
          InterestRate?: number;
        }>;
      };
    }>;
  }>;
};

export const americanasAdapter: StoreAdapter = {
  storeKey: "americanas",
  storeName: "Americanas",
  async search(query) {
    const startedAt = Date.now();

    try {
      const url = `https://www.americanas.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(
        query,
      )}`;
      const data = await fetchJson<AmericanasProduct[]>(url);

      const offers = data.map((product) => {
        const sku = product.items?.[0];
        const seller = sku?.sellers?.[0];
        const price = seller?.commertialOffer?.Price;

        if (!product.productName || !product.link || !price) {
          return null;
        }

        const installment = seller.commertialOffer?.Installments?.find(
          (option) => option.InterestRate === 0 && (option.NumberOfInstallments ?? 0) > 1,
        );

        return {
          storeKey: "americanas",
          storeName: "Americanas",
          title: product.productName,
          price,
          url: product.link,
          image: sku?.images?.[0]?.imageUrl,
          seller: seller?.sellerName || undefined,
          installments:
            installment?.NumberOfInstallments && installment.Value
              ? `${installment.NumberOfInstallments}x de R$ ${installment.Value.toFixed(2).replace(".", ",")}`
              : undefined,
          source: "json" as const,
          currency: "BRL" as const,
        };
      });

      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        offers: cleanOffers(offers.filter(isNonNullable), query),
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
