import {
  requestStructuredResearch,
  TripResearchError,
} from "@/lib/trip-research/openai";
import type {
  HousingResearch,
  TicketResearch,
  TicketResearchOption,
  TripResearchRequest,
  TripResearchResponse,
} from "@/lib/trip-research/types";

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

const TICKET_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "bestWindowId", "options", "caveats"],
  properties: {
    summary: { type: "string" },
    bestWindowId: { type: "string" },
    options: {
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
          "priceRange",
          "typicalCarriers",
          "bookingChannels",
          "whyItIsCheaper",
          "dealSignals",
          "tradeoffs",
          "bestFor",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          departureWindow: DATE_WINDOW_SCHEMA,
          returnWindow: DATE_WINDOW_SCHEMA,
          tripLengthNights: { type: "number" },
          priceRange: { type: "string" },
          typicalCarriers: {
            type: "array",
            items: { type: "string" },
          },
          bookingChannels: {
            type: "array",
            items: { type: "string" },
          },
          whyItIsCheaper: { type: "string" },
          dealSignals: {
            type: "array",
            items: { type: "string" },
          },
          tradeoffs: {
            type: "array",
            items: { type: "string" },
          },
          bestFor: { type: "string" },
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
    caveats: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const HOUSING_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "derivedFromTicketId",
    "stayWindow",
    "options",
    "caveats",
  ],
  properties: {
    summary: { type: "string" },
    derivedFromTicketId: { type: "string" },
    stayWindow: {
      type: "object",
      additionalProperties: false,
      required: ["checkIn", "checkOut", "nights"],
      properties: {
        checkIn: DATE_WINDOW_SCHEMA,
        checkOut: DATE_WINDOW_SCHEMA,
        nights: { type: "number" },
      },
    },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "area",
          "nightlyRange",
          "totalStayRange",
          "propertyStyle",
          "whyStayHere",
          "accessNotes",
          "bookingAdvice",
          "idealTraveler",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          area: { type: "string" },
          nightlyRange: { type: "string" },
          totalStayRange: { type: "string" },
          propertyStyle: { type: "string" },
          whyStayHere: { type: "string" },
          accessNotes: { type: "string" },
          bookingAdvice: {
            type: "array",
            items: { type: "string" },
          },
          idealTraveler: { type: "string" },
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
    caveats: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanMonth(value: unknown) {
  const month = cleanText(value);
  return /^\d{4}-\d{2}$/.test(month) ? month : undefined;
}

function cleanPositiveInteger(value: unknown, fallback: number) {
  const number =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(30, Math.max(2, Math.round(number)));
}

function pickMonth(
  payload: Record<string, unknown>,
  primary: string,
  fallback: string,
) {
  return cleanMonth(payload[primary] ?? payload[fallback]);
}

function normalizeTripRequest(input: unknown): TripResearchRequest {
  if (!input || typeof input !== "object") {
    throw new TripResearchError(
      "Trip research requires a JSON body with origin and destination.",
      400,
      "invalid_request",
    );
  }

  const payload = input as Record<string, unknown>;
  const origin = cleanText(payload.origin);
  const destination = cleanText(payload.destination);

  if (!origin || !destination) {
    throw new TripResearchError(
      "Origin and destination are required for trip research.",
      400,
      "invalid_request",
    );
  }

  const earliestDepartureMonth = pickMonth(
    payload,
    "earliestDepartureMonth",
    "earliestDeparture",
  );
  const latestDepartureMonth = pickMonth(
    payload,
    "latestDepartureMonth",
    "latestDeparture",
  );

  if (
    earliestDepartureMonth &&
    latestDepartureMonth &&
    earliestDepartureMonth > latestDepartureMonth
  ) {
    throw new TripResearchError(
      "Earliest departure month must be before or equal to the latest departure month.",
      400,
      "invalid_request",
    );
  }

  return {
    origin,
    destination,
    earliestDepartureMonth,
    latestDepartureMonth,
    tripLengthNights: cleanPositiveInteger(payload.tripLengthNights, 7),
    cabinClass: cleanText(payload.cabinClass) || undefined,
    travelers: cleanText(payload.travelers) || undefined,
    budgetNotes: cleanText(payload.budgetNotes) || undefined,
    priorities: cleanText(payload.priorities) || undefined,
    lodgingPreferences:
      cleanText(payload.lodgingPreferences ?? payload.lodgingStyle) || undefined,
  };
}

function renderBrief(brief: TripResearchRequest) {
  return [
    `Origin: ${brief.origin}`,
    `Destination: ${brief.destination}`,
    `Earliest departure month: ${brief.earliestDepartureMonth ?? "flexible"}`,
    `Latest departure month: ${brief.latestDepartureMonth ?? "flexible"}`,
    `Trip length: ${brief.tripLengthNights} nights`,
    `Cabin: ${brief.cabinClass ?? "economy or best-value fare"}`,
    `Travelers: ${brief.travelers ?? "not specified"}`,
    `Budget notes: ${brief.budgetNotes ?? "none"}`,
    `Priorities: ${brief.priorities ?? "lowest viable total trip cost"}`,
    `Lodging preferences: ${brief.lodgingPreferences ?? "good value, safe, well-located"}`,
  ].join("\n");
}

function ticketResearchPrompt(brief: TripResearchRequest) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public airfare information with web search.",
    "Focus on the best-value windows over the next 12 months for this route.",
    "Prioritize cheaper shoulder-season or off-season opportunities when they are defensible.",
    "Name likely airlines, agencies, or search channels that repeatedly surface the deal.",
    "Use date windows, not vague seasons.",
    "Every option must include at least one direct source URL.",
    "Be explicit about tradeoffs and confidence instead of pretending certainty.",
    "",
    renderBrief(brief),
  ].join("\n");
}

function housingResearchPrompt(
  brief: TripResearchRequest,
  featuredTicket: TicketResearchOption,
) {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Research current public lodging information with web search.",
    "The stay recommendations must use the travel window derived from the selected best ticket option below.",
    "Recommend neighborhoods or stay strategies that balance price, safety, transit, and overall value.",
    "Use direct source URLs for every option and keep advice practical.",
    "",
    renderBrief(brief),
    "",
    `Selected ticket id: ${featuredTicket.id}`,
    `Selected ticket: ${featuredTicket.title}`,
    `Departure window: ${featuredTicket.departureWindow.start} to ${featuredTicket.departureWindow.end}`,
    `Return window: ${featuredTicket.returnWindow.start} to ${featuredTicket.returnWindow.end}`,
    `Trip length: ${featuredTicket.tripLengthNights} nights`,
    `Ticket price range: ${featuredTicket.priceRange}`,
  ].join("\n");
}

async function researchTickets(brief: TripResearchRequest) {
  return requestStructuredResearch<TicketResearch>({
    schemaName: "ticket_research",
    schema: TICKET_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous travel research analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: ticketResearchPrompt(brief),
  });
}

async function researchHousing(
  brief: TripResearchRequest,
  featuredTicket: TicketResearchOption,
) {
  return requestStructuredResearch<HousingResearch>({
    schemaName: "housing_research",
    schema: HOUSING_RESEARCH_SCHEMA,
    instructions:
      "You are a rigorous lodging research analyst. Use live web search, favor current sources, and return only the requested JSON schema.",
    input: housingResearchPrompt(brief, featuredTicket),
  });
}

export async function researchTripPlan(
  input: unknown,
): Promise<TripResearchResponse> {
  const brief = normalizeTripRequest(input);
  const ticketResearch = await researchTickets(brief);
  const featuredTicket =
    ticketResearch.options.find(
      (option) => option.id === ticketResearch.bestWindowId,
    ) ?? ticketResearch.options[0];

  if (!featuredTicket) {
    throw new TripResearchError(
      "Ticket research did not return any usable options.",
      502,
      "invalid_response",
    );
  }

  const warnings = [...ticketResearch.caveats];
  let housingResearch: HousingResearch | null = null;

  try {
    housingResearch = await researchHousing(brief, featuredTicket);
    warnings.push(...housingResearch.caveats);
  } catch (error) {
    if (error instanceof TripResearchError) {
      warnings.push(`Housing research unavailable: ${error.message}`);
    } else {
      warnings.push("Housing research unavailable for the selected ticket window.");
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    brief,
    ticketResearch,
    featuredTicket,
    housingResearch,
    warnings,
  };
}

export { TripResearchError } from "@/lib/trip-research/openai";
