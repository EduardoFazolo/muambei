# Price Trip

Price Trip is a Next.js app that helps answer a specific question: is it actually cheaper to travel and buy a product abroad than to buy it in Brazil?

The app starts with Brazilian price discovery, then runs agent-style research for overseas offers, transport windows, lodging, and estimated total trip spend. The result is a practical buy-vs-travel comparison instead of a simple product ranking.

## What the app does

- Searches Brazilian offers across multiple sources and normalizes the results.
- Researches overseas purchase opportunities in places like Paraguay, Europe, and the United States.
- Estimates flights, border transfer options, and lodging for the selected overseas deal.
- Converts foreign prices to BRL and compares the full trip cost against the Brazilian reference price.
- Streams workflow progress back to the UI with step-by-step agent updates.

## Active search providers

These adapters are enabled in the current codebase:

- Buscape
- DuckDuckGo-powered web fallback plus product-page extraction
- Mercado Livre
- Amazon Brazil
- KaBuM
- Americanas

There is also an optional external browser-agent integration for Magalu via `PITCHLABS_COMMAND`, but it is not enabled in the current default adapter list.

## Stack

- Next.js 16
- React 19
- TypeScript
- Bun
- Cheerio for HTML parsing
- OpenAI Responses API with web search for structured travel/deal research

## Core workflows

### 1. Brazilian product search

`GET /api/search?q=iphone%2015`

Returns normalized offers, provider status, latency, and a global price ranking.

### 2. Overseas market research

`POST /api/workflow`

```json
{
  "workflow": "overseas",
  "query": "iphone 15",
  "referenceProduct": "Apple iPhone 15 128GB",
  "brazilReferencePriceBRL": 4999
}
```

This workflow uses agent-driven research to return overseas offers with source links, confidence, converted BRL pricing, and savings estimates.

### 3. Full trip-cost research

`POST /api/workflow`

```json
{
  "workflow": "trip",
  "productQuery": "iphone 15",
  "origin": "Sao Paulo (GRU)",
  "travelers": "1 Adulto",
  "tripLengthNights": 3,
  "stayPreference": "Hotel simples e pratico perto de transporte.",
  "priorities": "Maximizar economia total.",
  "brazilReferencePriceBRL": 4999,
  "selectedOffer": {
    "id": "offer_1",
    "region": "paraguay",
    "country": "Paraguay",
    "city": "Ciudad del Este",
    "airportHint": "FOZ",
    "storeName": "Example Store",
    "purchaseChannel": "Loja fisica",
    "offerTitle": "Apple iPhone 15 128GB",
    "priceCurrency": "USD",
    "priceLocal": 799,
    "priceLocalDisplay": "USD 799",
    "estimatedPriceBRL": 4554,
    "estimatedSavingsVsBrazilBRL": 445,
    "stockSignal": "Em estoque",
    "whyItWins": "Melhor preco encontrado",
    "caveats": [],
    "confidence": "medium",
    "sources": [
      {
        "label": "Loja exemplo",
        "url": "https://example.com/iphone-15",
        "note": "Preco anunciado em USD."
      }
    ]
  }
}
```

The response is streamed as `application/x-ndjson` and includes workflow events, progress updates, and the final trip plan.

### 4. Legacy trip research endpoint

`POST /api/trip-research`

This endpoint still exists for structured ticket and lodging research outside the newer end-to-end workflow.

### 5. Exchange rates

`GET /api/rates`

Returns cached exchange rates used by the trip-cost workflow. The app fetches USD, EUR, and PYG rates and falls back to safe defaults if the upstream service is unavailable.

## Local development

### Requirements

- Bun 1.3+
- Node.js runtime compatible with Next.js 16

### Install and run

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

### Required for agent research

```bash
OPEN_AI_KEY=...
OPENAI_API_KEY=...
```

### Optional

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
TRIP_RESEARCH_MODEL=gpt-4.1-mini
OPENAI_MODEL=gpt-4.1-mini
PITCHLABS_COMMAND='pitchlabs scrape --store {store} --query "{query}"'
```

`PITCHLABS_COMMAND` is only useful if you wire the external browser-agent adapter back into the active provider list.

## Repository structure

- `src/lib/search`: crawling and product-search logic
- `src/lib/deal-workflow`: overseas and trip-planning agent workflow logic
- `src/lib/trip-research`: structured travel research helpers
- `src/lib/exchange-rates`: BRL conversion support
- `src/app/api`: HTTP routes
- `src/components`: UI for the research and comparison flow
- `docs/agentic-browser-api.md`: guide for deploying a browser service for harder-to-crawl sites

## Notes on the current product

- The main UI is the deal workflow in `src/components/deal-workflow.tsx`.
- The app is optimized for Brazilian travelers and BRL-based decision making.
- Paraguay receives special handling because the code models border-transfer logistics through Foz do Iguacu and Ciudad del Este.
- Workflow progress is streamed so the frontend can show agent status in real time.

## License

This repository uses a custom license in [LICENSE](LICENSE).

Short version:

- Commercial use is allowed for the crawling/search algorithms in `src/lib/search/**`.
- Commercial use is allowed for the agent/research algorithms in `src/lib/deal-workflow/**` and `src/lib/trip-research/**`.
- Everything else in the repository is non-commercial only and must remain free to use if redistributed or deployed.
- If you want to monetize a product that includes any non-exempt part of this repository, you need written permission from the copyright holder.
