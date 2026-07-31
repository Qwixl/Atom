const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Shared with Board table display and webcal settings event ranges. */
export const WEBCAL_DATETIME_DISPLAY_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export const WEBCAL_DATE_DISPLAY_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

export type WebcalDisplayFormatOptions = {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
};

function isInvalidFormattedDate(text: string): boolean {
  return text === "Invalid Date" || text.includes("Invalid");
}

/**
 * Formats unambiguous ISO-8601 date or datetime strings for owner-facing display.
 * Returns null when the value is not a strict ISO match or is not a real calendar date.
 */
export function formatIso8601ForDisplay(
  value: string,
  options?: WebcalDisplayFormatOptions,
): string | null {
  const { locale, timeZone } = options ?? {};

  if (ISO_DATE_ONLY.test(value)) {
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    const formatted = date.toLocaleDateString(locale, {
      ...WEBCAL_DATE_DISPLAY_OPTS,
      timeZone: "UTC",
    });
    return isInvalidFormattedDate(formatted) ? null : formatted;
  }

  if (ISO_DATETIME.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const formatOptions: Intl.DateTimeFormatOptions = {
      ...WEBCAL_DATETIME_DISPLAY_OPTS,
      ...(timeZone ? { timeZone } : {}),
    };
    const formatted = date.toLocaleString(locale, formatOptions);
    return isInvalidFormattedDate(formatted) ? null : formatted;
  }

  return null;
}
