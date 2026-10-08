// Normalization of extracted values into one internal representation
// (Phase 8, spec "temporal reasoning" / "financial reasoning"). The original
// text is never discarded - callers keep the span; this only adds a
// comparable value next to it. Every parser returns null rather than a
// guess when the text doesn't parse.
//
// Shapes match the synthetic generator's ground truth
// (research/generator/v3/core.py), so normalization accuracy is directly
// measurable (apps/api/scripts/evaluate-v3.mjs).

export interface MoneyValue {
  amount: number;
  currency: "INR";
}
export interface DateValue {
  iso: string;
}
export interface DurationValue {
  value: number;
  unit: "day" | "week" | "month" | "year";
  days: number;
}
export interface PercentValue {
  value: number;
}
export interface AreaValue {
  value: number;
  unit: string;
}
export interface TextValue {
  value: string;
}
export type NormalizedValue =
  MoneyValue | DateValue | DurationValue | PercentValue | AreaValue | TextValue;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  "twenty-four": 24,
  "twenty-five": 25,
  thirty: 30,
  "thirty-three": 33,
  "thirty-six": 36,
  forty: 40,
  "forty-five": 45,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const DURATION_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;

// "₹8,90,000" / "Rs. 8,90,000/-" / "INR 890000" / "₹ 10 lakh" / "Rs. 1.5 crore"
export function parseMoney(text: string): MoneyValue | null {
  const m = /(?:₹|rs\.?|inr|rupees)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\.?)?/i.exec(
    text.trim(),
  );
  if (!m || !m[1]) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const scale = m[2] ? (/^c/i.test(m[2]) ? 10_000_000 : 100_000) : 1;
  const amount = Math.round(base * scale);
  return amount > 0 ? { amount, currency: "INR" } : null;
}

function iso(year: number, month: number, day: number): DateValue | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return { iso: d.toISOString().slice(0, 10) };
}

// "14th day of March, 2025" / "14th March 2025" / "March 14, 2025" /
// "14/03/2025" / "14.03.2025" / "2025-03-14" (Indian day-first numeric order)
export function parseDate(text: string): DateValue | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?([a-z]+),?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2]!) + 1;
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  m = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[1]!) + 1;
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

// "11 months" / "eleven (11) months" / "11 (eleven) months" / "90 days" / "five years"
export function parseDuration(text: string): DurationValue | null {
  const t = text.trim().toLowerCase();
  const m =
    /^(?:([a-z-]+)\s+\((\d+)\)|(\d+)\s+\(([a-z-]+)\)|(\d+)|([a-z-]+))\s+(day|week|month|year)s?$/.exec(
      t,
    );
  if (!m) return null;
  const value = Number(m[2] ?? m[3] ?? m[5] ?? NUMBER_WORDS[m[6] ?? ""] ?? NaN);
  const unit = m[7] as DurationValue["unit"];
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit, days: value * DURATION_DAYS[unit] };
}

// "5%" / "7.5%" / "10 percent" / "five per cent (5%)"
export function parsePercent(text: string): PercentValue | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:%|percent|per\s+cent)/i.exec(text);
  return m ? { value: Number(m[1]) } : null;
}

// "742 sq. ft." / "1,450 sq. mtrs." / "1.29 acres" / "12 guntha"
export function parseArea(text: string): AreaValue | null {
  const m = /^(\d[\d,]*(?:\.\d+)?)\s+(.+)$/.exec(text.trim());
  if (!m || !m[1] || !m[2]) return null;
  const value = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(value) ? { value, unit: m[2].trim() } : null;
}

export function normalizeIdentifier(text: string): TextValue {
  return { value: text.replace(/\s+/g, "").toUpperCase() };
}

export function normalizeText(text: string): TextValue {
  return { value: text.replace(/\s+/g, " ").trim().toLowerCase() };
}

// Dispatch on an entity's core type (DomainPack.entitySchema[].coreType).
export function normalizeByCoreType(coreType: string, text: string): NormalizedValue | null {
  switch (coreType) {
    case "MONEY":
      return parseMoney(text);
    case "DATE":
      return parseDate(text);
    case "DURATION":
      return parseDuration(text);
    case "PERCENT":
      return parsePercent(text);
    case "AREA":
      return parseArea(text);
    case "PROPERTY_IDENTIFIER":
      return normalizeIdentifier(text);
    case "PARTY":
    case "PERSON":
    case "ORGANIZATION":
      return { value: text.replace(/\s+/g, " ").trim() };
    default:
      return normalizeText(text);
  }
}

/** Stable comparison key for two normalized values of the same core type. */
export function valueKey(v: NormalizedValue | null): string {
  if (!v) return "null";
  if ("amount" in v) return `INR:${v.amount}`;
  if ("iso" in v) return `DATE:${v.iso}`;
  if ("days" in v) return `DUR:${v.value}:${v.unit}`;
  if ("unit" in v) return `AREA:${v.value}:${v.unit.replace(/\s+/g, "").toLowerCase()}`;
  return `VAL:${String(v.value).toLowerCase()}`;
}
