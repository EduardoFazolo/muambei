import { NextRequest, NextResponse } from "next/server";

import {
  researchTripPlan,
  TripResearchError,
} from "@/lib/trip-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Trip research expects a valid JSON body." },
      { status: 400 },
    );
  }

  try {
    const result = await researchTripPlan(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TripResearchError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Unexpected error while researching trip options." },
      { status: 500 },
    );
  }
}
