import type { StoreAdapter } from "@/lib/search/types";
import { cleanOffers, fetchText, isNonNullable, providerResult, queryToSlug, withAbsoluteUrl } from "@/lib/search/utils";

type KabumPayload = {
  catalogServer?: {
    data?: Array<{
      name?: string;
      sellerName?: string;
      image?: string;
      price?: number;
      priceWithDiscount?: number;
      maxInstallment?: {
        value?: number;
        quantity?: number;
      };
      available?: boolean;
      friendlyName?: string;
      externalUrl?: string;
    }>;
  };
};

export const kabumAdapter: StoreAdapter = {
  storeKey: "kabum",
  storeName: "KaBuM",
  async search(query) {
    const startedAt = Date.now();

    try {
      const url = `https://www.kabum.com.br/busca/${queryToSlug(query)}`;
      const html = await fetchText(url);
      const match = html.match(
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
      );

      if (!match) {
        throw new Error("Payload __NEXT_DATA__ não encontrado.");
      }

      const nextData = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            data?: string;
          };
        };
      };

      if (!nextData.props?.pageProps?.data) {
        throw new Error("Payload catalogServer ausente.");
      }

      const payload = JSON.parse(nextData.props.pageProps.data) as KabumPayload;
      const offers =
        payload.catalogServer?.data?.map((item) => {
          const price = item.priceWithDiscount ?? item.price;
          if (!item.name || !price || item.available === false) {
            return null;
          }

          return {
            storeKey: "kabum",
            storeName: "KaBuM",
            title: item.name,
            price,
            url: item.externalUrl
              ? withAbsoluteUrl(item.externalUrl, "https://www.kabum.com.br")
              : `https://www.kabum.com.br/produto/${item.friendlyName ?? ""}`,
            image: item.image,
            seller: item.sellerName || undefined,
            installments:
              item.maxInstallment?.quantity && item.maxInstallment.value
                ? `${item.maxInstallment.quantity}x de R$ ${item.maxInstallment.value.toFixed(2).replace(".", ",")}`
                : undefined,
            source: "json" as const,
            currency: "BRL" as const,
          };
        }) ?? [];

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
