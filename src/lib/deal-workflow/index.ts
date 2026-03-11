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
            enum: ["united_states", "europe"],
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
      "Overseas research requires query, product name, and Brazil price.",
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
      "Overseas research requires query, product name, and Brazil price.",
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
      "Trip workflow requires origin, travelers, stay inputs, and the selected overseas offer.",
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
      "Trip workflow requires origin, travelers, nights, Brazil price, and the selected overseas offer.",
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

function overseasPrompt(input: OverseasWorkflowInput) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public product prices with live web search.",
    "The buyer is based in Brazil and is comparing Brazil pricing to realistic purchase opportunities in the United States and Europe.",
    "Return only offers that look plausibly buyable by a traveler, with concrete retailer or marketplace sources.",
    "Favor direct product pages or strong commerce sources.",
    "Estimate BRL equivalents conservatively.",
    "Use the Brazil reference price to estimate savings for every overseas offer.",
    "If an offer is in Europe, include the city or airport area a traveler would likely target.",
    "",
    `Search query: ${input.query}`,
    `Reference product title: ${input.referenceProduct}`,
    `Brazil reference price: BRL ${input.brazilReferencePriceBRL.toFixed(2)}`,
  ].join("\n");
}

function ticketPrompt(input: TripWorkflowInput) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public airfare information with live web search.",
    "The user wants the best cost-benefit trip specifically to buy the product below.",
    "Find the strongest value flight windows over the next 12 months.",
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
) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public lodging information with live web search.",
    "Recommend practical areas and lodging strategies for a cost-benefit shopping trip.",
    "Use the featured ticket window as the basis for the stay.",
    "Return lodging options that are plausible for a traveler who wants to keep the full trip cost low.",
    "Use BRL estimates for the total stay.",
    "Every option must include at least one source URL.",
    "",
    `Destination city: ${input.selectedOffer.city}`,
    `Destination country: ${input.selectedOffer.country}`,
    `Stay preference: ${input.stayPreference ?? "simple, safe, well-located place with strong value"}`,
    `Trip length: ${featuredTicket.tripLengthNights} nights`,
    `Featured ticket departure window: ${featuredTicket.departureWindow.start} to ${featuredTicket.departureWindow.end}`,
    `Featured ticket return window: ${featuredTicket.returnWindow.start} to ${featuredTicket.returnWindow.end}`,
    `Featured ticket estimated BRL: ${featuredTicket.estimatedRoundTripBRL.toFixed(2)}`,
  ].join("\n");
}

export async function researchOverseasProduct(input: unknown) {
  const normalized = normalizeOverseasInput(input);
  const result = await requestStructuredResearch<OverseasResearchModel>({
    schemaName: "overseas_product_research",
    schema: OVERSEAS_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous shopping analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: overseasPrompt(normalized),
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

export async function researchTicketWindows(input: unknown) {
  const normalized = normalizeTripInput(input);
  const tickets = await requestStructuredResearch<TicketResearchModel>({
    schemaName: "shopping_trip_ticket_research",
    schema: TICKET_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous travel analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: ticketPrompt(normalized),
  });

  return {
    input: normalized,
    tickets,
  };
}

export async function researchLodgingStrategies(
  input: TripWorkflowInput,
  featuredTicket: TicketResearchOption,
) {
  return requestStructuredResearch<LodgingResearchModel>({
    schemaName: "shopping_trip_lodging_research",
    schema: LODGING_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous lodging analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: lodgingPrompt(input, featuredTicket),
  });
}

export async function researchTripWorkflow(
  input: unknown,
): Promise<TripPlanResponse> {
  const { input: normalized, tickets } = await researchTicketWindows(input);
  const featuredTicket =
    tickets.ticketOptions.find((item) => item.id === tickets.bestTicketId) ??
    tickets.ticketOptions[0];

  if (!featuredTicket) {
    throw new TripResearchError(
      "Ticket research did not return usable flight windows.",
      502,
      "invalid_response",
    );
  }

  const lodging = await researchLodgingStrategies(normalized, featuredTicket);

  const featuredLodging =
    lodging.lodgingOptions.find((item) => item.id === lodging.bestLodgingId) ??
    lodging.lodgingOptions[0];

  if (!featuredLodging) {
    throw new TripResearchError(
      "Lodging research did not return usable options.",
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
        ? "A viagem ainda pode valer financeiramente se voce realmente conseguir fechar o produto e a janela sugeridos."
        : "Com os custos atuais, a viagem parece pior do que comprar no Brasil, a menos que existam outros motivos para ir.",
    warnings: [...tickets.warnings, ...lodging.warnings],
  };
}

export { TripResearchError } from "@/lib/trip-research/openai";
