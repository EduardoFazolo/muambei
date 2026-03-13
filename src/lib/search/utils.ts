import type { ProviderResult, SearchOffer } from "@/lib/search/types";

const BROWSER_HEADERS: HeadersInit = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "cache-control": "no-cache",
  "pragma": "no-cache",
};

const ACCESSORY_TERMS = [
  "capa",
  "pelicula",
  "película",
  "case",
  "cabo",
  "carregador",
  "fone",
  "suporte",
  "adaptador",
  "cover",
  "screen protector",
];

const CONDITION_TERMS = ["recondicionado", "reconditioned", "usado", "seminovo"];

export function normalizeText(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function queryToSlug(query: string) {
  return normalizeText(query).replace(/\s+/g, "-");
}

export async function fetchText(url: string, extraHeaders?: HeadersInit) {
  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      ...extraHeaders,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchJson<T>(
  url: string,
  extraHeaders?: HeadersInit,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      ...extraHeaders,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

export function parsePrice(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRelevantOffer(title: string, query: string) {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const matched = tokens.filter((token) => normalizedTitle.includes(token)).length;
  const requiredMatches =
    tokens.length <= 3
      ? tokens.length
      : Math.max(2, Math.ceil(tokens.length * 0.66));

  if (matched < requiredMatches) {
    return false;
  }

  const queryLooksAccessory = ACCESSORY_TERMS.some((term) =>
    normalizedQuery.includes(term),
  );

  if (!queryLooksAccessory) {
    const isAccessory = ACCESSORY_TERMS.some((term) =>
      normalizedTitle.includes(term),
    );
    if (isAccessory) {
      return false;
    }
  }

  const queryAllowsCondition = CONDITION_TERMS.some((term) =>
    normalizedQuery.includes(term),
  );
  if (!queryAllowsCondition) {
    const hasConditionTerm = CONDITION_TERMS.some((term) =>
      normalizedTitle.includes(term),
    );
    if (hasConditionTerm) {
      return false;
    }
  }

  return true;
}

export function cleanOffers(
  offers: SearchOffer[],
  query: string,
  limit = 12,
): SearchOffer[] {
  const seen = new Set<string>();

  return offers
    .filter((offer) => Boolean(offer.url) && offer.price > 0)
    .filter((offer) => isRelevantOffer(offer.title, query))
    .filter((offer) => {
      const key = `${offer.storeKey}:${normalizeText(offer.title)}:${offer.price}:${offer.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.price - right.price)
    .slice(0, limit);
}

export function providerResult(
  base: Omit<ProviderResult, "status" | "latencyMs" | "offers"> & {
    offers?: SearchOffer[];
    status?: ProviderResult["status"];
    latencyMs: number;
  },
): ProviderResult {
  const offers = base.offers ?? [];
  return {
    storeKey: base.storeKey,
    storeName: base.storeName,
    offers,
    latencyMs: base.latencyMs,
    note: base.note,
    status:
      base.status ??
      (offers.length > 0 ? "ok" : "empty"),
  };
}

export function withAbsoluteUrl(url: string, base: string) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

export function extractEmbeddedJsonObject(html: string, key: string) {
  const start = html.indexOf(`"${key}":`);
  if (start < 0) {
    throw new Error(`Embedded key "${key}" not found.`);
  }

  const objectStart = html.indexOf("{", start);
  if (objectStart < 0) {
    throw new Error(`Embedded key "${key}" does not contain an object.`);
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(html.slice(objectStart, index + 1));
      }
    }
  }

  throw new Error(`Embedded key "${key}" is not a closed JSON object.`);
}
