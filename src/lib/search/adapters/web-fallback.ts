import { load } from "cheerio";

import type { SearchOffer, StoreAdapter } from "@/lib/search/types";
import {
  cleanOffers,
  fetchText,
  parsePrice,
  providerResult,
  withAbsoluteUrl,
} from "@/lib/search/utils";

type SearchCandidate = {
  title: string;
  url: string;
};

type ExtractedOffer = {
  title?: string;
  price?: number;
  currency?: string;
  image?: string;
  seller?: string;
  shipping?: string;
};

function decodeDuckDuckGoResultUrl(href: string) {
  const absolute = withAbsoluteUrl(href, "https://duckduckgo.com");

  try {
    const url = new URL(absolute);
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : absolute;
  } catch {
    return absolute;
  }
}

function normalizeStoreName(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname
      .replace(/^www\./, "")
      .split(".")
      .slice(0, 2)
      .join(".")
      .replace(/[-_]/g, " ");
  } catch {
    return "Busca Web";
  }
}

function extractJsonLdOffers(html: string): ExtractedOffer[] {
  const $ = load(html);
  const offers: ExtractedOffer[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      collectOffersFromJsonLd(parsed, offers);
    } catch {
      // Ignore malformed JSON-LD blocks from third-party widgets.
    }
  });

  return offers;
}

function collectOffersFromJsonLd(value: unknown, offers: ExtractedOffer[]) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectOffersFromJsonLd(item, offers));
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const price = parsePrice(record.price as string | number | null | undefined);
  const currency =
    typeof record.priceCurrency === "string"
      ? record.priceCurrency.toUpperCase()
      : undefined;

  if (price && currency) {
    const seller =
      typeof record.seller === "string"
        ? record.seller
        : typeof record.seller === "object" &&
            record.seller &&
            typeof (record.seller as Record<string, unknown>).name === "string"
          ? ((record.seller as Record<string, unknown>).name as string)
          : undefined;

    offers.push({
      title:
        typeof record.name === "string"
          ? record.name
          : undefined,
      price,
      currency,
      image:
        typeof record.image === "string"
          ? record.image
          : Array.isArray(record.image) && typeof record.image[0] === "string"
            ? (record.image[0] as string)
            : undefined,
      seller,
    });
  }

  Object.values(record).forEach((nested) => collectOffersFromJsonLd(nested, offers));
}

function extractMetaOffer(html: string): ExtractedOffer | null {
  const $ = load(html);
  const price =
    parsePrice($("meta[property='product:price:amount']").attr("content")) ??
    parsePrice($("meta[property='og:price:amount']").attr("content"));
  const currency =
    $("meta[property='product:price:currency']").attr("content")?.toUpperCase() ??
    $("meta[property='og:price:currency']").attr("content")?.toUpperCase();

  if (!price || !currency) {
    return null;
  }

  return {
    title:
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined,
    price,
    currency,
    image: $("meta[property='og:image']").attr("content") || undefined,
    seller:
      $("meta[property='og:site_name']").attr("content")?.trim() || undefined,
  };
}

function extractDomOffer(html: string): ExtractedOffer | null {
  const $ = load(html);
  const textCandidates = [
    $("#js-precio").first().text(),
    $(".txt-precio").first().text(),
    $("[itemprop='price']").first().attr("content") ??
      $("[itemprop='price']").first().text(),
    $("[data-product-price-without-tax]").first().text(),
    $(".price--withoutTax").first().text(),
  ]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  const firstPriceText = textCandidates.find((value) =>
    /R\$|\$|€|\d/.test(value),
  );

  if (!firstPriceText) {
    return null;
  }

  const price = parsePrice(firstPriceText);
  if (!price) {
    return null;
  }

  const currency = firstPriceText.includes("R$")
    ? "BRL"
    : firstPriceText.includes("€")
      ? "EUR"
      : firstPriceText.includes("$")
        ? "USD"
        : undefined;

  if (!currency) {
    return null;
  }

  return {
    title:
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined,
    price,
    currency,
    image: $("meta[property='og:image']").attr("content") || undefined,
    seller:
      $("meta[property='og:site_name']").attr("content")?.trim() || undefined,
  };
}

async function discoverCandidates(query: string): Promise<SearchCandidate[]> {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
    {
      referer: "https://duckduckgo.com/",
    },
  );
  const $ = load(html);

  return $(".result__a")
    .map((_, element) => {
      const title = $(element).text().replace(/\s+/g, " ").trim();
      const href = $(element).attr("href") ?? "";
      const url = decodeDuckDuckGoResultUrl(href);

      if (!title || !url.startsWith("http")) {
        return null;
      }

      return { title, url };
    })
    .get()
    .filter((candidate): candidate is SearchCandidate => Boolean(candidate))
    .slice(0, 6);
}

async function fetchCandidateOffer(candidate: SearchCandidate): Promise<SearchOffer | null> {
  const html = await fetchText(candidate.url, {
    referer: "https://duckduckgo.com/",
  });
  const jsonLdOffer = extractJsonLdOffers(html).find(
    (offer) => offer.price && offer.currency,
  );
  const metaOffer = extractMetaOffer(html);
  const isSearchLikePage =
    /\/busca(\/|$)|\/search(\/|$)|[?&]q=/.test(candidate.url) ||
    /resultados de busca|search result|product not found/i.test(html);
  if (isSearchLikePage) {
    return null;
  }

  const extracted = jsonLdOffer ?? metaOffer ?? extractDomOffer(html);

  if (!extracted?.price || extracted.currency !== "BRL") {
    return null;
  }

  return {
    storeKey: "web-fallback",
    storeName: extracted.seller || normalizeStoreName(candidate.url),
    title: extracted.title?.trim() || candidate.title,
    price: extracted.price,
    url: candidate.url,
    image: extracted.image,
    seller: extracted.seller,
    shipping: extracted.shipping,
    source: "html",
    currency: "BRL",
  };
}

export const webFallbackAdapter: StoreAdapter = {
  storeKey: "web-fallback",
  storeName: "Busca Web",
  async search(query) {
    const startedAt = Date.now();

    try {
      const candidates = await discoverCandidates(query);
      const settled = await Promise.allSettled(
        candidates.map((candidate) => fetchCandidateOffer(candidate)),
      );
      const offers = settled
        .flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : [],
        );

      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        offers: cleanOffers(offers, query, 8),
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
