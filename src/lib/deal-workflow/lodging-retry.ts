import type {
  LodgingResearchModel,
  LodgingResearcher,
  LodgingRetryResult,
  TicketResearchOption,
} from "@/lib/deal-workflow/types";
import { LodgingNotFoundError } from "@/lib/deal-workflow/types";

export { LodgingNotFoundError };

/**
 * Normalizes an AI-generated date string to YYYY-MM-DD for use in booking URLs.
 *
 * The AI can return dates in many formats:
 *   "2026-05-01"   → already correct
 *   "2026-5-1"     → partial ISO, needs zero-padding
 *   "May 1, 2026"  → named month
 *   "01/05/2026"   → ambiguous — treated as DD/MM/YYYY (Brazilian convention)
 */
export function normalizeDateToISO(raw: string): string {
  const s = raw.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Partial ISO: "2026-5-1" → "2026-05-01"
  const partialIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (partialIso) {
    return `${partialIso[1]}-${partialIso[2].padStart(2, "0")}-${partialIso[3].padStart(2, "0")}`;
  }

  // DD/MM/YYYY (Brazilian convention) or MM/DD/YYYY — treat as DD/MM
  const slashDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const day = slashDate[1].padStart(2, "0");
    const month = slashDate[2].padStart(2, "0");
    return `${slashDate[3]}-${month}-${day}`;
  }

  // Named month: "May 1, 2026", "1 May 2026", etc.
  // Append " 12:00:00 UTC" to pin to noon UTC and avoid DST date-shift
  const parsed = new Date(`${s} 12:00:00 UTC`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  // Fallback: return as-is; booking.com will ignore an unrecognized param
  return s;
}

/**
 * Tries each ticket option (cheapest-first) until a lodging researcher returns
 * at least one option. Returns on the first success.
 *
 * Both empty-array results and thrown errors are treated as soft failures and
 * cause the loop to advance to the next ticket.
 *
 * @param researcher   Injectable function — call with one ticket, returns lodging
 * @param ticketOptions  All ticket options, sorted cheapest-first by the caller
 * @param maxAttempts  Hard cap on how many tickets to try (default 5)
 */
export async function findLodgingWithRetry(
  researcher: LodgingResearcher,
  ticketOptions: TicketResearchOption[],
  maxAttempts = 5,
): Promise<LodgingRetryResult> {
  const limit = Math.min(maxAttempts, ticketOptions.length);

  for (let i = 0; i < limit; i++) {
    const ticket = ticketOptions[i];
    try {
      const lodging = await researcher(ticket);
      if (lodging.lodgingOptions.length > 0) {
        return { lodging, ticket, attemptIndex: i };
      }
      // Empty array → soft failure, try next window
    } catch {
      // Researcher threw → try next window
    }
  }

  throw new LodgingNotFoundError(limit);
}
