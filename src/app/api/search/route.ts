import { NextRequest, NextResponse } from "next/server";

import { searchProducts } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "Missing required search param: q" },
      { status: 400 },
    );
  }

  const results = await searchProducts(query);
  return NextResponse.json(results);
}
