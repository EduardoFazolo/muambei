import { fetchExchangeRates } from "@/lib/exchange-rates";
import {
  requestStructuredResearch,
  TripResearchError,
} from "@/lib/trip-research/openai";
import type {
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

type LodgingResearchModel = {
  summary: string;
  bestLodgingId: string;
  lodgingOptions: LodgingResearchOption[];
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
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public product prices with live web search.",
    "The buyer is based in Brazil and is comparing Brazil pricing to realistic purchase opportunities in the United States, Europe, and Paraguay.",
    "Return only offers that look plausibly buyable by a traveler, with concrete retailer or marketplace sources.",
    "Favor direct product pages or strong commerce sources.",
    "PARAGUAY CONTEXT: Ciudad del Este is the main electronics hub in Paraguay. Products sold there are often 30-50% cheaper than Brazil due to very low import taxes (Paraguay has some of the lowest in South America). Include at least one Paraguay option when the product is likely available there (electronics, tech, perfumes, alcohol, cigarettes). For Paraguay offers, use region='paraguay', city='Ciudad del Este', airportHint='FOZ (Foz do Iguaçu, BR) — cruzar a Ponte da Amizade'. Note that travelers bring goods across the border informally and Brazilian customs allows R$500 duty-free per person (or up to R$1.000 with 50% flat tax on the excess).",
    `IMPORTANT: Use ONLY the real-time exchange rates provided below to convert prices to BRL. Do NOT use your own estimated rates.`,
    `Real-time exchange rates (fetched at ${rates.fetchedAt}):`,
    `  USD → BRL: ${rates.usdToBrl.toFixed(4)}`,
    `  EUR → BRL: ${rates.eurToBrl.toFixed(4)}`,
    "Compute estimatedPriceBRL = priceLocal * exchange_rate. Show the calculation is honest and uses these exact rates.",
    "Use the Brazil reference price to estimate savings for every overseas offer.",
    "If an offer is in Europe, include the city or airport area a traveler would likely target.",
    "",
    `Search query: ${input.query}`,
    `Reference product title: ${input.referenceProduct}`,
    `Brazil reference price: BRL ${input.brazilReferencePriceBRL.toFixed(2)}`,
  ].join("\n");
}

function ticketPrompt(
  input: TripWorkflowInput,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public airfare information with live web search.",
    "This is a COST-OPTIMIZATION shopping trip. The traveler's only goal is to buy a product cheaply and return home.",
    "CRITICAL: Set bestTicketId to the option with the LOWEST estimatedRoundTripBRL that has reasonable reliability.",
    "Do NOT pick a premium or convenient window as best — cheapest viable ticket wins.",
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
    "Use BRL estimates for total round-trip airfare.",
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

function lodgingPrompt(
  input: TripWorkflowInput,
  featuredTicket: TicketResearchOption,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
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
    "Use BRL estimates for the total stay. Every option must include at least one source URL.",
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

  return {
    generatedAt: new Date().toISOString(),
    query: normalized.query,
    referenceProduct: normalized.referenceProduct,
    brazilReferencePriceBRL: normalized.brazilReferencePriceBRL,
    summary: result.summary,
    recommendedOfferId: result.recommendedOfferId,
    offers: result.offers,
    warnings: result.warnings,
  } satisfies OverseasResearchResponse;
}

export async function researchTicketWindows(
  input: unknown,
  rates: { usdToBrl: number; eurToBrl: number; fetchedAt: string },
) {
  const normalized = normalizeTripInput(input);
  const tickets = await requestStructuredResearch<TicketResearchModel>({
    schemaName: "shopping_trip_ticket_research",
    schema: TICKET_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous travel analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: ticketPrompt(normalized, rates),
  });

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
  return requestStructuredResearch<LodgingResearchModel>({
    schemaName: "shopping_trip_lodging_research",
    schema: LODGING_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous lodging analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
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
