const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "url", "note"],
  properties: {
    label: { type: "string" },
    url: { type: "string" },
    note: { type: "string" },
  },
} as const;

const travelWindowSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "departureStart",
    "departureEnd",
    "returnStart",
    "returnEnd",
    "tripLengthNights",
  ],
  properties: {
    departureStart: { type: "string" },
    departureEnd: { type: "string" },
    returnStart: { type: "string" },
    returnEnd: { type: "string" },
    tripLengthNights: { type: "integer", minimum: 1, maximum: 30 },
  },
} as const;

export const ticketResearchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "strategy", "recommendedTicketId", "options", "caveats"],
  properties: {
    overview: { type: "string" },
    strategy: { type: "string" },
    recommendedTicketId: { type: "string" },
    caveats: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 6,
    },
    options: {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "headline",
          "summary",
          "priceSignal",
          "estimatedRoundtripPrice",
          "carriers",
          "bookingChannels",
          "dealTriggers",
          "reasons",
          "watchouts",
          "bestFor",
          "confidence",
          "travelWindow",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          headline: { type: "string" },
          summary: { type: "string" },
          priceSignal: { type: "string" },
          estimatedRoundtripPrice: { type: "string" },
          carriers: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 5,
          },
          bookingChannels: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 5,
          },
          dealTriggers: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 5,
          },
          reasons: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
          watchouts: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 4,
          },
          bestFor: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          travelWindow: travelWindowSchema,
          sources: {
            type: "array",
            items: sourceSchema,
            minItems: 2,
            maxItems: 5,
          },
        },
      },
    },
  },
} as const;

export const housingResearchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "recommendations", "caveats"],
  properties: {
    overview: { type: "string" },
    caveats: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 6,
    },
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "area",
          "propertyStyle",
          "nightlyPriceRange",
          "totalStayEstimate",
          "summary",
          "accessNotes",
          "bookingTips",
          "bestFor",
          "confidence",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          area: { type: "string" },
          propertyStyle: { type: "string" },
          nightlyPriceRange: { type: "string" },
          totalStayEstimate: { type: "string" },
          summary: { type: "string" },
          accessNotes: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
          bookingTips: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
          },
          bestFor: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          sources: {
            type: "array",
            items: sourceSchema,
            minItems: 2,
            maxItems: 5,
          },
        },
      },
    },
  },
} as const;
