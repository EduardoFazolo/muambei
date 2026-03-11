# Price Trip

Next.js app for comparing Brazilian prices across multiple stores.

## Current collectors

- Mercado Livre via HTML scraping
- Amazon BR via HTML scraping
- KaBuM via embedded JSON payload
- Americanas via public VTEX catalog API
- Magalu via external `pitchlabs` command slot

## Development

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

```bash
GET /api/search?q=iphone%2015
```

The response contains:

- normalized offers
- provider status and latency
- global price-ordered ranking

## Pitchlabs integration

Set `PITCHLABS_COMMAND` if you want the fifth collector to run a local agentic browser flow.

The command must print JSON to stdout using either of these shapes:

```json
[
  {
    "title": "Smartphone Apple iPhone 15 128GB",
    "price": 4999.9,
    "url": "https://example.com/oferta",
    "image": "https://example.com/img.jpg",
    "seller": "Magalu",
    "installments": "10x de R$ 499,99",
    "shipping": "frete grátis"
  }
]
```

or

```json
{
  "offers": []
}
```

Example env shape:

```bash
PITCHLABS_COMMAND='pitchlabs scrape --store {store} --query "{query}"'
```
