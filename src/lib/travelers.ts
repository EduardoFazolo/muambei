const MIN_TRAVELERS = 1;
const MAX_TRAVELERS = 6;

function clampTravelerCount(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_TRAVELERS;
  }

  return Math.min(MAX_TRAVELERS, Math.max(MIN_TRAVELERS, value));
}

export function parseTravelerCount(value?: string | null) {
  const match = value?.match(/\d+/);
  const parsed = match ? Number.parseInt(match[0], 10) : MIN_TRAVELERS;
  return clampTravelerCount(parsed);
}

export function formatTravelerCount(count: number) {
  const normalized = clampTravelerCount(count);
  return `${normalized} ${normalized === 1 ? "Adulto" : "Adultos"}`;
}

export function normalizeTravelerCountInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return formatTravelerCount(MIN_TRAVELERS);
  }

  return formatTravelerCount(Number.parseInt(digits, 10));
}
