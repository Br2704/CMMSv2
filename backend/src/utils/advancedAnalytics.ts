export type DateRange = {
  from: Date;
  to: Date;
};

export function resolveDateRange(from?: string, to?: string, defaultDays = 30): DateRange {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

export function safeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function stdDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function linearRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0 };
  }

  const n = points.length;
  const sumX = points.reduce((acc, point) => acc + point.x, 0);
  const sumY = points.reduce((acc, point) => acc + point.y, 0);
  const sumXY = points.reduce((acc, point) => acc + point.x * point.y, 0);
  const sumXX = points.reduce((acc, point) => acc + point.x * point.x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function percentileRank(values: number[], value: number) {
  if (values.length === 0) return 0;
  const lessOrEqual = values.filter((item) => item <= value).length;
  return (lessOrEqual / values.length) * 100;
}

