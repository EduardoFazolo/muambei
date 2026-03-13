import { fetchExchangeRates } from "@/lib/exchange-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rates = await fetchExchangeRates();
  return Response.json(rates);
}
