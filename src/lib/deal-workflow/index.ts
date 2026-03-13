import { fetchExchangeRates } from "@/lib/exchange-rates";
import { normalizeDateToISO } from "@/lib/deal-workflow/lodging-retry";
import {
  requestStructuredResearch,
  TripResearchError,
} from "@/lib/trip-research/openai";
import type {
  LodgingResearchModel,
  LodgingResearchOption,
  OverseasMarketOffer,
  OverseasResearchResponse,
  OverseasWorkflowInput,
  TicketResearchOption,
  TripPlanResponse,
  TripWorkflowInput,
} from "@/lib/deal-workflow/types";

const SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "url", "note"],
  properties: {
    label: { type: "string" },
    url: { type: "string" },
    note: { type: "string" },
  },
} as const;

const TRANSFER_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "options"],
  properties: {
    summary: { type: "string" },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mode", "description", "estimatedCostOnewayBRL", "sources"],
        properties: {
          id: { type: "string" },
          mode: { type: "string" },
          description: { type: "string" },
          estimatedCostOnewayBRL: { type: "number" },
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA,
          },
        },
      },
    },
  },
} as const;

export type ParaguayTransferOption = {
  id: string;
  mode: string;
  description: string;
  estimatedCostOnewayBRL: number;
  sources: Array<{ label: string; url: string; note: string }>;
};

export type ParaguayTransferResult = {
  summary: string;
  options: ParaguayTransferOption[];
};

const DATE_WINDOW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["start", "end"],
  properties: {
    start: { type: "string" },
    end: { type: "string" },
  },
} as const;

const OVERSEAS_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "recommendedOfferId",
    "offers",
    "warnings",
  ],
  properties: {
    summary: { type: "string" },
    recommendedOfferId: { type: "string" },
    offers: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "region",
          "country",
          "city",
          "airportHint",
          "storeName",
          "purchaseChannel",
          "offerTitle",
          "priceCurrency",
          "priceLocal",
          "priceLocalDisplay",
          "estimatedPriceBRL",
          "estimatedSavingsVsBrazilBRL",
          "stockSignal",
          "whyItWins",
          "caveats",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          region: {
            type: "string",
            enum: ["united_states", "europe", "paraguay"],
          },
          country: { type: "string" },
          city: { type: "string" },
          airportHint: { type: "string" },
          storeName: { type: "string" },
          purchaseChannel: { type: "string" },
          offerTitle: { type: "string" },
          priceCurrency: { type: "string" },
          priceLocal: { type: "number" },
          priceLocalDisplay: { type: "string" },
          estimatedPriceBRL: { type: "number" },
          estimatedSavingsVsBrazilBRL: { type: "number" },
          stockSignal: { type: "string" },
          whyItWins: { type: "string" },
          caveats: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA,
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const TICKET_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "bestTicketId", "ticketOptions", "warnings"],
  properties: {
    summary: { type: "string" },
    bestTicketId: { type: "string" },
    ticketOptions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "departureWindow",
          "returnWindow",
          "tripLengthNights",
          "estimatedRoundTripBRL",
          "displayPrice",
          "typicalCarriers",
          "bookingChannels",
          "whyItWins",
          "tradeoffs",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          departureWindow: DATE_WINDOW_SCHEMA,
          returnWindow: DATE_WINDOW_SCHEMA,
          tripLengthNights: { type: "number" },
          estimatedRoundTripBRL: { type: "number" },
          displayPrice: { type: "string" },
          typicalCarriers: {
            type: "array",
            items: { type: "string" },
          },
          bookingChannels: {
            type: "array",
            items: { type: "string" },
          },
          whyItWins: { type: "string" },
          tradeoffs: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA,
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const LODGING_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "bestLodgingId", "lodgingOptions", "warnings"],
  properties: {
    summary: { type: "string" },
    bestLodgingId: { type: "string" },
    lodgingOptions: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "area",
          "propertyStyle",
          "nightlyDisplay",
          "totalStayDisplay",
          "estimatedTotalStayBRL",
          "accessNotes",
          "whyItWins",
          "bookingChannels",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          area: { type: "string" },
          propertyStyle: { type: "string" },
          nightlyDisplay: { type: "string" },
          totalStayDisplay: { type: "string" },
          estimatedTotalStayBRL: { type: "number" },
          accessNotes: { type: "string" },
          whyItWins: { type: "string" },
          bookingChannels: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          sources: {
            type: "array",
            minItems: 1,
            items: SOURCE_SCHEMA,
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

type OverseasResearchModel = Omit<
  OverseasResearchResponse,
  "generatedAt" | "query" | "referenceProduct" | "brazilReferencePriceBRL"
>;

type TicketResearchModel = {
  summary: string;
  bestTicketId: string;
  ticketOptions: TicketResearchOption[];
  warnings: string[];
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanPositiveNumber(value: unknown) {
  const number =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeOverseasInput(input: unknown): OverseasWorkflowInput {
  if (!input || typeof input !== "object") {
    throw new TripResearchError(
      "A pesquisa internacional requer produto, nome de referência e preço no Brasil.",
      400,
      "invalid_request",
    );
  }

  const payload = input as Record<string, unknown>;
  const query = cleanText(payload.query);
  const referenceProduct = cleanText(payload.referenceProduct);
  const brazilReferencePriceBRL = cleanPositiveNumber(
    payload.brazilReferencePriceBRL,
  );

  if (!query || !referenceProduct || !brazilReferencePriceBRL) {
    throw new TripResearchError(
      "A pesquisa internacional requer produto, nome de referência e preço no Brasil.",
      400,
      "invalid_request",
    );
  }

  return {
    query,
    referenceProduct,
    brazilReferencePriceBRL,
  };
}

function normalizeTripInput(input: unknown): TripWorkflowInput {
  if (!input || typeof input !== "object") {
    throw new TripResearchError(
      "O planejamento de viagem requer origem, viajantes, preferências de estadia e a oferta internacional selecionada.",
      400,
      "invalid_request",
    );
  }

  const payload = input as Record<string, unknown>;
  const productQuery = cleanText(payload.productQuery);
  const origin = cleanText(payload.origin);
  const travelers = cleanText(payload.travelers);
  const stayPreference = cleanText(payload.stayPreference) || undefined;
  const priorities = cleanText(payload.priorities) || undefined;
  const brazilReferencePriceBRL = cleanPositiveNumber(
    payload.brazilReferencePriceBRL,
  );
  const tripLengthNights = cleanPositiveNumber(payload.tripLengthNights);
  const selectedOffer = payload.selectedOffer as OverseasMarketOffer | undefined;

  if (
    !productQuery ||
    !origin ||
    !travelers ||
    !brazilReferencePriceBRL ||
    !tripLengthNights ||
    !selectedOffer?.id
  ) {
    throw new TripResearchError(
      "O planejamento de viagem requer origem, viajantes, noites, preço no Brasil e a oferta internacional selecionada.",
      400,
      "invalid_request",
    );
  }

  return {
    productQuery,
    origin,
    travelers,
    stayPreference,
    priorities,
    brazilReferencePriceBRL,
    tripLengthNights: Math.max(2, Math.min(21, Math.round(tripLengthNights))),
    selectedOffer,
  };
}

function overseasPrompt(
  input: OverseasWorkflowInput,
  rates: { usdToBrl: number; eurToBrl: number; pygToBrl: number; fetchedAt: string },
) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public product prices with live web search.",
    "The buyer is based in Brazil and is comparing Brazil pricing to realistic purchase opportunities in the United States, Europe, and Paraguay.",
    "Return only offers that look plausibly buyable by a traveler, with concrete retailer or marketplace sources.",
    "Favor direct product pages or strong commerce sources.",
    "PARAGUAY CONTEXT: Ciudad del Este is the main electronics hub in Paraguay. Electronics stores there quote prices in USD — ALWAYS use USD prices for Paraguay offers, never Guaraníes (PYG). Products are often 30-50% cheaper than Brazil due to very low import taxes. Include at least one Paraguay option for electronics/tech. For Paraguay offers: region='paraguay', city='Ciudad del Este', airportHint='FOZ (Foz do Iguaçu, BR) — cruzar a Ponte da Amizade'. Note: Brazilian customs allows R$500 duty-free per person (50% flat tax on excess). Use reputable CDE stores like Importados JL, Global Electronics CDE, or similar — avoid 'Shopping China' or marketplace aggregators with unreliable stock.",
    `IMPORTANT: Use ONLY the real-time exchange rates provided below to convert prices to BRL. Do NOT use your own estimated rates.`,
    `Real-time exchange rates (fetched at ${rates.fetchedAt}):`,
    `  USD → BRL: ${rates.usdToBrl.toFixed(4)}`,
    `  EUR → BRL: ${rates.eurToBrl.toFixed(4)}`,
    `  PYG → BRL: ${rates.pygToBrl.toFixed(6)} (only if price is unavoidably in Guaraníes)`,
    "Compute estimatedPriceBRL = priceLocal * exchange_rate. Show the calculation is honest and uses these exact rates.",
    "Use the Brazil reference price to estimate savings for every overseas offer.",
    "If an offer is in Europe, include the city or airport area a traveler would likely target.",
    "",
    `Search query: ${input.query}`,
    `Reference product title: ${input.referenceProduct}`,
    `Brazil reference price: BRL ${input.brazilReferencePriceBRL.toFixed(2)}`,
  ].join("\n");
}

function ticketPromptParaguay(
  input: TripWorkflowInput,
  transfer: ParaguayTransferResult,
): string {
  const hasTransferOptions = transfer.options.length > 0;
  const transferSection = hasTransferOptions
    ? [
        "PONTE DA AMIZADE CROSSING — researched options (prefer these URLs for sources):",
        ...transfer.options.map(
          (t) =>
            `  - ${t.mode}: ${t.description} — R$${t.estimatedCostOnewayBRL} one-way. Source: ${t.sources[0]?.url ?? "n/a"}`,
        ),
      ]
    : [
        "PONTE DA AMIZADE CROSSING — no pre-researched options available; use these known facts:",
        "  - Uber operates in Foz do Iguaçu (uber.com). A trip to the Ponte da Amizade costs ~R$20–40 one-way.",
        "  - Radio Taxi Foz: ~R$30–50 one-way to the Ponte da Amizade.",
        "  - City bus (linha CDE): departs from Terminal Urbano de Foz, costs ~R$6 one-way.",
      ];

  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current Brazilian transport options to Ciudad del Este, Paraguay with live web search.",
    "This is a COST-OPTIMIZATION shopping trip. The traveler's only goal is to cross to Ciudad del Este, buy a product, and return home.",
    "CRITICAL: Set bestTicketId to the option with the LOWEST estimatedRoundTripBRL that has reasonable reliability.",
    "",
    "DESTINATION CONTEXT — Ciudad del Este has NO direct flights from Brazil.",
    "EVERY option MUST include two legs:",
    "  LEG 1 — get to Foz do Iguaçu (bus, flight, or car from origin city)",
    "  LEG 2 — cross Ponte da Amizade to Ciudad del Este (taxi, Uber, or city bus)",
    "Propose 3 concrete options:",
    "  1. ÔNIBUS + TRAVESSIA: overnight bus to Foz (Pluma/Catarinense/JBL via clickbus.com.br or busbuster.com) + Ponte da Amizade crossing",
    "  2. VOO + TRAVESSIA: flight GRU→IGU (LATAM/Azul/GOL via google.com/flights) + Ponte da Amizade crossing",
    "  3. CARRO PRÓPRIO + TRAVESSIA: drive to Foz + Ponte da Amizade crossing",
    "",
    ...transferSection,
    "",
    "RULES FOR PRICES:",
    "  - estimatedRoundTripBRL = LEG1 round-trip + LEG2 round-trip, all in BRL.",
    "  - All prices are BRL — do NOT convert or multiply.",
    "  - CRITICAL: estimatedRoundTripBRL is a plain JSON integer. Write 1200, NOT 1.200 or 'R$1.200'.",
    "  - SANITY CHECK: bus São Paulo→Foz round-trip ≈ R$300–700; flight ≈ R$600–1500; crossing ≈ R$12–100 round-trip. Total should be R$312–R$1600. If below 200, fix it.",
    "  - displayPrice must describe both legs, e.g.: 'R$450 ônibus + R$80 travessia (ida e volta)'",
    "  - Include at least one real source URL per leg (bus/airline for LEG1, crossing service for LEG2).",
    "",
    `Origin: ${input.origin}`,
    `Destination: Ciudad del Este, Paraguay (via Foz do Iguaçu / Ponte da Amizade)`,
    `Travelers: ${input.travelers}`,
    `Trip length: ${input.tripLengthNights} nights`,
    `Selected store: ${input.selectedOffer.storeName}`,
    `Priorities: ${input.priorities ?? "menor custo total de transporte com confiabilidade razoável"}`,
  ].join("\n");
}

function ticketPrompt(
  input: TripWorkflowInput,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
  paraguayTransfer?: ParaguayTransferResult,
): string {
  if (input.selectedOffer.region === "paraguay") {
    return ticketPromptParaguay(
      input,
      paraguayTransfer ?? { summary: "", options: [] },
    );
  }

  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public airfare information with live web search.",
    "This is a COST-OPTIMIZATION shopping trip. The traveler's only goal is to buy a product cheaply and return home.",
    "CRITICAL: Set bestTicketId to the option with the LOWEST estimatedRoundTripBRL that has reasonable reliability.",
    "Do NOT pick a premium or convenient window as best — cheapest viable ticket wins.",
    "FARE CLASS RULE: use economy or basic economy only. Exclude premium economy, business, first class, refundable flex bundles, points fares, and package prices.",
    "PASSENGER RULE: estimatedRoundTripBRL must reflect the total cash airfare for the traveler count in the input, but the source fare itself should still be the cheapest bookable economy fare you can verify.",
    `EXCHANGE RATE CONVERSION — estimatedRoundTripBRL must be the total round-trip cost in BRL:`,
    `  Real-time rates (fetched at ${rates.fetchedAt}):`,
    `    1 USD = ${rates.usdToBrl.toFixed(4)} BRL`,
    `    1 EUR = ${rates.eurToBrl.toFixed(4)} BRL`,
    `  Conversion rules:`,
    `    • Price in USD → multiply by ${rates.usdToBrl.toFixed(4)}  (e.g. US$${Math.round(500)} → R$${Math.round(500 * rates.usdToBrl)})`,
    `    • Price in EUR → multiply by ${rates.eurToBrl.toFixed(4)}`,
    `    • Price already in BRL → use as-is, no multiplication`,
    `  SANITY CHECK: estimatedRoundTripBRL for a GRU intercontinental round-trip should be at least R$2.000. If your result is below R$500, you made a conversion error — fix it.`,
    "",
    "SEASONAL ANALYSIS — before suggesting windows, research and reason about:",
    "  1. Which months/seasons historically have the cheapest fares on this specific route (off-peak, shoulder season).",
    "  2. Which periods to AVOID due to high demand: Brazilian school holidays (July, Dec–Jan), Carnival (Feb/Mar), US/European peak summer (Jun–Aug for North America and Europe), major local holidays.",
    "  3. Sweet-spot booking lead times for this route (e.g. 6-10 weeks out is typically cheapest for transatlantic).",
    "  4. Day-of-week patterns if relevant (Tue/Wed departures are often cheaper).",
    "Use this analysis to propose 3-5 concrete date windows with exact month ranges, ranked cheapest first.",
    "Each window's title must mention the season/reason it is cheap (e.g. 'Maio — baixa temporada transatlântica').",
    "Prefer exact date windows instead of vague seasons.",
    "ROUND-TRIP PRICE RULE: estimatedRoundTripBRL must always be the TOTAL cost for BOTH legs combined (outbound + return).",
    "  - If the site shows a per-leg / one-way price → multiply that price × 2 before converting to BRL.",
    "  - If the site shows an already-combined round-trip price → use it directly.",
    "  - Set displayPrice to describe exactly what you found, e.g.: 'US$400 (ida e volta)' or 'US$200/trecho × 2'.",
    "Every option must include at least one source URL.",
    "",
    `Origin: ${input.origin}`,
    `Destination city: ${input.selectedOffer.city}`,
    `Destination country: ${input.selectedOffer.country}`,
    `Airport hint: ${input.selectedOffer.airportHint}`,
    `Travelers: ${input.travelers}`,
    `Trip length: ${input.tripLengthNights} nights`,
    `Product query: ${input.productQuery}`,
    `Selected overseas store: ${input.selectedOffer.storeName}`,
    `Selected overseas product price: BRL ${input.selectedOffer.estimatedPriceBRL.toFixed(2)}`,
    `Priorities: ${input.priorities ?? "lowest sensible total trip cost with decent reliability"}`,
  ].join("\n");
}

function lodgingPromptParaguay(
  input: TripWorkflowInput,
  featuredTicket: TicketResearchOption,
): string {
  const nights = featuredTicket.tripLengthNights;
  const checkin = normalizeDateToISO(featuredTicket.departureWindow.start);
  const checkout = normalizeDateToISO(featuredTicket.returnWindow.end);

  // Pre-built search URLs the AI must use verbatim — prevents hallucinated property deep-links
  const bookingFoz = `https://www.booking.com/searchresults.html?ss=Foz+do+Igua%C3%A7u%2C+Brazil&checkin=${checkin}&checkout=${checkout}&group_adults=1&no_rooms=1`;
  const airbnbFoz = `https://www.airbnb.com.br/s/Foz-do-Igua%C3%A7u--Paran%C3%A1/homes`;
  const bookingCde = `https://www.booking.com/searchresults.html?ss=Ciudad+del+Este%2C+Paraguay&checkin=${checkin}&checkout=${checkout}&group_adults=1&no_rooms=1`;

  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    `Research budget lodging for a ${nights}-night shopping trip base in Foz do Iguaçu, Brazil (or Ciudad del Este, PY).`,
    "This is a COST-OPTIMIZATION trip. The traveler's only goal: sleep near the Ponte da Amizade, cross to CDE to buy a product, return home.",
    "CRITICAL: bestLodgingId = the option with the LOWEST estimatedTotalStayBRL that is safe and near the Ponte da Amizade.",
    "",
    "LOCATION PRIORITY:",
    "  1. Foz do Iguaçu (BR side) — pay in BRL, no currency risk, 10-15 min taxi to Ponte da Amizade. PREFERRED.",
    "  2. Ciudad del Este (PY side) — USD prices, convert to BRL. Only include if clearly cheaper after conversion.",
    "  Include at least 2 Foz do Iguaçu options and 1 CDE option.",
    "",
    "PRICING RULES:",
    "  - Foz do Iguaçu hotels: prices are in BRL — use as-is.",
    "  - CDE hotels: prices in USD — multiply by current rate (~5.7 BRL/USD) to get BRL.",
    `  - estimatedTotalStayBRL = nightly rate × ${nights} nights, as a plain integer (write 420, not 420.00 or 'R$420').`,
    "  - SANITY CHECK: budget hotel in Foz, 1-2 nights ≈ R$150–R$600 total.",
    "",
    "SOURCES — use ONLY these pre-built search URLs. Copy them exactly as shown. Do NOT invent property deep-links.",
    `  Booking.com Foz do Iguaçu: ${bookingFoz}`,
    `  Airbnb Foz do Iguaçu:      ${airbnbFoz}`,
    `  Booking.com CDE:            ${bookingCde}`,
    "  Use one of the above as the source for each option. No other URLs.",
    "",
    `Trip length: ${nights} nights`,
    `Departure window: ${checkin} → ${checkout}`,
    `Stay preference: ${input.stayPreference ?? "opção mais barata e segura perto da Ponte da Amizade"}`,
    `Traveler priorities: ${input.priorities ?? "minimizar custo total da hospedagem"}`,
  ].join("\n");
}

function lodgingPrompt(
  input: TripWorkflowInput,
  featuredTicket: TicketResearchOption,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
  if (input.selectedOffer.region === "paraguay") {
    return lodgingPromptParaguay(input, featuredTicket);
  }

  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public lodging information with live web search.",
    "This is a COST-OPTIMIZATION shopping trip, NOT a leisure vacation. The traveler's only goal is to buy a product cheaply and return home.",
    "CRITICAL: Set bestLodgingId to the option with the LOWEST estimatedTotalStayBRL that is still safe and has reasonable transport access.",
    "Do NOT pick a central or premium location as best just because it is convenient — cheapest safe option wins.",
    "Sort your thinking: rank options by total cost ascending; pick the cheapest as bestLodgingId.",
    `EXCHANGE RATE CONVERSION — estimatedTotalStayBRL must be the total stay cost in BRL:`,
    `  Real-time rates (fetched at ${rates.fetchedAt}):`,
    `    1 USD = ${rates.usdToBrl.toFixed(4)} BRL`,
    `    1 EUR = ${rates.eurToBrl.toFixed(4)} BRL`,
    `  Conversion rules:`,
    `    • Price in USD → multiply by ${rates.usdToBrl.toFixed(4)}  (e.g. US$${Math.round(80)}/night × 3 nights → R$${Math.round(80 * 3 * rates.usdToBrl)})`,
    `    • Price in EUR → multiply by ${rates.eurToBrl.toFixed(4)}`,
    `    • Price already in BRL → use as-is, no multiplication`,
    `  SANITY CHECK: estimatedTotalStayBRL for a multi-night stay should be at least R$300. If your result is below R$100, you made a conversion error — fix it.`,
    "  estimatedTotalStayBRL is a plain JSON integer (write 1200, NOT 1.200 or 'R$1.200').",
    "SOURCES — use ONLY these pre-built search URLs. Copy them exactly. Do NOT invent property deep-links (they 404).",
    `  Booking.com: https://www.booking.com/searchresults.html?ss=${encodeURIComponent(input.selectedOffer.city + ", " + input.selectedOffer.country)}&checkin=${normalizeDateToISO(featuredTicket.departureWindow.start)}&checkout=${normalizeDateToISO(featuredTicket.returnWindow.end)}&group_adults=1&no_rooms=1`,
    `  Airbnb:      https://www.airbnb.com/s/${encodeURIComponent(input.selectedOffer.city)}/homes`,
    "  Use one of the two above as the source for each lodging option. No other URLs.",
    "",
    `Destination city: ${input.selectedOffer.city}`,
    `Destination country: ${input.selectedOffer.country}`,
    `Stay preference: ${input.stayPreference ?? "cheapest safe option with reasonable public transport access"}`,
    `Trip length: ${featuredTicket.tripLengthNights} nights`,
    `Featured ticket departure window: ${featuredTicket.departureWindow.start} to ${featuredTicket.departureWindow.end}`,
    `Featured ticket return window: ${featuredTicket.returnWindow.start} to ${featuredTicket.returnWindow.end}`,
    `Featured ticket estimated BRL: ${featuredTicket.estimatedRoundTripBRL.toFixed(2)}`,
    `Traveler priorities: ${input.priorities ?? "minimize total trip cost"}`,
  ].join("\n");
}

function recalcOfferBRL(
  offer: OverseasMarketOffer,
  rates: { usdToBrl: number; eurToBrl: number; pygToBrl: number },
  brazilReferencePriceBRL: number,
): OverseasMarketOffer {
  const rate = exchangeRateForCurrency(offer.priceCurrency, rates);

  if (rate !== null && offer.priceLocal > 0) {
    const estimatedPriceBRL = Math.round(offer.priceLocal * rate);
    return {
      ...offer,
      estimatedPriceBRL,
      estimatedSavingsVsBrazilBRL: brazilReferencePriceBRL - estimatedPriceBRL,
    };
  }

  // Unknown currency — keep AI value but flag it
  return offer;
}

function ensureUniqueId(baseId: string, seenCounts: Map<string, number>): string {
  const trimmed = baseId.trim();
  const count = seenCounts.get(trimmed) ?? 0;
  seenCounts.set(trimmed, count + 1);
  return count === 0 ? trimmed : `${trimmed}-${count + 1}`;
}

export function normalizeOverseasOffers(
  offers: OverseasMarketOffer[],
  recommendedOfferId: string,
): {
  offers: OverseasMarketOffer[];
  recommendedOfferId: string;
} {
  const seenCounts = new Map<string, number>();
  let nextRecommendedOfferId = recommendedOfferId;
  let preferredMatched = false;

  const normalizedOffers = offers.map((offer, index) => {
    const fallbackId = `offer-${index + 1}`;
    const rawId = offer.id.trim() || fallbackId;
    const uniqueId = ensureUniqueId(rawId, seenCounts);

    if (!preferredMatched && offer.id === recommendedOfferId) {
      nextRecommendedOfferId = uniqueId;
      preferredMatched = true;
    }

    return uniqueId === offer.id ? offer : { ...offer, id: uniqueId };
  });

  if (!normalizedOffers.some((offer) => offer.id === nextRecommendedOfferId)) {
    nextRecommendedOfferId = normalizedOffers[0]?.id ?? recommendedOfferId;
  }

  return {
    offers: normalizedOffers,
    recommendedOfferId: nextRecommendedOfferId,
  };
}

function exchangeRateForCurrency(
  currency: string | undefined,
  rates: { usdToBrl: number; eurToBrl: number; pygToBrl?: number },
): number | null {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === "USD" || normalized === "US$" || normalized === "US") {
    return rates.usdToBrl;
  }
  if (normalized === "EUR" || normalized === "€") {
    return rates.eurToBrl;
  }
  if (normalized === "PYG" || normalized === "GS" || normalized === "GS.") {
    return rates.pygToBrl ?? null;
  }
  if (normalized === "BRL" || normalized === "R$") {
    return 1;
  }

  return null;
}

function parseLocalizedMoneyAmount(raw: string): number | null {
  let normalized = raw.trim().replace(/\s+/g, "");
  if (!normalized) return null;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = normalized.split(",");
    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/,/g, "")}.${parts[1]}`
        : normalized.replace(/,/g, "");
  } else if (hasDot) {
    const parts = normalized.split(".");
    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/\./g, "")}.${parts[1]}`
        : normalized.replace(/\./g, "");
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

type ParsedDisplayMoney = {
  currency: string;
  amount: number;
};

function extractDisplayMoney(displayPrice: string): ParsedDisplayMoney[] {
  const pattern = /(R\$|US\$|USD|EUR|€)\s*([\d.,]+)/gi;
  const matches: ParsedDisplayMoney[] = [];

  for (const match of displayPrice.matchAll(pattern)) {
    const amount = parseLocalizedMoneyAmount(match[2] ?? "");
    if (!amount) continue;
    matches.push({
      currency: match[1] ?? "",
      amount,
    });
  }

  return matches;
}

export function estimateDisplayPriceBRL(
  displayPrice: string,
  rates: { usdToBrl: number; eurToBrl: number; pygToBrl?: number },
): number | null {
  const normalizedDisplay = displayPrice.trim();
  if (!normalizedDisplay) return null;

  const moneyParts = extractDisplayMoney(normalizedDisplay);
  if (moneyParts.length === 0) return null;

  const looksLikeRange =
    moneyParts.length > 1 &&
    !/[+]/.test(normalizedDisplay) &&
    /(?:\ba\b|[-–])/i.test(normalizedDisplay);
  if (looksLikeRange) return null;

  const converted = moneyParts.map((part) => {
    const rate = exchangeRateForCurrency(part.currency, rates);
    return rate === null ? null : part.amount * rate;
  });

  if (converted.some((value) => value === null)) return null;

  let total = 0;
  if (converted.length === 1) {
    total = converted[0] ?? 0;
    const isPerLeg =
      /(?:\/\s*trecho|por trecho|one-way|per leg|cada trecho)/i.test(
        normalizedDisplay,
      ) && !/ida\s*e\s*volta/i.test(normalizedDisplay);
    const explicitRoundTripMultiplier = /(?:x|×)\s*2|2\s*(?:x|×)/i.test(
      normalizedDisplay,
    );
    if (isPerLeg && explicitRoundTripMultiplier) {
      total *= 2;
    }
  } else if (/[+]/.test(normalizedDisplay)) {
    total = converted.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    );
  } else {
    return null;
  }

  return total > 0 ? Math.round(total) : null;
}

export function normalizeTicketResearch(
  tickets: TicketResearchModel,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
): TicketResearchModel {
  let correctedCount = 0;

  const ticketOptions = tickets.ticketOptions.map((ticket) => {
    const estimatedFromDisplay = estimateDisplayPriceBRL(ticket.displayPrice, rates);
    if (estimatedFromDisplay === null || estimatedFromDisplay <= 0) {
      return ticket;
    }

    if (estimatedFromDisplay !== ticket.estimatedRoundTripBRL) {
      correctedCount += 1;
    }

    return {
      ...ticket,
      estimatedRoundTripBRL: estimatedFromDisplay,
    };
  });

  const rankedCandidates =
    ticketOptions.filter((ticket) => ticket.confidence !== "low").length > 0
      ? ticketOptions.filter((ticket) => ticket.confidence !== "low")
      : ticketOptions;
  const bestTicket =
    [...rankedCandidates].sort(
      (a, b) => a.estimatedRoundTripBRL - b.estimatedRoundTripBRL,
    )[0] ?? ticketOptions[0];

  const warnings =
    correctedCount > 0
      ? [
          ...tickets.warnings,
          `${correctedCount} tarifa(s) foram normalizadas para alinhar o valor em BRL ao preço exibido nas fontes.`,
        ]
      : tickets.warnings;

  return {
    ...tickets,
    bestTicketId: bestTicket?.id ?? tickets.bestTicketId,
    ticketOptions,
    warnings,
  };
}

function transferPrompt(origin: string): string {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research REAL, currently bookable transfer and crossing options from Foz do Iguaçu, Brazil to Ciudad del Este, Paraguay.",
    "Focus on: taxis (Radio Taxi Foz, Ligue Táxi), ride-hailing apps (Uber availability in Foz do Iguaçu), shuttle/van services, and the city bus that crosses Ponte da Amizade.",
    "Do NOT include options that require prior hotel booking or tour operators.",
    "CRITICAL — sources must be REAL, WORKING URLs you are highly confident exist (official taxi/app pages, government info, or verified news). If you are not sure a URL works, use a well-known domain like uber.com or the official city bus info page.",
    "estimatedCostOnewayBRL is ONE WAY cost in BRL — a plain integer (write 40, NOT 40.00 or 'R$40').",
    "SANITY CHECK: a taxi or Uber from central Foz to Ponte da Amizade should cost R$15–R$60 one way. A city bus should be under R$10.",
    "",
    `Traveler origin city (for context only): ${origin}`,
    "Destination crossing point: Ponte da Amizade, from Foz do Iguaçu (BR) to Ciudad del Este (PY)",
  ].join("\n");
}

export async function researchParaguayTransfer(
  origin: string,
): Promise<ParaguayTransferResult> {
  return requestStructuredResearch<ParaguayTransferResult>({
    schemaName: "paraguay_transfer_research",
    schema: TRANSFER_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous travel analyst. Use live web search and only return sources you are highly confident are real and working.",
    input: transferPrompt(origin),
  });
}

export async function researchOverseasProduct(input: unknown) {
  const normalized = normalizeOverseasInput(input);
  const rates = await fetchExchangeRates();
  const result = await requestStructuredResearch<OverseasResearchModel>({
    schemaName: "overseas_product_research",
    schema: OVERSEAS_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous shopping analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: overseasPrompt(normalized, rates),
  });

  // Recalculate BRL prices deterministically from priceLocal + priceCurrency
  // so AI currency conversion errors don't propagate to the UI.
  const correctedOffers = result.offers.map((offer) =>
    recalcOfferBRL(offer, rates, normalized.brazilReferencePriceBRL),
  );
  const normalizedOffers = normalizeOverseasOffers(
    correctedOffers,
    result.recommendedOfferId,
  );

  return {
    generatedAt: new Date().toISOString(),
    query: normalized.query,
    referenceProduct: normalized.referenceProduct,
    brazilReferencePriceBRL: normalized.brazilReferencePriceBRL,
    summary: result.summary,
    recommendedOfferId: normalizedOffers.recommendedOfferId,
    offers: normalizedOffers.offers,
    warnings: result.warnings,
  } satisfies OverseasResearchResponse;
}

export async function researchTicketWindows(
  input: unknown,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
  paraguayTransfer?: ParaguayTransferResult,
) {
  const normalized = normalizeTripInput(input);
  const rawTickets = await requestStructuredResearch<TicketResearchModel>({
    schemaName: "shopping_trip_ticket_research",
    schema: TICKET_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous travel analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: ticketPrompt(normalized, rates, paraguayTransfer),
  });
  const tickets = normalizeTicketResearch(rawTickets, rates);

  return {
    input: normalized,
    tickets,
  };
}

export async function researchLodgingStrategies(
  input: TripWorkflowInput,
  featuredTicket: TicketResearchOption,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
  const isParaguay = input.selectedOffer.region === "paraguay";
  return requestStructuredResearch<LodgingResearchModel>({
    schemaName: "shopping_trip_lodging_research",
    schema: LODGING_RESEARCH_SCHEMA,
    instructions: isParaguay
      ? "You are a Brazilian domestic travel specialist. The traveler is staying in Foz do Iguaçu, Brazil — a Brazilian city. Search booking platforms for hotels in Foz do Iguaçu (BR). Use search page URLs from booking.com, airbnb.com.br, or hotels.com — never deep-link to specific property pages as those URLs are unreliable. Return only the requested JSON schema."
      : "You are a rigorous international lodging analyst. Use live web search, favor current sources, use search page URLs (never specific property deep-links which often 404), and return only the requested JSON schema.",
    input: lodgingPrompt(input, featuredTicket, rates),
  });
}

export async function researchTripWorkflow(
  input: unknown,
): Promise<TripPlanResponse> {
  const rates = await fetchExchangeRates();
  const { input: normalized, tickets } = await researchTicketWindows(input, rates);
  const featuredTicket =
    tickets.ticketOptions.find((item) => item.id === tickets.bestTicketId) ??
    tickets.ticketOptions[0];

  if (!featuredTicket) {
    throw new TripResearchError(
      "A pesquisa de passagens não retornou janelas de voo utilizáveis.",
      502,
      "invalid_response",
    );
  }

  const lodging = await researchLodgingStrategies(normalized, featuredTicket, rates);

  const featuredLodging =
    lodging.lodgingOptions.find((item) => item.id === lodging.bestLodgingId) ??
    lodging.lodgingOptions[0];

  if (!featuredLodging) {
    throw new TripResearchError(
      "A pesquisa de hospedagem não retornou opções utilizáveis.",
      502,
      "invalid_response",
    );
  }

  const estimatedTripSpendBRL =
    normalized.selectedOffer.estimatedPriceBRL +
    featuredTicket.estimatedRoundTripBRL +
    featuredLodging.estimatedTotalStayBRL;

  return {
    generatedAt: new Date().toISOString(),
    origin: normalized.origin,
    destinationCity: normalized.selectedOffer.city,
    destinationCountry: normalized.selectedOffer.country,
    productOfferId: normalized.selectedOffer.id,
    summary: `${tickets.summary} ${lodging.summary}`.trim(),
    bestTicketId: featuredTicket.id,
    bestLodgingId: featuredLodging.id,
    ticketOptions: tickets.ticketOptions,
    lodgingOptions: lodging.lodgingOptions,
    productPriceBRL: normalized.selectedOffer.estimatedPriceBRL,
    estimatedTripSpendBRL,
    estimatedSavingsVsBrazilBRL:
      normalized.brazilReferencePriceBRL - estimatedTripSpendBRL,
    recommendation:
      estimatedTripSpendBRL < normalized.brazilReferencePriceBRL
        ? "A viagem ainda pode valer financeiramente se você conseguir fechar o produto e a janela sugeridos."
        : "Com os custos atuais, a viagem parece mais cara do que comprar no Brasil, a menos que existam outros motivos para ir.",
    warnings: [...tickets.warnings, ...lodging.warnings],
  };
}

export { TripResearchError } from "@/lib/trip-research/openai";
