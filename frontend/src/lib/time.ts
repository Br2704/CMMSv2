function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundToPrecision(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function hoursToMinutes(value: unknown, precision = 0): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 0;
  return roundToPrecision(parsed * 60, precision);
}

export function minutesToHours(value: unknown, precision = 2): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 0;
  return roundToPrecision(parsed / 60, precision);
}
