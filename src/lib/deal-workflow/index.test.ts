import { describe, expect, test } from "bun:test";

import {
  estimateDisplayPriceBRL,
  normalizeTicketResearch,
  normalizeOverseasOffers,
} from "./index";

const rates = {
  usdToBrl: 5.3,
  eurToBrl: 6.1,
  fetchedAt: "2026-03-13T00:00:00.000Z",
};

describe("estimateDisplayPriceBRL", () => {
  test("converts a single round-trip USD fare to BRL", () => {
    expect(estimateDisplayPriceBRL("US$2.576 (ida e volta)", rates)).toBe(
      Math.round(2576 * 5.3),
    );
  });

  test("doubles a one-way per-leg fare when the display says x2", () => {
    expect(estimateDisplayPriceBRL("US$200/trecho × 2", rates)).toBe(
      Math.round(200 * 2 * 5.3),
    );
  });

  test("sums additive BRL components", () => {
    expect(
      estimateDisplayPriceBRL(
        "R$450 ônibus + R$80 travessia (ida e volta)",
        rates,
      ),
    ).toBe(530);
  });

  test("ignores ranged prices that are not exact fares", () => {
    expect(estimateDisplayPriceBRL("US$400 - US$600", rates)).toBeNull();
  });
});

describe("normalizeTicketResearch", () => {
  test("recomputes inconsistent ticket BRL values and updates bestTicketId", () => {
    const normalized = normalizeTicketResearch(
      {
        summary: "tickets",
        bestTicketId: "expensive",
        warnings: [],
        ticketOptions: [
          {
            id: "expensive",
            title: "Expensive ticket",
            departureWindow: { start: "2026-03-25", end: "2026-03-25" },
            returnWindow: { start: "2026-04-06", end: "2026-04-06" },
            tripLengthNights: 6,
            estimatedRoundTripBRL: 13600,
            displayPrice: "US$200 (ida e volta)",
            typicalCarriers: ["Copa Airlines"],
            bookingChannels: ["Google Flights"],
            whyItWins: "",
            tradeoffs: [],
            confidence: "high" as const,
            sources: [{ label: "Google Flights", url: "https://google.com/travel/flights", note: "" }],
          },
          {
            id: "fallback",
            title: "Fallback ticket",
            departureWindow: { start: "2026-04-10", end: "2026-04-10" },
            returnWindow: { start: "2026-04-16", end: "2026-04-16" },
            tripLengthNights: 6,
            estimatedRoundTripBRL: 1800,
            displayPrice: "R$1.800 (ida e volta)",
            typicalCarriers: ["LATAM"],
            bookingChannels: ["Google Flights"],
            whyItWins: "",
            tradeoffs: [],
            confidence: "medium" as const,
            sources: [{ label: "Google Flights", url: "https://google.com/travel/flights", note: "" }],
          },
        ],
      },
      rates,
    );

    expect(normalized.ticketOptions[0]?.estimatedRoundTripBRL).toBe(
      Math.round(200 * 5.3),
    );
    expect(normalized.bestTicketId).toBe("expensive");
    expect(normalized.warnings).toHaveLength(1);
  });
});

describe("normalizeOverseasOffers", () => {
  test("deduplicates repeated offer ids and remaps the recommended id", () => {
    const normalized = normalizeOverseasOffers(
      [
        {
          id: "turn0search4",
          region: "united_states",
          country: "United States",
          city: "Miami",
          airportHint: "MIA",
          storeName: "Store A",
          purchaseChannel: "online",
          offerTitle: "Product A",
          priceCurrency: "USD",
          priceLocal: 499,
          priceLocalDisplay: "US$499",
          estimatedPriceBRL: 2645,
          estimatedSavingsVsBrazilBRL: 500,
          stockSignal: "in stock",
          whyItWins: "",
          caveats: [],
          confidence: "high",
          sources: [],
        },
        {
          id: "turn0search4",
          region: "europe",
          country: "Portugal",
          city: "Lisboa",
          airportHint: "LIS",
          storeName: "Store B",
          purchaseChannel: "online",
          offerTitle: "Product B",
          priceCurrency: "EUR",
          priceLocal: 480,
          priceLocalDisplay: "€480",
          estimatedPriceBRL: 2928,
          estimatedSavingsVsBrazilBRL: 217,
          stockSignal: "limited",
          whyItWins: "",
          caveats: [],
          confidence: "medium",
          sources: [],
        },
      ],
      "turn0search4",
    );

    expect(normalized.offers[0]?.id).toBe("turn0search4");
    expect(normalized.offers[1]?.id).toBe("turn0search4-2");
    expect(new Set(normalized.offers.map((offer) => offer.id)).size).toBe(2);
    expect(normalized.recommendedOfferId).toBe("turn0search4");
  });
});
