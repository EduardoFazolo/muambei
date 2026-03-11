export type ProviderStatus =
  | "ok"
  | "partial"
  | "empty"
  | "error"
  | "not_configured";

export type SearchOffer = {
  storeKey: string;
  storeName: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  seller?: string;
  installments?: string;
  shipping?: string;
  source: "html" | "json" | "pitchlabs";
  currency: "BRL";
};

export type ProviderResult = {
  storeKey: string;
  storeName: string;
  status: ProviderStatus;
  offers: SearchOffer[];
  note?: string;
  latencyMs: number;
};

export type SearchResponse = {
  query: string;
  generatedAt: string;
  offers: SearchOffer[];
  providers: ProviderResult[];
};

export type StoreAdapter = {
  storeKey: string;
  storeName: string;
  search(query: string): Promise<ProviderResult>;
};
