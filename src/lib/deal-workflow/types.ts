export type ConfidenceLevel = "high" | "medium" | "low";

export type ResearchSource = {
  label: string;
  url: string;
  note: string;
};

export type WorkflowStepStatus = "pending" | "running" | "completed" | "error";

export type OverseasMarketOffer = {
  id: string;
  region: "united_states" | "europe" | "paraguay";
  country: string;
  city: string;
  airportHint: string;
  storeName: string;
  purchaseChannel: string;
  offerTitle: string;
  priceCurrency: string;
  priceLocal: number;
  priceLocalDisplay: string;
  estimatedPriceBRL: number;
  estimatedSavingsVsBrazilBRL: number;
  stockSignal: string;
  whyItWins: string;
  caveats: string[];
  confidence: ConfidenceLevel;
  sources: ResearchSource[];
};

export type OverseasResearchResponse = {
  generatedAt: string;
  query: string;
  referenceProduct: string;
  brazilReferencePriceBRL: number;
  summary: string;
  recommendedOfferId: string;
  offers: OverseasMarketOffer[];
  warnings: string[];
};

export type DateWindow = {
  start: string;
  end: string;
};

export type TicketResearchOption = {
  id: string;
  title: string;
  departureWindow: DateWindow;
  returnWindow: DateWindow;
  tripLengthNights: number;
  estimatedRoundTripBRL: number;
  displayPrice: string;
  typicalCarriers: string[];
  bookingChannels: string[];
  whyItWins: string;
  tradeoffs: string[];
  confidence: ConfidenceLevel;
  sources: ResearchSource[];
};

export type LodgingResearchOption = {
  id: string;
  area: string;
  propertyStyle: string;
  nightlyDisplay: string;
  totalStayDisplay: string;
  estimatedTotalStayBRL: number;
  accessNotes: string;
  whyItWins: string;
  bookingChannels: string[];
  confidence: ConfidenceLevel;
  sources: ResearchSource[];
};

export type TripPlanResponse = {
  generatedAt: string;
  origin: string;
  destinationCity: string;
  destinationCountry: string;
  productOfferId: string;
  summary: string;
  bestTicketId: string;
  bestLodgingId: string;
  ticketOptions: TicketResearchOption[];
  lodgingOptions: LodgingResearchOption[];
  productPriceBRL: number;
  estimatedTripSpendBRL: number;
  estimatedSavingsVsBrazilBRL: number;
  recommendation: string;
  warnings: string[];
};

export type OverseasWorkflowInput = {
  query: string;
  referenceProduct: string;
  brazilReferencePriceBRL: number;
};

export type TripWorkflowInput = {
  productQuery: string;
  origin: string;
  travelers: string;
  tripLengthNights: number;
  stayPreference?: string;
  priorities?: string;
  brazilReferencePriceBRL: number;
  selectedOffer: OverseasMarketOffer;
};

export type WorkflowEvent =
  | {
      type: "workflow.started";
      workflow: "overseas" | "trip";
      message: string;
    }
  | {
      type: "step.updated";
      workflow: "overseas" | "trip";
      stepId: string;
      label: string;
      status: WorkflowStepStatus;
      message: string;
    }
  | {
      type: "result";
      workflow: "overseas";
      data: OverseasResearchResponse;
    }
  | {
      type: "result";
      workflow: "trip";
      data: TripPlanResponse;
    }
  | {
      type: "workflow.completed";
      workflow: "overseas" | "trip";
      message: string;
    }
  | {
      type: "error";
      workflow: "overseas" | "trip";
      message: string;
    };
