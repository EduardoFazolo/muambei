export type ConfidenceLevel = "high" | "medium" | "low";

export type TripResearchRequest = {
  origin: string;
  destination: string;
  earliestDepartureMonth?: string;
  latestDepartureMonth?: string;
  tripLengthNights: number;
  cabinClass?: string;
  travelers?: string;
  budgetNotes?: string;
  priorities?: string;
  lodgingPreferences?: string;
};

export type ResearchSource = {
  label: string;
  url: string;
  note: string;
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
  priceRange: string;
  typicalCarriers: string[];
  bookingChannels: string[];
  whyItIsCheaper: string;
  dealSignals: string[];
  tradeoffs: string[];
  bestFor: string;
  confidence: ConfidenceLevel;
  sources: ResearchSource[];
};

export type HousingOption = {
  id: string;
  area: string;
  nightlyRange: string;
  totalStayRange: string;
  propertyStyle: string;
  whyStayHere: string;
  accessNotes: string;
  bookingAdvice: string[];
  idealTraveler: string;
  confidence: ConfidenceLevel;
  sources: ResearchSource[];
};

export type TicketResearch = {
  summary: string;
  bestWindowId: string;
  options: TicketResearchOption[];
  caveats: string[];
};

export type HousingResearch = {
  summary: string;
  derivedFromTicketId: string;
  stayWindow: {
    checkIn: DateWindow;
    checkOut: DateWindow;
    nights: number;
  };
  options: HousingOption[];
  caveats: string[];
};

export type TripResearchResponse = {
  generatedAt: string;
  brief: TripResearchRequest;
  ticketResearch: TicketResearch;
  featuredTicket: TicketResearchOption;
  housingResearch: HousingResearch | null;
  warnings: string[];
};
