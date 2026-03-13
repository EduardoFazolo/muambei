import { describe, expect, mock, test } from "bun:test";

import type {
  LodgingResearchModel,
  LodgingResearcher,
  TicketResearchOption,
} from "@/lib/deal-workflow/types";
import {
  LodgingNotFoundError,
  findLodgingWithRetry,
  normalizeDateToISO,
} from "./lodging-retry";

// ── Fixture factories ──────────────────────────────────────────────────────────

function makeTicket(
  id: string,
  estimatedRoundTripBRL = 1000,
  departureStart = "2026-05-01",
  returnEnd = "2026-05-08",
): TicketResearchOption {
  return {
    id,
    title: `Ticket ${id}`,
    departureWindow: { start: departureStart, end: departureStart },
    returnWindow: { start: returnEnd, end: returnEnd },
    tripLengthNights: 7,
    estimatedRoundTripBRL,
    displayPrice: `R$${estimatedRoundTripBRL}`,
    typicalCarriers: [],
    bookingChannels: [],
    whyItWins: "",
    tradeoffs: [],
    confidence: "medium",
    sources: [],
  };
}

function makeFullLodging(id = "l1"): LodgingResearchModel {
  return {
    summary: "Found a hotel",
    bestLodgingId: id,
    lodgingOptions: [
      {
        id,
        area: "Centro",
        propertyStyle: "hotel",
        nightlyDisplay: "R$150/noite",
        totalStayDisplay: "R$1050",
        estimatedTotalStayBRL: 1050,
        accessNotes: "",
        whyItWins: "",
        bookingChannels: [],
        confidence: "medium",
        sources: [{ label: "Booking.com", url: "https://booking.com", note: "" }],
      },
    ],
    warnings: [],
  };
}

function makeEmptyLodging(): LodgingResearchModel {
  return {
    summary: "No results",
    bestLodgingId: "",
    lodgingOptions: [],
    warnings: [],
  };
}

// ── findLodgingWithRetry ────────────────────────────────────────────────────────

describe("findLodgingWithRetry", () => {
  test("returns on first attempt when researcher succeeds immediately", async () => {
    const tickets = [makeTicket("t1", 500), makeTicket("t2", 800)];
    const researcher: LodgingResearcher = mock(async () => makeFullLodging());

    const result = await findLodgingWithRetry(researcher, tickets);

    expect(result.attemptIndex).toBe(0);
    expect(result.ticket.id).toBe("t1");
    expect(result.lodging.lodgingOptions).toHaveLength(1);
    expect(researcher).toHaveBeenCalledTimes(1);
  });

  test("skips first ticket when it returns empty, succeeds on second", async () => {
    const tickets = [makeTicket("t1", 500), makeTicket("t2", 800)];
    const researcher: LodgingResearcher = mock(
      async (ticket: TicketResearchOption) =>
        ticket.id === "t1" ? makeEmptyLodging() : makeFullLodging(),
    );

    const result = await findLodgingWithRetry(researcher, tickets);

    expect(result.attemptIndex).toBe(1);
    expect(result.ticket.id).toBe("t2");
    expect(researcher).toHaveBeenCalledTimes(2);
  });

  test("skips a ticket when researcher throws, succeeds on next", async () => {
    const tickets = [makeTicket("t1", 500), makeTicket("t2", 800)];
    const researcher: LodgingResearcher = mock(async (ticket: TicketResearchOption) => {
      if (ticket.id === "t1") throw new Error("AI error");
      return makeFullLodging();
    });

    const result = await findLodgingWithRetry(researcher, tickets);

    expect(result.attemptIndex).toBe(1);
    expect(result.ticket.id).toBe("t2");
  });

  test("throws LodgingNotFoundError when all attempts return empty", async () => {
    const tickets = [makeTicket("t1"), makeTicket("t2"), makeTicket("t3")];
    const researcher: LodgingResearcher = mock(async () => makeEmptyLodging());

    await expect(
      findLodgingWithRetry(researcher, tickets, 3),
    ).rejects.toBeInstanceOf(LodgingNotFoundError);

    expect(researcher).toHaveBeenCalledTimes(3);
  });

  test("LodgingNotFoundError.attemptsExhausted equals the actual tries", async () => {
    const tickets = [makeTicket("t1"), makeTicket("t2"), makeTicket("t3")];
    const researcher: LodgingResearcher = mock(async () => makeEmptyLodging());

    const err = await findLodgingWithRetry(researcher, tickets, 3).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(LodgingNotFoundError);
    expect((err as LodgingNotFoundError).attemptsExhausted).toBe(3);
  });

  test("maxAttempts caps iteration even when more tickets are available", async () => {
    const tickets = Array.from({ length: 5 }, (_, i) =>
      makeTicket(`t${i + 1}`),
    );
    const researcher: LodgingResearcher = mock(async () => makeEmptyLodging());

    const err = await findLodgingWithRetry(researcher, tickets, 2).catch(
      (e) => e,
    );

    expect((err as LodgingNotFoundError).attemptsExhausted).toBe(2);
    expect(researcher).toHaveBeenCalledTimes(2);
  });

  test("throws LodgingNotFoundError when ticket list is empty", async () => {
    const researcher: LodgingResearcher = mock(async () => makeFullLodging());

    const err = await findLodgingWithRetry(researcher, [], 5).catch((e) => e);

    expect(err).toBeInstanceOf(LodgingNotFoundError);
    expect((err as LodgingNotFoundError).attemptsExhausted).toBe(0);
    expect(researcher).toHaveBeenCalledTimes(0);
  });

  test("succeeds on last allowed attempt (boundary check)", async () => {
    const tickets = [makeTicket("t1"), makeTicket("t2"), makeTicket("t3")];
    const researcher: LodgingResearcher = mock(async (ticket: TicketResearchOption) =>
      ticket.id === "t3" ? makeFullLodging("l3") : makeEmptyLodging(),
    );

    const result = await findLodgingWithRetry(researcher, tickets, 3);

    expect(result.attemptIndex).toBe(2);
    expect(result.ticket.id).toBe("t3");
    expect(result.lodging.bestLodgingId).toBe("l3");
  });

  test("result ticket and lodging are from the same attempt", async () => {
    const tickets = [makeTicket("t1", 500), makeTicket("t2", 1200)];
    const researcher: LodgingResearcher = mock(async (ticket: TicketResearchOption) =>
      ticket.id === "t2" ? makeFullLodging("l-for-t2") : makeEmptyLodging(),
    );

    const result = await findLodgingWithRetry(researcher, tickets);

    expect(result.ticket.id).toBe("t2");
    expect(result.lodging.bestLodgingId).toBe("l-for-t2");
    expect(result.attemptIndex).toBe(1);
  });
});

// ── normalizeDateToISO ─────────────────────────────────────────────────────────

describe("normalizeDateToISO", () => {
  test("passes through already-correct YYYY-MM-DD", () => {
    expect(normalizeDateToISO("2026-05-01")).toBe("2026-05-01");
    expect(normalizeDateToISO("2026-12-31")).toBe("2026-12-31");
  });

  test("zero-pads partial ISO 2026-5-1", () => {
    expect(normalizeDateToISO("2026-5-1")).toBe("2026-05-01");
    expect(normalizeDateToISO("2026-3-9")).toBe("2026-03-09");
  });

  test("trims surrounding whitespace before parsing", () => {
    expect(normalizeDateToISO("  2026-05-01  ")).toBe("2026-05-01");
  });

  test("parses DD/MM/YYYY as Brazilian convention", () => {
    expect(normalizeDateToISO("01/05/2026")).toBe("2026-05-01");
    expect(normalizeDateToISO("31/12/2026")).toBe("2026-12-31");
  });

  test("parses named-month English formats", () => {
    expect(normalizeDateToISO("May 1, 2026")).toBe("2026-05-01");
    expect(normalizeDateToISO("January 15, 2026")).toBe("2026-01-15");
  });

  test("returns input as-is when completely unparseable", () => {
    // Should not crash; just return the raw string as fallback
    const result = normalizeDateToISO("not-a-date");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
