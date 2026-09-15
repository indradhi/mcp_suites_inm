/**
 * Indonesian & GMT+7 (Asia/Jakarta / WIB) Date and Time Utilities
 */

/**
 * Parses any date input (ISO string, timestamp, Date object) safely.
 * Naive ISO strings from backend (without 'Z' or offset) are treated as UTC.
 */
export function parseToDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return dateInput;

  let str = String(dateInput).trim();
  // If string resembles an ISO date without timezone designator (no 'Z' and no '+/-HH:mm')
  // e.g. "2026-09-13T16:09:17" or "2026-09-13 16:09:17"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date into GMT+7 Indonesian format:
 * e.g. "13 Sep 2026, 23:09:17 WIB"
 */
export function formatDateTimeWIB(dateInput, includeSeconds = true) {
  const d = parseToDate(dateInput);
  if (!d) return '-';

  const datePart = d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timePart = d.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false
  }).replace(/\./g, ':');

  return `${datePart}, ${timePart} WIB`;
}

/**
 * Formats a time into GMT+7:
 * e.g. "23:09 WIB" or "23:09:17 WIB"
 */
export function formatTimeWIB(dateInput, includeSeconds = false) {
  const d = parseToDate(dateInput);
  if (!d) return '-';

  const timePart = d.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false
  }).replace(/\./g, ':');

  return `${timePart} WIB`;
}

/**
 * Formats date only in GMT+7:
 * e.g. "13 September 2026"
 */
export function formatDateWIB(dateInput) {
  const d = parseToDate(dateInput);
  if (!d) return '-';

  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
