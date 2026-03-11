export type ExchangeRates = {
  usdToBrl: number;
  eurToBrl: number;
  fetchedAt: string;
};

type AwesomeApiResponse = {
  USDBRL?: { bid: string };
  EURBRL?: { bid: string };
};

// Fallback rates in case the API is unavailable
const FALLBACK_RATES: ExchangeRates = {
  usdToBrl: 5.7,
  eurToBrl: 6.2,
  fetchedAt: new Date().toISOString(),
};

let cache: { rates: ExchangeRates; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();

  if (cache && now < cache.expiresAt) {
    return cache.rates;
  }

  try {
    const response = await fetch(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL",
      { signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      return FALLBACK_RATES;
    }

    const data = (await response.json()) as AwesomeApiResponse;

    const usdToBrl = Number.parseFloat(data.USDBRL?.bid ?? "0");
    const eurToBrl = Number.parseFloat(data.EURBRL?.bid ?? "0");

    if (!usdToBrl || !eurToBrl) {
      return FALLBACK_RATES;
    }

    const rates: ExchangeRates = {
      usdToBrl,
      eurToBrl,
      fetchedAt: new Date().toISOString(),
    };

    cache = { rates, expiresAt: now + CACHE_TTL_MS };
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}
